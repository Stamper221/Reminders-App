import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import Papa from "papaparse";

export const dynamic = 'force-dynamic';
import { v4 as uuidv4 } from "uuid";
import crypto from 'crypto';

// Server-side OpenAI call
import { normalizeTransactionsWithAI } from "@/lib/aiParse";

async function verifyAuth(request: NextRequest) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.split("Bearer ")[1];
    try {
        const decoded = await adminAuth.verifyIdToken(token);
        return decoded;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const decodedUser = await verifyAuth(req);
        if (!decodedUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const uid = decodedUser.uid;
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // 1. Generate Fingerprint (Include filename to prevent false deduplication of identical generic exports)
        const hash = crypto.createHash('sha256');
        hash.update(file.name);
        hash.update(buffer);
        const fingerprint = hash.digest('hex');

        // 2. Check Dedupe Fingerprint
        const statementQuery = await adminDb.collection(`users/${uid}/finance_statements`)
            .where("fingerprint", "==", fingerprint).limit(1).get();

        if (!statementQuery.empty) {
            return NextResponse.json({ error: "This statement has already been uploaded." }, { status: 409 });
        }

        // 3. Extract Text based on type
        let textChunks: string[] = [];
        const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === "application/pdf";
        const isCSV = file.name.toLowerCase().endsWith('.csv') || file.type === "text/csv";

        if (isPDF) {
            try {
                // Dynamically require to avoid breaking Next.js static build
                const pdfParseModule = require("pdf-parse");
                const parser = pdfParseModule.default || pdfParseModule;
                const pdfData = await parser(buffer);
                textChunks = [pdfData.text];
                if (!pdfData.text || pdfData.text.trim().length < 50) {
                    return NextResponse.json({ error: "Image-based PDF detected. Please upload a structured CSV statement from your bank instead for better accuracy." }, { status: 400 });
                }
            } catch (e: any) {
                console.error("PDF Parsing Exception:", e);
                return NextResponse.json({ error: "Failed to parse PDF file: " + (e.message || "Unknown error") }, { status: 500 });
            }
        } else if (isCSV) {
            const csvText = buffer.toString('utf-8');
            const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
            // Stringify rows as chunks for the AI to parse consistently
            textChunks = [JSON.stringify(parsed.data)];
        } else {
            return NextResponse.json({ error: "Unsupported file type. Please use PDF or CSV." }, { status: 400 });
        }

        // 4. Create Statement Document explicitly indicating 'parsing' and store textChunks for the async worker
        const statementRef = adminDb.collection(`users/${uid}/finance_statements`).doc();
        const statementId = statementRef.id;

        await statementRef.set({
            uid,
            filename: file.name,
            fileType: isPDF ? 'pdf' : 'csv',
            uploadedAt: new Date(),
            parseStatus: 'parsing',
            fingerprint,
            rowCount: 0,
            textChunks // Save raw text into the database so the /analyze route can process it asynchronously
        });

        // Trigger the background analysis without awaiting it to keep the UI snappy
        // Since Vercel serverless functions die when the response is returned, the client needs to explicitly call /analyze 
        // to keep the worker alive, or we could use `fetch` asynchronously if deployed via custom Node.js. 
        // For Next.js/Vercel standard behavior, we return immediately and let the client hit the polling endpoint.

        return NextResponse.json({ success: true, statementId, status: 'parsing' });

    } catch (error: any) {
        console.error("Upload Route Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
