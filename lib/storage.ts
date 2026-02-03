// GitTalks - Storage Layer
// Supports local filesystem storage and UploadThing for cloud deployment

import { UTApi } from "uploadthing/server";
import { promises as fs } from "fs";
import path from "path";

// Storage mode - uses UploadThing when token is set, otherwise local
const USE_UPLOADTHING = !!process.env.UPLOADTHING_TOKEN;

// Initialize UTApi for server-side uploads
const utapi = USE_UPLOADTHING ? new UTApi() : null;

// Local audio directory
const LOCAL_AUDIO_DIR = path.join(process.cwd(), "public", "audio");

// Ensure local audio directory exists
async function ensureAudioDir() {
  try {
    await fs.mkdir(LOCAL_AUDIO_DIR, { recursive: true });
  } catch (e) {
    // Ignore if exists
  }
}

/**
 * Upload audio file to storage
 * @param audioBuffer - The audio data buffer
 * @param filename - Filename without extension
 * @param format - Audio format ('mp3' or 'wav')
 * @returns URL to access the audio file
 */
export async function uploadAudio(
  audioBuffer: Buffer,
  filename: string,
  format: "mp3" | "wav" = "mp3"
): Promise<string> {
  const mimeType = format === "wav" ? "audio/wav" : "audio/mpeg";
  const extension = format;
  
  if (USE_UPLOADTHING && utapi) {
    // Upload to UploadThing
    // Convert Buffer to Uint8Array for File constructor compatibility
    const uint8Array = new Uint8Array(audioBuffer);
    const file = new File([uint8Array], `${filename}.${extension}`, {
      type: mimeType,
    });
    
    const response = await utapi.uploadFiles([file]);
    
    if (response[0]?.error) {
      throw new Error(`UploadThing error: ${response[0].error.message}`);
    }
    
    return response[0]?.data?.ufsUrl || response[0]?.data?.url || "";
  } else {
    // Save to local filesystem
    await ensureAudioDir();
    const filePath = path.join(LOCAL_AUDIO_DIR, `${filename}.${extension}`);
    await fs.writeFile(filePath, audioBuffer);
    return `/audio/${filename}.${extension}`;
  }
}

/**
 * Delete audio file from storage
 */
export async function deleteAudio(url: string): Promise<void> {
  if (USE_UPLOADTHING && utapi && url.includes("ufs.sh")) {
    // Extract key from URL and delete
    const key = url.split("/").pop();
    if (key) {
      await utapi.deleteFiles([key]);
    }
  } else if (!USE_UPLOADTHING) {
    // Delete local file
    const filename = url.split("/").pop();
    if (filename) {
      const filePath = path.join(LOCAL_AUDIO_DIR, filename);
      try {
        await fs.unlink(filePath);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }
  }
}

/**
 * List all audio files in storage
 */
export async function listAudioFiles(): Promise<string[]> {
  if (USE_UPLOADTHING && utapi) {
    const result = await utapi.listFiles({ limit: 500 });
    return result.files.map((f) => f.key);
  } else {
    await ensureAudioDir();
    const files = await fs.readdir(LOCAL_AUDIO_DIR);
    return files
      .filter((f) => f.endsWith(".mp3"))
      .map((f) => `/audio/${f}`);
  }
}

/**
 * Check if using cloud storage
 */
export function isUsingCloudStorage(): boolean {
  return USE_UPLOADTHING;
}

/**
 * Get storage info
 */
export function getStorageInfo(): { type: string; configured: boolean } {
  return {
    type: USE_UPLOADTHING ? "uploadthing" : "local",
    configured: true,
  };
}
