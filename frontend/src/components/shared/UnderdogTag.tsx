import type { Player } from '@/types';

/** Small badge rendered beside a player's name. Renders nothing for regular players. */
export function UnderdogTag({ player, className = '' }: { player?: Pick<Player, 'playerTag'> | null; className?: string }) {
  if (player?.playerTag !== 'UNDERDOG') return null;
  return (
    <span
      title="Underdog player"
      aria-label="Underdog player"
      data-testid="underdog-tag"
      className={`ml-1.5 inline-flex shrink-0 items-center rounded border border-fuchsia-400/50 bg-fuchsia-500/20 px-1.5 py-0.5 align-middle font-sans text-[9px] font-black uppercase leading-none tracking-wider text-fuchsia-200 ${className}`}
    >
      UNDERDOG
    </span>
  );
}

/** Small label for players added through the pre-auction retention phase. */
export function RetainedTag({ player, className = '' }: { player?: Pick<Player, 'isRetained'> | null; className?: string }) {
  if (!player?.isRetained) return null;
  return (
    <span
      title="Retained before the auction"
      aria-label="Retained player"
      data-testid="retained-tag"
      className={`ml-1.5 inline-flex shrink-0 items-center rounded border border-sky-400/50 bg-sky-500/15 px-1.5 py-0.5 align-middle font-sans text-[9px] font-black uppercase leading-none tracking-wider text-sky-200 ${className}`}
    >
      RETAINED
    </span>
  );
}
