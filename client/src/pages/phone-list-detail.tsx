import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Pencil, Trash2, Upload } from "lucide-react";
import type { PhoneList, PhoneNumber, InsertPhoneNumber } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPhoneListSchema, insertPhoneNumberSchema } from "@shared/schema";
import { z } from "zod";

export default function PhoneListDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [isEditListOpen, setIsEditListOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [isDeleteContactOpen, setIsDeleteContactOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<PhoneNumber | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const { data: list, isLoading: isLoadingList } = useQuery<PhoneList>({
    queryKey: ["/api/phone-lists", id],
    enabled: !!id,
  });

  const { data: contacts = [], isLoading: isLoadingContacts } = useQuery<PhoneNumber[]>({
    queryKey: ["/api/phone-lists", id, "numbers"],
    enabled: !!id,
  });

  const editListForm = useForm({
    resolver: zodResolver(insertPhoneListSchema.partial()),
    defaultValues: {
      name: "",
      description: "",
      classification: "",
    },
  });

  const contactFormSchema = insertPhoneNumberSchema.omit({ listId: true });
  
  const addContactForm = useForm({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      phoneNumber: "",
      firstName: "",
      lastName: "",
      email: "",
    },
  });

  const editContactForm = useForm({
    resolver: zodResolver(contactFormSchema.partial()),
  });

  const updateListMutation = useMutation({
    mutationFn: async (data: Partial<z.infer<typeof insertPhoneListSchema>>) => {
      const response = await apiRequest("PATCH", `/api/phone-lists/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      setIsEditListOpen(false);
      toast({
        title: "List updated",
        description: "Phone list details have been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async (data: z.infer<typeof contactFormSchema>) => {
      const response = await apiRequest("POST", `/api/phone-lists/${id}/numbers`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists", id, "numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      setIsAddContactOpen(false);
      addContactForm.reset();
      toast({
        title: "Contact added",
        description: "Contact has been added to the list successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const editContactMutation = useMutation({
    mutationFn: async ({ numberId, data }: { numberId: string; data: Partial<z.infer<typeof contactFormSchema>> }) => {
      const response = await apiRequest("PATCH", `/api/phone-lists/${id}/numbers/${numberId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists", id, "numbers"] });
      setIsEditContactOpen(false);
      setSelectedContact(null);
      toast({
        title: "Contact updated",
        description: "Contact has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (numberId: string) => {
      const response = await apiRequest("DELETE", `/api/phone-lists/${id}/numbers/${numberId}`, undefined);
      if (response.status !== 204) {
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists", id, "numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      setIsDeleteContactOpen(false);
      setSelectedContact(null);
      toast({
        title: "Contact deleted",
        description: "Contact has been removed from the list",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/phone-lists/${id}/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Upload failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists", id, "numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      setIsUploadOpen(false);
      setUploadFile(null);
      toast({
        title: "Upload successful",
        description: data.message || "Contacts have been uploaded",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message,
      });
    },
  });

  const handleEditListOpen = () => {
    if (list) {
      editListForm.reset({
        name: list.name,
        description: list.description || "",
        classification: list.classification || "",
      });
      setIsEditListOpen(true);
    }
  };

  const handleEditContact = (contact: PhoneNumber) => {
    setSelectedContact(contact);
    editContactForm.reset({
      phoneNumber: contact.phoneNumber,
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
    });
    setIsEditContactOpen(true);
  };

  const handleDeleteContact = (contact: PhoneNumber) => {
    setSelectedContact(contact);
    setIsDeleteContactOpen(true);
  };

  if (isLoadingList) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading...</p>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p>List not found</p>
        <Link href="/phone-lists">
          <Button variant="outline" data-testid="button-back-to-lists">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Lists
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/phone-lists">
              <Button variant="outline" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">{list.name}</h1>
              {list.description && (
                <p className="text-muted-foreground">{list.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleEditListOpen} data-testid="button-edit-list">
              <Pencil className="w-4 h-4 mr-2" />
              Edit List
            </Button>
            <Button variant="outline" onClick={() => setIsUploadOpen(true)} data-testid="button-upload-csv">
              <Upload className="w-4 h-4 mr-2" />
              Upload CSV
            </Button>
            <Button onClick={() => setIsAddContactOpen(true)} data-testid="button-add-contact">
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-contacts">{list.totalNumbers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Classification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg">{list.classification || "—"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Created</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg">
                {list.createdAt ? new Date(list.createdAt).toLocaleDateString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg">
                {list.updatedAt ? new Date(list.updatedAt).toLocaleDateString() : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>
              Manage all contacts in this list
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <p>Loading contacts...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <p className="text-muted-foreground">No contacts yet</p>
                <Button onClick={() => setIsAddContactOpen(true)} data-testid="button-add-first-contact">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Contact
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                      <TableCell className="font-mono">{contact.phoneNumber}</TableCell>
                      <TableCell>
                        {contact.firstName || contact.lastName
                          ? `${contact.firstName || ""} ${contact.lastName || ""}`.trim()
                          : "—"}
                      </TableCell>
                      <TableCell>{contact.email || "—"}</TableCell>
                      <TableCell>
                        {contact.createdAt
                          ? new Date(contact.createdAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditContact(contact)}
                            data-testid={`button-edit-contact-${contact.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteContact(contact)}
                            data-testid={`button-delete-contact-${contact.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit List Dialog */}
      <Dialog open={isEditListOpen} onOpenChange={setIsEditListOpen}>
        <DialogContent data-testid="dialog-edit-list">
          <DialogHeader>
            <DialogTitle>Edit List Details</DialogTitle>
            <DialogDescription>
              Update the name, description, and classification of this list
            </DialogDescription>
          </DialogHeader>
          <Form {...editListForm}>
            <form
              onSubmit={editListForm.handleSubmit((data) => updateListMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={editListForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>List Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-list-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editListForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-edit-list-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editListForm.control}
                name="classification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Classification</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-list-classification" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditListOpen(false)}
                  data-testid="button-cancel-edit-list"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateListMutation.isPending} data-testid="button-save-list">
                  {updateListMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
        <DialogContent data-testid="dialog-add-contact">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Add a new contact to this list
            </DialogDescription>
          </DialogHeader>
          <Form {...addContactForm}>
            <form
              onSubmit={addContactForm.handleSubmit((data) => addContactMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={addContactForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+1234567890" data-testid="input-phone-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={addContactForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addContactForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={addContactForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddContactOpen(false)}
                  data-testid="button-cancel-add"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addContactMutation.isPending} data-testid="button-save-contact">
                  {addContactMutation.isPending ? "Adding..." : "Add Contact"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={isEditContactOpen} onOpenChange={setIsEditContactOpen}>
        <DialogContent data-testid="dialog-edit-contact">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>
              Update contact information
            </DialogDescription>
          </DialogHeader>
          <Form {...editContactForm}>
            <form
              onSubmit={editContactForm.handleSubmit((data) => {
                if (selectedContact) {
                  editContactMutation.mutate({ numberId: selectedContact.id, data });
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={editContactForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-phone-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editContactForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editContactForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editContactForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" data-testid="input-edit-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditContactOpen(false)}
                  data-testid="button-cancel-edit-contact"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editContactMutation.isPending} data-testid="button-update-contact">
                  {editContactMutation.isPending ? "Updating..." : "Update Contact"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Contact Dialog */}
      <Dialog open={isDeleteContactOpen} onOpenChange={setIsDeleteContactOpen}>
        <DialogContent data-testid="dialog-delete-contact">
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedContact && (
            <div className="py-4">
              <p className="font-medium">{selectedContact.phoneNumber}</p>
              {(selectedContact.firstName || selectedContact.lastName) && (
                <p className="text-sm text-muted-foreground">
                  {`${selectedContact.firstName || ""} ${selectedContact.lastName || ""}`.trim()}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteContactOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedContact && deleteContactMutation.mutate(selectedContact.id)}
              disabled={deleteContactMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteContactMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload CSV Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent data-testid="dialog-upload-csv">
          <DialogHeader>
            <DialogTitle>Upload CSV File</DialogTitle>
            <DialogDescription>
              Upload a CSV file with phone numbers. The file should have columns for phone, firstName, lastName, and email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              data-testid="input-upload-file"
            />
            {uploadFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {uploadFile.name}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadOpen(false);
                setUploadFile(null);
              }}
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={() => uploadFile && uploadMutation.mutate(uploadFile)}
              disabled={!uploadFile || uploadMutation.isPending}
              data-testid="button-confirm-upload"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
