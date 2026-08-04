// T1 of the ledger-guard mdast rewrite: the walker helper's structural
// contract — entry extraction and flatten semantics per the spec's §2
// node-disposition table. Lane semantics are exercised by the guard file's
// plants corpus (T2/T3), not here.
//
// Spec: docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md §2.
import { describe, expect, it } from "vitest";

import { bodyDefinedIds, extractEntries, flattenLines, parseLedger } from "./_ledgerMdast";

const BL = { requirePrefix: "BL-", levels: [2, 3] } as const;
const DEF = { requirePrefix: null, levels: [3] } as const;

const ids = (text: string, opts: typeof BL | typeof DEF = BL): string[] =>
  extractEntries(text, opts).map((e) => e.id);

describe("extractEntries — id extraction (source parity)", () => {
  it("mints SHOUTY ids at both accepted levels and applies the BL- prefix filter", () => {
    const md = "## BL-TWO — open\n\nbody\n\n### BL-THREE — open\n\nbody\n\n## NOTAPREFIX — prose\n\nbody\n";
    expect(ids(md)).toEqual(["BL-TWO", "BL-THREE"]);
  });

  it("rejects lowercase-containing tokens (prose headings yield nothing)", () => {
    expect(ids("## BL-Mixed — prose\n\nbody\n")).toEqual([]);
  });

  it("honors the per-ledger level mask: an H2 prose SHOUTY heading never mints under the DEFERRED scan", () => {
    const md = "## PROSE heading section\n\nbody\n\n### REAL-ID — open\n\nbody\n";
    expect(ids(md, DEF)).toEqual(["REAL-ID"]);
  });

  it("accepts arbitrary bracket prefixes and requires no terminator (regex parity)", () => {
    expect(ids("## [P2] BL-A — open\n\nb\n")).toEqual(["BL-A"]);
    expect(ids("## [URGENT] BL-B — open\n\nb\n")).toEqual(["BL-B"]);
    expect(ids("## BL-C: open\n\nb\n")).toEqual(["BL-C"]);
  });

  it("keeps struck ids (delete-wrapped) occupying their headings", () => {
    expect(ids("## ~~BL-STRUCK~~ — reopened\n\nb\n")).toEqual(["BL-STRUCK"]);
    expect(ids("## [P2] ~~BL-DEL~~ — open\n\nb\n")).toEqual(["BL-DEL"]);
  });

  it("mints nothing from a formatting-wrapped id, with or without a plain bracket prefix", () => {
    for (const heading of [
      "### **NOTES** — prose",
      "### *NOTES* — prose",
      "### `NOTES` — prose",
    ]) {
      expect(ids(`${heading}\n\nbody\n`, DEF), heading).toEqual([]);
    }
    for (const heading of [
      "## [P2] **BL-STRONG** — CLOSED",
      "## [P2] *BL-EM* — CLOSED",
      "## [P2] `BL-CODE` — CLOSED",
    ]) {
      expect(ids(`${heading}\n\nbody\n`), heading).toEqual([]);
    }
  });

  it("accepts a FORMATTED bracket prefix before a plain id (legacy raw [^\\]]+ parity)", () => {
    expect(ids("## [**P2**] BL-X — open\n\nb\n")).toEqual(["BL-X"]);
    expect(ids("## [*P2*] BL-X2 — open\n\nb\n")).toEqual(["BL-X2"]);
    expect(ids("## [`P2`] BL-X3 — open\n\nb\n")).toEqual(["BL-X3"]);
    expect(ids("## [~~P2~~] BL-X4 — open\n\nb\n")).toEqual(["BL-X4"]);
    expect(ids("## [<b>P2</b>] BL-X5 — open\n\nb\n")).toEqual(["BL-X5"]);
  });

  it("ignores container-nested headings entirely (top-level only)", () => {
    expect(ids("> ## BL-QUOTED — CLOSED\n\nprose\n")).toEqual([]);
  });
});

describe("extractEntries — id-heading-to-id-heading partition", () => {
  it("nested H3 entries own their spans; the H2 parent's body stops at the first child", () => {
    const md = [
      "## BL-PARENT — umbrella",
      "",
      "parent prose",
      "",
      "### BL-CHILD-A — first",
      "",
      "child a prose",
      "",
      "### BL-CHILD-B — second",
      "",
      "child b prose",
      "",
    ].join("\n");
    const entries = extractEntries(md, BL);
    expect(entries.map((e) => e.id)).toEqual(["BL-PARENT", "BL-CHILD-A", "BL-CHILD-B"]);
    const bodyText = (i: number): string =>
      flattenLines(entries[i]!.body, "claim")
        .map((l) => l.text)
        .join("|");
    expect(bodyText(0)).toBe("parent prose");
    expect(bodyText(1)).toBe("child a prose");
    expect(bodyText(2)).toBe("child b prose");
  });

  it("a non-id prose heading does not close an entry (regex parity)", () => {
    const md = "## BL-ONLY — open\n\nbefore\n\n## Prose section title here\n\nafter\n";
    const entries = extractEntries(md, BL);
    expect(entries).toHaveLength(1);
    const joined = flattenLines(entries[0]!.body, "claim")
      .map((l) => l.text)
      .join("|");
    expect(joined).toContain("before");
    expect(joined).toContain("after");
  });
});

describe("flattenLines — §2 disposition table", () => {
  const flat = (md: string, mode: "claim" | "id" = "claim") =>
    flattenLines(parseLedger(md).children, mode);

  it("splits lines at literal newlines inside text values (soft breaks emit no node)", () => {
    const lines = flat("**Status:** OPEN\nsecond line");
    expect(lines.map((l) => l.text)).toEqual(["Status: OPEN", "second line"]);
  });

  it("records ONE strong span per strong node, nested emphasis included", () => {
    const [line] = flat("**Resolved *by*:** PR #9");
    expect(line).toBeDefined();
    expect(line!.strongSpans).toHaveLength(1);
    const [s, e] = line!.strongSpans[0]!;
    expect(line!.text.slice(s, e)).toBe("Resolved by:");
  });

  it("records a span on EVERY line a multiline strong node touches", () => {
    const lines = flat("**first\nmiddle\nlast**");
    expect(lines.map((l) => l.text)).toEqual(["first", "middle", "last"]);
    for (const l of lines) expect(l.strongSpans.length).toBeGreaterThan(0);
  });

  it("keeps inlineCode text and records its code span", () => {
    const [line] = flat("**Status:** `RESOLVED`");
    expect(line!.text).toBe("Status: RESOLVED");
    expect(line!.codeSpans).toHaveLength(1);
    const [s, e] = line!.codeSpans[0]!;
    expect(line!.text.slice(s, e)).toBe("RESOLVED");
  });

  it("cooks character references into plain text", () => {
    const [line] = flat("C&#76;OSED");
    expect(line!.text).toBe("CLOSED");
  });

  it("drops delete content in claim mode and keeps it in id mode", () => {
    expect(flat("~~CLOSED~~ tail")[0]!.text).toBe(" tail");
    expect(flat("~~CLOSED~~ tail", "id")[0]!.text).toBe("CLOSED tail");
  });

  it("drops code blocks, tables, link labels, images, and HTML comment nodes", () => {
    expect(flat("    ## BL-Z — DONE")).toEqual([]);
    expect(flat("| Status |\n| --- |\n| CLOSED |")).toEqual([]);
    expect(flat("[CLOSED](https://x.test)")).toEqual([]);
    expect(flat("![CLOSED](https://x.test/i.png)")).toEqual([]);
    expect(flat("open <!-- Status: CLOSED --> entry")[0]!.text).toBe("open  entry");
  });

  it("drops inline HTML tags but keeps their enclosed prose siblings", () => {
    expect(flat("<strong>CLOSED</strong> by PR #1")[0]!.text).toBe("CLOSED by PR #1");
  });

  it("descends containers: blockquotes, list items, task-list items", () => {
    expect(flat("> **Status:** CLOSED")[0]!.text).toBe("Status: CLOSED");
    expect(flat("- [x] **Status:** CLOSED")[0]!.text).toBe("Status: CLOSED");
    expect(flat("1. > - **Status:** CLOSED")[0]!.text).toBe("Status: CLOSED");
  });

  it("a marker-only literal line does not consume the opening slot (r26)", () => {
    // `- [ ]` with no content is a bullet whose text is literal "[ ]" — the
    // opening lane must skip past it to the first TOKENED line.
    const lines = flat("- [ ]\n- [x] **CLOSED** by PR #631.");
    const firstTokened = lines.find((l) => /[A-Za-z0-9-]/.test(l.text));
    expect(firstTokened?.text).toBe("CLOSED by PR #631.");
  });

  it("does NOT descend footnote definitions", () => {
    expect(flat("[^h]: **Status:** CLOSED in the predecessor.")).toEqual([]);
  });

  it("excludes autolinked URLs (GFM literal links become link nodes)", () => {
    expect(flat("see https://x.test/CLOSED-thing now")[0]!.text).toBe("see  now");
  });
});

// ── bodyDefinedIds — sub-item ids a parent entry defines in its BODY ─────────
//
// Spec: docs/superpowers/specs/2026-08-03-scanner-precision-cluster-design.md §4.1.
// Eight ids are deliberately defined as bullets inside a parent entry rather than
// as headings of their own, because splitting them would break the parent's
// shrink-only ratchet. The guard resolved headings only, so they read as dangling.
//
// The three conditions below are each here because a rule missing it was measured
// to be wrong against the REAL corpus, not because it seemed prudent.
describe("bodyDefinedIds — a parent entry defines sub-items in its body", () => {
  const parent = (body: string): string => `## BL-PARENT — a parent entry\n\n${body}\n`;
  const defined = (md: string): string[] => [...bodyDefinedIds(md, BL)].sort();

  it("P1: a strong-wrapping-code bullet DEFINES", () => {
    // The BL-MUTATION-* shape: `- **`BL-X`** — prose`.
    expect(defined(parent("- **`BL-PLANT-CODE`** — a sub-item\n"))).toEqual(["BL-PLANT-CODE"]);
  });

  it("P2: a strong-PLAIN bullet DEFINES", () => {
    // The BL-SYNCFEED-UI-* shape, with no backticks. A rule written only for P1
    // covers five of the eight real ids and silently drops the other three.
    expect(defined(parent("- **BL-PLANT-PLAIN** — a sub-item\n"))).toEqual(["BL-PLANT-PLAIN"]);
  });

  it("P3: a CODE-SPAN lead with no strong defines NOTHING", () => {
    // The live trap: BACKLOG.md's own BL-LEDGER-GUARD-BODY-DEFINED-IDS entry leads
    // a bullet with the same five ids as plain code spans while merely ENUMERATING
    // them. A "bullet lead with a code span" rule lets that entry define ids it
    // only discusses — from the wrong parent.
    expect(defined(parent("- `BL-PLANT-NAKED`, `BL-PLANT-NAKED2` — merely enumerated\n"))).toEqual(
      [],
    );
  });

  it("P4: a strong id MID-SENTENCE defines nothing", () => {
    // Definition is the bullet LEAD. Otherwise an entry defines every sibling it
    // happens to mention in bold.
    expect(defined(parent("- see also **BL-PLANT-INLINE** for context\n"))).toEqual([]);
  });

  it("P6: a bullet under a NON-resolving heading defines nothing", () => {
    const md = "## Not An Id — prose heading\n\n- **`BL-PLANT-ORPHAN`** — x\n";
    expect([...bodyDefinedIds(md, BL)]).toEqual([]);
  });

  it("P7: a bullet after an INTERVENING non-id heading defines nothing", () => {
    // extractEntries opens entries only at BL- headings, so a plain `##` section
    // falls inside the PRECEDING entry's body span. Without this condition that
    // entry adopts the section's bullets.
    const md = parent("- **`BL-PLANT-OWN`** — mine\n\n## A Later Section\n\n- **`BL-PLANT-FOREIGN`** — not mine\n");
    expect(defined(md)).toEqual(["BL-PLANT-OWN"]);
  });

  it("P8: the real archive shape — picker bullets are NOT adopted by the preceding entry", () => {
    // Verbatim structure of BACKLOG-archive.md: a resolved entry, then a non-id
    // `## Picker-flow app bugs` heading whose three strong-leading bullets would
    // otherwise be defined by BL-CREWPAGE-ROTATE-FOCUS-MGMT.
    const md = [
      "## BL-CREWPAGE-ROTATE-FOCUS-MGMT — resolved",
      "",
      "body prose",
      "",
      "## Picker-flow app bugs (3) — RESOLVED on branch `fix/picker-flow-app-bugs`",
      "",
      "- **BL-PICKER-BOOTSTRAP-HOST-FLIP** was swept as a class.",
      "- **BL-PICKER-GATE-SKIP-MISMATCH** was rejected as insufficient.",
      "- **BL-PICKER-CLAIMED-ROW-NEXT-DROP** shipped as proposed.",
      "",
    ].join("\n");
    expect([...bodyDefinedIds(md, BL)]).toEqual([]);
  });

  it("only TOP-LEVEL bullets of the entry body define", () => {
    const md = parent("- outer\n  - **`BL-PLANT-NESTED`** — nested one level\n");
    expect(defined(md)).toEqual([]);
  });
});

describe("extractEntries — the entry's own heading line", () => {
  // WHY THIS EXISTS. A consumer needing entry SPANS (the claim reader) otherwise
  // has to recover them by matching heading TEXT against the raw source, which is
  // a second grammar for one file format and demonstrably ambiguous. Three
  // successive variants were built and each was defeated by real corpus shapes:
  // a substring match captured `## Notes about BL-X`; raw-line matching missed 14
  // of 95 in BACKLOG.md because headingLine.text is normalized; exact equality
  // against flattenLines missed the struck `### ~~MODAL-CLOSE-EXIT-ANIM-1~~`,
  // whose id extractEntries strips and flattenLines keeps.
  //
  // The position is already in hand here — `found` holds the mdast Heading node —
  // so handing it over removes the whole class.
  it("points at the heading, 1-based, for a plain entry", () => {
    const md = "intro\n\n## BL-A — first\n\nbody\n\n## BL-B — second\n\nbody\n";
    expect(extractEntries(md, BL).map((e) => e.line)).toEqual([3, 7]);
  });

  it("points at the heading a mention does not own", () => {
    // The shape that defeated substring matching: a prose heading naming the id
    // ahead of the real entry.
    const md = "## Notes about BL-X\n\nprose\n\n## BL-X — real entry\n\nbody\n";
    const es = extractEntries(md, BL);
    expect(es.map((e) => e.id)).toEqual(["BL-X"]);
    expect(es[0]?.line, "the entry, not the mention").toBe(5);
  });

  it("points at a struck heading, whose id headingLine.text drops", () => {
    const md = "### ~~SOME-ID~~ — RESOLVED (shipped)\n\nbody\n";
    const [e] = extractEntries(md, DEF);
    expect(e?.line).toBe(1);
    expect(e?.headingLine.text, "premise: the id is stripped from the text").not.toContain("SOME-ID");
  });

  it("points at a nested H3 entry", () => {
    const md = "## BL-P — parent\n\nbody\n\n### BL-C — child\n\nbody\n";
    expect(extractEntries(md, BL).map((e) => e.line)).toEqual([1, 5]);
  });
});
