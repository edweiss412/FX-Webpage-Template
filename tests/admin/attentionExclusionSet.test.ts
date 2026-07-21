/**
 * tests/admin/attentionExclusionSet.test.ts
 * (plan Task 6; spec §5, §11 meta-test 1, §12 tests 11 and 12)
 *
 * `DOUG_EXCLUDED_CODES` (lib/adminAlerts/audience.ts:34) is the info-severity
 * union health set that `docs/superpowers/specs/alerts/2026-07-04-alert-audience-split.md`
 * §3 ratified as excluded from Doug's surfaces. It had ZERO production consumers:
 * the amber banner it governed was `PerShowAlertSection`, which the attention
 * surface replaced, and the exclusion silently stopped applying. This wires it
 * into `deriveAttentionItems`, which is a regression repair rather than new
 * policy.
 *
 * Proving the filter is SET-DRIVEN is the hard part. Only two set members carry
 * an `ATTENTION_ROUTES` row today, so behavior over the live set cannot
 * distinguish a set-driven implementation from a two-code hand-list, and a
 * source scan cannot distinguish it from one that slices the set's first two
 * members. An injected set can: see the disjoint-sets test below.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { DOUG_EXCLUDED_CODES } from "@/lib/adminAlerts/audience";
import type { AttentionAlertInput } from "@/lib/admin/attentionItems";

const SLUG = "exclusion-fixture-show";

/**
 * ONE canonical row factory, varying only `id` and `code`.
 *
 * Every retained route must receive an input that each pre-filter step and
 * `toAlertItem` accept, or a complement failure is ambiguous between "the filter
 * dropped it" and "the fixture was invalid" (plan review R1b).
 */
function row(code: string, n: number): AttentionAlertInput {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    code,
    context: null,
    raised_at: "2026-07-20T12:00:00.000Z",
    occurrence_count: 1,
    identityText: null,
    messageParams: {},
    crewName: null,
  };
}

function derive(alerts: AttentionAlertInput[], excludedCodes?: readonly string[]) {
  return deriveAttentionItems({
    alerts,
    feed: null,
    slug: SLUG,
    ...(excludedCodes !== undefined ? { excludedCodes } : {}),
  });
}

/** Routed codes that production KEEPS: not excluded, and not the pre-existing
 *  PICKER_EPOCH_RESET cut. Derived from the live registry. */
const RETAINED_ROUTED_CODES = Object.keys(ATTENTION_ROUTES).filter(
  (c) => !DOUG_EXCLUDED_CODES.includes(c) && c !== "PICKER_EPOCH_RESET",
);

describe("the exclusion is set-driven, proven by injection", () => {
  it("two DISJOINT injected sets each drop their OWN member and keep the other's", () => {
    // A single static injection can be absorbed into a hand-list; two disjoint
    // sets cannot, short of reimplementing set membership (plan review R4b
    // finding 11).
    const [a, b] = RETAINED_ROUTED_CODES;
    expect(a, "the registry has at least two retained routed codes").toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);

    const alerts = [row(a!, 1), row(b!, 2)];

    const dropA = derive(alerts, [a!]);
    expect(dropA.map((i) => i.alert?.code)).toEqual([b]);

    const dropB = derive(alerts, [b!]);
    expect(dropB.map((i) => i.alert?.code)).toEqual([a]);
  });

  it("an empty injected set drops nothing, so the filter is not unconditional", () => {
    const [a, b] = RETAINED_ROUTED_CODES;
    const kept = derive([row(a!, 1), row(b!, 2)], []);
    expect(kept.length).toBe(2);
  });
});

describe("the default set, over the live registry", () => {
  it("drops every DOUG_EXCLUDED_CODES member", () => {
    // Forward-looking net: the two currently routable members are covered by the
    // named test below, and this catches the next member to gain a route.
    const alerts = DOUG_EXCLUDED_CODES.map((c, i) => row(c, i + 1));
    expect(alerts.length).toBeGreaterThan(0);
    expect(derive(alerts)).toEqual([]);
  });

  it("KEEPS every routed code that is neither excluded nor the PICKER_EPOCH_RESET cut", () => {
    // The complement. Without it, an implementation that dropped routes it
    // should keep would pass every other assertion here (plan review R4b
    // finding 12).
    expect(RETAINED_ROUTED_CODES.length).toBeGreaterThan(0);
    const alerts = RETAINED_ROUTED_CODES.map((c, i) => row(c, i + 1));
    const survived = derive(alerts).map((i) => i.alert?.code);
    expect(new Set(survived)).toEqual(new Set(RETAINED_ROUTED_CODES));
  });
});

describe("the four named codes", () => {
  it("drops the two receipts and keeps the two that describe a real state", () => {
    const alerts = [
      row("ROLE_FLAGS_NOTICE", 1),
      row("SHOW_FIRST_PUBLISHED", 2),
      row("SHOW_UNPUBLISHED", 3),
      row("LIVE_ROW_CONFLICT", 4),
    ];
    const codes = derive(alerts).map((i) => i.alert?.code);
    expect(codes).not.toContain("ROLE_FLAGS_NOTICE");
    expect(codes).not.toContain("SHOW_FIRST_PUBLISHED");
    expect(codes).toContain("SHOW_UNPUBLISHED");
    expect(codes).toContain("LIVE_ROW_CONFLICT");
  });

  it("PICKER_EPOCH_RESET stays cut by its own clause, independently of this set", () => {
    // It is not info-severity, so the new filter must not be what removes it.
    expect(DOUG_EXCLUDED_CODES).not.toContain("PICKER_EPOCH_RESET");
    expect(derive([row("PICKER_EPOCH_RESET", 1)])).toEqual([]);
  });
});

describe("the seam is test-only", () => {
  it("no non-test source file passes excludedCodes to deriveAttentionItems", () => {
    // An exported optional parameter is externally usable production API, so
    // seam and production semantics could drift through ordinary call-site
    // evolution. Stated limit: this sees the DIRECT form, which is the form a
    // future caller would actually write, and not a value forwarded through a
    // spread, an alias, or a wrapper.
    const callers = ["app/admin/_showReviewModal.tsx"];
    for (const rel of callers) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src).toContain("deriveAttentionItems");
      expect(src, `${rel} must not pass the test seam`).not.toContain("excludedCodes");
    }
  });
});
