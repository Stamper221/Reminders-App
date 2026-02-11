"use client";

import { CalendarWrapper } from "@/components/calendar/CalendarWrapper";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon, Trash2, Loader2 } from "lucide-react";
import { PageTransition } from "@/components/ui/page-transition";
import { clearAllReminders } from "@/lib/reminders";
import { toast } from "sonner";
import { useState } from "react";

export default function CalendarPage() {
    const { openNew } = useReminderModal();
    const { user } = useAuth();
    const [clearing, setClearing] = useState(false);

    const handleClearAll = async () => {
        if (!user) return;
        if (!confirm("Clear ALL reminders from the calendar? This will delete every reminder (pending, completed, snoozed) and cannot be undone.")) return;
        setClearing(true);
        try {
            const count = await clearAllReminders(user.uid);
            toast.success(`Cleared ${count} reminder${count !== 1 ? 's' : ''} from calendar`);
        } catch (error) {
            console.error(error);
            toast.error("Failed to clear reminders");
        } finally {
            setClearing(false);
        }
    };

    return (
        <PageTransition>
            <div className="space-y-6 h-full flex flex-col">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <CalendarIcon className="h-5 w-5 text-primary" />
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Calendar</h1>
                        </div>
                        <p className="text-muted-foreground">
                            Manage your schedule
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleClearAll}
                            disabled={clearing}
                            className="gap-2"
                        >
                            {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Clear All
                        </Button>
                        <Button onClick={openNew} className="hidden md:inline-flex">
                            <Plus className="mr-2 h-4 w-4" />
                            New Reminder
                        </Button>
                    </div>
                </div>

                <div className="flex-1">
                    <CalendarWrapper />
                </div>
            </div>
        </PageTransition>
    );
}
