"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { useState } from "react";

export default function AboutPage() {
  const { data: session, isPending } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const features = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      ),
      title: "AI-Powered Podcasts",
      description: "Transform any GitHub repository into an engaging podcast with natural-sounding AI hosts that discuss the code, architecture, and purpose of the project."
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
        </svg>
      ),
      title: "Episode Series",
      description: "Each podcast is split into digestible episodes covering different aspects: overview, architecture, key features, code deep-dives, and more."
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ),
      title: "Duo Conversations",
      description: "Enjoy dynamic discussions between two AI hosts who explore, question, and explain the codebase like a real podcast conversation."
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
      ),
      title: "Smart Analysis",
      description: "Our AI reads README files, code structure, and documentation to create insightful, accurate discussions about any open-source project."
    }
  ];

  const techStack = [
    { name: "Next.js 15", category: "Framework" },
    { name: "Claude AI", category: "LLM" },
    { name: "Kokoro TTS", category: "Voice" },
    { name: "Turso", category: "Database" },
    { name: "GitHub API", category: "Data" },
    { name: "Better Auth", category: "Auth" }
  ];

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
            <Link href="/about" className="text-[#00ff88]">About</Link>
            
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
                    {session.user.name?.charAt(0) || "U"}
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

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
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

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="sm:hidden border-t border-[#1a1a1a] bg-[#0a0a0a]">
            <div className="px-4 py-4 space-y-3">
              <Link href="/explore" className="block py-2 hover:text-[#00ff88] transition-colors">Explore</Link>
              <Link href="/about" className="block py-2 text-[#00ff88]">About</Link>
              {session?.user ? (
                <button
                  onClick={() => signOut()}
                  className="block py-2 text-red-400"
                >
                  Sign out
                </button>
              ) : (
                <button
                  onClick={() => signIn.social({ provider: "github" })}
                  className="block py-2 hover:text-[#00ff88] transition-colors"
                >
                  Sign in with GitHub
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-editorial text-4xl sm:text-6xl lg:text-7xl tracking-tight mb-6 animate-fadeInUp">
            Listen to <span className="italic text-[#00ff88]">code</span>
          </h1>
          <p className="text-lg sm:text-xl text-[#888] max-w-2xl mx-auto animate-fadeInUp" style={{ animationDelay: "100ms" }}>
            GitTalks transforms GitHub repositories into engaging AI-generated podcasts. 
            Learn about open-source projects while you commute, exercise, or relax.
          </p>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1a1a1a]">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-editorial text-2xl sm:text-4xl text-center mb-12 sm:mb-16">
            How it <span className="italic text-[#00ff88]">works</span>
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                step: "01",
                title: "Paste a repo",
                description: "Enter any GitHub repository URL or owner/repo format"
              },
              {
                step: "02",
                title: "AI analyzes",
                description: "Our AI reads the codebase, README, and documentation"
              },
              {
                step: "03",
                title: "Listen & learn",
                description: "Enjoy a multi-episode podcast about the project"
              }
            ].map((item, idx) => (
              <div 
                key={item.step}
                className="p-6 sm:p-8 bg-[#111] border border-[#1a1a1a] rounded-2xl grainy animate-fadeInUp"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="text-5xl sm:text-6xl font-bold text-[#1a1a1a] mb-4 font-mono">
                  {item.step}
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-[#888] text-sm sm:text-base">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1a1a1a]">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-editorial text-2xl sm:text-4xl text-center mb-12 sm:mb-16">
            Powerful <span className="italic text-[#00ff88]">features</span>
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map((feature, idx) => (
              <div 
                key={feature.title}
                className="p-6 sm:p-8 bg-[#111] border border-[#1a1a1a] rounded-2xl hover:border-[#2a2a2a] transition-colors grainy animate-fadeInUp"
                style={{ animationDelay: `${idx * 75}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-[#0d2818] border border-[#1a3a2a] flex items-center justify-center text-[#00ff88] mb-5">
                  {feature.icon}
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-[#888] text-sm sm:text-base leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1a1a1a]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-editorial text-2xl sm:text-4xl mb-12 sm:mb-16">
            Built with <span className="italic text-[#00ff88]">modern tech</span>
          </h2>
          
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {techStack.map((tech, idx) => (
              <div 
                key={tech.name}
                className="px-4 py-2.5 bg-[#111] border border-[#1a1a1a] rounded-full animate-fadeInUp"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <span className="text-sm font-medium">{tech.name}</span>
                <span className="ml-2 text-xs text-[#666]">{tech.category}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-[#1a1a1a]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-editorial text-2xl sm:text-4xl mb-6">
            Ready to <span className="italic text-[#00ff88]">listen</span>?
          </h2>
          <p className="text-[#888] mb-8 text-sm sm:text-base">
            Sign in with GitHub and generate your first podcast for free.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/"
              className="px-6 py-3 bg-[#00ff88] text-[#0a0a0a] font-semibold rounded-full hover:bg-[#00dd77] transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/explore"
              className="px-6 py-3 border border-[#333] rounded-full hover:border-[#00ff88] hover:text-[#00ff88] transition-all"
            >
              Explore Podcasts
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 border-t border-[#1a1a1a]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#666]">
          <div className="flex items-center gap-2">
            <span className="font-editorial">Git</span><span className="font-editorial italic text-[#00ff88]">talks</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/explore" className="hover:text-[#00ff88] transition-colors">Explore</Link>
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[#00ff88] transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
