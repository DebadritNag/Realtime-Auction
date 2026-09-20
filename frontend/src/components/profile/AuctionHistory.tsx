"use client";

import React from "react";
import Link from "next/link";
import { AuctionHistoryRecord } from "@/types";
import { formatCr } from "@/lib/utils";
import { History, ExternalLink } from "lucide-react";

export interface AuctionHistoryProps {
  history: AuctionHistoryRecord[];
}

export const AuctionHistory: React.FC<AuctionHistoryProps> = ({ history }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8] flex items-center gap-2">
        <History className="w-4 h-4 text-[#00ff87]" />
        RECENT AUCTION CAMPAIGNS
      </h3>

      <div className="overflow-x-auto rounded-2xl bg-[#0e121a] border border-[#242c3d] shadow-lg">
        <table className="w-full text-left text-xs text-[#cbd5e1]">
          <thead className="bg-[#151a24] text-[10px] uppercase font-bold text-[#64748b] border-b border-[#242c3d]">
            <tr>
              <th className="px-4 py-3.5">Auction Name</th>
              <th className="px-4 py-3.5">Date</th>
              <th className="px-4 py-3.5">Team Used</th>
              <th className="px-4 py-3.5">Players Signed</th>
              <th className="px-4 py-3.5">Total Spent</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#242c3d]/60">
            {history.map((record) => (
              <tr key={record.id} className="hover:bg-[#151a24]/50 transition-colors">
                <td className="px-4 py-3 font-bold text-[#f8fafc]">
                  {record.auctionName}
                  <span className="block font-mono text-[10px] text-[#64748b]">
                    Code: {record.roomCode}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#94a3b8]">{record.date}</td>
                <td className="px-4 py-3 font-medium text-[#f8fafc]">{record.teamUsed}</td>
                <td className="px-4 py-3 font-mono">{record.playersPurchased}</td>
                <td className="px-4 py-3 font-mono font-bold text-amber-400">
                  {formatCr(record.moneySpent)}
                </td>
                <td className="px-4 py-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-[#00ff87] border border-emerald-500/30">
                    {record.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/results/${record.roomCode}`}
                    className="inline-flex items-center gap-1 text-xs text-[#00ff87] hover:underline"
                  >
                    <span>View Room</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
