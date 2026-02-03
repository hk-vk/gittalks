// GitTalks - Core Type Definitions

// ============================================
// Classification Types
// ============================================
export enum ClassifyType {
  Applications = "applications",
  Frameworks = "frameworks",
  Libraries = "libraries",
  DevelopmentTools = "development-tools",
  CLITools = "cli-tools",
  DevOpsConfiguration = "devops-configuration",
  Documentation = "documentation",
  General = "general",
}

export type ConversationStyle = "single" | "duo";

// ============================================
// Pipeline Types
// ============================================
export interface PipelineContext {
  jobId: string;
  owner: string;
  name: string;
  repoUrl: string;
  userId: string;
  conversationStyle: ConversationStyle;
}

export interface StepResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type JobStatus =
  | "queued"
  | "fetching"
  | "analyzing"
  | "generating-content"
  | "generating-audio"
  | "completed"
  | "failed";

// ============================================
// GitHub Types
// ============================================
export interface RepoFile {
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
}

export interface FetchRepoOutput {
  readme: string | null;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  files: RepoFile[];
  fileContents: FileContent[];
  defaultBranch: string;
  license: string | null;
}

// ============================================
// Classification & Analysis Types
// ============================================
export interface Classification {
  type: ClassifyType;
  primaryLanguage: string;
  frameworks: string[];
  purpose: string;
  targetAudience: string;
}

export interface EpisodeOutline {
  id: string;
  title: string;
  description: string;
  priority: number;
  estimatedDurationSecs: number;
  sourceFiles: string[];
  isFree: boolean;
}

export interface AnalysisOutput {
  classification: Classification;
  episodes: EpisodeOutline[];
  suggestedTitle: string;
  suggestedDescription: string;
}

export interface DepthSettings {
  scope: "full" | "critical" | "sampled";
  maxFilesToAnalyze: number;
  episodeDepth: "deep" | "moderate" | "overview";
  suggestedEpisodes: { min: number; max: number };
  fileContentLimit: number;
  depthGuidance: string;
}

// ============================================
// Content Generation Types
// ============================================
export interface DialogueTurn {
  speaker: "host_expert" | "host_curious";
  speakerName: string;
  text: string;
  emotion?: "curious" | "excited" | "thoughtful" | "explaining";
}

export interface EpisodeContent {
  episodeId: string;
  title: string;
  audioScript: string;
  showNotes: string;
  dialogue?: DialogueTurn[];
}

export interface GeneratedContent {
  episodes: EpisodeContent[];
}

// ============================================
// TTS Types
// ============================================
export interface WordTimestamp {
  offset: number;
  duration: number;
  text: string;
}

export interface TTSSynthesizeResult {
  audioData: Buffer;
  durationSecs: number;
  format: "mp3" | "wav";
  wordTimestamps?: WordTimestamp[];
}

export interface DialogueTurnInput {
  speaker: "host_expert" | "host_curious";
  text: string;
  voice: string;
}

// ============================================
// Database Types (match schema.ts)
// ============================================
// Note: These types are now primarily defined in schema.ts via Drizzle ORM
// These are kept for backward compatibility but prefer using types from db.ts

export interface Job {
  id: string;
  repoUrl: string;
  owner: string;
  name: string;
  userId: string;
  status: JobStatus;
  currentStep: string | null;
  playlistId: string | null;
  errorMessage: string | null;
  conversationStyle: ConversationStyle;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Playlist {
  id: string;
  title: string;
  description: string | null;
  owner: string;
  repoName: string;
  repoUrl: string;
  userId: string;
  totalDurationSecs: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  coverImageUrl?: string | null;
}

export interface Episode {
  id: string;
  playlistId: string;
  title: string;
  description: string | null;
  episodeNumber: number;
  audioUrl: string | null;
  durationSecs: number;
  transcript: string | null;
  showNotes: string | null;
  wordTimestamps: string | null;
  isFree: boolean;
  conversationStyle: ConversationStyle;
  createdAt: string;
}

// ============================================
// API Types
// ============================================
export interface CreateJobRequest {
  repoUrl: string;
  conversationStyle?: ConversationStyle;
}

export interface JobResponse {
  job: Job;
  playlist?: Playlist;
  episodes?: Episode[];
}

export interface EpisodeWithAudio extends Episode {
  audioData?: Buffer;
}
