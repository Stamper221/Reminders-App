"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    Calendar,
    LayoutDashboard,
    CheckCircle,
    Clock,
    LogOut,
    Settings,
    Bell,
    Briefcase // Routines
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useSettingsModal } from "@/components/providers/SettingsModalProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { motion } from "framer-motion";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { openSettings } = useSettingsModal();
    const { user } = useAuth();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            toast.success("Logged out");
            router.push("/login");
        } catch (error) {
            toast.error("Error logging out");
        }
    };

    const links = [
        { href: "/", label: "Today", icon: LayoutDashboard },
        { href: "/upcoming", label: "Upcoming", icon: Clock },
        { href: "/calendar", label: "Calendar", icon: Calendar },
        { href: "/completed", label: "Completed", icon: CheckCircle },
        { href: "/routines", label: "Routines", icon: Briefcase },
    ];

    // Get user initial for avatar
    const userInitial = user?.email?.charAt(0).toUpperCase() || "U";

    return (
        <div className={cn(
            "pb-12 w-64 border-r hidden md:flex md:flex-col min-h-screen glass",
            className
        )}>
            {/* App Title */}
            <div className="px-6 py-5 border-b border-border/50">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                        <Bell className="h-4 w-4 text-white" />
                    </div>
                    <h2 className="text-lg font-bold tracking-tight">
                        Reminders
                    </h2>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex-1 px-3 py-4">
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Views
                </p>
                <nav className="space-y-1">
                    {links.map((link) => {
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                    isActive
                                        ? "text-primary bg-accent"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                )}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className="absolute inset-0 rounded-lg bg-accent"
                                        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                                        style={{ zIndex: -1 }}
                                    />
                                )}
                                <link.icon className={cn(
                                    "h-4 w-4 shrink-0",
                                    isActive && "text-primary"
                                )} />
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Bottom Section */}
            <div className="px-3 pb-4 space-y-1 border-t border-border/50 pt-4">
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Account
                </p>
                <button
                    onClick={openSettings}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                >
                    <Settings className="h-4 w-4 shrink-0" />
                    Settings
                </button>
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-200"
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Logout
                </button>

                {/* User + Theme */}
                <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/50 px-1">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold">
                            {userInitial}
                        </div>
                        <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {user?.email}
                        </span>
                    </div>
                    <ThemeToggle />
                </div>
            </div>
        </div>
    );
}
