"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-[#0e121a] border border-[#242c3d]",
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-[#64748b] p-3.5 rounded-2xl bg-[#151a24] border border-[#242c3d]">
          {icon}
        </div>
      )}
      <h4 className="text-base font-bold text-[#f8fafc]">{title}</h4>
      <p className="text-xs text-[#94a3b8] max-w-sm mt-1 mb-5 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
