"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    updateDoc,
    doc,
    addDoc,
    serverTimestamp,
    Timestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { FinanceTransaction } from "@/lib/financeTypes";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Calendar, Landmark, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ManualRecurringModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ManualRecurringModal({ open, onOpenChange }: ManualRecurringModalProps) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState("search");

    // Search Tab State
    const [searchQuery, setSearchQuery] = useState("");
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Virtual Tab State
    const [virtualLabel, setVirtualLabel] = useState("");
    const [virtualAmount, setVirtualAmount] = useState("");
    const [virtualCategory, setVirtualCategory] = useState("Housing");
    const [isAddingVirtual, setIsAddingVirtual] = useState(false);

    const handleSearch = async () => {
        if (!user || !searchQuery) return;
        setIsSearching(true);
        try {
            // Firestore doesn't support full-text search easily without indexing
            // We'll fetch the most recent 100 transactions and filter in memory for simplicity
            // In a larger app, we'd use Algolia or similar.
            const q = query(
                collection(db, `users/${user.uid}/finance_transactions`),
                orderBy("date", "desc"),
                limit(100)
            );
            const snap = await getDocs(q);
            const results = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as FinanceTransaction))
                .filter(tx =>
                    tx.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    tx.originalDescription.toLowerCase().includes(searchQuery.toLowerCase())
                );
            setTransactions(results);
        } catch (e) {
            console.error("Search failed:", e);
            toast.error("Failed to search transactions");
        } finally {
            setIsSearching(false);
        }
    };

    const toggleRecurring = async (tx: FinanceTransaction, state: boolean) => {
        if (!user) return;
        try {
            const txRef = doc(db, `users/${user.uid}/finance_transactions`, tx.id!);
            await updateDoc(txRef, { isManualRecurring: state });

            // Update local state
            setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, isManualRecurring: state } : t));

            toast.success(state ? "Marked as recurring bill" : "Removed from recurring");

            // Trigger recalculate in background
            (async () => {
                try {
                    const token = await user.getIdToken();
                    await fetch('/api/finance/recalculate', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                } catch (reErr) {
                    console.error("Background recalculate failed:", reErr);
                }
            })();
        } catch (e) {
            console.error("Toggle failed:", e);
            toast.error("Failed to update transaction");
        }
    };

    const handleAddVirtual = async () => {
        if (!user || !virtualLabel || !virtualAmount) return;
        setIsAddingVirtual(true);
        try {
            // Safer parsing: Remove any non-numeric characters except decimal/minus
            const cleanAmtStr = virtualAmount.replace(/[^0-9.-]/g, '');
            const amount = parseFloat(cleanAmtStr);

            if (isNaN(amount) || amount <= 0) {
                toast.error("Please enter a valid amount");
                setIsAddingVirtual(false);
                return;
            }

            await addDoc(collection(db, `users/${user.uid}/finance_manual_recurring`), {
                label: virtualLabel,
                amount,
                category: virtualCategory,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            toast.success("Manual bill added!");

            // Clear inputs and close
            setVirtualLabel("");
            setVirtualAmount("");
            onOpenChange(false);

            // Trigger recalculate in background
            (async () => {
                try {
                    const token = await user.getIdToken();
                    await fetch('/api/finance/recalculate', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                } catch (reErr) {
                    console.error("Background recalculate failed:", reErr);
                }
            })();

        } catch (e) {
            console.error("Add virtual failed:", e);
            toast.error("Database error. Check your connection.");
        } finally {
            setIsAddingVirtual(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden glass border-border/50">
                <div className="p-6 pb-0">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Landmark className="h-5 w-5 text-primary" />
                            Manage Recurring Bills
                        </DialogTitle>
                        <DialogDescription>
                            Manually classify transactions or add missing bills.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
                        <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1">
                            <TabsTrigger value="search" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <Search className="h-4 w-4 mr-2" />
                                Search History
                            </TabsTrigger>
                            <TabsTrigger value="virtual" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <Plus className="h-4 w-4 mr-2" />
                                Custom Bill
                            </TabsTrigger>
                        </TabsList>

                        <div className="py-6 min-h-[300px]">
                            <TabsContent value="search" className="mt-0 space-y-4 m-0">
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Search 'ATM', 'Rent', etc..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        className="h-10 bg-background/50 border-border/50"
                                    />
                                    <Button size="icon" onClick={handleSearch} disabled={isSearching} className="shrink-0">
                                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    </Button>
                                </div>

                                <ScrollArea className="h-[250px] w-full rounded-md border border-border/30 bg-muted/20 p-2">
                                    {transactions.length > 0 ? (
                                        <div className="space-y-2">
                                            {transactions.map(tx => (
                                                <div key={tx.id} className="flex justify-between items-center p-3 rounded-lg bg-background/60 border border-border/30 hover:bg-background/80 transition-colors">
                                                    <div className="flex flex-col overflow-hidden mr-2">
                                                        <span className="font-semibold text-sm truncate">{tx.merchant}</span>
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {format(tx.date.toDate(), 'MMM dd, yyyy')} • ${tx.amount.toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant={tx.isManualRecurring ? "secondary" : "outline"}
                                                        className={tx.isManualRecurring ? "bg-primary/10 text-primary border-primary/20" : "h-8 text-xs"}
                                                        onClick={() => toggleRecurring(tx, !tx.isManualRecurring)}
                                                    >
                                                        {tx.isManualRecurring ? (
                                                            <><Check className="h-3 w-3 mr-1" /> Recurring</>
                                                        ) : "Mark Recurring"}
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                            <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                            <p className="text-sm text-muted-foreground italic">
                                                {searchQuery ? "No matching transactions found." : "Search recent history to tag as recurring."}
                                            </p>
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="virtual" className="mt-0 space-y-4 m-0">
                                <div className="space-y-4 bg-muted/30 p-4 rounded-xl border border-border/30">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Bill Name</label>
                                        <Input
                                            placeholder="e.g. Monthly Rent"
                                            value={virtualLabel}
                                            onChange={e => setVirtualLabel(e.target.value)}
                                            className="h-10 bg-background/80 border-border/50"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Amount</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                                <Input
                                                    type="number"
                                                    placeholder="700.00"
                                                    value={virtualAmount}
                                                    onChange={e => setVirtualAmount(e.target.value)}
                                                    className="h-10 pl-7 bg-background/80 border-border/50"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Category</label>
                                            <Input
                                                value={virtualCategory}
                                                onChange={e => setVirtualCategory(e.target.value)}
                                                className="h-10 bg-background/80 border-border/50"
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        className="w-full h-12 mt-2 font-bold gradient-primary text-white shadow-lg shadow-primary/20"
                                        onClick={handleAddVirtual}
                                        disabled={isAddingVirtual || !virtualLabel || !virtualAmount}
                                    >
                                        {isAddingVirtual ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Plus className="h-5 w-5 mr-2" /> Add Recurring Bill</>}
                                    </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground text-center px-4 leading-relaxed">
                                    Virtual bills are used to reserve funds even if we haven't seen a transaction yet. Perfect for Rent or Cash payments.
                                </p>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
