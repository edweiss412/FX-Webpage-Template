/**
 * app/admin/actions.ts (M5 §B Task 5.9 — Doug's portion)
 *
 * Server Actions for the admin section. Currently a single action:
 *   - resolveAdminAlertFormAction: marks an `admin_alerts` row resolved.
 *
 * Defense-in-depth: every action gates with `requireAdmin()` independently
 * of its caller (per AGENTS.md §1.6). The cookie-bound Supabase client used
 * inside the action also enforces the row-level admin_only policy on
 * `public.admin_alerts` (supabase/migrations/20260501002000_rls_policies.sql:150),
 * so even if the application gate were bypassed, the database would reject.
 *
 * The action revalidates `/admin/dev` so the next render observes the
 * mutated state without a hard reload (the layout's AlertBanner re-runs
 * its SELECT against the topmost unresolved row).
 *
 * No advisory lock: spec §4.6 admin_alerts is admin-side row management
 * (not crew-data mutation under the per-show lock invariant). The unique
 * partial index `admin_alerts_one_unresolved_idx` enforces single-row-per
 * (show_id, code) at the database level — concurrent resolves of the same
 * row are idempotent (the second update no-ops because the WHERE clause
 * matches zero rows).
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalize } from "@/lib/email/canonicalize";
import { hashForLog } from "@/lib/email/hashForLog";
import { log } from "@/lib/log";
import { getActiveWatchedFolder } from "@/lib/appSettings/getWatchedFolderId";
import { subscribeToWatchedFolder } from "@/lib/drive/watch";
import { resolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";
import { WatchRetryInfraError } from "@/lib/admin/watchRetryError";
import { requireDeveloperIdentity } from "@/lib/auth/requireDeveloper";
import { HEALTH_CODES, isAutoResolving } from "@/lib/adminAlerts/audience";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

// Local UUID regex — duplicated from `lib/auth/constants.ts` (UUID_RE) because
// §B (this file's milestone) cannot import from §A's lib/auth surface. A single
// internal callsite of a stable, format-only regex is acceptable duplication;
// see I2 in the M5 §B Task 5.9 code-quality review.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveAdminAlertFormAction(formData: FormData): Promise<void> {
  // Defense-in-depth: gate independent of the caller (the layout's
  // requireAdmin call has already gated the page render, but the action
  // could be invoked directly with crafted POST + cookies).
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    // Bad request — no id supplied. Silently no-op rather than 400; the
    // form always supplies the hidden id input.
    return;
  }

  // Reject anything that isn't a well-formed UUID before it reaches Postgres.
  // Without this guard, a malformed id leaks into server logs as a Postgres
  // error and (pre-I1 fix) was silently swallowed by the discarded UPDATE
  // result. The hidden form input always supplies a valid UUID; rejecting
  // here is purely a hardening measure against crafted POSTs.
  if (!UUID_RE.test(id)) return;

  // not-subject-to-meta: server action with no typed-result contract.
  // Throws (client construction, getUser, .update()) propagate to the
  // Next.js error boundary, which is the intended loud-failure mode for
  // this form-submission path; there is no caller checking for
  // `{ kind: "infra_error" }`. Silent swallowing would be the §1.9
  // violation — propagation IS the contract here.
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    // §1.9 returned-error path: getUser surfaced an infra fault. We MUST
    // NOT fall through to the `!adminEmail` branch (which would silently
    // no-op and the page would revalidate as if nothing happened). Throw
    // so the Next.js error boundary renders, consistent with the
    // not-subject-to-meta exemption's "propagation IS the contract" rule.
    // Durable forensic breadcrumb BEFORE the throw: the error-boundary render
    // leaves no app_events row, so a repeated auth outage on the resolve action
    // is otherwise invisible. Fail-open (`void`) — a logger fault must not
    // change the propagation contract (invariant 9). No email is resolvable
    // here, so no actorHash.
    void log.error("resolveAdminAlert getUser failed", {
      source: "admin.actions",
      code: "ADMIN_ALERT_RESOLVE_FAILED",
      stage: "getUser",
      alertId: id,
      error: userError,
    });
    throw new Error(
      `[resolveAdminAlertFormAction] supabase.auth.getUser failed: ${userError.message}`,
    );
  }
  const adminEmail = canonicalize(userData.user?.email);
  if (!adminEmail) {
    // Should be unreachable — requireAdmin() above would have thrown if the
    // session lacked a canonical email. Defense in depth: if Supabase ever
    // returns a session whose user.email round-trips through canonicalize()
    // to null, we refuse to write a NULL resolved_by rather than silently
    // attributing the resolve to "unknown."
    void log.error("requireAdmin returned but canonicalized email is null", {
      source: "admin.actions",
      code: "ADMIN_RESOLVE_CANONICAL_EMAIL_NULL",
      // No actor to hash (email is null); the alert id is the only stable
      // in-scope correlator for which resolve hit this defense-in-depth branch.
      alertId: id,
    });
    return;
  }
  const resolvedBy = adminEmail;

  // alert-audience-split §6.7: HEALTH-audience alerts resolve ONLY through the
  // dev-gated resolveHealthAlertFormAction. This user-facing (requireAdmin) door
  // categorically REJECTS them — a non-developer admin must not resolve a
  // developer-owned health alert here. Fetch the row's code first; on a health
  // code, no-op (do NOT revalidate a false success), leaving resolved_at null.
  const { data: guardRow, error: guardError } = await supabase
    .from("admin_alerts")
    .select("code")
    .eq("id", id)
    .maybeSingle();
  if (guardError) {
    throw new Error(
      `[resolveAdminAlertFormAction] admin_alerts code lookup failed: ${guardError.message}`,
    );
  }
  if (guardRow && HEALTH_CODES.includes(guardRow.code as string)) {
    return;
  }
  // alert-resolve-truthing §4.3: an auto-resolving code self-clears, so a manual
  // resolve here would be a misleading no-op. Fail CLOSED — no-op (do NOT
  // revalidate a false success), leaving resolved_at for the auto-resolver.
  if (guardRow && isAutoResolving(guardRow.code as string)) {
    return;
  }

  // RLS-gated UPDATE. The admin_only policy on admin_alerts requires
  // public.is_admin() to be true, which we've already verified. The
  // WHERE clause additionally requires the row to be still unresolved
  // and global-only. Per-show alerts must be resolved from the
  // show-scoped route after the operator views show context.
  const { error: updateError } = await supabase
    .from("admin_alerts")
    .update({
      resolved_at: new Date().toISOString(), // not-render-side: mutation timestamp (resolved_at write)
      resolved_by: resolvedBy,
    })
    .eq("id", id)
    .is("resolved_at", null)
    .is("show_id", null);

  if (updateError) {
    // I1 fix: do NOT call revalidatePath when the UPDATE failed (network
    // blip, RLS denial, misconfiguration). Silently revalidating would show
    // the admin a "resolved" UI while the row remains unresolved on the DB.
    //
    // §1.9 + Codex R5: the prior `return;` here silently swallowed the
    // returned UPDATE error — the form re-enables controls, the alert
    // stays unresolved on the DB, and the operator gets no signal. That
    // contradicts the not-subject-to-meta exemption's "propagation IS
    // the contract" rule. Throw so the Next.js error boundary renders,
    // matching the getUser returned-error fix above.
    //
    // Durable forensic breadcrumb BEFORE the throw (the error-boundary render
    // persists no app_events row). Reuses ADMIN_ALERT_RESOLVE_FAILED (the same
    // code the RPC alert-resolve routes stamp). Hashed actor only; fail-open.
    void log.error("resolveAdminAlert UPDATE failed", {
      source: "admin.actions",
      code: "ADMIN_ALERT_RESOLVE_FAILED",
      stage: "update",
      actorHash: hashForLog(resolvedBy),
      alertId: id,
      error: updateError,
    });
    throw new Error(
      `[resolveAdminAlertFormAction] admin_alerts UPDATE failed: ${updateError.message}`,
    );
  }

  // Re-render the admin layout so the AlertBanner re-runs its SELECT
  // and the freshly-resolved row drops out of the topmost slot.
  revalidatePath("/admin", "layout");
}

/**
 * Developer-gated resolve for HEALTH-audience admin_alerts (spec §6.6).
 *
 * Reusing `resolveAdminAlertFormAction` (requireAdmin only) OR the per-show
 * JSON route is wrong on two counts (spec §6.6 R5 findings 1+3): (1) a
 * non-developer admin could resolve a developer-owned health alert, hiding
 * degradation from the developer — this gates `requireDeveloperIdentity()` and
 * additionally verifies the target row's `code ∈ HEALTH_CODES`; (2) the per-show
 * route returns JSON, so a plain form would navigate the developer to a raw JSON
 * document — this Server Action revalidates in place and stays on #health.
 *
 * Both GLOBAL and SHOW-SCOPED health rows resolve through this one action
 * (developer-authorized + code-verified → no show_id predicate needed).
 */
export async function resolveHealthAlertFormAction(formData: FormData): Promise<void> {
  // Developer-gated (canonical, attributable email). A confirmed non-developer
  // is rejected here (forbidden()) before any read/write.
  const { email: devEmail } = await requireDeveloperIdentity();

  const id = formData.get("id");
  if (typeof id !== "string" || !UUID_RE.test(id)) return;

  // not-subject-to-meta: server action with no typed-result contract.
  // The code lookup destructures { data, error }; the UPDATE returns row evidence
  // so a zero-row no-op is detectable (R13 finding 2). Construction/select/update
  // returned-errors AND throws propagate to the Next.js error boundary (propagation
  // IS the contract) — they must NOT revalidate as success and must NOT log an
  // outcome. There is no caller checking for { kind:"infra_error" }.
  const supabase = await createSupabaseServerClient();
  const { data: row, error: fetchError } = await supabase
    .from("admin_alerts")
    .select("code, show_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    throw new Error(
      `[resolveHealthAlertFormAction] admin_alerts code lookup failed: ${fetchError.message}`,
    );
  }
  if (!row) return; // not found — idempotent no-op (no log, no revalidate)
  const code = row.code as string;
  // A developer cannot use this door to resolve a `doug` alert (defense-in-depth):
  // only HEALTH_CODES rows are resolvable here. No write on rejection.
  if (!HEALTH_CODES.includes(code)) return;
  // alert-resolve-truthing §4.3: an auto-resolving health code self-clears, so even
  // the developer door fails CLOSED — no manual no-op write (the HealthAlertsPanel
  // renders an auto-clear note in place of the button for these codes).
  if (isAutoResolving(code)) return;
  const showId = (row.show_id as string | null) ?? null;

  const { data: updated, error: updateError } = await supabase
    .from("admin_alerts")
    .update({
      resolved_at: new Date().toISOString(), // not-render-side: mutation timestamp (resolved_at write)
      resolved_by: devEmail,
    })
    .eq("id", id)
    .is("resolved_at", null)
    .select("id");
  if (updateError) {
    // I1 parity: a failed UPDATE never revalidates (a false "resolved" UI over an
    // unresolved DB row). Throw to the error boundary; no success log.
    throw new Error(
      `[resolveHealthAlertFormAction] admin_alerts UPDATE failed: ${updateError.message}`,
    );
  }
  // R13 finding 2: a Supabase UPDATE that affects zero rows returns NO error, so
  // `data.length === 1` is the ONLY success. Zero rows (already resolved /
  // concurrent) is an idempotent no-op — no false ADMIN_ALERT_RESOLVED, no revalidate.
  if (!Array.isArray(updated) || updated.length !== 1) return;

  // POST-COMMIT durable breadcrumb (awaited for durability; logAdminOutcome is
  // centrally fail-open so it can never throw over the committed resolve). The
  // alert id goes in extra{}, the show id in showId (AdminOutcome has no `target`).
  await logAdminOutcome({
    code: "ADMIN_ALERT_RESOLVED",
    source: "app.admin.actions.resolveHealthAlert",
    actorEmail: devEmail,
    ...(showId ? { showId } : {}),
    extra: { alertId: id },
  });
  // BOTH surfaces the health state feeds (R11 finding 1): the telemetry panel
  // AND the /admin layout (the nav health indicator's rollup is read in the layout,
  // §5.1) — revalidating only the panel would leave the persistent nav dot stale.
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/dev/telemetry");
}

// Admin self-service retry for the Drive push subscription (spec §3.6).
// Shared by the AlertBanner action slot and the Settings Drive panel.
// Infra faults THROW typed (invariant 9 / R2-3) — the Next error boundary
// surfaces them; no_folder_configured is a deliberate, logged no-op (nothing
// to retry; the hourly reconcile treats no-folder as vacuous-healthy).
export async function retryWatchSubscriptionFormAction(_formData: FormData): Promise<void> {
  await requireAdmin();

  const folder = await getActiveWatchedFolder();
  if ("kind" in folder && folder.kind === "infra_error") {
    throw new WatchRetryInfraError("folder_read");
  }
  if ("kind" in folder) {
    // Info-WITH-code so this deliberate no-op PERSISTS (lib/log shouldPersist:
    // info persists only with a code). Otherwise a "retry did nothing" report
    // has no durable server-side trace of the no-folder skip.
    // Invariant 9 (Codex PR7 R2): adding the code makes this emit hit the persist
    // path; keep it AWAITED for durability but fail-open (try/catch) so a sink /
    // build throw can never reject over this no-op skip and turn it into an error.
    try {
      await log.info("watch retry skipped: no folder configured", {
        source: "admin.watchRetry",
        code: "WATCH_RETRY_NO_FOLDER_SKIPPED",
      });
    } catch {
      /* best-effort: logging must never throw over the caller */
    }
    return;
  }

  const result = await subscribeToWatchedFolder(folder.folderId);
  if (result.outcome === "active") {
    await resolveAdminAlert({ showId: null, code: "WATCH_CHANNEL_ORPHANED" });
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/settings");
}
