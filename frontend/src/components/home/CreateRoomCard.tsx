"use client";

import React from "react";
import Link from "next/link";

export const CreateRoomCard: React.FC = () => {
  return (
    <div className="h-full min-h-[310px] sm:min-h-[320px] rounded-2xl border border-[#00F59B]/30 bg-[#06151f] p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between glow-emerald group transition-all hover:border-[#00F59B]/50">
      {/* Full Card Background Image: Create Auction Rooms.png with enhanced brightness & clarity */}
      <div
        className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-700 group-hover:scale-105 pointer-events-none brightness-115 contrast-108"
        style={{
          backgroundImage: "url('/images/Create%20Auction%20Rooms.png')",
          backgroundPosition: "center right",
        }}
      />

      {/* Lighter Directional Gradient Overlay: allows the tactical-board / stadium artwork to shine through clearly while keeping text crisp */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(6, 21, 31, 0.82) 0%, rgba(6, 21, 31, 0.68) 45%, rgba(6, 21, 31, 0.25) 75%, rgba(6, 21, 31, 0.05) 100%)",
        }}
      />

      {/* Content Area on Top */}
      <div className="relative z-10">
        {/* Card Header with Plus Icon */}
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 rounded-xl bg-[#082823]/90 border border-[#00F59B]/50 flex items-center justify-center text-[#00F59B] shadow-[0_0_15px_rgba(0,245,155,0.2)] shrink-0 transition-transform group-hover:scale-105 backdrop-blur-sm">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path d="M12 4v16m8-8H4"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-[21px] font-extrabold text-white drop-shadow-md">
              Create Auction Room
            </h3>
            <p className="text-[13px] text-[#A6BACD] mt-1 max-w-lg leading-relaxed">
              Start a new multiplayer football auction. Customize every detail and create your perfect competition.
            </p>
          </div>
        </div>

        {/* Feature Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
          <div className="flex items-center space-x-2 bg-[#091e2b]/90 backdrop-blur-sm border border-[#16364b] px-3 py-2 rounded-lg text-[11.5px] text-[#B0C4D5] shadow-md">
            <svg
              className="w-4 h-4 text-[#00F59B] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
            <span className="font-semibold truncate">Custom Budgets</span>
          </div>

          <div className="flex items-center space-x-2 bg-[#091e2b]/90 backdrop-blur-sm border border-[#16364b] px-3 py-2 rounded-lg text-[11.5px] text-[#B0C4D5] shadow-md">
            <svg
              className="w-4 h-4 text-[#00F59B] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
            <span className="font-semibold truncate">Squad Limits</span>
          </div>

          <div className="flex items-center space-x-2 bg-[#091e2b]/90 backdrop-blur-sm border border-[#16364b] px-3 py-2 rounded-lg text-[11.5px] text-[#B0C4D5] shadow-md">
            <svg
              className="w-4 h-4 text-[#00F59B] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
            <span className="font-semibold truncate">Anti-Sniping</span>
          </div>

          <div className="flex items-center space-x-2 bg-[#091e2b]/90 backdrop-blur-sm border border-[#16364b] px-3 py-2 rounded-lg text-[11.5px] text-[#B0C4D5] shadow-md">
            <svg
              className="w-4 h-4 text-[#00F59B] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
            <span className="font-semibold truncate">Timer Control</span>
          </div>
        </div>
      </div>

      {/* Action Row */}
      <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-6 pt-4 border-t border-[#0e2738]/80">
        <Link
          href="/create"
          className="h-11 px-6 rounded-lg bg-[#00F59B] hover:bg-[#00df8c] text-black font-extrabold text-[13.5px] inline-flex items-center justify-center space-x-2 transition shadow-[0_0_15px_rgba(0,245,155,0.3)] transform hover:scale-[1.01]"
        >
          <span>Create New Auction Room</span>
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"></path>
          </svg>
        </Link>
        <div className="flex items-center space-x-1.5 text-[11.5px] text-[#A6BACD]">
          <span>Set up your rules. Invite your league. Let the bidding begin!</span>
          <svg
            className="w-3.5 h-3.5 text-[#00F59B] shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
          </svg>
        </div>
      </div>
    </div>
  );
};
