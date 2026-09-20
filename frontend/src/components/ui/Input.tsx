"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      leftIcon,
      rightElement,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-[#94a3b8]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 text-[#64748b] pointer-events-none shrink-0">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "w-full rounded-lg bg-[#0e121a] border text-sm text-[#f8fafc] placeholder-[#475569] transition-colors",
              "px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-[#00ff87] focus:border-[#00ff87]",
              leftIcon ? "pl-10" : "",
              rightElement ? "pr-12" : "",
              error
                ? "border-[#ef4444] focus:ring-[#ef4444] focus:border-[#ef4444]"
                : "border-[#242c3d] hover:border-[#37435e]",
              disabled ? "opacity-50 cursor-not-allowed bg-[#151a24]" : "",
              className
            )}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 text-[#94a3b8]">{rightElement}</div>
          )}
        </div>
        {error && <p className="text-xs text-[#ef4444] font-medium">{error}</p>}
        {!error && helperText && (
          <p className="text-xs text-[#64748b]">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
