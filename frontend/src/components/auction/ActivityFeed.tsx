"use client";

import React from "react";
import { ArrowUpRight, Ban, BadgeCheck, ShieldCheck, UserPlus } from "lucide-react";
import type { ActivityEntry } from "@/stores/auction.store";
import { formatCr } from "@/lib/utils";

const ICONS = { BID: ArrowUpRight, SOLD: BadgeCheck, UNSOLD: Ban, RECALLED: Ban, SQUAD: UserPlus, RETENTION: ShieldCheck } as const;
const TONES: Record<ActivityEntry["kind"], string> = {
  BID: "text-[#00ff87]", SOLD: "text-[#f5c542]", UNSOLD: "text-[#94a3b8]", RECALLED: "text-[#94a3b8]", SQUAD: "text-sky-300", RETENTION: "text-[#f5c542]",
};

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false });

function describe(e: ActivityEntry): React.ReactNode {
  const team = <strong>{e.teamName ?? "A team"}</strong>;
  const player = <strong>{e.playerName ?? "the player"}</strong>;
  switch (e.kind) {
    case "BID": return <>{team} bid <strong>{formatCr(e.amountCr ?? 0)}</strong> for {player}</>;
    case "SOLD": return <>{player} sold to {team} for <strong>{formatCr(e.amountCr ?? 0)}</strong></>;
    case "UNSOLD": return <>{player} went unsold</>;
    case "RECALLED": return <>{player} recalled to the pool</>;
    case "SQUAD": return <>{player} joins the {team} squad{e.detail ? " (" + e.detail.toLowerCase() + ")" : ""}</>;
    case "RETENTION": return <>{team} {e.detail}</>;
  }
}

/** D: compact log of backend-confirmed activity (bids, sales, unsold, squad additions, retention). */
export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section className="auction-activity" aria-label="Live activity" data-testid="activity-feed">
      <header>
        <h3>Live activity</h3>
        <span>{entries.length} events</span>
      </header>
      {entries.length === 0 ? (
        <p className="auction-activity-empty">Activity appears here as bids and sales are confirmed.</p>
      ) : (
        <ol role="log" aria-live="polite">
          {entries.map((e) => {
            const Icon = ICONS[e.kind];
            return (
              <li key={e.id} data-kind={e.kind} data-testid="activity-entry">
                <Icon size={14} className={TONES[e.kind]} aria-hidden="true" />
                <span className="auction-activity-text">{describe(e)}</span>
                <time dateTime={new Date(e.at).toISOString()}>{timeOf(e.at)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
