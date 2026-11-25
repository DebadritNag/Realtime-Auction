"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, FileText, Gavel, LoaderCircle, Search, ShieldCheck, TriangleAlert, UserPlus } from "lucide-react";
import { restoreService } from "@/services/restore.service";
import { normalizeError } from "@/services/api";
import { formatCr } from "@/lib/utils";
import type {
  RestoreCandidate, RestoreIssue, RestorePreview, RestorePreviewPlayer, RestoreRoomSettingsInput, RestoreSnapshot, RestoreUserHit,
} from "@/types/restore";

export interface RestoreWorkflowProps {
  auctionName: string;
  /** Timer settings taken from the create form; the server accepts only these for a restored room. */
  settings?: RestoreRoomSettingsInput;
  onCreated: (roomCode: string) => void;
}

const POTS: [string, string][] = [["GK", "Goalkeepers"], ["CB", "Centre backs"], ["FB", "Full backs"], ["MID", "Midfielders"], ["ATT", "Attackers"]];
const field = "w-full h-10 px-3 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-sm text-white focus:ring-1 focus:ring-[#00F5A0] focus:border-[#00F5A0] outline-none transition-colors duration-200";
const ghostButton = "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-[#7495B2]/30 bg-[#0A1724] text-xs font-bold text-white cursor-pointer transition-colors duration-200 hover:border-[#00F5A0]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5A0] disabled:opacity-50 disabled:cursor-not-allowed";

function parseSnapshot(text: string): RestoreSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new Error("The snapshot is not valid JSON: " + (e instanceof Error ? e.message : "parse error"));
  }
  if (!value || typeof value !== "object" || !Array.isArray((value as RestoreSnapshot).teams)) throw new Error("The snapshot needs a teams list.");
  return value as RestoreSnapshot;
}

function issueKey(i: RestoreIssue, n: number) {
  return [i.code, i.teamName ?? "", i.playerName ?? "", n].join("|");
}

/** Host resolution of one unresolved player: search the catalog, or create a restored-only player. */
function Resolver({ player, onPick, onManual }: { player: RestorePreviewPlayer; onPick: (c: { playerId: string }) => void; onManual: () => void }) {
  const inputId = useId();
  const [query, setQuery] = useState(player.name);
  const [results, setResults] = useState<RestoreCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestions = player.match.candidates ?? player.match.suggestions ?? [];

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await restoreService.searchCandidates({ search: query, limit: 8 }));
    } catch (e) {
      setError(normalizeError(e).message);
    } finally {
      setBusy(false);
    }
  };
  const list = results ?? suggestions;
  return (
    <div className="mt-2 rounded-lg border border-[#F3B928]/30 bg-[#F3B928]/5 p-2.5 space-y-2" data-testid="resolver">
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor={inputId} className="sr-only">Search the player database for {player.name}</label>
        <input id={inputId} className={field} value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} />
        <button type="button" className={ghostButton} onClick={() => void search()} disabled={busy}>
          {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5" aria-hidden="true" />}
          Search
        </button>
        <button type="button" className={ghostButton} onClick={onManual}>
          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
          Create manual player
        </button>
      </div>
      {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      {list.length ? (
        <ul className="grid gap-1.5" aria-label={"Matches for " + player.name}>
          {list.map((c) => (
            <li key={c.playerId}>
              <button type="button" onClick={() => onPick({ playerId: c.playerId })}
                className="w-full text-left flex items-center justify-between gap-2 rounded-md border border-[#7495B2]/25 bg-[#0A1724] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors duration-200 hover:border-[#00F5A0]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5A0]">
                <span className="truncate font-bold">{c.name}<span className="ml-1.5 font-normal text-[#8FA5B8]">{c.club ?? ""}</span></span>
                <span className="shrink-0 font-mono text-[#8FA5B8]">{c.position} · {c.ovr}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : results ? <p className="text-xs text-[#8FA5B8]">No players found for that search.</p> : null}
    </div>
  );
}

/** Host picks the registered user who will manage one restored team. Results already bound to another team are disabled. */
export function ManagerPicker({ teamName, selected, takenIds, onChange, search = restoreService.searchUsers }: {
  teamName: string;
  selected?: RestoreUserHit;
  takenIds: string[];
  onChange: (user: RestoreUserHit | null) => void;
  search?: (q: string, signal?: AbortSignal) => Promise<RestoreUserHit[]>;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RestoreUserHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    const q = query.trim();
    if (q.length < 3) { setError("Type at least 3 characters."); return; }
    setBusy(true);
    setError(null);
    try {
      setResults(await search(q));
    } catch (e) {
      setError(normalizeError(e).message);
    } finally {
      setBusy(false);
    }
  };
  if (selected) {
    return (
      <div className="flex items-center gap-2 text-xs" data-testid="manager-selected">
        <span className="truncate font-bold text-white">{selected.displayName || selected.username}<span className="ml-1.5 font-normal text-[#8FA5B8]">@{selected.username}</span></span>
        <button type="button" className={ghostButton} onClick={() => { onChange(null); setResults(null); setQuery(""); }} aria-label={"Clear manager for " + teamName}>Clear</button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5" data-testid="manager-picker">
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">Search registered users for {teamName}</label>
        <input id={inputId} className={field} value={query} placeholder="Username or display name" onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(); } }} />
        <button type="button" className={ghostButton} onClick={() => void run()} disabled={busy} aria-label={"Search users for " + teamName}>
          {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5" aria-hidden="true" />}
          Search
        </button>
      </div>
      {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      {results && results.length === 0 ? <p className="text-xs text-[#8FA5B8]">No registered users found.</p> : null}
      {results && results.length ? (
        <ul className="grid gap-1" aria-label={"Users for " + teamName}>
          {results.map((u) => {
            const taken = takenIds.includes(u.userId);
            return (
              <li key={u.userId}>
                <button type="button" disabled={taken} onClick={() => { onChange(u); setResults(null); }}
                  className="w-full text-left flex items-center justify-between gap-2 rounded-md border border-[#7495B2]/25 bg-[#0A1724] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors duration-200 hover:border-[#00F5A0]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5A0] disabled:opacity-50 disabled:cursor-not-allowed">
                  <span className="truncate font-bold">{u.displayName || u.username}<span className="ml-1.5 font-normal text-[#8FA5B8]">@{u.username}</span></span>
                  {taken ? <span className="shrink-0 text-[10px] text-[#8FA5B8]">Already bound</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
function matchLabel(p: RestorePreviewPlayer) {
  switch (p.match.kind) {
    case "MATCHED_FC26": return "FC26";
    case "MATCHED_DEFAULT_POOL": return "Default pool";
    case "RESOLVED": return "Chosen";
    case "MANUAL": return "Manual";
    case "AMBIGUOUS": return "Ambiguous";
    default: return "Unmatched";
  }
}

export function RestoreWorkflow({ auctionName, settings, onCreated }: RestoreWorkflowProps) {
  const textId = useId();
  const hostId = useId();
  const [text, setText] = useState("");
  const [snapshot, setSnapshot] = useState<RestoreSnapshot | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [hostTeam, setHostTeam] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<null | "template" | "preview" | "create">(null);
  const [error, setError] = useState<string | null>(null);
  const [createIssues, setCreateIssues] = useState<string[]>([]);
  /** Host-chosen manager per restored team name. Sent as bindings on create. */
  const [managers, setManagers] = useState<Record<string, RestoreUserHit>>({});

  const runPreview = useCallback(async (snap: RestoreSnapshot, preferredHost?: string) => {
    setBusy("preview");
    setError(null);
    try {
      const result = await restoreService.preview(snap);
      setPreview(result);
      setSnapshot(snap);
      setManagers((cur) => Object.fromEntries(Object.entries(cur).filter(([name]) => result.teams.some((t) => t.name === name))));
      setHostTeam((current) => {
        const names = result.teams.map((t) => t.name);
        const wanted = preferredHost ?? current ?? snap.hostTeam;
        return wanted && names.includes(wanted) ? wanted : names.includes(snap.hostTeam ?? "") ? (snap.hostTeam as string) : names[0] ?? "";
      });
    } catch (e) {
      setPreview(null);
      setError(normalizeError(e).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const loadTemplate = async () => {
    setBusy("template");
    setError(null);
    setCreateIssues([]);
    try {
      const [template] = await restoreService.templates();
      if (!template) throw new Error("No restore template is available on the server.");
      setText(JSON.stringify(template.snapshot, null, 2));
      await runPreview(template.snapshot, template.hostTeam ?? template.snapshot.hostTeam);
    } catch (e) {
      setBusy(null);
      setError(normalizeError(e).message);
    }
  };

  const previewFromText = async () => {
    setCreateIssues([]);
    try {
      await runPreview(parseSnapshot(text));
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Invalid snapshot.");
    }
  };

  /** Writes the host's choice back into the snapshot (the JSON is the single source of truth) and previews again. */
  const resolve = async (teamIndex: number, playerIndex: number, patch: { playerId: string } | { manual: { ovr?: number } }) => {
    if (!snapshot) return;
    const next: RestoreSnapshot = {
      ...snapshot,
      teams: snapshot.teams.map((t, ti) => ti !== teamIndex ? t : {
        ...t,
        players: t.players.map((p, pi) => {
          if (pi !== playerIndex) return p;
          const { playerId: _playerId, manual: _manual, ...rest } = p;
          void _playerId; void _manual;
          return { ...rest, ...patch };
        }),
      }),
    };
    setText(JSON.stringify(next, null, 2));
    await runPreview(next);
  };

  const confirm = async () => {
    if (!snapshot || !preview?.canConfirm) return;
    setBusy("create");
    setError(null);
    setCreateIssues([]);
    const bindings = Object.entries(managers).filter(([name]) => name !== hostTeam).map(([teamName, u]) => ({ teamName, userId: u.userId }));
    try {
      const created = await restoreService.create({
        auctionName: auctionName.trim(), hostTeamName: hostTeam || undefined, snapshot, ...(settings ? { settings } : {}),
        ...(bindings.length ? { bindings } : {}),
      });
      onCreated(created.roomCode);
    } catch (e) {
      const err = normalizeError(e);
      setError(err.message);
      setCreateIssues((err.issues ?? []).map((i) => i.message));
      setBusy(null);
    }
  };

  const critical = useMemo(() => preview?.issues.filter((i) => i.severity === "CRITICAL") ?? [], [preview]);
  const warnings = useMemo(() => preview?.issues.filter((i) => i.severity === "WARNING") ?? [], [preview]);
  const working = busy !== null;

  return (
    <section aria-labelledby="restore-heading" className="space-y-4" data-testid="restore-workflow">
      <div className="rounded-xl bg-[#081725] subtle-card-border p-4 sm:p-5 shadow-xl space-y-3">
        <div>
          <h2 id="restore-heading" className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wide text-white">1. Previous auction state</h2>
          <p className="text-[11px] text-[#7E92A5]">Load the shipped snapshot or paste your own, then preview it. Editing the JSON and previewing again is how you correct data.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" className={ghostButton} onClick={() => void loadTemplate()} disabled={working} data-testid="restore-load-template">
            {busy === "template" ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <FileText className="w-3.5 h-3.5" aria-hidden="true" />}
            Load template
          </button>
          <button type="button" className={ghostButton} onClick={() => void previewFromText()} disabled={working || !text.trim()} data-testid="restore-preview">
            {busy === "preview" ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5" aria-hidden="true" />}
            Preview snapshot
          </button>
        </div>
        <div>
          <label htmlFor={textId} className="block text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1">Snapshot JSON</label>
          <textarea id={textId} value={text} onChange={(e) => setText(e.target.value)} rows={6} spellCheck={false}
            placeholder='{"version":1,"name":"...","teams":[...]}'
            className="w-full min-h-[120px] max-h-[320px] p-3 rounded-lg bg-[#0A1724] border border-[#7495B2]/25 text-xs font-mono text-white focus:ring-1 focus:ring-[#00F5A0] focus:border-[#00F5A0] outline-none" />
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg bg-red-950/40 border border-red-500/50 p-3 text-xs text-red-200" data-testid="restore-error">
          <p>{error}</p>
          {createIssues.length ? <ul className="mt-1 list-disc pl-4">{createIssues.map((m, n) => <li key={n}>{m}</li>)}</ul> : null}
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="rounded-xl bg-[#081725] subtle-card-border p-4 sm:p-5 shadow-xl space-y-3" data-testid="restore-preview-panel">
            <div>
              <h2 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wide text-white">2. Preview: {preview.name}</h2>
              <p className="text-[11px] text-[#7E92A5]" data-testid="restore-totals">
                {preview.totals.teams} teams, {preview.totals.players} players ({preview.totals.retained} retained, {preview.totals.auction} auction acquired)
              </p>
            </div>

            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[520px] text-xs text-left" data-testid="restore-team-table">
                <caption className="sr-only">Restored teams</caption>
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[#8FA5B8]">
                    <th scope="col" className="py-1.5 pr-2 font-bold">Team</th>
                    <th scope="col" className="py-1.5 pr-2 font-bold">Squad</th>
                    <th scope="col" className="py-1.5 pr-2 font-bold">Slots left</th>
                    <th scope="col" className="py-1.5 pr-2 font-bold">Purse</th>
                    <th scope="col" className="py-1.5 pr-2 font-bold">Retained</th>
                    <th scope="col" className="py-1.5 font-bold">Auction</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.teams.map((t) => (
                    <tr key={t.name} className="border-t border-[#7495B2]/15" data-testid="restore-team-row" data-team={t.name}>
                      <th scope="row" className="py-1.5 pr-2 font-bold text-white">{t.name}</th>
                      <td className="py-1.5 pr-2 font-mono" data-testid="restore-squad">{t.squadSize}/20</td>
                      <td className="py-1.5 pr-2 font-mono" data-testid="restore-slots">{t.remainingSlots}</td>
                      <td className="py-1.5 pr-2 font-mono text-[#00F5A0]" data-testid="restore-purse">{formatCr(t.remainingPurseCr)}</td>
                      <td className="py-1.5 pr-2 font-mono" data-testid="restore-retained">{t.retainedCount}</td>
                      <td className="py-1.5 font-mono" data-testid="restore-auction">{t.auctionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              {preview.teams.map((t, ti) => {
                const open = expanded[t.name] === true;
                const panelId = "restore-squad-" + ti;
                return (
                  <div key={t.name} className="rounded-lg border border-[#7495B2]/20 bg-[#0A1724]">
                    <button type="button" aria-expanded={open} aria-controls={panelId}
                      onClick={() => setExpanded((cur) => ({ ...cur, [t.name]: !open }))}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-white cursor-pointer transition-colors duration-200 hover:bg-[#7495B2]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5A0] rounded-lg"
                      data-testid="restore-expand">
                      <span className="truncate">{t.name}<span className="ml-2 font-normal text-[#8FA5B8]">{t.actualPlayers} players</span></span>
                      <ChevronDown className={"w-4 h-4 shrink-0 transition-transform duration-200 " + (open ? "rotate-180" : "")} aria-hidden="true" />
                    </button>
                    {open ? (
                      <ul id={panelId} className="border-t border-[#7495B2]/15 divide-y divide-[#7495B2]/10" data-testid="restore-squad-list">
                        {t.players.map((p, pi) => {
                          const unresolved = p.match.kind === "AMBIGUOUS" || p.match.kind === "UNMATCHED";
                          return (
                            <li key={pi} className="px-3 py-2 text-xs" data-testid="restore-player" data-match={p.match.kind}>
                              <div className="flex items-center gap-2 min-w-0">
                                {p.acquisition === "RETENTION"
                                  ? <span data-testid="badge-retained" className="inline-flex shrink-0 items-center gap-1 rounded border border-[#f5c542]/50 bg-[#f5c542]/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#f5c542]"><ShieldCheck className="w-3 h-3" aria-hidden="true" />Retained</span>
                                  : <span data-testid="badge-auction" className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-400/50 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-200"><Gavel className="w-3 h-3" aria-hidden="true" />Auction acquired</span>}
                                <span className="truncate font-bold text-white">{p.name}</span>
                                {p.underdog ? <span data-testid="underdog-tag" className="shrink-0 rounded border border-fuchsia-400/50 bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-fuchsia-200">Underdog</span> : null}
                                <span className="ml-auto shrink-0 font-mono text-[#8FA5B8]">{p.position}</span>
                                <span className={"shrink-0 text-[10px] " + (unresolved ? "text-red-300 font-bold" : "text-[#8FA5B8]")}>{matchLabel(p)}</span>
                              </div>
                              {unresolved ? <Resolver player={p} onPick={(c) => void resolve(ti, pi, c)} onManual={() => void resolve(ti, pi, { manual: {} })} /> : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-[#081725] subtle-card-border p-4 sm:p-5 shadow-xl space-y-3">
            <h2 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wide text-white">3. Validation</h2>
            {critical.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-[#00F5A0]" data-testid="restore-valid"><CircleCheck className="w-4 h-4" aria-hidden="true" />No blocking issues.</p>
            ) : (
              <ul className="space-y-1" data-testid="restore-critical" aria-label="Blocking issues">
                {critical.map((i, n) => (
                  <li key={issueKey(i, n)} className="flex items-start gap-1.5 text-xs text-red-200"><CircleAlert className="w-4 h-4 shrink-0 text-red-400" aria-hidden="true" /><span>{i.message}</span></li>
                ))}
              </ul>
            )}
            {warnings.length ? (
              <ul className="space-y-1" data-testid="restore-warnings" aria-label="Warnings">
                {warnings.map((i, n) => (
                  <li key={issueKey(i, n)} className="flex items-start gap-1.5 text-xs text-amber-200"><TriangleAlert className="w-4 h-4 shrink-0 text-amber-400" aria-hidden="true" /><span>{i.message}</span></li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl bg-[#081725] subtle-card-border p-4 sm:p-5 shadow-xl space-y-3">
            <h2 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wide text-white">4. Remaining player pool</h2>
            <p className="text-xs text-[#cbd5e1]" data-testid="restore-pool-total">{preview.remainingPool.total} players are still available to auction.</p>
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {POTS.map(([key, label]) => (
                <div key={key} className="rounded-lg bg-[#0A1724] border border-[#7495B2]/25 p-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-[#8FA5B8]">{label}</dt>
                  <dd className="font-mono font-bold text-white" data-testid={"restore-pot-" + key}>{preview.remainingPool.byPot[key] ?? 0}</dd>
                </div>
              ))}
            </dl>
            <div>
              <label htmlFor={hostId} className="block text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider mb-1">Your team</label>
              <select id={hostId} value={hostTeam} onChange={(e) => { const name = e.target.value; setHostTeam(name); setManagers((cur) => { const next = { ...cur }; delete next[name]; return next; }); }} className={field + " cursor-pointer"} data-testid="restore-host-team">
                {preview.teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
              <p className="text-[10px] text-[#697E91] mt-1">Other managers claim the remaining teams when they join with the room code.</p>
            </div>
            <div className="space-y-2" data-testid="restore-managers">
              <h3 className="text-[10px] font-bold text-[#8FA5B8] uppercase tracking-wider">Manager for each team</h3>
              <p className="text-[11px] text-[#7E92A5]">Set this before sharing the room code. A chosen user is placed in their team automatically when they join and can enter a new team name. Teams left empty are picked by whoever joins.</p>
              <ul className="space-y-2">
                {preview.teams.map((t) => (
                  <li key={t.name} className="rounded-lg border border-[#7495B2]/20 bg-[#0A1724] p-2.5 space-y-1.5" data-testid="restore-manager-row" data-team={t.name}>
                    <p className="text-xs font-bold text-white">{t.name}</p>
                    {t.name === hostTeam
                      ? <p className="text-xs text-[#00F5A0]" data-testid="manager-you">You</p>
                      : <ManagerPicker teamName={t.name} selected={managers[t.name]}
                          takenIds={Object.entries(managers).filter(([name]) => name !== t.name).map(([, u]) => u.userId)}
                          onChange={(u) => setManagers((cur) => { const next = { ...cur }; if (u) next[t.name] = u; else delete next[t.name]; return next; })} />}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <button type="button" onClick={() => void confirm()} disabled={!preview.canConfirm || working || !auctionName.trim()}
            data-testid="restore-confirm"
            className="w-full h-12 rounded-lg bg-gradient-to-r from-[#00F59B] via-[#00DDA8] to-[#11C89F] hover:brightness-110 text-[#00150F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer glow-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 disabled:cursor-not-allowed">
            {busy === "create" ? <><LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />CREATING RESTORED ROOM...</> : "CONFIRM & CREATE RESTORED AUCTION"}
          </button>
          {!preview.canConfirm ? <p className="text-xs text-red-300" data-testid="restore-confirm-blocked">Resolve the blocking issues above before confirming.</p> : null}
        </>
      ) : null}
    </section>
  );
}
