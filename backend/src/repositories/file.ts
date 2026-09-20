import { mkdir, readFile, readdir, rename, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Room } from '../domain/types.js';
import type { RoomRepository } from './interfaces.js';
import { requireThat } from '../domain/errors.js';
import { roomCodeSchema } from '../schemas/settings.js';
import { SerialQueue } from '../utils/serial-queue.js';
/** Single-process adapter. Temp file + fsync + rename makes each room commit atomic.
 * Not a shared filesystem/distributed database, nor a guarantee against hardware power loss. */
export class FileRoomRepository implements RoomRepository {
  private readonly lock = new SerialQueue();
  private readonly directory: string;
  constructor(directory: string) { this.directory = resolve(directory); }
  private path(code: string): string { return join(this.directory, `${roomCodeSchema.parse(code)}.json`); }
  async findByCode(code: string): Promise<Room | null> {
    try { return JSON.parse(await readFile(this.path(code), 'utf8')) as Room; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async listRecoverable(): Promise<Room[]> {
    await mkdir(this.directory, { recursive: true });
    const names = (await readdir(this.directory)).filter(name => /^[A-HJ-NP-Z2-9]{6}\.json$/.test(name));
    return (await Promise.all(names.map(name => this.findByCode(name.slice(0, -5))))).filter((r): r is Room => r !== null);
  }
  private async write(room: Room): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.path(room.code)}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx');
    try { await file.writeFile(JSON.stringify(room)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, this.path(room.code));
  }
  async create(room: Room): Promise<void> {
    await this.lock.runExclusive(room.code, async () => {
      requireThat(!await this.findByCode(room.code), 'ROOM_CODE_CONFLICT', 'Room code already exists.', 409);
      await this.write(room);
    });
  }
  async commit(room: Room, expectedSequence: number): Promise<void> {
    await this.lock.runExclusive(room.code, async () => {
      requireThat((await this.findByCode(room.code))?.sequence === expectedSequence, 'VERSION_CONFLICT', 'Room version changed.', 409);
      await this.write(room);
    });
  }
}
