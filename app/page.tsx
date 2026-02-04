"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent, useEffect } from "react";
import { useSession, signIn, signOut } from "@/lib/auth-client";

// Words for the hero animation
const WORDS = ["repositories", "repo-stories"];

export default function HomePage() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session, isPending } = useSession();
  const [wordIndex, setWordIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Current word
  const currentWord = WORDS[wordIndex];

  // Clean slide transition
  useEffect(() => {
    const interval = setInterval(() => {
      // Start exit animation
      setIsTransitioning(true);
      
      // Change word at midpoint
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % WORDS.length);
      }, 400);
      
      // End animation
      setTimeout(() => {
        setIsTransitioning(false);
      }, 800);
      
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const popularRepos = [
    { owner: "github", name: "copilot-cli", stars: "10k", description: "GitHub Copilot in the terminal" },
    { owner: "vercel", name: "next.js", stars: "120k", description: "The React Framework for the Web" },
    { owner: "facebook", name: "react", stars: "220k", description: "The library for web and native interfaces" },
    { owner: "microsoft", name: "vscode", stars: "158k", description: "Visual Studio Code" },
    { owner: "tailwindlabs", name: "tailwindcss", stars: "78k", description: "A utility-first CSS framework" },
  ];

  function parseRepoInput(input: string): { owner: string; name: string } | null {
    // Handle full URL
    const urlMatch = input.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (urlMatch) {
      return { owner: urlMatch[1], name: urlMatch[2].replace(/\.git$/, "") };
    }

    // Handle owner/name format
    const simpleMatch = input.match(/^([^\/]+)\/([^\/]+)$/);
    if (simpleMatch) {
      return { owner: simpleMatch[1], name: simpleMatch[2] };
    }

    return null;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!repoInput.trim()) return;

    const parsed = parseRepoInput(repoInput.trim());
    if (parsed) {
      setIsLoading(true);
      router.push(`/${parsed.owner}/${parsed.name}`);
    } else {
      alert("Invalid repository format. Use owner/repo or full GitHub URL.");
    }
  }

  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-[#e8e8e8]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="text-xl sm:text-2xl tracking-tight">
            <span className="font-editorial">Git</span><span className="font-editorial italic text-[#00ff88]">talks</span>
          </Link>
          
          {/* Desktop Nav */}
          <div className="hidden sm:flex items-center gap-8 text-sm">
            <Link href="/explore" className="hover:text-[#00ff88] transition-colors">Explore</Link>
            <Link href="/about" className="hover:text-[#00ff88] transition-colors">About</Link>
            
            {/* Auth Button */}
            {isPending ? (
              <div className="w-8 h-8 rounded-full bg-[#1a1a1a] animate-pulse" />
            ) : session?.user ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => signOut()}
                  className="text-[#888] hover:text-red-400 transition-colors text-sm"
                >
                  Sign out
                </button>
                {session.user.image ? (
                  <img 
                    src={session.user.image} 
                    alt={session.user.name || "User"} 
                    className="w-8 h-8 rounded-full border border-[#333]"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#00ff88] flex items-center justify-center text-[#0a0a0a] font-bold text-xs">
                    {session.user.name?.charAt(0) || session.user.email?.charAt(0) || "U"}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => signIn.social({ provider: "github" })}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] hover:text-[#00ff88] transition-all"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in
              </button>
            )}
          </div>

          {/* Mobile Nav */}
          <div className="flex sm:hidden items-center gap-3">
            {/* Sign in button - always visible on mobile */}
            {isPending ? (
              <div className="w-8 h-8 rounded-full bg-[#1a1a1a] animate-pulse" />
            ) : session?.user ? (
              session.user.image ? (
                <img 
                  src={session.user.image} 
                  alt={session.user.name || "User"} 
                  className="w-8 h-8 rounded-full border border-[#333]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#00ff88] flex items-center justify-center text-[#0a0a0a] font-bold text-xs">
                  {session.user.name?.charAt(0) || session.user.email?.charAt(0) || "U"}
                </div>
              )
            ) : (
              <button
                onClick={() => signIn.social({ provider: "github" })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#00ff88] transition-all text-sm"
                aria-label="Sign in with GitHub"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in
              </button>
            )}
            
            {/* Hamburger menu button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {menuOpen && (
          <div className="sm:hidden border-t border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-xl">
            <div className="px-4 py-4 space-y-3">
              <Link 
                href="/explore" 
                className="block py-2 text-[#888] hover:text-[#00ff88] transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                Explore
              </Link>
              <Link 
                href="/about" 
                className="block py-2 text-[#888] hover:text-[#00ff88] transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                About
              </Link>
              {session?.user && (
                <button
                  onClick={() => {
                    signOut();
                    setMenuOpen(false);
                  }}
                  className="block w-full text-left py-2 text-red-400 hover:text-red-300 transition-colors"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-4 sm:space-y-6 animate-fadeInUp">
            <h1 className="font-editorial text-5xl sm:text-7xl md:text-8xl leading-[0.95] tracking-tight">
              Listen to
              <br />
              <span className="relative inline-block overflow-hidden">
                <span 
                  key={currentWord}
                  className={`inline-block text-[#00ff88] italic transition-all duration-500 ease-out ${
                    isTransitioning 
                      ? 'opacity-0 -translate-y-8' 
                      : 'opacity-100 translate-y-0'
                  }`}
                >
                  {currentWord}
                </span>
              </span>
            </h1>
            <p className="text-base sm:text-xl text-[#888] max-w-2xl leading-relaxed">
              Transform any GitHub repository into an immersive audio experience.
              AI-generated podcast episodes that explain architecture, design decisions, and code.
            </p>
          </div>

          {/* Repo Input - Stack on mobile */}
          <div className="mt-10 sm:mt-16 animate-fadeInUp" style={{ animationDelay: "0.2s" }}>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:relative gap-3 sm:gap-0">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="Enter repository URL or owner/repo"
                className="w-full px-4 sm:px-8 py-4 sm:py-6 bg-[#111] border-2 border-[#1a1a1a] rounded-xl sm:rounded-2xl text-base sm:text-lg focus:outline-none focus:border-[#00ff88] transition-all placeholder:text-[#444] font-mono text-xs sm:text-sm"
              />
              <button
                type="submit"
                disabled={isLoading || !repoInput.trim()}
                className="sm:absolute sm:right-3 sm:top-1/2 sm:-translate-y-1/2 w-full sm:w-auto px-6 py-3 sm:py-3 bg-white text-[#0a0a0a] font-bold text-sm uppercase tracking-widest border-2 border-white shadow-[4px_4px_0px_0px_rgba(255,255,255,0.4)] hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.7)] active:shadow-none transition-shadow duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    LOADING
                  </span>
                ) : (
                  "GENERATE →"
                )}
              </button>
            </form>
            
            {/* Quick Select Options */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#666]">Try:</span>
              {[
                { owner: "github", name: "copilot-cli" },
                { owner: "vercel", name: "next.js" },
                { owner: "facebook", name: "react" },
              ].map((repo) => (
                <button
                  key={`${repo.owner}/${repo.name}`}
                  type="button"
                  onClick={() => setRepoInput(`${repo.owner}/${repo.name}`)}
                  className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-xs font-mono text-[#888] hover:border-[#00ff88] hover:text-[#00ff88] transition-all"
                >
                  {repo.owner}/{repo.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Popular Repositories */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10 sm:mb-12 animate-fadeInUp" style={{ animationDelay: "0.4s" }}>
            <h2 className="font-editorial text-3xl sm:text-4xl mb-2">Popular Talks</h2>
            <p className="text-[#555] text-sm sm:text-base">Discover trending repositories</p>
          </div>

          {/* Clean 2-column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {popularRepos.map((repo, idx) => (
              <Link
                key={repo.name}
                href={`/${repo.owner}/${repo.name}`}
                className="group flex items-center justify-between p-5 sm:p-6 bg-[#0c0c0c] border border-[#1a1a1a] rounded-2xl hover:border-[#2a2a2a] transition-all grainy animate-fadeInUp"
                style={{ animationDelay: `${0.5 + idx * 0.08}s` }}
              >
                {/* Content */}
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-3 mb-1.5">
                    <h3 className="font-semibold text-base sm:text-lg group-hover:text-[#00ff88] transition-colors truncate">
                      {repo.owner}/{repo.name}
                    </h3>
                    <span className="text-xs text-[#555] font-mono shrink-0">★ {repo.stars}</span>
                  </div>
                  <p className="text-[#666] text-sm line-clamp-1">
                    {repo.description}
                  </p>
                </div>
                
                {/* Play button */}
                <div className="w-10 h-10 rounded-full bg-[#111] border border-[#1a1a1a] flex items-center justify-center group-hover:border-[#00ff88]/40 group-hover:bg-[#0d2818] transition-all shrink-0">
                  <svg className="w-4 h-4 ml-0.5 text-[#555] group-hover:text-[#00ff88] transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="p-5 sm:p-6 bg-[#111] border border-[#1a1a1a] rounded-2xl hover:border-[#333] transition-colors grainy">
              <div className="w-12 h-12 rounded-xl bg-[#0d2818] border border-[#1a3a2a] flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">AI-Powered Analysis</h3>
              <p className="text-[#888] text-sm leading-relaxed">Google Gemini analyzes code architecture and creates engaging podcast scripts</p>
            </div>

            <div className="p-5 sm:p-6 bg-[#111] border border-[#1a1a1a] rounded-2xl hover:border-[#333] transition-colors grainy">
              <div className="w-12 h-12 rounded-xl bg-[#0d2818] border border-[#1a3a2a] flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Natural Voice</h3>
              <p className="text-[#888] text-sm leading-relaxed">Kokoro TTS provides high-quality, natural-sounding voices</p>
            </div>

            <div className="p-5 sm:p-6 bg-[#111] border border-[#1a1a1a] rounded-2xl hover:border-[#333] transition-colors sm:col-span-2 md:col-span-1 grainy">
              <div className="w-12 h-12 rounded-xl bg-[#0d2818] border border-[#1a3a2a] flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Two-Host Conversation</h3>
              <p className="text-[#888] text-sm leading-relaxed">Engaging dialogue between two AI hosts discussing your code</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
