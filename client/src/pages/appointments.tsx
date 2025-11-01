import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Search, ExternalLink, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import type { Call } from "@shared/schema";

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
  const [verificationFilter, setVerificationFilter] = useState("all");

  const { data: calls, isLoading } = useQuery<Call[]>({
    queryKey: ["/api/calls"],
    refetchInterval: 5000,
  });

  // Filter only calls with appointments scheduled
  const appointmentCalls = calls?.filter((call) => {
    const analysis = call.aiAnalysis as any;
    return analysis?.appointmentScheduled === true;
  });

  const filteredAppointments = appointmentCalls?.filter((call) => {
    const analysis = call.aiAnalysis as any;
    const calcomVerification = analysis?.calcomVerification;
    const customerName = analysis?.customerName ?? '';

    const matchesSearch = 
      call.toNumber.includes(search) ||
      customerName.toLowerCase().includes(search.toLowerCase()) ||
      call.id.toLowerCase().includes(search.toLowerCase());

    let matchesVerification = true;
    if (verificationFilter === "verified") {
      matchesVerification = calcomVerification?.verified === true;
    } else if (verificationFilter === "unverified") {
      matchesVerification = !calcomVerification || calcomVerification?.verified === false;
    }

    return matchesSearch && matchesVerification;
  });

  const verifiedCount = appointmentCalls?.filter((call) => {
    const analysis = call.aiAnalysis as any;
    return analysis?.calcomVerification?.verified === true;
  }).length ?? 0;

  const unverifiedCount = (appointmentCalls?.length ?? 0) - verifiedCount;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Appointments</h1>
        <p className="text-sm text-muted-foreground">
          View and manage scheduled appointments from calls
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Appointments</p>
                <p className="text-2xl font-bold mt-1">{appointmentCalls?.length ?? 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Cal.com Verified</p>
                <p className="text-2xl font-bold mt-1 text-blue-600">{verifiedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Not Verified</p>
                <p className="text-2xl font-bold mt-1 text-yellow-600">{unverifiedCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-600" />
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
                placeholder="Search by customer name, phone number, or call ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-appointments"
              />
            </div>
            <Select value={verificationFilter} onValueChange={setVerificationFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-verification-filter">
                <SelectValue placeholder="Filter by verification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Appointments</SelectItem>
                <SelectItem value="verified">Cal.com Verified</SelectItem>
                <SelectItem value="unverified">Not Verified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !filteredAppointments || filteredAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-1">
                {search || verificationFilter !== "all" ? "No appointments found" : "No appointments yet"}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {search || verificationFilter !== "all" 
                  ? "Try adjusting your filters" 
                  : "Appointments will appear here when customers schedule during calls"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Appointment Details</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Call Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments?.map((call) => {
                    const analysis = call.aiAnalysis as any;
                    const customerName = analysis?.customerName ?? null;
                    const appointmentDetails = analysis?.appointmentDetails ?? null;
                    const calcomVerification = analysis?.calcomVerification;
                    
                    return (
                      <TableRow 
                        key={call.id} 
                        className="hover-elevate cursor-pointer" 
                        onClick={() => setLocation(`/calls/${call.id}`)}
                        data-testid={`row-appointment-${call.id}`}
                      >
                        <TableCell className="font-medium" data-testid={`text-customer-${call.id}`}>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                              <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              {customerName ? (
                                <span className="font-medium">{customerName}</span>
                              ) : (
                                <span className="text-sm text-muted-foreground">Unknown</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{call.toNumber}</TableCell>
                        <TableCell>
                          {appointmentDetails ? (
                            <span className="text-sm">{appointmentDetails}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">No details provided</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {calcomVerification ? (
                              <>
                                <Badge 
                                  className={`w-fit text-xs ${
                                    calcomVerification.verified 
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                      : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                  }`}
                                  data-testid={`badge-verification-${call.id}`}
                                >
                                  {calcomVerification.verified ? '✓ Verified' : '⚠ Not Verified'}
                                </Badge>
                                {calcomVerification.verified && calcomVerification.bookingStart && (
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(calcomVerification.bookingStart), 'MMM dd, HH:mm')}
                                  </span>
                                )}
                              </>
                            ) : (
                              <Badge className="bg-gray-600 hover:bg-gray-700 text-white w-fit text-xs">
                                Not Checked
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {call.startTimestamp 
                            ? format(new Date(call.startTimestamp), 'MMM dd, HH:mm')
                            : (call.createdAt ? format(new Date(call.createdAt), 'MMM dd, HH:mm') : '-')
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {formatDuration(call.durationMs)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/calls/${call.id}`}>
                            <Button variant="ghost" size="sm" data-testid={`button-view-${call.id}`}>
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredAppointments && filteredAppointments.length > 0 && (
            <div className="text-sm text-muted-foreground text-center mt-4">
              Showing {filteredAppointments.length} of {appointmentCalls?.length || 0} appointments
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
