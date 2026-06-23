/**
 * app/admin/ignored-sheets/page.tsx (Task E2 — spec §6.3)
 *
 * The Ignored sheets view: durably-ignored sheets (LIVE deferred_ingestions
 * rows, wizard_session_id IS NULL, deferred_kind='permanent_ignore'). Each row
 * shows the sheet NAME (drive_file_name, A2; fallback to the drive id), when it
 * was ignored, and by whom, plus a per-row Un-ignore that re-surfaces it on the
 * next scan.
 *
 * Admin-gated by app/admin/layout.tsx; requireAdminIdentity() here is
 * defense-in-depth. The loader (lib/admin/loadIgnoredSheets.ts) returns a typed
 * infra_error that degrades to fixed catalog-safe copy (invariant 5).
 */
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { UnignoreButton } from "@/components/admin/UnignoreButton";
import { loadIgnoredSheets } from "@/lib/admin/loadIgnoredSheets";
import { formatRelative } from "@/lib/admin/showDisplay";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { nowDate } from "@/lib/time/now";

export const dynamic = "force-dynamic";

export default async function IgnoredSheetsPage() {
  await requireAdminIdentity(); // defensive page-level gate (layout also gates)
  const result = await loadIgnoredSheets();
  const now = await nowDate();

  return (
    <div data-testid="admin-ignored-sheets-page" className="flex w-full flex-col gap-section-gap">
      <AdminPageHeader
        title="Ignored sheets"
        sub="Sheets you’ve told the sync to skip."
        titleAppendSlot={
          <HoverHelp
            label="Help: Ignored sheets"
            testId="ignored-sheets-page-help"
            rootTestId="help-affordance--ignored-sheets-page--tooltip"
          >
            <p>
              Sheets you ignored during setup or review. The sync skips them entirely. Un-ignore one
              to let it back in on the next scan.
            </p>
          </HoverHelp>
        }
      />

      <section aria-label="Ignored sheets" className="flex w-full max-w-4xl flex-col gap-3">
        {result.kind === "infra_error" ? (
          <p
            data-testid="admin-ignored-sheets-degraded"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
          >
            We could not load this list right now. This is usually temporary. Refresh in a moment. If
            it keeps happening, contact the developer.
          </p>
        ) : result.rows.length === 0 ? (
          <div
            data-testid="admin-ignored-sheets-empty"
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-4 text-base text-text-subtle"
          >
            <p className="font-semibold text-text-strong">No ignored sheets.</p>
            <p>Sheets you ignore during setup or review will appear here.</p>
          </div>
        ) : (
          <ul
            data-testid="ignored-sheets-list"
            className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface"
          >
            {result.rows.map((row) => {
              const name = row.driveFileName ?? row.driveFileId;
              return (
                <li
                  key={row.driveFileId}
                  data-testid={`ignored-sheet-row-${row.driveFileId}`}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                      data-testid={`ignored-sheet-name-${row.driveFileId}`}
                      className="min-w-0 wrap-break-word text-sm font-semibold text-text-strong"
                    >
                      {name}
                    </span>
                    <span className="text-sm text-text-subtle">
                      Ignored {formatRelative(row.deferredAt, now)}
                      {row.deferredByEmail ? ` by ${row.deferredByEmail}` : null}
                    </span>
                  </div>
                  <div className="shrink-0">
                    <UnignoreButton driveFileId={row.driveFileId} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
