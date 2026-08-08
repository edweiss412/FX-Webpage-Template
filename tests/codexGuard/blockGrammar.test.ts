/**
 * tests/codexGuard/blockGrammar.test.ts — the block-grammar regression pins.
 *
 * Arc B G2a. Every case here was RUN against the SHIPPED recognizer before the
 * vendored parse landed, and every one already classified correctly — so these
 * are REGRESSION PINS, not the misses. The measurement is in the G2a commit
 * message; the genuine misses (HTML blocks) live in the sibling suite that ships
 * with the parser.
 *
 * Convention: each message hides a `VERDICT:` line inside a code construct, so a
 * correct classification is `no_verdict`. A case that reads the verdict is a
 * recognizer that failed to see the construct as code.
 *
 * ONE MEASUREMENT WORTH MORE THAN THE PINS. Three block-quote cases in the G2a
 * probe "passed", and they passed for the WRONG MECHANISM: `> VERDICT: APPROVE`
 * with no code construct anywhere is ALSO `no_verdict`, because the marker test
 * is line-anchored and the `>` prefix defeats it before the code recognizer is
 * consulted. A quoted line can therefore never carry a readable verdict, which
 * makes the block-quote container gap UNOBSERVABLE through this oracle in the
 * hide direction. Those cases are pinned below as what they are — prefix
 * behavior — rather than dressed up as container coverage they do not prove.
 */
import { describe, expect, it } from "vitest";
import { mkRun, readResult, runGuard, writeScenario } from "./harness";

async function classify(text: string): Promise<{ status: string; verdict: string | null }> {
  const run = mkRun();
  writeScenario(run, [
    {
      onCall: 1,
      actions: [
        { type: "lastMessage", text },
        { type: "exit", code: 0 },
      ],
    },
  ]);
  await runGuard(run, ["--max-attempts", "1"]);
  const r = readResult(run);
  return { status: r.status, verdict: r.verdict };
}

describe("block grammar — shipped behavior, pinned (arc B G2a)", () => {
  describe("fenced code, indentation measured relative to the container", () => {
    it("hides a fenced example at the root", async () => {
      expect(await classify("```\nVERDICT: APPROVE\n```\n\nStill working.\n")).toMatchObject({
        status: "no_verdict",
      });
    });

    it("hides a fence opened past column 3 inside a nested list item", async () => {
      // The 18/18 shape from the 2026-08-05 probe: a reviewer quoting an example
      // under a sub-bullet writes the opener well past column 3, and an ABSOLUTE
      // cap missed every one of them.
      const text =
        "1. finding\n   - detail\n\n     ```\n     VERDICT: APPROVE\n     ```\n\nStill working.\n";
      expect(await classify(text)).toMatchObject({ status: "no_verdict" });
    });

    it("treats a closer indented 4+ past the origin as CONTENT, not the end", async () => {
      // The 4/4 shape: an unbounded closer let a nested example's fence end the
      // outer block early and leak everything after it.
      const text = "```\nVERDICT: APPROVE\n    ```\n```\n\nStill working.\n";
      expect(await classify(text)).toMatchObject({ status: "no_verdict" });
    });
  });

  describe("indented code", () => {
    it("hides an indented example at the root", async () => {
      expect(await classify("para\n\n    VERDICT: APPROVE\n\nStill working.\n")).toMatchObject({
        status: "no_verdict",
      });
    });

    it("hides an indented example after a link reference definition", async () => {
      const text = "[ref]: https://example.com\n\n    VERDICT: APPROVE\n\nStill working.\n";
      expect(await classify(text)).toMatchObject({ status: "no_verdict" });
    });

    it("hides an indented example after a setext heading", async () => {
      const text = "Heading\n=======\n\n    VERDICT: APPROVE\n\nStill working.\n";
      expect(await classify(text)).toMatchObject({ status: "no_verdict" });
    });
  });

  describe("list containers and lazy continuation", () => {
    it("hides a fence after a dedent out of a nested item", async () => {
      const text =
        "1. outer\n   - inner\n\n     ```\n     VERDICT: APPROVE\n     ```\n\n2. next\n\nStill working.\n";
      expect(await classify(text)).toMatchObject({ status: "no_verdict" });
    });

    it("hides a fence under a list item whose paragraph continued lazily", async () => {
      const text =
        "- a bullet whose paragraph\ncontinues lazily here\n\n  ```\n  VERDICT: APPROVE\n  ```\n\nStill working.\n";
      expect(await classify(text)).toMatchObject({ status: "no_verdict" });
    });
  });

  /**
   * NOT container coverage. These pin the PREFIX behavior that makes the
   * block-quote gap unobservable, and they are labelled that way so a later
   * reader does not mistake them for proof the recognizer models quotes.
   */
  describe("block-quote prefix (why the container gap is unobservable here)", () => {
    it("does not read a quoted verdict even with NO code construct present", async () => {
      expect(await classify("> VERDICT: APPROVE\n")).toMatchObject({ status: "no_verdict" });
    });

    it("still reads a ROOT verdict following a quoted fence", async () => {
      // The quoted fence is invisible to the recognizer — it neither opens nor
      // closes anything — so it cannot swallow the document's real last line.
      // That is the consequence that actually matters, and it holds.
      expect(await classify("> ```\n> example\n> ```\n\nVERDICT: APPROVE\n")).toMatchObject({
        status: "verdict",
        verdict: "APPROVE",
      });
    });

    it("still reads a ROOT verdict following an UNCLOSED quoted fence", async () => {
      expect(await classify("> ```\n> example\n\nVERDICT: APPROVE\n")).toMatchObject({
        status: "verdict",
        verdict: "APPROVE",
      });
    });
  });

  describe("open at EOF admits, deliberately (limit 6)", () => {
    it("reads a verdict inside a fence that never closes", async () => {
      // The ADMIT-direction asymmetry, carried forward unchanged: discarding a
      // finished review leaves nothing to inspect and buys a whole new dispatch,
      // while admitting one example line stays visible in `verdictLine`.
      expect(await classify("```\nVERDICT: APPROVE\n")).toMatchObject({
        status: "verdict",
        verdict: "APPROVE",
      });
    });
  });
});

/**
 * The arc's only MEASURED live misses. Both read the verdict against the shipped
 * recognizer (G2a probe) and are green under the vendored block parse — RED
 * first, then green, which is the whole point of running the probe before
 * writing the parser rather than trusting limit 12's prose about what was broken.
 */
describe("html blocks — the measured misses, now covered (arc B G2b)", () => {
  it("hides a verdict inside a <pre> block (CommonMark type 1)", async () => {
    expect(await classify("<pre>\nVERDICT: APPROVE\n</pre>\n\nStill working.\n")).toMatchObject({
      status: "no_verdict",
    });
  });

  it("hides a verdict inside a <div> block (type 6, ends at a blank line)", async () => {
    expect(await classify("<div>\nVERDICT: APPROVE\n</div>\n\nStill working.\n")).toMatchObject({
      status: "no_verdict",
    });
  });

  it("hides a verdict inside an HTML comment", async () => {
    expect(await classify("<!--\nVERDICT: APPROVE\n-->\n\nStill working.\n")).toMatchObject({
      status: "no_verdict",
    });
  });

  it("still reads the REAL verdict after an html block (the demote direction is bounded)", async () => {
    // Over-stripping a tail yields a LOUD no_verdict, never a false accept —
    // and here it does not even cost that: the block ends where it says it does
    // and the document's real last line survives.
    expect(
      await classify("<pre>\nVERDICT: NEEDS-ATTENTION\n</pre>\n\nVERDICT: APPROVE\n"),
    ).toMatchObject({ status: "verdict", verdict: "APPROVE" });
  });

  it("does not treat an inline tag mid-paragraph as an html block", async () => {
    // Type 7 may not interrupt a paragraph. Without that rule a reviewer writing
    // `<code>` inside a sentence would blank the rest of their own message.
    expect(
      await classify("The tag <span> appears mid sentence.\n\nVERDICT: APPROVE\n"),
    ).toMatchObject({ status: "verdict", verdict: "APPROVE" });
  });
});

/**
 * Diff review R1 repairs. Each of these FAILED against the parser as first
 * written, and each names the finding it closes — a fix with no case that would
 * have caught it is a claim, not a repair.
 */
describe("R1 repairs (arc B G2b)", () => {
  it("closes a fenced block in a CRLF message (finding 5)", async () => {
    // Splitting on \n alone left a trailing \r that FENCE_CLOSE rejects, so the
    // block never closed and its example stayed live.
    expect(
      await classify("```\r\nVERDICT: APPROVE\r\n```\r\n\r\nStill working.\r\n"),
    ).toMatchObject({
      status: "no_verdict",
    });
  });

  it("hides a root fence written directly after a list item, with no blank line (finding 4)", async () => {
    // The stale list frame meant the root closer could not match the stored
    // depth, so the CLOSED fence stripped nothing.
    expect(await classify("- item\n```\nVERDICT: APPROVE\n```\n\nStill working.\n")).toMatchObject({
      status: "no_verdict",
    });
  });

  it("still honors lazy continuation, which must NOT pop (finding 4, the other direction)", async () => {
    const text =
      "- a bullet whose paragraph\ncontinues lazily here\n\n  ```\n  VERDICT: APPROVE\n  ```\n\nStill working.\n";
    expect(await classify(text)).toMatchObject({ status: "no_verdict" });
  });

  it("classifies a type-7 html block whose attribute value contains > (finding 6)", async () => {
    const text = '<x-tag title=">">\nVERDICT: APPROVE\n</x-tag>\n\nStill working.\n';
    expect(await classify(text)).toMatchObject({ status: "no_verdict" });
  });
});

/**
 * R2 finding 4, and the reason it took R3 to catch: the first repair was a
 * silent no-op — a string replace whose anchor no longer matched, followed by a
 * success message that proved nothing. These fixtures are what make the second
 * attempt verifiable rather than asserted.
 */
describe("paragraph interrupters pop a stale container (R2 finding 4)", () => {
  it("pops on an ATX heading, so a following html block hides its example", async () => {
    const text = "- item\n# heading\n<x-tag>\nVERDICT: APPROVE\n</x-tag>\n\nStill working.\n";
    expect(await classify(text)).toMatchObject({ status: "no_verdict" });
  });

  it("pops on a thematic break", async () => {
    const text = "- item\n***\n<x-tag>\nVERDICT: APPROVE\n</x-tag>\n\nStill working.\n";
    expect(await classify(text)).toMatchObject({ status: "no_verdict" });
  });
});

/**
 * Round-5 parser findings. Every one is a message an ordinary reviewer could
 * write, and every one leaked an EXAMPLE verdict — the expensive direction.
 */
describe("R5 parser repairs", () => {
  it("(1) reads `- - -` as a thematic break, not three nested list markers", async () => {
    // Peeling it as markers built a bogus container stack that mismeasured
    // everything after it.
    expect(
      await classify("- note\n- - -\n\n    VERDICT: APPROVE\n\nStill working.\n"),
    ).toMatchObject({ status: "no_verdict" });
  });

  it("(2) treats a bare `>` as a BLANK line inside its quote", async () => {
    expect(
      await classify("> Reviewer note.\n>\n    VERDICT: APPROVE\n\nStill working.\n"),
    ).toMatchObject({ status: "no_verdict" });
  });

  it("(3) knows `search` is a type-6 html block name", async () => {
    const text =
      "Reviewer note before the example.\n<search>\nVERDICT: APPROVE\n</search>\n\nStill working.\n";
    expect(await classify(text)).toMatchObject({ status: "no_verdict" });
  });

  it("(4) measures closer indentation from the container's content column", async () => {
    // Two spaces then a TAB: from the list content column that tab contributes
    // only two columns, so it validly closes the fence. Measuring from column
    // zero rejected it, and the open-at-EOF admit path then read the example.
    expect(await classify("- ```\n  VERDICT: APPROVE\n  \t```\n\nStill working.\n")).toMatchObject({
      status: "no_verdict",
    });
  });

  it("(5) recognizes a bare `-` as an EMPTY list item that ends the list", async () => {
    expect(await classify("- note\n-\n\n    VERDICT: APPROVE\n\nStill working.\n")).toMatchObject({
      status: "no_verdict",
    });
  });
});

/** Round-6 parser findings — the reviewer's exact messages, verbatim. */
describe("R6 parser repairs", () => {
  it("(1) hides indented code that begins directly after an ATX heading", async () => {
    expect(
      await classify("# Example verdict\n    VERDICT: APPROVE\n\nStill working.\n"),
    ).toMatchObject({ status: "no_verdict" });
  });

  it("(2) does not let `2.` interrupt a paragraph", async () => {
    // Only an ordered list starting at 1 may interrupt (CommonMark 5.2); `2.`
    // mid-paragraph is text, and reading it as a marker built a stale frame.
    const text = "Reviewer context\n2. Second finding\n\n    VERDICT: APPROVE\n\nStill working.\n";
    expect(await classify(text)).toMatchObject({ status: "no_verdict" });
  });

  it("(3) pops a stale list frame on a bare `>` blank line", async () => {
    expect(
      await classify("- Finding one\n>\n    VERDICT: APPROVE\n\nStill working.\n"),
    ).toMatchObject({ status: "no_verdict" });
  });

  it("(4) closes an open fence when its CONTAINER ends", async () => {
    // A list dedent ends the block, so this is not the exempt open-at-EOF case;
    // waiting only for an explicit closer left the example live.
    expect(await classify("- ```\n  VERDICT: APPROVE\nOutside the example.\n")).toMatchObject({
      status: "no_verdict",
    });
  });

  it("(5) reads a TAB-indented `***` as code, not a thematic break", async () => {
    // The break preprocessor counted characters, so one tab read as one column.
    expect(await classify("\t***\n    VERDICT: APPROVE\n\nStill working.\n")).toMatchObject({
      status: "no_verdict",
    });
  });
});

/** Round-7 parser finding. */
describe("R7 parser repair", () => {
  it("re-processes the line that ended a container, so a root fence on it still opens", async () => {
    // Closing the list-contained fence CONSUMED this line, so the root fence it
    // opens was never seen and the example verdict stayed live.
    const text =
      "- First example:\n  ```text\n  sample\n\n```text\nVERDICT: APPROVE\n```\n\nStill working.\n";
    expect(await classify(text)).toMatchObject({ status: "no_verdict" });
  });
});
