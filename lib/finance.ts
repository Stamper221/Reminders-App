import { db } from "@/lib/firebase/client";
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    Timestamp, serverTimestamp, query, where, getDocs, writeBatch, getDoc, orderBy, limit
} from "firebase/firestore";
import { FinanceStatement, FinanceTransaction, FinanceGoal, FinanceRecurring, FinanceDailyPlan } from "./financeTypes";

// --- STATEMENTS ---

export async function createStatementRecord(uid: string, statement: Omit<FinanceStatement, 'uid' | 'uploadedAt' | 'parseStatus'>) {
    const collRef = collection(db, `users/${uid}/finance_statements`);
    const docRef = await addDoc(collRef, {
        ...statement,
        uid,
        parseStatus: 'pending',
        uploadedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateStatementStatus(uid: string, statementId: string, status: FinanceStatement['parseStatus'], errorMessage?: string) {
    const docRef = doc(db, `users/${uid}/finance_statements`, statementId);
    await updateDoc(docRef, {
        parseStatus: status,
        ...(errorMessage && { errorMessage })
    });
}

// Check if a statement fingerprint already exists to prevent duplicate file uploads
export async function checkStatementFingerprintExists(uid: string, fingerprint: string): Promise<boolean> {
    const collRef = collection(db, `users/${uid}/finance_statements`);
    const q = query(collRef, where("fingerprint", "==", fingerprint), limit(1));
    const snap = await getDocs(q);
    return !snap.empty;
}

// --- DATA DELETION ---

/**
 * Deletes ALL finance data for a user securely. 
 * This involves querying all subgroups under users/{uid}/finance_* and deleting them.
 * This is designed to be a "Delete Finance Data" reset switch.
 */
export async function wipeUserFinanceData(uid: string) {
    const batches = [];
    const collectionsToClear = [
        'finance_statements',
        'finance_transactions',
        'finance_recurring',
        'finance_insights',
        'finance_goals',
        'finance_daily_plan'
    ];

    for (const collName of collectionsToClear) {
        const collRef = collection(db, `users/${uid}/${collName}`);
        const snap = await getDocs(collRef);

        // Chunk deletions
        const chunkSize = 400; // Under firestore batch limit of 500
        for (let i = 0; i < snap.docs.length; i += chunkSize) {
            const chunk = snap.docs.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach(d => batch.delete(d.ref));
            batches.push(batch.commit());
        }
    }

    await Promise.all(batches);
}
