/**
 * Service-role seeding for a PEER admin row, so a spec can drive the
 * `/admin/settings` Administrators section against a row that is not the actor's
 * own. The actor's own Revoke button is disabled
 * (`app/admin/settings/admins/RevokeRowButton.tsx:74,311`), so a probe that
 * targeted it would measure a disabled control and prove nothing.
 *
 * DUPLICATION, OWNED. `tests/e2e/admin-settings-admins-refresh.spec.ts:41-84`
 * carries its own private copies of these three functions. They are not shared
 * from here, because consolidating would edit a passing desktop-chromium spec
 * this arc cannot re-run under the fleet's strict-serial-heavy constraint, and
 * a refactor you cannot execute is a refactor you cannot verify.
 * CONSOLIDATE WHEN: the next arc that touches that spec for its own reasons and
 * can run it — point it at this module and delete its private copies.
 */
import { canonicalize } from "@/lib/email/canonicalize";

import { admin } from "./supabaseAdmin";

/** Remove an admin_emails row outright, so a prior aborted run leaves no residue. */
export async function hardDeleteAdminEmail(rawEmail: string): Promise<void> {
  const email = canonicalize(rawEmail);
  if (!email) return;
  const { error } = await admin.from("admin_emails").delete().eq("email", email);
  if (error) throw new Error(`hardDeleteAdminEmail(${email}) failed: ${error.message}`);
}

/**
 * Make the actor an ACTIVE admin row, not merely allowlisted.
 *
 * Load-bearing for the probe rather than incidental: the section refuses to
 * revoke the SOLE remaining admin, so without an active actor beside the peer
 * the Revoke button under measurement would be disabled and the reading would
 * be of a control nobody can press.
 */
export async function ensureActorActive(rawEmail: string): Promise<void> {
  const email = canonicalize(rawEmail);
  if (!email) throw new Error(`ensureActorActive: un-canonicalizable email ${rawEmail}`);
  const { error } = await admin.from("admin_emails").upsert(
    {
      email,
      added_by: null,
      added_at: new Date().toISOString(),
      revoked_by: null,
      revoked_at: null,
    },
    { onConflict: "email" },
  );
  if (error) throw new Error(`ensureActorActive upsert(${email}) failed: ${error.message}`);
}

/** Insert a fresh, active PEER admin row. Cleans first, so reruns are idempotent. */
export async function insertActivePeer(rawEmail: string): Promise<void> {
  const email = canonicalize(rawEmail);
  if (!email) throw new Error(`insertActivePeer: un-canonicalizable email ${rawEmail}`);
  await hardDeleteAdminEmail(email);
  const { error } = await admin.from("admin_emails").insert({
    email,
    added_by: null,
    added_at: new Date().toISOString(),
    revoked_by: null,
    revoked_at: null,
  });
  if (error) throw new Error(`insertActivePeer insert(${email}) failed: ${error.message}`);
}
