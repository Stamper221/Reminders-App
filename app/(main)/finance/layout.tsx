"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function FinanceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    const tabs = [
        { name: "Statement Analysis", href: "/finance/analyze" },
        { name: "Daily Saver", href: "/finance/daily-saver" },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
                    <p className="text-muted-foreground mt-1">
                        Track your spending and reach your savings goals.
                    </p>
                </div>
            </div>

            <div className="border-b border-border/50">
                <nav className="-mb-px flex space-x-6 overflow-x-auto no-scrollbar" aria-label="Tabs">
                    {tabs.map((tab) => {
                        const isActive = pathname === tab.href;
                        return (
                            <Link
                                key={tab.name}
                                href={tab.href}
                                className={cn(
                                    "whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors relative",
                                    isActive
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                                )}
                            >
                                {tab.name}
                                {isActive && (
                                    <motion.div
                                        layoutId="finance-tab"
                                        className="absolute bottom-[-2px] left-0 right-0 h-[2px] bg-primary"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                )}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="pt-2">
                {children}
            </div>
        </div>
    );
}
