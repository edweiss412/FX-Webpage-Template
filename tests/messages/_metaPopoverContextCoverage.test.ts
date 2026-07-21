/**
 * tests/messages/_metaPopoverContextCoverage.test.ts
 * (spec 2026-07-20-alert-popover-context-design §4)
 *
 * Fails-by-default coverage gate for the compact-alert "?" popover, plus
 * synthetic-input proofs of each rule. The live meta-assertion walks the real
 * catalog so a NEW help-linked code with no popover copy fails here. The
 * synthetic block exercises every rule/branch independently, including the
 * exemption branches the empty shipped ledger leaves un-exercised.
 */
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import type { MessageCatalogEntry } from "@/lib/messages/catalog";
import { HELP_ONLY_LEARN_MORE_LEAD_IN } from "@/components/admin/compactAlertHelp";
import { POPOVER_CONTEXT_EXEMPT } from "./popoverContextExemptions";
import {
  checkPopoverContextCoverage,
  type CoverageEntry,
  type ExemptRow,
} from "./popoverContextCoverage";

const liveEntries: CoverageEntry[] = Object.entries(
  MESSAGE_CATALOG as Record<string, MessageCatalogEntry>,
).map(([code, e]) => ({ code, helpHref: e.helpHref, helpfulContext: e.helpfulContext }));

describe("popover context coverage: live catalog is fully covered", () => {
  it("the shipped catalog + ledger produce zero coverage violations", () => {
    const violations = checkPopoverContextCoverage(liveEntries, POPOVER_CONTEXT_EXEMPT);
    expect(
      violations,
      `authored helpfulContext or add a POPOVER_CONTEXT_EXEMPT row: ${JSON.stringify(violations)}`,
    ).toEqual([]);
  });
});

describe("popover context coverage: synthetic proofs (each rule fails by construction)", () => {
  const ok: CoverageEntry = {
    code: "OK",
    helpHref: "/help/errors#OK",
    helpfulContext: "Real, useful context that a reader can act on.",
  };
  const noExempt: readonly ExemptRow[] = [];

  it("rule 1: helpHref set + null context + not exempt => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "GAP", helpHref: "/help/errors#GAP", helpfulContext: null }],
      noExempt,
    );
    expect(v).toEqual([{ rule: 1, code: "GAP", detail: expect.any(String) }]);
  });

  it("rule 1: a valid exemption (null context + well-formed row) => NO violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "EX", helpHref: "/help/errors#EX", helpfulContext: null }],
      [{ code: "EX", reason: "Learn-more-only popover by design." }],
    );
    expect(v).toEqual([]);
  });

  it("rule 1: helpHref null + null context => NOT reachable, NO violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "NOHREF", helpHref: null, helpfulContext: null }],
      noExempt,
    );
    expect(v).toEqual([]);
  });

  it("rule 2: whitespace-only context => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "WS", helpHref: "/help/errors#WS", helpfulContext: "   " }],
      noExempt,
    );
    expect(v).toEqual([{ rule: 2, code: "WS", detail: expect.any(String) }]);
  });

  it("rule 2: the exact lead-in => violation", () => {
    const v = checkPopoverContextCoverage(
      [
        {
          code: "LEAD",
          helpHref: "/help/errors#LEAD",
          helpfulContext: HELP_ONLY_LEARN_MORE_LEAD_IN,
        },
      ],
      noExempt,
    );
    expect(v).toEqual([{ rule: 2, code: "LEAD", detail: expect.any(String) }]);
  });

  it("rule 2: the lead-in PADDED with whitespace => violation (normalization is load-bearing)", () => {
    const v = checkPopoverContextCoverage(
      [
        {
          code: "PAD",
          helpHref: "/help/errors#PAD",
          helpfulContext: `   ${HELP_ONLY_LEARN_MORE_LEAD_IN}   `,
        },
      ],
      noExempt,
    );
    expect(v).toEqual([{ rule: 2, code: "PAD", detail: expect.any(String) }]);
  });

  it("rule 3: exempt AND authored => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "BOTH", helpHref: "/help/errors#BOTH", helpfulContext: "context" }],
      [{ code: "BOTH", reason: "should not both be authored and exempt" }],
    );
    expect(v).toEqual([{ rule: 3, code: "BOTH", detail: expect.any(String) }]);
  });

  it("rule 4: exempt code not in catalog => violation", () => {
    const v = checkPopoverContextCoverage([ok], [{ code: "GHOST", reason: "no such code" }]);
    expect(v).toEqual([{ rule: 4, code: "GHOST", detail: expect.any(String) }]);
  });

  it("rule 4: exempt code with helpHref null (never reaches popover) => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "NOHREF", helpHref: null, helpfulContext: null }],
      [{ code: "NOHREF", reason: "vacuous: never reaches a popover" }],
    );
    expect(v).toEqual([{ rule: 4, code: "NOHREF", detail: expect.any(String) }]);
  });

  it("rule 4: empty reason => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "EX", helpHref: "/help/errors#EX", helpfulContext: null }],
      [{ code: "EX", reason: "   " }],
    );
    expect(v).toEqual([{ rule: 4, code: "EX", detail: expect.any(String) }]);
  });

  it("rule 4: duplicate exemption rows => exactly one duplicate violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "EX", helpHref: "/help/errors#EX", helpfulContext: null }],
      [
        { code: "EX", reason: "first" },
        { code: "EX", reason: "second" },
      ],
    );
    // Whole-array equality: the fixture is well-formed except for the duplicate,
    // so exactly one violation is emitted (the second occurrence).
    expect(v).toEqual([{ rule: 4, code: "EX", detail: "duplicate exemption row" }]);
  });

  it("a fully valid catalog + empty ledger => no violations", () => {
    expect(checkPopoverContextCoverage([ok], noExempt)).toEqual([]);
  });
});
