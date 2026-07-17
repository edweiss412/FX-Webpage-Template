/**
 * app/admin/needs-attention/page.tsx (mobile needs-attention Task 5 — spec §4.3)
 *
 * The full needs-attention page: every waiting item across all shows, capped
 * at PAGE_RENDER_CAP (100) with the honest "+N more" overflow note rendered by
 * NeedsAttentionInbox from exact head-counts. The loader constructs its own
 * server client (NO injected client — spec §4.3); a typed infra_error degrades
 * to fixed catalog-safe copy (invariant 5 — never the raw message).
 *
 * bell notification center §8: the global AlertBanner (and its `<div id="alerts">`
 * anchor) is RETIRED. Unresolved admin alerts now surface in the <NotifBell>
 * panel in the nav, so this page renders its header straight into the inbox list
 * with no banner slot.
 *
 * requireAdminIdentity() runs here as defense-in-depth (the admin layout also
 * gates) — registered in lib/audit/trustDomains.ts PROTECTED_ROUTES.
 */
import {
  acceptAllAction,
  acceptChangeAction,
  undoFromDashboardAction,
} from "@/app/admin/_actions/autoApplied";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import { RecentAutoAppliedStrip } from "@/components/admin/RecentAutoAppliedStrip";
import { loadNeedsAttention } from "@/lib/admin/loadNeedsAttention";
import { loadRecentAutoApplied, type RecentAutoApplied } from "@/lib/admin/loadRecentAutoApplied";
import { PAGE_RENDER_CAP } from "@/lib/admin/needsAttention";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { nowDate } from "@/lib/time/now";

export const dynamic = "force-dynamic";

export default async function NeedsAttentionPage() {
  await requireAdminIdentity(); // defensive page-level gate (layout also gates)
  const [result, recentAutoApplied]: [
    Awaited<ReturnType<typeof loadNeedsAttention>>,
    RecentAutoApplied,
  ] = await Promise.all([
    loadNeedsAttention({ cap: PAGE_RENDER_CAP }), // no injected client (spec §4.3)
    // publishedShowIds:[] is CORRECT here, not a stub: it feeds only the
    // roster_shift_counts RPC → rosterShiftByShow, which the dashboard's
    // shows-table badges consume — and this page has no shows table. The strip's
    // group list is a GLOBAL show_change_log read, unaffected by this arg, so the
    // page strip is group-parity with the dashboard. [] → the RPC (`where show_id
    // = any(p_show_ids)`) matches nothing, never errors.
    loadRecentAutoApplied({ publishedShowIds: [] }),
  ]);
  const now = await nowDate();
  return (
    <div data-testid="admin-needs-attention-page" className="flex w-full flex-col gap-section-gap">
      <AdminPageHeader
        title="Needs attention"
        sub="Everything waiting on you, across all shows."
        titleAppendSlot={
          <HoverHelp
            label="Help: Needs attention"
            testId="needs-attention-page-help"
            rootTestId="help-affordance--needs-attention-page--tooltip"
            learnMore={{ href: "/help/admin/review-queues#first-seen" }}
          >
            <p>
              Everything waiting on a decision from you: sheets we could not auto-apply and staged
              changes to review. Items leave this list as soon as you resolve them.
            </p>
          </HoverHelp>
        }
      />
      <section aria-label="Needs attention" className="flex w-full max-w-3xl flex-col gap-3">
        {"kind" in result ? (
          <p
            data-testid="needs-attention-page-degraded"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
          >
            We could not load this list right now. This is usually temporary. Refresh in a moment.
            If it keeps happening, contact the developer.
          </p>
        ) : (
          <NeedsAttentionInbox
            items={result.items}
            totalCount={result.totalCount}
            renderedCount={result.renderedCount}
            overflowCount={result.overflowCount}
            now={now}
          />
        )}
      </section>
      {/* Mobile parity (spec 2026-07-16-mobile-autoapplied-parity §D1): the strip
          is a SIBLING after the inbox section (separate concept — mirrors the
          desktop dashboard where it follows the inbox), so mobile admins get a
          count + Accept/Undo path. headingLevel={2} keeps the outline monotonic
          under the page <h1> (no h1→h4 skip). Renders null on empty groups. The
          max-w-3xl wrapper matches the inbox section's width cap so the strip
          cards align with the inbox cards on desktop (impeccable audit P2). */}
      <div className="w-full max-w-3xl">
        <RecentAutoAppliedStrip
          data={recentAutoApplied}
          actions={{ acceptChangeAction, acceptAllAction, undoFromDashboardAction }}
          headingLevel={2}
        />
      </div>
    </div>
  );
}
