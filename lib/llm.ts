// GitTalks - LLM Content Generation with Vercel AI SDK

import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type {
  FetchRepoOutput,
  AnalysisOutput,
  Classification,
  EpisodeOutline,
  EpisodeContent,
  GeneratedContent,
  DepthSettings,
  ClassifyType,
  ConversationStyle,
  DialogueTurn,
} from "./types";

// Rate limiting configuration for LLM calls
const LLM_RATE_LIMIT = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  betweenEpisodesDelayMs: 2000, // 2 second delay between episode generations
};

// Sleep utility
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff with jitter for LLM rate limits
function getLLMRetryDelay(attempt: number): number {
  const exponentialDelay = LLM_RATE_LIMIT.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, LLM_RATE_LIMIT.maxDelayMs);
}

// Initialize Google AI provider
function getGoogleProvider() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required");
  }
  return createGoogleGenerativeAI({ apiKey });
}

// Zod schemas for structured output
const ClassificationSchema = z.object({
  type: z.enum([
    "applications",
    "frameworks",
    "libraries",
    "development-tools",
    "cli-tools",
    "devops-configuration",
    "documentation",
    "general",
  ]),
  primaryLanguage: z.string(),
  frameworks: z.array(z.string()),
  purpose: z.string(),
  targetAudience: z.string(),
});

const EpisodeOutlineSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.number(),
  estimatedDurationSecs: z.number(),
  sourceFiles: z.array(z.string()),
  isFree: z.boolean(),
});

const AnalysisResponseSchema = z.object({
  classification: ClassificationSchema,
  episodes: z.array(EpisodeOutlineSchema),
  suggestedTitle: z.string(),
  suggestedDescription: z.string(),
});

const SingleEpisodeContentSchema = z.object({
  title: z.string(),
  audioScript: z.string().describe("PLAIN TEXT ONLY - no markdown, no special characters"),
  showNotes: z.string(),
});

const DialogueTurnSchema = z.object({
  speaker: z.enum(["host_expert", "host_curious"]),
  speakerName: z.string(),
  text: z.string(),
  emotion: z.enum(["curious", "excited", "thoughtful", "explaining"]).optional(),
});

const DuoEpisodeContentSchema = z.object({
  title: z.string(),
  dialogue: z.array(DialogueTurnSchema),
  showNotes: z.string(),
});

// Get depth settings based on file count - scaled for substantial episode content
function getDepthSettings(fileCount: number): DepthSettings {
  if (fileCount < 50) {
    // Small repos: deep coverage, comprehensive episodes
    return {
      scope: "full",
      maxFilesToAnalyze: 50,
      episodeDepth: "deep",
      suggestedEpisodes: { min: 4, max: 8 },
      fileContentLimit: 8000,
      depthGuidance: "Deep, comprehensive coverage of entire codebase. Generate 10-15 minute episodes with rich technical detail.",
    };
  } else if (fileCount < 300) {
    // Medium repos: focused but thorough
    return {
      scope: "critical",
      maxFilesToAnalyze: 80,
      episodeDepth: "moderate",
      suggestedEpisodes: { min: 5, max: 10 },
      fileContentLimit: 6000,
      depthGuidance: "Thorough coverage of critical paths and core architecture. Generate 10-15 minute episodes with substantial technical depth.",
    };
  } else if (fileCount < 1000) {
    // Large repos: key systems focus
    return {
      scope: "sampled",
      maxFilesToAnalyze: 100,
      episodeDepth: "focused",
      suggestedEpisodes: { min: 6, max: 12 },
      fileContentLimit: 5000,
      depthGuidance: "Focus on key architectural systems and design patterns. Generate 10-15 minute episodes covering major subsystems.",
    };
  } else {
    // Very large repos: architectural overview with depth
    return {
      scope: "sampled",
      maxFilesToAnalyze: 120,
      episodeDepth: "overview",
      suggestedEpisodes: { min: 8, max: 15 },
      fileContentLimit: 4000,
      depthGuidance: "High-level architecture with deep dives into key components. Generate 10-15 minute episodes for each major system.",
    };
  }
}

// Build analysis prompt with dynamic content based on repo size
function buildAnalysisPrompt(
  owner: string,
  name: string,
  repoData: FetchRepoOutput,
  depthSettings: DepthSettings
): string {
  const fileCount = repoData.files.length;
  
  // Dynamic file overview - show more structure for larger repos
  const maxFilesToShow = fileCount < 100 ? 100 : fileCount < 500 ? 150 : 200;
  const filesOverview = repoData.files
    .filter((f) => f.type === "file")
    .slice(0, maxFilesToShow)
    .map((f) => f.path)
    .join("\n");

  // Dynamic file content chunks - analyze more files for larger repos
  const maxFilesForContent = fileCount < 50 ? 15 : fileCount < 200 ? 20 : fileCount < 500 ? 25 : 30;
  const fileContentsText = repoData.fileContents
    .slice(0, maxFilesForContent)
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, depthSettings.fileContentLimit)}`)
    .join("\n\n");

  // Group files by directory for architectural insight
  const directoryStructure = new Map<string, number>();
  repoData.files.forEach((f) => {
    const parts = f.path.split("/");
    if (parts.length > 1) {
      const topDir = parts[0];
      directoryStructure.set(topDir, (directoryStructure.get(topDir) || 0) + 1);
    }
  });
  const dirSummary = Array.from(directoryStructure.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([dir, count]) => `${dir}/ (${count} files)`)
    .join(", ");

  return `Analyze the GitHub repository ${owner}/${name} and create a comprehensive podcast episode structure.

## Repository Information
- Description: ${repoData.description || "No description"}
- Primary Language: ${repoData.language || "Unknown"}
- Topics: ${repoData.topics.join(", ") || "None"}
- Stars: ${repoData.stars}
- License: ${repoData.license || "Unknown"}
- Total Files: ${repoData.files.length}

## Directory Structure Overview
${dirSummary}

## README
${repoData.readme?.slice(0, 6000) || "No README available"}

## File Structure (top ${maxFilesToShow} files)
${filesOverview}

## Key File Contents (${repoData.fileContents.length} files analyzed)
${fileContentsText}

## Analysis Guidelines
- ${depthSettings.depthGuidance}
- Create ${depthSettings.suggestedEpisodes.min}-${depthSettings.suggestedEpisodes.max} episodes
- Each episode should be 10-15 minutes (600-900 seconds) of rich technical content
- Make Episode 1 always free (isFree: true)
- Focus on architecture and design, not line-by-line code
- Target audience: intermediate to senior developers
- Episodes should have substantial depth - explain the WHY and HOW in detail

Create a comprehensive analysis with:
1. Project classification (type, language, frameworks, purpose)
2. Episode outlines with clear titles and descriptions
3. A suggested podcast title and description for this repository`;
}

// Analyze repository and create episode structure
export async function analyzeRepository(
  owner: string,
  name: string,
  repoData: FetchRepoOutput
): Promise<AnalysisOutput> {
  const google = getGoogleProvider();
  const depthSettings = getDepthSettings(repoData.files.length);
  const prompt = buildAnalysisPrompt(owner, name, repoData, depthSettings);

  // Retry logic for rate limiting
  for (let attempt = 0; attempt < LLM_RATE_LIMIT.maxRetries; attempt++) {
    try {
      const { object } = await generateObject({
        model: google("gemini-2.0-flash"),
        schema: AnalysisResponseSchema,
        prompt,
        temperature: 0.7,
      });

      return {
        classification: object.classification as unknown as Classification,
        episodes: object.episodes as EpisodeOutline[],
        suggestedTitle: object.suggestedTitle,
        suggestedDescription: object.suggestedDescription,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if rate limited
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate") || errorMessage.toLowerCase().includes("quota")) {
        const delay = getLLMRetryDelay(attempt);
        console.log(`[LLM] Rate limited on analysis, waiting ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${LLM_RATE_LIMIT.maxRetries})...`);
        await sleep(delay);
        continue;
      }
      
      // For other errors, throw immediately
      throw error;
    }
  }
  
  throw new Error(`Failed to analyze repository after ${LLM_RATE_LIMIT.maxRetries} attempts`);
}

// Single narrator system prompt
const SINGLE_NARRATOR_SYSTEM_PROMPT = `You are the host of "GitTalks" - a podcast that transforms GitHub repositories into audio deep-dives. Your name is GitTalks AI.

## CRITICAL BRANDING RULES
- ALWAYS start Episode 1 with: "Welcome to GitTalks, the podcast that brings code to life through audio."
- For subsequent episodes: "Welcome back to GitTalks"
- End each episode with: "Thanks for listening to GitTalks. In our next episode..."
- NEVER use generic phrases like "welcome to this podcast"
- Always refer to the podcast as "GitTalks"

## Your Mission
Create educational content that helps listeners UNDERSTAND HOW THE SYSTEM WORKS AS A WHOLE. Focus on architecture, design decisions, and the "why" behind code.

## Content Philosophy
1. Architecture First: Start with the big picture - how components interact
2. Design Decisions: Explain WHY things are designed the way they are
3. Problem → Solution Narratives: Frame as "here's the problem, here's how it's solved"
4. Real-World Context: Connect to practical scenarios
5. Trade-offs: Discuss pros/cons, alternatives

## CRITICAL: Audio Script is for TEXT-TO-SPEECH (PLAIN TEXT ONLY!)
The audioScript field will be read aloud by TTS. ANY MARKDOWN WILL BE SPOKEN LITERALLY.

**MANDATORY RULES FOR audioScript:**
- PLAIN TEXT ONLY - Zero markdown formatting
- NO # symbols - TTS will say "hashtag"
- NO * or ** - TTS will say "asterisk"
- NO backticks - TTS will say "backtick"
- NO bullet points (- or *) - TTS will say "dash"
- NO numbered lists like "1." - TTS will say "one period"
- NO links [text](url) - TTS will read literally
- NO code blocks - TTS will read character by character
- Write EXACTLY as you would naturally speak

Good: "Welcome to GitTalks. Today we're looking at the config file."
Bad: "# Welcome to **GitTalks**. We'll examine \`config.ts\`:\n- Settings"

## CRITICAL: No Code Reading!
- NEVER read code line-by-line
- NEVER say "looking at line 42, we see const x equals..."
- NEVER spell out syntax like "curly brace, semicolon"
- DESCRIBE what code DOES conceptually
- Mention file names but explain PURPOSE, not implementation

## Structure Requirements (10-15 minutes per episode)
1. Hook Opening (~30 seconds): "Welcome to GitTalks..." + key insight that hooks the listener
2. Context Setting (~1 minute): Where this fits in bigger picture, what problem it solves
3. Main Deep Dives (4-5 sections, 2-3 minutes each): The meat of the episode
4. Technical Insights (~1 minute): Clever patterns, design decisions, trade-offs
5. Practical Takeaways (~30 seconds): What to remember and apply
6. Forward Look (~30 seconds): "Thanks for listening..." + what's next

## Technical Depth
- Aim for ~3,000-4,000 words per episode (this is CRITICAL for 10-15 minute episodes)
- Cover 4-5 architectural concepts in depth
- Include specific file/function names but explain their ROLE
- Reference how components communicate
- When referencing code, summarize in plain English
- Explain trade-offs and alternative approaches considered
- Connect concepts to real-world usage scenarios

## Voice & Tone
- Conversational but knowledgeable
- Use "you" to address listener directly
- Express genuine enthusiasm for elegant solutions
- Acknowledge complexity while making it accessible`;

// Duo mode system prompt
const DUO_MODE_SYSTEM_PROMPT = `You are creating a TWO-HOST PODCAST conversation for "GitTalks".

## THE HOSTS

**Alex (The Expert)** - speaker: "host_expert"
- Deep technical knowledge of software architecture
- Explains complex concepts clearly
- Gets excited about elegant design patterns
- Voice: Confident, knowledgeable, enthusiastic
- Style: "So the way they've designed this is really clever..."

**Jordan (The Curious Developer)** - speaker: "host_curious"
- Asks great clarifying questions listeners would ask
- Makes relatable analogies ("So it's like when you...")
- Represents the listener's perspective
- Voice: Curious, engaged, sometimes playfully skeptical
- Style: "Wait, so does that mean...?" or "Oh, so it's kind of like..."

## CONVERSATION DYNAMICS

1. Opening Hook: Jordan sets up the topic with curiosity
2. Expert Explanation: Alex dives into technical details
3. Clarification: Jordan asks "Wait, so does that mean...?"
4. Deeper Dive: Alex builds with more insight
5. Real-World Connection: Jordan relates to practical scenarios
6. Summary: Either host wraps up key insights

## CONVERSATION PATTERNS TO USE

- Jordan: "So I've been looking at this codebase and I'm curious about..."
- Alex: "Great question! So the way they've designed this..."
- Jordan: "Wait, let me make sure I understand. When you say X, you mean..."
- Alex: "Exactly! And what's really clever here is..."
- Jordan: "Oh, so it's kind of like when you're building... [analogy]"
- Alex: "That's a perfect analogy! And the benefit is..."
- Jordan: "What happens if [edge case]?"
- Alex: "That's the clever part. They've built in..."

## BRANDING RULES

- Episode 1: Jordan starts with "Welcome to GitTalks! I'm Jordan, and today Alex is going to help me understand..."
- Alex follows: "Hey everyone! I'm really excited to dive into this project..."
- End naturally: "Thanks for listening to GitTalks!" or "Until next time!"

## CRITICAL: PLAIN TEXT ONLY FOR TTS

- PLAIN TEXT ONLY - Zero markdown
- NO special characters
- Write EXACTLY as spoken
- Include natural speech ("you know", "right?")
- Use contractions (it's, that's)

## TIMING & PACING

- Each turn: 2-5 sentences (40-150 words for depth)
- Don't let either host monologue too long (max 5-6 sentences)
- Total episode: 35-50 dialogue turns (10-15 minutes) - THIS IS CRITICAL
- Include natural moments ("Oh!", "Interesting...", "That's clever...")
- Build depth progressively - start with overview, dive into specifics
- Each topic should have 3-4 back-and-forth exchanges before moving on`;

// Generate single episode content
export async function generateSingleEpisodeContent(
  owner: string,
  name: string,
  repoData: FetchRepoOutput,
  episode: EpisodeOutline,
  episodeNumber: number,
  totalEpisodes: number,
  analysis: AnalysisOutput
): Promise<EpisodeContent> {
  const google = getGoogleProvider();

  const relevantFiles = episode.sourceFiles
    .map((path) => repoData.fileContents.find((f) => f.path === path))
    .filter(Boolean)
    .slice(0, 8);
    
  // Also include additional context files from the repo
  const additionalFiles = repoData.fileContents
    .filter((f) => !relevantFiles.find((rf) => rf?.path === f.path))
    .slice(0, 4);

  const prompt = `Generate the podcast episode content for:

## Repository: ${owner}/${name}
${repoData.description || ""}

## Episode Details
- Episode ${episodeNumber} of ${totalEpisodes}
- Title: ${episode.title}
- Description: ${episode.description}
- Target Duration: ${Math.round(episode.estimatedDurationSecs / 60)} minutes (aim for 10-15 minutes)

## Project Context
- Type: ${analysis.classification.type}
- Primary Language: ${analysis.classification.primaryLanguage}
- Frameworks: ${analysis.classification.frameworks.join(", ")}
- Purpose: ${analysis.classification.purpose}
- Target Audience: ${analysis.classification.targetAudience}

## Main Source Files for This Episode
${relevantFiles.map((f) => `--- ${f!.path} ---\n${f!.content.slice(0, 4000)}`).join("\n\n")}

## Additional Context Files
${additionalFiles.map((f) => `--- ${f.path} ---\n${f.content.slice(0, 2000)}`).join("\n\n")}

## README (excerpt)
${repoData.readme?.slice(0, 5000) || "No README"}

Generate a compelling 10-15 minute podcast episode with:
1. audioScript: PLAIN TEXT content for TTS (3000-4000 words, NO markdown!) - THIS IS CRITICAL FOR EPISODE LENGTH
2. showNotes: Markdown-formatted notes with key points, links, and references

IMPORTANT: The episode MUST be 3000-4000 words to achieve proper 10-15 minute duration. Do not generate short content.`;

  // Retry logic for rate limiting
  for (let attempt = 0; attempt < LLM_RATE_LIMIT.maxRetries; attempt++) {
    try {
      const { object } = await generateObject({
        model: google("gemini-2.0-flash"),
        schema: SingleEpisodeContentSchema,
        system: SINGLE_NARRATOR_SYSTEM_PROMPT,
        prompt,
        temperature: 0.8,
      });

      return {
        episodeId: episode.id,
        title: object.title,
        audioScript: cleanTextForTTS(object.audioScript),
        showNotes: object.showNotes,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate") || errorMessage.toLowerCase().includes("quota")) {
        const delay = getLLMRetryDelay(attempt);
        console.log(`[LLM] Rate limited on episode ${episodeNumber}, waiting ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${LLM_RATE_LIMIT.maxRetries})...`);
        await sleep(delay);
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error(`Failed to generate episode ${episodeNumber} after ${LLM_RATE_LIMIT.maxRetries} attempts`);
}

// Generate duo episode content
export async function generateDuoEpisodeContent(
  owner: string,
  name: string,
  repoData: FetchRepoOutput,
  episode: EpisodeOutline,
  episodeNumber: number,
  totalEpisodes: number,
  analysis: AnalysisOutput
): Promise<EpisodeContent> {
  const google = getGoogleProvider();

  const relevantFiles = episode.sourceFiles
    .map((path) => repoData.fileContents.find((f) => f.path === path))
    .filter(Boolean)
    .slice(0, 8);
    
  // Also include additional context files from the repo
  const additionalFiles = repoData.fileContents
    .filter((f) => !relevantFiles.find((rf) => rf?.path === f.path))
    .slice(0, 4);

  const prompt = `Generate a TWO-HOST podcast conversation for:

## Repository: ${owner}/${name}
${repoData.description || ""}

## Episode Details
- Episode ${episodeNumber} of ${totalEpisodes}
- Title: ${episode.title}
- Description: ${episode.description}
- Target Duration: ${Math.round(episode.estimatedDurationSecs / 60)} minutes (aim for 10-15 minutes)

## Project Context
- Type: ${analysis.classification.type}
- Primary Language: ${analysis.classification.primaryLanguage}
- Frameworks: ${analysis.classification.frameworks.join(", ")}
- Purpose: ${analysis.classification.purpose}
- Target Audience: ${analysis.classification.targetAudience}

## Main Source Files for This Episode
${relevantFiles.map((f) => `--- ${f!.path} ---\n${f!.content.slice(0, 4000)}`).join("\n\n")}

## Additional Context Files
${additionalFiles.map((f) => `--- ${f.path} ---\n${f.content.slice(0, 2000)}`).join("\n\n")}

## README (excerpt)
${repoData.readme?.slice(0, 5000) || "No README"}

Generate an engaging conversation between Alex (expert) and Jordan (curious learner) with:
1. 35-50 dialogue turns - THIS IS CRITICAL for proper episode length (10-15 minutes)
2. Natural conversational flow with depth and technical insight
3. Each turn should be 2-5 sentences for proper pacing
4. showNotes with key points discussed

IMPORTANT: Generate AT LEAST 35 dialogue turns to achieve proper 10-15 minute duration.`;

  // Retry logic for rate limiting
  for (let attempt = 0; attempt < LLM_RATE_LIMIT.maxRetries; attempt++) {
    try {
      const { object } = await generateObject({
        model: google("gemini-2.0-flash"),
        schema: DuoEpisodeContentSchema,
        system: DUO_MODE_SYSTEM_PROMPT,
        prompt,
        temperature: 0.85,
      });

      // Convert dialogue to audio script
      const audioScript = object.dialogue
        .map((turn) => `${turn.speakerName}: ${turn.text}`)
        .join("\n\n");

      return {
        episodeId: episode.id,
        title: object.title,
        audioScript: cleanTextForTTS(audioScript),
        showNotes: object.showNotes,
        dialogue: object.dialogue as DialogueTurn[],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate") || errorMessage.toLowerCase().includes("quota")) {
        const delay = getLLMRetryDelay(attempt);
        console.log(`[LLM] Rate limited on duo episode ${episodeNumber}, waiting ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${LLM_RATE_LIMIT.maxRetries})...`);
        await sleep(delay);
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error(`Failed to generate duo episode ${episodeNumber} after ${LLM_RATE_LIMIT.maxRetries} attempts`);
}

// Generate all episodes content - PARALLEL processing
export async function generateAllEpisodesContent(
  owner: string,
  name: string,
  repoData: FetchRepoOutput,
  analysis: AnalysisOutput,
  conversationStyle: ConversationStyle
): Promise<GeneratedContent> {
  const totalEpisodes = analysis.episodes.length;
  
  // PARALLEL episode generation - process in batches
  // Using batch size of 3 to avoid overwhelming the LLM API
  const PARALLEL_BATCH_SIZE = 3;
  
  type EpisodeResult = { index: number; content: EpisodeContent };
  const episodeResults: EpisodeResult[] = [];

  console.log(`[LLM] Generating ${totalEpisodes} episodes in PARALLEL (batch size: ${PARALLEL_BATCH_SIZE})`);

  for (let batchStart = 0; batchStart < totalEpisodes; batchStart += PARALLEL_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, totalEpisodes);
    const batch = analysis.episodes.slice(batchStart, batchEnd);
    
    console.log(`[LLM] Parallel batch ${Math.floor(batchStart / PARALLEL_BATCH_SIZE) + 1}: episodes ${batchStart + 1}-${batchEnd} of ${totalEpisodes}`);
    
    // Generate batch in parallel
    const batchPromises = batch.map(async (episode, batchIndex) => {
      const globalIndex = batchStart + batchIndex;
      const episodeNumber = globalIndex + 1;
      
      console.log(`[LLM] Starting episode ${episodeNumber}/${totalEpisodes}: ${episode.title}`);
      
      const content =
        conversationStyle === "duo"
          ? await generateDuoEpisodeContent(
              owner,
              name,
              repoData,
              episode,
              episodeNumber,
              totalEpisodes,
              analysis
            )
          : await generateSingleEpisodeContent(
              owner,
              name,
              repoData,
              episode,
              episodeNumber,
              totalEpisodes,
              analysis
            );
      
      // Log word count for monitoring
      const wordCount = content.audioScript.split(/\s+/).length;
      console.log(`[LLM] Episode ${episodeNumber} generated: ${wordCount} words`);
      
      return { index: globalIndex, content };
    });
    
    // Wait for all in batch to complete
    const batchResults = await Promise.all(batchPromises);
    episodeResults.push(...batchResults);
    
    // Delay between batches to prevent rate limiting
    if (batchEnd < totalEpisodes) {
      console.log(`[LLM] Waiting ${LLM_RATE_LIMIT.betweenEpisodesDelayMs / 1000}s before next batch...`);
      await sleep(LLM_RATE_LIMIT.betweenEpisodesDelayMs);
    }
  }

  // Sort by index to ensure correct order
  episodeResults.sort((a, b) => a.index - b.index);
  
  // Verify all episodes were generated
  if (episodeResults.length !== totalEpisodes) {
    throw new Error(`Missing episodes: expected ${totalEpisodes}, got ${episodeResults.length}`);
  }

  // Extract contents in order
  const episodes = episodeResults.map(({ content }) => content);
  
  console.log(`[LLM] All ${totalEpisodes} episodes generated successfully`);


  return { episodes };
}

// Clean text for TTS
export function cleanTextForTTS(text: string): string {
  return text
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    // Remove underscores for emphasis
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove bullet points
    .replace(/^[\s]*[-*+]\s+/gm, "")
    // Remove numbered lists
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Remove blockquotes
    .replace(/^>\s*/gm, "")
    // Clean multiple newlines
    .replace(/\n{3,}/g, "\n\n")
    // Trim whitespace
    .trim();
}
