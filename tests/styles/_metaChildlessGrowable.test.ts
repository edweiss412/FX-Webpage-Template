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

  it.each([...GROWABLE, ...GROWABLE_FAIL_CLOSED, ...VARIANT_GROWABLE])(
    "growable: %s",
    (token) => {
      expect(growableFromToken(token)).toBe(true);
    },
  );

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
    expect([...PAINT_TOKENS].sort()).toEqual(["bg-accent", "bg-border", "bg-border-strong", "border"]);
    for (const member of PAINT_TOKENS) expect(PAINT_TOKENS.has(member)).toBe(true);
    for (const nonMember of ["bg-cover", "border-accent-edge", "ring-2", "shadow-sm", "bg-surface"]) {
      expect(PAINT_TOKENS.has(nonMember)).toBe(false);
    }
  });
});
