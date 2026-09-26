import { create } from 'zustand';
import type { TournamentState, TournamentSummary } from '@/types/manager-mode';
import { managerService, type ManagerAction } from '@/services/manager-mode.service';
import { webSocketService } from '@/services/websocket.service';
let release: (() => void) | undefined;
let generation = 0;
const toasted=new Set<string>();
interface ManagerStore {
    toasts: TournamentState['notifications'];
    dismissToast:(id:string)=>void;

    state: TournamentState | null;
    inbox: TournamentSummary[];
    error: string | null;
    busy: boolean;
    inboxLoading: boolean;
    deletedTournamentId: string | null;
    start: (id?: string) => () => void;
    action: (a: ManagerAction) => Promise<void>;
    refreshInbox: () => Promise<void>;
    deleteManagerMode: (id: string) => Promise<void>;
    clearDeleted: () => void;
}
export const useManagerStore = create<ManagerStore>((set, get) => ({ toasts:[],dismissToast(id){set({toasts:get().toasts.filter(n=>n.id!==id)});},state: null, inbox: [], error: null, busy: false, inboxLoading: true, deletedTournamentId: null,
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
    start(id) { release?.(); const g = ++generation; set({ state: null, error: null, deletedTournamentId: null }); release = webSocketService.subscribe(e => { if (g !== generation)
        return;
        if (e.type === 'MANAGER_MODE_STATE' && e.payload.id === id) {
            const current = get().state;
            if (!current || e.sequence >= current.sequence)
                set({ state: e.payload, error: null });
        }
        if(e.type==='MANAGER_MODE_PATCH'&&e.payload.tournamentId===id){
 const current=get().state;if(!current){webSocketService.requestManagerState(id);return;}
 if(e.sequence<=current.sequence)return;
 if(e.payload.baseSequence!==current.sequence){webSocketService.requestManagerState(id);return;}
 set({state:{...current,...e.payload.changes},error:null});
 }
 if(e.type==='NOTIFICATION_CREATED'&&!toasted.has(e.payload.id)){toasted.add(e.payload.id);set({toasts:[...get().toasts,e.payload].slice(-3)});setTimeout(()=>get().dismissToast(e.payload.id),6500);}
 if(e.type==='MANAGER_MODE_SUMMARY'){const previous=get().inbox.find(t=>t.id===e.payload.id);if(!previous||e.payload.sequence>=previous.sequence)set({inbox:[...get().inbox.filter(t=>t.id!==e.payload.id),e.payload]});}
        if (e.type === 'MANAGER_MODE_INBOX')
            set({ inbox: e.payload, inboxLoading:false });

        if (e.type === 'MANAGER_MODE_DELETED') {
            const tid = (e.payload as { tournamentId: string }).tournamentId;
            set({ state: null, inbox: get().inbox.filter(t => t.id !== tid), deletedTournamentId: tid, error: null });
            void get().refreshInbox();
        }
        if (e.type === 'ERROR')
            set({ error: e.payload.message, inboxLoading:false });
    }); webSocketService.connectManager(id); return () => { if (g !== generation)
        return; generation++; release?.(); release = undefined; webSocketService.disconnect(); set({ state: null, inbox: [], toasts:[], busy:false,error: null, deletedTournamentId: null }); }; },
    async action(a) { const state = get().state; if (!state)
        return; const reading=a.type==='READ_NOTIFICATION'||a.type==='READ_ALL_NOTIFICATIONS'||a.type==='READ_OFFER';
 if(reading){const matches=(n:TournamentState['notifications'][number])=>a.type==='READ_ALL_NOTIFICATIONS'||a.type==='READ_NOTIFICATION'&&n.id===a.notificationId||a.type==='READ_OFFER'&&n.metadata.entityType===a.entityType&&n.metadata.entityId===a.entityId;const count=state.notifications.filter(n=>!n.read&&matches(n)).length;
 set({state:{...state,notifications:state.notifications.map(n=>matches(n)?{...n,read:true}:n),notificationUnread:a.type==='READ_ALL_NOTIFICATIONS'?0:Math.max(0,(state.notificationUnread??state.notifications.filter(n=>!n.read).length)-count),unseenOffers:a.type==='READ_ALL_NOTIFICATIONS'?[]:state.unseenOffers?.filter(key=>a.type!=='READ_OFFER'||key!==a.entityType+':'+a.entityId)}});}
 set({ busy: true, error: null }); try {
        const updated = await managerService.action(state.id, a);
        if (get().state?.id === updated.id && updated.sequence >= (get().state?.sequence ?? 0))
            set({ state: updated });
    }
    catch (e) {
        if(reading)webSocketService.requestManagerState(state.id);
        set({ error: e instanceof Error ? e.message : 'Action failed.' });
    }
    finally {
        set({ busy: false });
    } },
    async deleteManagerMode(id) {
        set({ busy: true, error: null });
        try {
            await managerService.delete(id);
            // Optimistically clear state; the WS MANAGER_MODE_DELETED event will
            // also arrive and set deletedTournamentId for the redirect handler.
            set({ state: null, deletedTournamentId: id });
            void get().refreshInbox();
        } catch (e) {
            set({ error: e instanceof Error ? e.message : 'Deletion failed.' });
            throw e;
        } finally {
            set({ busy: false });
        }
    },
    clearDeleted() { set({ deletedTournamentId: null }); },
}));
