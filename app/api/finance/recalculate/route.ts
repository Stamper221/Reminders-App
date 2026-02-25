import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { recalculateAllInsights } from "@/lib/financeAggregation";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

        await recalculateAllInsights(decodedUser.uid);

        return NextResponse.json({ success: true, message: "Recalculated successfully" });
    } catch (error: any) {
        console.error("Recalculate Route Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
