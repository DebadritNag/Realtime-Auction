'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { managerService, type SetupPreview } from '@/services/manager-mode.service';
import { roomService } from '@/services/room.service';
import { useAuthStore } from '@/stores/auth.store';
import { useManagerStore } from '@/stores/manager-mode.store';
import { formatCrore, croreToUnits } from '@/lib/money';
import type { ImportReport } from '@/types/manager-mode';
export const panel = 'rounded-2xl border border-slate-800 bg-[#111822] p-5 space-y-4';
export const button = 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed';
export const field = 'w-full rounded-lg border border-slate-700 bg-[#0d1929] p-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors [color-scheme:dark]';
export function ResultManagerAction({ code }: {
    code: string;
}) { const user = useAuthStore(s => s.user); const [target, setTarget] = useState<{
    id: string;
    existing?: string;
} | null>(null); const [error, setError] = useState(''); useEffect(() => { let live = true; void roomService.getState(code).then(async (r) => { if (r.status !== 'COMPLETED' || r.host.userId !== user?.id)
    return; if (live)
    setTarget({ id: r.roomId }); try {
    const p = await managerService.preview(r.roomId);
    if (live)
        setTarget({ id: r.roomId, existing: p.existingId ?? undefined });
}
catch (e) {
    if (live)
        setError(e instanceof Error ? e.message : 'Manager Mode unavailable.');
} }).catch(() => { }); return () => { live = false; }; }, [code, user?.id]); if (!target)
    return null; return <div className={panel}><h2 className="text-xl font-bold">Take your squad into Manager Mode</h2><p>Play matches in FC24, record results, and manage your tournament here.</p><Link className={button} href={target.existing ? '/manager-mode/' + target.existing : '/manager-mode/create/' + target.id}>{target.existing ? 'Open Manager Mode' : 'Create Manager Mode'}</Link>{error && <p role="alert">{error}</p>}</div>; }
export function ManagerIndex() { const { inbox, error, inboxLoading } = useManagerStore(); return <div className="max-w-5xl mx-auto p-6 space-y-6"><h1 className="text-3xl font-bold">Manager Mode</h1><p className="text-slate-400">Your tournaments and invitations. Hosts can create a tournament from completed auction results.</p>{error && <p role="alert">{error}</p>}{inboxLoading && !inbox.length && <p>Loading tournaments…</p>}{!inboxLoading && !error && !inbox.length && <p>No tournaments yet.</p>}<div className="grid md:grid-cols-2 gap-4">{inbox.map(t => <Link className={panel} key={t.id} href={'/manager-mode/' + t.id}><h2 className="text-xl">{t.name}</h2><p>{t.teamName} · {t.status}</p><p className="text-emerald-300">{t.invitation === 'PENDING' ? 'Invitation waiting' : t.invitation} · {t.unread} unread</p></Link>)}</div></div>; }
export function ManagerSetup({ auctionId }: {
    auctionId: string;
}) {
    const router = useRouter();
    const [preview, setPreview] = useState<SetupPreview | null>(null);
    const [name, setName] = useState('');
    const [budget, setBudget] = useState('100');
    const [carry,setCarry]=useState(true);
    const [csv, setCsv] = useState('');
    const [file, setFile] = useState('');
    const [report, setReport] = useState<ImportReport | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [format, setFormat] = useState('SINGLE_ROUND_ROBIN');
    useEffect(() => { let live = true; managerService.preview(auctionId).then(p => { if (!live)
        return; setPreview(p); setName(p.name + ' League'); if (p.existingId)
        router.replace('/manager-mode/' + p.existingId); }).catch(e => { if (live)
        setError(e.message); }); return () => { live = false; }; }, [auctionId, router]);
    async function upload(f: File) { setBusy(true); setError(''); setReport(null); setCsv(''); setFile(f.name); try {
        if (f.size > 2000000)
            throw Error('CSV must be smaller than 2 MB.');
        const text = await f.text();
        const r = await managerService.importPreview(auctionId, text);
        setCsv(text);
        setReport(r);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed.');
    }
    finally {
        setBusy(false);
    } }
    async function submit() { setBusy(true); setError(''); try {
        const t = await managerService.create(auctionId, { name, startingBudgetUnits: croreToUnits(Number(budget)), addUnusedAuctionPurse:carry, csv, format });
        router.push('/manager-mode/' + t.id);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Unable to create tournament.';
        // Surface known domain errors with friendly text
        setError(
          msg.includes('ALREADY_EXISTS') ? 'A Manager Mode tournament already exists for this auction.' :
          msg.includes('DUPLICATE') ? 'A duplicate record was found. Please try again.' :
          msg.includes('INVALID_REFERENCE') ? 'A required profile or record is missing. Ensure all managers have logged in.' :
          msg.includes('INVALID_MANAGER_MODE_STATE') ? 'A data validation error occurred. Check the budget and team settings.' :
          msg.includes('REQUIRED_FIELD') ? 'A required field is missing. Please fill in all settings.' :
          msg
        );
    }
    finally {
        setBusy(false);
    } }
    return <div className="max-w-6xl mx-auto p-6 space-y-6"><h1 className="text-3xl font-bold">Create Manager Mode</h1>{error && <p role="alert" className="text-red-300">{error}</p>}{!preview ? <p>Loading completed auction…</p> : <><section className={panel}><label>Tournament name<input className={field} value={name} maxLength={100} onChange={e => setName(e.target.value)}/></label><label>Base transfer budget (Cr)<input className={field} type="number" min="0" max="10000" step="0.5" value={budget} onChange={e => setBudget(e.target.value)}/></label><label className="flex gap-2"><input type="checkbox" checked={carry} onChange={e=>setCarry(e.target.checked)}/>Add unused auction purse</label><p>Set base budget to 0 for auction remainder only.</p><label>Format<select className={field} value={format} onChange={e => setFormat(e.target.value)}><option value="SINGLE_ROUND_ROBIN">Single round robin</option><option value="DOUBLE_ROUND_ROBIN">Double round robin</option></select></label><p>{preview.teams.length} teams · {preview.purchases.length} owned players · {preview.players.filter(p => p.status === 'UNSOLD').length} auction free agents</p></section><div className="grid md:grid-cols-2 gap-4">{preview.teams.map(t => <details key={t.id} className={panel}><summary>{t.logoEmoji} {t.name} · {t.managerUsername??"Username unavailable"} · {t.playerIds.length} players · {formatCrore(t.spentUnits)} auction spend · {formatCrore(t.startingBudgetUnits - t.spentUnits)} remaining</summary><p>Base transfer budget: ₹{budget||0} Cr</p><p>Unused auction purse: {formatCrore(t.startingBudgetUnits-preview.purchases.filter(p=>p.teamId===t.id).reduce((sum,p)=>sum+p.priceUnits,0))}{carry?" added":" not added"}</p><p>Opening Manager Mode budget: ₹{(Number(budget)||0)+(carry?(t.startingBudgetUnits-preview.purchases.filter(p=>p.teamId===t.id).reduce((sum,p)=>sum+p.priceUnits,0))/2:0)} Cr</p>{preview.players.filter(p => t.playerIds.includes(p.id)).map(p => <p key={p.id}>{p.name} · {p.subPosition ?? 'Position unavailable'} · {p.ovr} OVR · {formatCrore(preview.purchases.find(x => x.playerId === p.id)?.priceUnits ?? 0)}</p>)}</details>)}</div><section className={panel}><h2>External player CSV (optional)</h2><p className="text-sm text-slate-400">Required: player_id (or sofifa_id/ea_id), name, overall, position. Auction players and repeated IDs are excluded.</p><input aria-label="External player CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f)
        void upload(f); }}/>{file && <p>{file}</p>}{report && <><p>{report.rowsDetected} rows · {report.validPlayers} valid · {report.duplicates} duplicates excluded · {report.invalidRows.length} invalid</p>{report.invalidRows.slice(0, 20).map(r => <p key={r.row} className="text-red-300">Row {r.row}: {r.reason}</p>)}</>}</section><label className="flex gap-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I have reviewed all teams, squads, and the transfer budget. Create the tournament and invite these managers.</label><button className={button} disabled={busy || !confirmed || Boolean(report?.invalidRows.length) || (Boolean(file) && !report)} onClick={() => void submit()}>{busy ? 'Working…' : 'Confirm & invite managers'}</button></>}</div>;
}
