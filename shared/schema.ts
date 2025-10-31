import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - Required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - Required for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Retell AI Agents
export const agents = pgTable("agents", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name").notNull(),
  voiceId: varchar("voice_id").notNull(),
  language: varchar("language").default("en-US"),
  responseEngineType: varchar("response_engine_type").notNull(),
  responsiveness: integer("responsiveness"),
  interruptionSensitivity: integer("interruption_sensitivity"),
  llmId: varchar("llm_id"),
  generalPrompt: text("general_prompt"),
  generalTools: jsonb("general_tools"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

// Phone Lists
export const phoneLists = pgTable("phone_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name").notNull(),
  description: text("description"),
  totalNumbers: integer("total_numbers").default(0),
  classification: varchar("classification"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPhoneListSchema = createInsertSchema(phoneLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPhoneList = z.infer<typeof insertPhoneListSchema>;
export type PhoneList = typeof phoneLists.$inferSelect;

// Phone Numbers
export const phoneNumbers = pgTable("phone_numbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listId: varchar("list_id").notNull().references(() => phoneLists.id, { onDelete: 'cascade' }),
  phoneNumber: varchar("phone_number").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  email: varchar("email"),
  customFields: jsonb("custom_fields"),
  classification: varchar("classification"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPhoneNumberSchema = createInsertSchema(phoneNumbers).omit({
  id: true,
  createdAt: true,
});

export type InsertPhoneNumber = z.infer<typeof insertPhoneNumberSchema>;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;

// Campaigns
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name").notNull(),
  description: text("description"),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: 'cascade' }),
  listId: varchar("list_id").notNull().references(() => phoneLists.id, { onDelete: 'cascade' }),
  fromNumber: varchar("from_number").notNull(),
  status: varchar("status").notNull().default("draft"),
  totalCalls: integer("total_calls").default(0),
  completedCalls: integer("completed_calls").default(0),
  failedCalls: integer("failed_calls").default(0),
  inProgressCalls: integer("in_progress_calls").default(0),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

// Calls
export const calls = pgTable("calls", {
  id: varchar("id").primaryKey(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  phoneNumberId: varchar("phone_number_id").references(() => phoneNumbers.id, { onDelete: 'set null' }),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromNumber: varchar("from_number").notNull(),
  toNumber: varchar("to_number").notNull(),
  callType: varchar("call_type").notNull().default("phone_call"),
  direction: varchar("direction").default("outbound"),
  callStatus: varchar("call_status").notNull().default("queued"),
  startTimestamp: timestamp("start_timestamp"),
  endTimestamp: timestamp("end_timestamp"),
  durationMs: integer("duration_ms"),
  disconnectionReason: varchar("disconnection_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCallSchema = createInsertSchema(calls).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;

// Call Logs (detailed call information)
export const callLogs = pgTable("call_logs", {
  id: varchar("id").primaryKey(),
  callId: varchar("call_id").notNull().references(() => calls.id, { onDelete: 'cascade' }).unique(),
  transcript: text("transcript"),
  transcriptObject: jsonb("transcript_object"),
  transcriptWithToolCalls: jsonb("transcript_with_tool_calls"),
  recordingUrl: varchar("recording_url"),
  recordingMultiChannelUrl: varchar("recording_multi_channel_url"),
  publicLogUrl: varchar("public_log_url"),
  latency: jsonb("latency"),
  callAnalysis: jsonb("call_analysis"),
  callCost: jsonb("call_cost"),
  userSentiment: varchar("user_sentiment"),
  callSuccessful: boolean("call_successful"),
  inVoicemail: boolean("in_voicemail"),
  callSummary: text("call_summary"),
  customAnalysisData: jsonb("custom_analysis_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCallLogSchema = createInsertSchema(callLogs).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
export type CallLog = typeof callLogs.$inferSelect;

// Webhook Events
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id").references(() => calls.id, { onDelete: 'cascade' }),
  eventType: varchar("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  signature: varchar("signature"),
  processed: boolean("processed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  agents: many(agents),
  phoneLists: many(phoneLists),
  campaigns: many(campaigns),
  calls: many(calls),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  user: one(users, {
    fields: [agents.userId],
    references: [users.id],
  }),
  campaigns: many(campaigns),
  calls: many(calls),
}));

export const phoneListsRelations = relations(phoneLists, ({ one, many }) => ({
  user: one(users, {
    fields: [phoneLists.userId],
    references: [users.id],
  }),
  phoneNumbers: many(phoneNumbers),
  campaigns: many(campaigns),
}));

export const phoneNumbersRelations = relations(phoneNumbers, ({ one, many }) => ({
  list: one(phoneLists, {
    fields: [phoneNumbers.listId],
    references: [phoneLists.id],
  }),
  calls: many(calls),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  user: one(users, {
    fields: [campaigns.userId],
    references: [users.id],
  }),
  agent: one(agents, {
    fields: [campaigns.agentId],
    references: [agents.id],
  }),
  list: one(phoneLists, {
    fields: [campaigns.listId],
    references: [phoneLists.id],
  }),
  calls: many(calls),
}));

export const callsRelations = relations(calls, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [calls.campaignId],
    references: [campaigns.id],
  }),
  phoneNumber: one(phoneNumbers, {
    fields: [calls.phoneNumberId],
    references: [phoneNumbers.id],
  }),
  agent: one(agents, {
    fields: [calls.agentId],
    references: [agents.id],
  }),
  user: one(users, {
    fields: [calls.userId],
    references: [users.id],
  }),
  callLog: one(callLogs, {
    fields: [calls.id],
    references: [callLogs.callId],
  }),
}));

export const callLogsRelations = relations(callLogs, ({ one }) => ({
  call: one(calls, {
    fields: [callLogs.callId],
    references: [calls.id],
  }),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  call: one(calls, {
    fields: [webhookEvents.callId],
    references: [calls.id],
  }),
}));
