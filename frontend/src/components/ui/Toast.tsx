"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export interface ToastProps {
  type?: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

export const Toast: React.FC<ToastProps> = ({
  type = "info",
  title,
  message,
  onClose,
  className,
}) => {
  const icons = {
    info: <Info className="w-5 h-5 text-sky-400 shrink-0" />,
    success: <CheckCircle2 className="w-5 h-5 text-[#00ff87] shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
    error: <XCircle className="w-5 h-5 text-[#ef4444] shrink-0" />,
  };

  const borders = {
    info: "border-sky-500/40 bg-sky-950/40",
    success: "border-[#00ff87]/40 bg-emerald-950/40",
    warning: "border-amber-500/40 bg-amber-950/40",
    error: "border-[#ef4444]/40 bg-rose-950/40",
  };

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 shadow-xl animate-notice text-sm text-[#f8fafc]",
        borders[type],
        className
      )}
    >
      {icons[type]}
      <div className="flex-1">
        {title && <p className="font-semibold text-xs tracking-wide">{title}</p>}
        <p className="text-xs text-[#cbd5e1]">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-[#64748b] hover:text-[#f8fafc] text-xs font-mono"
        >
          ✕
        </button>
      )}
    </div>
  );
};
