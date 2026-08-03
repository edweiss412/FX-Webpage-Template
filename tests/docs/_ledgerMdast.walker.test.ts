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

// ---------------------------------------------------------------------------
// bodyDefinedIds — ids an entry defines in its BODY rather than in a heading
//
// Spec: docs/superpowers/specs/2026-08-03-ledger-body-defined-ids-and-enum-scan-widen-design.md §A.3.
//
// The live corpus carries TWO definition shapes (strong>inlineCode and
// strong>text) and one near-miss that must NOT mint: a bullet that merely
// ENUMERATES sibling ids, written with inlineCode and no strong wrapper. The
// strong wrapper is the whole discriminator between defining and discussing,
// so every plant below is aimed at it or at the separator that follows it.
describe("bodyDefinedIds — body-bullet definitions", () => {
  const entry = (body: string) => `## BL-PARENT — a parent entry\n\n${body}\n`;
  const bodyIds = (text: string): string[] =>
    extractEntries(text, BL).flatMap((e) => bodyDefinedIds(e));

  it("mints from `- **`BL-A`** — text` (strong wrapping inlineCode)", () => {
    expect(bodyIds(entry("- **`BL-A`** — the first shape\n"))).toEqual(["BL-A"]);
  });

  it("mints from `- **BL-B** — text` (strong wrapping plain text)", () => {
    expect(bodyIds(entry("- **BL-B** — the second shape\n"))).toEqual(["BL-B"]);
  });

  it("does NOT mint from an enumeration bullet with no strong wrapper", () => {
    // BACKLOG.md:83-84 — the bullet that DISCUSSES the eight body-defined ids.
    // It leads with an id, so a "first token is an id" rule would mint from it.
    expect(bodyIds(entry("- `BL-C`, `BL-D` — the ids enumerated above\n"))).toEqual([]);
  });

  it("does NOT mint from a strong id that is not the bullet LEAD", () => {
    expect(bodyIds(entry("- see also **BL-E** — for context\n"))).toEqual([]);
  });

  it("does NOT mint when one strong run carries two ids", () => {
    expect(bodyIds(entry("- **`BL-F`, `BL-G`** — a pair\n"))).toEqual([]);
  });

  it("does NOT mint without the em-dash separator — a mention is not a definition", () => {
    expect(bodyIds(entry("- **BL-H** is discussed in the parent above\n"))).toEqual([]);
  });

  it("does NOT mint from a bullet that belongs to no entry", () => {
    // Prose above the first heading (BACKLOG.md's reconciliation log lives
    // there). extractEntries slices bodies from the first id-heading onward,
    // so this is structural, but it is the property the guard leans on.
    const md = "- **BL-I** — a bullet before any heading\n\n## BL-PARENT — a parent entry\n\nbody\n";
    expect(bodyIds(md)).toEqual([]);
  });

  it("does NOT mint a lowercase token", () => {
    expect(bodyIds(entry("- **BL-lower** — not an id\n"))).toEqual([]);
  });

  it("does NOT mint from a field label", () => {
    expect(bodyIds(entry("- **Status:** IN PROGRESS · **Branch:** feat/x\n"))).toEqual([]);
  });

  it("mints from a bullet nested inside another list", () => {
    // The live corpus has only flat lists; pinned so the behavior is decided
    // rather than incidental.
    expect(bodyIds(entry("- outer\n  - **BL-J** — nested one level\n"))).toEqual(["BL-J"]);
  });

  it("mints every id in a multi-bullet list, in source order", () => {
    expect(
      bodyIds(entry("- **`BL-K`** — first\n- **BL-L** — second\n- `BL-M` — third, no strong\n")),
    ).toEqual(["BL-K", "BL-L"]);
  });

  it("mints nothing from an entry whose body has no bullets", () => {
    expect(bodyIds(entry("Just prose about **BL-N** — with a strong id in it.\n"))).toEqual([]);
  });
});
