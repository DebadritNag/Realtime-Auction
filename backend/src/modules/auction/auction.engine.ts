import { createHash, randomUUID } from 'node:crypto';
import type { Room } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { toCr, toUnits } from '../../domain/money.js';
import { settingsSchema, parseSettings } from '../../schemas/settings.js';
import { fc26BasePriceUnits } from '../../domain/pricing.js';
import type { RoomManager, PendingEvent } from '../rooms/room.manager.js';
import { requireHost, requireMember } from '../rooms/room.service.js';
import { transitionPlayer, transitionRoom } from './auction.state-machine.js';
import { minimumNextBid, validateBid } from './bid.service.js';
import { remainingBudget } from './budget.service.js';
import { skipVoteState, updateSkipVote } from './skip-vote.service.js';
import { commandSchema, type AuctionCommand } from './auction.schemas.js';
import { followIds, hasSelectable, heldIds, regularWaiting } from './pool-import/pool-additions.js';
import { assertRestoreSettingsUnlocked, isUnclaimed, releaseTeamClaim } from '../restore/restore.claims.js';
import { assertRetentionSettingsUnlocked, completionAnnouncement, confirmTurn, draftPlayer, finalizeRetentions, pendingSpendUnits, purseAfterConfirmedUnits,
  removeDraft, requireRetentionOpenForMembership, resetRetentions, retentionPhase, skipTurn, startRetention, syncRetentionWithSettings,
  turnAnnouncement } from '../retention/retention.service.js';

export class AuctionEngine {
  constructor(readonly manager: RoomManager) {}
  async execute(code: string, userId: string, raw: AuctionCommand): Promise<{ sequence: number; duplicate: boolean }> {
    const command = commandSchema.parse(raw);
    requireThat(command.payload.roomCode === code, 'INVALID_STATE', 'Room code mismatch.');
    return this.manager.mutate(code, async (room, events) => {
      const team = requireMember(room, userId);
      const now = this.manager.clock.now();
      const fingerprint = JSON.stringify(command);
      const key = command.requestId ? createHash('sha256').update(userId + ':' + command.requestId).digest('hex') : null;
      if (key && room.receipts[key] && room.receipts[key]!.expiresAt > now) {
        requireThat(room.receipts[key]!.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 'requestId was already used for a different command.', 409);
        return { sequence: room.receipts[key]!.sequence, duplicate: true };
      }
      if (command.payload.expectedSequence !== undefined) requireThat(command.payload.expectedSequence === room.sequence,
        'STALE_STATE', 'Room changed; request fresh state.', 409);
      if (command.type === 'PLACE_BID') {
        if (command.payload.playerId !== undefined) requireThat(command.payload.playerId === room.active?.playerId, 'STALE_STATE', 'Active player changed.', 409);
        const amount = validateBid(room, team, command.payload.amountCr, now);
        const active = room.active!;
        const player = room.players.find(p => p.id === active.playerId)!;
        if (active.skipVoterUserIds?.length) {
          active.skipVoterUserIds = [];
          events.push({ type: 'SKIP_VOTE_UPDATED', payload: { playerId: player.id, activationId: active.activationId,
            votes: 0, required: skipVoteState(room).required, reason: 'BID_ACCEPTED' } });
        }
        active.currentBidUnits = amount;
        active.highestBidderTeamId = team.id;
        active.lastBidAt = now;
        active.bidCount++;
        room.bids.push({ id: randomUUID(), roomId: room.id, playerId: active.playerId, teamId: team.id, amountUnits: amount, at: now, round: player.round });
        if (room.settings.antiSnipingEnabled && active.endsAt - now <= room.settings.antiSnipingThresholdSeconds * 1000) {
          active.endsAt = now + room.settings.antiSnipingResetSeconds * 1000;
          events.push({ type: 'TIMER_EXTENDED', payload: { playerId: player.id, endsAt: active.endsAt } });
        }
        events.push({ type: 'BID_UPDATED', payload: { playerId: player.id, amountCr: toCr(amount),
          highestBidderTeamId: team.id, minimumNextBidCr: toCr(minimumNextBid(room)!), endsAt: active.endsAt, bidCount: active.bidCount } });
      } else if (command.type === 'RETAIN_PLAYER') {
        // Member-level: the server decides whose turn it is. Prices and the player come from the server catalog.
        const player = this.manager.fc26 ? await this.manager.fc26.get(command.payload.playerId) : null;
        const draft = draftPlayer(room, team, player, userId, now, this.manager.fc26?.topRatingThreshold ?? 90);
        // Only the player id is broadcast: other teams learn that the player is unavailable, never who picked it.
        events.push({ type: 'RETENTION_PLAYER_RESERVED', payload: { playerId: draft.playerId } });
      } else if (command.type === 'REMOVE_RETENTION_PLAYER') {
        const draft = removeDraft(room, team, userId, command.payload.playerId);
        events.push({ type: 'RETENTION_PLAYER_RELEASED', payload: { playerId: draft.playerId } });
      } else if (command.type === 'CONFIRM_RETENTION' || command.type === 'SKIP_RETENTION') {
        const turn = command.type === 'CONFIRM_RETENTION' ? confirmTurn(room, team, userId, now) : skipTurn(room, team, userId, now);
        const turnTeam = room.teams.find(t => t.id === turn.teamId)!;
        events.push({ type: 'RETENTION_TEAM_CONFIRMED', payload: turnAnnouncement(room, turn) },
          { type: 'TEAM_UPDATED', payload: { teamId: turnTeam.id } },
          { type: 'BUDGET_UPDATED', payload: { teamId: turnTeam.id, spentCr: toCr(turnTeam.spentUnits + pendingSpendUnits(room, turnTeam.id)),
            remainingBudgetCr: toCr(purseAfterConfirmedUnits(room, turnTeam)) } });
        if (turn.nextTeamId) {
          const next = room.teams.find(t => t.id === turn.nextTeamId)!;
          events.push({ type: 'RETENTION_TURN_STARTED', payload: { teamId: next.id, teamName: next.name, order: turn.order + 1 } });
        } else events.push({ type: 'RETENTION_ALL_COMPLETED', payload: completionAnnouncement(room) });
      } else if (command.type === 'VOTE_SKIP_PLAYER' || command.type === 'REMOVE_SKIP_VOTE') {
        const { playerId, activationId } = command.payload;
        const result = updateSkipVote(room, userId, playerId, activationId, command.type === 'REMOVE_SKIP_VOTE', now);
        events.push({ type: 'SKIP_VOTE_UPDATED', payload: { playerId, activationId, votes: result.votes, required: result.required,
          reason: command.type === 'REMOVE_SKIP_VOTE' ? 'VOTE_REMOVED' : 'VOTE_CAST' } });
        if (result.unanimous) {
          this.resolve(room, events, 'UNANIMOUS_SKIP');
          // Unanimous skip advances after the usual transition delay, also in host-next rooms.
          if (hasSelectable(room)) {
            room.nextPlayerAt = now + room.settings.transitionDelaySeconds * 1000;
          }
        }
      } else {
        requireHost(room, userId);
        switch (command.type) {
          case 'START_AUCTION': {
            requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Auction can only start from the lobby.', 409);
            settingsSchema.parse(room.settings);
            requireThat(['OFF', 'FINALIZED'].includes(retentionPhase(room)), 'RETENTION_NOT_FINALIZED', 'Finalize player retentions before starting the auction.', 409);
            requireThat(room.teams.length >= room.settings.minimumParticipants, 'NOT_ENOUGH_PARTICIPANTS', 'Not enough participants.');
            requireThat(!room.teams.some(isUnclaimed), 'RESTORE_TEAMS_UNCLAIMED', 'Every restored team needs a manager before the auction can start.', 409);
            if (room.settings.playerPoolSource === 'FC26') {
              const fc26 = this.manager.fc26;
              requireThat(fc26, 'FC26_UNAVAILABLE', 'FC26 database is not configured on this server.', 503);
              const { playerIds, potIds } = room.settings.playerPoolConfig;
              // Players already owned (for example retained before the auction) stay in the room and leave the pool.
              const kept = room.players.filter(p => p.status === 'SOLD');
              const taken = new Set(kept.map(p => p.id));
              if (room.restore) await fc26.refresh(0);
              const pool = (await fc26.list()).filter(p => !taken.has(p.id) && (!playerIds || playerIds.includes(p.id)) && (!potIds || potIds.includes(p.potId)));
              requireThat(pool.length > 0, 'EMPTY_PLAYER_POOL', 'Player pool is empty.');
              if (playerIds) requireThat(playerIds.every(id => taken.has(id) || pool.some(p => p.id === id)),
                'INVALID_PLAYER_POOL', 'One or more selected players are missing or excluded by pot filters.');
              // Base prices are recomputed here from rating and draft pool; stored or client values are never trusted.
              room.players = [...kept, ...pool.map(p => ({ ...p, status: 'WAITING' as const, round: 0,
                basePriceUnits: fc26BasePriceUnits({ overall: p.ovr, draftPool: p.draftPool ?? 'REGULAR' }, fc26.topRatingThreshold) }))];
            } else {
            const pool = await this.manager.players.listPlayerPool(room.settings.playerPoolConfig, room.settings.numberOfTeams);
            requireThat(pool.length > 0, 'EMPTY_PLAYER_POOL', 'Player pool is empty.');
            if (room.settings.playerPoolConfig.playerIds) requireThat(room.settings.playerPoolConfig.playerIds.every(id => pool.some(p => p.id === id)),
              'INVALID_PLAYER_POOL', 'One or more selected players are missing or excluded by pot filters.');
            room.players = pool.map(p => ({ ...p, basePriceUnits: Math.max(p.basePriceUnits, toUnits(room.settings.minimumBasePriceCr)), status: 'WAITING', round: 0 }));
            }
            // playerQueue stays empty — activateNext picks randomly from room.players each time.
            room.playerQueue = [];
            room.lastPot = undefined;
            room.consecutivePotCount = 0;
            transitionRoom(room, 'STARTING');
            transitionRoom(room, 'RUNNING');
            events.push({ type: 'AUCTION_STARTED' });
            this.activateNext(room, events);
            break;
          }
          case 'PAUSE_AUCTION':
            requireThat(room.status === 'RUNNING', 'INVALID_STATE', 'Only running auctions can pause.', 409);
            // A late pause must never revive an already expired player.
            if (room.active && room.active.endsAt <= now) this.resolve(room, events);
            transitionRoom(room, 'PAUSED');
            if (room.active) { room.active.remainingTimeMs = room.active.endsAt - now; room.active.biddingOpen = false; }
            room.nextPlayerAt = null;
            events.push({ type: 'AUCTION_PAUSED', payload: { remainingTimeMs: room.active?.remainingTimeMs ?? null } });
            break;
          case 'RESUME_AUCTION':
            transitionRoom(room, 'RUNNING');
            if (room.active) { room.active.endsAt = now + room.active.remainingTimeMs!; room.active.remainingTimeMs = null; room.active.biddingOpen = true; }
            else this.planNext(room);
            events.push({ type: 'AUCTION_RESUMED', payload: { endsAt: room.active?.endsAt ?? null } });
            break;
          case 'NEXT_PLAYER':
            requireThat(room.status === 'RUNNING' && !room.active, 'INVALID_STATE', 'Wait for the current player to resolve.', 409);
            this.activateNext(room, events);
            break;
          case 'MARK_UNSOLD':
            requireThat(room.status === 'RUNNING' && room.active, 'INVALID_STATE', 'No running player.', 409);
            requireThat(room.active.highestBidderTeamId === null, 'BIDS_EXIST', 'Cannot discard an accepted bid.');
            this.resolve(room, events);
            break;
          case 'RECALL_PLAYERS': {
            requireThat(room.status === 'RUNNING' || room.status === 'PAUSED', 'INVALID_STATE', 'Recall is only available during running or paused auctions.', 409);
            const ids = command.payload.playerIds;
            requireThat(new Set(ids).size === ids.length, 'DUPLICATE_PLAYER_IDS', 'Select each player only once.');
            const selected = ids.map(id => room.players.find(p => p.id === id));
            requireThat(selected.every(Boolean), 'PLAYER_NOT_FOUND', 'A selected player does not belong to this room.', 404);
            requireThat(selected.every(p => p!.status === 'UNSOLD' && !room.playerQueue.includes(p!.id)),
              'PLAYER_NOT_RECALLABLE', 'Selected players must be unsold and not already queued for recall.', 409);
            for (const player of selected) {
              transitionPlayer(player!, 'WAITING');
              (room.playerHistory ??= []).push({ type: 'PLAYER_RECALLED', playerId: player!.id, round: player!.round, at: now, userId });
              events.push({ type: 'PLAYER_RECALLED', payload: { playerId: player!.id, status: 'WAITING', round: player!.round } });
            }
            // Re-enter normal random selection without interrupting the current lot or pending transition.
            if (!room.active && room.status === 'RUNNING' && room.nextPlayerAt === null) this.planNext(room);
            break;
          }
          case 'RELEASE_POOL_ADDITIONS': {
            requireThat(room.status === 'RUNNING' || room.status === 'PAUSED', 'INVALID_STATE', 'Additions can only be released during running or paused auctions.', 409);
            const held = heldIds(room);
            requireThat(held.length > 0, 'NO_HELD_ADDITIONS', 'No held additions to release.', 409);
            const ids = command.payload.playerIds ?? held;
            requireThat(new Set(ids).size === ids.length, 'DUPLICATE_PLAYER_IDS', 'Select each player only once.');
            requireThat(ids.every(id => held.includes(id)), 'PLAYER_NOT_RELEASABLE', 'Selected players are not held additions.', 409);
            for (const id of ids) room.players.find(p => p.id === id)!.poolMeta!.release = 'FOLLOW';
            events.push({ type: 'POOL_ADDITIONS_RELEASED', payload: { playerIds: ids, count: ids.length } });
            // Re-enter selection without interrupting the live lot or a pending transition.
            if (!room.active && room.status === 'RUNNING' && room.nextPlayerAt === null) this.planNext(room);
            break;
          }
          case 'START_RECALL': {
            requireThat(room.status === 'RUNNING' && !room.active && !hasSelectable(room),
              'INVALID_STATE', 'Recall requires a running auction between completed rounds.', 409);
            const unsold = room.players.filter(p => p.status === 'UNSOLD');
            requireThat(unsold.length > 0, 'NO_UNSOLD_PLAYERS', 'No unsold players to recall.');
            room.playerQueue = unsold.map(p => p.id);
            // Reset anti-streak for recall round
            room.lastPot = undefined;
            room.consecutivePotCount = 0;
            events.push({ type: 'ROOM_UPDATED', payload: { reason: 'RECALL_STARTED' } });
            this.activateNext(room, events);
            break;
          }
          case 'START_RETENTION': {
            const retention = startRetention(room);
            const order = retention.order!.map((teamId, index) => ({ teamId, name: room.teams.find(t => t.id === teamId)!.name, order: index + 1 }));
            events.push({ type: 'RETENTION_STARTED', payload: { order, activeTeamId: retention.activeTeamId } },
              { type: 'RETENTION_TURN_STARTED', payload: { teamId: order[0]!.teamId, teamName: order[0]!.name, order: 1 } });
            break;
          }
          case 'FINALIZE_RETENTIONS': {
            const retention = finalizeRetentions(room, now, this.manager.fc26?.topRatingThreshold ?? 90);
            events.push({ type: 'RETENTION_FINALIZED', payload: { totalRetained: retention.picks.length,
              totalSpentCr: toCr(retention.picks.reduce((sum, p) => sum + p.priceUnits, 0)), finalizedAt: retention.finalizedAt } });
            for (const affected of room.teams) events.push({ type: 'TEAM_UPDATED', payload: { teamId: affected.id } },
              { type: 'BUDGET_UPDATED', payload: { teamId: affected.id, spentCr: toCr(affected.spentUnits), remainingBudgetCr: toCr(remainingBudget(affected)) } });
            break;
          }
          case 'RESET_RETENTIONS': {
            const removed = resetRetentions(room);
            events.push({ type: 'RETENTION_RESET', payload: { removed: removed.length } });
            for (const teamId of new Set(removed.map(p => p.teamId))) {
              const affected = room.teams.find(t => t.id === teamId)!;
              events.push({ type: 'TEAM_UPDATED', payload: { teamId } },
                { type: 'BUDGET_UPDATED', payload: { teamId, spentCr: toCr(affected.spentUnits), remainingBudgetCr: toCr(remainingBudget(affected)) } });
            }
            break;
          }
          case 'END_AUCTION':
            if (room.status === 'LOBBY') {
              if (room.retention) {
                const removed = resetRetentions(room);
                if (removed.length) events.push({ type: 'RETENTION_RESET', payload: { removed: removed.length, reason: 'ROOM_CLOSED' } });
              }
              transitionRoom(room, 'CLOSED');
              events.push({ type: 'ROOM_UPDATED', payload: { reason: 'ROOM_CLOSED' } });
            } else {
              requireThat(room.status === 'RUNNING' || room.status === 'PAUSED', 'INVALID_STATE', 'Auction cannot be ended in this state.', 409);
              // Honor the accepted highest bid, including while paused.
              if (room.active) this.resolve(room, events);
              for (const player of room.players) if (player.status === 'WAITING') transitionPlayer(player, 'SKIPPED');
              room.playerQueue = [];
              if (room.addedQueue) room.addedQueue = [];
              transitionRoom(room, 'COMPLETED');
              events.push({ type: 'AUCTION_COMPLETED' });
            }
            room.nextPlayerAt = null;
            break;
          case 'KICK_MEMBER':
            requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Kicking is only allowed in the lobby.', 409);
            requireThat(command.payload.targetTeamId !== team.id, 'HOST_CANNOT_LEAVE', 'Host cannot kick themselves.');
            requireThat(room.teams.some(t => t.id === command.payload.targetTeamId), 'TEAM_NOT_FOUND', 'Team not found.', 404);
            requireRetentionOpenForMembership(room);
            // A restored team keeps its squad and purse; kicking its manager only frees the claim.
            if (room.restore) releaseTeamClaim(room.teams.find(t => t.id === command.payload.targetTeamId)!);
            else room.teams = room.teams.filter(t => t.id !== command.payload.targetTeamId);
            events.push({ type: 'MEMBER_LEFT', payload: { teamId: command.payload.targetTeamId } });
            break;
          case 'UPDATE_SETTINGS': {
            requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Settings are locked.', 409);
            const settings = parseSettings({ ...room.settings, ...command.payload.settings });
            await this.manager.assertPoolSource(settings);
            requireThat(settings.numberOfTeams >= room.teams.length, 'ROOM_FULL', 'Capacity below membership.');
            assertRetentionSettingsUnlocked(room, settings);
            assertRestoreSettingsUnlocked(room, settings);
            room.settings = settings;
            syncRetentionWithSettings(room);
            // Restored purses are authoritative; a settings update must never overwrite them.
            if (!room.restore) for (const item of room.teams) item.startingBudgetUnits = toUnits(settings.startingBudgetCr);
            events.push({ type: 'ROOM_UPDATED' });
            break;
          }
        }
      }
      for (const [receiptKey, receipt] of Object.entries(room.receipts)) if (receipt.expiresAt <= now) delete room.receipts[receiptKey];
      if (key) {
        // TTL plus a hard per-room cap bounds retry memory and persistent snapshot size.
        const keys = Object.keys(room.receipts);
        if (keys.length >= 2000) delete room.receipts[keys[0]!];
        room.receipts[key] = { fingerprint, sequence: room.sequence + 1, expiresAt: now + 5 * 60_000 };
      }
      return { sequence: room.sequence + 1, duplicate: false };
    });
  }
  private planNext(room: Room): void {
    room.nextPlayerAt = room.settings.autoAdvance && hasSelectable(room)
      ? this.manager.clock.now() + room.settings.transitionDelaySeconds * 1000 : null;
    // An exhausted round deliberately remains RUNNING with no active player.
    // The host chooses START_RECALL or END_AUCTION.
  }
  private activateNext(room: Room, events: PendingEvent[]): void {
    requireThat(!room.active, 'INVALID_STATE', 'A player is already active.', 409);

    let id: string | undefined;

    if (room.playerQueue.length > 0) {
      // ── Recall round: use the explicit queue (unsold players) ─────────────
      id = room.playerQueue.shift();
    } else {
      // ── Normal round: pick randomly per player selection ─────────────────
      // 1. Build a map of potId → waiting players
      const byPot = new Map<string, typeof room.players>();
      for (const p of regularWaiting(room)) {
        const bucket = byPot.get(p.potId) ?? [];
        bucket.push(p);
        byPot.set(p.potId, bucket);
      }

      if (byPot.size === 0) {
        // Only live additions are left: released ones play in import order after every regular player.
        const follow = followIds(room)[0];
        requireThat(follow, 'NO_WAITING_PLAYERS', heldIds(room).length
          ? 'Round finished; held additions await release, or recall unsold players, or end auction.'
          : 'Round finished; recall unsold players or end auction.');
        const followPot = room.players.find(p => p.id === follow)!.potId;
        room.consecutivePotCount = followPot === room.lastPot ? (room.consecutivePotCount ?? 0) + 1 : 1;
        room.lastPot = followPot;
        room.addedQueue = room.addedQueue!.filter(id => id !== follow);
        id = follow;
      } else {
        // 2. Apply anti-streak: if the same pot appeared twice in a row AND other
        //    pots are available, temporarily exclude it from selection.
        let eligiblePots = [...byPot.keys()];
        const lastPot = room.lastPot;
        const streak = room.consecutivePotCount ?? 0;
        if (lastPot && streak >= 2 && eligiblePots.length > 1) {
          eligiblePots = eligiblePots.filter(p => p !== lastPot);
        }

        // 3. Pick a random pot, then a random player from that pot
        const pot = eligiblePots[Math.floor(Math.random() * eligiblePots.length)]!;
        const candidates = byPot.get(pot)!;
        const player = candidates[Math.floor(Math.random() * candidates.length)]!;
        id = player.id;

        // 4. Update anti-streak counters
        room.consecutivePotCount = pot === lastPot ? streak + 1 : 1;
        room.lastPot = pot;
      }
    }

    requireThat(id, 'NO_WAITING_PLAYERS', 'Round finished; recall unsold players or end auction.');
    const player = room.players.find(p => p.id === id)!;
    transitionPlayer(player, 'ACTIVE');
    player.round++;
    delete player.unsoldReason;
    const now = this.manager.clock.now();
    room.active = { skipVoterUserIds: [], playerId: id, currentBidUnits: player.basePriceUnits, highestBidderTeamId: null,
      startedAt: now, endsAt: now + room.settings.playerTimerSeconds * 1000, biddingOpen: true,
      remainingTimeMs: null, lastBidAt: null, bidCount: 0, activationId: randomUUID() };
    room.nextPlayerAt = null;
    const { basePriceUnits, ...publicPlayer } = player;
    events.push({ type: 'PLAYER_STARTED', payload: { player: { ...publicPlayer, basePriceCr: toCr(basePriceUnits) },
      basePriceCr: toCr(player.basePriceUnits), currentBidCr: toCr(player.basePriceUnits),
      minimumNextBidCr: toCr(player.basePriceUnits), highestBidderTeamId: null, startedAt: now, endsAt: room.active.endsAt } });
  }
  private resolve(room: Room, events: PendingEvent[], reason?: 'UNANIMOUS_SKIP'): void {
    const active = room.active!;
    active.biddingOpen = false;
    const player = room.players.find(p => p.id === active.playerId)!;
    if (active.highestBidderTeamId) {
      const team = room.teams.find(t => t.id === active.highestBidderTeamId)!;
      requireThat(team && remainingBudget(team) >= active.currentBidUnits, 'INVALID_STATE', 'Winner budget invalid.', 409);
      transitionPlayer(player, 'SOLD');
      team.spentUnits += active.currentBidUnits;
      team.playerIds.push(player.id);
      room.purchases.push({ id: randomUUID(), playerId: player.id, teamId: team.id, priceUnits: active.currentBidUnits,
        bidCount: active.bidCount, at: this.manager.clock.now(), durationMs: this.manager.clock.now() - active.startedAt });
      events.push({ type: 'PLAYER_SOLD', payload: { playerId: player.id, teamId: team.id, priceCr: toCr(active.currentBidUnits),
        remainingBudgetCr: toCr(remainingBudget(team)), teamPlayerCount: team.playerIds.length } },
        { type: 'TEAM_UPDATED', payload: { teamId: team.id } },
        { type: 'BUDGET_UPDATED', payload: { teamId: team.id, spentCr: toCr(team.spentUnits), remainingBudgetCr: toCr(remainingBudget(team)) } });
    } else {
      transitionPlayer(player, 'UNSOLD');
      if (reason) player.unsoldReason = reason;
      (room.playerHistory ??= []).push({ type: 'PLAYER_UNSOLD', playerId: player.id, round: player.round, at: this.manager.clock.now(), ...(reason ? { reason } : {}) });
      events.push({ type: 'PLAYER_UNSOLD', payload: { playerId: player.id, ...(reason ? { reason } : {}) } });
    }
    room.active = null;
    this.planNext(room);
  }
  async onTimer(code: string, activationId: string | null): Promise<void> {
    await this.manager.mutate(code, (room, events) => {
      if (room.status !== 'RUNNING') return;
      const now = this.manager.clock.now();
      if (activationId !== null) {
        if (room.active?.activationId !== activationId || room.active.endsAt > now) return;
        this.resolve(room, events);
      } else if (!room.active && room.nextPlayerAt !== null && room.nextPlayerAt <= now) {
        this.activateNext(room, events);
      }
    });
  }
}
