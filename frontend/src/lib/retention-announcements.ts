import type { RetentionCompletionAnnouncementDTO, RetentionTurnAnnouncementDTO } from '@/types/backend';

/** One announcement shown by the global overlay. `id` is the backend event id and is the dedupe key. */
export type RetentionAnnouncement =
  | { id: string; kind: 'RETAINED' | 'SKIPPED'; at: number; turn: RetentionTurnAnnouncementDTO }
  | { id: string; kind: 'ALL_COMPLETED'; at: number; completion: RetentionCompletionAnnouncementDTO };

/** A reconnecting client only shows announcements younger than this; older ones are marked seen silently. */
export const FRESH_ANNOUNCEMENT_MS = 15_000;
const MAX_SEEN = 200;

export const fromTurn = (turn: RetentionTurnAnnouncementDTO): RetentionAnnouncement =>
  ({ id: turn.eventId, kind: turn.kind, at: turn.at, turn });
export const fromCompletion = (completion: RetentionCompletionAnnouncementDTO): RetentionAnnouncement =>
  ({ id: completion.eventId, kind: 'ALL_COMPLETED', at: completion.at, completion });

export const seenStorageKey = (roomCode: string, userId: string) => 'retention-seen:' + roomCode + ':' + userId;

export function loadSeen(roomCode: string, userId: string): string[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(seenStorageKey(roomCode, userId));
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function saveSeen(roomCode: string, userId: string, seen: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(seenStorageKey(roomCode, userId), JSON.stringify(seen.slice(-MAX_SEEN)));
  } catch {
    /* storage unavailable: in-memory dedupe still applies */
  }
}

export const trimSeen = (seen: string[]) => seen.slice(-MAX_SEEN);
