import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Users, Trash2, Loader2, Link as LinkIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "@shared/schema";

export default function Agents() {
  const { toast } = useToast();
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [agentId, setAgentId] = useState("");

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const connectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", "/api/agents/connect", { agentId: id.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setIsConnectOpen(false);
      setAgentId("");
      toast({
        title: "Success",
        description: "Agent connected successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to connect agent",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/agents/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: "Success",
        description: "Agent removed successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to remove agent",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">AI Agents</h1>
          <p className="text-sm text-muted-foreground">
            Connect your existing Retell AI agents
          </p>
        </div>
        <Button onClick={() => setIsConnectOpen(true)} data-testid="button-connect-agent">
          <LinkIcon className="h-4 w-4 mr-2" />
          Connect Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : agents?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No agents connected</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
              Connect your existing Retell AI agent to start making automated calls
            </p>
            <Button onClick={() => setIsConnectOpen(true)} data-testid="button-connect-first-agent">
              <LinkIcon className="h-4 w-4 mr-2" />
              Connect Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents?.map((agent) => (
            <Card key={agent.id} className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{agent.name}</CardTitle>
                    <CardDescription className="truncate font-mono text-xs mt-1">
                      {agent.id}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {agent.voiceId}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {agent.language}
                  </Badge>
                </div>
                {agent.generalPrompt && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {agent.generalPrompt}
                  </p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteMutation.mutate(agent.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-agent-${agent.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isConnectOpen} onOpenChange={setIsConnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Retell AI Agent</DialogTitle>
            <DialogDescription>
              Enter the Agent ID from your Retell AI dashboard
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="agent-id">Agent ID</Label>
              <Input
                id="agent-id"
                placeholder="agent_xxxxxxxxxxxxxxxxxx"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="font-mono text-sm"
                data-testid="input-connect-agent-id"
              />
              <p className="text-xs text-muted-foreground">
                You can find the Agent ID in your Retell AI dashboard
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConnectOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => connectMutation.mutate(agentId)}
              disabled={!agentId.trim() || connectMutation.isPending}
              data-testid="button-submit-connect-agent"
            >
              {connectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
