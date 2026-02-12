"use client";

import { useEffect, useState } from "react";

// Generate stars at build time with deterministic positions
// Generate particles with deterministic positions/delays
function generateParticles(count: number) {
    const particles: { top: number; size: number; delay: number; duration: number; opacity: number }[] = [];
    for (let i = 0; i < count; i++) {
        // Deterministic seeding
        const seed = (i * 1337 + 7331) % 10000;
        particles.push({
            top: (seed % 100), // 0-100% vertical
            size: 2 + (seed % 25) / 10, // 2px - 4.5px
            delay: -1 * (seed % 40), // negative delay up to 40s
            duration: 25 + (seed % 20), // 25s - 45s
            opacity: 0.3 + (seed % 40) / 100, // 0.3 - 0.7
        });
    }
    return particles;
}

const PARTICLES = generateParticles(50);

export function StarField() {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        console.log("StarField mounted");
        // Respect prefers-reduced-motion
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setVisible(!mq.matches);
        const handler = (e: MediaQueryListEvent) => setVisible(!e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    if (!visible) return null;

    return (
        <div
            className="fixed inset-0 overflow-hidden pointer-events-none"
            style={{ zIndex: 0 }}
            aria-hidden="true"
        >
            {PARTICLES.map((p, i) => (
                <div
                    key={i}
                    className="absolute rounded-full horizontal-drift"
                    style={{
                        left: '-20px', // Start off-screen
                        top: `${p.top}%`,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        backgroundColor: "var(--foreground)", // Adapts to theme (dark on light, white on dark)
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                        // @ts-ignore
                        "--particle-opacity": p.opacity,
                    }}
                />
            ))}
        </div>
    );
}
