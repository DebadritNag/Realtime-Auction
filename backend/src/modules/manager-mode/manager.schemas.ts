import { z } from 'zod';
const id = z.string().min(1).max(100);
export const setupSchema = z.object({ name: z.string().trim().min(2).max(100), startingBudgetUnits: z.number().int().min(0).max(20000).default(200), format: z.enum(['SINGLE_ROUND_ROBIN', 'DOUBLE_ROUND_ROBIN']).default('SINGLE_ROUND_ROBIN'), csv: z.string().max(2000000).default('') }).strict();
export const actionSchema = z.discriminatedUnion('type', [
 z.object({type:z.literal('START_NEGOTIATION'),playerId:id}).strict(),
 z.object({type:z.literal('OFFER_FREE_AGENT'),sessionId:id,amountUnits:z.number().int().positive().max(20000)}).strict(),
 z.object({type:z.literal('END_NEGOTIATION'),sessionId:id}).strict(),
 z.object({type:z.literal('CONFIRM_SIGNING'),sessionId:id}).strict(),
 z.object({type:z.literal('TRANSFER_RULES'),difficulty:z.enum(['RELAXED','NORMAL','HARD']),visibility:z.enum(['PRIVATE','SEMI_TRANSPARENT','TRANSPARENT']),walkAwayCooldownMs:z.number().int().min(10000).max(3600000)}).strict(),
    z.object({ type: z.literal('INVITATION'), accept: z.boolean() }),
    z.object({ type: z.literal('GENERATE_FIXTURES') }),
    z.object({ type: z.literal('SCORE'), fixtureId: id, homeScore: z.number().int().min(0).max(99), awayScore: z.number().int().min(0).max(99) }),
    z.object({ type: z.literal('RESET_SCORE'), fixtureId: id }),
    z.object({ type: z.literal('WINDOW'), open: z.boolean() }),
    z.object({ type: z.literal('STATUS'), status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']) }),
    z.object({ type: z.literal('TRADE'), offeredPlayerId: id, requestedPlayerId: id, parentTradeId: id.optional() }),
    z.object({ type: z.literal('TRADE_RESPONSE'), tradeId: id, response: z.enum(['ACCEPT', 'REJECT', 'CANCEL']) }),
    z.object({ type: z.literal('READ_NOTIFICATION'), notificationId: id }),
    z.object({ type: z.literal('ANNOUNCE'), message: z.string().trim().min(1).max(500) }),
    z.object({ type: z.literal('RESEND_INVITATIONS') })
]);
export const mutationSchema = z.object({ requestId: z.string().uuid(), action: actionSchema }).strict();
export type ManagerAction = z.infer<typeof actionSchema>;
