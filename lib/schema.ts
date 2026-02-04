// GitTalks - Database Schema (Drizzle ORM + Turso/LibSQL)
// Proper SQL database with sync capabilities

import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ====== Better Auth Tables ======

// Users table - managed by Better Auth
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

// Accounts table - OAuth accounts linked to users
export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, (table) => [index("account_userId_idx").on(table.userId)]);

// Sessions table - active user sessions
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, (table) => [index("session_userId_idx").on(table.userId)]);

// Verification table - email verification, password reset, etc.
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

// ====== GitTalks Tables ======

// Jobs table - tracks generation requests
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  repoUrl: text("repo_url").notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  userId: text("user_id").notNull(),
  status: text("status", { 
    enum: ["queued", "fetching", "analyzing", "generating-content", "generating-audio", "completed", "failed"] 
  }).notNull().default("queued"),
  currentStep: text("current_step"),
  playlistId: text("playlist_id"),
  errorMessage: text("error_message"),
  conversationStyle: text("conversation_style", { 
    enum: ["single", "duo"] 
  }).notNull().default("single"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
});

// Playlists table - collections of episodes for a repo
export const playlists = sqliteTable("playlists", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner").notNull(),
  repoName: text("repo_name").notNull(),
  repoUrl: text("repo_url").notNull(),
  userId: text("user_id").notNull(),
  totalDurationSecs: integer("total_duration_secs").notNull().default(0),
  coverImageUrl: text("cover_image_url"),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Episodes table - individual audio episodes
export const episodes = sqliteTable("episodes", {
  id: text("id").primaryKey(),
  playlistId: text("playlist_id").notNull().references(() => playlists.id),
  title: text("title").notNull(),
  description: text("description"),
  episodeNumber: integer("episode_number").notNull(),
  audioUrl: text("audio_url"),
  durationSecs: integer("duration_secs").notNull().default(0),
  transcript: text("transcript"),
  showNotes: text("show_notes"),
  wordTimestamps: text("word_timestamps"), // JSON string
  isFree: integer("is_free", { mode: "boolean" }).notNull().default(false),
  conversationStyle: text("conversation_style", { 
    enum: ["single", "duo"] 
  }).notNull().default("single"),
  createdAt: text("created_at").notNull(),
});

// Repository cache - stores analyzed repo data
export const repoCache = sqliteTable("repo_cache", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  repoName: text("repo_name").notNull(),
  metadata: text("metadata"), // JSON - repo metadata
  fileTree: text("file_tree"), // JSON - file structure
  analysis: text("analysis"), // JSON - AI analysis
  cachedAt: text("cached_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// Type exports for use in the app
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;
export type RepoCache = typeof repoCache.$inferSelect;
export type NewRepoCache = typeof repoCache.$inferInsert;
// Better Auth type exports
export type User = typeof user.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Session = typeof session.$inferSelect;