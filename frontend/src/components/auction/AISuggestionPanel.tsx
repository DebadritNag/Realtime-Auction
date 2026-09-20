"use client";

import React from "react";
import { AISuggestion } from "@/types";
import { formatCr } from "@/lib/utils";
import { Bot, CheckCircle, AlertTriangle, Sparkles } from "lucide-react";

export interface AISuggestionPanelProps {
  suggestion: AISuggestion | null;
}

export const AISuggestionPanel: React.FC<AISuggestionPanelProps> = ({
  suggestion,
}) => {
  if (!suggestion) {
    return (
      <div className="auction-ai-panel rounded-2xl bg-[#0e121a] border border-[#242c3d] p-4 text-center text-xs text-[#64748b]">
        <Bot className="w-5 h-5 mx-auto mb-2 opacity-50 text-[#00ff87]" />
        <span>Recommendations will appear when available.</span>
      </div>
    );
  }

  const riskBadgeStyles = {
    "LOW RISK": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    BALANCED: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    "HIGH RISK": "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };

  return (
    <div className="auction-ai-panel rounded-2xl bg-[#0e121a] border border-[#242c3d] p-4 text-[#f8fafc] shadow-lg space-y-3 relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#242c3d] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-[#00ff87]/15 text-[#00ff87]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#f8fafc]">
            AI AUCTION ASSISTANT
          </h3>
        </div>

        {suggestion.riskLevel && (
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
              riskBadgeStyles[suggestion.riskLevel]
            }`}
          >
            {suggestion.riskLevel}
          </span>
        )}
      </div>

      {/* Recommended Range & Ceiling */}
      <div className="auction-ai-values grid grid-cols-2 gap-2 text-center">
        <div className="bg-[#151a24] p-2.5 rounded-xl border border-[#242c3d]">
          <span className="text-[10px] text-[#94a3b8] font-bold uppercase block mb-0.5">
            RECOMMENDED RANGE
          </span>
          <span className="text-sm font-black font-mono text-[#00ff87]">
            {formatCr(suggestion.recommendedRange[0])} –{" "}
            {formatCr(suggestion.recommendedRange[1])}
          </span>
        </div>

        <div className="bg-[#151a24] p-2.5 rounded-xl border border-[#242c3d]">
          <span className="text-[10px] text-[#94a3b8] font-bold uppercase block mb-0.5">
            SUGGESTED CEILING
          </span>
          <span className="text-sm font-black font-mono text-amber-400">
            {formatCr(suggestion.suggestedCeiling)}
          </span>
        </div>
      </div>

      {/* Reasons from backend */}
      {suggestion.reasons && suggestion.reasons.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] block">
            Tactical Analysis:
          </span>
          {suggestion.reasons.map((reason, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-[#cbd5e1]">
              <CheckCircle className="w-3 h-3 text-[#00ff87] shrink-0 mt-0.5" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings from backend */}
      {suggestion.warnings && suggestion.warnings.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-[#242c3d]/60">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] block">
            Roster & Purse Warnings:
          </span>
          {suggestion.warnings.map((warning, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-300">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
