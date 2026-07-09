import postgres from "postgres";
import { STRIP_KINDS } from "@/lib/admin/loadRecentAutoApplied";
import {
  summarizeAutoFixes,
  summarizeDataGaps,
  isQualityRegression,
  AUTO_FIX_CLASSES,
  GAP_CLASSES,
  type AutoFixSummary,
  type DataGapsSummary,
} from "@/lib/parser/dataGaps";
import { getMonitorDigestWatermark } from "@/lib/notify/monitorWatermark";
import type { DigestBuilderSql } from "@/lib/notify/digest";

/**
 * Flow 6.2 §3-§4 — the "Applied automatically since your last digest" model.
 * Reads the watermark (§4.2), computes the window (§4.3), and builds three signals:
 *   1. auto-applied roster/field changes (show_change_log, Flow-4 filters)
 *   2. autocorrects (sync_log ⋈ shows, status='applied')  [Task 6]
 *   3. sub-threshold drift (sync_log ⋈ shows)             [Task 7]
 * Uses the postgres.js `sql` pattern of buildDigestModel (lib/notify/digest.ts).
 * Registered in tests/notify/_metaInfraContract.test.ts (invariant 9).
 */
export const MONITOR_FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const MONITOR_AUTO_APPLY_KINDS = STRIP_KINDS;

export type MonitorShowGroup = { showTitle: string | null; slug: string | null; items: string[] };
export type MonitorDriftEntry = {
  showTitle: string | null;
  slug: string | null;
  classes: { label: string; prior: number; curr: number }[];
};
export type MonitorDigestModel = {
  windowStart: string;
  autoApplied: MonitorShowGroup[];
  autofix: AutoFixSummary;
  drift: MonitorDriftEntry[];
};
export type MonitorDigestResult =
  | { kind: "ok"; model: MonitorDigestModel }
  | { kind: "empty" }
  | { kind: "infra_error" };

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("monitor digest builder requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

type AutoApplyRow = {
  show_id: string;
  slug: string | null;
  title: string | null;
  summary: string;
  occurred_at: string;
};

export function groupAutoApplied(rows: AutoApplyRow[]): MonitorShowGroup[] {
  const groups = new Map<string, MonitorShowGroup>();
  for (const r of rows) {
    const g = groups.get(r.show_id) ?? { showTitle: r.title, slug: r.slug, items: [] };
    g.items.push(r.summary);
    groups.set(r.show_id, g);
  }
  return [...groups.values()];
}

type WarningsRow = { parse_warnings: unknown[] };

/** Sum summarizeAutoFixes over every applied row's parse_warnings (§3 signal 2). */
export function accumulateAutoFixes(rows: WarningsRow[]): AutoFixSummary {
  const classes = summarizeAutoFixes([]).classes;
  let total = 0;
  for (const row of rows) {
    const s = summarizeAutoFixes(row.parse_warnings as never);
    total += s.total;
    for (const c of AUTO_FIX_CLASSES) classes[c.code] += s.classes[c.code];
  }
  return { total, classes };
}

type DriftRow = {
  drive_file_id: string;
  slug: string | null;
  title: string | null;
  phase: "baseline" | "current";
  parse_warnings: unknown[];
};

/**
 * Sub-threshold drift (§3.1). Pairs each show's latest baseline (occurred_at <=
 * windowStart) and current (> windowStart) applied rows; reports iff the summaries
 * differ on a non-gateExempt GapCode AND isQualityRegression is false (a true
 * regression already fired RESYNC_QUALITY_REGRESSED). Shows missing a baseline or
 * current row are skipped (no synthetic zero baseline).
 */
export function computeDrift(rows: DriftRow[]): MonitorDriftEntry[] {
  const byShow = new Map<
    string,
    {
      slug: string | null;
      title: string | null;
      baseline?: DataGapsSummary;
      current?: DataGapsSummary;
    }
  >();
  for (const r of rows) {
    const e = byShow.get(r.drive_file_id) ?? { slug: r.slug, title: r.title };
    const summary = summarizeDataGaps(r.parse_warnings as never);
    if (r.phase === "baseline") e.baseline = summary;
    else e.current = summary;
    byShow.set(r.drive_file_id, e);
  }
  const out: MonitorDriftEntry[] = [];
  for (const e of byShow.values()) {
    if (!e.baseline || !e.current) continue; // §3.1 no-baseline / no-current guard
    if (isQualityRegression(e.baseline, e.current)) continue; // already RESYNC_QUALITY_REGRESSED
    const classes: MonitorDriftEntry["classes"] = [];
    for (const g of GAP_CLASSES) {
      if ((g as { gateExempt?: boolean }).gateExempt) continue; // §3.1 gateExempt exclusion
      const prior = e.baseline.classes[g.code];
      const curr = e.current.classes[g.code];
      if (prior !== curr) classes.push({ label: g.label, prior, curr });
    }
    if (classes.length > 0) out.push({ showTitle: e.title, slug: e.slug, classes });
  }
  return out;
}

/**
 * "New shows this period" (spec §3.2). Complement of computeDrift: for each show with a
 * current applied row but NO baseline row (first-seen inside the window), lists the
 * non-gateExempt GAP_CLASSES present (count > 0) in that current sync. Labels only (inv 5).
 * newShowGaps ∩ drift = ∅ by construction (drift needs a baseline; this needs none).
 */
export function computeNewShowGaps(rows: DriftRow[]): MonitorShowGroup[] {
  const byShow = new Map<
    string,
    {
      slug: string | null;
      title: string | null;
      baseline?: DataGapsSummary;
      current?: DataGapsSummary;
    }
  >();
  for (const r of rows) {
    const e = byShow.get(r.drive_file_id) ?? { slug: r.slug, title: r.title };
    const summary = summarizeDataGaps(r.parse_warnings as never);
    if (r.phase === "baseline") e.baseline = summary;
    else e.current = summary;
    byShow.set(r.drive_file_id, e);
  }
  const out: MonitorShowGroup[] = [];
  for (const e of byShow.values()) {
    if (e.baseline || !e.current) continue; // first-seen only: has current, no baseline
    const items: string[] = [];
    for (const g of GAP_CLASSES) {
      if ((g as { gateExempt?: boolean }).gateExempt) continue; // parity with drift (spec D1)
      if (e.current.classes[g.code] > 0) items.push(g.label);
    }
    if (items.length > 0) out.push({ showTitle: e.title, slug: e.slug, items });
  }
  return out;
}

export async function buildMonitorDigestModel(
  now: Date,
  deps: { sql?: DigestBuilderSql; getWatermark?: typeof getMonitorDigestWatermark } = {},
): Promise<MonitorDigestResult> {
  const getWatermark = deps.getWatermark ?? getMonitorDigestWatermark;
  const wm = await getWatermark();
  if (wm.kind === "infra_error") return { kind: "infra_error" };
  const windowStart = wm.watermark ?? new Date(now.getTime() - MONITOR_FIRST_RUN_LOOKBACK_MS);
  const windowIso = windowStart.toISOString();

  const sql =
    deps.sql ??
    (postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false }) as DigestBuilderSql);
  const ownsConnection = !deps.sql;

  try {
    const autoRows = await sql<AutoApplyRow>`
      select scl.show_id, s.slug, s.title, scl.summary, scl.occurred_at
        from public.show_change_log scl
        join public.shows s on s.id = scl.show_id
       where scl.source = 'auto_apply'
         and scl.status = 'applied'
         and scl.acknowledged_at is null
         and scl.change_kind = any(${[...MONITOR_AUTO_APPLY_KINDS]}::text[])
         and scl.occurred_at > ${windowIso}
       order by scl.occurred_at desc
    `;
    const autoApplied = groupAutoApplied(autoRows);

    // Signal 2 — autocorrects over applied sync_log rows of published shows (§3).
    const autofixRows = await sql<WarningsRow>`
      select sl.parse_warnings
        from public.sync_log sl
        join public.shows s on s.drive_file_id = sl.drive_file_id
       where s.published = true
         and sl.status = 'applied'
         and sl.occurred_at > ${windowIso}
    `;
    const autofix = accumulateAutoFixes(autofixRows);

    // Signal 3 — sub-threshold drift across applied sync_log rows of published shows (§3.1).
    // Per show + phase, the latest row (row_number window) is the baseline/current.
    const driftRows = await sql<DriftRow>`
      with applied as (
        select sl.drive_file_id, s.slug, s.title, sl.parse_warnings, sl.occurred_at,
               case when sl.occurred_at <= ${windowIso} then 'baseline' else 'current' end as phase
          from public.sync_log sl
          join public.shows s on s.drive_file_id = sl.drive_file_id
         where s.published = true and sl.status = 'applied'
      ),
      ranked as (
        select applied.*,
               row_number() over (partition by drive_file_id, phase order by occurred_at desc) as rn
          from applied
      )
      select drive_file_id, slug, title, phase, parse_warnings
        from ranked
       where rn = 1
    `;
    const drift = computeDrift(driftRows);

    if (autoApplied.length === 0 && autofix.total === 0 && drift.length === 0) {
      return { kind: "empty" };
    }
    return { kind: "ok", model: { windowStart: windowIso, autoApplied, autofix, drift } };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) await sql.end?.({ timeout: 5 });
  }
}
