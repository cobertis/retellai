import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, BarChart3, Users, Zap } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary">
              <Phone className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Automated Call Management
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Manage your automated call campaigns with Retell AI. Create agents, upload phone lists, and track every call with comprehensive analytics.
          </p>
          <Button size="lg" asChild data-testid="button-login">
            <a href="/api/login">
              Get Started
            </a>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-3">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">AI Agents</CardTitle>
              <CardDescription>
                Create and manage AI-powered voice agents with custom voices and prompts
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-3">
                <Phone className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Call Campaigns</CardTitle>
              <CardDescription>
                Upload phone lists and launch automated call campaigns at scale
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-3">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Real-time Analytics</CardTitle>
              <CardDescription>
                Track call status, success rates, and performance metrics in real-time
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-3">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Complete Logs</CardTitle>
              <CardDescription>
                Access full transcripts, recordings, and detailed call analytics
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card className="bg-card/50 backdrop-blur">
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-3 gap-8">
              <div>
                <h3 className="font-semibold mb-2">Upload & Organize</h3>
                <p className="text-sm text-muted-foreground">
                  Import phone lists via CSV, classify contacts, and organize them with tags
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Launch Campaigns</h3>
                <p className="text-sm text-muted-foreground">
                  Create campaigns with custom agents and schedule automated calls
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Monitor & Analyze</h3>
                <p className="text-sm text-muted-foreground">
                  Track every call with transcripts, sentiment analysis, and cost breakdowns
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
