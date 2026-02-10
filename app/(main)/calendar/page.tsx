"use client";

import { CalendarWrapper } from "@/components/calendar/CalendarWrapper";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { PageTransition } from "@/components/ui/page-transition";

export default function CalendarPage() {
    const { openNew } = useReminderModal();

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
                    <Button onClick={openNew} className="hidden md:inline-flex">
                        <Plus className="mr-2 h-4 w-4" />
                        New Reminder
                    </Button>
                </div>

                <div className="flex-1">
                    <CalendarWrapper />
                </div>
            </div>
        </PageTransition>
    );
}
