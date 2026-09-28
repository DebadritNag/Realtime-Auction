'use client';
import { useEffect, useRef, useState } from 'react';
import type { TournamentState } from '@/types/manager-mode';
import type { ManagerAction } from '@/services/manager-mode.service';

export function FixtureFormatControl({ state, action, busy }: {
  state: TournamentState; action: (action: ManagerAction) => Promise<void>; busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<TournamentState['format'] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const days = state.teams.length % 2 ? state.teams.length : state.teams.length - 1;
  const matches = state.teams.length * (state.teams.length - 1) / 2;
  const active = state.status === 'ACTIVE' && state.seasonData?.seasons.find(s => s.id === state.seasonData?.currentSeasonId)?.status === 'ACTIVE';
  const secondLeg = state.fixtures.some(f => f.matchday > days);
  const played = state.fixtures.some(f => f.matchday > days && f.status === 'COMPLETED');
  const completeDouble = state.format === 'DOUBLE_ROUND_ROBIN' && state.fixtures.length === matches * 2;
  const label = (format: TournamentState['format']) => format === 'DOUBLE_ROUND_ROBIN' ? 'Double Round Robin' : 'Single Round Robin';
  useEffect(() => { if (target) dialog.current?.showModal(); else dialog.current?.close(); }, [target]);
  async function confirm() {
    if (!target || saving) return;
    setSaving(true); setError('');
    try { await action({ type: 'UPDATE_FIXTURE_FORMAT', format: target }); setTarget(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update fixtures. Please retry.'); }
    finally { setSaving(false); }
  }
  const button = 'rounded-xl border border-emerald-700/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed';
  return <section className="rounded-2xl border border-white/10 bg-[#0a1628]/70 p-5 space-y-4">
    <h3 className="text-base font-bold text-white">Fixture Format</h3>
    <p>Current format: {label(state.format)}</p>
    <p className="text-sm text-slate-400">{new Set(state.fixtures.map(f => f.matchday)).size} matchdays · {state.fixtures.length} matches · {state.fixtures.filter(f => f.status === 'COMPLETED').length} completed</p>
    <div className="flex flex-wrap gap-3">
      <button className={button} disabled={busy || !active || secondLeg || state.format === 'SINGLE_ROUND_ROBIN'} onClick={() => { setError(''); setTarget('SINGLE_ROUND_ROBIN'); }}>Single</button>
      <button className={button} disabled={busy || !active || completeDouble} onClick={() => { setError(''); setTarget('DOUBLE_ROUND_ROBIN'); }}>{state.format === 'DOUBLE_ROUND_ROBIN' && !completeDouble ? 'Repair Double Schedule' : 'Double'}</button>
    </div>
    {secondLeg && <p className="text-sm text-slate-400">{played ? 'Cannot switch to Single Round Robin because second-leg fixtures have already been played.' : 'Switching to Single is disabled to preserve existing reverse fixtures.'}</p>}
    <dialog ref={dialog} onCancel={() => setTarget(null)} onClose={() => setTarget(null)} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/15 bg-[#0d1929] p-6 text-white backdrop:bg-black/75" aria-labelledby="fixture-format-title">
      <h3 id="fixture-format-title" className="text-xl font-bold">{target === 'DOUBLE_ROUND_ROBIN' ? 'Upgrade Fixture Format?' : 'Update Fixture Format?'}</h3>
      <div className="space-y-3 py-5 text-sm">
        <p>Current: {label(state.format)} · {new Set(state.fixtures.map(f => f.matchday)).size} matchdays · {state.fixtures.length} matches</p>
        <p>New: {target && label(target)} · {days * (target === 'DOUBLE_ROUND_ROBIN' ? 2 : 1)} matchdays · {matches * (target === 'DOUBLE_ROUND_ROBIN' ? 2 : 1)} matches</p>
        <p>Existing fixtures and results will be preserved. {target === 'DOUBLE_ROUND_ROBIN' && 'Only missing reverse home/away fixtures will be added.'}</p>
        <p>Squads, transfers, budgets and the current transfer window will remain unchanged.</p>
        {error && <p role="alert" className="text-red-300">{error}</p>}
      </div>
      <div className="flex gap-3"><button className={button} disabled={saving} onClick={() => setTarget(null)}>Cancel</button><button className={button} disabled={saving || busy} onClick={() => void confirm()}>{saving ? 'Updating…' : target === 'DOUBLE_ROUND_ROBIN' ? 'Upgrade to Double' : 'Confirm Single'}</button></div>
    </dialog>
  </section>;
}
