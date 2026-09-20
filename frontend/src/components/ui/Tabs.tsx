"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  size?: "sm" | "md";
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className,
  size = "md",
}) => {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-[#0e121a] p-1 border border-[#242c3d]",
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg font-medium transition-all select-none cursor-pointer",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              isActive
                ? "bg-[#1e2433] text-[#00ff87] font-semibold shadow-sm border border-[#00ff87]/30"
                : "text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#151a24] border border-transparent"
            )}
          >
            {tab.icon && <span>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                  isActive
                    ? "bg-[#00ff87]/20 text-[#00ff87]"
                    : "bg-[#242c3d] text-[#94a3b8]"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
