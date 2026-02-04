// Script to reset Better Auth tables
import { createClient } from "@libsql/client";
import { config } from "dotenv";

// Load environment variables from .env.local
config({ path: ".env.local" });

async function resetAuthTables() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }

  console.log("Connecting to database:", url);

  const client = createClient({
    url,
    authToken,
  });

  console.log("Dropping existing auth tables and indexes...");
  
  // Drop indexes first (they depend on tables)
  const dropIndexes = [
    "DROP INDEX IF EXISTS account_userId_idx",
    "DROP INDEX IF EXISTS session_userId_idx",
    "DROP INDEX IF EXISTS verification_identifier_idx",
    "DROP INDEX IF EXISTS session_token_unique",
  ];

  for (const sql of dropIndexes) {
    try {
      await client.execute(sql);
      console.log("✓", sql);
    } catch (e) {
      console.log("✗", sql, (e as Error).message);
    }
  }

  // Drop tables
  const dropTables = [
    "DROP TABLE IF EXISTS session",
    "DROP TABLE IF EXISTS account",
    "DROP TABLE IF EXISTS verification",
    "DROP TABLE IF EXISTS user",
  ];

  for (const sql of dropTables) {
    try {
      await client.execute(sql);
      console.log("✓", sql);
    } catch (e) {
      console.log("✗", sql, (e as Error).message);
    }
  }

  console.log("\nCreating new auth tables...");

  // Create user table
  await client.execute(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `);
  console.log("✓ Created user table");

  // Create account table
  await client.execute(`
    CREATE TABLE account (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      id_token TEXT,
      password TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `);
  await client.execute("CREATE INDEX account_userId_idx ON account(user_id)");
  console.log("✓ Created account table");

  // Create session table
  await client.execute(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `);
  await client.execute("CREATE INDEX session_userId_idx ON session(user_id)");
  console.log("✓ Created session table");

  // Create verification table
  await client.execute(`
    CREATE TABLE verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `);
  await client.execute("CREATE INDEX verification_identifier_idx ON verification(identifier)");
  console.log("✓ Created verification table");

  console.log("\n✅ Auth tables reset successfully!");
  
  client.close();
}

resetAuthTables().catch(console.error);
