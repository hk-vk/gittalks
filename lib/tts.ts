// GitTalks - TTS Integration
// Uses DeepInfra Kokoro TTS (fast, high-quality) or Edge TTS (free fallback)

import type {
  TTSSynthesizeResult,
  WordTimestamp,
  DialogueTurn,
  ConversationStyle,
} from "./types";
import { uploadAudio } from "./storage";

// Check which TTS engine to use
const USE_KOKORO = !!process.env.DEEPINFRA_API_KEY;

// DeepInfra API endpoint for Kokoro
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M";

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
      host_expert: "am_adam",
      host_curious: "af_nicole",
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

// Synthesize using Kokoro via DeepInfra
async function synthesizeWithKokoro(
  text: string,
  voice: string
): Promise<TTSSynthesizeResult> {
  const apiKey = process.env.DEEPINFRA_API_KEY!;
  const cleanText = cleanTextForTTS(text);
  const speed = parseFloat(process.env.KOKORO_SPEED || "1.0");

  console.log(`[TTS/Kokoro] Synthesizing ${cleanText.length} chars with voice ${voice}`);

  // Kokoro API expects preset_voice as array
  const response = await fetch(DEEPINFRA_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: cleanText,
      preset_voice: [voice],  // Voice as array per docs
      output_format: "mp3",   // Request MP3 format (universal browser support)
      speed: speed,           // Speaking speed
      return_timestamps: true, // Get word timestamps for synced lyrics
      stream: false,          // Don't stream, get full audio
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Kokoro TTS error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  
  // Debug: log the response structure
  console.log(`[TTS/Kokoro] Response keys: ${Object.keys(result).join(", ")}`);
  if (result.audio) {
    console.log(`[TTS/Kokoro] Audio type: ${typeof result.audio}, length: ${typeof result.audio === "string" ? result.audio.length : "N/A"}`);
  }

  // Get audio data - Kokoro returns base64-encoded MP3 when output_format=mp3
  let audioBuffer: Buffer;
  
  if (result.audio) {
    if (typeof result.audio === "string") {
      // Base64 encoded audio - this is the typical format
      audioBuffer = Buffer.from(result.audio, "base64");
      console.log(`[TTS/Kokoro] Decoded audio size: ${audioBuffer.length} bytes`);
      
      // Verify audio format by checking magic bytes
      if (audioBuffer.length > 4) {
        const firstBytes = audioBuffer.slice(0, 4);
        console.log(`[TTS/Kokoro] First 4 bytes (hex): ${firstBytes.toString("hex")}`);
        
        // ID3 tag starts with 'ID3'
        if (firstBytes[0] === 0x49 && firstBytes[1] === 0x44 && firstBytes[2] === 0x33) {
          console.log(`[TTS/Kokoro] Detected ID3 tag (valid MP3 with metadata)`);
        }
        // MP3 sync word starts with 0xFF 0xFB/0xFA/0xF3/0xF2
        else if (firstBytes[0] === 0xFF && (firstBytes[1] & 0xE0) === 0xE0) {
          console.log(`[TTS/Kokoro] Detected MP3 frame sync (valid MP3)`);
        }
        // WAV starts with 'RIFF'
        else if (firstBytes.toString("ascii") === "RIFF") {
          console.log(`[TTS/Kokoro] WARNING: Detected WAV format, but expected MP3!`);
        }
        else {
          console.log(`[TTS/Kokoro] WARNING: Unknown audio format!`);
        }
      }
    } else if (Buffer.isBuffer(result.audio)) {
      audioBuffer = result.audio;
    } else {
      throw new Error(`Unexpected audio type: ${typeof result.audio}`);
    }
  } else {
    console.error("[TTS/Kokoro] Full response:", JSON.stringify(result).slice(0, 500));
    throw new Error("No audio data in Kokoro response");
  }

  // Extract word timestamps if available
  // Format: [{id, start, end, text}, ...]
  const wordTimestamps: WordTimestamp[] = result.words
    ? result.words.map((word: { id?: number; start: number; end: number; text: string }) => ({
        offset: Math.round(word.start * 10_000_000), // Convert to ticks for consistency
        duration: Math.round((word.end - word.start) * 10_000_000),
        text: word.text,
      }))
    : [];

  // Get duration from word timestamps or calculate from audio
  let durationSecs: number;
  if (result.words && result.words.length > 0) {
    const lastWord = result.words[result.words.length - 1];
    durationSecs = lastWord.end;
  } else if (result.inference_status?.runtime_ms) {
    // Estimate from inference time (approximate)
    durationSecs = estimateDuration(cleanText);
  } else {
    durationSecs = estimateDuration(cleanText);
  }

  console.log(`[TTS/Kokoro] Generated ${durationSecs.toFixed(1)}s MP3 audio with ${wordTimestamps.length} timestamps`);

  return {
    audioData: audioBuffer,
    durationSecs,
    format: "mp3", // We requested MP3
    wordTimestamps,
  };
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

// Synthesize dialogue for duo mode
// Each turn is synthesized with the speaker's voice, then combined into one MP3
export async function synthesizeDialogue(
  dialogue: DialogueTurn[],
  pauseBetweenTurnsMs: number = 350
): Promise<TTSSynthesizeResult> {
  const audioChunks: Buffer[] = [];
  const allWordTimestamps: WordTimestamp[] = [];
  let currentOffsetTicks = 0;

  console.log(`[TTS] Synthesizing ${dialogue.length} dialogue turns for duo mode`);

  for (let i = 0; i < dialogue.length; i++) {
    const turn = dialogue[i];
    const voice = DUO_VOICES[turn.speaker];

    console.log(`[TTS] Turn ${i + 1}/${dialogue.length}: ${turn.speaker} with voice ${voice}`);

    // Synthesize this turn with the speaker's voice
    const result = await synthesizeText(turn.text, voice);
    
    // Strip MP3 header for all chunks except first
    // MP3 chunks can be concatenated if we handle headers properly
    if (i === 0) {
      audioChunks.push(result.audioData);
    } else {
      // For subsequent chunks, we need to skip the ID3 tag if present
      const chunk = skipMP3Header(result.audioData);
      audioChunks.push(chunk);
    }

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
    const turnDurationTicks = result.durationSecs * 10_000_000;
    const pauseTicks = pauseBetweenTurnsMs * 10_000;
    currentOffsetTicks += turnDurationTicks + pauseTicks;

    // Small delay to avoid rate limiting
    if (i < dialogue.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Combine MP3 chunks - this works because Kokoro outputs CBR (constant bitrate) MP3
  // For VBR MP3s, you'd need a Xing header, but Kokoro uses CBR by default
  const combinedAudio = Buffer.concat(audioChunks);
  const totalDurationSecs = currentOffsetTicks / 10_000_000;

  console.log(`[TTS] Combined ${dialogue.length} turns into ${combinedAudio.length} bytes, ${totalDurationSecs.toFixed(1)}s`);

  return {
    audioData: combinedAudio,
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
  format: "mp3" | "wav" = "wav"
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
