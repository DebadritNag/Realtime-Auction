/** Short relative time such as "just now", "5 min ago", "3 h ago", "2 d ago". */
export function relativeTime(at: number | null | undefined, now: number = Date.now()): string {
  if (!at) return "never";
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}
