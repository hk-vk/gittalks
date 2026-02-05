// GitTalks - TTS Integration
// Uses DeepInfra Kokoro TTS via OpenAI-compatible API (fast, high-quality)
// Or Edge TTS (free fallback)
// Includes text chunking for long scripts and proper MP3 combining with Xing headers

import type {
  TTSSynthesizeResult,
  WordTimestamp,
  DialogueTurn,
  ConversationStyle,
} from "./types";
import { uploadAudio } from "./storage";
import { combineMP3ChunksWithXingHeader, calculateMP3Duration } from "./mp3-utils";

// Rate limiting configuration
const TTS_RATE_LIMIT = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
  betweenChunksDelayMs: 150, // Delay between chunk synthesis
  betweenDialogueTurnsDelayMs: 100, // Delay between dialogue turns
};

// Sleep utility
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff with jitter
function getTTSRetryDelay(attempt: number): number {
  const exponentialDelay = TTS_RATE_LIMIT.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return Math.min(exponentialDelay + jitter, TTS_RATE_LIMIT.maxDelayMs);
}

// Check which TTS engine to use
const USE_KOKORO = !!process.env.DEEPINFRA_API_KEY;

// DeepInfra OpenAI-compatible TTS endpoint
const DEEPINFRA_OPENAI_URL = "https://api.deepinfra.com/v1/openai/audio/speech";

// Kokoro Voice configurations
const KOKORO_VOICES = {
  "af_sarah": "Sarah - American Female, friendly",
  "af_nicole": "Nicole - American Female, energetic",
  "af_bella": "Bella - American Female, warm",
  "af_sky": "Sky - American Female, calm",
  "am_adam": "Adam - American Male, authoritative",
  "am_michael": "Michael - American Male, casual",
  "bf_emma": "Emma - British Female, elegant",
  "bm_george": "George - British Male, refined",
};

// Edge TTS Voice configurations (fallback)
const EDGE_VOICES = {
  "en-US-EmmaMultilingualNeural": "Emma - Natural, warm female voice",
  "en-US-BrianMultilingualNeural": "Brian - Natural male voice",
  "en-US-JennyNeural": "Jenny - Friendly female",
  "en-US-GuyNeural": "Guy - Casual male voice",
};

// Export combined voices based on engine
export const VOICES = USE_KOKORO ? KOKORO_VOICES : EDGE_VOICES;

// Default voice for single narrator mode (can be overridden via env)
export const DEFAULT_VOICE = USE_KOKORO 
  ? (process.env.KOKORO_VOICE || "af_bella")
  : "en-US-EmmaMultilingualNeural";

// Voice pairings for duo mode
export const DUO_VOICES = USE_KOKORO
  ? {
      host_expert: "am_adam",        // Male expert host
      host_curious: "af_bella",      // Female curious host (warm, engaging voice)
    }
  : {
      host_expert: "en-US-BrianMultilingualNeural",
      host_curious: "en-US-EmmaMultilingualNeural",
    };

// Clean text for TTS
function cleanTextForTTS(text: string): string {
  return text
    .replace(/\*\*/g, "") // Remove markdown bold
    .replace(/\*/g, "") // Remove markdown italic
    .replace(/`/g, "") // Remove backticks
    .replace(/#{1,6}\s/g, "") // Remove markdown headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links, keep text
    .replace(/\n+/g, " ") // Replace newlines with spaces
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

// Estimate audio duration from text
function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).length;
  return (wordCount / 150) * 60; // ~150 words per minute
}

// Maximum characters per chunk for Kokoro TTS
// The API has a limit, we use ~3000 to be safe and allow for natural sentence breaks
const MAX_CHUNK_CHARS = 3000;

/**
 * Split text into chunks at sentence boundaries
 * This ensures long scripts are properly synthesized without truncation
 */
function splitTextIntoChunks(text: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
  // If text is short enough, return as-is
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by sentences (., !, ?, followed by space or end)
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];

  for (const sentence of sentences) {
    // If adding this sentence would exceed limit
    if (currentChunk.length + sentence.length > maxChars) {
      // Save current chunk if not empty
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      // If single sentence is too long, split by words
      if (sentence.length > maxChars) {
        const words = sentence.split(/\s+/);
        currentChunk = "";
        for (const word of words) {
          if (currentChunk.length + word.length + 1 > maxChars) {
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = word + " ";
          } else {
            currentChunk += word + " ";
          }
        }
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += sentence;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  console.log(`[TTS] Split ${text.length} chars into ${chunks.length} chunks`);
  return chunks;
}

// Synthesize using Kokoro via DeepInfra OpenAI-compatible API
async function synthesizeWithKokoro(
  text: string,
  voice: string
): Promise<TTSSynthesizeResult> {
  const apiKey = process.env.DEEPINFRA_API_KEY!;
  const cleanText = cleanTextForTTS(text);
  const speed = parseFloat(process.env.KOKORO_SPEED || "1.0");

  // Split long text into chunks
  const chunks = splitTextIntoChunks(cleanText);
  
  console.log(`[TTS/Kokoro] Synthesizing ${cleanText.length} chars in ${chunks.length} chunks with voice ${voice}`);

  // If only one chunk, synthesize directly
  if (chunks.length === 1) {
    return synthesizeSingleChunk(chunks[0], voice, apiKey, speed);
  }

  // FULLY PARALLEL synthesis - ALL chunks at once for maximum speed
  console.log(`[TTS/Kokoro] Synthesizing ALL ${chunks.length} chunks SIMULTANEOUSLY`);

  type ChunkResult = { index: number; result: TTSSynthesizeResult };

  // Create all promises at once
  const allChunkPromises = chunks.map((chunk, index) => {
    console.log(`[TTS/Kokoro] Starting chunk ${index + 1}/${chunks.length} (${chunk.length} chars)`);
    return synthesizeSingleChunk(chunk, voice, apiKey, speed)
      .then(result => ({ index, result }));
  });

  // Wait for ALL to complete simultaneously
  let chunkResults: ChunkResult[] = await Promise.all(allChunkPromises);

  // IMPORTANT: Sort by index to ensure correct order
  chunkResults.sort((a, b) => a.index - b.index);

  // Check for failed chunks (empty audio) and retry them
  const RETRY_EMPTY_AUDIO = 3;
  for (let retryAttempt = 0; retryAttempt < RETRY_EMPTY_AUDIO; retryAttempt++) {
    // Find chunks with empty audio data
    const failedIndices: number[] = [];
    for (const { index, result } of chunkResults) {
      const byteLength = result.audioData?.byteLength || result.audioData?.length || 0;
      if (byteLength === 0 || result.durationSecs <= 0) {
        failedIndices.push(index);
      }
    }

    if (failedIndices.length === 0) break; // All good!

    console.log(`[TTS/Kokoro] Retry ${retryAttempt + 1}/${RETRY_EMPTY_AUDIO}: ${failedIndices.length} chunks have empty audio: [${failedIndices.map(i => i + 1).join(', ')}]`);
    
    // Wait a bit before retrying
    await sleep(1000 * (retryAttempt + 1));

    // Retry failed chunks in parallel
    const retryPromises = failedIndices.map(index => {
      console.log(`[TTS/Kokoro] Retrying chunk ${index + 1}...`);
      return synthesizeSingleChunk(chunks[index], voice, apiKey, speed)
        .then(result => ({ index, result }));
    });

    const retryResults = await Promise.all(retryPromises);

    // Replace failed results with retry results
    for (const retryResult of retryResults) {
      const existingIdx = chunkResults.findIndex(c => c.index === retryResult.index);
      if (existingIdx !== -1) {
        chunkResults[existingIdx] = retryResult;
      }
    }
  }

  // Re-sort after retries
  chunkResults.sort((a, b) => a.index - b.index);
  
  // Verify all chunks were synthesized
  if (chunkResults.length !== chunks.length) {
    console.error(`[TTS/Kokoro] ERROR: Expected ${chunks.length} chunks, got ${chunkResults.length}`);
    throw new Error(`Missing chunks: expected ${chunks.length}, got ${chunkResults.length}`);
  }

  // Extract audio in correct order
  const audioChunks: ArrayBuffer[] = [];
  let totalDuration = 0;

  for (const { index, result } of chunkResults) {
    console.log(`[TTS/Kokoro] Adding chunk ${index + 1}: ${result.durationSecs.toFixed(1)}s`);
    
    // Convert Buffer to ArrayBuffer (handle both ArrayBuffer and SharedArrayBuffer)
    const arrayBuffer = result.audioData.buffer.slice(
      result.audioData.byteOffset,
      result.audioData.byteOffset + result.audioData.byteLength
    ) as ArrayBuffer;
    
    // Verify chunk has content
    if (arrayBuffer.byteLength === 0) {
      console.error(`[TTS/Kokoro] ERROR: Chunk ${index + 1} has no audio data!`);
      throw new Error(`Chunk ${index + 1} has no audio data`);
    }
    
    audioChunks.push(arrayBuffer);
    totalDuration += result.durationSecs;
  }

  // Combine chunks with proper Xing header for seeking
  console.log(`[TTS/Kokoro] Combining ${audioChunks.length} chunks with Xing header...`);
  const combinedAudio = combineMP3ChunksWithXingHeader(audioChunks);
  const audioBuffer = Buffer.from(combinedAudio);

  // Recalculate actual duration from combined audio
  const actualDuration = calculateMP3Duration(combinedAudio);
  const finalDuration = actualDuration > 0 ? actualDuration : totalDuration;

  console.log(`[TTS/Kokoro] Combined audio: ${audioBuffer.length} bytes, ${finalDuration.toFixed(1)}s`);

  return {
    audioData: audioBuffer,
    durationSecs: finalDuration,
    format: "mp3",
    wordTimestamps: [], // OpenAI API doesn't return timestamps
  };
}

// Synthesize a single chunk of text with retry logic
async function synthesizeSingleChunk(
  text: string,
  voice: string,
  apiKey: string,
  speed: number
): Promise<TTSSynthesizeResult> {
  for (let attempt = 0; attempt < TTS_RATE_LIMIT.maxRetries; attempt++) {
    try {
      // Use OpenAI-compatible API endpoint which properly returns MP3
      const response = await fetch(DEEPINFRA_OPENAI_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "hexgrad/Kokoro-82M",
          input: text,
          voice: voice,
          response_format: "mp3",
          speed: speed,
        }),
      });

      // Handle rate limiting
      if (response.status === 429 || response.status === 503) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : getTTSRetryDelay(attempt);
        console.log(`[TTS/Kokoro] Rate limited, waiting ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${TTS_RATE_LIMIT.maxRetries})...`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Kokoro TTS error: ${response.status} - ${error}`);
      }

      // OpenAI API returns raw audio bytes directly (not JSON)
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      console.log(`[TTS/Kokoro] Received ${audioBuffer.length} bytes MP3 audio`);

      // Verify it's MP3 by checking magic bytes
      if (audioBuffer.length > 4) {
        const firstBytes = audioBuffer.slice(0, 4);
        if (firstBytes[0] === 0x49 && firstBytes[1] === 0x44 && firstBytes[2] === 0x33) {
          console.log(`[TTS/Kokoro] Verified: MP3 with ID3 tag`);
        } else if (firstBytes[0] === 0xFF && (firstBytes[1] & 0xE0) === 0xE0) {
          console.log(`[TTS/Kokoro] Verified: Raw MP3 frames`);
        } else {
          console.log(`[TTS/Kokoro] Warning: Unexpected format, first bytes: ${firstBytes.toString("hex")}`);
        }
      }

      // Calculate actual duration from MP3 frames
      const actualDuration = calculateMP3Duration(arrayBuffer);
      
      // Fallback: estimate from audio size (MP3 at ~48kbps for speech)
      const estimatedBitrate = 48000;
      const estimatedDuration = (audioBuffer.length * 8) / estimatedBitrate;
      
      const durationSecs = actualDuration > 0 ? actualDuration : estimatedDuration;

      console.log(`[TTS/Kokoro] Chunk duration: ${durationSecs.toFixed(1)}s`);

      return {
        audioData: audioBuffer,
        durationSecs,
        format: "mp3",
        wordTimestamps: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for rate limit related errors
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate") || errorMessage.toLowerCase().includes("quota")) {
        const delay = getTTSRetryDelay(attempt);
        console.log(`[TTS/Kokoro] Rate limited, waiting ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${TTS_RATE_LIMIT.maxRetries})...`);
        await sleep(delay);
        continue;
      }
      
      // For other errors, throw after retries
      if (attempt === TTS_RATE_LIMIT.maxRetries - 1) {
        throw error;
      }
      
      await sleep(getTTSRetryDelay(attempt));
    }
  }
  
  throw new Error(`TTS synthesis failed after ${TTS_RATE_LIMIT.maxRetries} attempts`);
}

// Synthesize using Edge TTS (fallback)
async function synthesizeWithEdgeTTS(
  text: string,
  voice: string
): Promise<TTSSynthesizeResult> {
  // Dynamic import to avoid issues when not using Edge TTS
  const { EdgeTTS } = await import("edge-tts-universal");
  
  const cleanText = cleanTextForTTS(text);
  console.log(`[TTS/Edge] Synthesizing ${cleanText.length} chars with voice ${voice}`);

  const tts = new EdgeTTS(cleanText, voice, { rate: "+5%", pitch: "+0Hz", volume: "+0%" });
  const result = await tts.synthesize();

  // Convert Blob to Buffer
  const arrayBuffer = await result.audio.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  // Convert word timestamps
  const wordTimestamps: WordTimestamp[] = result.subtitle.map(
    (word: { offset: number; duration: number; text: string }) => ({
      offset: word.offset,
      duration: word.duration,
      text: word.text,
    })
  );

  // Calculate duration
  let durationSecs: number;
  if (wordTimestamps.length > 0) {
    const lastWord = wordTimestamps[wordTimestamps.length - 1];
    durationSecs = (lastWord.offset + lastWord.duration) / 10_000_000;
  } else {
    durationSecs = estimateDuration(cleanText);
  }

  console.log(`[TTS/Edge] Generated ${durationSecs.toFixed(1)}s audio`);

  return {
    audioData: audioBuffer,
    durationSecs,
    format: "mp3",
    wordTimestamps,
  };
}

// Main synthesis function - chooses engine automatically
export async function synthesizeText(
  text: string,
  voice?: string
): Promise<TTSSynthesizeResult> {
  const selectedVoice = voice || DEFAULT_VOICE;
  
  if (USE_KOKORO) {
    return synthesizeWithKokoro(text, selectedVoice);
  }
  
  return synthesizeWithEdgeTTS(text, selectedVoice);
}

// Synthesize dialogue for duo mode - FULLY PARALLEL processing
// Each turn is synthesized with the speaker's voice, then combined into one MP3 with Xing header
export async function synthesizeDialogue(
  dialogue: DialogueTurn[],
  pauseBetweenTurnsMs: number = 350
): Promise<TTSSynthesizeResult> {
  console.log(`[TTS] Synthesizing ALL ${dialogue.length} dialogue turns SIMULTANEOUSLY`);

  // FULLY PARALLEL synthesis - ALL turns at once for maximum speed
  type TurnResult = { 
    index: number; 
    result: TTSSynthesizeResult;
    durationTicks: number;
  };

  // Helper function to synthesize a single turn with validation
  async function synthesizeTurn(turn: DialogueTurn, index: number): Promise<TurnResult> {
    const voice = DUO_VOICES[turn.speaker];
    const result = await synthesizeText(turn.text, voice);
    return {
      index,
      result,
      durationTicks: result.durationSecs * 10_000_000,
    };
  }

  // Create all promises at once
  const allTurnPromises = dialogue.map((turn, index) => {
    const voice = DUO_VOICES[turn.speaker];
    console.log(`[TTS] Starting turn ${index + 1}/${dialogue.length}: ${turn.speaker} with voice ${voice}`);
    return synthesizeTurn(turn, index);
  });

  // Wait for ALL to complete simultaneously
  let turnResults: TurnResult[] = await Promise.all(allTurnPromises);

  // IMPORTANT: Sort by index to ensure correct order
  turnResults.sort((a, b) => a.index - b.index);

  // Check for failed turns (empty audio) and retry them
  const RETRY_EMPTY_AUDIO = 3;
  for (let retryAttempt = 0; retryAttempt < RETRY_EMPTY_AUDIO; retryAttempt++) {
    // Find turns with empty audio data
    const failedIndices: number[] = [];
    for (const { index, result } of turnResults) {
      const byteLength = result.audioData?.byteLength || result.audioData?.length || 0;
      if (byteLength === 0 || result.durationSecs <= 0) {
        failedIndices.push(index);
      }
    }

    if (failedIndices.length === 0) break; // All good!

    console.log(`[TTS] Retry ${retryAttempt + 1}/${RETRY_EMPTY_AUDIO}: ${failedIndices.length} turns have empty audio: [${failedIndices.map(i => i + 1).join(', ')}]`);
    
    // Wait a bit before retrying
    await sleep(1000 * (retryAttempt + 1));

    // Retry failed turns in parallel
    const retryPromises = failedIndices.map(index => {
      console.log(`[TTS] Retrying turn ${index + 1}...`);
      return synthesizeTurn(dialogue[index], index);
    });

    const retryResults = await Promise.all(retryPromises);

    // Replace failed results with retry results
    for (const retryResult of retryResults) {
      const existingIdx = turnResults.findIndex(t => t.index === retryResult.index);
      if (existingIdx !== -1) {
        turnResults[existingIdx] = retryResult;
      }
    }
  }

  // Re-sort after retries
  turnResults.sort((a, b) => a.index - b.index);
  
  // Verify all turns were synthesized
  if (turnResults.length !== dialogue.length) {
    console.error(`[TTS] ERROR: Expected ${dialogue.length} turns, got ${turnResults.length}`);
    throw new Error(`Missing dialogue turns: expected ${dialogue.length}, got ${turnResults.length}`);
  }

  // Build audio chunks in correct order
  const audioChunks: ArrayBuffer[] = [];
  const allWordTimestamps: WordTimestamp[] = [];
  let currentOffsetTicks = 0;
  const pauseTicks = pauseBetweenTurnsMs * 10_000;

  for (const { index, result, durationTicks } of turnResults) {
    console.log(`[TTS] Adding turn ${index + 1}: ${result.durationSecs.toFixed(1)}s`);
    
    // Convert Buffer to ArrayBuffer for combining
    const arrayBuffer = result.audioData.buffer.slice(
      result.audioData.byteOffset,
      result.audioData.byteOffset + result.audioData.byteLength
    ) as ArrayBuffer;
    
    // Verify chunk has content
    if (arrayBuffer.byteLength === 0) {
      console.error(`[TTS] ERROR: Turn ${index + 1} has no audio data!`);
      throw new Error(`Turn ${index + 1} has no audio data`);
    }
    
    audioChunks.push(arrayBuffer);

    // Adjust word timestamps with current offset
    if (result.wordTimestamps && result.wordTimestamps.length > 0) {
      for (const word of result.wordTimestamps) {
        allWordTimestamps.push({
          offset: word.offset + currentOffsetTicks,
          duration: word.duration,
          text: word.text,
        });
      }
    }

    // Update offset for next turn
    currentOffsetTicks += durationTicks + pauseTicks;
  }

  // Combine MP3 chunks with Xing header for proper seeking
  console.log(`[TTS] Combining ${audioChunks.length} dialogue turns with Xing header...`);
  const combinedAudio = combineMP3ChunksWithXingHeader(audioChunks);
  const audioBuffer = Buffer.from(combinedAudio);
  
  // Calculate actual duration from combined audio
  const actualDuration = calculateMP3Duration(combinedAudio);
  const totalDurationSecs = actualDuration > 0 ? actualDuration : currentOffsetTicks / 10_000_000;

  console.log(`[TTS] Combined ${dialogue.length} turns into ${audioBuffer.length} bytes, ${totalDurationSecs.toFixed(1)}s`);

  return {
    audioData: audioBuffer,
    durationSecs: totalDurationSecs,
    format: "mp3",
    wordTimestamps: allWordTimestamps,
  };
}

// Helper: Skip ID3 tag and find first MP3 frame
function skipMP3Header(buffer: Buffer): Buffer {
  let offset = 0;
  
  // Check for ID3v2 tag (ID3)
  if (buffer.length > 10 && 
      buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    // ID3v2 header found - calculate size
    // Size is 4 bytes, each byte uses only 7 bits (syncsafe integer)
    const size = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
    offset = 10 + size;
  }
  
  // Find first MP3 sync word (0xFF 0xFB, 0xFF 0xFA, 0xFF 0xF3, etc.)
  while (offset < buffer.length - 1) {
    if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xE0) === 0xE0) {
      // Found MP3 frame sync
      break;
    }
    offset++;
  }
  
  return buffer.slice(offset);
}

// Main synthesis function that handles both modes
export async function synthesizeEpisode(
  audioScript: string,
  conversationStyle: ConversationStyle,
  dialogue?: DialogueTurn[]
): Promise<TTSSynthesizeResult> {
  if (conversationStyle === "duo" && dialogue && dialogue.length > 0) {
    return synthesizeDialogue(dialogue);
  }
  
  return synthesizeText(audioScript);
}

// Save audio to storage (local or cloud)
export async function saveAudioToStorage(
  audioData: Buffer,
  filename: string,
  format: "mp3" | "wav" = "mp3"
): Promise<string> {
  return uploadAudio(audioData, filename, format);
}

// Generate SRT subtitles from word timestamps
export function generateSubtitles(
  wordTimestamps: WordTimestamp[],
  wordsPerLine: number = 7
): string {
  const lines: Array<{
    startOffset: number;
    endOffset: number;
    text: string;
  }> = [];

  for (let i = 0; i < wordTimestamps.length; i += wordsPerLine) {
    const chunk = wordTimestamps.slice(i, i + wordsPerLine);
    if (chunk.length === 0) continue;

    const firstWord = chunk[0];
    const lastWord = chunk[chunk.length - 1];
    const text = chunk.map((w) => w.text).join(" ");

    lines.push({
      startOffset: firstWord.offset,
      endOffset: lastWord.offset + lastWord.duration,
      text,
    });
  }

  const srtLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startTime = formatSrtTime(line.startOffset / 10_000_000);
    const endTime = formatSrtTime(line.endOffset / 10_000_000);

    srtLines.push(String(i + 1));
    srtLines.push(`${startTime} --> ${endTime}`);
    srtLines.push(line.text);
    srtLines.push("");
  }

  return srtLines.join("\n");
}

// Format seconds to SRT timestamp
function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// Get available voices
export function getAvailableVoices(): Record<string, string> {
  return VOICES;
}

// Get TTS engine info
export function getTTSEngineInfo(): { engine: string; configured: boolean } {
  return {
    engine: USE_KOKORO ? "kokoro" : "edge-tts",
    configured: true,
  };
}
