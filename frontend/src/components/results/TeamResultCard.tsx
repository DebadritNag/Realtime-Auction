"use client";

import React from "react";
import Link from "next/link";
import { Team } from "@/types";
import { formatCr } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ArrowUpRight } from "lucide-react";

export interface TeamResultCardProps {
  team: Team;
  roomCode: string;
}

export const TeamResultCard: React.FC<TeamResultCardProps> = ({
  team,
  roomCode,
}) => {
  const highestPurchasePrice =
    team.squad.length > 0
      ? Math.max(...team.squad.map((p) => p.soldPrice || p.basePrice))
      : 0;

  const averagePrice =
    team.squad.length > 0 ? team.budgetSpent / team.squad.length : 0;

  return (
    <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-5 shadow-lg flex flex-col justify-between hover:border-[#37435e] transition-all">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-[#242c3d]">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{team.logo}</span>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-bold text-[#f8fafc]">{team.name}</h3>
                {team.isCurrentUser && (
                  <span className="text-[9px] font-black uppercase bg-[#00ff87] text-[#08090d] px-1 rounded">
                    YOU
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748b]">Manager: @{team.managerUsername}</p>
            </div>
          </div>

          <span className="text-xs font-mono font-bold text-[#00ff87] bg-[#00ff87]/10 px-2 py-0.5 rounded border border-[#00ff87]/20">
            {team.squadCount} Signings
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 my-4 text-xs">
          <div className="bg-[#151a24] p-2.5 rounded-xl border border-[#242c3d]">
            <span className="text-[10px] font-bold uppercase text-[#64748b] block mb-0.5">
              TOTAL INVESTED
            </span>
            <span className="text-sm font-black font-mono text-amber-400">
              {formatCr(team.budgetSpent)}
            </span>
          </div>

          <div className="bg-[#151a24] p-2.5 rounded-xl border border-[#242c3d]">
            <span className="text-[10px] font-bold uppercase text-[#64748b] block mb-0.5">
              REMAINING PURSE
            </span>
            <span className="text-sm font-black font-mono text-[#00ff87]">
              {formatCr(team.budgetRemaining)}
            </span>
          </div>

          <div className="bg-[#151a24] p-2.5 rounded-xl border border-[#242c3d]">
            <span className="text-[10px] font-bold uppercase text-[#64748b] block mb-0.5">
              TOP PURCHASE
            </span>
            <span className="text-sm font-black font-mono text-[#f8fafc]">
              {highestPurchasePrice > 0 ? formatCr(highestPurchasePrice) : "--"}
            </span>
          </div>

          <div className="bg-[#151a24] p-2.5 rounded-xl border border-[#242c3d]">
            <span className="text-[10px] font-bold uppercase text-[#64748b] block mb-0.5">
              AVG PRICE
            </span>
            <span className="text-sm font-black font-mono text-[#cbd5e1]">
              {averagePrice > 0 ? formatCr(averagePrice) : "--"}
            </span>
          </div>
        </div>
      </div>

      <Link href={`/team/${roomCode}/${team.id}`} className="w-full mt-2">
        <Button
          variant="secondary"
          size="sm"
          className="w-full justify-center"
          rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
        >
          View Squad Formation
        </Button>
      </Link>
    </div>
  );
};
