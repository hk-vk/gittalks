// GitTalks - Storage Layer
// Supports Tigris (primary), Backblaze B2, Cloudflare R2 (alternatives), or local filesystem

import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import path from "path";

// Tigris Configuration (recommended - 5GB free, global CDN)
const TIGRIS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID || process.env.TIGRIS_ACCESS_KEY;
const TIGRIS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY || process.env.TIGRIS_SECRET_KEY;
const TIGRIS_BUCKET_NAME = process.env.BUCKET_NAME || process.env.TIGRIS_BUCKET_NAME || "gittalks";
const TIGRIS_ENDPOINT = process.env.AWS_ENDPOINT_URL_S3 || "https://fly.storage.tigris.dev";
const TIGRIS_PUBLIC_URL = process.env.TIGRIS_PUBLIC_URL; // e.g., https://your-bucket.fly.storage.tigris.dev

// Backblaze B2 Configuration (alternative - 10GB free)
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APP_KEY = process.env.B2_APP_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || "gittalks";
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_PUBLIC_URL = process.env.B2_PUBLIC_URL;

// Cloudflare R2 Configuration (alternative)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "gittalks";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// Determine which storage to use (priority: Tigris > B2 > R2 > local)
const USE_TIGRIS = !!(TIGRIS_ACCESS_KEY && TIGRIS_SECRET_KEY);
const USE_B2 = !USE_TIGRIS && !!(B2_KEY_ID && B2_APP_KEY && B2_ENDPOINT);
const USE_R2 = !USE_TIGRIS && !USE_B2 && !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
const STORAGE_TYPE = USE_TIGRIS ? "tigris" : USE_B2 ? "backblaze-b2" : USE_R2 ? "cloudflare-r2" : "local";

// Initialize S3 client
let s3Client: S3Client | null = null;
let bucketName = "";
let publicUrl = "";

if (USE_TIGRIS) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: TIGRIS_ENDPOINT,
    credentials: {
      accessKeyId: TIGRIS_ACCESS_KEY!,
      secretAccessKey: TIGRIS_SECRET_KEY!,
    },
  });
  bucketName = TIGRIS_BUCKET_NAME;
  // Tigris public URL - derive from endpoint
  const endpointHost = TIGRIS_ENDPOINT.replace("https://", "").replace("http://", "");
  publicUrl = TIGRIS_PUBLIC_URL || `https://${TIGRIS_BUCKET_NAME}.${endpointHost}`;
} else if (USE_B2) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: B2_ENDPOINT,
    credentials: {
      accessKeyId: B2_KEY_ID!,
      secretAccessKey: B2_APP_KEY!,
    },
  });
  bucketName = B2_BUCKET_NAME;
  publicUrl = B2_PUBLIC_URL || "";
} else if (USE_R2) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
  bucketName = R2_BUCKET_NAME;
  publicUrl = R2_PUBLIC_URL || `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.dev`;
}

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
  const key = `audio/${filename}.${extension}`;
  
  if (s3Client) {
    // Upload to cloud storage (B2 or R2)
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: audioBuffer,
      ContentType: mimeType,
    });
    
    await s3Client.send(command);
    
    // Return public URL
    if (publicUrl) {
      return `${publicUrl}/${key}`;
    }
    // Fallback - this shouldn't happen if configured correctly
    return `/${key}`;
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
  if (s3Client) {
    // Extract key from URL
    const urlParts = url.split("/");
    const keyIndex = urlParts.findIndex(part => part === "audio");
    if (keyIndex >= 0) {
      const key = urlParts.slice(keyIndex).join("/");
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      await s3Client.send(command);
    }
  } else {
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
  if (s3Client) {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: "audio/",
      MaxKeys: 500,
    });
    
    const response = await s3Client.send(command);
    const files = response.Contents?.map(obj => obj.Key).filter(Boolean) as string[] || [];
    
    return files.map(key => {
      if (publicUrl) {
        return `${publicUrl}/${key}`;
      }
      return `/${key}`;
    });
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
  return !!s3Client;
}

/**
 * Get storage info
 */
export function getStorageInfo(): { type: string; configured: boolean } {
  return {
    type: STORAGE_TYPE,
    configured: true,
  };
}
