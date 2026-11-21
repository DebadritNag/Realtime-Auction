"use client";
import React from "react";
import { CheckCircle2, CircleDashed, Hourglass, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RetentionStateDTO, RetentionTurnStatus } from "@/types/backend";

const STATUS: Record<RetentionTurnStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  COMPLETED: { label: "Completed", tone: "border-[#00ff87]/40 bg-[#00ff87]/10 text-[#00ff87]", Icon: CheckCircle2 },
  SKIPPED: { label: "Skipped", tone: "border-[#94a3b8]/40 bg-[#94a3b8]/10 text-[#cbd5e1]", Icon: SkipForward },
  ACTIVE: { label: "Selecting", tone: "border-[#f5c542]/60 bg-[#f5c542]/10 text-[#f5c542]", Icon: Hourglass },
  PENDING: { label: "Waiting", tone: "border-[#242c3d] bg-[#151a24] text-[#94a3b8]", Icon: CircleDashed },
};

/** Progress across every team in retention order. Read-only; the server decides who is active. */
export function RetentionProgress({ retention, currentTeamId }: { retention: RetentionStateDTO; currentTeamId: string }) {
  const { completed, total } = retention.progress;
  return (
    <section aria-label="Retention progress" className="space-y-2" data-testid="retention-progress">
      <div className="flex items-center justify-between text-xs">
        <h3 className="font-bold uppercase tracking-wider text-[#94a3b8]">Progress</h3>
        <p className="font-mono font-bold text-[#f8fafc]" data-testid="retention-progress-count">{completed} of {total} teams done</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#1e2433]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed} aria-label="Teams completed">
        <div className="h-full rounded-full bg-[#00ff87] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: (total ? (completed / total) * 100 : 0) + "%" }} />
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap" data-testid="retention-progress-list">
        {retention.order.map((team) => {
          const status = STATUS[team.turnStatus];
          const stats = retention.teams.find((t) => t.teamId === team.teamId);
          return (
            <li
              key={team.teamId}
              data-testid="retention-progress-item"
              data-status={team.turnStatus}
              aria-current={team.turnStatus === "ACTIVE" ? "step" : undefined}
              className={cn("flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs", status.tone)}
            >
              <status.Icon className="h-4 w-4" aria-hidden="true" />
              <span className="font-black">Team {team.order}</span>
              <span className="max-w-[9rem] truncate font-bold text-[#f8fafc]">{team.name}</span>
              {team.teamId === currentTeamId ? <span className="rounded bg-[#00ff87] px-1 text-[9px] font-black uppercase text-[#08090d]">You</span> : null}
              <span className="text-[10px] font-bold uppercase">{status.label}</span>
              {team.turnStatus === "COMPLETED" || team.turnStatus === "SKIPPED" ? (
                <span className="font-mono text-[11px] text-[#cbd5e1]">{stats?.retainedCount ?? 0}/{retention.config.maxPerTeam}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
