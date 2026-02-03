// GitTalks - Database Layer (JSON File Storage)
// Simple file-based storage that works everywhere without native dependencies

import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type {
  Job,
  Playlist,
  Episode,
  JobStatus,
  ConversationStyle,
} from "./types";

// Database file path
const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "gittalks.json");

// Database structure
interface Database {
  jobs: Record<string, Job>;
  playlists: Record<string, Playlist>;
  episodes: Record<string, Episode>;
}

// Default empty database
const DEFAULT_DB: Database = {
  jobs: {},
  playlists: {},
  episodes: {},
};

// In-memory cache
let dbCache: Database | null = null;

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
  } catch (e) {
    // Ignore if exists
  }
}

// Load database from file
async function loadDb(): Promise<Database> {
  if (dbCache) return dbCache;

  try {
    await ensureDataDir();
    const data = await fs.readFile(DB_FILE, "utf-8");
    dbCache = JSON.parse(data) as Database;
    return dbCache;
  } catch (e) {
    // File doesn't exist, return default
    dbCache = { ...DEFAULT_DB };
    return dbCache;
  }
}

// Save database to file
async function saveDb(db: Database): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  dbCache = db;
}

// Synchronous versions for simpler API (loads from cache after first load)
function getDbSync(): Database {
  if (!dbCache) {
    // Return default if not loaded yet
    return { ...DEFAULT_DB };
  }
  return dbCache;
}

// Initialize database (call at startup)
export async function initializeDb(): Promise<void> {
  await loadDb();
}

// ============================================
// Job Operations
// ============================================

export function createJob(
  repoUrl: string,
  owner: string,
  name: string,
  userId: string,
  conversationStyle: ConversationStyle = "single"
): Job {
  const db = getDbSync();
  const id = uuidv4();
  const now = new Date().toISOString();

  const job: Job = {
    id,
    repo_url: repoUrl,
    owner,
    name,
    user_id: userId,
    status: "queued",
    current_step: null,
    playlist_id: null,
    error_message: null,
    conversation_style: conversationStyle,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  db.jobs[id] = job;
  saveDb(db).catch(console.error);

  return job;
}

export function getJobById(id: string): Job | null {
  const db = getDbSync();
  return db.jobs[id] || null;
}

export function updateJobStatus(
  id: string,
  status: JobStatus,
  currentStep?: string,
  errorMessage?: string
): void {
  const db = getDbSync();
  const job = db.jobs[id];
  if (!job) return;

  const now = new Date().toISOString();
  job.status = status;
  job.updated_at = now;

  if (currentStep !== undefined) {
    job.current_step = currentStep;
  }

  if (errorMessage !== undefined) {
    job.error_message = errorMessage;
  }

  if (status === "completed" || status === "failed") {
    job.completed_at = now;
  }

  saveDb(db).catch(console.error);
}

export function setJobPlaylist(jobId: string, playlistId: string): void {
  const db = getDbSync();
  const job = db.jobs[jobId];
  if (!job) return;

  job.playlist_id = playlistId;
  job.updated_at = new Date().toISOString();
  saveDb(db).catch(console.error);
}

export function getJobsByStatus(status: JobStatus): Job[] {
  const db = getDbSync();
  return Object.values(db.jobs).filter((j) => j.status === status);
}

export function getRecentJobs(limit: number = 20): Job[] {
  const db = getDbSync();
  return Object.values(db.jobs)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

// ============================================
// Playlist Operations
// ============================================

export function createPlaylist(
  title: string,
  description: string | null,
  owner: string,
  repoName: string,
  repoUrl: string,
  userId: string
): Playlist {
  const db = getDbSync();
  const id = uuidv4();
  const now = new Date().toISOString();

  const playlist: Playlist = {
    id,
    title,
    description,
    owner,
    repo_name: repoName,
    repo_url: repoUrl,
    user_id: userId,
    total_duration_secs: 0,
    is_public: 1,
    created_at: now,
    updated_at: now,
  };

  db.playlists[id] = playlist;
  saveDb(db).catch(console.error);

  return playlist;
}

export function getPlaylistById(id: string): Playlist | null {
  const db = getDbSync();
  return db.playlists[id] || null;
}

export function getPlaylistByRepo(owner: string, repoName: string): Playlist | null {
  const db = getDbSync();
  const playlists = Object.values(db.playlists)
    .filter((p) => p.owner === owner && p.repo_name === repoName)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return playlists[0] || null;
}

export function updatePlaylistDuration(id: string, totalDurationSecs: number): void {
  const db = getDbSync();
  const playlist = db.playlists[id];
  if (!playlist) return;

  playlist.total_duration_secs = totalDurationSecs;
  playlist.updated_at = new Date().toISOString();
  saveDb(db).catch(console.error);
}

export function getRecentPlaylists(limit: number = 20): Playlist[] {
  const db = getDbSync();
  return Object.values(db.playlists)
    .filter((p) => p.is_public === 1)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

// ============================================
// Episode Operations
// ============================================

export function createEpisode(
  playlistId: string,
  title: string,
  description: string | null,
  episodeNumber: number,
  conversationStyle: ConversationStyle,
  isFree: boolean = false
): Episode {
  const db = getDbSync();
  const id = uuidv4();
  const now = new Date().toISOString();

  const episode: Episode = {
    id,
    playlist_id: playlistId,
    title,
    description,
    episode_number: episodeNumber,
    audio_url: null,
    duration_secs: 0,
    transcript: null,
    show_notes: null,
    word_timestamps: null,
    is_free: isFree ? 1 : 0,
    conversation_style: conversationStyle,
    created_at: now,
  };

  db.episodes[id] = episode;
  saveDb(db).catch(console.error);

  return episode;
}

export function getEpisodeById(id: string): Episode | null {
  const db = getDbSync();
  return db.episodes[id] || null;
}

export function getEpisodesByPlaylist(playlistId: string): Episode[] {
  const db = getDbSync();
  return Object.values(db.episodes)
    .filter((e) => e.playlist_id === playlistId)
    .sort((a, b) => a.episode_number - b.episode_number);
}

export function updateEpisodeAudio(
  id: string,
  audioUrl: string,
  durationSecs: number,
  wordTimestamps?: string
): void {
  const db = getDbSync();
  const episode = db.episodes[id];
  if (!episode) return;

  episode.audio_url = audioUrl;
  episode.duration_secs = durationSecs;
  episode.word_timestamps = wordTimestamps || null;
  saveDb(db).catch(console.error);
}

export function updateEpisodeContent(
  id: string,
  transcript: string,
  showNotes: string
): void {
  const db = getDbSync();
  const episode = db.episodes[id];
  if (!episode) return;

  episode.transcript = transcript;
  episode.show_notes = showNotes;
  saveDb(db).catch(console.error);
}

// ============================================
// Utility Operations
// ============================================

export function closeDb(): void {
  dbCache = null;
}
