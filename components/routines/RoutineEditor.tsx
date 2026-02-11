
"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Routine, RoutineStep, NotificationSetting } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Clock, Pencil, Save, Loader2, Bell } from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { addRoutine, updateRoutine } from "@/lib/routines";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const stepSchema = z.object({
    id: z.string(),
    title: z.string().min(1, "Title required"),
    time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time"),
    notes: z.string().default(""),
    notifications: z.array(z.any()).default([]),
});

const routineSchema = z.object({
    title: z.string().min(1, "Title required"),
    type: z.enum(["daily", "weekly", "custom"]),
    days: z.array(z.number()).optional(),
    interval: z.number().min(1), // Removed default here to avoid type mismatch confusion, set in form defaults
    timezone: z.string(),
    steps: z.array(stepSchema).min(1, "At least one step required"),
});

type RoutineFormData = z.infer<typeof routineSchema>;

interface RoutineEditorProps {
    initialData?: Routine;
    mode: "create" | "edit";
}

const WEEKDAYS = [
    { label: "S", value: 0 },
    { label: "M", value: 1 },
    { label: "T", value: 2 },
    { label: "W", value: 3 },
    { label: "T", value: 4 },
    { label: "F", value: 5 },
    { label: "S", value: 6 },
];

export function RoutineEditor({ initialData, mode }: RoutineEditorProps) {
    const { user } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [stepDialogOpen, setStepDialogOpen] = useState(false);
    const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);

    // Step Form State (Local)
    const [stepForm, setStepForm] = useState<RoutineStep>({
        id: "",
        title: "",
        time: "08:00",
        notes: "",
        notifications: [{ id: uuidv4(), offsetMinutes: 0, type: 'push', sent: false }]
    });

    const { register, control, handleSubmit, setValue, watch, formState: { errors } } = useForm<RoutineFormData>({
        resolver: zodResolver(routineSchema) as any,
        defaultValues: {
            title: initialData?.title || "",
            type: initialData?.schedule.type || "daily",
            days: initialData?.schedule.days || [],
            interval: initialData?.schedule.interval || 1,
            timezone: initialData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            steps: initialData?.steps || [],
        },
    });

    const steps = watch("steps");
    const type = watch("type");
    const days = watch("days") || [];

    const handleStepSave = () => {
        if (!stepForm.title) return toast.error("Title required");

        const newStep: any = { ...stepForm, id: stepForm.id || uuidv4() };

        let newSteps: any[] = [...steps];
        if (editingStepIndex !== null) {
            newSteps[editingStepIndex] = newStep;
        } else {
            newSteps.push(newStep);
        }

        // Sort by time
        newSteps.sort((a, b) => a.time.localeCompare(b.time));

        setValue("steps", newSteps);
        setStepDialogOpen(false);
        setEditingStepIndex(null);
        setStepForm({
            id: "",
            title: "",
            time: "08:00",
            notes: "",
            notifications: [{ id: uuidv4(), offsetMinutes: 0, type: 'push', sent: false }]
        });
    };

    const editStep = (index: number) => {
        setStepForm(steps[index]);
        setEditingStepIndex(index);
        setStepDialogOpen(true);
    };

    const deleteStep = (index: number) => {
        const newSteps = [...steps];
        newSteps.splice(index, 1);
        setValue("steps", newSteps);
    };

    const toggleDay = (day: number) => {
        const current = days;
        if (current.includes(day)) {
            setValue("days", current.filter(d => d !== day));
        } else {
            setValue("days", [...current, day].sort());
        }
    };
    const onSubmit = async (data: RoutineFormData) => {
        if (!user) return;
        setLoading(true);
        try {
            const schedule: Record<string, any> = {
                type: data.type,
                interval: data.interval,
            };
            // Only include days if not daily (avoid undefined in Firestore)
            if (data.type !== 'daily' && data.days && data.days.length > 0) {
                schedule.days = data.days;
            }

            const payload: any = {
                uid: user.uid,
                title: data.title,
                active: true,
                timezone: data.timezone,
                steps: data.steps,
                schedule,
            };

            if (mode === 'edit' && initialData?.id) {
                await updateRoutine(user.uid, initialData.id, payload);
                toast.success("Routine updated");
            } else {
                await addRoutine(user.uid, payload);
                toast.success("Routine created");
            }
            router.push("/routines");
            router.refresh();
        } catch (error) {
            console.error(error);
            toast.error("Failed to save routine");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-8 pb-20">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Routine Name</Label>
                    <Input placeholder="e.g. Morning Routine" {...register("title")} className="text-lg font-medium" />
                    {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>Schedule</Label>
                    <div className="grid w-full grid-cols-3 p-1 bg-muted rounded-lg">
                        <button
                            type="button"
                            onClick={() => setValue("type", "daily")}
                            className={cn(
                                "py-1.5 text-sm font-medium rounded-md transition-all",
                                type === "daily" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/50"
                            )}
                        >
                            Daily
                        </button>
                        <button
                            type="button"
                            onClick={() => setValue("type", "weekly")}
                            className={cn(
                                "py-1.5 text-sm font-medium rounded-md transition-all",
                                type === "weekly" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/50"
                            )}
                        >
                            Weekly
                        </button>
                        <button
                            type="button"
                            onClick={() => setValue("type", "custom")}
                            className={cn(
                                "py-1.5 text-sm font-medium rounded-md transition-all",
                                type === "custom" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/50"
                            )}
                        >
                            Custom
                        </button>
                    </div>

                    {(type === 'weekly' || type === 'custom') && (
                        <div className="pt-2">
                            <Label className="text-xs text-muted-foreground mb-2 block">Repeat on</Label>
                            <div className="flex justify-between max-w-sm">
                                {WEEKDAYS.map((day) => (
                                    <div
                                        key={day.value}
                                        onClick={() => toggleDay(day.value)}
                                        className={cn(
                                            "w-9 h-9 rounded-full flex items-center justify-center text-sm cursor-pointer transition-all border",
                                            days.includes(day.value)
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-card hover:bg-muted border-input"
                                        )}
                                    >
                                        {day.label}
                                    </div>
                                ))}
                            </div>
                            {errors.days && <p className="text-destructive text-sm mt-1">Select at least one day</p>}
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label className="text-base">Steps ({steps.length})</Label>
                    <Dialog open={stepDialogOpen} onOpenChange={setStepDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => {
                                setEditingStepIndex(null);
                                setStepForm({ id: "", title: "", time: "08:00", notes: "", notifications: [] });
                            }}>
                                <Plus className="w-4 h-4 mr-2" />
                                Add Step
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingStepIndex !== null ? "Edit Step" : "Add Step"}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-3 space-y-2">
                                        <Label>Title</Label>
                                        <Input
                                            value={stepForm.title}
                                            onChange={(e) => setStepForm({ ...stepForm, title: e.target.value })}
                                            placeholder="Drink water"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Time</Label>
                                        <Input
                                            type="time"
                                            value={stepForm.time}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStepForm({ ...stepForm, time: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Notes (Optional)</Label>
                                    <Textarea
                                        value={stepForm.notes || ""}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStepForm({ ...stepForm, notes: e.target.value })}
                                        placeholder="Details..."
                                    />
                                </div>

                                {/* Alert / Notification Settings */}
                                <div className="space-y-3 border-t pt-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Bell className="h-3.5 w-3.5" />
                                            <Label className="text-xs font-semibold uppercase tracking-wider">Alerts</Label>
                                        </div>
                                        <select
                                            className="text-xs h-8 px-2 rounded-md border bg-background cursor-pointer"
                                            value=""
                                            onChange={(e) => {
                                                const offset = Number(e.target.value);
                                                if (stepForm.notifications.some(n => n.offsetMinutes === offset)) return;
                                                setStepForm({
                                                    ...stepForm,
                                                    notifications: [
                                                        ...stepForm.notifications,
                                                        { id: uuidv4(), offsetMinutes: offset, type: 'push', sent: false }
                                                    ]
                                                });
                                                e.target.value = "";
                                            }}
                                        >
                                            <option value="" disabled>Add Alert</option>
                                            <option value="0">At time</option>
                                            <option value="5">5 min before</option>
                                            <option value="15">15 min before</option>
                                            <option value="30">30 min before</option>
                                            <option value="60">1 hour before</option>
                                        </select>
                                    </div>

                                    {stepForm.notifications.length === 0 && (
                                        <p className="text-xs text-muted-foreground italic">No alerts set.</p>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        {stepForm.notifications.map((n, idx) => (
                                            <div
                                                key={n.id}
                                                className="flex items-center gap-1.5 bg-primary/10 text-primary pl-2.5 pr-1 py-1 rounded-full text-xs font-medium"
                                            >
                                                <Bell className="h-3 w-3 shrink-0" />
                                                <span className="whitespace-nowrap">
                                                    {n.offsetMinutes === 0 ? "At time" : `${n.offsetMinutes}m before`}
                                                </span>
                                                <span className="text-[10px] opacity-70">via</span>
                                                <select
                                                    value={n.type}
                                                    onChange={(e) => {
                                                        const updated = [...stepForm.notifications];
                                                        updated[idx] = { ...updated[idx], type: e.target.value as any };
                                                        setStepForm({ ...stepForm, notifications: updated });
                                                    }}
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
                                                    onClick={() => {
                                                        setStepForm({
                                                            ...stepForm,
                                                            notifications: stepForm.notifications.filter((_, i) => i !== idx)
                                                        });
                                                    }}
                                                >
                                                    <Trash2 className="h-2.5 w-2.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleStepSave}>Save Step</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="space-y-2">
                    <AnimatePresence>
                        {steps.map((step, index) => (
                            <motion.div
                                key={step.id || index}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:shadow-sm group cursor-pointer overflow-hidden"
                                onClick={() => editStep(index)}
                            >
                                <div className="font-mono text-sm font-medium bg-muted px-2 py-1 rounded shrink-0">
                                    {step.time}
                                </div>
                                <div className="flex-1 min-w-0 overflow-hidden">
                                    <div className="font-medium truncate">{step.title}</div>
                                    {step.notes && <div className="text-xs text-muted-foreground line-clamp-2 break-words">{step.notes}</div>}
                                    {step.notifications && step.notifications.length > 0 && (
                                        <div className="flex items-center gap-1 mt-1">
                                            <Bell className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <span className="text-[10px] text-muted-foreground">
                                                {step.notifications.length} alert{step.notifications.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); editStep(index); }}>
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); deleteStep(index); }}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {steps.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                            No steps yet. Add tasks to this routine.
                        </div>
                    )}
                </div>
                {errors.steps && <p className="text-destructive text-sm">{errors.steps.message}</p>}
            </div>

            <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur p-4 border-t -mx-4 sm:mx-0">
                <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Routine
                </Button>
            </div>
        </form>
    );
}
