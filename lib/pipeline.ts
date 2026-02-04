// GitTalks - Main Pipeline Orchestrator

import * as db from "./db";
import { initializeDb, type Job, type Playlist, type Episode, type ConversationStyle, type JobStatus } from "./db";
import { fetchRepository, parseRepoUrl } from "./github";
import { analyzeRepository, generateAllEpisodesContent } from "./llm";
import { synthesizeEpisode, saveAudioToStorage } from "./tts";

// Pipeline result
export interface PipelineResult {
  success: boolean;
  job: Job | null;
  playlist?: Playlist;
  episodes?: Episode[];
  error?: string;
}

// Ensure database is initialized
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initializeDb();
    dbInitialized = true;
  }
}

// Update job status helper
async function updateStatus(
  jobId: string,
  status: JobStatus,
  step: string,
  error?: string
) {
  await db.updateJobStatus(jobId, status, step, error);
  console.log(`[Job ${jobId}] ${status}: ${step}`);
}

// Run the complete pipeline
export async function runPipeline(
  repoUrl: string,
  userId: string,
  conversationStyle: ConversationStyle = "duo"
): Promise<PipelineResult> {
  await ensureDbInitialized();
  
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
      job: null,
      error: (error as Error).message,
    };
  }

  // Check if we already have this playlist
  const existingPlaylist = await db.getPlaylistByRepo(owner, name);
  if (existingPlaylist) {
    const existingEpisodes = await db.getEpisodesByPlaylist(existingPlaylist.id);
    if (existingEpisodes.length > 0 && existingEpisodes[0].audioUrl) {
      // Return existing playlist
      const dummyJob = await db.createJob(repoUrl, owner, name, userId, conversationStyle);
      await db.updateJobStatus(dummyJob.id, "completed", "cached");
      await db.setJobPlaylist(dummyJob.id, existingPlaylist.id);
      
      const updatedJob = await db.getJobById(dummyJob.id);
      return {
        success: true,
        job: updatedJob,
        playlist: existingPlaylist,
        episodes: existingEpisodes,
      };
    }
  }

  // Create job
  const job = await db.createJob(repoUrl, owner, name, userId, conversationStyle);
  const jobId = job.id;

  try {
    // Step 1: Fetch repository
    await updateStatus(jobId, "fetching", "Fetching repository data from GitHub");
    const repoData = await fetchRepository(owner, name);
    console.log(`[Job ${jobId}] Fetched ${repoData.files.length} files, ${repoData.fileContents.length} with content`);

    // Step 2: Analyze repository
    await updateStatus(jobId, "analyzing", "Analyzing repository structure");
    const analysis = await analyzeRepository(owner, name, repoData);
    console.log(`[Job ${jobId}] Created ${analysis.episodes.length} episode outlines`);

    // Step 3: Create playlist
    const playlist = await db.createPlaylist(
      analysis.suggestedTitle,
      analysis.suggestedDescription,
      owner,
      name,
      repoUrl,
      userId
    );
    await db.setJobPlaylist(jobId, playlist.id);

    // Create episode records
    const episodeRecords: Episode[] = [];
    for (let i = 0; i < analysis.episodes.length; i++) {
      const outline = analysis.episodes[i];
      const episode = await db.createEpisode(
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
    await updateStatus(jobId, "generating-content", "Generating podcast scripts with AI");
    const content = await generateAllEpisodesContent(
      owner,
      name,
      repoData,
      analysis,
      conversationStyle
    );

    // Step 5: Generate audio - PARALLEL processing for speed
    await updateStatus(jobId, "generating-audio", "Converting scripts to audio");
    
    // Process episodes in parallel (with concurrency limit to avoid overwhelming APIs)
    const CONCURRENCY_LIMIT = 3; // Process 3 episodes at a time
    
    const processEpisode = async (i: number) => {
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
        audioFileName,
        audioResult.format || "wav"
      );

      // Update episode with audio info
      await db.updateEpisodeAudio(
        episodeRecord.id,
        audioUrl,
        Math.round(audioResult.durationSecs),
        audioResult.wordTimestamps ? JSON.stringify(audioResult.wordTimestamps) : undefined
      );

      // Update episode content
      await db.updateEpisodeContent(
        episodeRecord.id,
        episodeContent.audioScript,
        episodeContent.showNotes
      );

      console.log(`[Job ${jobId}] Episode ${i + 1} complete - ${audioResult.durationSecs.toFixed(1)}s audio`);
      
      return audioResult.durationSecs;
    };

    // Process in batches for controlled parallelism
    let totalDuration = 0;
    for (let i = 0; i < content.episodes.length; i += CONCURRENCY_LIMIT) {
      const batch = [];
      for (let j = i; j < Math.min(i + CONCURRENCY_LIMIT, content.episodes.length); j++) {
        batch.push(processEpisode(j));
      }
      const batchDurations = await Promise.all(batch);
      totalDuration += batchDurations.reduce((sum, d) => sum + d, 0);
    }

    // Refresh episode records with updated data
    for (let i = 0; i < episodeRecords.length; i++) {
      const updated = await db.getEpisodeById(episodeRecords[i].id);
      if (updated) episodeRecords[i] = updated;
    }

    // Update playlist duration
    await db.updatePlaylistDuration(playlist.id, Math.round(totalDuration));

    // Mark job as completed
    await updateStatus(jobId, "completed", "Pipeline completed successfully");

    const finalJob = await db.getJobById(jobId);
    const finalPlaylist = await db.getPlaylistById(playlist.id);
    const finalEpisodes = await Promise.all(
      episodeRecords.map(e => db.getEpisodeById(e.id))
    );

    return {
      success: true,
      job: finalJob,
      playlist: finalPlaylist || undefined,
      episodes: finalEpisodes.filter((e): e is Episode => e !== null),
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    await updateStatus(jobId, "failed", "Pipeline failed", errorMessage);

    const failedJob = await db.getJobById(jobId);
    return {
      success: false,
      job: failedJob,
      error: errorMessage,
    };
  }
}

// Get job status with details
export async function getJobStatus(jobId: string): Promise<PipelineResult | null> {
  await ensureDbInitialized();
  
  const job = await db.getJobById(jobId);
  if (!job) return null;

  const result: PipelineResult = {
    success: job.status === "completed",
    job,
  };

  if (job.playlistId) {
    const playlist = await db.getPlaylistById(job.playlistId);
    result.playlist = playlist || undefined;
    if (playlist) {
      result.episodes = await db.getEpisodesByPlaylist(playlist.id);
    }
  }

  if (job.status === "failed" && job.errorMessage) {
    result.error = job.errorMessage;
  }

  return result;
}

// Get playlist by owner/repo
export async function getPlaylistByRepo(owner: string, name: string) {
  await ensureDbInitialized();
  
  const playlist = await db.getPlaylistByRepo(owner, name);
  if (!playlist) return null;

  const episodes = await db.getEpisodesByPlaylist(playlist.id);
  return { playlist, episodes };
}

// Get recent playlists for homepage
export async function getRecentPlaylists(limit: number = 10) {
  await ensureDbInitialized();
  return db.getRecentPlaylists(limit);
}
