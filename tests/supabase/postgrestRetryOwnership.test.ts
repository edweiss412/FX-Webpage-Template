/**
 * tests/supabase/postgrestRetryOwnership.test.ts
 *
 * The narrowing's safety property, over the WHOLE input space rather than a handful of cases.
 *
 * `postgrestOwnsRetry` exists because two retrying layers multiply: round-2 review measured a 503 on
 * a GET becoming twelve transport calls against a budget of three. Declining what PostgREST already
 * retries fixes that — but a decline is only safe if PostgREST actually picks it up. A failure this
 * wrapper declines and PostgREST also declines is a request that simply dies, and that is the
 * failure mode a narrowing fix introduces if it is even slightly too wide.
 *
 * So the table asserts BOTH directions across every (method, outcome) pair:
 *   - no pair where both layers retry      → the multiplication cannot come back
 *   - no pair this wrapper declines and PostgREST does not → no orphaned request
 *
 * PostgREST's behaviour is restated here INDEPENDENTLY of the mirror in retryEligibility.ts. If the
 * table imported the same constant it checks, it would be a tautology; written out separately, a
 * mistake in the mirror shows up as a disagreement. `postgrestRetryContract.test.ts` is what keeps
 * this restatement honest against the installed package.
 */
import { describe, expect, test } from "vitest";

import { postgrestOwnsRetry } from "@/lib/supabase/retryEligibility";
import { RETRYABLE_STATUSES } from "@/lib/supabase/retryingFetch";
import { premise } from "../_shared/premise";

const METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PATCH", "DELETE"] as const;

type Outcome = { label: string; status?: number; err: boolean; abort: boolean };
const OUTCOMES: readonly Outcome[] = [
  { label: "200", status: 200, err: false, abort: false },
  { label: "502", status: 502, err: false, abort: false },
  { label: "503", status: 503, err: false, abort: false },
  { label: "504", status: 504, err: false, abort: false },
  { label: "520", status: 520, err: false, abort: false },
  { label: "429", status: 429, err: false, abort: false },
  { label: "network error", err: true, abort: false },
  { label: "our timeout abort", err: true, abort: true },
];

/** PostgREST's own rule, restated rather than imported. See the file header for why. */
function postgrestWouldRetry(m: string, o: Outcome): boolean {
  if (!["GET", "HEAD", "OPTIONS"].includes(m)) return false;
  if (o.abort) return false; // it rethrows aborts rather than retrying them
  if (o.err) return true;
  return o.status !== undefined && [520, 503].includes(o.status);
}

/** What this wrapper does with the outcome once the decline check has run. */
function weWouldRetry(m: string, o: Outcome): boolean {
  if (postgrestOwnsRetry(m, o.status, o.err, o.abort)) return false;
  return o.err || (o.status !== undefined && RETRYABLE_STATUSES.has(o.status));
}

describe("exactly one layer owns each retry", () => {
  test("the table is non-degenerate", () => {
    // no-premise: the table is built from literals in this file.
    premise("(method, outcome) pairs covered", METHODS.length * OUTCOMES.length, 1);
    // And the two rules genuinely disagree somewhere, or the table proves nothing: if they agreed
    // everywhere, "no overlap" would hold for a wrapper that retried nothing at all.
    const disagreements = METHODS.flatMap((m) =>
      OUTCOMES.filter((o) => postgrestWouldRetry(m, o) !== weWouldRetry(m, o)),
    );
    expect(disagreements.length).toBeGreaterThan(0);
  });

  test("NO pair is retried by both layers — the multiplication cannot return", () => {
    // no-premise: as above.
    const both = METHODS.flatMap((m) =>
      OUTCOMES.filter((o) => postgrestWouldRetry(m, o) && weWouldRetry(m, o)).map(
        (o) => `${m} ${o.label}`,
      ),
    );
    expect(both).toEqual([]);
  });

  test("NO decline is orphaned — everything we decline, PostgREST retries", () => {
    // no-premise: as above.
    //
    // The direction a narrowing fix gets wrong. Declining too widely does not multiply anything; it
    // silently drops requests, which is worse and much harder to notice.
    const orphaned = METHODS.flatMap((m) =>
      OUTCOMES.filter(
        (o) => postgrestOwnsRetry(m, o.status, o.err, o.abort) && !postgrestWouldRetry(m, o),
      ).map((o) => `${m} ${o.label}`),
    );
    expect(orphaned).toEqual([]);
  });

  test("an ABSENT method is treated as GET, because that is what fetch does", () => {
    // no-premise: literal inputs.
    //
    // `fetch(url)` with no init carries no method and IS a GET, so `method ?? "GET"` is the whole
    // reason such a request gets declined to PostgREST at all. Found by planting on this module,
    // which no mutation score covers: changing the default to "POST" passed all 57 cases, and under
    // it a plain `fetch(url)` returning 503 would be retried by BOTH layers — the multiplication
    // back, for exactly the request shape the wrapper is installed for.
    expect(postgrestOwnsRetry(undefined, 503, false, false)).toBe(true);
    expect(postgrestOwnsRetry(undefined, 502, false, false)).toBe(false);
    // And it must agree with what the wrapper itself concludes for the same absent method.
    expect(postgrestOwnsRetry("GET", 503, false, false)).toBe(
      postgrestOwnsRetry(undefined, 503, false, false),
    );
  });

  test("the method comparison is case-insensitive", () => {
    // no-premise: literal inputs.
    //
    // A caller may pass "get". Without the case fold the lookup misses, nothing is declined, and
    // both layers retry it. Cheap to pin and invisible until it happens.
    for (const m of ["get", "Get", "hEaD", "options"]) {
      expect(postgrestOwnsRetry(m, 503, false, false), m).toBe(true);
    }
    // The negative direction too, so this cannot pass by declining everything.
    for (const m of ["post", "Patch", "delete"]) {
      expect(postgrestOwnsRetry(m, 503, false, false), m).toBe(false);
    }
  });

  test("our own timeout is never declined, on any method", () => {
    // no-premise: as above. PostgREST rethrows aborts, so declining one orphans it by construction.
    const abort = OUTCOMES.find((o) => o.abort)!;
    for (const m of METHODS) {
      expect(postgrestOwnsRetry(m, abort.status, abort.err, abort.abort), m).toBe(false);
    }
  });
});
