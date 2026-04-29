import { z } from "zod";

// =====================================================================
// USERS
// =====================================================================
export type User = {
  id: number;
  email: string;
  name: string;
  password: string; // bcrypt hash
  phone: string | null;
  standup_time: string | null; // HH:MM 24h
  eod_time: string | null;
  timezone: string | null;
  created_at: string | null;
};

export type SafeUser = Omit<User, "password">;

export const insertUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(1),
  phone: z.string().optional().nullable(),
  standupTime: z.string().optional().nullable(),
  eodTime: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;

// =====================================================================
// BOARDS
// =====================================================================
export type Board = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  kind: string;
  owner_id: number | null;
  shared: boolean;
  created_at: string | null;
};

export const insertBoardSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional().nullable(),
  kind: z.string().min(1),
  ownerId: z.number().optional().nullable(),
  shared: z.boolean().default(false),
});
export type InsertBoard = z.infer<typeof insertBoardSchema>;

// =====================================================================
// COLUMNS
// =====================================================================
export type Column = {
  id: number;
  board_id: number;
  name: string;
  position: number;
};

export const insertColumnSchema = z.object({
  boardId: z.number(),
  name: z.string().min(1),
  position: z.number(),
});
export type InsertColumn = z.infer<typeof insertColumnSchema>;

// =====================================================================
// CARDS
// =====================================================================
export type Card = {
  id: number;
  board_id: number;
  column_id: number;
  title: string;
  description: string | null;
  assignee_id: number | null;
  priority: string | null;
  tags: string | null; // JSON string in DB
  due_date: string | null;
  position: number;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export const insertCardSchema = z.object({
  boardId: z.number(),
  columnId: z.number(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assigneeId: z.number().optional().nullable(),
  priority: z.string().optional().nullable(),
  tags: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  dueDate: z.union([z.string(), z.date()]).optional().nullable(),
  position: z.number().default(0),
  source: z.string().optional().nullable(),
});
export type InsertCard = z.infer<typeof insertCardSchema>;

// =====================================================================
// COMMENTS
// =====================================================================
export type Comment = {
  id: number;
  card_id: number;
  author_id: number;
  body: string;
  created_at: string | null;
};

export const insertCommentSchema = z.object({
  cardId: z.number(),
  authorId: z.number(),
  body: z.string().min(1),
});
export type InsertComment = z.infer<typeof insertCommentSchema>;

// =====================================================================
// CALLS
// =====================================================================
export type Call = {
  id: number;
  user_id: number;
  kind: string;
  status: string;
  scheduled_for: string;
  started_at: string | null;
  ended_at: string | null;
  twilio_call_sid: string | null;
  elevenlabs_conversation_id: string | null;
  transcript: string | null;
  summary: string | null;
  mood: string | null;
  action_items_created: number | null;
};

export const insertCallSchema = z.object({
  userId: z.number(),
  kind: z.string(),
  status: z.string().default("scheduled"),
  scheduledFor: z.union([z.string(), z.date()]),
  startedAt: z.union([z.string(), z.date()]).optional().nullable(),
  endedAt: z.union([z.string(), z.date()]).optional().nullable(),
  twilioCallSid: z.string().optional().nullable(),
  elevenlabsConversationId: z.string().optional().nullable(),
  transcript: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  mood: z.string().optional().nullable(),
  actionItemsCreated: z.number().optional().nullable(),
});
export type InsertCall = z.infer<typeof insertCallSchema>;
