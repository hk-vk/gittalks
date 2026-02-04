// GitTalks - Database Layer (Drizzle ORM + Turso/LibSQL)
// Proper SQL database with sync capabilities

import { eq, desc, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb, initializeDatabase } from "./database";
import { jobs, playlists, episodes, repoCache } from "./schema";
import type { 
  Job, NewJob, 
  Playlist, NewPlaylist, 
  Episode, NewEpisode,
  RepoCache, NewRepoCache 
} from "./schema";

// Re-export types from schema
export type { Job, Playlist, Episode, RepoCache };

// Job status type
export type JobStatus = 
  | "queued" 
  | "fetching" 
  | "analyzing" 
  | "generating-content" 
  | "generating-audio" 
  | "completed" 
  | "failed";

// Conversation style type
export type ConversationStyle = "single" | "duo";

// Initialize database (call at startup)
export async function initializeDb(): Promise<void> {
  await initializeDatabase();
}

// ============================================
// Job Operations
// ============================================

export async function createJob(
  repoUrl: string,
  owner: string,
  name: string,
  userId: string,
  conversationStyle: ConversationStyle = "duo"
): Promise<Job> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  const newJob: NewJob = {
    id,
    repoUrl,
    owner,
    name,
    userId,
    status: "queued",
    currentStep: null,
    playlistId: null,
    errorMessage: null,
    conversationStyle,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  await db.insert(jobs).values(newJob);
  return newJob as Job;
}

export async function getJobById(id: string): Promise<Job | null> {
  const db = getDb();
  const result = await db.select().from(jobs).where(eq(jobs.id, id));
  return result[0] || null;
}

export async function updateJobStatus(
  id: string,
  status: JobStatus,
  currentStep?: string,
  errorMessage?: string
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const updates: Partial<NewJob> = {
    status,
    updatedAt: now,
  };

  if (currentStep !== undefined) {
    updates.currentStep = currentStep;
  }

  if (errorMessage !== undefined) {
    updates.errorMessage = errorMessage;
  }

  if (status === "completed" || status === "failed") {
    updates.completedAt = now;
  }

  await db.update(jobs).set(updates).where(eq(jobs.id, id));
}

export async function setJobPlaylist(jobId: string, playlistId: string): Promise<void> {
  const db = getDb();
  await db.update(jobs).set({
    playlistId,
    updatedAt: new Date().toISOString(),
  }).where(eq(jobs.id, jobId));
}

export async function getJobsByStatus(status: JobStatus): Promise<Job[]> {
  const db = getDb();
  return db.select().from(jobs).where(eq(jobs.status, status));
}

export async function getRecentJobs(limit: number = 20): Promise<Job[]> {
  const db = getDb();
  return db.select().from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
}

// ============================================
// Playlist Operations
// ============================================

export async function createPlaylist(
  title: string,
  description: string | null,
  owner: string,
  repoName: string,
  repoUrl: string,
  userId: string
): Promise<Playlist> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  const newPlaylist: NewPlaylist = {
    id,
    title,
    description,
    owner,
    repoName,
    repoUrl,
    userId,
    totalDurationSecs: 0,
    isPublic: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(playlists).values(newPlaylist);
  return newPlaylist as Playlist;
}

export async function getPlaylistById(id: string): Promise<Playlist | null> {
  const db = getDb();
  const result = await db.select().from(playlists).where(eq(playlists.id, id));
  return result[0] || null;
}

export async function getPlaylistByRepo(owner: string, repoName: string): Promise<Playlist | null> {
  const db = getDb();
  const result = await db.select().from(playlists)
    .where(and(eq(playlists.owner, owner), eq(playlists.repoName, repoName)))
    .orderBy(desc(playlists.createdAt))
    .limit(1);
  return result[0] || null;
}

export async function updatePlaylistDuration(id: string, totalDurationSecs: number): Promise<void> {
  const db = getDb();
  await db.update(playlists).set({
    totalDurationSecs,
    updatedAt: new Date().toISOString(),
  }).where(eq(playlists.id, id));
}

export async function getRecentPlaylists(limit: number = 20): Promise<Playlist[]> {
  const db = getDb();
  return db.select().from(playlists)
    .where(eq(playlists.isPublic, true))
    .orderBy(desc(playlists.createdAt))
    .limit(limit);
}

// ============================================
// Episode Operations
// ============================================

export async function createEpisode(
  playlistId: string,
  title: string,
  description: string | null,
  episodeNumber: number,
  conversationStyle: ConversationStyle,
  isFree: boolean = false
): Promise<Episode> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  const newEpisode: NewEpisode = {
    id,
    playlistId,
    title,
    description,
    episodeNumber,
    audioUrl: null,
    durationSecs: 0,
    transcript: null,
    showNotes: null,
    wordTimestamps: null,
    isFree,
    conversationStyle,
    createdAt: now,
  };

  await db.insert(episodes).values(newEpisode);
  return newEpisode as Episode;
}

export async function getEpisodeById(id: string): Promise<Episode | null> {
  const db = getDb();
  const result = await db.select().from(episodes).where(eq(episodes.id, id));
  return result[0] || null;
}

export async function getEpisodesByPlaylist(playlistId: string): Promise<Episode[]> {
  const db = getDb();
  return db.select().from(episodes)
    .where(eq(episodes.playlistId, playlistId))
    .orderBy(episodes.episodeNumber);
}

export async function updateEpisodeAudio(
  id: string,
  audioUrl: string,
  durationSecs: number,
  wordTimestamps?: string
): Promise<void> {
  const db = getDb();
  await db.update(episodes).set({
    audioUrl,
    durationSecs,
    wordTimestamps: wordTimestamps || null,
  }).where(eq(episodes.id, id));
}

export async function updateEpisodeContent(
  id: string,
  transcript: string,
  showNotes: string
): Promise<void> {
  const db = getDb();
  await db.update(episodes).set({
    transcript,
    showNotes,
  }).where(eq(episodes.id, id));
}

// ============================================
// Repository Cache Operations
// ============================================

export async function getCachedRepo(owner: string, repoName: string): Promise<RepoCache | null> {
  const db = getDb();
  const now = new Date().toISOString();
  
  const result = await db.select().from(repoCache)
    .where(and(
      eq(repoCache.owner, owner), 
      eq(repoCache.repoName, repoName)
    ))
    .limit(1);
  
  const cached = result[0];
  if (!cached) return null;
  
  // Check if expired
  if (cached.expiresAt < now) {
    await db.delete(repoCache).where(eq(repoCache.id, cached.id));
    return null;
  }
  
  return cached;
}

export async function setCachedRepo(
  owner: string,
  repoName: string,
  metadata: unknown,
  fileTree: unknown,
  analysis: unknown,
  ttlHours: number = 24
): Promise<RepoCache> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  const newCache: NewRepoCache = {
    id,
    owner,
    repoName,
    metadata: JSON.stringify(metadata),
    fileTree: JSON.stringify(fileTree),
    analysis: JSON.stringify(analysis),
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Delete existing cache for this repo
  await db.delete(repoCache).where(and(
    eq(repoCache.owner, owner),
    eq(repoCache.repoName, repoName)
  ));

  await db.insert(repoCache).values(newCache);
  return newCache as RepoCache;
}

// ============================================
// Utility Operations
// ============================================

export function closeDb(): void {
  // Handled by database.ts
}
