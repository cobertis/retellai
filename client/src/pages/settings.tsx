import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings as SettingsIcon, User, Key, Bell, Bot, Calendar } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState(user?.defaultAgentId || "");
  const [calcomApiKey, setCalcomApiKey] = useState(user?.calcomApiKey || "");
  const [calcomEventTypeId, setCalcomEventTypeId] = useState(user?.calcomEventTypeId || "");

  useEffect(() => {
    if (user) {
      setAgentId(user.defaultAgentId || "");
      setCalcomApiKey(user.calcomApiKey || "");
      setCalcomEventTypeId(user.calcomEventTypeId || "");
    }
  }, [user]);

  const updateAgentMutation = useMutation({
    mutationFn: async (defaultAgentId: string | undefined) => {
      const response = await apiRequest("PATCH", "/api/user/settings", { 
        defaultAgentId: defaultAgentId || undefined 
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Settings saved",
        description: "Your Retell AI Agent ID has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout", undefined);
    },
    onSuccess: () => {
      window.location.href = "/login";
    },
  });

  const updateCalcomMutation = useMutation({
    mutationFn: async (data: { calcomApiKey: string; calcomEventTypeId: string }) => {
      const response = await apiRequest("PATCH", "/api/user/settings", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Cal.com settings saved",
        description: "Your Cal.com integration has been configured successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save Cal.com settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveAgent = () => {
    const trimmedId = agentId.trim();
    updateAgentMutation.mutate(trimmedId || undefined);
  };

  const handleSaveCalcom = () => {
    const trimmedApiKey = calcomApiKey.trim();
    const trimmedEventTypeId = calcomEventTypeId.trim();
    updateCalcomMutation.mutate({
      calcomApiKey: trimmedApiKey || undefined as any,
      calcomEventTypeId: trimmedEventTypeId || undefined as any,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and application preferences
        </p>
      </div>

      <div className="grid gap-6 max-w-4xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <CardTitle>Profile Information</CardTitle>
            </div>
            <CardDescription>
              Your account details from authentication provider
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.email || "User"} />
                <AvatarFallback className="text-lg">
                  {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {user?.firstName && user?.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user?.email || "User"}
                </p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>First Name</Label>
                  <Input value={user?.firstName || ''} disabled />
                </div>
                <div className="grid gap-2">
                  <Label>Last Name</Label>
                  <Input value={user?.lastName || ''} disabled />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle>Retell AI Agent</CardTitle>
            </div>
            <CardDescription>
              Connect your existing Retell AI agent by entering its Agent ID
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="agent-id">Agent ID</Label>
              <div className="flex gap-2">
                <Input
                  id="agent-id"
                  type="text"
                  placeholder="agent_xxxxxxxxxxxxxxxxxx"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-agent-id"
                />
                <Button
                  onClick={handleSaveAgent}
                  disabled={updateAgentMutation.isPending}
                  data-testid="button-save-agent-id"
                >
                  {updateAgentMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the Agent ID from your Retell AI dashboard. This agent will be used for all campaigns you create.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <CardTitle>Cal.com Integration</CardTitle>
            </div>
            <CardDescription>
              Configure Cal.com to sync appointment data with your calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="calcom-api-key">Cal.com API Key</Label>
              <Input
                id="calcom-api-key"
                type="password"
                placeholder="cal_live_xxxxxxxxxxxxxxxx"
                value={calcomApiKey}
                onChange={(e) => setCalcomApiKey(e.target.value)}
                className="font-mono text-sm"
                data-testid="input-calcom-api-key"
              />
              <p className="text-xs text-muted-foreground">
                Get your API key from Cal.com Settings → Security → API Keys
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calcom-event-type-id">Event Type ID</Label>
              <Input
                id="calcom-event-type-id"
                type="text"
                placeholder="123456"
                value={calcomEventTypeId}
                onChange={(e) => setCalcomEventTypeId(e.target.value)}
                className="font-mono text-sm"
                data-testid="input-calcom-event-type-id"
              />
              <p className="text-xs text-muted-foreground">
                Find your Event Type ID in Cal.com Event Types settings
              </p>
            </div>
            <Button
              onClick={handleSaveCalcom}
              disabled={updateCalcomMutation.isPending}
              data-testid="button-save-calcom-settings"
            >
              {updateCalcomMutation.isPending ? "Saving..." : "Save Cal.com Settings"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <CardTitle>API Configuration</CardTitle>
            </div>
            <CardDescription>
              Retell AI API key and webhook settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Retell AI API Key</Label>
              <div className="flex gap-2">
                <Input type="password" value="sk_***********************" disabled />
                <Button variant="outline" disabled>Update</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                API key is configured via environment variables
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Webhook URL</Label>
              <Input 
                value={`${window.location.origin}/api/webhooks/retell`} 
                disabled 
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Configure this URL in your Retell AI dashboard for webhook events
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>
              Manage your notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Notification settings coming soon
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              <CardTitle>Danger Zone</CardTitle>
            </div>
            <CardDescription>
              Account management actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              {logoutMutation.isPending ? "Signing Out..." : "Sign Out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
