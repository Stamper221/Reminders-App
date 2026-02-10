"use client";

import { ReminderList } from "@/components/reminders/ReminderList";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { Button } from "@/components/ui/button";
import { Plus, Sun, Moon, CloudSun } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageTransition } from "@/components/ui/page-transition";

function getGreeting(): { text: string; icon: React.ReactNode } {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "Good morning", icon: <Sun className="h-5 w-5 text-amber-500" /> };
    if (hour < 17) return { text: "Good afternoon", icon: <CloudSun className="h-5 w-5 text-orange-400" /> };
    return { text: "Good evening", icon: <Moon className="h-5 w-5 text-indigo-400" /> };
}

export default function DashboardPage() {
    const { openNew } = useReminderModal();
    const { user } = useAuth();
    const greeting = getGreeting();

    return (
        <PageTransition>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {greeting.icon}
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                {greeting.text}
                            </h1>
                        </div>
                        <p className="text-muted-foreground">
                            {format(new Date(), "EEEE, MMMM do")}
                        </p>
                    </div>
                    <Button onClick={openNew} className="hidden md:inline-flex">
                        <Plus className="mr-2 h-4 w-4" />
                        New Reminder
                    </Button>
                </div>

                <ReminderList filter="today" />
            </div>
        </PageTransition>
    );
}
