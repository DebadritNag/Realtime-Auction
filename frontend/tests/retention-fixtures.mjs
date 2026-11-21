/** Test-owned fixtures and a tiny stand-in for the server's retention rules. Used only inside the browser bundle of the UI tests. */
export const TEAM_IDS = ['t1', 't2', 't3'];
export const TEAM_NAMES = { t1: 'Alpha FC', t2: 'Beta FC', t3: 'Gamma FC' };

export const playerDTO = (id, name, pos, ovr, o = {}) => ({
  id, name, fullName: name + ' Full', ovr, club: 'Club ' + id, nationality: 'Nation ' + id, subPosition: pos, positions: [pos],
  position: pos === 'GK' ? 'GK' : ['CB', 'LB', 'RB'].includes(pos) ? 'DEF' : ['CM', 'CDM', 'CAM'].includes(pos) ? 'MID' : 'FWD',
  stats: { pac: 80, sho: 70, pas: 75, dri: 78, def: 60, phy: 72 }, basePriceCr: ovr >= 90 ? 5 : 3, potId: 'ATT', status: 'WAITING', round: 1,
  retentionPriceCr: 15, retainedByTeamId: null, ...o,
});

export const CATALOG = [
  playerDTO('1', 'Kylian Mbappe', 'ST', 91, { club: 'Real Madrid', nationality: 'France' }),
  playerDTO('2', 'Gianluca Underdog', 'GK', 80, { playerTag: 'UNDERDOG', draftPool: 'UNDERDOG', basePriceCr: 1, club: 'Lecce', nationality: 'Italy' }),
  playerDTO('3', 'Left Back', 'LB', 84, { club: 'Chelsea', nationality: 'England' }),
  playerDTO('4', 'Midfield Maestro', 'CM', 87, { club: 'Barcelona', nationality: 'Spain' }),
  playerDTO('5', 'Another Striker', 'ST', 86, { club: 'Real Madrid', nationality: 'Brazil' }),
  playerDTO('6', 'Madrid Winger', 'LW', 85, { club: 'Real Madrid', nationality: 'Spain' }),
  playerDTO('7', 'Defensive Anchor', 'CDM', 83, { club: 'Roma', nationality: 'Italy' }),
  playerDTO('8', 'Number Ten', 'CAM', 88, { club: 'Ajax', nationality: 'Netherlands' }),
];
export const GROUPS = { ALL: null, GK: ['GK'], CB: ['CB'], FB: ['LB', 'RB', 'LWB', 'RWB'], CDM: ['CDM'], CMID: ['CM'], CAM: ['CAM'], WM: ['LM', 'RM'], ST: ['ST', 'CF'], W: ['LW', 'RW', 'LF', 'RF'] };

export const teamDTO = (id, o = {}) => ({
  id, userId: 'u-' + id, name: TEAM_NAMES[id] ?? id, startingBudgetCr: 200, spentCr: 0, remainingBudgetCr: 200, playerIds: [], playersOwned: 0,
  maximumPermittedBidCr: 200, minimumSquadMet: false, managerUsername: 'mgr_' + id, retainedCount: 0, retentionSpentCr: 0, auctionPurseCr: 200, ...o,
});

const card = (p) => ({ playerId: p.id, name: p.name, fullName: p.fullName, ovr: p.ovr, position: p.subPosition, positions: p.positions, club: p.club, nationality: p.nationality,
  imageUrl: null, playerTag: p.playerTag ?? null, draftPool: p.draftPool ?? 'REGULAR', priceCr: 15 });

export function initialServer(turnCounter = 0) {
  return { turnCounter, phase: 'TEAM_SELECTING', order: [...TEAM_IDS], active: 0, drafts: [], others: [], picks: [], turns: [], completion: null, clock: 1_000_000 };
}

/** The tiny reducer below mirrors what the backend decides; the UI itself never computes any of it. */
export function applyCommand(server, viewerId, hostId, command) {
  const s = JSON.parse(JSON.stringify(server));
  const activeId = s.order[s.active];
  const type = command.type;
  const fail = (m) => { throw new Error(m); };
  const mine = s.drafts.filter((d) => d.teamId === viewerId);
  if (type === 'RETAIN_PLAYER') {
    if (s.phase !== 'TEAM_SELECTING' || viewerId !== activeId) fail('It is not your turn.');
    if (mine.length >= 3) fail('Retention limit reached');
    const id = command.payload.playerId;
    if (s.drafts.some((d) => d.playerId === id) || s.others.includes(id) || s.picks.some((p) => p.playerId === id)) fail('Player unavailable');
    s.drafts.push({ teamId: viewerId, playerId: id });
  } else if (type === 'REMOVE_RETENTION_PLAYER') {
    s.drafts = s.drafts.filter((d) => !(d.teamId === viewerId && d.playerId === command.payload.playerId));
  } else if (type === 'CONFIRM_RETENTION' || type === 'SKIP_RETENTION') {
    const skipping = type === 'SKIP_RETENTION';
    const actor = skipping && viewerId === hostId ? activeId : viewerId;
    if (s.phase !== 'TEAM_SELECTING' || actor !== activeId) fail('It is not your turn.');
    const own = s.drafts.filter((d) => d.teamId === activeId);
    if (!skipping && own.length === 0) fail('Use skip retention');
    const picks = skipping ? [] : own;
    s.drafts = s.drafts.filter((d) => d.teamId !== activeId);
    s.turnCounter += 1;
    const turnId = 'turn-' + s.turnCounter;
    picks.forEach((d, i) => s.picks.push({ id: 'pick-' + d.playerId, teamId: activeId, playerId: d.playerId, turnId, order: s.picks.length + 1, at: s.clock + i }));
    const nextIdx = s.active + 1;
    s.turns.push({ id: turnId, teamId: activeId, kind: skipping || picks.length === 0 ? 'SKIPPED' : 'RETAINED', players: picks.map((d) => d.playerId), spent: picks.length * 15, at: s.clock + 10 + s.turns.length });
    if (nextIdx >= s.order.length) { s.phase = 'ALL_TEAMS_COMPLETED'; s.completion = { id: 'completion-1', at: s.clock + 100 }; } else s.active = nextIdx;
  } else if (type === 'FINALIZE_RETENTIONS') {
    if (viewerId !== hostId) fail('Only the host can finalize.');
    if (s.phase !== 'ALL_TEAMS_COMPLETED') fail('Not complete');
    s.phase = 'FINALIZED';
  } else if (type === 'RESET_RETENTIONS') {
    if (viewerId !== hostId) fail('Only the host can reset.');
    Object.assign(s, initialServer(s.turnCounter));
  }
  return s;
}

const find = (id) => CATALOG.find((p) => p.id === id);

/** Projection for one viewer: drafts of other teams appear only as anonymous reserved ids. */
export function project(server, viewerId, hostId, extra = {}) {
  const teamsIn = TEAM_IDS.map((id) => {
    const picks = server.picks.filter((p) => p.teamId === id);
    return teamDTO(id, { retainedCount: picks.length, retentionSpentCr: picks.length * 15, remainingBudgetCr: 200 - picks.length * 15, auctionPurseCr: 200 - picks.length * 15 });
  });
  const activeId = server.phase === 'TEAM_SELECTING' ? server.order[server.active] : null;
  const status = (id) => {
    const turn = server.turns.find((t) => t.teamId === id);
    return turn ? (turn.kind === 'SKIPPED' ? 'SKIPPED' : 'COMPLETED') : id === activeId ? 'ACTIVE' : 'PENDING';
  };
  const turnDto = (t) => {
    const idx = server.order.indexOf(t.teamId);
    const next = server.order[idx + 1];
    return { eventId: t.id, kind: t.kind, teamId: t.teamId, teamName: TEAM_NAMES[t.teamId], teamOrder: idx + 1, totalTeams: server.order.length,
      players: t.players.map((id) => card(find(id))), spentCr: t.spent, remainingPurseCr: 200 - t.spent, nextTeamId: next ?? null,
      nextTeamName: next ? TEAM_NAMES[next] : null, nextTeamOrder: next ? idx + 2 : null, allCompleted: !next, at: t.at };
  };
  const own = server.drafts.filter((d) => d.teamId === viewerId).map((d) => find(d.playerId));
  const viewerDto = teamsIn.find((t) => t.id === viewerId);
  const retention = {
    enabled: true, config: { priceCr: 15, maxPerTeam: 3, minPerTeam: 0 }, phase: server.phase,
    order: server.order.map((id, i) => ({ teamId: id, name: TEAM_NAMES[id], order: i + 1, turnStatus: status(id) })),
    activeTeamId: activeId, activeTeamName: activeId ? TEAM_NAMES[activeId] : null,
    progress: { completed: server.turns.length, total: server.order.length },
    canAct: server.phase === 'TEAM_SELECTING' && activeId === viewerId, canSkipForActive: server.phase === 'TEAM_SELECTING' && viewerId === hostId,
    picks: server.picks.map((p) => ({ id: p.id, teamId: p.teamId, teamName: TEAM_NAMES[p.teamId], playerId: p.playerId, priceCr: 15, at: p.at, order: p.order, turnId: p.turnId, confirmedAt: p.at,
      acquisitionType: 'RETENTION', player: { ...find(p.playerId), status: 'SOLD' } })),
    turns: server.turns.map(turnDto), lastCompleted: server.turns.length ? turnDto(server.turns[server.turns.length - 1]) : null,
    completion: server.completion ? { eventId: server.completion.id, at: server.completion.at, teams: server.order.map((id, i) => ({ teamId: id, name: TEAM_NAMES[id], order: i + 1,
      retainedCount: server.picks.filter((p) => p.teamId === id).length, spentCr: server.picks.filter((p) => p.teamId === id).length * 15,
      remainingPurseCr: 200 - server.picks.filter((p) => p.teamId === id).length * 15 })) } : null,
    reservedPlayerIds: [...server.drafts.map((d) => d.playerId), ...server.others],
    ownDraft: { players: own, spentCr: own.length * 15, remainingPurseCr: viewerDto.remainingBudgetCr - own.length * 15 },
    teams: teamsIn.map((t) => ({ teamId: t.id, retainedCount: t.retainedCount, remainingSlots: 3 - t.retainedCount, spentCr: t.retentionSpentCr, remainingPurseCr: t.remainingBudgetCr, turnStatus: server.order.includes(t.id) ? status(t.id) : 'PENDING' })),
    totals: { retained: server.picks.length, spentCr: server.picks.length * 15 }, finalizedAt: server.phase === 'FINALIZED' ? 1 : null,
  };
  return {
    room: { id: 'room-1', code: 'ABC234', auctionName: 'Champions Auction', createdAt: 1 }, roomId: 'room-1', roomCode: 'ABC234',
    settings: { numberOfTeams: 3, minimumParticipants: 2, startingBudgetCr: 200, minSquadSize: 1, maxSquadSize: 18, playerTimerSeconds: 30, antiSnipingEnabled: false,
      antiSnipingThresholdSeconds: 5, antiSnipingResetSeconds: 5, minimumBasePriceCr: 1, allowCustomBids: true, autoAdvance: true, transitionDelaySeconds: 3, playerPoolConfig: {},
      playerPoolSource: 'FC26', retention: { enabled: true }, ...(extra.settings ?? {}) },
    status: 'LOBBY', activationId: null, skipVote: { votes: 0, required: 2, hasCurrentUserVoted: false }, host: { userId: 'u-' + hostId, teamId: hostId },
    currentPlayer: null, activePotId: null, activePlayerId: null, currentBidCr: null, highestBidderTeamId: null, minimumNextBidCr: null, maximumPermittedBidCr: 200,
    startedAt: null, endsAt: null, remainingTimeMs: null, biddingOpen: false, lastBidAt: null, bidCount: 0, nextPlayerAt: null, serverTime: server.clock + 1000, sequence: extra.sequence ?? 1,
    teams: teamsIn, currentUserTeam: viewerDto, connectedUsers: teamsIn.map((t) => t.userId), players: [], playerQueue: [], playerQueueSummary: { remaining: 0 },
    soldPlayers: [], unsoldPlayers: [], retention,
  };
}

export function searchCatalog(server, viewerId, query = {}) {
  const q = (query.search || '').toLowerCase();
  const g = GROUPS[query.group || 'ALL'];
  const taken = new Set([...server.picks.map((p) => p.playerId), ...server.others, ...server.drafts.filter((d) => d.teamId !== viewerId).map((d) => d.playerId)]);
  const own = new Set(server.drafts.filter((d) => d.teamId === viewerId).map((d) => d.playerId));
  const found = CATALOG.filter((p) => !taken.has(p.id) && (!g || p.positions.some((x) => g.includes(x)))
    && (!q || [p.name, p.club, p.nationality, p.id, ...p.positions].join(' ').toLowerCase().includes(q)));
  return { total: found.length, offset: 0, limit: 50, retentionPriceCr: 15, players: found.map((p) => ({ ...p, selected: own.has(p.id) })) };
}
