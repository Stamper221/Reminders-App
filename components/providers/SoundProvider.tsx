"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

interface SoundContextType {
    playSuccess: () => void;
    playNotification: () => void;
    playClick: () => void;
    toggleMusic: () => void;
    isMusicPlaying: boolean;
    volume: number;
    setVolume: (v: number) => void;
    muted: boolean;
    setMuted: (m: boolean) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export function useSound() {
    const context = useContext(SoundContext);
    if (!context) {
        throw new Error("useSound must be used within a SoundProvider");
    }
    return context;
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(0.5);
    const [isMusicPlaying, setIsMusicPlaying] = useState(false);

    // Web Audio Context
    const audioCtxRef = useRef<AudioContext | null>(null);
    const musicNodesRef = useRef<any[]>([]); // Store playing oscillators
    const gainNodeRef = useRef<GainNode | null>(null); // Master gain for music

    // Initialize Audio Context on first interaction
    const initAudio = () => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current.state === "suspended") {
            audioCtxRef.current.resume();
        }
    };

    // --- Synthesizers ---

    const playSuccess = () => {
        if (muted) return;
        initAudio();
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        const now = ctx.currentTime;

        // Major Triad Arpeggio (C Major: C5, E5, G5, C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sine";
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3 * volume, now + i * 0.05 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.6);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.6);
        });
    };

    const playNotification = () => {
        if (muted) return;
        initAudio();
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        const now = ctx.currentTime;

        // Two-tone bell
        [880, 1760].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, now + i * 0.15);

            gain.gain.setValueAtTime(0, now + i * 0.15);
            gain.gain.linearRampToValueAtTime(0.2 * volume, now + i * 0.15 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.5);
        });
    };

    const playClick = () => {
        if (muted) return;
        initAudio();
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        const now = ctx.currentTime;

        // Simple high pass noise (simulated by high freq sine burst)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.setValueAtTime(3000, now);
        osc.type = "square"; // clicky

        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 1000;

        gain.gain.setValueAtTime(0.1 * volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.05);
    };

    // --- Background Music (Generative Ambient Drone) ---

    const stopMusic = () => {
        // Stop immediately - disconnect nodes first for instant silence
        musicNodesRef.current.forEach(node => {
            try { node.stop(); node.disconnect(); } catch (e) { }
        });
        musicNodesRef.current = [];

        if (gainNodeRef.current) {
            try { gainNodeRef.current.disconnect(); } catch (e) { }
            gainNodeRef.current = null;
        }

        setIsMusicPlaying(false);
    };

    const startMusic = () => {
        if (muted) return;
        initAudio();
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        // Clean up any existing
        if (musicNodesRef.current.length > 0) stopMusic();

        // Master Gain for Music
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0, ctx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0.15 * volume, ctx.currentTime + 3); // Slow fade in
        masterGain.connect(ctx.destination);
        gainNodeRef.current = masterGain;

        // Chord: D minor add 9 (D3, F3, A3, E4) - "Soothing/Ethereal"
        // Frequencies: D3=146.83, F3=174.61, A3=220.00, E4=329.63
        const freqs = [146.83, 174.61, 220.00, 329.63];

        freqs.forEach((freq, i) => {
            // We create 2 oscillators per note for detuning (richness)
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();

            osc1.type = i % 2 === 0 ? "sine" : "triangle";
            osc2.type = "sine";

            osc1.frequency.value = freq;
            osc2.frequency.value = freq * 1.01; // Detune slightly

            // Individual LFO for slowly modulating amplitude (breathing effect)
            const lfo = ctx.createOscillator();
            lfo.type = "sine";
            lfo.frequency.value = 0.1 + Math.random() * 0.1; // Slow breathing

            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 0.3; // Depth

            const noteGain = ctx.createGain();
            noteGain.gain.value = 0.5;

            lfo.connect(lfoGain);
            lfoGain.connect(noteGain.gain);

            osc1.connect(noteGain);
            osc2.connect(noteGain);
            noteGain.connect(masterGain);

            osc1.start();
            osc2.start();
            lfo.start();

            musicNodesRef.current.push(osc1, osc2, lfo);
        });

        setIsMusicPlaying(true);
    };

    const toggleMusic = () => {
        if (isMusicPlaying) {
            stopMusic();
        } else {
            startMusic();
        }
    };

    // Watch volume/mute changes for running music
    useEffect(() => {
        if (gainNodeRef.current && audioCtxRef.current) {
            const targetGain = muted ? 0 : 0.15 * volume;
            gainNodeRef.current.gain.setTargetAtTime(targetGain, audioCtxRef.current.currentTime, 0.2);
        }
    }, [volume, muted]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            musicNodesRef.current.forEach(n => { try { n.stop(); } catch (e) { } });
        };
    }, []);

    return (
        <SoundContext.Provider value={{
            playSuccess,
            playNotification,
            playClick,
            toggleMusic,
            isMusicPlaying,
            volume,
            setVolume,
            muted,
            setMuted
        }}>
            {children}
        </SoundContext.Provider>
    );
}
