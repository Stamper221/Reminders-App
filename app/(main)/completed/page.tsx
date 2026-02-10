"use client";

import { ReminderList } from "@/components/reminders/ReminderList";
import { CheckCircle } from "lucide-react";
import { PageTransition } from "@/components/ui/page-transition";

export default function CompletedPage() {
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
                </div>

                <ReminderList filter="completed" />
            </div>
        </PageTransition>
    );
}
