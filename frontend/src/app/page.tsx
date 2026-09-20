"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function LandingPage() {
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  return (
    <div className="font-sans antialiased min-h-screen relative selection:bg-brand-mint selection:text-black">
      {/* ── Ambient Background Layers ──────────────────────────────── */}
      <div className="fixed inset-0 bg-stadium-glow pointer-events-none z-0" />
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40" />
      {/* Top vignette gradient */}
      <div className="fixed top-0 left-0 right-0 h-96 bg-gradient-to-b from-brand-dark/90 via-brand-dark/40 to-transparent pointer-events-none z-0" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <main className="flex-grow">
          {/* ── Hero Section ───────────────────────────────────────── */}
          <section
            className="relative pt-12 pb-20 overflow-hidden bg-cover bg-no-repeat bg-center lg:bg-[center_right]"
            style={{
              backgroundImage: "url('/images/landing bg.png')",
            }}
            data-purpose="hero-banner"
          >
            {/* Subtle dark overlay tuned for readability without making the image too dark */}
            <div className="absolute inset-0 bg-black/35 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#04090E]/90 via-[#04090E]/50 to-transparent pointer-events-none" />

            <div className="max-w-[1440px] mx-auto px-6 relative z-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[580px]">
                
                {/* Hero Left: Content & CTAs */}
                <div className="lg:col-span-7 z-20 space-y-7">
                  {/* Eyebrow Tag */}
                  <div className="inline-flex items-center gap-2 tracking-[0.28em] text-xs font-bold text-brand-mint/90 uppercase">
                    <span className="w-2 h-2 rounded-full bg-brand-mint animate-pulse" />
                    Fantasy Football. Real Competition.
                  </div>

                  {/* Main Hero Headline */}
                  <h1 className="text-5xl sm:text-6xl xl:text-7xl font-black tracking-tight leading-[1.04] text-white uppercase">
                    YOUR LEAGUE.<br />
                    YOUR RULES.<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-mint via-teal-300 to-emerald-400 drop-shadow-[0_0_25px_rgba(0,242,157,0.3)]">
                      BIGGER GAMES.
                    </span>
                  </h1>

                  {/* Subtitle Description */}
                  <p className="text-slate-300 text-base sm:text-lg max-w-xl font-normal leading-relaxed">
                    Create and join real-time football auctions, build your dream squad, and compete with friends. Strategy. Passion. Glory.
                  </p>

                  {/* CTA Buttons */}
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <Link
                      href="/create"
                      className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-brand-mint text-[#051119] font-extrabold text-sm sm:text-base tracking-wide shadow-glow-mint hover:bg-brand-mintHover hover:scale-[1.02] transition-all"
                    >
                      <span>Create Auction Room</span>
                      <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setHowItWorksOpen(true)}
                      className="inline-flex items-center gap-3.5 px-6 py-3.5 rounded-full card-glass border border-teal-500/30 text-white text-sm sm:text-base font-semibold hover:border-brand-mint/70 hover:bg-white/5 transition-all cursor-pointer"
                    >
                      <span className="w-7 h-7 rounded-full bg-brand-mint/20 border border-brand-mint/50 flex items-center justify-center text-brand-mint">
                        <svg className="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </span>
                      <span>Watch How It Works</span>
                    </button>
                  </div>

                  {/* Live Stats Counter Row */}
                  <div className="pt-8 border-t border-brand-border/70 grid grid-cols-4 gap-4 max-w-xl">
                    <div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">10K+</div>
                      <div className="text-xs text-slate-400 font-medium mt-1">Active Managers</div>
                    </div>
                    <div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">500+</div>
                      <div className="text-xs text-slate-400 font-medium mt-1">Auctions Hosted</div>
                    </div>
                    <div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">50K+</div>
                      <div className="text-xs text-slate-400 font-medium mt-1">Players Traded</div>
                    </div>
                    <div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-brand-mint tracking-tight">99.9%</div>
                      <div className="text-xs text-slate-400 font-medium mt-1">Uptime</div>
                    </div>
                  </div>
                </div>

                {/* Hero Right spacer: lets the background image's subject (the player silhouette, green crown, "MORE THAN A GAME", and trophy) shine through */}
                <div className="hidden lg:block lg:col-span-5 min-h-[480px] pointer-events-none" aria-hidden="true" />

              </div>
            </div>
          </section>

          {/* ── Feature Highlights Bar ─────────────────────────────── */}
          <section className="py-4 relative z-20" data-purpose="quick-features-bar">
            <div className="max-w-[1440px] mx-auto px-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                
                {/* Item 1: Real-Time Auctions */}
                <div className="card-glass border border-brand-border/70 rounded-xl p-3.5 flex items-center gap-3.5 hover:border-brand-mint/40 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M7 2v11h3v9l7-12h-4l4-8z" />
                    </svg>
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold text-white tracking-wider uppercase truncate">Real-Time Auctions</h4>
                    <p className="text-[11px] text-slate-400 truncate">Fast. Fair. Exciting.</p>
                  </div>
                </div>

                {/* Item 2: Tactical Squads */}
                <div className="card-glass border border-brand-border/70 rounded-xl p-3.5 flex items-center gap-3.5 hover:border-brand-mint/40 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                    </svg>
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold text-white tracking-wider uppercase truncate">Tactical Squads</h4>
                    <p className="text-[11px] text-slate-400 truncate">Build without limits.</p>
                  </div>
                </div>

                {/* Item 3: Compete Anywhere */}
                <div className="card-glass border border-brand-border/70 rounded-xl p-3.5 flex items-center gap-3.5 hover:border-brand-mint/40 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
                    </svg>
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold text-white tracking-wider uppercase truncate">Compete Anywhere</h4>
                    <p className="text-[11px] text-slate-400 truncate">With your football community.</p>
                  </div>
                </div>

                {/* Item 4: A Higher Level */}
                <div className="card-glass border border-brand-border/70 rounded-xl p-3.5 flex items-center gap-3.5 hover:border-brand-mint/40 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                    </svg>
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold text-white tracking-wider uppercase truncate">A Higher Level</h4>
                    <p className="text-[11px] text-slate-400 truncate">Strategy meets passion.</p>
                  </div>
                </div>

                {/* Item 5: Social Proof Pill */}
                <Link
                  href="/create"
                  className="card-glass border border-brand-mint/30 rounded-xl p-3 flex items-center justify-between hover:border-brand-mint transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar Stack */}
                    <div className="flex -space-x-2 overflow-hidden">
                      <div className="inline-block h-7 w-7 rounded-full ring-2 ring-[#081722] bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-[10px] font-bold text-slate-950">
                        M1
                      </div>
                      <div className="inline-block h-7 w-7 rounded-full ring-2 ring-[#081722] bg-gradient-to-tr from-cyan-500 to-blue-400 flex items-center justify-center text-[10px] font-bold text-slate-950">
                        M2
                      </div>
                      <div className="inline-block h-7 w-7 rounded-full ring-2 ring-[#081722] bg-gradient-to-tr from-emerald-500 to-teal-300 flex items-center justify-center text-[10px] font-bold text-slate-950">
                        M3
                      </div>
                    </div>
                    <div className="text-[11px] leading-tight">
                      <span className="font-bold text-white block">Join thousands</span>
                      <span className="text-slate-400 text-[10px]">building their legacy</span>
                    </div>
                  </div>
                  <span className="text-brand-mint group-hover:translate-x-0.5 transition-transform">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                    </svg>
                  </span>
                </Link>

              </div>
            </div>
          </section>

          {/* ── How The Auction Runs ───────────────────────────────── */}
          <section id="how-it-runs" className="py-20 relative scroll-mt-24" data-purpose="step-by-step-guide">
            <div className="max-w-[1440px] mx-auto px-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Left Header Column */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="text-xs font-bold text-brand-mint tracking-[0.22em] uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-mint" />
                    Step-By-Step
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight uppercase">
                    How The<br />Auction Runs
                  </h2>
                  <p className="text-sm text-slate-400 leading-relaxed font-normal">
                    From room creation to lifting the trophy, experience a complete live multiplayer auction lifecycle.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setHowItWorksOpen(true)}
                      className="inline-flex items-center gap-2 text-sm font-bold text-brand-mint hover:text-brand-mintHover hover:gap-3 transition-all cursor-pointer"
                    >
                      <span>Learn More</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Right 4 Process Step Cards with Connection Indicators */}
                <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 relative">
                  
                  {/* Step Card 01 */}
                  <div className="relative card-glass border border-brand-border/80 rounded-2xl p-6 flex flex-col justify-between hover:border-brand-mint/50 transition-all group">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-panelSoft text-slate-300 border border-brand-border">
                          01
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                          </svg>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-white group-hover:text-brand-mint transition-colors">
                        Create a Room
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Configure budgets, squad limits, anti-sniping protection, and player filters.
                      </p>
                    </div>
                    {/* Connector Arrow for Desktop */}
                    <div className="hidden xl:block absolute -right-3 top-1/2 -translate-y-1/2 z-30 text-teal-400/60 pointer-events-none">
                      <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Step Card 02 */}
                  <div className="relative card-glass border border-brand-border/80 rounded-2xl p-6 flex flex-col justify-between hover:border-brand-mint/50 transition-all group">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-panelSoft text-slate-300 border border-brand-border">
                          02
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                          </svg>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-white group-hover:text-brand-mint transition-colors">
                        Invite Your Friends
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Share your unique room code. Managers select franchises and assemble in the lobby.
                      </p>
                    </div>
                    {/* Connector Arrow for Desktop */}
                    <div className="hidden xl:block absolute -right-3 top-1/2 -translate-y-1/2 z-30 text-teal-400/60 pointer-events-none">
                      <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Step Card 03 */}
                  <div className="relative card-glass border border-brand-border/80 rounded-2xl p-6 flex flex-col justify-between hover:border-brand-mint/50 transition-all group">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-panelSoft text-slate-300 border border-brand-border">
                          03
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.828 2.828a2 2 0 01-2.828 0L2.464 13.95a2 2 0 010-2.828L5.293 8.293m8.828 5.828L8.293 8.293m0 0L12 4.586a1 1 0 011.414 0l4 4a1 1 0 010 1.414L14.121 14.121z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                          </svg>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-white group-hover:text-brand-mint transition-colors">
                        Bid in Real Time
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Compete head-to-head with live bidding, timer sync and anti-sniping extensions.
                      </p>
                    </div>
                    {/* Connector Arrow for Desktop */}
                    <div className="hidden xl:block absolute -right-3 top-1/2 -translate-y-1/2 z-30 text-teal-400/60 pointer-events-none">
                      <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Step Card 04 */}
                  <div className="relative card-glass border border-brand-border/80 rounded-2xl p-6 flex flex-col justify-between hover:border-brand-mint/50 transition-all group">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-panelSoft text-slate-300 border border-brand-border">
                          04
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint">
                          <svg className="w-5 h-5 text-brand-mint" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.78 2.72 3.23 3.33L10 19v2h4v-2l-.62-2.73c1.45-.61 2.6-1.83 3.23-3.33 2.47-.31 4.39-2.39 4.39-4.94V7c0-1.1-.9-2-2-2z" />
                          </svg>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-white group-hover:text-brand-mint transition-colors">
                        Build Your Squad
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Balance your team and dominate the season. Great managers create great history.
                      </p>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          </section>

          {/* ── Value Proposition & FUT Cards Banner ───────────────── */}
          <section className="pb-24 relative" data-purpose="platform-features-and-fut-cards">
            <div className="max-w-[1440px] mx-auto px-6">
              <div className="card-glass border border-teal-500/40 rounded-3xl p-8 lg:p-10 relative overflow-hidden shadow-[0_0_50px_rgba(0,191,165,0.12)]">
                {/* Corner accent glows */}
                <div className="absolute -top-24 -left-24 w-60 h-60 rounded-full bg-brand-mint/15 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-cyan-400/15 blur-3xl pointer-events-none" />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  
                  {/* Left Title */}
                  <div className="lg:col-span-3 space-y-2">
                    <h3 className="text-xl sm:text-2xl font-black text-white tracking-wider uppercase leading-tight">
                      Engineered For<br />Passionate Fans
                    </h3>
                    <div className="w-10 h-0.5 bg-brand-mint" />
                    <p className="text-xs text-slate-400 font-medium">
                      A modern platform built for true football lovers.
                    </p>
                  </div>

                  {/* Center 3 Technical Highlights */}
                  <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {/* Feature 1 */}
                    <div className="space-y-2">
                      <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" strokeWidth="1.8" />
                          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" strokeWidth="1.8" />
                        </svg>
                      </div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wide">Dynamic Budgets</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">Multiple auction formats and currency settings.</p>
                    </div>

                    {/* Feature 2 */}
                    <div className="space-y-2">
                      <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                        </svg>
                      </div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wide">Advanced Filters</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">Filter by league, position, OVR and more.</p>
                    </div>

                    {/* Feature 3 */}
                    <div className="space-y-2">
                      <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-brand-mint">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                        </svg>
                      </div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wide">Safe &amp; Fair Play</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">Anti sniping, timer controls and secure infrastructure.</p>
                    </div>
                  </div>

                  {/* Right Hand Visual: landing-2nd.png on the extreme right side */}
                  <div className="lg:col-span-4 flex items-center justify-center lg:justify-end w-full">
                    <div className="relative w-full max-w-[420px] rounded-2xl overflow-hidden border border-teal-500/30 shadow-[0_0_35px_rgba(0,242,157,0.18)] group">
                      <img
                        src="/images/landing-2nd.png"
                        alt="Engineered For Passionate Fans - FUT Player Cards"
                        className="w-full h-auto object-cover rounded-2xl transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* ── Interactive "Watch How It Works" Modal ────────────────── */}
      {howItWorksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-notice">
          <div className="relative w-full max-w-2xl rounded-3xl bg-[#06121D] border border-teal-500/40 p-6 sm:p-8 shadow-2xl overflow-hidden">
            {/* Ambient Modal Glow */}
            <div className="absolute -top-20 -right-20 w-52 h-52 bg-brand-mint/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between pb-4 border-b border-brand-border/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-mint/20 border border-brand-mint/40 flex items-center justify-center text-brand-mint">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    How ArenaAuction Works
                  </h3>
                  <p className="text-xs text-slate-400">
                    Real-time multiplayer transfer window in 4 rapid steps
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setHowItWorksOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="p-4 rounded-xl bg-[#0B1E2E] border border-teal-500/20 flex gap-4 items-start">
                <span className="px-2 py-0.5 rounded bg-brand-panelSoft text-brand-mint font-mono font-bold text-xs">
                  01
                </span>
                <div>
                  <h4 className="text-sm font-bold text-white">Create Room & Set Budgets</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Set starting budgets (e.g. ₹100–300 Cr), max roster limits (GK, DEF, MID, ATT), anti-sniping threshold, and timer durations.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0B1E2E] border border-teal-500/20 flex gap-4 items-start">
                <span className="px-2 py-0.5 rounded bg-brand-panelSoft text-brand-mint font-mono font-bold text-xs">
                  02
                </span>
                <div>
                  <h4 className="text-sm font-bold text-white">Assemble Managers & Lobby</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Share your unique 6-character room code. Friends pick club franchises and join the live waiting room.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0B1E2E] border border-teal-500/20 flex gap-4 items-start">
                <span className="px-2 py-0.5 rounded bg-brand-panelSoft text-brand-mint font-mono font-bold text-xs">
                  03
                </span>
                <div>
                  <h4 className="text-sm font-bold text-white">Live Real-Time Bidding & Anti-Sniping</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Every bid synchronizes via low-latency WebSockets. Placing a bid in the final 5 seconds resets the clock, ensuring fair bidding wars.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0B1E2E] border border-teal-500/20 flex gap-4 items-start">
                <span className="px-2 py-0.5 rounded bg-brand-panelSoft text-brand-mint font-mono font-bold text-xs">
                  04
                </span>
                <div>
                  <h4 className="text-sm font-bold text-white">Squad Building & Leaderboard Analytics</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Review your completed starting XI and bench, analyze biggest transfers, and compare manager valuations in post-auction reports.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-brand-border/60 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setHowItWorksOpen(false)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm font-medium hover:bg-white/5 transition-colors cursor-pointer"
              >
                Close
              </button>
              <Link
                href="/create"
                onClick={() => setHowItWorksOpen(false)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-brand-mint text-slate-950 font-bold text-sm tracking-wide shadow-glow-mint hover:bg-brand-mintHover transition-all text-center"
              >
                Create Auction Room
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
