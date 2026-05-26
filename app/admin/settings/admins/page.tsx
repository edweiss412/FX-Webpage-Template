/**
 * app/admin/settings/admins/page.tsx (M9 C9 / M2-D1)
 *
 * Runtime-mutable admin allow-list UI per shape brief
 * `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/shape-sessions/2026-05-14-admin-allowlist.md`.
 *
 * Server Component:
 *   - Reads `public.admin_emails` via `listAdminEmails()` (RLS-gated).
 *   - Splits rows into ACTIVE (revoked_at IS NULL) and REVOKED.
 *   - Renders header, ACTIVE list, AddAdminForm, REVOKED disclosure.
 *
 * The AdminRow + RevokedRow components are pure server-rendered (no
 * interactivity). The AddAdminForm + RevokeRowButton client islands
 * own the state machines (re-add prompt + two-tap confirm).
 *
 * Defense-in-depth: app/admin/layout.tsx already calls requireAdmin()
 * before this page renders. listAdminEmails() additionally gates via
 * the admin_only RLS policy on public.admin_emails (so even a layout
 * bypass would yield zero rows + a typed AdminEmailsInfraError if the
 * SELECT itself fails).
 */
import { listAdminEmails, type AdminEmailRow } from "@/lib/data/adminEmails";
import { canonicalize } from "@/lib/email/canonicalize";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { nowDate } from "@/lib/time/now";
import { formatRelative } from "@/lib/time/relative";

import { AddAdminForm } from "./AddAdminForm";
import { ReAddRowButton } from "./ReAddRowButton";
import { RevokeRowButton } from "./RevokeRowButton";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administrators · FXAV",
};

export default async function AdminsPage() {
  const identity = await requireAdminIdentity();
  const actorCanonicalEmail = canonicalize(identity.email) ?? "";
  const rows = await listAdminEmails();
  const active = rows.filter((r) => r.revoked_at === null);
  const revoked = rows.filter((r) => r.revoked_at !== null);
  // R2 finding (M11 Phase C): consume the request-scoped time utility so
  // RevokedRow + buildAddedLine receive a deterministic `now` rather than
  // letting formatRelative default to `new Date()` (helper defaults were
  // bypassing the C.4 grep guard).
  const now = await nowDate();

  // Last-admin-self predicate for the disabled-on-client revoke button.
  // The Server Action is the authority; this just reduces UI noise.
  const isOnlyActiveAdmin = active.length === 1;

  return (
    <main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">
      <header className="mb-section-gap">
        <h1 className="text-xl font-semibold text-text-strong">Administrators</h1>
        <p className="mt-1 text-sm text-text-subtle">
          People who can view and edit show data.
        </p>
      </header>

      <section data-testid="admin-allowlist-active-section" className="mb-section-gap">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          Active ({active.length})
        </p>
        {active.length === 0 ? (
          <p
            data-testid="admin-allowlist-empty-active"
            className="rounded-md border border-border bg-surface p-tile-pad text-sm text-text-subtle"
          >
            No active administrators.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((row) => (
              <AdminRow
                key={row.email}
                row={row}
                isActor={row.email === actorCanonicalEmail}
                isOnlyActiveAdmin={isOnlyActiveAdmin}
                now={now}
              />
            ))}
          </ul>
        )}
      </section>

      <section data-testid="admin-allowlist-add-section" className="mb-section-gap">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-subtle">
          Add admin
        </p>
        <AddAdminForm />
      </section>

      {revoked.length > 0 && (
        <section data-testid="admin-allowlist-revoked-section">
          <details className="rounded-md border border-border bg-surface">
            <summary className="cursor-pointer p-tile-pad text-xs font-semibold uppercase tracking-wide text-text-subtle">
              Revoked ({revoked.length})
            </summary>
            <ul className="flex flex-col gap-2 px-tile-pad pb-tile-pad">
              {revoked.map((row) => (
                <RevokedRow key={row.email} row={row} now={now} />
              ))}
            </ul>
          </details>
        </section>
      )}
    </main>
  );
}

function AdminRow({
  row,
  isActor,
  isOnlyActiveAdmin,
  now,
}: {
  row: AdminEmailRow;
  isActor: boolean;
  isOnlyActiveAdmin: boolean;
  now: Date;
}) {
  const isSeed = row.added_by === null;
  // Self-revoke + last-admin: client disables the button as a UX
  // preview; the Server Action remains the authority and refuses with
  // LAST_ADMIN_LOCKOUT_REFUSED if forged.
  const disableSelfLastRevoke = isActor && isOnlyActiveAdmin;
  const hasNote = Boolean(row.note && row.note.trim().length > 0);
  return (
    <li
      data-testid="admin-allowlist-row"
      data-row-email={row.email}
      className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* P2 fix: promote "You" to a small pill instead of a
              dot-separated chip on the meta-line; demote "Seed admin"
              to italic; surface note on its own line below. */}
          {isActor && (
            <span
              data-testid="admin-allowlist-you-badge"
              // Audit P2 fix: neutral high-contrast pill (text-text-strong
              // on surface-raised) instead of bg-accent text-accent-text
              // (4.07:1 — fails WCAG 1.4.3 for small text). "You" is
              // identification, not a CTA, so neutral chrome is right
              // and avoids competing with the bg-accent Revoke button or
              // the bg-warning-bg lockout / re-add prompt.
              className="inline-flex items-center rounded border border-border bg-surface-raised px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-strong"
            >
              You
            </span>
          )}
          <p className="wrap-break-word text-base font-medium text-text-strong">
            {row.email}
          </p>
        </div>
        <p className="mt-1 text-xs text-text-subtle">{buildAddedLine(row, isSeed, now)}</p>
        {hasNote && (
          <p className="mt-1 text-xs italic text-text-subtle">
            &ldquo;{row.note?.trim()}&rdquo;
          </p>
        )}
      </div>
      <RevokeRowButton email={row.email} disabled={disableSelfLastRevoke} />
    </li>
  );
}

function RevokedRow({ row, now }: { row: AdminEmailRow; now: Date }) {
  const revokedRelative = row.revoked_at ? formatRelative(row.revoked_at, now) : "";
  return (
    <li
      data-testid="admin-allowlist-revoked-row"
      data-row-email={row.email}
      className="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <span className="text-text-subtle">{row.email}</span>
      <span className="flex items-center gap-3 text-xs text-text-faint">
        <span>Revoked {revokedRelative}</span>
        {/* P2 fix: one-tap re-add (was 3 steps via Add form prompt). */}
        <ReAddRowButton email={row.email} />
      </span>
    </li>
  );
}

/**
 * Build the "Added <when>" line for an active admin row per brief §6.2,
 * post-critique. The note + "You" badge are now their own elements
 * (see AdminRow) so this returns just the seed-vs-actor-vs-relative
 * line with "Seed admin" italicized inline.
 */
function buildAddedLine(row: AdminEmailRow, isSeed: boolean, now: Date) {
  if (isSeed) {
    return (
      <>
        <em>Seed admin</em>
        <span aria-hidden="true"> · </span>Added at deploy
      </>
    );
  }
  return <>Added {formatRelative(row.added_at, now)}</>;
}
