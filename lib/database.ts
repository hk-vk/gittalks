// GitTalks - Database Client (Turso/LibSQL)
// Works locally with file-based SQLite or with Turso cloud database

import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Singleton instances
let client: Client | null = null;
let db: LibSQLDatabase<typeof schema> | null = null;

/**
 * Get or create the database client
 * Uses Turso if TURSO_DATABASE_URL is set, otherwise local SQLite file
 */
function getClient(): Client {
  if (client) return client;

  // Check for Turso cloud database
  if (process.env.TURSO_DATABASE_URL) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    console.log("[DB] Connected to Turso cloud database");
  } else {
    // Use local SQLite file
    client = createClient({
      url: "file:./data/gittalks.db",
    });
    console.log("[DB] Using local SQLite database");
  }

  return client;
}

/**
 * Get the Drizzle ORM database instance
 */
export function getDb(): LibSQLDatabase<typeof schema> {
  if (db) return db;
  
  const client = getClient();
  db = drizzle(client, { schema });
  
  return db;
}

/**
 * Initialize the database schema
 * Creates tables if they don't exist
 */
export async function initializeDatabase(): Promise<void> {
  const client = getClient();
  
  // Create tables using raw SQL
  await client.executeMultiple(`
    -- Jobs table
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      repo_url TEXT NOT NULL,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      current_step TEXT,
      playlist_id TEXT,
      error_message TEXT,
      conversation_style TEXT NOT NULL DEFAULT 'single',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    -- Playlists table
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      user_id TEXT NOT NULL,
      total_duration_secs INTEGER NOT NULL DEFAULT 0,
      cover_image_url TEXT,
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Episodes table
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES playlists(id),
      title TEXT NOT NULL,
      description TEXT,
      episode_number INTEGER NOT NULL,
      audio_url TEXT,
      duration_secs INTEGER NOT NULL DEFAULT 0,
      transcript TEXT,
      show_notes TEXT,
      word_timestamps TEXT,
      is_free INTEGER NOT NULL DEFAULT 0,
      conversation_style TEXT NOT NULL DEFAULT 'single',
      created_at TEXT NOT NULL
    );

    -- Repository cache table
    CREATE TABLE IF NOT EXISTS repo_cache (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      metadata TEXT,
      file_tree TEXT,
      analysis TEXT,
      cached_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_playlists_owner_repo ON playlists(owner, repo_name);
    CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_playlist ON episodes(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_repo_cache_owner_repo ON repo_cache(owner, repo_name);
  `);

  console.log("[DB] Schema initialized successfully");
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (client) {
    client.close();
    client = null;
    db = null;
    console.log("[DB] Connection closed");
  }
}

/**
 * Check if using cloud database
 */
export function isUsingCloudDatabase(): boolean {
  return !!process.env.TURSO_DATABASE_URL;
}

/**
 * Get database info
 */
export function getDatabaseInfo(): { type: string; url: string } {
  return {
    type: process.env.TURSO_DATABASE_URL ? "turso" : "sqlite",
    url: process.env.TURSO_DATABASE_URL || "file:./data/gittalks.db",
  };
}
