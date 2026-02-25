import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { format, addDays } from "date-fns";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("internal-auth");
        const cronSecret = process.env.CRON_SECRET || process.env.NEXT_PUBLIC_DEV_CRON_SECRET;

        if (authHeader !== cronSecret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const uid = body.uid;
        if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

        // Small delay for write consistency if called immediately after adding a goal
        await new Promise(resolve => setTimeout(resolve, 800));

        const todayStr = body.dateStr || format(new Date(), 'yyyy-MM-dd');
        const goalId = body.goalId;

        let goal: any = null;

        if (goalId) {
            const goalDoc = await adminDb.doc(`users/${uid}/finance_goals/${goalId}`).get();
            if (goalDoc.exists) {
                goal = { id: goalDoc.id, ...goalDoc.data() };
            }
        }

        if (!goal) {
            // Fallback to fetch newest active goal
            // We fetch all active goals and sort in memory to avoid requiring a composite index in deployment
            const goalsSnap = await adminDb.collection(`users/${uid}/finance_goals`)
                .where("status", "==", "active")
                .get();

            if (goalsSnap.empty) {
                return NextResponse.json({ success: true, message: "No active goals" });
            }

            // Sort by createdAt descending in memory
            const sortedGoals = goalsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a: any, b: any) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds * 1000 || 0);
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds * 1000 || 0);
                    return timeB - timeA;
                });
            goal = sortedGoals[0];
        }

        // Robust timestamp handling
        const toDate = (ts: any) => {
            if (!ts) return null;
            if (typeof ts.toDate === 'function') return ts.toDate();
            if (ts._seconds) return new Date(ts._seconds * 1000);
            if (ts instanceof Date) return ts;
            return new Date(ts);
        };

        const targetDate = toDate(goal.targetDate) || addDays(new Date(), 30);
        const createdAt = toDate(goal.createdAt) || addDays(new Date(), -30);

        // Fetch AI aggregated insights for monthly income/expenses Baseline
        const summarySnap = await adminDb.doc(`users/${uid}/finance_insights/summary`).get();
        let baselineIncome = 5000; // Mock default if no data
        let predictedBills = 2000; // Mock default

        if (summarySnap.exists) {
            const sumData = summarySnap.data()!;
            baselineIncome = sumData.incomeTotal || 0;
            predictedBills = sumData.predictedBillsTotal || 0;
        }

        // Calculate naive daily allowance
        // Total monthly discretionary = Income - Bills
        const monthlyDiscretionary = Math.max(0, baselineIncome - predictedBills);
        const dailyBaselineAllowance = monthlyDiscretionary / 30;

        // Apply Savings Goal logic
        const totalGoalPeriodDays = Math.max(1, Math.ceil((targetDate.getTime() - createdAt.getTime()) / (1000 * 3600 * 24)));
        const amountToSaveTotal = Math.max(0, goal.goalAmount - goal.startingBalance);

        // Stabilized reserve: Constant amount per day based on total period
        const requiredSavingsToday = amountToSaveTotal / totalGoalPeriodDays;

        const finalDailyAllowance = Math.max(0, dailyBaselineAllowance - requiredSavingsToday);

        console.log(`[Rebuild] UID: ${uid}, Date: ${todayStr}, Allowance: ${finalDailyAllowance}, Goal: ${goal.goalAmount}`);

        // Carryover logic disabled per user request
        const carryOver = 0;

        // Calculate today's spent amount from manual transactions
        let spentTodayDetected = 0;
        try {
            const startOfDay = new Date(todayStr);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(todayStr);
            endOfDay.setHours(23, 59, 59, 999);

            const transactionsSnap = await adminDb.collection(`users/${uid}/finance_transactions`)
                .where("uid", "==", uid)
                .where("date", ">=", startOfDay)
                .where("date", "<=", endOfDay)
                .get();

            transactionsSnap.docs.forEach(d => {
                const tx = d.data();
                if (tx.direction === 'expense') {
                    spentTodayDetected += (tx.amount || 0);
                }
            });
        } catch (te) {
            console.error("Failed to sum manual transactions for rebuild:", te);
        }

        const planRef = adminDb.doc(`users/${uid}/finance_daily_plan/${todayStr}`);

        await planRef.set({
            uid,
            dateStr: todayStr,
            allowedSpend: finalDailyAllowance,
            carryOver,
            fixedBillsToday: 0,
            reservedSavingsToday: requiredSavingsToday,
            spentToday: spentTodayDetected, // Use correctly calculated value
            baselineIncome,
            predictedBills,
            dailyBaselineAllowance,
            updatedAt: new Date()
        }, { merge: true });

        return NextResponse.json({ success: true, date: todayStr, allowed: finalDailyAllowance, carryOver });

    } catch (error: any) {
        console.error("Daily Plan Engine Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
