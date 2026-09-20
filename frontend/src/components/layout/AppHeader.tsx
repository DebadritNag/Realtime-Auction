"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";
import { User as UserIcon, LogOut, Menu, X, Compass } from "lucide-react";

// Pages where app nav + user controls are hidden
const PUBLIC_ROUTES = ["/", "/auth/signin", "/auth/signup"];

export const AppHeader: React.FC = () => {
  const pathname = usePathname();
  const { user, isAuthenticated, isRestoring, signOut } = useAuthStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isLiveAuction = pathname?.startsWith("/auction/");
  // Full-screen auction workspace — render nothing; the page has its own top bar
  if (isLiveAuction) return null;
  const isPublicPage =
    PUBLIC_ROUTES.includes(pathname ?? "") ||
    (pathname ?? "").startsWith("/auth/");

  // Show app nav only when auth is confirmed — never while restoring or on public pages
  const showAppNav = isAuthenticated && !isRestoring && !isPublicPage;

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await signOut();
    window.location.replace("/");
  };

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.username?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <header className="w-full border-b border-brand-border/60 bg-[#060D14]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1440px] mx-auto px-6 h-20 flex items-center justify-between">

        {/* ── Logo ──────────────────────────────────────────────── */}
        <Link
          href={isAuthenticated ? "/home" : "/"}
          className="flex items-center gap-3.5 group flex-shrink-0"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-mint/25 to-brand-mint/5 border border-brand-mint/60 flex items-center justify-center shadow-glow-mint transition-transform duration-300 group-hover:scale-105">
            <svg className="w-6 h-6 text-brand-mint" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.78 2.72 3.23 3.33L10 19v2h4v-2l-.62-2.73c1.45-.61 2.6-1.83 3.23-3.33 2.47-.31 4.39-2.39 4.39-4.94V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-white font-extrabold tracking-wider text-lg leading-none">
              ARENA<span className="text-brand-mint">AUCTION</span>
            </span>
            <span className="text-[10px] tracking-[0.24em] font-semibold text-slate-400 mt-1 uppercase">
              Real-Time Football
            </span>
          </div>
        </Link>

        {/* ── Center Nav Navigation (Public) ────────────────────── */}
        {isPublicPage && (
          <nav className="hidden md:flex items-center space-x-10">
            <Link
              href="/"
              className="relative py-2 text-sm font-semibold text-white tracking-wide transition-colors"
            >
              Home
              {pathname === "/" && (
                <span className="absolute bottom-0 left-0 w-full h-[2.5px] bg-brand-mint shadow-[0_0_12px_#00F29D] rounded-full" />
              )}
            </Link>
          </nav>
        )}

        {/* ── App nav (authenticated, not on auction screen) ────── */}
        {showAppNav && !isLiveAuction && (
          <nav className="hidden md:flex items-center space-x-2 text-[13px] font-semibold">
            <Link
              href="/home"
              className={cn(
                "flex items-center space-x-2 px-3.5 py-1.5 rounded-full transition-colors",
                pathname === "/home"
                  ? "text-brand-mint bg-brand-mint/10 border border-brand-mint/70 px-4"
                  : "text-[#8CA0B3] hover:text-white"
              )}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Dashboard</span>
            </Link>

            <Link
              href="/create"
              className={cn(
                "flex items-center space-x-2 px-3.5 py-1.5 rounded-full transition-all",
                pathname === "/create"
                  ? "text-brand-mint bg-brand-mint/10 border border-brand-mint/70 px-4"
                  : "text-[#8CA0B3] hover:text-white"
              )}
            >
              <svg className="w-4 h-4 text-brand-mint" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8m-4-4h8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Create Room</span>
            </Link>

            <Link
              href="/join"
              className={cn(
                "flex items-center space-x-2 px-3.5 py-1.5 rounded-full transition-colors",
                pathname === "/join"
                  ? "text-brand-mint bg-brand-mint/10 border border-brand-mint/70 px-4"
                  : "text-[#8CA0B3] hover:text-white"
              )}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Join Room</span>
            </Link>

            <Link
              href="/results/PREM-2026"
              className={cn(
                "flex items-center space-x-2 px-3.5 py-1.5 rounded-full transition-colors",
                pathname?.startsWith("/results")
                  ? "text-brand-mint bg-brand-mint/10 border border-brand-mint/70 px-4"
                  : "text-[#8CA0B3] hover:text-white"
              )}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Leaderboard</span>
            </Link>
          </nav>
        )}

        {/* ── Public Sign In / Sign Up buttons ──────────────────── */}
        {isPublicPage && (
          <div className="flex items-center gap-4">
            <Link
              href="/auth/signin"
              className={cn(
                "px-5 py-2 text-sm font-semibold transition-colors",
                pathname === "/auth/signin"
                  ? "text-brand-mint"
                  : "text-slate-300 hover:text-white"
              )}
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="px-6 py-2.5 rounded-lg bg-brand-mint text-slate-950 font-bold text-sm tracking-wide shadow-glow-mint hover:bg-brand-mintHover hover:shadow-[0_0_40px_rgba(0,242,157,0.7)] transition-all duration-200"
            >
              Sign Up
            </Link>
          </div>
        )}

      {/* ── Right side controls ───────────────────────────────── */}
      <div className="flex items-center space-x-3">

        {/* Notification bell — authenticated only */}
        {showAppNav && (
          <button
            aria-label="Notifications"
            className="relative p-1.5 text-[#8CA0B3] hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#00F5A0] ring-2 ring-[#020D15]" />
          </button>
        )}

        {/* User profile pill + dropdown — authenticated only */}
        {showAppNav && user && (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center space-x-2.5 cursor-pointer pl-1 py-1 rounded-full hover:bg-white/5 transition-colors focus:outline-none"
            >
              <div className="w-8 h-8 rounded-full bg-[#1D60E3] flex items-center justify-center text-xs font-bold text-white tracking-wide border border-blue-400/40">
                {initials}
              </div>
              <span className="hidden sm:block text-[13px] font-semibold text-slate-200">
                {user.username}
              </span>
              <svg
                className={cn("w-4 h-4 text-[#7E92A5] transition-transform", userMenuOpen && "rotate-180")}
                fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
              >
                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#061521] border border-[#122e42] p-1.5 shadow-2xl z-50 animate-notice">
                <div className="px-3 py-2 border-b border-[#0f283a] mb-1">
                  <p className="text-xs font-bold text-white">{user.displayName}</p>
                  <p className="text-[11px] text-[#7E96AD] truncate">@{user.username}</p>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#A1B3C6] hover:text-[#00F59B] hover:bg-[#092230] rounded-lg transition-colors"
                >
                  <UserIcon className="h-4 w-4 text-[#00F59B]" />
                  Profile & Statistics
                </Link>
                <Link
                  href="/home"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#A1B3C6] hover:text-[#00F59B] hover:bg-[#092230] rounded-lg transition-colors"
                >
                  <Compass className="h-4 w-4 text-[#00F59B]" />
                  Dashboard Home
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors mt-1"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mobile hamburger — app pages only */}
        {showAppNav && (
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1 text-gray-400 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}
      </div>
    </div>

      {/* ── Mobile dropdown ───────────────────────────────────── */}
      {showAppNav && mobileMenuOpen && (
        <div className="md:hidden absolute top-[58px] inset-x-0 border-b border-[#0d2232] bg-[#020A12] px-6 py-4 space-y-2.5 shadow-2xl z-40 animate-notice">
          <Link href="/home" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-sm font-semibold text-[#00F59B]">Dashboard</Link>
          <Link href="/create" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-sm text-[#A1B3C6] hover:text-white">Create Room</Link>
          <Link href="/join" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-sm text-[#A1B3C6] hover:text-white">Join Room</Link>
          <Link href="/results/PREM-2026" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-sm text-[#A1B3C6] hover:text-white">Leaderboard</Link>
          <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-sm text-[#A1B3C6] hover:text-white">Profile</Link>
          <button onClick={handleSignOut} className="block py-1.5 text-sm text-[#ef4444] text-left w-full">Sign Out</button>
        </div>
      )}
    </header>
  );
};
