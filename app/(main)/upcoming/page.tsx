"use client";

import { ReminderList } from "@/components/reminders/ReminderList";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { Button } from "@/components/ui/button";
import { Plus, Clock } from "lucide-react";
import { PageTransition } from "@/components/ui/page-transition";

export default function UpcomingPage() {
    const { openNew } = useReminderModal();

    return (
        <PageTransition>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-5 w-5 text-primary" />
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Upcoming</h1>
                        </div>
                        <p className="text-muted-foreground">
                            Future reminders
                        </p>
                    </div>
                    <Button onClick={openNew} className="hidden md:inline-flex">
                        <Plus className="mr-2 h-4 w-4" />
                        New Reminder
                    </Button>
                </div>

                <ReminderList filter="upcoming" />
            </div>
        </PageTransition>
    );
}
