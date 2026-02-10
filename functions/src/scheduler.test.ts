import { describe, it, expect } from '@jest/globals';

describe('Scheduler Logic', () => {
    it('should calculate 24h window correctly', () => {
        const now = new Date('2023-01-01T12:00:00Z');
        const target24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const start24h = new Date(target24h.getTime() - 3 * 60 * 1000);
        const end24h = new Date(target24h.getTime() + 3 * 60 * 1000);

        expect(target24h.toISOString()).toBe('2023-01-02T12:00:00.000Z');
        expect(start24h.toISOString()).toBe('2023-01-02T11:57:00.000Z');
        expect(end24h.toISOString()).toBe('2023-01-02T12:03:00.000Z');
    });

    it('should calculate 3h window correctly', () => {
        const now = new Date('2023-01-01T12:00:00Z');
        const target3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);

        expect(target3h.toISOString()).toBe('2023-01-01T15:00:00.000Z');
    });
});
