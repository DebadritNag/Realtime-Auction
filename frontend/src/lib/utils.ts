import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a numeric price in Crores (Cr) to a readable string (e.g. ₹38.5 Cr)
 */
export function formatCr(amountInCrores: number): string {
  if (amountInCrores === undefined || amountInCrores === null || isNaN(amountInCrores)) {
    return "₹0 Cr";
  }
  // Trim trailing zeros if exact integer
  const formatted = Number.isInteger(amountInCrores)
    ? amountInCrores.toString()
    : amountInCrores.toFixed(1).replace(/\.0$/, "");
  return `₹${formatted} Cr`;
}

/**
 * Formats milliseconds/seconds to display time (e.g., "08s" or "0:14")
 */
export function formatTimeSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return s < 10 ? `0${s}` : `${s}`;
}

/**
 * Returns badge styling according to football player position
 */
export function getPositionColor(pos: string): { bg: string; text: string; border: string } {
  switch (pos.toUpperCase()) {
    case "GK":
      return {
        bg: "bg-amber-500/15",
        text: "text-amber-400",
        border: "border-amber-500/30",
      };
    case "DEF":
    case "CB":
    case "LB":
    case "RB":
      return {
        bg: "bg-blue-500/15",
        text: "text-blue-400",
        border: "border-blue-500/30",
      };
    case "MID":
    case "CM":
    case "CAM":
    case "CDM":
      return {
        bg: "bg-emerald-500/15",
        text: "text-emerald-400",
        border: "border-emerald-500/30",
      };
    case "ATT":
    case "ST":
    case "RW":
    case "LW":
    case "CF":
      return {
        bg: "bg-rose-500/15",
        text: "text-rose-400",
        border: "border-rose-500/30",
      };
    default:
      return {
        bg: "bg-slate-500/15",
        text: "text-slate-300",
        border: "border-slate-500/30",
      };
  }
}
