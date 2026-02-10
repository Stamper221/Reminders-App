"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer = __importStar(require("nodemailer"));
const logger = __importStar(require("firebase-functions/logger"));
// Use environment variables for SMTP config
// For Gmail, use an App Password (not your regular password)
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "587");
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const fromEmail = process.env.SMTP_FROM || smtpUser;
let transporter = null;
if (smtpUser && smtpPass) {
    transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    });
}
const sendEmail = async (to, subject, body) => {
    if (!transporter) {
        logger.warn("SMTP credentials not set, skipping email", { to, subject });
        return false;
    }
    try {
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
        logger.info("Email sent", { to, subject });
        return true;
    }
    catch (error) {
        logger.error("Error sending email", error);
        return false;
    }
};
exports.sendEmail = sendEmail;
//# sourceMappingURL=email.js.map