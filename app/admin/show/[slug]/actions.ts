/**
 * app/admin/show/[slug]/actions.ts (M9.5)
 *
 * Server Actions for the per-show admin panel's crew section
 * (Revoke-all + Issue-new). Mirrors the M9 C9
 * app/admin/settings/admins/actions.ts pattern:
 *   - Defense-in-depth admin gate (requireAdminIdentity) on every action.
 *   - SignedLinksInfraError propagates per AGENTS.md §1.9 — actions do
 *     NOT swallow infra faults into benign action results.
 *   - Outcomes mapped to a catalog code; UI renders via getDougFacing().
 *
 * Single-holder advisory-lock rule (AGENTS.md §1.2):
 *   - The RPC holds the lock inside its SECURITY DEFINER body.
 *   - This Server Action MUST NOT wrap the data-layer call in
 *     withShowAdvisoryLock — that would create the M5 R20 nested-lock
 *     deadlock class.
 *   - The structural meta-test at tests/auth/advisoryLockRpcDeadlock.test.ts
 *     scans this file for withShowAdvisoryLock near rpc("..._rpc")
 *     call sites.
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { issueNewLink, revokeAllLinks } from "@/lib/data/signedLinks";

export type ShowLinkActionResult =
  | { kind: "ok"; code: "ADMIN_LINK_REVOKED_OK" | "ADMIN_LINK_ISSUED_OK" }
  | {
      kind: "refused";
      code:
        | "ADMIN_LINK_NO_LIVE_LINK"
        | "ADMIN_LINK_SHOW_NOT_FOUND"
        | "ADMIN_LINK_CREW_NOT_FOUND";
    };

/**
 * Structured audit emission for successful link mutations.
 *
 * Why Server Action layer (not RPC body):
 *   - admin_alerts.upsert is wrong here — its uniq index on
 *     (show_id, code) where resolved_at is null would collapse repeated
 *     revokes into occurrence_count bumps + clutter AlertBanner with
 *     unresolved INFO-class rows Doug doesn't need to dismiss.
 *   - PL/pgSQL structured logs don't land in the same Vercel surface
 *     as Next.js function logs.
 *   - Vercel function logs are durable (90-day retention on Pro),
 *     queryable, and capture request context automatically.
 *
 * The "[m9.5 signed-link admin]" prefix is greppable in Vercel logs.
 * The JSON payload shape is forward-compatible with the future
 * operatorLog.emit() sink (BL-OPS-LOG); when that lands, this helper
 * becomes a thin wrapper.
 */
type AuditPayload = {
  action: "revoke_all_links" | "issue_new_link";
  show_id: string;
  crew_name: string;
  actor_email: string;
  new_floor?: number;
  new_token_version?: number;
};

function emitAuditLog(payload: AuditPayload): void {
  console.log(
    `[m9.5 signed-link admin] ${JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(), // not-render-side: audit-log mutation path emits real wall-clock per lib/time/now.ts §C.4 waiver
    })}`,
  );
}

function readShowAndCrew(
  formData: FormData,
): { showId: string; crewName: string } | null {
  const showId = formData.get("showId");
  const crewName = formData.get("crewName");
  if (typeof showId !== "string" || typeof crewName !== "string") return null;
  if (showId.length === 0 || crewName.length === 0) return null;
  return { showId, crewName };
}

export async function revokeAllLinksAction(
  _prev: ShowLinkActionResult | null,
  formData: FormData,
): Promise<ShowLinkActionResult> {
  const actor = await requireAdminIdentity();

  const input = readShowAndCrew(formData);
  if (!input) return { kind: "refused", code: "ADMIN_LINK_CREW_NOT_FOUND" };

  const outcome = await revokeAllLinks({
    showId: input.showId,
    crewName: input.crewName,
  });

  switch (outcome.kind) {
    case "ok":
      emitAuditLog({
        action: "revoke_all_links",
        show_id: input.showId,
        crew_name: input.crewName,
        actor_email: actor.email,
        new_floor: outcome.row.revoked_below_version,
      });
      revalidatePath("/admin/show/[slug]", "page");
      return { kind: "ok", code: "ADMIN_LINK_REVOKED_OK" };
    case "no_live_link":
      return { kind: "refused", code: "ADMIN_LINK_NO_LIVE_LINK" };
    case "show_not_found":
      return { kind: "refused", code: "ADMIN_LINK_SHOW_NOT_FOUND" };
    case "crew_member_not_found":
      return { kind: "refused", code: "ADMIN_LINK_CREW_NOT_FOUND" };
  }
}

export async function issueNewLinkAction(
  _prev: ShowLinkActionResult | null,
  formData: FormData,
): Promise<ShowLinkActionResult> {
  const actor = await requireAdminIdentity();

  const input = readShowAndCrew(formData);
  if (!input) return { kind: "refused", code: "ADMIN_LINK_CREW_NOT_FOUND" };

  const outcome = await issueNewLink({
    showId: input.showId,
    crewName: input.crewName,
  });

  switch (outcome.kind) {
    case "ok":
      emitAuditLog({
        action: "issue_new_link",
        show_id: input.showId,
        crew_name: input.crewName,
        actor_email: actor.email,
        new_token_version: outcome.row.current_token_version,
      });
      revalidatePath("/admin/show/[slug]", "page");
      return { kind: "ok", code: "ADMIN_LINK_ISSUED_OK" };
    case "show_not_found":
      return { kind: "refused", code: "ADMIN_LINK_SHOW_NOT_FOUND" };
    case "crew_member_not_found":
      return { kind: "refused", code: "ADMIN_LINK_CREW_NOT_FOUND" };
  }
}
