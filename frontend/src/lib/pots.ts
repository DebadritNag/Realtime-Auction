/** Display labels for auction pots. Unknown pot ids (default FC24 pool: DEF, MID, ...) are shown unchanged. */
const POT_LABELS: Record<string, string> = {
  GK: 'Goalkeepers',
  CB: 'Centre-backs',
  FB: 'Fullbacks',
  MID: 'Midfielders',
  ATT: 'Attackers',
};

export function potLabel(pot: string): string {
  return POT_LABELS[pot] ?? pot;
}
