"use client";
import React from "react";
import { Play, Eye, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { potLabel } from "@/lib/pots";
import { relativeTime } from "@/lib/relativeTime";
import type { OngoingStatus, RoomSummaryDTO } from "@/types/backend";

export const STATUS_LABELS: Record<OngoingStatus, string> = {
  NOT_STARTED: "NOT STARTED",
  WAITING_FOR_TEAMS: "WAITING FOR TEAMS",
  RETENTION_IN_PROGRESS: "RETENTION IN PROGRESS",
  READY_TO_START: "READY TO START",
  LIVE_AUCTION: "LIVE AUCTION",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

const TONES: Partial<Record<OngoingStatus, string>> = {
  LIVE_AUCTION: "text-[#00ff87] border-[#00ff87]/40 bg-[#00ff87]/10",
  PAUSED: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  RETENTION_IN_PROGRESS: "text-sky-300 border-sky-400/40 bg-sky-400/10",
  READY_TO_START: "text-cyan-300 border-cyan-400/40 bg-cyan-400/10",
};

export interface OngoingAuctionCardProps {
  summary: RoomSummaryDTO;
  onContinue: (summary: RoomSummaryDTO) => void;
  onDetails: (summary: RoomSummaryDTO) => void;
}

export const OngoingAuctionCard: React.FC<OngoingAuctionCardProps> = ({ summary: s, onContinue, onDetails }) => {
  const cp = s.currentPlayer;
  const where = [s.round ? "Round " + s.round : null, s.category ? potLabel(s.category) : null].filter(Boolean).join(" \u00b7 ");
  const role = s.role.isHost ? "Host" : s.role.teamName ?? "Team manager";
  return (
    <article className="rounded-2xl border border-[#15384e] bg-[#051521] p-4 sm:p-5 flex flex-col gap-3 min-w-0" data-testid="ongoing-card" data-room-code={s.roomCode}>
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-white truncate" title={s.auctionName}>{s.auctionName}</h3>
          <p className="text-xs text-[#a6bacd] font-mono tracking-wider">Room {s.roomCode}</p>
        </div>
        <span data-testid="ongoing-status" className={"shrink-0 text-[10px] font-black tracking-wider px-2 py-1 rounded border " + (TONES[s.ongoingStatus] ?? "text-slate-200 border-slate-500/50 bg-slate-500/10")}>
          {STATUS_LABELS[s.ongoingStatus]}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-[#a6bacd]">
        <div className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><dt className="sr-only">Teams</dt><dd>{s.teamCount} {s.teamCount === 1 ? "team" : "teams"}</dd></div>
        <div><dt className="sr-only">Role</dt><dd className="truncate">{role}</dd></div>
        <div><dt className="inline">Sold: </dt><dd className="inline text-white font-semibold">{s.playersSold}</dd></div>
        <div><dt className="inline">Remaining: </dt><dd className="inline text-white font-semibold">{s.playersRemaining ?? "-"}</dd></div>
        {where ? <div className="col-span-2"><dt className="inline">Position: </dt><dd className="inline text-white">{where}</dd></div> : null}
        {cp ? (
          <div className="col-span-2 truncate"><dt className="inline">On the block: </dt>
            <dd className="inline text-white font-semibold">{cp.name} ({cp.currentBidCr} Cr{cp.highestBidderTeamName ? ", " + cp.highestBidderTeamName : ""})</dd></div>
        ) : null}
        <div className="col-span-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><dt className="sr-only">Last activity</dt><dd>Last activity {relativeTime(s.lastActivityAt, s.serverTime)}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2 mt-auto">
        <Button variant="stadium" size="sm" onClick={() => onContinue(s)} leftIcon={<Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />}>Continue Auction</Button>
        <Button variant="secondary" size="sm" onClick={() => onDetails(s)} leftIcon={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}>View Details</Button>
      </div>
    </article>
  );
};
