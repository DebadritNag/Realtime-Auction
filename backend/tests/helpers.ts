import { RoomManager } from '../src/modules/rooms/room.manager.js';
import { MemoryRoomRepository } from '../src/repositories/memory.js';
import { CatalogPlayerRepository, demoPlayers } from '../src/modules/players/player.service.js';
import { RoomService } from '../src/modules/rooms/room.service.js';
import { AuctionEngine } from '../src/modules/auction/auction.engine.js';
import type { RoomSettings } from '../src/schemas/settings.js';
import type { AuctionCommand } from '../src/modules/auction/auction.schemas.js';
import type { RoomRepository } from '../src/repositories/interfaces.js';
export async function fixture(settings: Partial<RoomSettings> = {}, repository: RoomRepository = new MemoryRoomRepository(), playerCount = 2) {
  const clock = { value: 1_000_000, now() { return this.value; } };
  const manager = new RoomManager(repository, new CatalogPlayerRepository(demoPlayers.slice(0, playerCount)), clock);
  const engine = new AuctionEngine(manager);
  const rooms = new RoomService(manager);
  const room = await manager.create({ userId: 'host' }, { auctionName: 'Test Auction', teamName: 'Host FC',
    settings: { minSquadSize: 1, maxSquadSize: 3, minimumParticipants: 2, startingBudgetCr: 20, playerTimerSeconds: 10, autoAdvance: false, ...settings } });
  await rooms.join(room.code, 'alice', { teamName: 'Alice FC' });
  await rooms.join(room.code, 'bob', { teamName: 'Bob FC' });
  const command = async (type: AuctionCommand['type'], userId = 'host', extra: Record<string, unknown> = {}, requestId?: string) =>
    engine.execute(room.code, userId, { type, requestId, payload: { roomCode: room.code, ...extra } } as AuctionCommand);
  const state = () => manager.loadRoom(room.code);
  const expire = async () => {
    const current = await state();
    clock.value = current.active!.endsAt;
    await engine.onTimer(room.code, current.active!.activationId);
  };
  return { clock, manager, engine, rooms, room, command, state, expire };
}
