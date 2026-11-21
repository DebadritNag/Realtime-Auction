"use client";
import React from "react";
import { UserCheck } from "lucide-react";
import { UnderdogTag } from "@/components/shared/UnderdogTag";
import { Badge } from "@/components/ui/Badge";
import { formatCr } from "@/lib/utils";
import type { RetentionPickDTO } from "@/types/backend";
import { primaryPosition } from "./RetentionPlayerCard";

export function RetainedPlayersPanel({ teamName, picks }: { teamName: string; picks: RetentionPickDTO[] }) {
  return (
    <section aria-label="Retained players" className="rounded-xl border border-[#242c3d] bg-[#0e121a] p-3" data-testid="retained-panel">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#f8fafc]">
        <UserCheck className="h-4 w-4 text-[#00ff87]" aria-hidden="true" /> Retained by {teamName}
      </h3>
      {picks.length === 0 ? (
        <p className="py-3 text-center text-xs text-[#94a3b8]">No players retained (0). Retaining is optional.</p>
      ) : (
        <ul className="space-y-1.5">
          {picks.map((pick) => (
            <li key={pick.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#151a24] px-2.5 py-2 text-xs" data-testid="retained-player">
              <span className="flex min-w-0 items-center gap-2">
                {pick.player ? (
                  <Badge variant="position" position={primaryPosition(pick.player)} size="sm">{pick.player.ovr}</Badge>
                ) : null}
                <span className="truncate font-bold text-[#f8fafc]">
                  {pick.player?.fullName || pick.player?.name || "Player " + pick.playerId}
                  <UnderdogTag player={pick.player} />
                </span>
              </span>
              <span className="shrink-0 font-mono font-bold text-amber-400">{formatCr(pick.priceCr)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
