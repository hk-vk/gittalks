// GitTalks API - Get Job Status
// GET /api/job/[id] - Get job status and details

import { NextRequest, NextResponse } from "next/server";
import { getJobStatus } from "@/lib/pipeline";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    const result = await getJobStatus(id);

    if (!result) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Job status API error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
