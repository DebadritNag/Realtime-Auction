'use client';
import {useState} from 'react';
import {getPlayerImageCandidates,DEFAULT_PLAYER_IMAGE,type PlayerImageSource} from '@/lib/player-image';

/**
 * Renders a player face image that always fits its container cleanly.
 *
 * - `className` sizes the frame (e.g. "h-24 w-20"). The image fills that frame.
 * - Real player photos (TheSportsDB) have varying aspect ratios, so we use
 *   `object-cover object-top` to keep the face framed without letterboxing or
 *   stretching, which previously disfigured the cards.
 * - The default silhouette placeholder is shown with `object-contain` (it is a
 *   transparent asset meant to be centered, not cropped).
 */
export function PlayerImage({player,className='',alt=''}:{player:PlayerImageSource;className?:string;alt?:string}){
 const sources=getPlayerImageCandidates(player);
 const [failed,setFailed]=useState<string[]>([]);
 const src=sources.find(x=>!failed.includes(x))??sources.at(-1)!;
 const isPlaceholder=src===DEFAULT_PLAYER_IMAGE;
 return (
  <span className={`relative inline-flex shrink-0 overflow-hidden bg-slate-800/60 ${className}`}>
   <img
    src={src}
    alt={alt}
    loading="lazy"
    width={256}
    height={256}
    className={`h-full w-full ${isPlaceholder?'object-contain p-1':'object-cover object-top'}`}
    onError={()=>setFailed(current=>current.includes(src)?current:[...current,src])}
   />
  </span>
 );
}
