"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

// ─── Theme Definitions ──────────────────────────────────────────────────────
export interface ThemePalette {
    id: string;
    name: string;
    preview: { primary: string; accent: string; bg: string };
    light: Record<string, string>;
    dark: Record<string, string>;
}

export const THEMES: ThemePalette[] = [
    {
        id: "indigo",
        name: "Indigo",
        preview: { primary: "#6366f1", accent: "#ede9fe", bg: "#fafbfd" },
        light: {
            "--primary": "#6366f1",
            "--primary-foreground": "#ffffff",
            "--accent": "#ede9fe",
            "--accent-foreground": "#4338ca",
            "--ring": "#6366f1",
            "--gradient-primary": "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)",
        },
        dark: {
            "--primary": "#818cf8",
            "--primary-foreground": "#0f0b2e",
            "--accent": "#2e1065",
            "--accent-foreground": "#c4b5fd",
            "--ring": "#818cf8",
            "--gradient-primary": "linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c4b5fd 100%)",
        },
    },
    {
        id: "rose",
        name: "Rose",
        preview: { primary: "#f43f5e", accent: "#ffe4e6", bg: "#fefbfb" },
        light: {
            "--primary": "#f43f5e",
            "--primary-foreground": "#ffffff",
            "--accent": "#ffe4e6",
            "--accent-foreground": "#be123c",
            "--ring": "#f43f5e",
            "--gradient-primary": "linear-gradient(135deg, #f43f5e 0%, #fb7185 50%, #fda4af 100%)",
        },
        dark: {
            "--primary": "#fb7185",
            "--primary-foreground": "#1c0404",
            "--accent": "#4c0519",
            "--accent-foreground": "#fda4af",
            "--ring": "#fb7185",
            "--gradient-primary": "linear-gradient(135deg, #fb7185 0%, #f43f5e 50%, #fda4af 100%)",
        },
    },
    {
        id: "emerald",
        name: "Emerald",
        preview: { primary: "#10b981", accent: "#d1fae5", bg: "#fafdfb" },
        light: {
            "--primary": "#10b981",
            "--primary-foreground": "#ffffff",
            "--accent": "#d1fae5",
            "--accent-foreground": "#065f46",
            "--ring": "#10b981",
            "--gradient-primary": "linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)",
        },
        dark: {
            "--primary": "#34d399",
            "--primary-foreground": "#022c22",
            "--accent": "#064e3b",
            "--accent-foreground": "#6ee7b7",
            "--ring": "#34d399",
            "--gradient-primary": "linear-gradient(135deg, #34d399 0%, #10b981 50%, #6ee7b7 100%)",
        },
    },
    {
        id: "amber",
        name: "Amber",
        preview: { primary: "#f59e0b", accent: "#fef3c7", bg: "#fefcf5" },
        light: {
            "--primary": "#f59e0b",
            "--primary-foreground": "#ffffff",
            "--accent": "#fef3c7",
            "--accent-foreground": "#92400e",
            "--ring": "#f59e0b",
            "--gradient-primary": "linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #fcd34d 100%)",
        },
        dark: {
            "--primary": "#fbbf24",
            "--primary-foreground": "#1c1302",
            "--accent": "#78350f",
            "--accent-foreground": "#fcd34d",
            "--ring": "#fbbf24",
            "--gradient-primary": "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #fcd34d 100%)",
        },
    },
    {
        id: "ocean",
        name: "Ocean",
        preview: { primary: "#0ea5e9", accent: "#e0f2fe", bg: "#f7fbfe" },
        light: {
            "--primary": "#0ea5e9",
            "--primary-foreground": "#ffffff",
            "--accent": "#e0f2fe",
            "--accent-foreground": "#0369a1",
            "--ring": "#0ea5e9",
            "--gradient-primary": "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 50%, #7dd3fc 100%)",
        },
        dark: {
            "--primary": "#38bdf8",
            "--primary-foreground": "#0c1824",
            "--accent": "#0c4a6e",
            "--accent-foreground": "#7dd3fc",
            "--ring": "#38bdf8",
            "--gradient-primary": "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #7dd3fc 100%)",
        },
    },
    {
        id: "sunset",
        name: "Sunset",
        preview: { primary: "#f97316", accent: "#ffedd5", bg: "#fefaf5" },
        light: {
            "--primary": "#f97316",
            "--primary-foreground": "#ffffff",
            "--accent": "#ffedd5",
            "--accent-foreground": "#c2410c",
            "--ring": "#f97316",
            "--gradient-primary": "linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)",
        },
        dark: {
            "--primary": "#fb923c",
            "--primary-foreground": "#1c0f02",
            "--accent": "#7c2d12",
            "--accent-foreground": "#fdba74",
            "--ring": "#fb923c",
            "--gradient-primary": "linear-gradient(135deg, #fb923c 0%, #f97316 50%, #fdba74 100%)",
        },
    },
    {
        id: "lavender",
        name: "Lavender",
        preview: { primary: "#a855f7", accent: "#f3e8ff", bg: "#fdfaff" },
        light: {
            "--primary": "#a855f7",
            "--primary-foreground": "#ffffff",
            "--accent": "#f3e8ff",
            "--accent-foreground": "#7e22ce",
            "--ring": "#a855f7",
            "--gradient-primary": "linear-gradient(135deg, #a855f7 0%, #c084fc 50%, #d8b4fe 100%)",
        },
        dark: {
            "--primary": "#c084fc",
            "--primary-foreground": "#1a0530",
            "--accent": "#581c87",
            "--accent-foreground": "#d8b4fe",
            "--ring": "#c084fc",
            "--gradient-primary": "linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #d8b4fe 100%)",
        },
    },
    {
        id: "slate",
        name: "Slate",
        preview: { primary: "#64748b", accent: "#f1f5f9", bg: "#fafbfc" },
        light: {
            "--primary": "#64748b",
            "--primary-foreground": "#ffffff",
            "--accent": "#f1f5f9",
            "--accent-foreground": "#334155",
            "--ring": "#64748b",
            "--gradient-primary": "linear-gradient(135deg, #64748b 0%, #94a3b8 50%, #cbd5e1 100%)",
        },
        dark: {
            "--primary": "#94a3b8",
            "--primary-foreground": "#0f172a",
            "--accent": "#1e293b",
            "--accent-foreground": "#cbd5e1",
            "--ring": "#94a3b8",
            "--gradient-primary": "linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #cbd5e1 100%)",
        },
    },
    {
        id: "crimson",
        name: "Crimson",
        preview: { primary: "#dc2626", accent: "#fee2e2", bg: "#fef6f6" },
        light: {
            "--primary": "#dc2626",
            "--primary-foreground": "#ffffff",
            "--accent": "#fee2e2",
            "--accent-foreground": "#991b1b",
            "--ring": "#dc2626",
            "--gradient-primary": "linear-gradient(135deg, #dc2626 0%, #ef4444 50%, #f87171 100%)",
        },
        dark: {
            "--primary": "#ef4444",
            "--primary-foreground": "#1c0404",
            "--accent": "#7f1d1d",
            "--accent-foreground": "#fca5a5",
            "--ring": "#ef4444",
            "--gradient-primary": "linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #f87171 100%)",
        },
    },
    {
        id: "teal",
        name: "Teal",
        preview: { primary: "#14b8a6", accent: "#ccfbf1", bg: "#fafdfb" },
        light: {
            "--primary": "#14b8a6",
            "--primary-foreground": "#ffffff",
            "--accent": "#ccfbf1",
            "--accent-foreground": "#0f766e",
            "--ring": "#14b8a6",
            "--gradient-primary": "linear-gradient(135deg, #14b8a6 0%, #2dd4bf 50%, #5eead4 100%)",
        },
        dark: {
            "--primary": "#2dd4bf",
            "--primary-foreground": "#042f2e",
            "--accent": "#134e4a",
            "--accent-foreground": "#5eead4",
            "--ring": "#2dd4bf",
            "--gradient-primary": "linear-gradient(135deg, #2dd4bf 0%, #14b8a6 50%, #5eead4 100%)",
        },
    },
];

// ─── Context ────────────────────────────────────────────────────────────────
interface ThemeContextType {
    themeId: string;
    setTheme: (id: string) => void;
    themes: ThemePalette[];
}

const ThemeContext = createContext<ThemeContextType>({
    themeId: "indigo",
    setTheme: () => { },
    themes: THEMES,
});

export const useTheme = () => useContext(ThemeContext);

// ─── Apply CSS Variables ────────────────────────────────────────────────────
function applyTheme(themeId: string) {
    const theme = THEMES.find((t) => t.id === themeId);
    if (!theme) return;

    const isDark = document.documentElement.classList.contains("dark");
    const vars = isDark ? theme.dark : theme.light;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value);
    }
}

// ─── Provider ───────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { user, profile } = useAuth();
    const [themeId, setThemeId] = useState("indigo");

    // Load theme from profile on mount
    useEffect(() => {
        if (profile?.theme) {
            setThemeId(profile.theme);
        }
    }, [profile]);

    // Apply CSS vars whenever themeId or dark mode changes
    useEffect(() => {
        applyTheme(themeId);

        // Watch for dark mode class changes
        const observer = new MutationObserver(() => {
            applyTheme(themeId);
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        return () => observer.disconnect();
    }, [themeId]);

    const setTheme = useCallback(
        async (id: string) => {
            setThemeId(id);
            applyTheme(id);

            // Persist to Firestore
            if (user) {
                try {
                    const userRef = doc(db, "users", user.uid);
                    await updateDoc(userRef, {
                        theme: id,
                        updatedAt: serverTimestamp(),
                    });
                } catch (e) {
                    console.error("Failed to persist theme:", e);
                }
            }
        },
        [user]
    );

    return (
        <ThemeContext.Provider value={{ themeId, setTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
}
