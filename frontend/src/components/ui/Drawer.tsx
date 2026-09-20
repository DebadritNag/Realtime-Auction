"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  position?: "right" | "bottom";
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  position = "right",
  className,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#08090d]/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          "fixed z-10 flex flex-col bg-[#0e121a] border-[#242c3d] shadow-2xl transition-transform duration-200",
          position === "right" &&
            "inset-y-0 right-0 w-full sm:max-w-md border-l animate-notice",
          position === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t animate-notice",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 px-5 border-b border-[#242c3d] shrink-0">
          <div>
            {title && (
              <h3 className="text-base font-bold text-[#f8fafc]">{title}</h3>
            )}
            {description && (
              <p className="text-xs text-[#94a3b8] mt-0.5">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-lg p-1.5 text-[#64748b] hover:text-[#f8fafc] hover:bg-[#151a24] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};
