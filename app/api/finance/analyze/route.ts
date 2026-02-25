import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { normalizeTransactionsWithAI } from "@/lib/aiParse";
import { recalculateAllInsights } from "@/lib/financeAggregation";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow Vercel to run this up to 5 minutes

async function verifyAuth(request: NextRequest) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.split("Bearer ")[1];
    try {
        const decoded = await adminAuth.verifyIdToken(token);
        return decoded;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const decodedUser = await verifyAuth(req);
        if (!decodedUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const uid = decodedUser.uid;
        const { statementId } = await req.json();

        if (!statementId) {
            return NextResponse.json({ error: "Missing statement ID" }, { status: 400 });
        }

        const statementRef = adminDb.collection(`users/${uid}/finance_statements`).doc(statementId);
        const statementSnap = await statementRef.get();

        if (!statementSnap.exists) {
            return NextResponse.json({ error: "Statement not found" }, { status: 404 });
        }

        const data = statementSnap.data();
        const textChunks = data?.textChunks || [];

        if (textChunks.length === 0) {
            await statementRef.update({ parseStatus: 'failed', errorMessage: "No text chunks found to analyze." });
            return NextResponse.json({ error: "No text chunks found" }, { status: 400 });
        }

        // 1. Call OpenAI to Normalize Transactions
        try {
            await statementRef.update({ parseStatus: 'analyzing' });

            const transactions = await normalizeTransactionsWithAI(textChunks, uid);

            if (!transactions || transactions.length === 0) {
                await statementRef.update({ parseStatus: 'failed', errorMessage: "AI could not find any transactions.", textChunks: admin.firestore.FieldValue.delete() });
                return NextResponse.json({ error: "No transactions extracted." }, { status: 400 });
            }

            // 2. Write Transactions via Batch
            await statementRef.update({ parseStatus: 'building_insights' });

            const batch = adminDb.batch();
            let rowCount = 0;

            for (const tx of transactions) {
                const txDesc = (tx.merchant + " " + (tx.originalDescription || "")).toLowerCase();
                // Hard-filter to strictly ignore common transfers
                if (txDesc.includes("transfer") && !txDesc.includes("zelle")) {
                    continue; // Skip writing this internal transfer transaction completely
                }

                const amt = tx.amount || 0;

                // DedupeKey = YYYY-MM-DD_amount_merchant
                const safeMerchant = (tx.merchant || tx.originalDescription || 'Unknown').toString();
                const strictDateStr = new Date(tx.date).toISOString().split('T')[0]; // Format exactly as YYYY-MM-DD
                const formattedAmount = amt.toFixed(2).replace('.', ''); // 20.00 -> 2000
                const safeMerchantStr = safeMerchant.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().substring(0, 30);

                const dedupeKey = `${strictDateStr}_${formattedAmount}_${safeMerchantStr}`;
                const txRef = adminDb.collection(`users/${uid}/finance_transactions`).doc(dedupeKey);

                batch.set(txRef, {
                    uid,
                    statementId,
                    date: new Date(tx.date), // Convert back to Date/Timestamp
                    merchant: safeMerchant,
                    originalDescription: tx.originalDescription || safeMerchant,
                    amount: amt,
                    direction: tx.direction || 'expense',
                    category: tx.category || 'Uncategorized',
                    dedupeKey
                }, { merge: true }); // Use merge so re-parsing doesn't overwrite manual category edits
                rowCount++;
            }

            // Re-update statement to completed and remove textChunks to save space
            batch.update(statementRef, {
                parseStatus: 'completed',
                rowCount,
                textChunks: admin.firestore.FieldValue.delete() // clean up the raw text
            });

            await batch.commit();

            // 3. Trigger Global Aggregation
            await recalculateAllInsights(uid);

            return NextResponse.json({ success: true, statementId, rowCount });

        } catch (openaiErr: any) {
            console.error("Analysis Pipeline Error:", openaiErr);
            await statementRef.update({
                parseStatus: 'failed',
                errorMessage: openaiErr.message || "Failed to analyze data.",
                textChunks: admin.firestore.FieldValue.delete()
            });
            return NextResponse.json({ error: "AI Pipeline failed." }, { status: 500 });
        }

    } catch (error: any) {
        console.error("Analyze Route Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
