import twilio from "twilio";
import * as functions from "firebase-functions";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export const sendSMS = async (to: string, body: string) => {
    if (!client) {
        functions.logger.warn("Twilio credentials not set, skipping SMS", { to, body });
        return false;
    }

    try {
        const message = await client.messages.create({
            body,
            from: fromNumber,
            to,
        });
        functions.logger.info("SMS sent", { sid: message.sid, to });
        return true;
    } catch (error) {
        functions.logger.error("Error sending SMS", error);
        return false;
    }
};
