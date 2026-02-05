"use client";

import Link from "next/link";
import { useState, useEffect, use, useRef, useMemo } from "react";
import { useSession, signIn } from "@/lib/auth-client";

interface Episode {
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
  isFree: number;
  conversationStyle: string;
  createdAt: string;
}

interface Playlist {
  id: string;
  title: string;
  description: string | null;
  owner: string;
  repoName: string;
  repoUrl: string;
  totalDurationSecs: number;
}

interface WordTimestamp {
  offset: number;
  duration: number;
  text: string;
}

interface ProgressEvent {
  type: "progress" | "step" | "error" | "complete";
  step: string;
  description: string;
  progress: number;
  subStep?: string;
  data?: {
    playlist?: Playlist;
    episodes?: Episode[];
  };
}

type GenerationStatus = "idle" | "checking" | "generating" | "completed" | "error" | "auth-required" | "rate-limited" | "incomplete";

// Step labels (no emojis)
const STEP_LABELS: Record<string, string> = {
  parsing: "Parsing",
  checking: "Checking",
  fetching: "Fetching",
  analyzing: "Analyzing",
  "generating-content": "Writing",
  "generating-audio": "Recording",
  done: "Complete",
  error: "Error",
  cached: "Cached",
};

export default function PlayerPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = use(params);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastAudioUrlRef = useRef<string | null>(null);
  
  // State
  const [status, setStatus] = useState<GenerationStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeWord, setActiveWord] = useState<string>("");
  const [conversationStyle, setConversationStyle] = useState<"single" | "duo">("duo");
  
  // Progress state - use maxProgress to prevent bar from going backwards
  const [progress, setProgressRaw] = useState(0);
  const [maxProgress, setMaxProgress] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const [progressDescription, setProgressDescription] = useState("");
  const [progressSubStep, setProgressSubStep] = useState("");
  
  // Custom setProgress that only allows forward movement
  const setProgress = (newProgress: number) => {
    setProgressRaw(newProgress);
    setMaxProgress(prev => Math.max(prev, newProgress));
  };

  // Track if WE initiated the generation (vs observing someone else's)
  const [isOwnGeneration, setIsOwnGeneration] = useState(false);

  // Check if playlist exists on mount
  useEffect(() => {
    checkPlaylist();
  }, [owner, repo]);

  // Poll for active job status (shows progress to all viewers)
  useEffect(() => {
    // Only poll if we're not the one generating OR if we're in checking/idle status
    if (isOwnGeneration || status === "completed") return;
    
    const pollJobStatus = async () => {
      try {
        const response = await fetch(`/api/job/repo/${owner}/${repo}`);
        if (!response.ok) return;
        
        const data = await response.json();
        
        if (data.hasActiveJob && data.job) {
          // Someone is generating this repo!
          if (data.job.status !== "completed" && data.job.status !== "failed") {
            setStatus("generating");
            setProgress(data.job.progress);
            setProgressStep(data.job.status);
            setProgressDescription(data.job.currentStep);
            setProgressSubStep("Generation in progress by another user...");
          } else if (data.job.status === "failed") {
            setStatus("incomplete");
            setError(data.job.errorMessage || "Generation failed");
          } else if (data.job.status === "completed") {
            // Refresh the page data to show the completed podcast
            checkPlaylist();
          }
        }
      } catch {
        // Ignore polling errors
      }
    };

    // Poll immediately and then every 2 seconds
    pollJobStatus();
    const interval = setInterval(pollJobStatus, 2000);
    
    return () => clearInterval(interval);
  }, [owner, repo, status, isOwnGeneration]);

  // Current episode data for use in effects
  const currentWordTimestamps = episodes[currentEpisode]?.wordTimestamps;
  const episodesLength = episodes.length;

  // Audio time update for transcript sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let lastLoggedTime = -1;

    const handleTimeUpdate = () => {
      const newTime = audio.currentTime;
      
      // Only log when time changes significantly (avoid spam)
      if (Math.abs(newTime - lastLoggedTime) > 1) {
        console.log("timeupdate:", newTime.toFixed(2), "readyState:", audio.readyState);
        lastLoggedTime = newTime;
      }
      
      setCurrentTime(newTime);
      
      // Update active word based on timestamps
      if (currentWordTimestamps) {
        try {
          const timestamps: WordTimestamp[] = JSON.parse(currentWordTimestamps);
          const currentTimeNs = newTime * 10_000_000;
          
          for (let i = timestamps.length - 1; i >= 0; i--) {
            if (timestamps[i].offset <= currentTimeNs) {
              setActiveWord(timestamps[i].text);
              break;
            }
          }
        } catch {}
      }
    };

    const handleLoadedMetadata = () => {
      console.log("loadedmetadata:", audio.duration.toFixed(2), "src:", audio.src.substring(0, 50));
      setDuration(audio.duration);
    };
    
    const handleSeeking = () => {
      console.log("seeking event - currentTime:", audio.currentTime.toFixed(2));
    };
    
    const handleSeeked = () => {
      console.log("seeked event - currentTime:", audio.currentTime.toFixed(2));
    };

    const handleEnded = () => {
      setIsPlaying(false);
      // Auto-play next episode
      if (currentEpisode < episodesLength - 1) {
        setCurrentEpisode(prev => prev + 1);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("seeking", handleSeeking);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("seeking", handleSeeking);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [currentEpisode, currentWordTimestamps, episodesLength]);

  // Auto-play when episode changes (only when URL actually changes)
  const currentAudioUrl = episodes[currentEpisode]?.audioUrl;
  
  useEffect(() => {
    // Only reload if the URL has actually changed
    if (audioRef.current && currentAudioUrl && currentAudioUrl !== lastAudioUrlRef.current) {
      lastAudioUrlRef.current = currentAudioUrl;
      
      // Reset duration/time state for new track
      setCurrentTime(0);
      setDuration(0);
      
      // The audio element's src is bound via JSX, so just wait for it to load
      const audio = audioRef.current;
      const handleCanPlay = () => {
        if (isPlaying) {
          audio.play().catch(() => setIsPlaying(false));
        }
        audio.removeEventListener("canplay", handleCanPlay);
      };
      audio.addEventListener("canplay", handleCanPlay);
      
      return () => {
        audio.removeEventListener("canplay", handleCanPlay);
      };
    }
  }, [currentAudioUrl, isPlaying]);

  async function checkPlaylist() {
    setStatus("checking");
    try {
      const res = await fetch(`/api/playlist/${owner}/${repo}`);
      const data = await res.json();

      if (data.exists && data.playlist && data.episodes?.length > 0) {
        setPlaylist(data.playlist);
        setEpisodes(data.episodes);
        
        // Calculate how many episodes are missing
        const totalEpisodes = data.totalEpisodes || data.episodes.length;
        const missingCount = totalEpisodes - data.episodes.length;
        
        // Only show incomplete warning if more than 2 episodes are missing
        // AND if less than 70% of episodes are ready
        // This means: 7/8 ready (1 missing) = play directly
        //             6/8 ready (2 missing) = play directly  
        //             5/8 ready (3 missing) = show warning
        const completionRatio = data.episodes.length / totalEpisodes;
        const showWarning = missingCount > 2 && completionRatio < 0.7;
        
        if (data.hasIncompleteEpisodes && showWarning) {
          setStatus("incomplete");
          setError(`Generation incomplete: ${data.episodes.length}/${totalEpisodes} episodes ready`);
        } else {
          // Most episodes ready - just play
          setStatus("completed");
        }
      } else if (data.hasIncompleteEpisodes) {
        // Playlist exists but no episodes have audio at all
        setStatus("incomplete");
        setError("Previous generation failed. Click regenerate to try again.");
      } else {
        setStatus("idle");
      }
    } catch (err) {
      setStatus("idle");
    }
  }

  // Generate podcast - optionally regenerate from existing scripts
  async function generatePodcast(regenerate: boolean = false) {
    setIsOwnGeneration(true); // Mark that we're the ones generating
    setStatus("generating");
    setError(null);
    setProgress(0);
    setMaxProgress(0); // Reset max progress for new generation
    setProgressStep("starting");
    setProgressDescription(regenerate ? "Regenerating audio..." : "Initializing...");
    setProgressSubStep("");

    try {
      const response = await fetch("/api/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          conversationStyle,
          regenerate, // If true, reuse existing scripts, only regenerate audio
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        
        // Handle auth required
        if (response.status === 401 && data.type === "auth-required") {
          setStatus("auth-required");
          setError("Sign in to generate podcasts");
          return;
        }
        
        // Handle rate limit
        if (response.status === 429 && data.type === "rate-limited") {
          setStatus("rate-limited");
          setError(data.error || "Rate limit exceeded");
          return;
        }
        
        throw new Error(data.error || "Generation failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete events
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep incomplete data in buffer
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: ProgressEvent = JSON.parse(line.slice(6));
              
              setProgress(event.progress);
              setProgressStep(event.step);
              setProgressDescription(event.description);
              setProgressSubStep(event.subStep || "");

              if (event.type === "error") {
                throw new Error(event.description);
              }

              if (event.type === "complete" && event.data) {
                setPlaylist(event.data.playlist || null);
                setEpisodes(event.data.episodes || []);
                setStatus("completed");
                return;
              }
            } catch (parseError) {
              // Skip malformed events
              console.error("Parse error:", parseError);
            }
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  // Old non-streaming function (backup)
  async function generatePodcastLegacy() {
    setStatus("generating");
    setError(null);
    setProgressDescription("Starting generation...");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          conversationStyle,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      if (data.success && data.playlist && data.episodes) {
        setPlaylist(data.playlist);
        setEpisodes(data.episodes);
        setStatus("completed");
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  function togglePlay() {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }

  function seekTo(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) {
      console.log("seekTo: No audio ref or duration", { hasAudio: !!audio, duration });
      return;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = percent * duration;
    
    console.log("seekTo:", {
      percent: percent.toFixed(2),
      targetTime: targetTime.toFixed(2),
      duration: duration.toFixed(2),
      currentSrc: audio.src.substring(0, 80),
      readyState: audio.readyState,
      networkState: audio.networkState,
      wasPlaying: isPlaying
    });
    
    // Set the currentTime
    audio.currentTime = targetTime;
    
    // Also update state immediately for UI responsiveness
    setCurrentTime(targetTime);
    
    // If audio was playing, ensure it continues playing
    if (isPlaying && audio.paused) {
      audio.play().catch(err => console.log("Play after seek failed:", err));
    }
    
    console.log("After seek - currentTime:", audio.currentTime.toFixed(2), "paused:", audio.paused);
  }

  function formatTime(secs: number): string {
    const mins = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${mins}:${String(seconds).padStart(2, "0")}`;
  }

  // Convert external audio URL to our proxy URL for proper Range request support
  // Memoized to prevent unnecessary re-renders
  const proxyAudioUrl = useMemo(() => {
    const url = currentAudioUrl;
    if (!url) return null;
    
    // If it's a local URL, use it directly
    if (url.startsWith("/")) {
      return url;
    }
    
    // For external URLs (Tigris, S3, etc.), proxy through our API to handle CORS
    return `/api/audio/${encodeURIComponent(url)}`;
  }, [currentAudioUrl]);

  const currentEpisodeData = episodes[currentEpisode];

  // Render auth required UI
  if (status === "auth-required") {
    return (
      <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8]">
        <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
            <Link href="/" className="text-xl sm:text-2xl tracking-tight">
              <span className="font-editorial">Git</span><span className="font-editorial italic text-[#00ff88]">talks</span>
            </Link>
            <Link href="/" className="text-sm hover:text-[#00ff88] transition-colors">
              ← Back
            </Link>
          </div>
        </nav>

        <div className="pt-24 sm:pt-32 pb-20 px-4 sm:px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6 sm:mb-8 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#00ff88] to-[#00aa66] flex items-center justify-center text-3xl sm:text-4xl font-bold text-[#0a0a0a]">
              {repo[0]?.toUpperCase() || "?"}
            </div>

            <h1 className="font-editorial text-3xl sm:text-4xl mb-4">{owner}/{repo}</h1>

            <div className="space-y-6">
              <div className="p-6 bg-[#111] border border-[#222] rounded-2xl">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                  <svg className="w-8 h-8 text-[#00ff88]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Sign in to generate</h2>
                <p className="text-[#888] text-sm mb-6">
                  Connect your GitHub account to create personalized podcast episodes for any repository.
                </p>
                <button
                  onClick={() => signIn.social({ provider: "github" })}
                  className="flex items-center justify-center gap-2 mx-auto px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] hover:text-[#00ff88] transition-all"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Sign in with GitHub
                </button>
              </div>

              <p className="text-xs text-[#555]">
                Free tier includes 5 podcast generations per month
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Render rate limit exceeded UI
  if (status === "rate-limited") {
    return (
      <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8]">
        <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
            <Link href="/" className="text-xl sm:text-2xl tracking-tight">
              <span className="font-editorial">Git</span><span className="font-editorial italic text-[#00ff88]">talks</span>
            </Link>
            <Link href="/" className="text-sm hover:text-[#00ff88] transition-colors">
              ← Back
            </Link>
          </div>
        </nav>

        <div className="pt-24 sm:pt-32 pb-20 px-4 sm:px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6 sm:mb-8 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-3xl sm:text-4xl font-bold text-[#0a0a0a]">
              {repo[0]?.toUpperCase() || "?"}
            </div>

            <h1 className="font-editorial text-3xl sm:text-4xl mb-4">{owner}/{repo}</h1>

            <div className="space-y-6">
              <div className="p-6 bg-[#111] border border-amber-500/30 rounded-2xl">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Monthly limit reached</h2>
                <p className="text-[#888] text-sm mb-4">
                  {error || "You've used all 5 podcast generations for this month."}
                </p>
                <p className="text-amber-500 text-sm font-medium">
                  Your limit will reset next month
                </p>
              </div>

              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] hover:text-[#00ff88] transition-all text-sm"
              >
                ← Browse podcasts
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Render incomplete generation UI (partial failure - some episodes missing)
  if (status === "incomplete") {
    return (
      <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8]">
        <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
            <Link href="/" className="text-xl sm:text-2xl tracking-tight">
              <span className="font-editorial">Git</span><span className="font-editorial italic text-[#00ff88]">talks</span>
            </Link>
            <Link href="/" className="text-sm hover:text-[#00ff88] transition-colors">
              ← Back
            </Link>
          </div>
        </nav>

        <div className="pt-24 sm:pt-32 pb-20 px-4 sm:px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6 sm:mb-8 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-3xl sm:text-4xl font-bold text-[#0a0a0a]">
              {repo[0]?.toUpperCase() || "?"}
            </div>

            <h1 className="font-editorial text-3xl sm:text-4xl mb-4">{owner}/{repo}</h1>

            <div className="space-y-6">
              <div className="p-6 bg-[#111] border border-amber-500/30 rounded-2xl">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Generation incomplete</h2>
                <p className="text-[#888] text-sm mb-4">
                  {error || "The previous generation was interrupted or failed. Click regenerate to try again."}
                </p>
                {episodes.length > 0 && (
                  <p className="text-amber-500 text-sm font-medium">
                    {episodes.length} episode{episodes.length !== 1 ? "s" : ""} ready to play
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => generatePodcast(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#00ff88] text-[#0a0a0a] rounded-lg font-medium hover:bg-[#00dd77] transition-all text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Regenerate
                </button>
                
                {episodes.length > 0 && (
                  <button
                    onClick={() => setStatus("completed")}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] hover:text-[#00ff88] transition-all text-sm"
                  >
                    Play available episodes →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Render generation UI
  if (status === "idle" || status === "generating" || status === "error") {
    const isGenerating = status === "generating";
    return (
      <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8]">
        <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
            <Link href="/" className="text-xl sm:text-2xl tracking-tight">
              <span className="font-editorial">Git</span><span className="font-editorial italic text-[#00ff88]">talks</span>
            </Link>
            <Link href="/" className="text-sm hover:text-[#00ff88] transition-colors">
              ← Back
            </Link>
          </div>
        </nav>

        <div className="pt-24 sm:pt-32 pb-20 px-4 sm:px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6 sm:mb-8 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#00ff88] to-[#00aa66] flex items-center justify-center text-3xl sm:text-4xl font-bold text-[#0a0a0a]">
              {repo[0]?.toUpperCase() || "?"}
            </div>

            <h1 className="font-editorial text-3xl sm:text-4xl mb-4">{owner}/{repo}</h1>

            {status === "error" && error && (
              <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span className="text-red-400 font-medium">Generation Failed</span>
                </div>
                <p className="text-red-400/80 text-sm mb-4">{error}</p>
                <button
                  onClick={() => generatePodcast(true)}
                  className="flex items-center gap-2 mx-auto px-4 py-2 bg-[#1a1a1a] border border-red-500/30 rounded-lg hover:border-red-400 hover:text-red-400 transition-all text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Try Again
                </button>
              </div>
            )}

            {isGenerating ? (
              <div className="space-y-8">
                {/* Progress Bar Container */}
                <div className="w-full max-w-md mx-auto">
                  {/* Progress bar track - uses maxProgress to never go backwards */}
                  <div className="w-full h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#00ff88] to-[#00cc66] rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${maxProgress}%` }}
                    />
                  </div>
                </div>

                {/* Current step */}
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3 px-6 py-3 bg-[#111] border border-[#222] rounded-xl">
                    <span className="text-lg font-medium">
                      {STEP_LABELS[progressStep] || "Processing"}: {progressDescription}
                    </span>
                  </div>
                  
                  {/* Sub-step details */}
                  {progressSubStep && (
                    <p className="text-sm text-[#666] max-w-md text-pretty">
                      {progressSubStep}
                    </p>
                  )}
                </div>

                {/* Steps indicator */}
                <div className="flex justify-center gap-2 mt-6">
                  {["fetching", "analyzing", "generating-content", "generating-audio"].map((step, i) => {
                    const stepProgress = [10, 20, 35, 55][i];
                    const isActive = maxProgress >= stepProgress;
                    const isCurrent = progressStep === step;
                    return (
                      <div
                        key={step}
                        className={`w-3 h-3 rounded-full transition-all ${
                          isCurrent 
                            ? "bg-[#00ff88] scale-125 animate-pulse" 
                            : isActive 
                              ? "bg-[#00ff88]" 
                              : "bg-[#333]"
                        }`}
                      />
                    );
                  })}
                </div>

                <p className="text-xs text-[#555] mt-4">
                  This may take 5-10 minutes depending on repository size
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                <p className="text-[#888] text-lg">
                  No podcast exists for this repository yet. Generate one now!
                </p>

                <div className="space-y-4">
                  <button
                    onClick={() => generatePodcast()}
                    className="px-8 py-4 bg-[#00ff88] text-[#0a0a0a] rounded-xl font-semibold text-lg hover:bg-[#00dd77] transition-all hover:scale-105 active:scale-95"
                  >
                    Generate Podcast
                  </button>
                </div>

                <p className="text-xs text-[#555]">
                  Powered by AI • Two-host conversation style • Kokoro TTS for audio
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Loading state
  if (status === "checking") {
    return (
      <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
          <span className="text-[#666] text-sm">Loading podcast...</span>
        </div>
      </main>
    );
  }

  // Player UI - Redesigned
  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8] pb-28 lg:pb-8">
      {/* Audio element */}
      <audio 
        ref={audioRef} 
        preload="auto"
        crossOrigin="anonymous"
        src={proxyAudioUrl || undefined}
        className="hidden"
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="text-xl sm:text-2xl tracking-tight">
            <span className="font-editorial">Git</span>
            <span className="font-editorial italic text-[#00ff88]">talks</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <a 
              href={playlist?.repoUrl || `https://github.com/${owner}/${repo}`} 
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 text-sm text-[#666] hover:text-[#00ff88] transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              <span className="font-mono text-xs">{owner}/{repo}</span>
            </a>
            <Link 
              href="/" 
              className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
              aria-label="Go home"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        {/* Hero Section with Repo Info */}
        <section className="mb-8 sm:mb-12 animate-fadeInUp">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            {/* Repo Avatar */}
            <div className="shrink-0 w-20 h-20 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-[#1a3a2a] via-[#0d2818] to-[#0a1f14] border border-[#2a2a2a] flex items-center justify-center">
              <span className="text-3xl sm:text-5xl font-bold text-[#00ff88]">
                {repo[0]?.toUpperCase() || "?"}
              </span>
            </div>
            
            {/* Repo Info */}
            <div className="flex-1 min-w-0">
              <h1 className="font-editorial text-2xl sm:text-4xl lg:text-5xl tracking-tight mb-2 sm:mb-3 text-balance">
                {playlist?.title || repo}
              </h1>
              <p className="text-[#888] text-sm sm:text-base mb-3 sm:mb-4 line-clamp-2">
                {playlist?.description || "An immersive audio journey through this repository."}
              </p>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-[#666]">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <span>{episodes.length} episode{episodes.length !== 1 ? "s" : ""}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{formatTime(playlist?.totalDurationSecs || 0)} total</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-6 lg:gap-8">
          {/* Main Player Column */}
          <div className="space-y-6">
            {/* Now Playing Card */}
            <div className="p-5 sm:p-8 bg-[#111] border border-[#1a1a1a] rounded-2xl animate-fadeInUp grainy" style={{ animationDelay: "100ms" }}>
              {/* Episode Badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2.5 py-1 bg-[#00ff88]/15 text-[#00ff88] text-xs font-bold uppercase tracking-wider rounded-full">
                  Episode {currentEpisodeData?.episodeNumber || 1}
                </span>
                {currentEpisodeData?.conversationStyle === "duo" && (
                  <span className="px-2.5 py-1 bg-[#1a1a1a] text-[#888] text-xs uppercase tracking-wider rounded-full">
                    2 Hosts
                  </span>
                )}
              </div>

              {/* Episode Title */}
              <h2 className="font-editorial text-xl sm:text-2xl lg:text-3xl mb-3">
                {currentEpisodeData?.title || "Loading..."}
              </h2>
              
              {currentEpisodeData?.description && (
                <p className="text-[#888] text-sm sm:text-base mb-6 line-clamp-2">
                  {currentEpisodeData.description}
                </p>
              )}

              {/* Progress Bar - Larger touch target */}
              <div className="mb-4">
                <div 
                  className="relative h-2 sm:h-3 bg-[#1a1a1a] rounded-full overflow-hidden cursor-pointer group"
                  onClick={seekTo}
                >
                  {/* Progress fill */}
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#00ff88]/80 to-[#00ff88] rounded-full transition-all"
                    style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                  />
                  {/* Hover indicator */}
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex justify-between mt-2 text-xs font-mono text-[#666]">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration || currentEpisodeData?.durationSecs || 0)}</span>
                </div>
              </div>

              {/* Controls - Desktop */}
              <div className="hidden sm:flex items-center justify-center gap-4">
                <button 
                  className="w-12 h-12 flex items-center justify-center text-[#888] hover:text-[#00ff88] hover:bg-[#1a1a1a] rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={currentEpisode === 0}
                  onClick={() => setCurrentEpisode(Math.max(0, currentEpisode - 1))}
                  aria-label="Previous episode"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                  </svg>
                </button>
                
                <button
                  onClick={togglePlay}
                  disabled={!currentEpisodeData?.audioUrl}
                  className="w-16 h-16 rounded-full bg-[#0d2818] border border-[#2a2a2a] flex items-center justify-center hover:bg-[#143824] hover:border-[#3a3a3a] hover:scale-105 active:scale-95 transition-all text-[#00ff88] disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                <button 
                  className="w-12 h-12 flex items-center justify-center text-[#888] hover:text-[#00ff88] hover:bg-[#1a1a1a] rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={currentEpisode >= episodes.length - 1}
                  onClick={() => setCurrentEpisode(Math.min(episodes.length - 1, currentEpisode + 1))}
                  aria-label="Next episode"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 18h2V6h-2v12zM6 18l8.5-6L6 6v12z"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Transcript */}
            {currentEpisodeData?.transcript && (
              <details className="group animate-fadeInUp" style={{ animationDelay: "200ms" }}>
                <summary className="p-5 sm:p-6 bg-[#111] border border-[#1a1a1a] rounded-2xl cursor-pointer hover:border-[#2a2a2a] transition-colors list-none grainy">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#888]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm sm:text-base">Transcript</h3>
                        <p className="text-xs text-[#666]">Full episode text</p>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-[#666] transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </summary>
                <div className="mt-2 p-5 sm:p-6 bg-[#111] border border-[#1a1a1a] rounded-2xl max-h-96 overflow-y-auto grainy">
                  <p className="text-[#aaa] text-sm leading-relaxed whitespace-pre-wrap">
                    {currentEpisodeData.transcript}
                  </p>
                </div>
              </details>
            )}
          </div>

          {/* Episodes Sidebar - Desktop */}
          <aside className="hidden lg:block animate-fadeInUp" style={{ animationDelay: "150ms" }}>
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#888]">
                  All Episodes
                </h3>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-180px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#333]">
                {episodes.map((episode, idx) => (
                  <button
                    key={episode.id}
                    onClick={() => {
                      setCurrentEpisode(idx);
                      setCurrentTime(0);
                    }}
                    className={`w-full text-left p-4 rounded-xl transition-all group grainy ${
                      idx === currentEpisode
                        ? "bg-[#0d2818] border border-[#00ff88]/40 text-[#e8e8e8]"
                        : "bg-[#111] border border-[#1a1a1a] hover:border-[#00ff88]/30 hover:bg-[#141414]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                        idx === currentEpisode 
                          ? "bg-[#00ff88]/20 text-[#00ff88]" 
                          : "bg-[#1a1a1a] text-[#666]"
                      }`}>
                        {idx === currentEpisode && isPlaying ? (
                          <div className="flex gap-0.5 items-end h-4">
                            <div className="w-1 bg-current rounded-full animate-pulse" style={{ height: "60%" }} />
                            <div className="w-1 bg-current rounded-full animate-pulse" style={{ height: "100%", animationDelay: "0.15s" }} />
                            <div className="w-1 bg-current rounded-full animate-pulse" style={{ height: "40%", animationDelay: "0.3s" }} />
                          </div>
                        ) : (
                          String(episode.episodeNumber).padStart(2, "0")
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${
                          idx === currentEpisode ? "text-[#00ff88]" : "group-hover:text-[#00ff88]"
                        }`}>
                          {episode.title}
                        </div>
                        <div className={`text-xs font-mono ${
                          idx === currentEpisode ? "text-[#00ff88]/60" : "text-[#666]"
                        }`}>
                          {formatTime(episode.durationSecs)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Episodes List - Mobile (shows below main content) */}
          <section className="lg:hidden animate-fadeInUp" style={{ animationDelay: "300ms" }}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#888] mb-4">
              All Episodes ({episodes.length})
            </h3>
            <div className="space-y-2">
              {episodes.map((episode, idx) => (
                <button
                  key={episode.id}
                  onClick={() => {
                    setCurrentEpisode(idx);
                    setCurrentTime(0);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`w-full text-left p-4 rounded-xl transition-all grainy ${
                    idx === currentEpisode
                      ? "bg-[#0d2818] border border-[#00ff88]/40 text-[#e8e8e8]"
                      : "bg-[#111] border border-[#1a1a1a] active:bg-[#1a1a1a]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                      idx === currentEpisode 
                        ? "bg-[#00ff88]/20 text-[#00ff88]" 
                        : "bg-[#1a1a1a] text-[#666]"
                    }`}>
                      {String(episode.episodeNumber).padStart(2, "0")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {episode.title}
                      </div>
                      <div className={`text-xs font-mono ${
                        idx === currentEpisode ? "text-[#00ff88]/60" : "text-[#666]"
                      }`}>
                        {formatTime(episode.durationSecs)}
                      </div>
                    </div>
                    {idx === currentEpisode && (
                      <div className="shrink-0 w-2 h-2 rounded-full bg-current" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Mobile Bottom Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-[#111] border-t border-[#1a1a1a] p-3 safe-area-inset-bottom z-50">
        <div className="flex items-center gap-3">
          {/* Mini Progress */}
          <div 
            className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden"
            onClick={seekTo}
          >
            <div
              className="h-full bg-gradient-to-r from-[#00ff88]/80 to-[#00ff88]"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            <button 
              className="w-10 h-10 flex items-center justify-center text-[#888] disabled:opacity-30"
              disabled={currentEpisode === 0}
              onClick={() => setCurrentEpisode(Math.max(0, currentEpisode - 1))}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>
            
            <button
              onClick={togglePlay}
              disabled={!currentEpisodeData?.audioUrl}
              className="w-12 h-12 rounded-full bg-[#0d2818] border border-[#2a2a2a] flex items-center justify-center text-[#00ff88] disabled:opacity-40"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            <button 
              className="w-10 h-10 flex items-center justify-center text-[#888] disabled:opacity-30"
              disabled={currentEpisode >= episodes.length - 1}
              onClick={() => setCurrentEpisode(Math.min(episodes.length - 1, currentEpisode + 1))}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 18h2V6h-2v12zM6 18l8.5-6L6 6v12z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}