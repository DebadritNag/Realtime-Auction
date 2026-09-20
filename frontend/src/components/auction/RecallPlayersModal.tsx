"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { PlayerDTO } from "@/types/backend";
import { webSocketService } from "@/services/websocket.service";
import { normalizeError } from "@/services/api";

export function RecallPlayersModal({ players, roomCode, enabled, onClose }: {
  players: PlayerDTO[]; roomCode: string; enabled: boolean; onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previousPlayers, setPreviousPlayers] = useState(players);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Discard selections that disappear from the authoritative unsold snapshot.
  if (previousPlayers !== players) {
    setPreviousPlayers(players);
    setSelected(new Set([...selected].filter(id => players.some(p => p.id === id))));
  }
  const filtered = players.filter(p => (p.name + " " + (p.club ?? "")).toLowerCase().includes(search.trim().toLowerCase()));
  const selectedIds = players.filter(p => selected.has(p.id)).map(p => p.id);
  const submit = async () => {
    if (!enabled || pending || !selectedIds.length) return;
    setPending(true); setError(null);
    try {
      await webSocketService.send({ type: "RECALL_PLAYERS", payload: { roomCode, playerIds: selectedIds } });
      onClose();
    } catch (cause) { setError(normalizeError(cause).message); setConfirming(false); }
    finally { setPending(false); }
  };
  return <Modal isOpen onClose={() => { if (!pending) onClose(); }} title="RECALL UNSOLD PLAYERS" maxWidth="xl">
    <div className="space-y-4 text-sm text-[#cbd5e1]">
      <p>Return players to the waiting pool. The current player and timer continue unchanged.</p>
      <input autoFocus aria-label="Search unsold players" placeholder="Search player by name..." value={search}
        disabled={pending || confirming} onChange={e => setSearch(e.target.value)}
        className="w-full rounded-lg border border-[#334155] bg-[#080a0f] p-3 text-[#f8fafc] focus:outline-2 focus:outline-[#00ff87]" />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={pending || confirming || !filtered.length}
          onClick={() => setSelected(new Set([...selected, ...filtered.map(p => p.id)]))}>Select All Filtered</Button>
        <Button size="sm" variant="ghost" disabled={pending || confirming || !selectedIds.length}
          onClick={() => setSelected(new Set())}>Clear Selection</Button>
        <span aria-live="polite">{selectedIds.length} selected</span>
      </div>
      <div className="max-h-[40vh] overflow-y-auto space-y-2">
        {filtered.map(player => <label key={player.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#242c3d] bg-[#080a0f] p-3">
          <input type="checkbox" aria-label={player.name} checked={selected.has(player.id)} disabled={pending || confirming}
            className="h-5 w-5 shrink-0 accent-[#00ff87]" onChange={e => setSelected(current => {
              const next = new Set(current); if (e.target.checked) next.add(player.id); else next.delete(player.id); return next;
            })} />
          <span className="min-w-0 flex-1"><strong className="block text-[#f8fafc]">{player.name}</strong>
            <span className="text-xs text-[#94a3b8]">{player.ovr} OVR · {player.subPosition || player.position}{player.club ? " · " + player.club : ""}</span>
          </span>
          <span className="shrink-0 text-xs">₹{player.basePriceCr} Cr</span>
        </label>)}
        {!filtered.length && <p className="py-5 text-center">{players.length ? "No matching unsold players." : "No unsold players available."}</p>}
      </div>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      {!enabled && <p role="status">Recall requires a synced, running or paused auction.</p>}
      {confirming && <p role="status">Recall {selectedIds.length} {selectedIds.length === 1 ? "player" : "players"} back into the auction pool?</p>}
      <div className="flex justify-end gap-2 border-t border-[#242c3d] pt-3">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => confirming ? setConfirming(false) : onClose()}>Cancel</Button>
        <Button size="sm" variant="stadium" disabled={!enabled || pending || !selectedIds.length} isLoading={pending}
          onClick={() => confirming ? void submit() : setConfirming(true)}>{confirming ? "Recall Players" : "RECALL SELECTED"}</Button>
      </div>
    </div>
  </Modal>;
}
