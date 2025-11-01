import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Search, ExternalLink, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import type { Call } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
    case 'ended':
      return 'default';
    case 'failed':
    case 'error':
      return 'destructive';
    case 'in_progress':
    case 'ongoing':
      return 'secondary';
    case 'queued':
    case 'registered':
      return 'outline';
    default:
      return 'outline';
  }
};

const formatDuration = (ms: number | null) => {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function Calls() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: calls, isLoading } = useQuery<Call[]>({
    queryKey: ["/api/calls"],
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Sync call status from Retell API
  const syncMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/calls/sync-status');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    },
  });

  // Auto-sync when there are active calls using stable interval
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const hasActiveCalls = calls?.some(call => 
      ['registered', 'ongoing', 'in_progress', 'queued'].includes(call.callStatus)
    );

    // Start interval if we have active calls and no interval running
    if (hasActiveCalls && !syncIntervalRef.current && !syncMutation.isPending) {
      syncIntervalRef.current = setInterval(() => {
        syncMutation.mutate();
      }, 10000); // Sync with Retell API every 10 seconds
    }

    // Clear interval if no active calls
    if (!hasActiveCalls && syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [calls, syncMutation.isPending]);

  const filteredCalls = calls?.filter((call) => {
    const matchesSearch = 
      call.toNumber.includes(search) ||
      (call.fromNumber && call.fromNumber.includes(search)) ||
      call.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || call.callStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Calls</h1>
        <p className="text-sm text-muted-foreground">
          Monitor and review all your call activity
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone number or call ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-calls"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : filteredCalls?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Phone className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">
                {search || statusFilter !== "all" ? "No calls found" : "No calls yet"}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {search || statusFilter !== "all" 
                  ? "Try adjusting your filters" 
                  : "Start a campaign to begin making calls"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Call ID</TableHead>
                    <TableHead>To Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalls?.map((call) => (
                    <TableRow 
                      key={call.id} 
                      className="hover-elevate cursor-pointer" 
                      onClick={() => setLocation(`/calls/${call.id}`)}
                      data-testid={`row-call-${call.id}`}
                    >
                      <TableCell className="font-mono text-xs">{call.id}</TableCell>
                      <TableCell className="font-medium">{call.toNumber}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(call.callStatus)}>
                          {call.callStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatDuration(call.durationMs)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {call.startTimestamp 
                          ? format(new Date(call.startTimestamp), 'MMM dd, HH:mm')
                          : (call.createdAt ? format(new Date(call.createdAt), 'MMM dd, HH:mm') : '-')
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/calls/${call.id}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-view-call-${call.id}`}>
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {filteredCalls && filteredCalls.length > 0 && (
        <div className="text-sm text-muted-foreground text-center">
          Showing {filteredCalls.length} of {calls?.length || 0} calls
        </div>
      )}
    </div>
  );
}
