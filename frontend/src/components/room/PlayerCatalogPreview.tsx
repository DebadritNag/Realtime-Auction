"use client";
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { PlayerDTO } from '@/types/backend';
import { formatCr } from '@/lib/utils';
type Catalog = { total: number; catalogTotal: number; pots: string[]; players: Omit<PlayerDTO, 'status' | 'round'>[] };
export function PlayerCatalogPreview() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => { let active = true;
    void api.get<Catalog>('/players').then(data => { if (active) setCatalog(data); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Catalog unavailable.'); });
    return () => { active = false; };
  }, []);
  return <details className="mt-4 rounded-xl border border-[#242c3d] bg-[#0e121a] p-4 text-sm">
    <summary className="cursor-pointer font-bold text-[#00ff87]">Player catalog {catalog ? '(' + catalog.catalogTotal + ' players)' : ''}</summary>
    {error ? <p role="alert" className="mt-3 text-red-300">{error}</p> : !catalog ? <p className="mt-3 text-[#94a3b8]">Loading players…</p> : <>
      <p className="mt-2 text-xs text-[#94a3b8]">The server selects the auction pool from this catalog.</p>
      <input aria-label="Search player catalog" placeholder="Search player or club" value={search} onChange={e => setSearch(e.target.value)} className="my-3 w-full rounded bg-[#151a24] p-2 text-white"/>
      <div className="max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="text-[#94a3b8]"><th>Player</th><th>Pot</th><th>OVR</th><th>Base price</th></tr></thead>
      <tbody>{catalog.players.filter(p => (p.name + ' ' + (p.club ?? '')).toLowerCase().includes(search.toLowerCase())).map(p => <tr key={p.id} className="border-t border-[#242c3d]"><td className="py-2 text-white">{p.name}<span className="block text-[#94a3b8]">{p.club}</span></td><td>{p.potId}</td><td>{p.ovr}</td><td>{formatCr(p.basePriceCr)}</td></tr>)}</tbody></table></div>
    </>}
  </details>;
}
