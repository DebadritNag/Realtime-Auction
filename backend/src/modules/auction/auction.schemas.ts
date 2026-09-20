import { z } from 'zod';
import { roomCodeSchema, settingsShape } from '../../schemas/settings.js';
const common = { roomCode: roomCodeSchema, expectedSequence: z.number().int().nonnegative().optional() };
const host = z.object(common).strict();
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PLACE_BID'), requestId: z.string().min(1).max(100).optional(),
    payload: z.object({ ...common, amountCr: z.number().finite().min(0).max(1_000_000), playerId: z.string().max(100).optional() }).strict() }).strict(),
  ...(['START_AUCTION', 'PAUSE_AUCTION', 'RESUME_AUCTION', 'NEXT_PLAYER', 'MARK_UNSOLD', 'START_RECALL', 'END_AUCTION'] as const).map(type =>
    z.object({ type: z.literal(type), requestId: z.string().min(1).max(100).optional(), payload: host }).strict()),
  z.object({ type: z.literal('KICK_MEMBER'), requestId: z.string().min(1).max(100).optional(),
    payload: z.object({ ...common, targetTeamId: z.string().uuid() }).strict() }).strict(),
  z.object({ type: z.literal('UPDATE_SETTINGS'), requestId: z.string().min(1).max(100).optional(),
    payload: z.object({ ...common, settings: settingsShape.partial() }).strict() }).strict(),
]);
export type AuctionCommand = z.infer<typeof commandSchema>;
