"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle, AlertCircle, Share, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function PushNotificationManager() {
    const { user } = useAuth();
    const [permission, setPermission] = useState<NotificationPermission>("default");
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window) {
            const perm = Notification.permission;
            setPermission(perm);

            const ua = window.navigator.userAgent;
            const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
            setIsIOS(ios);

            const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
            setIsStandalone(!!standalone);

            // If already granted, ensure sure backend has the subscription
            if (perm === "granted") {
                syncSubscription();
            }
        }
    }, [user]);

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const syncSubscription = async () => {
        if (!user) return;
        try {
            // Wait for SW to be ready
            if (!('serviceWorker' in navigator)) return;
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                // We have a subscription, make sure backend knows it
                await saveSubscription(sub);
                console.log("Subscription synced");
            }
        } catch (e) {
            console.error("Sync failed", e);
        }
    };

    const subscribeToPush = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Request permission first
            const result = await Notification.requestPermission();
            setPermission(result);

            if (result === "granted") {
                const reg = await navigator.serviceWorker.ready;
                const existingSub = await reg.pushManager.getSubscription();

                if (existingSub) {
                    await saveSubscription(existingSub);
                    toast.success("Push notifications enabled!");
                    setLoading(false);
                    return;
                }

                const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                if (!publicKey) throw new Error("VAPID Public Key missing");

                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });

                await saveSubscription(sub);
                toast.success("Push notifications enabled!");
            } else {
                toast.error("Permission denied. Please enable in settings.");
            }
        } catch (error: any) {
            console.error("Subscription failed:", error);
            toast.error("Failed to enable push: " + error.message);
        }
        setLoading(false);
    };

    const saveSubscription = async (sub: PushSubscription) => {
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(sub)
        });
        if (!res.ok) throw new Error("Failed to save subscription to server");
    };

    const sendTestPush = async () => {
        if (!user) return;
        setTesting(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/push/test", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Test sent to ${data.sent} device(s)!`);
            } else {
                toast.error("Test failed: " + (data.error || data.message || "Unknown error"));
            }
        } catch (e: any) {
            toast.error("Error sending test: " + e.message);
        }
        setTesting(false);
    };

    if (!isStandalone && isIOS) {
        return (
            <div className="mt-4 p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 rounded-lg text-sm">
                <h4 className="font-semibold flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300">
                    <Smartphone className="w-4 h-4" />
                    Install to Enable Push
                </h4>
                <p className="mb-2 text-muted-foreground">
                    Due to iOS restrictions, you must add this app to your Home Screen to get notifications.
                </p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
                    <li>Tap the <Share className="inline w-3 h-3 mx-1" /> Share button below</li>
                    <li>Select <strong>Add to Home Screen</strong></li>
                    <li>Open the app from your Home Screen</li>
                </ol>
            </div>
        );
    }

    if (permission === "denied") {
        return (
            <div className="mt-4 p-4 border border-red-200 bg-red-50 dark:bg-red-950/30 rounded-lg text-sm flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div>
                    <p className="font-medium text-red-700 dark:text-red-400">Notifications Blocked</p>
                    <p className="text-muted-foreground">Please enable notifications in your browser settings.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-6 space-y-3 border-t pt-4">
            <h3 className="font-medium text-sm flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Push Notifications
            </h3>

            {permission === "granted" ? (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm bg-green-50 dark:bg-green-950/30 p-2 rounded border border-green-200 dark:border-green-900">
                        <CheckCircle className="w-4 h-4" />
                        <span>Active & Ready</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={sendTestPush}
                        disabled={testing}
                        className="w-full"
                    >
                        {testing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : "Test Push Now"}
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Enable notifications to get alerts even when the app is closed.
                    </p>
                    <Button
                        size="sm"
                        onClick={subscribeToPush}
                        disabled={loading}
                        className="w-full"
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : "Enable Push Notifications"}
                    </Button>
                </div>
            )}
        </div>
    );
}
