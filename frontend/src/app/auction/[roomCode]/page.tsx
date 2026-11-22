"use client";

import React, { useEffect, use, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuctionStore } from "@/stores/auction.store";
import { useAuthStore } from "@/stores/auth.store";
import { useUIStore } from "@/stores/ui.store";
import { useConnectionStore } from "@/stores/connection.store";
import "./auction.css";

import { PlayerPoolSidebar } from "@/components/auction/PlayerPoolSidebar";
import { TeamPanel } from "@/components/auction/TeamPanel";
import { TeamQuickView } from "@/components/auction/TeamQuickView";
import { TeamViewDrawer } from "@/components/auction/TeamViewDrawer";
import { AISuggestionPanel } from "@/components/auction/AISuggestionPanel";
import { HostAuctionControls } from "@/components/auction/HostAuctionControls";
import { HostConnectionPanel } from "@/components/auction/HostConnectionPanel";
import { AuctionHistoryModal } from "@/components/auction/AuctionHistoryModal";
import { SoldOverlay } from "@/components/auction/SoldOverlay";
import { UnsoldOverlay } from "@/components/auction/UnsoldOverlay";
import { AuctionHeader, type AuctionTabId } from "@/components/auction/AuctionHeader";
import { TeamPurseStrip } from "@/components/auction/TeamPurseStrip";
import { PlayerStage, type StageStatus } from "@/components/auction/PlayerStage";
import { BiddingPanel, CompactBidBar } from "@/components/auction/BiddingPanel";
import { ActivityFeed } from "@/components/auction/ActivityFeed";
import { SquadOverview } from "@/components/auction/SquadOverview";
import { AuctionOverview } from "@/components/auction/AuctionOverview";
import { RetainedPlayersPanel } from "@/components/retention/RetainedPlayersPanel";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { potLabel } from "@/lib/pots";

import { Layers, Users, Bot } from "lucide-react";

export default function LiveAuctionPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.roomCode.toUpperCase();

  const { user } = useAuthStore();
  const { status: connectionStatus, latencyMs } = useConnectionStore();
  const router = useRouter();
  const snapshot = useAuctionStore(s => s.snapshot);

  // Determine host status from auction store (authoritative from ROOM_STATE)
  const hostUserId = useAuctionStore((state) => state.snapshot?.host.userId);
  const isHost = !!user && user.id === hostUserId;

  // Navigate to results when auction completes
  const auctionStatus = useAuctionStore((state) => state.auctionStatus);

  // Auction Store selectors
  const activePlayer = useAuctionStore((state) => state.activePlayer);
  const currentBid = useAuctionStore((state) => state.currentBid);
  const highestBidder = useAuctionStore((state) => state.highestBidder);
  const currentPot = useAuctionStore((state) => state.currentPot);
  const teams = useAuctionStore((state) => state.teams);
  const aiSuggestion = useAuctionStore((state) => state.aiSuggestion);
  const recommendationStatus = useAuctionStore((state) => state.recommendationStatus);
  const roomMissing = useAuctionStore((state) => state.roomMissing);
  const syncNotice = useAuctionStore((state) => state.syncNotice);
  const soldOverlay = useAuctionStore((state) => state.soldOverlay);
  const unsoldOverlay = useAuctionStore((state) => state.unsoldOverlay);
  const bidErrorNotice = useAuctionStore((state) => state.bidErrorNotice);
  const activityFeed = useAuctionStore((state) => state.activityFeed);

  const hostPause = useAuctionStore((state) => state.hostPause);
  const hostResume = useAuctionStore((state) => state.hostResume);
  const hostSkip = useAuctionStore((state) => state.hostSkip);
  const hostEnd = useAuctionStore((state) => state.hostEnd);
  const dismissSoldOverlay = useAuctionStore((state) => state.dismissSoldOverlay);
  const dismissUnsoldOverlay = useAuctionStore((state) => state.dismissUnsoldOverlay);

  // Exit auction — navigates to the lobby without disconnecting membership.
  // The WebSocket stays open; the lobby page calls initAuction() anyway.
  const leaveAuction = useAuctionStore((state) => state.leaveAuction);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Return to the dashboard. Membership is untouched; the auction stays recoverable from the server.
  const handleExitAuction = () => {
    leaveAuction();
    router.push("/home");
  };

  // UI Store
  const {
    isTeamQuickViewOpen,
    selectedTeamId,
    closeTeamQuickView,
    isTeamViewOpen,
    teamViewTeamId,
    openTeamView,
    closeTeamView,
    setTeamViewTeam,
    isMobilePlayerDrawerOpen,
    isMobileTeamDrawerOpen,
    isMobileAIDrawerOpen,
    setMobilePlayerDrawer,
    setMobileTeamDrawer,
    setMobileAIDrawer,
  } = useUIStore();

  // Section tabs only change which panel is visible. Every panel stays mounted, so switching never touches
  // the store, the timer or any bid state.
  const [activeTab, setActiveTab] = useState<AuctionTabId>("live");

  const playerPool = useAuctionStore(s => s.players);
  useEffect(() => {
    if (auctionStatus === "COMPLETED") router.replace(`/results/${roomCode}`);
    if (snapshot?.status === "LOBBY") router.replace(`/room/${roomCode}`);
  }, [auctionStatus, snapshot?.status, roomCode, router]);

  const userTeam = teams.find((t) => t.isCurrentUser || t.managerId === user?.id);
  const isUserLeading =
    !!highestBidder && (highestBidder.id === userTeam?.id || !!highestBidder.isCurrentUser);

  const selectedQuickViewTeam =
    teams.find((t) => t.id === selectedTeamId) || null;

  const retention = snapshot?.retention;
  const retainedCount = retention?.picks.length ?? 0;
  const showRetained = retention?.enabled === true || retainedCount > 0;
  const tabs = [
    { id: "live" as const, label: "Live Auction" },
    ...(showRetained ? [{ id: "retained" as const, label: "Retained Players", count: retainedCount }] : []),
    { id: "teams" as const, label: "Teams & Squads" },
    { id: "overview" as const, label: "Overview" },
  ];

  const stagePlayer = activePlayer ?? (soldOverlay.active ? soldOverlay.player : unsoldOverlay.active ? unsoldOverlay.player : null);
  const stageStatus: StageStatus = soldOverlay.active ? "SOLD" : unsoldOverlay.active ? "UNSOLD" : !activePlayer ? "UPCOMING" : auctionStatus === "PAUSED" ? "PAUSED" : "ACTIVE";
  const maxSquad = snapshot?.settings.maxSquadSize ?? 18;

  const mobileTools = (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setMobilePlayerDrawer(true)}
        leftIcon={<Layers className="w-3.5 h-3.5 text-[#00ff87]" aria-hidden="true" />}
      >
        Players
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setMobileTeamDrawer(true)}
        leftIcon={<Users className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />}
      >
        Teams
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => openTeamView(userTeam?.id)}
        leftIcon={<Users className="w-3.5 h-3.5 text-[#00ff87]" aria-hidden="true" />}
      >
        My Squad
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setMobileAIDrawer(true)}
        leftIcon={<Bot className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />}
      >
        AI
      </Button>
    </>
  );

  return (
    <div className="auction-workspace">
      {/* Connection / loading banner — shown until first ROOM_STATE arrives */}
      {!snapshot && (
        <div className="flex items-center justify-center gap-3 py-3 px-4 text-sm border-b border-[#263342] bg-[#0d1620]">
          {roomMissing ? (
            <span className="text-rose-400">Room not found. It may have been closed or never existed.</span>
          ) : bidErrorNotice || syncNotice ? (
            <span className="text-rose-400">{bidErrorNotice || syncNotice}</span>
          ) : connectionStatus === "CONNECTING" || connectionStatus === "RECONNECTING" ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="text-amber-300">
                {connectionStatus === "RECONNECTING" ? "Reconnecting to auction server…" : "Connecting to auction server…"}
              </span>
              <span className="text-[#94a3b8] text-xs hidden sm:inline">Render may take up to 30 s after inactivity</span>
            </>
          ) : connectionStatus === "DISCONNECTED" ? (
            <>
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-rose-400">Disconnected — retrying…</span>
            </>
          ) : connectionStatus === "LOST" || connectionStatus === "AUTH_EXPIRED" ? (
            <>
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-rose-400">
                {connectionStatus === "AUTH_EXPIRED" ? "Your session expired. Sign in again to rejoin your auction." : "Connection lost. Use Reconnect to Auction below."}
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[#00ff87] animate-pulse shrink-0" />
              <span className="text-[#94a3b8]">Synchronising room state…</span>
            </>
          )}
        </div>
      )}

      {/* A. Header and navigation */}
      <AuctionHeader
        auctionName={snapshot?.room?.auctionName ?? ""}
        roomCode={roomCode}
        phase={auctionStatus === "PAUSED" ? "PAUSED" : "LIVE AUCTION"}
        phaseTone={auctionStatus === "PAUSED" ? "paused" : "live"}
        potName={currentPot ? potLabel(currentPot) : ""}
        round={snapshot?.currentPlayer?.round ?? null}
        connectionStatus={connectionStatus}
        latencyMs={latencyMs}
        isHost={isHost}
        tabs={tabs}
        activeTab={activeTab}
        onTab={setActiveTab}
        onExit={handleExitAuction}
        tools={mobileTools}
      />

      {/* B. Team purse overview */}
      <TeamPurseStrip
        teams={teams}
        currentTeamId={userTeam?.id}
        highestBidderTeamId={highestBidder?.id ?? null}
        maxSquadSize={maxSquad}
      />

      {/* Host Bar if current user is room host */}
      {isHost && (
        <div className="auction-hostbar">
          <HostAuctionControls
            isPaused={auctionStatus === "PAUSED"}
            onPause={hostPause}
            onResume={hostResume}
            onSkip={hostSkip}
            onEnd={hostEnd}
            hasActivePlayer={!!activePlayer}
            hasBid={!!highestBidder}
            synced={connectionStatus === "SYNCED"}
            canRecall={snapshot?.status === "RUNNING" || snapshot?.status === "PAUSED"}
            unsoldPlayers={snapshot?.unsoldPlayers ?? []}
            roomCode={roomCode}
            onViewHistory={() => setHistoryOpen(true)}
            onReturnToDashboard={handleExitAuction}
          />
          <HostConnectionPanel isHost={isHost} />
        </div>
      )}
      {auctionStatus === "PAUSED" && (
        <div role="status" data-testid="paused-notice" className="px-4 py-2 text-sm font-semibold text-amber-200 bg-amber-400/10 border-b border-amber-400/30 text-center">
          PAUSED - waiting for the host to resume
        </div>
      )}
      {isHost && <AuctionHistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} roomCode={roomCode} />}

      {activeTab !== "live" ? <CompactBidBar connectionStatus={connectionStatus} onBack={() => setActiveTab("live")} /> : null}

      {/* Live auction section */}
      <div
        id="auction-panel-live"
        role="tabpanel"
        aria-labelledby="auction-tab-live"
        hidden={activeTab !== "live"}
        className="auction-grid"
      >
        {/* LEFT COLUMN: Pot / Player Pool Sidebar (Hidden on mobile/tablet, available via Drawer) */}
        <div className="auction-pool-column">
          <PlayerPoolSidebar
            players={playerPool}
            activePlayerId={activePlayer?.id}
            currentPot={currentPot}
          />
        </div>

        {/* CENTER COLUMN: C. player panel and bidding panel */}
        <div className="auction-center">
          <PlayerStage
            player={stagePlayer}
            status={stageStatus}
            currentBid={currentBid}
            highestBidder={highestBidder}
            soldPrice={soldOverlay.active ? soldOverlay.price : undefined}
            soldTo={soldOverlay.active ? soldOverlay.winningTeam?.name : undefined}
          />
          <BiddingPanel connectionStatus={connectionStatus} userTeam={userTeam} isUserLeading={isUserLeading} />
        </div>

        {/* RIGHT COLUMN: D. activity feed, F. squad overview, teams and AI assistant */}
        <div className="auction-right-column">
          <ActivityFeed entries={activityFeed} />

          <SquadOverview teams={teams} currentTeamId={userTeam?.id} maxSquadSize={maxSquad} mode="mine" />

          <div className="auction-teams-slot">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#a5b4c5]">Teams</span>
              <button
                type="button"
                onClick={() => openTeamView(userTeam?.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border border-[#00ff87]/30 bg-[#00ff87]/5 text-[#00ff87] hover:bg-[#00ff87]/15 transition-colors duration-200 cursor-pointer"
              >
                <Users className="w-3 h-3" aria-hidden="true" />
                Team View
              </button>
            </div>
            <TeamPanel teams={teams} currentTeamId={userTeam?.id} />
          </div>

          <div className="auction-assistant-slot">
            <AISuggestionPanel suggestion={aiSuggestion} status={recommendationStatus} />
          </div>
        </div>
      </div>

      {/* E. Retained players: read-only, never touches bidding state */}
      <div
        id="auction-panel-retained"
        role="tabpanel"
        aria-labelledby="auction-tab-retained"
        hidden={activeTab !== "retained"}
        className="auction-panel"
      >
        <RetainedPlayersPanel
          picks={retention?.picks ?? []}
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          currentTeamId={userTeam?.id}
          heading="Retained players"
        />
      </div>

      <div
        id="auction-panel-teams"
        role="tabpanel"
        aria-labelledby="auction-tab-teams"
        hidden={activeTab !== "teams"}
        className="auction-panel"
      >
        <SquadOverview teams={teams} currentTeamId={userTeam?.id} maxSquadSize={maxSquad} mode="all" />
      </div>

      <div
        id="auction-panel-overview"
        role="tabpanel"
        aria-labelledby="auction-tab-overview"
        hidden={activeTab !== "overview"}
        className="auction-panel"
      >
        {snapshot ? <AuctionOverview snapshot={snapshot} /> : null}
      </div>

      {/* 3. DRAWERS & MODALS FOR RESPONSIVE EXPERIENCE */}

      {/* Team Quick View Drawer */}
      <TeamQuickView
        isOpen={isTeamQuickViewOpen}
        onClose={closeTeamQuickView}
        team={selectedQuickViewTeam}
        roomCode={roomCode}
      />

      {/* Mobile Players Drawer */}
      <Drawer
        isOpen={isMobilePlayerDrawerOpen}
        onClose={() => setMobilePlayerDrawer(false)}
        position="bottom"
        title="POT & PLAYER POOL"
      >
        <div className="h-[60vh]">
          <PlayerPoolSidebar
            players={playerPool}
            activePlayerId={activePlayer?.id}
            currentPot={currentPot}
          />
        </div>
      </Drawer>

      {/* Mobile Teams Drawer */}
      <Drawer
        isOpen={isMobileTeamDrawerOpen}
        onClose={() => setMobileTeamDrawer(false)}
        position="bottom"
        title="FRANCHISE PURSES & ROSTERS"
      >
        <div className="h-[60vh]">
          <TeamPanel teams={teams} currentTeamId={userTeam?.id} />
        </div>
      </Drawer>

      {/* Mobile AI Assistant Drawer */}
      <Drawer
        isOpen={isMobileAIDrawerOpen}
        onClose={() => setMobileAIDrawer(false)}
        position="bottom"
        title="AI AUCTION VALUATION"
      >
        <div className="p-2">
          <AISuggestionPanel suggestion={aiSuggestion} status={recommendationStatus} />
        </div>
      </Drawer>

      {/* 4. OVERLAYS */}
      <SoldOverlay soldData={soldOverlay} onDismiss={dismissSoldOverlay} />
      <UnsoldOverlay unsoldData={unsoldOverlay} onDismiss={dismissUnsoldOverlay} />

      {/* 5. TEAM VIEW DRAWER */}
      <TeamViewDrawer
        isOpen={isTeamViewOpen}
        onClose={closeTeamView}
        teams={teams}
        selectedTeamId={teamViewTeamId}
        currentUserTeamId={userTeam?.id ?? null}
        roomCode={roomCode}
        auctionName={snapshot?.room?.auctionName}
        settings={snapshot ? {
          maxSquadSize: snapshot.settings.maxSquadSize,
          minSquadSize: snapshot.settings.minSquadSize,
          startingBudget: snapshot.settings.startingBudgetCr,
          minPlayerBasePrice: snapshot.settings.minimumBasePriceCr,
        } : null}
        onSelectTeam={setTeamViewTeam}
      />
    </div>
  );
}
