"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  src?: string;
  name?: string;
  emoji?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = "User",
  emoji,
  size = "md",
  className,
}) => {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-12 h-12 text-lg",
    xl: "w-16 h-16 text-2xl",
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0 border border-[#242c3d] bg-[#151a24] text-[#f8fafc]",
        sizeClasses[size],
        className
      )}
    >
      {emoji ? (
        <span className="select-none">{emoji}</span>
      ) : src && !imageError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[#00ff87] tracking-wider">{initials}</span>
      )}
    </div>
  );
};
