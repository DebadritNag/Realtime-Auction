"use client";

import React from "react";
import { ShieldCheck, Gavel } from "lucide-react";
import { Team } from "@/types";
import { UnderdogTag } from "@/components/shared/UnderdogTag";
import { cn, formatCr, restoredPriceLabel } from "@/lib/utils";

export interface SquadOverviewProps {
  teams: Team[];
  currentTeamId?: string | null;
  maxSquadSize: number;
  /** "mine" shows only the viewer's team (side panel); "all" shows every team (Teams & Squads section). */
  mode: "mine" | "all";
}

const POSITIONS = [
  { key: "gk", label: "GK", bar: "bg-amber-400" },
  { key: "def", label: "DEF", bar: "bg-sky-400" },
  { key: "mid", label: "MID", bar: "bg-emerald-400" },
  { key: "att", label: "ATT", bar: "bg-rose-400" },
] as const;

function PlayerRow({ team, player, retained }: { team: Team; player: Team["squad"][number]; retained: boolean }) {
  return (
    <li className={cn("squad-row", retained ? "squad-row-retained" : "squad-row-auction")} data-testid={retained ? "squad-retained-player" : "squad-auction-player"} data-team-id={team.id}>
      {retained ? <ShieldCheck size={13} aria-hidden="true" /> : <Gavel size={13} aria-hidden="true" />}
      <span className="squad-row-name">{player.name}<UnderdogTag player={player} /></span>
      <span className="squad-row-pos">{player.subPosition || player.position}</span>
      <span className="squad-row-price" data-testid={player.restoredFromSnapshot ? "squad-restored-price" : undefined}>{player.restoredFromSnapshot ? restoredPriceLabel(player) : formatCr(player.soldPrice ?? player.basePrice)}</span>
      <span className="sr-only">{retained ? "Retained" : "Acquired at auction"}</span>
    </li>
  );
}

/** F: purse, squad size, remaining slots, position spread, and retained versus auction-acquired players kept visually apart. */
export function SquadOverview({ teams, currentTeamId, maxSquadSize, mode }: SquadOverviewProps) {
  const shown = mode === "mine" ? teams.filter((t) => t.id === currentTeamId || t.isCurrentUser) : teams;
  return (
    <section className="squad-overview" aria-label={mode === "mine" ? "Your squad" : "Teams and squads"} data-testid={"squad-overview-" + mode}>
      {shown.map((team) => {
        const retained = team.squad.filter((p) => p.isRetained);
        const acquired = team.squad.filter((p) => !p.isRetained);
        const total = Math.max(1, team.positions.total);
        return (
          <article key={team.id} className="squad-card" data-testid="squad-card" data-team-id={team.id}>
            <header>
              <h3>{team.name}{team.isCurrentUser || team.id === currentTeamId ? <em>You</em> : null}</h3>
              <span className="squad-purse" data-testid="squad-purse">{formatCr(team.budgetRemaining)}</span>
            </header>
            <dl className="squad-facts">
              <div><dt>Squad</dt><dd data-testid="squad-size">{team.squadCount}/{maxSquadSize}</dd></div>
              <div><dt>Slots left</dt><dd data-testid="squad-slots-left">{Math.max(0, maxSquadSize - team.squadCount)}</dd></div>
              <div><dt>Retained</dt><dd data-testid="squad-retained-count">{retained.length}</dd></div>
              <div><dt>Auction</dt><dd data-testid="squad-auction-count">{acquired.length}</dd></div>
            </dl>
            <div className="squad-spread" role="img" aria-label={POSITIONS.map((p) => p.label + " " + (team.positions[p.key] ?? 0)).join(", ")}>
              {POSITIONS.map((p) => {
                const n = team.positions[p.key] ?? 0;
                return n > 0 ? <span key={p.key} className={p.bar} style={{ width: (n / total) * 100 + "%" }} /> : null;
              })}
            </div>
            <p className="squad-spread-legend">{POSITIONS.map((p) => p.label + " " + (team.positions[p.key] ?? 0)).join(" · ")}</p>
            {retained.length > 0 ? (
              <>
                <h4 className="squad-group squad-group-retained"><ShieldCheck size={12} aria-hidden="true" /> Retained</h4>
                <ul>{retained.map((p) => <PlayerRow key={p.id} team={team} player={p} retained />)}</ul>
              </>
            ) : null}
            {acquired.length > 0 ? (
              <>
                <h4 className="squad-group squad-group-auction"><Gavel size={12} aria-hidden="true" /> Auction acquired</h4>
                <ul>{acquired.map((p) => <PlayerRow key={p.id} team={team} player={p} retained={false} />)}</ul>
              </>
            ) : null}
            {team.squad.length === 0 ? <p className="squad-empty">No players yet.</p> : null}
          </article>
        );
      })}
    </section>
  );
}
