import type { Team } from '@/types';
import { formatCr } from '@/lib/utils';

/** Starting purse, retention spend, auction spend and remaining purse. Renders nothing for teams without retention. */
export function PurseBreakdown({ team, className = '' }: { team: Pick<Team, 'budgetTotal' | 'budgetSpent' | 'budgetRemaining' | 'retentionSpent' | 'retainedCount'>; className?: string }) {
  const retention = team.retentionSpent ?? 0;
  if (!(team.retainedCount ?? 0) && !retention) return null;
  const auction = Math.max(0, team.budgetSpent - retention);
  const rows: [string, string, string][] = [
    ['Starting purse', formatCr(team.budgetTotal), 'text-[#f8fafc]'],
    ['Retention spend', formatCr(retention), 'text-[#f5c542]'],
    ['Auction spend', formatCr(auction), 'text-amber-400'],
    ['Remaining purse', formatCr(team.budgetRemaining), 'text-[#00ff87]'],
  ];
  return (
    <dl data-testid="purse-breakdown" className={`grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-[#1e2a3a] bg-[#0d111a] px-2.5 py-2 text-[11px] ${className}`}>
      {rows.map(([label, value, tone]) => (
        <div key={label} className="flex items-baseline justify-between gap-2">
          <dt className="text-[#94a3b8]">{label}</dt>
          <dd className={`font-mono font-bold ${tone}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
