"use client";

import { Reminder } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Circle, Clock, Trash2, MessageSquare, Bell } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { toggleReminderStatus, deleteReminder } from "@/lib/reminders";
import { toast } from "sonner";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ReminderCardProps {
    reminder: Reminder;
    onEdit: (reminder: Reminder) => void;
}

export function ReminderCard({ reminder, onEdit }: ReminderCardProps) {
    const [loading, setLoading] = useState(false);
    const [justCompleted, setJustCompleted] = useState(false);

    const dueDate = reminder.due_at.toDate();
    const isOverdue = isPast(dueDate) && reminder.status === 'pending';
    const isDueToday = isToday(dueDate);

    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setLoading(true);
        if (reminder.status === 'pending') {
            setJustCompleted(true);
            setTimeout(() => setJustCompleted(false), 600);
        }
        try {
            await toggleReminderStatus(reminder.uid, reminder.id!, reminder.status);
        } catch (error) {
            toast.error("Failed to update status");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Delete this reminder?")) return;
        try {
            await deleteReminder(reminder.uid, reminder.id!);
            toast.success("Reminder deleted");
        } catch (error) {
            toast.error("Failed to delete reminder");
        }
    };

    const hasNotifications = reminder.notifications && reminder.notifications.length > 0;
    const hasSms = hasNotifications && reminder.notifications.some(n => n.type === 'sms' || n.type === 'both');
    const hasPush = hasNotifications && reminder.notifications.some(n => n.type === 'push' || n.type === 'both');

    return (
        <Card
            className={cn(
                "cursor-pointer group hover:card-shadow-hover transition-all duration-200 hover:-translate-y-0.5",
                reminder.status === 'done' && "opacity-60",
                isOverdue && "border-destructive/30 bg-destructive/[0.02]"
            )}
            onClick={() => onEdit(reminder)}
        >
            <CardContent className="p-4 flex items-center gap-3">
                {/* Status Toggle */}
                <button
                    className="shrink-0 rounded-full h-7 w-7 flex items-center justify-center transition-all duration-200 hover:bg-accent disabled:opacity-50"
                    onClick={handleToggle}
                    disabled={loading}
                    aria-label={reminder.status === 'done' ? 'Mark as pending' : 'Mark as done'}
                >
                    <AnimatePresence mode="wait">
                        {reminder.status === 'done' || justCompleted ? (
                            <motion.div
                                key="checked"
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}
                            >
                                <CheckCircle className="h-5 w-5 text-emerald-500" />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="unchecked"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                            >
                                <Circle className={cn(
                                    "h-5 w-5",
                                    isOverdue ? "text-destructive/60" : "text-muted-foreground/50"
                                )} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className={cn(
                        "font-medium truncate text-[15px]",
                        reminder.status === 'done' && "line-through text-muted-foreground"
                    )}>
                        {reminder.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {/* Time */}
                        <span className={cn(
                            "flex items-center gap-1 text-xs",
                            isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                        )}>
                            <Clock className="h-3 w-3" />
                            {format(dueDate, "MMM d, h:mm a")}
                        </span>

                        {/* Status pill */}
                        {isOverdue && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
                                Overdue
                            </span>
                        )}
                        {isDueToday && !isOverdue && reminder.status === 'pending' && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                Today
                            </span>
                        )}

                        {/* Notification badges */}
                        {hasSms && (
                            <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                <MessageSquare className="h-2.5 w-2.5" />
                                SMS
                            </span>
                        )}
                        {hasPush && (
                            <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                <Bell className="h-2.5 w-2.5" />
                                Push
                            </span>
                        )}

                        {/* Notes preview */}
                        {reminder.notes && (
                            <span className="truncate max-w-[120px] hidden sm:inline-block text-xs text-muted-foreground border-l border-border pl-2 ml-1">
                                {reminder.notes}
                            </span>
                        )}
                    </div>
                </div>

                {/* Delete - visible on hover */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleDelete}
                    aria-label="Delete reminder"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </CardContent>
        </Card>
    );
}
