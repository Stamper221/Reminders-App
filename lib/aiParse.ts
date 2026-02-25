"use server"

import OpenAI from 'openai';
import { z } from "zod";

// Shared function to validate statement structure
export async function normalizeTransactionsWithAI(rawTextChunks: string[], userId: string) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is missing');
    }

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const TransactionSchema = z.object({
        transactions: z.array(z.object({
            date: z.string().describe("ISO formatted YYYY-MM-DD or YYYY-MM-DDT00:00:00Z"),
            merchant: z.string().describe("Cleaned up merchant name"),
            amount: z.number().describe("Unsigned float amount"),
            direction: z.enum(['income', 'expense', 'other_deposit']),
            originalDescription: z.string(),
            category: z.string().describe("Broad personal finance category, e.g. 'Groceries', 'Utilities', 'Subscription'")
        }))
    });

    // Chunk logic: Limit the total raw chunks to 10 for speed so we don't timeout standard Vercel serverless functions (which kill requests after 10-60s)
    const combinedText = rawTextChunks.slice(0, 10).join('\n---\n');

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // fast and cheap for structured parsing
            messages: [
                {
                    role: "system",
                    content: `You are a bank statement parser. Extract ALL transactions accurately.
                    Return a JSON object with a single root key "transactions" containing an array of objects.
                    Each object must strictly have these exact keys and types:
                    - date (string, YYYY-MM-DD)
                    - merchant (string, cleaned up name of the merchant/sender from the description)
                    - amount (number, absolute unsigned value)
                    - direction (string, exactly "income", "expense", or "other_deposit")
                    - originalDescription (string, the raw original text)
                    - category (string, your best guess for a broad personal finance category)
                    
                    CRITICAL CLASSIFICATION RULES:
                    1. Treat ALL withdrawals/outflows as "expense" (they should count toward spending).
                    2. "income" must be based on DIRECT DEPOSIT patterns ONLY (e.g. payroll-like, employer names, consistent cadence/amounts).
                    3. Any other inward deposits (account transfers, refunds, Zelle/Venmo inward, cash deposits, random credits) MUST be classified as "other_deposit".
                    4. Do NOT include internal account transfers between checking/savings. Ignore them completely.
                    5. For "other_deposit", default their category to "Other Deposits" or "Credits".`
                },
                {
                    role: "user",
                    content: `Parse the following raw text extract from a bank statement:\n\n${combinedText}`
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        // Normally we'd use zod function calling, but structured JSON works well in GPT-4o-mini
        const content = response.choices[0].message.content;
        if (!content) return [];

        const parsed = JSON.parse(content);
        return parsed.transactions || [];
    } catch (e: any) {
        console.error("AI Parse Error:", e);
        throw new Error("Failed to extract statement text using AI");
    }
}
