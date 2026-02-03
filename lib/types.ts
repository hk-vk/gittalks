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
  format: "mp3";
  wordTimestamps?: WordTimestamp[];
}

export interface DialogueTurnInput {
  speaker: "host_expert" | "host_curious";
  text: string;
  voice: string;
}

// ============================================
// Database Types
// ============================================
export interface Job {
  id: string;
  repo_url: string;
  owner: string;
  name: string;
  user_id: string;
  status: JobStatus;
  current_step: string | null;
  playlist_id: string | null;
  error_message: string | null;
  conversation_style: ConversationStyle;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Playlist {
  id: string;
  title: string;
  description: string | null;
  owner: string;
  repo_name: string;
  repo_url: string;
  user_id: string;
  total_duration_secs: number;
  is_public: number;
  created_at: string;
  updated_at: string;
}

export interface Episode {
  id: string;
  playlist_id: string;
  title: string;
  description: string | null;
  episode_number: number;
  audio_url: string | null;
  duration_secs: number;
  transcript: string | null;
  show_notes: string | null;
  word_timestamps: string | null;
  is_free: number;
  conversation_style: ConversationStyle;
  created_at: string;
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
