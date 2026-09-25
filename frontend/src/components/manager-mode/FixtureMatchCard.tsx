'use client';
import { useState } from 'react';
import type { Fixture, TournamentState } from '@/types/manager-mode';
import type { ManagerAction } from '@/services/manager-mode.service';

interface Props {
  fixture: Fixture;
  state: TournamentState;
  onAction: (action: ManagerAction) => Promise<void>;
  busy: boolean;
}

const statusBadge: Record<string, string> = {
  SCHEDULED: 'text-sky-400 bg-sky-400/10 border-sky-400/25',
  COMPLETED: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  POSTPONED: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  CANCELLED: 'text-red-400 bg-red-400/10 border-red-400/25',
};

const statusLabel: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Full Time',
  POSTPONED: 'Postponed',
  CANCELLED: 'Cancelled',
};

export function FixtureMatchCard({ fixture: f, state, onAction, busy }: Props) {
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(String(f.homeScore ?? 0));
  const [away, setAway] = useState(String(f.awayScore ?? 0));

  const homeTeam = state.teams.find(t => t.id === f.homeTeamId);
  const awayTeam = state.teams.find(t => t.id === f.awayTeamId);
  const canEdit = state.isHost && state.status === 'ACTIVE' && state.modeStatus !== 'ENDED' && state.seasonData?.seasons.find(s=>s.id===state.seasonData?.currentSeasonId)?.status === 'ACTIVE';
  const isMyMatch = f.homeTeamId === state.myTeamId || f.awayTeamId === state.myTeamId;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAction({ type: 'SCORE', fixtureId: f.id, homeScore: Number(home), awayScore: Number(away) });
    setEditing(false);
  };

  const handleReset = async () => {
    await onAction({ type: 'RESET_SCORE', fixtureId: f.id });
    setEditing(false);
  };

  return (
    <article className={`rounded-2xl border bg-[#0a1628]/70 overflow-hidden transition-colors ${isMyMatch ? 'border-emerald-700/40' : 'border-white/8'}`}>
      {/* Top row: status badge */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className={`inline-flex items-center text-[11px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full border ${statusBadge[f.status] ?? statusBadge.SCHEDULED}`}>
          {statusLabel[f.status] ?? f.status}
        </span>
        {isMyMatch && (
          <span className="text-[10px] font-bold tracking-widest text-emerald-400/60 uppercase">Your Match</span>
        )}
      </div>

      {/* Middle row: teams + score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-3">
        {/* Home team */}
        <div className="flex flex-col items-end gap-0.5 min-w-0">
          <span className="font-bold text-white text-base leading-tight text-right truncate w-full">{homeTeam?.name ?? 'TBD'}</span>
          {homeTeam?.logoEmoji && !homeTeam.logoUrl && (
            <span className="text-xl">{homeTeam.logoEmoji}</span>
          )}
          {homeTeam?.logoUrl && (
            <img src={homeTeam.logoUrl} alt="" className="w-8 h-8 object-contain" />
          )}
        </div>

        {/* Score */}
        <div className="flex flex-col items-center shrink-0">
          {f.status === 'COMPLETED' ? (
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-extrabold tabular-nums ${f.homeTeamId === state.myTeamId ? 'text-white' : 'text-slate-300'}`}>{f.homeScore}</span>
              <span className="text-slate-500 text-lg font-bold">–</span>
              <span className={`text-2xl font-extrabold tabular-nums ${f.awayTeamId === state.myTeamId ? 'text-white' : 'text-slate-300'}`}>{f.awayScore}</span>
            </div>
          ) : (
            <span className="text-slate-500 text-lg font-bold tracking-wider">vs</span>
          )}
          <span className="text-[10px] text-slate-600 mt-0.5 tracking-widest">
            {f.scheduledAt ? new Date(f.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
          </span>
        </div>

        {/* Away team */}
        <div className="flex flex-col items-start gap-0.5 min-w-0">
          {awayTeam?.logoUrl && (
            <img src={awayTeam.logoUrl} alt="" className="w-8 h-8 object-contain" />
          )}
          {awayTeam?.logoEmoji && !awayTeam.logoUrl && (
            <span className="text-xl">{awayTeam.logoEmoji}</span>
          )}
          <span className="font-bold text-white text-base leading-tight truncate w-full">{awayTeam?.name ?? 'TBD'}</span>
        </div>
      </div>

      {/* Bottom row: actions */}
      {canEdit && (
        <div className="px-5 pb-4">
          {!editing ? (
            <button
              onClick={() => { setHome(String(f.homeScore ?? 0)); setAway(String(f.awayScore ?? 0)); setEditing(true); }}
              className="cursor-pointer text-[12px] font-semibold text-emerald-400 hover:text-emerald-300 border border-emerald-700/50 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-1.5 rounded-lg transition-colors"
            >
              {f.status === 'COMPLETED' ? 'Correct Result' : 'Enter Result'}
            </button>
          ) : (
            <form onSubmit={handleSave} className="flex flex-wrap items-center gap-2 mt-1">
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                <label className="text-xs text-slate-400 whitespace-nowrap">{homeTeam?.name ?? 'Home'}</label>
                <input
                  aria-label="Home score"
                  type="number" min="0" max="99" step="1" required
                  value={home} onChange={e => setHome(e.target.value)}
                  className="w-12 text-center bg-transparent text-white font-bold text-lg focus:outline-none border-b border-emerald-500"
                />
                <span className="text-slate-500 font-bold">–</span>
                <input
                  aria-label="Away score"
                  type="number" min="0" max="99" step="1" required
                  value={away} onChange={e => setAway(e.target.value)}
                  className="w-12 text-center bg-transparent text-white font-bold text-lg focus:outline-none border-b border-emerald-500"
                />
                <label className="text-xs text-slate-400 whitespace-nowrap">{awayTeam?.name ?? 'Away'}</label>
              </div>
              <button
                type="submit" disabled={busy}
                className="cursor-pointer text-[12px] font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Save
              </button>
              {f.status === 'COMPLETED' && (
                <button
                  type="button" disabled={busy} onClick={handleReset}
                  className="cursor-pointer text-[12px] font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Reset
                </button>
              )}
              <button
                type="button" onClick={() => setEditing(false)}
                className="cursor-pointer text-[12px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
