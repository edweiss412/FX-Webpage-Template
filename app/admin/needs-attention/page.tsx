/**
 * app/admin/needs-attention/page.tsx (mobile needs-attention Task 5 — spec §4.3)
 *
 * The full needs-attention page: every waiting item across all shows, capped
 * at PAGE_RENDER_CAP (100) with the honest "+N more" overflow note rendered by
 * NeedsAttentionInbox from exact head-counts. The loader constructs its own
 * server client (NO injected client — spec §4.3); a typed infra_error degrades
 * to fixed catalog-safe copy (invariant 5 — never the raw message).
 *
 * Banner placement contract (M12.3, amended by needs-attention spec D-5): the
 * global AlertBanner mounts on the dashboard + THIS page only. The
 * `<div id="alerts">` wrapper mirrors the dashboard's queue-chip scroll-target
 * idiom; AlertBanner is async + self-fetching, rendering null when clean.
 *
 * requireAdminIdentity() runs here as defense-in-depth (the admin layout also
 * gates) — registered in lib/audit/trustDomains.ts PROTECTED_ROUTES.
 */
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { AlertBanner } from "@/components/admin/AlertBanner";
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
      <AdminPageHeader title="Needs attention" sub="Everything waiting on you, across all shows." />
      {/* Banner placement contract: dashboard + THIS page only (spec D-5 amendment). */}
      {/* empty:hidden collapses the slot (and its flex gap) in the common
          no-alerts state - AlertBanner renders null, leaving the div empty
          (impeccable critique finding 1). */}
      <div id="alerts" className="empty:hidden">
        <AlertBanner />
      </div>
      <section aria-label="Needs attention" className="flex w-full max-w-3xl flex-col gap-3">
        {"kind" in result ? (
          <p
            data-testid="needs-attention-page-degraded"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
          >
            The admin database query failed. Refresh in a moment. If this keeps happening, contact
            the developer.
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
