// M12.2 Phase B1 Task 6.2 — AdministratorsSection (spec §3).
//
// Presentational SERVER component, shared by the /admin/settings/admins deep
// link and the embedded /admin/settings body. It receives the typed
// EmbeddedAdminEmailsResult (the page calls fetchEmbeddedAdminEmails() and
// passes it down) plus the actor's canonicalized email and a deterministic
// `now`.
//
// Load-bearing contracts:
//   - On result.kind === "infra_error" it renders the in-section cataloged
//     ADMIN_EMAIL_LIST_FAILED copy (invariant 5, via getRequiredDougFacing) in
//     a role="alert" region with a retry-by-refresh hint — it does NOT throw.
//     The throw path (route/session faults) is owned by admins/error.tsx.
//   - Self-revoke policy: Revoke renders on the actor's own row, disabled ONLY
//     when isOnlyActiveAdmin && isActor. The Server Action remains the
//     authority; the disabled button is a UX preview.
//   - No email-delivery copy anywhere — that affordance arrives in Phase B3.
//
// Tokens only (no inline hex/px). The middot " · " is U+00B7 (NOT an em dash).

import type { AdminEmailRow } from "@/lib/data/adminEmails";
import type { EmbeddedAdminEmailsResult } from "@/lib/admin/embeddedAdminEmails";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { formatRelative } from "@/lib/time/relative";

import { AddAdminForm } from "@/app/admin/settings/admins/AddAdminForm";
import { ReAddRowButton } from "@/app/admin/settings/admins/ReAddRowButton";
import { RevokeRowButton } from "@/app/admin/settings/admins/RevokeRowButton";

export function AdministratorsSection({
  result,
  actorCanonicalEmail,
  now,
}: {
  result: EmbeddedAdminEmailsResult;
  actorCanonicalEmail: string;
  now: Date;
}) {
  if (result.kind === "infra_error") {
    return (
      <section
        data-testid="admin-allowlist-error"
        role="alert"
        aria-labelledby="admin-allowlist-error-heading"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <h3
          id="admin-allowlist-error-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Administrators
        </h3>
        <p className="max-w-prose text-sm text-text-strong">
          {getRequiredDougFacing("ADMIN_EMAIL_LIST_FAILED")}
        </p>
        <p className="max-w-prose text-sm text-text-subtle">
          Refresh the page to try again.
        </p>
      </section>
    );
  }

  const rows = result.rows;
  const active = rows.filter((r) => r.revoked_at === null);
  const revoked = rows.filter((r) => r.revoked_at !== null);
  // Last-admin-self predicate for the disabled-on-client revoke button.
  // The Server Action is the authority; this just reduces UI noise.
  const isOnlyActiveAdmin = active.length === 1;

  return (
    <section
      data-testid="admin-settings-admins-section"
      aria-labelledby="admin-settings-admins-heading"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id="admin-settings-admins-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Administrators ({active.length})
        </h3>
        <a
          href="#admin-settings-add-admin"
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-base font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Add admin
        </a>
      </header>

      <div data-testid="admin-active-list">
        {active.length === 0 ? (
          <p
            data-testid="admin-allowlist-empty-active"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
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
      </div>

      <div id="admin-settings-add-admin" className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
          Add admin
        </p>
        <AddAdminForm />
      </div>

      {revoked.length > 0 && (
        <details data-testid="admin-revoked-list" className="rounded-md border border-border bg-surface-sunken">
          <summary className="cursor-pointer p-tile-pad text-xs font-semibold uppercase tracking-wide text-text-subtle">
            Revoked ({revoked.length})
          </summary>
          <ul className="flex flex-col gap-2 px-tile-pad pb-tile-pad">
            {revoked.map((row) => (
              <RevokedRow key={row.email} row={row} now={now} />
            ))}
          </ul>
        </details>
      )}
    </section>
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
  // Self-revoke + last-admin: client disables the button as a UX preview; the
  // Server Action remains the authority and refuses with LAST_ADMIN_LOCKOUT_REFUSED.
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
          {isActor && (
            <span
              data-testid="admin-allowlist-you-badge"
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
        <ReAddRowButton email={row.email} />
      </span>
    </li>
  );
}

/**
 * Build the "Added <when>" line for an active admin row. The note + "You" badge
 * are their own elements (see AdminRow) so this returns just the
 * seed-vs-actor-vs-relative line with "Seed admin" italicized inline.
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
