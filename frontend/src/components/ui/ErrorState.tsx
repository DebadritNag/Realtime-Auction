"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AlertOctagon } from "lucide-react";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Connection or State Issue",
  message,
  onRetry,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-[#0e121a] border border-[#ef4444]/30",
        className
      )}
    >
      <div className="mb-4 text-[#ef4444] p-3 rounded-full bg-[#ef4444]/10 border border-[#ef4444]/20">
        <AlertOctagon className="w-8 h-8" />
      </div>
      <h4 className="text-base font-bold text-[#f8fafc]">{title}</h4>
      <p className="text-xs text-[#cbd5e1] max-w-sm mt-1 mb-5">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try Reconnecting
        </Button>
      )}
    </div>
  );
};
