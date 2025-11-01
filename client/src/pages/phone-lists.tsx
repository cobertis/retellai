import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Upload, List, Trash2, Loader2, FileText, Eye, Sparkles, X } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { PhoneList } from "@shared/schema";

export default function PhoneLists() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const { data: lists, isLoading } = useQuery<PhoneList[]>({
    queryKey: ["/api/phone-lists"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/phone-lists/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      toast({
        title: "Success",
        description: "Phone list deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete phone list",
        variant: "destructive",
      });
    },
  });

  const processLeadsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/process-leads', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Processing failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      setProcessing(false);
      setProgress(100);
      setStatusMessage(`✓ Procesamiento completado: ${data.hispanicCount} hispanos, ${data.nonHispanicCount} no hispanos`);
      setSelectedFile(null);
      
      toast({
        title: "¡Procesamiento Exitoso!",
        description: `Se crearon 2 listas: ${data.hispanicListName} y ${data.nonHispanicListName}`,
      });
      
      // Reset after 3 seconds
      setTimeout(() => {
        setProgress(0);
        setStatusMessage("");
      }, 3000);
    },
    onError: (error: Error) => {
      setProcessing(false);
      setProgress(0);
      setStatusMessage("");
      toast({
        title: "Error",
        description: error.message || "Failed to process leads",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({
          title: "Error",
          description: "Por favor sube un archivo CSV",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleProcessLeads = async () => {
    if (!selectedFile) return;
    
    setProcessing(true);
    setProgress(0);
    setStatusMessage("Analizando archivo CSV...");
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);
    
    try {
      await processLeadsMutation.mutateAsync(selectedFile);
      clearInterval(progressInterval);
    } catch (error) {
      clearInterval(progressInterval);
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6 p-6">
      {/* Left Column - Lists */}
      <div className="flex-1 space-y-6 overflow-auto">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Phone Lists</h1>
          <p className="text-sm text-muted-foreground">
            Your contact lists will appear here
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
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
        ) : lists?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <List className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No phone lists yet</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                Upload a CSV file on the right to automatically create lists
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lists?.map((list) => (
              <Card key={list.id} className="hover-elevate">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{list.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {list.totalNumbers} contacts
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {list.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {list.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {list.classification && (
                      <Badge variant="secondary" className="text-xs">
                        {list.classification}
                      </Badge>
                    )}
                    {list.tags?.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Link href={`/phone-lists/${list.id}`}>
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        data-testid={`button-view-details-${list.id}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(list.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-list-${list.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Right Column - AI Processing */}
      <div className="w-full lg:w-[450px] space-y-6">
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>AI Lead Processor</CardTitle>
            </div>
            <CardDescription>
              Upload a CSV and AI will automatically separate Hispanic and Non-Hispanic leads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Upload CSV File</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              {!selectedFile ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover-elevate hover:border-primary/50 transition-colors"
                >
                  <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">Click to upload CSV</p>
                  <p className="text-xs text-muted-foreground">
                    CSV with phone numbers and names
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium truncate max-w-[200px]">
                      {selectedFile.name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                    disabled={processing}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Processing Status */}
            {(processing || progress > 0) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Processing...</span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                {statusMessage && (
                  <p className="text-xs text-muted-foreground">{statusMessage}</p>
                )}
              </div>
            )}

            {/* Process Button */}
            <Button
              onClick={handleProcessLeads}
              disabled={!selectedFile || processing}
              className="w-full"
              size="lg"
              data-testid="button-process-leads"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Process with AI
                </>
              )}
            </Button>

            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                How it works:
              </p>
              <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <li>• AI analyzes each name individually</li>
                <li>• Separates Hispanic/Latino from Non-Hispanic</li>
                <li>• Creates 2 lists automatically</li>
                <li>• No manual sorting needed</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
