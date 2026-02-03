// GitTalks API - Get Playlist
// GET /api/playlist/[owner]/[repo] - Get playlist for a repository

import { NextRequest, NextResponse } from "next/server";
import { getPlaylistByRepo } from "@/lib/pipeline";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const { owner, repo } = await params;

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "Owner and repo are required" },
        { status: 400 }
      );
    }

    const result = getPlaylistByRepo(owner, repo);

    if (!result) {
      return NextResponse.json(
        { error: "Playlist not found", exists: false },
        { status: 404 }
      );
    }

    return NextResponse.json({
      exists: true,
      playlist: result.playlist,
      episodes: result.episodes,
    });
  } catch (error) {
    console.error("Playlist API error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
