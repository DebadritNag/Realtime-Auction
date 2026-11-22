import { z } from 'zod';
import { nameSchema, settingsShape } from '../../schemas/settings.js';
/** Squad size and player counts are validated semantically (CRITICAL issues in the preview), so the schema only bounds the payload. */
export const MAX_PLAYERS_PER_TEAM_INPUT = 40;
export const restorePlayerSchema = z.object({
  name: z.string().trim().min(1).max(80).regex(/^[^\x00-\x1f\x7f<>]+$/),
  position: z.string().trim().min(1).max(10),
  acquisition: z.enum(['RETENTION', 'AUCTION']),
  underdog: z.boolean().optional(),
  /** Host resolution: an existing catalog id. */
  playerId: z.string().trim().min(1).max(100).optional(),
  /** Host resolution: create a restored-only player record. */
  manual: z.object({ ovr: z.number().int().min(1).max(99).optional() }).strict().optional(),
  /** The source image was hard to read; the host is asked to double-check this entry. */
  verify: z.boolean().optional(),
}).strict();
export const restoreTeamSchema = z.object({
  name: nameSchema,
  squadSize: z.number().int().min(0).max(MAX_PLAYERS_PER_TEAM_INPUT),
  remainingPurseCr: z.number().finite().min(0).max(1_000_000).multipleOf(0.5),
  retainedCount: z.number().int().min(0).max(MAX_PLAYERS_PER_TEAM_INPUT),
  auctionCount: z.number().int().min(0).max(MAX_PLAYERS_PER_TEAM_INPUT).optional(),
  verify: z.string().trim().min(1).max(300).optional(),
  players: z.array(restorePlayerSchema).max(MAX_PLAYERS_PER_TEAM_INPUT),
}).strict();
export const restoreSnapshotSchema = z.object({
  version: z.literal(1),
  name: nameSchema,
  hostTeam: nameSchema.optional(),
  teams: z.array(restoreTeamSchema).min(2).max(32),
}).strict();
export type RestorePlayerInput = z.infer<typeof restorePlayerSchema>;
export type RestoreTeamInput = z.infer<typeof restoreTeamSchema>;
export type RestoreSnapshot = z.infer<typeof restoreSnapshotSchema>;
export const restorePreviewBodySchema = z.object({ snapshot: restoreSnapshotSchema }).strict();
/** Only timers and bidding options may be tuned at creation; budgets, squads and the pool source are fixed by the restore. */
export const restoreSettingsOverrideSchema = settingsShape.pick({
  playerTimerSeconds: true, antiSnipingEnabled: true, antiSnipingThresholdSeconds: true, antiSnipingResetSeconds: true,
  allowCustomBids: true, autoAdvance: true, transitionDelaySeconds: true, minimumParticipants: true,
}).partial().strict();
export const restoreCreateBodySchema = z.object({
  auctionName: nameSchema,
  hostTeamName: nameSchema.optional(),
  snapshot: restoreSnapshotSchema,
  settings: restoreSettingsOverrideSchema.optional(),
}).strict();
export const restoreReleaseBodySchema = z.object({ teamId: z.string().uuid() }).strict();
