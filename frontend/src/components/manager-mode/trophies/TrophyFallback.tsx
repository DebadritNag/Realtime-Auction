export function TrophyFallback({loading=false}:{loading?:boolean}) {
 return <div className="flex h-full min-h-64 flex-col items-center justify-center gap-5 text-amber-300" role="status">
  <svg aria-hidden="true" viewBox="0 0 120 150" className="h-40 w-32" fill="none" stroke="currentColor" strokeWidth="3"><path d="M34 15h52v40c0 35-52 35-52 0V15ZM34 25H15v22c0 18 9 25 24 26m47-48h19v22c0 18-9 25-24 26M60 82v35m-18 0h36l10 18H32l10-18Z"/><path d="M44 24v30c0 14 6 20 16 20" opacity=".35"/></svg>
  <span className="text-xs text-slate-400">{loading?'Preparing the trophy…':'Cup trophy · 3D preview unavailable'}</span>
 </div>;
}
