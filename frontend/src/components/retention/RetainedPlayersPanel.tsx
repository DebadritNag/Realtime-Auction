"use client";
import React from "react";
import { UserCheck } from "lucide-react";
import { PlayerImage } from "@/components/shared/PlayerImage";
import { UnderdogTag } from "@/components/shared/UnderdogTag";
import { AcquisitionBadge } from "@/components/shared/AcquisitionBadge";
import { Badge } from "@/components/ui/Badge";
import { formatCr } from "@/lib/utils";
import type { RetentionPickDTO } from "@/types/backend";
import { primaryPosition } from "./RetentionPlayerCard";

export interface RetainedPlayersPanelProps {
  picks: RetentionPickDTO[];
  /** Every team is listed, including those without retained players. */
  teams: { id: string; name: string }[];
  heading?: string;
  /** Marks the viewer's own team group. */
  currentTeamId?: string;
}

/** Read-only retained players grouped per team. Data comes from the confirmed picks in ROOM_STATE. */
export function RetainedPlayersPanel({ picks, teams, heading = "Retained players", currentTeamId }: RetainedPlayersPanelProps) {
  return (
    <section aria-label="Retained players" className="space-y-3 rounded-xl border border-[#242c3d] bg-[#0e121a] p-3 sm:p-4" data-testid="retained-panel">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#f8fafc]">
        <UserCheck className="h-4 w-4 text-[#f5c542]" aria-hidden="true" /> {heading}
        <span className="ml-auto font-mono text-[11px] text-[#94a3b8]" data-testid="retained-total">{picks.length} total</span>
      </h3>
      {teams.map((team) => {
        const own = picks.filter((p) => p.teamId === team.id);
        return (
          <div key={team.id} data-testid="retained-team-group" data-team-id={team.id} className="space-y-1.5">
            <h4 className="flex items-center gap-2 border-b border-[#1e2433] pb-1 text-xs font-black text-[#f8fafc]">
              <span className="truncate">{team.name}</span>
              {team.id === currentTeamId ? <span className="rounded bg-[#00ff87] px-1 text-[9px] font-black uppercase text-[#08090d]">You</span> : null}
              <span className="ml-auto font-mono text-[11px] font-bold text-[#94a3b8]">{own.length}/3</span>
            </h4>
            {own.length === 0 ? (
              <p className="px-1 py-1 text-xs text-[#94a3b8]" data-testid="retained-empty">No players retained</p>
            ) : (
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {own.map((pick) => {
                  const p = pick.player;
                  const name = p?.fullName || p?.name || "Player " + pick.playerId;
                  return (
                    <li key={pick.id} className="flex items-center gap-2.5 rounded-lg border border-[#f5c542]/20 bg-[#151a24] p-2 text-xs" data-testid="retained-player-card">
                      <PlayerImage player={{ id: pick.playerId, photoUrl: p?.photoUrl, name }} alt="" className="h-12 w-10 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-[#f8fafc]" data-testid="retained-player-name">
                          {name}
                          <UnderdogTag player={p} />
                        </p>
                        <p className="truncate text-[11px] text-[#94a3b8]">{p?.club || "No club"}</p>
                        <p className="truncate text-[11px] text-[#cbd5e1]" data-testid="retained-by">Retained by <strong>{pick.teamName || team.name}</strong></p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          {p ? <Badge variant="position" position={primaryPosition(p)} size="sm">{primaryPosition(p)}</Badge> : null}
                          <span className="font-mono text-base font-black leading-none text-[#f8fafc]" aria-label={"Overall " + (p?.ovr ?? "unknown")}>{p?.ovr ?? "?"}</span>
                        </div>
                        <AcquisitionBadge retained />
                        <span className="font-mono text-[11px] font-bold text-amber-400">{formatCr(pick.priceCr)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
