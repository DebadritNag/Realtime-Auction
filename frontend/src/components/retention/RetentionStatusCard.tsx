"use client";
import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { normalizeError } from "@/services/api";
import { retentionService } from "@/services/retention.service";
import { formatCr } from "@/lib/utils";
import type { RetentionStateDTO } from "@/types/backend";
import { RetainedPlayersPanel } from "./RetainedPlayersPanel";

/** Lobby summary of the retention phase. The selection UI itself lives on the dedicated retention page. */
export function RetentionStatusCard({ roomCode, retention, teams, isHost, canStart, startBlockedReason }: {
  roomCode: string;
  retention: RetentionStateDTO;
  teams: { id: string; name: string }[];
  isHost: boolean;
  canStart: boolean;
  startBlockedReason?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phase = retention.phase;
  const start = async () => {
    setPending(true);
    setError(null);
    try {
      await retentionService.start(roomCode);
    } catch (e) {
      setError(normalizeError(e).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <section aria-labelledby="retention-status-heading" className="space-y-3 rounded-2xl border border-[#242c3d] bg-[#0e121a] p-4" data-testid="retention-status-card">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="retention-status-heading" className="flex items-center gap-2 text-sm font-black text-[#f8fafc]">
          <ShieldCheck className="h-5 w-5 text-[#00ff87]" aria-hidden="true" /> Player retention
        </h2>
        <span className="rounded border border-[#f5c542]/50 bg-[#f5c542]/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-[#f5c542]" data-testid="retention-status-phase">
          {phase === "NOT_STARTED" ? "Not started" : phase === "TEAM_SELECTING" ? "In progress" : phase === "ALL_TEAMS_COMPLETED" ? "All teams done" : "Finalized"}
        </span>
        <span className="text-xs text-[#94a3b8]">Up to {retention.config.maxPerTeam} players per team at {formatCr(retention.config.priceCr)} each.</span>
      </div>

      {phase === "NOT_STARTED" ? (
        isHost ? (
          <div className="space-y-2">
            <p className="text-xs text-[#94a3b8]">Teams choose one at a time. Start retention when every team has joined.</p>
            <Button type="button" size="sm" variant="primary" onClick={() => void start()} isLoading={pending} disabled={!canStart} rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
              Start retention
            </Button>
            {!canStart && startBlockedReason ? <p className="text-[11px] text-[#94a3b8]">{startBlockedReason}</p> : null}
          </div>
        ) : (
          <p className="text-xs text-[#94a3b8]">Waiting for the host to start retention.</p>
        )
      ) : phase === "FINALIZED" ? (
        <p className="flex items-center gap-1.5 text-xs font-bold text-[#00ff87]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Retentions are finalized. The host can start the auction.</p>
      ) : (
        <Link href={"/room/" + roomCode + "/retention"} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold text-[#00ff87] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]">
          Open retention <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}

      {retention.picks.length > 0 ? <RetainedPlayersPanel picks={retention.picks} teams={teams} heading="Retained players" /> : null}
    </section>
  );
}
