"use client";

import React, { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuctionStore } from "@/stores/auction.store";
import { useAuthStore } from "@/stores/auth.store";
import { useUIStore } from "@/stores/ui.store";
import { useConnectionStore } from "@/stores/connection.store";
import "./auction.css";

import { BudgetTicker } from "@/components/auction/BudgetTicker";
import { PlayerPoolSidebar } from "@/components/auction/PlayerPoolSidebar";
import { PlayerAuctionCard } from "@/components/auction/PlayerAuctionCard";
import { CurrentBid } from "@/components/auction/CurrentBid";
import { AuctionTimer } from "@/components/auction/AuctionTimer";
import { AuctionControls } from "@/components/auction/AuctionControls";
import { TeamPanel } from "@/components/auction/TeamPanel";
import { TeamQuickView } from "@/components/auction/TeamQuickView";
import { TeamViewDrawer } from "@/components/auction/TeamViewDrawer";
import { AISuggestionPanel } from "@/components/auction/AISuggestionPanel";
import { HostAuctionControls } from "@/components/auction/HostAuctionControls";
import { SoldOverlay } from "@/components/auction/SoldOverlay";
import { UnsoldOverlay } from "@/components/auction/UnsoldOverlay";
import { ConnectionStatus } from "@/components/auction/ConnectionStatus";
import { BidFeed } from "@/components/auction/BidFeed";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";

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
  const endsAt = useAuctionStore((state) => state.endsAt);
  const serverTimeOffset = useAuctionStore((state) => state.serverTimeOffset);
  const minimumNextBid = useAuctionStore((state) => state.minimumNextBid);
  const currentPot = useAuctionStore((state) => state.currentPot);
  const teams = useAuctionStore((state) => state.teams);
  const recentBids = useAuctionStore((state) => state.recentBids);
  const aiSuggestion = useAuctionStore((state) => state.aiSuggestion);
  // auctionStatus already declared above for the completed-redirect effect
  const soldOverlay = useAuctionStore((state) => state.soldOverlay);
  const unsoldOverlay = useAuctionStore((state) => state.unsoldOverlay);
  const antiSnipingNotice = useAuctionStore((state) => state.antiSnipingNotice);
  const bidErrorNotice = useAuctionStore((state) => state.bidErrorNotice);

  const placeBid = useAuctionStore((state) => state.placeBid);
  const hostPause = useAuctionStore((state) => state.hostPause);
  const hostResume = useAuctionStore((state) => state.hostResume);
  const hostSkip = useAuctionStore((state) => state.hostSkip);
  const hostEnd = useAuctionStore((state) => state.hostEnd);
  const clearBidError = useAuctionStore((state) => state.clearBidError);
  const dismissSoldOverlay = useAuctionStore((state) => state.dismissSoldOverlay);
  const dismissUnsoldOverlay = useAuctionStore((state) => state.dismissUnsoldOverlay);

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

  const playerPool = useAuctionStore(s => s.players);
  useEffect(() => {
    if (auctionStatus === "COMPLETED") router.replace(`/results/${roomCode}`);
    if (snapshot?.status === "LOBBY") router.replace(`/room/${roomCode}`);
  }, [auctionStatus, snapshot?.status, roomCode, router]);

  const userTeam = teams.find((t) => t.isCurrentUser || t.managerId === user?.id);
  const userBudget = userTeam ? userTeam.budgetRemaining : 0;
  const isUserLeading =
    highestBidder && (highestBidder.id === userTeam?.id || highestBidder.isCurrentUser);

  const selectedQuickViewTeam =
    teams.find((t) => t.id === selectedTeamId) || null;

  return (
    <div className="auction-workspace">
      {!snapshot && <div className="p-4 text-center text-sm text-amber-300">{bidErrorNotice || "Synchronizing room state…"}</div>}
      {/* 1. TOP STICKY BUDGET TICKER */}
      <BudgetTicker teams={teams} currentTeamId={userTeam?.id} />

      {/* Subheader with room code, status, and mobile drawer buttons */}
      <div className="auction-subheader">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-black text-[#00ff87]">
            {roomCode}
          </span>
          <span className="text-xs text-[#64748b] hidden sm:inline">•</span>
          <span className="text-xs text-[#94a3b8] hidden sm:inline">
            Pot: <strong className="uppercase text-[#f8fafc]">{currentPot}</strong>
          </span>
        </div>

        {/* Mobile / Tablet Triggers for Drawers */}
        <div className="auction-mobile-tools flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobilePlayerDrawer(true)}
            leftIcon={<Layers className="w-3.5 h-3.5 text-[#00ff87]" />}
          >
            Players
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobileTeamDrawer(true)}
            leftIcon={<Users className="w-3.5 h-3.5 text-sky-400" />}
          >
            Teams
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openTeamView(userTeam?.id)}
            leftIcon={<Users className="w-3.5 h-3.5 text-[#00ff87]" />}
          >
            My Squad
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobileAIDrawer(true)}
            leftIcon={<Bot className="w-3.5 h-3.5 text-purple-400" />}
          >
            AI
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionStatus status={connectionStatus} latencyMs={latencyMs} />
        </div>
      </div>

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
            canRecall={!activePlayer && snapshot?.playerQueue.length === 0 && !!snapshot?.unsoldPlayers.length}
            onRecall={() => { void useAuctionStore.getState().hostCommand("START_RECALL").catch(() => {}); }}
          />
        </div>
      )}

      {/* 2. MAIN 3-COLUMN AUCTION LAYOUT */}
      <div className="auction-grid">
        {/* LEFT COLUMN: Pot / Player Pool Sidebar (Hidden on mobile/tablet, available via Drawer) */}
        <div className="auction-pool-column">
          <PlayerPoolSidebar
            players={playerPool}
            activePlayerId={activePlayer?.id}
            currentPot={currentPot}
          />
        </div>

        {/* CENTER COLUMN: Player Card & Live Auction Console */}
        <div className="auction-center">
          {/* Player Card */}
          <PlayerAuctionCard player={activePlayer} variant="auction" />

          <section className="auction-bid-console" aria-label="Live bidding">
          <div className="auction-metrics">
            <CurrentBid
              currentBid={currentBid}
              highestBidder={highestBidder}
              currentTeamId={userTeam?.id}
            />

            <AuctionTimer
              endsAt={endsAt}
              serverTimeOffset={serverTimeOffset}
              isPaused={auctionStatus === "PAUSED"}
              remainingTimeMs={snapshot?.remainingTimeMs ?? null}
              synced={connectionStatus === "SYNCED"}
            />
          </div>

          {/* Bid Button & Custom Controls */}
          <AuctionControls
            minimumNextBid={minimumNextBid}
            currentBid={currentBid}
            userBudgetRemaining={userBudget}
            isUserLeading={!!isUserLeading}
            isPaused={auctionStatus === "PAUSED"}
            onPlaceBid={placeBid}
            disabled={connectionStatus !== "SYNCED" || !activePlayer || !snapshot?.biddingOpen}
            maximumPermittedBid={snapshot?.maximumPermittedBidCr ?? 0}
            allowCustomBids={snapshot?.settings.allowCustomBids ?? false}
            antiSnipingNotice={antiSnipingNotice}
            bidErrorNotice={bidErrorNotice}
            onClearError={clearBidError}
          />

          </section>
          {/* Live Recent Bids Feed */}
          <BidFeed bids={recentBids} />
        </div>

        {/* RIGHT COLUMN: Teams & AI Assistant (Hidden on mobile/tablet, available via Drawer) */}
        <div className="auction-right-column">
          <div className="auction-teams-slot">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Teams</span>
              <button
                onClick={() => openTeamView(userTeam?.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border border-[#00ff87]/30 bg-[#00ff87]/5 text-[#00ff87] hover:bg-[#00ff87]/15 transition-colors"
              >
                <Users className="w-3 h-3" />
                Team View
              </button>
            </div>
            <TeamPanel teams={teams} currentTeamId={userTeam?.id} />
          </div>

          <div className="auction-assistant-slot">
            <AISuggestionPanel suggestion={aiSuggestion} />
          </div>
        </div>
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
          <AISuggestionPanel suggestion={aiSuggestion} />
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
