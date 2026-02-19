"use client";

import { ReminderList } from "@/components/reminders/ReminderList";
import { useAuth } from "@/components/providers/AuthProvider";
import { useReminders } from "@/components/providers/ReminderProvider";
import { Button } from "@/components/ui/button";
import { CheckCircle, Trash2, Loader2 } from "lucide-react";
import { PageTransition } from "@/components/ui/page-transition";
import { toast } from "sonner";
import { useState } from "react";

export default function CompletedPage() {
    const { user } = useAuth();
    const { clearCompleted } = useReminders();
    const [clearing, setClearing] = useState(false);

    const handleClearCompleted = async () => {
        if (!user) return;
        if (!confirm("Clear all completed reminders? This cannot be undone.")) return;
        setClearing(true);
        try {
            const count = await clearCompleted();
            toast.success(`Cleared ${count} completed reminder${count !== 1 ? 's' : ''}`);
        } catch (error) {
            console.error(error);
            console.error(error);
            toast.error(error instanceof Error ? error.message : "Failed to clear completed reminders");
        } finally {
            setClearing(false);
        }
    };

    return (
        <PageTransition>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <CheckCircle className="h-5 w-5 text-emerald-500" />
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Completed</h1>
                        </div>
                        <p className="text-muted-foreground">
                            History of done tasks
                        </p>
                    </div>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleClearCompleted}
                        disabled={clearing}
                        className="gap-2"
                    >
                        {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Clear Completed
                    </Button>
                </div>

                <ReminderList filter="completed" />
            </div>
        </PageTransition>
    );
}
