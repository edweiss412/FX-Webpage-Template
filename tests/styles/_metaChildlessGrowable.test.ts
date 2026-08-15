/**
 * Structural guard: no childless, unpainted, growable flex item anywhere
 * under components/ or app/. Spec (canonical for every predicate and probe):
 * docs/superpowers/specs/2026-07-26-childless-growable-static-guard-design.md
 *
 * Task 1 scope: token-level predicates (normalization, growability, extent,
 * paint-set membership). Table-driven both directions per the plan's
 * predicate-level non-vacuity contract: each table's length is asserted so a
 * silently dropped row fails, and every predicate has accept AND reject rows.
 */
import { describe, expect, it } from "vitest";

import {
  PAINT_TOKENS,
  extentFromToken,
  growableFromToken,
  normalizeToken,
} from "./_childlessGrowableScan";

/** Spec §6.4 "growable" line, verbatim order. */
const GROWABLE = [
  "flex-1",
  "flex-2",
  "flex-1/2",
  "flex-auto",
  "grow",
  "grow-2",
  "grow-[1.5]",
  "flex-[2_1_0%]",
  "!flex-1",
  "flex-1!",
  "grow-(--x)",
  "flex-(--x)",
  "grow-[calc(1)]",
  "flex-[var(--x)]",
  "[flex-grow:1]",
  "[flex:1]",
  "[flex:1_1_0%]",
  "flex-[0px]",
  "[flex:0px]",
] as const;

/** Spec §6.4 "not growable" line (class-token surfaces only). */
const NOT_GROWABLE = [
  "grow-0",
  "grow-[0]",
  "grow-[0.0]",
  "flex-0",
  "flex-none",
  "flex-initial",
  "flex-[0_1_auto]",
  "[flex-grow:0]",
  "[flex:0_1_auto]",
  "grow-[-1]",
  "flex-[-1]",
  "[flex-grow:-1]",
  "[flex:-1]",
  "grow-[-.5]",
  "flex-[-.5]",
  "[flex-grow:-.5]",
  "[flex:-.5]",
  "flex",
  "flex-row",
  "flex-row-reverse",
  "flex-col",
  "flex-col-reverse",
  "flex-wrap",
  "flex-nowrap",
  "flex-wrap-reverse",
  "basis-40",
  "basis-full",
  "shrink",
  "shrink-0",
  "shrink-2",
] as const;

/** Spec §6.4 growable-fail-closed / shorthand-semantics line. */
const GROWABLE_FAIL_CLOSED = ["[flex-grow:junk]", "flex-0/1", "flex-junk", "grow-junk"] as const;

/** Spec §6.4 variant/important interaction line — all growable. */
const VARIANT_GROWABLE = [
  "max-sm:flex-1",
  "min-[480px]:flex-1",
  "[&>*]:flex-1",
  "sm:grow-(--x)",
  "sm:!flex-1",
  "[&>*]:!grow-2",
  "sm:flex-1!",
] as const;

/** Spec §6.4 extent-requirement line: accepted forms. */
const EXTENT = [
  "h-px",
  "w-px",
  "h-1.5",
  "w-2",
  "min-h-4",
  "min-w-4",
  "size-2",
  "py-1",
  "px-1",
  "self-stretch",
  "h-[3px]",
  "w-[2rem]",
  "py-[0.5em]",
  "sm:h-px",
  "!h-px",
] as const;

/** Spec §6.4 extent-requirement line: rejected forms. */
const NOT_EXTENT = [
  "h-0",
  "h-auto",
  "h-[0px]",
  "h-[-3px]",
  "h-[0.0px]",
  "h-[50%]",
  "h-[3]",
  "h-[3vmin]",
  "h-[calc(3px)]",
  "h-[var(--x)]",
] as const;

describe("token predicates (spec §3.1, §4.2)", () => {
  it("pins the table sizes so a dropped probe row fails", () => {
    expect(GROWABLE).toHaveLength(19);
    expect(NOT_GROWABLE).toHaveLength(30);
    expect(GROWABLE_FAIL_CLOSED).toHaveLength(4);
    expect(VARIANT_GROWABLE).toHaveLength(7);
    expect(EXTENT).toHaveLength(15);
    expect(NOT_EXTENT).toHaveLength(10);
  });

  it.each([...GROWABLE, ...GROWABLE_FAIL_CLOSED, ...VARIANT_GROWABLE])("growable: %s", (token) => {
    expect(growableFromToken(token)).toBe(true);
  });

  it.each([...NOT_GROWABLE])("not growable: %s", (token) => {
    expect(growableFromToken(token)).toBe(false);
  });

  it.each([...EXTENT])("extent proven: %s", (token) => {
    expect(extentFromToken(token)).toBe(true);
  });

  it.each([...NOT_EXTENT])("extent NOT proven: %s", (token) => {
    expect(extentFromToken(token)).toBe(false);
  });

  it("normalization strips variants FIRST, then one important marker (§3.1 order)", () => {
    // sm:!flex-1 must normalize to flex-1 — the R2-finding-2 bypass.
    expect(normalizeToken("sm:!flex-1")).toBe("flex-1");
    expect(normalizeToken("[&>*]:!grow-2")).toBe("grow-2");
    expect(normalizeToken("sm:flex-1!")).toBe("flex-1");
    // bracket/paren depth awareness: the colon inside [...] or (...) is not a
    // variant separator.
    expect(normalizeToken("min-[480px]:flex-1")).toBe("flex-1");
    expect(normalizeToken("flex-(--x)")).toBe("flex-(--x)");
    expect(normalizeToken("[flex-grow:1]")).toBe("[flex-grow:1]");
  });

  it("paint-set membership is exact (spec §4.2a): the three members, nothing else", () => {
    expect([...PAINT_TOKENS].sort()).toEqual(["bg-accent", "bg-border", "border"]);
    for (const member of PAINT_TOKENS) expect(PAINT_TOKENS.has(member)).toBe(true);
    for (const nonMember of [
      "bg-cover",
      "border-accent-edge",
      "ring-2",
      "shadow-sm",
      "bg-surface",
      // Retired 2026-08-10 (§6.3 census-honesty): the wizard connector — its
      // last growable candidate — left `flex-1` and moved to the text ramp, so
      // membership would be a dead row. Pinned here so it cannot silently
      // return without a live candidate to justify it.
      "bg-border-strong",
    ]) {
      expect(PAINT_TOKENS.has(nonMember)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------------- *
 * Task 2: scanSource candidate classification (spec §3, §4, §6.4).
 *
 * Accept probes embed SENTINEL — a known violation on a distinctive <i> tag —
 * so an accidentally-empty scan cannot pass them (spec §6.4 anti-tautology):
 * the assertion is "exactly the sentinel violated," not "no violations."
 * ------------------------------------------------------------------------- */
import { scanSource } from "./_childlessGrowableScan";

const SENTINEL = `<i className="flex-1" />`;

function wrap(jsx: string): string {
  return `export function Probe({ cond, a, b, k, grow, dynamic, children, maybe, maybeStyle, growStyle, spacerStyle, spacerProps, styles, cn, pick, getStyle, getClasses, x, y, label, items }: any) {\n  return (<div>\n${jsx}\n${SENTINEL}\n</div>);\n}\n`;
}

/** The probe's first line inside wrap(): line 1 = function head, line 2 =
 *  return, line 3 = probe. The sentinel follows the (possibly multi-line)
 *  probe. Exact-line assertions keep a return-line-1-universally scanner from
 *  passing (whole-diff R1 finding 8). */
const PROBE_LINE = 3;
function sentinelLine(jsx: string): number {
  return PROBE_LINE + jsx.split("\n").length;
}

/** Accept probe: the probe element is fine; only SENTINEL violates, at its
 *  exact computed location. */
function expectAccepted(jsx: string) {
  const { violations } = scanSource(wrap(jsx), "probe.tsx");
  expect(violations).toHaveLength(1);
  expect(violations[0]?.tag).toBe("i");
  expect(violations[0]?.file).toBe("probe.tsx");
  expect(violations[0]?.line).toBe(sentinelLine(jsx));
}

/** Reject probe: probe violates with the given reason at its exact location
 *  (sentinel also fires). */
function expectViolation(
  jsx: string,
  reason: "unregistered-component" | "opaque-style-grow" | "unpainted-childless-dom",
  tag: string,
) {
  const { violations } = scanSource(wrap(jsx), "probe.tsx");
  const probe = violations.filter((v) => v.tag !== "i");
  expect(probe).toHaveLength(1);
  expect(probe[0]?.reason).toBe(reason);
  expect(probe[0]?.tag).toBe(tag);
  expect(probe[0]?.file).toBe("probe.tsx");
  expect(probe[0]?.line).toBe(PROBE_LINE);
  expect(violations.filter((v) => v.tag === "i")).toHaveLength(1);
}

describe("scanSource: childless / childed forms (spec §3.2)", () => {
  it("self-closing childless growable fails", () => {
    expectViolation(`<span className="flex-1" />`, "unpainted-childless-dom", "span");
  });
  it("empty element fails", () => {
    expectViolation(`<span className="flex-1"></span>`, "unpainted-childless-dom", "span");
  });
  it("whitespace-only text without newline fails", () => {
    expectViolation(`<span className="flex-1"> </span>`, "unpainted-childless-dom", "span");
  });
  it("whitespace-only text with CR fails", () => {
    const src = `export function P() { return (<div><span className="flex-1">\r</span>${SENTINEL}</div>); }`;
    const { violations } = scanSource(src, "probe.tsx");
    const probe = violations.filter((v) => v.tag === "span");
    expect(probe).toHaveLength(1);
    expect(probe[0]?.reason).toBe("unpainted-childless-dom");
    expect(probe[0]?.file).toBe("probe.tsx");
    expect(probe[0]?.line).toBe(1);
  });
  it("whitespace-only text with U+2028 fails", () => {
    expectViolation(`<span className="flex-1"> </span>`, "unpainted-childless-dom", "span");
  });
  it("whitespace-only text with U+2029 fails", () => {
    expectViolation(`<span className="flex-1"> </span>`, "unpainted-childless-dom", "span");
  });
  it("comment-only expression child fails", () => {
    expectViolation(
      `<span className="flex-1">{/* note */}</span>`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("{null} child fails", () => {
    expectViolation(`<span className="flex-1">{null}</span>`, "unpainted-childless-dom", "span");
  });
  it("{undefined} child fails", () => {
    expectViolation(
      `<span className="flex-1">{undefined}</span>`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("element child accepted", () => {
    expectAccepted(`<div className="flex-1"><b>x</b></div>`);
  });
  it("text child accepted", () => {
    expectAccepted(`<div className="flex-1">hello</div>`);
  });
  it("{cond && x} accepted", () => {
    expectAccepted(`<div className="flex-1">{cond && <b>x</b>}</div>`);
  });
  it("ternary child accepted", () => {
    expectAccepted(`<div className="flex-1">{cond ? <b>x</b> : null}</div>`);
  });
  it("{children} accepted", () => {
    expectAccepted(`<div className="flex-1">{children}</div>`);
  });
  it('{""} accepted', () => {
    expectAccepted(`<div className="flex-1">{""}</div>`);
  });
});

describe("scanSource: className harvesting (spec §3)", () => {
  it("no-substitution template literal is harvested", () => {
    expectViolation("<span className={`flex-1`} />", "unpainted-childless-dom", "span");
  });
  it("template with static growable part + dynamic tail fails closed", () => {
    expectViolation("<span className={`flex-1 ${dynamic}`} />", "unpainted-childless-dom", "span");
  });
  it("cn('flex-1', dynamic) fails closed", () => {
    expectViolation(
      `<span className={cn("flex-1", dynamic)} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("nested calls are harvested", () => {
    expectViolation(
      `<span className={cn(cn("flex-1"), dynamic)} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("join-array RECEIVER is harvested (the census-v1 miss)", () => {
    expectViolation(
      `<span className={["flex-1", cond ? "x" : "y"].join(" ")} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("clsx object keys are harvested", () => {
    expectViolation(
      `<span className={cn({ "flex-1": cond })} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("&& operand harvested", () => {
    expectViolation(`<span className={cond && "flex-1"} />`, "unpainted-childless-dom", "span");
  });
  it("|| operand harvested", () => {
    expectViolation(`<span className={x || "flex-1"} />`, "unpainted-childless-dom", "span");
  });
  it("?? operand harvested", () => {
    expectViolation(`<span className={x ?? "flex-1"} />`, "unpainted-childless-dom", "span");
  });
  it("+ operand harvested", () => {
    expectViolation(`<span className={"flex-1 " + dynamic} />`, "unpainted-childless-dom", "span");
  });
  it("arithmetic operator harvests nothing and marks opaque (no candidate)", () => {
    expectAccepted(`<span className={x * y} />`);
  });
  it("parenthesized expression harvested", () => {
    expectViolation(`<span className={("flex-1")} />`, "unpainted-childless-dom", "span");
  });
  it("as-wrapper is transparent (R2 finding 2)", () => {
    expectViolation(`<span className={"flex-1" as string} />`, "unpainted-childless-dom", "span");
  });
  it("satisfies-wrapper is transparent (R2 finding 2)", () => {
    expectViolation(
      `<span className={"flex-1" satisfies string} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("non-null wrapper is transparent (R2 finding 2)", () => {
    expectViolation(`<span className={"flex-1"!} />`, "unpainted-childless-dom", "span");
  });
  it("wrappers are transparent at harvesting depth (R2 finding 2)", () => {
    expectViolation(
      `<span className={cn("flex-1" as const, dynamic)} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("conditional branches harvested", () => {
    expectViolation(
      `<span className={cond ? "flex-1" : "w-4"} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
});

describe("scanSource: default-invisible className kinds (spec §7 row 1 accepted-limits)", () => {
  it("bare identifier: no candidate", () => {
    expectAccepted(`<span className={dynamic} />`);
  });
  it("call: no candidate", () => {
    expectAccepted(`<span className={getClasses()} />`);
  });
  it("member access: no candidate", () => {
    expectAccepted(`<span className={styles.spacer} />`);
  });
  it("fully-dynamic template: no candidate", () => {
    expectAccepted("<span className={`${x} ${y}`} />");
  });
  it("computed clsx key: no candidate", () => {
    expectAccepted(`<span className={cn({ [k]: true })} />`);
  });
});

describe("scanSource: split-token assembly (spec §7 row 7 accepted-limits)", () => {
  it('"flex-" + "1": no candidate', () => {
    expectAccepted(`<span className={"flex-" + "1"} />`);
  });
  it("template-split token: no candidate", () => {
    expectAccepted("<span className={`flex-${1}`} />");
  });
  it('["flex","1"].join("-"): no candidate', () => {
    expectAccepted(`<span className={["flex", "1"].join("-")} />`);
  });
});

describe("scanSource: paint + extent (spec §4.2, §6.4)", () => {
  it.each(["bg-border", "bg-accent", "border"])(
    "member %s with extent is painted (accepted)",
    (member) => {
      expectAccepted(`<span className="flex-1 h-px ${member}" />`);
    },
  );
  // `bg-border-strong` sits in the violation list, not the painted one: retired
  // from the set 2026-08-10 (§6.3), so a growable hairline reaching for it must
  // now fail — the probe is what makes the retirement executable.
  it.each(["bg-cover", "border-accent-edge", "ring-2", "shadow-sm", "bg-border-strong"])(
    "non-member %s does not paint (violation)",
    (token) => {
      expectViolation(
        `<span className="flex-1 h-px ${token}" />`,
        "unpainted-childless-dom",
        "span",
      );
    },
  );
  it.each(["border border-0", "border border-none", "border border-transparent"])(
    "border-family negator cancels: %s",
    (pair) => {
      expectViolation(
        `<span className="flex-1 h-px ${pair}" />`,
        "unpainted-childless-dom",
        "span",
      );
    },
  );
  it.each(["bg-border bg-transparent", "bg-border bg-none"])(
    "bg-family negator cancels: %s",
    (pair) => {
      expectViolation(
        `<span className="flex-1 h-px ${pair}" />`,
        "unpainted-childless-dom",
        "span",
      );
    },
  );
  it("cross-family isolation: border bg-transparent stays painted", () => {
    expectAccepted(`<span className="flex-1 h-px border bg-transparent" />`);
  });
  it("partial cancellation: bg-border border border-0 stays painted via bg-border", () => {
    expectAccepted(`<span className="flex-1 h-px bg-border border border-0" />`);
  });
  it("important-marked member paints: !bg-border", () => {
    expectAccepted(`<span className="flex-1 h-px !bg-border" />`);
  });
  it("important-marked negator cancels: border !border-0", () => {
    expectViolation(
      `<span className="flex-1 h-px border !border-0" />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it.each(["opacity-0", "invisible", "hover:opacity-0"])(
    "global neutralizer cancels all paint: %s",
    (neutralizer) => {
      expectViolation(
        `<span className="flex-1 h-px bg-border ${neutralizer}" />`,
        "unpainted-childless-dom",
        "span",
      );
    },
  );
  it("variant-prefixed member paints (the BulkIgnoreControls shape)", () => {
    expectAccepted(`<span className="flex-1 h-px min-[480px]:bg-border" />`);
  });
  it("paint WITHOUT extent fails (auto-height paints nothing)", () => {
    expectViolation(`<span className="flex-1 bg-border" />`, "unpainted-childless-dom", "span");
  });
  it.each([...NOT_EXTENT])("non-extent %s does not rescue (scan level)", (t) => {
    expectViolation(
      `<span className="flex-1 bg-border ${t}" />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("zero-pixel accepted-limits (§7 row 9): opacity-[0] and scale-y-0 stay accepted", () => {
    expectAccepted(`<span className="flex-1 h-px bg-border opacity-[0]" />`);
    expectAccepted(`<span className="flex-1 h-px bg-border scale-y-0" />`);
  });
  it("opts.paintTokens substitutes the paint set for probes", () => {
    const src = wrap(`<span className="flex-1 h-px bg-probe" />`);
    const { violations } = scanSource(src, "probe.tsx", { paintTokens: new Set(["bg-probe"]) });
    expect(violations).toHaveLength(1); // sentinel only — proves the scan ran
    expect(violations[0]?.tag).toBe("i");
  });
});

describe("scanSource: union-synthesis accepted-limits + negator-in-union reject (spec §7 row 5)", () => {
  it("one-branch paint with unconditional extent accepted", () => {
    expectAccepted(`<span className={["flex-1 h-px", cond ? "bg-border" : ""].join(" ")} />`);
  });
  it("cross-branch paint/extent synthesis accepted", () => {
    expectAccepted(
      `<span className={["flex-1", a ? "bg-border" : "", b ? "h-px" : ""].join(" ")} />`,
    );
  });
  it("falsy clsx key still contributes (truthiness ignored)", () => {
    expectAccepted(`<span className={cn("flex-1 bg-border", { "h-px": false })} />`);
  });
  it("selector-like call: paint-free second arg accepted via union", () => {
    expectAccepted(`<span className={pick("bg-border h-px", "rounded-full") + " flex-1"} />`);
  });
  it("negator-in-union REJECT: conditional bg-none cancels order-blind", () => {
    expectViolation(
      `<span className={cn("flex-1 h-px bg-border", cond && "bg-none")} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("correlated className/style cross-attribute synthesis accepted", () => {
    expectAccepted(
      `<span className={cond ? "h-px bg-border" : ""} style={cond ? undefined : { flexGrow: 1 }} />`,
    );
  });
  it("variant-only extent accepted at every viewport", () => {
    expectAccepted(`<span className="flex-1 bg-border sm:h-px" />`);
  });
});

describe("scanSource: style resolution (spec §3.1)", () => {
  it("style={{ flexGrow: 1 }} childless fails", () => {
    expectViolation(`<span style={{ flexGrow: 1 }} />`, "unpainted-childless-dom", "span");
  });
  it("style={{ flex: 1 }} childless fails", () => {
    expectViolation(`<span style={{ flex: 1 }} />`, "unpainted-childless-dom", "span");
  });
  it('style={{ flex: "1 1 0%" }} growable', () => {
    expectViolation(`<span style={{ flex: "1 1 0%" }} />`, "unpainted-childless-dom", "span");
  });
  it('style={{ flex: "0px" }} growable (unitful basis)', () => {
    expectViolation(`<span style={{ flex: "0px" }} />`, "unpainted-childless-dom", "span");
  });
  it("style={{ flexGrow: 0 }} not growable", () => {
    expectAccepted(`<span style={{ flexGrow: 0 }} />`);
  });
  it('style={{ flex: "0" }} not growable', () => {
    expectAccepted(`<span style={{ flex: "0" }} />`);
  });
  it("style={{ flexGrow: -1 }} not growable (invalid CSS)", () => {
    expectAccepted(`<span style={{ flexGrow: -1 }} />`);
  });
  it("string-literal key works", () => {
    expectViolation(`<span style={{ "flexGrow": 1 }} />`, "unpainted-childless-dom", "span");
  });
  it("computed key fails closed", () => {
    expectViolation(`<span style={{ [k]: 1 }} />`, "opaque-style-grow", "span");
  });
  it("computed METHOD key fails closed (R2 finding 1)", () => {
    expectViolation(`<span style={{ [k]() { return 1; } }} />`, "opaque-style-grow", "span");
  });
  it("computed GETTER key fails closed (R2 finding 1)", () => {
    expectViolation(`<span style={{ get [k]() { return 1; } }} />`, "opaque-style-grow", "span");
  });
  it("computed SETTER key fails closed (R2 finding 1)", () => {
    expectViolation(`<span style={{ set [k](v: number) {} }} />`, "opaque-style-grow", "span");
  });
  it("opaque value fails closed", () => {
    expectViolation(`<span style={{ flexGrow: grow }} />`, "opaque-style-grow", "span");
  });
  it("spread inside object fails closed", () => {
    expectViolation(`<span style={{ ...growStyle }} />`, "opaque-style-grow", "span");
  });
  it("conditional branch growable", () => {
    expectViolation(
      `<span style={cond ? { flexGrow: 1 } : undefined} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("&& operand growable", () => {
    expectViolation(`<span style={cond && { flexGrow: 1 }} />`, "unpainted-childless-dom", "span");
  });
  it("|| operand growable", () => {
    expectViolation(`<span style={maybe || { flexGrow: 1 }} />`, "unpainted-childless-dom", "span");
  });
  it("?? operand growable", () => {
    expectViolation(`<span style={maybe ?? { flexGrow: 1 }} />`, "unpainted-childless-dom", "span");
  });
  it("parenthesized style resolved", () => {
    expectViolation(`<span style={({ flexGrow: 1 })} />`, "unpainted-childless-dom", "span");
  });
  it("as-wrapper transparent", () => {
    expectViolation(`<span style={{ flexGrow: 1 } as any} />`, "unpainted-childless-dom", "span");
  });
  it("satisfies-wrapper transparent", () => {
    expectViolation(
      `<span style={{ flexGrow: 1 } satisfies object} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("non-null wrapper DISCRIMINATING probe: unwrap reaches the opaque object", () => {
    expectViolation(`<span style={({ flexGrow: grow })!} />`, "opaque-style-grow", "span");
  });
  it("DayCard shape: conditional style without flex keys is not growable", () => {
    expectAccepted(`<span style={cond ? { backgroundColor: "x" } : undefined} />`);
  });
  it.each(["spacerStyle", "getStyle()", "styles.spacer"])(
    "invisible style kind %s: no candidate",
    (expr) => {
      expectAccepted(`<span style={${expr}} />`);
    },
  );
});

describe("scanSource: components + reason precedence (spec §3, §4.3)", () => {
  it("unregistered childless growable component fails", () => {
    expectViolation(`<Foo className="flex-1" />`, "unregistered-component", "Foo");
  });
  it("visible paint + extent never rescues a component", () => {
    expectViolation(`<Foo className="flex-1 h-px bg-border" />`, "unregistered-component", "Foo");
  });
  it("registered tag accepted (live registry)", () => {
    expectAccepted(`<Skeleton className="flex-1" />`);
  });
  it("member-expression tag unregistered fails", () => {
    expectViolation(`<UI.Spacer className="flex-1" />`, "unregistered-component", "UI.Spacer");
  });
  it("dotted name registered via opts.registry accepted", () => {
    const src = wrap(`<UI.Spacer className="flex-1" />`);
    const { violations } = scanSource(src, "probe.tsx", { registry: new Set(["UI.Spacer"]) });
    expect(violations).toHaveLength(1); // sentinel only — proves the scan ran
    expect(violations[0]?.tag).toBe("i");
  });
  it("registered tag with children is not a childless candidate", () => {
    expectAccepted(`<Skeleton className="flex-1"><b>x</b></Skeleton>`);
  });
  it("precedence: unregistered component with opaque style grow reports unregistered-component", () => {
    expectViolation(`<Foo style={{ flexGrow: grow }} />`, "unregistered-component", "Foo");
  });
  it("precedence: DOM opaque style + no paint reports opaque-style-grow", () => {
    expectViolation(`<span style={{ flexGrow: grow }} />`, "opaque-style-grow", "span");
  });
  it("precedence: class token + opaque style reports unpainted-childless-dom", () => {
    expectViolation(
      `<span className="flex-1 h-px" style={{ flexGrow: grow }} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("mixed: painted DOM candidate with opaque style grow is ACCEPTED (painted wins)", () => {
    expectAccepted(`<span className="h-px bg-border" style={{ flexGrow: grow }} />`);
  });
});

describe("scanSource: spread (spec §6.4)", () => {
  it("static growable + spread + no paint still fails (spread does not launder)", () => {
    expectViolation(
      `<span className="flex-1" {...spacerProps} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("spread-ONLY growability: no candidate (§7 row 1 accepted-limit)", () => {
    expectAccepted(`<span {...spacerProps} />`);
  });
});

describe("scanSource: diagnostics carry a source label", () => {
  it("class violations label the growable token", () => {
    const { violations } = scanSource(wrap(`<span className="flex-1" />`), "probe.tsx");
    const probe = violations.find((v) => v.tag === "span");
    expect(probe?.sourceLabel).toBe("flex-1");
  });
  it("style-only violations label the style property source text", () => {
    const { violations } = scanSource(wrap(`<span style={{ flexGrow: grow }} />`), "probe.tsx");
    const probe = violations.find((v) => v.tag === "span");
    expect(probe?.sourceLabel).toContain("flexGrow: grow");
  });
});

/* ------------------------------------------------------------------------- *
 * Task 3: exemptions (spec §4.4 — template-verbatim claiming) + MDX (§5).
 * ------------------------------------------------------------------------- */

describe("scanSource: exemption comments (spec §4.4)", () => {
  it("exemption with reason exempts the first following candidate", () => {
    const src = wrap(`{/* childless-growable-ok: probe reason */}\n<span className="flex-1" />`);
    const { violations, exemptions } = scanSource(src, "probe.tsx");
    expect(violations).toHaveLength(1); // sentinel only
    expect(violations[0]?.tag).toBe("i");
    expect(exemptions.filter((e) => !e.used)).toHaveLength(0);
  });
  it("same-line preceding comment binds (template ownership)", () => {
    const src = wrap(`{/* childless-growable-ok: probe reason */} <span className="flex-1" />`);
    const { violations } = scanSource(src, "probe.tsx");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.tag).toBe("i");
  });
  it("a comment INSIDE the candidate never binds — no self-laundering", () => {
    const inTag = wrap(`<span\n  // childless-growable-ok: in-tag\n  className="flex-1"\n/>`);
    const inTagScan = scanSource(inTag, "probe.tsx");
    expect(inTagScan.violations.filter((v) => v.tag === "span")).toHaveLength(1);
    const asChild = wrap(`<span className="flex-1">{/* childless-growable-ok: child */}</span>`);
    const childScan = scanSource(asChild, "probe.tsx");
    expect(childScan.violations.filter((v) => v.tag === "span")).toHaveLength(1);
  });
  it("reasonless exemption is not an exemption", () => {
    const src = wrap(`{/* childless-growable-ok: */}\n<span className="flex-1" />`);
    const { violations } = scanSource(src, "probe.tsx");
    expect(violations.filter((v) => v.tag === "span")).toHaveLength(1);
  });
  it("jsdoc decoration is stripped before reading the reason", () => {
    const src = wrap(
      `{/**\n * childless-growable-ok: probe reason\n */}\n<span className="flex-1" />`,
    );
    const { violations } = scanSource(src, "probe.tsx");
    expect(violations).toHaveLength(1); // sentinel only — proves the scan ran
    expect(violations[0]?.tag).toBe("i");
  });
  it("jsdoc trailing decoration alone is NOT a reason", () => {
    const src = wrap(`{/**\n * childless-growable-ok:\n *\n */}\n<span className="flex-1" />`);
    const { violations } = scanSource(src, "probe.tsx");
    expect(violations.filter((v) => v.tag === "span")).toHaveLength(1);
  });
  it("binds to the FIRST following candidate only", () => {
    const src = wrap(
      `{/* childless-growable-ok: probe reason */}\n<span className="flex-1" />\n<b className="flex-1" />`,
    );
    const { violations } = scanSource(src, "probe.tsx");
    expect(violations.filter((v) => v.tag === "span")).toHaveLength(0);
    expect(violations.filter((v) => v.tag === "b")).toHaveLength(1);
  });
  it("a compliant first candidate claims the exemption silently (template semantics)", () => {
    const src = wrap(
      `{/* childless-growable-ok: probe reason */}\n<span className="flex-1 h-px bg-border" />`,
    );
    const { violations, exemptions } = scanSource(src, "probe.tsx");
    expect(violations).toHaveLength(1); // sentinel only — no unused-exemption complaint
    expect(exemptions.filter((e) => !e.used)).toHaveLength(0);
  });
  it("marker text inside a string literal is not an exemption", () => {
    const src = wrap(`<b title={"childless-growable-ok: not a comment"} className="flex-1" />`);
    const { violations } = scanSource(src, "probe.tsx");
    expect(violations.filter((v) => v.tag === "b")).toHaveLength(1);
  });
  it("an exemption with NO following candidate is reported unused", () => {
    const src = `export function P() {\n  return (<div>${SENTINEL}</div>);\n}\n// childless-growable-ok: dangling reason\n`;
    const { exemptions } = scanSource(src, "probe.tsx");
    expect(exemptions.filter((e) => !e.used)).toHaveLength(1);
  });
  it("a marker inside a REGEX LITERAL is not an exemption (R1 finding 1, R2 finding 4)", () => {
    // Discriminating shape: the regex body embeds a comment-shaped substring
    // (`//` inside a character class) directly above the candidate — without
    // the regex-literal span exclusion it would parse as a binding line
    // comment and exempt the span.
    const src = wrap(
      `<b data-x={/[//] childless-growable-ok: not a comment/}>keep</b>\n<span className="flex-1" />`,
    );
    const { violations } = scanSource(src, "probe.tsx");
    const probe = violations.filter((v) => v.tag === "span");
    expect(probe).toHaveLength(1);
    expect(probe[0]?.line).toBe(PROBE_LINE + 1);
  });
  it("a marker inside a SHEBANG is not an exemption (R1 finding 1, R2 finding 4)", () => {
    // Discriminating shape: the shebang embeds a `//`-shaped substring, and
    // the candidate sits on the adjacent next line — without the shebang span
    // exclusion, line 1 would parse as a binding line comment.
    const src = `#!/usr/bin/env node // childless-growable-ok: nope\nexport const P = () => (<div><span className="flex-1" />${SENTINEL}</div>);\n`;
    const { violations } = scanSource(src, "probe.tsx");
    const probe = violations.filter((v) => v.tag === "span");
    expect(probe).toHaveLength(1);
    expect(probe[0]?.line).toBe(2);
  });
  it("a distant comment two-plus lines above does not bind", () => {
    const src = wrap(
      `{/* childless-growable-ok: too far away */}\n<b>keep</b>\n<span className="flex-1" />`,
    );
    const { violations } = scanSource(src, "probe.tsx");
    expect(violations.filter((v) => v.tag === "span")).toHaveLength(1);
  });
});

describe("scanSource: MDX (spec §5)", () => {
  it("compiled-MDX childless growable violates with approximate diagnostics", () => {
    const { violations } = scanSource(`# Title\n\n<span className="flex-1" />\n`, "probe.mdx");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe("unpainted-childless-dom");
    expect(violations[0]?.approximate).toBe(true);
    expect(violations[0]?.file).toBe("probe.mdx");
  });
  it("compiled-MDX painted growable is accepted", () => {
    const { violations } = scanSource(
      `# Title\n\n<span className="flex-1 h-px bg-border" />\n<span className="flex-1" />\n`,
      "probe.mdx",
    );
    expect(violations).toHaveLength(1); // only the unpainted sibling — non-vacuous
  });
  it("MDX exemption comments are NOT honored (TSX-only contract)", () => {
    const { violations } = scanSource(
      `# Title\n\n{/* childless-growable-ok: hoisted away */}\n<span className="flex-1" />\n`,
      "probe.mdx",
    );
    expect(violations).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------- *
 * Task 4: live-tree walk + hygiene gates (spec §6.1–§6.3, plan Task 4).
 * ------------------------------------------------------------------------- */
import { join } from "node:path";

import {
  APPROVED_GROWABLE_COMPONENTS,
  PAINT_TOKENS as LIVE_PAINT_TOKENS,
  renderViolation,
  scanLiveTree,
  walkLiveTree,
} from "./_childlessGrowableScan";

const FIXTURE_ROOT = join(__dirname, "fixtures", "childlessGrowable");

describe("live-tree gate (spec §6.1)", () => {
  const live = scanLiveTree();

  it("zero violations across components/ and app/", () => {
    expect(live.violations.map(renderViolation)).toEqual([]);
  });

  it("zero unused exemptions in the live tree", () => {
    expect(live.unusedExemptions).toEqual([]);
  });

  it("zero exemption comments at ship time (spec §8.2)", () => {
    expect(live.exemptionCount).toBe(0);
  });
});

describe("walker coverage — automated red-state proof (plan Task 4b)", () => {
  it("finds the planted violation in every root and extension, with the full diagnostic contract", () => {
    const { violations } = scanLiveTree({ root: FIXTURE_ROOT });
    // Exact raw records, exact-path match (R2 finding 6): every field of every
    // fixture violation is pinned, order-independent. The MDX line (8) is the
    // compiled-JSX position under the committed @mdx-js/mdx version.
    const sorted = [...violations].sort((a, b) => a.file.localeCompare(b.file));
    expect(sorted).toEqual([
      {
        file: "app/violation.mdx",
        line: 8,
        tag: "span",
        reason: "unpainted-childless-dom",
        sourceLabel: "flex-1",
        approximate: true,
      },
      {
        file: "app/violation.tsx",
        line: 2,
        tag: "span",
        reason: "unpainted-childless-dom",
        sourceLabel: "flex-1",
      },
      {
        file: "components/styleViolation.tsx",
        line: 2,
        tag: "span",
        reason: "opaque-style-grow",
        sourceLabel: "flexGrow: grow",
      },
      {
        file: "components/violation.tsx",
        line: 2,
        tag: "span",
        reason: "unpainted-childless-dom",
        sourceLabel: "flex-1",
      },
    ]);
    // Rendered contract, exact strings (R2 finding 6): location (with the MDX
    // approximation form), tag, reason, source label, and every escape.
    const ESCAPES =
      " — escapes: add real children; " +
      "DOM: add a PAINT_TOKENS member AND a proven extent token (extend the set in review if needed); " +
      "component: add an APPROVED_GROWABLE_COMPONENTS row with a reason; or childless-growable-ok: <reason>";
    expect(sorted.map(renderViolation)).toEqual([
      `app/violation.mdx:~8 (position approximate — compiled MDX) <span> unpainted-childless-dom (flex-1)${ESCAPES}`,
      `app/violation.tsx:2 <span> unpainted-childless-dom (flex-1)${ESCAPES}`,
      `components/styleViolation.tsx:2 <span> opaque-style-grow (flexGrow: grow)${ESCAPES}`,
      `components/violation.tsx:2 <span> unpainted-childless-dom (flex-1)${ESCAPES}`,
    ]);
  });

  it("fixture unused exemption is reported (gate-branch proof, Task 4c)", () => {
    const { unusedExemptions } = scanLiveTree({ root: FIXTURE_ROOT });
    expect(unusedExemptions).toEqual([{ file: "components/unusedExemption.tsx", line: 4 }]);
  });

  it("the LIVE walk sees components/, app/, and at least one MDX file", () => {
    const files = walkLiveTree();
    expect(files.some((f) => f.includes("/components/") || f.startsWith("components/"))).toBe(true);
    expect(files.some((f) => f.includes("/app/") || f.startsWith("app/"))).toBe(true);
    expect(files.some((f) => f.endsWith(".mdx"))).toBe(true);
  });
});

describe("registry and paint-set hygiene — OCCURRENCE liveness (spec §6.3)", () => {
  const live = scanLiveTree();

  it("every APPROVED_GROWABLE_COMPONENTS row occurs as a live childless growable", () => {
    for (const tag of APPROVED_GROWABLE_COMPONENTS) {
      expect(live.childlessGrowableComponentTags).toContain(tag);
    }
  });

  it("every PAINT_TOKENS member occurs in a live painted-childless candidate's harvest", () => {
    for (const token of LIVE_PAINT_TOKENS) {
      expect(live.paintedCandidateTokens).toContain(token);
    }
  });
});

/* ------------------------------------------------------------------------- *
 * Whole-diff R1 repairs: harvesting/style/discriminant branch probes.
 * ------------------------------------------------------------------------- */

describe("harvesting: statically visible member kinds (R1 finding 3)", () => {
  it("array spread element is harvested", () => {
    expectViolation(
      `<span className={[...["flex-1"]].join(" ")} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("object SHORTHAND key is harvested (cn({grow}))", () => {
    expectViolation(`<span className={cn({ grow })} />`, "unpainted-childless-dom", "span");
  });
  it("object METHOD key is harvested", () => {
    expectViolation(
      `<span className={cn({ "flex-1"() { return true; } })} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("inline object spread recurses", () => {
    expectViolation(
      `<span className={cn({ ...{ "flex-1": true } })} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
});

describe("style: statically named member kinds + unparseable strings (R1 findings 4, 6)", () => {
  it("style shorthand {flexGrow} is fail-closed opaque growth", () => {
    expectViolation(`<span style={{ flexGrow }} />`, "opaque-style-grow", "span");
  });
  it("style METHOD named flexGrow is fail-closed opaque growth", () => {
    expectViolation(`<span style={{ flexGrow() { return 1; } }} />`, "opaque-style-grow", "span");
  });
  it('style={{ flex: "" }} is unparseable — opaque growth', () => {
    expectViolation(`<span style={{ flex: "" }} />`, "opaque-style-grow", "span");
  });
  it('style={{ flex: "junk" }} is unparseable — opaque growth', () => {
    expectViolation(`<span style={{ flex: "junk" }} />`, "opaque-style-grow", "span");
  });
  it("resolved + opaque style sources report unpainted-childless-dom, not opaque-style-grow", () => {
    expectViolation(
      `<span style={{ flexGrow: 1, ...growStyle }} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("conditional resolved-plus-opaque branches likewise", () => {
    expectViolation(
      `<span style={cond ? { flexGrow: 1 } : { flexGrow: grow }} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it('negative string values are not growable (style={{ flexGrow: "-.5" }})', () => {
    expectAccepted(`<span style={{ flexGrow: "-.5" }} />`);
  });
});

/* ------------------------------------------------------------------------- *
 * Whole-diff R2 repairs: value wrappers, signed literals, accessors.
 * ------------------------------------------------------------------------- */

describe("style: property-value wrappers + signed numeric literals (R2 finding 3)", () => {
  it.each([
    ["parenthesized", "(0)", "(2)"],
    ["as", "0 as const", "2 as const"],
    ["satisfies", "0 satisfies number", "2 satisfies number"],
    ["non-null", "0!", "2!"],
  ])("%s value wrapper is transparent: zero accepted, positive violates", (_kind, zero, pos) => {
    expectAccepted(`<span style={{ flexGrow: ${zero} }} />`);
    expectViolation(`<span style={{ flexGrow: ${pos} }} />`, "unpainted-childless-dom", "span");
  });
  it("unary plus resolves numerically: +0 accepted, +1 violates", () => {
    expectAccepted(`<span style={{ flexGrow: +0 }} />`);
    expectViolation(`<span style={{ flexGrow: +1 }} />`, "unpainted-childless-dom", "span");
  });
  it("wrapped signed literals resolve through the wrapper", () => {
    expectAccepted(`<span style={{ flexGrow: -1 as const }} />`);
    expectAccepted(`<span style={{ flexGrow: -(1) }} />`);
    expectAccepted(`<span style={{ flexGrow: +(0) }} />`);
    expectViolation(`<span style={{ flexGrow: +(2) }} />`, "unpainted-childless-dom", "span");
  });
  it("other unary operators fail closed", () => {
    expectViolation(`<span style={{ flexGrow: ~0 }} />`, "opaque-style-grow", "span");
  });
  it("wrapped string values resolve through the wrapper", () => {
    expectAccepted(`<span style={{ flex: "0" as string }} />`);
    expectViolation(`<span style={{ flex: ("1") }} />`, "unpainted-childless-dom", "span");
  });
});

describe("harvesting + style accessors (R2 finding 5)", () => {
  it("object GETTER key is harvested", () => {
    expectViolation(
      `<span className={cn({ get "flex-1"() { return true; } })} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("object SETTER key is harvested", () => {
    expectViolation(
      `<span className={cn({ set grow(v: boolean) {} })} />`,
      "unpainted-childless-dom",
      "span",
    );
  });
  it("style GETTER named flexGrow is fail-closed opaque growth", () => {
    expectViolation(
      `<span style={{ get flexGrow() { return 1; } }} />`,
      "opaque-style-grow",
      "span",
    );
  });
  it("style SETTER named flexGrow is fail-closed opaque growth", () => {
    expectViolation(`<span style={{ set flexGrow(v: number) {} }} />`, "opaque-style-grow", "span");
  });
});
