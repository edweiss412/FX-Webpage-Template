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
const GROWABLE_FAIL_CLOSED = ["[flex-grow:junk]", "flex-0/1"] as const;

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
    expect(NOT_GROWABLE).toHaveLength(26);
    expect(GROWABLE_FAIL_CLOSED).toHaveLength(2);
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

  it("paint-set membership is exact (spec §4.2a): the four members, nothing else", () => {
    expect([...PAINT_TOKENS].sort()).toEqual([
      "bg-accent",
      "bg-border",
      "bg-border-strong",
      "border",
    ]);
    for (const member of PAINT_TOKENS) expect(PAINT_TOKENS.has(member)).toBe(true);
    for (const nonMember of [
      "bg-cover",
      "border-accent-edge",
      "ring-2",
      "shadow-sm",
      "bg-surface",
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

/** Accept probe: the probe element is fine; only SENTINEL violates. */
function expectAccepted(jsx: string) {
  const { violations } = scanSource(wrap(jsx), "probe.tsx");
  expect(violations).toHaveLength(1);
  expect(violations[0]?.tag).toBe("i");
}

/** Reject probe: probe violates with the given reason (sentinel also fires). */
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
  expect(probe[0]?.line).toBeGreaterThan(0);
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
    expect(violations.filter((v) => v.tag === "span")).toHaveLength(1);
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
  it.each(["bg-border", "bg-border-strong", "bg-accent", "border"])(
    "member %s with extent is painted (accepted)",
    (member) => {
      expectAccepted(`<span className="flex-1 h-px ${member}" />`);
    },
  );
  it.each(["bg-cover", "border-accent-edge", "ring-2", "shadow-sm"])(
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
  it.each(["h-0", "h-auto", "h-[0px]"])("non-extent %s does not rescue", (t) => {
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
    const spans = violations.filter((v) => v.tag === "span");
    expect(spans).toHaveLength(0);
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
    expect(violations.filter((v) => v.tag === "UI.Spacer")).toHaveLength(0);
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
  it("line-comment form works too", () => {
    const src = wrap(`<span\n  // childless-growable-ok: probe reason\n  className="flex-1"\n/>`);
    const { violations } = scanSource(src, "probe.tsx");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.tag).toBe("i");
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
    expect(violations.filter((v) => v.tag === "span")).toHaveLength(0);
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
  scanLiveTree,
  walkLiveTree,
} from "./_childlessGrowableScan";

const FIXTURE_ROOT = join(__dirname, "fixtures", "childlessGrowable");

describe("live-tree gate (spec §6.1)", () => {
  const live = scanLiveTree();

  it("zero violations across components/ and app/", () => {
    const rendered = live.violations.map(
      (v) =>
        `${v.file}:${v.line} <${v.tag}> ${v.reason} (${v.sourceLabel}) — escapes: add real children; ` +
        `DOM: add a PAINT_TOKENS member AND a proven extent token (extend the set in review if needed); ` +
        `component: add an APPROVED_GROWABLE_COMPONENTS row with a reason; or childless-growable-ok: <reason>`,
    );
    expect(rendered).toEqual([]);
  });

  it("zero unused exemptions in the live tree", () => {
    expect(live.unusedExemptions).toEqual([]);
  });

  it("zero exemption comments at ship time (spec §8.2)", () => {
    expect(live.exemptionCount).toBe(0);
  });
});

describe("walker coverage — automated red-state proof (plan Task 4b)", () => {
  it("finds the planted violation in every root and extension", () => {
    const { violations } = scanLiveTree({ root: FIXTURE_ROOT });
    const files = violations.map((v) => v.file).sort();
    expect(files.some((f) => f.includes("components/violation.tsx"))).toBe(true);
    expect(files.some((f) => f.includes("app/violation.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("violation.mdx"))).toBe(true);
    expect(violations).toHaveLength(3);
  });

  it("fixture unused exemption is reported (gate-branch proof, Task 4c)", () => {
    const { unusedExemptions } = scanLiveTree({ root: FIXTURE_ROOT });
    expect(unusedExemptions).toHaveLength(1);
    expect(unusedExemptions[0]?.file).toContain("unusedExemption.tsx");
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
