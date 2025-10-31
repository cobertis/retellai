import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings as SettingsIcon, User, Key, Bell } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();

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
            <Button variant="outline" asChild data-testid="button-logout">
              <a href="/api/logout">
                Sign Out
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
