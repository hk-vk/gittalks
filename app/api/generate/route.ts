// GitTalks API - Generate Podcast
// POST /api/generate - Start podcast generation

import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import type { ConversationStyle } from "@/lib/types";

export const maxDuration = 300; // 5 minutes max for serverless

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoUrl, conversationStyle = "duo" } = body as {
      repoUrl?: string;
      conversationStyle?: ConversationStyle;
    };

    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }

    // Validate conversation style
    if (conversationStyle !== "single" && conversationStyle !== "duo") {
      return NextResponse.json(
        { error: "conversationStyle must be 'single' or 'duo'" },
        { status: 400 }
      );
    }

    // Generate a simple user ID for now (in production, use auth)
    const userId = "anonymous";

    // Run the pipeline
    const result = await runPipeline(repoUrl, userId, conversationStyle);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || "Pipeline failed",
          job: result.job,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      job: result.job,
      playlist: result.playlist,
      episodes: result.episodes,
    });
  } catch (error) {
    console.error("Generate API error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
