import { z } from 'zod';
import { commandSchema } from '../modules/auction/auction.schemas.js';
import { roomCodeSchema } from '../schemas/settings.js';
const subscription = z.object({
  type: z.enum(['JOIN_ROOM', 'REJOIN_ROOM', 'REQUEST_STATE']),
  requestId: z.string().min(1).max(100).optional(), payload: z.object({ roomCode: roomCodeSchema }).strict(),
}).strict();
const ping = z.object({ type: z.literal('PING'), requestId: z.string().min(1).max(100).optional(),
  payload: z.object({}).strict().optional() }).strict();
export const clientMessageSchema = z.union([commandSchema, subscription, ping]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
