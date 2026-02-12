"use client";

import { useTheme, THEMES } from "@/components/providers/ThemeProvider";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

export function ThemeSelector() {
    const { themeId, setTheme } = useTheme();

    return (
        <div className="grid grid-cols-5 gap-2">
            {THEMES.map((theme) => {
                const isActive = theme.id === themeId;
                return (
                    <motion.button
                        key={theme.id}
                        type="button"
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setTheme(theme.id)}
                        className={`
                            relative flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all duration-200 cursor-pointer
                            ${isActive
                                ? "border-[var(--primary)] bg-[var(--accent)] shadow-md"
                                : "border-transparent bg-card hover:border-border hover:shadow-sm"
                            }
                        `}
                        title={theme.name}
                    >
                        {/* Color swatch */}
                        <div className="flex items-center gap-1">
                            <div
                                className="w-5 h-5 rounded-full shadow-inner border border-white/20"
                                style={{ background: theme.preview.primary }}
                            />
                            <div
                                className="w-3.5 h-3.5 rounded-full shadow-inner border border-white/10"
                                style={{ background: theme.preview.accent }}
                            />
                        </div>

                        {/* Theme name */}
                        <span className="text-[10px] font-medium text-foreground/80 leading-none">
                            {theme.name}
                        </span>

                        {/* Active check */}
                        {isActive && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--primary)] flex items-center justify-center"
                            >
                                <Check className="w-2.5 h-2.5 text-[var(--primary-foreground)]" />
                            </motion.div>
                        )}
                    </motion.button>
                );
            })}
        </div>
    );
}
