/**
 * app/admin/settings/admins/page.tsx (M9 C9 / M2-D1)
 *
 * Runtime-mutable admin allow-list UI per shape brief
 * `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-14-admin-allowlist.md`.
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
import { formatRelative } from "@/lib/time/relative";

import { AddAdminForm } from "./AddAdminForm";
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
                <RevokedRow key={row.email} row={row} />
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
}: {
  row: AdminEmailRow;
  isActor: boolean;
  isOnlyActiveAdmin: boolean;
}) {
  const isSeed = row.added_by === null;
  const meta = buildAdminRowMeta(row, isActor, isSeed);
  // Self-revoke + last-admin: client disables the button as a UX
  // preview; the Server Action remains the authority and refuses with
  // LAST_ADMIN_LOCKOUT_REFUSED if forged.
  const disableSelfLastRevoke = isActor && isOnlyActiveAdmin;
  return (
    <li
      data-testid="admin-allowlist-row"
      data-row-email={row.email}
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      <div className="min-w-0 flex-1">
        <p className="wrap-break-word text-base font-medium text-text-strong">{row.email}</p>
        <p className="mt-1 text-xs text-text-subtle">{meta}</p>
      </div>
      <RevokeRowButton email={row.email} disabled={disableSelfLastRevoke} />
    </li>
  );
}

function RevokedRow({ row }: { row: AdminEmailRow }) {
  const revokedRelative = row.revoked_at ? formatRelative(row.revoked_at) : "";
  return (
    <li
      data-testid="admin-allowlist-revoked-row"
      data-row-email={row.email}
      className="flex items-center justify-between text-sm"
    >
      <span className="text-text-subtle">{row.email}</span>
      <span className="text-xs text-text-faint">Revoked {revokedRelative}</span>
    </li>
  );
}

/**
 * Build the metadata line for an active admin row per brief §6.2.
 * Composition: ["You" if actor] · ["Seed admin" if seed | "Added <ago>"]
 *              · ['"<note>"' if note set]
 */
function buildAdminRowMeta(row: AdminEmailRow, isActor: boolean, isSeed: boolean): string {
  const pieces: string[] = [];
  if (isActor) pieces.push("You");
  if (isSeed) {
    pieces.push("Seed admin");
    pieces.push("Added at deploy");
  } else {
    const added = formatRelative(row.added_at);
    pieces.push(`Added ${added}`);
  }
  if (row.note && row.note.trim().length > 0) {
    pieces.push(`"${row.note.trim()}"`);
  }
  return pieces.join(" · ");
}
