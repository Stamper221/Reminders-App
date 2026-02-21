import {
    onSnapshot as fOnSnapshot,
    getDocs as fGetDocs,
    Query,
    DocumentData,
    QuerySnapshot,
    FirestoreError
} from "firebase/firestore";

// Global counters for DEV
let activeListeners = 0;
let totalGetDocs = 0;

function parseQueryDetails(q: Query<unknown>): string {
    try {
        // We try to extract internal path/where details if possible,
        // but it depends on the Firebase JS SDK internals.
        // A simple fallback is just logging the object structure.
        const anyQ = q as any;
        if (anyQ._query) {
            const path = anyQ._query.path?.segments?.join('/') || 'unknown';
            return `Collection: ${path}`;
        }
        return "Unknown Query";
    } catch (e) {
        return "Unknown Query";
    }
}

export function onSnapshot<T = DocumentData>(
    query: Query<T>,
    onNext: (snapshot: QuerySnapshot<T>) => void,
    onError?: (error: FirestoreError) => void,
    onCompletion?: () => void
) {
    if (process.env.NODE_ENV !== "development") {
        return fOnSnapshot(query, onNext, onError, onCompletion);
    }

    activeListeners++;
    const id = Math.random().toString(36).substring(7);
    const details = parseQueryDetails(query);

    console.groupCollapsed(`🔍 [Firestore Inspector] +Listener Attached (${id}) | Active: ${activeListeners}`);
    console.log(`Query: ${details}`);
    console.groupEnd();

    const unsubscribe = fOnSnapshot(query,
        (snapshot) => {
            console.log(`📊 [Firestore Inspector] Listener (${id}) Updated | Docs: ${snapshot.docs.length} | Changes: ${snapshot.docChanges().length}`);
            onNext(snapshot);
        },
        onError,
        onCompletion
    );

    return () => {
        activeListeners--;
        console.log(`🛑 [Firestore Inspector] -Listener Detached (${id}) | Active: ${activeListeners}`);
        unsubscribe();
    };
}

export async function getDocs<T = DocumentData>(query: Query<T>): Promise<QuerySnapshot<T>> {
    if (process.env.NODE_ENV !== "development") {
        return fGetDocs(query);
    }

    totalGetDocs++;
    const details = parseQueryDetails(query);

    console.groupCollapsed(`📚 [Firestore Inspector] getDocs Call #${totalGetDocs}`);
    console.log(`Query: ${details}`);

    const start = performance.now();
    try {
        const snapshot = await fGetDocs(query);
        const end = performance.now();
        console.log(`Result: ${snapshot.docs.length} docs returned in ${(end - start).toFixed(2)}ms`);
        console.groupEnd();
        return snapshot;
    } catch (error) {
        console.error("getDocs failed:", error);
        console.groupEnd();
        throw error;
    }
}
