"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { useAuth } from "@/components/providers/AuthProvider";
import { ReminderModalProvider } from "@/components/providers/ReminderModalProvider";
import { ReminderProvider } from "@/components/providers/ReminderProvider";
import { ReminderSheet } from "@/components/reminders/ReminderSheet";
import { SettingsModalProvider } from "@/components/providers/SettingsModalProvider";
import { SettingsSheet } from "@/components/settings/SettingsSheet";
import { InAppNotifier } from "@/components/notifications/InAppNotifier";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SidebarProvider } from "@/components/providers/SidebarProvider";
import { StarField } from "@/components/ui/StarField";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="flex min-h-screen">
                {/* Sidebar skeleton */}
                <div className="w-64 border-r hidden md:flex flex-col p-4 space-y-4">
                    <Skeleton className="h-10 w-36" />
                    <div className="space-y-2 mt-4">
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-9 w-full" />
                    </div>
                </div>
                {/* Main content skeleton */}
                <div className="flex-1 p-6 md:p-8 space-y-6">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-5 w-64" />
                    <div className="space-y-3 max-w-2xl">
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <SettingsModalProvider>
            <ThemeProvider>
                <SidebarProvider>
                    <ReminderModalProvider>
                        <ReminderProvider>
                            <StarField />
                            <div className="flex min-h-screen relative" style={{ zIndex: 1 }}>
                                <Sidebar />
                                <main className="flex-1 overflow-y-auto h-screen pb-24 md:pb-8">
                                    <div key={pathname} className="p-5 md:p-8 max-w-5xl mx-auto page-transition">
                                        {children}
                                    </div>
                                </main>
                                <MobileNav />
                                <ReminderSheet />
                                <SettingsSheet />
                                <InAppNotifier />
                            </div>
                        </ReminderProvider>
                    </ReminderModalProvider>
                </SidebarProvider>
            </ThemeProvider>
        </SettingsModalProvider>
    );
}
