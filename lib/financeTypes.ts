import { Timestamp } from "firebase/firestore";

export type TransactionDirection = 'income' | 'expense' | 'other_deposit';

export interface FinanceStatement {
    id?: string;
    uid: string;
    filename: string;
    fileType: 'pdf' | 'csv';
    uploadedAt: Timestamp;
    rangeStart?: Timestamp;
    rangeEnd?: Timestamp;
    parseStatus: 'pending' | 'parsing' | 'analyzing' | 'completed' | 'failed';
    errorMessage?: string;
    rowCount: number;
    fingerprint: string; // hash of file contents to prevent duplicate upload
}

export interface FinanceTransaction {
    id?: string;
    uid: string;
    statementId: string;
    date: Timestamp;
    merchant: string;
    originalDescription: string;
    amount: number;
    direction: TransactionDirection;
    category: string;
    dedupeKey: string; // deterministic key: date_amount_merchant
    isManual?: boolean;
    isManualRecurring?: boolean | null; // null=AI decides, true=Force Add, false=Force Remove
}

export interface FinanceRecurring {
    id?: string;
    uid: string;
    merchant: string;
    amountPattern: number | { min: number, max: number, avg: number };
    direction: TransactionDirection;
    cadence: 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'unknown';
    lastSeen: Timestamp;
    nextExpected?: Timestamp;
    confidence: number; // 0 to 1
    category: string;
    isActive: boolean;
}

export interface FinanceInsights {
    id?: string; // Typically 'summary' or month slug '2024-03'
    uid: string;
    monthKey?: string; // YYYY-MM
    incomeTotal: number;
    expenseTotal: number;
    categoryBreakdown: Record<string, number>;
    opportunities: string[]; // AI suggestions
    predictedBillsTotal: number;
    recurringBills: { merchant: string; label: string; amount: number; confidence?: string }[];
    frequentSpending: { merchant: string; label: string; amount: number; confidence?: string }[];
    lastUpdated: Timestamp;
}

export type StrictnessLevel = 'strict' | 'balanced' | 'flexible';

export interface FinanceGoal {
    id?: string;
    uid: string;
    goalAmount: number;
    targetDate: Timestamp;
    startingBalance: number;
    strictness: StrictnessLevel;
    status: 'active' | 'paused' | 'completed';
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface FinanceDailyPlan {
    id?: string; // Format: YYYY-MM-DD
    uid: string;
    dateStr: string; // YYYY-MM-DD
    allowedSpend: number; // Discretionary allowance for the day
    carryOver: number; // +/- amount from previous day
    fixedBillsToday: number; // Sum of expected recurring bills today
    reservedSavingsToday: number; // Amount needed to save today to hit goal
    spentToday: number; // Tracks manual entries + identified txs for this date
    // Context mapping for UI explanation:
    baselineIncome?: number;
    predictedBills?: number;
    dailyBaselineAllowance?: number;
    updatedAt: Timestamp;
}
