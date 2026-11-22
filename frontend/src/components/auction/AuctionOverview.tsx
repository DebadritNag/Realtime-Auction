"use client";

import React from "react";
import type { RoomStateDTO } from "@/types/backend";
import { formatCr } from "@/lib/utils";

/** Overview section: progress and totals taken from the authoritative ROOM_STATE. */
export function AuctionOverview({ snapshot }: { snapshot: RoomStateDTO }) {
  // Players restored from a snapshot were not sold in this auction: no price, not part of spend or top sales.
  const auctionSales = snapshot.soldPlayers.filter((p): p is typeof p & { priceCr: number } => !p.isRetained && p.acquisitionType !== "RETENTION" && !p.restoredFromSnapshot && p.priceCr != null);
  const restoredAuction = snapshot.soldPlayers.filter((p) => p.restoredFromSnapshot && !p.isRetained && p.acquisitionType !== "RETENTION").length;
  const retainedSales = snapshot.soldPlayers.length - auctionSales.length - restoredAuction;
  // Restored squad players were owned before this auction, so they are not part of its pool.
  const pool = snapshot.players.length - retainedSales - restoredAuction;
  const remaining = snapshot.players.filter((p) => p.status === "WAITING" || p.status === "ACTIVE").length;
  const unsold = snapshot.players.filter((p) => p.status === "UNSOLD").length;
  const spend = auctionSales.reduce((sum, p) => sum + p.priceCr, 0);
  const top = [...auctionSales].sort((a, b) => b.priceCr - a.priceCr).slice(0, 5);
  const nameOf = (id: string) => snapshot.players.find((p) => p.id === id)?.name ?? "Player";
  const teamOf = (id: string) => snapshot.teams.find((t) => t.id === id)?.name ?? "Team";
  const tiles: [string, string, string][] = [
    ["Sold at auction", String(auctionSales.length) + " / " + pool, "overview-sold"],
    ["Remaining", String(remaining), "overview-remaining"],
    ["Unsold", String(unsold), "overview-unsold"],
    ["Retained", String(retainedSales), "overview-retained"],
    ["Auction spend", formatCr(spend), "overview-spend"],
    ["Average sale", formatCr(auctionSales.length ? spend / auctionSales.length : 0), "overview-average"],
  ];
  return (
    <section className="auction-overview" aria-label="Auction overview" data-testid="auction-overview">
      <dl className="auction-overview-tiles">
        {tiles.map(([label, value, id]) => (
          <div key={id}><dt>{label}</dt><dd data-testid={id}>{value}</dd></div>
        ))}
      </dl>
      <h3>Top purchases</h3>
      {top.length === 0 ? (
        <p className="squad-empty">No sales yet.</p>
      ) : (
        <ol className="auction-overview-top" data-testid="overview-top">
          {top.map((p) => (
            <li key={p.id}><span>{nameOf(p.playerId)}</span><span>{teamOf(p.teamId)}</span><strong>{formatCr(p.priceCr)}</strong></li>
          ))}
        </ol>
      )}
    </section>
  );
}
