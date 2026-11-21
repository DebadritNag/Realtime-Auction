"use client";
import React, { useEffect, useRef } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, Flag, ShieldCheck, X } from "lucide-react";
import "./RetentionAnnouncementOverlay.css";
import { PlayerImage } from "@/components/shared/PlayerImage";
import { UnderdogTag } from "@/components/shared/UnderdogTag";
import { useAuctionStore } from "@/stores/auction.store";
import { formatCr } from "@/lib/utils";
import type { RetentionAnnouncement } from "@/lib/retention-announcements";
import type { RetentionAnnouncedPlayerDTO, RetentionCompletionAnnouncementDTO, RetentionTurnAnnouncementDTO } from "@/types/backend";

export interface AutoDismissMs { retained: number; skipped: number; completed: number }
export const DEFAULT_AUTO_DISMISS_MS: AutoDismissMs = { retained: 9000, skipped: 9000, completed: 12000 };
const CONFETTI = Array.from({ length: 24 }, (_, i) => i);

function PlayerCard({ player }: { player: RetentionAnnouncedPlayerDTO }) {
  return (
    <li className="ra-player" data-testid="announcement-player">
      <PlayerImage player={{ id: player.playerId, photoUrl: player.imageUrl ?? undefined, name: player.name }} alt="" className="ra-player-photo" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-[#f8fafc]">
          {player.fullName || player.name}
          <UnderdogTag player={{ playerTag: player.playerTag ?? undefined }} />
        </p>
        <p className="truncate text-[11px] text-[#94a3b8]">{player.position}{player.club ? " · " + player.club : ""}</p>
      </div>
      <div className="text-right">
        <p className="font-mono text-xl font-black leading-none text-[#f5c542]" aria-label={"Overall " + player.ovr}>{player.ovr}</p>
        <p className="mt-1 font-mono text-[11px] font-bold text-[#00ff87]">{formatCr(player.priceCr)}</p>
      </div>
    </li>
  );
}

function TurnBody({ turn }: { turn: RetentionTurnAnnouncementDTO }) {
  const skipped = turn.kind === "SKIPPED";
  return (
    <>
      <p className="ra-eyebrow">Retention · Team {turn.teamOrder} of {turn.totalTeams}</p>
      <h2 id="ra-title" className="ra-title" data-testid="announcement-title">
        {skipped ? "TEAM " + turn.teamOrder + " HAS SKIPPED RETENTION" : "TEAM " + turn.teamOrder + " RETENTION COMPLETE"}
      </h2>
      <p className="ra-team" data-testid="announcement-team">{turn.teamName}</p>
      {skipped ? (
        <p className="ra-calm">No players retained. {turn.teamName} keeps its full purse.</p>
      ) : (
        <ul className="ra-players" data-testid="announcement-players">
          {turn.players.map((p) => <PlayerCard key={p.playerId} player={p} />)}
        </ul>
      )}
      <dl className="ra-stats">
        <div><dt>Retained</dt><dd data-testid="announcement-count">{turn.players.length}/3</dd></div>
        <div><dt>Retention spent</dt><dd className="text-[#f5c542]" data-testid="announcement-spent">{formatCr(turn.spentCr)}</dd></div>
        <div><dt>Remaining purse</dt><dd className="text-[#00ff87]" data-testid="announcement-purse">{formatCr(turn.remainingPurseCr)}</dd></div>
      </dl>
      <p className="ra-next" data-testid="announcement-next">
        {turn.nextTeamName ? (
          <><ArrowRight className="h-4 w-4" aria-hidden="true" /> NEXT UP: TEAM {turn.nextTeamOrder} · {turn.nextTeamName}</>
        ) : (
          <><Flag className="h-4 w-4" aria-hidden="true" /> That was the last team</>
        )}
      </p>
    </>
  );
}

function CompletionBody({ completion, roomCode, onDismiss }: { completion: RetentionCompletionAnnouncementDTO; roomCode: string | null; onDismiss: () => void }) {
  return (
    <>
      <p className="ra-eyebrow">Retention · Final</p>
      <h2 id="ra-title" className="ra-title" data-testid="announcement-title">ALL TEAMS HAVE COMPLETED RETENTION!</h2>
      <div className="ra-table-wrap">
        <table className="ra-table" data-testid="announcement-overview">
          <thead><tr><th scope="col">Team</th><th scope="col">Retained</th><th scope="col">Spent</th><th scope="col">Purse left</th></tr></thead>
          <tbody>
            {completion.teams.map((team) => (
              <tr key={team.teamId}>
                <th scope="row"><span className="ra-order">{team.order}</span> {team.name}</th>
                <td className="font-mono">{team.retainedCount}/3</td>
                <td className="font-mono text-[#f5c542]">{formatCr(team.spentCr)}</td>
                <td className="font-mono text-[#00ff87]">{formatCr(team.remainingPurseCr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ra-next"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> The host can now finalize retentions.</p>
      {roomCode ? (
        <a href={"/room/" + roomCode + "/retention"} onClick={onDismiss} className="ra-link">
          <ClipboardList className="h-4 w-4" aria-hidden="true" /> Go to retention summary
        </a>
      ) : null}
    </>
  );
}

export function AnnouncementDialog({ announcement, roomCode, onDismiss, autoDismissMs = DEFAULT_AUTO_DISMISS_MS }: {
  announcement: RetentionAnnouncement; roomCode: string | null; onDismiss: () => void; autoDismissMs?: AutoDismissMs;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);
  const duration = announcement.kind === "ALL_COMPLETED" ? autoDismissMs.completed : announcement.kind === "SKIPPED" ? autoDismissMs.skipped : autoDismissMs.retained;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismissRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [announcement.id]);

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), duration);
    return () => clearTimeout(timer);
  }, [announcement.id, duration]);

  const tone = announcement.kind === "SKIPPED" ? "ra-skipped" : announcement.kind === "ALL_COMPLETED" ? "ra-complete" : "ra-retained";
  return (
    <div className={"ra-backdrop " + tone} data-testid="retention-announcement" data-announcement-id={announcement.id} data-kind={announcement.kind}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      {announcement.kind !== "SKIPPED" ? (
        <div className="ra-confetti" aria-hidden="true">
          {CONFETTI.map((i) => <span key={i} style={{ left: (i * 4.2 + 2) % 100 + "%", animationDelay: (i % 8) * 0.18 + "s", animationDuration: 2.6 + (i % 5) * 0.5 + "s" }} data-gold={i % 3 === 0 ? "1" : undefined} />)}
        </div>
      ) : null}
      <div role="dialog" aria-modal="true" aria-labelledby="ra-title" className="ra-panel">
        <button ref={closeRef} type="button" onClick={onDismiss} aria-label="Dismiss announcement" className="ra-close">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <ShieldCheck className="ra-badge" aria-hidden="true" />
        {announcement.kind === "ALL_COMPLETED"
          ? <CompletionBody completion={announcement.completion} roomCode={roomCode} onDismiss={onDismiss} />
          : <TurnBody turn={announcement.turn} />}
      </div>
    </div>
  );
}

/** Mounted once for the whole app. Renders whatever the store queued from backend-confirmed retention events. */
export function RetentionAnnouncementOverlay({ autoDismissMs }: { autoDismissMs?: AutoDismissMs }) {
  const announcement = useAuctionStore((s) => s.retentionAnnouncement);
  const roomCode = useAuctionStore((s) => s.roomCode);
  const dismiss = useAuctionStore((s) => s.dismissRetentionAnnouncement);
  if (!announcement) return null;
  return <AnnouncementDialog announcement={announcement} roomCode={roomCode} onDismiss={dismiss} autoDismissMs={autoDismissMs} />;
}
