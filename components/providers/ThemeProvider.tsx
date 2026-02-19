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

/**
 * Each theme now sets a comprehensive token set:
 * - primary / primary-foreground — buttons, active states
 * - accent / accent-foreground — subtle highlights, hover backgrounds
 * - ring — focus rings
 * - gradient-primary — gradient buttons, user avatar, FAB
 * - border — theme-tinted border color
 * - muted / muted-foreground — theme-tinted muted surfaces
 * - secondary / secondary-foreground — secondary surfaces
 * - card-border-subtle — very subtle card border tint
 * - badge-bg — badge/pill background
 * - icon-accent — themed icon color for nav/sidebar icons
 */
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
            "--border": "#e0e2f0",
            "--input": "#e0e2f0",
            "--muted": "#f0eef9",
            "--muted-foreground": "#64748b",
            "--secondary": "#f0eef9",
            "--secondary-foreground": "#4338ca",
            "--card-border-subtle": "rgba(99, 102, 241, 0.10)",
            "--badge-bg": "rgba(99, 102, 241, 0.08)",
            "--icon-accent": "#6366f1",
        },
        dark: {
            "--primary": "#818cf8",
            "--primary-foreground": "#0f0b2e",
            "--accent": "#2e1065",
            "--accent-foreground": "#c4b5fd",
            "--ring": "#818cf8",
            "--gradient-primary": "linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c4b5fd 100%)",
            "--border": "#2a2d52",
            "--input": "#2a2d52",
            "--muted": "#1c1e3a",
            "--muted-foreground": "#94a3b8",
            "--secondary": "#1c1e3a",
            "--secondary-foreground": "#c4b5fd",
            "--card-border-subtle": "rgba(129, 140, 248, 0.12)",
            "--badge-bg": "rgba(129, 140, 248, 0.10)",
            "--icon-accent": "#818cf8",
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
            "--border": "#f0dde0",
            "--input": "#f0dde0",
            "--muted": "#fdf2f4",
            "--muted-foreground": "#6b7280",
            "--secondary": "#fdf2f4",
            "--secondary-foreground": "#be123c",
            "--card-border-subtle": "rgba(244, 63, 94, 0.10)",
            "--badge-bg": "rgba(244, 63, 94, 0.08)",
            "--icon-accent": "#f43f5e",
        },
        dark: {
            "--primary": "#fb7185",
            "--primary-foreground": "#1c0404",
            "--accent": "#4c0519",
            "--accent-foreground": "#fda4af",
            "--ring": "#fb7185",
            "--gradient-primary": "linear-gradient(135deg, #fb7185 0%, #f43f5e 50%, #fda4af 100%)",
            "--border": "#3d2030",
            "--input": "#3d2030",
            "--muted": "#2a1520",
            "--muted-foreground": "#94a3b8",
            "--secondary": "#2a1520",
            "--secondary-foreground": "#fda4af",
            "--card-border-subtle": "rgba(251, 113, 133, 0.12)",
            "--badge-bg": "rgba(251, 113, 133, 0.10)",
            "--icon-accent": "#fb7185",
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
            "--border": "#d0e8df",
            "--input": "#d0e8df",
            "--muted": "#ecf8f3",
            "--muted-foreground": "#64748b",
            "--secondary": "#ecf8f3",
            "--secondary-foreground": "#065f46",
            "--card-border-subtle": "rgba(16, 185, 129, 0.10)",
            "--badge-bg": "rgba(16, 185, 129, 0.08)",
            "--icon-accent": "#10b981",
        },
        dark: {
            "--primary": "#34d399",
            "--primary-foreground": "#022c22",
            "--accent": "#064e3b",
            "--accent-foreground": "#6ee7b7",
            "--ring": "#34d399",
            "--gradient-primary": "linear-gradient(135deg, #34d399 0%, #10b981 50%, #6ee7b7 100%)",
            "--border": "#1e3a30",
            "--input": "#1e3a30",
            "--muted": "#142822",
            "--muted-foreground": "#94a3b8",
            "--secondary": "#142822",
            "--secondary-foreground": "#6ee7b7",
            "--card-border-subtle": "rgba(52, 211, 153, 0.12)",
            "--badge-bg": "rgba(52, 211, 153, 0.10)",
            "--icon-accent": "#34d399",
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
            "--border": "#efe0c4",
            "--input": "#efe0c4",
            "--muted": "#fdf8ed",
            "--muted-foreground": "#78716c",
            "--secondary": "#fdf8ed",
            "--secondary-foreground": "#92400e",
            "--card-border-subtle": "rgba(245, 158, 11, 0.10)",
            "--badge-bg": "rgba(245, 158, 11, 0.08)",
            "--icon-accent": "#f59e0b",
        },
        dark: {
            "--primary": "#fbbf24",
            "--primary-foreground": "#1c1302",
            "--accent": "#78350f",
            "--accent-foreground": "#fcd34d",
            "--ring": "#fbbf24",
            "--gradient-primary": "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #fcd34d 100%)",
            "--border": "#3d3018",
            "--input": "#3d3018",
            "--muted": "#2a2110",
            "--muted-foreground": "#a8a29e",
            "--secondary": "#2a2110",
            "--secondary-foreground": "#fcd34d",
            "--card-border-subtle": "rgba(251, 191, 36, 0.12)",
            "--badge-bg": "rgba(251, 191, 36, 0.10)",
            "--icon-accent": "#fbbf24",
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
            "--border": "#cbe3f0",
            "--input": "#cbe3f0",
            "--muted": "#eff8fd",
            "--muted-foreground": "#64748b",
            "--secondary": "#eff8fd",
            "--secondary-foreground": "#0369a1",
            "--card-border-subtle": "rgba(14, 165, 233, 0.10)",
            "--badge-bg": "rgba(14, 165, 233, 0.08)",
            "--icon-accent": "#0ea5e9",
        },
        dark: {
            "--primary": "#38bdf8",
            "--primary-foreground": "#0c1824",
            "--accent": "#0c4a6e",
            "--accent-foreground": "#7dd3fc",
            "--ring": "#38bdf8",
            "--gradient-primary": "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #7dd3fc 100%)",
            "--border": "#1a3040",
            "--input": "#1a3040",
            "--muted": "#122230",
            "--muted-foreground": "#94a3b8",
            "--secondary": "#122230",
            "--secondary-foreground": "#7dd3fc",
            "--card-border-subtle": "rgba(56, 189, 248, 0.12)",
            "--badge-bg": "rgba(56, 189, 248, 0.10)",
            "--icon-accent": "#38bdf8",
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
            "--border": "#f0dcc8",
            "--input": "#f0dcc8",
            "--muted": "#fdf5ed",
            "--muted-foreground": "#78716c",
            "--secondary": "#fdf5ed",
            "--secondary-foreground": "#c2410c",
            "--card-border-subtle": "rgba(249, 115, 22, 0.10)",
            "--badge-bg": "rgba(249, 115, 22, 0.08)",
            "--icon-accent": "#f97316",
        },
        dark: {
            "--primary": "#fb923c",
            "--primary-foreground": "#1c0f02",
            "--accent": "#7c2d12",
            "--accent-foreground": "#fdba74",
            "--ring": "#fb923c",
            "--gradient-primary": "linear-gradient(135deg, #fb923c 0%, #f97316 50%, #fdba74 100%)",
            "--border": "#3d2815",
            "--input": "#3d2815",
            "--muted": "#2a1c10",
            "--muted-foreground": "#a8a29e",
            "--secondary": "#2a1c10",
            "--secondary-foreground": "#fdba74",
            "--card-border-subtle": "rgba(251, 146, 60, 0.12)",
            "--badge-bg": "rgba(251, 146, 60, 0.10)",
            "--icon-accent": "#fb923c",
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
            "--border": "#e4d5f0",
            "--input": "#e4d5f0",
            "--muted": "#f5f0fa",
            "--muted-foreground": "#6b7280",
            "--secondary": "#f5f0fa",
            "--secondary-foreground": "#7e22ce",
            "--card-border-subtle": "rgba(168, 85, 247, 0.10)",
            "--badge-bg": "rgba(168, 85, 247, 0.08)",
            "--icon-accent": "#a855f7",
        },
        dark: {
            "--primary": "#c084fc",
            "--primary-foreground": "#1a0530",
            "--accent": "#581c87",
            "--accent-foreground": "#d8b4fe",
            "--ring": "#c084fc",
            "--gradient-primary": "linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #d8b4fe 100%)",
            "--border": "#35204a",
            "--input": "#35204a",
            "--muted": "#231530",
            "--muted-foreground": "#94a3b8",
            "--secondary": "#231530",
            "--secondary-foreground": "#d8b4fe",
            "--card-border-subtle": "rgba(192, 132, 252, 0.12)",
            "--badge-bg": "rgba(192, 132, 252, 0.10)",
            "--icon-accent": "#c084fc",
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
            "--border": "#dce1e8",
            "--input": "#dce1e8",
            "--muted": "#f1f3f7",
            "--muted-foreground": "#64748b",
            "--secondary": "#f1f3f7",
            "--secondary-foreground": "#334155",
            "--card-border-subtle": "rgba(100, 116, 139, 0.10)",
            "--badge-bg": "rgba(100, 116, 139, 0.08)",
            "--icon-accent": "#64748b",
        },
        dark: {
            "--primary": "#94a3b8",
            "--primary-foreground": "#0f172a",
            "--accent": "#1e293b",
            "--accent-foreground": "#cbd5e1",
            "--ring": "#94a3b8",
            "--gradient-primary": "linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #cbd5e1 100%)",
            "--border": "#2d3748",
            "--input": "#2d3748",
            "--muted": "#1e2838",
            "--muted-foreground": "#94a3b8",
            "--secondary": "#1e2838",
            "--secondary-foreground": "#cbd5e1",
            "--card-border-subtle": "rgba(148, 163, 184, 0.12)",
            "--badge-bg": "rgba(148, 163, 184, 0.10)",
            "--icon-accent": "#94a3b8",
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
            "--border": "#efd6d6",
            "--input": "#efd6d6",
            "--muted": "#fdf0f0",
            "--muted-foreground": "#6b7280",
            "--secondary": "#fdf0f0",
            "--secondary-foreground": "#991b1b",
            "--card-border-subtle": "rgba(220, 38, 38, 0.10)",
            "--badge-bg": "rgba(220, 38, 38, 0.08)",
            "--icon-accent": "#dc2626",
        },
        dark: {
            "--primary": "#ef4444",
            "--primary-foreground": "#1c0404",
            "--accent": "#7f1d1d",
            "--accent-foreground": "#fca5a5",
            "--ring": "#ef4444",
            "--gradient-primary": "linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #f87171 100%)",
            "--border": "#3d1818",
            "--input": "#3d1818",
            "--muted": "#2a1010",
            "--muted-foreground": "#94a3b8",
            "--secondary": "#2a1010",
            "--secondary-foreground": "#fca5a5",
            "--card-border-subtle": "rgba(239, 68, 68, 0.12)",
            "--badge-bg": "rgba(239, 68, 68, 0.10)",
            "--icon-accent": "#ef4444",
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
            "--border": "#c8e8e3",
            "--input": "#c8e8e3",
            "--muted": "#ecf9f6",
            "--muted-foreground": "#64748b",
            "--secondary": "#ecf9f6",
            "--secondary-foreground": "#0f766e",
            "--card-border-subtle": "rgba(20, 184, 166, 0.10)",
            "--badge-bg": "rgba(20, 184, 166, 0.08)",
            "--icon-accent": "#14b8a6",
        },
        dark: {
            "--primary": "#2dd4bf",
            "--primary-foreground": "#042f2e",
            "--accent": "#134e4a",
            "--accent-foreground": "#5eead4",
            "--ring": "#2dd4bf",
            "--gradient-primary": "linear-gradient(135deg, #2dd4bf 0%, #14b8a6 50%, #5eead4 100%)",
            "--border": "#1a3835",
            "--input": "#1a3835",
            "--muted": "#122825",
            "--muted-foreground": "#94a3b8",
            "--secondary": "#122825",
            "--secondary-foreground": "#5eead4",
            "--card-border-subtle": "rgba(45, 212, 191, 0.12)",
            "--badge-bg": "rgba(45, 212, 191, 0.10)",
            "--icon-accent": "#2dd4bf",
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
