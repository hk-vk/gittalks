// GitTalks API - Recent Playlists
// GET /api/playlists/recent - Get recent public playlists

import { NextRequest, NextResponse } from "next/server";
import { getRecentPlaylists } from "@/lib/pipeline";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const playlists = getRecentPlaylists(Math.min(limit, 50));

    return NextResponse.json({
      playlists,
      count: playlists.length,
    });
  } catch (error) {
    console.error("Recent playlists API error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
