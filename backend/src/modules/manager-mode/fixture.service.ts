import { randomUUID } from 'node:crypto';
import type { Fixture, ManagerTeam, Standing } from './manager.types.js';
export function generateFixtures(ids: string[], double = false): Fixture[] {
    const ring: (string | null)[] = [...ids];
    if (ring.length % 2)
        ring.push(null);
    const fixtures: Fixture[] = [];
    for (let day = 1; day < ring.length; day++) {
        for (let i = 0; i < ring.length / 2; i++) {
            const a = ring[i], b = ring[ring.length - 1 - i];
            if (!a || !b)
                continue;
            fixtures.push({ id: randomUUID(), matchday: day, homeTeamId: day % 2 ? a : b, awayTeamId: day % 2 ? b : a,
                homeScore: null, awayScore: null, status: 'SCHEDULED', scheduledAt: null, completedAt: null });
        }
        ring.splice(1, 0, ring.pop()!);
    }
    return double ? [...fixtures, ...fixtures.map(f => ({ ...f, id: randomUUID(), matchday: f.matchday + ring.length - 1, homeTeamId: f.awayTeamId, awayTeamId: f.homeTeamId }))] : fixtures;
}
export function standings(teams: ManagerTeam[], fixtures: Fixture[]): Standing[] {
    const rows = new Map(teams.map(t => [t.id, { teamId: t.id, position: 0, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }]));
    for (const f of fixtures) {
        if (f.status !== 'COMPLETED' || f.homeScore === null || f.awayScore === null)
            continue;
        const h = rows.get(f.homeTeamId)!, a = rows.get(f.awayTeamId)!;
        h.played++;
        a.played++;
        h.gf += f.homeScore;
        h.ga += f.awayScore;
        a.gf += f.awayScore;
        a.ga += f.homeScore;
        if (f.homeScore === f.awayScore) {
            h.drawn++;
            a.drawn++;
            h.points++;
            a.points++;
        }
        else {
            const win = f.homeScore > f.awayScore ? h : a, lose = f.homeScore > f.awayScore ? a : h;
            win.won++;
            win.points += 3;
            lose.lost++;
        }
    }
    return [...rows.values()].map(r => ({ ...r, gd: r.gf - r.ga })).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.teamId.localeCompare(b.teamId)).map((r, i) => ({ ...r, position: i + 1 }));
}
