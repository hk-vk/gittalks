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

// Get depth settings based on file count
function getDepthSettings(fileCount: number): DepthSettings {
  if (fileCount < 50) {
    return {
      scope: "full",
      maxFilesToAnalyze: 40,
      episodeDepth: "deep",
      suggestedEpisodes: { min: 3, max: 6 },
      fileContentLimit: 4000,
      depthGuidance: "Deep coverage of entire codebase",
    };
  } else if (fileCount < 300) {
    return {
      scope: "critical",
      maxFilesToAnalyze: 60,
      episodeDepth: "moderate",
      suggestedEpisodes: { min: 4, max: 8 },
      fileContentLimit: 3000,
      depthGuidance: "Focus on critical paths and core architecture",
    };
  } else {
    return {
      scope: "sampled",
      maxFilesToAnalyze: 80,
      episodeDepth: "overview",
      suggestedEpisodes: { min: 5, max: 10 },
      fileContentLimit: 2500,
      depthGuidance: "High-level architecture overview",
    };
  }
}

// Build analysis prompt
function buildAnalysisPrompt(
  owner: string,
  name: string,
  repoData: FetchRepoOutput,
  depthSettings: DepthSettings
): string {
  const filesOverview = repoData.files
    .filter((f) => f.type === "file")
    .slice(0, 100)
    .map((f) => f.path)
    .join("\n");

  const fileContentsText = repoData.fileContents
    .slice(0, 10)
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, depthSettings.fileContentLimit)}`)
    .join("\n\n");

  return `Analyze the GitHub repository ${owner}/${name} and create a podcast episode structure.

## Repository Information
- Description: ${repoData.description || "No description"}
- Primary Language: ${repoData.language || "Unknown"}
- Topics: ${repoData.topics.join(", ") || "None"}
- Stars: ${repoData.stars}
- License: ${repoData.license || "Unknown"}
- Total Files: ${repoData.files.length}

## README
${repoData.readme?.slice(0, 5000) || "No README available"}

## File Structure (top 100 files)
${filesOverview}

## Key File Contents
${fileContentsText}

## Analysis Guidelines
- ${depthSettings.depthGuidance}
- Create ${depthSettings.suggestedEpisodes.min}-${depthSettings.suggestedEpisodes.max} episodes
- Each episode should be 8-12 minutes (480-720 seconds)
- Make Episode 1 always free (isFree: true)
- Focus on architecture and design, not line-by-line code
- Target audience: intermediate to senior developers

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

  const { object } = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: AnalysisResponseSchema,
    prompt: buildAnalysisPrompt(owner, name, repoData, depthSettings),
    temperature: 0.7,
  });

  return {
    classification: object.classification as unknown as Classification,
    episodes: object.episodes as EpisodeOutline[],
    suggestedTitle: object.suggestedTitle,
    suggestedDescription: object.suggestedDescription,
  };
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

## Structure Requirements (8-10 minutes per episode)
1. Hook Opening (~20 seconds): "Welcome to GitTalks..." + key insight
2. Context Setting (~30 seconds): Where this fits in bigger picture
3. Main Deep Dives (3-4 sections, 2-3 minutes each)
4. Practical Takeaways (~30 seconds): What to remember
5. Forward Look (~20 seconds): "Thanks for listening..." + what's next

## Technical Depth
- Aim for ~2,000-2,500 words per episode
- Cover 3-4 architectural concepts in depth
- Include specific file/function names but explain their ROLE
- Reference how components communicate
- When referencing code, summarize in plain English

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

- Each turn: 1-4 sentences (30-120 words max)
- Don't let either host monologue too long (max 4-5 sentences)
- Total episode: 20-30 dialogue turns (8-12 minutes)
- Include natural moments ("Oh!", "Interesting...")`;

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
    .slice(0, 5);

  const prompt = `Generate the podcast episode content for:

## Repository: ${owner}/${name}
${repoData.description || ""}

## Episode Details
- Episode ${episodeNumber} of ${totalEpisodes}
- Title: ${episode.title}
- Description: ${episode.description}
- Target Duration: ${Math.round(episode.estimatedDurationSecs / 60)} minutes

## Project Context
- Type: ${analysis.classification.type}
- Primary Language: ${analysis.classification.primaryLanguage}
- Frameworks: ${analysis.classification.frameworks.join(", ")}
- Purpose: ${analysis.classification.purpose}

## Relevant Source Files
${relevantFiles.map((f) => `--- ${f!.path} ---\n${f!.content.slice(0, 2000)}`).join("\n\n")}

## README (excerpt)
${repoData.readme?.slice(0, 3000) || "No README"}

Generate a compelling 8-10 minute podcast episode with:
1. audioScript: PLAIN TEXT content for TTS (2000-2500 words, NO markdown!)
2. showNotes: Markdown-formatted notes with key points, links, and references`;

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
    .slice(0, 5);

  const prompt = `Generate a TWO-HOST podcast conversation for:

## Repository: ${owner}/${name}
${repoData.description || ""}

## Episode Details
- Episode ${episodeNumber} of ${totalEpisodes}
- Title: ${episode.title}
- Description: ${episode.description}
- Target Duration: ${Math.round(episode.estimatedDurationSecs / 60)} minutes

## Project Context
- Type: ${analysis.classification.type}
- Primary Language: ${analysis.classification.primaryLanguage}
- Frameworks: ${analysis.classification.frameworks.join(", ")}
- Purpose: ${analysis.classification.purpose}

## Relevant Source Files
${relevantFiles.map((f) => `--- ${f!.path} ---\n${f!.content.slice(0, 2000)}`).join("\n\n")}

## README (excerpt)
${repoData.readme?.slice(0, 3000) || "No README"}

Generate an engaging conversation between Alex (expert) and Jordan (curious learner) with:
1. 20-30 dialogue turns
2. Natural conversational flow
3. showNotes with key points discussed`;

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
}

// Generate all episodes content
export async function generateAllEpisodesContent(
  owner: string,
  name: string,
  repoData: FetchRepoOutput,
  analysis: AnalysisOutput,
  conversationStyle: ConversationStyle
): Promise<GeneratedContent> {
  const episodes: EpisodeContent[] = [];
  const totalEpisodes = analysis.episodes.length;

  for (let i = 0; i < analysis.episodes.length; i++) {
    const episode = analysis.episodes[i];
    const episodeNumber = i + 1;

    console.log(`Generating content for episode ${episodeNumber}/${totalEpisodes}: ${episode.title}`);

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

    episodes.push(content);

    // Small delay to avoid rate limiting
    if (i < analysis.episodes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

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
