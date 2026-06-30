"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppEventFilters } from "@/lib/admin/observabilityTypes";

const BASE = "/admin/observability";

// Controlled text filter: local state mirrors the committed filter value but is NOT reset
// by an auto-refresh re-render (the `committed` dep is unchanged), so focus + in-progress
// keystrokes survive (spec §7 compound). An external change (Clear / another filter) changes
// `committed` → the effect re-syncs the displayed value (no stale defaults).
function FilterTextInput({ name, committed, placeholder, onCommit }: {
  name: string; committed: string; placeholder: string; onCommit: (v: string | null) => void;
}) {
  const [value, setValue] = useState(committed);
  useEffect(() => { setValue(committed); }, [committed]);
  return (
    <input
      type="text" data-testid={`filter-${name}`} placeholder={placeholder} value={value}
      className="min-h-tap-min rounded border border-border bg-surface px-2"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") onCommit(value || null); }}
    />
  );
}

export function buildFilterHref(current: URLSearchParams, patch: Record<string, string | null>): string {
  const next = new URLSearchParams(current);
  next.delete("cursorAt"); // every filter change returns to page 1
  next.delete("cursorId");
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function EventFilters({ filters }: { filters: AppEventFilters }) {
  const router = useRouter();
  const sp = useSearchParams();
  const go = (patch: Record<string, string | null>) => router.push(buildFilterHref(new URLSearchParams(sp.toString()), patch));

  if (filters.requestId) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-pill bg-surface-sunken px-2 py-0.5">Showing one request</span>
        <button type="button" className="inline-flex min-h-tap-min items-center underline" onClick={() => router.push(BASE)}>Clear</button>
      </div>
    );
  }
  const levels = new Set(filters.levels ?? []);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {(["info", "warn", "error"] as const).map((lvl) => (
        <button
          key={lvl} type="button"
          data-testid={`filter-level-${lvl}`}
          aria-pressed={levels.has(lvl)}
          className={`inline-flex min-h-tap-min items-center rounded-pill px-3 ${levels.has(lvl) ? "bg-accent text-accent-text" : "bg-surface-sunken text-text-subtle"}`}
          onClick={() => {
            const next = new Set(levels); next.has(lvl) ? next.delete(lvl) : next.add(lvl);
            go({ level: next.size ? [...next].join(",") : null });
          }}
        >{lvl}</button>
      ))}
      <select
        data-testid="filter-since"
        className="min-h-tap-min rounded border border-border bg-surface px-2"
        value={filters.sinceHours === 1 ? "1h" : filters.sinceHours === 168 ? "7d" : filters.sinceHours === null ? "all" : "24h"}
        onChange={(e) => go({ since: e.target.value })}
      >
        <option value="1h">Last hour</option>
        <option value="24h">Last 24h</option>
        <option value="7d">Last 7 days</option>
        <option value="all">All</option>
      </select>
      {(["source", "code", "showId", "requestId"] as const).map((key) => (
        <FilterTextInput
          key={key} name={key}
          committed={(filters[key] as string | undefined) ?? ""}
          placeholder={key === "showId" ? "show id…" : key === "requestId" ? "request id…" : `${key}…`}
          onCommit={(v) => go({ [key]: v })}
        />
      ))}
      <FilterTextInput name="q" committed={filters.q ?? ""} placeholder="Search message…" onCommit={(v) => go({ q: v })} />
      <button type="button" className="inline-flex min-h-tap-min items-center underline" onClick={() => router.push(BASE)}>Clear filters</button>
    </div>
  );
}
