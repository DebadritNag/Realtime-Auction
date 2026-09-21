"use client";
import { useState } from "react";
import { SkipForward } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { webSocketService } from "@/services/websocket.service";
import { normalizeError } from "@/services/api";
import type { RoomStateDTO } from "@/types/backend";

export function SkipPlayerVote({ snapshot, synced, isHost, notice }: {
  snapshot: RoomStateDTO | null; synced: boolean; isHost: boolean; notice: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const votes = snapshot?.skipVote;
  if (!snapshot || !votes || !snapshot.activePlayerId || votes.required === 0) return null;
  const available = synced && snapshot.status === 'RUNNING' && snapshot.biddingOpen && !snapshot.highestBidderTeamId && !!snapshot.activationId;
  const vote = async () => {
    if (!available || pending || isHost) return;
    setPending(true); setError(null);
    try {
      await webSocketService.send({ type: votes.hasCurrentUserVoted ? 'REMOVE_SKIP_VOTE' : 'VOTE_SKIP_PLAYER',
        payload: { roomCode: snapshot.roomCode, playerId: snapshot.activePlayerId!, activationId: snapshot.activationId! } });
    } catch (cause) { setError(normalizeError(cause).message); }
    finally { setPending(false); }
  };
  return <div className="mx-3 mb-3 rounded-lg border border-[#263342] p-3 text-xs text-[#94a3b8]" aria-label="Participant skip voting">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span role="status">Skip votes: {votes.votes} / {votes.required}</span>
      {!isHost && <Button variant="secondary" size="sm" disabled={!available || pending} isLoading={pending}
        leftIcon={<SkipForward size={14}/>} onClick={() => void vote()}>
        {votes.hasCurrentUserVoted ? 'Remove Skip Vote' : 'Skip Player'}
      </Button>}
    </div>
    <p className="mt-2">{snapshot.highestBidderTeamId ? 'Skip voting is unavailable after an accepted bid.' : 'Every non-host manager must agree. Disconnected members still count.'}</p>
    {notice && <p role="status" className="mt-2">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-red-400">{error}</p>}
  </div>;
}
