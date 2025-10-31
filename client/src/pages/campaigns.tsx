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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, PhoneCall, Play, Pause, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Campaign, Agent, PhoneList } from "@shared/schema";

export default function Campaigns() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [startImmediately, setStartImmediately] = useState(false);
  const [formData, setFormData] = useState({
    agentId: "",
    listId: "",
  });

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: lists } = useQuery<PhoneList[]>({
    queryKey: ["/api/phone-lists"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { startImmediately: boolean }) => {
      const response = await apiRequest("POST", "/api/campaigns", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      setIsCreateOpen(false);
      setFormData({
        agentId: "",
        listId: "",
      });
      setStartImmediately(false);
      toast({
        title: "Success",
        description: startImmediately ? "Campaign created and started successfully" : "Campaign created successfully",
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
        description: error.message || "Failed to create campaign",
        variant: "destructive",
      });
    },
  });

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/campaigns/${id}/start`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Success",
        description: "Campaign started successfully",
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
        description: error.message || "Failed to start campaign",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'paused':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getProgress = (campaign: Campaign) => {
    if (!campaign.totalCalls) return 0;
    return ((campaign.completedCalls || 0) / campaign.totalCalls) * 100;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Create and monitor your call campaigns
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-campaign">
          <Plus className="h-4 w-4 mr-2" />
          Create Campaign
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaigns?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <PhoneCall className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No campaigns yet</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
              Create your first campaign to start making automated calls
            </p>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-campaign">
              <Plus className="h-4 w-4 mr-2" />
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns?.map((campaign) => (
            <Card key={campaign.id} className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-lg">{campaign.name}</CardTitle>
                      <Badge variant={getStatusColor(campaign.status)}>
                        {campaign.status}
                      </Badge>
                    </div>
                    <CardDescription>
                      {campaign.description || 'No description'}
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => startMutation.mutate(campaign.id)}
                    disabled={campaign.status === 'active' || startMutation.isPending}
                    data-testid={`button-start-campaign-${campaign.id}`}
                  >
                    {campaign.status === 'active' ? (
                      <>
                        <Pause className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Calls</p>
                    <p className="text-lg font-semibold">{campaign.totalCalls || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Completed</p>
                    <p className="text-lg font-semibold text-green-600">{campaign.completedCalls || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">In Progress</p>
                    <p className="text-lg font-semibold text-blue-600">{campaign.inProgressCalls || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Failed</p>
                    <p className="text-lg font-semibold text-red-600">{campaign.failedCalls || 0}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{getProgress(campaign).toFixed(0)}%</span>
                  </div>
                  <Progress value={getProgress(campaign)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
            <DialogDescription>
              Select an agent and phone list to create a call campaign
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="agent">AI Agent</Label>
              <Select
                value={formData.agentId}
                onValueChange={(value) => setFormData({ ...formData, agentId: value })}
              >
                <SelectTrigger data-testid="select-agent">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="list">Phone List</Label>
              <Select
                value={formData.listId}
                onValueChange={(value) => setFormData({ ...formData, listId: value })}
              >
                <SelectTrigger data-testid="select-list">
                  <SelectValue placeholder="Select a list" />
                </SelectTrigger>
                <SelectContent>
                  {lists?.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list.totalNumbers} contacts)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 p-4 rounded-md border">
              <input
                type="checkbox"
                id="startImmediately"
                checked={startImmediately}
                onChange={(e) => setStartImmediately(e.target.checked)}
                className="h-4 w-4 rounded border-input"
                data-testid="checkbox-start-immediately"
              />
              <Label htmlFor="startImmediately" className="text-sm font-normal cursor-pointer">
                Start campaign immediately
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate({ ...formData, startImmediately })}
              disabled={!formData.agentId || !formData.listId || createMutation.isPending}
              data-testid="button-submit-campaign"
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {startImmediately ? "Create and Start" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
