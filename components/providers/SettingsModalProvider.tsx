"use client";

import { createContext, useContext, useState } from "react";

interface SettingsModalContextType {
    open: boolean;
    setOpen: (open: boolean) => void;
    openSettings: () => void;
}

const SettingsModalContext = createContext<SettingsModalContextType>({
    open: false,
    setOpen: () => { },
    openSettings: () => { },
});

export const useSettingsModal = () => useContext(SettingsModalContext);

export function SettingsModalProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);

    const openSettings = () => setOpen(true);

    return (
        <SettingsModalContext.Provider value={{ open, setOpen, openSettings }}>
            {children}
        </SettingsModalContext.Provider>
    );
}
