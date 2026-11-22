"use client";
import React from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { PlayerImage } from "@/components/shared/PlayerImage";
import { UnderdogTag } from "@/components/shared/UnderdogTag";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCr } from "@/lib/utils";
import type { RetentionPlayerDTO } from "@/types/backend";

export function primaryPosition(p: { positions?: string[]; subPosition?: string; position: string }): string {
  return p.positions?.[0] ?? p.subPosition ?? p.position;
}

export type RetentionCardState = "available" | "selected" | "unavailable";

export interface RetentionPlayerCardProps {
  player: RetentionPlayerDTO;
  state: RetentionCardState;
  /** When set the Retain button is disabled and this explains why. */
  disabledReason: string | null;
  onRetain: (player: RetentionPlayerDTO) => void;
}

export function RetentionPlayerCard({ player, state, disabledReason, onRetain }: RetentionPlayerCardProps) {
  const title = player.name;
  const position = primaryPosition(player);
  const reasonId = "retain-reason-" + player.id;
  const reason = state === "unavailable" ? "Unavailable" : state === "selected" ? null : disabledReason;
  return (
    <li
      data-testid="retention-player-card"
      data-player-id={player.id}
      data-state={state}
      className={
        "flex flex-col gap-2.5 rounded-xl border p-3 " +
        (state === "selected" ? "border-[#00ff87]/50 bg-[#00ff87]/5" : state === "unavailable" ? "border-[#242c3d] bg-[#11151e] opacity-70" : "border-[#242c3d] bg-[#151a24]")
      }
    >
      <div className="flex items-start gap-3">
        <PlayerImage player={{ id: player.id, photoUrl: player.photoUrl, name: player.name }} alt="" className="h-16 w-14 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold leading-snug text-[#f8fafc]">
            {title}
            <UnderdogTag player={player} />
          </h4>
          <p className="truncate text-[11px] text-[#94a3b8]">{player.club || "No club"}</p>
          <p className="truncate text-[11px] text-[#94a3b8]">{player.nationality || "Nationality unavailable"}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-xl font-black leading-none text-[#f8fafc]" aria-label={"Overall " + player.ovr}>{player.ovr}</span>
          <Badge variant="position" position={position} size="sm">{position}</Badge>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-[#0e121a] px-2 py-1.5">
          <dt className="text-[10px] uppercase text-[#94a3b8]">Base price</dt>
          <dd className="font-mono font-bold text-[#f8fafc]">{formatCr(player.basePriceCr)}</dd>
        </div>
        <div className="rounded-lg bg-[#0e121a] px-2 py-1.5">
          <dt className="text-[10px] uppercase text-[#94a3b8]">Retention price</dt>
          <dd className="font-mono font-bold text-amber-400">{formatCr(player.retentionPriceCr)}</dd>
        </div>
      </dl>

      <div>
        {state === "selected" ? (
          <p className="flex items-center justify-center gap-1.5 rounded-lg border border-[#00ff87]/40 py-1.5 text-xs font-bold text-[#00ff87]" data-testid="retention-card-selected">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Selected
          </p>
        ) : state === "unavailable" ? (
          <p className="flex items-center justify-center gap-1.5 rounded-lg border border-[#242c3d] py-1.5 text-xs font-bold text-[#94a3b8]" data-testid="retention-card-unavailable">
            <Lock className="h-4 w-4" aria-hidden="true" /> Unavailable
          </p>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="w-full"
            disabled={disabledReason !== null}
            aria-describedby={reason ? reasonId : undefined}
            aria-label={"Retain " + title}
            onClick={() => onRetain(player)}
          >
            Retain
          </Button>
        )}
        {reason && state === "available" ? (
          <p id={reasonId} className="mt-1 text-center text-[10px] text-[#94a3b8]">{reason}</p>
        ) : null}
      </div>
    </li>
  );
}
