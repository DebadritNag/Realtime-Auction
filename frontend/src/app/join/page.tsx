"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRoomStore } from "@/stores/room.store";
import { useAuthStore } from "@/stores/auth.store";
import { Button, Input, Toast } from "@/components/ui";
import { LogIn, Hash, Shield, Sparkles, ArrowRight } from "lucide-react";

function JoinRoomForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") || "";

  const { joinRoom, isLoading, error, clearError } = useRoomStore();
  const { user } = useAuthStore();

  const [roomCode, setRoomCode] = useState(initialCode);
  const [teamName, setTeamName] = useState(user?.defaultTeamName || "");
  const [teamLogo, setTeamLogo] = useState(user?.defaultTeamLogo || "⚡");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.defaultTeamName && !teamName) {
      setTeamName(user.defaultTeamName);
    }
  }, [user, teamName]);

  const teamLogos = ["⚡", "🐅", "🦅", "⚔️", "☄️", "💎", "🦁", "🔴", "🐺", "🛡️"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) {
      setValidationError("Please enter a room code.");
      return;
    }
    if (!teamName.trim()) {
      setValidationError("Please enter your team franchise name.");
      return;
    }

    const success = await joinRoom({
      roomCode: cleanCode,
      teamName: teamName.trim(),
      teamLogo,
    });

    if (success) {
      router.push(`/room/${cleanCode}`);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl bg-[#0e121a] border border-[#242c3d] p-7 shadow-2xl space-y-6">
      <div className="text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400 border border-sky-500/30 mb-3 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
          <LogIn className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-[#f8fafc]">
          JOIN AUCTION ROOM
        </h1>
        <p className="text-xs text-[#94a3b8] mt-1">
          Enter the invite room code and stake your franchise in the draft lobby
        </p>
      </div>

      {(error || validationError) && (
        <Toast
          type="error"
          title="Room Entry Notice"
          message={validationError || error || ""}
          onClose={() => {
            clearError();
            setValidationError(null);
          }}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Auction Room Code"
          placeholder="e.g. ABC234"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          leftIcon={<Hash className="w-4 h-4 text-sky-400" />}
          className="font-mono uppercase font-black tracking-wider text-base"
          required
        />

        <Input
          label="Your Franchise / Team Name"
          placeholder="e.g. Howrah Tigers"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          leftIcon={<Shield className="w-4 h-4 text-[#00ff87]" />}
          helperText="Prefilled from your default manager profile"
          required
        />

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-1.5">
            Select Franchise Crest
          </label>
          <div className="flex items-center gap-2 overflow-x-auto p-1 scrollbar-none">
            {teamLogos.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setTeamLogo(emoji)}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl transition-all ${
                  teamLogo === emoji
                    ? "bg-[#00ff87]/20 border-[#00ff87] shadow-[0_0_12px_rgba(0,255,135,0.3)] scale-105"
                    : "bg-[#151a24] border-[#242c3d] text-[#cbd5e1] hover:border-[#37435e]"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            variant="stadium"
            size="lg"
            className="w-full font-black tracking-wider text-xs py-3.5"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            JOIN ROOM LOBBY
          </Button>
        </div>
      </form>


    </div>
  );
}

export default function JoinPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 pitch-radial-grid">
      <Suspense fallback={<div className="text-center text-xs text-[#64748b]">Loading join portal...</div>}>
        <JoinRoomForm />
      </Suspense>
    </div>
  );
}
