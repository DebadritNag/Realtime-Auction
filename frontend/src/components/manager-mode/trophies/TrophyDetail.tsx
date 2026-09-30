'use client';
import {useEffect,useRef} from 'react';
import type {Trophy} from '@/types/manager-cup';
import {CupTrophy3D} from './CupTrophy3D';

export function TrophyDetail({trophy,winner,season,onClose}:{trophy:Trophy;winner:string;season:number|undefined;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 return <dialog ref={dialog} onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}} className="m-auto max-h-[90dvh] w-[min(92vw,640px)] overflow-y-auto rounded-2xl border border-amber-300/20 bg-[#0a1628] p-6 text-white backdrop:bg-black/80" aria-labelledby="trophy-title">
  <div className="flex items-start justify-between gap-5"><div><p className="mb-2 text-xs uppercase tracking-widest text-amber-300">Cup champions · Season {season??'—'}</p><h2 id="trophy-title" className="text-2xl font-bold">{trophy.name}</h2></div><button autoFocus onClick={onClose} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Close</button></div>
  <CupTrophy3D/><p className="text-center text-xl font-semibold text-amber-200">{winner}</p><p className="mt-2 text-center text-xs text-slate-400">Awarded from the official competition result.</p>
 </dialog>;
}
