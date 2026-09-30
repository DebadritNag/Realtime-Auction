'use client';
import dynamic from 'next/dynamic';
import {Component,useEffect,useRef,useState,type ReactNode} from 'react';
import {TrophyFallback} from './TrophyFallback';

const Viewer=dynamic(()=>import('./TrophyViewer'),{ssr:false,loading:()=> <TrophyFallback loading/>});
class ViewerBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<TrophyFallback/>:this.props.children;}
}
export function CupTrophy3D(){
 const container=useRef<HTMLDivElement>(null);
 const [visible,setVisible]=useState(false),[loaded,setLoaded]=useState(false),[reduced,setReduced]=useState(true),[hidden,setHidden]=useState(false),[paused,setPaused]=useState(false);
 useEffect(()=>{
  const observer=new IntersectionObserver(([entry])=>{setVisible(entry.isIntersecting);if(entry.isIntersecting)setLoaded(true);});
  if(container.current)observer.observe(container.current);
  const media=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(media.matches),visibility=()=>setHidden(document.hidden);
  motion();visibility();media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 return <div ref={container} className="relative h-[320px] min-w-0 sm:h-[410px]" aria-label="Interactive Cup trophy">
  <ViewerBoundary>{loaded?<Viewer active={visible&&!hidden} rotate={!paused&&!reduced}/>:<TrophyFallback loading/>}</ViewerBoundary>
  <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-4 text-[11px] text-slate-400">
   <span className="hidden [@media(pointer:fine)]:inline">Drag to rotate · Scroll to inspect</span><span className="[@media(pointer:fine)]:hidden">Drag to rotate</span>
   {!reduced&&<button className="rounded px-2 py-1 text-amber-200 focus-visible:outline-2" onClick={()=>setPaused(p=>!p)} aria-pressed={paused}>{paused?'Rotate':'Pause'}</button>}
  </div>
 </div>;
}
