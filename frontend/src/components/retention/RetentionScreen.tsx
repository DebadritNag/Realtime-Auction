"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { retentionService } from "@/services/retention.service";
import { normalizeError } from "@/services/api";
import { formatCr } from "@/lib/utils";
import type { RetentionGroup, RetentionPlayerDTO, RoomStateDTO } from "@/types/backend";
import { RetentionFilters } from "./RetentionFilters";
import { RetentionPlayerCard } from "./RetentionPlayerCard";
import { RetentionTeamSwitcher } from "./RetentionTeamSwitcher";
import { RetainedPlayersPanel } from "./RetainedPlayersPanel";
import { FinalizeRetentionsDialog } from "./FinalizeRetentionsDialog";

const PAGE_SIZE = 50;

export interface RetentionScreenProps {
  roomCode: string;
  /** Latest ROOM_STATE. Counts, purses and availability are always derived from it. */
  snapshot: RoomStateDTO;
  isHost: boolean;
}

export function RetentionScreen({ roomCode, snapshot, isHost }: RetentionScreenProps) {
  const retention = snapshot.retention;
  const currentTeamId = snapshot.currentUserTeam.id;
  const [viewTeamId, setViewTeamId] = useState(currentTeamId);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<RetentionGroup>("ALL");
  const [players, setPlayers] = useState<RetentionPlayerDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmPlayer, setConfirmPlayer] = useState<RetentionPlayerDTO | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showFinalize, setShowFinalize] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // The list is refetched when picks change anywhere in the room, so retained players disappear for everyone.
  const picksKey = (retention?.picks ?? []).map((p) => p.id).join(",");

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
  }, [roomCode, search, group, picksKey, reloadKey]);

  const loadMore = useCallback(async () => {
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
  }, [roomCode, search, group, players.length]);

  const viewTeam = snapshot.teams.find((t) => t.id === viewTeamId) ?? snapshot.currentUserTeam;
  const viewStats = retention?.teams.find((t) => t.teamId === viewTeam.id);
  const viewPicks = useMemo(
    () => (retention?.picks ?? []).filter((p) => p.teamId === viewTeam.id),
    [retention, viewTeam.id]
  );

  if (!retention) {
    return <ErrorState title="Retention unavailable" message="The server did not send retention data for this room." />;
  }

  const price = retention.config.priceCr;
  const finalized = retention.phase === "FINALIZED";

  const disabledReason = (): string | null => {
    if (finalized) return "Retention is finalized";
    if (viewTeam.id !== currentTeamId) return "Only this team's manager can retain";
    if ((viewStats?.retainedCount ?? 0) >= retention.config.maxPerTeam) return "Retention limit reached (" + retention.config.maxPerTeam + "/" + retention.config.maxPerTeam + ")";
    if ((viewStats?.remainingPurseCr ?? viewTeam.remainingBudgetCr) < price) return "Not enough purse";
    if (pending) return "Retaining…";
    return null;
  };
  const reason = disabledReason();

  const confirmRetain = async () => {
    if (!confirmPlayer) return;
    setPending(true);
    setActionError(null);
    try {
      await retentionService.retain(roomCode, confirmPlayer.id);
      setConfirmPlayer(null);
    } catch (e) {
      setActionError(normalizeError(e).message);
      setConfirmPlayer(null);
    } finally {
      setPending(false);
    }
  };

  const runHostAction = async (action: () => Promise<void>, close: () => void) => {
    setPending(true);
    setActionError(null);
    try {
      await action();
      close();
    } catch (e) {
      setActionError(normalizeError(e).message);
      close();
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="retention-heading" className="space-y-4 rounded-2xl border border-[#242c3d] bg-[#0e121a] p-4 shadow-lg sm:p-5" data-testid="retention-screen">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="retention-heading" className="flex items-center gap-2 text-lg font-black text-[#f8fafc]">
            <ShieldCheck className="h-5 w-5 text-[#00ff87]" aria-hidden="true" /> Player Retention
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-[#94a3b8]">
            Each team can retain up to {retention.config.maxPerTeam} players from the FC26 database before the auction. Every retained player costs {formatCr(price)} and is added directly to the squad.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {finalized ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#00ff87]/40 bg-[#00ff87]/10 px-2.5 py-1 text-xs font-bold text-[#00ff87]" data-testid="retention-finalized-badge">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Retentions finalized
            </span>
          ) : null}
          {isHost && (retention.picks.length > 0 || finalized) ? (
            <Button type="button" size="sm" variant="secondary" leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setShowReset(true)}>
              Reset retentions
            </Button>
          ) : null}
          {isHost && !finalized ? (
            <Button type="button" size="sm" variant="primary" onClick={() => setShowFinalize(true)}>
              Finalize retentions
            </Button>
          ) : null}
        </div>
      </header>

      {!isHost && !finalized ? (
        <p className="text-xs text-[#94a3b8]" data-testid="retention-nonhost-note">
          The host will finalize retentions once every team has chosen. You can retain 0 to {retention.config.maxPerTeam} players.
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">{actionError}</p>
      ) : null}

      <RetentionTeamSwitcher teams={snapshot.teams} retention={retention} currentTeamId={currentTeamId} viewTeamId={viewTeam.id} onSelect={setViewTeamId} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
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
                  <RetentionPlayerCard key={player.id} player={player} disabledReason={reason} onRetain={setConfirmPlayer} />
                ))}
              </ul>
              {players.length < total ? (
                <div className="text-center">
                  <Button type="button" size="sm" variant="secondary" onClick={() => void loadMore()} isLoading={loadingMore}>
                    Show more players
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="lg:col-span-4">
          <RetainedPlayersPanel teamName={viewTeam.name} picks={viewPicks} />
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmPlayer !== null}
        onClose={() => (pending ? undefined : setConfirmPlayer(null))}
        onConfirm={() => void confirmRetain()}
        title={"Retain " + (confirmPlayer?.fullName || confirmPlayer?.name || "player") + "?"}
        message={
          "This costs " + formatCr(price) + " from " + viewTeam.name + "'s purse and adds the player directly to the squad."
        }
        confirmLabel={"Retain for " + formatCr(price)}
        variant="primary"
        isLoading={pending}
      />

      {isHost ? (
        <FinalizeRetentionsDialog
          isOpen={showFinalize}
          onClose={() => setShowFinalize(false)}
          onConfirm={() => void runHostAction(() => retentionService.finalize(roomCode), () => setShowFinalize(false))}
          isLoading={pending}
          teams={snapshot.teams}
          retention={retention}
        />
      ) : null}
      {isHost ? (
        <ConfirmDialog
          isOpen={showReset}
          onClose={() => setShowReset(false)}
          onConfirm={() => void runHostAction(() => retentionService.reset(roomCode), () => setShowReset(false))}
          title="Reset all retentions?"
          message="Every retained player returns to the pool and every purse is restored. Teams can retain again."
          confirmLabel="Reset retentions"
          isLoading={pending}
        />
      ) : null}
    </section>
  );
}
