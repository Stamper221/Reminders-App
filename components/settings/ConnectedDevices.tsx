"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Smartphone, Laptop, Trash2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Device {
    id: string;
    userAgent: string;
    updatedAt: string;
}

export function ConnectedDevices() {
    const { user } = useAuth();
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(false);
    const [clearing, setClearing] = useState(false);

    const fetchDevices = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/push/devices", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setDevices(data.devices);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
    }, [user]);

    const clearAllDevices = async () => {
        if (!user || !confirm("Stop receiving notifications on ALL devices? You will need to reconnect each one manually.")) return;

        setClearing(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/push/devices", {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.ok) {
                toast.success("All devices removed");
                setDevices([]);
                // Optional: Unsubscribe locally if supported
            } else {
                toast.error("Failed to clear devices");
            }
        } catch (error) {
            toast.error("Error clearing devices");
        } finally {
            setClearing(false);
        }
    };

    const removeDevice = async (id: string) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/push/devices?id=${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Device removed");
                setDevices(devices.filter(d => d.id !== id));
            }
        } catch (error) {
            toast.error("Failed to remove device");
        }
    };

    const getIcon = (ua: string) => {
        if (ua.toLowerCase().includes("iphone") || ua.toLowerCase().includes("android") || ua.toLowerCase().includes("mobile")) {
            return <Smartphone className="h-4 w-4 text-primary" />;
        }
        return <Laptop className="h-4 w-4 text-primary" />;
    };

    const getDeviceName = (ua: string) => {
        if (ua.includes("iPhone")) return "iPhone";
        if (ua.includes("iPad")) return "iPad";
        if (ua.includes("Android")) return "Android Device";
        if (ua.includes("Macintosh")) return "Mac";
        if (ua.includes("Windows")) return "Windows PC";
        return "Browser";
    };

    return (
        <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-sm">
                <h3 className="font-medium flex items-center gap-2">
                    <Laptop className="h-4 w-4" />
                    Connected Devices
                </h3>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchDevices} disabled={loading}>
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {devices.length === 0 ? (
                <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg text-center">
                    No devices connected. Enable push notifications to see this device here.
                </div>
            ) : (
                <div className="space-y-2">
                    {devices.map(device => (
                        <div key={device.id} className="flex items-center justify-between p-2.5 bg-card border rounded-lg text-sm">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                                    {getIcon(device.userAgent)}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-medium truncate">{getDeviceName(device.userAgent)}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                        Last active {formatDistanceToNow(new Date(device.updatedAt))} ago
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => removeDevice(device.id)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}

                    <Button
                        variant="destructive"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={clearAllDevices}
                        disabled={clearing}
                    >
                        {clearing ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : "Disconnect All Devices"}
                    </Button>
                </div>
            )}
        </div>
    );
}
