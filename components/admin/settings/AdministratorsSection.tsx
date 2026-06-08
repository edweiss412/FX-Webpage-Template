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
//   - Self-revoke policy: Revoke renders on the actor's own row but is ALWAYS
//     disabled (an admin can never revoke their own access, regardless of how
//     many other admins exist). The Server Action remains the authority; the
//     disabled button is a UX preview.
//   - No email-delivery copy anywhere — that affordance arrives in Phase B3.
//
// Tokens only (no inline hex/px). The middot " · " is U+00B7 (NOT an em dash).

import type { AdminEmailRow } from "@/lib/data/adminEmails";
import type { EmbeddedAdminEmailsResult } from "@/lib/admin/embeddedAdminEmails";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { formatRelative } from "@/lib/time/relative";

import { HoverHelp } from "@/components/admin/HoverHelp";
import { ReAddRowButton } from "@/app/admin/settings/admins/ReAddRowButton";
import { RevokeRowButton } from "@/app/admin/settings/admins/RevokeRowButton";
import { AddAdminDisclosure } from "@/components/admin/settings/AddAdminDisclosure";

export function AdministratorsSection({
  result,
  actorCanonicalEmail,
  now,
}: {
  result: EmbeddedAdminEmailsResult;
  actorCanonicalEmail: string;
  now: Date;
}) {
  // M12.3 item 12b: the "Administrators (N)" title sits OUTSIDE/above the card,
  // in the heading row alongside the "Add admin" trigger; the card holds only
  // the list (+ disclosed add form).
  if (result.kind === "infra_error") {
    // Resolve to copy in a local (not inline in JSX) so the no-raw-codes
    // scanner does not flag the code string inside a JSX expression.
    const listFailedMessage = getRequiredDougFacing("ADMIN_EMAIL_LIST_FAILED");
    return (
      <section
        data-testid="admin-settings-admins-section"
        aria-labelledby="admin-settings-admins-heading"
        className="flex flex-col gap-3"
      >
        <h2
          id="admin-settings-admins-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Administrators
        </h2>
        <div
          data-testid="admin-allowlist-error"
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4"
        >
          <p className="max-w-prose text-sm text-text-strong">
            {listFailedMessage}
          </p>
          <p className="max-w-prose text-sm text-text-subtle">
            Refresh the page to try again.
          </p>
        </div>
      </section>
    );
  }

  const rows = result.rows;
  const active = rows.filter((r) => r.revoked_at === null);
  const revoked = rows.filter((r) => r.revoked_at !== null);

  const heading = (
    <div className="flex items-center gap-2">
      <h2
        id="admin-settings-admins-heading"
        className="text-lg font-semibold text-text-strong"
      >
        Administrators ({active.length})
      </h2>
      <HoverHelp label="Help: Administrators" testId="admins-help">
        <p>
          People who can sign in and manage shows here. Add or revoke access —
          you can&rsquo;t revoke your own.
        </p>
      </HoverHelp>
    </div>
  );

  const list = (
    <>
      <div data-testid="admin-active-list">
        {active.length === 0 ? (
          <p
            data-testid="admin-allowlist-empty-active"
            className="rounded-md border border-border bg-surface-sunken p-3 text-sm text-text-subtle"
          >
            No active administrators.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((row) => (
              <AdminRow
                key={row.email}
                row={row}
                isActor={row.email === actorCanonicalEmail}
                now={now}
              />
            ))}
          </ul>
        )}
      </div>

      {revoked.length > 0 && (
        <details data-testid="admin-revoked-list" className="rounded-md border border-border bg-surface-sunken">
          <summary className="cursor-pointer p-3 text-xs font-semibold uppercase tracking-wide text-text-subtle">
            Revoked ({revoked.length})
          </summary>
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {revoked.map((row) => (
              <RevokedRow key={row.email} row={row} now={now} />
            ))}
          </ul>
        </details>
      )}
    </>
  );

  return (
    <section
      data-testid="admin-settings-admins-section"
      aria-labelledby="admin-settings-admins-heading"
      className="flex flex-col gap-3"
    >
      <AddAdminDisclosure heading={heading} list={list} />
    </section>
  );
}

function AdminRow({
  row,
  isActor,
  now,
}: {
  row: AdminEmailRow;
  isActor: boolean;
  now: Date;
}) {
  const isSeed = row.added_by === null;
  // Self-revoke policy: an admin can NEVER revoke their OWN access. The Revoke
  // control is OMITTED entirely on the actor's own row (M12.5 — was a disabled
  // button). The Server Action remains the authority for non-actor rows; this
  // also preserves the "never zero admins" invariant (you can't remove yourself).
  const hasNote = Boolean(row.note && row.note.trim().length > 0);
  return (
    <li
      data-testid="admin-allowlist-row"
      data-row-email={row.email}
      className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
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
      {isActor ? null : <RevokeRowButton email={row.email} disabled={false} />}
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
