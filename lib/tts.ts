// GitTalks - Edge TTS Integration
// Using edge-tts-universal for free, high-quality TTS

import { EdgeTTS, createSRT } from "edge-tts-universal";
import { promises as fs } from "fs";
import path from "path";
import type {
  TTSSynthesizeResult,
  WordTimestamp,
  DialogueTurn,
  ConversationStyle,
} from "./types";
import { uploadAudio } from "./storage";

// Voice configurations
// Edge TTS provides excellent Microsoft neural voices for free
export const VOICES = {
  // English US - Female
  "en-US-EmmaMultilingualNeural": "Emma - Natural, warm female voice",
  "en-US-JennyNeural": "Jenny - Friendly, conversational female",
  "en-US-AriaNeural": "Aria - Professional female voice",
  "en-US-AnaNeural": "Ana - Young, energetic female",
  
  // English US - Male
  "en-US-GuyNeural": "Guy - Friendly, casual male voice",
  "en-US-ChristopherNeural": "Christopher - Professional male",
  "en-US-EricNeural": "Eric - Warm, trustworthy male",
  "en-US-BrianMultilingualNeural": "Brian - Natural male voice",
  
  // English UK
  "en-GB-SoniaNeural": "Sonia - British female",
  "en-GB-RyanNeural": "Ryan - British male",
};

// Default voice for single narrator mode
export const DEFAULT_VOICE = "en-US-EmmaMultilingualNeural";

// Voice pairings for duo mode
export const DUO_VOICES = {
  host_expert: "en-US-BrianMultilingualNeural", // Male expert
  host_curious: "en-US-EmmaMultilingualNeural", // Female curious host
};

// Alternative duo pairings
export const ALTERNATIVE_DUO_VOICES = {
  // Male expert, Female curious
  pair1: {
    host_expert: "en-US-ChristopherNeural",
    host_curious: "en-US-JennyNeural",
  },
  // Female expert, Male curious
  pair2: {
    host_expert: "en-US-AriaNeural",
    host_curious: "en-US-GuyNeural",
  },
};

// Prosody settings for natural speech
interface ProsodySettings {
  rate: string;
  pitch: string;
  volume: string;
}

const DEFAULT_PROSODY: ProsodySettings = {
  rate: "+5%",
  pitch: "+0Hz",
  volume: "+0%",
};

const EXPERT_PROSODY: ProsodySettings = {
  rate: "+0%",
  pitch: "-2Hz", // Slightly lower for authority
  volume: "+5%",
};

const CURIOUS_PROSODY: ProsodySettings = {
  rate: "+8%", // Slightly faster, more energetic
  pitch: "+3Hz", // Slightly higher, more curious tone
  volume: "+0%",
};

// Convert word boundaries to our format
function convertWordTimestamps(
  subtitle: Array<{ offset: number; duration: number; text: string }>
): WordTimestamp[] {
  return subtitle.map((word) => ({
    offset: word.offset,
    duration: word.duration,
    text: word.text,
  }));
}

// Estimate audio duration from text
// Average speaking rate is ~150 words per minute
function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).length;
  return (wordCount / 150) * 60;
}

// Synthesize single text to speech
export async function synthesizeText(
  text: string,
  voice: string = DEFAULT_VOICE,
  prosody: ProsodySettings = DEFAULT_PROSODY
): Promise<TTSSynthesizeResult> {
  const tts = new EdgeTTS(text, voice, prosody);

  const result = await tts.synthesize();

  // Convert Blob to Buffer
  const arrayBuffer = await result.audio.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  // Convert word timestamps
  const wordTimestamps = convertWordTimestamps(result.subtitle);

  // Calculate duration from word timestamps or estimate
  let durationSecs: number;
  if (wordTimestamps.length > 0) {
    const lastWord = wordTimestamps[wordTimestamps.length - 1];
    // offset and duration are in 100-nanosecond units (ticks)
    durationSecs = (lastWord.offset + lastWord.duration) / 10_000_000;
  } else {
    durationSecs = estimateDuration(text);
  }

  return {
    audioData: audioBuffer,
    durationSecs,
    format: "mp3",
    wordTimestamps,
  };
}

// Synthesize dialogue for duo mode
export async function synthesizeDialogue(
  dialogue: DialogueTurn[],
  pauseBetweenTurnsMs: number = 400
): Promise<TTSSynthesizeResult> {
  const audioChunks: Buffer[] = [];
  const allWordTimestamps: WordTimestamp[] = [];
  let currentOffsetTicks = 0;

  for (let i = 0; i < dialogue.length; i++) {
    const turn = dialogue[i];
    
    // Select voice and prosody based on speaker
    const voice = DUO_VOICES[turn.speaker];
    const prosody = turn.speaker === "host_expert" ? EXPERT_PROSODY : CURIOUS_PROSODY;

    // Synthesize this turn
    const result = await synthesizeText(turn.text, voice, prosody);
    
    audioChunks.push(result.audioData);

    // Adjust word timestamps with current offset
    if (result.wordTimestamps) {
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

  // Combine audio chunks
  // Note: Simple concatenation works for MP3 but may have minor artifacts
  // For production, consider using ffmpeg or similar
  const combinedAudio = Buffer.concat(audioChunks);

  const totalDurationSecs = currentOffsetTicks / 10_000_000;

  return {
    audioData: combinedAudio,
    durationSecs: totalDurationSecs,
    format: "mp3",
    wordTimestamps: allWordTimestamps,
  };
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
// Returns the URL to access the audio file
export async function saveAudioToStorage(
  audioData: Buffer,
  filename: string
): Promise<string> {
  return uploadAudio(audioData, filename);
}

// Legacy function for local file system (deprecated)
export async function saveAudioToFile(
  audioData: Buffer,
  outputDir: string,
  filename: string
): Promise<string> {
  // Ensure directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const filePath = path.join(outputDir, `${filename}.mp3`);
  await fs.writeFile(filePath, audioData);

  return filePath;
}

// Generate SRT subtitles from word timestamps
export function generateSubtitles(
  wordTimestamps: WordTimestamp[],
  wordsPerLine: number = 7
): string {
  // Group words into lines
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

  // Convert to SRT format
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
