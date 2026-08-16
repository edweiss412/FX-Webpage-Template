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

const cases: Array<[string, Record<string, string>, boolean]> = [
  ["sfs same-origin", { "sec-fetch-site": "same-origin" }, true],
  ["sfs none", { "sec-fetch-site": "none" }, true],
  ["sfs same-site", { "sec-fetch-site": "same-site" }, false],
  ["sfs cross-site", { "sec-fetch-site": "cross-site" }, false],
  // PRECEDENCE both directions (R2-F8): sec-fetch-site wins over origin whenever present.
  [
    "sfs cross-site + matching origin (sfs wins → reject)",
    { "sec-fetch-site": "cross-site", origin: SITE },
    false,
  ],
  [
    "sfs same-origin + MISMATCHING origin (sfs wins → allow)",
    { "sec-fetch-site": "same-origin", origin: "https://evil.example.com" },
    true,
  ],
  [
    "sfs none + MISMATCHING origin (sfs wins → allow)",
    { "sec-fetch-site": "none", origin: "https://evil.example.com" },
    true,
  ],
  [
    "sfs same-site + matching origin (sfs wins → reject)",
    { "sec-fetch-site": "same-site", origin: SITE },
    false,
  ],
  // origin fallback consulted ONLY when sec-fetch-site is absent:
  ["no sfs, origin === site", { origin: SITE }, true],
  ["no sfs, origin !== site", { origin: "https://evil.example.com" }, false],
  ["neither signal", {}, true],
];

describe("isSameOriginServerAction", () => {
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
