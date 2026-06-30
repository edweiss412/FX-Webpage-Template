// components/admin/observability/CronRunSummaryCard.tsx
import { KeyValue } from "@/components/atoms/KeyValue";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

function jobLabel(ev: AppEventRow): string {
  const jn = ev.context?.jobName;
  if (typeof jn === "string" && jn.length) return jn;
  return ev.source; // verbatim, even if not a known cron.* source
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const VALID_OUTCOMES = new Set(["ok", "partial", "infra", "threw"]);

export function CronRunSummaryCard({ event }: { event: AppEventRow }) {
  const ctx = event.context ?? {};
  // Validate against the known literal set (spec §6.2) — never render a raw/free-form value.
  const outcome = typeof ctx.outcome === "string" && VALID_OUTCOMES.has(ctx.outcome) ? ctx.outcome : "unknown";
  const durationMs = typeof ctx.durationMs === "number" && Number.isFinite(ctx.durationMs) ? ctx.durationMs : null;
  const counts = isPlainObject(ctx.counts)
    ? Object.entries(ctx.counts).filter(([, n]) => typeof n === "number")
    : [];
  return (
    <div className="rounded-md border border-border bg-surface-sunken p-tile-pad">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-text">{jobLabel(event)}</span>
        <span className="rounded-pill bg-surface px-2 py-0.5 text-xs text-text-subtle">{outcome}</span>
        {durationMs != null && <span data-testid="cron-summary-duration" className="text-xs text-text-faint tabular-nums">{durationMs} ms</span>}
      </div>
      {counts.length > 0 && (
        <dl data-testid="cron-summary-counts" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {counts.map(([k, n]) => <KeyValue key={k} label={k} value={String(n)} tabular />)}
        </dl>
      )}
    </div>
  );
}
