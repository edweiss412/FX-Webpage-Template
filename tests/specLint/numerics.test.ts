import { describe, expect, it } from "vitest";
import { checkCitations } from "../../lib/specLint/citations";
import { checkNumerics } from "../../lib/specLint/numerics";
import { parseDoc, splitLines } from "../../lib/specLint/parse";
import { runLint } from "../../lib/specLint/run";
import type { Finding, FileResolver } from "../../lib/specLint/types";

const emptyResolver: FileResolver = {
  listTrackedFiles: () => ["lib/x.ts"],
  readFileLines: () => splitLines("a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\n"),
};

function run(docText: string, scriptTexts?: Record<string, string>) {
  const model = parseDoc(docText);
  const { candidateSpans } = checkCitations(model, emptyResolver);
  return { model, ...checkNumerics(model, candidateSpans, scriptTexts) };
}

/** Findings of ONE code. Every case below scopes to its own code, so a fixture can never
 * pass because a different arm happened to fire on the same line (anti-tautology). */
const only = (findings: Finding[], code: string): Finding[] =>
  findings.filter((f) => f.code === code);

/** The spec §7 snippet formula, applied to the fixture's own line (anti-tautology: derived, not hardcoded). */
function expectedSnippet(line: string, column: number): string {
  return line.slice(Math.max(0, column - 41), column + 40);
}

describe("checkNumerics — lexicon exclusions (spec §5)", () => {
  it.each([
    ["ISO date", "released 2026-07-19 today\n"],
    ["version with v", "using v1.2.3 now\n"],
    ["bare version", "using 1.2.3 now\n"],
    ["clock time", "at 12:30 sharp\n"],
    ["hex literal", "mask 0xFF applied\n"],
  ])("%s excluded from inventory", (_label, doc) => {
    expect(run(doc).inventory).toEqual([]);
  });

  it("number inside a citation-candidate span excluded", () => {
    const { inventory } = run("see `lib/x.ts:12` here\n");
    expect(inventory).toEqual([]);
  });

  it("fenced lines not scanned", () => {
    const { inventory } = run(["```", "45 codes", "```"].join("\n"));
    expect(inventory).toEqual([]);
  });
});

describe("checkNumerics — noun-anchored mismatch (spec §5)", () => {
  it("distinct raws for one noun → ONE advisory at first occurrence, all occurrences in detail", () => {
    const { findings } = run("there are 45 codes\nbut later 44 codes\n");
    expect(findings).toEqual([
      expect.objectContaining({
        check: "numerics",
        code: "NUMERIC_NOUN_MISMATCH",
        severity: "advisory",
        docLine: 1,
        column: 11,
      }),
    ]);
    expect(findings[0]!.detail).toContain('doc line 1: "45 codes"');
    expect(findings[0]!.detail).toContain('doc line 2: "44 codes"');
  });

  it("same number twice → no mismatch", () => {
    expect(run("3 rounds first\n3 rounds again\n").findings).toEqual([]);
  });

  it("singular/plural normalize to the same noun", () => {
    const { findings } = run("1 code here\n44 codes there\n");
    expect(findings.map((f) => f.code)).toEqual(["NUMERIC_NOUN_MISMATCH"]);
  });

  it("advisories only — never fail severity", () => {
    const { findings } = run("2 things\n3 things\n");
    expect(findings.every((f) => f.severity === "advisory")).toBe(true);
  });
});

describe("checkNumerics — inventory (spec §5/§7)", () => {
  it("groups by RAW text; 1 vs 1.0 distinct; ordered by Number(raw) then raw", () => {
    const { inventory } = run("1.0 units and 1 unit and 2 units\n");
    expect(inventory.map((g) => g.raw)).toEqual(["1", "1.0", "2"]);
  });

  it("occurrences within a group ordered by (docLine, column)", () => {
    const { inventory } = run("7 alpha then 7 beta\nand 7 gamma\n");
    expect(inventory).toHaveLength(1);
    const occ = inventory[0]!.occurrences;
    expect(occ.map((o) => [o.docLine, o.column])).toEqual([
      [1, 1],
      [1, 14],
      [2, 5],
    ]);
  });

  it("snippet at line start, middle, and end — derived from fixture line", () => {
    const long = "x".repeat(60) + " 42 " + "y".repeat(60);
    const { inventory } = run(["5 start", long, "tail ends with 9"].join("\n") + "\n");
    const flat = inventory.flatMap((g) => g.occurrences);
    for (const o of flat) {
      const line = [["5 start"], [long], ["tail ends with 9"]][o.docLine - 1]![0]!;
      expect(o.snippet).toBe(expectedSnippet(line, o.column));
    }
  });

  it("astral: column and snippet slice in UTF-16 units", () => {
    const line = "💥 42 items";
    const { inventory } = run(line + "\n");
    expect(inventory).toHaveLength(1);
    const occ = inventory[0]!.occurrences[0]!;
    expect(occ.column).toBe(4); // emoji = 2 units, space = 1
    expect(occ.snippet).toBe(expectedSnippet(line, 4));
  });

  it("inventory is NOT findings", () => {
    const { findings, inventory } = run("42 wonders\n");
    expect(inventory).toHaveLength(1);
    expect(findings).toEqual([]);
  });
});

// ===========================================================================
// Prose-count parity arms (spec docs/superpowers/specs/2026-08-10-speclint-
// prose-count-parity.md). Three advisory codes, one describe block each, plus
// the shared exclusion contract (§1.1) and the finding-payload contract.
// ===========================================================================

const A = "SCRIPT_CONSTANT_PARITY";
const B = "SIBLING_LIST_CARDINALITY";
const C = "TEMPLATE_QUANTITY_DRIFT";

// ---------------------------------------------------------------------------
// Shape (a) — script-constant parity (spec §3.1)
// ---------------------------------------------------------------------------

/** The live corpus's one qualifying constant lives here (spec §3.1). */
const PARITY_SCRIPT = "scripts/verify-cn-operand-parity.mjs";
const SITE_TOTAL = 37;

const scriptSrc = (...decls: string[]): string =>
  ["// header comment", ...decls, "export default null;", ""].join("\n");

const siteConst = (n: number): string => `const EXPECTED_SITE_TOTAL = ${n};`;

/** A doc line shaped like the two live qualifying occurrences (spec §3.1). */
const acLine = (count: number, noun = "sites"): string =>
  `| AC-3 | \`${PARITY_SCRIPT}\` reports parity for all ${count} ${noun} |`;

describe("SCRIPT_CONSTANT_PARITY — shape (a), spec §3.1", () => {
  it("drifted present-tense count against the named script's constant → ONE advisory", () => {
    const { findings } = run(acLine(SITE_TOTAL + 1) + "\n", {
      [PARITY_SCRIPT]: scriptSrc(siteConst(SITE_TOTAL)),
    });
    expect(only(findings, A)).toHaveLength(1);
    expect(only(findings, A)[0]).toMatchObject({
      check: "numerics",
      code: A,
      severity: "advisory",
      docLine: 1,
    });
  });

  it("the message carries BOTH compared quantities and names the constant", () => {
    const msg = only(
      run(acLine(38) + "\n", { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) }).findings,
      A,
    )[0]!.message;
    expect(msg).toContain("38");
    expect(msg).toContain("37");
    expect(msg).toContain("EXPECTED_SITE_TOTAL");
  });

  it("agreeing count → no advisory (the two live occurrences are parity)", () => {
    const { findings } = run(acLine(SITE_TOTAL) + "\n", {
      [PARITY_SCRIPT]: scriptSrc(siteConst(SITE_TOTAL)),
    });
    expect(only(findings, A)).toEqual([]);
  });

  it("a count with the dated at-authoring-time qualifier is EXCLUDED, not flagged", () => {
    const { findings } = run(`\`${PARITY_SCRIPT}\` covered 38 sites at authoring time\n`, {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    expect(only(findings, A)).toEqual([]);
  });

  it("a dated (ISO) historical line is EXCLUDED wholesale", () => {
    const { findings } = run(
      `2026-08-07 — \`${PARITY_SCRIPT}\` reported 38 sites in the probe transcript\n`,
      { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) },
    );
    expect(only(findings, A)).toEqual([]);
  });

  it("a fenced mention is EXCLUDED", () => {
    const { findings } = run(
      ["```", `\`${PARITY_SCRIPT}\` reports parity for all 38 sites`, "```", ""].join("\n"),
      { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) },
    );
    expect(only(findings, A)).toEqual([]);
  });

  // The nearest-binding discriminator (spec §1.1 (ii), R6 F1/F4). SYNTHETIC: no live
  // same-line-qualifying instance of a mixed line exists (spec §3.1).
  describe("SYNTHETIC mixed line — `all 37 sites (36 sites at plan time)`", () => {
    const mixed = `\`${PARITY_SCRIPT}\` covers all 37 sites (36 sites at plan time)\n`;

    it("the 37 COMPARES: against a constant of 36 it draws exactly one advisory", () => {
      // A qualifier that excluded EVERY number within 40 characters before it would
      // exclude the 37 too, and this case would report zero.
      const { findings } = run(mixed, { [PARITY_SCRIPT]: scriptSrc(siteConst(36)) });
      expect(only(findings, A)).toHaveLength(1);
      expect(only(findings, A)[0]!.message).toContain("37");
    });

    it("the 36 is EXCLUDED: against a constant of 37 the line is silent", () => {
      // With no qualifier exclusion at all, the 36 would compare against 37 and fire.
      const { findings } = run(mixed, { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) });
      expect(only(findings, A)).toEqual([]);
    });
  });

  it.each([
    ["4 re-runs", `\`${PARITY_SCRIPT}\` needed 4 re-runs to converge\n`],
    ["18 files", `\`${PARITY_SCRIPT}\` reads each of the 18 files at the parent commit\n`],
  ])("noun-match rejects an unrelated same-line cardinality (%s)", (_label, doc) => {
    const { findings } = run(doc, { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) });
    expect(only(findings, A)).toEqual([]);
  });

  it("two EXPECTED_* constants in one script each associate by their OWN derived noun", () => {
    const src = scriptSrc(siteConst(37), "const EXPECTED_FILE_COUNT = 18;");
    const line = `\`${PARITY_SCRIPT}\` covers 38 sites across 18 files\n`;
    // 38 mismatches EXPECTED_SITE_TOTAL; 18 agrees with EXPECTED_FILE_COUNT.
    expect(only(run(line, { [PARITY_SCRIPT]: src }).findings, A)).toHaveLength(1);
    const both = `\`${PARITY_SCRIPT}\` covers 38 sites across 19 files\n`;
    expect(only(run(both, { [PARITY_SCRIPT]: src }).findings, A)).toHaveLength(2);
  });

  it.each([
    ["non-module-local (indented)", `  ${siteConst(37)}`],
    ["non-integer decimal", "const EXPECTED_SITE_TOTAL = 37.5;"],
    ["non-literal initialiser", "const EXPECTED_SITE_TOTAL = SITES.length;"],
    ["identifier outside the accept-set", "const expected_site_total = 37;"],
  ])("rejects a declaration outside the accept-set: %s", (_label, decl) => {
    const { findings } = run(acLine(38) + "\n", { [PARITY_SCRIPT]: scriptSrc(decl) });
    expect(only(findings, A)).toEqual([]);
  });

  it("a constant whose derived noun matches nothing on the line contributes nothing", () => {
    const { findings } = run(acLine(38) + "\n", {
      [PARITY_SCRIPT]: scriptSrc("const EXPECTED_WIDGET_TOTAL = 3;"),
    });
    expect(only(findings, A)).toEqual([]);
  });

  it("association is SAME-LINE: a count on a line that does not name the script is outside the accept-set", () => {
    // Mirrors the live plan's :21 (spec §3.1): the mention and the count are on
    // different lines, so nothing qualifies.
    const doc = [
      `It is checked by \`${PARITY_SCRIPT}\`.`,
      "It reports parity for all 38 sites.",
      "",
    ].join("\n");
    expect(only(run(doc, { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) }).findings, A)).toEqual([]);
  });

  it("a BASENAME mention (no scripts/ prefix) also associates", () => {
    // Every live mention is full-path; without basename recognition a path-only
    // recognizer would pass every check vacuously.
    const { findings } = run("`verify-cn-operand-parity.mjs` reports parity for all 38 sites\n", {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    expect(only(findings, A)).toHaveLength(1);
  });

  it("a basename glued into a longer token is NOT a mention", () => {
    const { findings } = run("`x-verify-cn-operand-parity.mjsx` covers 38 sites\n", {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    expect(only(findings, A)).toEqual([]);
  });

  it("no script texts at all → the arm is silent (no I/O, no guessing)", () => {
    expect(only(run(acLine(38) + "\n").findings, A)).toEqual([]);
  });
});

describe("SCRIPT_CONSTANT_PARITY — resolver plumbing through runLint (spec §2)", () => {
  const docPath = "docs/superpowers/specs/2026-08-10-fixture.md";

  function lint(text: string, tracked: string[], files: Record<string, string>) {
    const resolver: FileResolver = {
      listTrackedFiles: () => tracked,
      readFileLines: (p) => (p in files ? splitLines(files[p]!) : null),
    };
    return runLint({ text, repoRelPath: docPath, kind: "spec", kindSource: "inferred" }, resolver);
  }

  it("runLint resolves the same-line-named script and the arm fires end-to-end", () => {
    const r = lint(acLine(38) + "\n", [PARITY_SCRIPT], {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    expect(only(r.findings, A)).toHaveLength(1);
  });

  it("a path the resolver cannot serve contributes nothing and does not throw", () => {
    const r = lint(acLine(38) + "\n", [PARITY_SCRIPT], {});
    expect(only(r.findings, A)).toEqual([]);
  });

  it("resolves a BASENAME mention through the tracked-file list", () => {
    const r = lint(
      "`verify-cn-operand-parity.mjs` reports parity for all 38 sites\n",
      [PARITY_SCRIPT],
      {
        [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
      },
    );
    expect(only(r.findings, A)).toHaveLength(1);
  });

  it("only scripts/ paths are resolved (a lib/ mention is not a script mention)", () => {
    const r = lint("`lib/specLint/numerics.ts` covers 38 sites\n", ["lib/specLint/numerics.ts"], {
      "lib/specLint/numerics.ts": scriptSrc(siteConst(37)),
    });
    expect(only(r.findings, A)).toEqual([]);
  });

  it("every arm's findings stay advisory through the whole runLint pipeline", () => {
    const r = lint(acLine(38) + "\n", [PARITY_SCRIPT], {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    for (const code of [A, B, C]) {
      expect(only(r.findings, code).every((f) => f.severity === "advisory")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Shape (b) — sibling-list cardinality (spec §3.2)
// ---------------------------------------------------------------------------

const bullets = (n: number, indent = ""): string[] =>
  Array.from({ length: n }, (_, i) => `${indent}- shape ${i + 1}`);

/** Claim line + an adjacent list of `n` items. */
const claimOver = (claim: string, n: number, indent = ""): string =>
  [claim, ...bullets(n, indent), ""].join("\n");

describe("SIBLING_LIST_CARDINALITY — shape (b), spec §3.2", () => {
  const MOTIVATING = "The spec names three measured shapes:";

  it("the motivating instance: a `three` claim over a 2-item list → ONE advisory", () => {
    const { findings } = run(claimOver(MOTIVATING, 2));
    expect(only(findings, B)).toHaveLength(1);
    expect(only(findings, B)[0]).toMatchObject({
      check: "numerics",
      code: B,
      severity: "advisory",
      docLine: 1,
    });
  });

  it("the message carries BOTH compared quantities", () => {
    const msg = only(run(claimOver(MOTIVATING, 2)).findings, B)[0]!.message;
    expect(msg).toContain("3");
    expect(msg).toContain("2");
  });

  it("parity → silent", () => {
    expect(only(run(claimOver(MOTIVATING, 3)).findings, B)).toEqual([]);
  });

  // ---- one fixture per gate, each flipping exactly ONE gate of MOTIVATING ----

  it("gate: claim value outside 2-40", () => {
    expect(only(run(claimOver("The spec names 41 measured shapes:", 2)).findings, B)).toEqual([]);
  });

  it("gate: the claim is not the line's LAST recognized cardinality", () => {
    // The trailing `2 files` is itself parity with the 2-item list, so the only
    // thing this case can report on is the non-final `three`.
    const doc = claimOver("The spec names three measured shapes across 2 files:", 2);
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("gate: a sentence end follows the claim", () => {
    expect(
      only(run(claimOver("The spec names three measured shapes. And now:", 2)).findings, B),
    ).toEqual([]);
  });

  it("gate: neither colon-terminated nor within 60 characters of the line end", () => {
    const long =
      "The spec names three measured shapes and then continues with a great deal of extra prose running well past the sixty character tail bound";
    expect(only(run(claimOver(long, 2)).findings, B)).toEqual([]);
  });

  it("gate: nested-list indentation — a claim bullet at the list's own indent", () => {
    const doc = ["- The spec names three measured shapes:", ...bullets(2), ""].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("gate satisfied: a claim bullet over a MORE deeply indented list still fires", () => {
    const doc = ["- The spec names three measured shapes:", ...bullets(2, "  "), ""].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("gate: lexical guard rejects a decimal/section fragment", () => {
    // `§12.4 items` — the `4` is a decimal tail, not a cardinality.
    expect(only(run(claimOver("Shapes are enumerated in §12.4 items:", 2)).findings, B)).toEqual(
      [],
    );
  });

  it("gate: list adjacency — prose between the claim and the list", () => {
    const doc = ["The spec names three measured shapes:", "Here they are.", ...bullets(2), ""].join(
      "\n",
    );
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("gate: the claim's noun must be plural", () => {
    expect(only(run(claimOver("The spec names three measured shape:", 2)).findings, B)).toEqual([]);
  });

  it("the counter STOPS at a checklist step rather than running into task scaffolding", () => {
    // Plain counting sees 4 items and would flag; the contract's counter stops at
    // the `Step 4` bullet, reads 3, and agrees with the claim.
    const doc = [
      "The spec names three measured shapes:",
      ...bullets(3),
      "- Step 4 do the thing",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  // ---- the shared exclusion contract, pinned for this arm (spec §1.1, R6 F4) ----

  it("exclusion: a fenced claim is not scanned", () => {
    const doc = ["```", "The spec names three measured shapes:", "- a", "- b", "```", ""].join(
      "\n",
    );
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("exclusion: an ISO-dated line is excluded wholesale", () => {
    expect(
      only(run(claimOver("The 2026-08-10 probe named three measured shapes:", 2)).findings, B),
    ).toEqual([]);
  });

  it("exclusion: a dated qualifier binds the claim", () => {
    expect(
      only(run(claimOver("The spec names three measured shapes at plan time:", 2)).findings, B),
    ).toEqual([]);
  });

  // ---- the number-word table, declared INDEPENDENTLY of the implementation ----

  /**
   * The committed prototype's list (`docs/superpowers/specs/probes/
   * 2026-08-10-prose-count-probe-v5.ts:21`), transcribed here rather than imported:
   * importing the implementation's own table would assert it against itself, and a
   * word silently dropped from the arm has to red something.
   */
  const NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
  };

  it.each(Object.entries(NUMBER_WORDS))(
    "word form `%s` parses as its value and meets the 2-40 range gate accordingly",
    (word, value) => {
      // A list length that can never equal the claim, so a recognized in-range word
      // MUST flag and an out-of-range one must not.
      const items = value === 2 ? 3 : 2;
      const findings = only(
        run(claimOver(`The spec names ${word} measured shapes:`, items)).findings,
        B,
      );
      const inRange = value >= 2 && value <= 40;
      expect(findings).toHaveLength(inRange ? 1 : 0);
      if (inRange) expect(findings[0]!.message).toContain(String(value));
    },
  );

  it.each(["sixty", "hundred", "dozen"])("`%s` is outside the word table", (word) => {
    expect(only(run(claimOver(`The spec names ${word} measured shapes:`, 2)).findings, B)).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// Shape (c) — quoted-template quantity drift (spec §3.3)
// ---------------------------------------------------------------------------

/** 14 shared tokens + one distinguishing numeral: pairwise Jaccard 14/16 = 0.875. */
const roundLine = (n: number): string =>
  `Round R3 dispatched ${n} reviewers against the shipped guard surface and recorded the final verdict here`;

/** A line of EXACTLY `len` characters carrying `num`, sharing 13 tokens with its sibling. */
function sizedLine(len: number, num: string): string {
  const shared = "aa bb cc dd ee ff gg hh ii jj kk ll";
  const padLen = len - (shared.length + 2 + num.length);
  const line = `${shared} ${"z".repeat(padLen)} ${num}`;
  if (line.length !== len) throw new Error(`sizedLine built ${line.length}, wanted ${len}`);
  return line;
}

describe("TEMPLATE_QUANTITY_DRIFT — shape (c), spec §3.3", () => {
  it("a real measured block-repeat group (picker-flow plan :136/:264) → ONE advisory", () => {
    const doc = [
      "Modify: `tests/e2e/picker-flow.spec.ts` (un-skip the paired stub at line 84, this task's outer red phase)",
      "",
      "Modify: `tests/e2e/picker-flow.spec.ts` (un-skip the paired stub at line 241, this task's outer red phase)",
      "",
    ].join("\n");
    const findings = only(run(doc).findings, C);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      check: "numerics",
      code: C,
      severity: "advisory",
      docLine: 1,
    });
  });

  it("the message carries BOTH compared quantities", () => {
    const msg = only(run([roundLine(4), "", roundLine(7), ""].join("\n")).findings, C)[0]!.message;
    expect(msg).toContain("4");
    expect(msg).toContain("7");
  });

  it("a pair differing only in a path — no numeric change, no advisory", () => {
    const doc = [
      "Run: `pnpm vitest run tests/sync/perFileProcessor.test.ts` and inspect the 3 emitted rows",
      "",
      "Run: `pnpm vitest run tests/sync/recoveryResolution.test.ts` and inspect the 3 emitted rows",
      "",
    ].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
  });

  it("the wedge-remeasure anchor pair stays SILENT — the arm's documented limit (spec §3.3)", () => {
    // Line-level Jaccard 0.0748: below any bounded threshold. The instance remains
    // covered by the RULE half of the originating filing, not by this arm.
    const doc = [
      "Reports state wedged flips against FLIPS EXECUTED (counted per sample), not against a fixed 2-per-sample denominator.",
      "",
      "Entry stays in BACKLOG.md: a dated stamp line records the new measurement (N wedged samples of 20 valid samples; M wedged flips of F executed flips, F counted from the trace artifacts per item 4).",
      "",
    ].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
  });

  it("a group the instrument's RECORD denylist would have suppressed still FLAGS", () => {
    // `R3` / `dispatched` / `verdict` are all denylist triggers in the prototype
    // (probe-v5.ts:127). The contract carries no denylist.
    expect(only(run([roundLine(4), "", roundLine(7), ""].join("\n")).findings, C)).toHaveLength(1);
  });

  it("a three-member family yields ALL THREE pairs, not one greedy group", () => {
    const doc = [roundLine(4), "", roundLine(7), "", roundLine(9), ""].join("\n");
    const findings = only(run(doc).findings, C);
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.docLine)).toEqual([1, 1, 3]);
  });

  it.each([
    [40, 1],
    [39, 0],
    [400, 1],
    [401, 0],
  ])("candidate length %i characters → %i advisories", (len, expected) => {
    const doc = [sizedLine(len, "7"), "", sizedLine(len, "9"), ""].join("\n");
    expect(only(run(doc).findings, C)).toHaveLength(expected);
  });

  describe("the 0.85 similarity boundary", () => {
    const shared =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho";

    it("exactly 0.85 flags (17 shared / 20 union)", () => {
      const doc = [`${shared} 7`, "", `${shared} 9 sigma`, ""].join("\n");
      expect(only(run(doc).findings, C)).toHaveLength(1);
    });

    it("just below 0.85 is silent (17 shared / 21 union)", () => {
      const doc = [`${shared} 7`, "", `${shared} 9 sigma tau`, ""].join("\n");
      expect(only(run(doc).findings, C)).toEqual([]);
    });
  });

  it("numerals PARTICIPATE in tokenization: a pair that clears 0.85 only with them flags", () => {
    // Word tokens alone: 3 shared / 4 union = 0.75, below threshold. With the 20
    // shared numerals: 23 shared / 26 union = 0.885. A digit-excluding tokenizer
    // reports nothing here (spec §3.3, R7 probe).
    const nums = Array.from({ length: 20 }, (_, i) => String(i + 11)).join(" ");
    const doc = [`alpha beta gamma delta ${nums} 7`, "", `alpha beta gamma ${nums} 9`, ""].join(
      "\n",
    );
    expect(only(run(doc).findings, C)).toHaveLength(1);
  });

  it("quantity extraction is DIGIT-ONLY: a pair differing only in a number WORD is silent", () => {
    const doc = [
      "The disposition template names three reviewers and 2 rounds of adversarial dispatch",
      "",
      "The disposition template names four reviewers and 2 rounds of adversarial dispatch",
      "",
    ].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
  });

  it("exclusion: a fenced pair is not scanned", () => {
    const doc = ["```", roundLine(4), "", roundLine(7), "```", ""].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
  });

  it("exclusion: an ISO-dated pair is excluded wholesale", () => {
    const doc = [`2026-08-10 ${roundLine(4)}`, "", `2026-08-10 ${roundLine(7)}`, ""].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
  });

  describe("exclusion: a dated qualifier binds the differing quantity", () => {
    // Same pair twice, differing ONLY in whether the qualifier follows the number
    // that drifts. The qualifier must be the sole reason the second case is silent.
    const sampleLine = (n: number, follower: string): string =>
      `Round R3 dispatched ${n} samples ${follower} against the shipped guard surface and recorded the verdict`;

    it("without the qualifier the pair flags", () => {
      const doc = [sampleLine(4, "now"), "", sampleLine(7, "now"), ""].join("\n");
      expect(only(run(doc).findings, C)).toHaveLength(1);
    });

    it("with the qualifier bound to it, the pair is silent", () => {
      const doc = [sampleLine(4, "at plan time"), "", sampleLine(7, "at plan time"), ""].join("\n");
      expect(only(run(doc).findings, C)).toEqual([]);
    });
  });

  it("pairing is WITHIN-doc only: identical numbers across the pair stay silent", () => {
    expect(only(run([roundLine(4), "", roundLine(4), ""].join("\n")).findings, C)).toEqual([]);
  });
});

describe("prose-count arms — finding-payload contract (plan R3 F1)", () => {
  const cases: [string, ReturnType<typeof run>][] = [
    [A, run(acLine(38) + "\n", { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) })],
    [B, run(claimOver("The spec names three measured shapes:", 2))],
    [C, run([roundLine(4), "", roundLine(7), ""].join("\n"))],
  ];

  it.each(cases)("%s emits at least one finding, all advisory, on check `numerics`", (code, r) => {
    const fs = only(r.findings, code);
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) {
      expect(f.severity).toBe("advisory");
      expect(f.check).toBe("numerics");
      expect(f.docLine).toBeGreaterThan(0);
      expect(f.column).toBeGreaterThan(0);
    }
  });

  it.each(cases)("%s carries two distinct quantities in its message", (code, r) => {
    for (const f of only(r.findings, code)) {
      const nums = f.message.match(/\d+/g) ?? [];
      expect(new Set(nums).size).toBeGreaterThanOrEqual(2);
    }
  });
});
