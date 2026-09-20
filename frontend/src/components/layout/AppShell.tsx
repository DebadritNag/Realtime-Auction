"use client";
import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useAuctionStore } from "@/stores/auction.store";
import { AppHeader } from "./AppHeader";
import { Footer } from "./Footer";
import { MobileNav } from "./MobileNav";

const PROTECTED = /^\/(home|create|join|room|auction|results|team|profile)(\/|$)/;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { initializeAuth, isAuthenticated, isRestoring, user } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  const isProtected = PROTECTED.test(pathname);
  const roomCode =
    pathname.match(/^\/(?:room|auction)\/([^/]+)$/)?.[1]?.toUpperCase() ?? null;

  // Boot auth once on mount
  useEffect(() => { void initializeAuth(); }, [initializeAuth]);

  // Redirect unauthenticated users away from protected routes.
  // Wait until isRestoring is false so we don't bounce mid-session-restore.
  useEffect(() => {
    if (isProtected && !isRestoring && !isAuthenticated) {
      const dest = `/auth/signin?redirectTo=${encodeURIComponent(pathname)}`;
      router.replace(dest);
    }
  }, [isProtected, isRestoring, isAuthenticated, pathname, router]);

  // Connect/disconnect auction WebSocket for room and auction pages
  useEffect(() => {
    if (!roomCode || !isAuthenticated || isRestoring) return;
    useAuctionStore.getState().initAuction(roomCode);
    return () => useAuctionStore.getState().leaveAuction();
  }, [roomCode, isAuthenticated, isRestoring, user?.id]);

  // While a protected page is loading auth state, show a neutral placeholder
  const showLoader = isProtected && (isRestoring || !isAuthenticated);

  return (
    <div className="min-h-screen flex flex-col bg-[#08090d] text-[#f8fafc]">
      <AppHeader />
      <main className="flex-1 pb-16 md:pb-0">
        {showLoader ? (
          <div className="p-12 text-center text-sm text-[#94a3b8]">
            {isRestoring ? "Restoring your session…" : "Redirecting to sign in…"}
          </div>
        ) : (
          children
        )}
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
