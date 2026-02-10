"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { UserProfile } from "@/lib/types";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        console.log("AuthProvider: Initializing...");

        let mounted = true;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            console.log("AuthProvider: Auth state changed", currentUser?.uid);
            if (!mounted) return;

            setUser(currentUser);

            if (currentUser) {
                try {
                    // Fetch or create profile
                    const profileRef = doc(db, "users", currentUser.uid);
                    const profileSnap = await getDoc(profileRef);

                    if (profileSnap.exists()) {
                        setProfile(profileSnap.data() as UserProfile);
                    } else {
                        // Create new profile default
                        const now = Timestamp.now();
                        const newProfile: UserProfile = {
                            uid: currentUser.uid,
                            email: currentUser.email,
                            smsOptIn: false,
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            createdAt: now,
                            updatedAt: now,
                        };
                        await setDoc(profileRef, newProfile);
                        setProfile(newProfile);
                    }
                } catch (err) {
                    console.error("Error fetching profile:", err);
                }
            } else {
                setProfile(null);
            }
            setLoading(false);
        });

        // Safety timeout in case Firebase hangs (e.g. bad config)
        const timeout = setTimeout(() => {
            if (loading) {
                console.warn("AuthProvider: Firebase auth timed out, forcing loading false");
                setLoading(false);
            }
        }, 3000);

        return () => {
            mounted = false;
            unsubscribe();
            clearTimeout(timeout);
        };
    }, []);

    return (
        <AuthContext.Provider value={{ user, profile, loading }}>
            {children}
        </AuthContext.Provider>
    );
}
