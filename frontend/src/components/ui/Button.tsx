"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "stadium";
  size?: "sm" | "md" | "lg" | "xl";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-semibold transition-all duration-150 rounded-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090d] disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

    const sizeStyles = {
      sm: "text-xs px-3 py-1.5 gap-1.5",
      md: "text-sm px-4 py-2.5 gap-2",
      lg: "text-base px-5 py-3 gap-2.5",
      xl: "text-lg px-7 py-3.5 gap-3 font-bold",
    };

    const variantStyles = {
      primary:
        "bg-[#00ff87] text-[#08090d] hover:bg-[#15e683] hover:shadow-[0_0_20px_rgba(0,255,135,0.35)] focus-visible:ring-[#00ff87]",
      secondary:
        "bg-[#151a24] text-[#f8fafc] border border-[#242c3d] hover:bg-[#1e2433] hover:border-[#37435e] focus-visible:ring-slate-400",
      stadium:
        "bg-gradient-to-r from-[#00ff87] to-[#10b981] text-[#08090d] shadow-[0_0_25px_rgba(0,255,135,0.25)] hover:shadow-[0_0_35px_rgba(0,255,135,0.45)] focus-visible:ring-[#00ff87] font-bold tracking-wide",
      outline:
        "bg-transparent text-[#00ff87] border border-[#00ff87]/50 hover:bg-[#00ff87]/10 hover:border-[#00ff87] focus-visible:ring-[#00ff87]",
      ghost:
        "bg-transparent text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#151a24] focus-visible:ring-slate-400",
      danger:
        "bg-[#ef4444] text-white hover:bg-[#dc2626] hover:shadow-[0_0_20px_rgba(239,68,68,0.35)] focus-visible:ring-[#ef4444]",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        {!isLoading && leftIcon && <span className="shrink-0">{leftIcon}</span>}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
