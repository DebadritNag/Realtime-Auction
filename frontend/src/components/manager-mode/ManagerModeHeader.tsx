'use client';
import type { TournamentState } from '@/types/manager-mode';

interface Props {
  state: TournamentState;
  connectionStatus: string;
}

const statusLabel: Record<string, string> = {
  INVITING: 'Inviting',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

const statusColor: Record<string, string> = {
  INVITING: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  ACTIVE: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  COMPLETED: 'text-sky-400 bg-sky-400/10 border-sky-400/30',
  ARCHIVED: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
};

export function ManagerModeHeader({ state, connectionStatus }: Props) {
  const mine = state.teams.find(t => t.id === state.myTeamId)!;
  const standing = state.standings.find(s => s.teamId === state.myTeamId);
  const synced = connectionStatus === 'SYNCED';
  const windowOpen = state.transferWindowOpen;

  return (
    <div className="w-full border-b border-white/5 bg-gradient-to-r from-[#060e1a] via-[#081222] to-[#060e1a] px-6 py-5 md:px-10">
      <div className="max-w-[1440px] mx-auto">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold tracking-[0.22em] text-emerald-400 uppercase">
            Manager Mode
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-[10px] font-bold tracking-[0.22em] text-slate-400 uppercase">
            {statusLabel[state.status] ?? state.status}
          </span>
        </div>

        {/* Title row */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight truncate">
              {state.name}
            </h1>
            <p className="mt-1 text-sm text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-slate-300">{mine.name}</span>
              {mine.managerUsername && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>@{mine.managerUsername}</span>
                </>
              )}
              <span className="text-slate-600">·</span>
              <span className={synced ? 'text-emerald-400' : 'text-amber-400'}>
                {synced ? '● Connected' : '○ ' + connectionStatus}
              </span>
            </p>
          </div>

          {/* Status pills */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border ${statusColor[state.status] ?? statusColor.ARCHIVED}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${state.status === 'ACTIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-current'}`} />
              {statusLabel[state.status]}
            </span>

            {standing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border text-sky-400 bg-sky-400/10 border-sky-400/30">
                #{standing.position} · {standing.points} pts
              </span>
            )}

            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border ${windowOpen ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
              {windowOpen ? 'Window Open' : 'Window Closed'}
            </span>

            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border text-slate-300 bg-white/5 border-white/10">
              {state.teams.filter(t => t.invitation === 'JOINED').length}/{state.teams.length} managers
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
