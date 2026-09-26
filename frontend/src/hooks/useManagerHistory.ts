'use client';
import {useState} from 'react';
import {api} from '@/services/api';
export function useManagerHistory<T extends {id:string}>(id:string,kind:string,initialCursor:string|null|undefined,sessionId?:string){
 const [rows,setRows]=useState<T[]>([]),[cursor,setCursor]=useState<string|null|undefined>(undefined),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const next=cursor===undefined?initialCursor:cursor;
 async function load(){if(!next||loading)return;setLoading(true);setError('');try{const page=await api.get<{items:T[];nextBefore:string|null}>('/api/manager-mode/'+id+'/history?kind='+kind+'&before='+encodeURIComponent(next)+(sessionId?'&sessionId='+encodeURIComponent(sessionId):''));setRows(old=>[...new Map([...old,...page.items].map(x=>[x.id,x])).values()]);setCursor(page.nextBefore);}catch(e){setError(e instanceof Error?e.message:'Unable to load history.');}finally{setLoading(false);}}
 return {rows,more:Boolean(next),loading,error,load};
}
