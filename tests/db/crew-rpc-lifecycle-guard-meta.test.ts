/**
 * BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD — whole-class structural meta-test (fails-by-default).
 *
 * Enumerates from the LIVE pg_catalog every crew/share-mutating SECURITY DEFINER surface and asserts each
 * is classified in exactly one registry: GUARDED (carries its lifecycle-guard tokens), EXEMPT (a documented
 * client-reachable entry point that legitimately need not guard), TRIGGER_MUTATORS (a trigger function), or
 * PRIVATE_HELPERS (a private target-mutator reached only via a definer call chain). A NEW unclassified
 * surface fails the parity checks — the prompt to classify (GUARD / EXEMPT / register helper / register
 * trigger). Enumerated against TEST_DATABASE_URL (validation) in CI; the local dev DB is a partial catalog.
 *
 * Spec: docs/superpowers/specs/crew/2026-07-17-rpc-crew-lifecycle-guard-design.md §4/§5.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function q(sql: string): string[] {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAtX"], {
    input: sql,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}

// Anchored DML-immediately-on-a-target-table (POSIX [[:space:]], NOT \s), OR picker_epoch via update…shows.
// Target tables = crew_members + show_share_tokens. (The M9.5-era crew-auth table was dropped in the
// cutover 20260523000099 and no longer exists, so it is not part of the live target set — including its
// name here is both a no-op and a forbidden legacy reference per tests/cross-cutting/no-m9-5-surfaces.)
const DIRECT_MUTATOR = `(pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)[[:space:]]+(only[[:space:]]+)?(public\\.)?(crew_members|show_share_tokens)'
  or (pg_get_functiondef(p.oid) ~* 'picker_epoch' and pg_get_functiondef(p.oid) ~* 'update[[:space:]]+(public\\.)?shows'))`;
const REACHABLE = `(has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))`;
const IS_TRIGGER = `p.prorettype = 'pg_catalog.trigger'::regtype`;
const FROM = `from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`;
// Helper-delegation arm: an authed/svc definer calling one of the private target-mutating helpers.
const HELPER_CALL = `pg_get_functiondef(p.oid) ~* '\\m(_archive_show_core|_unarchive_show_apply|_undo_tombstone)[[:space:]]*\\('`;

// --- Registries (authoritative, from the validation catalog; see spec §4 table). ---
const PRIVATE_HELPERS = new Set(["_archive_show_core", "_unarchive_show_apply", "_undo_tombstone"]);
const TRIGGER_MUTATORS = new Set(["create_share_token_for_show"]);
const GUARDED = new Set([
  "reset_crew_member_selection",
  "reset_picker_epoch_atomic",
  "rotate_show_share_token",
  "undo_change",
]);
const EXEMPT = new Set([
  "claim_oauth_identity", // service-role; live crew redemption
  "mint_validation_fixture_atomic", // service-role; validation fixture seeding
  "mi11_approve_hold", // authenticated; pre-publish onboarding hold-approval
  "archive_show", // lifecycle-transition wrapper (delegates → _archive_show_core)
  "unarchive_show", // lifecycle-transition wrapper (delegates → _unarchive_show_apply)
]);

const GUARD_TOKENS: Record<string, string[]> = {
  reset_crew_member_selection: [
    "SHOW_ARCHIVED_IMMUTABLE",
    "readfinalizeowned_b2",
    "SHOW_NOT_PUBLISHED",
  ],
  reset_picker_epoch_atomic: [
    "SHOW_ARCHIVED_IMMUTABLE",
    "readfinalizeowned_b2",
    "SHOW_NOT_PUBLISHED",
  ],
  rotate_show_share_token: [
    "SHOW_ARCHIVED_IMMUTABLE",
    "readfinalizeowned_b2",
    "SHOW_NOT_PUBLISHED",
  ],
  undo_change: ["UNDO_SHOW_ARCHIVED", "UNDO_FINALIZE_OWNED"],
};

describe("crew/share RPC lifecycle-guard meta (whole-class, fails-by-default)", () => {
  test("Step A: private target-mutating helpers == PRIVATE_HELPERS registry", () => {
    const rows = q(
      `select p.proname ${FROM} and ${DIRECT_MUTATOR} and not ${REACHABLE} and not (${IS_TRIGGER}) order by 1`,
    );
    expect(new Set(rows)).toEqual(PRIVATE_HELPERS);
  });

  test("Step T: trigger target-mutators == TRIGGER_MUTATORS registry", () => {
    const rows = q(`select p.proname ${FROM} and ${DIRECT_MUTATOR} and ${IS_TRIGGER} order by 1`);
    expect(new Set(rows)).toEqual(TRIGGER_MUTATORS);
  });

  test("Step B+C+D: entry-point universe == GUARDED ∪ EXEMPT (no unclassified fn)", () => {
    const rows = q(
      `select p.proname ${FROM} and p.prosecdef and not (${IS_TRIGGER}) and ${REACHABLE} and (${DIRECT_MUTATOR} or ${HELPER_CALL}) order by 1`,
    );
    expect(new Set(rows)).toEqual(new Set([...GUARDED, ...EXEMPT]));
  });

  test("delegation arm fires: archive_show/unarchive_show enter VIA helper-call, not direct DML", () => {
    const directOnly = new Set(
      q(
        `select p.proname ${FROM} and p.prosecdef and not (${IS_TRIGGER}) and ${REACHABLE} and ${DIRECT_MUTATOR} order by 1`,
      ),
    );
    expect(directOnly.has("archive_show")).toBe(false);
    expect(directOnly.has("unarchive_show")).toBe(false);
    const withDelegation = new Set(
      q(
        `select p.proname ${FROM} and p.prosecdef and not (${IS_TRIGGER}) and ${REACHABLE} and (${DIRECT_MUTATOR} or ${HELPER_CALL}) order by 1`,
      ),
    );
    expect(withDelegation.has("archive_show")).toBe(true);
    expect(withDelegation.has("unarchive_show")).toBe(true);
  });

  test("GUARDED fns carry their lifecycle-guard tokens", () => {
    for (const [fn, toks] of Object.entries(GUARD_TOKENS)) {
      const def = q(`select pg_get_functiondef('public.${fn}'::regproc)`).join("\n");
      for (const t of toks) expect(def, `${fn} missing guard token ${t}`).toContain(t);
    }
  });
});
