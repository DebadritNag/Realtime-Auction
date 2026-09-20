"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PlayerAuctionCard } from "@/components/auction/PlayerAuctionCard";
import { MOCK_PLAYERS } from "@/services/mock/mockData";
import {
  Zap,
  Shield,
  Coins,
  Bot,
  Trophy,
  Users,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronRight,
} from "lucide-react";

export default function LandingPage() {
  const showcasePlayer = MOCK_PLAYERS[0]; // Mbappe 92 ATT

  const steps = [
    {
      step: "01",
      title: "Create a Room",
      desc: "Configure starting purse, squad size limits, anti-sniping protection, and player filters in seconds.",
      icon: <Layers className="w-5 h-5 text-[#00ff87]" />,
    },
    {
      step: "02",
      title: "Invite Your Friends",
      desc: "Share your unique room code. Managers select team franchises and assemble in the live waiting lobby.",
      icon: <Users className="w-5 h-5 text-[#38bdf8]" />,
    },
    {
      step: "03",
      title: "Bid in Real Time",
      desc: "Compete head-to-head on the auction block with millisecond timer sync and anti-sniping time extensions.",
      icon: <Zap className="w-5 h-5 text-amber-400" />,
    },
    {
      step: "04",
      title: "Build Your Squad",
      desc: "Balance position quotas for GK, DEF, MID, and ATT while preserving purse depth for elite transfer targets.",
      icon: <Trophy className="w-5 h-5 text-emerald-400" />,
    },
  ];

  const features = [
    {
      title: "Real-Time Bidding",
      desc: "Native low-latency WebSockets keep bids, clock offsets, and competing offers synchronised without page refreshes.",
      icon: <Zap className="w-6 h-6 text-[#00ff87]" />,
    },
    {
      title: "Custom Auction Rooms",
      desc: "Host private leagues with customizable budgets (₹100–300 Cr), position limits, timer durations, and player pools.",
      icon: <Shield className="w-6 h-6 text-[#38bdf8]" />,
    },
    {
      title: "Dynamic Budgets",
      desc: "Live top purse ticker tracks each franchise's liquidity, spent capital, and squad composition in real time.",
      icon: <Coins className="w-6 h-6 text-amber-400" />,
    },
    {
      title: "Tactical Squad Management",
      desc: "Automatic roster validation ensures every manager fills positional quotas across goalkeepers, defenders, and forwards.",
      icon: <Users className="w-6 h-6 text-purple-400" />,
    },
    {
      title: "AI Auction Insights",
      desc: "Server-calculated recommendations provide prudent bid ranges, tactical valuations, and roster risk assessments.",
      icon: <Bot className="w-6 h-6 text-[#00ff87]" />,
    },
    {
      title: "Post-Auction Analytics",
      desc: "Comprehensive analytics reveal biggest spenders, longest bidding wars, complete transfer ledgers, and team squads.",
      icon: <Trophy className="w-6 h-6 text-rose-400" />,
    },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Stadium Pitch Glow in Hero Background */}
      <div className="absolute top-0 inset-x-0 h-[650px] pitch-radial-grid pointer-events-none" />

      {/* Hero Section */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Hero Copy */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00ff87]/10 border border-[#00ff87]/30 text-xs font-bold text-[#00ff87]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>THE PREMIER MULTIPLAYER FOOTBALL AUCTION ENGINE</span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black uppercase tracking-tight text-[#f8fafc] leading-[1.05]">
              BUILD YOUR <span className="text-[#00ff87]">DREAM SQUAD.</span>
              <br />
              OUTBID YOUR <span className="text-white">FRIENDS.</span>
            </h1>

            <p className="text-sm sm:text-base text-[#94a3b8] max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Run competitive real-time football auctions with live bidding, squad tracking, dynamic budgets, and intelligent live auction insights.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <Link href="/auth/signup" className="w-full sm:w-auto">
                <Button
                  variant="stadium"
                  size="xl"
                  className="w-full sm:w-auto px-8"
                  rightIcon={<ArrowRight className="w-5 h-5" />}
                >
                  CREATE ACCOUNT
                </Button>
              </Link>

              <Link href="/auth/signin" className="w-full sm:w-auto">
                <Button variant="secondary" size="xl" className="w-full sm:w-auto px-8">
                  SIGN IN
                </Button>
              </Link>
            </div>

            {/* Live Stats Pill */}
            <div className="flex items-center justify-center lg:justify-start gap-6 pt-4 text-xs text-[#64748b] border-t border-[#242c3d]/60 font-mono">
              <div>
                <strong className="text-[#f8fafc] block text-sm">6-16 TEAMS</strong>
                <span>Private Auction Rooms</span>
              </div>
              <div>
                <strong className="text-[#00ff87] block text-sm">50ms SYNC</strong>
                <span>WebSocket Engine</span>
              </div>
              <div>
                <strong className="text-amber-400 block text-sm">100% FAIR</strong>
                <span>Anti-Sniping Gavel</span>
              </div>
            </div>
          </div>

          {/* Hero Visual: Original Football Player Card & Live Auction Mockup */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
            <div className="w-full max-w-sm">
              <PlayerAuctionCard player={showcasePlayer} />
              
              {/* Floating Mini Bid Badge */}
              <div className="mt-4 p-3 rounded-2xl bg-[#0e121a]/95 border border-[#00ff87]/40 backdrop-blur-md shadow-2xl flex items-center justify-between animate-notice">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🐅</span>
                  <div>
                    <span className="text-[10px] text-[#64748b] block font-bold">LATEST BID</span>
                    <span className="text-xs font-bold text-[#f8fafc]">Baghbazar Tigers</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#00ff87] font-bold block">CURRENT HAMMER</span>
                  <span className="text-base font-black font-mono text-[#00ff87]">₹38.0 Cr</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative border-t border-[#242c3d] bg-[#0c0e14] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#00ff87] bg-[#00ff87]/15 px-3 py-1 rounded-full border border-[#00ff87]/30">
              STEP-BY-STEP WORKFLOW
            </span>
            <h2 className="text-3xl sm:text-4xl font-black uppercase text-[#f8fafc] tracking-tight mt-3">
              HOW THE AUCTION RUNS
            </h2>
            <p className="text-xs sm:text-sm text-[#94a3b8] mt-2">
              From room creation to hoisting the championship trophy, experience a complete live multiplayer auction lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s) => (
              <div
                key={s.step}
                className="rounded-2xl bg-[#151a24] border border-[#242c3d] p-6 shadow-lg relative group hover:border-[#00ff87]/50 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl font-black font-mono text-[#2b354c] group-hover:text-[#00ff87] transition-colors">
                    {s.step}
                  </span>
                  <div className="p-2 rounded-xl bg-[#0e121a] border border-[#242c3d]">
                    {s.icon}
                  </div>
                </div>
                <h3 className="text-base font-bold text-[#f8fafc] mb-2">{s.title}</h3>
                <p className="text-xs text-[#94a3b8] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative border-t border-[#242c3d] bg-[#08090d] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[10px] font-black uppercase tracking-widest text-sky-400 bg-sky-500/15 px-3 py-1 rounded-full border border-sky-500/30">
              ENGINEERED FOR PASSIONATE FANS
            </span>
            <h2 className="text-3xl sm:text-4xl font-black uppercase text-[#f8fafc] tracking-tight mt-3">
              LIVE SPORTS ENTERTAINMENT SUITE
            </h2>
            <p className="text-xs sm:text-sm text-[#94a3b8] mt-2">
              Built with modern sports-gaming aesthetics and strict client-server boundaries for authentic, tamper-free competition.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div
                key={i}
                className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-6 shadow-lg hover:border-[#37435e] hover:bg-[#121622] transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-[#151a24] border border-[#242c3d] flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-bold text-[#f8fafc] mb-2">{f.title}</h3>
                <p className="text-xs text-[#94a3b8] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative border-t border-[#242c3d] bg-gradient-to-b from-[#0e121a] to-[#08090d] py-24 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-6">
          <h2 className="text-3xl sm:text-5xl font-black uppercase text-[#f8fafc] tracking-tight">
            READY TO BUILD YOUR SQUAD?
          </h2>
          <p className="text-xs sm:text-sm text-[#94a3b8] max-w-lg mx-auto">
            Sign up now, create your private room, invite friends, and feel the adrenaline of a live football auction room.
          </p>
          <div className="pt-2">
            <Link href="/auth/signup">
              <Button
                variant="stadium"
                size="xl"
                className="px-10 py-4 text-base"
                rightIcon={<ChevronRight className="w-5 h-5" />}
              >
                CREATE ACCOUNT
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
