export interface CalcomBooking {
  id: number;
  uid: string;
  title: string;
  description?: string;
  status: 'accepted' | 'pending' | 'cancelled' | 'rejected';
  start: string;
  end: string;
  duration: number;
  eventTypeId: number;
  createdAt: string; // ISO 8601 timestamp when booking was created
  updatedAt: string; // ISO 8601 timestamp when booking was last updated
  attendees?: Array<{
    name?: string;
    email: string;
    timeZone?: string;
    phoneNumber?: string;
  }>;
  meetingUrl?: string;
  location?: string;
}

export interface CalcomBookingsResponse {
  status: string;
  data: CalcomBooking[];
}

export class CalcomService {
  private apiKey: string;
  private eventTypeId: string;
  private baseUrl = 'https://api.cal.com/v2';
  private apiVersion = '2024-08-13';

  constructor(apiKey: string, eventTypeId: string) {
    this.apiKey = apiKey;
    this.eventTypeId = eventTypeId;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'cal-api-version': this.apiVersion,
      'Content-Type': 'application/json',
    };
  }

  async getBookings(filters?: {
    status?: 'accepted' | 'pending' | 'cancelled' | 'rejected';
    afterStart?: string;
    beforeEnd?: string;
    attendeeEmail?: string;
    attendeeName?: string;
  }): Promise<CalcomBooking[]> {
    try {
      const url = new URL(`${this.baseUrl}/bookings`);
      
      url.searchParams.append('eventTypeId', this.eventTypeId);
      
      if (filters) {
        if (filters.status) {
          url.searchParams.append('status', filters.status);
        }
        if (filters.afterStart) {
          url.searchParams.append('afterStart', filters.afterStart);
        }
        if (filters.beforeEnd) {
          url.searchParams.append('beforeEnd', filters.beforeEnd);
        }
        if (filters.attendeeEmail) {
          url.searchParams.append('attendeeEmail', filters.attendeeEmail);
        }
        if (filters.attendeeName) {
          url.searchParams.append('attendeeName', filters.attendeeName);
        }
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Cal.com API error:', response.status, errorText);
        throw new Error(`Cal.com API error: ${response.status} - ${errorText}`);
      }

      const data: CalcomBookingsResponse = await response.json();
      return data.data || [];
    } catch (error: any) {
      console.error('Error fetching Cal.com bookings:', error);
      throw new Error(error.message || 'Failed to fetch Cal.com bookings');
    }
  }

  async findBookingByPhoneNumber(phoneNumber: string): Promise<CalcomBooking | null> {
    try {
      const bookings = await this.getBookings({ status: 'accepted' });
      
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      
      const booking = bookings.find((booking) => {
        return booking.attendees?.some((attendee) => {
          if (!attendee.phoneNumber) return false;
          const normalizedAttendeePhone = attendee.phoneNumber.replace(/\D/g, '');
          return normalizedAttendeePhone.includes(normalizedPhone) || 
                 normalizedPhone.includes(normalizedAttendeePhone);
        });
      });

      return booking || null;
    } catch (error: any) {
      console.error('Error finding booking by phone number:', error);
      return null;
    }
  }

  async verifyAppointment(
    phoneNumber: string,
    appointmentTime?: string,
    callTimestamp?: Date
  ): Promise<{
    verified: boolean;
    booking?: CalcomBooking;
    message: string;
  }> {
    try {
      // Use call timestamp or current time as reference point
      const referenceTime = callTimestamp || new Date();
      
      // Search window: STRICTLY from call time forward to 7 days after
      // Narrower window reduces false positives from unrelated future bookings
      // Most appointment scheduling calls book within 1 week
      const windowStart = new Date(referenceTime);
      
      const windowEnd = new Date(referenceTime);
      windowEnd.setDate(windowEnd.getDate() + 7); // Reduced from 30 to 7 days
      
      const bookings = await this.getBookings({ 
        status: 'accepted',
        afterStart: windowStart.toISOString(),
        beforeEnd: windowEnd.toISOString(),
      });
      
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      
      // Filter bookings by phone number AND must be AFTER call time (strict future-only)
      const matchingBookings = bookings.filter((booking) => {
        // Phone number must match
        const phoneMatches = booking.attendees?.some((attendee) => {
          if (!attendee.phoneNumber) return false;
          const normalizedAttendeePhone = attendee.phoneNumber.replace(/\D/g, '');
          return normalizedAttendeePhone.includes(normalizedPhone) || 
                 normalizedPhone.includes(normalizedAttendeePhone);
        });
        
        if (!phoneMatches) return false;
        
        // Booking must be STRICTLY after call time (future-only, no backward tolerance)
        const bookingStart = new Date(booking.start);
        return bookingStart > referenceTime; // Strict: booking MUST be after call
      });

      if (matchingBookings.length === 0) {
        return {
          verified: false,
          message: 'No future appointment found for this phone number within the next 7 days',
        };
      }
      
      // If multiple bookings exist within the window, we cannot confidently verify
      // which one was just scheduled - mark as ambiguous
      if (matchingBookings.length > 1) {
        console.warn(`Multiple future bookings found for ${phoneNumber} within 7 days - cannot verify which was just scheduled`);
        
        // Sort to show the earliest one in the message
        const sortedBookings = matchingBookings.sort((a, b) => {
          return new Date(a.start).getTime() - new Date(b.start).getTime();
        });
        
        return {
          verified: false,
          booking: sortedBookings[0],
          message: `Found ${matchingBookings.length} appointments in the next 7 days - cannot confirm which was just scheduled`,
        };
      }

      // Exactly one booking found - verify it was created around the time of the call
      const booking = matchingBookings[0];
      
      // Check if booking was created AFTER the call (or very close - within 1 hour before for clock skew)
      const bookingCreated = new Date(booking.createdAt);
      const oneHourBeforeCall = new Date(referenceTime);
      oneHourBeforeCall.setHours(oneHourBeforeCall.getHours() - 1);
      
      if (bookingCreated < oneHourBeforeCall) {
        // This booking was created before the call - it's a pre-existing appointment
        console.warn(`Booking ${booking.id} was created at ${booking.createdAt}, which is before call time ${referenceTime.toISOString()} - this is a pre-existing appointment`);
        return {
          verified: false,
          booking,
          message: `Found an appointment but it was scheduled before this call (created ${new Date(booking.createdAt).toLocaleString()})`,
        };
      }
      
      // Calculate how far the booking is from the call
      const timeDiff = new Date(booking.start).getTime() - referenceTime.getTime();
      const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));
      
      let timeDescription = '';
      if (daysDiff === 0) {
        timeDescription = 'today';
      } else if (daysDiff === 1) {
        timeDescription = 'tomorrow';
      } else if (daysDiff === -1) {
        timeDescription = 'yesterday';
      } else if (daysDiff > 0) {
        timeDescription = `in ${daysDiff} days`;
      } else {
        timeDescription = `${Math.abs(daysDiff)} days ago`;
      }

      return {
        verified: true,
        booking,
        message: `Appointment verified: ${new Date(booking.start).toLocaleDateString()} at ${new Date(booking.start).toLocaleTimeString()} (${timeDescription})`,
      };
    } catch (error: any) {
      console.error('Error verifying appointment:', error);
      return {
        verified: false,
        message: 'Error checking Cal.com appointments',
      };
    }
  }
}

export function createCalcomService(apiKey: string, eventTypeId: string): CalcomService {
  return new CalcomService(apiKey, eventTypeId);
}
