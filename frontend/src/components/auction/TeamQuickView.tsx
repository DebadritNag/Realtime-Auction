"use client";

import React from "react";
import Link from "next/link";
import { Team } from "@/types";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCr } from "@/lib/utils";
import { ExternalLink, ShieldAlert } from "lucide-react";

export interface TeamQuickViewProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  roomCode: string;
}

export const TeamQuickView: React.FC<TeamQuickViewProps> = ({
  isOpen,
  onClose,
  team,
  roomCode,
}) => {
  if (!team) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position="right"
      title={
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{team.logo}</span>
          <div>
            <h3 className="text-base font-black text-[#f8fafc]">{team.name}</h3>
            <p className="text-[11px] text-[#64748b]">
              Manager: @{team.managerUsername}
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Purse Overview */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#151a24] p-3.5 rounded-xl border border-[#242c3d]">
            <span className="text-[10px] font-bold uppercase text-[#64748b] block mb-1">
              REMAINING BUDGET
            </span>
            <span className="text-xl font-black font-mono text-[#00ff87]">
              {formatCr(team.budgetRemaining)}
            </span>
          </div>
          <div className="bg-[#151a24] p-3.5 rounded-xl border border-[#242c3d]">
            <span className="text-[10px] font-bold uppercase text-[#64748b] block mb-1">
              TOTAL SPENT
            </span>
            <span className="text-xl font-black font-mono text-amber-400">
              {formatCr(team.budgetSpent)}
            </span>
          </div>
        </div>

        {/* Squad Composition */}
        <div className="bg-[#151a24] p-4 rounded-xl border border-[#242c3d]">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
            Squad Composition ({team.squadCount} / 18 Players)
          </h4>
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
            <div className="p-2 rounded-lg bg-[#0e121a] border border-[#242c3d]">
              <span className="text-[10px] text-amber-400 font-bold block">GK</span>
              <span className="text-base font-bold text-[#f8fafc]">{team.positions.gk}</span>
            </div>
            <div className="p-2 rounded-lg bg-[#0e121a] border border-[#242c3d]">
              <span className="text-[10px] text-blue-400 font-bold block">DEF</span>
              <span className="text-base font-bold text-[#f8fafc]">{team.positions.def}</span>
            </div>
            <div className="p-2 rounded-lg bg-[#0e121a] border border-[#242c3d]">
              <span className="text-[10px] text-emerald-400 font-bold block">MID</span>
              <span className="text-base font-bold text-[#f8fafc]">{team.positions.mid}</span>
            </div>
            <div className="p-2 rounded-lg bg-[#0e121a] border border-[#242c3d]">
              <span className="text-[10px] text-rose-400 font-bold block">ATT</span>
              <span className="text-base font-bold text-[#f8fafc]">{team.positions.att}</span>
            </div>
          </div>
        </div>

        {/* Recent Purchases List */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8] mb-2.5">
            Acquired Signings ({team.squad.length})
          </h4>
          {team.squad.length === 0 ? (
            <div className="text-center p-6 bg-[#151a24] rounded-xl border border-[#242c3d] text-xs text-[#64748b]">
              No signings in this auction yet.
            </div>
          ) : (
            <div className="space-y-2">
              {team.squad.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#151a24] border border-[#242c3d] text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="position" position={player.position} size="sm">
                      {player.ovr}
                    </Badge>
                    <div>
                      <p className="font-bold text-[#f8fafc]">{player.name}</p>
                      <p className="text-[10px] text-[#64748b]">{player.club}</p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-amber-400">
                    {formatCr(player.soldPrice || player.basePrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation to full team squad page */}
        <div className="pt-2">
          <Link
            href={`/team/${roomCode}/${team.id}`}
            target="_blank"
            className="block w-full"
          >
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              rightIcon={<ExternalLink className="w-4 h-4" />}
            >
              Open Full Squad Details
            </Button>
          </Link>
          <p className="text-[11px] text-[#64748b] text-center mt-2">
            Opens in separate tab without leaving live auction room.
          </p>
        </div>
      </div>
    </Drawer>
  );
};
