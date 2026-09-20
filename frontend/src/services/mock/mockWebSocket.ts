import {
  ServerEvent,
  ClientCommand,
  Bid,
  Player,
  Team,
  AISuggestion,
} from "@/types";
import { MOCK_PLAYERS, MOCK_TEAMS } from "./mockData";

type EventListener = (event: ServerEvent) => void;

class MockWebSocketClient {
  private listeners: Set<EventListener> = new Set();
  private connected: boolean = false;
  private roomCode: string = "PREM-2026";
  private activePlayerIndex: number = 0;
  private currentBid: number = 38;
  private highestBidder: Team = MOCK_TEAMS[1]; // Baghbazar Tigers
  private endsAt: number = Date.now() + 15000;
  private timerInterval: NodeJS.Timeout | null = null;
  private botBidTimeout: NodeJS.Timeout | null = null;
  private isPaused: boolean = false;
  private recentBids: Bid[] = [
    {
      id: "bid-1",
      amount: 34,
      teamId: "team-3",
      teamName: "Howrah Hawks",
      teamShortName: "HWH",
      teamLogo: "🦅",
      bidderId: "user-3",
      bidderUsername: "rohit_strategist",
      timestamp: Date.now() - 14000,
    },
    {
      id: "bid-2",
      amount: 36,
      teamId: "team-1",
      teamName: "Calcutta United",
      teamShortName: "CUFC",
      teamLogo: "⚡",
      bidderId: "user-1",
      bidderUsername: "gourab_tactician",
      timestamp: Date.now() - 8000,
    },
    {
      id: "bid-3",
      amount: 38,
      teamId: "team-2",
      teamName: "Baghbazar Tigers",
      teamShortName: "BGT",
      teamLogo: "🐅",
      bidderId: "user-2",
      bidderUsername: "arka_boss",
      timestamp: Date.now() - 3000,
    },
  ];

  public connect(roomCode: string) {
    this.roomCode = roomCode;
    this.connected = true;

    // Dispatch initial connection status
    this.emit({
      type: "CONNECTION_STATUS",
      status: "CONNECTED",
      latencyMs: 18,
    });

    // Send initial authoritative ROOM_STATE
    setTimeout(() => {
      this.sendRoomState();
      this.startTimerLoop();
    }, 200);
  }

  public disconnect() {
    this.connected = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.botBidTimeout) clearTimeout(this.botBidTimeout);
    this.emit({
      type: "CONNECTION_STATUS",
      status: "DISCONNECTED",
    });
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public send(command: ClientCommand) {
    if (!this.connected) return;

    switch (command.type) {
      case "PLACE_BID":
        this.handlePlaceBid(command.amount ?? command.amountCr ?? 0);
        break;
      case "REQUEST_SYNC":
        this.sendRoomState();
        break;
      case "HOST_PAUSE":
        this.isPaused = true;
        this.emit({
          type: "AUCTION_PAUSED",
          pausedBy: "Host",
        });
        break;
      case "HOST_RESUME":
        this.isPaused = false;
        this.endsAt = Date.now() + 10000;
        this.emit({
          type: "AUCTION_RESUMED",
          endsAt: this.endsAt,
        });
        break;
      case "HOST_SKIP_PLAYER":
      case "HOST_MARK_UNSOLD":
        this.triggerUnsold();
        break;
      case "HOST_END_AUCTION":
        this.emit({
          type: "AUCTION_COMPLETED",
          roomCode: this.roomCode,
          redirectUrl: `/results/${this.roomCode}`,
        });
        break;
      default:
        break;
    }
  }

  private emit(event: ServerEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  private calculateMinimumNextBid(current: number): number {
    if (current < 10) return current + 0.5;
    if (current < 20) return current + 1.0;
    return current + 2.0;
  }

  private getActivePlayer(): Player {
    const livePlayers = MOCK_PLAYERS.filter(
      (p) => p.status === "live" || p.status === "waiting"
    );
    if (livePlayers.length === 0) return MOCK_PLAYERS[0];
    return livePlayers[this.activePlayerIndex % livePlayers.length];
  }

  private getAISuggestion(player: Player): AISuggestion {
    return {
      recommendedRange: [Math.max(player.basePrice, 28), 38],
      suggestedCeiling: 42,
      reasons: [
        "World-class forward profile with 90+ finishing & pace",
        "Your squad currently lacks an elite clinical attacker",
        "Comparable elite strikers remaining in pot: Only 1",
        "Your remaining purse allows a competitive bid while preserving squad depth",
      ],
      warnings: [
        "Needs 7 more players to hit minimum roster size",
        "Reserve at least ₹20 Cr for defender and goalkeeper depth",
      ],
      riskLevel: "BALANCED",
    };
  }

  private sendRoomState() {
    const player = this.getActivePlayer();
    const minNext = this.calculateMinimumNextBid(this.currentBid);

    this.emit({
      type: "ROOM_STATE",
      roomCode: this.roomCode,
      status: this.isPaused ? "PAUSED" : "LIVE",
      currentPot: player.pot,
      activePlayer: player,
      currentBid: this.currentBid,
      highestBidder: this.highestBidder,
      endsAt: this.endsAt,
      estimatedServerNow: Date.now(),
      minimumNextBid: minNext,
      teams: MOCK_TEAMS,
      recentBids: this.recentBids,
      aiSuggestion: this.getAISuggestion(player),
    });
  }

  private handlePlaceBid(amount: number) {
    const minNext = this.calculateMinimumNextBid(this.currentBid);
    const userTeam = MOCK_TEAMS[0]; // Calcutta United

    if (amount < minNext) {
      this.emit({
        type: "BID_REJECTED",
        reason: `Bid must be at least ₹${minNext} Cr`,
        attemptedAmount: amount,
        minimumNextBid: minNext,
      });
      return;
    }

    if (amount > userTeam.budgetRemaining) {
      this.emit({
        type: "BID_REJECTED",
        reason: `Insufficient purse! Remaining budget is only ₹${userTeam.budgetRemaining} Cr`,
        attemptedAmount: amount,
        minimumNextBid: minNext,
      });
      return;
    }

    // Check anti-sniping threshold (within 5 seconds)
    const timeRemainingMs = this.endsAt - Date.now();
    let antiSnipingTriggered = false;
    let extensionSeconds = 0;

    if (timeRemainingMs <= 5000) {
      antiSnipingTriggered = true;
      extensionSeconds = 6;
      this.endsAt = Date.now() + extensionSeconds * 1000;
    }

    this.currentBid = amount;
    this.highestBidder = userTeam;

    const newBid: Bid = {
      id: `bid-${Date.now()}`,
      amount,
      teamId: userTeam.id,
      teamName: userTeam.name,
      teamShortName: userTeam.shortName,
      teamLogo: userTeam.logo,
      bidderId: userTeam.managerId,
      bidderUsername: userTeam.managerUsername,
      timestamp: Date.now(),
    };

    this.recentBids = [newBid, ...this.recentBids.slice(0, 9)];

    const nextMin = this.calculateMinimumNextBid(this.currentBid);

    this.emit({
      type: "BID_ACCEPTED",
      bid: newBid,
      minimumNextBid: nextMin,
      endsAt: this.endsAt,
      antiSnipingTriggered,
      extensionSeconds,
    });

    this.emit({
      type: "BID_UPDATED",
      currentBid: this.currentBid,
      highestBidder: this.highestBidder,
      minimumNextBid: nextMin,
      endsAt: this.endsAt,
    });

    if (antiSnipingTriggered) {
      this.emit({
        type: "TIMER_EXTENDED",
        extensionSeconds,
        newEndsAt: this.endsAt,
        reason: "5s added after late bid",
      });
    }

    // Schedule competing team bid if still time
    this.scheduleBotBid();
  }

  private scheduleBotBid() {
    if (this.botBidTimeout) clearTimeout(this.botBidTimeout);

    // Random chance competing team counters after 3-4s
    const shouldCounter = Math.random() > 0.4 && this.currentBid < 50;
    if (!shouldCounter) return;

    this.botBidTimeout = setTimeout(() => {
      if (!this.connected || this.isPaused) return;
      if (Date.now() >= this.endsAt) return;

      const competingTeam = MOCK_TEAMS[1]; // Baghbazar Tigers
      const botBidAmount = this.calculateMinimumNextBid(this.currentBid);

      // Check anti-sniping for bot bid too
      const timeRemainingMs = this.endsAt - Date.now();
      let antiSnipingTriggered = false;
      let extensionSeconds = 0;
      if (timeRemainingMs <= 5000) {
        antiSnipingTriggered = true;
        extensionSeconds = 6;
        this.endsAt = Date.now() + extensionSeconds * 1000;
      }

      this.currentBid = botBidAmount;
      this.highestBidder = competingTeam;

      const botBid: Bid = {
        id: `bid-${Date.now()}`,
        amount: botBidAmount,
        teamId: competingTeam.id,
        teamName: competingTeam.name,
        teamShortName: competingTeam.shortName,
        teamLogo: competingTeam.logo,
        bidderId: competingTeam.managerId,
        bidderUsername: competingTeam.managerUsername,
        timestamp: Date.now(),
      };

      this.recentBids = [botBid, ...this.recentBids.slice(0, 9)];
      const nextMin = this.calculateMinimumNextBid(this.currentBid);

      this.emit({
        type: "BID_UPDATED",
        currentBid: this.currentBid,
        highestBidder: this.highestBidder,
        minimumNextBid: nextMin,
        endsAt: this.endsAt,
      });

      if (antiSnipingTriggered) {
        this.emit({
          type: "TIMER_EXTENDED",
          extensionSeconds,
          newEndsAt: this.endsAt,
          reason: "5s added after late bid",
        });
      }
    }, 3500);
  }

  private startTimerLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (!this.connected || this.isPaused) return;

      if (Date.now() >= this.endsAt) {
        this.triggerSold();
      }
    }, 1000);
  }

  private triggerSold() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const player = this.getActivePlayer();
    const winningTeam = this.highestBidder;
    const soldPrice = this.currentBid;

    this.emit({
      type: "PLAYER_SOLD",
      player,
      winningTeam,
      soldPrice,
      nextPlayerInSeconds: 4,
    });

    // Update winning team's purse in mock state
    winningTeam.budgetSpent += soldPrice;
    winningTeam.budgetRemaining -= soldPrice;
    winningTeam.squadCount += 1;

    this.emit({
      type: "BUDGET_UPDATED",
      teamId: winningTeam.id,
      budgetRemaining: winningTeam.budgetRemaining,
      budgetSpent: winningTeam.budgetSpent,
    });

    // Transition to next player after 4 seconds
    setTimeout(() => {
      this.nextPlayer();
    }, 4000);
  }

  private triggerUnsold() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const player = this.getActivePlayer();
    this.emit({
      type: "PLAYER_UNSOLD",
      player,
      nextPlayerInSeconds: 3,
      recallPoolCount: 2,
    });

    setTimeout(() => {
      this.nextPlayer();
    }, 3000);
  }

  private nextPlayer() {
    this.activePlayerIndex += 1;
    const nextP = this.getActivePlayer();

    this.currentBid = nextP.basePrice;
    this.highestBidder = MOCK_TEAMS[2]; // Howrah Hawks initial
    this.endsAt = Date.now() + 15000;
    this.recentBids = [];

    const minNext = this.calculateMinimumNextBid(this.currentBid);

    this.emit({
      type: "PLAYER_STARTED",
      player: nextP,
      basePrice: nextP.basePrice,
      endsAt: this.endsAt,
      minimumNextBid: minNext,
      currentPot: nextP.pot,
      aiSuggestion: this.getAISuggestion(nextP),
    });

    this.startTimerLoop();
  }
}

export const mockWebSocketClient = new MockWebSocketClient();
