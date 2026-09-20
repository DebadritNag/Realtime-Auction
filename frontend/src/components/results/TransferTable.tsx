"use client";

import React, { useState } from "react";
import { Player } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { formatCr } from "@/lib/utils";
import { Search } from "lucide-react";

export interface TransferRecord {
  player: Player;
  teamName: string;
  price: number;
  timestamp: number;
}

export interface TransferTableProps {
  transfers: TransferRecord[];
}

export const TransferTable: React.FC<TransferTableProps> = ({ transfers }) => {
  const [query, setQuery] = useState("");

  const filtered = transfers.filter(
    (t) =>
      t.player.name.toLowerCase().includes(query.toLowerCase()) ||
      t.teamName.toLowerCase().includes(query.toLowerCase()) ||
      t.player.club.toLowerCase().includes(query.toLowerCase()) ||
      t.player.position.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <input
            type="text"
            placeholder="Search transfers by player, team, or club..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl bg-[#0e121a] border border-[#242c3d] px-8 py-2 text-xs text-[#f8fafc] placeholder-[#64748b] outline-none focus:border-[#00ff87]"
          />
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748b]" />
        </div>

        <span className="text-xs font-mono text-[#64748b]">
          {filtered.length} Transfers
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-[#0e121a] border border-[#242c3d] shadow-lg">
        <table className="w-full text-left text-xs text-[#cbd5e1]">
          <thead className="bg-[#151a24] text-[10px] uppercase font-bold text-[#64748b] border-b border-[#242c3d]">
            <tr>
              <th className="px-4 py-3.5">Player</th>
              <th className="px-4 py-3.5">Pos</th>
              <th className="px-4 py-3.5">OVR</th>
              <th className="px-4 py-3.5">Club</th>
              <th className="px-4 py-3.5">Acquired By</th>
              <th className="px-4 py-3.5 text-right">Transfer Fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#242c3d]/60">
            {filtered.map((t, idx) => (
              <tr key={idx} className="hover:bg-[#151a24]/50 transition-colors">
                <td className="px-4 py-3 font-bold text-[#f8fafc]">
                  {t.player.name}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="position" position={t.player.position} size="sm">
                    {t.player.subPosition || t.player.position}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono font-bold text-[#00ff87]">
                  {t.player.ovr}
                </td>
                <td className="px-4 py-3 text-[#94a3b8]">{t.player.club}</td>
                <td className="px-4 py-3 font-medium text-[#f8fafc]">{t.teamName}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">
                  {formatCr(t.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
