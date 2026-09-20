"use client";

import React, { useState } from "react";
import { Player, PotCategory } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { formatCr } from "@/lib/utils";
import { CheckCircle2, PlayCircle, Clock, Search, Layers } from "lucide-react";

export interface PlayerPoolSidebarProps {
  players: Player[];
  activePlayerId?: string;
  currentPot: PotCategory;
}

export const PlayerPoolSidebar: React.FC<PlayerPoolSidebarProps> = ({
  players,
  activePlayerId,
  currentPot,
}) => {
  const [selectedPot, setSelectedPot] = useState<PotCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const potCategories = [{ id: "all", label: "All Pots" }, ...Array.from(new Set(players.map(p => p.pot))).map(id => ({id, label: id}))];

  const filteredPlayers = players.filter((p) => {
    const matchesPot = selectedPot === "all" || p.pot === selectedPot;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.club.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.position.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPot && matchesSearch;
  });

  const soldCount = players.filter((p) => p.status === "sold").length;
  const totalCount = players.length;

  return (
    <div className="auction-pool-panel flex flex-col h-full bg-[#0e121a] rounded-2xl border border-[#242c3d] p-3 text-[#f8fafc] shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#242c3d]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#00ff87]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#f8fafc]">
            POT & PLAYER POOL
          </h3>
        </div>
        <span className="text-[11px] font-mono text-[#00ff87] bg-[#00ff87]/10 px-2 py-0.5 rounded border border-[#00ff87]/20">
          {soldCount} / {totalCount} SOLD
        </span>
      </div>

      {/* Pot Selector Buttons */}
      <div className="flex items-center gap-1 overflow-x-auto py-2.5 scrollbar-none border-b border-[#242c3d]/60">
        {potCategories.map((cat) => (
          <button
            key={cat.id}
            aria-pressed={selectedPot === cat.id}
            onClick={() => setSelectedPot(cat.id)}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md shrink-0 transition-colors select-none ${
              selectedPot === cat.id
                ? "bg-[#00ff87] text-[#08090d] font-bold"
                : "bg-[#151a24] text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#1e2433]"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="relative my-2">
        <input
          type="text"
          aria-label="Filter player pool"
          placeholder="Filter players by name or club..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg bg-[#151a24] border border-[#242c3d] px-8 py-1.5 text-xs text-[#f8fafc] placeholder-[#64748b] outline-none focus:border-[#00ff87]"
        />
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748b]" />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] text-xs hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Players List */}
      <div className="auction-player-list flex-1 overflow-y-auto space-y-1.5 pr-1 mt-1">
        {filteredPlayers.length === 0 ? (
          <p className="text-center text-xs text-[#64748b] py-8">
            No players match this filter.
          </p>
        ) : (
          filteredPlayers.map((player) => {
            const isLive = player.id === activePlayerId || player.status === "live";
            const isSold = player.status === "sold";
            const isUnsold = player.status === "unsold";

            return (
              <div
                key={player.id}
                className={`auction-player-row flex items-center justify-between p-2 rounded-xl border transition-all text-xs ${
                  isLive
                    ? "bg-[#00ff87]/15 border-[#00ff87] shadow-[0_0_15px_rgba(0,255,135,0.15)]"
                    : isSold
                    ? "bg-[#151a24]/60 border-[#242c3d]/40 opacity-75"
                    : isUnsold
                    ? "bg-amber-900/10 border-amber-800/30 opacity-70"
                    : "bg-[#151a24] border-[#242c3d] hover:border-[#37435e]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {isLive ? (
                    <PlayCircle className="w-3.5 h-3.5 text-[#00ff87] animate-pulse shrink-0" />
                  ) : isSold ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  ) : isUnsold ? (
                    <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-amber-500/70">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01" strokeLinecap="round"/>
                      </svg>
                    </span>
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-[#64748b] shrink-0" />
                  )}

                  <div className="flex flex-col truncate">
                    <span
                      className={`font-semibold truncate ${
                        isLive ? "text-[#00ff87] font-bold" : "text-[#f8fafc]"
                      }`}
                    >
                      {player.name}
                    </span>
                    <span className="text-[10px] text-[#64748b] truncate">
                      {player.club} • {player.subPosition || player.position}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <Badge variant="position" position={player.position} size="sm">
                    {player.ovr}
                  </Badge>

                  {isLive && (
                    <span className="bg-[#00ff87] text-[#08090d] font-black text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                      LIVE
                    </span>
                  )}

                  {isSold && (
                    <span className="text-[10px] font-mono font-semibold text-amber-400">
                      {formatCr(player.soldPrice || 0)}
                    </span>
                  )}

                  {isUnsold && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-amber-900/30 text-amber-500/80 border border-amber-700/30">
                      UNSOLD
                    </span>
                  )}

                  {!isLive && !isSold && !isUnsold && (
                    <span className="text-[10px] font-mono text-[#64748b]">
                      {formatCr(player.basePrice)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
