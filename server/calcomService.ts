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
      // CHANGED LOGIC: Search for ALL future appointments from NOW
      // If ChatGPT detected an appointment was scheduled, we want to find it in Cal.com
      // regardless of when the call was made
      const now = new Date();
      
      // Search window: from NOW to 30 days in the future
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + 30);
      
      const bookings = await this.getBookings({ 
        status: 'accepted',
        afterStart: now.toISOString(),
        beforeEnd: windowEnd.toISOString(),
      });
      
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      
      // Filter bookings by phone number only
      const matchingBookings = bookings.filter((booking) => {
        return booking.attendees?.some((attendee) => {
          if (!attendee.phoneNumber) return false;
          const normalizedAttendeePhone = attendee.phoneNumber.replace(/\D/g, '');
          return normalizedAttendeePhone.includes(normalizedPhone) || 
                 normalizedPhone.includes(normalizedAttendeePhone);
        });
      });

      if (matchingBookings.length === 0) {
        return {
          verified: false,
          message: 'No future appointments found in Cal.com for this phone number',
        };
      }
      
      // Sort by start time to find the earliest appointment
      const sortedBookings = matchingBookings.sort((a, b) => {
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });
      
      const booking = sortedBookings[0];
      
      // Calculate time until appointment
      const timeDiff = new Date(booking.start).getTime() - now.getTime();
      const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));
      const hoursDiff = Math.round(timeDiff / (1000 * 60 * 60));
      
      let timeDescription = '';
      if (hoursDiff < 1) {
        timeDescription = 'very soon';
      } else if (hoursDiff < 24) {
        timeDescription = `in ${hoursDiff} hours`;
      } else if (daysDiff === 0) {
        timeDescription = 'today';
      } else if (daysDiff === 1) {
        timeDescription = 'tomorrow';
      } else {
        timeDescription = `in ${daysDiff} days`;
      }

      const totalFound = matchingBookings.length;
      const multipleMessage = totalFound > 1 ? ` (${totalFound} total appointments found)` : '';

      return {
        verified: true,
        booking,
        message: `Appointment verified: ${new Date(booking.start).toLocaleDateString()} at ${new Date(booking.start).toLocaleTimeString()} (${timeDescription})${multipleMessage}`,
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
