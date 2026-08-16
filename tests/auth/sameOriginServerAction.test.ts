/**
 * tests/auth/sameOriginServerAction.test.ts
 *
 * The §3.3 truth table of the same-origin Server Action gate, one row per
 * `{sec-fetch-site} × {origin}` combination
 * (docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md §3.3).
 *
 * Anti-tautology: the PRECEDENCE rows pin both directions of "sec-fetch-site
 * wins over origin". A naive `origin === site` fallback consulted first would
 * wrongly ALLOW `cross-site` + matching origin; an implementation that lets a
 * mismatching Origin override the Fetch-Metadata verdict would wrongly REJECT
 * `same-origin` + mismatching origin. Both shapes fail here.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const headerMap = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerMap.get(k.toLowerCase()) ?? null }),
}));

import { isSameOriginServerAction } from "@/lib/auth/sameOriginServerAction";

const SITE = "https://crew.example.com";
beforeEach(() => {
  headerMap.clear();
  vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", SITE);
});

const EVIL = "https://evil.example.com";

/**
 * The COMPLETE cross-product: 5 `sec-fetch-site` states × 3 `origin` states.
 *
 * Enumerated in full rather than sampled, because a partial table is a hole the
 * shape of the omitted cells. Round 1 of the diff review demonstrated exactly
 * that: an earlier 11-row table omitted four cells, and a mutant that read
 * "when Fetch Metadata is present but the Origin MISMATCHES, allow" passed
 * every committed row while allowing `cross-site` + an attacker Origin — the
 * precise CSRF request this gate exists to refuse.
 *
 * Expectations are written per cell by hand, never derived from the same rule
 * the implementation applies; a table computed from the rule would only prove
 * the rule agrees with itself.
 */
const SFS_STATES = ["same-origin", "none", "same-site", "cross-site", null] as const;
const ORIGIN_STATES = [SITE, EVIL, null] as const;

const cases: Array<[string, Record<string, string>, boolean]> = [
  // sec-fetch-site WINS whenever present. Its verdict is identical across all
  // three origin states, which is what these first twelve rows pin.
  ["same-origin + matching origin", { "sec-fetch-site": "same-origin", origin: SITE }, true],
  ["same-origin + MISMATCHING origin", { "sec-fetch-site": "same-origin", origin: EVIL }, true],
  ["same-origin + no origin", { "sec-fetch-site": "same-origin" }, true],

  ["none + matching origin", { "sec-fetch-site": "none", origin: SITE }, true],
  ["none + MISMATCHING origin", { "sec-fetch-site": "none", origin: EVIL }, true],
  ["none + no origin", { "sec-fetch-site": "none" }, true],

  ["same-site + matching origin", { "sec-fetch-site": "same-site", origin: SITE }, false],
  ["same-site + MISMATCHING origin", { "sec-fetch-site": "same-site", origin: EVIL }, false],
  ["same-site + no origin", { "sec-fetch-site": "same-site" }, false],

  // The filed bypass and its neighbours. `cross-site` is refused on every
  // origin state, including the attacker-supplied one.
  ["cross-site + matching origin", { "sec-fetch-site": "cross-site", origin: SITE }, false],
  ["cross-site + MISMATCHING origin", { "sec-fetch-site": "cross-site", origin: EVIL }, false],
  ["cross-site + no origin (the documented bypass)", { "sec-fetch-site": "cross-site" }, false],

  // The Origin fallback is consulted ONLY when sec-fetch-site is absent.
  ["no sfs + matching origin", { origin: SITE }, true],
  ["no sfs + MISMATCHING origin", { origin: EVIL }, false],
  ["no sfs + no origin (documented limit: framework default preserved)", {}, true],
];

describe("isSameOriginServerAction", () => {
  it("enumerates the COMPLETE sec-fetch-site x origin cross-product", () => {
    // A derived cover, not a hand-counted one: the assertion is against the
    // cross-product itself, so a cell added to either axis fails here until the
    // table grows to match, rather than silently going untested.
    const expectedKeys = new Set(
      SFS_STATES.flatMap((s) => ORIGIN_STATES.map((o) => `${String(s)}|${String(o)}`)),
    );
    const actualKeys = new Set(
      cases.map(([, h]) => `${h["sec-fetch-site"] ?? "null"}|${h["origin"] ?? "null"}`),
    );
    expect(actualKeys).toEqual(expectedKeys);
    expect(cases.length).toBe(expectedKeys.size);
  });

  it.each(cases)("%s", async (_label, hdrs, expected) => {
    for (const [k, v] of Object.entries(hdrs)) headerMap.set(k, v);
    expect(await isSameOriginServerAction()).toBe(expected);
  });

  it("rejects an Origin fallback when the site origin is unresolvable (no sfs, blank env)", async () => {
    // resolveSiteOrigin returns { ok: false } for blank/localhost, so the fallback
    // has no trusted constant to compare against and must NOT allow. An
    // implementation that ignored `site.ok` would allow any Origin here.
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "");
    headerMap.set("origin", SITE);
    expect(await isSameOriginServerAction()).toBe(false);
  });
});
