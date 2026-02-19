"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    Calendar,
    LayoutDashboard,
    CheckCircle,
    Clock,
    Plus,
    Settings,
    Briefcase
} from "lucide-react";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { useSettingsModal } from "@/components/providers/SettingsModalProvider";
import { motion } from "framer-motion";

export function MobileNav() {
    const pathname = usePathname();
    const { openNew } = useReminderModal();
    const { openSettings } = useSettingsModal();

    const links = [
        { href: "/", label: "Today", icon: LayoutDashboard },
        { href: "/upcoming", label: "Upcoming", icon: Clock },
        { href: "/routines", label: "Routines", icon: Briefcase },
        { href: "/completed", label: "Done", icon: CheckCircle },
        { href: "#settings", label: "Settings", icon: Settings, onClick: openSettings },
    ];

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
            {/* FAB - Moved to bottom right to avoid blocking nav items */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={openNew}
                className="fixed bottom-20 right-5 h-14 w-14 rounded-full gradient-primary text-white shadow-lg flex items-center justify-center cursor-pointer z-50 md:hidden"
                aria-label="New Reminder"
            >
                <Plus className="h-6 w-6" />
            </motion.button>

            {/* Nav Bar */}
            <div className="glass border-t border-border/50 safe-area-bottom">
                <div className="flex justify-around items-center h-16 px-1">
                    {links.map((link) => {
                        const isActive = pathname === link.href;
                        const Icon = link.icon;

                        if (link.onClick) {
                            return (
                                <button
                                    key={link.label}
                                    onClick={link.onClick}
                                    className={cn(
                                        "relative flex flex-col items-center justify-center w-full h-full gap-0.5 text-[10px] font-medium transition-colors duration-200",
                                        "text-[var(--icon-accent)]"
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span>{link.label}</span>
                                </button>
                            );
                        }

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "relative flex flex-col items-center justify-center w-full h-full gap-0.5 text-[10px] font-medium transition-colors duration-200",
                                    isActive
                                        ? "text-primary"
                                        : "text-[var(--icon-accent)]"
                                )}
                            >
                                <Icon className="h-5 w-5" />
                                <span>{link.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
