import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import { ZodError } from 'zod';
import type { AuthContext, Room, ServerEvent } from '../domain/types.js';
import { DomainError, requireThat } from '../domain/errors.js';
import type { RoomManager } from '../modules/rooms/room.manager.js';
import type { AuctionEngine } from '../modules/auction/auction.engine.js';
import { roomState } from '../modules/rooms/room-state.js';
import { requireMember } from '../modules/rooms/room.service.js';
import { clientMessageSchema, type ClientMessage } from './protocol.js';
import { commandSchema } from '../modules/auction/auction.schemas.js';
import { UserThrottle } from '../utils/throttle.js';

interface Connection {
  id: string; socket: WebSocket; auth: AuthContext; rooms: Set<string>; lastSeen: number;
  alive: boolean; pending: number; chain: Promise<void>;
}
export class RealtimeHub {
  private readonly connections = new Map<string, Connection>();
  private readonly throttle = new UserThrottle();
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly unsubscribe: () => void;
  constructor(private manager: RoomManager, private engine: AuctionEngine, private logger: FastifyBaseLogger) {
    this.unsubscribe = manager.subscribe((room, events) => this.broadcast(room, events));
    this.heartbeat = setInterval(() => {
      for (const connection of this.connections.values()) {
        if (!connection.alive || (connection.auth.expiresAt !== undefined && connection.auth.expiresAt <= Date.now())) {
          connection.socket.close(4001, 'Heartbeat or authentication expired');
          connection.socket.terminate();
          continue;
        }
        connection.alive = false;
        connection.socket.ping();
      }
    }, 30_000).unref();
  }
  connectedUsers(code: string): string[] {
    return [...new Set([...this.connections.values()].filter(c => c.rooms.has(code)).map(c => c.auth.userId))];
  }
  private send(connection: Connection, event: ServerEvent): void {
    if (connection.socket.readyState !== 1) return;
    if (connection.socket.bufferedAmount > 1024 * 1024) { connection.socket.close(1013, 'Slow client; reconnect for state'); return; }
    connection.socket.send(JSON.stringify(event), error => { if (error) connection.socket.terminate(); });
  }
  private envelope(type: string, payload: unknown, requestId?: string): ServerEvent {
    return { type, sequence: 0, serverTime: this.manager.clock.now(), payload, requestId };
  }
  private sendState(connection: Connection, room: Room, requestId?: string): void {
    this.send(connection, { type: 'ROOM_STATE', roomId: room.id, sequence: room.sequence,
      serverTime: this.manager.clock.now(), requestId,
      payload: roomState(room, connection.auth.userId, this.manager.clock.now(), this.connectedUsers(room.code)) });
  }
  private broadcast(room: Room, events: ServerEvent[]): void {
    for (const connection of this.connections.values()) {
      if (!connection.rooms.has(room.code)) continue;
      if (!room.teams.some(t => t.userId === connection.auth.userId)) {
        connection.rooms.delete(room.code);
        this.send(connection, this.envelope('ERROR', { reason: 'NOT_ROOM_MEMBER', message: 'Room membership ended.' }));
        continue;
      }
      for (const event of events) this.send(connection, event);
      this.sendState(connection, room);
    }
  }
  private async presence(code: string): Promise<void> {
    try {
      const room = await this.manager.loadRoom(code);
      const event: ServerEvent = { type: 'PRESENCE_UPDATED', roomId: room.id, sequence: room.sequence,
        serverTime: this.manager.clock.now(), payload: { connectedUsers: this.connectedUsers(code) } };
      for (const connection of this.connections.values()) if (connection.rooms.has(code)) this.send(connection, event);
    } catch { /* room may have been removed during shutdown */ }
  }
  attach(socket: WebSocket, auth: AuthContext): void {
    const connection: Connection = { id: randomUUID(), socket, auth, rooms: new Set(), lastSeen: Date.now(),
      alive: true, pending: 0, chain: Promise.resolve() };
    this.connections.set(connection.id, connection);
    socket.on('pong', () => { connection.alive = true; connection.lastSeen = Date.now(); });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      this.connections.delete(connection.id);
      for (const code of connection.rooms) void this.presence(code);
    });
    // Handlers are attached synchronously; auth already ran in Fastify preValidation.
    socket.on('message', (raw, binary) => {
      if (connection.pending >= 32) { socket.close(1013, 'Too many pending commands'); return; }
      connection.pending++;
      connection.chain = connection.chain.then(async () => {
        let command: ClientMessage | undefined;
        try {
          requireThat(!binary, 'INVALID_MESSAGE', 'Binary commands are unsupported.');
          requireThat(auth.expiresAt === undefined || auth.expiresAt > Date.now(), 'UNAUTHENTICATED', 'Token expired.', 401);
          requireThat(this.throttle.allow(auth.userId, Date.now(), 30), 'RATE_LIMITED', 'Maximum 30 commands per second.', 429);
          command = clientMessageSchema.parse(JSON.parse(raw.toString()));
          connection.lastSeen = Date.now();
          await this.handle(connection, command);
        } catch (error) {
          const known = error instanceof DomainError;
          const validation = error instanceof ZodError || error instanceof SyntaxError;
          this.send(connection, this.envelope(command?.type === 'PLACE_BID' ? 'BID_REJECTED' : 'ERROR', {
            reason: known ? error.code : validation ? 'INVALID_MESSAGE' : 'INTERNAL_ERROR',
            message: known ? error.message : validation ? 'Malformed or invalid command.' : 'Unable to process command.',
            ...(known ? error.details : {}),
          }, command?.requestId));
          if (!known && !validation) this.logger.error({ eventType: 'COMMAND_FAILED', connectionId: connection.id }, 'Command failed');
        } finally { connection.pending--; }
      });
    });
    this.send(connection, this.envelope('CONNECTED', { connectionId: connection.id, userId: auth.userId, heartbeatIntervalMs: 30_000 }));
  }
  private async handle(connection: Connection, command: ClientMessage): Promise<void> {
    if (command.type === 'PING') { this.send(connection, this.envelope('PONG', {}, command.requestId)); return; }
    const code = command.payload.roomCode;
    if (command.type === 'JOIN_ROOM' || command.type === 'REJOIN_ROOM' || command.type === 'REQUEST_STATE') {
      const room = await this.manager.loadRoom(code);
      requireMember(room, connection.auth.userId);
      connection.rooms.add(code);
      this.sendState(connection, room, command.requestId);
      await this.presence(code);
      return;
    }
    requireThat(connection.rooms.has(code), 'NOT_ROOM_MEMBER', 'Subscribe using JOIN_ROOM or REJOIN_ROOM first.', 403);
    const result = await this.engine.execute(code, connection.auth.userId, commandSchema.parse(command));
    this.logger.info({ roomCode: code, userId: connection.auth.userId, eventType: command.type,
      requestId: command.requestId, sequence: result.sequence,
      ...(command.type === 'PLACE_BID' ? { amountCr: command.payload.amountCr } : {}) }, 'Auction command accepted');
    this.send(connection, { ...this.envelope('COMMAND_ACK', result, command.requestId), sequence: result.sequence });
    if (result.duplicate) this.sendState(connection, await this.manager.loadRoom(code), command.requestId);
  }
  close(): void {
    clearInterval(this.heartbeat);
    this.unsubscribe();
    for (const connection of this.connections.values()) connection.socket.terminate();
    this.connections.clear();
  }
}
