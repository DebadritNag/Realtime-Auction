"use client";
import { useManagerStore } from '@/stores/manager-mode.store';
import Link from 'next/link';
import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useAuctionStore } from "@/stores/auction.store";
import { AppHeader } from "./AppHeader";
import { Footer } from "./Footer";
import { MobileNav } from "./MobileNav";

const PROTECTED = /^\/(home|create|join|room|auction|results|team|profile|manager-mode)(\/|$)/;
const AUTH_PAGES = /^\/auth\//;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { initializeAuth, isAuthenticated, isRestoring, user } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  const isProtected = PROTECTED.test(pathname);
  const isAuthPage = AUTH_PAGES.test(pathname);
  const roomCode =
    pathname.match(/^\/(?:room|auction)\/([^/]+)$/)?.[1]?.toUpperCase() ?? null;

  // Boot auth once per mount
  useEffect(() => { void initializeAuth(); }, [initializeAuth]);

  // Once auth is known, enforce route rules
  useEffect(() => {
    if (isRestoring) return; // don't decide until session is resolved

    if (isProtected && !isAuthenticated) {
      // Use hard navigation so the browser sends fresh cookies to the server
      const dest = `/auth/signin?redirectTo=${encodeURIComponent(pathname)}`;
      window.location.href = dest;
      return;
    }

    if (isAuthPage && isAuthenticated) {
      // Already logged in — get out of auth pages
      router.replace("/home");
    }
  }, [isRestoring, isAuthenticated, isProtected, isAuthPage, pathname, router]);

  // Auction WebSocket lifecycle
  useEffect(() => {
    if (!roomCode || !isAuthenticated || isRestoring) return;
    useAuctionStore.getState().initAuction(roomCode);
    return () => useAuctionStore.getState().leaveAuction();
  }, [roomCode, isAuthenticated, isRestoring, user?.id]);

  const managerId=pathname.startsWith('/manager-mode/') ? pathname.split('/')[2] : undefined;
  useEffect(()=>{
    if(roomCode||!isAuthenticated||isRestoring)return;
    return useManagerStore.getState().start(managerId==='create'?undefined:managerId);
  },[roomCode,managerId,isAuthenticated,isRestoring,user?.id]);
  const invitations=useManagerStore(s=>s.inbox.filter(t=>t.invitation==='PENDING').length);
  // Show placeholder while session is restoring on a protected route
  const showLoader = isProtected && (isRestoring || !isAuthenticated);

  return (
    <div className="min-h-screen flex flex-col bg-[#08090d] text-[#f8fafc]">
      <AppHeader />
      {isAuthenticated&&!roomCode&&invitations>0&&<Link href="/manager-mode" className="flex items-center justify-center gap-2 px-6 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/5 border-b border-emerald-900/60 hover:bg-emerald-500/10 transition-colors"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>{invitations} pending Manager Mode invitation{invitations>1?'s':''} — <span className="underline underline-offset-2">view</span></Link>}
      <main className={pathname.startsWith("/auction/") ? "flex-1" : "flex-1 pb-16 md:pb-0"}>
        {showLoader ? (
          <div className="p-12 text-center text-sm text-[#94a3b8]">
            {isRestoring ? "Restoring your session…" : "Redirecting…"}
          </div>
        ) : (
          children
        )}
      </main>
      {!pathname.startsWith("/auction/") && <Footer />}
      {!pathname.startsWith("/auction/") && <MobileNav />}
    </div>
  );
}
