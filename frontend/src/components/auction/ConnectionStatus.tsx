"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectionStateStatus, useConnectionStore } from "@/stores/connection.store";
import { useAuctionStore } from "@/stores/auction.store";
import { RefreshCw, WifiOff } from "lucide-react";

export interface ConnectionStatusProps {
  status: ConnectionStateStatus;
  latencyMs?: number | null;
}

const LOST_MESSAGE_DELAY_MS = 3000;
const RECONNECTED_MS = 4000;

/** Four user-facing states: CONNECTED, RECONNECTING, CONNECTION LOST, RECONNECTED. No modal. */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status, latencyMs }) => {
  const reconnectedAt = useConnectionStore((s) => s.reconnectedAt);
  const reconnect = useAuctionStore((s) => s.reconnect);
  const [showLost, setShowLost] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const synced = status === "SYNCED";
  const trouble = status === "RECONNECTING" || status === "LOST" || status === "AUTH_EXPIRED";

  useEffect(() => {
    if (!trouble) { setShowLost(false); return; }
    const timer = setTimeout(() => setShowLost(true), LOST_MESSAGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trouble]);

  useEffect(() => {
    if (!synced || !reconnectedAt) { setShowBack(false); return; }
    setShowBack(true);
    const timer = setTimeout(() => setShowBack(false), RECONNECTED_MS);
    return () => clearTimeout(timer);
  }, [synced, reconnectedAt]);

  const pill = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono select-none";
  let body: React.ReactNode;
  if (synced && showBack) {
    body = (
      <span className={pill + " bg-[#00ff87]/10 border-[#00ff87]/30 text-[#00ff87]"}>
        <span className="w-2 h-2 rounded-full bg-[#00ff87]" aria-hidden="true" />
        <span className="font-bold">RECONNECTED</span>
      </span>
    );
  } else if (synced) {
    body = (
      <span className={pill + " bg-[#00ff87]/10 border-[#00ff87]/30 text-[#00ff87]"}>
        <span className="w-2 h-2 rounded-full bg-[#00ff87] shadow-[0_0_8px_#00ff87]" aria-hidden="true" />
        <span className="font-bold">CONNECTED</span>
        {latencyMs ? <span className="text-[#64748b]">{latencyMs}ms</span> : null}
      </span>
    );
  } else if (status === "RECONNECTING") {
    body = (
      <span className={pill + " bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse"}>
        <RefreshCw className="w-3 h-3 animate-spin text-amber-400" aria-hidden="true" />
        <span className="font-bold">RECONNECTING</span>
      </span>
    );
  } else if (status === "LOST" || status === "AUTH_EXPIRED") {
    body = (
      <span className={pill + " bg-red-500/15 border-red-500/40 text-red-400"}>
        <WifiOff className="w-3 h-3 text-red-400" aria-hidden="true" />
        <span className="font-bold">CONNECTION LOST</span>
      </span>
    );
  } else if (status === "DISCONNECTED") {
    body = (
      <span className={pill + " bg-slate-500/15 border-slate-500/40 text-slate-400"}>
        <WifiOff className="w-3 h-3" aria-hidden="true" />
        <span className="font-bold">DISCONNECTED</span>
      </span>
    );
  } else {
    body = (
      <span className={pill + " bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse"}>
        <RefreshCw className="w-3 h-3 animate-spin text-amber-400" aria-hidden="true" />
        <span className="font-bold">CONNECTING</span>
      </span>
    );
  }

  let note: React.ReactNode = null;
  if (status === "AUTH_EXPIRED") {
    note = (
      <span className="text-[11px] text-amber-300">
        Your session expired. Sign in again to rejoin your auction.{" "}
        <Link href="/auth/signin" className="underline font-bold">Sign in again</Link>
      </span>
    );
  } else if (trouble && showLost) {
    note = <span className="text-[11px] text-amber-300">Connection lost. Trying to reconnect to your auction...</span>;
  } else if (synced && showBack) {
    note = <span className="text-[11px] text-[#00ff87]">You&apos;re back! Reconnected to your team.</span>;
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2" role="status" aria-live="polite" data-testid="connection-status">
      {body}
      {note}
      {status === "LOST" || status === "AUTH_EXPIRED" ? (
        <button type="button" onClick={reconnect} className="cursor-pointer px-2.5 py-1 rounded-full border border-[#00ff87]/40 text-[11px] font-bold text-[#00ff87] hover:bg-[#00ff87]/10 transition-colors duration-200">
          Reconnect to Auction
        </button>
      ) : null}
    </div>
  );
};
