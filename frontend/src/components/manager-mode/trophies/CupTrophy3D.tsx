'use client';
import dynamic from 'next/dynamic';
import {Component,useEffect,useRef,useState,type ReactNode} from 'react';
import {TrophyFallback} from './TrophyFallback';

const Viewer=dynamic(()=>import('./TrophyViewer'),{ssr:false,loading:()=> <TrophyFallback loading/>});
class ViewerBoundary extends Component<{children:ReactNode;label:string},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<TrophyFallback label={this.props.label}/>:this.props.children;}
}
export function CupTrophy3D({variant='CUP',size='hero'}:{variant?:'CUP'|'LEAGUE_SHIELD';size?:'hero'|'compact'}){
 const container=useRef<HTMLDivElement>(null);
 const [visible,setVisible]=useState(false),[loaded,setLoaded]=useState(false),[reduced,setReduced]=useState(true),[hidden,setHidden]=useState(false),[paused,setPaused]=useState(false);
 useEffect(()=>{
  const observer=new IntersectionObserver(([entry])=>{setVisible(entry.isIntersecting);if(entry.isIntersecting)setLoaded(true);});
  if(container.current)observer.observe(container.current);
  const media=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(media.matches),visibility=()=>setHidden(document.hidden);
  motion();visibility();media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 const isShield=variant==='LEAGUE_SHIELD',label=isShield?'League Shield':'Cup trophy',modelPath=isShield?'/models/trophies/league-shield.glb':'/models/trophies/cup.glb';
 return <div ref={container} className={`relative min-w-0 ${size==='compact'?'h-[250px] sm:h-[300px]':'h-[320px] sm:h-[410px]'}`} aria-label={`Interactive ${label}`}>
  <ViewerBoundary label={label}>{loaded?<Viewer active={visible&&!hidden} rotate={!paused&&!reduced} modelPath={modelPath} label={label}/>:<TrophyFallback loading label={label}/>}</ViewerBoundary>
  {!reduced&&<div className={`absolute z-10 flex items-center text-[11px] text-slate-400 ${isShield?'right-3 top-3':'inset-x-0 bottom-3 justify-center'}`}>
   <button className="rounded border border-white/10 bg-black/30 px-2 py-1 text-amber-200 backdrop-blur-sm transition-colors hover:bg-black/50 focus-visible:outline-2" onClick={()=>setPaused(p=>!p)} aria-pressed={paused}>{paused?'Rotate':'Pause'}</button>
  </div>}
 </div>;
}
