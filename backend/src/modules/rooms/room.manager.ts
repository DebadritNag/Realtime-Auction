import { randomInt, randomUUID } from 'node:crypto';
import type { Room, AuthContext, ServerEvent } from '../../domain/types.js';
import type { RoomRepository, PlayerRepository, RoomRuntimeHydrator } from '../../repositories/interfaces.js';
import { requireThat, DomainError } from '../../domain/errors.js';
import { SerialQueue, type RoomLock } from '../../utils/serial-queue.js';
import { settingsSchema, type RoomSettings } from '../../schemas/settings.js';
import { toUnits } from '../../domain/money.js';
import type { Clock } from '../auction/timer.service.js';
import { assertRoom } from '../auction/squad.service.js';

export interface PendingEvent { type: string; payload?: unknown }
export type CommitListener = (room: Room, events: ServerEvent[]) => void;
export class ValidatingHydrator implements RoomRuntimeHydrator {
  hydrate(room: Room): Room { assertRoom(room); return structuredClone(room); }
}
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly listeners = new Set<CommitListener>();
  constructor(readonly repository: RoomRepository, readonly players: PlayerRepository, readonly clock: Clock,
    readonly lock: RoomLock = new SerialQueue(), private hydrator: RoomRuntimeHydrator = new ValidatingHydrator()) {}
  subscribe(listener: CommitListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private publish(room: Room, events: PendingEvent[]): void {
    const envelopes = events.map(event => ({ type: event.type, roomId: room.id, sequence: room.sequence,
      serverTime: this.clock.now(), payload: event.payload ?? {} }));
    for (const listener of this.listeners) listener(structuredClone(room), envelopes);
  }
  async loadRoom(code: string): Promise<Room> {
    // Reads share the mutation lock: a slow hydration cannot overwrite a newer committed runtime.
    return this.lock.runExclusive(code, async () => structuredClone(await this.loadUnlocked(code)));
  }
  private async loadUnlocked(code: string): Promise<Room> {
    const current = this.rooms.get(code);
    if (current) return current;
    const persisted = await this.repository.findByCode(code);
    requireThat(persisted, 'ROOM_NOT_FOUND', 'Room does not exist.', 404);
    const room = this.hydrator.hydrate(persisted);
    this.rooms.set(code, room);
    return room;
  }
  async recover(): Promise<Room[]> {
    const rooms = await this.repository.listRecoverable();
    for (const room of rooms) this.rooms.set(room.code, this.hydrator.hydrate(room));
    return rooms;
  }
  removeRuntime(code: string): void { this.rooms.delete(code); }
  async create(auth: AuthContext, input: { auctionName: string; teamName: string; teamLogoUrl?: string; teamLogoEmoji?: string; settings?: Partial<RoomSettings> }): Promise<Room> {
    return this.lock.runExclusive('__create__', async () => {
      const settings = settingsSchema.parse(input.settings ?? {});
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let attempt = 0; attempt < 20; attempt++) {
        const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
        if (await this.repository.findByCode(code)) continue;
        const room: Room = { id: randomUUID(), code, hostUserId: auth.userId, auctionName: input.auctionName,
          status: 'LOBBY', createdAt: this.clock.now(), settings,
          teams: [{ id: randomUUID(), userId: auth.userId, name: input.teamName, logoUrl: input.teamLogoUrl, logoEmoji: input.teamLogoEmoji,
            startingBudgetUnits: toUnits(settings.startingBudgetCr), spentUnits: 0, playerIds: [] }],
          players: [], playerQueue: [], purchases: [], bids: [], active: null, sequence: 1, nextPlayerAt: null, receipts: {} };
        try { await this.repository.create(room); }
        catch (error) { if (error instanceof DomainError && error.code === 'ROOM_CODE_CONFLICT') continue; throw error; }
        this.rooms.set(code, room);
        return structuredClone(room);
      }
      throw new DomainError('ROOM_CODE_EXHAUSTED', 'Unable to allocate room code.', 503);
    });
  }
  async mutate<T>(code: string, action: (draft: Room, events: PendingEvent[]) => Promise<T> | T): Promise<T> {
    return this.lock.runExclusive(code, async () => {
      const current = await this.loadUnlocked(code);
      const draft = structuredClone(current);
      const events: PendingEvent[] = [];
      const result = await action(draft, events);
      if (events.length === 0) return result;
      draft.sequence = current.sequence + 1;
      assertRoom(draft);
      try { await this.repository.commit(draft, current.sequence); }
      catch {
        // Reconcile an ambiguous database outcome before allowing further commands.
        // If the read also fails, invalidate the cache so the next command must reload.
        this.rooms.delete(code);
        try {
          const persisted = await this.repository.findByCode(code);
          if (persisted) {
            const recovered = this.hydrator.hydrate(persisted);
            this.rooms.set(code, recovered);
            this.publish(recovered, [{ type: 'ROOM_UPDATED', payload: { reason: 'PERSISTENCE_RECONCILIATION' } }]);
          }
        } catch { /* fail closed until storage is available */ }
        throw new DomainError('PERSISTENCE_UNAVAILABLE', 'Storage failed; request authoritative state and retry with the same requestId.', 503);
      }
      this.rooms.set(code, draft);
      this.publish(draft, events);
      return result;
    });
  }
}
