"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/stores/room.store";
import { useAuthStore } from "@/stores/auth.store";
import { RoomSettings } from "@/types";

export default function CreateRoomPage() {
  const router = useRouter();
  const { createRoom, isLoading: storeLoading, error: storeError } = useRoomStore();
  const { user } = useAuthStore();

  const [formData, setFormData] = useState<RoomSettings>({
    auctionName: "Super League Football Auction 2026",
    numberOfTeams: 6,
    startingBudget: 200,
    minSquadSize: 11,
    maxSquadSize: 18,
    playerTimerSeconds: 15,
    antiSnipingEnabled: true,
    antiSnipingThresholdSeconds: 5,
    timerResetDurationSeconds: 6,
    minPlayerBasePrice: 5,
    playerPoolSource: "default",
    filters: {
      minOvr: 84,
      maxOvr: 93,
      gkCount: 6,
      defCount: 16,
      midCount: 20,
      attCount: 18,
    },
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSourceSelect = (source: "default" | "csv" | "custom") => {
    setFormData((prev) => ({ ...prev, playerPoolSource: source }));
    if (source === "csv") {
      setSourceNotice("Custom CSV roster upload ready. Default elite database will be used as baseline.");
    } else if (source === "custom") {
      setSourceNotice("Community pots selected. You can customize player tiers after entering the lobby.");
    } else {
      setSourceNotice(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!formData.auctionName.trim()) {
      setValidationError("Auction Room Name is required.");
      return;
    }
    if (formData.numberOfTeams < 2 || formData.numberOfTeams > 16) {
      setValidationError("Number of teams must be between 2 and 16.");
      return;
    }
    if (formData.startingBudget < 10) {
      setValidationError("Starting budget must be at least ₹10 Cr.");
      return;
    }
    if (formData.minSquadSize > formData.maxSquadSize) {
      setValidationError("Min squad size cannot exceed max squad size.");
      return;
    }
    if (formData.startingBudget < formData.minSquadSize * formData.minPlayerBasePrice) {
      setValidationError(
        `Starting budget (₹${formData.startingBudget} Cr) cannot fund minimum squad (${formData.minSquadSize} × ₹${formData.minPlayerBasePrice} Cr = ₹${
          formData.minSquadSize * formData.minPlayerBasePrice
        } Cr).`
      );
      return;
    }
    if (
      formData.antiSnipingEnabled &&
      formData.timerResetDurationSeconds < formData.antiSnipingThresholdSeconds
    ) {
      setValidationError("Timer extension duration must be greater than or equal to trigger threshold.");
      return;
    }

    try {
      setIsSubmitting(true);
      const roomCode = await createRoom(formData);
      if (roomCode) {
        router.push(`/room/${roomCode}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create room.";
      setValidationError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeLoading = isSubmitting || storeLoading;
  const displayError = validationError || storeError;

  return (
    <div className="flex-1 w-full min-h-[calc(100vh-58px)] grid grid-cols-1 lg:grid-cols-[1.12fr_1fr]">
      {/* LEFT COLUMN: Immersive Football Visual & Value Propositions (Full-bleed from left screen edge to form) */}
      <section className="relative w-full min-h-[620px] lg:min-h-full overflow-hidden flex flex-col justify-between p-6 sm:p-10 lg:pl-12 lg:pr-8 xl:pl-16 xl:pr-10 2xl:pl-20 py-8 xl:py-12">
        {/* Full-bleed Brighter Background Image Layer */}
        <div
          className="absolute inset-0 bg-cover bg-no-repeat pointer-events-none"
          style={{
            backgroundImage: "url('/images/create-room-left.png')",
            backgroundPosition: "center center",
            filter: "brightness(1.22) contrast(1.08)",
          }}
        />

        {/* Controlled Directional Gradient: Darker on left where text lives, translucent on right where stadium & football are */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, rgba(2, 13, 21, 0.72) 0%, rgba(2, 13, 21, 0.48) 42%, rgba(2, 13, 21, 0.16) 72%, rgba(2, 13, 21, 0.04) 100%), linear-gradient(180deg, rgba(2, 13, 21, 0.20) 0%, transparent 45%, rgba(2, 13, 21, 0.65) 100%)",
          }}
        />

        {/* Soft Ambient Neon Glow */}
        <div className="absolute -left-20 top-1/4 w-96 h-96 bg-[#00F5A0]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Left Top / Middle Content Area */}
        <div className="relative z-10 space-y-6 max-w-xl">
          {/* Eyebrow Tag */}
          <div className="inline-flex items-center space-x-2">
            <span className="text-[11px] font-bold tracking-[0.25em] text-[#22BDF6] uppercase">
              CREATE AUCTION ROOM
            </span>
          </div>

          {/* Giant Typography Headline */}
          <h1 className="text-4xl sm:text-5xl xl:text-[54px] font-black uppercase tracking-tight leading-[1.03] text-white drop-shadow-md">
            YOUR LEAGUE.
            <br />
            YOUR RULES.
            <br />
            <span className="text-[#00F5A0] drop-shadow-[0_0_20px_rgba(0,245,160,0.4)]">
              BIGGER GAMES.
            </span>
          </h1>

          {/* Subtitle Paragraph */}
          <p className="text-sm sm:text-base text-[#9EB3C7] font-normal leading-relaxed max-w-lg">
            Set up your auction. Invite your friends. Build your dream squad and create unforgettable football battles.
          </p>

          {/* 4 Key Feature Badges Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            {/* Feature 1 */}
            <div className="flex flex-col space-y-1.5 p-2 rounded-lg bg-[#081725]/40 border border-[#22BDF6]/10 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-md bg-[#00F5A0]/10 border border-[#00F5A0]/30 flex items-center justify-center text-[#00F5A0]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></path>
                </svg>
              </div>
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                CUSTOM BUDGETS
              </span>
              <span className="text-[10px] text-[#7E92A5] leading-tight">
                Set your spending limits
              </span>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col space-y-1.5 p-2 rounded-lg bg-[#081725]/40 border border-[#22BDF6]/10 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-md bg-[#00F5A0]/10 border border-[#00F5A0]/30 flex items-center justify-center text-[#00F5A0]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></path>
                </svg>
              </div>
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                SQUAD CONTROL
              </span>
              <span className="text-[10px] text-[#7E92A5] leading-tight">
                Define team size &amp; roles
              </span>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col space-y-1.5 p-2 rounded-lg bg-[#081725]/40 border border-[#22BDF6]/10 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-md bg-[#00F5A0]/10 border border-[#00F5A0]/30 flex items-center justify-center text-[#00F5A0]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></path>
                </svg>
              </div>
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                ANTI-SNIPING
              </span>
              <span className="text-[10px] text-[#7E92A5] leading-tight">
                Fair and competitive
              </span>
            </div>

            {/* Feature 4 */}
            <div className="flex flex-col space-y-1.5 p-2 rounded-lg bg-[#081725]/40 border border-[#22BDF6]/10 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-md bg-[#00F5A0]/10 border border-[#00F5A0]/30 flex items-center justify-center text-[#00F5A0]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </div>
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                REAL-TIME ACTION
              </span>
              <span className="text-[10px] text-[#7E92A5] leading-tight">
                Keep the game exciting
              </span>
            </div>
          </div>
        </div>

        {/* Left Bottom Slogan & Motivational Quote */}
        <div className="relative z-10 pt-10 flex items-end justify-between">
          {/* Handwritten Script Callout */}
          <div className="transform -rotate-6 select-none">
            <p className="font-script text-3xl sm:text-4xl text-white tracking-wide leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              Bid
              <br />
              Build
              <br />
              <span className="relative inline-block text-white">
                Dominate
                <span className="absolute left-0 bottom-[-4px] w-full h-[4px] bg-[#00F5A0] rounded-full shadow-[0_0_8px_#00F5A0]"></span>
              </span>
            </p>
          </div>

          {/* Locker Tunnel Inscription Quote */}
          <div className="text-right hidden sm:block opacity-35 max-w-[160px]">
            <p className="text-[13px] font-black uppercase tracking-wider text-slate-300 leading-tight">
              GREAT MANAGERS BUILD GREAT STORIES
            </p>
          </div>
        </div>
      </section>

      {/* RIGHT COLUMN: Auction Configuration Form (Directly adjacent to Left Hero) */}
      <section className="w-full p-4 sm:p-6 lg:p-8 xl:p-12 flex flex-col justify-center bg-[#020D15]/85 backdrop-blur-md border-l border-[rgba(95,135,164,0.12)]">
        <form className="space-y-4 max-w-[760px] mx-auto w-full" onSubmit={handleSubmit}>
          {/* Feedback / Alert Notice */}
          {displayError && (
            <div className="rounded-lg bg-red-950/40 border border-red-500/50 p-3 text-xs text-red-200 flex items-center justify-between animate-notice">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{displayError}</span>
              </div>
              <button
                type="button"
                onClick={() => setValidationError(null)}
                className="text-red-400 hover:text-white text-sm font-bold ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {sourceNotice && (
            <div className="rounded-lg bg-cyan-950/40 border border-[#22BDF6]/40 p-2.5 text-xs text-cyan-200 flex items-center justify-between">
              <span>{sourceNotice}</span>
              <button
                type="button"
                onClick={() => setSourceNotice(null)}
                className="text-cyan-400 hover:text-white text-xs font-bold ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* BEGIN: FormCard1 - Identity & Participants */}
          <div className="rounded-xl bg-[#081725] subtle-card-border p-4 sm:p-5 shadow-xl transition-all hover:border-[#7495B2]/40">
            {/* Header with step counter */}
            <div className="flex items-center space-x-3 mb-3.5">
              <span className="w-6 h-6 rounded-md bg-[#00F5A0]/20 text-[#00F5A0] border border-[#00F5A0]/40 flex items-center justify-center text-xs font-bold shadow-[0_0_8px_rgba(0,245,160,0.2)]">
                1
              </span>
              <div>
                <h2 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wide text-white">
                  AUCTION IDENTITY &amp; PARTICIPANTS
                </h2>
                <p className="text-[11px] text-[#7E92A5]">
                  Give your auction a name and set the basic details.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Room Name Input */}
              <div>
                <label
                  htmlFor="auction-room-name"
                  className="block text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1"
                >
                  AUCTION ROOM NAME
                </label>
                <input
                  id="auction-room-name"
                  className="w-full h-10 px-3.5 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#00F5A0] focus:border-[#00F5A0] transition-colors outline-none"
                  type="text"
                  value={formData.auctionName}
                  onChange={(e) =>
                    setFormData({ ...formData, auctionName: e.target.value })
                  }
                  required
                />
              </div>

              {/* Teams & Budget Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Number of Teams */}
                <div>
                  <label
                    htmlFor="number-of-teams"
                    className="block text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1"
                  >
                    NUMBER OF TEAMS (2 – 16)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-[#7E92A5] pointer-events-none">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </span>
                    <input
                      id="number-of-teams"
                      className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#00F5A0] focus:border-[#00F5A0] outline-none"
                      max={16}
                      min={2}
                      type="number"
                      value={formData.numberOfTeams}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          numberOfTeams: parseInt(e.target.value) || 2,
                        })
                      }
                      required
                    />
                  </div>
                </div>

                {/* Starting Budget */}
                <div>
                  <label
                    htmlFor="starting-budget"
                    className="block text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1"
                  >
                    STARTING BUDGET / PURSE (IN ₹ CR)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-[#7E92A5] pointer-events-none">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </span>
                    <input
                      id="starting-budget"
                      className="w-full h-10 pl-9 pr-14 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#00F5A0] focus:border-[#00F5A0] outline-none"
                      type="number"
                      min={10}
                      value={formData.startingBudget}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          startingBudget: parseInt(e.target.value) || 0,
                        })
                      }
                      required
                    />
                    <span className="absolute right-3 text-xs font-semibold text-[#7E92A5] pointer-events-none">
                      ₹ CR
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* END: FormCard1 */}

          {/* BEGIN: FormCard2 - Squad Quotas & Bid Timer */}
          <div className="rounded-xl bg-[#081725] subtle-card-border p-4 sm:p-5 shadow-xl transition-all hover:border-[#7495B2]/40">
            {/* Header with step counter */}
            <div className="flex items-center space-x-3 mb-3.5">
              <span className="w-6 h-6 rounded-md bg-[#22BDF6]/20 text-[#22BDF6] border border-[#22BDF6]/40 flex items-center justify-center text-xs font-bold shadow-[0_0_8px_rgba(34,189,246,0.2)]">
                2
              </span>
              <div>
                <h2 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wide text-white">
                  SQUAD QUOTAS &amp; BID TIMER
                </h2>
                <p className="text-[11px] text-[#7E92A5]">
                  Define squad size, timer settings and base price.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* 3 Columns: Min, Max, Timer */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="min-squad-size"
                    className="block text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1 truncate"
                  >
                    MIN SQUAD SIZE
                  </label>
                  <input
                    id="min-squad-size"
                    className="w-full h-10 px-3 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#22BDF6] focus:border-[#22BDF6] outline-none"
                    type="number"
                    min={1}
                    max={50}
                    value={formData.minSquadSize}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minSquadSize: parseInt(e.target.value) || 1,
                      })
                    }
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="max-squad-size"
                    className="block text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1 truncate"
                  >
                    MAX SQUAD SIZE
                  </label>
                  <input
                    id="max-squad-size"
                    className="w-full h-10 px-3 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#22BDF6] focus:border-[#22BDF6] outline-none"
                    type="number"
                    min={formData.minSquadSize}
                    max={50}
                    value={formData.maxSquadSize}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxSquadSize: parseInt(e.target.value) || 1,
                      })
                    }
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="player-timer"
                    className="block text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1 truncate"
                  >
                    PLAYER TIMER (SECONDS)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="player-timer"
                      className="w-full h-10 pl-3 pr-11 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#22BDF6] focus:border-[#22BDF6] outline-none"
                      type="number"
                      min={5}
                      max={120}
                      value={formData.playerTimerSeconds}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          playerTimerSeconds: parseInt(e.target.value) || 15,
                        })
                      }
                      required
                    />
                    <span className="absolute right-2.5 text-[10px] font-bold text-[#7E92A5] pointer-events-none">
                      SEC
                    </span>
                  </div>
                </div>
              </div>

              {/* Anti-Sniping Feature Banner */}
              <div className="rounded-lg bg-[#09222c]/50 border border-[#00F5A0]/25 p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded bg-[#00F5A0]/15 flex items-center justify-center text-[#00F5A0] shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      ></path>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white tracking-wide">
                      Fair Play Anti-Sniping Protection
                    </h3>
                    <p className="text-[10.5px] text-[#8CA0B3]">
                      Automatically extends the gavel countdown if a bid is placed in the final seconds.
                    </p>
                  </div>
                </div>

                {/* Switch Toggle */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2" aria-label="Toggle Fair Play Anti-Sniping Protection">
                  <input
                    type="checkbox"
                    checked={formData.antiSnipingEnabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        antiSnipingEnabled: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-[#0B1E2E] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00F5A0] shadow-[0_0_10px_rgba(0,245,160,0.5)]"></div>
                </label>
              </div>

              {/* 3 Columns Sub-settings: Trigger, Reset, Base Price */}
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className={formData.antiSnipingEnabled ? "" : "opacity-40 transition-opacity"}>
                  <label
                    htmlFor="trigger-threshold"
                    className="block text-[9.5px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1 truncate"
                  >
                    TRIGGER THRESHOLD (SECONDS)
                  </label>
                  <input
                    id="trigger-threshold"
                    className="w-full h-10 px-3 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#22BDF6] outline-none disabled:cursor-not-allowed"
                    type="number"
                    min={1}
                    max={30}
                    disabled={!formData.antiSnipingEnabled}
                    value={formData.antiSnipingThresholdSeconds}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        antiSnipingThresholdSeconds: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                  <p className="text-[9px] text-[#697E91] mt-1 leading-snug">
                    Triggers extension when remaining time drops below this
                  </p>
                </div>

                <div className={formData.antiSnipingEnabled ? "" : "opacity-40 transition-opacity"}>
                  <label
                    htmlFor="timer-reset"
                    className="block text-[9.5px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1 truncate"
                  >
                    TIMER RESET / EXTENSION (SECONDS)
                  </label>
                  <input
                    id="timer-reset"
                    className="w-full h-10 px-3 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#22BDF6] outline-none disabled:cursor-not-allowed"
                    type="number"
                    min={formData.antiSnipingThresholdSeconds}
                    max={60}
                    disabled={!formData.antiSnipingEnabled}
                    value={formData.timerResetDurationSeconds}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        timerResetDurationSeconds: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                  <p className="text-[9px] text-[#697E91] mt-1 leading-snug">
                    Duration added when late bid arrives
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="min-base-price"
                    className="block text-[9.5px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1 truncate"
                  >
                    MIN PLAYER BASE PRICE (₹ CR)
                  </label>
                  <input
                    id="min-base-price"
                    className="w-full h-10 px-3 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#22BDF6] outline-none"
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={formData.minPlayerBasePrice}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minPlayerBasePrice: parseFloat(e.target.value) || 0.5,
                      })
                    }
                  />
                  <p className="text-[9px] text-[#697E91] mt-1 leading-snug">
                    Floor opening bid for unrated players
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* END: FormCard2 */}

          {/* BEGIN: FormCard3 - Player Database Source */}
          <div className="rounded-xl bg-[#081725] subtle-card-border p-4 sm:p-5 shadow-xl transition-all hover:border-[#7495B2]/40">
            {/* Header with step counter */}
            <div className="flex items-center space-x-3 mb-3.5">
              <span className="w-6 h-6 rounded-md bg-[#F3B928]/20 text-[#F3B928] border border-[#F3B928]/40 flex items-center justify-center text-xs font-bold shadow-[0_0_8px_rgba(243,185,40,0.2)]">
                3
              </span>
              <div>
                <h2 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wide text-white">
                  PLAYER DATABASE SOURCE
                </h2>
                <p className="text-[11px] text-[#7E92A5]">
                  Choose how you want to add players to your auction.
                </p>
              </div>
            </div>

            {/* 3 Selectable Option Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option 1: Default Database */}
              <div
                onClick={() => handleSourceSelect("default")}
                className={`rounded-lg p-3 relative cursor-pointer group flex flex-col justify-between transition-all ${
                  formData.playerPoolSource === "default"
                    ? "active-db-card shadow-[0_0_12px_rgba(0,245,160,0.15)]"
                    : "bg-[#0A1724]/70 border border-[#7495B2]/25 hover:border-[#00F5A0]/60"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="w-7 h-7 rounded bg-[#00F5A0]/15 flex items-center justify-center text-[#00F5A0] mb-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </div>
                    {formData.playerPoolSource === "default" && (
                      <span className="w-4 h-4 rounded-full bg-[#00F5A0] flex items-center justify-center text-[#020D15]">
                        <svg className="w-3 h-3 stroke-current stroke-[3]" fill="none" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"></path>
                        </svg>
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-white mb-0.5">Default Database</h4>
                  <p className="text-[10px] text-[#8EA3B5] leading-tight">
                    Curated European &amp; World elite players with full stats
                  </p>
                </div>
              </div>

              {/* Option 2: Upload CSV */}
              <div
                onClick={() => handleSourceSelect("csv")}
                className={`rounded-lg p-3 relative cursor-pointer group flex flex-col justify-between transition-all ${
                  formData.playerPoolSource === "csv"
                    ? "border-[1.5px] border-[#22BDF6] bg-[linear-gradient(180deg,rgba(34,189,246,0.12)_0%,rgba(9,24,37,0.95)_100%)] shadow-[0_0_12px_rgba(34,189,246,0.2)]"
                    : "bg-[#0A1724]/70 border border-[#7495B2]/25 hover:border-[#22BDF6]/60"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="w-7 h-7 rounded bg-[#22BDF6]/15 flex items-center justify-center text-[#22BDF6] mb-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </div>
                    {formData.playerPoolSource === "csv" && (
                      <span className="w-4 h-4 rounded-full bg-[#22BDF6] flex items-center justify-center text-[#020D15]">
                        <svg className="w-3 h-3 stroke-current stroke-[3]" fill="none" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"></path>
                        </svg>
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-white mb-0.5">Upload CSV</h4>
                  <p className="text-[10px] text-[#7E92A5] leading-tight">
                    Import custom player roster (Name, OVR, POS, Base)
                  </p>
                </div>
              </div>

              {/* Option 3: Custom Player List */}
              <div
                onClick={() => handleSourceSelect("custom")}
                className={`rounded-lg p-3 relative cursor-pointer group flex flex-col justify-between transition-all ${
                  formData.playerPoolSource === "custom"
                    ? "border-[1.5px] border-[#F3B928] bg-[linear-gradient(180deg,rgba(243,185,40,0.12)_0%,rgba(9,24,37,0.95)_100%)] shadow-[0_0_12px_rgba(243,185,40,0.2)]"
                    : "bg-[#0A1724]/70 border border-[#7495B2]/25 hover:border-[#F3B928]/60"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="w-7 h-7 rounded bg-[#F3B928]/15 flex items-center justify-center text-[#F3B928] mb-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          d="M4 6h16M4 10h16M4 14h16M4 18h16"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </div>
                    {formData.playerPoolSource === "custom" && (
                      <span className="w-4 h-4 rounded-full bg-[#F3B928] flex items-center justify-center text-[#020D15]">
                        <svg className="w-3 h-3 stroke-current stroke-[3]" fill="none" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"></path>
                        </svg>
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-white mb-0.5">Custom Player List</h4>
                  <p className="text-[10px] text-[#7E92A5] leading-tight">
                    Select specific pots from community rosters
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* END: FormCard3 */}

          {/* BEGIN: ActionButton */}
          <div className="pt-1">
            <button
              className="w-full h-12 rounded-lg bg-gradient-to-r from-[#00F59B] via-[#00DDA8] to-[#11C89F] hover:brightness-110 active:scale-[0.99] text-[#00150F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-center space-x-2 transition-all glow-neon disabled:opacity-75 disabled:cursor-not-allowed"
              type="submit"
              disabled={activeLoading}
            >
              {activeLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#00150F]"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    ></path>
                  </svg>
                  <span>CREATING ROOM &amp; ENTERING LOBBY...</span>
                </>
              ) : (
                <>
                  <span>CREATE ROOM &amp; ENTER LOBBY</span>
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M13 2L3 14h7v8l10-12h-7z"></path>
                  </svg>
                </>
              )}
            </button>
          </div>
          {/* END: ActionButton */}
        </form>
      </section>
    </div>
  );
}
