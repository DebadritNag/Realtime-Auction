import type {Tournament,TournamentState} from '../modules/manager-mode/manager.types.js';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {realtimeManagerState} from '../modules/manager-mode/realtime-state.js';
import type { ManagerModeService } from '../modules/manager-mode/manager.service.js';
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
  managerSignatures?:Record<string,string>;
  managerState?:TournamentState; managerTournament?: string; managerInbox?: boolean; id: string; socket: WebSocket; auth: AuthContext; rooms: Set<string>; lastSeen: number;
  deltaUpdates?:boolean; connectedAt:number;notified:Set<string>; alive: boolean; pending: number; chain: Promise<void>;
}
export class RealtimeHub {
  private readonly connections = new Map<string, Connection>();
  private readonly throttle = new UserThrottle();
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly unsubscribe: () => void;
  private readonly unsubscribeManager: () => void;
  private pendingManager=new Map<string,{t:Tournament;event:string}>();
  private managerFlush:ReturnType<typeof setTimeout>|undefined;
  private readonly lag=monitorEventLoopDelay({resolution:20});
  constructor(private manager: RoomManager, private engine: AuctionEngine, private logger: FastifyBaseLogger, private managerMode: ManagerModeService) {
    this.unsubscribeManager = managerMode.subscribe((t,event,audience) => {
      if(event==='MANAGER_MODE_DELETED')this.pendingManager.delete(t.id);
      if(['MANAGER_MODE_CREATED','MANAGER_MODE_UPDATED'].includes(event)){
        const old=this.pendingManager.get(t.id);
        if(!old||old.t.sequence<=t.sequence)this.pendingManager.set(t.id,{t,event});
        if(!this.managerFlush)this.managerFlush=setTimeout(()=>{this.managerFlush=undefined;const batch=[...this.pendingManager.values()];this.pendingManager.clear();for(const item of batch)this.broadcastManager(item.t,item.event);},25);
        return;
      }
      for(const c of this.connections.values()) {
        if(!t.teams.some(team=>team.managerUserId===c.auth.userId)||audience&&!audience.includes(c.auth.userId)) continue;
        if(!c.deltaUpdates&&['PLAYER_RELEASED','FREE_AGENT_POOL_UPDATED'].includes(event))continue;
        this.send(c,{...this.envelope(event,{tournamentId:t.id}),sequence:t.sequence});
      }
    });
    this.unsubscribe = manager.subscribe((room, events) => this.broadcast(room, events));
    this.lag.enable();
    this.heartbeat = setInterval(() => {
      this.logger.info({event:'realtime_health',activeWsConnections:this.connections.size,eventLoopLagMs:Number((this.lag.mean/1e6).toFixed(2)),eventLoopLagP99Ms:Number((this.lag.percentile(99)/1e6).toFixed(2)),rssBytes:process.memoryUsage().rss},'Realtime health');this.lag.reset();
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
  private broadcastManager(t:Tournament,event:string){
    const started=performance.now(),views=new Map<string,TournamentState>();let recipients=0;
    for(const c of this.connections.values()){
      const team=t.teams.find(team=>team.managerUserId===c.auth.userId);if(!team)continue;
      try{
        if(c.deltaUpdates){
          for(const n of t.notifications)if(n.userId===c.auth.userId&&!n.read&&n.createdAt>=c.connectedAt&&!c.notified.has(n.id)){c.notified.add(n.id);this.send(c,{...this.envelope('NOTIFICATION_CREATED',n),sequence:t.sequence});}
          if(c.notified.size>500){const keep=[...c.notified].slice(-250);c.notified=new Set(keep);}
          this.send(c,{...this.envelope('MANAGER_MODE_SUMMARY',{id:t.id,name:t.name,sourceAuctionId:t.sourceAuctionId,sourceAuctionCode:t.sourceAuctionCode,status:t.status,teamName:team.name,invitation:team.invitation,unread:t.notifications.filter(n=>n.userId===c.auth.userId&&!n.read).length,sequence:t.sequence}),sequence:t.sequence});
        }
        if(c.managerTournament===t.id&&(!c.managerState||t.sequence>c.managerState.sequence)){
          const next=views.get(c.auth.userId)??realtimeManagerState(this.managerMode.view(t,c.auth.userId));views.set(c.auth.userId,next);const previous=c.managerState;
          if(c.deltaUpdates&&previous&&previous.id===next.id){
            const signatures=Object.fromEntries(Object.entries(next).map(([key,value])=>[key,JSON.stringify(value)]));
            const changes=Object.fromEntries(Object.entries(next).filter(([key])=>signatures[key]!==c.managerSignatures?.[key]));
            c.managerSignatures=signatures;
            this.send(c,{...this.envelope('MANAGER_MODE_PATCH',{tournamentId:t.id,baseSequence:previous.sequence,changes}),sequence:t.sequence});
          }else {this.send(c,{...this.envelope('MANAGER_MODE_STATE',next),sequence:t.sequence});c.managerSignatures=Object.fromEntries(Object.entries(next).map(([key,value])=>[key,JSON.stringify(value)]));}
          c.managerState=next;recipients++;
        }
        this.send(c,{...this.envelope(event,{tournamentId:t.id}),sequence:t.sequence});
      }catch{this.logger.error({event:'manager_broadcast_failed',tournamentId:t.id,userId:c.auth.userId,connectionId:c.id,sequence:t.sequence},'Manager broadcast failed');this.send(c,this.envelope('ERROR',{reason:'INTERNAL_ERROR',message:'Tournament synchronization will retry.'}));}
    }
    this.logger.info({event:'manager_broadcast',tournamentId:t.id,sequence:t.sequence,broadcastRecipients:recipients,broadcastMs:Math.round(performance.now()-started)},'Manager broadcast');
  }
  connectedUsers(code: string): string[] {
    return [...new Set([...this.connections.values()].filter(c => c.rooms.has(code)).map(c => c.auth.userId))];
  }
  /** Map of userId → username for all connections subscribed to a room code. */
  private usernames(code: string): Record<string, string> {
    const map: Record<string, string> = {};
    for (const c of this.connections.values()) {
      if (c.rooms.has(code) && c.auth.username) map[c.auth.userId] = c.auth.username;
    }
    return map;
  }
  private send(connection: Connection, event: ServerEvent): void {
    if (connection.socket.readyState !== 1) return;
    if (connection.socket.bufferedAmount > 1024 * 1024) { connection.socket.close(1013, 'Slow client; reconnect for state'); return; }
    const start=performance.now(),serialized=JSON.stringify(event);
    if(event.type==='MANAGER_MODE_STATE'||event.type==='MANAGER_MODE_PATCH')this.logger.debug({event:'manager_payload',eventType:event.type,connectionId:connection.id,userId:connection.auth.userId,tournamentId:connection.managerTournament,lastSequence:connection.managerState?.sequence,incomingSequence:event.sequence,managerStateBytes:Buffer.byteLength(serialized),managerStateSerializeMs:performance.now()-start,serverTime:event.serverTime},'Manager payload');
    connection.socket.send(serialized, error => { if (error) connection.socket.terminate(); });
  }
  private envelope(type: string, payload: unknown, requestId?: string): ServerEvent {
    return { type, sequence: 0, serverTime: this.manager.clock.now(), payload, requestId };
  }
  private sendState(connection: Connection, room: Room, requestId?: string): void {
    this.send(connection, { type: 'ROOM_STATE', roomId: room.id, sequence: room.sequence,
      serverTime: this.manager.clock.now(), requestId,
      payload: roomState(room, connection.auth.userId, this.manager.clock.now(), this.connectedUsers(room.code), this.usernames(room.code)) });
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
      connectedAt:Date.now(),notified:new Set(),alive: true, pending: 0, chain: Promise.resolve() };
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
    if(command.type === 'SUBSCRIBE_MANAGER_MODE') {
      connection.deltaUpdates=command.payload.deltaUpdates===true;
      const id=command.payload.tournamentId;
      if(id) {const state=realtimeManagerState(await this.managerMode.state(id,connection.auth.userId));connection.managerTournament=id;connection.managerState=state;connection.managerSignatures=Object.fromEntries(Object.entries(state).map(([key,value])=>[key,JSON.stringify(value)]));this.send(connection,{...this.envelope('MANAGER_MODE_STATE',state,command.requestId),sequence:state.sequence});if(connection.deltaUpdates&&!connection.managerInbox){connection.managerInbox=true;this.send(connection,this.envelope('MANAGER_MODE_INBOX',await this.managerMode.list(connection.auth.userId)));}}
      else {connection.managerInbox=true;this.send(connection,this.envelope('MANAGER_MODE_INBOX',await this.managerMode.list(connection.auth.userId),command.requestId));}
      return;
    }
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
    clearTimeout(this.managerFlush);this.pendingManager.clear();this.lag.disable();
    clearInterval(this.heartbeat);
    this.unsubscribe();
    this.unsubscribeManager();
    for (const connection of this.connections.values()) connection.socket.terminate();
    this.connections.clear();
  }
}
