"use client";
import React from "react";
import { ArrowRight, CheckCircle2, Hourglass, SkipForward, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCr } from "@/lib/utils";
import type { RetentionStateDTO, RetentionTurnAnnouncementDTO } from "@/types/backend";
import { RetainedPlayersPanel } from "./RetainedPlayersPanel";

interface TeamLite { id: string; name: string }

function HostSkip({ retention, onSkipActive }: { retention: RetentionStateDTO; onSkipActive?: () => void }) {
  if (!onSkipActive) return null;
  return (
    <div className="rounded-xl border border-[#242c3d] bg-[#151a24] p-3 text-xs text-[#cbd5e1]" data-testid="retention-host-skip">
      <p>Host option: if {retention.activeTeamName ?? "the active team"}'s manager is away, skip their turn so the others can continue.</p>
      <Button type="button" size="sm" variant="secondary" className="mt-2" leftIcon={<SkipForward className="h-4 w-4" aria-hidden="true" />} onClick={onSkipActive}>
        Skip {retention.activeTeamName ?? "active team"}'s turn
      </Button>
    </div>
  );
}

/** Another team is choosing. Read-only: only reservations (never owners) and confirmed turns are visible. */
export function WaitingView({ retention, teams, currentTeamId, onSkipActive }: {
  retention: RetentionStateDTO; teams: TeamLite[]; currentTeamId: string; onSkipActive?: () => void;
}) {
  const order = retention.order.find((o) => o.teamId === retention.activeTeamId)?.order;
  const last = retention.lastCompleted;
  return (
    <div className="space-y-4" data-testid="retention-waiting-view">
      <div className="flex items-start gap-3 rounded-xl border border-[#f5c542]/40 bg-[#f5c542]/5 p-4">
        <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-[#f5c542]" aria-hidden="true" />
        <div>
          <p className="text-sm font-black text-[#f8fafc]" data-testid="retention-waiting-title">
            Team {order} · {retention.activeTeamName} is choosing
          </p>
          <p className="mt-0.5 text-xs text-[#94a3b8]">
            You will be able to choose when it is your turn. {retention.reservedPlayerIds.length > 0 ? retention.reservedPlayerIds.length + " player" + (retention.reservedPlayerIds.length === 1 ? " is" : "s are") + " reserved right now." : "No players are reserved yet."}
          </p>
        </div>
      </div>
      {last ? (
        <p className="flex items-center gap-2 text-xs text-[#cbd5e1]" data-testid="retention-last-completed">
          <CheckCircle2 className="h-4 w-4 text-[#00ff87]" aria-hidden="true" />
          Team {last.teamOrder} · {last.teamName} {last.kind === "SKIPPED" ? "skipped retention" : "retained " + last.players.length + " player" + (last.players.length === 1 ? "" : "s")}.
        </p>
      ) : null}
      <HostSkip retention={retention} onSkipActive={onSkipActive} />
      <RetainedPlayersPanel picks={retention.picks} teams={teams} currentTeamId={currentTeamId} heading="Confirmed so far" />
    </div>
  );
}

/** Shown to a team after its own turn is locked. */
export function HandoverView({ turn, retention, teams, currentTeamId, onSkipActive }: {
  turn: RetentionTurnAnnouncementDTO; retention: RetentionStateDTO; teams: TeamLite[]; currentTeamId: string; onSkipActive?: () => void;
}) {
  const skipped = turn.kind === "SKIPPED";
  return (
    <div className="space-y-4" data-testid="retention-handover-view">
      <div className="rounded-2xl border border-[#00ff87]/40 bg-[#00ff87]/5 p-4 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#94a3b8]">{skipped ? "Retention skipped" : "Turn locked"}</p>
        <h3 className="mt-1 text-xl font-black text-[#f8fafc]" data-testid="retention-handover-title">TEAM {turn.teamOrder} - RETENTION COMPLETE</h3>
        <dl className="mx-auto mt-3 grid max-w-md grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-[#0e121a] p-2"><dt className="text-[10px] uppercase text-[#94a3b8]">Retained</dt><dd className="font-mono text-base font-black text-[#f8fafc]" data-testid="retention-handover-count">{turn.players.length}/{retention.config.maxPerTeam}</dd></div>
          <div className="rounded-lg bg-[#0e121a] p-2"><dt className="text-[10px] uppercase text-[#94a3b8]">Spent</dt><dd className="font-mono text-base font-black text-amber-400" data-testid="retention-handover-spent">{formatCr(turn.spentCr)}</dd></div>
          <div className="rounded-lg bg-[#0e121a] p-2"><dt className="text-[10px] uppercase text-[#94a3b8]">Purse left</dt><dd className="font-mono text-base font-black text-[#00ff87]" data-testid="retention-handover-purse">{formatCr(turn.remainingPurseCr)}</dd></div>
        </dl>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#00ff87]/40 px-3 py-1 text-xs font-black uppercase tracking-wider text-[#00ff87]" data-testid="retention-handover-next">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          {retention.activeTeamName ? "NEXT UP: TEAM " + (retention.order.find((o) => o.teamId === retention.activeTeamId)?.order ?? "") + " · " + retention.activeTeamName : "Waiting for the other teams"}
        </p>
        <p className="mt-2 text-xs text-[#94a3b8]">The next team starts automatically. Nothing more is needed from you.</p>
      </div>
      <HostSkip retention={retention} onSkipActive={onSkipActive} />
      <RetainedPlayersPanel picks={retention.picks} teams={teams} currentTeamId={currentTeamId} heading="Confirmed so far" />
    </div>
  );
}

/** Read-only summary after every team completed. Only the host can finalize. */
export function SummaryView({ retention, teams, currentTeamId, isHost, onFinalize }: {
  retention: RetentionStateDTO; teams: TeamLite[]; currentTeamId: string; isHost: boolean; onFinalize: () => void;
}) {
  const finalized = retention.phase === "FINALIZED";
  return (
    <div className="space-y-4" data-testid="retention-summary-view">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#242c3d] bg-[#151a24] p-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-[#f8fafc]"><Users className="h-4 w-4 text-[#00ff87]" aria-hidden="true" /> Retention summary</h3>
          <p className="text-xs text-[#94a3b8]" data-testid="retention-summary-totals">Total retained: {retention.totals.retained} · Total spent: {formatCr(retention.totals.spentCr)}</p>
        </div>
        {finalized ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#00ff87]/40 bg-[#00ff87]/10 px-2.5 py-1 text-xs font-bold text-[#00ff87]" data-testid="retention-finalized-badge">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Retentions finalized
          </span>
        ) : isHost ? (
          <Button type="button" size="sm" variant="primary" onClick={onFinalize}>Finalize retentions</Button>
        ) : (
          <p className="text-xs text-[#94a3b8]" data-testid="retention-nonhost-note">Waiting for the host to finalize retentions.</p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="retention-summary-teams">
        {retention.teams.map((stats) => {
          const team = teams.find((t) => t.id === stats.teamId);
          return (
            <div key={stats.teamId} className="rounded-xl border border-[#242c3d] bg-[#0e121a] p-3 text-xs" data-testid="retention-summary-team" data-team-id={stats.teamId}>
              <p className="truncate text-sm font-black text-[#f8fafc]">{team?.name}</p>
              <p className="mt-1 font-mono text-[#cbd5e1]">{stats.retainedCount}/{retention.config.maxPerTeam} retained · Spent {formatCr(stats.spentCr)} · Purse left {formatCr(stats.remainingPurseCr)}</p>
            </div>
          );
        })}
      </div>
      <RetainedPlayersPanel picks={retention.picks} teams={teams} currentTeamId={currentTeamId} heading="Retained players" />
    </div>
  );
}
