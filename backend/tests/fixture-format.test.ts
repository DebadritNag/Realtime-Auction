import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { source } from './seasons.test.js';
import { MemoryManagerRepository } from '../src/modules/manager-mode/manager.repository.js';
import { ManagerModeService } from '../src/modules/manager-mode/manager.service.js';
import { generateFixtures, extendDoubleFixtures } from '../src/modules/manager-mode/fixture.service.js';

async function setup(format: 'SINGLE_ROUND_ROBIN' | 'DOUBLE_ROUND_ROBIN' = 'SINGLE_ROUND_ROBIN') {
  const repo = new MemoryManagerRepository(), room = source();
  const service = new ManagerModeService(repo, async () => room);
  const created = await service.create(room.id, 'user0', { name: 'Fixture regression', format });
  const act = (user: string, action: Parameters<typeof service.mutate>[3], requestId = randomUUID()) => service.mutate(created.id, user, requestId, action);
  for (let i = 1; i < 8; i++) await act('user' + i, { type: 'INVITATION', accept: true });
  await act('user0', { type: 'GENERATE_FIXTURES' });
  return { repo, service, created, act };
}

it('creates the selected full double schedule immediately and preserves it when starting', async () => {
  const f = await setup('DOUBLE_ROUND_ROBIN');
  expect(f.created.fixtures).toHaveLength(56);
  expect(new Set(f.created.fixtures.map(x => x.matchday)).size).toBe(14);
  expect((await f.service.state(f.created.id, 'user0')).fixtures).toEqual(f.created.fixtures);
  for (const game of f.created.fixtures.filter(x => x.matchday <= 7)) {
    expect(f.created.fixtures.filter(x => x.homeTeamId === game.awayTeamId && x.awayTeamId === game.homeTeamId)).toHaveLength(1);
  }
});

it('extends 28 to 56 without changing results, standings, squads, transfers, or the open window; retries are harmless', async () => {
  const f = await setup();
  await f.act('user0', { type: 'WINDOW', open: true });
  await f.act('user0', { type: 'BUYOUT', targetPlayerId: 'p24', offerType: 'CASH', cashAmountUnits: 20 });
  await f.act('user0', { type: 'SCORE', fixtureId: f.created.fixtures[0]!.id, homeScore: 2, awayScore: 1 });
  const before = (await f.repo.find(f.created.id))!;
  const standings = (await f.service.state(f.created.id, 'user0')).standings;
  const events: string[] = []; f.service.subscribe((_t, event) => events.push(event));
  const request = randomUUID(), action = { type: 'UPDATE_FIXTURE_FORMAT', format: 'DOUBLE_ROUND_ROBIN' } as const;
  const results = await Promise.all([f.act('user0', action, request), f.act('user0', action)]);
  const after = (await f.repo.find(f.created.id))!;
  expect(results.every(s => s.fixtures.length === 56)).toBe(true);
  expect(after.fixtures.slice(0, 28)).toEqual(before.fixtures);
  expect(after.fixtures.slice(28).every(x => x.status === 'SCHEDULED' && x.homeScore === null && x.awayScore === null)).toBe(true);
  expect(new Set(after.fixtures.map(x => x.homeTeamId + ':' + x.awayTeamId)).size).toBe(56);
  for (const key of ['players', 'teams', 'trades', 'buyouts', 'negotiation', 'squadData', 'transactions', 'transferWindows', 'notifications', 'seasonData', 'secretHeroes'] as const) expect(after[key]).toEqual(before[key]);
  expect(after.transferWindowOpen).toBe(true);
  expect((await f.service.state(f.created.id, 'user0')).standings).toEqual(standings);
  expect((await f.act('user0', action, request)).sequence).toBe(after.sequence);
  expect(events).toContain('FIXTURE_FORMAT_UPDATED'); expect(events).toContain('FIXTURES_GENERATED');
  await expect(f.act('user1', action)).rejects.toMatchObject({ code: 'HOST_ONLY' });
  await expect(f.act('user0', { ...action, format: 'SINGLE_ROUND_ROBIN' })).rejects.toMatchObject({ code: 'FIXTURE_DOWNGRADE_BLOCKED' });
  await f.act('user0', { type: 'SCORE', fixtureId: after.fixtures[28]!.id, homeScore: 0, awayScore: 0 });
  await expect(f.act('user0', { ...action, format: 'SINGLE_ROUND_ROBIN' })).rejects.toMatchObject({ code: 'SECOND_LEG_PLAYED' });
});

it('repairs a format already labelled double and refuses completed seasons', async () => {
  const f = await setup();
  await f.repo.mutate(f.created.id, t => { t.format = 'DOUBLE_ROUND_ROBIN'; });
  expect((await f.act('user0', { type: 'UPDATE_FIXTURE_FORMAT', format: 'DOUBLE_ROUND_ROBIN' })).fixtures).toHaveLength(56);
  await f.act('user0', { type: 'END_CURRENT_SEASON', confirmation: 'END SEASON' });
  await expect(f.act('user0', { type: 'UPDATE_FIXTURE_FORMAT', format: 'DOUBLE_ROUND_ROBIN' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
});

it('supports odd team counts and partial second legs, rejects malformed schedules without appending', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const first = generateFixtures(ids), reverse = extendDoubleFixtures(ids, first);
  expect(first).toHaveLength(10); expect(reverse).toHaveLength(10);
  expect(Math.max(...reverse.map(f => f.matchday))).toBe(10);
  expect(extendDoubleFixtures(ids, [...first, reverse[0]!])).toHaveLength(9);
  expect(() => extendDoubleFixtures(ids, first.slice(1))).toThrow();
  expect(() => extendDoubleFixtures(ids, [...first, first[0]!])).toThrow();
});
