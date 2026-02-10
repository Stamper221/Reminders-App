"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
(0, globals_1.describe)('Scheduler Logic', () => {
    (0, globals_1.it)('should calculate 24h window correctly', () => {
        const now = new Date('2023-01-01T12:00:00Z');
        const target24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const start24h = new Date(target24h.getTime() - 3 * 60 * 1000);
        const end24h = new Date(target24h.getTime() + 3 * 60 * 1000);
        (0, globals_1.expect)(target24h.toISOString()).toBe('2023-01-02T12:00:00.000Z');
        (0, globals_1.expect)(start24h.toISOString()).toBe('2023-01-02T11:57:00.000Z');
        (0, globals_1.expect)(end24h.toISOString()).toBe('2023-01-02T12:03:00.000Z');
    });
    (0, globals_1.it)('should calculate 3h window correctly', () => {
        const now = new Date('2023-01-01T12:00:00Z');
        const target3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
        (0, globals_1.expect)(target3h.toISOString()).toBe('2023-01-01T15:00:00.000Z');
    });
});
//# sourceMappingURL=scheduler.test.js.map