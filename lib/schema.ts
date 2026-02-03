// GitTalks - Database Schema (Drizzle ORM + Turso/LibSQL)
// Proper SQL database with sync capabilities

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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
