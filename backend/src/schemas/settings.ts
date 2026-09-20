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
}).strict();
export const settingsSchema = settingsShape.superRefine((s, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (s.minSquadSize > s.maxSquadSize) invalid('minSquadSize exceeds maxSquadSize');
  if (s.minimumParticipants > s.numberOfTeams) invalid('minimumParticipants exceeds numberOfTeams');
  if (s.startingBudgetCr < s.minSquadSize * s.minimumBasePriceCr) invalid('Budget cannot fund the minimum squad');
  if (s.antiSnipingResetSeconds < s.antiSnipingThresholdSeconds) invalid('Anti-sniping reset must not shorten the timer');
});
export type RoomSettings = z.infer<typeof settingsSchema>;
export const roomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);
export const nameSchema = z.string().trim().min(2).max(60).regex(/^[^\x00-\x1f\x7f<>]+$/);
export const joinSchema = z.object({ teamName: nameSchema, teamLogoUrl: z.string().url().max(2048)
  .refine(v => v.startsWith('https://'), 'Logo must use HTTPS').optional() }).strict();
export const createRoomSchema = joinSchema.extend({ auctionName: nameSchema, settings: settingsShape.partial().optional() }).strict();
