// GitTalks API - Available TTS Voices
// GET /api/voices - Get available TTS voices

import { NextResponse } from "next/server";
import { getAvailableVoices, DUO_VOICES } from "@/lib/tts";

export async function GET() {
  try {
    const voices = getAvailableVoices();

    return NextResponse.json({
      voices,
      duoVoices: DUO_VOICES,
      defaultVoice: "en-US-EmmaMultilingualNeural",
    });
  } catch (error) {
    console.error("Voices API error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
