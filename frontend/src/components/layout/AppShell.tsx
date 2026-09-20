"use client";
import React,{useEffect} from 'react';
import { usePathname,useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAuctionStore } from '@/stores/auction.store';
import { AppHeader } from './AppHeader';
import { Footer } from './Footer';
import { MobileNav } from './MobileNav';
export function AppShell({children}:{children:React.ReactNode}){
 const {initializeAuth,isAuthenticated,isRestoring,user}=useAuthStore();
 const pathname=usePathname(),router=useRouter();
 const protectedRoute=/^\/(home|create|join|room|auction|results|team|profile)(\/|$)/.test(pathname);
 const code=pathname.match(/^\/(?:room|auction)\/([^/]+)$/)?.[1]?.toUpperCase()??null;
 useEffect(()=>{void initializeAuth();},[initializeAuth]);
 useEffect(()=>{if(protectedRoute&&!isRestoring&&!isAuthenticated)router.replace('/auth/signin');},[protectedRoute,isRestoring,isAuthenticated,router]);
 useEffect(()=>{
  if(!code||!isAuthenticated||isRestoring)return;
  useAuctionStore.getState().initAuction(code);
  return()=>useAuctionStore.getState().leaveAuction();
 },[code,isAuthenticated,isRestoring,user?.id]);
 return <div className="min-h-screen flex flex-col bg-[#08090d] text-[#f8fafc]"><AppHeader/>
  <main className="flex-1 pb-16 md:pb-0">{protectedRoute&&(isRestoring||!isAuthenticated)?
   <div className="p-12 text-center text-sm text-[#94a3b8]">{isRestoring?'Restoring your session…':'Redirecting to sign in…'}</div>:children}</main>
  <Footer/><MobileNav/></div>;
}
