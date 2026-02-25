import { adminDb } from "@/lib/firebase/admin";
import { FinanceTransaction } from "./financeTypes";
import OpenAI from "openai";

export async function recalculateAllInsights(uid: string) {
    const txSnapshot = await adminDb.collection(`users/${uid}/finance_transactions`).get();
    const allDocs = txSnapshot.docs;

    if (allDocs.length === 0) return;

    // --- PHASE 1: DEDUPLICATION & MIGRATION SWEEP ---
    const seenTx = new Map<string, { id: string, docData: FinanceTransaction }>();
    const deleteBatch = adminDb.batch();
    let deletionsPending = false;
    let deleteCount = 0;

    const validTransactions: FinanceTransaction[] = [];

    for (const doc of allDocs) {
        const tx = doc.data() as FinanceTransaction;

        // Generate deterministic key for legacy transactions
        const amt = tx.amount || 0;
        const safeMerchant = (tx.merchant || tx.originalDescription || 'Unknown').toString();
        const tObj = tx.date && typeof tx.date.toDate === 'function' ? tx.date.toDate() : new Date(tx.date as any);
        const strictDateStr = tObj.toISOString().split('T')[0];
        const safeMerchantStr = safeMerchant.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().substring(0, 30);
        const dedupeKey = `${strictDateStr}_${amt.toFixed(2).replace('.', '')}_${safeMerchantStr}`;

        if (seenTx.has(dedupeKey)) {
            // Duplicate found. Keep the one that has a more custom/recent category if possible.
            // For now, we just keep the FIRST one we saw and delete the current one.
            const existing = seenTx.get(dedupeKey)!;

            // Prefer manually edited categories
            if (tx.isManual || (tx.category !== 'Uncategorized' && existing.docData.category === 'Uncategorized')) {
                // Swap them: delete the old one, keep the new one
                deleteBatch.delete(adminDb.doc(`users/${uid}/finance_transactions/${existing.id}`));
                seenTx.set(dedupeKey, { id: doc.id, docData: tx });
                deletionsPending = true;
                deleteCount++;
            } else {
                // Delete this duplicate
                deleteBatch.delete(adminDb.doc(`users/${uid}/finance_transactions/${doc.id}`));
                deletionsPending = true;
                deleteCount++;
            }
        } else {
            seenTx.set(dedupeKey, { id: doc.id, docData: tx });
        }
    }

    if (deletionsPending && deleteCount < 500) { // Firestore batch limit is 500 operations
        try {
            await deleteBatch.commit();
            console.log(`[Dedupe] Cleaned up ${deleteCount} duplicate transactions.`);
        } catch (e) {
            console.error("Failed to commit dedupe cleanup:", e);
        }
    }

    // Only proceed with the UNIQUE transactions
    const transactions = Array.from(seenTx.values()).map(v => v.docData);

    // --- PHASE 2: AGGREGATION ---
    const monthsData: Record<string, { incomeTotal: number, expenseTotal: number, categoryBreakdown: Record<string, number>, merchantFreq: Record<string, { count: number, total: number, dates: number[] }> }> = {};

    let totalExpense = 0;
    const globalCatBreakdown: Record<string, number> = {};
    const globalMerchantFreq: Record<string, { count: number, total: number, dates: number[] }> = {};
    const globalIncomeFreq: Record<string, { count: number, total: number, dates: number[] }> = {};

    // 1. Group transactions into discrete Calendar Months (YYYY-MM)
    for (const tx of transactions) {
        const dateObj = tx.date && typeof tx.date.toDate === 'function' ? tx.date.toDate() : new Date(tx.date as any);
        const t = dateObj.getTime();
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

        if (!monthsData[monthKey]) {
            monthsData[monthKey] = { incomeTotal: 0, expenseTotal: 0, categoryBreakdown: {}, merchantFreq: {} };
        }

        const amt = tx.amount;
        if (tx.direction === 'income') {
            const m = tx.merchant || 'Unknown Income';
            if (!globalIncomeFreq[m]) globalIncomeFreq[m] = { count: 0, total: 0, dates: [] };
            globalIncomeFreq[m].count++;
            globalIncomeFreq[m].total += amt;
            globalIncomeFreq[m].dates.push(t);
        } else if (tx.direction === 'expense') {
            monthsData[monthKey].expenseTotal += amt;
            totalExpense += amt;

            const cat = tx.category || 'Uncategorized';
            monthsData[monthKey].categoryBreakdown[cat] = (monthsData[monthKey].categoryBreakdown[cat] || 0) + amt;
            globalCatBreakdown[cat] = (globalCatBreakdown[cat] || 0) + amt;

            const m = tx.merchant;
            if (!globalMerchantFreq[m]) globalMerchantFreq[m] = { count: 0, total: 0, dates: [] };
            globalMerchantFreq[m].count++;
            globalMerchantFreq[m].total += amt;
            globalMerchantFreq[m].dates.push(t);
        }
    }

    // 2. Determine strict number of Calendar Months (YYYY-MM) that have transaction data.
    const trueMonthsSpan = Math.max(1, Object.keys(monthsData).length);

    // Calculate Global Averages
    const avgMonthlyExpense = totalExpense / trueMonthsSpan;
    const avgCatBreakdown: Record<string, number> = {};
    for (const [c, v] of Object.entries(globalCatBreakdown)) {
        avgCatBreakdown[c] = v / trueMonthsSpan;
    }

    // --- PHASE 3: PATTERN DETECTION (INCOME) ---
    // Detect true income strictly from patterned direct deposits (min 3 occurrences)
    let patternedMonthlyIncome = 0;

    for (const [m, data] of Object.entries(globalIncomeFreq)) {
        if (data.count >= 3) { // Require at least 3 occurrences to prove a pattern
            data.dates.sort();

            // Calculate average days between deposits
            let totalDaysDiff = 0;
            for (let i = 1; i < data.dates.length; i++) {
                totalDaysDiff += (data.dates[i] - data.dates[i - 1]) / (1000 * 3600 * 24);
            }
            const avgDaysBetween = totalDaysDiff / (data.dates.length - 1);

            const avgPayload = data.total / data.count;

            // Convert to a Monthly Equivalent Value based on Cadence
            let monthlyMultiplier = 0;
            if (avgDaysBetween >= 25 && avgDaysBetween <= 33) {
                // Monthly
                monthlyMultiplier = 1;
            } else if (avgDaysBetween >= 12 && avgDaysBetween <= 16) {
                // Bi-weekly
                monthlyMultiplier = (365 / 14) / 12; // ~2.17
            } else if (avgDaysBetween >= 5 && avgDaysBetween <= 9) {
                // Weekly
                monthlyMultiplier = (365 / 7) / 12; // ~4.34
            } else {
                // Unknown/Erratic cadence, fallback to strict lifetime average
                monthlyMultiplier = (data.count / trueMonthsSpan);
            }

            patternedMonthlyIncome += (avgPayload * monthlyMultiplier);
        }
    }

    // If no patterns found (e.g. brand new user with 1 month data), fallback to naive average
    const avgMonthlyIncome = patternedMonthlyIncome > 0 ? patternedMonthlyIncome : (Object.values(globalIncomeFreq).reduce((sum, d) => sum + d.total, 0) / trueMonthsSpan);

    // --- PHASE 4: HYBRID INTELLIGENT RECURRING BILLS (RULE + AI) ---
    // 4.1 Aggressive Merchant Normalization & Regrouping
    // We re-group merchants from transactions directly here, ignoring the legacy naive globalMerchantFreq for bills
    const normalizedGroups: Record<string, { count: number, amounts: number[], dates: number[], rawName: string }> = {};
    const manualTrue = new Set<string>();
    const manualFalse = new Set<string>();

    for (const tx of transactions) {
        if (tx.direction !== 'expense') continue;

        let m = tx.merchant.toUpperCase()
            .replace(/[.,#]/g, '')
            .replace(/\b(INC|LLC|CORP|CO)\b/g, '')
            .replace(/\d+/g, '') // Strip numbers (store numbers)
            .trim();

        if (!m) m = "UNKNOWN";

        if (tx.isManualRecurring === true) manualTrue.add(m);
        if (tx.isManualRecurring === false) manualFalse.add(m);

        if (!normalizedGroups[m]) normalizedGroups[m] = { count: 0, amounts: [], dates: [], rawName: tx.merchant };
        normalizedGroups[m].count++;
        normalizedGroups[m].amounts.push(tx.amount);

        const dateObj = tx.date && typeof tx.date.toDate === 'function' ? tx.date.toDate() : new Date(tx.date as any);
        normalizedGroups[m].dates.push(dateObj.getTime());
    }

    // 4.2 Rule-Based Pass
    const candidateGroups: any[] = [];

    for (const [m, data] of Object.entries(normalizedGroups)) {
        if (manualFalse.has(m) || manualTrue.has(m)) continue; // Bypass if explicitly ignored OR explicitly forced

        const isWithdrawal = m.includes("ATM") || m.includes("WITHDRAWAL") || m.includes("CASH");
        const meanAmount = data.amounts.reduce((a, b) => a + b, 0) / data.count;

        const isLikelyInsurance = m.toUpperCase().includes("INS") || m.toUpperCase().includes("PROGRESSIVE");
        const forcePass = (isWithdrawal && meanAmount >= 500) || isLikelyInsurance;

        if (data.count < 2 && !forcePass) continue; // Must be seen at least 2 times total, unless forced

        data.dates.sort();
        let avgDaysBetween = 30; // Default if 1 occurrence
        if (data.dates.length > 1) {
            let totalDaysDiff = 0;
            for (let i = 1; i < data.dates.length; i++) {
                totalDaysDiff += (data.dates[i] - data.dates[i - 1]) / (1000 * 3600 * 24);
            }
            avgDaysBetween = totalDaysDiff / (data.dates.length - 1);
        }

        // Check amount stability (stdev / mean)  - roughly ±15% tolerance
        const variance = data.amounts.reduce((a, b) => a + Math.pow(b - meanAmount, 2), 0) / data.count;
        const stdev = Math.sqrt(variance);
        const amountStabilityScore = meanAmount > 0 ? (stdev / meanAmount) : 1;

        const isAmountStable = data.count === 1 ? true : amountStabilityScore < 0.15;

        // We push all candidates that occurred 2+ times (or forced) to the AI pipeline. Let the LLM analyze 'isStable' and the merchant intent.
        candidateGroups.push({
            merchant: m,
            avgDaysBetween: Math.round(avgDaysBetween),
            avgAmount: meanAmount,
            occurrences: data.count,
            isStable: isAmountStable,
            isWithdrawal: isWithdrawal
        });
    }

    // 4.3 AI Second-Pass Refinement
    // 4.3 AI Second-Pass Refinement
    let predictedBillsTotal = 0;
    const recurringBillsMap: Record<string, { merchant: string, label: string, amount: number, confidence: string }> = {};
    const frequentSpendingMap: Record<string, { merchant: string, label: string, amount: number, confidence: string }> = {};

    // First, Inject manually forced recurring bills that were skipped in the rule-based candidate loop
    for (const m of manualTrue) {
        const data = normalizedGroups[m];
        if (!data) continue;

        const meanAmount = data.amounts.reduce((a, b) => a + b, 0) / data.count;
        data.dates.sort();
        let avgDaysBetween = 30;
        if (data.dates.length > 1) {
            let totalDaysDiff = 0;
            for (let i = 1; i < data.dates.length; i++) {
                totalDaysDiff += (data.dates[i] - data.dates[i - 1]) / (1000 * 3600 * 24);
            }
            avgDaysBetween = totalDaysDiff / (data.dates.length - 1);
        }

        let monthlyEquivalent = meanAmount;
        if (avgDaysBetween >= 5 && avgDaysBetween <= 10) monthlyEquivalent = meanAmount * 4.34;
        else if (avgDaysBetween >= 11 && avgDaysBetween <= 16) monthlyEquivalent = meanAmount * 2.17;

        predictedBillsTotal += monthlyEquivalent;
        recurringBillsMap[m] = {
            merchant: m,
            label: data.rawName || m,
            amount: monthlyEquivalent,
            confidence: "Manual Add"
        };
    }

    // NEW: Inject Pure Virtual Recurring Bills (items without transactions)
    try {
        const virtualSnap = await adminDb.collection(`users/${uid}/finance_manual_recurring`).get();
        for (const vDoc of virtualSnap.docs) {
            const vData = vDoc.data();
            const vM = (vData.label || "Manual Bill").toUpperCase();

            // Skip if already added via transaction flag (though unlikely for virtuals)
            if (recurringBillsMap[vM]) continue;

            const vAmt = vData.amount || 0;
            predictedBillsTotal += vAmt;
            recurringBillsMap[vM] = {
                merchant: vM,
                label: vData.label,
                amount: vAmt,
                confidence: "Virtual Bill"
            };
        }
    } catch (ve) {
        console.error("Failed to fetch virtual recurring bills:", ve);
    }

    if (candidateGroups.length > 0 && process.env.OPENAI_API_KEY) {
        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const prompt = `
            You are a Financial Analysis AI.
            I am providing a list of all transaction groups that happen 2+ times in this user's history.
            Your job is to classify them as either a TRUE 'recurring_bill' (subscriptions, rent, utilities, insurance, loan payments, gym) OR 'frequent_spending' (gas stations, fast food, groceries, shopping, amazon, rideshare) OR 'ignore' (internal transfers, unknowns).
            
            Strict Rules:
            1. If it's an ATM/Cash Withdrawal and happens roughly monthly (~25-35 days), label it 'recurring_bill' (rent).
            2. **CRITICAL RENT RULE:** If it is an ATM or Cash Withdrawal and the avgAmount is $500 or more (e.g. $700), it is ALMOST CERTAINLY Rent. You MUST classify it as 'recurring_bill'.
            3. If it's a gas station (WAWA, EXXON), grocery (PUBLIX, KROGER), convenience (7-ELEVEN) or food, DO NOT label as recurring_bill. Label as 'frequent_spending'.
            4. Use the merchant name as the primary clue. 'Netflix', 'Planet Fitness', 'Comcast' are always 'recurring_bill'.
            5. Digital/Tech subscriptions (Apple, Google, Microsoft, Spotify) MUST be labeled 'recurring_bill'.
            6. Auto/Home Insurance (Progressive, Prog Select Ins, State Farm, Geico, Allstate) MUST be labeled 'recurring_bill'.
            7. Credit Card payments and Personal Loans (Wells Fargo, Aspire, Net Credit, Chase, Amex, Capital One, Discover) MUST be labeled 'recurring_bill'.
            8. **CRITICAL:** Ignore erratic 'avgDaysBetween' patterns for Insurance, Credit Cards, and Utilities. Users often pay these on erratic days (e.g., 1st then the 16th), causing weird mathematical averages. Rely exclusively on the merchant name to classify them as 'recurring_bill'.
            9. Provide a 'cleanLabel' that fixes ALL CAPS and removes gibberish (e.g. "amzn mktp us" -> "Amazon").
            
            You MUST return a JSON object containing a "results" array. Each object in the array must match this signature:
            { "originalMerchant": string, "cleanLabel": string, "classification": "recurring_bill" | "frequent_spending" | "ignore", "shortCategory": string }
            * 'shortCategory' must be a simple 1-3 word generic descriptor (e.g. 'Gym Membership', 'Auto Insurance', 'Tech Subscription', 'Groceries', 'Credit Card', 'Loan Payment').

            Candidates JSON:
            ${JSON.stringify(candidateGroups, null, 2)}
            `;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You output strict JSON arrays." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            });

            const raw = completion.choices[0].message.content;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.results) {
                    for (const ai of parsed.results) {
                        const match = candidateGroups.find(c => c.merchant === ai.originalMerchant);
                        if (!match) continue;

                        let monthlyEquivalent = match.avgAmount;
                        if (match.avgDaysBetween >= 5 && match.avgDaysBetween <= 10) monthlyEquivalent = match.avgAmount * 4.34;
                        else if (match.avgDaysBetween >= 11 && match.avgDaysBetween <= 16) monthlyEquivalent = match.avgAmount * 2.17;
                        else if (match.avgDaysBetween > 80 && match.avgDaysBetween <= 100) monthlyEquivalent = match.avgAmount / 3;
                        else if (match.avgDaysBetween > 300) monthlyEquivalent = match.avgAmount / 12;

                        if (ai.classification === 'recurring_bill') {
                            predictedBillsTotal += monthlyEquivalent;
                            recurringBillsMap[match.merchant] = {
                                merchant: match.merchant,
                                label: ai.cleanLabel,
                                amount: monthlyEquivalent,
                                confidence: ai.shortCategory || "Subscription"
                            };
                        } else if (ai.classification === 'frequent_spending') {
                            const label = ai.cleanLabel;
                            if (frequentSpendingMap[label]) {
                                frequentSpendingMap[label].amount += monthlyEquivalent;
                            } else {
                                frequentSpendingMap[label] = {
                                    merchant: match.merchant,
                                    label,
                                    amount: monthlyEquivalent,
                                    confidence: ai.shortCategory || "Frequent Spend"
                                };
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error("AI Second Pass Recurring Detection Failed", e);
            for (const c of candidateGroups) {
                const monthlyEquivalent = c.avgDaysBetween < 10 ? (c.avgAmount * 4.34) : c.avgAmount;
                frequentSpendingMap[c.merchant] = { merchant: c.merchant, label: c.merchant, amount: monthlyEquivalent, confidence: "AI Verification Failed" };
            }
        }
    }

    const recurringBills = Object.values(recurringBillsMap).sort((a, b) => b.amount - a.amount);
    const frequentSpending = Object.values(frequentSpendingMap).sort((a, b) => b.amount - a.amount);

    const opportunities: string[] = [];
    if (avgMonthlyExpense > avgMonthlyIncome && avgMonthlyIncome > 0) {
        opportunities.push("You are spending more than you earn on average. Consider reducing variable expenses.");
    }
    if (recurringBills.length > 3) {
        opportunities.push(`We identified ${recurringBills.length} recurring expenses. Reviewing active subscriptions could save money.`);
    }

    const batch = adminDb.batch();

    // 1. Write the Overall Summary Insight document
    const summaryRef = adminDb.collection(`users/${uid}/finance_insights`).doc('summary');
    batch.set(summaryRef, {
        uid,
        incomeTotal: avgMonthlyIncome,
        expenseTotal: avgMonthlyExpense,
        categoryBreakdown: avgCatBreakdown,
        predictedBillsTotal,
        recurringBills,
        frequentSpending,
        opportunities,
        lastUpdated: new Date()
    });

    // 2. Write individual month insights
    for (const [mKey, data] of Object.entries(monthsData)) {
        const mRef = adminDb.collection(`users/${uid}/finance_insights`).doc(mKey);
        batch.set(mRef, {
            uid,
            monthKey: mKey,
            incomeTotal: data.incomeTotal,
            expenseTotal: data.expenseTotal,
            categoryBreakdown: data.categoryBreakdown,
            predictedBillsTotal, // We just store the global recurring total for context
            recurringBills,
            frequentSpending,
            opportunities: [],
            lastUpdated: new Date()
        });
    }

    await batch.commit();

    // 3. Trigger a Daily Plan Rebuild so the new insights instantly flow into the user's allowance
    try {
        const port = process.env.PORT || 3000;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
        await fetch(`${appUrl}/api/finance/daily-plan/rebuild`, {
            method: 'POST',
            headers: {
                'internal-auth': process.env.CRON_SECRET || process.env.NEXT_PUBLIC_DEV_CRON_SECRET || '',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uid })
        });
    } catch (e) {
        console.error("Failed to automatically rebuild daily plan post-aggregation:", e);
    }
}
