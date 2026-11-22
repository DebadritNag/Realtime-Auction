import type { Room } from '../domain/types.js';
import { requireThat } from '../domain/errors.js';
import type { RoomRepository } from './interfaces.js';
export class MemoryRoomRepository implements RoomRepository {
  protected rooms = new Map<string, Room>();
  async create(room: Room): Promise<void> {
    requireThat(!this.rooms.has(room.code), 'ROOM_CODE_CONFLICT', 'Room code already exists.', 409);
    this.rooms.set(room.code, structuredClone(room));
  }
  async findByCode(code: string): Promise<Room | null> { return structuredClone(this.rooms.get(code) ?? null); }
  async listRecoverable(): Promise<Room[]> { return structuredClone([...this.rooms.values()]); }
  async listActive(): Promise<Room[]> { return (await this.listRecoverable()).filter(r => r.status !== 'COMPLETED'); }
  async findById(id: string): Promise<Room | null> { return (await this.listRecoverable()).find(r => r.id === id) ?? null; }
  async listForUser(userId: string): Promise<Room[]> { return (await this.listRecoverable()).filter(r => r.teams.some(t => t.userId === userId)); }
  async commit(room: Room, expectedSequence: number): Promise<void> {
    requireThat(this.rooms.get(room.code)?.sequence === expectedSequence, 'VERSION_CONFLICT', 'Room was modified concurrently.', 409);
    this.rooms.set(room.code, structuredClone(room));
  }
}
