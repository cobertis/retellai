import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Phone, Clock, DollarSign, TrendingUp, Download, Play, ExternalLink, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { Call, CallLog } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function TokenUsageDisplay({ tokenUsage }: { tokenUsage: { average?: number; num_requests?: number; values?: number[] } }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">LLM Token Usage</p>
      <div className="grid grid-cols-3 gap-2 text-xs bg-muted p-3 rounded">
        <div>
          <p className="font-medium text-muted-foreground">Average</p>
          <p className="text-lg font-semibold">{tokenUsage.average?.toFixed(1) || 'N/A'}</p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground">Total Requests</p>
          <p className="text-lg font-semibold">{tokenUsage.num_requests || 'N/A'}</p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground">Total Tokens</p>
          <p className="text-lg font-semibold">
            {tokenUsage.values?.reduce((a: number, b: number) => a + b, 0)?.toFixed(0) || 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}

function CostBreakdownDisplay({ callCost }: { callCost: { product_costs?: Array<{product: string; cost: number}>; combined_cost?: number } }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">Cost Breakdown</p>
      <div className="space-y-2">
        {callCost.product_costs?.map((product, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
            <span className="font-medium capitalize">{product.product.replace(/_/g, ' ')}</span>
            <span className="text-muted-foreground">${(product.cost / 100).toFixed(4)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between p-2 bg-primary/10 rounded text-sm font-semibold">
          <span>Total Cost</span>
          <span>${((callCost.combined_cost || 0) / 100).toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}

function LatencyDisplay({ latency }: { latency: Record<string, { p50?: number }> }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">Latency Metrics (p50)</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        {Object.entries(latency).map(([key, value]) => (
          <div key={key} className="bg-muted p-2 rounded">
            <p className="font-medium capitalize">{key === 'e2e' ? 'End-to-End' : key.replace(/_/g, ' ')}</p>
            <p className="text-lg font-semibold">
              {value?.p50 ? `${value.p50}ms` : 'N/A'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatGPTAnalysisDisplay({ analysis, onReverifyCalcom, isReverifying }: { analysis: any; onReverifyCalcom?: () => void; isReverifying?: boolean }) {
  return (
    <div className="border-2 border-primary/20 rounded-lg p-4 bg-primary/5 space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">ChatGPT Analysis</h3>
      </div>
      
      {analysis.summary && (
        <div>
          <p className="text-sm font-medium mb-2">Summary</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {analysis.sentiment && (
          <div className="bg-card p-3 rounded-md">
            <p className="text-xs font-medium text-muted-foreground mb-1">Sentiment</p>
            <Badge variant={
              analysis.sentiment === 'positive' ? 'default' :
              analysis.sentiment === 'negative' ? 'destructive' : 'secondary'
            }>
              {analysis.sentiment}
            </Badge>
          </div>
        )}
        {analysis.callQuality && (
          <div className="bg-card p-3 rounded-md">
            <p className="text-xs font-medium text-muted-foreground mb-1">Call Quality</p>
            <Badge variant={
              analysis.callQuality === 'excellent' || analysis.callQuality === 'good' ? 'default' : 'secondary'
            }>
              {analysis.callQuality}
            </Badge>
          </div>
        )}
        {analysis.customerIntent && (
          <div className="bg-card p-3 rounded-md">
            <p className="text-xs font-medium text-muted-foreground mb-1">Customer Intent</p>
            <p className="text-sm font-semibold">{analysis.customerIntent}</p>
          </div>
        )}
      </div>

      {analysis.keyTopics && analysis.keyTopics.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Key Topics</p>
          <div className="flex flex-wrap gap-2">
            {analysis.keyTopics.map((topic: string, idx: number) => (
              <Badge key={idx} variant="outline">
                {topic}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {analysis.actionItems && analysis.actionItems.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Action Items</p>
          <ul className="space-y-1">
            {analysis.actionItems.map((item: string, idx: number) => (
              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.notes && (
        <div>
          <p className="text-sm font-medium mb-2">Additional Notes</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{analysis.notes}</p>
        </div>
      )}

      {/* Customer Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
        {analysis.customerName && (
          <div className="bg-card p-3 rounded-md">
            <p className="text-xs font-medium text-muted-foreground mb-1">Customer Name</p>
            <p className="text-sm font-semibold">{analysis.customerName}</p>
          </div>
        )}
        
        <div className="bg-card p-3 rounded-md">
          <p className="text-xs font-medium text-muted-foreground mb-1">Appointment Status</p>
          {analysis.appointmentScheduled ? (
            <div className="flex flex-col gap-2">
              <Badge className="bg-green-600 hover:bg-green-700 text-white w-fit">
                ✓ Appointment Scheduled
              </Badge>
              {analysis.appointmentDetails && (
                <p className="text-xs text-muted-foreground mt-1">{analysis.appointmentDetails}</p>
              )}
            </div>
          ) : (
            <Badge className="bg-red-600 hover:bg-red-700 text-white w-fit">
              No Appointment
            </Badge>
          )}
        </div>
      </div>

      {/* Cal.com Verification */}
      {analysis.calcomVerification && (
        <div className="border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
            </svg>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Cal.com Verification</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Verification Status</p>
              <Badge className={`${
                analysis.calcomVerification.verified 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-yellow-600 hover:bg-yellow-700'
              } text-white w-fit`}>
                {analysis.calcomVerification.verified ? '✓ Verified in Cal.com' : '⚠ Not Found in Cal.com'}
              </Badge>
            </div>
            
            <div>
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Check Time</p>
              <p className="text-sm text-blue-900 dark:text-blue-100">
                {new Date(analysis.calcomVerification.checkedAt).toLocaleString()}
              </p>
            </div>
          </div>

          {analysis.calcomVerification.verified && analysis.calcomVerification.bookingStart && (
            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">Booking Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium">Start:</span>{' '}
                  <span className="text-blue-900 dark:text-blue-100">
                    {new Date(analysis.calcomVerification.bookingStart).toLocaleString()}
                  </span>
                </div>
                {analysis.calcomVerification.bookingEnd && (
                  <div>
                    <span className="font-medium">End:</span>{' '}
                    <span className="text-blue-900 dark:text-blue-100">
                      {new Date(analysis.calcomVerification.bookingEnd).toLocaleString()}
                    </span>
                  </div>
                )}
                {analysis.calcomVerification.bookingUid && (
                  <div className="col-span-2">
                    <span className="font-medium">Booking ID:</span>{' '}
                    <span className="font-mono text-xs text-blue-900 dark:text-blue-100">
                      {analysis.calcomVerification.bookingUid}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {analysis.calcomVerification.message}
            </p>
          </div>
        </div>
      )}
      
      {/* Re-verify button for appointments */}
      {analysis.appointmentScheduled && onReverifyCalcom && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onReverifyCalcom}
            disabled={isReverifying}
            className="w-full"
            data-testid="button-reverify-calcom"
          >
            {isReverifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
                {analysis.calcomVerification ? 'Re-verify with Cal.com' : 'Verify with Cal.com'}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function CustomAnalysisDisplay({ customData }: { customData: Record<string, any> }) {
  return (
    <div className="border-t pt-4">
      <p className="text-sm font-medium mb-3">Post-Call Analysis (Custom Fields)</p>
      <div className="space-y-3">
        {Object.entries(customData).map(([key, value]) => (
          <div key={key} className="bg-muted/50 p-3 rounded-md">
            <p className="text-xs font-semibold text-muted-foreground capitalize mb-1">
              {key.replace(/_/g, ' ')}
            </p>
            <p className="text-sm whitespace-pre-wrap">
              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CallDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/calls/:id");
  const callId = params?.id;

  const { data: call, isLoading: callLoading } = useQuery<Call>({
    queryKey: [`/api/calls/${callId}`],
    enabled: !!callId,
  });

  const { data: callLog, isLoading: logLoading } = useQuery<CallLog>({
    queryKey: [`/api/calls/${callId}/log`],
    enabled: !!callId,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/calls/${callId}/analyze`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/calls/${callId}`] });
      toast({
        title: "Analysis complete",
        description: "Call has been analyzed with ChatGPT",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze call",
        variant: "destructive",
      });
    },
  });

  const reverifyCalcomMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/calls/${callId}/reverify-calcom`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/calls/${callId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/stats/appointments'] });
      toast({
        title: "Cal.com verification updated",
        description: "Appointment verified with latest Cal.com data",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Failed to verify with Cal.com",
        variant: "destructive",
      });
    },
  });

  const isLoading = callLoading || logLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Phone className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">Call not found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The call you're looking for doesn't exist
            </p>
            <Link href="/calls">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Calls
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'failed': return 'destructive';
      case 'in_progress': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/calls">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Call Details</h1>
            <p className="text-sm text-muted-foreground font-mono">{call.id}</p>
          </div>
        </div>
        {callLog?.publicLogUrl && (
          <a 
            href={callLog.publicLogUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            data-testid="link-public-log"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Public Log
            </Button>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={getStatusColor(call.callStatus)} className="mb-2">
              {call.callStatus}
            </Badge>
            {call.disconnectionReason && (
              <p className="text-xs text-muted-foreground">{call.disconnectionReason}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(call.durationMs)}</div>
            <p className="text-xs text-muted-foreground">
              {call.durationMs ? `${(call.durationMs / 1000).toFixed(0)} seconds` : 'No duration'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sentiment</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {callLog?.userSentiment || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              User sentiment analysis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${callLog?.callCost ? ((callLog.callCost as any).combined_cost / 100)?.toFixed(2) || '0.00' : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              Total call cost
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Call Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">From Number</p>
            <p className="text-base font-mono">{call.fromNumber}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">To Number</p>
            <p className="text-base font-mono">{call.toNumber}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Start Time</p>
            <p className="text-base">
              {call.startTimestamp 
                ? format(new Date(call.startTimestamp), 'MMM dd, yyyy HH:mm:ss')
                : 'Not started'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">End Time</p>
            <p className="text-base">
              {call.endTimestamp 
                ? format(new Date(call.endTimestamp), 'MMM dd, yyyy HH:mm:ss')
                : 'Not ended'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="transcript" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="recording">Recording</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Call Transcript</CardTitle>
              <CardDescription>
                Full conversation with timestamps and tool invocations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {callLog?.transcriptWithToolCalls ? (
                <div className="space-y-3">
                  {(callLog.transcriptWithToolCalls as any[]).map((entry, idx) => {
                    const isAgent = entry.role === 'agent';
                    const isTool = entry.role === 'tool_call' || entry.tool_calls;
                    
                    return (
                      <div key={idx}>
                        <div className={`p-3 rounded-md ${isAgent ? 'bg-primary/5' : 'bg-muted/50'}`}>
                          <div className="flex items-start justify-between">
                            <p className="text-sm flex-1">
                              <span className="font-semibold capitalize">{entry.role}: </span>
                              {entry.content}
                            </p>
                            {entry.words?.[0]?.start && (
                              <span className="text-xs text-muted-foreground ml-2 font-mono">
                                {entry.words[0].start.toFixed(1)}s
                              </span>
                            )}
                          </div>
                        </div>
                        {entry.tool_calls?.map((tool: any, toolIdx: number) => (
                          <div key={toolIdx} className="ml-6 mt-2 p-2 rounded-md bg-accent/20 border border-accent">
                            <div className="flex items-center gap-2">
                              <Play className="h-3 w-3 text-accent-foreground" />
                              <span className="text-xs font-semibold">Tool: {tool.name}</span>
                            </div>
                            {tool.arguments && (
                              <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto">
                                {JSON.stringify(tool.arguments, null, 2)}
                              </pre>
                            )}
                            {tool.result && (
                              <div className="mt-1 text-xs">
                                <span className="font-medium">Result: </span>
                                <span className="text-muted-foreground">{tool.result}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : callLog?.transcript ? (
                <div className="space-y-2">
                  {callLog.transcript.split('\n').map((line, idx) => {
                    const isAgent = line.startsWith('Agent:');
                    return (
                      <div key={idx} className={`p-3 rounded-md ${isAgent ? 'bg-primary/5' : 'bg-muted/50'}`}>
                        <p className="text-sm">
                          <span className="font-semibold">{isAgent ? 'Agent: ' : 'User: '}</span>
                          {line.replace(/^(Agent:|User:)\s*/, '')}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No transcript available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recording" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Call Recording</CardTitle>
              <CardDescription>
                Audio recording of the call
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {callLog?.recordingUrl ? (
                <>
                  <audio controls className="w-full">
                    <source src={callLog.recordingUrl} type="audio/wav" />
                    Your browser does not support the audio element.
                  </audio>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={callLog.recordingUrl} download data-testid="button-download-recording">
                        <Download className="h-4 w-4 mr-2" />
                        Download Recording
                      </a>
                    </Button>
                    {callLog.recordingMultiChannelUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={callLog.recordingMultiChannelUrl} download>
                          <Download className="h-4 w-4 mr-2" />
                          Multi-channel
                        </a>
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No recording available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Call Analysis</CardTitle>
              <CardDescription>
                AI-generated insights and metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {call?.aiAnalysis && (
                <ChatGPTAnalysisDisplay 
                  analysis={call.aiAnalysis}
                  onReverifyCalcom={() => reverifyCalcomMutation.mutate()}
                  isReverifying={reverifyCalcomMutation.isPending}
                />
              )}

              {callLog?.callSummary && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Call Summary (Retell AI)</p>
                  <p className="text-sm text-muted-foreground">{callLog.callSummary}</p>
                </div>
              )}
              {callLog?.customAnalysisData && Object.keys(callLog.customAnalysisData as object).length > 0 && (
                <CustomAnalysisDisplay customData={callLog.customAnalysisData as Record<string, any>} />
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Successful</p>
                  <p className="text-lg font-semibold">
                    {callLog?.callSuccessful ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Voicemail</p>
                  <p className="text-lg font-semibold">
                    {callLog?.inVoicemail ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sentiment</p>
                  <p className="text-lg font-semibold">
                    {callLog?.userSentiment || 'Unknown'}
                  </p>
                </div>
              </div>
              {callLog?.llmTokenUsage && <TokenUsageDisplay tokenUsage={callLog.llmTokenUsage as any} />}
              {callLog?.callCost && <CostBreakdownDisplay callCost={callLog.callCost as any} />}
              {callLog?.latency && <LatencyDisplay latency={callLog.latency as any} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
