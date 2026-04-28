import { pgTable, text, integer, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =====================================================================
// USERS — Brian and Stephanie are seeded; the app is closed-beta only.
// =====================================================================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(), // bcrypt hash
  phone: text("phone"), // E.164 format for Twilio
  standupTime: text("standup_time").default("09:00"), // HH:MM 24h, user's local TZ
  eodTime: text("eod_time").default("17:00"),
  timezone: text("timezone").default("America/New_York"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "password">;

// =====================================================================
// BOARDS
//   - Personal boards: ownerId set, shared = false → only that user sees it
//   - Business boards: ownerId set, shared = true  → all users see it
//   - PowerWyze:       ownerId null, shared = true  → company-wide
// =====================================================================
export const boards = pgTable("boards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  kind: text("kind").notNull(), // "personal" | "business" | "company"
  ownerId: integer("owner_id").references(() => users.id), // null for company board
  shared: boolean("shared").notNull().default(false),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
});

export const insertBoardSchema = createInsertSchema(boards).omit({ id: true, createdAt: true });
export type InsertBoard = z.infer<typeof insertBoardSchema>;
export type Board = typeof boards.$inferSelect;

// =====================================================================
// COLUMNS — Backlog / In Progress / Blocked / Done by default
// =====================================================================
export const columns = pgTable("columns", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
});

export const insertColumnSchema = createInsertSchema(columns).omit({ id: true });
export type InsertColumn = z.infer<typeof insertColumnSchema>;
export type Column = typeof columns.$inferSelect;

// =====================================================================
// CARDS
// =====================================================================
export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  columnId: integer("column_id").notNull().references(() => columns.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: integer("assignee_id").references(() => users.id),
  priority: text("priority").default("medium"), // "low" | "medium" | "high"
  tags: text("tags").default("[]"), // JSON array of strings
  dueDate: timestamp("due_date"),
  position: integer("position").notNull().default(0),
  source: text("source").default("manual"), // manual | standup | eod | chat
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});

export const insertCardSchema = createInsertSchema(cards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cards.$inferSelect;

// =====================================================================
// COMMENTS
// =====================================================================
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
});

export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// =====================================================================
// CALLS — every standup / EOD call we place via Twilio + ElevenLabs
// =====================================================================
export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // "standup" | "eod"
  status: text("status").notNull().default("scheduled"), // "scheduled"|"dialing"|"in_progress"|"completed"|"failed"
  scheduledFor: timestamp("scheduled_for").notNull(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  twilioCallSid: text("twilio_call_sid"),
  elevenlabsConversationId: text("elevenlabs_conversation_id"),
  transcript: text("transcript"), // full transcript JSON
  summary: text("summary"),
  mood: text("mood"), // user's "how are you" answer
  actionItemsCreated: integer("action_items_created").default(0),
});

export const insertCallSchema = createInsertSchema(calls).omit({ id: true });
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;
