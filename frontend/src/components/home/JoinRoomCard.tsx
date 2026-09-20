"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export const JoinRoomCard: React.FC = () => {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();
    if (cleanCode) {
      router.push(`/join?code=${encodeURIComponent(cleanCode)}`);
    } else {
      router.push("/join");
    }
  };

  return (
    <div className="h-full min-h-[310px] sm:min-h-[320px] rounded-2xl border border-cyan-400/40 bg-[#061623] p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between glow-cyan group transition-all hover:border-cyan-400/60">
      {/* Full Card Background Image: Join Auction Rooms.png with enhanced brightness & clarity */}
      <div
        className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-700 group-hover:scale-105 pointer-events-none brightness-110 contrast-105"
        style={{
          backgroundImage: "url('/images/Join%20Auction%20Rooms.png')",
          backgroundPosition: "center right",
        }}
      />

      {/* Lighter Directional Overlay: text/input stays readable while stadium/tunnel illumination shines through */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(2, 18, 27, 0.82) 0%, rgba(2, 18, 27, 0.65) 45%, rgba(2, 18, 27, 0.22) 75%, rgba(2, 18, 27, 0.05) 100%)",
        }}
      />

      {/* Content Area on Top across the card */}
      <div className="relative z-10 flex flex-col justify-between h-full">
        <div>
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-xl bg-[#092c3a]/90 border border-cyan-400/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(0,200,255,0.2)] shrink-0 transition-transform group-hover:scale-105 backdrop-blur-sm">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                viewBox="0 0 24 24"
              >
                <path d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-[21px] font-extrabold text-white drop-shadow-md">
                Join Auction Room
              </h3>
              <p className="text-[13px] text-[#A6BACD] mt-1 leading-relaxed max-w-md">
                Enter an invite code provided by your league host to join the waiting room and claim your manager franchise.
              </p>
            </div>
          </div>

          {/* Code Input Box */}
          <form
            onSubmit={handleJoin}
            className="mt-5 max-w-md flex rounded-lg bg-[#030d14]/90 backdrop-blur-sm border border-[#15384e] focus-within:border-cyan-400 transition-colors overflow-hidden shadow-lg"
          >
            <div className="w-11 bg-[#081f2f] border-r border-[#15384e] flex items-center justify-center text-cyan-400 font-bold text-base select-none">
              #
            </div>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full bg-transparent px-4 py-2.5 text-[14px] text-white placeholder-[#516b80] focus:outline-none focus:ring-0 border-none font-mono uppercase tracking-wider"
              placeholder="E.g. PREM-2026"
              type="text"
            />
          </form>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={handleJoin}
          className="mt-6 w-full max-w-[320px] h-11 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-extrabold text-[13.5px] flex items-center justify-center space-x-2 transition shadow-[0_0_15px_rgba(0,200,255,0.3)] transform hover:scale-[1.01] cursor-pointer"
        >
          <span>Join Auction Room</span>
          <svg
            className="w-4 h-4 font-black"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};
