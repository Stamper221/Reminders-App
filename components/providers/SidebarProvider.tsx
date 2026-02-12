"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

interface SidebarContextType {
    collapsed: boolean;
    toggle: () => void;
    setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
    collapsed: false,
    toggle: () => { },
    setCollapsed: () => { },
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const { user, profile } = useAuth();
    const [collapsed, setCollapsedState] = useState(false);

    // Load from profile
    useEffect(() => {
        if (profile?.sidebarCollapsed !== undefined) {
            setCollapsedState(profile.sidebarCollapsed);
        }
    }, [profile]);

    const persist = useCallback(
        async (value: boolean) => {
            if (user) {
                try {
                    const userRef = doc(db, "users", user.uid);
                    await updateDoc(userRef, {
                        sidebarCollapsed: value,
                        updatedAt: serverTimestamp(),
                    });
                } catch (e) {
                    console.error("Failed to persist sidebar state:", e);
                }
            }
        },
        [user]
    );

    const setCollapsed = useCallback(
        (v: boolean) => {
            setCollapsedState(v);
            persist(v);
        },
        [persist]
    );

    const toggle = useCallback(() => {
        setCollapsedState((prev) => {
            const next = !prev;
            persist(next);
            return next;
        });
    }, [persist]);

    const contextValue = React.useMemo(() => ({
        collapsed,
        toggle,
        setCollapsed
    }), [collapsed, toggle, setCollapsed]);

    return (
        <SidebarContext.Provider value={contextValue}>
            {children}
        </SidebarContext.Provider>
    );
}
