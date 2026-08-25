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

import {
  POSTGREST_RETRYABLE_STATUSES,
  RETRYABLE_RPCS,
  basePathOf,
  isRetryEligible,
  postgrestWillRetry,
  rpcFunctionName,
} from "@/lib/supabase/retryEligibility";

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

/**
 * The mount arithmetic, pinned case by case.
 *
 * Enrolling this module scored it 2/12 with ten survivors, every one of them in the code that
 * decides WHICH requests are ours — `basePathOf`, `rpcFunctionName`, the retryable status set, and
 * the parse in `postgrestWillRetry`. The suite had twelve tests and none of them reached any of it.
 * That is the point of enrolling a module whose defect class is "claims a request it does not own":
 * the round-4 P0 lived exactly here.
 */
describe("basePathOf — the mount, taken from the client rather than guessed", () => {
  test("absent or empty is the root", () => {
    expect(basePathOf(undefined)).toBe("");
    expect(basePathOf("")).toBe("");
  });

  test("a root url has no base path, with or without the trailing slash", () => {
    expect(basePathOf("http://127.0.0.1:54321")).toBe("");
    expect(basePathOf("http://127.0.0.1:54321/")).toBe("");
  });

  test("a prefixed url keeps its prefix, and trailing slashes do not change it", () => {
    expect(basePathOf("http://h/proxy")).toBe("/proxy");
    expect(basePathOf("http://h/proxy/")).toBe("/proxy");
    expect(basePathOf("http://h/a/b//")).toBe("/a/b");
  });

  test("an unparseable url is the root rather than a throw", () => {
    expect(basePathOf("not a url")).toBe("");
  });
});

describe("rpcFunctionName — exact prefix, exactly one segment", () => {
  test("names the function at the root mount", () => {
    expect(rpcFunctionName("/rest/v1/rpc/is_admin")).toBe("is_admin");
  });

  test("names it under a base path, and NOT without one", () => {
    expect(rpcFunctionName("/proxy/rest/v1/rpc/is_admin", "/proxy")).toBe("is_admin");
    expect(rpcFunctionName("/proxy/rest/v1/rpc/is_admin")).toBeUndefined();
  });

  test("refuses an interior match — the round-4 P0's shape", () => {
    // A Storage object may legitimately be NAMED `rest/v1/rpc/is_admin`.
    expect(rpcFunctionName("/storage/v1/object/bucket/rest/v1/rpc/is_admin")).toBeUndefined();
  });

  test("a ONE-character function name is a name, not an empty one", () => {
    // `rest.length > 0` — the gate showed `> 1` surviving, because every case here used a long
    // name. PostgREST accepts a single-character function, so the boundary is 0 and not 1.
    expect(rpcFunctionName("/rest/v1/rpc/f")).toBe("f");
  });

  test("refuses an empty name and a nested path", () => {
    expect(rpcFunctionName("/rest/v1/rpc/")).toBeUndefined();
    expect(rpcFunctionName("/rest/v1/rpc/a/b")).toBeUndefined();
  });
});

describe("postgrestWillRetry — the other half of the same mount test", () => {
  test("a GET at the mount is PostgREST's", () => {
    expect(postgrestWillRetry("http://h/rest/v1/shows", "GET")).toBe(true);
  });

  test("a POST at the mount is not, because PostgREST only retries idempotent methods", () => {
    expect(postgrestWillRetry("http://h/rest/v1/shows", "POST")).toBe(false);
  });

  test("a Storage path that merely CONTAINS the mount is not PostgREST's", () => {
    expect(postgrestWillRetry("http://h/storage/v1/object/b/rest/v1/shows", "GET")).toBe(false);
  });

  test("under a base path the mount moves with it", () => {
    expect(postgrestWillRetry("http://h/proxy/rest/v1/shows", "GET", "/proxy")).toBe(true);
    expect(postgrestWillRetry("http://h/proxy/rest/v1/shows", "GET")).toBe(false);
  });

  test("an unparseable url keeps ownership rather than orphaning the request", () => {
    expect(postgrestWillRetry("not a url", "GET")).toBe(false);
  });
});

describe("POSTGREST_RETRYABLE_STATUSES", () => {
  test("is exactly the set the installed client retries, so a drifted literal reds here", () => {
    expect([...POSTGREST_RETRYABLE_STATUSES].sort((a, b) => a - b)).toEqual([503, 520]);
  });
});

describe("the schema a request names, which the URL does not carry", () => {
  const RPC = "http://127.0.0.1:54321/rest/v1/rpc/is_admin";
  const member = [...RETRYABLE_RPCS][0]!;
  const RPC_MEMBER = `http://127.0.0.1:54321/rest/v1/rpc/${member}`;

  test("no profile is the default schema, so a retryable member stays eligible", () => {
    expect(isRetryEligible(RPC_MEMBER, "POST")).toBe(true);
    expect(isRetryEligible(RPC_MEMBER, "POST", "", undefined)).toBe(true);
  });

  test("an explicit public profile is the same request", () => {
    expect(isRetryEligible(RPC_MEMBER, "POST", "", "public")).toBe(true);
  });

  test("any other exposed schema is a DIFFERENT function and is declined", () => {
    // `supabase.schema("dev").rpc(...)` produces the same path and differs only in
    // `Content-Profile`. RETRYABLE_RPCS speaks for `public` alone — the volatility scan reads no
    // other schema — so `dev.is_admin` would be retried on `public.is_admin`'s evidence.
    // config.toml exposes `graphql_public` and `dev` today.
    expect(isRetryEligible(RPC_MEMBER, "POST", "", "dev")).toBe(false);
    expect(isRetryEligible(RPC_MEMBER, "POST", "", "graphql_public")).toBe(false);
  });

  test("the decline covers the method branch too, not just the rpc one", () => {
    expect(isRetryEligible("http://127.0.0.1:54321/rest/v1/shows", "GET", "", "dev")).toBe(false);
    expect(isRetryEligible("http://127.0.0.1:54321/rest/v1/shows", "GET")).toBe(true);
  });

  test("a non-member rpc is still ineligible whatever the schema says", () => {
    expect(isRetryEligible(RPC.replace("is_admin", "some_writer"), "POST", "", "public")).toBe(
      false,
    );
  });
});
