/**
 * tests/supabase/retryEligibility.test.ts — Task 1 of the transient-502 plan.
 *
 * The predicate decides whether a Supabase request may be retried. Its defect class is
 * "reports eligible while the truth moved", which is silent-wrong: a predicate that wrongly
 * returns true retries a mutation and nothing errors. That is why it lives in its own
 * importable module (the source-mutation runner overlays a target only when a suite imports
 * it) and why the cases below come from a measured census rather than from imagination.
 *
 * Case sources:
 *   - spec §3.3's method census, every row.
 *   - spec §4.2's RPC-GET rule, in BOTH directions: PostgREST serves GET for non-volatile
 *     functions, so an RPC reached by GET takes the same set membership as one reached by
 *     POST. Without both, a predicate returning true for every GET passes, and so does one
 *     rejecting every RPC GET — opposite bugs, identical green.
 *   - the discrimination case the census exposed: an insert into a table NAMED after a
 *     retryable function is a POST to /rest/v1/<table>, one segment shallower than an RPC.
 */
import { describe, expect, test } from "vitest";

import { RETRYABLE_RPCS, isRetryEligible } from "@/lib/supabase/retryEligibility";

const BASE = "http://127.0.0.1:54321";
const eligible = (path: string, method: string): boolean =>
  isRetryEligible(`${BASE}${path}`, method);

describe("isRetryEligible — the method census (spec §3.3)", () => {
  test("a retryable RPC by POST is eligible", () => {
    expect(eligible("/rest/v1/rpc/is_admin", "POST")).toBe(true);
  });

  test("a VOLATILE RPC by POST is never eligible", () => {
    expect(eligible("/rest/v1/rpc/rotate_show_share_token", "POST")).toBe(false);
  });

  test("a non-RPC GET is eligible", () => {
    expect(eligible("/rest/v1/shows?select=id&limit=1", "GET")).toBe(true);
  });

  test("an insert is never eligible", () => {
    expect(eligible("/rest/v1/shows", "POST")).toBe(false);
  });

  test("an update is never eligible", () => {
    expect(eligible("/rest/v1/shows?id=eq.x", "PATCH")).toBe(false);
  });

  test("a delete is never eligible", () => {
    expect(eligible("/rest/v1/shows?id=eq.x", "DELETE")).toBe(false);
  });

  test("an auth token POST is never eligible", () => {
    expect(eligible("/auth/v1/token?grant_type=password", "POST")).toBe(false);
  });
});

describe("isRetryEligible — RPC by GET (spec §4.2), both directions", () => {
  test("a retryable RPC reached by GET is eligible", () => {
    expect(eligible("/rest/v1/rpc/is_admin", "GET")).toBe(true);
  });

  test("a VOLATILE RPC reached by GET is NOT eligible, method notwithstanding", () => {
    expect(eligible("/rest/v1/rpc/rotate_show_share_token", "GET")).toBe(false);
  });
});

describe("isRetryEligible — the /rpc/ segment is load-bearing", () => {
  test("an insert into a table NAMED after a retryable function is not eligible", () => {
    // POST /rest/v1/is_admin is one segment shallower than POST /rest/v1/rpc/is_admin.
    // A rule keyed on the trailing segment would retry this write.
    expect(eligible("/rest/v1/is_admin", "POST")).toBe(false);
  });

  test("a table read named after a retryable function is eligible as a GET, not as an RPC", () => {
    expect(eligible("/rest/v1/is_admin?select=id", "GET")).toBe(true);
  });
});

describe("RETRYABLE_RPCS", () => {
  test("is non-empty, so the predicate's true-branch is reachable", () => {
    expect(RETRYABLE_RPCS.size).toBeGreaterThan(0);
  });
});
