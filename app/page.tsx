"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";

export default function HomePage() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const popularRepos = [
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
    <main className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-serif tracking-tight">
            Git<span className="text-[#00ff88]">talks</span>
          </Link>
          <div className="flex gap-8 text-sm">
            <Link href="/explore" className="hover:text-[#00ff88] transition-colors">Explore</Link>
            <Link href="/about" className="hover:text-[#00ff88] transition-colors">About</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-6 animate-fadeInUp">
            <h1 className="text-7xl md:text-8xl font-serif leading-[0.95] tracking-tight">
              Listen to
              <br />
              <span className="text-[#00ff88] italic">repositories</span>
            </h1>
            <p className="text-xl text-[#888] max-w-2xl font-light leading-relaxed">
              Transform any GitHub repository into an immersive audio experience.
              AI-generated podcast episodes that explain architecture, design decisions, and code.
            </p>
          </div>

          {/* Repo Input */}
          <div className="mt-16 animate-fadeInUp" style={{ animationDelay: "0.2s" }}>
            <form onSubmit={handleSubmit} className="relative group">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="Enter repository URL or owner/repo"
                className="w-full px-8 py-6 bg-[#111] border-2 border-[#1a1a1a] rounded-2xl text-lg focus:outline-none focus:border-[#00ff88] transition-all placeholder:text-[#444] font-mono text-sm"
              />
              <button
                type="submit"
                disabled={isLoading || !repoInput.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-8 py-3 bg-[#00ff88] text-[#0a0a0a] rounded-xl font-semibold hover:bg-[#00dd77] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </span>
                ) : (
                  "Generate"
                )}
              </button>
            </form>
            <p className="mt-4 text-sm text-[#555] font-mono">
              Example: vercel/next.js or https://github.com/facebook/react
            </p>
          </div>
        </div>
      </section>

      {/* Popular Repositories */}
      <section className="px-6 pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 animate-fadeInUp" style={{ animationDelay: "0.4s" }}>
            <h2 className="text-4xl font-serif mb-3">Popular Talks</h2>
            <p className="text-[#666]">Try these popular repositories</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {popularRepos.map((repo, idx) => (
              <Link
                key={repo.name}
                href={`/${repo.owner}/${repo.name}`}
                className="group relative p-8 bg-[#111] border border-[#1a1a1a] rounded-2xl hover:border-[#00ff88] transition-all hover:scale-[1.02] animate-fadeInUp"
                style={{ animationDelay: `${0.5 + idx * 0.1}s` }}
              >
                <div className="absolute top-4 right-4 px-3 py-1 bg-[#1a1a1a] rounded-full text-xs font-mono text-[#888]">
                  ★ {repo.stars}
                </div>
                <div className="space-y-3">
                  <div className="font-mono text-sm text-[#00ff88]">
                    {repo.owner}/{repo.name}
                  </div>
                  <p className="text-[#aaa] leading-relaxed">{repo.description}</p>
                  <div className="flex items-center gap-2 text-sm text-[#666] pt-4">
                    <div className="w-2 h-2 rounded-full bg-[#00ff88]" />
                    <span>Click to generate</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-[#111] border border-[#1a1a1a] rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-[#00ff88]/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">AI-Powered Analysis</h3>
              <p className="text-[#888] text-sm">Google Gemini analyzes code architecture and creates engaging podcast scripts</p>
            </div>

            <div className="p-6 bg-[#111] border border-[#1a1a1a] rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-[#00ff88]/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Natural Voice</h3>
              <p className="text-[#888] text-sm">Microsoft Edge TTS provides high-quality, natural-sounding voices</p>
            </div>

            <div className="p-6 bg-[#111] border border-[#1a1a1a] rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-[#00ff88]/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Two Host Modes</h3>
              <p className="text-[#888] text-sm">Choose single narrator or engaging two-host conversation style</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
