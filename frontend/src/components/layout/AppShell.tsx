"use client";
import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useAuctionStore } from "@/stores/auction.store";
import { AppHeader } from "./AppHeader";
import { Footer } from "./Footer";
import { MobileNav } from "./MobileNav";

const PROTECTED = /^\/(home|create|join|room|auction|results|team|profile)(\/|$)/;
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

  // Show placeholder while session is restoring on a protected route
  const showLoader = isProtected && (isRestoring || !isAuthenticated);

  return (
    <div className="min-h-screen flex flex-col bg-[#08090d] text-[#f8fafc]">
      <AppHeader />
      <main className="flex-1 pb-16 md:pb-0">
        {showLoader ? (
          <div className="p-12 text-center text-sm text-[#94a3b8]">
            {isRestoring ? "Restoring your session…" : "Redirecting…"}
          </div>
        ) : (
          children
        )}
      </main>
      {!pathname.startsWith("/auction/") && <Footer />}
      <MobileNav />
    </div>
  );
}
