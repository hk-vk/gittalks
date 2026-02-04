/**
 * MP3 Utilities for proper audio concatenation with Xing header
 *
 * This module provides functions to properly combine MP3 chunks with accurate
 * seeking information (Xing/VBR header with TOC).
 */

export interface ParsedFrame {
  data: Uint8Array;
  header?: Uint8Array;
  samples: number;
  sampleRate?: number;
  channelMode?: number;
  mpegVersion?: number;
  layer?: number;
}

/**
 * Calculate the actual duration of an MP3 file by parsing frames
 * This is more accurate than relying on metadata or estimates
 */
export function calculateMP3Duration(data: ArrayBuffer): number {
  const frames = parseMP3Frames(new Uint8Array(data));
  if (frames.length === 0) return 0;

  // Get sample rate from first frame (default to 44100 if not found)
  const sampleRate = frames[0]?.sampleRate ?? 44100;

  // Calculate total samples
  let totalSamples = 0;
  for (const frame of frames) {
    totalSamples += frame.samples;
  }

  // Duration = total samples / sample rate
  return totalSamples / sampleRate;
}

/**
 * Parse MP3 data to extract individual frames
 */
export function parseMP3Frames(data: Uint8Array): ParsedFrame[] {
  const frames: ParsedFrame[] = [];

  let pos = 0;

  // Skip ID3v2 tag if present
  if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    const size = (data[6]! << 21) | (data[7]! << 14) | (data[8]! << 7) | data[9]!;
    pos = 10 + size;
  }

  // MP3 bitrate tables
  const bitratesV1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const bitratesV2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const sampleRates = [
    [44100, 48000, 32000, 0], // MPEG1
    [22050, 24000, 16000, 0], // MPEG2
    [11025, 12000, 8000, 0],  // MPEG2.5
  ];

  while (pos < data.length - 4) {
    // Look for frame sync
    if (data[pos] !== 0xFF || (data[pos + 1]! & 0xE0) !== 0xE0) {
      pos++;
      continue;
    }

    // Parse header
    const header = data.slice(pos, pos + 4);
    const b1 = header[1]!;
    const b2 = header[2]!;
    const b3 = header[3]!;

    // MPEG version: bits 4-3 of byte 1
    const versionBits = (b1 >> 3) & 0x03;
    // 00 = MPEG2.5, 01 = reserved, 10 = MPEG2, 11 = MPEG1
    if (versionBits === 1) { pos++; continue; } // reserved

    const mpegVersion = versionBits;
    const isMPEG1 = versionBits === 3;

    // Layer: bits 2-1 of byte 1
    const layerBits = (b1 >> 1) & 0x03;
    // 00 = reserved, 01 = Layer3, 10 = Layer2, 11 = Layer1
    if (layerBits === 0) { pos++; continue; } // reserved
    const layer = layerBits;

    // Bitrate index: bits 7-4 of byte 2
    const bitrateIndex = (b2 >> 4) & 0x0F;
    if (bitrateIndex === 0 || bitrateIndex === 15) { pos++; continue; }

    const bitrate = isMPEG1
      ? bitratesV1L3[bitrateIndex]!
      : bitratesV2L3[bitrateIndex]!;

    // Sample rate index: bits 3-2 of byte 2
    const srIndex = (b2 >> 2) & 0x03;
    if (srIndex === 3) { pos++; continue; }

    const versionIndex = isMPEG1 ? 0 : (versionBits === 0 ? 2 : 1);
    const sampleRate = sampleRates[versionIndex]![srIndex]!;

    // Padding: bit 1 of byte 2
    const padding = (b2 >> 1) & 0x01;

    // Channel mode: bits 7-6 of byte 3
    const channelMode = (b3 >> 6) & 0x03;

    // Calculate frame size
    // For Layer 3: frameSize = 144 * bitrate * 1000 / sampleRate + padding
    // MPEG1: 144, MPEG2/2.5: 72
    const coefficient = isMPEG1 ? 144 : 72;
    const frameSize = Math.floor((coefficient * bitrate * 1000) / sampleRate) + padding;

    if (frameSize < 4 || pos + frameSize > data.length) {
      pos++;
      continue;
    }

    // Samples per frame
    const samples = isMPEG1 ? 1152 : 576;

    // Extract frame
    frames.push({
      data: data.slice(pos, pos + frameSize),
      header: header,
      samples,
      sampleRate,
      channelMode,
      mpegVersion,
      layer,
    });

    pos += frameSize;
  }

  return frames;
}

/**
 * Combine multiple MP3 chunks into a single properly-formed MP3 file with Xing header.
 *
 * The Xing header includes a Table of Contents (TOC) that maps time/percentage to
 * byte positions, enabling accurate seeking in VBR MP3 files.
 */
export function combineMP3ChunksWithXingHeader(chunks: ArrayBuffer[]): ArrayBuffer {
  if (chunks.length === 0) {
    throw new Error("No audio chunks to combine");
  }

  console.log(`[MP3Utils] Combining ${chunks.length} audio chunks with Xing header...`);

  // Parse each chunk to extract MP3 frames
  const allFrames: { data: Uint8Array; samples: number }[] = [];
  let firstFrameHeader: Uint8Array | null = null;
  let mpegVersion = 3; // MPEG1
  let channelMode = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkData = new Uint8Array(chunks[i]!);
    const frames = parseMP3Frames(chunkData);

    for (const frame of frames) {
      if (!firstFrameHeader && frame.header) {
        firstFrameHeader = frame.header;
        mpegVersion = frame.mpegVersion || 3;
        channelMode = frame.channelMode || 0;
      }
      allFrames.push({ data: frame.data, samples: frame.samples });
    }

    console.log(`[MP3Utils] Chunk ${i}: Extracted ${frames.length} frames`);
  }

  if (allFrames.length === 0) {
    throw new Error("No valid MP3 frames found in chunks");
  }

  // Calculate totals
  const totalFrames = allFrames.length;
  let totalBytes = 0;
  for (const frame of allFrames) {
    totalBytes += frame.data.length;
  }

  console.log(`[MP3Utils] Total: ${totalFrames} frames, ${totalBytes} bytes`);

  // Build TOC (Table of Contents) - 100 entries mapping percentage to byte offset
  const toc = new Uint8Array(100);
  let bytesSoFar = 0;
  let frameIndex = 0;

  for (let i = 0; i < 100; i++) {
    const targetPercent = i / 100;
    const targetBytes = Math.floor(targetPercent * totalBytes);

    while (frameIndex < allFrames.length - 1 && bytesSoFar + allFrames[frameIndex]!.data.length < targetBytes) {
      bytesSoFar += allFrames[frameIndex]!.data.length;
      frameIndex++;
    }

    toc[i] = Math.min(255, Math.floor((bytesSoFar / totalBytes) * 256));
  }

  // Create Xing header frame
  const isMPEG1 = mpegVersion === 3;
  const isStereo = channelMode !== 3;
  const xingOffset = isMPEG1 ? (isStereo ? 36 : 21) : (isStereo ? 21 : 13);
  const xingFrameSize = isMPEG1 ? 417 : 209;
  const xingFrame = new Uint8Array(xingFrameSize);

  if (firstFrameHeader && firstFrameHeader.length >= 4) {
    xingFrame.set(firstFrameHeader.slice(0, 4), 0);
  } else {
    // Default MPEG1 Layer3 44.1kHz header
    xingFrame[0] = 0xFF;
    xingFrame[1] = 0xFB;
    xingFrame[2] = 0x90;
    xingFrame[3] = 0x00;
  }

  // Write "Xing" identifier
  const xingId = new TextEncoder().encode("Xing");
  xingFrame.set(xingId, xingOffset);

  // Flags: 0x0F = frames + bytes + TOC + quality
  xingFrame[xingOffset + 4] = 0x00;
  xingFrame[xingOffset + 5] = 0x00;
  xingFrame[xingOffset + 6] = 0x00;
  xingFrame[xingOffset + 7] = 0x0F;

  // Total frames (4 bytes big-endian) - include Xing frame
  const totalFramesWithXing = totalFrames + 1;
  xingFrame[xingOffset + 8] = (totalFramesWithXing >> 24) & 0xFF;
  xingFrame[xingOffset + 9] = (totalFramesWithXing >> 16) & 0xFF;
  xingFrame[xingOffset + 10] = (totalFramesWithXing >> 8) & 0xFF;
  xingFrame[xingOffset + 11] = totalFramesWithXing & 0xFF;

  // Total bytes (4 bytes big-endian)
  const totalBytesWithXing = totalBytes + xingFrameSize;
  xingFrame[xingOffset + 12] = (totalBytesWithXing >> 24) & 0xFF;
  xingFrame[xingOffset + 13] = (totalBytesWithXing >> 16) & 0xFF;
  xingFrame[xingOffset + 14] = (totalBytesWithXing >> 8) & 0xFF;
  xingFrame[xingOffset + 15] = totalBytesWithXing & 0xFF;

  // TOC (100 bytes)
  xingFrame.set(toc, xingOffset + 16);

  // Quality indicator (4 bytes) - 100 (best)
  xingFrame[xingOffset + 116] = 0x00;
  xingFrame[xingOffset + 117] = 0x00;
  xingFrame[xingOffset + 118] = 0x00;
  xingFrame[xingOffset + 119] = 0x64;

  // Combine: Xing frame + all audio frames
  const finalSize = xingFrameSize + totalBytes;
  const combined = new Uint8Array(finalSize);

  combined.set(xingFrame, 0);

  let offset = xingFrameSize;
  for (const frame of allFrames) {
    combined.set(frame.data, offset);
    offset += frame.data.length;
  }

  console.log(`[MP3Utils] Added Xing header. Final size: ${finalSize} bytes`);

  return combined.buffer;
}

/**
 * Simple concatenation of MP3 buffers (for single chunks or when Xing isn't needed)
 */
export function concatenateMP3Buffers(buffers: Buffer[]): Buffer {
  return Buffer.concat(buffers);
}
