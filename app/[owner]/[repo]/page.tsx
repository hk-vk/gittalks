"use client";

import Link from "next/link";
import { useState, useEffect, use, useRef, useMemo } from "react";

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

type GenerationStatus = "idle" | "checking" | "generating" | "completed" | "error";

// Step icons
const STEP_ICONS: Record<string, string> = {
  parsing: "🔗",
  checking: "🔍",
  fetching: "📥",
  analyzing: "🧠",
  "generating-content": "✍️",
  "generating-audio": "🎙️",
  done: "✅",
  error: "❌",
  cached: "⚡",
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
  const [conversationStyle, setConversationStyle] = useState<"single" | "duo">("single");
  
  // Progress state
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const [progressDescription, setProgressDescription] = useState("");
  const [progressSubStep, setProgressSubStep] = useState("");

  // Check if playlist exists on mount
  useEffect(() => {
    checkPlaylist();
  }, [owner, repo]);

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
        setStatus("completed");
      } else {
        setStatus("idle");
      }
    } catch (err) {
      setStatus("idle");
    }
  }

  async function generatePodcast() {
    setStatus("generating");
    setError(null);
    setProgress(0);
    setProgressStep("starting");
    setProgressDescription("Initializing...");
    setProgressSubStep("");

    try {
      const response = await fetch("/api/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          conversationStyle,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
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
    
    // Use the direct URL - with our TTS chunking and Xing headers, seeking should work
    return url;
  }, [currentAudioUrl]);

  const currentEpisodeData = episodes[currentEpisode];

  // Render generation UI
  if (status === "idle" || status === "generating" || status === "error") {
    const isGenerating = status === "generating";
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8]">
        <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-2xl font-serif tracking-tight">
              Git<span className="text-[#00ff88]">talks</span>
            </Link>
            <Link href="/" className="text-sm hover:text-[#00ff88] transition-colors">
              ← Back
            </Link>
          </div>
        </nav>

        <div className="pt-32 pb-20 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-[#00ff88] to-[#00aa66] flex items-center justify-center text-4xl font-bold text-[#0a0a0a]">
              {repo[0]?.toUpperCase() || "?"}
            </div>

            <h1 className="text-4xl font-serif mb-4">{owner}/{repo}</h1>

            {status === "error" && error && (
              <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                {error}
              </div>
            )}

            {isGenerating ? (
              <div className="space-y-8">
                {/* Progress Bar Container */}
                <div className="w-full max-w-md mx-auto">
                  {/* Progress percentage */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl font-bold text-[#00ff88]">{progress}%</span>
                    <span className="text-sm text-[#666]">
                      {progress < 100 ? "Generating..." : "Complete!"}
                    </span>
                  </div>
                  
                  {/* Progress bar track */}
                  <div className="w-full h-3 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#00ff88] to-[#00cc66] rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Current step with icon */}
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3 px-6 py-3 bg-[#111] border border-[#222] rounded-xl">
                    <span className="text-2xl">{STEP_ICONS[progressStep] || "⏳"}</span>
                    <span className="text-lg font-medium">{progressDescription}</span>
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
                    const isActive = progress >= stepProgress;
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
                  This may take 2-5 minutes depending on repository size
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                <p className="text-[#888] text-lg">
                  No podcast exists for this repository yet. Generate one now!
                </p>

                <div className="space-y-4">
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => setConversationStyle("single")}
                      className={`px-6 py-3 rounded-xl border-2 transition-all ${
                        conversationStyle === "single"
                          ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]"
                          : "border-[#333] hover:border-[#555]"
                      }`}
                    >
                      <div className="font-semibold">Single Host</div>
                      <div className="text-xs text-[#888] mt-1">Traditional narration</div>
                    </button>
                    <button
                      onClick={() => setConversationStyle("duo")}
                      className={`px-6 py-3 rounded-xl border-2 transition-all ${
                        conversationStyle === "duo"
                          ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]"
                          : "border-[#333] hover:border-[#555]"
                      }`}
                    >
                      <div className="font-semibold">Two Hosts</div>
                      <div className="text-xs text-[#888] mt-1">Conversation style</div>
                    </button>
                  </div>

                  <button
                    onClick={generatePodcast}
                    className="px-8 py-4 bg-[#00ff88] text-[#0a0a0a] rounded-xl font-semibold text-lg hover:bg-[#00dd77] transition-all hover:scale-105 active:scale-95"
                  >
                    Generate Podcast
                  </button>
                </div>

                <p className="text-xs text-[#555]">
                  Powered by AI • Uses Google Gemini for content • Edge TTS for audio
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
      <main className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
          <span className="text-[#888]">Loading...</span>
        </div>
      </main>
    );
  }

  // Player UI
  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8]">
      {/* Audio element - always rendered with dynamic src (matching working player) */}
      <audio 
        ref={audioRef} 
        preload="auto"
        crossOrigin="anonymous"
        src={proxyAudioUrl || undefined}
        className="hidden"
      />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-serif tracking-tight">
            Git<span className="text-[#00ff88]">talks</span>
          </Link>
          <div className="flex gap-4 items-center">
            <span className="text-sm text-[#666] font-mono">
              {owner}/{repo}
            </span>
            <Link href="/" className="text-sm hover:text-[#00ff88] transition-colors">
              ← Back
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr,400px] gap-8">
            {/* Main Player Area */}
            <div className="space-y-8">
              {/* Repo Header */}
              <div className="animate-fadeInUp">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00ff88] to-[#00aa66] flex items-center justify-center text-2xl font-bold text-[#0a0a0a]">
                    {repo[0]?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <h1 className="text-3xl font-serif">{playlist?.title || repo}</h1>
                    <p className="text-[#666] font-mono text-sm">by {owner}</p>
                  </div>
                </div>
                <p className="text-[#aaa] leading-relaxed">
                  {playlist?.description || "An immersive audio journey through this repository's architecture and design."}
                </p>
              </div>

              {/* Now Playing */}
              <div className="p-8 bg-[#111] border border-[#1a1a1a] rounded-2xl animate-fadeInUp" style={{ animationDelay: "0.1s" }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 rounded-full bg-[#00ff88]" />
                  <span className="text-xs uppercase tracking-wider text-[#666] font-semibold">
                    Episode {currentEpisodeData?.episodeNumber || 1}
                  </span>
                </div>
                
                <h2 className="text-2xl font-serif mb-2">{currentEpisodeData?.title || "Loading..."}</h2>
                {currentEpisodeData?.description && (
                  <p className="text-[#888] text-sm mb-6">{currentEpisodeData.description}</p>
                )}

                {/* Progress Bar */}
                <div className="space-y-2 mb-6">
                  <div 
                    className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden cursor-pointer group"
                    onClick={seekTo}
                  >
                    <div
                      className="h-full bg-[#00ff88] transition-all group-hover:bg-[#00dd77]"
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                    />
                  </div>
                  <div className="flex justify-between text-xs font-mono text-[#666]">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration || currentEpisodeData?.durationSecs || 0)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-6">
                  <button 
                    className="w-12 h-12 flex items-center justify-center hover:text-[#00ff88] transition-colors disabled:opacity-50"
                    disabled={currentEpisode === 0}
                    onClick={() => setCurrentEpisode(Math.max(0, currentEpisode - 1))}
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                    </svg>
                  </button>
                  
                  <button
                    onClick={togglePlay}
                    disabled={!currentEpisodeData?.audioUrl}
                    className="w-16 h-16 rounded-full bg-[#00ff88] flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-[#0a0a0a] disabled:opacity-50"
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
                    className="w-12 h-12 flex items-center justify-center hover:text-[#00ff88] transition-colors disabled:opacity-50"
                    disabled={currentEpisode >= episodes.length - 1}
                    onClick={() => setCurrentEpisode(Math.min(episodes.length - 1, currentEpisode + 1))}
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 18h2V6h-2v12zM6 18l8.5-6L6 6v12z"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Transcript */}
              {currentEpisodeData?.transcript && (
                <div className="p-8 bg-[#111] border border-[#1a1a1a] rounded-2xl animate-fadeInUp" style={{ animationDelay: "0.2s" }}>
                  <h3 className="text-sm uppercase tracking-wider text-[#666] font-semibold mb-6">
                    Transcript
                  </h3>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-[#aaa] leading-relaxed whitespace-pre-wrap">
                      {currentEpisodeData.transcript}
                    </p>
                  </div>
                </div>
              )}

              {/* Show Notes */}
              {currentEpisodeData?.showNotes && (
                <div className="p-8 bg-[#111] border border-[#1a1a1a] rounded-2xl animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
                  <h3 className="text-sm uppercase tracking-wider text-[#666] font-semibold mb-6">
                    Show Notes
                  </h3>
                  <div className="prose prose-invert prose-sm max-w-none text-[#aaa]">
                    <div dangerouslySetInnerHTML={{ __html: currentEpisodeData.showNotes.replace(/\n/g, "<br/>") }} />
                  </div>
                </div>
              )}
            </div>

            {/* Playlist Sidebar */}
            <div className="space-y-4 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
              <div className="sticky top-24">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm uppercase tracking-wider text-[#666] font-semibold">
                    Episodes ({episodes.length})
                  </h3>
                  <span className="text-xs text-[#555] font-mono">
                    {formatTime(playlist?.totalDurationSecs || 0)} total
                  </span>
                </div>
                <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {episodes.map((episode, idx) => (
                    <button
                      key={episode.id}
                      onClick={() => {
                        setCurrentEpisode(idx);
                        setCurrentTime(0);
                      }}
                      className={`w-full text-left p-4 rounded-xl transition-all group ${
                        idx === currentEpisode
                          ? "bg-[#00ff88] text-[#0a0a0a]"
                          : "bg-[#111] border border-[#1a1a1a] hover:border-[#00ff88]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono opacity-60">
                              {String(episode.episodeNumber).padStart(2, "0")}
                            </span>
                            {episode.isFree === 1 && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                idx === currentEpisode ? "bg-[#0a0a0a]/20" : "bg-[#00ff88]/20 text-[#00ff88]"
                              }`}>
                                FREE
                              </span>
                            )}
                          </div>
                          <div className={`text-sm font-medium mb-1 truncate ${idx === currentEpisode ? "" : "group-hover:text-[#00ff88]"}`}>
                            {episode.title}
                          </div>
                          <div className={`text-xs font-mono ${idx === currentEpisode ? "opacity-60" : "text-[#666]"}`}>
                            {formatTime(episode.durationSecs)}
                          </div>
                        </div>
                        {idx === currentEpisode && isPlaying && (
                          <div className="flex gap-0.5 items-end h-4">
                            <div className="w-0.5 bg-[#0a0a0a] rounded-full animate-pulse" style={{ height: "60%", animationDelay: "0s" }} />
                            <div className="w-0.5 bg-[#0a0a0a] rounded-full animate-pulse" style={{ height: "100%", animationDelay: "0.2s" }} />
                            <div className="w-0.5 bg-[#0a0a0a] rounded-full animate-pulse" style={{ height: "40%", animationDelay: "0.4s" }} />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}