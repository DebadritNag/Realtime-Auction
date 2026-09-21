import type { Room } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';

export function skipVoteState(room: Room, userId?: string) {
  const eligible = room.teams.filter(t => t.userId !== room.hostUserId).map(t => t.userId);
  const voters = [...new Set(room.active?.skipVoterUserIds ?? [])].filter(id => eligible.includes(id));
  return { votes: voters.length, required: eligible.length, hasCurrentUserVoted: userId ? voters.includes(userId) : false };
}

/** Called only within the same room lock used by bids and timer resolution. */
export function updateSkipVote(room: Room, userId: string, playerId: string, activationId: string, remove: boolean, now: number) {
  requireThat(userId !== room.hostUserId, 'HOST_CANNOT_VOTE', 'The host uses Mark Unsold instead.', 403);
  requireThat(room.status === 'RUNNING', room.status === 'PAUSED' ? 'AUCTION_PAUSED' : 'AUCTION_NOT_RUNNING', 'Skip voting requires a running auction.', 409);
  const active = room.active;
  requireThat(active, 'NO_ACTIVE_PLAYER', 'No active player.', 409);
  requireThat(active.playerId === playerId && active.activationId === activationId, 'STALE_STATE', 'This player activation has already changed.', 409);
  requireThat(active.biddingOpen, 'INVALID_STATE', 'Bidding has closed.', 409);
  requireThat(now < active.endsAt, 'TIMER_EXPIRED', 'This player has expired.', 409);
  requireThat(!active.highestBidderTeamId, 'BIDS_EXIST', 'An accepted bid cannot be discarded by skip voting.', 409);
  const eligible = room.teams.filter(t => t.userId !== room.hostUserId).map(t => t.userId);
  requireThat(eligible.includes(userId), 'NOT_ROOM_MEMBER', 'Only room members may vote.', 403);
  const votes = new Set((active.skipVoterUserIds ?? []).filter(id => eligible.includes(id)));
  requireThat(remove ? votes.has(userId) : !votes.has(userId), remove ? 'NO_SKIP_VOTE' : 'ALREADY_VOTED', remove ? 'You have no skip vote to remove.' : 'Your skip vote is already counted.', 409);
  if (remove) votes.delete(userId); else votes.add(userId);
  active.skipVoterUserIds = [...votes];
  return { votes: votes.size, required: eligible.length, unanimous: eligible.length > 0 && votes.size === eligible.length };
}
