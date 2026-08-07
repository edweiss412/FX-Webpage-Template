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
