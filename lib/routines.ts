
import { db } from "@/lib/firebase/client";
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    Timestamp, getDoc, getDocs, query, orderBy
} from "firebase/firestore";
import { Routine } from "@/lib/types";
import { removeRoutineQueue } from "@/lib/queueSync";

export const addRoutine = async (uid: string, routine: Omit<Routine, "id" | "created_at" | "updated_at">) => {
    const collectionRef = collection(db, `users/${uid}/routines`);
    const now = Timestamp.now();
    return await addDoc(collectionRef, {
        ...routine,
        timezone: routine.timezone || 'UTC',
        created_at: now,
        updated_at: now
    });
};

export const updateRoutine = async (uid: string, routineId: string, updates: Partial<Routine>) => {
    const docRef = doc(db, `users/${uid}/routines`, routineId);
    return await updateDoc(docRef, {
        ...updates,
        updated_at: Timestamp.now()
    });
};

export const deleteRoutine = async (uid: string, routineId: string, deleteFutureReminders: boolean = true) => {
    const docRef = doc(db, `users/${uid}/routines`, routineId);
    await deleteDoc(docRef);
    // Cascade: remove queue items + optionally future generated reminders
    removeRoutineQueue(routineId, deleteFutureReminders);
};

export const getRoutines = async (uid: string) => {
    try {
        // Try with orderBy first (requires Firestore index)
        const q = query(collection(db, `users/${uid}/routines`), orderBy("created_at", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Routine));
    } catch (error: any) {
        // Fallback: fetch without ordering if index doesn't exist
        console.warn("Routines orderBy failed, fetching without order:", error.message);
        const snapshot = await getDocs(collection(db, `users/${uid}/routines`));
        const routines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Routine));
        // Sort client-side
        return routines.sort((a, b) => {
            const aTime = a.created_at?.toMillis?.() || 0;
            const bTime = b.created_at?.toMillis?.() || 0;
            return bTime - aTime;
        });
    }
};

export const getRoutine = async (uid: string, routineId: string) => {
    const docRef = doc(db, `users/${uid}/routines`, routineId);
    const snap = await getDoc(docRef);
    if (snap.exists()) return { id: snap.id, ...snap.data() } as Routine;
    return null;
};
