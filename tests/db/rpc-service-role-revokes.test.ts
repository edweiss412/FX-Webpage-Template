import postgres from "postgres";
import { describe, expect, test } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;

// 2026-06-11 bug-audit: 20260608000003_undo_change_rpc.sql revoked its three
// functions from public/anon/authenticated but — unlike the sibling MI-11 gate
// RPCs in 20260608000002, which revoke from service_role too — left
// service_role with EXECUTE (verified live: has_function_privilege returned
// true). The in-file comments state _undo_tombstone and
// cleanup_superseded_before_images "must run only inside the
// service-role-held sync txn ... never via a direct PostgREST rpc()", and
// undo_change's grant contract is authenticated-only. This registry pins
// service_role EXECUTE = false for every admin-gated / lock-interior function
// in the undo + MI-11 families; add a row when shipping a new one.
const NO_SERVICE_ROLE_EXECUTE = [
  "public.undo_change(uuid)",
  "public._undo_tombstone(public.show_change_log, text)",
  "public.cleanup_superseded_before_images(uuid)",
  "public.mi11_reject_hold(uuid, timestamptz)",
  "public.mi11_approve_hold(uuid, timestamptz, timestamptz)",
  "public._mi11_collision_group(uuid, uuid)",
] as const;

describe("service_role EXECUTE revokes on admin-gated / lock-interior RPCs", () => {
  test.skipIf(!DB_URL)("service_role cannot execute any registered function", async () => {
    const sql = postgres(DB_URL!, { max: 1, prepare: false });
    try {
      const grants: string[] = [];
      for (const signature of NO_SERVICE_ROLE_EXECUTE) {
        const [row] = await sql<{ has: boolean }[]>`
          select has_function_privilege('service_role', ${signature}, 'EXECUTE') as has
        `;
        if (row!.has) grants.push(signature);
      }
      expect(
        grants,
        `service_role retains EXECUTE on:\n${grants.join("\n")}\n` +
          "Revoke it (revoke all ... from service_role) per the MI-11 gate-RPC pattern.",
      ).toEqual([]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
