"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "stadium" | "interactive";
  glow?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, variant = "default", glow = false, ...props }, ref) => {
    const variantStyles = {
      default: "bg-[#0e121a] border border-[#242c3d]",
      elevated: "bg-[#151a24] border border-[#242c3d] shadow-lg",
      stadium:
        "bg-gradient-to-b from-[#151a24] to-[#0e121a] border border-[#242c3d]",
      interactive:
        "bg-[#0e121a] border border-[#242c3d] hover:border-[#00ff87]/50 hover:bg-[#151a24] transition-all cursor-pointer",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl p-4 text-[#f8fafc]",
          variantStyles[variant],
          glow && "shadow-[0_0_30px_-5px_rgba(0,255,135,0.15)] border-[#00ff87]/40",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
