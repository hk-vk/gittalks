import { NextRequest, NextResponse } from "next/server";

/**
 * Audio proxy that ALWAYS handles Range requests for proper seeking.
 * We fetch the full file and cache it in memory, then serve byte ranges.
 * 
 * This is necessary because UploadThing and some other providers don't
 * properly support HTTP Range requests which browsers need for audio seeking.
 */

// Simple in-memory cache for audio files (in production, use Redis or similar)
const audioCache = new Map<string, { data: Uint8Array; contentType: string }>();
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB max cache
let currentCacheSize = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    
    // Reconstruct the original URL from the path segments
    const audioUrl = decodeURIComponent(path.join("/"));
    
    console.log("[Audio Proxy] Request for:", audioUrl.substring(0, 80));
    
    if (!audioUrl || !audioUrl.startsWith("http")) {
      return NextResponse.json({ error: "Invalid audio URL" }, { status: 400 });
    }

    // Get Range header from request
    const rangeHeader = request.headers.get("range");
    console.log("[Audio Proxy] Range header:", rangeHeader);

    // Check cache first
    let cached = audioCache.get(audioUrl);
    
    if (!cached) {
      console.log("[Audio Proxy] Cache miss, fetching from source...");
      
      // Fetch full audio file
      const response = await fetch(audioUrl);
      
      if (!response.ok) {
        console.log("[Audio Proxy] Source fetch failed:", response.status);
        return NextResponse.json(
          { error: "Failed to fetch audio" },
          { status: response.status }
        );
      }

      const contentType = response.headers.get("content-type") || "audio/mpeg";
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      console.log("[Audio Proxy] Fetched", data.length, "bytes, type:", contentType);

      // Cache if not too large
      if (data.length < MAX_CACHE_SIZE / 2) {
        // Clear old entries if needed
        if (currentCacheSize + data.length > MAX_CACHE_SIZE) {
          console.log("[Audio Proxy] Cache full, clearing...");
          audioCache.clear();
          currentCacheSize = 0;
        }
        
        audioCache.set(audioUrl, { data, contentType });
        currentCacheSize += data.length;
        console.log("[Audio Proxy] Cached, total cache size:", currentCacheSize);
      }
      
      cached = { data, contentType };
    } else {
      console.log("[Audio Proxy] Cache hit, size:", cached.data.length);
    }

    const { data, contentType } = cached;
    const totalSize = data.length;

    // Create response headers
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=31536000");
    
    // Handle Range request
    if (rangeHeader) {
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : totalSize - 1;
        
        console.log("[Audio Proxy] Range request:", start, "-", end, "of", totalSize);
        
        if (start >= totalSize) {
          return new NextResponse(null, {
            status: 416, // Range Not Satisfiable
            headers: {
              "Content-Range": `bytes */${totalSize}`,
            },
          });
        }

        // Clamp end to valid range
        const actualEnd = Math.min(end, totalSize - 1);
        const chunk = data.slice(start, actualEnd + 1);
        
        headers.set("Content-Length", chunk.length.toString());
        headers.set("Content-Range", `bytes ${start}-${actualEnd}/${totalSize}`);

        console.log("[Audio Proxy] Returning partial content:", chunk.length, "bytes");
        
        return new NextResponse(Buffer.from(chunk), {
          status: 206,
          headers,
        });
      }
    }

    // Return full content if no Range header
    headers.set("Content-Length", totalSize.toString());
    
    console.log("[Audio Proxy] Returning full content:", totalSize, "bytes");
    
    return new NextResponse(Buffer.from(data), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[Audio Proxy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Handle HEAD requests for metadata
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const audioUrl = decodeURIComponent(path.join("/"));
    
    if (!audioUrl || !audioUrl.startsWith("http")) {
      return NextResponse.json({ error: "Invalid audio URL" }, { status: 400 });
    }

    // Check cache for size
    const cached = audioCache.get(audioUrl);
    
    if (cached) {
      const headers = new Headers();
      headers.set("Content-Type", cached.contentType);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Length", cached.data.length.toString());
      return new NextResponse(null, { status: 200, headers });
    }

    // Fetch just headers from source
    const response = await fetch(audioUrl, { method: "HEAD" });
    
    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") || "audio/mpeg");
    headers.set("Accept-Ranges", "bytes");
    
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new NextResponse(null, { status: 200, headers });
  } catch (error) {
    console.error("[Audio Proxy HEAD] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
