import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(request: NextRequest) {
    try {
        const { to, body } = await request.json();

        if (!to || !body) {
            return NextResponse.json(
                { error: "Missing 'to' or 'body' in request" },
                { status: 400 }
            );
        }

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (!accountSid || !authToken || !fromNumber) {
            return NextResponse.json(
                { error: "Twilio credentials not configured on the server" },
                { status: 500 }
            );
        }

        const client = twilio(accountSid, authToken);

        const message = await client.messages.create({
            body,
            from: fromNumber,
            to,
        });

        return NextResponse.json({ success: true, sid: message.sid });
    } catch (error: any) {
        console.error("SMS send error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to send SMS" },
            { status: 500 }
        );
    }
}
