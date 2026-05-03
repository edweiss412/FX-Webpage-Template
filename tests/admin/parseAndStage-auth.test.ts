/**
 * tests/admin/parseAndStage-auth.test.ts (M3 Task 3.1, defense-in-depth)
 *
 * Independently proves that requireAdmin() runs as the first executable line
 * of every /admin/dev server action — NOT only on app/admin/dev/page.tsx.
 *
 * The Playwright e2e suite at tests/e2e/admin-dev.spec.ts:114-174 navigates
 * the page and observes the page-level gate. That coverage is necessary but
 * not sufficient: if a future refactor deletes `await requireAdmin()` from
 * app/admin/dev/actions.ts but leaves it on page.tsx, the page render still
 * 403s for non-admins yet the action could be reached through any other
 * caller (RPC entry point, future API route, server-side import) without
 * the gate firing. This Vitest suite imports the action functions directly
 * and asserts each one rejects with the same NEXT_HTTP_ERROR_FALLBACK error
 * the gate is supposed to throw — independent of the page render path.
 *
 * Vitest runs without HTTP / cookies, so requireAdmin() falls into its
 * unauthenticated branch (createSupabaseServerClient throws because next/
 * headers' cookies() is not available outside a request context — caught
 * by requireAdmin's catch block and treated as not-admin → forbidden()).
 *
 * ADMIN_DEV_PANEL_ENABLED=true must be set so requireAdmin gets past the
 * build-time gate (which would otherwise throw notFound() and mask the
 * auth-gate proof). Set inline by Vitest's env setup below.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { admin } from "../e2e/helpers/supabaseAdmin";

// Set ADMIN_DEV_PANEL_ENABLED *before* importing the actions module so the
// requireAdmin chokepoint inside it sees the flag at evaluation time.
// (process.env mutations after import would still be observed because
// requireAdmin reads process.env at call time, but setting here makes the
// intent unambiguous.)
process.env.ADMIN_DEV_PANEL_ENABLED = "true";

// Import the actions under test. The "use server" directive does not block
// Vitest's ESM loader (verified via probe). Direct import bypasses HTTP /
// Next.js entirely — the only protection between this caller and the dev
// schema is the requireAdmin() gate inside each action.
import { parseAndStage, resetDevSchema } from "@/app/admin/dev/actions";

const FIXTURE_HAPPY = "2026-03-rpas-central-four-seasons.md";

/**
 * Predicate that returns true when an error is one of the signals
 * requireAdmin() emits to abort the request. There are three accepted shapes,
 * all of which prove the gate fired before the action body executed:
 *
 *   1. NEXT_HTTP_ERROR_FALLBACK;<status> digest — the canonical shape
 *      produced by notFound() (status 404) and forbidden() (status 403)
 *      under a normal Next.js runtime. See
 *      node_modules/next/dist/esm/client/components/http-access-fallback/
 *      http-access-fallback.js for the canonical isHTTPAccessFallbackError
 *      implementation.
 *
 *   2. "`forbidden()` is experimental and only allowed to be enabled when
 *      `experimental.authInterrupts` is enabled." — the message Next.js
 *      throws when forbidden() is invoked outside a runtime that has the
 *      flag enabled (i.e. Vitest, which does not bootstrap next.config.ts).
 *      That message is itself proof that forbidden() was invoked, which is
 *      itself proof that requireAdmin() reached its `if (!isAdmin) forbidden()`
 *      branch — exactly what this test must verify.
 *
 *   3. Same shape but for notFound() — message contains "notFound" or
 *      "not-found" — covers the case where the build-flag gate is the one
 *      that fires (which would happen if ADMIN_DEV_PANEL_ENABLED were unset,
 *      proving requireAdmin's first guard executed).
 */
function isRequireAdminAbort(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("digest" in err) {
    const digest = (err as { digest: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) {
      return true;
    }
  }
  if (err instanceof Error) {
    return /forbidden\(\)|notFound\(\)|not-found|requireAdmin|authInterrupts/i.test(err.message);
  }
  return false;
}

async function devTablesEmpty(): Promise<{ shows: number; pendingSyncs: number }> {
  const showsRes = await admin
    .schema("dev")
    .from("shows")
    .select("*", { count: "exact", head: true });
  if (showsRes.error) throw new Error(`dev.shows count failed: ${showsRes.error.message}`);
  const psRes = await admin
    .schema("dev")
    .from("pending_syncs")
    .select("*", { count: "exact", head: true });
  if (psRes.error) throw new Error(`dev.pending_syncs count failed: ${psRes.error.message}`);
  return { shows: showsRes.count ?? 0, pendingSyncs: psRes.count ?? 0 };
}

beforeAll(async () => {
  // Ensure dev.* is empty before this suite — service_role calls the
  // SECURITY DEFINER public.dev_truncate_all() RPC.
  const { error } = await admin.rpc("dev_truncate_all");
  if (error) throw new Error(`dev_truncate_all failed: ${error.message}`);
});

beforeEach(async () => {
  const { error } = await admin.rpc("dev_truncate_all");
  if (error) throw new Error(`dev_truncate_all failed (beforeEach): ${error.message}`);
});

afterEach(async () => {
  // Belt-and-suspenders cleanup so a passing/failing test never leaves
  // residue for the next.
  await admin.rpc("dev_truncate_all");
});

describe("defense-in-depth: requireAdmin() is the first line of every /admin/dev server action", () => {
  test("parseAndStage() rejects without admin auth via Next.js HTTP-access fallback", async () => {
    const before = await devTablesEmpty();
    expect(before.shows).toBe(0);
    expect(before.pendingSyncs).toBe(0);

    let caught: unknown = null;
    try {
      await parseAndStage(FIXTURE_HAPPY);
    } catch (err) {
      caught = err;
    }

    // Concrete failure mode: parseAndStage MUST NOT return normally — the
    // first executable line must be `await requireAdmin()` which throws
    // forbidden() (or notFound() if the build-flag gate were tripped first).
    // Either Next.js HTTP-access fallback is acceptable; both prove the gate
    // fired before any DB write code ran.
    expect(caught, "parseAndStage must throw when called without admin auth").not.toBeNull();
    expect(
      isRequireAdminAbort(caught),
      `error must come from requireAdmin's notFound()/forbidden() branch; got: ${
        caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)
      }`,
    ).toBe(true);

    // No dev.* writes happened — the gate fired before the RPC dispatch.
    const after = await devTablesEmpty();
    expect(after.shows).toBe(0);
    expect(after.pendingSyncs).toBe(0);
  });

  test("resetDevSchema() rejects without admin auth via Next.js HTTP-access fallback", async () => {
    // Pre-populate dev.shows so we can prove the reset would have wiped it
    // if it had been allowed to execute.
    const { error: insertErr } = await admin.schema("dev").from("shows").insert({
      drive_file_id: "dev:fixture:vitest-reset-defense",
      slug: "vitest-reset-defense",
      title: "Reset Defense Test",
      client_label: "test",
      template_version: "v4",
    });
    expect(insertErr).toBeNull();
    const before = await devTablesEmpty();
    expect(before.shows).toBe(1);

    let caught: unknown = null;
    try {
      await resetDevSchema();
    } catch (err) {
      caught = err;
    }

    expect(caught, "resetDevSchema must throw when called without admin auth").not.toBeNull();
    expect(
      isRequireAdminAbort(caught),
      `error must come from requireAdmin's notFound()/forbidden() branch; got: ${
        caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)
      }`,
    ).toBe(true);

    // dev.shows row still present — reset never executed.
    const after = await devTablesEmpty();
    expect(after.shows).toBe(1);
  });

  test("control: removing requireAdmin would let parseAndStage proceed (negative-control via direct RPC)", async () => {
    // This control test proves the assertion above is non-trivial — it shows
    // that WITHOUT the requireAdmin gate, the action's downstream code would
    // succeed and write to dev.* . If a future refactor accidentally drops
    // requireAdmin from the action's first line, the gate-firing assertion
    // above would break (no throw at all, instead writes land); this control
    // proves the writes WOULD land if the gate weren't there.
    //
    // Mechanism: bypass parseAndStage entirely and call dev_phase1_stage
    // directly via service-role with a minimal stage payload. This proves
    // the RPC + dev.* schema accept writes — meaning the only thing
    // protecting the dev panel from unauthenticated callers is requireAdmin.
    const { error } = await admin.rpc("dev_phase1_stage", {
      p_drive_file_id: "dev:fixture:vitest-control",
      p_drive_file_name: "vitest-control.md",
      p_parse_result: { control: true } as unknown as Record<string, unknown>,
      p_outcome: "pass",
      p_triggered_items: [] as unknown as Record<string, unknown>[],
      p_hard_error_code: null,
      p_hard_error_message: null,
      p_warnings: [] as unknown as Record<string, unknown>[],
      p_warning_summary: "control test",
      p_staged_modified_time: new Date().toISOString(),
    });
    expect(error, "control: dev_phase1_stage RPC must accept writes").toBeNull();
    const after = await devTablesEmpty();
    expect(
      after.pendingSyncs,
      "control: without the requireAdmin gate, the action's downstream RPC writes a row",
    ).toBe(1);
  });
});
