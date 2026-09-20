"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: SelectOption[];
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options = [], error, helperText, id, children, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold uppercase tracking-wider text-[#94a3b8]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "w-full appearance-none rounded-lg bg-[#0e121a] border text-sm text-[#f8fafc] transition-colors",
              "px-3.5 py-2.5 pr-10 outline-none focus:ring-1 focus:ring-[#00ff87] focus:border-[#00ff87]",
              error
                ? "border-[#ef4444] focus:ring-[#ef4444]"
                : "border-[#242c3d] hover:border-[#37435e]",
              className
            )}
            {...props}
          >
            {options.length > 0
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#151a24] text-white">
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#64748b]">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {error && <p className="text-xs text-[#ef4444] font-medium">{error}</p>}
        {!error && helperText && (
          <p className="text-xs text-[#64748b]">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
