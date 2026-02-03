// GitTalks - TTS Integration
// Uses DeepInfra Kokoro TTS via OpenAI-compatible API (fast, high-quality)
// Or Edge TTS (free fallback)

import type {
  TTSSynthesizeResult,
  WordTimestamp,
  DialogueTurn,
  ConversationStyle,
} from "./types";
import { uploadAudio } from "./storage";

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

// Synthesize using Kokoro via DeepInfra OpenAI-compatible API
async function synthesizeWithKokoro(
  text: string,
  voice: string
): Promise<TTSSynthesizeResult> {
  const apiKey = process.env.DEEPINFRA_API_KEY!;
  const cleanText = cleanTextForTTS(text);
  const speed = parseFloat(process.env.KOKORO_SPEED || "1.0");

  console.log(`[TTS/Kokoro] Synthesizing ${cleanText.length} chars with voice ${voice}`);

  // Use OpenAI-compatible API endpoint which properly returns MP3
  const response = await fetch(DEEPINFRA_OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "hexgrad/Kokoro-82M",
      input: cleanText,
      voice: voice,
      response_format: "mp3",
      speed: speed,
    }),
  });

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

  // Calculate duration from audio size (approximate for MP3)
  // MP3 at 128kbps = 16KB per second
  // Kokoro typically uses ~48-64kbps for speech
  const estimatedBitrate = 48000; // 48kbps typical for speech
  const durationSecs = (audioBuffer.length * 8) / estimatedBitrate;

  console.log(`[TTS/Kokoro] Generated ~${durationSecs.toFixed(1)}s MP3 audio`);

  return {
    audioData: audioBuffer,
    durationSecs,
    format: "mp3",
    wordTimestamps: [], // OpenAI API doesn't return timestamps
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
    
    // For MP3 concatenation, we need to handle headers properly
    // First chunk keeps full data, subsequent chunks skip ID3 tag
    if (i === 0) {
      audioChunks.push(result.audioData);
    } else {
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

  // Combine MP3 chunks
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
