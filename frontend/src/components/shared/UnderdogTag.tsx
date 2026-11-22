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

/** Small badge for players added to a live auction that have not been auctioned yet. */
export function NewTag({ player, className = '' }: { player?: Pick<Player, 'isNew' | 'releaseState'> | null; className?: string }) {
  if (!player?.isNew) return null;
  const held = player.releaseState === 'HELD';
  return (
    <span
      title={held ? 'Added to the auction pool, waiting for the host to release it' : 'Added to the auction pool'}
      aria-label={held ? 'New player, held' : 'New player'}
      data-testid="new-tag"
      className={`ml-1.5 inline-flex shrink-0 items-center rounded border border-[#00ff87]/50 bg-[#00ff87]/15 px-1.5 py-0.5 align-middle font-sans text-[9px] font-black uppercase leading-none tracking-wider text-[#00ff87] ${className}`}
    >
      NEW
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
