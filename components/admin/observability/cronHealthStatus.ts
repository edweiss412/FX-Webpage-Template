// components/admin/observability/cronHealthStatus.ts
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";
import { formatRelative } from "@/lib/admin/showDisplay";

export type CronStatusVisual = { status: "live" | "positive" | "review" | "warn" | "idle"; label: string };

export function effectiveCronStatus(row: CronHealthRow, now: Date): CronStatusVisual {
  if (row.lastRunAt == null) return { status: "idle", label: "No run seen" };
  const rel = formatRelative(row.lastRunAt, now);
  const ageMs = now.getTime() - new Date(row.lastRunAt).getTime();
  if (ageMs > row.staleAfterMs) return { status: "warn", label: `Stale · last run ${rel}` };
  switch (row.outcome) {
    case "ok": return { status: "positive", label: `OK · ${rel}` };
    case "partial": return { status: "review", label: `Issues · ${rel}` };
    case "infra":
    case "threw": return { status: "warn", label: `Failed · ${rel}` };
    default: { // malformed: row present but no parseable outcome → fall back to level
      const status = row.level === "error" ? "warn" : row.level === "warn" ? "review" : "idle";
      return { status, label: `Ran · ${rel}` };
    }
  }
}
