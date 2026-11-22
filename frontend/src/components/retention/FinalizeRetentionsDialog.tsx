"use client";
import React from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { UnderdogTag } from "@/components/shared/UnderdogTag";
import { formatCr } from "@/lib/utils";
import type { RetentionStateDTO, TeamDTO } from "@/types/backend";

export interface FinalizeRetentionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  teams: TeamDTO[];
  retention: RetentionStateDTO;
}

/** Host-only summary shown before retentions are locked and the auction can start. */
export function FinalizeRetentionsDialog({ isOpen, onClose, onConfirm, isLoading = false, teams, retention }: FinalizeRetentionsDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      title="Finalize retentions"
      description="Retentions are locked once finalized. Then you can start the auction."
    >
      <ul className="max-h-72 space-y-2 overflow-auto pr-1" data-testid="finalize-summary">
        {teams.map((team) => {
          const stats = retention.teams.find((t) => t.teamId === team.id);
          const picks = retention.picks.filter((p) => p.teamId === team.id);
          return (
            <li key={team.id} className="rounded-lg border border-[#242c3d] bg-[#151a24] p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-[#f8fafc]">{team.name}</strong>
                <span className="font-mono text-[#94a3b8]">{picks.length}/{retention.config.maxPerTeam} retained</span>
              </div>
              {picks.length === 0 ? (
                <p className="mt-1 text-[#94a3b8]">No retained players.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-[#cbd5e1]">
                  {picks.map((pick) => (
                    <li key={pick.id}>
                      {pick.player?.name || pick.playerId}
                      <UnderdogTag player={pick.player} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 font-mono text-[11px] text-[#94a3b8]">
                Spent {formatCr(stats?.spentCr ?? 0)} · Purse left {formatCr(stats?.remainingPurseCr ?? team.remainingBudgetCr)}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs font-bold text-[#f8fafc]" data-testid="finalize-total">
        Total retained: {retention.totals.retained} · Total spent: {formatCr(retention.totals.spentCr)}
      </p>
      <div className="mt-5 flex items-center justify-end gap-3 border-t border-[#242c3d] pt-3">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={onConfirm} isLoading={isLoading}>Finalize retentions</Button>
      </div>
    </Modal>
  );
}
