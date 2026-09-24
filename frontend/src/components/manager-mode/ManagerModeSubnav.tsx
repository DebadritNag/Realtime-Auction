'use client';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
  hostOnly?: boolean;
}

interface Props {
  tournamentId: string;
  activeSection: string;
  isHost: boolean;
  unreadNotifications: number;
}

const TABS: Tab[] = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'squad',
    label: 'Squad',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'fixtures',
    label: 'Fixtures',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'standings',
    label: 'Standings',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'transfers',
    label: 'Transfers',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'teams',
    label: 'Teams',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'host',
    label: 'Host Control',
    hostOnly: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function ManagerModeSubnav({ tournamentId, activeSection, isHost, unreadNotifications }: Props) {
  const visibleTabs = TABS.filter(t => !t.hostOnly || isHost);

  return (
    <div className="w-full border-b border-white/5 bg-[#060e1a]/80 backdrop-blur-sm sticky top-[80px] z-40">
      <div className="max-w-[1440px] mx-auto px-4 md:px-10">
        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide -mb-px" aria-label="Manager Mode navigation">
          {visibleTabs.map(tab => {
            const isActive = activeSection === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/manager-mode/${tournamentId}${tab.id === 'dashboard' ? '' : '/' + tab.id}`}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors border-b-2 cursor-pointer',
                  isActive
                    ? 'text-emerald-400 border-emerald-400'
                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.id === 'notifications' && unreadNotifications > 0 && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-slate-950 px-1">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
                {tab.id === 'host' && (
                  <span className="ml-0.5 text-[9px] font-bold tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1.5 py-0.5">
                    HOST
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
