/**
 * app/admin/dev/telemetry-dim/page.tsx — dimensional-invariant render harness
 * for the telemetry timeline (spec §8 + G7).
 *
 * A DEV-ONLY render harness whose sole purpose is to feed the real-browser
 * Playwright spec `tests/e2e/telemetry-layout.spec.ts`. It mounts the real
 * telemetry components with DETERMINISTIC props (no DB read) so EVERY measured
 * control exists deterministically:
 *   - 9 cron-health cards (CRON_JOBS) so the equal-height `auto-rows-fr` grid
 *     invariant is measurable across a wrap row.
 *   - One CRON_RUN_SUMMARY event row + one row carrying a requestId + showSlug, so
 *     the EventRow no-overflow geometry + the request chip are present.
 *   - hasMore=true so the "Load older" control renders and is tap-target-measured.
 *
 * Dimensional invariants under test (spec §8 + G7): equal-height cron cards
 * (auto-rows-fr), EventRow content column does not overflow horizontally, and key
 * mobile tap targets are ≥44px (min-h-tap-min). jsdom is insufficient (this
 * project's Tailwind v4 does NOT default `.flex` to `align-items: stretch`,
 * AGENTS.md / DESIGN §7), so the spec reads getBoundingClientRect() against a real
 * layout engine.
 *
 * ── Build-time gating (mirrors /admin/dev + source-link-dim) ───────────────────
 * This route lives under `app/admin/dev/` and is gated build-time by
 * `scripts/with-admin-dev-flag.mjs`: when ADMIN_DEV_PANEL_ENABLED is NOT 'true' at
 * build time the wrapper renames this file aside (`.disabled-by-build-gate`)
 * BEFORE `next build`, so the production artifact literally does NOT contain the
 * route. This file is registered in that script's FILES array alongside
 * app/admin/dev/page.tsx + source-link-dim. Like /admin/dev, it calls
 * requireDeveloper() at the same chokepoint (developer-tier §6: swapped
 * requireAdmin → requireDeveloper) so the trust-domain auth-chain audit
 * classifies it identically (chain: requireDeveloper).
 *
 * Server Component; force-dynamic keeps the render deterministic (matches
 * /admin/dev's posture).
 */
import { Suspense } from "react";
import { requireDeveloper } from "@/lib/auth/requireDeveloper";
import { CRON_JOBS, CRON_RUN_SUMMARY } from "@/lib/cron/runSummary";
import type {
  AlertSummary,
  AppEventRow,
  CronHealthRow,
  LoadAppEventsResult,
  LoadCronHealthResult,
  LoadTelemetryStatsResult,
} from "@/lib/admin/telemetryTypes";
import { CronHealthHeader } from "@/components/admin/telemetry/CronHealthHeader";
import { CronHealthList } from "@/components/admin/telemetry/CronHealthList";
import { TelemetryOverviewStrip } from "@/components/admin/telemetry/TelemetryOverviewStrip";
import { EventFilters } from "@/components/admin/telemetry/EventFilters";
import { EventTimeline } from "@/components/admin/telemetry/EventTimeline";
import { AutoRefreshControl } from "@/components/admin/telemetry/AutoRefreshControl";

export const dynamic = "force-dynamic";

const NOW = new Date("2026-06-29T12:00:00.000Z");

const jobs: CronHealthRow[] = CRON_JOBS.map((j, i) => ({
  ...j,
  lastRunAt: i === 0 ? new Date(NOW.getTime() - 60_000).toISOString() : null,
  outcome: i === 0 ? "ok" : null,
  level: i === 0 ? "info" : null,
  counts: i === 0 ? { processed: 3 } : null,
}));

const mkRow = (id: string, over: Partial<AppEventRow> = {}): AppEventRow => ({
  id,
  occurredAt: "2026-06-29T11:00:00.000Z",
  level: "error",
  source: "auth",
  message: "x".repeat(300),
  code: null,
  requestId: null,
  showId: null,
  driveFileId: null,
  actorHash: null,
  context: {},
  showTitle: null,
  showSlug: null,
  ...over,
});

const events: AppEventRow[] = [
  mkRow("a", {
    requestId: "req-123",
    showId: "s1",
    showSlug: "rpas-central",
    showTitle: "RPAS",
    // A long, unbreakable source token so the e2e exercises EventRow metadata no-overflow (R6).
    source: "cron.notify.realtime.a-very-long-unbreakable-source-token-without-spaces-overflow",
  }),
  mkRow("b", {
    code: CRON_RUN_SUMMARY,
    source: "cron.sync",
    // not-subject:M5-D8 — dev-fixture row text (a CRON_RUN_SUMMARY message), not operator error UI.
    message: "cron sync run",
    context: { jobName: "sync", outcome: "ok", counts: { processed: 1 } },
  }),
];

// Extracted to a const (not an inline JSX-attribute literal) so the "ok" discriminant isn't
// misread by the no-raw-codes JSX scanner as a leaked shows.last_sync_status code.
const RESULT: LoadAppEventsResult = {
  kind: "ok",
  events,
  hasMore: true,
  nextCursor: { occurredAt: events[1]!.occurredAt, id: "b" },
};

// Deterministic console-strip props (no DB read) so the overview stat cards +
// sparkline are measurable by the real-browser layout spec.
const SUMMARY: AlertSummary = { kind: "degraded", total: 3, degraded: 1, notice: 2 };
const CRON_RESULT: LoadCronHealthResult = { kind: "ok", jobs };
const STATS: LoadTelemetryStatsResult = {
  kind: "ok",
  stats: {
    total: 128,
    errorCount: 4,
    warnCount: 7,
    infoCount: 117,
    // 24 hourly buckets with a mix so bars span the full [3,22] scale.
    buckets: [0, 1, 2, 0, 3, 5, 8, 4, 2, 1, 0, 6, 9, 12, 7, 3, 1, 0, 2, 4, 10, 14, 6, 2],
  },
};

export default async function TelemetryDimHarness() {
  // Same chokepoint as /admin/dev so the trust-domain auth-chain audit classifies
  // this harness route identically (chain: requireDeveloper).
  await requireDeveloper();
  return (
    <div className="flex flex-col gap-section-gap p-4" data-testid="telemetry-dim-harness">
      <AutoRefreshControl />
      {/* Console overview strip — 4 stat cards + sparkline (new console layout §7.2/§8). */}
      <TelemetryOverviewStrip alertSummary={SUMMARY} cron={CRON_RESULT} stats={STATS} now={NOW} />
      {/* Retained legacy grid — the existing equal-height cron-card assertion measures this. */}
      <CronHealthHeader jobs={jobs} now={NOW} />
      {/* Two-column console body mirroring the real page: hero log left, 340px sidebar right. */}
      <div
        data-testid="telemetry-console-grid"
        className="grid grid-cols-1 gap-section-gap xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start"
      >
        <div className="flex flex-col gap-tile-gap">
          {/* EventFilters uses useSearchParams → Suspense boundary (Next 16). */}
          <Suspense>
            <EventFilters filters={{ sinceHours: 24 }} />
          </Suspense>
          <EventTimeline result={RESULT} now={NOW} currentQuery="" />
        </div>
        <aside data-testid="telemetry-sidebar" className="flex flex-col gap-section-gap">
          <CronHealthList jobs={jobs} now={NOW} />
        </aside>
      </div>
    </div>
  );
}
