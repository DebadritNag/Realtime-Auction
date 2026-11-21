import { ShieldCheck } from 'lucide-react';
import { formatCr } from '@/lib/utils';

export interface AcquisitionBadgeProps {
  /** Renders nothing when false, so callers can pass `player.isRetained` directly. */
  retained?: boolean;
  variant?: 'badge' | 'detail';
  /** "stack" puts the three detail lines on top of each other for narrow cards. */
  layout?: 'row' | 'stack';
  /** Team that owns the player through retention. */
  teamName?: string;
  costCr?: number;
  className?: string;
}

/** RETAINED pill (dense lists) or the full acquisition lines (detail panels). Retention is the only acquisition type shown. */
export function AcquisitionBadge({ retained, variant = 'badge', layout = 'row', teamName, costCr, className = '' }: AcquisitionBadgeProps) {
  if (!retained) return null;
  if (variant === 'badge') {
    return (
      <span
        data-testid="retained-badge"
        title="Retained before the auction"
        className={`inline-flex shrink-0 items-center gap-1 rounded border border-[#f5c542]/50 bg-[#f5c542]/15 px-1.5 py-0.5 align-middle font-sans text-[9px] font-black uppercase leading-none tracking-wider text-[#f5c542] ${className}`}
      >
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Retained
      </span>
    );
  }
  return (
    <dl data-testid="acquisition-detail" className={`grid grid-cols-1 gap-x-4 gap-y-0.5 rounded-lg border border-[#f5c542]/25 bg-[#f5c542]/5 px-2.5 py-1.5 text-[11px] ${layout === 'row' ? 'sm:grid-cols-3' : ''} ${className}`}>
      <div><dt className="text-[10px] uppercase text-[#94a3b8]">Acquisition Type</dt><dd className="font-bold text-[#f5c542]">Retention</dd></div>
      <div><dt className="text-[10px] uppercase text-[#94a3b8]">Acquired By</dt><dd className="truncate font-bold text-[#f8fafc]">{teamName ?? 'Unknown team'}</dd></div>
      <div><dt className="text-[10px] uppercase text-[#94a3b8]">Acquisition Cost</dt><dd className="font-mono font-bold text-[#f8fafc]">{formatCr(costCr ?? 15)}</dd></div>
    </dl>
  );
}
