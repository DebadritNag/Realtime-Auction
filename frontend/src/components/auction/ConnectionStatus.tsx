"use client";

import React from "react";
import { ConnectionStateStatus } from "@/stores/connection.store";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export interface ConnectionStatusProps {
  status: ConnectionStateStatus;
  latencyMs?: number | null;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  latencyMs,
}) => {
  if (status === "SYNCED") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00ff87]/10 border border-[#00ff87]/30 text-[#00ff87] text-[11px] font-mono select-none">
        <span className="w-2 h-2 rounded-full bg-[#00ff87] shadow-[0_0_8px_#00ff87]" />
        <span className="font-bold">LIVE SYNC</span>
        {latencyMs && <span className="text-[#64748b]">{latencyMs}ms</span>}
      </div>
    );
  }

  if (status === "RECONNECTING" || status === "CONNECTING" || status === "CONNECTED") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-mono animate-pulse select-none">
        <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
        <span className="font-bold">{status === "RECONNECTING" ? "RECONNECTING…" : "SYNCHRONIZING…"}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/40 text-red-400 text-[11px] font-mono select-none">
      <WifiOff className="w-3 h-3 text-red-400" />
      <span className="font-bold">DISCONNECTED</span>
    </div>
  );
};
