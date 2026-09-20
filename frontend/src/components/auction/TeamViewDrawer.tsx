"use client";

/**
 * TeamViewDrawer — Full detailed squad view.
 *
 * Opens as a wide right-side drawer from the live auction page.
 * The auction continues running in the background — no WS changes.
 * Data comes entirely from the existing auction store (teams + players).
 * Switches between all participating teams.
 */

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { cn, formatCr, getPositionColor } from "@/lib/utils";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { Player, Team } from "@/types";
import { generateTeamPdf } from "@/lib/pdf";
import { ExternalLink, TrendingDown, TrendingUp, Minus, Users, Shield, Swords, Star, Download, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  selectedTeamId: string | null;    // null → default to current user's team
  currentUserTeamId: string | null;
  roomCode: string;
  auctionName?: string;
  settings: {
    maxSquadSize: number;
    minSquadSize: number;
    startingBudget: number;
    minPlayerBasePrice: number;
  } | null;
  onSelectTeam: (teamId: string) => void;
}

// Position groups matching backend categories
const POSITION_GROUPS = [
  { key: "GK",  label: "Goalkeepers",  positions: ["GK"],                             color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/30" },
  { key: "DEF", label: "Defenders",    positions: ["DEF","CB","LB","RB","LWB","RWB"], color: "text-blue-400",    bg: "bg-blue-400/10",    border: "border-blue-400/30" },
  { key: "MID", label: "Midfielders",  positions: ["MID","CM","CAM","CDM","LM","RM"], color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30" },
  { key: "ATT", label: "Attackers",    positions: ["ATT","FWD","ST","CF","LW","RW"],  color: "text-rose-400",    bg: "bg-rose-400/10",    border: "border-rose-400/30" },
] as const;

function groupPlayers(squad: Player[]): Record<string, Player[]> {
  const groups: Record<string, Player[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of squad) {
    const pos = (p.position ?? "MID").toUpperCase();
    if (pos === "GK") groups.GK!.push(p);
    else if (["DEF","CB","LB","RB","LWB","RWB"].includes(pos)) groups.DEF!.push(p);
    else if (["MID","CM","CAM","CDM","LM","RM"].includes(pos)) groups.MID!.push(p);
    else groups.ATT!.push(p);
  }
  return groups;
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === 0) return null;
  const color =
    value >= 85 ? "text-[#00ff87]" :
    value >= 75 ? "text-sky-400" :
    value >= 65 ? "text-slate-300" : "text-slate-500";
  return (
    <span className="flex flex-col items-center min-w-[28px]">
      <span className={cn("text-[11px] font-black font-mono leading-none", color)}>{value}</span>
      <span className="text-[9px] text-[#64748b] uppercase leading-none mt-0.5">{label}</span>
    </span>
  );
}

// ── Player card ───────────────────────────────────────────────────────────────
function PlayerCard({ player }: { player: Player }) {
  const posColor = getPositionColor(player.position);
  const price = player.soldPrice ?? player.basePrice;

  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#0d111a] border border-[#1e2a3a] hover:border-[#2a3a50] transition-colors group">
      {/* OVR + position badge */}
      <div className={cn(
        "flex-shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center border text-center",
        posColor.bg, posColor.border
      )}>
        <span className={cn("text-[11px] font-black leading-none", posColor.text)}>
          {player.subPosition ?? player.position}
        </span>
        <span className="text-xs font-black text-[#f8fafc] leading-none mt-0.5">{player.ovr}</span>
      </div>

      {/* Name + club */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-[#f8fafc] truncate leading-snug">{player.name}</p>
        <p className="text-[10px] text-[#64748b] truncate leading-snug">
          {player.nationality ? `${player.nationality} · ` : ""}{player.club}
        </p>

        {/* Stats row — compact */}
        {player.stats && (
          <div className="flex items-center gap-2 mt-1">
            <StatPill label="PAC" value={player.stats.pac} />
            <StatPill label="SHO" value={player.stats.sho} />
            <StatPill label="PAS" value={player.stats.pas} />
            <StatPill label="DRI" value={player.stats.dri} />
            <StatPill label="DEF" value={player.stats.def} />
            <StatPill label="PHY" value={player.stats.phy} />
          </div>
        )}
      </div>

      {/* Purchase price */}
      <div className="flex-shrink-0 text-right">
        <span className="block text-xs font-black font-mono text-amber-400">{formatCr(price)}</span>
        {player.soldPrice && player.soldPrice > player.basePrice && (
          <span className="text-[9px] text-rose-400/70 font-mono">
            base {formatCr(player.basePrice)}
          </span>
        )}
        {player.soldPrice && player.soldPrice < player.basePrice && (
          <span className="text-[9px] text-[#00ff87]/70 font-mono">
            base {formatCr(player.basePrice)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Position progress row ─────────────────────────────────────────────────────
function PositionRow({
  label, count, color, bg, border,
}: { label: string; count: number; color: string; bg: string; border: string }) {
  return (
    <div className={cn("flex items-center justify-between px-3 py-2 rounded-lg border", bg, border)}>
      <span className={cn("text-xs font-black uppercase tracking-wider", color)}>{label}</span>
      <span className="text-xs font-mono font-bold text-[#f8fafc]">{count}</span>
    </div>
  );
}

// ── Budget health row ─────────────────────────────────────────────────────────
function BudgetRow({
  label, value, sub, highlight = false,
}: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1e2a3a] last:border-0">
      <span className="text-xs text-[#94a3b8]">{label}</span>
      <div className="text-right">
        <span className={cn("text-xs font-mono font-bold", highlight ? "text-[#00ff87]" : "text-[#f8fafc]")}>{value}</span>
        {sub && <span className="block text-[10px] text-[#64748b]">{sub}</span>}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const TeamViewDrawer: React.FC<Props> = ({
  isOpen, onClose, teams, selectedTeamId, currentUserTeamId,
  roomCode, auctionName, settings, onSelectTeam,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Resolve which team to show — default to current user's
  const activeTeam: Team | null = useMemo(() => {
    if (!teams.length) return null;
    if (selectedTeamId) return teams.find(t => t.id === selectedTeamId) ?? teams[0] ?? null;
    return teams.find(t => t.isCurrentUser || t.id === currentUserTeamId) ?? teams[0] ?? null;
  }, [teams, selectedTeamId, currentUserTeamId]);

  const handleDownloadPdf = async () => {
    if (!activeTeam || isGeneratingPdf) return;
    try {
      setIsGeneratingPdf(true);
      setPdfError(null);
      generateTeamPdf({
        auctionName: auctionName || "ArenaAuction Live Room",
        roomCode,
        team: activeTeam,
        maxSquadSize: settings?.maxSquadSize ?? 24,
        minSquadSize: settings?.minSquadSize ?? 15,
      });
    } catch (err) {
      console.error("Failed to generate team PDF:", err);
      setPdfError("Unable to export PDF. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const grouped = useMemo(() => groupPlayers(activeTeam?.squad ?? []), [activeTeam]);

  const squadValue = useMemo(
    () => (activeTeam?.squad ?? []).reduce((sum, p) => sum + (p.soldPrice ?? 0), 0),
    [activeTeam]
  );

  const avgPurchase = useMemo(() => {
    const sq = activeTeam?.squad ?? [];
    return sq.length ? squadValue / sq.length : 0;
  }, [squadValue, activeTeam]);

  const mostExpensive = useMemo(
    () => (activeTeam?.squad ?? []).reduce<Player | null>((best, p) =>
      (!best || (p.soldPrice ?? 0) > (best.soldPrice ?? 0)) ? p : best, null),
    [activeTeam]
  );

  const minBudgetReserve = useMemo(() => {
    if (!settings || !activeTeam) return 0;
    const playersNeeded = Math.max(0, settings.minSquadSize - activeTeam.squadCount);
    return playersNeeded * (settings.minPlayerBasePrice ?? 0.5);
  }, [settings, activeTeam]);

  const availableSpend = activeTeam
    ? Math.max(0, activeTeam.budgetRemaining - minBudgetReserve)
    : 0;

  if (!isOpen) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position="right"
      className="sm:max-w-xl"
      title={
        activeTeam ? (
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none">{activeTeam.logo}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[#f8fafc] truncate">{activeTeam.name}</h3>
                {activeTeam.isCurrentUser && (
                  <span className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-[#00ff87]/15 text-[#00ff87] border border-[#00ff87]/30 uppercase tracking-wide">
                    YOU
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#64748b] truncate">@{activeTeam.managerUsername}</p>
            </div>
          </div>
        ) : "TEAM VIEW"
      }
    >
      {!activeTeam ? (
        <div className="flex items-center justify-center h-32 text-[#64748b] text-sm">
          No team data yet.
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Team selector tabs ─────────────────────────────────────── */}
          {teams.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {teams.map(t => (
                <button
                  key={t.id}
                  onClick={() => onSelectTeam(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                    t.id === activeTeam.id
                      ? "bg-[#00ff87]/10 border-[#00ff87]/50 text-[#00ff87]"
                      : "bg-[#0d111a] border-[#1e2a3a] text-[#94a3b8] hover:border-[#2a3a50] hover:text-[#f8fafc]"
                  )}
                >
                  <span>{t.logo}</span>
                  <span className="truncate max-w-[80px]">{t.shortName}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Header Action Area: Export PDF ─────────────────────────── */}
          <div className="flex items-center justify-between gap-3 bg-[#0d111a] border border-[#1e2a3a] rounded-xl p-3">
            <div>
              <span className="text-xs font-bold text-[#f8fafc] block">Official Squad Report</span>
              <span className="text-[10px] text-[#64748b]">Includes valuations, key stats & ratings</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              isLoading={isGeneratingPdf}
              leftIcon={<Download className="w-3.5 h-3.5" />}
              className="text-xs font-bold py-1.5 px-3 border-[#00ff87]/50 text-[#00ff87] hover:bg-[#00ff87]/15 shrink-0"
            >
              {isGeneratingPdf ? "GENERATING..." : "DOWNLOAD TEAM PDF"}
            </Button>
          </div>

          {pdfError && (
            <Toast type="error" message={pdfError} onClose={() => setPdfError(null)} />
          )}

          {/* ── Budget summary ─────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#0d111a] border border-[#1e2a3a] rounded-xl p-3 text-center">
              <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider block mb-1">Budget Left</span>
              <span className="text-lg font-black font-mono text-[#00ff87] leading-none">{formatCr(activeTeam.budgetRemaining)}</span>
            </div>
            <div className="bg-[#0d111a] border border-[#1e2a3a] rounded-xl p-3 text-center">
              <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider block mb-1">Spent</span>
              <span className="text-lg font-black font-mono text-amber-400 leading-none">{formatCr(activeTeam.budgetSpent)}</span>
            </div>
            <div className="bg-[#0d111a] border border-[#1e2a3a] rounded-xl p-3 text-center">
              <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider block mb-1">Players</span>
              <span className="text-lg font-black font-mono text-sky-400 leading-none">
                {activeTeam.squadCount}<span className="text-[#64748b] text-sm">/{settings?.maxSquadSize ?? "—"}</span>
              </span>
            </div>
          </div>

          {/* ── Position breakdown ─────────────────────────────────────── */}
          <div>
            <h4 className="text-[10px] uppercase font-bold tracking-wider text-[#64748b] mb-2">Position Breakdown</h4>
            <div className="grid grid-cols-2 gap-1.5">
              {POSITION_GROUPS.map(g => (
                <PositionRow
                  key={g.key}
                  label={g.key}
                  count={grouped[g.key]?.length ?? 0}
                  color={g.color}
                  bg={g.bg}
                  border={g.border}
                />
              ))}
            </div>
          </div>

          {/* ── Squad value summary ────────────────────────────────────── */}
          {activeTeam.squad.length > 0 && (
            <div className="bg-[#0d111a] border border-[#1e2a3a] rounded-xl p-3 space-y-0.5">
              <h4 className="text-[10px] uppercase font-bold tracking-wider text-[#64748b] mb-2 flex items-center gap-1.5">
                <Star className="w-3 h-3" />Squad Summary
              </h4>
              <BudgetRow label="Squad Value" value={formatCr(squadValue)} />
              <BudgetRow label="Average Purchase" value={formatCr(avgPurchase)} />
              {mostExpensive && (
                <BudgetRow
                  label="Most Expensive"
                  value={formatCr(mostExpensive.soldPrice ?? mostExpensive.basePrice)}
                  sub={mostExpensive.name}
                />
              )}
            </div>
          )}

          {/* ── Budget health ──────────────────────────────────────────── */}
          {settings && (
            <div className="bg-[#0d111a] border border-[#1e2a3a] rounded-xl p-3">
              <h4 className="text-[10px] uppercase font-bold tracking-wider text-[#64748b] mb-2 flex items-center gap-1.5">
                <Shield className="w-3 h-3" />Budget Status
              </h4>
              <BudgetRow label="Remaining Purse" value={formatCr(activeTeam.budgetRemaining)} highlight />
              <BudgetRow
                label="Players Still Needed"
                value={String(Math.max(0, settings.minSquadSize - activeTeam.squadCount))}
                sub={`min squad: ${settings.minSquadSize}`}
              />
              {minBudgetReserve > 0 && (
                <BudgetRow label="Minimum Reserve" value={formatCr(minBudgetReserve)} />
              )}
              {minBudgetReserve > 0 && (
                <BudgetRow
                  label="Available to Spend"
                  value={formatCr(availableSpend)}
                  highlight={availableSpend > 0}
                />
              )}
            </div>
          )}

          {/* ── Squad grouped by position ──────────────────────────────── */}
          <div>
            <h4 className="text-[10px] uppercase font-bold tracking-wider text-[#64748b] mb-2 flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              Squad ({activeTeam.squad.length} {activeTeam.squad.length === 1 ? "player" : "players"})
            </h4>
            {activeTeam.squad.length === 0 ? (
              <div className="text-center py-8 bg-[#0d111a] rounded-xl border border-dashed border-[#1e2a3a]">
                <Swords className="w-5 h-5 text-[#2a3a50] mx-auto mb-2" />
                <p className="text-xs text-[#64748b]">No signings yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {POSITION_GROUPS.map(g => {
                  const players = grouped[g.key] ?? [];
                  if (!players.length) return null;
                  return (
                    <div key={g.key}>
                      <div className={cn("flex items-center gap-2 mb-1.5")}>
                        <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border", g.color, g.bg, g.border)}>
                          {g.label}
                        </span>
                        <span className="text-[10px] text-[#64748b]">{players.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {players.map(p => (
                          <PlayerCard key={p.id} player={p} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Open full page & PDF Download ─────────────────────────── */}
          <div className="pt-1 pb-2 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className={cn(
                  "flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl",
                  "border border-[#00ff87]/40 bg-[#00ff87]/10 hover:bg-[#00ff87]/20",
                  "text-xs font-bold text-[#00ff87] transition-colors disabled:opacity-50 cursor-pointer"
                )}
              >
                {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isGeneratingPdf ? "Generating PDF..." : "Download Team PDF"}</span>
              </button>

              <Link
                href={`/team/${roomCode}/${activeTeam.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl",
                  "border border-[#1e2a3a] bg-[#0d111a] hover:bg-[#111827] hover:border-[#2a3a50]",
                  "text-xs font-bold text-[#94a3b8] hover:text-[#f8fafc] transition-colors"
                )}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Full Page
              </Link>
            </div>
            <p className="text-[10px] text-center text-[#3a4a5a] mt-1.5">
              Exports full roster with ratings, valuations & player stats
            </p>
          </div>

        </div>
      )}
    </Drawer>
  );
};
