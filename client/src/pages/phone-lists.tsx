import { useState, useRef } from "react";
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
import { Plus, Upload, List, Trash2, Loader2, FileText, Eye } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { PhoneList } from "@shared/schema";

export default function PhoneLists() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [uploadingListId, setUploadingListId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    classification: "",
  });

  const { data: lists, isLoading } = useQuery<PhoneList[]>({
    queryKey: ["/api/phone-lists"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/phone-lists", data);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      setUploadingListId(data.id);
      setIsCreateOpen(false);
      setFormData({
        name: "",
        description: "",
        classification: "",
      });
      toast({
        title: "Success",
        description: "Phone list created. Now upload a CSV file with phone numbers.",
      });
      setTimeout(() => fileInputRef.current?.click(), 300);
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
        description: error.message || "Failed to create phone list",
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ listId, file }: { listId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/phone-lists/${listId}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      setUploadingListId(null);
      toast({
        title: "Success",
        description: "Phone numbers uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload CSV",
        variant: "destructive",
      });
    },
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
        description: error.message || "Failed to delete phone list",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingListId) {
      uploadMutation.mutate({ listId: uploadingListId, file });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Phone Lists</h1>
          <p className="text-sm text-muted-foreground">
            Upload and manage your contact lists
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-list">
          <Plus className="h-4 w-4 mr-2" />
          Create List
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />

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
      ) : lists?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <List className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No phone lists yet</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
              Create a phone list and upload a CSV file with contact information
            </p>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-list">
              <Plus className="h-4 w-4 mr-2" />
              Create Phone List
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUploadingListId(list.id);
                      fileInputRef.current?.click();
                    }}
                    data-testid={`button-upload-${list.id}`}
                  >
                    <Upload className="h-3 w-3" />
                  </Button>
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Phone List</DialogTitle>
            <DialogDescription>
              Create a new contact list. You can upload a CSV file after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">List Name</Label>
              <Input
                id="name"
                placeholder="Sales Leads Q1"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-list-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="classification">Classification</Label>
              <Input
                id="classification"
                placeholder="Hot Leads, Cold Calls, etc."
                value={formData.classification}
                onChange={(e) => setFormData({ ...formData, classification: e.target.value })}
                data-testid="input-list-classification"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Description of this contact list..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                data-testid="input-list-description"
              />
            </div>
            <div className="bg-muted p-3 rounded-md text-sm">
              <FileText className="h-4 w-4 inline mr-2" />
              <span className="font-medium">CSV Format:</span> phoneNumber, firstName, lastName, email
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.name || createMutation.isPending}
              data-testid="button-submit-list"
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create & Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
