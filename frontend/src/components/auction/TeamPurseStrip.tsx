"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";
import { Team } from "@/types";
import { cn, formatCr } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";

export interface TeamPurseStripProps {
  teams: Team[];
  currentTeamId?: string | null;
  highestBidderTeamId?: string | null;
  maxSquadSize: number;
}

const initials = (team: Team) => team.shortName || team.name.slice(0, 2).toUpperCase();

/** B: horizontal purse overview. Values come straight from the latest ROOM_STATE, so they change as bids and sales land. */
export function TeamPurseStrip({ teams, currentTeamId, highestBidderTeamId, maxSquadSize }: TeamPurseStripProps) {
  const openTeamQuickView = useUIStore((s) => s.openTeamQuickView);
  return (
    <section className="auction-purse-strip" aria-label="Team purses" data-testid="team-purse-strip">
      <ul>
        {teams.map((team) => {
          const mine = team.id === currentTeamId || team.isCurrentUser;
          const leading = team.id === highestBidderTeamId;
          return (
            <li key={team.id}>
              <button
                type="button"
                onClick={() => openTeamQuickView(team.id)}
                aria-label={"View " + team.name + " squad"}
                className={cn("auction-purse-card", mine && "auction-purse-mine", leading && "auction-purse-leading")}
                data-testid="purse-card"
                data-team-id={team.id}
              >
                <span className="auction-purse-badge" aria-hidden="true">{initials(team)}</span>
                <span className="auction-purse-body">
                  <span className="auction-purse-name">
                    {team.name}
                    {mine ? <em>You</em> : null}
                    {leading ? <em className="auction-purse-lead">Leading</em> : null}
                  </span>
                  <span className="auction-purse-amount" data-testid="purse-amount">{formatCr(team.budgetRemaining)}</span>
                  <span className="auction-purse-meta">
                    <span data-testid="purse-slots">{team.squadCount}/{maxSquadSize} squad</span>
                    {(team.retainedCount ?? 0) > 0 ? (
                      <span className="auction-purse-retained" data-testid="purse-retained"><ShieldCheck size={11} aria-hidden="true" /> {team.retainedCount} retained</span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
