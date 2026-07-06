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
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import { loadNeedsAttention } from "@/lib/admin/loadNeedsAttention";
import { PAGE_RENDER_CAP } from "@/lib/admin/needsAttention";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { nowDate } from "@/lib/time/now";

export const dynamic = "force-dynamic";

export default async function NeedsAttentionPage() {
  await requireAdminIdentity(); // defensive page-level gate (layout also gates)
  const result = await loadNeedsAttention({ cap: PAGE_RENDER_CAP }); // no injected client (spec §4.3)
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
    </div>
  );
}
