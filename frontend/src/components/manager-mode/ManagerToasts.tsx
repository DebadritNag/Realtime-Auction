'use client';
import Link from 'next/link';
import {useManagerStore} from '@/stores/manager-mode.store';
import {notificationHref} from '@/lib/manager-notifications';
export function ManagerToasts(){const toasts=useManagerStore(s=>s.toasts);const dismiss=useManagerStore(s=>s.dismissToast);return <div aria-live="polite" className="fixed bottom-5 right-5 z-[80] w-80 max-w-[calc(100vw-40px)] space-y-2">{toasts.map(n=><div key={n.id} className="rounded-xl border border-emerald-500/40 bg-slate-950 p-4 text-sm text-white shadow-lg"><button aria-label="Dismiss notification" className="float-right px-2" onClick={()=>dismiss(n.id)}>×</button><strong>{n.title}</strong><p className="mt-1 text-slate-300">{n.message}</p><Link className="text-emerald-300 underline" href={notificationHref(n.metadata.tournamentId!,n)} onClick={()=>dismiss(n.id)}>View update</Link></div>)}</div>;}
