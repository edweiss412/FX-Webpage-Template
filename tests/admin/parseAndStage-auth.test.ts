/**
 * tests/admin/parseAndStage-auth.test.ts (M3 Task 3.1, defense-in-depth;
 * developer-tier §6: the /admin/dev gate swapped requireAdmin → requireDeveloper)
 *
 * Independently proves that requireDeveloper() runs as the first executable line
 * of every /admin/dev server action — NOT only on app/admin/dev/page.tsx.
 *
 * The Playwright e2e suite at tests/e2e/admin-dev.spec.ts:114-174 navigates
 * the page and observes the page-level gate. That coverage is necessary but
 * not sufficient: if a future refactor deletes `await requireDeveloper()` from
 * app/admin/dev/actions.ts but leaves it on page.tsx, the page render still
 * denies non-developers yet the action could be reached through any other
 * caller (RPC entry point, future API route, server-side import) without
 * the gate firing. This Vitest suite imports the action functions directly
 * and asserts each one rejects with the abort the gate is supposed to throw —
 * independent of the page render path.
 *
 * Vitest runs without HTTP / cookies, so requireDeveloper() falls into its
 * infra branch: createSupabaseServerClient() throws (next/headers' cookies()
 * is not available outside a request context), which requireDeveloper maps to
 * a thrown DeveloperInfraError (code DEVELOPER_SESSION_LOOKUP_FAILED) BEFORE any
 * body code runs — exactly the "gate fired first, no DB write" proof this suite
 * needs. (Under a real runtime a confirmed non-developer aborts via forbidden().)
 *
 * ADMIN_DEV_PANEL_ENABLED=true must be set so the build-time file gate does not
 * mask the auth-gate proof. Set inline by Vitest's env setup below.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { admin } from "../e2e/helpers/supabaseAdmin";

// Set ADMIN_DEV_PANEL_ENABLED *before* importing the actions module so the
// build-time file gate does not mask the auth-gate proof at evaluation time.
process.env.ADMIN_DEV_PANEL_ENABLED = "true";

// Import the actions under test. The "use server" directive does not block
// Vitest's ESM loader (verified via probe). Direct import bypasses HTTP /
// Next.js entirely — the only protection between this caller and the dev
// schema is the requireDeveloper() gate inside each action.
import { parseAndStage, resetDevSchema } from "@/app/admin/dev/actions";

const FIXTURE_HAPPY = "2026-03-rpas-central-four-seasons.md";
const ACTIONS_SOURCE_PATH = join(process.cwd(), "app/admin/dev/actions.ts");

function firstStatementOfExportedAction(name: string): string {
  const source = readFileSync(ACTIONS_SOURCE_PATH, "utf8");
  const headerMatch = new RegExp(`export\\s+async\\s+function\\s+${name}\\b`).exec(source);
  expect(
    headerMatch,
    `expected to find exported async function ${name} in actions.ts`,
  ).not.toBeNull();

  const openBrace = source.indexOf("{\n", headerMatch?.index ?? 0);
  expect(openBrace, `expected ${name} to have a function body`).toBeGreaterThan(-1);

  let depth = 0;
  let closeBrace = -1;
  for (let i = openBrace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) {
      closeBrace = i;
      break;
    }
  }
  expect(closeBrace, `expected to find closing brace for ${name}`).toBeGreaterThan(openBrace);

  const body = source.slice(openBrace + 1, closeBrace);
  const executableLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("//") &&
        !line.startsWith("*") &&
        !line.startsWith("/*"),
    );
  return executableLines[0] ?? "";
}

/**
 * Predicate that returns true when an error is one of the signals
 * requireDeveloper() emits to abort the request. All accepted shapes prove the
 * gate fired before the action body executed:
 *
 *   1. NEXT_HTTP_ERROR_FALLBACK;<status> digest — the canonical shape
 *      produced by forbidden() (status 403) / notFound() (404) under a normal
 *      Next.js runtime (a confirmed non-developer aborts via forbidden()). See
 *      node_modules/next/dist/esm/client/components/http-access-fallback/
 *      http-access-fallback.js for the canonical isHTTPAccessFallbackError.
 *
 *   2. DeveloperInfraError (code DEVELOPER_SESSION_LOOKUP_FAILED) — the shape
 *      requireDeveloper throws in the no-cookie Vitest env, where
 *      createSupabaseServerClient() fails during construction and the gate maps
 *      it to a typed infra fault BEFORE any verdict. Its presence proves
 *      requireDeveloper ran as the action's first statement.
 *
 *   3. forbidden()/notFound() message text — covers a runtime that surfaces the
 *      interrupt as a thrown Error message rather than a digest.
 */
function isRequireDeveloperAbort(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("digest" in err) {
    const digest = (err as { digest: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) {
      return true;
    }
  }
  if ((err as { code?: unknown }).code === "DEVELOPER_SESSION_LOOKUP_FAILED") return true;
  if (err instanceof Error) {
    return /forbidden\(\)|notFound\(\)|not-found|requireDeveloper|authInterrupts|DeveloperInfraError/i.test(
      `${err.name}: ${err.message}`,
    );
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

describe("defense-in-depth: requireDeveloper() is the first line of every /admin/dev server action", () => {
  test("every exported /admin/dev action has await requireDeveloper() as its first executable statement", () => {
    for (const actionName of [
      "parseAndStage",
      "parseAndStageFormAction",
      "getStagedResult",
      "resetDevSchema",
      "resetDevSchemaFormAction",
      "listFixtures",
    ]) {
      expect(
        firstStatementOfExportedAction(actionName),
        `${actionName} must call requireDeveloper() directly as its first executable line; delegating to another gated helper is not enough for the server-action invariant.`,
      ).toBe("await requireDeveloper();");
    }
  });

  test("parseAndStage() rejects without developer auth (gate aborts before any DB write)", async () => {
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
    // first executable line must be `await requireDeveloper()`, which aborts
    // (DeveloperInfraError in the no-cookie test env, or forbidden() under a
    // real runtime). Either shape proves the gate fired before any DB write.
    expect(caught, "parseAndStage must throw when called without developer auth").not.toBeNull();
    expect(
      isRequireDeveloperAbort(caught),
      `error must come from requireDeveloper's infra/forbidden branch; got: ${
        caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)
      }`,
    ).toBe(true);

    // No dev.* writes happened — the gate fired before the RPC dispatch.
    const after = await devTablesEmpty();
    expect(after.shows).toBe(0);
    expect(after.pendingSyncs).toBe(0);
  });

  test("resetDevSchema() rejects without developer auth (gate aborts before the truncate)", async () => {
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

    expect(caught, "resetDevSchema must throw when called without developer auth").not.toBeNull();
    expect(
      isRequireDeveloperAbort(caught),
      `error must come from requireDeveloper's infra/forbidden branch; got: ${
        caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)
      }`,
    ).toBe(true);

    // dev.shows row still present — reset never executed.
    const after = await devTablesEmpty();
    expect(after.shows).toBe(1);
  });

  test("control: removing requireDeveloper would let parseAndStage proceed (negative-control via direct RPC)", async () => {
    // This control test proves the assertion above is non-trivial — it shows
    // that WITHOUT the requireDeveloper gate, the action's downstream code would
    // succeed and write to dev.* . If a future refactor accidentally drops
    // requireDeveloper from the action's first line, the gate-firing assertion
    // above would break (no throw at all, instead writes land); this control
    // proves the writes WOULD land if the gate weren't there.
    //
    // Mechanism: bypass parseAndStage entirely and call dev_phase1_stage
    // directly via service-role with a minimal stage payload. This proves
    // the RPC + dev.* schema accept writes — meaning the only thing
    // protecting the dev panel from unauthenticated callers is requireDeveloper.
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
      "control: without the requireDeveloper gate, the action's downstream RPC writes a row",
    ).toBe(1);
  });
});
