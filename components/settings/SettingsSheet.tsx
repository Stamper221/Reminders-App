"use client";

import { useSettingsModal } from "@/components/providers/SettingsModalProvider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/AuthProvider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Loader2, Settings, Phone, MessageSquare, Globe, Wrench, Music, Headphones, VolumeX, Volume2, Bell, Mail, Palette, Clock } from "lucide-react";
import { useSound } from "@/components/providers/SoundProvider";
import { PushNotificationManager } from "./PushNotificationManager";
import { ConnectedDevices } from "./ConnectedDevices";
import { ThemeSelector } from "./ThemeSelector";

const schema = z.object({
    phoneNumber: z.string().optional(),
    smsOptIn: z.boolean(),
    email: z.string().email().optional().or(z.literal("")),
    timezone: z.string(),
});

type FormData = z.infer<typeof schema>;

export function SettingsSheet() {
    const { open, setOpen } = useSettingsModal();
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const { volume, setVolume, muted, setMuted, isMusicPlaying, toggleMusic } = useSound();

    const { register, handleSubmit, setValue, watch } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            phoneNumber: "",
            smsOptIn: false,
            email: "",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
    });

    useEffect(() => {
        if (profile) {
            setValue("phoneNumber", profile.phoneNumber || "");
            setValue("smsOptIn", profile.smsOptIn || false);
            setValue("email", profile.email || user?.email || "");
            setValue("timezone", profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        }
    }, [profile, user, setValue]);

    const onSubmit = async (data: FormData) => {
        if (!user) return;
        setLoading(true);
        try {
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, {
                phoneNumber: data.phoneNumber,
                smsOptIn: data.smsOptIn,
                email: data.email,
                timezone: data.timezone,
                updatedAt: serverTimestamp(),
            });
            toast.success("Settings updated");
            setOpen(false);
        } catch (error) {
            console.error(error);
            toast.error("Failed to update settings");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent>
                <SheetHeader>
                    <div className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" />
                        <SheetTitle>Settings</SheetTitle>
                    </div>
                    <SheetDescription>
                        Manage your notification preferences and account.
                    </SheetDescription>
                </SheetHeader>

                <form id="settings-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-6 py-6">
                    {/* Notifications Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Notifications</span>
                        </div>

                        {/* Phone Number Card */}
                        <div className="rounded-xl border bg-card p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Phone className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <Label htmlFor="phoneNumber" className="text-sm font-medium">Phone Number</Label>
                                    <p className="text-[11px] text-muted-foreground">Include country code (e.g. +1)</p>
                                </div>
                            </div>
                            <Input id="phoneNumber" placeholder="+1234567890" {...register("phoneNumber")} />
                        </div>

                        {/* Email Card */}
                        <div className="rounded-xl border bg-card p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                                    <Globe className="h-4 w-4 text-indigo-500" />
                                </div>
                                <div>
                                    <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                                    <p className="text-[11px] text-muted-foreground">For email notifications</p>
                                </div>
                            </div>
                            <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
                        </div>

                        {/* SMS Opt-In Card */}
                        <div className="rounded-xl border bg-card p-4">
                            <label htmlFor="smsOptIn" className="flex items-center gap-3 cursor-pointer">
                                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                    <MessageSquare className="h-4 w-4 text-emerald-500" />
                                </div>
                                <div className="flex-1">
                                    <span className="text-sm font-medium block">SMS Notifications</span>
                                    <span className="text-[11px] text-muted-foreground">Receive text messages for reminders</span>
                                </div>
                                <input
                                    type="checkbox"
                                    id="smsOptIn"
                                    className="h-5 w-5 rounded border-2 border-input text-primary focus:ring-primary accent-[var(--primary)] cursor-pointer"
                                    {...register("smsOptIn")}
                                />
                            </label>
                        </div>
                        <PushNotificationManager />
                        <div className="border-t pt-4">
                            <ConnectedDevices />
                        </div>
                    </div>

                    {/* Audio & Focus Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Music className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Audio & Focus</span>
                        </div>

                        {/* Focus Music Card */}
                        <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0">
                                    <Headphones className="h-4 w-4 text-pink-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-medium block">Focus Music</span>
                                    <span className="text-[11px] text-muted-foreground">Ambient background drone</span>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant={isMusicPlaying ? "default" : "outline"}
                                size="sm"
                                onClick={toggleMusic}
                                className={isMusicPlaying ? "bg-pink-500 hover:bg-pink-600" : ""}
                            >
                                {isMusicPlaying ? "Playing" : "Play"}
                            </Button>
                        </div>

                        {/* Volume Control */}
                        <div className="rounded-xl border bg-card p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0">
                                        {muted ? <VolumeX className="h-4 w-4 text-slate-500" /> : <Volume2 className="h-4 w-4 text-slate-500" />}
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium block">App Sounds</span>
                                        <span className="text-[11px] text-muted-foreground">Volume: {Math.round(volume * 100)}%</span>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setMuted(!muted)}
                                >
                                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                                </Button>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={volume}
                                onChange={(e) => {
                                    setVolume(parseFloat(e.target.value));
                                    if (muted) setMuted(false);
                                }}
                                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>
                    </div>
                    {/* Appearance Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Palette className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Appearance</span>
                        </div>
                        <div className="rounded-xl border bg-card p-4 space-y-3">
                            <div>
                                <span className="text-sm font-medium block">Theme</span>
                                <span className="text-[11px] text-muted-foreground">Choose a color palette for the app</span>
                            </div>
                            <ThemeSelector />
                        </div>
                    </div>

                    {/* General Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Globe className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold uppercase tracking-wider">General</span>
                        </div>

                        <div className="rounded-xl border bg-card p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                    <Globe className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                    <Label htmlFor="timezone" className="text-sm font-medium">Timezone</Label>
                                    <p className="text-[11px] text-muted-foreground">Auto-detected from your browser</p>
                                </div>
                            </div>
                            <Input id="timezone" {...register("timezone")} readOnly disabled className="bg-muted" />
                        </div>
                    </div>
                </form>

                {/* Developer Tools — collapsible accordion */}
                <details className="group pt-4 border-t border-border/50">
                    <summary className="flex items-center gap-2 text-muted-foreground cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                        <Wrench className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Developer Tools</span>
                        <svg className="ml-auto h-4 w-4 transition-transform duration-200 group-open:rotate-180" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </summary>
                    <div className="space-y-4 pt-4">
                        {/* Test SMS */}
                        <div className="rounded-xl border bg-card p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                                    <MessageSquare className="h-4 w-4 text-amber-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-medium block">Test SMS</span>
                                    <span className="text-[11px] text-muted-foreground">Send a test message to your phone</span>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                className="w-full cursor-pointer h-9"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        if (!user) throw new Error("Not authenticated");
                                        const token = await user.getIdToken();
                                        toast.promise(
                                            fetch("/api/test-sms", {
                                                method: "POST",
                                                headers: {
                                                    "Content-Type": "application/json",
                                                    "Authorization": `Bearer ${token}`,
                                                },
                                            }).then(async (res) => {
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.error || "Failed to send");
                                                return data;
                                            }),
                                            {
                                                loading: 'Sending SMS...',
                                                success: 'SMS sent!',
                                                error: (err) => `Failed: ${err.message}`
                                            }
                                        );
                                    } catch (err: any) {
                                        toast.error(err.message);
                                    }
                                }}
                            >
                                Send SMS
                            </Button>
                        </div>

                        {/* Test Email */}
                        <div className="rounded-xl border bg-card p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                    <Mail className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-medium block">Test Email</span>
                                    <span className="text-[11px] text-muted-foreground">Send a test email to your inbox</span>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                className="w-full cursor-pointer h-9"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        if (!user) throw new Error("Not authenticated");
                                        const token = await user.getIdToken();
                                        toast.promise(
                                            fetch("/api/test-email", {
                                                method: "POST",
                                                headers: {
                                                    "Content-Type": "application/json",
                                                    "Authorization": `Bearer ${token}`,
                                                },
                                            }).then(async (res) => {
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.error || "Failed to send");
                                                return data;
                                            }),
                                            {
                                                loading: 'Sending Email...',
                                                success: 'Email sent!',
                                                error: (err) => `Failed: ${err.message}`
                                            }
                                        );
                                    } catch (err: any) {
                                        toast.error(err.message);
                                    }
                                }}
                            >
                                Send Email
                            </Button>
                        </div>

                        {/* Test Push */}
                        <div className="rounded-xl border bg-card p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                    <Bell className="h-4 w-4 text-purple-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-medium block">Test Push</span>
                                    <span className="text-[11px] text-muted-foreground">Trigger a local browser notification</span>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                className="w-full cursor-pointer h-9"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!('Notification' in window)) {
                                        toast.error('Browser does not support notifications');
                                        return;
                                    }

                                    if (Notification.permission === 'granted') {
                                        new Notification('Test Notification 🔔', {
                                            body: 'Your push notifications are working correctly!',
                                            icon: '/icon-192x192.png'
                                        });
                                        toast.success('Notification triggered');
                                    } else {
                                        const permission = await Notification.requestPermission();
                                        if (permission === 'granted') {
                                            new Notification('Test Notification 🔔', {
                                                body: 'Your push notifications are working correctly!',
                                                icon: '/icon-192x192.png'
                                            });
                                            toast.success('Notification triggered');
                                        } else {
                                            toast.error('Permission denied');
                                        }
                                    }
                                }}
                            >
                                Trigger Push
                            </Button>
                        </div>

                        {/* Simulate Routine Run */}
                        <div className="rounded-xl border bg-card p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                                    <Clock className="h-4 w-4 text-green-500" />
                                </div>
                                <div>
                                    <span className="text-sm font-medium block">Simulate Routine Run</span>
                                    <span className="text-[11px] text-muted-foreground">Generate routine reminders as if &quot;now&quot; = chosen time</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Input
                                    type="datetime-local"
                                    id="simulateTime"
                                    defaultValue={new Date().toISOString().slice(0, 16)}
                                    className="text-sm"
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="w-full cursor-pointer h-9"
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        try {
                                            if (!user) throw new Error("Not authenticated");
                                            const token = await user.getIdToken();
                                            const input = document.getElementById("simulateTime") as HTMLInputElement;
                                            const simulateTime = input?.value ? new Date(input.value).toISOString() : new Date().toISOString();
                                            toast.promise(
                                                fetch("/api/routines/simulate", {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type": "application/json",
                                                        "Authorization": `Bearer ${token}`,
                                                    },
                                                    body: JSON.stringify({ simulateTime }),
                                                }).then(async (res) => {
                                                    const data = await res.json();
                                                    if (!res.ok) throw new Error(data.error || "Failed");
                                                    return data;
                                                }),
                                                {
                                                    loading: 'Running routine generator...',
                                                    success: (data: any) => {
                                                        const g = data.generation;
                                                        return `Generated ${g.remindersCreated} reminders from ${g.routinesProcessed} routines. Queue: ${data.queueRebuilt} items.`;
                                                    },
                                                    error: (err: any) => `Failed: ${err.message}`
                                                }
                                            );
                                        } catch (err: any) {
                                            toast.error(err.message);
                                        }
                                    }}
                                >
                                    Run Simulation
                                </Button>
                            </div>
                        </div>
                    </div>
                </details>

                <SheetFooter className="mt-6">
                    <Button type="submit" form="settings-form" disabled={loading} className="w-full sm:w-auto">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
