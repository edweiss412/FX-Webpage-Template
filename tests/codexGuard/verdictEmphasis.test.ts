import { afterAll, describe, expect, it } from "vitest";

import { cleanupRuns, mkRun, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);

describe("verdict lines wrapped in markdown emphasis (spec §3 consequence 3)", () => {
  // Failure caught: a full review spent, then filed as an infrastructure
  // fault - indistinguishable in result.json from a reaped dispatch.
  it.each([
    ["**VERDICT: APPROVE**"],
    ["*VERDICT: APPROVE*"],
    ["__VERDICT: APPROVE__"],
    ["  **VERDICT: APPROVE**  "],
  ])("recovers the verdict from %j", async (line) => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: `${line}\n` },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code } = await runGuard(run);
    expect(code).toBe(0);
    // verdictLine stays the RAW, untrimmed line (§6 schema) while the RECORDED
    // verdict is the bare outcome. Failure caught: an implementation that gets
    // the outcome right by rewriting the captured line, silently breaking the
    // schema's raw-line contract that `happyPath` scenario 2 also depends on.
    expect(readResult(run)).toMatchObject({
      status: "verdict",
      verdict: "APPROVE",
      verdictLine: line,
    });
  });

  // The existing ambiguity guard must survive the widening: a line naming two
  // outcomes, or joining them with " or ", is still not a verdict.
  it.each([["**VERDICT: APPROVE or BLOCKING**"], ["**VERDICT: APPROVE / NEEDS-ATTENTION**"]])(
    "still refuses the ambiguous line %j",
    async (line) => {
      const run = mkRun();
      writeScenario(run, [
        {
          onCall: 1,
          actions: [
            { type: "lastMessage", text: `${line}\n` },
            { type: "exit", code: 0 },
          ],
        },
      ]);
      await runGuard(run, ["--max-attempts", "1"]);
      expect(readResult(run)).toMatchObject({ status: "no_verdict", verdict: null });
    },
  );

  // The two cases above cannot die if the ambiguity filter is deleted - an
  // ambiguous payload is unrecognized either way, so both record `no_verdict`
  // through a different door. These three DO die: an emphasised ambiguous line
  // trailing a real verdict SHADOWS it once the filter stops excluding it, and
  // the dispatch loses a verdict it actually reached. One case per filter half.
  it.each([
    // two outcomes AND " or " - dies if either half is dropped
    ["**VERDICT: APPROVE or BLOCKING**", "NEEDS-ATTENTION", "**VERDICT: NEEDS-ATTENTION**"],
    // two outcomes, no " or " - isolates `occurrences < 2`
    ["**VERDICT: APPROVE / NEEDS-ATTENTION**", "BLOCKING", "**VERDICT: BLOCKING**"],
    // " or ", only one outcome - isolates the " or " filter
    ["**VERDICT: APPROVE or close to it**", "NEEDS-ATTENTION", "**VERDICT: NEEDS-ATTENTION**"],
  ])("a trailing ambiguous line %j never shadows the real verdict", async (tail, want, real) => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: `${real}\n${tail}\n` },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code } = await runGuard(run);
    expect(code).toBe(0);
    expect(readResult(run)).toMatchObject({
      status: "verdict",
      verdict: want,
      verdictLine: real,
    });
  });

  // Failure caught: widening so far that the brief's own INSTRUCTION to emit a
  // verdict is read as a verdict. The instruction text is what every brief in
  // the repo contains, so a regex that matches it breaks every dispatch.
  it("does not read a fenced example as a verdict", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "```\nVERDICT: APPROVE\n```\nStill working.\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--max-attempts", "1"]);
    const result = readResult(run);
    expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
    // `no_marker`, not `unrecognized_verdict`: the fenced line must be GONE before
    // the marker test, not merely rejected after it.
    expect(result.attempts[0]!.failureShape).toBe("no_marker");
  });

  // The fenced case above is stripped before the filter ever sees it, so it
  // cannot pin the line anchor. This one can: an inline restatement of the
  // brief's instruction is prose, and only the anchor keeps it out of the
  // survivor set. `failureShape` is the observable - a line that reaches the
  // filter and is rejected later records `unrecognized_verdict` instead.
  it.each([
    ["The brief says to end with VERDICT: APPROVE once the review is clean."],
    ["Per the instructions I should emit **VERDICT: APPROVE** at the end."],
  ])("does not read the prose restatement %j as a verdict", async (line) => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: `${line}\nStill working.\n` },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--max-attempts", "1"]);
    const result = readResult(run);
    expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
    expect(result.attempts[0]!.failureShape).toBe("no_marker");
  });

  // Failure caught (probe 2026-08-04: 20/20 rejected): normalization run as a
  // SEQUENCE rather than to a fixed point. The emphasis unwrap requires the
  // closing marker at end-of-line, so a trailing `.` blocks it; by the time the
  // fixpoint loop had stripped that `.` and unwrapped, the one-shot `VERDICT:`
  // prefix strip had already run and never ran again, leaving `VERDICT: APPROVE`
  // as the payload. `**VERDICT: APPROVE**.` therefore recorded
  // `unrecognized_verdict` while `VERDICT: APPROVE.` recorded APPROVE - a
  // completed review silently converted into `no_verdict`, which is exactly the
  // shape that lets an arc burn real rounds while reading as below the filing
  // threshold. Every constant below is the one the scenario is BUILT from, so a
  // widening that got the outcome right by rewriting the line still fails on
  // `verdictLine`.
  const EMPHASIS = ["*", "**", "_", "__"] as const;
  const TERMINAL = [".", ",", ";", ":", "!"] as const;
  const OUTCOME = "APPROVE" as const;
  const CROSS: [string, string][] = EMPHASIS.flatMap((e) =>
    TERMINAL.map((p): [string, string] => [e, p]),
  );

  it.each(CROSS)(
    "accepts a %s-wrapped verdict ending in %j exactly as the unwrapped form does",
    async (emphasis, punctuation) => {
      const wrapped = `${emphasis}VERDICT: ${OUTCOME}${emphasis}${punctuation}`;
      const bare = `VERDICT: ${OUTCOME}${punctuation}`;
      const dispatch = async (line: string) => {
        const run = mkRun();
        writeScenario(run, [
          {
            onCall: 1,
            actions: [
              { type: "lastMessage", text: `${line}\n` },
              { type: "exit", code: 0 },
            ],
          },
        ]);
        await runGuard(run, ["--max-attempts", "1"]);
        return readResult(run);
      };
      // The unwrapped form is the REFERENCE, re-measured in the same run rather
      // than assumed, so the pair cannot silently agree by both regressing.
      const unwrapped = await dispatch(bare);
      expect(unwrapped).toMatchObject({ status: "verdict", verdict: OUTCOME });
      expect(await dispatch(wrapped)).toMatchObject({
        status: "verdict",
        verdict: unwrapped.verdict,
        // RAW line preserved (§6 schema) - emphasis, punctuation and all.
        verdictLine: wrapped,
      });
    },
    30000,
  );

  // A CODE SPAN is not emphasis, and the widening must not treat it as one.
  // Every brief this repo dispatches carries the instruction line
  // "`VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`",
  // and a reviewer that quotes one span back is quoting the brief, not deciding.
  // The multi-outcome form is caught by the ambiguity filter anyway; this
  // single-outcome form is caught by NOTHING but the marker set, so pin it here.
  it("does not accept a code-span-wrapped line as a verdict", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "`VERDICT: APPROVE`\nStill working.\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--max-attempts", "1"]);
    const result = readResult(run);
    expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
    expect(result.attempts[0]!.failureShape).toBe("no_marker");
  });
});

describe("every code block hides its example, not only the closed backtick fence", () => {
  // Failure caught (reviewer probe 2026-08-05, 5/5 leaked): the stripper matched
  // ONE shape - a backtick fence with a closing backtick fence - so an EXAMPLE
  // the reviewer wrote inside any OTHER CommonMark code block was read as a real
  // verdict AND as a real declared count. `verdict=APPROVE, count=4` came back
  // from all five shapes below. Both consequences are silent and both are wrong
  // in the expensive direction: a review that reached no conclusion is filed as
  // an APPROVE, and the corpus records a count the reviewer never declared.
  const OUTCOME = "APPROVE" as const;
  const EXAMPLE_COUNT = 4;
  // The two lines every brief asks the reviewer to end with - which is exactly
  // why a reviewer quotes them back inside a code block while still working.
  const EXAMPLE = [`**VERDICT: ${OUTCOME}**`, `FINDINGS: ${EXAMPLE_COUNT}`];
  const indent = (pad: string): string => EXAMPLE.map((l) => `${pad}${l}`).join("\n");

  const dispatch = async (text: string) => {
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
    return readResult(run);
  };

  // The REFERENCE, re-measured rather than assumed: the same two lines OUTSIDE
  // a code block are a verdict and a count. Without it every assertion below
  // passes on a stripper that deleted the whole message, which is the tautology
  // this pair exists to rule out.
  it("reads the same two lines as a verdict and a count when they are not in a code block", async () => {
    const result = await dispatch(`${EXAMPLE.join("\n")}\n`);
    expect(result).toMatchObject({ status: "verdict", verdict: OUTCOME });
    expect(result.findingCount).toBe(EXAMPLE_COUNT);
  });

  it.each([
    // CommonMark allows tilde fences; the stripper only knew backticks.
    ["a closed tilde fence", `~~~\n${EXAMPLE.join("\n")}\n~~~\nStill working.\n`],
    // An unclosed fence runs to end of document (CommonMark 4.5), so its
    // contents are code even though no closing line ever arrives - and a
    // reaped reviewer's message is routinely truncated mid-block.
    ["a tilde fence left open at EOF", `Emit this at the end:\n\n~~~\n${EXAMPLE.join("\n")}\n`],
    [
      "a backtick fence left open at EOF",
      `Emit this at the end:\n\n\`\`\`\n${EXAMPLE.join("\n")}\n`,
    ],
    // Indented code blocks: 4 spaces or a tab, both after a blank line.
    ["a 4-space indented block", `Emit this at the end:\n\n${indent("    ")}\n\nStill working.\n`],
    ["a tab-indented block", `Emit this at the end:\n\n${indent("\t")}\n\nStill working.\n`],
  ])("does not read the example inside %s", async (_shape, text) => {
    const result = await dispatch(text);
    expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
    // `no_marker`, not `unrecognized_verdict`: the line must be GONE before the
    // marker test, exactly as the closed-backtick case already is.
    expect(result.attempts[0]!.failureShape).toBe("no_marker");
    // The SECOND caller of the same stripper. `EXAMPLE_COUNT` is the number the
    // fixture is built from, so a stripper fixed in `parseVerdict` alone - the
    // two-copies-that-drift shape this fix exists to remove - still fails here.
    expect(result.findingCount).toBeNull();
  });
});

describe("markdown emphasis binds tight: a list bullet is not emphasis", () => {
  // Failure caught (reviewer probe 2026-08-05): the optional-emphasis prefix
  // allowed whitespace between the marker and the keyword, so the CommonMark
  // list bullet `* VERDICT: APPROVE` matched as if `*` were emphasis. A bullet
  // is where a reviewer RESTATES the brief's instruction, and being last it
  // SHADOWS the verdict actually reached: probed output was
  // {verdict: null, verdictLine: "* VERDICT: APPROVE", shape: "unrecognized_verdict"}
  // on a message whose first line said BLOCKING - a spent review filed as an
  // infrastructure fault, and a BLOCKING one at that.
  const REAL_OUTCOME = "BLOCKING" as const;
  const REAL = `VERDICT: ${REAL_OUTCOME}`;
  const BULLET = "* VERDICT: APPROVE";

  const dispatch = async (text: string) => {
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
    return readResult(run);
  };

  it("a trailing bullet line never shadows the real verdict", async () => {
    const result = await dispatch(`${REAL}\n${BULLET}\n`);
    expect(result).toMatchObject({
      status: "verdict",
      verdict: REAL_OUTCOME,
      // RAW line (§6 schema) - and the REAL one, not the bullet.
      verdictLine: REAL,
    });
  });

  // The shadowing case above cannot tell "dropped before the marker test" from
  // "rejected after it" - both leave the earlier verdict standing. This one can.
  it("a bullet line alone is not a marker at all", async () => {
    const result = await dispatch(`${BULLET}\nStill working.\n`);
    expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
    expect(result.attempts[0]!.failureShape).toBe("no_marker");
  });

  // Re-asserted here, not delegated upward: the tightening is one character of
  // regex away from rejecting every wrapped form the block above recovered, and
  // a widening that loses them is the original defect returning.
  it.each([
    ["*VERDICT: APPROVE*"],
    ["**VERDICT: APPROVE**"],
    ["_VERDICT: APPROVE_"],
    ["__VERDICT: APPROVE__"],
    ["  **VERDICT: APPROVE**  "],
    // The terminal-punctuation form fixed last round (fixpoint normalization).
    ["**VERDICT: APPROVE**."],
    ["VERDICT: APPROVE"],
  ])("still accepts %j", async (line) => {
    expect(await dispatch(`${line}\n`)).toMatchObject({
      status: "verdict",
      verdict: "APPROVE",
      verdictLine: line,
    });
  });
});
