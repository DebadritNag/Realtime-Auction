import type { Tournament,TournamentSummary } from './manager.types.js';
import { SerialQueue } from '../../utils/serial-queue.js';
import { DomainError, requireThat } from '../../domain/errors.js';
/** Production adapters implement this aggregate transaction boundary.
 * Lock/CAS across processes, atomically save ownership+offers+transactions+notifications+receipts.
 * Never retain a draft when callback or persistence fails. Return detached values.
 */
export interface ManagerTournamentRepository {
    listSummaries?(userId:string):Promise<TournamentSummary[]>;
    find(id: string): Promise<Tournament | null>;
    findByAuction(auctionId: string): Promise<Tournament | null>;
    listForUser(userId: string): Promise<Tournament[]>;
    createUnique(tournament: Tournament): Promise<{
        tournament: Tournament;
        created: boolean;
    }>;
    mutate(id: string, change: (draft: Tournament) => Promise<void> | void): Promise<Tournament>;
    /** Permanently remove a tournament and all its child data. */
    delete(id: string): Promise<void>;
}
export interface ManagerIdentityRepository {
    findUsernames(userIds: string[]): Promise<Record<string, string>>;
}
/** Explicit development/test adapter. Not a production persistence substitute. */
export class MemoryManagerRepository implements ManagerTournamentRepository {
    private rooms = new Map<string, Tournament>();
    private lock = new SerialQueue();
    async find(id: string) { return structuredClone(this.rooms.get(id) ?? null); }
    async findByAuction(id: string) { return structuredClone([...this.rooms.values()].find(t => t.sourceAuctionId === id) ?? null); }
    async listForUser(id: string) { return structuredClone([...this.rooms.values()].filter(t => t.teams.some(team => team.managerUserId === id))); }
    async createUnique(t: Tournament) {
        return this.lock.runExclusive('create', async () => {
            const existing = await this.findByAuction(t.sourceAuctionId);
            if (existing)
                return { tournament: existing, created: false };
            this.rooms.set(t.id, structuredClone(t));
            return { tournament: structuredClone(t), created: true };
        });
    }
    async mutate(id: string, change: (t: Tournament) => Promise<void> | void) {
        return this.lock.runExclusive(id, async () => {
            const draft = await this.find(id);
            requireThat(draft, 'TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
            await change(draft);
            this.rooms.set(id, structuredClone(draft));
            return structuredClone(draft);
        });
    }
    async delete(id: string): Promise<void> {
        await this.lock.runExclusive(id, async () => { this.rooms.delete(id); });
    }
}
/** Safe default for app instances that do not inject a repository. */
export class UnavailableManagerRepository implements ManagerTournamentRepository {
    private fail(): never { throw new DomainError('MANAGER_PERSISTENCE_UNAVAILABLE', 'Manager Mode persistence is not configured yet.', 503); }
    async find(_id: string): Promise<Tournament | null> { return this.fail(); }
    async findByAuction(_id: string): Promise<Tournament | null> { return this.fail(); }
    async listForUser(_id: string): Promise<Tournament[]> { return this.fail(); }
    async createUnique(_t: Tournament): Promise<{
        tournament: Tournament;
        created: boolean;
    }> { return this.fail(); }
    async mutate(_id: string, _change: (t: Tournament) => Promise<void> | void): Promise<Tournament> { return this.fail(); }
    async delete(_id: string): Promise<void> { return this.fail(); }
}
