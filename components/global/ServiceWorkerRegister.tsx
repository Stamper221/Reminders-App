"use client";
import { useEffect } from "react";

export function ServiceWorkerRegister() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            // Check for workbox if needed, or just register sw.js
            if ((window as any).workbox !== undefined) {
                // next-pwa behavior
            }

            navigator.serviceWorker.register("/sw.js")
                .then(registration => {
                    console.log("Service Worker registered with scope:", registration.scope);
                })
                .catch(error => {
                    console.error("Service Worker registration failed:", error);
                });
        }
    }, []);

    return null;
}
