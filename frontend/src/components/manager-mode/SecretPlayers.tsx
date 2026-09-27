'use client';
import { useState, useEffect, useRef } from 'react';
import type { TournamentState, ManagerPlayer } from '@/types/manager-mode';
import type { ManagerAction } from '@/services/manager-mode.service';
import { formatCrore } from '@/lib/money';
import { panel, button } from './ManagerSetup';

const PRICE_UNITS = 90;       // ₹45 Cr
const PRICE_LABEL = '₹45 Cr';

interface Props {
  state: TournamentState;
  action: (a: ManagerAction) => Promise<void>;
  busy: boolean;
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function positionBadge(pos: string) {
  const isGK = pos === 'GK';
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${isGK ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'}`}>
      {pos}
    </span>
  );
}

// ─── Anonymous Hero Card ──────────────────────────────────────────────────────
function AnonCard() {
  return (
    <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-white/10 bg-[#0a0f1e] relative overflow-hidden">
      {/* Shimmer background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-emerald-900/10 pointer-events-none" />

      {/* Silhouette */}
      <div className="w-20 h-20 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center">
        <svg className="w-12 h-12 text-white/20" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        </svg>
      </div>

      <div className="text-center space-y-1">
        <p className="text-base font-bold text-white/30 tracking-widest">SECRET PLAYER</p>
        <div className="flex items-center justify-center gap-2">
          <span className="text-slate-500 text-sm">Name:</span>
          <span className="font-bold text-white/20">???</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-slate-500 text-sm">Position:</span>
          <span className="font-bold text-white/20">???</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-slate-500 text-sm">OVR:</span>
          <span className="font-bold text-white/20">???</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[11px] text-center w-full">
        {['PAC','SHO','PAS','DRI','DEF','PHY'].map(s => (
          <div key={s} className="bg-white/5 rounded px-1 py-0.5">
            <span className="text-slate-500">{s}</span>
            <span className="ml-1 text-white/20">???</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reveal animation ────────────────────────────────────────────────────────
function RevealAnimation({ player, teamName, onClose }: { player: ManagerPlayer; teamName: string; onClose: () => void }) {
  const [phase, setPhase] = useState<'dark' | 'glow' | 'flip' | 'show'>('dark');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setPhase('glow'), 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    if (phase === 'glow') timerRef.current = setTimeout(() => setPhase('flip'), 700);
    if (phase === 'flip') timerRef.current = setTimeout(() => setPhase('show'), 1100);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-md">
      {/* Particle glow rings */}
      {phase !== 'dark' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`absolute rounded-full border border-emerald-400/30 transition-all duration-700 ${phase === 'glow' ? 'w-48 h-48 opacity-100' : 'w-80 h-80 opacity-0'}`} />
          <div className={`absolute rounded-full border border-purple-400/20 transition-all duration-1000 ${phase === 'glow' ? 'w-64 h-64 opacity-80' : 'w-96 h-96 opacity-0'}`} />
        </div>
      )}

      <div className={`relative flex flex-col items-center gap-4 transition-all duration-500 ${phase === 'dark' ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`}>

        {/* Card */}
        <div className={`rounded-2xl border-2 overflow-hidden w-64 transition-all duration-700 ${phase === 'show' ? 'border-emerald-400 shadow-[0_0_60px_rgba(52,211,153,0.4)]' : 'border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.3)]'}`}>

          {/* Image area */}
          <div className="relative bg-gradient-to-br from-[#0d1829] to-[#050d1a] h-48 flex items-center justify-center">
            {phase !== 'show' ? (
              <div className={`w-24 h-24 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center transition-all duration-300 ${phase === 'flip' ? 'scale-110 opacity-0' : ''}`}>
                <svg className="w-14 h-14 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 animate-[fadeIn_0.5s_ease-in]">
                {player.imageUrl ? (
                  <img src={player.imageUrl} alt={player.name} className="w-28 h-28 object-contain" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center">
                    <span className="text-3xl font-black text-emerald-400">{player.name.charAt(0)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-4 bg-[#060e1a] space-y-2">
            {phase === 'show' ? (
              <>
                <div className="text-center">
                  <p className="text-lg font-extrabold text-white">{player.name}</p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    {positionBadge(player.position)}
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      {player.overall != null ? `${player.overall} OVR` : 'OVR N/A'}
                    </span>
                  </div>
                </div>
                {Object.keys(player.stats).length > 0 && (
                  <div className="grid grid-cols-3 gap-1 text-[11px] text-center mt-2">
                    {(['pace','shooting','passing','dribbling','defending','physical'] as const).map(k => (
                      player.stats[k] != null ? (
                        <div key={k} className="bg-white/5 rounded px-1 py-0.5">
                          <span className="text-slate-400">{k.slice(0,3).toUpperCase()}</span>
                          <span className="ml-1 font-bold text-white">{player.stats[k]}</span>
                        </div>
                      ) : null
                    ))}
                  </div>
                )}
                <div className="text-center pt-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    HERO · UNTRADEABLE
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center py-2 space-y-1">
                <p className="text-white/30 tracking-widest text-sm">???</p>
                <p className="text-white/20 text-xs">???</p>
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        {phase === 'show' && (
          <div className="text-center space-y-1">
            <p className="text-xl font-extrabold text-white">HERO REVEALED</p>
            <p className="text-sm text-slate-400">Added to <span className="text-emerald-400 font-semibold">{teamName}</span></p>
            <button onClick={onClose} className={button + ' mt-3'}>
              Continue
            </button>
          </div>
        )}

        {phase !== 'show' && (
          <p className="text-sm text-slate-500 animate-pulse">Revealing your Hero…</p>
        )}
      </div>
    </div>
  );
}

// ─── Confirm purchase modal ───────────────────────────────────────────────────
function ConfirmModal({ budgetUnits, onConfirm, onCancel, busy }: { budgetUnits: number; onConfirm: () => void; onCancel: () => void; busy: boolean }) {
  const afterBudget = budgetUnits - PRICE_UNITS;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-[#0e0a06] shadow-2xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">BUY SECRET PLAYER</h2>
            <p className="text-sm text-slate-400 mt-0.5">This purchase is permanent.</p>
          </div>
        </div>

        <div className="rounded-xl bg-white/5 border border-white/8 p-4 text-sm text-slate-300 space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Price</span>
            <span className="font-bold text-white">{PRICE_LABEL}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Your Budget</span>
            <span className="font-semibold text-white">{formatCrore(budgetUnits)}</span>
          </div>
          <div className="flex justify-between border-t border-white/8 pt-2">
            <span className="text-slate-400">Budget After Purchase</span>
            <span className={`font-bold ${afterBudget < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{formatCrore(afterBudget)}</span>
          </div>
        </div>

        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-300 space-y-1">
          <p>• You can acquire only <strong>ONE Hero player</strong> during this entire Manager Mode.</p>
          <p>• The player <strong>cannot be traded or sold</strong>.</p>
          <p>• The identity is revealed after purchase — no reroll.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-40">
            {busy ? 'Processing…' : 'Confirm Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Secret Players section ──────────────────────────────────────────────
export function SecretPlayers({ state, action, busy }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState('');
  const sp = state.secretPlayers;
  const mine = state.teams.find(t => t.id === state.myTeamId)!;
  const enabled = state.status === 'ACTIVE' && state.transferWindowOpen && state.modeStatus !== 'ENDED';

  // The revealed Hero player (if this team owns one and it's in the visible players list)
  const heroPlayer: ManagerPlayer | undefined = sp?.claimed && sp.playerId
    ? state.players.find(p => p.id === sp.playerId)
    : undefined;

  async function handleBuy() {
    setError('');
    setConfirming(false);
    try {
      await action({ type: 'BUY_SECRET_PLAYER' });
      // After buying, the player is added and revealed=false — open the reveal screen
      setRevealing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed.');
    }
  }

  async function handleReveal() {
    setError('');
    try {
      await action({ type: 'REVEAL_SECRET_PLAYER' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reveal failed.');
    }
  }

  // If the reveal screen is open but the hero is already revealed in state, close the screen on next re-render
  useEffect(() => {
    if (revealing && sp?.revealed) setRevealing(false);
  }, [revealing, sp?.revealed]);

  // The hero player after buy but before reveal (not yet in state.players since visiblePlayers filters it)
  // We show the reveal button in this case.
  const pendingReveal = sp?.claimed && !sp.revealed;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Secret Players</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Acquire a mystery Hero legend for your squad. Identity hidden until purchase. One per team, forever.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-700/50 text-sm text-red-300">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {error}
        </div>
      )}

      {/* Status row */}
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-white/8 bg-[#0a1628]/70 px-4 py-3 flex items-center justify-between">
          <span className="text-slate-400">Available Heroes</span>
          <span className="font-bold text-white">{sp?.availableCount ?? '—'}</span>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#0a1628]/70 px-4 py-3 flex items-center justify-between">
          <span className="text-slate-400">Price</span>
          <span className="font-bold text-emerald-400">{PRICE_LABEL}</span>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#0a1628]/70 px-4 py-3 flex items-center justify-between">
          <span className="text-slate-400">Your Eligibility</span>
          <span className={`font-bold ${sp?.teamEligible ? 'text-emerald-400' : 'text-slate-500'}`}>
            {sp?.teamEligible ? 'AVAILABLE' : 'USED'}
          </span>
        </div>
      </div>

      {/* Main content */}
      {!sp?.claimed ? (
        /* ── Not yet purchased ── */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          <div className="space-y-4">
            <AnonCard />
            <div className="text-center space-y-2">
              <p className="text-sm text-slate-400 text-center">Price: <span className="text-white font-semibold">{PRICE_LABEL}</span></p>
              <button
                className="w-full cursor-pointer px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!enabled || !sp?.teamEligible || busy || (sp?.availableCount ?? 0) === 0 || mine.transferBudgetUnits < PRICE_UNITS}
                onClick={() => setConfirming(true)}
              >
                BUY SECRET PLAYER
              </button>
              {!enabled && <p className="text-xs text-slate-500">Requires an active tournament with an open transfer window.</p>}
              {enabled && mine.transferBudgetUnits < PRICE_UNITS && <p className="text-xs text-red-400">Insufficient budget (need {PRICE_LABEL}).</p>}
              {enabled && (sp?.availableCount ?? 0) === 0 && <p className="text-xs text-slate-500">All Secret Players have been claimed.</p>}
            </div>
          </div>

          {/* Info panel */}
          <div className={`${panel} sm:col-span-1 lg:col-span-2 h-fit`}>
            <h3 className="font-bold text-white">How it works</h3>
            <ul className="text-sm text-slate-400 space-y-2">
              <li className="flex gap-2"><span className="text-amber-400 shrink-0">✦</span>One Hero player per team — across the entire Manager Mode, forever.</li>
              <li className="flex gap-2"><span className="text-amber-400 shrink-0">✦</span>Identity is completely hidden until after purchase. No preview, no reroll.</li>
              <li className="flex gap-2"><span className="text-amber-400 shrink-0">✦</span>Fixed cost of {PRICE_LABEL}. No negotiation, no bidding.</li>
              <li className="flex gap-2"><span className="text-amber-400 shrink-0">✦</span>Once revealed, the Hero joins your squad and can play in all matches.</li>
              <li className="flex gap-2"><span className="text-red-400 shrink-0">✕</span>Hero cannot be traded, sold, released or included in buyout offers.</li>
            </ul>
          </div>
        </div>
      ) : pendingReveal ? (
        /* ── Purchased but not yet revealed ── */
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </div>
            <h3 className="text-xl font-bold text-white">SECRET PLAYER ACQUIRED</h3>
            <p className="text-sm text-slate-400">Your Hero is waiting. Click below to reveal their identity.</p>
          </div>

          <AnonCard />

          <button
            className="cursor-pointer px-8 py-3 rounded-xl text-base font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 transition-all shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:shadow-[0_0_50px_rgba(245,158,11,0.6)] disabled:opacity-50"
            disabled={busy}
            onClick={() => { setRevealing(true); void handleReveal(); }}
          >
            REVEAL PLAYER
          </button>
        </div>
      ) : heroPlayer ? (
        /* ── Revealed — show Hero card ── */
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className={`${panel} flex flex-col items-center gap-3 min-w-[220px]`}>
            {heroPlayer.imageUrl ? (
              <img src={heroPlayer.imageUrl} alt={heroPlayer.name} className="w-24 h-24 object-contain rounded-lg bg-white/5" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center">
                <span className="text-3xl font-black text-emerald-400">{heroPlayer.name.charAt(0)}</span>
              </div>
            )}
            <div className="text-center">
              <p className="font-bold text-white text-lg leading-tight">{heroPlayer.name}</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                {positionBadge(heroPlayer.position)}
                {heroPlayer.overall != null && (
                  <span className="text-emerald-400 font-bold text-sm">{heroPlayer.overall} OVR</span>
                )}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              HERO · UNTRADEABLE
            </span>
          </div>

          <div className={`${panel} flex-1`}>
            <h3 className="font-bold text-white">SECRET PLAYER CLAIMED</h3>
            <p className="text-sm text-slate-400 mt-1">
              <span className="text-white font-semibold">{heroPlayer.name}</span> has joined {mine.name} as your Hero player.
            </p>
            <p className="text-sm text-slate-500 mt-2">You have already used your Secret Player entitlement for this Manager Mode.</p>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              <p>• Available in Team Sheet, Starting XI and Bench</p>
              <p>• Can score goals and earn match statistics</p>
              <p>• Cannot be sold, traded or included in transfers</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modals */}
      {confirming && (
        <ConfirmModal
          budgetUnits={mine.transferBudgetUnits}
          onConfirm={handleBuy}
          onCancel={() => setConfirming(false)}
          busy={busy}
        />
      )}

      {revealing && sp?.revealed && heroPlayer && (
        <RevealAnimation
          player={heroPlayer}
          teamName={mine.name}
          onClose={() => setRevealing(false)}
        />
      )}

      {/* If reveal animation open but hero not in state yet, show a loading overlay */}
      {revealing && (!sp?.revealed || !heroPlayer) && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
            <p className="text-amber-300 text-sm font-semibold animate-pulse">Revealing your Hero…</p>
          </div>
        </div>
      )}
    </div>
  );
}
