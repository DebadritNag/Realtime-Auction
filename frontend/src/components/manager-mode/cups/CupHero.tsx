'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {CupCompetition} from '@/types/manager-cup';
import type {TournamentState} from '@/types/manager-mode';
import type {ManagerAction} from '@/services/manager-mode.service';
import {CupTrophy3D} from '../trophies/CupTrophy3D';
import styles from './CupHub.module.css';

export function CupHero({cup:c,state,action,busy}:{cup:CupCompetition;state:TournamentState;action:(a:ManagerAction)=>Promise<void>;busy:boolean}){
 const [error,setError]=useState(''),[celebrate,setCelebrate]=useState(false),previous=useRef(c.championTeamId);
 useEffect(()=>{if(c.championTeamId&&!previous.current){setCelebrate(true);const timer=setTimeout(()=>setCelebrate(false),3200);previous.current=c.championTeamId;return()=>clearTimeout(timer);}previous.current=c.championTeamId;},[c.championTeamId]);
 const champion=state.teams.find(t=>t.id===c.championTeamId),final=c.ties.find(t=>t.stage==='FINAL'),season=state.seasonData?.seasons.find(s=>s.id===c.seasonId),ready=['QUALIFIED','DRAW_READY'].includes(c.status),waiting=['NOT_STARTED','WAITING_FOR_LEAGUE'].includes(c.status);
 const name=(id:string)=>state.teams.find(t=>t.id===id)?.name??'Team';
 const finalGoals=final?.teamIds.map(id=>c.fixtures.filter(f=>f.tieId===final.id&&f.status==='COMPLETED').reduce((sum,f)=>sum+(f.homeTeamId===id?f.homeScore!:f.awayScore!),0));
 return <section className={styles.hero}>
  {celebrate&&<div className={styles.confetti} aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div>}
  <div className={styles.title}><p className="text-xs font-semibold uppercase tracking-[.22em] text-amber-200/80">Cup competition · Season {season?.number??'—'}</p><h2>{c.settings.name}</h2><p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">{champion?'Cup champions':waiting?'Waiting for league completion':ready?`${c.qualified.length} teams qualified · Draw ready`:c.status==='SEMI_FINAL'?'The final four':c.status==='FINAL'?'The final':c.status.replaceAll('_',' ')}</p></div>
  <div className={styles.viewer}><CupTrophy3D/></div>
  <div className={styles.info}>
   {champion?<div className="mb-6 flex items-center gap-4">{champion.logoUrl&&<img src={champion.logoUrl} alt="" className="h-14 w-14 rounded-xl object-contain"/>}<div><h3 className="text-2xl font-bold text-amber-100">{champion.name}</h3><p className="mt-1 text-sm text-slate-400">{champion.managerUsername??'Manager'} · {finalGoals?.join(' – ')} aggregate{final?.penaltyWinnerTeamId?' · Won on penalties':''}</p></div></div>:final?<p className="mb-6 text-xl font-semibold text-white">{final.teamIds.map(name).join(' vs ')}</p>:<p className="mb-6 max-w-md text-sm leading-6 text-slate-400">{waiting?`The top ${c.settings.qualifiedTeams} clubs qualify from this season’s final league standings. A new chapter begins when the league ends.`:ready?'The field is set. The host can now draw the seeded pots and reveal the road to the trophy.':'One competition. One champion. Follow every result on the road to the final.'}</p>}
   <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm"><div><dt className="text-xs text-slate-500">The field</dt><dd className="mt-1 text-white">{c.settings.qualifiedTeams} clubs · {c.settings.groupStage?'2 groups':'Knockouts'}</dd></div><div><dt className="text-xs text-slate-500">Semi-finals / Final</dt><dd className="mt-1 text-white">{c.settings.semiFinalLegs} {c.settings.semiFinalLegs===1?'leg':'legs'} / {c.settings.finalLegs} {c.settings.finalLegs===1?'leg':'legs'}</dd></div></dl>
   {ready&&state.isHost&&state.modeStatus!=='ENDED'&&<button disabled={busy} onClick={async()=>{setError('');try{await action({type:'CUP_DRAW'});}catch(e){setError(e instanceof Error?e.message:'Unable to generate draw.');}}} className="mt-6 rounded-lg bg-amber-200 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-100 disabled:opacity-40">Generate Cup Draw</button>}
   {error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
  </div>
 </section>;
}
export function CupProgress({cup:c}:{cup:CupCompetition}){
 const stages=[{name:'League complete',done:c.qualified.length>0,current:!c.qualified.length},{name:'Qualified',done:!!c.drawnAt,current:['QUALIFIED','DRAW_READY'].includes(c.status)},...(c.settings.groupStage?[{name:'Group stage',done:['SEMI_FINAL','FINAL','COMPLETED'].includes(c.status),current:c.status==='GROUP_STAGE'}]:[]),{name:'Semi-finals',done:['FINAL','COMPLETED'].includes(c.status),current:c.status==='SEMI_FINAL'},{name:'Final',done:c.status==='COMPLETED',current:c.status==='FINAL'}];
 return <ol className={styles.progress} aria-label="Cup progress">{stages.map(s=><li key={s.name} className={`${styles.step} ${s.done?styles.complete:s.current?styles.current:''}`}>{s.name}<strong>{s.done?'✓ Complete':s.current?'Active':'Locked'}</strong></li>)}</ol>;
}
