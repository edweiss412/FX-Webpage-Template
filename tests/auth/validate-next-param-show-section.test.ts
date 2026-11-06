/**
 * tests/auth/validate-next-param-show-section.test.ts (Task 12, R4-HIGH-1)
 *
 * The auth-boundary unit test for the ONE surgical relaxation of
 * `validateNextParamDetailed`: on a tokenized crew-route `next`
 * (`/show/<slug>/<64-hex-token>`), re-attach ONLY the allow-listed query
 * params — `s` when `canonicalSectionParam` admits it, written as the id it
 * returns, and `gate` ∈ ALLOWED_GATE_VALUES — and DROP every other param. Everything else (the
 * off-origin / disallowed-prefix rejection, the control-char / `\` / `%2e%2e`
 * rejection, the strip-the-query behavior for NON-show paths) is UNCHANGED.
 *
 * SECURITY: this must NOT become an open-redirect / param-injection
 * regression. A `next` carrying `?evil=1&token=secret` on a show URL must
 * arrive with NEITHER param — only the safe `s`/`gate` subset survives.
 *
 * Concrete failure modes caught:
 *   - validator re-attaches arbitrary query params on show URLs → param
 *     smuggling through the OAuth round-trip.
 *   - validator relaxes the query for NON-show paths too (e.g. /admin?foo=1
 *     keeps ?foo=1) → regresses the strip-everything OAuth posture.
 *   - validator carries an INVALID `s`/`gate` (bogus section / unknown gate).
 */
import { beforeEach, describe, expect, test } from "vitest";

import { validateNextParamDetailed, DEFAULT_AUTH_NEXT_PATH } from "@/lib/auth/validateNextParam";
import { CREW_SECTION_IDS, LEGACY_SECTION_ALIASES } from "@/lib/crew/resolveActiveSection";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const TOKEN = "a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";
const SHOW = `/show/rpas-central/${TOKEN}`;

describe("validateNextParamDetailed — show-route section/gate preservation", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
  });

  test("allow-listed s + gate on a tokenized show URL are PRESERVED (the R4-HIGH-1 regression)", () => {
    expect(validateNextParamDetailed(`${SHOW}?s=venue&gate=skip`)).toEqual({
      ok: true,
      path: `${SHOW}?s=venue&gate=skip`,
    });
  });

  test("each allow-listed key survives independently", () => {
    expect(validateNextParamDetailed(`${SHOW}?s=schedule`)).toEqual({
      ok: true,
      path: `${SHOW}?s=schedule`,
    });
    expect(validateNextParamDetailed(`${SHOW}?gate=skip`)).toEqual({
      ok: true,
      path: `${SHOW}?gate=skip`,
    });
    expect(validateNextParamDetailed(`${SHOW}?s=billing`)).toEqual({
      ok: true,
      path: `${SHOW}?s=billing`,
    });
  });

  test("every crew section id and today round-trip, with a gate exactly when the next carries one", () => {
    premise("crew section ids", CREW_SECTION_IDS.length, 0);
    for (const id of ["today", ...CREW_SECTION_IDS]) {
      expect(validateNextParamDetailed(`${SHOW}?s=${id}`), id).toEqual({
        ok: true,
        path: `${SHOW}?s=${id}`,
      });
      expect(validateNextParamDetailed(`${SHOW}?s=${id}&gate=skip`), id).toEqual({
        ok: true,
        path: `${SHOW}?s=${id}&gate=skip`,
      });
    }
  });

  test("an alias comes back as the id that replaced it, keeping a gate it was given", () => {
    premise("legacy aliases", Object.keys(LEGACY_SECTION_ALIASES).length, 0);
    for (const [alias, id] of Object.entries(LEGACY_SECTION_ALIASES)) {
      expect(validateNextParamDetailed(`${SHOW}?s=${alias}&gate=skip`), alias).toEqual({
        ok: true,
        path: `${SHOW}?s=${id}&gate=skip`,
      });
    }
  });

  test("budget comes back as billing, with and without a gate (Task 4)", () => {
    expect(validateNextParamDetailed(`${SHOW}?s=budget`)).toEqual({
      ok: true,
      path: `${SHOW}?s=billing`,
    });
    expect(validateNextParamDetailed(`${SHOW}?s=budget&gate=skip`)).toEqual({
      ok: true,
      path: `${SHOW}?s=billing&gate=skip`,
    });
  });

  test("travel comes back as hotels, with and without a gate (PR B Task 9, the OAuth return)", () => {
    expect(validateNextParamDetailed(`${SHOW}?s=travel`)).toEqual({
      ok: true,
      path: `${SHOW}?s=hotels`,
    });
    expect(validateNextParamDetailed(`${SHOW}?s=travel&gate=skip`)).toEqual({
      ok: true,
      path: `${SHOW}?s=hotels&gate=skip`,
    });
  });

  test("gear alias: gear comes back as rooms, with and without a gate (PR C Task 8, the OAuth return)", () => {
    premiseHolds("the aliases hold gear", Object.hasOwn(LEGACY_SECTION_ALIASES, "gear"));
    expect(validateNextParamDetailed(`${SHOW}?s=gear`)).toEqual({
      ok: true,
      path: `${SHOW}?s=rooms`,
    });
    expect(validateNextParamDetailed(`${SHOW}?s=gear&gate=skip`)).toEqual({
      ok: true,
      path: `${SHOW}?s=rooms&gate=skip`,
    });
  });

  test("an unknown s is dropped and a passed gate kept", () => {
    expect(validateNextParamDetailed(`${SHOW}?s=constructor&gate=skip`)).toEqual({
      ok: true,
      path: `${SHOW}?gate=skip`,
    });
  });

  test("a show URL with NO query still returns the bare path (existing behavior)", () => {
    expect(validateNextParamDetailed(SHOW)).toEqual({ ok: true, path: SHOW });
  });

  test("bogus s + injected params on a show URL → ONLY the safe subset survives", () => {
    // s=bogus is not in the allow-list → dropped; evil/token never re-attach.
    const out = validateNextParamDetailed(`${SHOW}?s=bogus&evil=1&token=secret`);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.path).toBe(SHOW);
      expect(out.path).not.toContain("s=");
      expect(out.path).not.toContain("evil");
      expect(out.path).not.toContain("token");
    }
  });

  test("injected params alongside a VALID s → only s survives, injected dropped", () => {
    const out = validateNextParamDetailed(`${SHOW}?s=crew&evil=1&token=secret`);
    expect(out).toEqual({ ok: true, path: `${SHOW}?s=crew` });
  });

  test("an unknown gate value is dropped (only ALLOWED_GATE_VALUES survive)", () => {
    expect(validateNextParamDetailed(`${SHOW}?gate=evil`)).toEqual({ ok: true, path: SHOW });
  });

  test("NON-show path with a query is stripped to bare pathname (UNCHANGED OAuth posture)", () => {
    expect(validateNextParamDetailed("/admin?foo=1")).toEqual({ ok: true, path: "/admin" });
    expect(validateNextParamDetailed("/me/profile?s=venue")).toEqual({
      ok: true,
      path: "/me/profile",
    });
  });

  test("off-origin / disallowed-prefix next is still rejected (UNCHANGED)", () => {
    expect(validateNextParamDetailed("https://attacker.example/show/x?s=venue")).toEqual({
      ok: false,
      path: DEFAULT_AUTH_NEXT_PATH,
      code: "OAUTH_REDIRECT_INVALID",
    });
    expect(validateNextParamDetailed("/auth/sign-in?s=venue")).toEqual({
      ok: false,
      path: DEFAULT_AUTH_NEXT_PATH,
      code: "OAUTH_REDIRECT_INVALID",
    });
    // slug-only show URL (no token) is still rejected even with a valid s.
    expect(validateNextParamDetailed("/show/rpas-central?s=venue")).toEqual({
      ok: false,
      path: DEFAULT_AUTH_NEXT_PATH,
      code: "OAUTH_REDIRECT_INVALID",
    });
  });
});
