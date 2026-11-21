"use client";
import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, RotateCcw, ShieldCheck, SkipForward, Users, X } from "lucide-react";
import { PlayerImage } from "@/components/shared/PlayerImage";
import { UnderdogTag } from "@/components/shared/UnderdogTag";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { retentionService } from "@/services/retention.service";
import { normalizeError } from "@/services/api";
import { formatCr } from "@/lib/utils";
import type { RetentionGroup, RetentionPlayerDTO, RetentionStateDTO, RoomStateDTO } from "@/types/backend";
import { RetentionFilters } from "./RetentionFilters";
import { RetentionPlayerCard, primaryPosition } from "./RetentionPlayerCard";
import { RetentionProgress } from "./RetentionTeamSwitcher";
import { FinalizeRetentionsDialog } from "./FinalizeRetentionsDialog";
import { HandoverView, SummaryView, WaitingView } from "./RetentionViews";

const PAGE_SIZE = 50;

export interface RetentionScreenProps {
  roomCode: string;
  /** Latest ROOM_STATE. Active team, counts, purses and availability are always derived from it. */
  snapshot: RoomStateDTO;
  isHost: boolean;
}

/** Runs a server command and reports its failure. The server decides whether the command is allowed. */
function useCommand() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(normalizeError(e).message);
      return false;
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, run, clear: () => setError(null) };
}

function Stat({ label, value, testId, tone = "text-[#f8fafc]" }: { label: string; value: string; testId: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-[#94a3b8]">{label}</p>
      <p className={"font-mono text-sm font-black " + tone} data-testid={testId}>{value}</p>
    </div>
  );
}

function RetentionHeader({ snapshot, retention, slotsUsed, purse, spent }: {
  snapshot: RoomStateDTO; retention: RetentionStateDTO; slotsUsed: number; purse: number; spent: number;
}) {
  const active = snapshot.teams.find((t) => t.id === retention.activeTeamId);
  const order = retention.order.find((o) => o.teamId === retention.activeTeamId)?.order;
  const done = retention.phase === "ALL_TEAMS_COMPLETED" || retention.phase === "FINALIZED";
  return (
    <header className="space-y-3" data-testid="retention-header">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="retention-heading" className="flex items-center gap-2 text-lg font-black text-[#f8fafc]" data-testid="retention-auction-name">
          <ShieldCheck className="h-5 w-5 text-[#00ff87]" aria-hidden="true" /> {snapshot.room.auctionName}
        </h2>
        <span className="rounded bg-[#1e2433] px-2 py-0.5 font-mono text-xs font-black text-[#00ff87]" data-testid="retention-room-code">{snapshot.roomCode}</span>
        <span className="rounded border border-[#f5c542]/50 bg-[#f5c542]/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-[#f5c542]" data-testid="retention-phase">Retention</span>
      </div>
      <p className="max-w-3xl text-xs text-[#94a3b8]">
        Teams choose one at a time, in order. Each team can retain up to {retention.config.maxPerTeam} players from the FC26 database. Every retained player costs {formatCr(retention.config.priceCr)} and is added to the squad when the host finalizes.
      </p>
      {done || !active ? (
        <p className="rounded-xl border border-[#00ff87]/30 bg-[#00ff87]/5 px-3 py-2 text-sm font-bold text-[#00ff87]" data-testid="retention-all-done">
          {retention.phase === "FINALIZED" ? "Retentions are finalized." : "All teams have completed retention."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#242c3d] bg-[#0e121a] p-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="retention-team-summary">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <p className="text-[10px] font-bold uppercase text-[#94a3b8]">Team {order} of {retention.progress.total}</p>
            <p className="truncate text-base font-black text-[#f8fafc]" data-testid="retention-team-name">{active.name}</p>
            <p className="truncate text-[11px] text-[#94a3b8]" data-testid="retention-team-manager">
              Manager: {active.managerUsername ? "@" + active.managerUsername : "not available"}
            </p>
          </div>
          <Stat label="Starting purse" value={formatCr(active.startingBudgetCr)} testId="retention-team-starting" />
          <Stat label="Remaining purse" value={formatCr(purse)} testId="retention-team-purse" tone="text-amber-400" />
          <Stat label="Retention spend" value={formatCr(spent)} testId="retention-team-spend" />
          <Stat label="Slots used" value={slotsUsed + "/" + retention.config.maxPerTeam} testId="retention-team-count" />
        </div>
      )}
    </header>
  );
}

function ActiveSelection({ roomCode, snapshot, retention }: { roomCode: string; snapshot: RoomStateDTO; retention: RetentionStateDTO }) {
  const { pending, error, run } = useCommand();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<RetentionGroup>("ALL");
  const [players, setPlayers] = useState<RetentionPlayerDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<"confirm" | "skip" | null>(null);

  const draft = retention.ownDraft.players;
  const ownIds = new Set(draft.map((p) => p.id));
  const max = retention.config.maxPerTeam;
  const price = retention.config.priceCr;
  // The list refetches whenever any team's reservation or this team's selection changes.
  const availabilityKey = retention.reservedPlayerIds.join(",") + "|" + draft.map((p) => p.id).join(",");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError(null);
    retentionService
      .players(roomCode, { search, group, limit: PAGE_SIZE }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setPlayers(res.players);
        setTotal(res.total);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setListError(normalizeError(e).message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [roomCode, search, group, availabilityKey, reloadKey]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await retentionService.players(roomCode, { search, group, offset: players.length, limit: PAGE_SIZE });
      setPlayers((current) => {
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...res.players.filter((p) => !seen.has(p.id))];
      });
      setTotal(res.total);
    } catch (e) {
      setListError(normalizeError(e).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const reason = pending
    ? "Working…"
    : draft.length >= max
      ? "Retention limit reached (" + max + "/" + max + ")"
      : retention.ownDraft.remainingPurseCr < price
        ? "Not enough purse"
        : null;
  const reserved = new Set(retention.reservedPlayerIds);
  const cardState = (p: RetentionPlayerDTO) => (ownIds.has(p.id) || p.selected ? "selected" : reserved.has(p.id) ? "unavailable" : "available") as "selected" | "unavailable" | "available";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" data-testid="retention-active-view">
      <p className="rounded-xl border border-[#00ff87]/40 bg-[#00ff87]/10 px-3 py-2 text-sm font-bold text-[#00ff87] lg:col-span-12" role="status" data-testid="retention-your-turn">
        It is your turn. Choose up to {max} players, then confirm. Or skip retention to keep your full purse.
      </p>
      {error ? <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200 lg:col-span-12">{error}</p> : null}

      <div className="space-y-3 lg:col-span-8">
        <RetentionFilters group={group} onGroupChange={setGroup} onSearchChange={setSearch} />
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="status" aria-label="Loading players">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : listError ? (
          <ErrorState title="Could not load players" message={listError} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : players.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No players found" description="Try a different search or position filter." />
        ) : (
          <>
            <p className="text-[11px] text-[#94a3b8]" data-testid="retention-result-count">Showing {players.length} of {total} players</p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="retention-player-list">
              {players.map((player) => (
                <RetentionPlayerCard key={player.id} player={player} state={cardState(player)} disabledReason={reason} onRetain={(p) => void run(() => retentionService.select(roomCode, p.id))} />
              ))}
            </ul>
            {players.length < total ? (
              <div className="text-center">
                <Button type="button" size="sm" variant="secondary" onClick={() => void loadMore()} isLoading={loadingMore}>Show more players</Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <aside className="space-y-3 lg:col-span-4" aria-label="Your selection">
        <section className="rounded-xl border border-[#242c3d] bg-[#0e121a] p-3 lg:sticky lg:top-4" data-testid="retention-selection">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#f8fafc]">
            <ClipboardCheck className="h-4 w-4 text-[#00ff87]" aria-hidden="true" /> Your selection
            <span className="ml-auto font-mono text-[11px] text-[#94a3b8]" data-testid="retention-selection-count">{draft.length}/{max}</span>
          </h3>
          {draft.length === 0 ? (
            <p className="py-3 text-center text-xs text-[#94a3b8]" data-testid="retention-selection-empty">No players selected yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5" data-testid="retention-selection-list">
              {draft.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-lg bg-[#151a24] px-2 py-1.5 text-xs" data-testid="retention-selected-player">
                  <PlayerImage player={{ id: p.id, photoUrl: p.photoUrl, name: p.name }} alt="" className="h-10 w-8 rounded" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-[#f8fafc]">{p.fullName || p.name}<UnderdogTag player={p} /></span>
                    <span className="flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
                      <Badge variant="position" position={primaryPosition(p)} size="sm">{primaryPosition(p)}</Badge> {p.ovr} OVR · <span className="font-mono text-amber-400">{formatCr(p.retentionPriceCr)}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={"Remove " + (p.fullName || p.name)}
                    disabled={pending}
                    onClick={() => void run(() => retentionService.remove(roomCode, p.id))}
                    className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#242c3d] text-[#cbd5e1] transition-colors duration-200 hover:border-red-500/50 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-[#94a3b8]">
            Total {formatCr(retention.ownDraft.spentCr)} · Purse after {formatCr(retention.ownDraft.remainingPurseCr)}
          </p>
          <div className="mt-3 grid gap-2">
            <Button type="button" variant="primary" size="sm" disabled={draft.length === 0 || pending} onClick={() => setDialog("confirm")} leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
              Confirm retention
            </Button>
            {draft.length === 0 ? <p className="text-center text-[10px] text-[#94a3b8]" data-testid="retention-confirm-hint">Select at least one player to confirm, or skip retention.</p> : null}
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setDialog("skip")} leftIcon={<SkipForward className="h-4 w-4" aria-hidden="true" />}>
              Skip retention
            </Button>
          </div>
        </section>
      </aside>

      <ConfirmDialog
        isOpen={dialog === "confirm"}
        onClose={() => setDialog(null)}
        onConfirm={() => void run(() => retentionService.confirm(roomCode)).then(() => setDialog(null))}
        title={"Confirm " + draft.length + " retained player" + (draft.length === 1 ? "" : "s") + "?"}
        message={"This locks your turn and costs " + formatCr(retention.ownDraft.spentCr) + ". Squads and purses update when the host finalizes."}
        confirmLabel="Confirm and lock turn"
        variant="primary"
        isLoading={pending}
      />
      <ConfirmDialog
        isOpen={dialog === "skip"}
        onClose={() => setDialog(null)}
        onConfirm={() => void run(() => retentionService.skip(roomCode)).then(() => setDialog(null))}
        title="Skip retention?"
        message={snapshot.currentUserTeam.name + " retains nobody and keeps the full purse" + (draft.length ? "; your current selection is discarded" : "") + ". This ends your turn."}
        confirmLabel="Skip retention"
        variant="primary"
        isLoading={pending}
      />
    </div>
  );
}

export function RetentionScreen({ roomCode, snapshot, isHost }: RetentionScreenProps) {
  const retention = snapshot.retention;
  const host = useCommand();
  const [dialog, setDialog] = useState<"finalize" | "reset" | "skipActive" | null>(null);
  if (!retention) {
    return <ErrorState title="Retention unavailable" message="The server did not send retention data for this room." />;
  }
  const myTeamId = snapshot.currentUserTeam.id;
  const active = retention.phase === "TEAM_SELECTING";
  const myTurn = retention.turns.find((t) => t.teamId === myTeamId);
  const stats = retention.teams.find((t) => t.teamId === (retention.activeTeamId ?? myTeamId));
  const draftActive = active && retention.canAct;
  const slotsUsed = draftActive ? retention.ownDraft.players.length : stats?.retainedCount ?? 0;
  const purse = draftActive ? retention.ownDraft.remainingPurseCr : stats?.remainingPurseCr ?? snapshot.currentUserTeam.remainingBudgetCr;
  const spent = draftActive ? retention.ownDraft.spentCr : stats?.spentCr ?? 0;
  const teamsLite = snapshot.teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <section aria-labelledby="retention-heading" className="space-y-4 rounded-2xl border border-[#242c3d] bg-[#0e121a] p-4 shadow-lg sm:p-5" data-testid="retention-screen">
      <RetentionHeader snapshot={snapshot} retention={retention} slotsUsed={slotsUsed} purse={purse} spent={spent} />

      {isHost && retention.phase !== "NOT_STARTED" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setDialog("reset")}>
            Reset retentions
          </Button>
          {retention.phase === "ALL_TEAMS_COMPLETED" ? (
            <Button type="button" size="sm" variant="primary" onClick={() => setDialog("finalize")}>Finalize retentions</Button>
          ) : null}
        </div>
      ) : null}
      {host.error ? <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">{host.error}</p> : null}

      <RetentionProgress retention={retention} currentTeamId={myTeamId} />

      {retention.phase === "TEAM_SELECTING" && retention.canAct ? (
        <ActiveSelection roomCode={roomCode} snapshot={snapshot} retention={retention} />
      ) : retention.phase === "TEAM_SELECTING" && myTurn ? (
        <HandoverView turn={myTurn} retention={retention} teams={teamsLite} currentTeamId={myTeamId} onSkipActive={retention.canSkipForActive ? () => setDialog("skipActive") : undefined} />
      ) : retention.phase === "TEAM_SELECTING" ? (
        <WaitingView retention={retention} teams={teamsLite} currentTeamId={myTeamId} onSkipActive={retention.canSkipForActive ? () => setDialog("skipActive") : undefined} />
      ) : (
        <SummaryView retention={retention} teams={teamsLite} currentTeamId={myTeamId} isHost={isHost} onFinalize={() => setDialog("finalize")} />
      )}

      {isHost ? (
        <FinalizeRetentionsDialog
          isOpen={dialog === "finalize"}
          onClose={() => setDialog(null)}
          onConfirm={() => void host.run(() => retentionService.finalize(roomCode)).then(() => setDialog(null))}
          isLoading={host.pending}
          teams={snapshot.teams}
          retention={retention}
        />
      ) : null}
      {isHost ? (
        <ConfirmDialog
          isOpen={dialog === "reset"}
          onClose={() => setDialog(null)}
          onConfirm={() => void host.run(() => retentionService.reset(roomCode)).then(() => setDialog(null))}
          title="Reset all retentions?"
          message="All teams return to the start of retention. Every selection and confirmed turn is discarded and purses are restored."
          confirmLabel="Reset retentions"
          isLoading={host.pending}
        />
      ) : null}
      {isHost ? (
        <ConfirmDialog
          isOpen={dialog === "skipActive"}
          onClose={() => setDialog(null)}
          onConfirm={() => void host.run(() => retentionService.skip(roomCode)).then(() => setDialog(null))}
          title={"Skip " + (retention.activeTeamName ?? "this team") + "?"}
          message="The team's unconfirmed selection is discarded and its turn is recorded as skipped. Use this when its manager is absent."
          confirmLabel="Skip this turn"
          isLoading={host.pending}
        />
      ) : null}
    </section>
  );
}
