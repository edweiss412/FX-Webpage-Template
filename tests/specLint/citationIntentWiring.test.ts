import { describe, expect, it } from "vitest";
import { checkCitations } from "../../lib/specLint/citations";
import { parseDoc, splitLines } from "../../lib/specLint/parse";
import { runLint } from "../../lib/specLint/run";
import type { FileResolver, Finding } from "../../lib/specLint/types";

/**
 * The intent arm as the orchestrator sees it (spec §6 wiring bullet): tiers,
 * details, relocation, the accept-set, and the span-exclusion parameter — all
 * through `runLint` / `checkCitations` rather than the classifier in isolation.
 *
 * Every finding assertion pins code, severity, docLine AND column, each derived
 * from how the fixture line is built rather than pasted from a run.
 */

function makeResolver(files: Record<string, string | null>): {
  resolver: FileResolver;
  reads: string[];
} {
  const reads: string[] = [];
  return {
    resolver: {
      listTrackedFiles: () => Object.keys(files),
      readFileLines: (p) => {
        reads.push(p);
        const c = files[p];
        return c === null || c === undefined ? null : splitLines(c);
      },
    },
    reads,
  };
}

function allFindings(
  text: string,
  files: Record<string, string | null>,
  kind: "spec" | "plan" = "plan",
): Finding[] {
  const { resolver } = makeResolver(files);
  return runLint({ text, repoRelPath: "docs/x.md", kind, kindSource: "explicit" }, resolver)
    .findings;
}

function lint(text: string, files: Record<string, string | null>): Finding[] {
  return allFindings(text, files).filter((f) => f.check === "citations");
}

/** `prefix` + a backticked citation; the returned column is the span's content start. */
function cited(prefix: string, cite: string, suffix = "."): { text: string; column: number } {
  return { text: `${prefix}\`${cite}\`${suffix}`, column: prefix.length + 2 };
}

const PAD = "  // padding";
const file = (spec: { length: number; decl?: string; at?: Record<number, string> }): string => {
  const lines = Array.from({ length: spec.length }, () => PAD);
  if (spec.decl !== undefined) lines[0] = spec.decl;
  for (const [n, text] of Object.entries(spec.at ?? {})) lines[Number(n) - 1] = text;
  return lines.join("\n") + "\n";
};

describe("tier findings through runLint (spec §3.5)", () => {
  it("UNMATCHED keeps its message and gains the enclosing name in the detail", () => {
    const { text, column } = cited("Names `nopeSym` at ", "lib/p.ts:12");
    const findings = lint(text + "\n", {
      "lib/p.ts": file({
        length: 30,
        decl: "export function fooBar() {",
        at: { 12: "  const middle = 1;", 30: "  nopeSym();" },
      }),
    });
    expect(findings).toEqual([
      {
        check: "citations",
        code: "CITATION_SYMBOL_UNMATCHED",
        severity: "advisory",
        docLine: 1,
        column,
        message: "no same-line identifier found near lib/p.ts:12",
        detail: "cited line: const middle = 1; · enclosing: fooBar",
      },
    ]);
  });

  it("ABSENT names the peer file even when the true home is cited LATER in the doc", () => {
    // The two-pass discriminator: relocation searches the FULL resolved set, so
    // a single-pass implementation (relocating during the span loop) finds
    // nothing here and reports the fallback string instead.
    const first = cited("Sites list names `runOnboardingScan` at ", "lib/sync/wrong.ts:12");
    const later = cited("The real home is ", "lib/sync/runOnboardingScan.ts:1");
    const findings = lint(`${first.text}\n${later.text}\n`, {
      "lib/sync/wrong.ts": file({ length: 30, decl: "export function unrelatedHelper() {" }),
      "lib/sync/runOnboardingScan.ts": "export function runOnboardingScan() {\n  return 1;\n}\n",
    });
    expect(findings).toEqual([
      {
        check: "citations",
        code: "CITATION_SYMBOL_ABSENT",
        severity: "advisory",
        docLine: 1,
        column: first.column,
        message: "same-line identifiers absent from lib/sync/wrong.ts",
        detail:
          "enclosing: unrelatedHelper · identifiers: runOnboardingScan · found in: lib/sync/runOnboardingScan.ts",
      },
    ]);
  });

  it("relocation hints cap at 3 peers, keeping doc order", () => {
    const wrong = cited("Names `sharedSym` at ", "lib/wrong.ts:12");
    const peers = ["a", "b", "c", "d", "e"];
    const peerLines = peers.map((p) => cited(`Peer ${p} is `, `lib/${p}.ts:1`).text).join("\n");
    const files: Record<string, string> = {
      "lib/wrong.ts": file({ length: 30, decl: "export function unrelatedHelper() {" }),
    };
    for (const p of peers) files[`lib/${p}.ts`] = "  sharedSym();\n";
    const findings = lint(`${wrong.text}\n${peerLines}\n`, files);
    expect(findings).toEqual([
      expect.objectContaining({
        code: "CITATION_SYMBOL_ABSENT",
        severity: "advisory",
        docLine: 1,
        column: wrong.column,
        detail:
          "enclosing: unrelatedHelper · identifiers: sharedSym · found in: lib/a.ts, lib/b.ts, lib/c.ts",
      }),
    ]);
  });

  it("ABSENT with no other cited file prints the exact fallback string", () => {
    const { text, column } = cited("Names `nowhereSym` at ", "lib/p.ts:12");
    expect(lint(text + "\n", { "lib/p.ts": file({ length: 30 }) })).toEqual([
      expect.objectContaining({
        code: "CITATION_SYMBOL_ABSENT",
        severity: "advisory",
        docLine: 1,
        column,
        detail:
          "enclosing: (none) · identifiers: nowhereSym · found in: none of the doc's other cited files",
      }),
    ]);
  });

  it("a peer whose read returns null is skipped, without a finding of its own", () => {
    const wrong = cited("Names `sharedSym` at ", "lib/wrong.ts:12");
    const dead = cited("Unreadable peer ", "lib/dead.ts");
    const live = cited("Live peer ", "lib/live.ts");
    const findings = lint(`${wrong.text}\n${dead.text}\n${live.text}\n`, {
      "lib/wrong.ts": file({ length: 30 }),
      "lib/dead.ts": null,
      "lib/live.ts": "  sharedSym();\n",
    });
    expect(findings).toEqual([
      expect.objectContaining({
        code: "CITATION_SYMBOL_ABSENT",
        docLine: 1,
        column: wrong.column,
        detail: "enclosing: (none) · identifiers: sharedSym · found in: lib/live.ts", // dead.ts omitted
      }),
    ]);
  });

  it("a citation whose doc line names no identifier stays silent (spec §8 item 11)", () => {
    expect(lint("just `lib/p.ts:12` alone\n", { "lib/p.ts": file({ length: 30 }) })).toEqual([]);
  });
});

describe("accept-set: only resolved, in-range, id-bearing citations are classified (spec §3.1)", () => {
  const FILE = file({ length: 10 });

  it.each([
    ["path-only", "lib/p.ts", [] as string[]],
    ["unreadable", "lib/dead.ts:1", ["CITATION_UNREADABLE"]],
    ["out of range", "lib/p.ts:99", ["CITATION_LINE_OUT_OF_RANGE"]],
    ["inverted range", "lib/p.ts:5-2", ["CITATION_RANGE_INVERTED"]],
  ])("an id-bearing %s citation draws no intent advisory", (_label, cite, expected) => {
    const { text } = cited("Names `nowhereSym` at ", cite);
    const codes = lint(text + "\n", { "lib/p.ts": FILE, "lib/dead.ts": null }).map((f) => f.code);
    expect(codes).toEqual(expected);
  });
});

describe("excludedSpans — span-exact removal from the citation pass (spec §5)", () => {
  const key = (line: number, column: number) => `${line}:${column}`;

  it("an excluded span draws no finding and is not a candidate span", () => {
    const { text, column } = cited("Names `nopeSym` at ", "zzz/gone.ts:1");
    const model = parseDoc(text + "\n");
    const { resolver } = makeResolver({ "lib/p.ts": "x\n" });

    const without = checkCitations(model, resolver);
    expect(without.findings.map((f) => f.code)).toEqual(["CITATION_FILE_MISSING"]);
    expect(without.candidateSpans.map((s) => s.content)).toEqual(["zzz/gone.ts:1"]);

    const withExclusion = checkCitations(model, resolver, new Set([key(1, column)]));
    expect(withExclusion.findings).toEqual([]);
    expect(withExclusion.candidateSpans).toEqual([]);
    expect(withExclusion.resolvedPaths).toEqual([]);
  });

  it("an excluded span cannot anchor a later bare shorthand", () => {
    const first = cited("", "lib/deep/anchor.ts:1", "");
    const second = cited(" then ", "anchor.ts:2", "");
    const text = `${first.text}${second.text}\n`;
    const model = parseDoc(text);
    const { resolver } = makeResolver({
      "lib/deep/anchor.ts": "a\nb\nc\n",
      "other/anchor.ts": "a\n", // two basename matches: only the anchor disambiguates
    });

    expect(checkCitations(model, resolver).findings).toEqual([]);
    const excluded = checkCitations(model, resolver, new Set([key(1, first.column)]));
    expect(excluded.findings.map((f) => f.code)).toEqual(["CITATION_AMBIGUOUS"]);
  });

  it("an excluded span never feeds relocation hints", () => {
    const wrong = cited("Names `sharedSym` at ", "lib/wrong.ts:12");
    const peer = cited("Peer ", "lib/peer.ts:1");
    const text = `${wrong.text}\n${peer.text}\n`;
    const files = {
      "lib/wrong.ts": file({ length: 30 }),
      "lib/peer.ts": "  sharedSym();\n",
    };
    const { resolver } = makeResolver(files);
    const model = parseDoc(text);

    const hinted = checkCitations(model, resolver).findings[0]!;
    expect(hinted.detail).toContain("found in: lib/peer.ts");

    const excluded = checkCitations(model, resolver, new Set([key(2, peer.column)])).findings[0]!;
    expect(excluded.detail).toContain("found in: none of the doc's other cited files");
  });
});

describe("peer-read economy (spec §3.4)", () => {
  it("reads each distinct path at most once and never re-reads the cited file as a peer", () => {
    // Two ABSENT citations of the same wrong file, two citations of the same
    // peer: a naive implementation reads on every classification.
    const wrongA = cited("Names `sharedSym` at ", "lib/wrong.ts:12");
    const wrongB = cited("Also names `sharedSym` at ", "lib/wrong.ts:20");
    const peerA = cited("Peer ", "lib/peer.ts:1");
    const peerB = cited("Peer again ", "lib/peer.ts:1");
    const { resolver, reads } = makeResolver({
      "lib/wrong.ts": file({ length: 30 }),
      "lib/peer.ts": "  sharedSym();\n",
    });
    const result = checkCitations(
      parseDoc(`${wrongA.text}\n${wrongB.text}\n${peerA.text}\n${peerB.text}\n`),
      resolver,
    );

    expect(result.findings.map((f) => f.code)).toEqual([
      "CITATION_SYMBOL_ABSENT",
      "CITATION_SYMBOL_ABSENT",
    ]);
    expect(reads.filter((p) => p === "lib/wrong.ts")).toHaveLength(1);
    expect(reads.filter((p) => p === "lib/peer.ts")).toHaveLength(1);
  });
});

describe("red-contract surfaces through runLint (spec §5, §6 wiring)", () => {
  const OPEN_RC = "<!-- tasks: depth=2 red-contract -->";
  const END = "<!-- tasks: end -->";
  const doc = (...lines: string[]) => lines.join("\n") + "\n";
  const FILES = { "lib/a.ts": "one\ntwo\nthree\n" };
  const targetColumn = (line: string) => line.indexOf("red-target=`") + "red-target=`".length + 1;

  it("the red-target span is excluded from the citation pass and validated instead", () => {
    const marker =
      "<!-- task: red=`pnpm test` red-state=authored red-target=`zzz/gone.ts:1` why=`w` ac=AC-1 -->";
    const findings = allFindings(doc(OPEN_RC, "## A", marker, "AC-1 here.", END), FILES);
    expect(findings).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "RED_TARGET_INVALID",
        severity: "fail",
        docLine: 3,
        column: targetColumn(marker),
      }),
    ]);
    // The replacement is exact: no CITATION_FILE_MISSING for the same span.
    expect(findings.some((f) => f.check === "citations")).toBe(false);
  });

  it.each([
    ["red=", "<!-- task: red=`zzz/gone.ts:1` red-state=live why=`w` ac=AC-1 -->"],
    ["why=", "<!-- task: red=`pnpm test` red-state=live why=`zzz/gone.ts:1` ac=AC-1 -->"],
  ])(
    "a citation-shaped span in %s keeps today's hard citation finding (probed, review R4)",
    (_label, marker) => {
      const codes = allFindings(doc(OPEN_RC, "## A", marker, "AC-1 here.", END), FILES).map(
        (f) => f.code,
      );
      expect(codes).toContain("CITATION_FILE_MISSING");
    },
  );

  it.each([
    ["gate cmd=", "<!-- gate: cmd=`zzz/gone.ts:1` probed=`p` -->"],
    ["gate probed=", "<!-- gate: cmd=`pnpm test` probed=`zzz/gone.ts:1` -->"],
  ])("a citation-shaped span in a %s capture keeps its hard citation finding", (_label, gate) => {
    const codes = allFindings(doc("# Plan", gate), FILES).map((f) => f.code);
    expect(codes).toContain("CITATION_FILE_MISSING");
  });

  it("marker spans in a SPEC keep today's citation behavior entirely (probed, review R3)", () => {
    const marker =
      "<!-- task: red=`pnpm test` red-state=authored red-target=`zzz/gone.ts:1` why=`w` ac=AC-1 -->";
    const codes = allFindings(doc("## Resolved scope", marker), FILES, "spec").map((f) => f.code);
    expect(codes).toContain("CITATION_FILE_MISSING");
    expect(codes).not.toContain("RED_TARGET_INVALID");
  });

  it("a §4.3 hard code and a gate code both reach the report under check taskContract", () => {
    const findings = allFindings(
      doc(
        OPEN_RC,
        "## A",
        "<!-- task: red=`pnpm test` ac=AC-1 -->",
        "AC-1 here.",
        END,
        "<!-- gate: cmd=`pnpm ci` -->",
      ),
      FILES,
    );
    expect(findings).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "RED_STATE_MISSING",
        severity: "fail",
        docLine: 3,
        column: 1,
      }),
      expect.objectContaining({
        check: "taskContract",
        code: "RED_WHY_MISSING",
        severity: "fail",
        docLine: 3,
        column: 1,
      }),
      expect.objectContaining({
        check: "taskContract",
        code: "GATE_UNPROBED",
        severity: "advisory",
        docLine: 6,
        column: 1,
      }),
    ]);
  });
});
