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
import { Loader2, Settings, Phone, MessageSquare, Globe, Wrench } from "lucide-react";

const schema = z.object({
    phoneNumber: z.string().optional(),
    smsOptIn: z.boolean(),
    timezone: z.string(),
});

type FormData = z.infer<typeof schema>;

export function SettingsSheet() {
    const { open, setOpen } = useSettingsModal();
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, setValue, watch } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            phoneNumber: "",
            smsOptIn: false,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
    });

    useEffect(() => {
        if (profile) {
            setValue("phoneNumber", profile.phoneNumber || "");
            setValue("smsOptIn", profile.smsOptIn || false);
            setValue("timezone", profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        }
    }, [profile, setValue]);

    const onSubmit = async (data: FormData) => {
        if (!user) return;
        setLoading(true);
        try {
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, {
                phoneNumber: data.phoneNumber,
                smsOptIn: data.smsOptIn,
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

                {/* Developer Tools Section */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Wrench className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Developer Tools</span>
                    </div>

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
                            className="w-full cursor-pointer"
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
                                            loading: 'Sending test message...',
                                            success: 'Test message sent!',
                                            error: (err) => `Failed: ${err.message}`
                                        }
                                    );
                                } catch (err: any) {
                                    console.error(err);
                                    toast.error("Failed: " + err.message);
                                }
                            }}
                        >
                            Send Test SMS Now
                        </Button>
                    </div>
                </div>

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
