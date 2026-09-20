import { create } from 'zustand';
import type { User } from '@/types';
import { authService,mapUser,type SignInCredentials,type SignUpCredentials } from '@/services/auth.service';
import { getSupabase } from '@/lib/supabase';
import { useAuctionStore } from './auction.store';
import { useUIStore } from './ui.store';
import { webSocketService } from '@/services/websocket.service';
let initialized=false;
interface Store{
 user:User|null;isAuthenticated:boolean;isLoading:boolean;isRestoring:boolean;error:string|null;notice:string|null;
 initializeAuth:()=>Promise<void>;signIn:(c:SignInCredentials)=>Promise<boolean>;signUp:(c:SignUpCredentials)=>Promise<boolean>;
 signOut:()=>Promise<void>;clearError:()=>void;setUser:(user:User|null)=>void;
}
export const useAuthStore=create<Store>((set,get)=>({
 user:null,isAuthenticated:false,isLoading:false,isRestoring:true,error:null,notice:null,
 initializeAuth:async()=>{
  if(initialized)return;initialized=true;
  try{
   // Supabase owns refresh and persistence. Never duplicate access tokens in custom localStorage.
   getSupabase().auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'||(session&&get().user&&session.user.id!==get().user?.id)){
     useAuctionStore.getState().leaveAuction();useUIStore.setState(useUIStore.getInitialState());
    }
    set({user:session?mapUser(session.user):null,isAuthenticated:!!session,isRestoring:false});
    if(event==='TOKEN_REFRESHED')setTimeout(()=>webSocketService.refreshAuth(),0);
   });
   const user=await authService.getSession();set({user,isAuthenticated:!!user,isRestoring:false});
  }catch(e){set({isRestoring:false,error:e instanceof Error?e.message:'Could not restore your session.'});}
 },
 signIn:async credentials=>{set({isLoading:true,error:null,notice:null});try{const res=await authService.signIn(credentials);set({user:res.user,isAuthenticated:true,isLoading:false});return true;}catch(e){set({isLoading:false,error:e instanceof Error?e.message:'Sign in failed.'});return false;}},
 signUp:async credentials=>{set({isLoading:true,error:null,notice:null});try{const res=await authService.signUp(credentials);set({user:res.user,isAuthenticated:!!res.user,isLoading:false,notice:res.needsConfirmation?'Check your email to confirm your account, then sign in.':null});return !!res.user;}catch(e){set({isLoading:false,error:e instanceof Error?e.message:'Sign up failed.'});return false;}},
 signOut:async()=>{useAuctionStore.getState().leaveAuction();useUIStore.setState(useUIStore.getInitialState());try{await authService.signOut();set({user:null,isAuthenticated:false,error:null});}catch(e){set({error:e instanceof Error?e.message:'Sign out failed.'});throw e;}},
 clearError:()=>set({error:null,notice:null}),setUser:user=>set({user,isAuthenticated:!!user}),
}));
