'use client';
import {useState} from 'react';
import type {CupCompetition,CupTie} from '@/types/manager-cup';
import type {TournamentState} from '@/types/manager-mode';
import type {ManagerAction} from '@/services/manager-mode.service';
import styles from './CupHub.module.css';

export function CupBracket({cup:c,state,action,busy}:{cup:CupCompetition;state:TournamentState;action:(a:ManagerAction)=>Promise<void>;busy:boolean}){
 const [error,setError]=useState(''),name=(id:string)=>state.teams.find(t=>t.id===id)?.name??'Team';
 function tieCard(tie:CupTie){
  const fixtures=c.fixtures.filter(f=>f.tieId===tie.id),goals=tie.teamIds.map(id=>fixtures.filter(f=>f.status==='COMPLETED').reduce((sum,f)=>sum+(f.homeTeamId===id?f.homeScore!:f.awayScore!),0)),penalties=fixtures.every(f=>f.status==='COMPLETED')&&goals[0]===goals[1]&&!tie.winnerTeamId;
  return <section key={tie.id} className="rounded-xl border border-white/10 bg-[#0a1628] p-5"><div className="mb-4 flex justify-between gap-4 text-xs text-slate-500"><span>{tie.stage.replaceAll('_',' ')}</span><span>{fixtures.length} {fixtures.length===1?'leg':'legs'}</span></div>
   <table className="w-full text-left text-sm"><thead><tr className="text-[10px] text-slate-500"><th className="pb-2 font-normal">Club</th>{fixtures.map(f=><th key={f.id} className="text-center font-normal">L{f.leg}</th>)}<th className="text-right font-normal">AGG</th></tr></thead><tbody>{tie.teamIds.map((id,i)=><tr key={id} className={id===tie.winnerTeamId?'text-amber-200':'text-slate-200'}><th className="py-3 pr-3 font-semibold">{name(id)}</th>{fixtures.map(f=><td key={f.id} className="text-center tabular-nums text-slate-400">{f.status==='COMPLETED'?(f.homeTeamId===id?f.homeScore:f.awayScore):'—'}</td>)}<td className="text-right text-xl font-bold tabular-nums">{goals[i]}</td></tr>)}</tbody></table>
   <p className="mt-3 border-t border-white/5 pt-3 text-xs text-slate-500">{tie.winnerTeamId?`Winner${tie.penaltyWinnerTeamId?' on penalties':''}: ${name(tie.winnerTeamId)}`:'No away-goals rule'}</p>
   {penalties&&<div className="mt-4 space-y-2"><p className="text-sm text-amber-300">Aggregate level. {state.isHost?'Record the penalty winner.':'Awaiting penalty result.'}</p>{state.isHost&&state.modeStatus!=='ENDED'&&tie.teamIds.map(id=><button key={id} disabled={busy} className="mr-2 rounded-lg border border-amber-300/30 px-3 py-2 text-xs text-amber-200 disabled:opacity-40" onClick={async()=>{setError('');try{await action({type:'CUP_PENALTIES',tieId:tie.id,winnerTeamId:id});}catch(e){setError(e instanceof Error?e.message:'Unable to save penalties.');}}}>{name(id)} wins penalties</button>)}</div>}
  </section>;
 }
 return <><div className={styles.bracket}><div className={styles.round}><h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Semi-finals</h3>{c.ties.filter(t=>t.stage==='SEMI_FINAL').map(tieCard)}{!c.ties.length&&<p className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-slate-500">Group A winner vs Group B runner-up<br/><br/>Group B winner vs Group A runner-up</p>}</div><div className={styles.round}><h3 className="text-sm font-semibold uppercase tracking-widest text-amber-200">The final</h3>{c.ties.filter(t=>t.stage==='FINAL').map(tieCard)}{!c.ties.some(t=>t.stage==='FINAL')&&<p className="rounded-xl border border-dashed border-amber-300/20 p-8 text-sm text-slate-500">The two semi-final winners meet here.</p>}{c.ties.filter(t=>t.stage==='THIRD_PLACE').map(tieCard)}</div></div>{error&&<p role="alert" className="mt-4 text-red-300">{error}</p>}</>;
}
