"use client";

import React from "react";
import Link from "next/link";

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-brand-border bg-[#04080D] pt-14 pb-12 relative z-20">
      <div className="max-w-[1440px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12">
          {/* Footer Left Brand & Summary */}
          <div className="lg:col-span-4 space-y-4">
            <Link className="flex items-center gap-3 group" href="/">
              <div className="w-9 h-9 rounded-lg bg-brand-mint/15 border border-brand-mint/40 flex items-center justify-center text-brand-mint transition-transform group-hover:scale-105">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.78 2.72 3.23 3.33L10 19v2h4v-2l-.62-2.73c1.45-.61 2.6-1.83 3.23-3.33 2.47-.31 4.39-2.39 4.39-4.94V7c0-1.1-.9-2-2-2z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-white font-extrabold tracking-wider text-base leading-none">
                  ARENA<span className="text-brand-mint">AUCTION</span>
                </span>
                <span className="text-[9px] tracking-widest text-slate-400 font-semibold uppercase mt-0.5">
                  Real-Time Football
                </span>
              </div>
            </Link>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              The premier real-time multiplayer football auction platform. Built for fans, for gamers. Creating bigger games and stronger tools for real fans.
            </p>
          </div>

          {/* Column 1: Product */}
          <div className="lg:col-span-2 space-y-3">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Product</h5>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link className="hover:text-brand-mint transition-colors" href="/#how-it-runs">
                  How It Works
                </Link>
              </li>
              <li>
                <Link className="hover:text-brand-mint transition-colors" href="/create">
                  Play
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Community */}
          <div className="lg:col-span-2 space-y-3">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Community</h5>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link className="hover:text-brand-mint transition-colors" href="/results/PREM-2026">
                  Leaderboard
                </Link>
              </li>
              <li>
                <Link className="hover:text-brand-mint transition-colors" href="/home">
                  Tournaments
                </Link>
              </li>
              <li>
                <Link className="hover:text-brand-mint transition-colors" href="/home">
                  Fantasy Hub
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Support */}
          <div className="lg:col-span-2 space-y-3">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Support</h5>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link className="hover:text-brand-mint transition-colors" href="/profile">
                  Help Center
                </Link>
              </li>
              <li>
                <Link className="hover:text-brand-mint transition-colors" href="/profile">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link className="hover:text-brand-mint transition-colors" href="/profile">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Follow Us & Tagline */}
          <div className="lg:col-span-2 space-y-4">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Follow Us</h5>
            {/* Social Icons Row */}
            <div className="flex items-center space-x-3 text-slate-300">
              {/* X (Twitter) */}
              <a
                className="w-8 h-8 rounded-lg bg-slate-900 border border-brand-border flex items-center justify-center hover:text-brand-mint hover:border-brand-mint transition-colors"
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              {/* Instagram */}
              <a
                className="w-8 h-8 rounded-lg bg-slate-900 border border-brand-border flex items-center justify-center hover:text-brand-mint hover:border-brand-mint transition-colors"
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              {/* Discord */}
              <a
                className="w-8 h-8 rounded-lg bg-slate-900 border border-brand-border flex items-center justify-center hover:text-brand-mint hover:border-brand-mint transition-colors"
                href="https://discord.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
              {/* YouTube */}
              <a
                className="w-8 h-8 rounded-lg bg-slate-900 border border-brand-border flex items-center justify-center hover:text-brand-mint hover:border-brand-mint transition-colors"
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            </div>
            {/* Footer Motto Tagline */}
            <div className="pt-2">
              <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                FOOTBALL<br />
                <span className="text-white tracking-widest">BRINGS US TOGETHER</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

