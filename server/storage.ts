import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import type {
  User,
  InsertUser,
  SafeUser,
  Board,
  InsertBoard,
  Column,
  InsertColumn,
  Card,
  InsertCard,
  Comment,
  InsertComment,
  Call,
  InsertCall,
} from "../shared/schema.js";

// ---------------------------------------------------------------------------
// Supabase client — uses REST/PostgREST, no direct Postgres connection needed.
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// No-op bootstrap — schema is managed via Supabase MCP.
// ---------------------------------------------------------------------------
export async function bootstrap() {
  // no-op: schema is already applied via the Supabase MCP
}

// ---------------------------------------------------------------------------
// Strip password helper
// ---------------------------------------------------------------------------
const stripPwd = (u: User): SafeUser => {
  const { password, ...rest } = u;
  return rest;
};

// ---------------------------------------------------------------------------
// Row mappers: snake_case DB rows → camelCase-like typed objects
// We keep the DB shape (snake_case) on the returned types since we updated
// shared/schema.ts to use snake_case fields. These mappers just ensure
// the data is the right shape and handle JSON parsing for tags.
// ---------------------------------------------------------------------------
function toUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    password: row.password,
    phone: row.phone ?? null,
    standup_time: row.standup_time ?? null,
    eod_time: row.eod_time ?? null,
    timezone: row.timezone ?? null,
    created_at: row.created_at ?? null,
  };
}

function toBoard(row: any): Board {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    kind: row.kind,
    owner_id: row.owner_id ?? null,
    shared: row.shared ?? false,
    created_at: row.created_at ?? null,
  };
}

function toColumn(row: any): Column {
  return {
    id: row.id,
    board_id: row.board_id,
    name: row.name,
    position: row.position,
  };
}

function toCard(row: any): Card {
  return {
    id: row.id,
    board_id: row.board_id,
    column_id: row.column_id,
    title: row.title,
    description: row.description ?? null,
    assignee_id: row.assignee_id ?? null,
    priority: row.priority ?? null,
    tags: row.tags ?? "[]",
    due_date: row.due_date ?? null,
    position: row.position ?? 0,
    source: row.source ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function toComment(row: any): Comment {
  return {
    id: row.id,
    card_id: row.card_id,
    author_id: row.author_id,
    body: row.body,
    created_at: row.created_at ?? null,
  };
}

function toCall(row: any): Call {
  return {
    id: row.id,
    user_id: row.user_id,
    kind: row.kind,
    status: row.status,
    scheduled_for: row.scheduled_for,
    started_at: row.started_at ?? null,
    ended_at: row.ended_at ?? null,
    twilio_call_sid: row.twilio_call_sid ?? null,
    elevenlabs_conversation_id: row.elevenlabs_conversation_id ?? null,
    transcript: row.transcript ?? null,
    summary: row.summary ?? null,
    mood: row.mood ?? null,
    action_items_created: row.action_items_created ?? null,
  };
}

// ---------------------------------------------------------------------------
// Insert/update mappers: camelCase input → snake_case DB columns
// ---------------------------------------------------------------------------
function fromBoard(input: InsertBoard) {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    kind: input.kind,
    owner_id: input.ownerId ?? null,
    shared: input.shared ?? false,
  };
}

function fromColumn(input: InsertColumn) {
  return {
    board_id: input.boardId,
    name: input.name,
    position: input.position,
  };
}

function fromCard(input: Partial<InsertCard>) {
  const row: any = {};
  if (input.boardId !== undefined) row.board_id = input.boardId;
  if (input.columnId !== undefined) row.column_id = input.columnId;
  if (input.title !== undefined) row.title = input.title;
  if (input.description !== undefined) row.description = input.description ?? null;
  if (input.assigneeId !== undefined) row.assignee_id = input.assigneeId ?? null;
  if (input.priority !== undefined) row.priority = input.priority ?? null;
  if (input.tags !== undefined) {
    if (Array.isArray(input.tags)) {
      row.tags = JSON.stringify(input.tags);
    } else {
      row.tags = input.tags ?? "[]";
    }
  }
  if (input.dueDate !== undefined) {
    if (input.dueDate instanceof Date) {
      row.due_date = input.dueDate.toISOString();
    } else {
      row.due_date = input.dueDate ?? null;
    }
  }
  if (input.position !== undefined) row.position = input.position;
  if (input.source !== undefined) row.source = input.source ?? null;
  return row;
}

function fromComment(input: InsertComment) {
  return {
    card_id: input.cardId,
    author_id: input.authorId,
    body: input.body,
  };
}

function fromCall(input: Partial<InsertCall>) {
  const row: any = {};
  if (input.userId !== undefined) row.user_id = input.userId;
  if (input.kind !== undefined) row.kind = input.kind;
  if (input.status !== undefined) row.status = input.status;
  if (input.scheduledFor !== undefined) {
    row.scheduled_for = input.scheduledFor instanceof Date
      ? input.scheduledFor.toISOString()
      : input.scheduledFor;
  }
  if (input.startedAt !== undefined) {
    row.started_at = input.startedAt instanceof Date
      ? input.startedAt.toISOString()
      : (input.startedAt ?? null);
  }
  if (input.endedAt !== undefined) {
    row.ended_at = input.endedAt instanceof Date
      ? input.endedAt.toISOString()
      : (input.endedAt ?? null);
  }
  if (input.twilioCallSid !== undefined) row.twilio_call_sid = input.twilioCallSid ?? null;
  if (input.elevenlabsConversationId !== undefined) row.elevenlabs_conversation_id = input.elevenlabsConversationId ?? null;
  if (input.transcript !== undefined) row.transcript = input.transcript ?? null;
  if (input.summary !== undefined) row.summary = input.summary ?? null;
  if (input.mood !== undefined) row.mood = input.mood ?? null;
  if (input.actionItemsCreated !== undefined) row.action_items_created = input.actionItemsCreated ?? null;
  return row;
}

// ---------------------------------------------------------------------------
// IStorage interface
// ---------------------------------------------------------------------------
export interface IStorage {
  // users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  listUsers(): Promise<SafeUser[]>;
  createUser(input: InsertUser): Promise<User>;
  updateUser(id: number, patch: Partial<InsertUser>): Promise<SafeUser | undefined>;
  changePassword(id: number, newPassword: string): Promise<boolean>;
  verifyPassword(email: string, plain: string): Promise<User | null>;

  // boards
  listBoardsForUser(userId: number): Promise<Board[]>;
  getBoardBySlug(slug: string): Promise<Board | undefined>;
  getBoard(id: number): Promise<Board | undefined>;
  createBoard(input: InsertBoard): Promise<Board>;

  // columns
  listColumns(boardId: number): Promise<Column[]>;
  createColumn(input: InsertColumn): Promise<Column>;

  // cards
  listCards(boardId: number): Promise<Card[]>;
  getCard(id: number): Promise<Card | undefined>;
  createCard(input: InsertCard): Promise<Card>;
  updateCard(id: number, patch: Partial<InsertCard>): Promise<Card | undefined>;
  deleteCard(id: number): Promise<boolean>;
  moveCard(id: number, columnId: number, position: number): Promise<Card | undefined>;

  // comments
  listComments(cardId: number): Promise<Comment[]>;
  createComment(input: InsertComment): Promise<Comment>;

  // calls
  createCall(input: InsertCall): Promise<Call>;
  listCallsForUser(userId: number): Promise<Call[]>;
  updateCall(id: number, patch: Partial<InsertCall>): Promise<Call | undefined>;
}

// ---------------------------------------------------------------------------
// DatabaseStorage — Supabase JS client (REST/PostgREST)
// ---------------------------------------------------------------------------
export class DatabaseStorage implements IStorage {
  // ---------- users ----------
  async getUser(id: number): Promise<User | undefined> {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? toUser(data) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    return data ? toUser(data) : undefined;
  }

  async listUsers(): Promise<SafeUser[]> {
    const { data } = await supabase.from("users").select("*");
    return (data ?? []).map((r) => stripPwd(toUser(r)));
  }

  async createUser(input: InsertUser): Promise<User> {
    const hashed = await bcrypt.hash(input.password, 10);
    const { data, error } = await supabase
      .from("users")
      .insert({
        email: input.email.toLowerCase(),
        name: input.name,
        password: hashed,
        phone: input.phone ?? null,
        standup_time: input.standupTime ?? "09:00",
        eod_time: input.eodTime ?? "17:00",
        timezone: input.timezone ?? "America/New_York",
      })
      .select()
      .single();
    if (error) throw error;
    return toUser(data);
  }

  async updateUser(id: number, patch: Partial<InsertUser>): Promise<SafeUser | undefined> {
    const { password, ...rest } = patch;
    // Map camelCase fields to snake_case
    const update: any = {};
    if (rest.name !== undefined) update.name = rest.name;
    if (rest.phone !== undefined) update.phone = rest.phone ?? null;
    if (rest.standupTime !== undefined) update.standup_time = rest.standupTime;
    if (rest.eodTime !== undefined) update.eod_time = rest.eodTime;
    if (rest.timezone !== undefined) update.timezone = rest.timezone;
    if (rest.email !== undefined) update.email = rest.email.toLowerCase();

    const { data } = await supabase
      .from("users")
      .update(update)
      .eq("id", id)
      .select()
      .maybeSingle();
    return data ? stripPwd(toUser(data)) : undefined;
  }

  async changePassword(id: number, newPassword: string): Promise<boolean> {
    const hashed = await bcrypt.hash(newPassword, 10);
    const { data } = await supabase
      .from("users")
      .update({ password: hashed })
      .eq("id", id)
      .select();
    return (data ?? []).length > 0;
  }

  async verifyPassword(email: string, plain: string): Promise<User | null> {
    const u = await this.getUserByEmail(email);
    if (!u) return null;
    const ok = await bcrypt.compare(plain, u.password);
    return ok ? u : null;
  }

  // ---------- boards ----------
  async listBoardsForUser(userId: number): Promise<Board[]> {
    const { data } = await supabase
      .from("boards")
      .select("*")
      .or(`shared.eq.true,owner_id.eq.${userId}`)
      .order("id");
    return (data ?? []).map(toBoard);
  }

  async getBoardBySlug(slug: string): Promise<Board | undefined> {
    const { data } = await supabase
      .from("boards")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    return data ? toBoard(data) : undefined;
  }

  async getBoard(id: number): Promise<Board | undefined> {
    const { data } = await supabase
      .from("boards")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? toBoard(data) : undefined;
  }

  async createBoard(input: InsertBoard): Promise<Board> {
    const { data, error } = await supabase
      .from("boards")
      .insert(fromBoard(input))
      .select()
      .single();
    if (error) throw error;
    return toBoard(data);
  }

  // ---------- columns ----------
  async listColumns(boardId: number): Promise<Column[]> {
    const { data } = await supabase
      .from("columns")
      .select("*")
      .eq("board_id", boardId)
      .order("position");
    return (data ?? []).map(toColumn);
  }

  async createColumn(input: InsertColumn): Promise<Column> {
    const { data, error } = await supabase
      .from("columns")
      .insert(fromColumn(input))
      .select()
      .single();
    if (error) throw error;
    return toColumn(data);
  }

  // ---------- cards ----------
  async listCards(boardId: number): Promise<Card[]> {
    const { data } = await supabase
      .from("cards")
      .select("*")
      .eq("board_id", boardId)
      .order("position");
    return (data ?? []).map(toCard);
  }

  async getCard(id: number): Promise<Card | undefined> {
    const { data } = await supabase
      .from("cards")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? toCard(data) : undefined;
  }

  async createCard(input: InsertCard): Promise<Card> {
    const row = fromCard(input);
    row.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("cards")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return toCard(data);
  }

  async updateCard(id: number, patch: Partial<InsertCard>): Promise<Card | undefined> {
    const row = fromCard(patch);
    row.updated_at = new Date().toISOString();
    const { data } = await supabase
      .from("cards")
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();
    return data ? toCard(data) : undefined;
  }

  async deleteCard(id: number): Promise<boolean> {
    const { data } = await supabase
      .from("cards")
      .delete()
      .eq("id", id)
      .select();
    return (data ?? []).length > 0;
  }

  async moveCard(id: number, columnId: number, position: number): Promise<Card | undefined> {
    const { data } = await supabase
      .from("cards")
      .update({ column_id: columnId, position, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    return data ? toCard(data) : undefined;
  }

  // ---------- comments ----------
  async listComments(cardId: number): Promise<Comment[]> {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("card_id", cardId)
      .order("created_at");
    return (data ?? []).map(toComment);
  }

  async createComment(input: InsertComment): Promise<Comment> {
    const { data, error } = await supabase
      .from("comments")
      .insert(fromComment(input))
      .select()
      .single();
    if (error) throw error;
    return toComment(data);
  }

  // ---------- calls ----------
  async createCall(input: InsertCall): Promise<Call> {
    const { data, error } = await supabase
      .from("calls")
      .insert(fromCall(input))
      .select()
      .single();
    if (error) throw error;
    return toCall(data);
  }

  async listCallsForUser(userId: number): Promise<Call[]> {
    const { data } = await supabase
      .from("calls")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_for", { ascending: false });
    return (data ?? []).map(toCall);
  }

  async updateCall(id: number, patch: Partial<InsertCall>): Promise<Call | undefined> {
    const { data } = await supabase
      .from("calls")
      .update(fromCall(patch))
      .eq("id", id)
      .select()
      .maybeSingle();
    return data ? toCall(data) : undefined;
  }
}

export const storage = new DatabaseStorage();
export { stripPwd };

// seedIfEmpty is no longer needed — data is seeded via MCP
export async function seedIfEmpty() {
  // no-op: seed data inserted via Supabase MCP
}
