"use client";

import React, { useState } from "react";
import { ConnectionStatus } from "@/components/auction/ConnectionStatus";
import type { ConnectionStateStatus } from "@/stores/connection.store";
import { Copy, Check, Shield, LogOut } from "lucide-react";

export interface RoomHeaderProps {
  name: string;
  roomCode: string;
  isHost: boolean;
  connectionStatus: ConnectionStateStatus;
  onLeave: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  name,
  roomCode,
  isHost,
  connectionStatus,
  onLeave,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0e121a] border border-[#242c3d] shadow-lg">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#00ff87] bg-[#00ff87]/15 px-2 py-0.5 rounded border border-[#00ff87]/30">
            LOBBY WAITING ROOM
          </span>
          {isHost && (
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
              <Shield className="w-3 h-3" />
              ROOM HOST
            </span>
          )}
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-[#f8fafc] tracking-tight">
          {name}
        </h1>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
        {/* Room Code + copy */}
        <div className="flex items-center rounded-xl bg-[#151a24] border border-[#242c3d] p-1.5 pl-3">
          <div className="flex flex-col mr-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#64748b]">
              ROOM CODE
            </span>
            <span className="text-sm font-mono font-black text-[#f8fafc] tracking-wider">
              {roomCode}
            </span>
          </div>
          <button
            onClick={handleCopyCode}
            className="p-2 rounded-lg bg-[#1e2536] text-[#94a3b8] hover:text-[#00ff87] hover:bg-[#283248] transition-colors"
            title="Copy room code"
          >
            {copied ? (
              <Check className="w-4 h-4 text-[#00ff87]" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        <ConnectionStatus status={connectionStatus} />

        {/* Leave Room */}
        <button
          onClick={onLeave}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/15 hover:border-red-500/60 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          LEAVE ROOM
        </button>
      </div>
    </div>
  );
};
