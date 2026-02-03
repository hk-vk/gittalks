// GitTalks - Main Pipeline Orchestrator

import { v4 as uuidv4 } from "uuid";
import * as db from "./db";
import { fetchRepository, parseRepoUrl } from "./github";
import { analyzeRepository, generateAllEpisodesContent, cleanTextForTTS } from "./llm";
import { synthesizeEpisode, saveAudioToStorage } from "./tts";
import type {
  Job,
  Playlist,
  Episode,
  PipelineContext,
  FetchRepoOutput,
  AnalysisOutput,
  GeneratedContent,
  ConversationStyle,
  JobStatus,
} from "./types";

// Pipeline result
export interface PipelineResult {
  success: boolean;
  job: Job;
  playlist?: Playlist;
  episodes?: Episode[];
  error?: string;
}

// Update job status helper
function updateStatus(
  jobId: string,
  status: JobStatus,
  step: string,
  error?: string
) {
  db.updateJobStatus(jobId, status, step, error);
  console.log(`[Job ${jobId}] ${status}: ${step}`);
}

// Run the complete pipeline
export async function runPipeline(
  repoUrl: string,
  userId: string,
  conversationStyle: ConversationStyle = "single"
): Promise<PipelineResult> {
  // Parse repo URL
  let owner: string;
  let name: string;

  try {
    const parsed = parseRepoUrl(repoUrl);
    owner = parsed.owner;
    name = parsed.name;
  } catch (error) {
    return {
      success: false,
      job: {
        id: "",
        repo_url: repoUrl,
        owner: "",
        name: "",
        user_id: userId,
        status: "failed",
        current_step: "parsing",
        playlist_id: null,
        error_message: (error as Error).message,
        conversation_style: conversationStyle,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
      error: (error as Error).message,
    };
  }

  // Check if we already have this playlist
  const existingPlaylist = db.getPlaylistByRepo(owner, name);
  if (existingPlaylist) {
    const existingEpisodes = db.getEpisodesByPlaylist(existingPlaylist.id);
    if (existingEpisodes.length > 0 && existingEpisodes[0].audio_url) {
      // Return existing playlist
      const dummyJob = db.createJob(repoUrl, owner, name, userId, conversationStyle);
      db.updateJobStatus(dummyJob.id, "completed", "cached");
      db.setJobPlaylist(dummyJob.id, existingPlaylist.id);
      
      return {
        success: true,
        job: db.getJobById(dummyJob.id)!,
        playlist: existingPlaylist,
        episodes: existingEpisodes,
      };
    }
  }

  // Create job
  const job = db.createJob(repoUrl, owner, name, userId, conversationStyle);
  const jobId = job.id;

  try {
    // Step 1: Fetch repository
    updateStatus(jobId, "fetching", "Fetching repository data from GitHub");
    const repoData = await fetchRepository(owner, name);
    console.log(`[Job ${jobId}] Fetched ${repoData.files.length} files, ${repoData.fileContents.length} with content`);

    // Step 2: Analyze repository
    updateStatus(jobId, "analyzing", "Analyzing repository structure");
    const analysis = await analyzeRepository(owner, name, repoData);
    console.log(`[Job ${jobId}] Created ${analysis.episodes.length} episode outlines`);

    // Step 3: Create playlist
    const playlist = db.createPlaylist(
      analysis.suggestedTitle,
      analysis.suggestedDescription,
      owner,
      name,
      repoUrl,
      userId
    );
    db.setJobPlaylist(jobId, playlist.id);

    // Create episode records
    const episodeRecords: Episode[] = [];
    for (let i = 0; i < analysis.episodes.length; i++) {
      const outline = analysis.episodes[i];
      const episode = db.createEpisode(
        playlist.id,
        outline.title,
        outline.description,
        i + 1,
        conversationStyle,
        outline.isFree
      );
      episodeRecords.push(episode);
    }

    // Step 4: Generate content
    updateStatus(jobId, "generating-content", "Generating podcast scripts with AI");
    const content = await generateAllEpisodesContent(
      owner,
      name,
      repoData,
      analysis,
      conversationStyle
    );

    // Step 5: Generate audio
    updateStatus(jobId, "generating-audio", "Converting scripts to audio");
    let totalDuration = 0;

    for (let i = 0; i < content.episodes.length; i++) {
      const episodeContent = content.episodes[i];
      const episodeRecord = episodeRecords[i];

      console.log(`[Job ${jobId}] Generating audio for episode ${i + 1}/${content.episodes.length}`);

      // Synthesize audio
      const audioResult = await synthesizeEpisode(
        episodeContent.audioScript,
        conversationStyle,
        episodeContent.dialogue
      );

      // Save audio to storage (local or cloud)
      const audioFileName = `${playlist.id}_episode_${i + 1}`;
      const audioUrl = await saveAudioToStorage(
        audioResult.audioData,
        audioFileName
      );

      // Update episode with audio info
      db.updateEpisodeAudio(
        episodeRecord.id,
        audioUrl,
        Math.round(audioResult.durationSecs),
        audioResult.wordTimestamps ? JSON.stringify(audioResult.wordTimestamps) : undefined
      );

      // Update episode content
      db.updateEpisodeContent(
        episodeRecord.id,
        episodeContent.audioScript,
        episodeContent.showNotes
      );

      totalDuration += audioResult.durationSecs;

      // Update episode record with new data
      episodeRecords[i] = db.getEpisodeById(episodeRecord.id)!;
    }

    // Update playlist duration
    db.updatePlaylistDuration(playlist.id, Math.round(totalDuration));

    // Mark job as completed
    updateStatus(jobId, "completed", "Pipeline completed successfully");

    return {
      success: true,
      job: db.getJobById(jobId)!,
      playlist: db.getPlaylistById(playlist.id)!,
      episodes: episodeRecords.map((e) => db.getEpisodeById(e.id)!),
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    updateStatus(jobId, "failed", "Pipeline failed", errorMessage);

    return {
      success: false,
      job: db.getJobById(jobId)!,
      error: errorMessage,
    };
  }
}

// Get job status with details
export async function getJobStatus(jobId: string): Promise<PipelineResult | null> {
  const job = db.getJobById(jobId);
  if (!job) return null;

  const result: PipelineResult = {
    success: job.status === "completed",
    job,
  };

  if (job.playlist_id) {
    result.playlist = db.getPlaylistById(job.playlist_id) || undefined;
    if (result.playlist) {
      result.episodes = db.getEpisodesByPlaylist(result.playlist.id);
    }
  }

  if (job.status === "failed" && job.error_message) {
    result.error = job.error_message;
  }

  return result;
}

// Get playlist by owner/repo
export function getPlaylistByRepo(owner: string, name: string) {
  const playlist = db.getPlaylistByRepo(owner, name);
  if (!playlist) return null;

  const episodes = db.getEpisodesByPlaylist(playlist.id);
  return { playlist, episodes };
}

// Get recent playlists for homepage
export function getRecentPlaylists(limit: number = 10) {
  return db.getRecentPlaylists(limit);
}
