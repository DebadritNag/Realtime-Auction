import type { TournamentState } from '@/types/manager-mode';
import { formatCrore } from '@/lib/money';

interface Props {
  state: TournamentState;
}

export function ManagerModeSummaryCard({ state }: Props) {
  const mine = state.teams.find(t => t.id === state.myTeamId)!;
  const standing = state.standings.find(s => s.teamId === state.myTeamId);
  const squad = state.players.filter(p => p.currentTeamId === mine.id);
  const next = state.fixtures.find(
    f => f.status === 'SCHEDULED' && (f.homeTeamId === mine.id || f.awayTeamId === mine.id)
  );
  const nextOpponent = next
    ? state.teams.find(t => t.id === (next.homeTeamId === mine.id ? next.awayTeamId : next.homeTeamId))
    : null;

  return (
    <aside className="space-y-4">
      {/* Tournament info */}
      <div className="rounded-2xl border border-white/8 bg-[#0a1628]/70 p-5 space-y-3">
        <h3 className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Tournament</h3>
        <div className="space-y-2">
          <Row label="Format" value={state.format === 'DOUBLE_ROUND_ROBIN' ? 'Double Round Robin' : 'Round Robin'} />
          <Row label="Status" value={state.status} highlight />
          <Row label="Teams" value={`${state.teams.filter(t => t.invitation === 'JOINED').length} / ${state.teams.length}`} />
          <Row label="Fixtures" value={`${state.fixtures.filter(f => f.status === 'COMPLETED').length} / ${state.fixtures.length} played`} />
          <Row
            label="Transfer Window"
            value={state.transferWindowOpen ? 'Open' : 'Closed'}
            highlight={state.transferWindowOpen}
          />
        </div>
      </div>

      {/* Your club */}
      <div className="rounded-2xl border border-white/8 bg-[#0a1628]/70 p-5 space-y-3">
        <h3 className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Your Club</h3>
        <div className="flex items-center gap-3 mb-3">
          {mine.logoUrl ? (
            <img src={mine.logoUrl} alt="" className="w-10 h-10 object-contain rounded-lg" />
          ) : (
            <span className="text-2xl w-10 h-10 flex items-center justify-center">{mine.logoEmoji}</span>
          )}
          <div>
            <p className="font-bold text-white text-sm leading-tight">{mine.name}</p>
            {mine.managerUsername && <p className="text-xs text-slate-400">@{mine.managerUsername}</p>}
          </div>
        </div>
        {standing && (
          <div className="space-y-2">
            <Row label="Position" value={`#${standing.position}`} highlight />
            <Row label="Points" value={`${standing.points} pts`} />
            <Row label="Record" value={`W${standing.won} D${standing.drawn} L${standing.lost}`} />
            <Row label="Goal Diff" value={`${standing.gd >= 0 ? '+' : ''}${standing.gd}`} />
          </div>
        )}
        <div className="pt-2 border-t border-white/5 space-y-2">
          <Row label="Squad" value={`${squad.length} players`} />
          <Row label="Transfer Budget" value={formatCrore(mine.transferBudgetUnits)} highlight />
        </div>
      </div>

      {/* Next match */}
      {next && nextOpponent && (
        <div className="rounded-2xl border border-white/8 bg-[#0a1628]/70 p-5 space-y-3">
          <h3 className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Next Match</h3>
          <div className="text-center py-2">
            <p className="text-xs text-slate-500 mb-2">Matchday {next.matchday}</p>
            <p className="font-bold text-white text-sm">
              {next.homeTeamId === mine.id ? mine.name : nextOpponent.name}
            </p>
            <p className="text-slate-500 text-xs my-1">vs</p>
            <p className="font-bold text-white text-sm">
              {next.awayTeamId === mine.id ? mine.name : nextOpponent.name}
            </p>
            {next.scheduledAt && (
              <p className="text-xs text-slate-500 mt-2">
                {new Date(next.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* League leaders (top 3) */}
      {state.standings.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-[#0a1628]/70 p-5 space-y-3">
          <h3 className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Top 3</h3>
          <div className="space-y-2">
            {state.standings.slice(0, 3).map(s => {
              const team = state.teams.find(t => t.id === s.teamId);
              return (
                <div key={s.teamId} className={`flex items-center justify-between text-sm ${s.teamId === state.myTeamId ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs w-4 text-right">{s.position}</span>
                    <span className="truncate max-w-[110px]">{team?.name ?? s.teamId}</span>
                  </span>
                  <span className="font-bold tabular-nums">{s.points}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={highlight ? 'text-emerald-400 font-semibold' : 'text-slate-300 font-medium'}>{value}</span>
    </div>
  );
}
