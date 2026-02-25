"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, startAfter } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { FinanceTransaction } from "@/lib/financeTypes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Edit2, Check, RefreshCcw, RefreshCcwDot, RefreshCwOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { where } from "firebase/firestore";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const PAGE_SIZE = 15;

export function TransactionsPreview() {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const urlCategory = searchParams.get('category') || "all";

    const [page, setPage] = useState(0);
    const [lastDocs, setLastDocs] = useState<any[]>([]); // To handle pagination forward/back
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editCategory, setEditCategory] = useState("");
    const [filterCategory, setFilterCategory] = useState<string>(urlCategory);
    const [filterDirection, setFilterDirection] = useState<string>("all");
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [totalPagesLocal, setTotalPagesLocal] = useState<number>(1);

    useEffect(() => {
        if (!user) return;
        fetchPage(0);
        // Also fetch a quick list of unique categories
    }, [user, filterCategory, filterDirection]);

    // Listen for URL changes triggered externally (e.g. from the Insights Pie Chart)
    useEffect(() => {
        if (urlCategory !== filterCategory) {
            setFilterCategory(urlCategory);
            setPage(0);
            setLastDocs([]);
        }
    }, [urlCategory]);

    const handleCategoryChange = (val: string) => {
        setFilterCategory(val);
        setPage(0);
        setLastDocs([]);

        const params = new URLSearchParams(searchParams.toString());
        if (val === "all") {
            params.delete('category');
        } else {
            params.set('category', val);
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const fetchPage = (pageIndex: number) => {
        if (!user) return;
        setLoading(true);

        const constraints: any[] = [];
        let isLocalSlice = false;

        // If filtering, we use a single WHERE clause to avoid needing a Composite Index
        // and we will handle the sorting & secondary filtering in memory (JavaScript)
        if (filterCategory !== "all") {
            constraints.push(where("category", "==", filterCategory));
            isLocalSlice = true;
        } else if (filterDirection !== "all") {
            constraints.push(where("direction", "==", filterDirection));
            isLocalSlice = true;
        } else {
            // Standard Paginated Fetch
            constraints.push(orderBy("date", "desc"));
            constraints.push(limit(PAGE_SIZE));
            if (pageIndex > 0 && lastDocs[pageIndex - 1]) {
                constraints.push(startAfter(lastDocs[pageIndex - 1]));
            }
        }

        const q = query(collection(db, `users/${user.uid}/finance_transactions`), ...constraints);

        const unsub = onSnapshot(q, {
            next: (snapshot) => {
                let txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinanceTransaction));

                // Extract any new categories we see to populate the dropdown
                const cats = new Set(availableCategories);
                txs.forEach(t => cats.add(t.category));
                setAvailableCategories(Array.from(cats).sort());

                if (isLocalSlice) {
                    // 1. Secondary JS filtering (if both Category and Direction are selected)
                    if (filterCategory !== "all" && filterDirection !== "all") {
                        txs = txs.filter(t => t.direction === filterDirection);
                    }

                    // 2. Sort chronologically in JS since we bypassed Firestore's orderBy
                    txs.sort((a, b) => b.date.toMillis() - a.date.toMillis());

                    // 3. Manual localized Pagination
                    const totalP = Math.ceil(txs.length / PAGE_SIZE) || 1;
                    setTotalPagesLocal(totalP);

                    const startIdx = pageIndex * PAGE_SIZE;
                    txs = txs.slice(startIdx, startIdx + PAGE_SIZE);
                    setTransactions(txs);
                } else {
                    setTransactions(txs);
                    // Store last doc for native next page
                    if (snapshot.docs.length > 0) {
                        setLastDocs(prev => {
                            const next = [...prev];
                            next[pageIndex] = snapshot.docs[snapshot.docs.length - 1];
                            return next;
                        });
                    }
                }

                setLoading(false);
            },
            error: (err) => {
                console.error("Transactions listener error:", err);
                setTransactions([]);
                setLoading(false);
            }
        });

        return unsub;
    };

    const handleNextPage = () => {
        const isLocalSlice = filterCategory !== "all" || filterDirection !== "all";
        if (!isLocalSlice && transactions.length < PAGE_SIZE) return;
        if (isLocalSlice && page >= totalPagesLocal - 1) return;

        setPage(p => p + 1);
        fetchPage(page + 1);
    };

    const handlePrevPage = () => {
        if (page === 0) return;
        setPage(p => p - 1);
        fetchPage(page - 1);
    };

    const resetFilters = () => {
        setFilterDirection("all");
        handleCategoryChange("all");
    };

    const handleEditStart = (tx: FinanceTransaction) => {
        setEditingId(tx.id!);
        setEditCategory(tx.category);
    };

    const handleEditSave = async (id: string) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, `users/${user.uid}/finance_transactions`, id), {
                category: editCategory
            });
            // Background: We would likely need to trigger /api/finance/rebuild-insights here to reflect category change
            setEditingId(null);
        } catch (error) {
            console.error("Failed to update category", error);
        }
    };

    const handleToggleRecurring = async (tx: FinanceTransaction) => {
        if (!user) return;
        try {
            // Cycle: null (auto) -> true (force) -> false (ignore) -> null
            let nextState: boolean | null = null;
            if (tx.isManualRecurring === undefined || tx.isManualRecurring === null) {
                nextState = true;
            } else if (tx.isManualRecurring === true) {
                nextState = false;
            } else {
                nextState = null;
            }

            await updateDoc(doc(db, `users/${user.uid}/finance_transactions`, tx.id!), {
                isManualRecurring: nextState
            });
            // Trigger background recalculation externally
        } catch (error) {
            console.error("Failed to toggle recurring status", error);
        }
    };

    // We don't want to hide the whole component if it's loading or empty, 
    // because that hides the filters too. We just show loading/empty states INSIDE the card.

    return (
        <Card className="glass border-border/50">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-lg">Recent Transactions</CardTitle>
                    <CardDescription>Review and correct AI categorization</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={filterDirection} onValueChange={(v) => { setFilterDirection(v); setPage(0); setLastDocs([]); }}>
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="income">Income</SelectItem>
                            <SelectItem value="expense">Expenses</SelectItem>
                            <SelectItem value="other_deposit">Other Deposits</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={filterCategory} onValueChange={handleCategoryChange}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {availableCategories.map(cat => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-card/50">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Date</th>
                                <th className="px-4 py-3">Merchant</th>
                                <th className="px-4 py-3">Category</th>
                                <th className="px-4 py-3 text-center">Settings</th>
                                <th className="px-4 py-3 text-right rounded-tr-lg">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                        <Skeleton className="h-8 w-full max-w-[300px] mx-auto mb-2" />
                                        <Skeleton className="h-8 w-full max-w-[250px] mx-auto" />
                                    </td>
                                </tr>
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm italic">
                                        No transactions found matching the current filters.
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((tx) => (
                                    <tr key={tx.id} className="border-b border-border/10 hover:bg-card/40 transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                                            {format(tx.date.toDate(), 'MMM d, yyyy')}
                                        </td>
                                        <td className="px-4 py-3 font-medium">
                                            {tx.merchant}
                                        </td>
                                        <td className="px-4 py-3">
                                            {editingId === tx.id ? (
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        value={editCategory}
                                                        onChange={e => setEditCategory(e.target.value)}
                                                        className="h-7 text-xs w-[120px]"
                                                        autoFocus
                                                    />
                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500" onClick={() => handleEditSave(tx.id!)}>
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleEditStart(tx)}>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                                                        {tx.category}
                                                    </span>
                                                    <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={`h-7 px-2 text-[10px] uppercase tracking-wider font-semibold 
                                                    ${tx.isManualRecurring === true ? 'bg-primary/10 text-primary border border-primary/20'
                                                        : tx.isManualRecurring === false ? 'bg-destructive/10 text-destructive border border-destructive/20'
                                                            : 'bg-muted/50 text-muted-foreground'}`
                                                }
                                                onClick={() => handleToggleRecurring(tx)}
                                            >
                                                {tx.isManualRecurring === true ? (
                                                    <><RefreshCcw className="h-3 w-3 mr-1" /> Force Add</>
                                                ) : tx.isManualRecurring === false ? (
                                                    <><RefreshCwOff className="h-3 w-3 mr-1" /> Ignore</>
                                                ) : (
                                                    <><RefreshCcwDot className="h-3 w-3 mr-1" /> Auto AI</>
                                                )}
                                            </Button>
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <span className={tx.direction === 'income' ? 'text-green-500 font-medium' : tx.direction === 'other_deposit' ? 'text-blue-500/80 font-medium' : ''}>
                                                {tx.direction === 'income' || tx.direction === 'other_deposit' ? '+' : '-'}${tx.amount.toFixed(2)}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-6 px-2">
                    <p className="text-xs text-muted-foreground">Page {page + 1} {filterCategory !== 'all' || filterDirection !== 'all' ? `of ${totalPagesLocal}` : ''}</p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={page === 0}>
                            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleNextPage} disabled={(filterCategory !== 'all' || filterDirection !== 'all') ? page >= totalPagesLocal - 1 : transactions.length < PAGE_SIZE}>
                            Next <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card >
    );
}
