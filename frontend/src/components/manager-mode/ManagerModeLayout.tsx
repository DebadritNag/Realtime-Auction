'use client';
import type { TournamentState } from '@/types/manager-mode';
import { ManagerModeHeader } from './ManagerModeHeader';
import { ManagerModeSubnav } from './ManagerModeSubnav';

interface Props {
  state: TournamentState;
  section: string;
  connectionStatus: string;
  children: React.ReactNode;
}

export function ManagerModeLayout({ state, section, connectionStatus, children }: Props) {
  const unread = (state.notificationUnread??state.notifications.filter(n => !n.read).length);

  return (
    <>
      <ManagerModeHeader state={state} connectionStatus={connectionStatus} />
      <ManagerModeSubnav
        cupEnabled={state.cupData?.competitions.some(c=>c.seasonId===state.seasonData?.currentSeasonId&&c.settings.enabled)}
        tournamentId={state.id}
        activeSection={section}
        isHost={state.isHost}
        unreadNotifications={unread}
      />
      <div className="max-w-[1440px] mx-auto px-4 md:px-10 py-8">
        {children}
      </div>
    </>
  );
}
