import { z } from 'zod';
export const moneySchema = z.number().finite().min(0.5).max(1_000_000).multipleOf(0.5);
export const settingsShape = z.object({
  numberOfTeams: z.number().int().min(2).max(32).default(4),
  minimumParticipants: z.number().int().min(1).max(32).default(2),
  startingBudgetCr: moneySchema.default(100),
  minSquadSize: z.number().int().min(1).max(50).default(11),
  maxSquadSize: z.number().int().min(1).max(50).default(18),
  playerTimerSeconds: z.number().int().min(1).max(300).default(20),
  antiSnipingEnabled: z.boolean().default(true),
  antiSnipingThresholdSeconds: z.number().int().min(1).max(30).default(3),
  antiSnipingResetSeconds: z.number().int().min(1).max(60).default(5),
  minimumBasePriceCr: moneySchema.default(1),
  allowCustomBids: z.boolean().default(true),
  autoAdvance: z.boolean().default(true),
  transitionDelaySeconds: z.number().int().min(0).max(120).default(3),
  playerPoolConfig: z.object({
    playerIds: z.array(z.string().min(1).max(100)).min(1).max(2000).optional(),
    potIds: z.array(z.string().min(1).max(100)).min(1).max(100).optional(),
  }).strict().default({}),
  // FC26 CSV database as the player source; DEFAULT keeps the bundled FC24 pool.
  playerPoolSource: z.enum(['DEFAULT', 'FC26']).default('DEFAULT'),
  // Only the on/off switch is configurable; price and limits are fixed constants on the server.
  retention: z.object({ enabled: z.boolean().default(false) }).strict().default({}),
}).strict();
export const settingsSchema = settingsShape.superRefine((s, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (s.minSquadSize > s.maxSquadSize) invalid('minSquadSize exceeds maxSquadSize');
  if (s.minimumParticipants > s.numberOfTeams) invalid('minimumParticipants exceeds numberOfTeams');
  if (s.startingBudgetCr < s.minSquadSize * s.minimumBasePriceCr) invalid('Budget cannot fund the minimum squad');
  if (s.antiSnipingResetSeconds < s.antiSnipingThresholdSeconds) invalid('Anti-sniping reset must not shorten the timer');
  if (s.retention.enabled && s.playerPoolSource !== 'FC26') invalid('Player retention requires the FC26 player source');
});
export type RoomSettings = z.infer<typeof settingsSchema>;
/** The FC26 pool contains 1 Cr Underdogs, so the minimum base price is forced to 1 Cr for that source. */
export function parseSettings(input: unknown): RoomSettings {
  const candidate = input && typeof input === 'object' && (input as { playerPoolSource?: unknown }).playerPoolSource === 'FC26'
    ? { ...(input as object), minimumBasePriceCr: 1 } : input;
  return settingsSchema.parse(candidate);
}
export const roomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);
export const nameSchema = z.string().trim().min(2).max(60).regex(/^[^\x00-\x1f\x7f<>]+$/);
export const joinSchema = z.object({ teamName: nameSchema, teamLogoEmoji: z.string().min(1).max(16).optional(), teamLogoUrl: z.string().url().max(2048)
  .refine(v => v.startsWith('https://'), 'Logo must use HTTPS').optional() }).strict();
/** Join body for restored rooms: the manager claims a restored team; name and logo are optional and ignored by the server. */
export const restoredJoinSchema = joinSchema.partial({ teamName: true }).extend({ restoredTeamId: z.string().uuid() }).strict();
export const createRoomSchema = joinSchema.extend({ auctionName: nameSchema, settings: settingsShape.partial().optional() }).strict();
