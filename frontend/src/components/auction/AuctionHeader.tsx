"use client";

import React from "react";
import { BarChart3, Crown, LayoutDashboard, LogOut, ShieldCheck, Users, Radio } from "lucide-react";
import { ConnectionStatus } from "@/components/auction/ConnectionStatus";
import type { ConnectionStateStatus } from "@/stores/connection.store";
import { cn } from "@/lib/utils";

export type AuctionTabId = "live" | "retained" | "teams" | "overview";

const TAB_ICONS: Record<AuctionTabId, typeof Radio> = { live: Radio, retained: ShieldCheck, teams: Users, overview: BarChart3 };

export interface AuctionHeaderProps {
  auctionName: string;
  roomCode: string;
  /** e.g. "LIVE AUCTION" or "PAUSED". */
  phase: string;
  phaseTone: "live" | "paused";
  potName: string;
  round: number | null;
  connectionStatus: ConnectionStateStatus;
  latencyMs?: number | null;
  isHost: boolean;
  tabs: { id: AuctionTabId; label: string; count?: number }[];
  activeTab: AuctionTabId;
  onTab: (tab: AuctionTabId) => void;
  onExit: () => void;
  /** Mobile and tablet shortcuts (Players, Teams, My Squad, AI). */
  tools?: React.ReactNode;
}

/** A: auction name, room code, phase, current pot and round, connection, host marker and navigation. */
export function AuctionHeader({ auctionName, roomCode, phase, phaseTone, potName, round, connectionStatus, latencyMs, isHost, tabs, activeTab, onTab, onExit, tools }: AuctionHeaderProps) {
  return (
    <header className="auction-header" data-testid="auction-header">
      <div className="auction-header-top">
        <div className="auction-header-title">
          <h1 data-testid="auction-name">{auctionName || "Auction"}</h1>
          <span className="auction-code" data-testid="auction-room-code">{roomCode}</span>
          <span className={cn("auction-phase", phaseTone === "paused" && "auction-phase-paused")} data-testid="auction-phase">
            <span className="auction-phase-dot" aria-hidden="true" />
            {phase}
          </span>
          {potName ? <span className="auction-pot" data-testid="auction-pot">Pot: <strong>{potName}</strong>{round ? <> · Round {round}</> : null}</span> : null}
          {isHost ? (
            <span className="auction-host-badge" data-testid="auction-host-badge"><Crown size={12} aria-hidden="true" /> Host</span>
          ) : null}
        </div>
        <div className="auction-header-actions">
          <ConnectionStatus status={connectionStatus} latencyMs={latencyMs} />
          <button type="button" onClick={onExit} title="Exit to lobby (your membership is preserved)" className="auction-exit">
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Exit</span>
          </button>
        </div>
      </div>
      <div className="auction-header-bottom">
        <nav className="auction-nav" role="tablist" aria-label="Auction sections">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.id] ?? LayoutDashboard;
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={"auction-tab-" + tab.id}
                aria-selected={selected}
                aria-controls={"auction-panel-" + tab.id}
                onClick={() => onTab(tab.id)}
                className={cn("auction-tab", selected && "auction-tab-active")}
              >
                <Icon size={15} aria-hidden="true" />
                {tab.label}
                {tab.count !== undefined ? <span className="auction-tab-count" data-testid={"tab-count-" + tab.id}>{tab.count}</span> : null}
              </button>
            );
          })}
        </nav>
        {tools ? <div className="auction-mobile-tools flex items-center gap-1.5">{tools}</div> : null}
      </div>
    </header>
  );
}
