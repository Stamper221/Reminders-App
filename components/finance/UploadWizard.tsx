"use client";

import { useState, useRef, useEffect } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/AuthProvider";

import { doc, onSnapshot, collection, query, where, orderBy, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type UploadStep = 'uploading' | 'parsing' | 'analyzing' | 'done' | 'error';

interface UploadEvent {
    id: string; // The statementId
    file: { name: string, size?: number }; // We store a minimal representation since actual File objects disappear
    status: UploadStep;
    progress: number; // 0 to 100
    error?: string;
}

export function UploadWizard() {
    const { user } = useAuth();
    const [uploads, setUploads] = useState<UploadEvent[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!user) return;

        // Listen for active processing jobs from the database (makes queue survive refresh)
        const q = query(
            collection(db, `users/${user.uid}/finance_statements`),
            where("parseStatus", "in", ["parsing", "analyzing"])
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const activeDbJobs: UploadEvent[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    file: { name: data.filename, size: 0 },
                    status: data.parseStatus as UploadStep,
                    progress: data.parseStatus === 'parsing' ? 40 : 80,
                };
            });

            // Merge active jobs with any local ones (like initial uploading state)
            setUploads(prev => {
                const map = new Map(prev.map(p => [p.id, p]));
                activeDbJobs.forEach(job => map.set(job.id, job));
                return Array.from(map.values()).filter(u => u.status !== 'done');
            });

        });

        return () => unsub();
    }, [user]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files).filter(f =>
            f.type === "application/pdf" || f.type === "text/csv" || f.name.endsWith('.csv') || f.name.endsWith('.pdf')
        );
        handleFilesSelected(files);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            handleFilesSelected(files);
        }
    };

    const handleFilesSelected = async (files: File[]) => {
        if (!user) return;
        if (files.length === 0) {
            toast.error("Please select a valid PDF or CSV file.");
            return;
        }

        const newUploads: UploadEvent[] = files.map(file => ({
            id: crypto.randomUUID(),
            file,
            status: 'uploading',
            progress: 0
        }));

        setUploads(prev => [...prev, ...newUploads]);

        // Process each file loosely
        for (const item of newUploads) {
            processFile(item, files.find(f => f.name === item.file.name)!);
        }
    };

    const processFile = async (item: UploadEvent, actualFile: File) => {
        try {
            updateUpload(item.id, { progress: 30, status: 'uploading' });

            const formData = new FormData();
            formData.append('file', actualFile);

            const token = await user?.getIdToken();

            // 1. Upload the file and extract text chunks
            const res = await fetch('/api/finance/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Upload failed");
            }

            const uploadData = await res.json();
            const statementId = uploadData.statementId;

            // Swap the temporary UUID with the real DB Statement ID so the listener catches it
            setUploads(prev => {
                const filtered = prev.filter(p => p.id !== item.id);
                return [...filtered, { ...item, id: statementId, status: 'parsing', progress: 50 }];
            });

            // 2. Trigger the AI Analysis Pipeline (Fire and forget from client perspective)
            // It will take a long time (Vercel maxDuration 300s). The user can refresh, and the Firestore listener will track it.
            fetch('/api/finance/analyze', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ statementId })
            }).then(analyzeRes => {
                if (!analyzeRes.ok) {
                    console.error("Analysis pipeline threw an explicit error code.");
                } else {
                    toast.success(`${item.file.name} processing complete!`);
                }
            }).catch(e => {
                console.error("Analysis request dropped/timed out on client, but may still be running on server API.", e);
            });

        } catch (error: any) {
            updateUpload(item.id, { status: 'error', error: error.message || "Failed to process" });
            toast.error(`Failed: ${item.file.name}`);
        }
    };

    const updateUpload = (id: string, updates: Partial<UploadEvent>) => {
        setUploads(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    };

    const removeFile = async (id: string) => {
        // Optimistic UI removal
        setUploads(prev => prev.filter(u => u.id !== id));

        // If it's a real DB ID, delete it to kill background processing listener
        if (user && id.length > 15) {
            try {
                await deleteDoc(doc(db, `users/${user.uid}/finance_statements`, id));
            } catch (error) {
                console.error("Failed to delete processing statement:", error);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div
                className={cn(
                    "relative border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center transition-all duration-300 min-h-[250px]",
                    isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border/50 bg-card hover:border-primary/50 hover:bg-card/80",
                    "glass"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="h-16 w-16 mb-6 rounded-full gradient-primary/10 flex items-center justify-center shadow-inner">
                    <UploadCloud className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-2">Upload Bank Statement</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                    Drag & drop your PDF or CSV statements here. We recommend uploading 3-6 months for the best AI insights.
                </p>

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".pdf,.csv,application/pdf,text/csv"
                    multiple
                    onChange={handleFileChange}
                />

                <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full shadow-lg hover:shadow-primary/20 transition-all font-semibold px-8"
                >
                    Browse Files
                </Button>

                <p className="text-[11px] text-muted-foreground mt-4 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Data is parsed securely and can be deleted anytime. Sensitive IDs are redacted.
                </p>
            </div>

            {/* Upload Queue */}
            <AnimatePresence>
                {uploads.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                    >
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Processing Queue</h4>
                        <div className="space-y-3">
                            {uploads.map((upload) => (
                                <motion.div
                                    key={upload.id}
                                    layout
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="glass p-4 rounded-xl border border-border/50 flex items-center gap-4 relative overflow-hidden"
                                >
                                    {/* Progress Background */}
                                    {upload.status !== 'done' && upload.status !== 'error' && (
                                        <div
                                            className="absolute top-0 bottom-0 left-0 bg-primary/5 transition-all duration-300"
                                            style={{ width: `${upload.progress}%` }}
                                        />
                                    )}

                                    <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center shrink-0 shadow-sm border border-border/30 z-10">
                                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                                    </div>

                                    <div className="flex-1 min-w-0 z-10">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-sm font-medium truncate pr-4 text-foreground">{upload.file.name}</p>
                                            {upload.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                                            {upload.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                                            {(upload.status === 'uploading' || upload.status === 'parsing' || upload.status === 'analyzing') && (
                                                <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-muted-foreground">
                                                {upload.status === 'uploading' && 'Encrypting & Uploading...'}
                                                {upload.status === 'parsing' && 'Extracting transactions + AI OCR...'}
                                                {upload.status === 'analyzing' && 'AI matching & categorizing...'}
                                                {upload.status === 'done' && 'Ready for review'}
                                                {upload.status === 'error' && <span className="text-red-500">{upload.error}</span>}
                                            </p>
                                            <p className="text-[10px] font-medium text-muted-foreground">{upload.file.size ? (upload.file.size / 1024 / 1024).toFixed(2) + ' MB' : ''}</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => removeFile(upload.id)}
                                        className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground transition-colors z-10 shrink-0 ml-2"
                                        title={upload.status === 'done' || upload.status === 'error' ? "Remove" : "Cancel Upload"}
                                    >
                                        <X className="h-4 w-4 shrink-0" />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
