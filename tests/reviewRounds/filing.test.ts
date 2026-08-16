import { describe, expect, it } from "vitest";

import { parseFiling } from "../../lib/reviewRounds/filing";

const FILING = `## diff — 7 rounds

**Examined:** R1-R7, 23 findings.

**Mechanizable:**
- "spec cites a symbol that no longer exists" (R2, R4, R5) —
  extend \`spec:lint\` to resolve every \`file:line\` citation -> BL-SPEC-CITATION-RESOLVE

**Judgment:** R1 scope call on the picker pivot; R6 copy decision.
**Infra:** R3 reaped, no verdict.
`;

describe("filing structure (spec §6)", () => {
  it("extracts stage, declared round count, and cited ids", () => {
    const [section, ...rest] = parseFiling(FILING);
    expect(rest).toEqual([]);
    expect(section?.stage).toBe("diff");
    expect(section?.declaredRounds).toBe(7);
    expect(section?.hasExamined).toBe(true);
    expect(section?.hasDisposition).toBe(true);
    expect(section?.citedIds).toEqual(["BL-SPEC-CITATION-RESOLVE"]);
  });

  // Ratified: `**Mechanizable:** none` is legal and expected (spec §1.1). The
  // filing is a duty to look, not a duty to find.
  it("accepts Mechanizable: none with an Examined line", () => {
    const [s] = parseFiling(
      "## spec — 4 rounds\n\n**Examined:** R1-R4.\n\n**Mechanizable:** none\n",
    );
    expect(s?.hasExamined).toBe(true);
    expect(s?.hasDisposition).toBe(true);
    expect(s?.citedIds).toEqual([]);
  });

  it("reports a missing Examined line", () => {
    const [s] = parseFiling("## spec — 4 rounds\n\n**Mechanizable:** none\n");
    expect(s?.hasExamined).toBe(false);
  });

  it("reports a section with no disposition line at all", () => {
    const [s] = parseFiling("## spec — 4 rounds\n\n**Examined:** R1-R4.\n");
    expect(s?.hasDisposition).toBe(false);
  });

  // Failure caught: two contradictory sections for one stage both passing,
  // with nothing saying which is the filing (spec §7.1 assertion 8).
  it("returns both sections when a stage appears twice", () => {
    const sections = parseFiling(
      "## diff — 4 rounds\n\n**Examined:** a\n**Infra:** b\n\n## diff — 9 rounds\n\n**Examined:** c\n**Infra:** d\n",
    );
    expect(sections.map((s) => s.stage)).toEqual(["diff", "diff"]);
  });

  // Plan resolution R2: the recognizer is narrow on purpose. A bare SHOUTY
  // DEFERRED id is not treated as a citation, so it is neither checked nor
  // wrongly rejected - a conservative under-check, not silent wrongness.
  it("recognizes BL- and DEF- tokens only", () => {
    const [s] = parseFiling(
      "## spec — 4 rounds\n\n**Examined:** a\n**Mechanizable:** BL-ONE, DEF-TWO, PSQL-GUARD-RECALL-RESIDUAL\n",
    );
    expect(s?.citedIds).toEqual(["BL-ONE", "DEF-TWO"]);
  });
});

// ---------------------------------------------------------------------------
// Mechanizable block analysis (enforcement-pair spec §3.1) — AST-derived.
// Every case below names the review round whose probe it renders executable.
// ---------------------------------------------------------------------------
describe("mechanizable block analysis (spec §3.1)", () => {
  const section = (body: string) => parseFiling(`## diff — 4 rounds\n\n${body}`)[0];

  it("exposes null when no canonical marker exists (colon-less spelling included)", () => {
    expect(section("**Examined:** a\n**Judgment:** b\n")?.mechanizable).toBeNull();
    // Grandfathered corpus spelling: strong text lacks the colon, so it is not
    // a canonical marker (spec §3.1; §5.5 documents the residual).
    expect(
      section("**Examined:** a\n**Mechanizable** — prose\n**Judgment:** b\n")?.mechanizable,
    ).toBeNull();
  });

  it("isNone accepts none, none., and none — prose; rejects other values", () => {
    expect(section("**Mechanizable:** none\n")?.mechanizable?.isNone).toBe(true);
    expect(section("**Mechanizable:** none.\n")?.mechanizable?.isNone).toBe(true);
    expect(section("**Mechanizable:** none — all judgment-shaped\n")?.mechanizable?.isNone).toBe(
      true,
    );
    expect(section("**Mechanizable:** one candidate\n")?.mechanizable?.isNone).toBe(false);
  });

  // R7 finding 1: 79 of 88 live markers carry their value on the marker line.
  it("hasDecline accepts a marker-line declined: with a reason", () => {
    expect(
      section("**Mechanizable:** declined: existing coverage closes this class\n")?.mechanizable
        ?.hasDecline,
    ).toBe(true);
  });

  // R8 finding 2: closed by listItem node type, not marker-character spelling.
  it.each(["-", "*", "+", "1.", "1)"])("hasDecline accepts a %s list-item decline", (m) => {
    expect(
      section(
        `**Mechanizable:** one candidate\n\n${m} declined: owner will fold it into the lint arm\n`,
      )?.mechanizable?.hasDecline,
    ).toBe(true);
  });

  // R5 finding 1: negation and prose MENTION are not declarations.
  it("hasDecline rejects negated and mentioned forms", () => {
    expect(
      section("**Mechanizable:** one candidate\n\nnot declined: no owner has accepted this\n")
        ?.mechanizable?.hasDecline,
    ).toBe(false);
    expect(
      section(
        "**Mechanizable:** one candidate\n\ncandidate remains open; use declined: <reason> only after a decision\n",
      )?.mechanizable?.hasDecline,
    ).toBe(false);
  });

  // Block scoping: the SAME id planted in Judgment must not satisfy the block.
  it("collects ids from the block only, never from Judgment or Carry-forward", () => {
    const s1 = section("**Mechanizable:** BL-IN-BLOCK\n\n**Judgment:** BL-IN-JUDGMENT\n");
    expect(s1?.mechanizable?.citedIds).toEqual(["BL-IN-BLOCK"]);
    // R5 finding 2: a NONCANONICAL trailing field closes the block too.
    const s2 = section(
      "**Mechanizable:** one candidate\n\n**Carry-forward:** unrelated note cites BL-REAL\n",
    );
    expect(s2?.mechanizable?.citedIds).toEqual([]);
  });

  // R9 finding 2: a heading closes the block (live review-infra-gates layout).
  it("a heading closes the block for both ids and declines", () => {
    const s1 = section(
      "**Mechanizable:** one candidate\n\n### Judgment, not mechanizable\n\nprose citing BL-REAL\n",
    );
    expect(s1?.mechanizable?.citedIds).toEqual([]);
    const s2 = section(
      "**Mechanizable:** one candidate\n\n### Judgment, not mechanizable\n\ndeclined: this prose is outside the block\n",
    );
    expect(s2?.mechanizable?.hasDecline).toBe(false);
  });

  // Positive inlineCode citation (plan R1 finding 6): a text-only collector fails this.
  it("collects a backticked id inside the block", () => {
    expect(section("**Mechanizable:** `BL-TICKED` — filed\n")?.mechanizable?.citedIds).toEqual([
      "BL-TICKED",
    ]);
  });

  // R10: remark decodes escapes/references BEFORE CITED_ID runs, so the
  // decoded token IS collected here — resolution happens in checkCorpus.
  it("collects decoded-representation ids", () => {
    expect(section("**Mechanizable:** BL\\-DECODED-ROW\n")?.mechanizable?.citedIds).toEqual([
      "BL-DECODED-ROW",
    ]);
    expect(section("**Mechanizable:** DEF&#45;DECODED-ROW\n")?.mechanizable?.citedIds).toEqual([
      "DEF-DECODED-ROW",
    ]);
  });

  // R8 finding 1: non-rendered content is invisible to all five decisions.
  it("fenced, indented, and HTML-comment content is invisible", () => {
    const fence =
      "**Mechanizable:** one candidate\n\n```\n**Mechanizable:** none\ndeclined: fenced example\nBL-REAL\n**Judgment:** fenced field\n```\n";
    const m1 = section(fence)?.mechanizable;
    expect(m1?.hasDecline).toBe(false);
    expect(m1?.citedIds).toEqual([]);
    const s1 = parseFiling(`## diff — 4 rounds\n\n${fence}`)[0];
    expect(
      s1?.mechanizable && "markerCount" in s1.mechanizable ? s1.mechanizable.markerCount : NaN,
    ).toBe(1);

    const indented =
      "**Mechanizable:** one candidate\n\nprose paragraph.\n\n    **Mechanizable:** none\n    declined: indented example\n    BL-REAL\n";
    const m2 = section(indented)?.mechanizable;
    expect(m2?.hasDecline).toBe(false);
    expect(m2?.citedIds).toEqual([]);
    expect(m2?.markerCount).toBe(1);

    const html =
      "**Mechanizable:** one candidate\n\n<!--\n**Mechanizable:** none\ndeclined: commented example\nBL-REAL\n**Judgment:** commented field\n-->\n";
    const m3 = section(html)?.mechanizable;
    expect(m3?.hasDecline).toBe(false);
    expect(m3?.citedIds).toEqual([]);
    expect(m3?.markerCount).toBe(1);
  });

  // R11: struck text is retraction (the _ledgerMdast claim-mode precedent).
  it("strikethrough never satisfies a decision", () => {
    expect(section("**Mechanizable:** ~~none~~\n")?.mechanizable?.isNone).toBe(false);
    expect(section("**Mechanizable:** ~~declined: no owner~~\n")?.mechanizable?.hasDecline).toBe(
      false,
    );
    expect(
      section("**Mechanizable:** one candidate\n\n- ~~declined: struck~~\n")?.mechanizable
        ?.hasDecline,
    ).toBe(false);
    expect(section("**Mechanizable:** ~~BL-REAL~~\n")?.mechanizable?.citedIds).toEqual([]);
  });

  // R6: duplicate markers are surfaced for the corpus gate to reject.
  it("markerCount counts every canonical marker", () => {
    const s = section(
      "**Mechanizable:** BL-REAL\n\n**Examined:** x\n\n**Mechanizable:** stray second entry\n",
    );
    expect(s?.mechanizable?.markerCount).toBe(2);
  });

  // R12: a list-nested rendered field is exposed for the corpus gate.
  it.each(["-", "*", "+", "1.", "1)"])("flags a %s list-nested Mechanizable field", (m) => {
    const s = section(
      `**Judgment:** real disposition\n\n${m} **Mechanizable:** nested untracked candidate\n`,
    );
    expect(s?.nestedMechanizable).toBe(true);
    expect(s?.mechanizable).toBeNull();
  });

  it("does not flag nesting when no nested field exists", () => {
    expect(section("**Mechanizable:** none\n")?.nestedMechanizable).toBe(false);
  });

  // R9 finding 1: AST-visible field sets, for the corpus gate's malformed check.
  it("exposes AST-visible dispositions and Examined", () => {
    const s = section("**Examined:** a\n\n**Mechanizable:** none\n");
    expect(s?.astDispositions).toEqual(["Mechanizable"]);
    expect(s?.astExamined).toBe(true);
    const raw = section(
      "```\n**Examined:** fenced\n**Judgment:** fenced\n```\n\n**Mechanizable:** none\n",
    );
    expect(raw?.astExamined).toBe(false);
    expect(raw?.astDispositions).toEqual(["Mechanizable"]);
  });

  // Mutation repairs (Task-4 enrolment run): each case kills a named survivor.
  // The label comes from the STRONG node, not from text that happens to end in
  // a colon - a plain-text `Examined:` paragraph is not a field (kills
  // equality-flip:118:19, which survived because the recursion re-derived the
  // label from the text INSIDE the strong node).
  it("does not read a plain-text colon line as a field label", () => {
    const s = section("Examined:\n\n**Mechanizable:** none\n");
    expect(s?.astExamined).toBe(false);
  });

  // A struck-through field is a retraction for the label sets too (kills
  // logical-connector:117:54, under which the walk descends into `delete`).
  it("does not count a struck-through field label", () => {
    const s = section("~~**Examined:** a~~\n\n**Mechanizable:** none\n");
    expect(s?.astExamined).toBe(false);
    expect(section("~~**Judgment:** x~~\n\n**Mechanizable:** none\n")?.astDispositions).toEqual([
      "Mechanizable",
    ]);
  });

  // A paragraph whose PLAIN TEXT ends in a colon does not close the block
  // (kills logical-connector:82:27, under which fieldName reads the first text
  // child of any paragraph as a label).
  it("does not close the block at a plain-text paragraph ending in a colon", () => {
    const s = section(
      "**Mechanizable:** one candidate\n\nThe shortlist, for later:\n\nBL-IN-BLOCK\n",
    );
    expect(s?.mechanizable?.citedIds).toEqual(["BL-IN-BLOCK"]);
  });

  // The block ends at the FIRST closer, not the last (kills the removal of the
  // block-extent loop's break at filing.ts:177).
  it("closes the block at the first field even when more fields follow", () => {
    const s = section(
      "**Mechanizable:** one candidate\n\n**Judgment:** BL-IN-JUDGMENT\n\n**Infra:** none\n",
    );
    expect(s?.mechanizable?.citedIds).toEqual([]);
  });

  // `line` is the heading's 1-indexed line - the corpus gate's messages point
  // authors at it (kills integer-literal:247:15).
  it("records the heading's 1-indexed line", () => {
    const sections = parseFiling("## diff — 4 rounds\n\n**Examined:** a\n");
    expect(sections[0]?.line).toBe(1);
  });

  // A loose heading closes the OPEN section like a strict one does (kills the
  // removal of the loose branch's close() at filing.ts:261).
  it("closes the previous section at a loose heading", () => {
    const sections = parseFiling("## diff — 4 rounds\n\n**Examined:** a\n\n## spec\n\nx\n");
    expect(sections).toHaveLength(2);
    expect(sections[0]?.stage).toBe("diff");
    expect(sections[0]?.hasExamined).toBe(true);
    expect(sections[1]?.stage).toBe("spec");
  });

  // Diff R1 finding 3: a rendered Mechanizable field at ANY non-top-level
  // position - a blockquote inside a list item, a bare top-level blockquote, a
  // doubly nested list - renders for the reader while marker discovery sees
  // nothing, so nestedMechanizable must expose every one of them.
  it.each([
    ["blockquote inside a list item", "- > **Mechanizable:** nested candidate\n"],
    ["bare top-level blockquote", "> **Mechanizable:** quoted candidate\n"],
    ["doubly nested list", "- outer\n  - **Mechanizable:** nested candidate\n"],
  ])("flags a rendered Mechanizable field in %s", (_n, body) => {
    const s = section(`**Judgment:** the real disposition\n\n${body}`);
    expect(s?.nestedMechanizable).toBe(true);
    expect(s?.mechanizable).toBeNull();
  });

  // Diff R1 finding 4: a conforming decline is a declaration wherever it
  // renders inside the block - a sub-list item, a blockquote paragraph.
  it.each([
    ["a sub-list item", "- one candidate\n  - declined: owner decision\n"],
    ["a blockquote paragraph", "> declined: quoted owner decision\n"],
  ])("hasDecline accepts a decline in %s", (_n, body) => {
    expect(section(`**Mechanizable:** one candidate\n\n${body}`)?.mechanizable?.hasDecline).toBe(
      true,
    );
  });

  // The mention protections survive the recursive walk: struck-through and
  // mid-sentence forms inside nested containers still declare nothing.
  it("nested mention forms still do not declare", () => {
    expect(
      section("**Mechanizable:** one candidate\n\n- ~~declined: struck~~\n")?.mechanizable
        ?.hasDecline,
    ).toBe(false);
    expect(
      section("**Mechanizable:** one candidate\n\n> we should use declined: <reason> later\n")
        ?.mechanizable?.hasDecline,
    ).toBe(false);
  });
});
