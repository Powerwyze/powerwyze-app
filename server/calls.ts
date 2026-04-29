import twilio from "twilio";
import { storage } from "./storage.js";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const twilioReady = !!(accountSid && authToken && fromNumber);
const client = twilioReady ? twilio(accountSid!, authToken!) : null;

export async function placeOutboundCall(opts: {
  userId: number;
  toPhone: string;
  kind: "standup" | "eod";
  baseUrl: string;
}) {
  if (!client) throw new Error("Twilio not configured");
  const call = await storage.createCall({
    userId: opts.userId,
    kind: opts.kind,
    status: "dialing",
    scheduledFor: new Date(),
    startedAt: new Date(),
  });
  const result = await client.calls.create({
    to: opts.toPhone,
    from: fromNumber!,
    url: `${opts.baseUrl}/api/webhooks/twilio/voice?callId=${call.id}&kind=${opts.kind}&userId=${opts.userId}`,
    statusCallback: `${opts.baseUrl}/api/webhooks/twilio/status?callId=${call.id}`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });
  await storage.updateCall(call.id, { twilioCallSid: result.sid });
  return { callId: call.id, twilioSid: result.sid };
}

// Returns "HH:MM" in the given IANA timezone right now.
export function nowHHMMInTimezone(tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const hh = parts.find((p) => p.type === "hour")?.value || "00";
  const mm = parts.find((p) => p.type === "minute")?.value || "00";
  return `${hh.padStart(2, "0")}:${mm}`;
}

export { twilioReady };
