"use client";
import React, { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { RetentionGroup } from "@/types/backend";

/** Chip label to backend group id. The backend owns which positions belong to each group. */
export const RETENTION_FILTER_CHIPS: { label: string; group: RetentionGroup; title: string }[] = [
  { label: "All", group: "ALL", title: "All positions" },
  { label: "GK", group: "GK", title: "Goalkeepers" },
  { label: "CB", group: "CB", title: "Centre-backs" },
  { label: "Fullbacks", group: "FB", title: "LB, RB, LWB, RWB" },
  { label: "CDM", group: "CDM", title: "Defensive midfielders" },
  { label: "CM", group: "CMID", title: "Central midfielders" },
  { label: "CAM", group: "CAM", title: "Attacking midfielders" },
  { label: "LM / RM", group: "WM", title: "Wide midfielders" },
  { label: "ST / CF", group: "ST", title: "Strikers and centre-forwards" },
  { label: "LW / RW", group: "W", title: "LW, RW, LF, RF" },
];
export const SEARCH_DEBOUNCE_MS = 200;

export interface RetentionFiltersProps {
  group: RetentionGroup;
  onGroupChange: (group: RetentionGroup) => void;
  /** Called with the trimmed search text after a short pause in typing. */
  onSearchChange: (search: string) => void;
}

export function RetentionFilters({ group, onGroupChange, onSearchChange }: RetentionFiltersProps) {
  const [value, setValue] = useState("");
  const callback = useRef(onSearchChange);
  useEffect(() => { callback.current = onSearchChange; }, [onSearchChange]);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const timer = setTimeout(() => callback.current(value.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        aria-label="Search players"
        placeholder="Search by name, club, nationality, player ID or position"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
      />
      <div role="group" aria-label="Filter by position" className="flex flex-wrap gap-1.5">
        {RETENTION_FILTER_CHIPS.map((chip) => (
          <button
            key={chip.group}
            type="button"
            aria-pressed={group === chip.group}
            title={chip.title}
            onClick={() => onGroupChange(chip.group)}
            className={cn(
              "cursor-pointer rounded-md border px-2.5 py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]",
              group === chip.group
                ? "border-[#00ff87] bg-[#00ff87] text-[#08090d]"
                : "border-[#242c3d] bg-[#151a24] text-[#cbd5e1] hover:border-[#37435e] hover:bg-[#1e2433]"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
