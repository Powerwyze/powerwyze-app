import {
  users,
  boards,
  columns,
  cards,
  comments,
  calls,
  type User,
  type InsertUser,
  type SafeUser,
  type Board,
  type InsertBoard,
  type Column,
  type InsertColumn,
  type Card,
  type InsertCard,
  type Comment,
  type InsertComment,
  type Call,
  type InsertCall,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql as vercelSql } from "@vercel/postgres";
import { eq, and, or, asc, desc, isNull, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const db = drizzle(vercelSql);

// ---------------------------------------------------------------------------
// Bootstrap — creates tables in Postgres if they don't exist.
// Runs once per cold-start (guarded by the `ready` promise in the handler).
// ---------------------------------------------------------------------------
export async function bootstrap() {
  await vercelSql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      standup_time TEXT DEFAULT '09:00',
      eod_time TEXT DEFAULT '17:00',
      timezone TEXT DEFAULT 'America/New_York',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await vercelSql`
    CREATE TABLE IF NOT EXISTS boards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      kind TEXT NOT NULL,
      owner_id INTEGER REFERENCES users(id),
      shared BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await vercelSql`
    CREATE TABLE IF NOT EXISTS columns (
      id SERIAL PRIMARY KEY,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    )
  `;

  await vercelSql`
    CREATE TABLE IF NOT EXISTS cards (
      id SERIAL PRIMARY KEY,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      assignee_id INTEGER REFERENCES users(id),
      priority TEXT DEFAULT 'medium',
      tags TEXT DEFAULT '[]',
      due_date TIMESTAMP,
      position INTEGER NOT NULL DEFAULT 0,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await vercelSql`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await vercelSql`
    CREATE TABLE IF NOT EXISTS calls (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      scheduled_for TIMESTAMP NOT NULL,
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      twilio_call_sid TEXT,
      elevenlabs_conversation_id TEXT,
      transcript TEXT,
      summary TEXT,
      mood TEXT,
      action_items_created INTEGER DEFAULT 0
    )
  `;
}

const stripPwd = (u: User): SafeUser => {
  const { password, ...rest } = u;
  return rest;
};

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

export class DatabaseStorage implements IStorage {
  // ---------- users ----------
  async getUser(id: number) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }
  async getUserByEmail(email: string) {
    const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    return rows[0];
  }
  async listUsers() {
    const all = await db.select().from(users);
    return all.map(stripPwd);
  }
  async createUser(input: InsertUser) {
    const hashed = await bcrypt.hash(input.password, 10);
    const rows = await db
      .insert(users)
      .values({ ...input, email: input.email.toLowerCase(), password: hashed })
      .returning();
    return rows[0];
  }
  async updateUser(id: number, patch: Partial<InsertUser>) {
    const { password, ...rest } = patch;
    const rows = await db.update(users).set(rest).where(eq(users.id, id)).returning();
    const updated = rows[0];
    return updated ? stripPwd(updated) : undefined;
  }
  async changePassword(id: number, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 10);
    const rows = await db.update(users).set({ password: hashed }).where(eq(users.id, id)).returning();
    return rows.length > 0;
  }
  async verifyPassword(email: string, plain: string) {
    const u = await this.getUserByEmail(email);
    if (!u) return null;
    const ok = await bcrypt.compare(plain, u.password);
    return ok ? u : null;
  }

  // ---------- boards ----------
  async listBoardsForUser(userId: number) {
    return db
      .select()
      .from(boards)
      .where(or(eq(boards.shared, true), eq(boards.ownerId, userId)))
      .orderBy(asc(boards.id));
  }
  async getBoardBySlug(slug: string) {
    const rows = await db.select().from(boards).where(eq(boards.slug, slug)).limit(1);
    return rows[0];
  }
  async getBoard(id: number) {
    const rows = await db.select().from(boards).where(eq(boards.id, id)).limit(1);
    return rows[0];
  }
  async createBoard(input: InsertBoard) {
    const rows = await db.insert(boards).values(input).returning();
    return rows[0];
  }

  // ---------- columns ----------
  async listColumns(boardId: number) {
    return db
      .select()
      .from(columns)
      .where(eq(columns.boardId, boardId))
      .orderBy(asc(columns.position));
  }
  async createColumn(input: InsertColumn) {
    const rows = await db.insert(columns).values(input).returning();
    return rows[0];
  }

  // ---------- cards ----------
  async listCards(boardId: number) {
    return db
      .select()
      .from(cards)
      .where(eq(cards.boardId, boardId))
      .orderBy(asc(cards.position));
  }
  async getCard(id: number) {
    const rows = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    return rows[0];
  }
  async createCard(input: InsertCard) {
    const rows = await db
      .insert(cards)
      .values({ ...input, updatedAt: new Date() })
      .returning();
    return rows[0];
  }
  async updateCard(id: number, patch: Partial<InsertCard>) {
    const rows = await db
      .update(cards)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(cards.id, id))
      .returning();
    return rows[0];
  }
  async deleteCard(id: number) {
    const rows = await db.delete(cards).where(eq(cards.id, id)).returning();
    return rows.length > 0;
  }
  async moveCard(id: number, columnId: number, position: number) {
    const rows = await db
      .update(cards)
      .set({ columnId, position, updatedAt: new Date() })
      .where(eq(cards.id, id))
      .returning();
    return rows[0];
  }

  // ---------- comments ----------
  async listComments(cardId: number) {
    return db
      .select()
      .from(comments)
      .where(eq(comments.cardId, cardId))
      .orderBy(asc(comments.createdAt));
  }
  async createComment(input: InsertComment) {
    const rows = await db.insert(comments).values(input).returning();
    return rows[0];
  }

  // ---------- calls ----------
  async createCall(input: InsertCall) {
    const rows = await db.insert(calls).values(input).returning();
    return rows[0];
  }
  async listCallsForUser(userId: number) {
    return db
      .select()
      .from(calls)
      .where(eq(calls.userId, userId))
      .orderBy(desc(calls.scheduledFor));
  }
  async updateCall(id: number, patch: Partial<InsertCall>) {
    const rows = await db.update(calls).set(patch).where(eq(calls.id, id)).returning();
    return rows[0];
  }
}

export const storage = new DatabaseStorage();
export { stripPwd };

// =========================================================
// SEED — Brian + Stephanie + their boards + PowerWyze board
// =========================================================
export async function seedIfEmpty() {
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) return;

  const brian = await storage.createUser({
    email: "bryan.stewart@powerwyze.com",
    name: "Bryan Stewart",
    password: "powerwyze123",
    phone: "+18577076043",
    standupTime: "09:00",
    eodTime: "17:00",
    timezone: "America/New_York",
  });
  const steph = await storage.createUser({
    email: "stephanie@powerwyze.com",
    name: "Stephanie",
    password: "powerwyze123",
    phone: "+19176731479",
    standupTime: "09:00",
    eodTime: "17:00",
    timezone: "America/New_York",
  });

  const defaultColumns = ["Backlog", "In Progress", "Blocked", "Done"];

  const boardsToMake: InsertBoard[] = [
    { name: "PowerWyze", slug: "powerwyze", description: "Company-wide board — shared by everyone.", kind: "company", ownerId: null as any, shared: true },
    { name: "Sales Objectives", slug: "sales-objectives", description: "Sales pipeline and targets — owned by Stephanie.", kind: "business", ownerId: steph.id, shared: true },
    { name: "Bryan — Technical & Logistics", slug: "bryan-tech-logistics", description: "Engineering, infra, and ops — owned by Bryan.", kind: "business", ownerId: brian.id, shared: true },
    { name: "Stephanie — Personal", slug: "stephanie-personal", description: "Stephanie's private board.", kind: "personal", ownerId: steph.id, shared: false },
    { name: "Bryan — Personal", slug: "bryan-personal", description: "Bryan's private board.", kind: "personal", ownerId: brian.id, shared: false },
  ];

  for (const b of boardsToMake) {
    const board = await storage.createBoard(b);
    for (let i = 0; i < defaultColumns.length; i++) {
      await storage.createColumn({ boardId: board.id, name: defaultColumns[i], position: i });
    }
  }

  // Sample cards so the demo has texture.
  const pwBoard = await storage.getBoardBySlug("powerwyze");
  if (pwBoard) {
    const cols = await storage.listColumns(pwBoard.id);
    await storage.createCard({
      boardId: pwBoard.id,
      columnId: cols[0].id,
      title: "Launch voice agent demo for prospect call",
      description: "Prep ElevenLabs demo with sample PowerWyze use case.",
      assigneeId: brian.id,
      priority: "high",
      tags: JSON.stringify(["demo", "voice-agent"]),
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      position: 0,
      source: "manual",
    });
    await storage.createCard({
      boardId: pwBoard.id,
      columnId: cols[1].id,
      title: "Finalize Q2 OKRs",
      description: "Stephanie + Bryan to align on top 3.",
      assigneeId: steph.id,
      priority: "medium",
      tags: JSON.stringify(["okr"]),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      position: 0,
      source: "manual",
    });
  }
}
