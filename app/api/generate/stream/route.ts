// GitTalks API - Streaming Generate Podcast
// POST /api/generate/stream - Start podcast generation with real-time progress

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import * as db from "@/lib/db";
import { initializeDb, type Job, type Playlist, type Episode, type ConversationStyle, type JobStatus } from "@/lib/db";
import { fetchRepository, parseRepoUrl } from "@/lib/github";
import { analyzeRepository, generateAllEpisodesContent } from "@/lib/llm";
import { synthesizeEpisode, saveAudioToStorage } from "@/lib/tts";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 300; // 5 minutes max for serverless

interface ProgressEvent {
  type: "progress" | "step" | "error" | "complete" | "auth-required" | "rate-limited";
  step: string;
  description: string;
  progress: number; // 0-100
  subStep?: string;
  data?: unknown;
}

// Ensure database is initialized
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initializeDb();
    dbInitialized = true;
  }
}

function sendEvent(controller: ReadableStreamDefaultController, event: ProgressEvent) {
  try {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    controller.enqueue(new TextEncoder().encode(data));
    return true; // Successfully sent
  } catch (error) {
    // Controller may be closed (client disconnected), log but don't throw
    console.warn("Failed to send event (controller may be closed):", event.type, event.step);
    return false; // Failed to send
  }
}

// Safe close helper
function safeClose(controller: ReadableStreamDefaultController) {
  try {
    controller.close();
  } catch {
    // Already closed
  }
}

export async function POST(request: NextRequest) {
  // Check authentication
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return new Response(
      JSON.stringify({ 
        error: "Authentication required",
        type: "auth-required",
        message: "Please sign in with GitHub to generate podcasts",
      }), 
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Check rate limit
  const rateLimitResult = await checkRateLimit(session.user.id);
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        type: "rate-limited",
        message: rateLimitResult.message,
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt.toISOString(),
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const body = await request.json();
  const { repoUrl, conversationStyle = "duo" } = body as {
    repoUrl?: string;
    conversationStyle?: ConversationStyle;
  };

  if (!repoUrl) {
    return new Response(JSON.stringify({ error: "repoUrl is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate conversation style
  if (conversationStyle !== "single" && conversationStyle !== "duo") {
    return new Response(JSON.stringify({ error: "conversationStyle must be 'single' or 'duo'" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Use authenticated user ID for job creation
  const userId = session.user.id;

  const stream = new ReadableStream({
    async start(controller) {
      let jobId: string | null = null; // Track job for error cleanup
      
      try {
        await ensureDbInitialized();
        
        // Parse repo URL
        let owner: string;
        let name: string;

        sendEvent(controller, {
          type: "progress",
          step: "parsing",
          description: "Parsing repository URL...",
          progress: 2,
        });

        try {
          const parsed = parseRepoUrl(repoUrl);
          owner = parsed.owner;
          name = parsed.name;
        } catch (error) {
          sendEvent(controller, {
            type: "error",
            step: "parsing",
            description: (error as Error).message,
            progress: 0,
          });
          safeClose(controller);
          return;
        }

        // Check if we already have this playlist
        sendEvent(controller, {
          type: "progress",
          step: "checking",
          description: "Checking for existing podcast...",
          progress: 5,
        });

        const existingPlaylist = await db.getPlaylistByRepo(owner, name);
        if (existingPlaylist) {
          const existingEpisodes = await db.getEpisodesByPlaylist(existingPlaylist.id);
          // Check if ALL episodes have audio (complete generation)
          const allEpisodesHaveAudio = existingEpisodes.length > 0 && 
            existingEpisodes.every(ep => ep.audioUrl);
          
          if (allEpisodesHaveAudio) {
            // Return existing playlist
            sendEvent(controller, {
              type: "complete",
              step: "cached",
              description: "Found existing podcast!",
              progress: 100,
              data: {
                playlist: existingPlaylist,
                episodes: existingEpisodes,
              },
            });
            safeClose(controller);
            return;
          }
          // If playlist exists but incomplete, we'll regenerate below
        }

        // Create job using authenticated user ID
        const job = await db.createJob(repoUrl, owner, name, userId, conversationStyle);
        jobId = job.id; // Track for error cleanup

        // STEP 1: Fetch repository (10%)
        sendEvent(controller, {
          type: "step",
          step: "fetching",
          description: "Fetching repository from GitHub",
          progress: 10,
          subStep: "Connecting to GitHub API...",
        });

        const repoData = await fetchRepository(owner, name);
        
        sendEvent(controller, {
          type: "progress",
          step: "fetching",
          description: "Fetching repository from GitHub",
          progress: 15,
          subStep: `Found ${repoData.files.length} files, analyzing ${repoData.fileContents.length} important files`,
        });

        // STEP 2: Analyze repository (20%)
        sendEvent(controller, {
          type: "step",
          step: "analyzing",
          description: "Analyzing repository structure",
          progress: 20,
          subStep: "AI is understanding the codebase architecture...",
        });

        const analysis = await analyzeRepository(owner, name, repoData);
        
        sendEvent(controller, {
          type: "progress",
          step: "analyzing",
          description: "Analyzing repository structure",
          progress: 30,
          subStep: `Identified ${analysis.episodes.length} episode topics`,
        });

        // Create playlist and episodes in DB
        const playlist = await db.createPlaylist(
          analysis.suggestedTitle,
          analysis.suggestedDescription,
          owner,
          name,
          repoUrl,
          userId
        );
        await db.setJobPlaylist(jobId, playlist.id);

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

        // STEP 3: Generate content (30-50%)
        sendEvent(controller, {
          type: "step",
          step: "generating-content",
          description: "Generating podcast scripts",
          progress: 35,
          subStep: "AI is writing engaging content...",
        });

        const content = await generateAllEpisodesContent(
          owner,
          name,
          repoData,
          analysis,
          conversationStyle
        );

        sendEvent(controller, {
          type: "progress",
          step: "generating-content",
          description: "Generating podcast scripts",
          progress: 50,
          subStep: `Generated scripts for ${content.episodes.length} episodes`,
        });

        // STEP 4: Generate audio (50-95%)
        sendEvent(controller, {
          type: "step",
          step: "generating-audio",
          description: "Converting scripts to audio",
          progress: 55,
          subStep: "Starting voice synthesis...",
        });

        let totalDuration = 0;
        const totalEpisodes = content.episodes.length;

        for (let i = 0; i < totalEpisodes; i++) {
          const episodeContent = content.episodes[i];
          const episodeRecord = episodeRecords[i];
          const episodeProgress = 55 + ((i / totalEpisodes) * 40);

          sendEvent(controller, {
            type: "progress",
            step: "generating-audio",
            description: "Converting scripts to audio",
            progress: Math.round(episodeProgress),
            subStep: `Episode ${i + 1}/${totalEpisodes}: "${episodeContent.title}" - Synthesizing voice...`,
          });

          // Synthesize audio
          const audioResult = await synthesizeEpisode(
            episodeContent.audioScript,
            conversationStyle,
            episodeContent.dialogue
          );

          sendEvent(controller, {
            type: "progress",
            step: "generating-audio",
            description: "Converting scripts to audio",
            progress: Math.round(episodeProgress + 15),
            subStep: `Episode ${i + 1}/${totalEpisodes}: "${episodeContent.title}" - Uploading audio...`,
          });

          // Save audio to storage
          const audioFileName = `${playlist.id}_episode_${i + 1}`;
          const audioUrl = await saveAudioToStorage(
            audioResult.audioData,
            audioFileName,
            audioResult.format || "mp3"
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

          totalDuration += audioResult.durationSecs;

          // Update episode record
          const updated = await db.getEpisodeById(episodeRecord.id);
          if (updated) episodeRecords[i] = updated;
        }

        // Update playlist duration
        await db.updatePlaylistDuration(playlist.id, Math.round(totalDuration));
        const updatedPlaylist = await db.getPlaylistById(playlist.id);

        // Mark job complete
        await db.updateJobStatus(jobId, "completed", "done");

        // COMPLETE
        sendEvent(controller, {
          type: "complete",
          step: "done",
          description: "Podcast generation complete!",
          progress: 100,
          data: {
            job: await db.getJobById(jobId),
            playlist: updatedPlaylist || playlist,
            episodes: episodeRecords,
          },
        });

        safeClose(controller);
      } catch (error) {
        console.error("Stream generate error:", error);
        
        // Mark job as failed if we have a jobId
        if (jobId) {
          try {
            await db.updateJobStatus(jobId, "failed", "error", (error as Error).message);
            console.log(`[Job ${jobId}] Marked as failed:`, (error as Error).message);
          } catch (cleanupError) {
            console.error("Failed to mark job as failed:", cleanupError);
          }
        }
        
        sendEvent(controller, {
          type: "error",
          step: "error",
          description: (error as Error).message,
          progress: 0,
        });
        safeClose(controller);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
