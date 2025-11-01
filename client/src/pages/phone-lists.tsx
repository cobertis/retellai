import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Upload, List, Trash2, Loader2, FileText, Eye, Sparkles, X, Check } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { PhoneList } from "@shared/schema";

export default function PhoneLists() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Two-step process states
  const [currentStep, setCurrentStep] = useState<'upload' | 'classify' | 'complete'>('upload');
  const [uploadedListId, setUploadedListId] = useState<string | null>(null);
  const [uploadedListName, setUploadedListName] = useState<string>('');
  const [totalContacts, setTotalContacts] = useState<number>(0);
  
  // Classification progress
  const [classifying, setClassifying] = useState(false);
  const [classificationProgress, setClassificationProgress] = useState<any>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // STEP 1: Upload CSV and save numbers
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/process-leads', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
      setUploadedListId(data.listId);
      setUploadedListName(data.listName);
      setTotalContacts(data.totalContacts);
      setCurrentStep('classify');
      
      toast({
        title: "✅ Paso 1 Completado",
        description: `${data.totalContacts} contactos guardados. Ahora puedes clasificar con IA.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  // STEP 2: Classify with AI
  const classifyMutation = useMutation({
    mutationFn: async (listId: string) => {
      const response = await fetch(`/api/classify-list/${listId}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Classification failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setClassifying(true);
      
      // Start polling for progress
      progressIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/classify-progress/${uploadedListId}`);
          const progress = await response.json();
          
          setClassificationProgress(progress);
          
          if (progress.status === 'completed') {
            clearInterval(progressIntervalRef.current!);
            setClassifying(false);
            setCurrentStep('complete');
            queryClient.invalidateQueries({ queryKey: ["/api/phone-lists"] });
            
            toast({
              title: "🎉 ¡Clasificación Completada!",
              description: `${progress.hispanicCount} hispanos, ${progress.nonHispanicCount} no hispanos`,
            });
          } else if (progress.status === 'error') {
            clearInterval(progressIntervalRef.current!);
            setClassifying(false);
            toast({
              title: "Error",
              description: progress.errorMessage || "Classification failed",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error('Error fetching progress:', error);
        }
      }, 1000); // Poll every second
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start classification",
        variant: "destructive",
      });
    },
  });

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

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

  const handleUpload = async () => {
    if (!selectedFile) return;
    await uploadMutation.mutateAsync(selectedFile);
  };

  const handleClassify = async () => {
    if (!uploadedListId) return;
    await classifyMutation.mutateAsync(uploadedListId);
  };

  const handleReset = () => {
    setCurrentStep('upload');
    setSelectedFile(null);
    setUploadedListId(null);
    setUploadedListName('');
    setTotalContacts(0);
    setClassifying(false);
    setClassificationProgress(null);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
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
              <CardTitle>Procesador de Leads con IA</CardTitle>
            </div>
            <CardDescription>
              Proceso de 2 pasos: Sube CSV y luego clasifica con IA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step Indicators */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 flex-1 ${currentStep !== 'upload' ? 'opacity-50' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'}`}>
                  {currentStep === 'upload' ? '1' : <Check className="h-4 w-4" />}
                </div>
                <span className="text-sm font-medium">Subir CSV</span>
              </div>
              <div className="h-px bg-border flex-1" />
              <div className={`flex items-center gap-2 flex-1 ${currentStep === 'upload' ? 'opacity-50' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === 'classify' ? 'bg-primary text-primary-foreground' : currentStep === 'complete' ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {currentStep === 'complete' ? <Check className="h-4 w-4" /> : '2'}
                </div>
                <span className="text-sm font-medium">Clasificar</span>
              </div>
            </div>

            {/* STEP 1: Upload */}
            {currentStep === 'upload' && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Paso 1: Subir Contactos</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Sube tu archivo CSV con números de teléfono y nombres
                  </p>
                </div>
                
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
                    data-testid="upload-csv-area"
                  >
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium mb-1">Haz clic para subir CSV</p>
                    <p className="text-xs text-muted-foreground">
                      CSV con teléfonos y nombres
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
                      disabled={uploadMutation.isPending}
                      data-testid="button-remove-file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploadMutation.isPending}
                  className="w-full"
                  size="lg"
                  data-testid="button-upload-csv"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Subiendo...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Subir y Guardar
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* STEP 2: Classify */}
            {currentStep === 'classify' && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Paso 2: Clasificar con IA</h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    Lista: <span className="font-medium text-foreground">{uploadedListName}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {totalContacts} contactos listos para clasificar
                  </p>
                </div>

                {classifying && classificationProgress && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progreso de Clasificación</span>
                        <span className="font-medium">
                          {classificationProgress.processedNames} / {classificationProgress.totalNames}
                        </span>
                      </div>
                      <Progress 
                        value={(classificationProgress.processedNames / classificationProgress.totalNames) * 100} 
                        className="h-2" 
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Batch {classificationProgress.currentBatch} / {classificationProgress.totalBatches}</span>
                        <span>{Math.round((classificationProgress.processedNames / classificationProgress.totalNames) * 100)}%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Hispanos</p>
                        <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{classificationProgress.hispanicCount}</p>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                        <p className="text-xs text-green-600 dark:text-green-400 mb-1">No Hispanos</p>
                        <p className="text-lg font-bold text-green-900 dark:text-green-100">{classificationProgress.nonHispanicCount}</p>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleClassify}
                  disabled={classifying}
                  className="w-full"
                  size="lg"
                  data-testid="button-classify"
                >
                  {classifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Clasificando con IA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Comenzar Clasificación
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* STEP 3: Complete */}
            {currentStep === 'complete' && classificationProgress && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">¡Clasificación Completada!</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Se crearon 2 nuevas listas
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Lista en Español</p>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">{classificationProgress.hispanicListName}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{classificationProgress.hispanicCount} contactos</p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <p className="text-xs text-green-600 dark:text-green-400 mb-1">Lista en Inglés</p>
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">{classificationProgress.nonHispanicListName}</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">{classificationProgress.nonHispanicCount} contactos</p>
                  </div>
                </div>

                <Button
                  onClick={handleReset}
                  className="w-full"
                  variant="outline"
                  data-testid="button-process-another"
                >
                  Procesar Otro Archivo
                </Button>
              </div>
            )}

            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Cómo funciona:
              </p>
              <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Paso 1: Sube CSV y guarda contactos (rápido)</li>
                <li>• Paso 2: IA analiza cada nombre (puedes ver el progreso)</li>
                <li>• Crea 2 listas: Español e Inglés</li>
                <li>• Sin clasificación manual</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
