/**
 * app/admin/unpublished/page.tsx (Task E1 — spec §5)
 *
 * The Held shows view: every show that exists but was never published — the
 * destination for a clean sheet left unchecked during onboarding setup. A
 * SEPARATE top-nav route (not a third dashboard segment) so it never drifts the
 * active/archived counts (spec §5, the M12 numeric-sweep class).
 *
 * Admin-gated by app/admin/layout.tsx; requireAdminIdentity() here is
 * defense-in-depth (same idiom as the needs-attention page). The loader
 * (lib/admin/loadHeldShows.ts) returns a typed infra_error that degrades to
 * fixed catalog-safe copy (invariant 5 — never the raw message).
 *
 * Publish flows ONLY through the existing publish_show RPC (PublishShowButton +
 * publishShowAction.bind(null, slug)) — never a direct shows.update (invariant:
 * single advisory-lock holder). The button surfaces the existing
 * PUBLISH_BLOCKED_PENDING_REVIEW refusal + Re-sync affordance if a show is
 * blocked.
 */
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { ShowsTable } from "@/components/admin/ShowsTable";
import { PublishShowButton } from "@/components/admin/PublishShowButton";
import { publishShowAction } from "@/app/admin/show/[slug]/_actions/publish";
import { loadHeldShows } from "@/lib/admin/loadHeldShows";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

export default async function UnpublishedPage() {
  await requireAdminIdentity(); // defensive page-level gate (layout also gates)
  const result = await loadHeldShows();

  return (
    <div data-testid="admin-unpublished-page" className="flex w-full flex-col gap-section-gap">
      <AdminPageHeader
        title="Unpublished"
        sub="Shows you created but haven’t published yet."
        titleAppendSlot={
          <HoverHelp
            label="Help: Unpublished"
            testId="unpublished-page-help"
            rootTestId="help-affordance--unpublished-page--tooltip"
          >
            <p>
              Sheets you leave unchecked during setup land here as held shows: created, syncing, but
              not yet visible to crew. Publish one to make it live and issue a crew link.
            </p>
          </HoverHelp>
        }
      />

      <section aria-label="Held shows" className="flex w-full max-w-4xl flex-col gap-3">
        {result.kind === "infra_error" ? (
          <p
            data-testid="admin-unpublished-degraded"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
          >
            We could not load this list right now. This is usually temporary. Refresh in a moment.
            If it keeps happening, contact the developer.
          </p>
        ) : result.rows.length === 0 ? (
          <div
            data-testid="admin-unpublished-empty"
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
          >
            <p className="font-semibold text-text-strong">No unpublished shows.</p>
            <p>Sheets you leave unchecked during setup will appear here.</p>
          </div>
        ) : (
          <ShowsTable
            rows={result.rows}
            now={result.now}
            activeCount={result.rows.length}
            overflowCount={0}
            title="Held shows"
            rowAction={(row) => (
              <PublishShowButton
                publishAction={publishShowAction.bind(null, row.slug)}
                slug={row.slug}
              />
            )}
          />
        )}
      </section>
    </div>
  );
}
