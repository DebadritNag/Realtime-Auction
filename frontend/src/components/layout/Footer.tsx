"use client";

import React from "react";
import Link from "next/link";

export const Footer: React.FC = () => {
  return (
    <footer className="h-auto py-5 bg-[#020B12] border-t border-[rgba(106,144,174,0.18)] px-6 lg:px-12 flex-shrink-0">
      <div className="max-w-[1720px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
        {/* Brand & Description */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-[#00F5A0] flex items-center justify-center text-[#020D15]">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M5 3h14v2H5V3zm2 4h10v2a5 5 0 0 1-4 4.9V17h3v2H8v-2h3v-3.1A5 5 0 0 1 7 9V7z"></path>
              </svg>
            </div>
            <span className="font-extrabold text-sm tracking-tight text-white">
              ARENA<span className="text-[#00F5A0]">AUCTION</span>
            </span>
          </Link>
          <p className="hidden xl:block text-[#6A7F93] max-w-md text-[11px] leading-tight border-l border-[#6A7F93]/30 pl-4">
            The premier real-time multiplayer football auction platform. Experience live bidding, dynamic team building, and intelligent tools for real fans.
          </p>
        </div>

        {/* Footer Navigation Groups */}
        <div className="flex flex-wrap items-center gap-6 sm:gap-10 text-[11px] text-[#7E92A5]">
          {/* Platform Links */}
          <div className="flex items-center space-x-3">
            <span className="font-bold text-white uppercase text-[10px] tracking-wider">PLATFORM:</span>
            <Link className="hover:text-white transition-colors" href="/home">Dashboard</Link>
            <Link className="hover:text-white transition-colors" href="/create">Create Room</Link>
            <Link className="hover:text-white transition-colors" href="/join">Join Room</Link>
            <Link className="hover:text-white transition-colors" href="/results/PREM-2026">Leaderboard</Link>
          </div>

          {/* Support Links */}
          <div className="flex items-center space-x-3">
            <span className="font-bold text-white uppercase text-[10px] tracking-wider">SUPPORT:</span>
            <Link className="hover:text-white transition-colors" href="/profile">Help Center</Link>
            <Link className="hover:text-white transition-colors" href="/home">Community</Link>
            <Link className="hover:text-white transition-colors" href="/profile">Terms of Service</Link>
            <Link className="hover:text-white transition-colors" href="/profile">Privacy Policy</Link>
          </div>

          {/* Social Channels */}
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white uppercase text-[10px] tracking-wider mr-1">FOLLOW US:</span>
            <a aria-label="X/Twitter" className="w-6 h-6 rounded bg-[#0A1724] hover:bg-[#00F5A0]/20 hover:text-[#00F5A0] flex items-center justify-center transition-colors text-white" href="https://x.com" target="_blank" rel="noopener noreferrer">
              <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
              </svg>
            </a>
            <a aria-label="Instagram" className="w-6 h-6 rounded bg-[#0A1724] hover:bg-[#00F5A0]/20 hover:text-[#00F5A0] flex items-center justify-center transition-colors text-white" href="https://instagram.com" target="_blank" rel="noopener noreferrer">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect height="20" rx="5" ry="5" width="20" x="2" y="2"></rect>
                <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01"></path>
              </svg>
            </a>
            <a aria-label="Discord" className="w-6 h-6 rounded bg-[#0A1724] hover:bg-[#00F5A0]/20 hover:text-[#00F5A0] flex items-center justify-center transition-colors text-white" href="https://discord.com" target="_blank" rel="noopener noreferrer">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"></path>
              </svg>
            </a>
            <a aria-label="YouTube" className="w-6 h-6 rounded bg-[#0A1724] hover:bg-[#00F5A0]/20 hover:text-[#00F5A0] flex items-center justify-center transition-colors text-white" href="https://youtube.com" target="_blank" rel="noopener noreferrer">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path>
              </svg>
            </a>
          </div>
        </div>

        {/* Community Tagline Brand Sign-off */}
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-black tracking-wider text-white uppercase">FOOTBALL</span>
          <span className="text-[9px] font-bold tracking-tight text-[#00F5A0] border-b-2 border-[#00F5A0] pb-0.5">
            BRINGS US TOGETHER
          </span>
        </div>
      </div>
    </footer>
  );
};
