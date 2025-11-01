import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Search, ExternalLink, Clock, Phone, User } from "lucide-react";
import { format } from "date-fns";

interface CalcomBooking {
  id: number;
  uid: string;
  title: string;
  description?: string;
  status: 'accepted' | 'pending' | 'cancelled' | 'rejected';
  start: string;
  end: string;
  duration: number;
  eventTypeId: number;
  createdAt: string;
  updatedAt: string;
  attendees?: Array<{
    name?: string;
    email: string;
    timeZone?: string;
    phoneNumber?: string;
  }>;
  meetingUrl?: string;
  location?: string;
}

const formatDuration = (ms: number | null) => {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function Appointments() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const { data: bookings, isLoading, error } = useQuery<CalcomBooking[]>({
    queryKey: ["/api/calcom/bookings"],
    refetchInterval: 10000,
  });

  // Filter bookings based on search
  const filteredBookings = bookings?.filter((booking) => {
    const attendeeName = booking.attendees?.[0]?.name || '';
    const attendeeEmail = booking.attendees?.[0]?.email || '';
    const attendeePhone = booking.attendees?.[0]?.phoneNumber || '';

    const matchesSearch = 
      attendeePhone.includes(search) ||
      attendeeName.toLowerCase().includes(search.toLowerCase()) ||
      attendeeEmail.toLowerCase().includes(search.toLowerCase()) ||
      booking.title.toLowerCase().includes(search.toLowerCase()) ||
      booking.uid.toLowerCase().includes(search.toLowerCase());

    return matchesSearch;
  });

  // Sort by start time (earliest first)
  const sortedBookings = filteredBookings?.sort((a, b) => {
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            View all scheduled appointments from Cal.com
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Unable to load Cal.com appointments. Please configure your Cal.com credentials in Settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Appointments</h1>
        <p className="text-sm text-muted-foreground">
          View all scheduled appointments from Cal.com
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Appointments</p>
                <p className="text-2xl font-bold mt-1">{bookings?.length ?? 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold mt-1 text-blue-600">
                  {bookings?.filter(b => {
                    const start = new Date(b.start);
                    const now = new Date();
                    const weekFromNow = new Date(now);
                    weekFromNow.setDate(now.getDate() + 7);
                    return start >= now && start <= weekFromNow;
                  }).length ?? 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {bookings?.filter(b => {
                    const start = new Date(b.start);
                    const now = new Date();
                    const monthFromNow = new Date(now);
                    monthFromNow.setMonth(now.getMonth() + 1);
                    return start >= now && start <= monthFromNow;
                  }).length ?? 0}
                </p>
              </div>
              <User className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, or title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-appointments"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !sortedBookings || sortedBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-1">
                {search ? "No appointments found" : "No appointments yet"}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {search 
                  ? "Try adjusting your search" 
                  : "Upcoming appointments from Cal.com will appear here"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Appointment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBookings?.map((booking) => {
                    const attendee = booking.attendees?.[0];
                    const customerName = attendee?.name || 'No name';
                    const phoneNumber = attendee?.phoneNumber || '';
                    const email = attendee?.email || '';
                    
                    return (
                      <TableRow 
                        key={booking.uid} 
                        className="hover-elevate"
                        data-testid={`row-appointment-${booking.uid}`}
                      >
                        <TableCell className="font-medium" data-testid={`text-customer-${booking.uid}`}>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                              <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <div className="font-medium">{customerName}</div>
                              <div className="text-xs text-muted-foreground">{email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {phoneNumber && (
                            <div className="flex items-center gap-1 text-sm font-mono">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              {phoneNumber}
                            </div>
                          )}
                          {!phoneNumber && (
                            <span className="text-sm text-muted-foreground">No phone</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{booking.title}</span>
                            {booking.description && (
                              <span className="text-xs text-muted-foreground line-clamp-1">
                                {booking.description}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={booking.status === 'accepted' ? 'default' : 'secondary'}
                            className="w-fit"
                            data-testid={`badge-status-${booking.uid}`}
                          >
                            {booking.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-medium">
                              {format(new Date(booking.start), 'MMM dd, yyyy')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(booking.start), 'HH:mm')} - {format(new Date(booking.end), 'HH:mm')}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {booking.duration} min
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {sortedBookings && sortedBookings.length > 0 && (
            <div className="text-sm text-muted-foreground text-center mt-4">
              Showing {sortedBookings.length} upcoming appointments
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
