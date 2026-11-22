"use client";

import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { NewTag, UnderdogTag } from "@/components/shared/UnderdogTag";
import { useAuctionStore } from "@/stores/auction.store";

const AUTO_DISMISS_MS = 12_000;

/** Non-blocking notice shown to every member after the server confirms an import. It never touches bidding state. */
export function PoolUpdateNotice() {
  const notice = useAuctionStore((s) => s.poolNotice);
  const dismiss = useAuctionStore((s) => s.dismissPoolNotice);
  const players = useAuctionStore((s) => s.players);
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    if (!notice || viewing) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, viewing, dismiss]);

  if (!notice) return null;
  const added = players.filter((p) => notice.playerIds.includes(p.id));
  const close = () => { setViewing(false); dismiss(); };
  return (
    <>
      <div role="status" aria-live="polite" data-testid="pool-notice"
        className="fixed bottom-4 right-4 z-40 flex max-w-sm items-center gap-3 rounded-xl border border-[#00ff87]/40 bg-[#0e121a] p-3 text-sm text-[#f8fafc] shadow-2xl">
        <UserPlus className="h-4 w-4 shrink-0 text-[#00ff87]" aria-hidden="true" />
        <span className="flex-1">{notice.count === 1 ? "1 new player has been added to the auction pool." : `${notice.count} new players have been added to the auction pool.`}</span>
        <button type="button" onClick={() => setViewing(true)}
          className="cursor-pointer rounded-md border border-[#00ff87]/40 px-2 py-1 text-xs font-bold text-[#00ff87] transition-colors duration-200 hover:bg-[#00ff87]/15 focus-visible:outline-2 focus-visible:outline-[#00ff87]">View</button>
        <button type="button" aria-label="Dismiss notification" onClick={dismiss}
          className="cursor-pointer rounded-md p-1 text-[#94a3b8] transition-colors duration-200 hover:text-[#f8fafc] focus-visible:outline-2 focus-visible:outline-[#00ff87]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {viewing && <Modal isOpen onClose={close} title="NEW PLAYERS IN THE POOL" maxWidth="lg">
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto text-sm text-[#cbd5e1]">
          {added.map((p) => <li key={p.id} className="rounded-lg border border-[#242c3d] bg-[#080a0f] p-2.5" data-testid="notice-player">
            <strong className="text-[#f8fafc]">{p.name}</strong><UnderdogTag player={p} /><NewTag player={p} />
            <span className="block text-xs text-[#94a3b8]">{p.ovr} OVR · {p.subPosition || p.position} · {p.club || "Club unavailable"}</span>
          </li>)}
          {!added.length && <li>These players are no longer waiting in the pool.</li>}
        </ul>
      </Modal>}
    </>
  );
}
