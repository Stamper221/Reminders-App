"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useReminders } from "@/components/providers/ReminderProvider";
import { Reminder } from "@/lib/types";
import { useEffect, useState } from "react";
import { ReminderCard } from "./ReminderCard";
import { CalendarOff, Loader2 } from "lucide-react";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatePresence, motion } from "framer-motion";

interface ReminderListProps {
    filter: "today" | "upcoming" | "all" | "completed";
}

function ReminderListSkeleton() {
    return (
        <div className="space-y-3 max-w-2xl mx-auto">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl border bg-card">
                    <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/5" />
                        <Skeleton className="h-3 w-2/5" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function ReminderList({ filter }: ReminderListProps) {
    const { user } = useAuth();
    const { openEdit } = useReminderModal();
    const {
        todayReminders,
        upcomingReminders,
        allActiveReminders,
        completedReminders,
        loading,
        loadingCompleted,
        hasMoreCompleted,
        loadMoreCompleted,
    } = useReminders();

    // Load completed on first render of completed tab
    const [completedInitialized, setCompletedInitialized] = useState(false);
    useEffect(() => {
        if (filter === "completed" && !completedInitialized) {
            setCompletedInitialized(true);
            loadMoreCompleted();
        }
    }, [filter, completedInitialized, loadMoreCompleted]);

    // Select the right dataset based on filter — NO Firestore reads here!
    let reminders: Reminder[];
    let isLoading: boolean;

    if (filter === "completed") {
        reminders = completedReminders;
        isLoading = completedReminders.length === 0 && loadingCompleted;
    } else if (filter === "today") {
        reminders = todayReminders;
        isLoading = loading;
    } else if (filter === "upcoming") {
        reminders = upcomingReminders;
        isLoading = loading;
    } else {
        // "all" — show all active reminders
        reminders = allActiveReminders;
        isLoading = loading;
    }

    if (isLoading) {
        return <ReminderListSkeleton />;
    }

    if (reminders.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center py-16 text-muted-foreground"
            >
                <div className="flex justify-center mb-4">
                    <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                        <CalendarOff className="h-8 w-8 opacity-30" />
                    </div>
                </div>
                <p className="text-base font-medium">No reminders here</p>
                <p className="text-sm mt-1 opacity-70">
                    {filter === "completed"
                        ? "Completed reminders will show up here"
                        : "Tap + to create your first reminder"}
                </p>
            </motion.div>
        );
    }

    return (
        <div className="space-y-2.5 max-w-2xl mx-auto">
            <AnimatePresence mode="popLayout">
                {reminders.map((reminder, index) => (
                    <motion.div
                        key={reminder.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.25, delay: index * 0.03 }}
                        layout
                    >
                        <ReminderCard
                            reminder={reminder}
                            onEdit={openEdit}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Pagination for completed tab */}
            {filter === "completed" && hasMoreCompleted && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={loadMoreCompleted}
                        disabled={loadingCompleted}
                        className="text-sm text-primary hover:underline disabled:opacity-50 flex items-center gap-2"
                    >
                        {loadingCompleted ? (
                            <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading...
                            </>
                        ) : (
                            "Load more"
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
