// Test script for Kokoro TTS via OpenAI-compatible API
// Run with: npx tsx scripts/test-tts.ts

import * as fs from "fs";
import * as path from "path";

const DEEPINFRA_OPENAI_URL = "https://api.deepinfra.com/v1/openai/audio/speech";

async function testKokoroTTS() {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  
  if (!apiKey) {
    console.error("❌ DEEPINFRA_API_KEY not set!");
    console.log("Run: $env:DEEPINFRA_API_KEY = 'your_key_here'");
    process.exit(1);
  }

  console.log("🎙️ Testing Kokoro TTS via OpenAI API...\n");

  const testText = "Hello! This is a test of the Kokoro text to speech system using the OpenAI compatible API.";
  const voice = "af_bella";

  console.log(`📝 Text: "${testText}"`);
  console.log(`🎤 Voice: ${voice}`);
  console.log(`📡 Sending request to DeepInfra OpenAI API...\n`);

  try {
    const response = await fetch(DEEPINFRA_OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "hexgrad/Kokoro-82M",
        input: testText,
        voice: voice,
        response_format: "mp3",
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ API Error: ${response.status}`);
      console.error(error);
      process.exit(1);
    }

    console.log("✅ Response received!");
    console.log(`📊 Content-Type: ${response.headers.get("content-type")}`);

    // OpenAI API returns raw audio bytes
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    
    console.log(`📦 Audio size: ${audioBuffer.length} bytes`);

    // Check format
    const firstBytes = audioBuffer.slice(0, 4);
    console.log(`🔍 First 4 bytes (hex): ${firstBytes.toString("hex")}`);
    
    if (firstBytes[0] === 0x49 && firstBytes[1] === 0x44 && firstBytes[2] === 0x33) {
      console.log(`✅ Format: MP3 with ID3 tag`);
    } else if (firstBytes[0] === 0xFF && (firstBytes[1] & 0xE0) === 0xE0) {
      console.log(`✅ Format: Raw MP3 frames`);
    } else if (firstBytes.toString("ascii") === "RIFF") {
      console.log(`⚠️ Format: WAV (not MP3!)`);
    } else {
      console.log(`❓ Format: Unknown - first bytes: ${firstBytes.toString("hex")}`);
    }

    // Create output directory
    const outputDir = path.join(process.cwd(), "public", "audio");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save MP3 file
    const outputPath = path.join(outputDir, "test-kokoro-openai.mp3");
    fs.writeFileSync(outputPath, audioBuffer);
    console.log(`\n💾 Saved to: ${outputPath}`);
    console.log(`🎧 Try playing the file!`);

    // Estimate duration (128kbps = 16KB/s, but Kokoro uses ~48kbps for speech)
    const estimatedDuration = (audioBuffer.length * 8) / 48000;
    console.log(`📊 Estimated duration: ~${estimatedDuration.toFixed(1)}s`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }

  console.log("\n✅ Test complete!");
}

testKokoroTTS();
