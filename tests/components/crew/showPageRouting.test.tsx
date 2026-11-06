// @vitest-environment node
/**
 * tests/components/crew/showPageRouting.test.tsx (Task 12)
 *
 * Unit-pins `buildShowReturnUrl` — the single builder every redirect path
 * (clearIdentity ?gate=skip, selectIdentity claimed-row sign-in recovery,
 * page.tsx needs_picker_bootstrap + gate=skip honor, _SignInOrSkipGate
 * encodedNext + CTA, _PickerInterstitial hidden inputs) uses to carry the
 * `?s=` section deep-link and `?gate=` through to the destination URL.
 *
 * Allow-lists are imported from the single source of truth
 * (lib/crew/resolveActiveSection.ts): `canonicalSectionParam` for `s`
 * (`CREW_SECTION_IDS`, `today` and the legacy aliases, written as the current
 * id), `ALLOWED_GATE_VALUES` for `gate`. The builder DROPS anything else —
 * an arbitrary `s`/`gate` must never reach the URL (open-redirect / param
 * smuggling defense, mirrored at the validateNextParam boundary).
 *
 * Concrete failure modes caught:
 *   - builder forgets to validate `s` against the allow-list → `?s=bogus`
 *     leaks into a redirect URL.
 *   - builder validates `s` but clobbers `gate` (or vice-versa) when only
 *     one is present → a deep-link drops the section on the gate path.
 *   - builder emits a `?`/`&` for an absent/invalid param → malformed URL.
 */
import { describe, expect, test } from "vitest";

import { buildShowReturnUrl } from "@/lib/crew/buildShowReturnUrl";
import { CREW_SECTION_IDS, LEGACY_SECTION_ALIASES } from "@/lib/crew/resolveActiveSection";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const SLUG = "rpas-central";
const TOKEN = "a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";
const BASE = `/show/${SLUG}/${TOKEN}`;

describe("buildShowReturnUrl", () => {
  test("bare base when no options", () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, {})).toBe(BASE);
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: undefined, gate: undefined })).toBe(BASE);
  });

  test("valid s + valid gate → both carried, s first then gate", () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "venue", gate: "skip" })).toBe(
      `${BASE}?s=venue&gate=skip`,
    );
  });

  test("invalid s alone → dropped (no ?s=bogus)", () => {
    const url = buildShowReturnUrl(SLUG, TOKEN, { s: "bogus" });
    expect(url).toBe(BASE);
    expect(url).not.toContain("bogus");
    expect(url).not.toContain("s=");
  });

  test("invalid s + valid gate → s dropped, gate carried (gate not clobbered)", () => {
    const url = buildShowReturnUrl(SLUG, TOKEN, { s: "bogus", gate: "skip" });
    expect(url).toBe(`${BASE}?gate=skip`);
    expect(url).not.toContain("bogus");
  });

  test("valid s alone → carried independently (gate not required)", () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "venue" })).toBe(`${BASE}?s=venue`);
  });

  test("valid gate alone → carried independently (s not required)", () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { gate: "skip" })).toBe(`${BASE}?gate=skip`);
  });

  test("invalid gate alone → dropped (no ?gate=evil)", () => {
    const url = buildShowReturnUrl(SLUG, TOKEN, { gate: "evil" });
    expect(url).toBe(BASE);
    expect(url).not.toContain("evil");
    expect(url).not.toContain("gate=");
  });

  test('"billing" is an accepted section value (entitlement is gated downstream, not here)', () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "billing" })).toBe(`${BASE}?s=billing`);
  });

  test('the old "budget" is written as "billing", and a gate it was given is kept (Task 4)', () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "budget" })).toBe(`${BASE}?s=billing`);
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "budget", gate: "skip" })).toBe(
      `${BASE}?s=billing&gate=skip`,
    );
  });

  test('the old "travel" is written as "hotels", and a gate it was given is kept (PR B Task 9)', () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "travel" })).toBe(`${BASE}?s=hotels`);
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "travel", gate: "skip" })).toBe(
      `${BASE}?s=hotels&gate=skip`,
    );
  });

  test('gear alias: the old "gear" is written as "rooms", and a gate it was given is kept (PR C Task 8)', () => {
    premiseHolds("the aliases hold gear", Object.hasOwn(LEGACY_SECTION_ALIASES, "gear"));
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "gear" })).toBe(`${BASE}?s=rooms`);
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "gear", gate: "skip" })).toBe(
      `${BASE}?s=rooms&gate=skip`,
    );
  });

  test("every crew section id and today round-trip, with a gate exactly when the caller passes one", () => {
    premise("crew section ids", CREW_SECTION_IDS.length, 0);
    for (const id of ["today", ...CREW_SECTION_IDS]) {
      expect(buildShowReturnUrl(SLUG, TOKEN, { s: id }), id).toBe(`${BASE}?s=${id}`);
      expect(buildShowReturnUrl(SLUG, TOKEN, { s: id, gate: "skip" }), id).toBe(
        `${BASE}?s=${id}&gate=skip`,
      );
    }
  });

  test("an alias is written as the id that replaced it, keeping a gate it was given", () => {
    premise("legacy aliases", Object.keys(LEGACY_SECTION_ALIASES).length, 0);
    for (const [alias, id] of Object.entries(LEGACY_SECTION_ALIASES)) {
      expect(buildShowReturnUrl(SLUG, TOKEN, { s: alias, gate: "skip" }), alias).toBe(
        `${BASE}?s=${id}&gate=skip`,
      );
    }
  });

  test("an inherited object key is not a section", () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "constructor", gate: "skip" })).toBe(
      `${BASE}?gate=skip`,
    );
  });

  test("does not carry arbitrary-looking smuggled gate/section values", () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: "../admin", gate: "skip&evil=1" })).toBe(BASE);
  });
});
