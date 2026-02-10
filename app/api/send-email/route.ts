import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: NextRequest) {
    try {
        const { to, subject, body } = await request.json();

        if (!to || !subject || !body) {
            return NextResponse.json(
                { error: "Missing 'to', 'subject', or 'body' in request" },
                { status: 400 }
            );
        }

        const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
        const smtpPort = parseInt(process.env.SMTP_PORT || "587");
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const fromEmail = process.env.SMTP_FROM || smtpUser;

        if (!smtpUser || !smtpPass) {
            return NextResponse.json(
                { error: "SMTP credentials not configured on the server" },
                { status: 500 }
            );
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        await transporter.sendMail({
            from: `"Reminders App" <${fromEmail}>`,
            to,
            subject,
            text: body,
            html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                    <div style="background: linear-gradient(135deg, #6366f1, #a78bfa); padding: 16px 20px; border-radius: 12px 12px 0 0;">
                        <h2 style="color: white; margin: 0; font-size: 18px;">🔔 Reminders App</h2>
                    </div>
                    <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0;">${body}</p>
                    </div>
                    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 12px;">
                        Sent by your Reminders App
                    </p>
                </div>
            `,
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Email send error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to send email" },
            { status: 500 }
        );
    }
}
