"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "@/lib/auth-client";

interface Playlist {
  id: string;
  title: string;
  description: string | null;
  owner: string;
  repoName: string;
  repoUrl: string;
  totalDurationSecs: number;
  createdAt: string;
}

export default function ExplorePage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session, isPending } = useSession();

  useEffect(() => {
    fetchPlaylists();
  }, []);

  async function fetchPlaylists() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/playlists/recent?limit=50");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch playlists");
      }

      setPlaylists(data.playlists || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  function formatDuration(secs: number): string {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8]">
      {/* Header */}
      <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="text-xl sm:text-2xl tracking-tight">
            <span className="font-editorial">Git</span>
            <span className="font-editorial italic text-[#00ff88]">talks</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-[#888] hover:text-[#00ff88] transition-colors"
            >
              Generate
            </Link>
            <Link
              href="/explore"
              className="text-sm text-[#00ff88]"
            >
              Explore
            </Link>

            {isPending ? (
              <div className="w-20 h-8 bg-[#1a1a1a] rounded-lg animate-pulse" />
            ) : session?.user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#666]">{session.user.name || session.user.email}</span>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] hover:text-[#00ff88] transition-all text-sm"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn.social({ provider: "github" })}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] hover:text-[#00ff88] transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-[#1a1a1a] bg-[#0a0a0a] px-4 py-4 space-y-3">
            <Link
              href="/"
              className="block text-sm text-[#888] hover:text-[#00ff88] transition-colors py-2"
              onClick={() => setMenuOpen(false)}
            >
              Generate
            </Link>
            <Link
              href="/explore"
              className="block text-sm text-[#00ff88] py-2"
              onClick={() => setMenuOpen(false)}
            >
              Explore
            </Link>

            {!isPending && (
              session?.user ? (
                <div className="pt-2 border-t border-[#1a1a1a]">
                  <span className="text-sm text-[#666] block mb-2">{session.user.name || session.user.email}</span>
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] hover:text-[#00ff88] transition-all text-sm whitespace-nowrap"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { signIn.social({ provider: "github" }); setMenuOpen(false); }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] hover:text-[#00ff88] transition-all text-sm whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Sign in
                </button>
              )
            )}
          </div>
        )}
      </nav>

      {/* Main Content */}
      <div className="pt-20 sm:pt-24 pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-10 sm:mb-12">
            <h1 className="font-editorial text-4xl sm:text-5xl mb-4">Explore</h1>
            <p className="text-[#888] text-lg">
              Browse all generated podcasts • {playlists.length} available
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-[#666]">Loading podcasts...</span>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="text-center py-20">
              <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl inline-block">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={fetchPlaylists}
                  className="px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-red-400 transition-all text-sm"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && playlists.length === 0 && (
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#111] border border-[#222] flex items-center justify-center">
                <svg className="w-10 h-10 text-[#333]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2">No podcasts yet</h2>
              <p className="text-[#666] mb-6">Be the first to generate a podcast!</p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#00ff88] text-[#0a0a0a] rounded-lg font-medium hover:bg-[#00dd77] transition-all"
              >
                Generate Podcast
              </Link>
            </div>
          )}

          {/* Playlists Grid */}
          {!isLoading && !error && playlists.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {playlists.map((playlist) => (
                <Link
                  key={playlist.id}
                  href={`/${playlist.owner}/${playlist.repoName}`}
                  className="group block p-5 bg-[#111] border border-[#1a1a1a] rounded-2xl hover:border-[#333] hover:bg-[#151515] transition-all"
                >
                  {/* Repo Avatar */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00ff88] to-[#00aa66] flex items-center justify-center text-lg font-bold text-[#0a0a0a] shrink-0">
                      {playlist.repoName[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-lg group-hover:text-[#00ff88] transition-colors truncate">
                        {playlist.owner}/{playlist.repoName}
                      </h3>
                      <p className="text-[#666] text-sm">
                        {formatDate(playlist.createdAt)} • {formatDuration(playlist.totalDurationSecs)}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  {playlist.description && (
                    <p className="text-[#888] text-sm line-clamp-2 mb-4">
                      {playlist.description}
                    </p>
                  )}

                  {/* Title */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#555] truncate pr-4">
                      {playlist.title}
                    </span>
                    <svg 
                      className="w-5 h-5 text-[#333] group-hover:text-[#00ff88] transition-colors shrink-0" 
                      fill="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
