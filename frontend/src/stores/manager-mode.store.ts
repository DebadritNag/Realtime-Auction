import { create } from 'zustand';
import type { TournamentState, TournamentSummary } from '@/types/manager-mode';
import { managerService, type ManagerAction } from '@/services/manager-mode.service';
import { webSocketService } from '@/services/websocket.service';
import { useConnectionStore } from './connection.store';
let release: (() => void) | undefined;
let generation = 0;
const toasted=new Set<string>();
let requestResync:()=>void=()=>{};
interface ManagerStore {
    syncStatus:'SYNCED'|'RESYNCING'|'OFFLINE'|'ERROR';
    resync:()=>void;
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
export const useManagerStore = create<ManagerStore>((set, get) => ({ syncStatus:'OFFLINE',resync:()=>requestResync(),toasts:[],dismissToast(id){set({toasts:get().toasts.filter(n=>n.id!==id)});},state: null, inbox: [], error: null, busy: false, inboxLoading: true, deletedTournamentId: null,
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
    start(id) { release?.(); const g = ++generation;
    let timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,attempts=0,inFlight=false,stopped=false,requiredSequence=0;
    const schedule=()=>{
      if(stopped||g!==generation||!id||timer||inFlight||attempts>=3)return;
      set({syncStatus:'RESYNCING',error:null});
      timer=setTimeout(async()=>{
        timer=undefined;inFlight=true;attempts++;controller=new AbortController();const started=performance.now();
        const deadline=setTimeout(()=>controller?.abort(),20000);
        try{
          const snapshot=await managerService.state(id,controller.signal);
          if(stopped||g!==generation)return;
          const current=get().state;
          if(!snapshot||snapshot.id!==id||!Number.isSafeInteger(snapshot.sequence)||!Array.isArray(snapshot.teams)||!Array.isArray(snapshot.fixtures))throw Error('Invalid snapshot');
          if(Math.max(current?.sequence??0,snapshot.sequence)<requiredSequence)throw Error('Snapshot has not caught up yet');
          if(!current||snapshot.sequence>=current.sequence)set({state:snapshot});
          set({syncStatus:useConnectionStore.getState().status==='DISCONNECTED'||useConnectionStore.getState().status==='RECONNECTING'?'OFFLINE':'SYNCED',error:null});attempts=0;
          console.debug('manager_resync',{tournamentId:id,lastSequence:current?.sequence,incomingSequence:snapshot.sequence,stateFetchMs:Math.round(performance.now()-started)});
        }catch{if(!stopped&&g===generation){if(attempts>=3)set({syncStatus:'ERROR',error:'Unable to synchronize. Please retry.'});}}
        finally{clearTimeout(deadline);inFlight=false;if(!stopped&&g===generation&&get().syncStatus==='RESYNCING')schedule();}
      },attempts?Math.min(1000*2**attempts,8000):200+Math.random()*300);
    };
    requestResync=()=>{if(attempts>=3)attempts=0;schedule();};
    const unwatch=useConnectionStore.subscribe(({status})=>{if(stopped||g!==generation)return;if(status==='RECONNECTING'||status==='DISCONNECTED')set({syncStatus:'OFFLINE'});});
    set({ state: null, error: null, syncStatus:'RESYNCING',deletedTournamentId: null }); const unsubscribe = webSocketService.subscribe(e => { if (g !== generation)
        return;
        if (e.type === 'MANAGER_MODE_STATE' && e.payload.id === id) {
            const current = get().state;
            if ((!current || e.sequence >= current.sequence) && e.sequence>=requiredSequence) {
                set({ state: e.payload, error: null, syncStatus:'SYNCED' });
            attempts=0;clearTimeout(timer);timer=undefined;
            }
        }
        if(e.type==='MANAGER_MODE_PATCH'&&e.payload.tournamentId===id){
 const current=get().state;if(!current){schedule();return;}
 if(e.sequence<=current.sequence)return;
 if(e.payload.baseSequence!==current.sequence){requiredSequence=Math.max(requiredSequence,e.sequence);if(!timer&&!inFlight)console.debug('manager_sequence_gap',{tournamentId:id,lastSequence:current.sequence,incomingSequence:e.sequence,baseSequence:e.payload.baseSequence});schedule();return;}
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
        if(e.type==='ERROR'&&['INVALID_RESPONSE','SUBSCRIBER_ERROR','INTERNAL_ERROR'].includes(e.payload.reason)){schedule();return;}
        if (e.type === 'ERROR')
            set({ error: e.payload.message, inboxLoading:false });
    }); release=()=>{stopped=true;clearTimeout(timer);controller?.abort();unsubscribe();unwatch();};webSocketService.connectManager(id); return () => { if (g !== generation)
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
        if(reading)requestResync();
        set({ error: e instanceof Error ? e.message : 'Action failed.' });
        if (['UPDATE_FIXTURE_FORMAT','UPDATE_FIXTURE_SCORERS','SCORE','RESET_SCORE'].includes(a.type)) throw e;
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
