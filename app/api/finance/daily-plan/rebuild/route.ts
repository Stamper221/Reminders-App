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

        // Fetch user goals - Use newest active goal
        const goalsSnap = await adminDb.collection(`users/${uid}/finance_goals`)
            .where("status", "==", "active")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
        if (goalsSnap.empty) {
            return NextResponse.json({ success: true, message: "No active goals" });
        }

        const goal = goalsSnap.docs[0].data();

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
        const targetDate = goal.targetDate.toDate();
        const createdAt = goal.createdAt?.toDate() || addDays(new Date(), -30); // Fallback to 30 days ago if new

        const totalGoalPeriodDays = Math.max(1, Math.ceil((targetDate.getTime() - createdAt.getTime()) / (1000 * 3600 * 24)));
        const amountToSaveTotal = Math.max(0, goal.goalAmount - goal.startingBalance);

        // Stabilized reserve: Constant amount per day based on total period
        const requiredSavingsToday = amountToSaveTotal / totalGoalPeriodDays;

        const finalDailyAllowance = Math.max(0, dailyBaselineAllowance - requiredSavingsToday);

        const todayStr = format(new Date(), 'yyyy-MM-dd');

        // Look at yesterday for carryover
        const yesterdayStr = format(addDays(new Date(), -1), 'yyyy-MM-dd');
        const yesterdaySnap = await adminDb.doc(`users/${uid}/finance_daily_plan/${yesterdayStr}`).get();

        let carryOver = 0;
        if (yesterdaySnap.exists) {
            const yData = yesterdaySnap.data()!;
            carryOver = yData.allowedSpend + yData.carryOver - yData.spentToday;
        }

        const planRef = adminDb.doc(`users/${uid}/finance_daily_plan/${todayStr}`);

        await planRef.set({
            uid,
            dateStr: todayStr,
            allowedSpend: finalDailyAllowance,
            carryOver,
            fixedBillsToday: 0, // Simplified; in a real app, query `finance_recurring` for dates matching today
            reservedSavingsToday: requiredSavingsToday,
            spentToday: 0,
            baselineIncome,
            predictedBills,
            dailyBaselineAllowance,
            updatedAt: new Date()
        }, { merge: true }); // merge to not overwrite spentToday if rebuilding mid-day

        return NextResponse.json({ success: true, date: todayStr, allowed: finalDailyAllowance, carryOver });

    } catch (error: any) {
        console.error("Daily Plan Engine Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
