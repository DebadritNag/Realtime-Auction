"use client";

import React from "react";
import Link from "next/link";
import { User } from "@/types";

export interface HeroSectionProps {
  user: User;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ user }) => {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch min-h-[290px]">
      {/* Welcome Callout & USPs (Left Col ~ 48%) */}
      <div className="col-span-12 lg:col-span-6 flex flex-col justify-between py-2">
        <div>
          <span className="text-[10.5px] tracking-[0.22em] font-bold text-[#7E96AD] uppercase">
            Fantasy Football. Real Competition.
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-[42px] leading-[1.08] font-black tracking-tight mt-1.5 text-white uppercase">
            Welcome Back,
            <br />
            <span className="text-[#00F59B]">{user.displayName || "Manager"}</span>
          </h1>
          <p className="text-[13.5px] text-[#A6BACD] mt-2.5 font-normal leading-relaxed max-w-xl">
            Manage auctions. Build winning squads. Outsmart your rivals. Football is better live.
          </p>
        </div>

        {/* Four Key Pillars Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 border-t border-[#122535] mt-5 lg:mt-0">
          {/* Pillar 1 */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00F59B]/10 flex items-center justify-center text-[#00F59B] shrink-0">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  clipRule="evenodd"
                  d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                  fillRule="evenodd"
                ></path>
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-tight text-white uppercase leading-tight">
                Real-Time Auctions
              </p>
              <p className="text-[9.5px] text-[#7F94A7] leading-tight">Fast. Fair. Exciting.</p>
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00F59B]/10 flex items-center justify-center text-[#00F59B] shrink-0">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 16v-1a4 4 0 00-2-3.465 4 4 0 012 4.465zM4 16v-1a4 4 0 012-3.465A4 4 0 004 16z"></path>
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-tight text-white uppercase leading-tight">
                Tactical Squads
              </p>
              <p className="text-[9.5px] text-[#7F94A7] leading-tight">Build without limits.</p>
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00F59B]/10 flex items-center justify-center text-[#00F59B] shrink-0">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"></path>
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-tight text-white uppercase leading-tight">
                Compete Anywhere
              </p>
              <p className="text-[9.5px] text-[#7F94A7] leading-tight">With your community.</p>
            </div>
          </div>

          {/* Pillar 4 */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00F59B]/10 flex items-center justify-center text-[#00F59B] shrink-0">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  clipRule="evenodd"
                  d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z"
                  fillRule="evenodd"
                ></path>
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-tight text-white uppercase leading-tight">
                A Higher Level
              </p>
              <p className="text-[9.5px] text-[#7F94A7] leading-tight">Strategy meets passion.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Live Auction Hero Card (Right Col ~ 52%) - Full Background Image with Brighter Artwork & High-Contrast Text */}
      <div className="col-span-12 lg:col-span-6 rounded-2xl border border-[#00F59B]/40 bg-[#041924] relative overflow-hidden flex flex-col justify-between shadow-[0_0_30px_rgba(0,245,155,0.08)] min-h-[290px] p-6 sm:p-7 group">
        {/* Full Card Background Image: Prem-2026.png with enhanced brightness & clarity */}
        <div
          className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-700 group-hover:scale-105 pointer-events-none brightness-110 contrast-105"
          style={{
            backgroundImage: "url('/images/Prem-2026.png')",
            backgroundPosition: "center right",
          }}
        />

        {/* Lighter Directional Gradient Overlay: left side ensures text readability, right side allows stadium artwork to be bright & visible */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, rgba(2, 10, 18, 0.82) 0%, rgba(2, 18, 27, 0.65) 40%, rgba(2, 18, 27, 0.20) 72%, rgba(2, 18, 27, 0.04) 100%)",
          }}
        />

        {/* Existing Content on Top */}
        <div className="relative z-10 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F59B] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00F59B]"></span>
                </span>
                <span className="text-[11px] font-bold tracking-wider text-[#00F59B] uppercase">
                  Live Auction
                </span>
              </div>
              <span className="text-[11.5px] text-[#7A91A5] font-semibold">Season 2026</span>
            </div>

            <h2 className="text-2xl sm:text-[28px] font-black tracking-tight text-white mt-3 leading-tight drop-shadow-md">
              PREM-2026 Derby
            </h2>

            {/* Chips */}
            <div className="flex flex-wrap items-center gap-2 mt-4 text-[11.5px] text-[#A6BAD0]">
              <span className="flex items-center space-x-1.5 bg-[#092230]/90 backdrop-blur-sm border border-[#14354b] px-3 py-1.5 rounded-full shadow-md">
                <svg className="w-3.5 h-3.5 text-[#00F59B]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"></path>
                </svg>
                <span>8 / 14 Managers</span>
              </span>
              <span className="flex items-center space-x-1.5 bg-[#092230]/90 backdrop-blur-sm border border-[#14354b] px-3 py-1.5 rounded-full shadow-md">
                <svg className="w-3.5 h-3.5 text-[#00F59B]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 6v6l4 2"></path>
                </svg>
                <span>Auction Live</span>
              </span>
              <Link
                href="/room/PREM-2026"
                className="flex items-center space-x-1.5 bg-[#092230]/90 hover:bg-[#0d2e42] backdrop-blur-sm border border-[#14354b] px-3 py-1.5 rounded-full transition-colors shadow-md"
              >
                <svg className="w-3.5 h-3.5 text-[#00F59B]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
                </svg>
                <span>Lobby Open</span>
              </Link>
            </div>
          </div>

          {/* Enter Auction Button */}
          <Link
            href="/auction/PREM-2026"
            className="mt-6 inline-flex items-center justify-center space-x-2.5 w-full max-w-[320px] h-11 rounded-lg bg-[#00F59B] hover:bg-[#02e08e] text-black font-extrabold text-[13.5px] tracking-wide transition transform hover:scale-[1.01] shadow-[0_0_20px_rgba(0,245,155,0.4)]"
          >
            <span>Enter Auction</span>
            <svg
              className="w-4 h-4 text-black font-black"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
};
