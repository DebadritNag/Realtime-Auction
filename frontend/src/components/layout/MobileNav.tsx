"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, LogIn, User } from "lucide-react";
import { cn } from "@/lib/utils";

export const MobileNav: React.FC = () => {
  const pathname = usePathname();

  // Hide bottom nav in live auction to avoid obstructing bid console
  if (pathname?.startsWith("/auction/")) return null;

  const links = [
    { href: "/home", label: "Home", icon: <Home className="w-4 h-4" /> },
    { href: "/create", label: "Create", icon: <PlusCircle className="w-4 h-4" /> },
    { href: "/join", label: "Join", icon: <LogIn className="w-4 h-4" /> },
    { href: "/profile", label: "Profile", icon: <User className="w-4 h-4" /> },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#08090d]/95 border-t border-[#242c3d] backdrop-blur-lg px-2 py-2">
      <div className="flex items-center justify-around">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-semibold transition-colors",
                isActive
                  ? "text-[#00ff87]"
                  : "text-[#64748b] hover:text-[#f8fafc]"
              )}
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
