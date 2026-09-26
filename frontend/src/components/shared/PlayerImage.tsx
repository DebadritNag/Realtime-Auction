'use client';
import {useState} from 'react';
import {getPlayerImageCandidates,type PlayerImageSource} from '@/lib/player-image';
export function PlayerImage({player,className='',alt=''}:{player:PlayerImageSource;className?:string;alt?:string}){const sources=getPlayerImageCandidates(player);const [failed,setFailed]=useState<string[]>([]);const src=sources.find(x=>!failed.includes(x))??sources.at(-1)!;return <img src={src} alt={alt} loading="lazy" width={256} height={256} className={className} onError={()=>setFailed(current=>current.includes(src)?current:[...current,src])}/>;}
