
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { getRoutines, deleteRoutine, updateRoutine } from "@/lib/routines";
import { Routine } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Calendar, Clock, Trash2, Power, Briefcase } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/ui/page-transition";

// Module-level cache — persists across remounts (tab switches)
let routinesCache: Routine[] | null = null;

export default function RoutinesPage() {
    const { user } = useAuth();
    const [routines, setRoutines] = useState<Routine[]>(routinesCache || []);
    const [loading, setLoading] = useState(routinesCache === null);

    useEffect(() => {
        if (user) loadRoutines();
    }, [user]);

    const loadRoutines = async () => {
        if (!user) return;
        try {
            const data = await getRoutines(user.uid);
            routinesCache = data;
            setRoutines(data);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load routines");
        } finally {
            setLoading(false);
        }
    };

    const toggleActive = async (routine: Routine) => {
        if (!user || !routine.id) return;
        try {
            await updateRoutine(user.uid, routine.id, { active: !routine.active });
            setRoutines(routines.map(r => r.id === routine.id ? { ...r, active: !r.active } : r));

            if (routine.active) {
                // Disabling: remove generated reminders + queue items (AWAIT this!)
                try {
                    const token = await user.getIdToken();
                    const res = await fetch("/api/queue/sync", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            action: "removeRoutine",
                            routineId: routine.id,
                            deleteFutureReminders: true,
                        }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        toast.success(`Routine disabled — ${data.deletedReminders || 0} reminders removed`);
                    } else {
                        const err = await res.json().catch(() => ({}));
                        console.error("Disable cascade error:", err);
                        toast.error("Routine disabled but cleanup failed");
                    }
                } catch (e) {
                    console.error("Disable cascade network error:", e);
                    toast.error("Routine disabled but cleanup failed");
                }
            } else {
                // Enabling: immediately generate catch-up reminders for next 24h
                toast.success("Routine enabled");
                try {
                    const token = await user.getIdToken();
                    const res = await fetch(`/api/routines/${routine.id}/run`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.count > 0) {
                            toast.success(`${data.count} reminders created for today`);
                        }
                    }
                } catch (e) {
                    // Non-critical: daily check will catch up
                    console.warn("Catch-up generation failed:", e);
                }
            }
        } catch (e) {
            toast.error("Failed to update routine");
        }
    };

    const handleDelete = async (routine: Routine) => {
        if (!user || !routine.id) return;
        if (!confirm("Delete this routine? Future generated reminders and scheduled notifications will also be removed.")) return;
        try {
            await deleteRoutine(user.uid, routine.id);
            setRoutines(routines.filter(r => r.id !== routine.id));
            toast.success("Routine deleted");
        } catch (e) {
            toast.error("Failed to delete routine");
        }
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    return (
        <PageTransition>
            <div className="container max-w-4xl py-6 space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Routines</h1>
                        <p className="text-muted-foreground mt-1">Automate your habits and recurring tasks.</p>
                    </div>
                    <Link href="/routines/create">
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" />
                            New Routine
                        </Button>
                    </Link>
                </div>

                {routines.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/20">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Briefcase className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No routines yet</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                            Create a routine to automatically generate reminders for your daily or weekly habits.
                        </p>
                        <Link href="/routines/create">
                            <Button variant="outline">Create your first routine</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {routines.map((routine) => (
                            <div
                                key={routine.id}
                                className={cn(
                                    "group relative overflow-hidden rounded-xl border bg-card p-5 transition-shadow hover:shadow-lg",
                                    !routine.active && "opacity-75 grayscale-[0.5]"
                                )}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <Link href={`/routines/${routine.id}`} className="block flex-1 mr-4">
                                        <h3 className="font-semibold text-lg hover:underline underline-offset-4 decoration-primary/50">
                                            {routine.title}
                                        </h3>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            <span>
                                                {routine.schedule.type === 'daily' ? 'Daily' :
                                                    routine.schedule.type === 'weekly' ? 'Weekly' : 'Custom'}
                                            </span>
                                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary">
                                                {routine.steps.length} steps
                                            </span>
                                        </div>
                                    </Link>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className={cn("h-8 w-8", routine.active ? "text-green-500" : "text-muted-foreground")}
                                        onClick={() => toggleActive(routine)}
                                        title={routine.active ? "Disable Routine" : "Enable Routine"}
                                    >
                                        <Power className="w-4 h-4" />
                                    </Button>
                                </div>

                                <div className="space-y-2 mb-4">
                                    {routine.steps.slice(0, 3).map((step) => (
                                        <div key={step.id} className="flex items-center gap-2 text-sm">
                                            <Clock className="w-3.5 h-3.5 text-primary/70" />
                                            <span className="font-mono text-xs text-muted-foreground">{step.time}</span>
                                            <span className="truncate">{step.title}</span>
                                        </div>
                                    ))}
                                    {routine.steps.length > 3 && (
                                        <p className="text-xs text-muted-foreground pl-6">
                                            + {routine.steps.length - 3} more
                                        </p>
                                    )}
                                </div>

                                <div className="pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                                    <span>
                                        {routine.active ? "Active — auto-generates daily" : "Disabled"}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDelete(routine)}
                                        title="Delete Routine"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PageTransition>
    );
}
