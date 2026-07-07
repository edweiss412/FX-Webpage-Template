"use client";
// components/admin/telemetry/ActiveFilterChips.tsx
//
// The removable chip row under the filter toolbar: one chip per active filter,
// each with an X to drop that key (level chips drop one level from the csv; the
// since chip resets to the default 24h). Shares buildFilterHref with
// EventFilters so removal semantics (cursor reset, key deletion) match exactly.
import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppEventFilters } from "@/lib/admin/telemetryTypes";
import { BASE, buildFilterHref } from "@/lib/admin/telemetryFilterHref";

type Chip = { key: string; label: string; patch: Record<string, string | null> };

function short(v: string): string {
  return v.length > 8 ? v.slice(0, 8) : v;
}

function buildChips(filters: AppEventFilters): Chip[] {
  const chips: Chip[] = [];
  const levels = filters.levels ?? [];
  for (const lvl of levels) {
    const remaining = levels.filter((l) => l !== lvl);
    chips.push({
      key: `level-${lvl}`,
      label: lvl,
      patch: { level: remaining.length ? remaining.join(",") : null },
    });
  }
  if (filters.source) chips.push({ key: "source", label: `source: ${filters.source}`, patch: { source: null } });
  if (filters.code) chips.push({ key: "code", label: `code: ${filters.code}`, patch: { code: null } });
  if (filters.showId)
    chips.push({ key: "showId", label: `show: ${short(filters.showId)}`, patch: { showId: null } });
  if (filters.requestId)
    chips.push({
      key: "requestId",
      label: `request: ${short(filters.requestId)}`,
      patch: { requestId: null },
    });
  if (filters.q) chips.push({ key: "q", label: `"${filters.q}"`, patch: { q: null } });
  if (filters.sinceHours !== undefined && filters.sinceHours !== 24) {
    const label =
      filters.sinceHours === 1
        ? "Last hour"
        : filters.sinceHours === 168
          ? "Last 7 days"
          : "All time";
    chips.push({ key: "since", label, patch: { since: null } });
  }
  return chips;
}

export function ActiveFilterChips({ filters }: { filters: AppEventFilters }) {
  const router = useRouter();
  const sp = useSearchParams();
  const chips = buildChips(filters);
  if (chips.length === 0) return null;

  const remove = (patch: Record<string, string | null>) =>
    router.push(buildFilterHref(new URLSearchParams(sp.toString()), patch));

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="active-filter-chips">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken py-0.5 pl-2.5 pr-1.5 text-xs text-text"
        >
          {chip.label}
          <button
            type="button"
            data-testid={`chip-remove-${chip.key}`}
            aria-label={`Remove ${chip.label} filter`}
            className="inline-flex min-h-tap-min items-center justify-center rounded-full text-text-subtle hover:text-text"
            onClick={() => remove(chip.patch)}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        data-testid="clear-filters"
        className="inline-flex min-h-tap-min items-center px-1.5 text-xs text-text-subtle underline hover:text-text"
        onClick={() => router.push(BASE)}
      >
        Clear filters
      </button>
    </div>
  );
}
