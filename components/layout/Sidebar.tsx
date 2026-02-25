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
    Briefcase,
    PanelLeftClose,
    PanelLeftOpen,
    Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { auth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useSettingsModal } from "@/components/providers/SettingsModalProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { motion } from "framer-motion";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { openSettings } = useSettingsModal();
    const { user, logout } = useAuth();
    const { collapsed, toggle } = useSidebar();

    const handleLogout = async () => {
        try {
            await logout();
            toast.success("Logged out");
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
        { href: "/finance/analyze", label: "Finance", icon: Wallet },
    ];

    const userInitial = user?.email?.charAt(0).toUpperCase() || "U";

    return (
        <div
            className={cn(
                "pb-12 border-r hidden md:flex md:flex-col min-h-screen glass transition-all duration-300 ease-in-out overflow-hidden",
                collapsed ? "w-[68px]" : "w-64",
                className
            )}
        >
            {/* Header with toggle */}
            <div className={cn(
                "border-b border-border/50 flex items-center",
                collapsed ? "px-3 py-5 justify-center" : "px-6 py-5"
            )}>
                {!collapsed && (
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                            <Bell className="h-4 w-4 text-white" />
                        </div>
                        <h2 className="text-lg font-bold tracking-tight truncate">
                            Reminders
                        </h2>
                    </div>
                )}
                <button
                    onClick={toggle}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0 cursor-pointer"
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? (
                        <PanelLeftOpen className="h-4 w-4" />
                    ) : (
                        <PanelLeftClose className="h-4 w-4" />
                    )}
                </button>
            </div>

            {/* Navigation */}
            <div className="flex-1 px-2 py-4">
                {!collapsed && (
                    <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Views
                    </p>
                )}
                <nav className="space-y-1">
                    {links.map((link) => {
                        const isActive = pathname === link.href || (link.href === '/finance/analyze' && pathname.startsWith('/finance'));
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                title={collapsed ? link.label : undefined}
                                className={cn(
                                    "relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                                    collapsed
                                        ? "justify-center px-0 py-2.5 mx-auto w-10 h-10"
                                        : "gap-3 px-3 py-2.5",
                                    isActive
                                        ? "text-primary bg-accent"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                )}
                            >
                                <link.icon
                                    className={cn(
                                        "h-4 w-4 shrink-0",
                                        isActive ? "text-primary" : "text-[var(--icon-accent)]"
                                    )}
                                />
                                {!collapsed && link.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Bottom Section */}
            <div className="px-2 pb-4 space-y-1 border-t border-border/50 pt-4">
                {!collapsed && (
                    <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Account
                    </p>
                )}
                <button
                    onClick={openSettings}
                    title={collapsed ? "Settings" : undefined}
                    className={cn(
                        "flex items-center w-full rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200",
                        collapsed
                            ? "justify-center px-0 py-2.5 mx-auto w-10 h-10"
                            : "gap-3 px-3 py-2.5"
                    )}
                >
                    <Settings className="h-4 w-4 shrink-0 text-[var(--icon-accent)]" />
                    {!collapsed && "Settings"}
                </button>
                <button
                    onClick={handleLogout}
                    title={collapsed ? "Logout" : undefined}
                    className={cn(
                        "flex items-center w-full rounded-lg text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-200",
                        collapsed
                            ? "justify-center px-0 py-2.5 mx-auto w-10 h-10"
                            : "gap-3 px-3 py-2.5"
                    )}
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    {!collapsed && "Logout"}
                </button>

                {/* User + Theme */}
                <div className={cn(
                    "flex items-center pt-3 mt-2 border-t border-border/50 px-1",
                    collapsed ? "flex-col gap-2 justify-center" : "justify-between"
                )}>
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {userInitial}
                        </div>
                        {!collapsed && (
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {user?.email}
                            </span>
                        )}
                    </div>
                    <ThemeToggle />
                </div>
            </div>
        </div>
    );
}
