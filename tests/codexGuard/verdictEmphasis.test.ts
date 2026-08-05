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
  // from every shape below. Both consequences are silent and both are wrong
  // in the expensive direction: a review that reached no conclusion is filed as
  // an APPROVE, and the corpus records a count the reviewer never declared.
  // (Two shapes that first landed here - a tilde and a backtick fence left OPEN
  // at EOF - moved to the never-closed describe at the end of this file, which
  // is where their trade-off is stated and pinned.)
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
    // Indented code blocks: 4 spaces or a tab, both after a blank line, and
    // both TERMINATED by the non-indented line that follows.
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

describe("a code block that begins on a list-marker line still hides its example", () => {
  // Failure caught (reviewer probe 2026-08-05, 15/15 leaked): the stripper only
  // recognized a block that opens at the START of a line, so a block opened on a
  // LIST-MARKER line - `- ```, `1.     `, the shape a reviewer uses to quote an
  // example inside a numbered finding - was invisible to it, and the example's
  // `VERDICT:`/`FINDINGS:` lines (indented to the item's content column, so no
  // marker of their own to disqualify them) were read as the reviewer's own.
  // The reviewer's controls - the same blocks at root level, and a block that
  // begins on a LATER line of the item - were already hidden, so the leak is
  // exactly "the block opens on the marker line".
  const OUTCOME = "APPROVE" as const;
  const EXAMPLE_COUNT = 4;
  const BODY = [`FINDINGS: ${EXAMPLE_COUNT}`, `VERDICT: ${OUTCOME}`];
  const MARKERS = ["-", "*", "+", "1.", "1)"];

  /** The 15 combinations the probe ran: 5 CommonMark list markers x 3 block kinds. */
  const cases: [string, string][] = MARKERS.flatMap((marker) => {
    // A list item's content column: the marker plus the single space after it.
    const pad = " ".repeat(marker.length + 1);
    // Content set 4+ columns PAST that content column is an indented code block
    // that opens on the marker line - 5 spaces after a 1-char marker puts the
    // first character at column 6 (= content column 2 + 4).
    const codePad = " ".repeat(marker.length + 5);
    const fenced = (f: string): string =>
      [`${marker} ${f}`, ...BODY.map((l) => pad + l), `${pad}${f}`, "", "Still working.", ""].join(
        "\n",
      );
    return [
      [`${marker} + a backtick fence`, fenced("```")],
      [`${marker} + a tilde fence`, fenced("~~~")],
      [
        `${marker} + an indented block`,
        [
          `${marker}     Emit this at the end:`,
          ...BODY.map((l) => codePad + l),
          "",
          "Still working.",
          "",
        ].join("\n"),
      ],
    ];
  });

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

  it("covers all 15 marker x block-kind combinations", () => {
    expect(cases).toHaveLength(15);
  });

  it.each(cases)("does not read the example inside %s", async (_shape, text) => {
    const result = await dispatch(text);
    expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
    // `no_marker`, not `unrecognized_verdict`: the line must be GONE before the
    // marker test, exactly as the root-level cases already are.
    expect(result.attempts[0]!.failureShape).toBe("no_marker");
    // The SECOND caller of the same stripper, and the number the fixture is
    // built from - a fix in `parseVerdict` alone still fails here.
    expect(result.findingCount).toBeNull();
  });

  // The reviewer's own control, re-measured rather than assumed: a block that
  // begins on a later line of the item was ALREADY hidden, so a rule that only
  // ever looked at marker lines would pass the table above and break this.
  it("still hides a block that begins on a later line of the item", async () => {
    const result = await dispatch(
      ["- text", "", "  ```", ...BODY.map((l) => "  " + l), "  ```", "", "Still working.", ""].join(
        "\n",
      ),
    );
    expect(result).toMatchObject({ status: "no_verdict", verdict: null });
    expect(result.findingCount).toBeNull();
  });
});

describe("a code block the document never closes strips nothing", () => {
  // Failure caught LIVE on this branch, by the very review that reported the
  // list-marker leak above (`.review/roundecon-diff-wrapper-r3`): the reviewer
  // wrapped a nested ``` example in a ```markdown block, so the inner example's
  // closing run closed the OUTER fence and the wrapper's own final ``` opened a
  // fence that never closed. Stripping it to EOF deleted the reviewer's own
  // trailing `VERDICT: NEEDS-ATTENTION`, and a COMPLETED review was recorded as
  // `no_marker` / `no_verdict` / `attempts_exhausted` - indistinguishable in
  // result.json from a reaped dispatch. That is spec §3 consequence 3, the
  // defect this arc exists to remove, reintroduced by the fix for it.
  //
  // The rule, stated so it is never outcome-dependent: only a block whose END
  // the document STATES is stripped. A block left open at EOF strips nothing.
  // That makes a trailing verdict structurally safe - a closed fence is followed
  // by its closing line and a terminated indented block by the non-indented line
  // that ended it, so neither can hold the document's last non-empty line.
  const REAL = "VERDICT: NEEDS-ATTENTION";
  const REAL_COUNT = 1;
  const EXAMPLE_COUNT = 4;
  const EXAMPLE = [`FINDINGS: ${EXAMPLE_COUNT}`, "VERDICT: APPROVE"];

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

  // The live message's shape, transcribed (the run directory is gitignored, so
  // the fixture is the shape, not a read of it).
  const LIVE = [
    "HIGH — [scripts/codex-guard.mjs:445](scripts/codex-guard.mjs:445): `stripCodeBlocks` misses",
    "code blocks beginning on a list-marker line. A message such as:",
    "",
    "```markdown",
    "- ```",
    ...EXAMPLE.map((l) => "  " + l),
    "  ```",
    "```",
    "",
    "is parsed by CommonMark as a code node, but the wrapper records it as a real verdict.",
    "",
    `FINDINGS: ${REAL_COUNT}`,
    "",
    REAL,
    "",
  ].join("\n");

  it("recovers the trailing verdict from the message that lost it", async () => {
    const result = await dispatch(LIVE);
    expect(result).toMatchObject({
      status: "verdict",
      verdict: "NEEDS-ATTENTION",
      verdictLine: REAL, // RAW line (§6 schema)
    });
    // The reviewer's OWN count, never the example's - the two numbers differ so
    // a stripper that admits the quoted block is caught here too.
    expect(result.findingCount).toBe(REAL_COUNT);
  });

  // The invariant behind the rule, exercised across every block kind: whatever
  // a document opens and never closes, its final non-empty line survives.
  it.each([
    ["a backtick fence", "```"],
    ["a tilde fence", "~~~"],
    ["a fence opened on a list-marker line", "- ```"],
    ["an indented block", "    Emit this at the end:"],
    ["an indented block opened on a list-marker line", "-     Emit this at the end:"],
  ])("keeps the trailing verdict when %s is left open at EOF", async (_shape, opener) => {
    const result = await dispatch(`Emit this at the end:\n\n${opener}\n${REAL}\n`);
    expect(result).toMatchObject({ status: "verdict", verdict: "NEEDS-ATTENTION" });
  });

  // The DOCUMENTED LIMIT, pinned so no later round quietly trades it back for
  // the regression above: inside a block left open at EOF, an example verdict is
  // ADMITTED. That is the cheap error - one admitted line from a malformed or
  // truncated document, recorded raw in `verdictLine` where a human can see
  // where it came from - against the expensive one, a finished review discarded
  // with nothing left to inspect.
  it.each([
    ["a tilde fence", `Emit this at the end:\n\n~~~\n${EXAMPLE.join("\n")}\n`],
    ["a backtick fence", `Emit this at the end:\n\n\`\`\`\n${EXAMPLE.join("\n")}\n`],
  ])("admits the example inside %s left open at EOF (documented limit)", async (_shape, text) => {
    const result = await dispatch(text);
    expect(result).toMatchObject({ status: "verdict", verdict: "APPROVE" });
    expect(result.findingCount).toBe(EXAMPLE_COUNT);
  });

  // ...and a real verdict AFTER such a block still wins, because the last
  // survivor is the verdict: the admitted example never shadows it.
  it("a real verdict after an unclosed block still wins", async () => {
    const result = await dispatch(
      `Emit this at the end:\n\n~~~\n${EXAMPLE.join("\n")}\n\n${REAL}\n`,
    );
    expect(result).toMatchObject({ status: "verdict", verdict: "NEEDS-ATTENTION" });
  });
});

const EXAMPLE_COUNT = 4;
const EXAMPLE_BODY = [`FINDINGS: ${EXAMPLE_COUNT}`, "VERDICT: APPROVE"];
const FENCE_CHARS: [string, string][] = [
  ["backtick", "```"],
  ["tilde", "~~~"],
];

const dispatchMessage = async (text: string) => {
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

describe("a closing fence indented four or more columns is content, not a closer", () => {
  // Failure caught (reviewer probe 2026-08-05, false approvals=4/4): the closer
  // test accepted ANY leading whitespace. CommonMark 4.5 allows a closing fence
  // at most three columns past its container's content column; at four or more
  // the line is CONTENT of the block it sits in. So a reviewer quoting a nested
  // fence inside an example - the one shape that puts an over-indented fence run
  // in a message at all - closed the outer block early, and every line after it,
  // including the example's own `VERDICT:` and `FINDINGS:`, was read as the
  // reviewer's own. Probed `verdict=APPROVE, count=4` on all four combinations.
  //
  // The tightening only ever strips MORE, never less, so it cannot resurrect the
  // verdict-swallowing regression pinned above: a block that now stays open
  // longer either closes later (its stated end still follows the verdict it
  // holds) or never closes at all, and an unclosed block strips nothing.
  it.each(
    FENCE_CHARS.flatMap(([name, fence]) =>
      [4, 8].map((pad): [string, number, string] => [
        name,
        pad,
        [
          "Emit this at the end:",
          "",
          fence,
          " ".repeat(pad) + fence,
          ...EXAMPLE_BODY,
          fence,
          "",
          "Still working.",
          "",
        ].join("\n"),
      ]),
    ),
  )(
    "does not let a %s run indented %d columns close the block early",
    async (_name, _pad, text) => {
      const result = await dispatchMessage(text);
      expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
      // `no_marker`, not `unrecognized_verdict`: the example must be GONE before
      // the marker test, exactly as an unindented closer already makes it.
      expect(result.attempts[0]!.failureShape).toBe("no_marker");
      // The SECOND caller of the same stripper, on the number the fixture is
      // built from - a fix in `parseVerdict` alone still fails here.
      expect(result.findingCount).toBeNull();
    },
  );

  // The control, re-measured rather than assumed: a closer AT the three-column
  // limit still closes. Without it the whole table above passes on a stripper
  // that stopped recognizing closers entirely - which would leave every fenced
  // example open to EOF and strip nothing, the opposite defect. The two declared
  // counts differ, so the assertion can tell "block stripped" (count 1) from
  // "block admitted" (two counts seen, therefore null).
  it("still closes on a fence indented three columns", async () => {
    const result = await dispatchMessage(
      [
        "Emit this at the end:",
        "",
        "```",
        ...EXAMPLE_BODY,
        "   ```",
        "",
        "FINDINGS: 1",
        "",
        "VERDICT: NEEDS-ATTENTION",
        "",
      ].join("\n"),
    );
    expect(result).toMatchObject({ status: "verdict", verdict: "NEEDS-ATTENTION" });
    expect(result.findingCount).toBe(1);
  });
});

describe("a fence opener indented past three columns still hides its example", () => {
  // Failure caught (reviewer probe 2026-08-05, FALSE_APPROVE=18/18 plus a
  // nested marker-line pair at 2/2): opener recognition capped indentation at
  // three columns ABSOLUTELY. CommonMark measures it relative to the container's
  // content column, so a fence opened inside a nested list item - a reviewer
  // quoting an example under a sub-bullet of a numbered finding - was not a
  // fence at all, and its `VERDICT:`/`FINDINGS:` lines were read as the
  // reviewer's own. The indented-code fallback did not save it: that rule needs
  // a preceding blank line, and a quoted example follows its lead-in directly.
  const OUTCOME = "APPROVE" as const;

  /**
   * 18 shapes: three container depths x three innermost markers x two fence
   * characters. Each nests bullets to push the innermost item's content column
   * to 4, 6 or 8 (9 with a two-character marker) - past the old absolute cap -
   * and opens the fence on a continuation line, where `prevBlank` is false.
   */
  const nested: [string, string][] = [2, 3, 4].flatMap((depth) =>
    ["-", "*", "1."].flatMap((marker) =>
      FENCE_CHARS.map(([name, fence]): [string, string] => {
        const outer: string[] = [];
        let col = 0;
        for (let d = 1; d < depth; d += 1) {
          outer.push(" ".repeat(col) + "- Finding:");
          col += 2;
        }
        const pad = " ".repeat(col + marker.length + 1);
        return [
          `depth ${depth}, marker ${marker}, ${name} at column ${col + marker.length + 1}`,
          [
            ...outer,
            " ".repeat(col) + `${marker} Nested finding:`,
            pad + "Emit this at the end:",
            pad + fence,
            ...EXAMPLE_BODY.map((l) => pad + l),
            pad + fence,
            "",
            "Still working.",
            "",
          ].join("\n"),
        ];
      }),
    ),
  );

  /** The reviewer's second probe: the opener sits ON a marker line indented 4. */
  const markerLine: [string, string][] = FENCE_CHARS.map(([name, fence]): [string, string] => [
    `nested marker line, ${name}`,
    [
      "1. Finding:",
      `    - ${fence}`,
      ...EXAMPLE_BODY.map((l) => "      " + l),
      `      ${fence}`,
      "",
      "Still working.",
      "",
    ].join("\n"),
  ]);

  it("covers the 18 nested shapes and the 2 marker-line shapes the probe ran", () => {
    expect(nested).toHaveLength(18);
    expect(markerLine).toHaveLength(2);
  });

  it.each([...nested, ...markerLine])(
    "does not read the example inside %s",
    async (_shape, text) => {
      const result = await dispatchMessage(text);
      expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
      expect(result.attempts[0]!.failureShape).toBe("no_marker");
      expect(result.findingCount).toBeNull();
    },
  );

  // The reference, re-measured: the SAME nesting with no code block at all still
  // yields a verdict. Without it every row above passes on a stripper that
  // blanked any indented line it met, and the fix would have bought nothing.
  it("still reads a verdict written at the same depth outside a code block", async () => {
    const result = await dispatchMessage(
      [
        "- Finding:",
        "  - Nested finding:",
        "    Emit this at the end:",
        "",
        `FINDINGS: 1`,
        "",
        `VERDICT: ${OUTCOME}`,
        "",
      ].join("\n"),
    );
    expect(result).toMatchObject({ status: "verdict", verdict: OUTCOME });
    expect(result.findingCount).toBe(1);
  });

  // The asymmetry survives the widening: a nested fence the document never
  // closes still strips nothing, so the trailing verdict lives.
  it.each(FENCE_CHARS)(
    "keeps a trailing verdict when a nested %s fence is left open",
    async (_name, fence) => {
      const result = await dispatchMessage(
        [
          "- Finding:",
          "  - Nested finding:",
          "    Emit this at the end:",
          "    " + fence,
          ...EXAMPLE_BODY.map((l) => "    " + l),
          "",
          "VERDICT: NEEDS-ATTENTION",
          "",
        ].join("\n"),
      );
      expect(result).toMatchObject({ status: "verdict", verdict: "NEEDS-ATTENTION" });
    },
  );
});

describe("combined and triple emphasis is emphasis: no marker survives only in pairs", () => {
  // Failure caught (reviewer probe 2026-08-05, cross-checked with remark:
  // {"shapes":6,"commonMarkEmphasis":6,"lostVerdicts":6,"lostCounts":6}): the
  // shared marker prefix accepted a run of ONE OR TWO IDENTICAL delimiters, so
  // every CommonMark COMBINED form - strong-inside-emphasis, in any of its six
  // spellings - kept a delimiter the matcher could not see. `***VERDICT:
  // APPROVE***` recorded `no_marker` and `***FINDINGS: 3***` recorded `null`.
  // Both losses are in the direction this surface exists to prevent: a review
  // the reviewer actually completed is filed as an infrastructure fault, and a
  // count the reviewer actually declared is recorded as "not declared".
  //
  // The six shapes are the complete CommonMark set for a run of three: two
  // homogeneous (`***`, `___`) and four mixed pairs. Each is a single emphasis
  // node wrapping the whole line, which is what makes losing it a data loss
  // rather than a formatting quibble.
  const SHAPES: [string, string][] = [
    ["***", "***"],
    ["___", "___"],
    ["*__", "__*"],
    ["**_", "_**"],
    ["_**", "**_"],
    ["__*", "*__"],
  ];

  it("covers the six shapes the probe ran", () => {
    expect(SHAPES).toHaveLength(6);
  });

  it.each(SHAPES)("recovers the verdict from %s…%s", async (open, close) => {
    const line = `${open}VERDICT: APPROVE${close}`;
    // `verdictLine` is the RAW line (§6 schema) - an implementation that gets
    // the outcome right by rewriting the captured line breaks the contract
    // happyPath scenario 2 depends on, so pin both here.
    expect(await dispatchMessage(`${line}\n`)).toMatchObject({
      status: "verdict",
      verdict: "APPROVE",
      verdictLine: line,
    });
  });

  // The SECOND reader of the same prefix. A fix applied to the verdict matcher
  // alone - the two-copies-that-drift shape - still fails here. The declared
  // count is the corpus's own number, so losing it is silent.
  it.each(SHAPES)("reads the declared count from %sFINDINGS: 3%s", async (open, close) => {
    const result = await dispatchMessage(`${open}FINDINGS: 3${close}\nVERDICT: APPROVE\n`);
    expect(result).toMatchObject({ status: "verdict", verdict: "APPROVE" });
    expect(result.findingCount).toBe(3);
  });

  // Re-asserted, not delegated: the widening is one character of regex away
  // from re-admitting every shape the tightenings above rule out, and each of
  // these is a spent review filed as an infrastructure fault when it breaks.
  it("still refuses a list bullet, which is not emphasis", async () => {
    const result = await dispatchMessage("* VERDICT: APPROVE\nStill working.\n");
    expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
    expect(result.attempts[0]!.failureShape).toBe("no_marker");
  });

  it("still refuses a code span, which is not emphasis", async () => {
    const result = await dispatchMessage("`VERDICT: APPROVE`\nStill working.\n");
    expect(result).toMatchObject({ status: "no_verdict", verdict: null, verdictLine: null });
    expect(result.attempts[0]!.failureShape).toBe("no_marker");
  });

  it.each([["***VERDICT: APPROVE or BLOCKING***"], ["*__VERDICT: APPROVE / NEEDS-ATTENTION__*"]])(
    "still refuses the ambiguous line %j even when combined-emphasised",
    async (line) => {
      const result = await dispatchMessage(`${line}\n`);
      expect(result).toMatchObject({ status: "no_verdict", verdict: null });
    },
  );

  // The refusals above cannot die if the ambiguity filter is deleted - an
  // ambiguous payload is unrecognized either way. This one can: the ambiguous
  // line trails a real verdict and SHADOWS it the moment the filter stops
  // excluding it.
  it("a trailing combined-emphasised ambiguous line never shadows the real verdict", async () => {
    const real = "***VERDICT: BLOCKING***";
    expect(
      await dispatchMessage(`${real}\n***VERDICT: APPROVE or NEEDS-ATTENTION***\n`),
    ).toMatchObject({ status: "verdict", verdict: "BLOCKING", verdictLine: real });
  });

  // The terminal-punctuation fixpoint must still reach the payload through
  // three delimiters, not just through two.
  it.each([["***VERDICT: APPROVE***."], ["  _**VERDICT: APPROVE**_  "]])(
    "still accepts %j",
    async (line) => {
      expect(await dispatchMessage(`${line}\n`)).toMatchObject({
        status: "verdict",
        verdict: "APPROVE",
        verdictLine: line,
      });
    },
  );
});

describe("an emphasis run is not capped: four or more delimiters is still emphasis", () => {
  // Failure caught (reviewer probe 2026-08-05):
  //   ****…****   CommonMark=strong    verdict=no_marker count=null
  //   ____…____   CommonMark=strong    verdict=no_marker count=null
  //   **__…__**   CommonMark=strong    verdict=no_marker count=null
  //   __**…**__   CommonMark=strong    verdict=no_marker count=null
  //   ***_…_***   CommonMark=emphasis  verdict=no_marker count=null
  //
  // Each widening of this prefix picked a NUMBER - one delimiter, then two,
  // then three - and each time the next reviewer wrote one more. The number was
  // never the contract: CommonMark bounds a delimiter run at nothing, so any
  // cap is a shape that loses a real verdict, which is the direction that costs
  // a whole dispatch. The prefix is now unbounded and the guard against false
  // positives is unchanged and was never the length: ADJACENCY (no whitespace
  // between the run and the keyword, so the list bullet `* VERDICT:` is still
  // not a marker) and the absent backtick (so a code span quoting the brief is
  // still not one). Both are re-pinned below rather than assumed.
  //
  // The unwrap fixpoint already handled these - it matches `(\*+|_+|`+)` with no
  // cap - so the loss was entirely at the marker gate.
  const RUNS: [string, string][] = [
    ["****", "****"],
    ["____", "____"],
    ["**__", "__**"],
    ["__**", "**__"],
    ["***_", "_***"],
    ["*****", "*****"], // five: the cap is a number, so the test may not be one either
    ["______", "______"], // six
  ];

  it.each(RUNS)("recovers the verdict from %s…%s", async (open, close) => {
    const line = `${open}VERDICT: APPROVE${close}`;
    expect(await dispatchMessage(`${line}\n`)).toMatchObject({
      status: "verdict",
      verdict: "APPROVE",
      verdictLine: line,
    });
  });

  // The SECOND reader of the same prefix. A fix applied to the verdict matcher
  // alone leaves the declared count - the corpus's own number - silently lost.
  it.each(RUNS)("reads the declared count from %sFINDINGS: 4%s", async (open, close) => {
    const result = await dispatchMessage(
      `${open}FINDINGS: 4${close}\n${open}VERDICT: APPROVE${close}\n`,
    );
    expect(result.findingCount).toBe(4);
  });

  // The widening must not buy the verdict back by admitting things that are not
  // emphasis. These are the two guards the run length was never doing.
  it.each([
    ["* VERDICT: APPROVE"], // list bullet: whitespace breaks adjacency
    ["**** VERDICT: APPROVE ****"], // long run, still whitespace-separated
    ["`****VERDICT: APPROVE****`"], // code span: backtick is not in the run
  ])("still refuses %j", async (line) => {
    expect(await dispatchMessage(`${line}\n`)).toMatchObject({
      status: "no_verdict",
      verdict: null,
    });
  });
});

describe("emphasis on the LABEL or the VALUE, not only around the whole line", () => {
  // Failure caught (reviewer probe 2026-08-05): every earlier repair here
  // assumed emphasis WRAPS THE WHOLE DECLARATION, so the commonest markdown
  // spelling of all - bolding just the label - was invisible.
  //   **VERDICT:** APPROVE -> verdict:null, shape:"unrecognized_verdict"
  //   **FINDINGS:** 3      -> count:null
  // while whole-line `**VERDICT: APPROVE**` and `**FINDINGS: 3**` succeeded.
  // The reviewer measured four completed reviews in the 681-output corpus
  // excluded from counting this way, so an obligated arc reads as compliant.
  //
  // Note this is a different AXIS from the delimiter-run length above: that was
  // how MANY delimiters, this is WHERE they sit. Emphasis may wrap the label,
  // the value, both, or the line - so the marker admits a run at each of those
  // positions, and the payload strip takes the label with its emphasis in one
  // step rather than needing the whole line to unwrap first.
  const VERDICT_FORMS = [
    "**VERDICT:** APPROVE",
    "**VERDICT**: APPROVE",
    "VERDICT: **APPROVE**",
    "*VERDICT:* APPROVE",
    "__VERDICT:__ APPROVE",
    "**VERDICT:** **APPROVE**",
    "**VERDICT** : APPROVE",
    "**VERDICT: APPROVE**", // the already-working whole-line form, re-pinned
  ];

  it.each(VERDICT_FORMS)("recovers the verdict from %j", async (line) => {
    expect(await dispatchMessage(`${line}\n`)).toMatchObject({
      status: "verdict",
      verdict: "APPROVE",
      verdictLine: line,
    });
  });

  const FINDINGS_FORMS = [
    "**FINDINGS:** 3",
    "**FINDINGS**: 3",
    "FINDINGS: **3**",
    "**FINDINGS:** **3**",
    "__FINDINGS:__ 3",
    "**FINDINGS: 3**", // whole-line, re-pinned
  ];

  it.each(FINDINGS_FORMS)("reads the declared count from %j", async (line) => {
    const result = await dispatchMessage(`${line}\nVERDICT: APPROVE\n`);
    expect(result.findingCount).toBe(3);
  });

  // Failure caught (reviewer probe 2026-08-05, cross-checked with
  // remark-parse): the label strip was anchored by a BACKREFERENCE, which
  // requires the closing run to be IDENTICAL to the opener. CommonMark nesting
  // closes in MIRROR order - `*__` closes with `__*` - so all four combined
  // pairs failed, with the colon on either side of the emphasis: 8/8 forms
  // returned null while the whole-line control returned APPROVE.
  //
  // Fixed by comparing against the opener REVERSED, which is the actual
  // CommonMark rule and is closed over nesting depth. Not another cap, and not
  // an enumeration of the eight: a run of any composition is handled because
  // the closer is derived from the opener rather than listed.
  const COMBINED_LABEL_FORMS = [
    "*__VERDICT:__* APPROVE",
    "*__VERDICT__*: APPROVE",
    "**_VERDICT:_** APPROVE",
    "**_VERDICT_**: APPROVE",
    "_**VERDICT:**_ APPROVE",
    "_**VERDICT**_: APPROVE",
    "__*VERDICT:*__ APPROVE",
    "__*VERDICT*__: APPROVE",
    "***VERDICT:*** APPROVE", // homogeneous run of three, same code path
  ];

  it.each(COMBINED_LABEL_FORMS)("recovers the verdict from %j", async (line) => {
    expect(await dispatchMessage(`${line}\n`)).toMatchObject({
      status: "verdict",
      verdict: "APPROVE",
      verdictLine: line,
    });
  });

  // The mirror rule must not start eating a WRAPPER's opening run, which is the
  // regression the backreference was protecting against in the first place.
  it.each([["*__VERDICT: APPROVE__*"], ["**_VERDICT: APPROVE_**"], ["__*VERDICT: APPROVE*__"]])(
    "still unwraps the whole-line form %j",
    async (line) => {
      expect(await dispatchMessage(`${line}\n`)).toMatchObject({
        status: "verdict",
        verdict: "APPROVE",
      });
    },
  );

  // The guards must survive the widening. A bullet is still a bullet even
  // though the label may now carry its own emphasis, and a code span is still
  // quoted text.
  it.each([
    ["* VERDICT: APPROVE"],
    ["* **VERDICT:** APPROVE"],
    ["`**VERDICT:** APPROVE`"],
    ["Write **VERDICT:** APPROVE at the end."], // prose: the line anchor holds
  ])("still refuses %j", async (line) => {
    expect(await dispatchMessage(`${line}\n`)).toMatchObject({
      status: "no_verdict",
      verdict: null,
    });
  });
});
