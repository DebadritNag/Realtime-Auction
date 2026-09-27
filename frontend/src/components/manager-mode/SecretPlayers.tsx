'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {TournamentState,ManagerPlayer} from '@/types/manager-mode';
import type {ManagerAction} from '@/services/manager-mode.service';
import {managerService} from '@/services/manager-mode.service';
import {ApiError} from '@/services/api';
import {useManagerStore} from '@/stores/manager-mode.store';
import {formatCrore} from '@/lib/money';
import {button,panel} from './ManagerSetup';
import styles from './SecretPlayers.module.css';
type Phase='IDLE'|'PURCHASING'|'PURCHASED_UNREVEALED'|'REVEALING'|'REVEALED'|'ERROR';
type Slot=NonNullable<TournamentState['secretPlayers']>['slots'][number];
function apply(state:TournamentState){useManagerStore.setState(current=>current.state?.id===state.id&&state.sequence>=current.state.sequence?{state,error:null}:{});}
function Dialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} className={styles.dialog}><h3 className="text-xl font-bold mb-4">{title}</h3>{children}</dialog>;
}
function Unknown({number}:{number?:number}){return <div className="text-center space-y-4"><img src="/images/players/default-player.webp" alt="Unknown player" className="h-28 w-28 mx-auto object-contain"/><h3 className="font-bold tracking-wide">SECRET PLAYER{number?' #'+number:''}</h3><p className="text-slate-400">Name: <span className="text-white">???</span></p><p className="text-slate-400">Position: <span className="text-white">???</span></p></div>;}
function Hero({player}:{player:ManagerPlayer}){return <div className="text-center space-y-3"><img src="/images/players/default-player.webp" alt="Player silhouette" className="h-28 w-28 mx-auto object-contain"/><h3 className="text-2xl font-bold">{player.name}</h3><p className="text-emerald-300">{player.position}</p><p className="text-xs font-bold text-amber-300">HERO • UNTRADEABLE</p></div>;}
const messages:Record<string,string>={SECRET_PLAYER_ALREADY_CLAIMED:'This Secret Player was just claimed by another team.',SECRET_PLAYER_ALREADY_USED:'Your team has already used its one Hero entitlement.',INSUFFICIENT_BUDGET:'You need ₹45 Cr to buy this player.',TRANSFER_WINDOW_CLOSED:'The transfer window is closed.',SECRET_PLAYER_NOT_FOUND:'This Secret Player is no longer available.',MANAGER_DATABASE_UNAVAILABLE:'Tournament storage is temporarily unavailable. Retry this purchase to safely check its result.'};
export function SecretPlayers({state,busy}:{state:TournamentState;action:(a:ManagerAction)=>Promise<void>;busy:boolean}){
 const sp=state.secretPlayers,mine=state.teams.find(t=>t.id===state.myTeamId)!;
 const [phase,setPhase]=useState<Phase>('IDLE'),[selected,setSelected]=useState<Slot|null>(null),[error,setError]=useState(''),[hero,setHero]=useState<ManagerPlayer|null>(null),[show,setShow]=useState(false);
 const attempt=useRef<{slotId:string;requestId:string}|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),inFlight=useRef(false),mounted=useRef(true);
 const key='hero-purchase:'+state.id+':'+state.myTeamId;
 useEffect(()=>{mounted.current=true;try{const saved=sessionStorage.getItem(key);if(saved){const value=JSON.parse(saved) as {slotId?:unknown;requestId?:unknown};if(typeof value.slotId==='string'&&typeof value.requestId==='string'){attempt.current={slotId:value.slotId,requestId:value.requestId};setPhase('ERROR');}}}catch{}return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);};},[key]);
 useEffect(()=>{if(sp?.claimed&&phase!=='REVEALING'&&phase!=='REVEALED'){setPhase(sp.revealed?'REVEALED':'PURCHASED_UNREVEALED');setSelected(null);attempt.current=null;try{sessionStorage.removeItem(key);}catch{}}},[sp?.claimed,sp?.revealed,key,phase]);
 const revealed=hero??(sp?.revealed?state.players.find(p=>p.id===sp.playerId):null);
 const active=state.status==='ACTIVE'&&state.transferWindowOpen&&state.modeStatus!=='ENDED';
 async function refresh(){try{apply(await managerService.state(state.id));}catch{/* Keep the actionable original error. */}}
 async function buy(){
  if(!selected||inFlight.current)return;inFlight.current=true;setPhase('PURCHASING');setError('');
  const prior=attempt.current;if(prior&&prior.slotId!==selected.secretSlotId){setError('Retry your pending purchase first.');setPhase('ERROR');inFlight.current=false;return;}
  try{const request=prior??{slotId:selected.secretSlotId,requestId:crypto.randomUUID()};attempt.current=request;
  try{sessionStorage.setItem(key,JSON.stringify(request));}catch{}
  const updated=await managerService.purchaseHero(state.id,request.slotId,request.requestId);apply(updated);if(mounted.current){setPhase('PURCHASED_UNREVEALED');setSelected(null);}attempt.current=null;try{sessionStorage.removeItem(key);}catch{}}
  catch(e){const code=e instanceof ApiError?e.code:'';if(e instanceof ApiError&&e.status&&e.status<500){attempt.current=null;try{sessionStorage.removeItem(key);}catch{}}
   if(mounted.current){setError(messages[code]??(e instanceof Error?e.message:'Purchase failed. Retry safely with the same request.'));setPhase('ERROR');}void refresh();}
  finally{inFlight.current=false;}
 }
 async function reveal(){
  if(!sp?.purchaseId||inFlight.current)return;inFlight.current=true;setPhase('REVEALING');setError('');setShow(true);
  try{const player=await managerService.reveal(state.id,sp.purchaseId);if(!mounted.current)return;setHero(player);
   // Public reveal acknowledgement is retryable metadata only. It never buys or charges.
   void managerService.action(state.id,{type:'REVEAL_SECRET_PLAYER'}).then(apply).catch(()=>{});
   const duration=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:2800;
   timer.current=setTimeout(()=>{if(mounted.current)setPhase('REVEALED');},duration);
  }catch(e){if(mounted.current){setError('Reveal failed. '+(e instanceof Error?e.message:'Please try again.'));setPhase('ERROR');setShow(false);}}
  finally{inFlight.current=false;}
 }
 const pending=attempt.current;
 return <div className="space-y-6" data-phase={phase}>
  <header><h2 className="text-2xl font-bold">Secret Players</h2><p className="mt-2 text-slate-400">Choose a hidden card. One permanent Hero per team, across every season.</p></header>
  <div className="grid gap-3 sm:grid-cols-3">{[['Available Heroes',sp?.availableCount??'Loading…'],['Price','₹45 Cr'],['Eligibility',sp?.teamEligible?'AVAILABLE':'ALREADY CLAIMED']].map(([label,value])=><div className={panel} key={label}><p className="text-sm text-slate-400">{label}</p><strong>{value}</strong></div>)}</div>
  {error&&<p role="alert" className="rounded-xl border border-red-500/30 p-4 text-red-300">{error}</p>}
  {sp?.claimed&&<section className={panel}><h3 className="text-lg font-bold">{revealed?'Your Hero':'SECRET PLAYER ACQUIRED'}</h3>{revealed?<Hero player={revealed}/>:<><p>Your purchase is complete. Your Hero belongs to your team.</p><button className={button} onClick={()=>void reveal()} disabled={phase==='REVEALING'}>{phase==='REVEALING'?'Revealing…':error?'Try Reveal Again':'REVEAL PLAYER'}</button></>}<p className="text-sm text-slate-400">Your lifetime Secret Player entitlement has been used.</p></section>}
  {!active&&<p className="text-slate-400">Purchases require an active tournament and open transfer window.</p>}
  {pending&&!sp?.claimed&&<button className={button} disabled={phase==='PURCHASING'} onClick={()=>{setSelected(sp?.slots.find(s=>s.secretSlotId===pending.slotId)??{secretSlotId:pending.slotId,displayNumber:0,priceUnits:90,status:'AVAILABLE'});}}>Retry pending purchase</button>}
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Anonymous Hero pool">{sp?.slots.map(slot=><article key={slot.secretSlotId} className={panel+' space-y-5'}><Unknown number={slot.displayNumber}/><p className="text-center font-bold text-amber-300">₹45 Cr</p><button className={button+' w-full'} disabled={busy||phase==='PURCHASING'||!active||!sp.teamEligible||mine.transferBudgetUnits<90||!!pending&&pending.slotId!==slot.secretSlotId} onClick={()=>{setError('');setSelected(slot);}}>BUY SECRET PLAYER</button>{!sp.teamEligible&&<p className="text-xs text-slate-400">Not eligible — Secret Player already claimed</p>}</article>)}</div>
  {selected&&<Dialog title={'Buy Secret Player #'+selected.displayNumber} onClose={()=>{if(phase!=='PURCHASING')setSelected(null);}}><p>This purchase is permanent. Only ONE Hero per team for this entire Manager Mode. The player cannot be traded or sold.</p><dl className="my-5 space-y-2"><div>Price: ₹45 Cr</div><div>Your budget: {formatCrore(mine.transferBudgetUnits)}</div><div>Budget after purchase: {formatCrore(mine.transferBudgetUnits-90)}</div></dl>{error&&<p role="alert" className="text-red-300 mb-3">{error}</p>}<div className="flex gap-3"><button className={button} disabled={phase==='PURCHASING'} onClick={()=>setSelected(null)}>Cancel</button><button className={button} disabled={phase==='PURCHASING'} onClick={()=>void buy()}>{phase==='PURCHASING'?'Purchasing…':'Confirm Purchase'}</button></div></Dialog>}
  {show&&<Dialog title={phase==='REVEALED'?'HERO REVEALED':'SECRET PLAYER ACQUIRED'} onClose={()=>setShow(false)}><div className={hero&&phase==='REVEALING'?styles.flip:''}>{phase==='REVEALED'&&hero?<Hero player={hero}/>:<Unknown/>}</div><p className="my-4 text-center" role="status">{phase==='REVEALED'?'Added to '+mine.name:'Revealing your Hero…'}</p><button className={button+' w-full'} onClick={()=>setShow(false)}>{phase==='REVEALED'?'Continue':'Close — reveal remains available'}</button></Dialog>}
 </div>;
}
