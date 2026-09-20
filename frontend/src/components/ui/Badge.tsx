"use client";

import React from "react";
import { cn, getPositionColor } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "lime" | "gold" | "danger" | "position" | "status";
  position?: string;
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  children,
  variant = "default",
  position,
  size = "md",
  ...props
}) => {
  const sizeStyles = {
    sm: "px-2 py-0.5 text-[11px] font-bold",
    md: "px-2.5 py-1 text-xs font-semibold",
  };

  if (variant === "position" && position) {
    const posColors = getPositionColor(position);
    return (
      <span
        className={cn(
          "inline-flex items-center rounded border font-mono tracking-wider",
          posColors.bg,
          posColors.text,
          posColors.border,
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children || position}
      </span>
    );
  }

  const variantStyles = {
    default: "bg-[#1e2433] text-[#94a3b8] border border-[#242c3d]",
    lime: "bg-[#00ff87]/15 text-[#00ff87] border border-[#00ff87]/30 font-bold",
    gold: "bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30 font-bold",
    danger: "bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30 font-bold",
    position: "bg-slate-800 text-slate-200 border border-slate-700",
    status: "bg-[#0e121a] text-[#f8fafc] border border-[#242c3d]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-sans",
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};
