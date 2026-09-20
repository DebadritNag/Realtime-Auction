"use client";
import { useEffect,useState } from 'react';
export function useAuctionTimer(endsAt:number|null,offset:number,paused:boolean,remainingTimeMs:number|null,synced:boolean){
 const [now,setNow]=useState(0);
 useEffect(()=>{const update=()=>setNow(Date.now());update();const timer=setInterval(update,100);return()=>clearInterval(timer);},[]);
 const remaining=paused?remainingTimeMs??0:Math.max(0,(endsAt??0)-(now+offset));
 return {seconds:Math.ceil(remaining/1000),resolving:synced&&!paused&&endsAt!==null&&remaining===0,synced};
}
