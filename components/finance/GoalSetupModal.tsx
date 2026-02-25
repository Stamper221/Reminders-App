"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Target, Calendar as CalendarIcon, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface GoalSetupModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function GoalSetupModal({ open, onOpenChange, onSuccess }: GoalSetupModalProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    const [goalAmount, setGoalAmount] = useState("");
    const [targetDateStr, setTargetDateStr] = useState<Date | undefined>(undefined);
    const [startingBalance, setStartingBalance] = useState("0");
    const [strictness, setStrictness] = useState<'strict' | 'balanced' | 'flexible'>('balanced');

    const handleSave = async () => {
        if (!user) return;
        const gAmount = parseFloat(goalAmount);
        const sBal = parseFloat(startingBalance);

        if (isNaN(gAmount) || gAmount <= 0) {
            toast.error("Please enter a valid goal amount");
            return;
        }

        if (!targetDateStr) {
            toast.error("Please select a target date");
            return;
        }

        const tDate = targetDateStr;
        if (tDate <= new Date()) {
            toast.error("Target date must be in the future");
            return;
        }

        setLoading(true);
        try {
            // 1. Deactivate existing active goals
            const activeGoalsRef = collection(db, `users/${user.uid}/finance_goals`);
            const q = query(activeGoalsRef, where("status", "==", "active"));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const batch = writeBatch(db);
                snap.docs.forEach(d => {
                    batch.update(d.ref, { status: 'paused', updatedAt: serverTimestamp() });
                });
                await batch.commit();
            }

            // 2. Add the new goal
            await addDoc(activeGoalsRef, {
                uid: user.uid,
                goalAmount: gAmount,
                startingBalance: isNaN(sBal) ? 0 : sBal,
                targetDate: tDate,
                strictness,
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            toast.success("Goal set! Generating your first daily plan...");
            if (onSuccess) onSuccess();
            onOpenChange(false);

            // Rebuild the daily plan immediately
            const rebuildToast = toast.loading("Calculating your new daily allowance...");
            try {
                const cronSecret = process.env.NEXT_PUBLIC_DEV_CRON_SECRET || "";
                if (!cronSecret) console.warn("NEXT_PUBLIC_DEV_CRON_SECRET is missing. Rebuild API may fail with 401.");

                const response = await fetch('/api/finance/daily-plan/rebuild', {
                    method: 'POST',
                    headers: {
                        'internal-auth': cronSecret,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ uid: user.uid })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("Rebuild API failed:", errorText);
                    toast.error(`Goal saved, but allowance calculation failed (${response.status}). Try a manual sync.`, { id: rebuildToast });
                } else {
                    toast.success("Safe daily limit updated!", { id: rebuildToast });
                }
            } catch (rebuildErr) {
                console.error("Failed to trigger plan rebuild:", rebuildErr);
                toast.error("Failed to sync daily allowance.", { id: rebuildToast });
            }

        } catch (error) {
            console.error("Failed to save goal", error);
            toast.error("Failed to save goal");
        } finally {
            setLoading(false);
        }
    };


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Set a Savings Goal
                    </DialogTitle>
                    <DialogDescription>
                        Define what you're saving for, and we'll calculate your daily allowance to ensure you hit it.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Target Amount</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                                type="number"
                                placeholder="10000"
                                className="pl-7"
                                value={goalAmount}
                                onChange={e => setGoalAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Target Date</label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal border-input bg-background hover:bg-accent hover:text-accent-foreground",
                                        !targetDateStr && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {targetDateStr ? format(targetDateStr, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 border-border/50 shadow-xl" align="start">
                                <Calendar
                                    mode="single"
                                    selected={targetDateStr}
                                    onSelect={setTargetDateStr}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Starting Saving Balance</label>
                        <div className="relative">
                            <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="number"
                                placeholder="0"
                                className="pl-9"
                                value={startingBalance}
                                onChange={e => setStartingBalance(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Strictness Level</label>
                        <Select value={strictness} onValueChange={(v: any) => setStrictness(v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select level" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="flexible">Flexible (Allow occasional splurges)</SelectItem>
                                <SelectItem value="balanced">Balanced (Recommended)</SelectItem>
                                <SelectItem value="strict">Strict (Lock down spending)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? "Saving..." : "Lock in Goal"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
