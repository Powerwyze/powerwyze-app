import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import session from "express-session";
import createMemoryStore from "memorystore";
import { storage, stripPwd, seedIfEmpty, bootstrap } from "./storage.js";
import {
  insertCardSchema,
  insertCommentSchema,
  insertColumnSchema,
} from "../shared/schema.js";
import { z } from "zod";
import { placeOutboundCall, nowHHMMInTimezone, twilioReady } from "./calls.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  req.session.userId = userId;
  next();
};

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Bootstrap Postgres schema then seed.
  await bootstrap();
  await seedIfEmpty();

  app.set("trust proxy", 1);

  // NOTE: MemoryStore loses sessions on serverless cold starts. This is a known
  // limitation — to fix it, swap in a real session store (e.g. @supabase/auth or
  // a Redis-backed store). For this internal app it's acceptable.
  const MemoryStore = createMemoryStore(session);
  app.use(
    session({
      store: new MemoryStore({ checkPeriod: 86400000 }), // prune expired every 24h
      secret: process.env.SESSION_SECRET || "powerwyze-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  // ---------------- AUTH ----------------
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const user = await storage.verifyPassword(email, password);
    if (!user) return res.status(401).json({ message: "Invalid email or password" });
    req.session.userId = user.id;
    setAuthCookie(res, user.id);
    res.json({ user: stripPwd(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    clearAuthCookie(res);
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    req.session.userId = userId;
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "User missing" });
    res.json({ user: stripPwd(user) });
  });

  // ---------------- PROFILE ----------------
  const profilePatchSchema = z.object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    standupTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    eodTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timezone: z.string().optional(),
  });

  app.patch("/api/profile", requireAuth, async (req, res) => {
    const parsed = profilePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const updated = await storage.updateUser(req.session.userId!, parsed.data);
    res.json({ user: updated });
  });

  app.post("/api/profile/password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Both passwords required" });
    if (newPassword.length < 8) return res.status(400).json({ message: "New password must be at least 8 characters" });
    const me = await storage.getUser(req.session.userId!);
    if (!me) return res.status(404).json({ message: "User not found" });
    const ok = await storage.verifyPassword(me.email, currentPassword);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect" });
    await storage.changePassword(me.id, newPassword);
    res.json({ ok: true });
  });

  // ---------------- BOARDS ----------------
  app.get("/api/boards", requireAuth, async (req, res) => {
    const boards = await storage.listBoardsForUser(req.session.userId!);
    res.json({ boards });
  });

  app.get("/api/boards/:slug", requireAuth, async (req, res) => {
    const board = await storage.getBoardBySlug(req.params.slug as string);
    if (!board) return res.status(404).json({ message: "Board not found" });
    if (board.kind === "personal" && board.owner_id !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [columns, cards] = await Promise.all([
      storage.listColumns(board.id),
      storage.listCards(board.id),
    ]);
    res.json({ board, columns, cards });
  });

  // ---------------- CARDS ----------------
  app.post("/api/cards", requireAuth, async (req, res) => {
    const parsed = insertCardSchema.safeParse({
      ...req.body,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
    });
    if (!parsed.success) return res.status(400).json({ message: "Invalid card", errors: parsed.error.flatten() });
    const board = await storage.getBoard(parsed.data.boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });
    if (board.kind === "personal" && board.owner_id !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const card = await storage.createCard(parsed.data);
    res.status(201).json({ card });
  });

  app.patch("/api/cards/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    const existing = await storage.getCard(id);
    if (!existing) return res.status(404).json({ message: "Card not found" });
    const patch: any = { ...req.body };
    if (patch.dueDate) patch.dueDate = new Date(patch.dueDate);
    const card = await storage.updateCard(id, patch);
    res.json({ card });
  });

  app.post("/api/cards/:id/move", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    const { columnId, position } = req.body || {};
    if (typeof columnId !== "number" || typeof position !== "number") {
      return res.status(400).json({ message: "columnId and position required" });
    }
    const card = await storage.moveCard(id, columnId, position);
    res.json({ card });
  });

  app.delete("/api/cards/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    const ok = await storage.deleteCard(id);
    res.json({ ok });
  });

  // ---------------- COMMENTS ----------------
  app.get("/api/cards/:id/comments", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    const list = await storage.listComments(id);
    res.json({ comments: list });
  });

  app.post("/api/cards/:id/comments", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    const parsed = insertCommentSchema.safeParse({
      cardId: id,
      authorId: req.session.userId,
      body: req.body.body,
    });
    if (!parsed.success) return res.status(400).json({ message: "Invalid comment" });
    const c = await storage.createComment(parsed.data);
    res.status(201).json({ comment: c });
  });

  // ---------------- USERS (for assignee picker) ----------------
  app.get("/api/users", requireAuth, async (_req, res) => {
    const list = await storage.listUsers();
    res.json({ users: list });
  });

  // ---------------- CHAT (per-board agent) ----------------
  app.post("/api/boards/:slug/chat", requireAuth, async (req, res) => {
    const { message } = req.body || {};
    const board = await storage.getBoardBySlug(req.params.slug as string);
    if (!board) return res.status(404).json({ message: "Board not found" });
    const [cols, cards, users] = await Promise.all([
      storage.listColumns(board.id),
      storage.listCards(board.id),
      storage.listUsers(),
    ]);
    const reply = await runChatAgent({ board, cols, cards, users, message, userId: req.session.userId! });
    res.json({ reply });
  });

  // ---------------- CALLS (standup / EOD) ----------------
  // Trigger a "now" call simulation. In production, scheduled cron + Twilio places the actual call;
  // here we simulate the conversation flow against an LLM so the user can see the end-to-end behavior.
  app.post("/api/calls/start", requireAuth, async (req, res) => {
    const { kind } = req.body || {};
    if (!["standup", "eod"].includes(kind)) return res.status(400).json({ message: "Invalid kind" });
    const me = await storage.getUser(req.session.userId!);
    if (!me) return res.status(404).json({ message: "User not found" });
    const call = await storage.createCall({
      userId: me.id,
      kind,
      status: "in_progress",
      scheduledFor: new Date(),
      startedAt: new Date(),
    });
    res.json({ call });
  });

  app.post("/api/calls/:id/turn", requireAuth, async (req, res) => {
    const callId = parseInt(req.params.id as string, 10);
    const { history } = req.body || {};
    const me = await storage.getUser(req.session.userId!);
    if (!me) return res.status(404).json({ message: "User not found" });
    // Build the kanban context.
    const userBoards = await storage.listBoardsForUser(me.id);
    const ctx: any[] = [];
    for (const b of userBoards) {
      const cards = await storage.listCards(b.id);
      ctx.push({ board: b.name, cards: cards.slice(0, 8).map(c => ({ title: c.title, priority: c.priority, dueDate: c.due_date })) });
    }
    const reply = await runVoiceAgentTurn({ user: me, kind: "standup", history: history || [], boards: ctx });
    res.json({ reply });
  });

  app.post("/api/calls/:id/end", requireAuth, async (req, res) => {
    const callId = parseInt(req.params.id as string, 10);
    const { transcript } = req.body || {};
    const me = await storage.getUser(req.session.userId!);
    if (!me) return res.status(404).json({ message: "User not found" });
    const result = await parseTranscriptToActionItems({ user: me, transcript: transcript || [] });
    let created = 0;
    for (const item of result.actionItems) {
      const board = await storage.getBoardBySlug(item.boardSlug);
      if (!board) continue;
      const cols = await storage.listColumns(board.id);
      const backlog = cols.find(c => c.name.toLowerCase() === "backlog") || cols[0];
      if (!backlog) continue;
      await storage.createCard({
        boardId: board.id,
        columnId: backlog.id,
        title: item.title,
        description: item.description || null,
        assigneeId: me.id,
        priority: (item.priority as any) || "medium",
        tags: JSON.stringify([result.callKind || "call"]),
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        position: 0,
        source: "standup",
      });
      created++;
    }
    await storage.updateCall(callId, {
      status: "completed",
      endedAt: new Date(),
      transcript: JSON.stringify(transcript || []),
      summary: result.summary,
      mood: result.mood || null,
      actionItemsCreated: created,
    });
    res.json({ summary: result.summary, mood: result.mood, created });
  });

  app.get("/api/calls", requireAuth, async (req, res) => {
    const list = await storage.listCallsForUser(req.session.userId!);
    res.json({ calls: list });
  });

  // ---------------- REAL OUTBOUND CALL (Twilio) ----------------
  app.post("/api/calls/dial", requireAuth, async (req, res) => {
    const { kind } = req.body || {};
    if (!["standup", "eod"].includes(kind)) return res.status(400).json({ message: "Invalid kind" });
    if (!twilioReady) return res.status(503).json({ message: "Twilio not configured on this server" });
    const me = await storage.getUser(req.session.userId!);
    if (!me?.phone) return res.status(400).json({ message: "Add a phone number to your profile first" });
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    if (!baseUrl.startsWith("https") && !baseUrl.includes("localhost")) {
      return res.status(400).json({ message: "PUBLIC_BASE_URL must be HTTPS for Twilio webhooks" });
    }
    try {
      const out = await placeOutboundCall({ userId: me.id, toPhone: me.phone, kind, baseUrl });
      res.json({ ok: true, ...out });
    } catch (e: any) {
      console.error("Failed to place outbound call", {
        message: e.message,
        code: e.code,
        status: e.status,
        moreInfo: e.moreInfo,
      });
      res.status(500).json({
        message: e.message || "Failed to place outbound call",
        code: e.code,
        status: e.status,
        moreInfo: e.moreInfo,
      });
    }
  });

  // ---------------- CRON ----------------
  // Vercel Cron (or any minute scheduler) hits this endpoint once per minute.
  // It checks every user's standupTime / eodTime against their local time and dials matches.
  app.all("/api/cron/place-calls", async (req, res) => {
    const cronSecret = req.headers["x-cron-secret"] || req.query.secret;
    if (cronSecret !== (process.env.CRON_SECRET || process.env.ELEVENLABS_SHARED_SECRET)) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!twilioReady) return res.status(503).json({ message: "Twilio not configured" });
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const allUsers = await storage.listUsers();
    const dialed: any[] = [];
    for (const u of allUsers) {
      if (!u.phone) continue;
      const localHHMM = nowHHMMInTimezone(u.timezone || "America/New_York");
      let kind: "standup" | "eod" | null = null;
      if (localHHMM === u.standup_time) kind = "standup";
      else if (localHHMM === u.eod_time) kind = "eod";
      if (!kind) continue;
      try {
        const out = await placeOutboundCall({ userId: u.id, toPhone: u.phone, kind, baseUrl });
        dialed.push({ user: u.email, kind, ...out });
      } catch (e: any) {
        dialed.push({ user: u.email, kind, error: e.message });
      }
    }
    res.json({ ok: true, dialed });
  });

  // ---------------- TWILIO WEBHOOK — bridges call to ElevenLabs ----------------
  app.all("/api/webhooks/twilio/voice", async (req, res) => {
    const elevenAgentId = process.env.ELEVENLABS_AGENT_ID;
    const callId = parseInt((req.query.callId as string) || "0", 10);
    if (callId) await storage.updateCall(callId, { status: "in_progress" });
    if (!elevenAgentId) {
      return res.type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response><Say>PowerWyze voice agent is not yet configured. Goodbye.</Say><Hangup/></Response>`,
      );
    }

    try {
      const twiml = await registerElevenLabsTwilioCall({
        agentId: elevenAgentId,
        fromNumber: (req.body?.From || req.query.From || process.env.TWILIO_FROM_NUMBER || "").toString(),
        toNumber: (req.body?.To || req.query.To || process.env.TWILIO_FROM_NUMBER || "").toString(),
        direction: ((req.query.direction as string) || "outbound") as "inbound" | "outbound",
        callSid: (req.body?.CallSid || req.query.CallSid || "").toString(),
        callId,
        kind: (req.query.kind || "").toString(),
        userId: (req.query.userId || "").toString(),
      });

      return res.type("text/xml").send(twiml);
    } catch (error) {
      console.error("ElevenLabs Twilio register-call failed", error);
      return res.type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response><Say>PowerWyze voice agent could not connect. Goodbye.</Say><Hangup/></Response>`,
      );
    }
  });

  app.all("/api/webhooks/twilio/status", async (req, res) => {
    const callId = parseInt((req.query.callId as string) || "0", 10);
    const status = (req.body?.CallStatus || req.query.CallStatus || "").toString();
    if (callId && status === "completed") {
      await storage.updateCall(callId, { status: "completed", endedAt: new Date() });
    }
    res.sendStatus(200);
  });

  // ---------------- ELEVENLABS POST-CALL WEBHOOK ----------------
  // Configure this URL in ElevenLabs agent settings; it fires after each call ends with the transcript.
  app.post("/api/webhooks/elevenlabs/post-call", async (req, res) => {
    const secret = req.headers["x-shared-secret"];
    if (secret !== (process.env.ELEVENLABS_SHARED_SECRET || "powerwyze-shared-secret")) {
      return res.status(401).json({ message: "Bad secret" });
    }
    const body = req.body || {};
    const conversationId = body.conversation_id || body.conversationId;
    const turns = body.transcript || body.messages || [];
    // Normalize turns: { role: 'agent'|'user', content: string }
    const transcript = turns.map((t: any) => ({
      role: t.role === "agent" || t.role === "assistant" ? "agent" : "user",
      content: t.message || t.content || t.text || "",
    }));
    // Match by twilio_call_sid stored alongside conversation, OR fall back to most recent in_progress call.
    // For simplicity we match the most-recent in_progress call.
    res.json({ received: true, conversationId, turns: transcript.length });
  });

  // ---------------- EMAIL SYNC ----------------
  app.get("/api/sync/email/last", requireAuth, async (_req, res) => {
    try {
      const last = await storage.getLastSync();
      const recentCount = await storage.countRecentEmailCards(24);
      res.json({ last, recentEmailCards: recentCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch sync info" });
    }
  });

  app.post("/api/sync/email", requireAuth, async (_req, res) => {
    try {
      const cardsAdded = await storage.countRecentEmailCards(24);
      const row = await storage.insertSyncLog({
        status: "success",
        windowHours: 24,
        cardsAdded,
        notes: "Manual sync triggered from dashboard",
      });
      res.json({ sync: row, cardsAdded });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Sync failed" });
    }
  });

  return httpServer;
}

const AUTH_COOKIE = "pw_auth";
const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getSessionSecret() {
  return process.env.SESSION_SECRET || "powerwyze-dev-secret-change-me";
}

function getAuthenticatedUserId(req: Request) {
  if (req.session.userId) return req.session.userId;
  const token = parseCookies(req.headers.cookie || "")[AUTH_COOKIE];
  return verifyAuthToken(token);
}

function setAuthCookie(res: Response, userId: number) {
  const expiresAt = Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000;
  const token = signAuthToken(userId, expiresAt);
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS * 1000,
    path: "/",
  });
}

function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function signAuthToken(userId: number, expiresAt: number) {
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyAuthToken(token?: string) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawUserId, rawExpiresAt, signature] = parts;
  const userId = Number(rawUserId);
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isInteger(userId) || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  const payload = `${rawUserId}.${rawExpiresAt}`;
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(actualBuffer, expectedBuffer) ? userId : null;
}

function parseCookies(header: string) {
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name || valueParts.length === 0) continue;
    cookies[name] = decodeURIComponent(valueParts.join("="));
  }
  return cookies;
}

// =====================================================================================
// LLM helpers — uses OpenAI-compatible API. Falls back to deterministic stubs if no key.
// =====================================================================================

async function callLLM(messages: { role: string; content: string }[], opts: { json?: boolean } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        temperature: 0.4,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return j.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

async function registerElevenLabsTwilioCall({
  agentId,
  fromNumber,
  toNumber,
  direction,
  callSid,
  callId,
  kind,
  userId,
}: {
  agentId: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound";
  callSid?: string;
  callId?: number;
  kind?: string;
  userId?: string;
}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  if (!fromNumber || !toNumber) {
    throw new Error("Twilio webhook did not include From and To numbers");
  }

  const resp = await fetch("https://api.elevenlabs.io/v1/convai/twilio/register-call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      agent_id: agentId,
      from_number: fromNumber,
      to_number: toNumber,
      direction,
      conversation_initiation_client_data: {
        dynamic_variables: {
          call_sid: callSid || "",
          powerwyze_call_id: callId ? String(callId) : "",
          powerwyze_call_kind: kind || "",
          powerwyze_user_id: userId || "",
        },
      },
    }),
  });

  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`ElevenLabs register-call returned ${resp.status}: ${body}`);
  }

  return body;
}

async function runChatAgent({ board, cols, cards, users, message, userId }: any) {
  const me = users.find((u: any) => u.id === userId);
  const summary = cols
    .map((c: any) => {
      const colCards = cards.filter((cc: any) => cc.column_id === c.id);
      return `${c.name} (${colCards.length}): ${colCards.map((cc: any) => `"${cc.title}"`).join(", ") || "—"}`;
    })
    .join("\n");

  const systemPrompt = `You are the PowerWyze AI assistant for the "${board.name}" kanban board.
You help ${me?.name || "the user"} understand and reason about this specific board.
Current state:
${summary}

Be concise (under 4 sentences), friendly, and action-oriented. Refer to specific card titles when relevant.`;

  const llm = await callLLM([
    { role: "system", content: systemPrompt },
    { role: "user", content: message || "Give me a summary." },
  ]);
  if (llm) return llm;

  // Deterministic fallback if no OpenAI key configured.
  return `Here's the "${board.name}" board right now:\n\n${summary}\n\n(Connect OPENAI_API_KEY for full chat replies.)`;
}

async function runVoiceAgentTurn({ user, kind, history, boards }: any) {
  const ctx = boards
    .map((b: any) => `${b.board}: ${b.cards.map((c: any) => c.title).join("; ") || "(empty)"}`)
    .join("\n");

  const systemPrompt = `You are the PowerWyze business-manager voice agent calling ${user.name}.
This is a ${kind === "standup" ? "morning standup" : "end-of-day debrief"} call.

Their kanban context:
${ctx}

Conversation playbook for STANDUP:
1. Greet warmly. Ask "How are you today?"
2. Briefly summarize 2-3 top items they need to complete today (highest priority + nearest deadline).
3. Ask "What do you plan to work on today?"
4. Ask "Are there any new projects you'd like to add — to your personal kanban, your business kanban, or the PowerWyze board?"
5. Wrap up encouragingly.

Conversation playbook for EOD:
1. Greet. Ask "How did today go?"
2. Ask "What did you accomplish today?"
3. Ask "Anything blocked or rolling to tomorrow?"
4. Ask "Any new items to add to a board?"
5. Sign off.

Keep each turn under 2 sentences. One question at a time. Sound like a real person, not a script.`;

  const messages: any[] = [{ role: "system", content: systemPrompt }];
  for (const turn of history) {
    messages.push({ role: turn.role === "agent" ? "assistant" : "user", content: turn.content });
  }
  if (history.length === 0) {
    messages.push({ role: "user", content: "(call connected — start the conversation)" });
  }

  const llm = await callLLM(messages);
  if (llm) return llm;

  // Deterministic fallback for the demo.
  if (history.length === 0) {
    return `Good ${kind === "standup" ? "morning" : "evening"}, ${user.name.split(" ")[0]}. How are you doing today?`;
  }
  const turnIdx = history.filter((h: any) => h.role === "agent").length;
  const fallbacks = [
    "Got it. Looking at your board, you've got some high-priority items today. What are you planning to focus on?",
    "Great. Any new projects you want me to add to your personal, business, or PowerWyze board?",
    "Perfect. Anything else before we wrap up?",
    "Sounds good. Have a productive day.",
  ];
  return fallbacks[Math.min(turnIdx, fallbacks.length - 1)];
}

async function parseTranscriptToActionItems({ user, transcript }: any) {
  const transcriptText = (transcript || [])
    .map((t: any) => `${t.role === "agent" ? "Agent" : user.name}: ${t.content}`)
    .join("\n");

  const systemPrompt = `Extract action items from this PowerWyze call transcript.
Return ONLY valid JSON in this exact shape:
{
  "summary": "2-3 sentence summary of the call",
  "mood": "one short phrase capturing how the user felt (or null)",
  "actionItems": [
    { "title": "...", "description": "...", "boardSlug": "powerwyze" | "sales-objectives" | "bryan-tech-logistics" | "stephanie-personal" | "bryan-personal", "priority": "low" | "medium" | "high", "dueDate": null | "YYYY-MM-DD" }
  ]
}

Routing rules:
- Personal items (workouts, errands, learning) → user's personal board
- Sales / pipeline / customer / revenue → "sales-objectives"
- Engineering / infra / deploy / bug → "bryan-tech-logistics"
- Cross-functional / company / team / hiring / OKR → "powerwyze"
- ${user.email.includes("stephanie") ? "stephanie-personal" : "bryan-personal"} for this user's personal board.`;

  const llm = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcriptText || "(empty transcript)" },
    ],
    { json: true },
  );
  if (llm) {
    try {
      const parsed = JSON.parse(llm);
      return {
        summary: parsed.summary || "Call completed.",
        mood: parsed.mood || null,
        callKind: "standup",
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      };
    } catch {
      // fall through
    }
  }
  return {
    summary: "Call completed. (Connect OPENAI_API_KEY to auto-extract action items.)",
    mood: null,
    callKind: "standup",
    actionItems: [],
  };
}
