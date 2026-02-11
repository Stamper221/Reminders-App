"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, X, Bell, Clock, FileText, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { addReminder, updateReminder } from "@/lib/reminders";
import { Select as NotifSelect, SelectContent as NotifSelectContent, SelectItem as NotifSelectItem, SelectTrigger as NotifSelectTrigger, SelectValue as NotifSelectValue } from "@/components/ui/select";
import { Reminder, NotificationSetting, NotificationType, RepeatRule } from "@/lib/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from "framer-motion";
import { RepeatRuleSelector } from "./RepeatRuleSelector";

const schema = z.object({
    title: z.string().min(1, "Title is required"),
    notes: z.string().optional(),
    date: z.date({ error: "Date is required" }),
    time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
});

type FormData = z.infer<typeof schema>;

interface ReminderFormProps {
    initialData?: Reminder | null;
    onSuccess: () => void;
}

const PRESET_OFFSETS = [
    { label: "At time of event", value: 0 },
    { label: "5 min before", value: 5 },
    { label: "15 min before", value: 15 },
    { label: "30 min before", value: 30 },
    { label: "1 hour before", value: 60 },
    { label: "3 hours before", value: 180 },
    { label: "1 day before", value: 1440 },
    { label: "2 days before", value: 2880 },
];

export function ReminderForm({ initialData, onSuccess }: ReminderFormProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [notifications, setNotifications] = useState<Omit<NotificationSetting, 'sent'>[]>([]);
    const [repeatRule, setRepeatRule] = useState<RepeatRule | undefined>(undefined);

    // Safely convert Firestore Timestamp (admin or client SDK) to Date
    const safeToDate = (ts: any): Date => {
        if (!ts) return new Date();
        if (ts instanceof Date) return ts;
        if (typeof ts.toDate === 'function') return ts.toDate();
        if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
        if (ts._seconds !== undefined) return new Date(ts._seconds * 1000);
        return new Date(ts);
    };

    const defaultDate = initialData ? safeToDate(initialData.due_at) : new Date();
    const defaultTime = initialData
        ? format(safeToDate(initialData.due_at), "HH:mm")
        : format(new Date(new Date().setHours(new Date().getHours() + 1, 0, 0, 0)), "HH:mm");

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            title: initialData?.title || "",
            notes: initialData?.notes || "",
            date: defaultDate,
            time: defaultTime,
        },
    });

    const date = watch("date");

    useEffect(() => {
        if (initialData) {
            setValue("title", initialData.title);
            setValue("notes", initialData.notes || "");
            const d = safeToDate(initialData.due_at);
            setValue("date", d);
            setValue("time", format(d, "HH:mm"));

            if (initialData.notifications) {
                setNotifications(initialData.notifications);
            }
            if (initialData.repeatRule) {
                setRepeatRule(initialData.repeatRule);
            }
        } else {
            setNotifications([
                { id: uuidv4(), offsetMinutes: 15, type: 'sms' }
            ]);
        }
    }, [initialData, setValue]);

    const addNotification = (offset: number) => {
        if (notifications.some(n => n.offsetMinutes === offset)) {
            toast.error("Notification for this time already exists");
            return;
        }
        setNotifications([...notifications, { id: uuidv4(), offsetMinutes: offset, type: 'sms' }]);
    };

    const removeNotification = (id: string) => {
        setNotifications(notifications.filter(n => n.id !== id));
    };

    const changeNotificationType = (id: string, type: NotificationType) => {
        setNotifications(notifications.map(n => n.id === id ? { ...n, type } : n));
    };

    const onSubmit = async (data: FormData) => {
        if (!user) return;
        setLoading(true);
        try {
            const [hours, minutes] = data.time.split(":").map(Number);
            const dueAt = new Date(data.date);
            dueAt.setHours(hours, minutes, 0, 0);

            const payload: Record<string, any> = {
                title: data.title,
                notes: data.notes || '',
                due_at: dueAt,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                notifications: notifications,
            };
            // Only include repeatRule if set (Firestore rejects undefined)
            if (repeatRule) {
                payload.repeatRule = repeatRule;
            }

            if (initialData && initialData.id) {
                const updatePayload: Record<string, any> = {
                    title: data.title,
                    notes: data.notes || '',
                    due_at: dueAt as any,
                    timezone: payload.timezone,
                    notifications: notifications as any,
                };
                if (repeatRule) {
                    updatePayload.repeatRule = repeatRule;
                }
                await updateReminder(user.uid, initialData.id, updatePayload);
                toast.success("Reminder updated");
            } else {
                const docRef = await addReminder(user.uid, payload as any);

                // Eagerly generate future occurrences for repeating reminders
                if (repeatRule && docRef.id) {
                    try {
                        const token = await user.getIdToken();
                        const res = await fetch("/api/reminders/generate-repeats", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ reminderId: docRef.id }),
                        });
                        const result = await res.json();
                        if (res.ok && result.generated > 0) {
                            toast.success(`Created reminder + ${result.generated} future occurrences`);
                        } else {
                            toast.success("Reminder created");
                        }
                    } catch (genErr) {
                        console.warn("Eager generation failed, cron will pick it up:", genErr);
                        toast.success("Reminder created");
                    }
                } else {
                    toast.success("Reminder created");
                }
            }
            onSuccess();
        } catch (error: any) {
            console.error(error);
            toast.error("Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
            {/* Title Section */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider">Title</Label>
                </div>
                <Input
                    id="title"
                    placeholder="What needs to be done?"
                    {...register("title")}
                    className="text-base font-medium h-11"
                />
                {errors.title && (
                    <motion.span
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-destructive text-xs"
                    >
                        {errors.title.message}
                    </motion.span>
                )}
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <FileText className="h-3.5 w-3.5" />
                    <Label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wider">Notes</Label>
                </div>
                <Input id="notes" placeholder="Add details..." {...register("notes")} />
            </div>

            {/* Date & Time */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Clock className="h-3.5 w-3.5" />
                    <Label className="text-xs font-semibold uppercase tracking-wider">When</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 flex flex-col">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full pl-3 text-left font-normal h-10",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    {date ? format(date, "EEE, MMM d") : <span>Pick a date</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => d && setValue("date", d)}
                                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        {errors.date && <span className="text-destructive text-xs">{errors.date.message}</span>}
                    </div>

                    <div className="space-y-1.5">
                        <Input id="time" type="time" {...register("time")} className="w-full h-10" />
                        {errors.time && <span className="text-destructive text-xs">{errors.time.message}</span>}
                    </div>
                </div>
            </div>

            {/* Repeat Rule */}
            <div className="space-y-2 border-t border-border/50 pt-2">
                <RepeatRuleSelector value={repeatRule} onChange={setRepeatRule} />
            </div>

            {/* Notifications */}
            <div className="space-y-3 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Bell className="h-3.5 w-3.5" />
                        <Label className="text-xs font-semibold uppercase tracking-wider">Alerts</Label>
                    </div>
                    <Select onValueChange={(v) => addNotification(Number(v))}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Add Alert" />
                        </SelectTrigger>
                        <SelectContent>
                            {PRESET_OFFSETS.map((preset) => (
                                <SelectItem key={preset.value} value={String(preset.value)}>
                                    {preset.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                        {notifications.length === 0 && (
                            <p className="text-xs text-muted-foreground italic py-1">No alerts set.</p>
                        )}
                        {notifications.map((n) => (
                            <motion.div
                                key={n.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                className="flex items-center gap-1.5 bg-primary/10 text-primary pl-2.5 pr-1 py-1 rounded-full text-xs font-medium"
                            >
                                <Bell className="h-3 w-3 shrink-0" />
                                <span className="whitespace-nowrap">{PRESET_OFFSETS.find(p => p.value === n.offsetMinutes)?.label || `${n.offsetMinutes}m before`}</span>
                                <span className="text-[10px] opacity-70">via</span>
                                <select
                                    value={n.type}
                                    onChange={(e) => changeNotificationType(n.id, e.target.value as NotificationType)}
                                    className="bg-transparent text-primary text-[10px] font-bold uppercase border-none outline-none cursor-pointer pr-0"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <option value="sms">SMS</option>
                                    <option value="email">Email</option>
                                    <option value="push">Push</option>
                                    <option value="both">All</option>
                                </select>
                                <button
                                    type="button"
                                    className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-primary/20 transition-colors shrink-0"
                                    onClick={() => removeNotification(n.id)}
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            {/* Actions */}
            <div className="pt-4 flex justify-end gap-2 border-t border-border/50">
                <Button onClick={(e) => { e.preventDefault(); onSuccess(); }} variant="outline" type="button">
                    Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {initialData ? "Save Changes" : "Create Reminder"}
                </Button>
            </div>
        </form>
    );
}
