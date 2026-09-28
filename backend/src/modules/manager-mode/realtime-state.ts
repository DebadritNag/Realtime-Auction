import type { TournamentState } from './manager.types.js';

/** Network projection only. Persistent history and the domain aggregate stay intact. */
export function realtimeManagerState(state:TournamentState):TournamentState {
  const current=new Set(state.fixtures.map(f=>f.id));
  const transactions=state.transactions.filter(t=>t.type!=='AUCTION_PURCHASE');
  return {...state,
    seasonFixtureCounts:Object.fromEntries(Object.entries(state.seasonFixturesById??{}).map(([id,fixtures])=>[id,{total:fixtures.length,completed:fixtures.filter(f=>f.status==='COMPLETED').length}])),
    seasonFixturesById:{},
    squadData:state.squadData?{...state.squadData,lineups:state.squadData.lineups.filter(f=>current.has(f.fixtureId))}:undefined,
    transferWindows:state.transferWindows?.map(w=>({...w,teams:[]})),
    transactions:transactions.slice(-50),
    historyCursors:state.historyCursors?{...state.historyCursors,transactions:transactions.length>50?transactions.at(-50)!.id:state.historyCursors.transactions}:undefined,
    notifications:state.notifications.slice(-50),
  };
}
