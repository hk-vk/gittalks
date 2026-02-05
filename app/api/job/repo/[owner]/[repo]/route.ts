// GitTalks API - Get Active Job for Repo
// GET /api/job/repo/[owner]/[repo] - Get active generation job status for a repository
// This allows any user viewing the page to see the generation status

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { initializeDb } from "@/lib/db";

// Ensure database is initialized
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initializeDb();
    dbInitialized = true;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    await ensureDbInitialized();
    const { owner, repo } = await params;

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "Owner and repo are required" },
        { status: 400 }
      );
    }

    // Get the active job for this repo
    const job = await db.getActiveJobByRepo(owner, repo);

    if (!job) {
      return NextResponse.json({
        hasActiveJob: false,
        job: null,
      });
    }

    // Map job status to progress percentage for display
    const statusToProgress: Record<string, number> = {
      "queued": 5,
      "fetching": 15,
      "analyzing": 30,
      "generating-content": 50,
      "generating-audio": 75,
      "completed": 100,
      "failed": 0,
    };

    // Map job status to human-readable step labels
    const statusToLabel: Record<string, string> = {
      "queued": "Queued",
      "fetching": "Fetching repository",
      "analyzing": "Analyzing codebase",
      "generating-content": "Writing scripts",
      "generating-audio": "Recording audio",
      "completed": "Complete",
      "failed": "Failed",
    };

    return NextResponse.json({
      hasActiveJob: true,
      job: {
        id: job.id,
        status: job.status,
        currentStep: job.currentStep || statusToLabel[job.status] || job.status,
        progress: statusToProgress[job.status] || 0,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (error) {
    console.error("Job repo status API error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
