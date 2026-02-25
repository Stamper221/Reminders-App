"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { FinanceInsights } from "@/lib/financeTypes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, Legend } from "recharts";
import { Lightbulb, TrendingUp, TrendingDown, RefreshCcw, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useMemo } from "react";

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'];

export function InsightsDashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const [insights, setInsights] = useState<FinanceInsights | null>(null);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [isUpdatingOverrides, setIsUpdatingOverrides] = useState(false);
    const [loading, setLoading] = useState(true);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const groupedSpending = useMemo(() => {
        if (!insights?.frequentSpending) return [];
        const groups: Record<string, { category: string, total: number, items: any[] }> = {};

        insights.frequentSpending.forEach(item => {
            const cat = item.confidence || "Frequent Spend";
            if (!groups[cat]) groups[cat] = { category: cat, total: 0, items: [] };
            groups[cat].total += item.amount;
            groups[cat].items.push(item);
        });

        return Object.values(groups).sort((a, b) => b.total - a.total);
    }, [insights?.frequentSpending]);

    useEffect(() => {
        if (!user) return;

        const docRef = doc(db, `users/${user.uid}/finance_insights/summary`);

        const unsub = onSnapshot(docRef, {
            next: (snapshot) => {
                if (snapshot.exists()) {
                    setInsights({ id: snapshot.id, ...snapshot.data() } as FinanceInsights);
                } else {
                    setInsights(null);
                }
                setLoading(false);
            },
            error: (err) => {
                console.error("Insights listener error:", err);
                setInsights(null);
                setLoading(false);
            }
        });

        return () => unsub();
    }, [user]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Skeleton className="h-[200px] rounded-2xl md:col-span-2" />
                <Skeleton className="h-[200px] rounded-2xl" />
            </div>
        );
    }

    if (!insights) {
        return null; // Don't show anything if no insights exist yet (e.g. no uploads)
    }

    const categoryData = Object.entries(insights.categoryBreakdown)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6); // top 6

    const netIncome = insights.incomeTotal - insights.expenseTotal;

    const handleRecalculate = async () => {
        if (!user) return;
        setIsRecalculating(true);
        try {
            const token = await user.getIdToken();
            await fetch('/api/finance/recalculate', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } finally {
            setIsRecalculating(false);
        }
    };

    const handleToggleOverride = async (merchant: string, currentList: 'recurring' | 'frequent', action: 'force' | 'ignore') => {
        if (!user || isUpdatingOverrides) return;
        setIsUpdatingOverrides(true);
        try {
            // Find all transactions matching this merchant
            const q = query(collection(db, `users/${user.uid}/finance_transactions`), where('merchant', '==', merchant));
            const snap = await getDocs(q);

            const newValue = action === 'force' ? true : false;

            // Batch update all of them
            const promises = snap.docs.map(d => updateDoc(d.ref, { isManualRecurring: newValue }));
            await Promise.all(promises);

            // Trigger global recalculate silently
            await fetch('/api/finance/recalculate', { method: 'POST', headers: { 'Authorization': `Bearer ${await user.getIdToken()}` } });

            // Note: onSnapshot handles the UI refresh automatically, no need to manually fetchGlobalInsights
        } catch (e) {
            console.error("Failed to apply manual override:", e);
        } finally {
            setIsUpdatingOverrides(false);
        }
    };

    const handleCategoryClick = (data: any) => {
        if (data && data.name) {
            const params = new URLSearchParams();
            params.set('category', data.name);
            router.push(`${pathname}?${params.toString()}`, { scroll: false });

            // Smooth scroll down slightly to force the table into view
            window.scrollBy({ top: 300, behavior: 'smooth' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-xl font-bold">AI Insights & Patterns</h3>
                <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={isRecalculating}>
                    {isRecalculating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                    Sync Data
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Summary Cards */}
                <div className="space-y-6 lg:col-span-1">
                    <Card className="glass border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Cashflow</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-2xl font-bold block mb-1">
                                        ${Math.abs(netIncome).toFixed(2)}
                                        <span className="text-sm font-normal text-muted-foreground ml-2">
                                            {netIncome >= 0 ? 'Net Positive' : 'Net Negative'}
                                        </span>
                                    </div>
                                    <div className="flex gap-4 text-xs font-medium">
                                        <span className="text-green-500 flex items-center"><TrendingUp className="h-3 w-3 mr-1" /> ${insights.incomeTotal.toFixed(0)} In</span>
                                        <span className="text-red-500 flex items-center"><TrendingDown className="h-3 w-3 mr-1" /> ${insights.expenseTotal.toFixed(0)} Out</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass border-border/50 bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                                <Lightbulb className="h-4 w-4" />
                                Opportunities
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-3 text-sm">
                                {insights.opportunities.length > 0 ? insights.opportunities.map((opp, i) => (
                                    <li key={i} className="flex gap-2">
                                        <span className="text-primary mt-0.5">•</span>
                                        <span className="text-foreground/80 leading-snug">{opp}</span>
                                    </li>
                                )) : (
                                    <p className="text-muted-foreground text-xs italic">Upload more data to generate customized savings opportunities.</p>
                                )}
                            </ul>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts & Lists */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 gap-6 h-full">
                        {/* 1. Category Pie Chart */}
                        <Card className="glass border-border/50 flex flex-col h-full">
                            <CardHeader className="shrink-0">
                                <CardTitle className="text-base">Top Categories</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 min-h-[350px] pb-4 flex flex-col items-center justify-center overflow-hidden">
                                {categoryData.length > 0 ? (
                                    <div className="w-full h-full flex justify-center items-center">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={categoryData}
                                                    cx="50%"
                                                    cy="45%"
                                                    innerRadius={75}
                                                    outerRadius={105}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                    onClick={handleCategoryClick}
                                                    className="cursor-pointer hover:opacity-80 transition-opacity outline-none"
                                                >
                                                    {categoryData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip
                                                    formatter={(value: number | undefined) => `$${(value || 0).toFixed(2)}`}
                                                    contentStyle={{ borderRadius: '8px', border: 'none', background: 'var(--card)', boxShadow: 'var(--shadow-lg)', zIndex: 50 }}
                                                    itemStyle={{ color: 'var(--foreground)' }}
                                                />
                                                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '13px', paddingTop: '20px' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No category data</div>
                                )}
                            </CardContent>
                        </Card>



                    </div>
                </div>
            </div>

            {/* Full-width Recurring Management */}
            <Card className="glass border-border/50">
                <CardHeader>
                    <CardTitle className="text-base">Recurring Bills Management</CardTitle>
                    <CardDescription>Review and manage your true recurring bills versus frequent spending</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left Side: True Recurring */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-border/50 pb-3">
                                <div className="flex items-center gap-2 text-lg font-bold text-foreground">
                                    <RefreshCcw className="h-5 w-5 text-primary" />
                                    True Recurring
                                </div>
                                <span className="text-primary font-bold text-xl">${insights.predictedBillsTotal.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">/ mo</span></span>
                            </div>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                {insights.recurringBills?.map((bill, i) => (
                                    <div key={i} className="flex justify-between items-center bg-card/40 p-3 rounded-lg border border-border/30 hover:bg-card/60 transition-colors">
                                        <div className="flex flex-col overflow-hidden mr-3 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-base truncate text-foreground">{bill.label || bill.merchant}</span>
                                                {bill.confidence === "Manual Add" && (
                                                    <span className="text-[10px] text-primary/70 border border-primary/20 bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Forced</span>
                                                )}
                                            </div>
                                            {bill.confidence && bill.confidence !== "Manual Add" && (
                                                <span className="mt-1 text-[10px] bg-emerald-500/10 text-emerald-500 w-fit px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-widest truncate">
                                                    {bill.confidence}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <span className="text-foreground font-bold whitespace-nowrap text-right text-base">${bill.amount.toFixed(2)}</span>
                                            <button
                                                onClick={() => handleToggleOverride(bill.merchant, 'recurring', 'ignore')}
                                                disabled={isUpdatingOverrides}
                                                className="text-xs font-semibold px-3 py-1 bg-destructive/10 text-destructive rounded hover:bg-destructive/20 transition-colors disabled:opacity-50"
                                            >
                                                Remove from Bills
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {(!insights.recurringBills || insights.recurringBills.length === 0) && (
                                    <div className="text-center text-sm text-muted-foreground italic py-8 bg-card/20 rounded-lg">No recurring bills identified.</div>
                                )}
                            </div>
                        </div>

                        {/* Right Side: Frequent Spending */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-border/50 pb-3">
                                <div className="text-lg font-bold text-muted-foreground">
                                    Frequent Spending
                                </div>
                                <span className="text-sm text-muted-foreground">Excluded Candidates</span>
                            </div>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                {groupedSpending.map((group, i) => (
                                    <div key={i} className="flex flex-col bg-card/20 rounded-lg border border-border/30 border-dashed overflow-hidden">
                                        {/* Category Header */}
                                        <div
                                            onClick={() => toggleCategory(group.category)}
                                            className="flex justify-between items-center p-3 cursor-pointer hover:bg-card/40 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 overflow-hidden flex-1">
                                                {expandedCategories.has(group.category) ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                                <span className="font-medium text-base text-foreground/80 truncate uppercase tracking-wider text-[11px]">{group.category}</span>
                                            </div>
                                            <span className="text-foreground font-bold whitespace-nowrap text-right opacity-80 text-base ml-2">~${group.total.toFixed(0)}<span className="text-[10px] font-normal text-muted-foreground ml-1">/mo</span></span>
                                        </div>

                                        {/* Dropdown Content */}
                                        {expandedCategories.has(group.category) && (
                                            <div className="bg-background/40 border-t border-border/20 px-3 py-2 space-y-3 animate-in slide-in-from-top-1 duration-200">
                                                {group.items.map((spend, j) => (
                                                    <div key={j} className="flex justify-between items-center py-1 border-b border-border/10 last:border-0">
                                                        <div className="flex flex-col overflow-hidden min-w-0 flex-1 mr-4">
                                                            <span className="text-[13px] font-medium text-foreground truncate">{spend.label || spend.merchant}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <span className="text-[13px] text-muted-foreground">${spend.amount.toFixed(0)}</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleOverride(spend.merchant, 'frequent', 'force');
                                                                }}
                                                                disabled={isUpdatingOverrides}
                                                                className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50 uppercase"
                                                            >
                                                                Add to Bills
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {(!insights.frequentSpending || insights.frequentSpending.length === 0) && (
                                    <div className="text-center text-sm text-muted-foreground italic py-8 bg-card/20 rounded-lg">No erratic spending found.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Full-width Category Comparison Bar Chart */}
            <Card className="glass border-border/50">
                <CardHeader>
                    <CardTitle className="text-base">Category Flow Comparison</CardTitle>
                    <CardDescription>Visual breakdown of expenses across all categories</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    {categoryData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                <RechartsTooltip
                                    formatter={(value: number | undefined) => `$${(value || 0).toFixed(2)}`}
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', background: 'var(--card)', boxShadow: 'var(--shadow-lg)' }}
                                    itemStyle={{ color: 'var(--foreground)' }}
                                />
                                <Bar
                                    dataKey="value"
                                    radius={[4, 4, 0, 0]}
                                    onClick={handleCategoryClick}
                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No category data</div>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}
