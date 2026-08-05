// BL-LEDGER-BODY-DEFINED-ID-OVERMINT — a bold lone id at a bullet lead DEFINES,
// with no separator required, so a mention can mint an id.
//
// `bodyDefinedIds` requires the id to lead the bullet inside a `strong` span and
// to be the first child of the first paragraph. It does NOT require anything to
// follow it. A bullet that merely NAMES a sibling id in bold — "**BL-X** is
// tracked separately" — therefore defines `BL-X` exactly as a real sub-item
// definition would, and a typo in a bold id defines the typo.
//
// The entry (and the AGENTS.md finding-admissibility contract for guard
// surfaces) requires a tightening to carry a probe demonstrating the corruption
// it prevents. That probe is the first `describe` below, and it runs against the
// SHIPPED function: it is a demonstration, not an argument.
//
// THE FIX: a definition must be followed by a separator — an em dash, a colon,
// or the end of the paragraph. Prose directly after the id is a mention.
//
// ANTI-TAUTOLOGY. The negative cases matter more than the positive one here,
// because the loose behavior passes every positive case by construction: a
// recognizer that defines EVERYTHING satisfies "the real sub-items are defined".
// So each case below states which side of the boundary it pins, and the corpus
// case asserts the real ledgers still mint exactly the ids they minted before —
// a tightening that silently dropped a live id would be a worse defect than the
// over-mint it fixes.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bodyDefinedIds } from "./_ledgerMdast";

const BACKLOG_OPTS = { requirePrefix: "BL-", levels: [2, 3] } as const;

const ledger = (body: string): string => `## BL-PARENT — a parent entry\n\n${body}\n`;

describe("the corruption, demonstrated against the shipped function", () => {
  it("a bullet that MENTIONS a bold id in prose mints it", () => {
    // This is the defect. The bullet is discussing a sibling, not defining a
    // sub-item, and there is no separator to say otherwise.
    const ids = bodyDefinedIds(
      ledger("- **BL-MENTIONED** is tracked separately and is not a sub-item of this entry."),
      BACKLOG_OPTS,
    );
    expect(ids.has("BL-MENTIONED")).toBe(false);
  });

  it("a typo in a bold lead defines the typo", () => {
    // The direction that makes it worth fixing: a misspelling cannot be caught
    // by the citation guard, because the misspelling defines itself.
    const ids = bodyDefinedIds(ledger("- **BL-TYPOO** see the note above."), BACKLOG_OPTS);
    expect(ids.has("BL-TYPOO")).toBe(false);
  });
});

describe("real definitions still define", () => {
  it("em-dash separated — the shape every live body-defined id uses", () => {
    const ids = bodyDefinedIds(ledger("- **BL-REAL** — a genuine sub-item."), BACKLOG_OPTS);
    expect(ids.has("BL-REAL")).toBe(true);
  });

  it("colon separated", () => {
    const ids = bodyDefinedIds(ledger("- **BL-COLON**: a genuine sub-item."), BACKLOG_OPTS);
    expect(ids.has("BL-COLON")).toBe(true);
  });

  it("the id alone, with nothing after it in the paragraph", () => {
    // An id on its own IS a definition — there is no prose to make it a mention.
    const ids = bodyDefinedIds(ledger("- **BL-BARE**"), BACKLOG_OPTS);
    expect(ids.has("BL-BARE")).toBe(true);
  });
});

describe("the conditions that already held keep holding", () => {
  it("a code-span lead is enumeration, not definition", () => {
    const ids = bodyDefinedIds(ledger("- `BL-ENUM1`, `BL-ENUM2` — discussed only."), BACKLOG_OPTS);
    expect(ids.has("BL-ENUM1")).toBe(false);
    expect(ids.has("BL-ENUM2")).toBe(false);
  });

  it("an id mid-sentence is a mention", () => {
    const ids = bodyDefinedIds(ledger("- See **BL-MID** — for the details."), BACKLOG_OPTS);
    expect(ids.has("BL-MID")).toBe(false);
  });

  it("the walk stops at the first heading in the body", () => {
    const ids = bodyDefinedIds(
      ledger("- **BL-BEFORE** — defined.\n\n## Some section\n\n- **BL-AFTER** — not ours."),
      BACKLOG_OPTS,
    );
    expect(ids.has("BL-BEFORE")).toBe(true);
    expect(ids.has("BL-AFTER")).toBe(false);
  });
});

describe("the real corpus is unchanged by the tightening", () => {
  it("still mints exactly the eight ids main mints", () => {
    // The entry's own words: "main mints exactly the intended eight ids today".
    // A tightening that dropped one would be a worse defect than the over-mint,
    // so this is asserted against the shipped ledgers rather than a fixture.
    const all = new Set<string>();
    for (const file of ["BACKLOG.md", "BACKLOG-archive.md"]) {
      for (const id of bodyDefinedIds(readFileSync(file, "utf8"), BACKLOG_OPTS)) all.add(id);
    }
    expect(all.size).toBe(8);
  });
});
