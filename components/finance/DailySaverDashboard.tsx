"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { doc, getDoc, setDoc, query, collection, where, limit, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { FinanceDailyPlan, FinanceGoal } from "@/lib/financeTypes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingDown, TrendingUp, Trophy, Flame, Target, Plus, AlertCircle, RefreshCw, Wallet, Calendar as CalendarIcon, ArrowRight } from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalSetupModal } from "@/components/finance/GoalSetupModal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export function DailySaverDashboard() {
    const { user } = useAuth();
    const [plan, setPlan] = useState<FinanceDailyPlan | null>(null);
    const [goal, setGoal] = useState<FinanceGoal | null>(null);
    const [loading, setLoading] = useState(true);

    const [isAddingExpense, setIsAddingExpense] = useState(false);
    const [isGoalSetupOpen, setIsGoalSetupOpen] = useState(false);
    const [expenseAmount, setExpenseAmount] = useState("");

    // Predictor States
    const [predictionBalance, setPredictionBalance] = useState("1000");
    const [predictionDate, setPredictionDate] = useState<Date | undefined>(addDays(new Date(), 30));

    // UI states for Gamification
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        if (!user) return;

        // Combine Goal and Plan subscriptions
        let unsubGoal = () => { };
        let unsubPlan = () => { };

        const fetchInitial = async () => {
            // Goals
            const gQ = query(collection(db, `users/${user.uid}/finance_goals`), where("status", "==", "active"), limit(1));
            unsubGoal = onSnapshot(gQ, {
                next: (snap) => {
                    if (!snap.empty) setGoal({ id: snap.docs[0].id, ...snap.docs[0].data() } as FinanceGoal);
                    else setGoal(null);
                },
                error: (err) => {
                    console.error("Goal listener error:", err);
                    setGoal(null);
                }
            });

            // Today Plan
            const planRef = doc(db, `users/${user.uid}/finance_daily_plan/${todayStr}`);
            unsubPlan = onSnapshot(planRef, {
                next: (docSnap) => {
                    if (docSnap.exists()) {
                        setPlan({ id: docSnap.id, ...docSnap.data() } as FinanceDailyPlan);
                    } else {
                        setPlan(null);
                    }
                    setLoading(false);
                },
                error: (err) => {
                    console.error("Plan listener error:", err);
                    setPlan(null);
                    setLoading(false);
                }
            });
        };

        fetchInitial();

        return () => {
            unsubGoal();
            unsubPlan();
        };

    }, [user, todayStr]);


    const handleRebuildPlan = async () => {
        if (!user) return;
        const syncToast = toast.loading("Syncing with your goals...");
        try {
            const response = await fetch('/api/finance/daily-plan/rebuild', {
                method: 'POST',
                headers: {
                    'internal-auth': process.env.NEXT_PUBLIC_DEV_CRON_SECRET || "",
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uid: user.uid,
                    dateStr: todayStr
                })
            });

            if (!response.ok) {
                const err = await response.text();
                console.error("Sync Engine Failed:", err);
                toast.error("Sync failed. Check your goal settings.", { id: syncToast });
            } else {
                toast.success("Daily plan updated", { id: syncToast });
            }
        } catch (e) {
            console.error("Sync error:", e);
            toast.error("Failed to update plan", { id: syncToast });
        }
    };


    const submitExpense = async () => {
        if (!user || !plan) return;
        const val = parseFloat(expenseAmount);
        if (isNaN(val) || val <= 0) {
            toast.error("Enter a valid amount");
            return;
        }

        try {
            await updateDoc(doc(db, `users/${user.uid}/finance_daily_plan/${plan.id}`), {
                spentToday: plan.spentToday + val
            });
            setIsAddingExpense(false);
            setExpenseAmount("");
            toast.success("Expense logged!");
        } catch (e) {
            toast.error("Failed to log expense");
        }
    }


    if (loading) {
        return <Skeleton className="h-[400px] w-full rounded-2xl" />;
    }

    if (!goal) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border/50 rounded-3xl glass min-h-[400px]">
                <Target className="h-16 w-16 mb-4 text-primary opacity-80" />
                <h2 className="text-2xl font-bold mb-2">No Active Goal</h2>
                <p className="text-muted-foreground max-w-md mx-auto mb-8">
                    To get a daily personalized spending allowance, you need to set a savings goal.
                </p>
                <Button onClick={() => setIsGoalSetupOpen(true)} className="rounded-full shadow-lg">Setup Savings Goal</Button>
                <GoalSetupModal open={isGoalSetupOpen} onOpenChange={setIsGoalSetupOpen} />
            </div>
        );
    }

    if (goal && !plan) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-border/50 rounded-3xl glass min-h-[400px]">
                <RefreshCw className="h-8 w-8 mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Generating your first daily plan...</p>
                <Button variant="outline" className="mt-4" onClick={handleRebuildPlan}>Force Generate</Button>
            </div>
        );
    }


    const totalBudget = (plan!.allowedSpend + (plan!.carryOver || 0));
    const remaining = totalBudget - plan!.spentToday;

    // Improved progress calculation to handle zero budget (Safe Division)
    const progressPerc = totalBudget > 0
        ? Math.min(100, Math.max(0, (plan!.spentToday / totalBudget) * 100))
        : (plan!.spentToday > 0 ? 100 : 0);

    return (
        <div className="space-y-6">

            {/* Header & Gamification */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight mb-1">Today's Allowance</h2>
                    <p className="text-muted-foreground text-sm flex items-center gap-1">
                        <Flame className="h-4 w-4 text-orange-500" />
                        7 Day Spending Streak!
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleRebuildPlan}>
                    <RefreshCw className="h-3 w-3 mr-2" /> Sync Engine
                </Button>
            </div>

            {/* Main Ring/Allowance Indicator */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                <Card className="glass border-border/50 md:col-span-2 relative overflow-hidden bg-background/50">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                    <CardContent className="p-8 flex flex-col items-center justify-center min-h-[300px] text-center">
                        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Safe to Spend</p>
                        <h1 className={cn(
                            "text-6xl md:text-8xl font-black mb-2 tracking-tighter",
                            remaining < 0 ? "text-red-500" : "text-foreground"
                        )}>
                            ${Math.max(0, remaining).toFixed(2)}
                        </h1>

                        {remaining < 0 && (
                            <p className="text-red-500 font-medium flex items-center gap-1.5 mt-2">
                                <AlertCircle className="h-4 w-4" /> Over budget by ${Math.abs(remaining).toFixed(2)}
                            </p>
                        )}

                        <div className="w-full max-w-sm mt-8 space-y-2">
                            <div className="flex justify-between text-xs font-medium text-muted-foreground">
                                <span>$0</span>
                                <span>${(plan!.allowedSpend + plan!.carryOver).toFixed(0)} Budget</span>
                            </div>
                            <div className="h-3 w-full bg-border/50 rounded-full overflow-hidden">
                                <div
                                    className={cn("h-full transition-all duration-1000", remaining < 0 ? "bg-red-500" : "bg-primary")}
                                    style={{ width: `${progressPerc}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs font-medium">
                                <span>Spent: ${plan!.spentToday.toFixed(2)}</span>
                                {plan!.carryOver > 0 && <span className="text-green-500">+$ {plan!.carryOver.toFixed(0)} Carryover Budget</span>}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Side Actions & Goal Summary */}
                <div className="space-y-6">
                    <Card className="glass border-border/50 shadow-none">
                        <CardContent className="p-6">
                            <Button
                                className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all gradient-primary text-white"
                                onClick={() => setIsAddingExpense(true)}
                            >
                                <Plus className="h-5 w-5 mr-2 stroke-[3px]" /> Quick Log
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="glass border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Trophy className="h-4 w-4 text-yellow-500" />
                                    Plan Breakdown
                                </span>
                                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setIsGoalSetupOpen(true)}>Adjust</Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Est. Monthly Income</span>
                                <span>${(plan!.baselineIncome || 0).toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Est. Monthly Bills</span>
                                <span className="text-red-500">-${(plan!.predictedBills || 0).toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between text-sm border-t border-border/50 pt-2">
                                <span className="text-muted-foreground">Discretionary (Monthly)</span>
                                <span>${((plan!.baselineIncome || 0) - (plan!.predictedBills || 0)).toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-yellow-500 font-medium pb-2 border-b border-border/50">
                                <span>Target Savings Transfer</span>
                                <span>-${(plan!.reservedSavingsToday * 30).toFixed(0)}/mo</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold pt-1">
                                <span>Safe Daily Limit</span>
                                <span>${plan!.allowedSpend.toFixed(2)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-2 italic text-center mt-4">
                                Saving ${plan!.reservedSavingsToday.toFixed(0)} per day to hit ${String(goal.goalAmount)} by {format(goal.targetDate.toDate(), 'MMM yyyy')}.
                            </div>
                        </CardContent>
                    </Card>

                    {/* Predictor Card */}
                    <Card className="glass border-primary/20 bg-primary/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <ArrowRight className="h-4 w-4 text-primary" />
                                Future Predictor
                            </CardTitle>
                            <CardDescription className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                                Project your balance if you follow the plan
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Current Balance</label>
                                <div className="relative">
                                    <Wallet className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        value={predictionBalance}
                                        onChange={e => setPredictionBalance(e.target.value)}
                                        className="h-8 pl-8 text-sm bg-background/50"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Target Date</label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                "w-full h-8 justify-start text-left text-xs font-normal bg-background/50",
                                                !predictionDate && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                            {predictionDate ? format(predictionDate, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={predictionDate}
                                            onSelect={setPredictionDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="pt-2 border-t border-primary/10">
                                <div className="flex justify-between items-end">
                                    <span className="text-xs font-medium text-muted-foreground">Projected Balance</span>
                                    <span className="text-xl font-black text-primary">
                                        ${(() => {
                                            const days = predictionDate ? Math.max(0, Math.ceil((predictionDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24))) : 0;
                                            const current = parseFloat(predictionBalance) || 0;
                                            return (current + (days * (plan!.reservedSavingsToday || 0))).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                                        })()}
                                    </span>
                                </div>
                                <p className="text-[9px] text-muted-foreground mt-1 text-right">
                                    Based on ${plan!.reservedSavingsToday.toFixed(0)}/day savings goal
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Quick Log Modal */}
            <Dialog open={isAddingExpense} onOpenChange={setIsAddingExpense}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Log Manual Expense</DialogTitle>
                        <DialogDescription>
                            Deduct an amount from today's allowance.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            type="number"
                            placeholder="0.00"
                            className="text-4xl h-20 text-center font-bold"
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setIsAddingExpense(false)}>Cancel</Button>
                        <Button onClick={submitExpense}>Log Expense</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <GoalSetupModal open={isGoalSetupOpen} onOpenChange={setIsGoalSetupOpen} />

        </div>
    );
}
