/**
 * app/admin/dev/observability-dim/page.tsx — dimensional-invariant render harness
 * for the observability timeline (spec §8 + G7).
 *
 * A DEV-ONLY render harness whose sole purpose is to feed the real-browser
 * Playwright spec `tests/e2e/observability-layout.spec.ts`. It mounts the real
 * observability components with DETERMINISTIC props (no DB read) so EVERY measured
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
 * app/admin/dev/page.tsx + source-link-dim. Like /admin/dev (and unlike
 * source-link-dim), it calls requireAdmin() at the same chokepoint so the
 * trust-domain auth-chain audit classifies it identically (chain: requireAdmin).
 *
 * Server Component; force-dynamic keeps the render deterministic (matches
 * /admin/dev's posture).
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { CRON_JOBS, CRON_RUN_SUMMARY } from "@/lib/cron/runSummary";
import type {
  AppEventRow,
  CronHealthRow,
  LoadAppEventsResult,
} from "@/lib/admin/observabilityTypes";
import { CronHealthHeader } from "@/components/admin/observability/CronHealthHeader";
import { EventFilters } from "@/components/admin/observability/EventFilters";
import { EventTimeline } from "@/components/admin/observability/EventTimeline";
import { AutoRefreshControl } from "@/components/admin/observability/AutoRefreshControl";

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

export default async function ObservabilityDimHarness() {
  // Same chokepoint as /admin/dev so the trust-domain auth-chain audit classifies
  // this harness route identically (chain: requireAdmin).
  await requireAdmin();
  return (
    <div className="flex flex-col gap-section-gap p-4" data-testid="observability-dim-harness">
      <AutoRefreshControl />
      <CronHealthHeader jobs={jobs} now={NOW} />
      {/* EventFilters uses useSearchParams → Suspense boundary (Next 16). */}
      <Suspense>
        <EventFilters filters={{ sinceHours: 24 }} />
      </Suspense>
      <EventTimeline result={RESULT} now={NOW} currentQuery="" />
    </div>
  );
}
