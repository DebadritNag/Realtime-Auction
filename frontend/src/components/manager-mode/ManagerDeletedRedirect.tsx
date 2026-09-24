'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useManagerStore } from '@/stores/manager-mode.store';

/**
 * Mounts invisibly inside any Manager Mode page.
 * When the store receives a MANAGER_MODE_DELETED event it sets
 * `deletedTournamentId`. This component detects that and redirects
 * every connected user (host + managers) to /home with a brief message.
 */
export function ManagerDeletedRedirect({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const deletedTournamentId = useManagerStore(s => s.deletedTournamentId);
  const clearDeleted = useManagerStore(s => s.clearDeleted);

  useEffect(() => {
    if (deletedTournamentId === tournamentId) {
      clearDeleted();
      // Give the modal a moment to close visually, then redirect
      const t = setTimeout(() => {
        router.replace('/home?notice=manager-mode-deleted');
      }, 400);
      return () => clearTimeout(t);
    }
  }, [deletedTournamentId, tournamentId, router, clearDeleted]);

  return null;
}
