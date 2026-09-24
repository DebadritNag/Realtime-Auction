'use client';
import {ManagerTransfers} from './ManagerTransfers';
import { useState } from 'react';
import Link from 'next/link';
import { useManagerStore } from '@/stores/manager-mode.store';
import { useConnectionStore } from '@/stores/connection.store';
import type { TournamentState, ManagerPlayer, Fixture } from '@/types/manager-mode';
import type { ManagerAction } from '@/services/manager-mode.service';
import { formatCrore } from '@/lib/money';
import { ManagerModeLayout } from './ManagerModeLayout';
import { FixtureMatchCard } from './FixtureMatchCard';
import { ManagerModeSummaryCard } from './ManagerModeSummaryCard';

// ─── shared style tokens ──────────────────────────────────────────────────────
export const panel = 'rounded-2xl border border-white/8 bg-[#0a1628]/70 p-5 space-y-3';export const button =
  'cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-500/20 hover:border-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const dangerBtn =
  'cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-red-500/10 text-red-400 border border-red-700/50 hover:bg-red-500/20 hover:border-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const field =
  'block w-full rounded-xl bg-[#0d1929] border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors [color-scheme:dark]';

type Act = (action: ManagerAction) => Promise<void>;

// ─── Section: page title strip ────────────────────────────────────────────────
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Section: Dashboard ───────────────────────────────────────────────────────
function Dashboard({ state, action, busy }: { state: TournamentState; action: Act; busy: boolean }) {
  const mine = state.teams.find(t => t.id === state.myTeamId)!;
  const standing = state.standings.find(s => s.teamId === mine.id);
  const squad = state.players.filter(p => p.currentTeamId === mine.id);
  const next = state.fixtures.find(f => f.status === 'SCHEDULED' && (f.homeTeamId === mine.id || f.awayTeamId === mine.id));
  const recent = state.fixtures.filter(f => f.status === 'COMPLETED' && (f.homeTeamId === mine.id || f.awayTeamId === mine.id)).slice(-3);
  const pendingOffers = state.trades.filter(t => t.status === 'PENDING' && (t.fromTeamId === mine.id || t.toTeamId === mine.id)).length;
  const unread = state.notifications.filter(n => !n.read).length;

  return (
    <div className="grid xl:grid-cols-[1fr_320px] gap-6">
      {/* Main column */}
      <div className="space-y-6 min-w-0">
        {/* Club overview card */}
        <div className={panel}>
          <div className="flex items-center gap-4">
            {mine.logoUrl
              ? <img src={mine.logoUrl} alt="" className="w-16 h-16 object-contain rounded-xl" />
              : <span className="text-4xl w-16 h-16 flex items-center justify-center">{mine.logoEmoji}</span>}
            <div>
              <h3 className="text-2xl font-extrabold text-white leading-tight">{mine.name}</h3>
              {standing && (
                <p className="text-sm text-slate-400 mt-0.5">
                  {standing.position === 1 ? '🥇' : standing.position === 2 ? '🥈' : standing.position === 3 ? '🥉' : `#${standing.position}`}
                  {' '}· {standing.points} pts · W{standing.won} D{standing.drawn} L{standing.lost}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-white/5">
            {standing && (
              <>
                <Stat label="Goals For" value={String(standing.gf)} />
                <Stat label="Goals Against" value={String(standing.ga)} />
                <Stat label="Goal Diff" value={`${standing.gd >= 0 ? '+' : ''}${standing.gd}`} />
              </>
            )}
            <Stat label="Transfer Budget" value={formatCrore(mine.transferBudgetUnits)} accent />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-white/5">
            <Stat label="Squad Size" value={String(squad.length)} />
            <Stat label="Pending Offers" value={String(pendingOffers)} />
            <Stat label="Unread" value={String(unread)} />
            <Stat label="Window" value={state.transferWindowOpen ? 'Open' : 'Closed'} accent={state.transferWindowOpen} />
          </div>
        </div>

        {/* Fixtures preview */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-200">
            {next ? 'Next Match' : 'Recent Results'}
          </h3>
          {next && (
            <FixtureMatchCard fixture={next} state={state} onAction={action} busy={busy} />
          )}
          {recent.length > 0 && (
            <div className="space-y-2">
              {!next && <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Recent Results</p>}
              {recent.map(f => <FixtureMatchCard key={f.id} fixture={f} state={state} onAction={action} busy={busy} />)}
            </div>
          )}
          {!next && recent.length === 0 && (
            <p className="text-sm text-slate-500 italic">No fixtures yet. The host will generate them once all managers join.</p>
          )}
        </div>

        {/* Recent transfers */}
        {state.transactions.length > 0 && (
          <div className={panel}>
            <h3 className="text-base font-bold text-white">Recent Transfer Activity</h3>
            <div className="space-y-2">
              {state.transactions.slice(-8).reverse().map(t => {
                const player = state.players.find(p => p.id === t.playerId);
                const toTeam = state.teams.find(x => x.id === t.toTeamId);
                return (
                  <div key={t.id} className="flex items-center justify-between text-xs text-slate-400 py-1.5 border-b border-white/5 last:border-0">
                    <span className="font-medium text-slate-300 truncate mr-3">{player?.name ?? t.playerId}</span>
                    <span className="shrink-0">{t.type.replaceAll('_', ' ')} → {toTeam?.name} · {formatCrore(t.amountUnits)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <ManagerModeSummaryCard state={state} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

// ─── Section: Squad ───────────────────────────────────────────────────────────
export function PlayerCard({ p }: { p: ManagerPlayer }) {
  return (
    <article className={panel + ' !space-y-2'}>
      <div className="flex items-center gap-3">
        {p.imageUrl && <img src={p.imageUrl} alt="" className="w-14 h-14 object-contain rounded-lg bg-white/5" />}
        <div className="min-w-0">
          <h3 className="font-bold text-white truncate">{p.name}</h3>
          <p className="text-sm text-emerald-300">{p.overall} OVR · {p.position}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400">{p.club || '—'} · {p.nationality || '—'}</p>
      <p className="text-xs text-slate-500">
        {p.acquisitionType?.replaceAll('_', ' ') ?? p.source.replaceAll('_', ' ')}
        {p.acquisitionPriceUnits !== null ? ` · ${formatCrore(p.acquisitionPriceUnits)}` : ''}
      </p>
    </article>
  );
}

function Squad({ players }: { players: ManagerPlayer[] }) {
  const groups: [string, string[]][] = [
    ['Goalkeepers', ['GK']],
    ['Defenders', ['DEF', 'CB', 'LB', 'RB', 'LWB', 'RWB']],
    ['Midfielders', ['MID', 'CDM', 'CM', 'CAM', 'LM', 'RM']],
    ['Attackers', ['FWD', 'ATT', 'LW', 'RW', 'ST', 'CF']],
  ];
  return (
    <div className="space-y-8">
      {groups.map(([name, positions]) => {
        const rows = players.filter(p => positions.includes(p.position));
        if (!rows.length) return null;
        return (
          <section key={name}>
            <h3 className="text-base font-bold text-slate-200 mb-3">
              {name} <span className="text-slate-500 font-normal">({rows.length})</span>
            </h3>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rows.map(p => <PlayerCard key={p.id} p={p} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Section: Fixtures (with sidebar) ────────────────────────────────────────
function FixturesSection({ state, action, busy }: { state: TournamentState; action: Act; busy: boolean }) {
  const matchdays = [...new Set(state.fixtures.map(f => f.matchday))].sort((a, b) => a - b);

  return (
    <div className="grid xl:grid-cols-[1fr_300px] gap-6">
      <div className="space-y-8 min-w-0">
        {!state.fixtures.length && (
          <div className={panel}>
            <p className="text-slate-400 text-sm">The host will generate fixtures once all managers have joined.</p>
          </div>
        )}
        {matchdays.map(day => {
          const games = state.fixtures.filter(f => f.matchday === day);
          const byes = state.teams.filter(t => !games.some(f => f.homeTeamId === t.id || f.awayTeamId === t.id));
          return (
            <section key={day}>
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-base font-bold text-white">Matchday {day}</h3>
                <span className="text-xs text-slate-500">
                  {games.filter(f => f.status === 'COMPLETED').length}/{games.length} played
                </span>
              </div>
              {byes.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {byes.map(t => (
                    <span key={t.id} className="text-xs text-slate-500 bg-white/5 border border-white/8 px-3 py-1 rounded-full">
                      {t.name} — BYE
                    </span>
                  ))}
                </div>
              )}
              <div className="grid lg:grid-cols-2 gap-3">
                {games.map(f => (
                  <FixtureMatchCard key={f.id} fixture={f} state={state} onAction={action} busy={busy} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <ManagerModeSummaryCard state={state} />
    </div>
  );
}

// ─── Section: Standings ───────────────────────────────────────────────────────
function StandingsTable({ state }: { state: TournamentState }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a1628]/70 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-white/8">
              <th className="text-left px-5 py-3 font-semibold">#</th>
              <th className="text-left px-3 py-3 font-semibold">Club</th>
              <th className="text-center px-3 py-3 font-semibold">P</th>
              <th className="text-center px-3 py-3 font-semibold">W</th>
              <th className="text-center px-3 py-3 font-semibold">D</th>
              <th className="text-center px-3 py-3 font-semibold">L</th>
              <th className="text-center px-3 py-3 font-semibold">GF</th>
              <th className="text-center px-3 py-3 font-semibold">GA</th>
              <th className="text-center px-3 py-3 font-semibold">GD</th>
              <th className="text-center px-5 py-3 font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {state.standings.map((r, i) => {
              const team = state.teams.find(t => t.id === r.teamId);
              const isMe = r.teamId === state.myTeamId;
              return (
                <tr
                  key={r.teamId}
                  className={`border-b border-white/5 last:border-0 ${isMe ? 'bg-emerald-500/5' : i % 2 === 0 ? 'bg-white/[0.01]' : ''}`}
                >
                  <td className="px-5 py-3.5">
                    <span className={`font-bold ${isMe ? 'text-emerald-400' : 'text-slate-400'}`}>{r.position}</span>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      {team?.logoEmoji && !team.logoUrl && <span className="text-lg">{team.logoEmoji}</span>}
                      {team?.logoUrl && <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain" />}
                      <span className={`font-semibold ${isMe ? 'text-emerald-300' : 'text-white'}`}>{team?.name}</span>
                      {isMe && <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 tracking-wider">YOU</span>}
                    </div>
                  </td>
                  <td className="text-center px-3 py-3.5 text-slate-300">{r.played}</td>
                  <td className="text-center px-3 py-3.5 text-emerald-400 font-medium">{r.won}</td>
                  <td className="text-center px-3 py-3.5 text-slate-400">{r.drawn}</td>
                  <td className="text-center px-3 py-3.5 text-red-400">{r.lost}</td>
                  <td className="text-center px-3 py-3.5 text-slate-300">{r.gf}</td>
                  <td className="text-center px-3 py-3.5 text-slate-300">{r.ga}</td>
                  <td className="text-center px-3 py-3.5 text-slate-300">{r.gd >= 0 ? '+' : ''}{r.gd}</td>
                  <td className="text-center px-5 py-3.5 font-extrabold text-white">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section: Transfers ───────────────────────────────────────────────────────
function Transfers({ state, action, busy }: { state: TournamentState; action: Act; busy: boolean }) {
  const [tab, setTab] = useState<'overview' | 'free-agents' | 'trade' | 'offers'>('trade');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('');
  const [source, setSource] = useState('');
  const [offered, setOffered] = useState('');
  const [requested, setRequested] = useState('');
  const [opponent, setOpponent] = useState('');
  const [parent, setParent] = useState<string | undefined>();

  const mine = state.teams.find(t => t.id === state.myTeamId)!;
  const myPlayers = state.players.filter(p => p.currentTeamId === mine.id);
  const freeAgents = state.players.filter(p => !p.currentTeamId);
  const incoming = state.trades.filter(t => t.toTeamId === mine.id);
  const outgoing = state.trades.filter(t => t.fromTeamId === mine.id);
  const name = (id: string) => state.players.find(p => p.id === id)?.name ?? id;

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'trade', label: 'Trade Centre' },
    { id: 'offers', label: `Offers ${incoming.filter(t => t.status === 'PENDING').length ? `(${incoming.filter(t => t.status === 'PENDING').length})` : ''}` },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b border-white/5 pb-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`cursor-pointer px-4 py-2 rounded-xl text-[13px] font-semibold border transition-colors ${
              tab === t.id
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-700/60'
                : 'bg-white/5 text-slate-400 border-white/8 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Window banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold ${state.transferWindowOpen ? 'bg-emerald-500/10 border-emerald-700/50 text-emerald-300' : 'bg-white/5 border-white/8 text-slate-400'}`}>
        <span className={`w-2 h-2 rounded-full ${state.transferWindowOpen ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
        Transfer window {state.transferWindowOpen ? 'OPEN' : 'CLOSED'}
        <span className="ml-auto font-normal text-xs text-slate-500">Budget: {formatCrore(mine.transferBudgetUnits)}</span>
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className={panel + ' !space-y-1'}>
              <p className="text-xs text-slate-500">Free Agents</p>
              <p className="text-2xl font-bold text-white">{freeAgents.length}</p>
            </div>
            <div className={panel + ' !space-y-1'}>
              <p className="text-xs text-slate-500">Pending Offers</p>
              <p className="text-2xl font-bold text-white">{incoming.filter(t => t.status === 'PENDING').length + outgoing.filter(t => t.status === 'PENDING').length}</p>
            </div>
            <div className={panel + ' !space-y-1'}>
              <p className="text-xs text-slate-500">Your Squad</p>
              <p className="text-2xl font-bold text-white">{myPlayers.length}</p>
            </div>
          </div>
          {state.transactions.length > 0 && (
            <div className={panel}>
              <h3 className="text-base font-bold text-white mb-2">Transfer History</h3>
              <div className="space-y-2">
                {state.transactions.slice(-15).reverse().map(t => {
                  const player = state.players.find(p => p.id === t.playerId);
                  const toTeam = state.teams.find(x => x.id === t.toTeamId);
                  return (
                    <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                      <span className="font-medium text-slate-300">{player?.name}</span>
                      <span className="text-slate-500">{t.type.replaceAll('_', ' ')} → {toTeam?.name} · {formatCrore(t.amountUnits)} · {new Date(t.at).toLocaleDateString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'free-agents' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <input aria-label="Search" placeholder="Search players…" className={field} value={query} onChange={e => setQuery(e.target.value)} />
            <select aria-label="Position" className={field} value={position} onChange={e => setPosition(e.target.value)}>
              <option value="">All positions</option>
              {[...new Set(freeAgents.map(p => p.position))].sort().map(p => <option key={p}>{p}</option>)}
            </select>
            <select aria-label="Source" className={field} value={source} onChange={e => setSource(e.target.value)}>
              <option value="">All sources</option>
              <option value="AUCTION_UNSOLD">Auction unsold</option>
              <option value="EXTERNAL_POOL">External pool</option>
            </select>
          </div>
          <p className="text-xs text-slate-500 italic">Free-agent negotiations are available in Transfers → Free Agents.</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {freeAgents
              .filter(p =>
                p.name.toLowerCase().includes(query.toLowerCase()) &&
                (!position || p.position === position) &&
                (!source || p.source === source)
              )
              .map(p => <PlayerCard key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {tab === 'trade' && (
        <form
          className={panel}
          onSubmit={e => {
            e.preventDefault();
            void action({ type: 'TRADE', offeredPlayerId: offered, requestedPlayerId: requested, ...(parent ? { parentTradeId: parent } : {}) });
          }}
        >
          <h3 className="text-base font-bold text-white">{parent ? 'Counter Offer' : 'Propose a Player Swap'}</h3>
          <p className="text-xs text-slate-500">No money exchanges hands — both players swap teams on acceptance.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-xs text-slate-400">Your player</span>
              <select className={field} value={offered} required onChange={e => setOffered(e.target.value)}>
                <option value="">Choose player</option>
                {myPlayers.map(p => <option key={p.id} value={p.id}>{p.name} · {p.position} · {p.overall} OVR</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-slate-400">Target team</span>
              <select className={field} required disabled={Boolean(parent)} value={opponent} onChange={e => { setOpponent(e.target.value); setRequested(''); }}>
                <option value="">Choose team</option>
                {state.teams.filter(t => t.id !== mine.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs text-slate-400">Requested player</span>
              <select className={field} value={requested} required onChange={e => setRequested(e.target.value)}>
                <option value="">Choose player</option>
                {state.players.filter(p => p.currentTeamId === opponent).map(p => <option key={p.id} value={p.id}>{p.name} · {p.position} · {p.overall} OVR</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className={button} disabled={busy || !state.transferWindowOpen}>
              Send {parent ? 'counter' : 'offer'}
            </button>
            {parent && <button type="button" className={button} onClick={() => setParent(undefined)}>Cancel counter</button>}
          </div>
        </form>
      )}

      {tab === 'offers' && (
        <div className="space-y-6">
          {([['Incoming', incoming], ['Outgoing', outgoing]] as [string, typeof incoming][]).map(([title, items]) => (
            <section key={title} className="space-y-3">
              <h3 className="text-base font-bold text-white">{title}</h3>
              {items.length === 0 && <p className="text-sm text-slate-500 italic">No {title.toLowerCase()} offers.</p>}
              {items.map(t => (
                <article key={t.id} className={panel + ' !space-y-2'}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white text-sm">{name(t.offeredPlayerId)} ↔ {name(t.requestedPlayerId)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{state.teams.find(x => x.id === t.fromTeamId)?.name} → {state.teams.find(x => x.id === t.toTeamId)?.name}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${t.status === 'PENDING' ? 'text-amber-400 bg-amber-400/10 border-amber-400/25' : 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
                      {t.status}
                    </span>
                  </div>
                  {t.status === 'PENDING' && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {t.toTeamId === mine.id ? (
                        <>
                          <button className={button} disabled={busy || !state.transferWindowOpen} onClick={() => void action({ type: 'TRADE_RESPONSE', tradeId: t.id, response: 'ACCEPT' })}>Accept</button>
                          <button className={button} disabled={busy} onClick={() => void action({ type: 'TRADE_RESPONSE', tradeId: t.id, response: 'REJECT' })}>Reject</button>
                          <button className={button} disabled={!state.transferWindowOpen} onClick={() => { setParent(t.id); setOpponent(t.fromTeamId); setOffered(t.requestedPlayerId); setRequested(t.offeredPlayerId); setTab('trade'); }}>Counter</button>
                        </>
                      ) : (
                        <button className={button} disabled={busy} onClick={() => void action({ type: 'TRADE_RESPONSE', tradeId: t.id, response: 'CANCEL' })}>Cancel offer</button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section: Teams ───────────────────────────────────────────────────────────
function TeamsSection({ state }: { state: TournamentState }) {
  const [teamId, setTeamId] = useState(state.myTeamId);
  const team = state.teams.find(t => t.id === teamId)!;
  const players = state.players.filter(p => p.currentTeamId === teamId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {state.teams.map(t => (
          <button
            key={t.id}
            onClick={() => setTeamId(t.id)}
            className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              teamId === t.id
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-700/60'
                : 'bg-white/5 text-slate-400 border-white/8 hover:text-white'
            }`}
          >
            {t.logoEmoji && !t.logoUrl && <span>{t.logoEmoji}</span>}
            {t.logoUrl && <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain" />}
            {t.name}
            {t.id === state.myTeamId && <span className="text-[9px] font-bold text-emerald-500">YOU</span>}
          </button>
        ))}
      </div>
      <div className={panel}>
        <div className="flex items-center gap-3">
          {team.logoUrl ? <img src={team.logoUrl} alt="" className="w-12 h-12 object-contain rounded-lg" /> : <span className="text-3xl">{team.logoEmoji}</span>}
          <div>
            <h3 className="font-bold text-white text-lg">{team.name}</h3>
            <p className="text-xs text-slate-400">@{team.managerUsername ?? 'N/A'} · {team.invitation} · Budget {formatCrore(team.transferBudgetUnits)}</p>
          </div>
        </div>
      </div>
      <Squad players={players} />
    </div>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────
function NotificationsSection({ state, action, busy }: { state: TournamentState; action: Act; busy: boolean }) {
  const sorted = [...state.notifications].reverse();
  return (
    <div className="space-y-3">
      {sorted.length === 0 && <p className="text-sm text-slate-500 italic">No notifications yet.</p>}
      {sorted.map(n => (
        <article key={n.id} className={`${panel} !space-y-2 ${!n.read ? 'border-emerald-700/30' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <h3 className={`font-semibold text-sm ${n.read ? 'text-slate-300' : 'text-white'}`}>{n.title}</h3>
            {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-1" />}
          </div>
          <p className="text-xs text-slate-400">{n.message}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600">{new Date(n.createdAt).toLocaleString()}</span>
            {!n.read && (
              <button className="cursor-pointer text-xs text-emerald-400 hover:text-emerald-300 transition-colors" disabled={busy} onClick={() => void action({ type: 'READ_NOTIFICATION', notificationId: n.id })}>
                Mark read
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

// ─── Section: Host Control ────────────────────────────────────────────────────
function HostControl({ state, action, busy }: { state: TournamentState; action: Act; busy: boolean }) {
  const [announcement, setAnnouncement] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const joined = state.teams.filter(t => t.invitation === 'JOINED').length;
  const completed = state.fixtures.filter(f => f.status === 'COMPLETED').length;

  if (!state.isHost) return <p className="text-sm text-red-400">Host access required.</p>;

  return (
    <div className="space-y-6">
      {/* Tournament controls */}
      <div className={panel}>
        <h3 className="text-base font-bold text-white">Tournament Controls</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/8">
            <span className="text-slate-400">Managers joined</span>
            <span className="font-bold text-white">{joined} / {state.teams.length}</span>
          </div>
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/8">
            <span className="text-slate-400">Matches completed</span>
            <span className="font-bold text-white">{completed} / {state.fixtures.length}</span>
          </div>
        </div>

        <div className="space-y-2">
          {state.teams.map(t => (
            <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
              <span className="font-medium text-slate-300">{t.name}</span>
              <span className={`px-2 py-0.5 rounded-full font-semibold ${t.invitation === 'JOINED' ? 'text-emerald-400 bg-emerald-400/10' : t.invitation === 'PENDING' ? 'text-amber-400 bg-amber-400/10' : 'text-red-400 bg-red-400/10'}`}>
                {t.invitation}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button className={button} disabled={busy || state.status !== 'INVITING'} onClick={() => void action({ type: 'RESEND_INVITATIONS' })}>
            Resend Invitations
          </button>
          <button className={button} disabled={busy || Boolean(state.fixtures.length) || state.teams.some(t => t.invitation !== 'JOINED')} onClick={() => void action({ type: 'GENERATE_FIXTURES' })}>
            Generate Fixtures &amp; Start
          </button>
          <button className={button} disabled={busy || state.status !== 'ACTIVE'} onClick={() => void action({ type: 'WINDOW', open: !state.transferWindowOpen })}>
            {state.transferWindowOpen ? 'Close' : 'Open'} Transfer Window
          </button>
          <button className={button} disabled={busy || state.status !== 'ACTIVE' || !state.fixtures.length || state.fixtures.some(f => f.status !== 'COMPLETED')} onClick={() => void action({ type: 'STATUS', status: 'COMPLETED' })}>
            Complete Tournament
          </button>
          {state.status === 'COMPLETED' && (
            <button className={button} disabled={busy} onClick={() => void action({ type: 'STATUS', status: 'ACTIVE' })}>
              Reopen for Corrections
            </button>
          )}
          <button className={button} disabled={busy || state.status === 'ARCHIVED'} onClick={() => { if (window.confirm('Archive this tournament? It will become read-only.')) void action({ type: 'STATUS', status: 'ARCHIVED' }); }}>
            Archive Tournament
          </button>
          <Link className={button} href={`/manager-mode/${state.id}/fixtures`}>
            Manage Results
          </Link>
        </div>
      </div>

      {/* Announcement */}
      <form className={panel} onSubmit={e => { e.preventDefault(); void action({ type: 'ANNOUNCE', message: announcement }); setAnnouncement(''); }}>
        <h3 className="text-base font-bold text-white">Send Announcement</h3>
        <textarea
          className={field + ' resize-none'}
          rows={3}
          required
          maxLength={500}
          placeholder="Message to all managers…"
          value={announcement}
          onChange={e => setAnnouncement(e.target.value)}
        />
        <button className={button} disabled={busy || state.status === 'ARCHIVED'}>Send Announcement</button>
      </form>

      {/* Audit log */}
      {state.audit.length > 0 && (
        <div className={panel}>
          <h3 className="text-base font-bold text-white">Activity Log</h3>
          <div className="space-y-1">
            {state.audit.slice(-20).reverse().map(a => (
              <div key={a.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                <span className="text-slate-400">{a.type.replaceAll('_', ' ')}</span>
                <span className="text-slate-600">{new Date(a.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Danger Zone ── */}
      <div className="rounded-2xl border border-red-900/60 bg-red-950/20 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Danger Zone</h3>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-white">Delete Manager Mode</p>
            <p className="text-xs text-slate-400 mt-0.5">Permanently delete this tournament and all Manager Mode data. The source auction will remain unchanged.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className={dangerBtn + ' shrink-0'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete Manager Mode
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteModal
          tournamentName={state.name}
          tournamentId={state.id}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────
function DeleteModal({ tournamentName, tournamentId, onClose }: { tournamentName: string; tournamentId: string; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const { deleteManagerMode } = useManagerStore();
  const valid = confirmText === 'DELETE';

  const handleDelete = async () => {
    if (!valid) return;
    setDeleting(true);
    setError('');
    try {
      await deleteManagerMode(tournamentId);
      // redirect happens via the MANAGER_MODE_DELETED event handler in the store
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion failed.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-red-900/60 bg-[#0e0a0a] shadow-2xl p-6 space-y-5" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 id="delete-modal-title" className="text-lg font-bold text-white">Delete Manager Mode?</h2>
            <p className="text-sm text-slate-400 mt-0.5">This cannot be undone.</p>
          </div>
        </div>

        {/* Body */}
        <div className="rounded-xl bg-white/5 border border-white/8 p-4 text-sm text-slate-300 space-y-2">
          <p>This will permanently delete <span className="font-semibold text-white">{tournamentName}</span>, including:</p>
          <ul className="list-disc list-inside text-slate-400 space-y-0.5 text-xs pl-1">
            <li>Fixtures &amp; standings data</li>
            <li>Squads &amp; transfer history</li>
            <li>Trade offers &amp; notifications</li>
            <li>All Manager Mode records</li>
          </ul>
          <p className="text-emerald-400 font-semibold text-xs pt-1">The original auction and auction results will NOT be deleted.</p>
        </div>

        {/* Confirm input */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">
            Type <span className="font-mono font-bold text-white">DELETE</span> to confirm
          </label>
          <input
            type="text"
            className={field + ' font-mono'}
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="cursor-pointer flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!valid || deleting}
            className="cursor-pointer flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting…' : 'Delete Manager Mode'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invitation gate ──────────────────────────────────────────────────────────
function InvitationGate({ state, action, busy }: { state: TournamentState; action: Act; busy: boolean }) {
  const mine = state.teams.find(t => t.id === state.myTeamId)!;
  return (
    <div className={panel + ' max-w-lg mx-auto mt-8'}>
      <h2 className="text-xl font-bold text-white">You're invited to manage {mine.name}</h2>
      <p className="text-sm text-slate-400">Your auction squad is reserved for you. Current response: <span className="font-semibold text-slate-200">{mine.invitation}</span>.</p>
      {state.status === 'INVITING' && (
        <div className="flex gap-3">
          <button className={button} disabled={busy} onClick={() => void action({ type: 'INVITATION', accept: true })}>Accept Invitation</button>
          <button className={button} disabled={busy} onClick={() => void action({ type: 'INVITATION', accept: false })}>Decline</button>
        </div>
      )}
    </div>
  );
}

// ─── Loading / error state ────────────────────────────────────────────────────
function WorkspaceLoader({ error, status }: { error: string | null; status: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-10 h-10 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      <p className="text-sm text-slate-400">{error ?? 'Synchronizing tournament…'}</p>
      <p className="text-xs text-slate-600">{status}</p>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export function ManagerWorkspace({ section }: { section: string }) {
  const { state, error, busy, action } = useManagerStore();
  const status = useConnectionStore(s => s.status);

  if (!state) return <WorkspaceLoader error={error} status={status} />;

  const mine = state.teams.find(t => t.id === state.myTeamId)!;
  const joined = mine.invitation === 'JOINED';

  const renderSection = () => {
    if (!joined) return <InvitationGate state={state} action={action} busy={busy} />;

    switch (section.split('/')[0]) {
      case 'dashboard':
        return <Dashboard state={state} action={action} busy={busy} />;
      case 'squad':
        return (
          <>
            <SectionTitle title="Squad" subtitle={`${state.players.filter(p => p.currentTeamId === state.myTeamId).length} players in your squad`} />
            <Squad players={state.players.filter(p => p.currentTeamId === mine.id)} />
          </>
        );
      case 'fixtures':
        return (
          <>
            <SectionTitle title="Fixtures" subtitle="Track all league matches and enter results as host." />
            <FixturesSection state={state} action={action} busy={busy} />
          </>
        );
      case 'standings':
        return (
          <>
            <SectionTitle title="Standings" subtitle="3 points for a win, 1 for a draw. Ties broken by goal difference." />
            <StandingsTable state={state} />
          </>
        );
      case 'transfers':
        return (
          <>
            <SectionTitle title="Transfers" subtitle="Negotiate free-agent signings, swap players and send club buyouts." />
            <ManagerTransfers state={state} action={action} busy={busy} path={section} />
          </>
        );
      case 'teams':
        return (
          <>
            <SectionTitle title="Teams" subtitle="Inspect any team's squad and budget." />
            <TeamsSection state={state} />
          </>
        );
      case 'notifications':
        return (
          <>
            <SectionTitle title="Notifications" subtitle={`${state.notifications.filter(n => !n.read).length} unread`} />
            <NotificationsSection state={state} action={action} busy={busy} />
          </>
        );
      case 'host':
        return (
          <>
            <SectionTitle title="Host Control" subtitle="Manage the tournament lifecycle." />
            <HostControl state={state} action={action} busy={busy} />
          </>
        );
      default:
        return <p className="text-sm text-slate-500">This section does not exist.</p>;
    }
  };

  return (
    <ManagerModeLayout state={state} section={section.split('/')[0]!} connectionStatus={status}>
      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-700/50 text-sm text-red-300">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {error}
        </div>
      )}
      {renderSection()}
    </ManagerModeLayout>
  );
}

// ─── LegacyTrades: compatibility shim for ManagerTransfers.tsx ───────────────
// ManagerTransfers.tsx imports this; it renders the inline trade sub-tab content.
export function LegacyTrades({ state, action, busy }: { state: TournamentState; action: Act; busy: boolean; initialTab?: string }) {
  return <Transfers state={state} action={action} busy={busy} />;
}
