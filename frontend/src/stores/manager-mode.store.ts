import { create } from 'zustand';
import type { TournamentState, TournamentSummary } from '@/types/manager-mode';
import { managerService, type ManagerAction } from '@/services/manager-mode.service';
import { webSocketService } from '@/services/websocket.service';
let release: (() => void) | undefined;
let generation = 0;
interface ManagerStore {
    state: TournamentState | null;
    inbox: TournamentSummary[];
    error: string | null;
    busy: boolean;
    inboxLoading: boolean;
    start: (id?: string) => () => void;
    action: (a: ManagerAction) => Promise<void>;
    refreshInbox: () => Promise<void>;
}
export const useManagerStore = create<ManagerStore>((set, get) => ({ state: null, inbox: [], error: null, busy: false, inboxLoading: true,
    async refreshInbox() { const g = generation; set({ inboxLoading: true }); try {
        const inbox = await managerService.list();
        if (g === generation)
            set({ inbox });
    }
    catch (e) {
        if (g === generation)
            set({ error: e instanceof Error ? e.message : 'Unable to load tournaments.' });
    }
    finally {
        if (g === generation)
            set({ inboxLoading: false });
    } },
    start(id) { release?.(); const g = ++generation; set({ state: null, error: null }); release = webSocketService.subscribe(e => { if (g !== generation)
        return; if (e.type === 'MANAGER_MODE_STATE' && e.payload.id === id) {
        const current = get().state;
        if (!current || e.sequence >= current.sequence)
            set({ state: e.payload, error: null });
    } if (e.type === 'MANAGER_MODE_INBOX')
        set({ inbox: e.payload }); if (e.type === 'MANAGER_MODE_CREATED' || e.type === 'MANAGER_MODE_UPDATED')
        void get().refreshInbox(); if (e.type === 'ERROR')
        set({ error: e.payload.message }); }); webSocketService.connectManager(id); void get().refreshInbox(); return () => { if (g !== generation)
        return; generation++; release?.(); release = undefined; webSocketService.disconnect(); set({ state: null, inbox: [], error: null }); }; },
    async action(a) { const state = get().state; if (!state)
        return; set({ busy: true, error: null }); try {
        const updated = await managerService.action(state.id, a);
        if (get().state?.id === updated.id && updated.sequence >= (get().state?.sequence ?? 0))
            set({ state: updated });
    }
    catch (e) {
        set({ error: e instanceof Error ? e.message : 'Action failed.' });
    }
    finally {
        set({ busy: false });
    } }
}));
