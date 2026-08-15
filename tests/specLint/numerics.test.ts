import { describe, expect, it } from "vitest";
import { checkCitations } from "../../lib/specLint/citations";
import { checkNumerics, readableScriptLines } from "../../lib/specLint/numerics";
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

  it("an ISO date at the very START of the line is excluded", () => {
    // Column 0 specifically: a scan that began one character in would miss it and
    // report 2026 / 07 / 19 as three numbers.
    expect(run("2026-07-19 shipped the batch\n").inventory).toEqual([]);
  });

  it("number inside a citation-candidate span excluded", () => {
    const { inventory } = run("see `lib/x.ts:12` here\n");
    expect(inventory).toEqual([]);
  });

  it("fenced lines not scanned", () => {
    const { inventory } = run(["```", "45 codes", "```"].join("\n"));
    expect(inventory).toEqual([]);
  });

  it("a digit as a candidate span's LAST character is inside the span", () => {
    // The END offset specifically, and the span must be CITATION-shaped or it is not a
    // candidate at all: the digit here starts at the span's final index, so a range one
    // character short would admit it as a number.
    expect(run("see `lib/x.ts:1` here\n").inventory).toEqual([]);
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

  it("two mismatching nouns are ordered by doc LINE, not by column", () => {
    // The later-column noun appears first in the document, so a comparator that lets a
    // column difference outrank a line difference reverses these two.
    const { findings } = run(
      ["prefix text 5 alphas", "3 betas", "9 alphas", "7 betas", ""].join("\n"),
    );
    const mismatches = only(findings, "NUMERIC_NOUN_MISMATCH");
    expect(mismatches).toHaveLength(2);
    expect(mismatches.map((f) => [f.docLine, f.column])).toEqual([
      [1, "prefix text ".length + 1],
      [2, 1],
    ]);
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

describe("readableScriptLines — the lexical scan shape (a) reads declarations from", () => {
  // Exact output, not a "contains" check: every non-code character becomes a SPACE and the
  // line keeps its length, because the declaration is matched at column 0 and every column
  // after it has to survive. An assertion that only looked for the declaration would pass
  // while the scan quietly shifted or dropped the rest of the line.
  // Blanked spans are written as `gap("<the exact source text>")`, so the expected string is
  // DERIVED from the substring under test rather than hand-counted.
  const gap = (source: string): string => " ".repeat(source.length);
  it.each([
    ["plain code is untouched", "const a = 1;", ["const a = 1;"]],
    [
      "a line comment is blanked to end of line",
      "const a = 1; // x",
      [`const a = 1; ${gap("// x")}`],
    ],
    ["a line comment ENDS at the newline", "// x\nconst b = 2;", [gap("// x"), "const b = 2;"]],
    ["a block comment is blanked inline", "a /* c */ b", [`a ${gap("/* c */")} b`]],
    [
      "code AFTER a block comment's close is live",
      "/* x\ny */ const c = 3;",
      [gap("/* x"), `${gap("y */")} const c = 3;`],
    ],
    [
      // A block comment has no escapes, so the backslash before `*/` does NOT defer the
      // close. Treating it as one swallows the `*`, the comment never closes, and the whole
      // file reads as unfinished — the scan loses a script it could have read.
      "a backslash inside a block comment is not an escape",
      "/* a\\*/ const c = 3;",
      [`${gap("/* a\\*/")} const c = 3;`],
    ],
    ["a double-quoted string is blanked", 'const m = "`";', [`const m = ${gap('"`"')};`]],
    ["a single-quoted string is blanked", "const m = '`';", [`const m = ${gap("'`'")};`]],
    [
      // Review R9, probed: a regex carrying a quote opened a literal the scan then closed
      // on the NEXT quote, and a second such regex re-synchronised it — so the state was
      // inverted across the span between them and a template's dead declaration read as
      // live. A regex body is not code and not a string; it is its own span.
      "a regex literal carrying a quote is blanked",
      "const re = /'/; const c = 3;",
      [`const re = ${gap("/'/")}; const c = 3;`],
    ],
    [
      "a regex CHARACTER CLASS may hold the delimiter",
      "const re = /[/']/; const c = 3;",
      [`const re = ${gap("/[/']/")}; const c = 3;`],
    ],
    [
      "an escaped delimiter does not end a regex",
      "const re = /a\\/'/; const c = 3;",
      [`const re = ${gap("/a\\/'/")}; const c = 3;`],
    ],
    [
      // Review R11, probed: `export default /\'/;` is valid JavaScript and `default` was
      // missing from a hand-listed keyword set, so the slash read as division and exposed
      // the regex body. The set is now the RESERVED words minus the five that are values.
      "a regex after `export default` is a regex",
      "export default /'/;",
      [`export default ${gap("/'/")};`],
    ],
    ["a regex after `throw` is a regex", "throw /'/;", [`throw ${gap("/'/")};`]],
    [
      // ...and the five value-words are the reason the set is not simply "every reserved
      // word": `this` IS a value, so the slash after it divides.
      "a slash after `this` divides",
      "const r = this / 2; const e = 5;",
      ["const r = this / 2; const e = 5;"],
    ],
    [
      // A regex may follow a control-flow head, and reading THAT slash as division is the
      // dangerous direction: it exposes the regex body, where a quote opens a span the scan
      // closes somewhere else entirely (review R10, probed).
      "a regex after a closing paren is a regex",
      "if (enabled) /'/.test(input);",
      [`if (enabled) ${gap("/'/")}.test(input);`],
    ],
    [
      // The other direction, and the one that costs coverage rather than correctness:
      // division is not a regex, so the rest of the line stays readable.
      "division is not a regex",
      "const half = total / 2; const d = 4;",
      ["const half = total / 2; const d = 4;"],
    ],
    ["a regex after a KEYWORD is still a regex", "return /'/;", [`return ${gap("/'/")};`]],
    [
      // Review R12, probed: reading EVERY `)` as a regex head let `(a + b) / 2` swallow the
      // rest of the line and re-synchronise on a later slash, which is the R10 inversion
      // wearing the other hat. A `)` allows a regex exactly when it closes a control head.
      "grouped division after a paren is division",
      "const q = (a + b) / 2; const e = 5 / 3;",
      ["const q = (a + b) / 2; const e = 5 / 3;"],
    ],
    [
      "a nested call inside a control head still closes to a regex position",
      "if (a(b) && c) /'/.test(d);",
      [`if (a(b) && c) ${gap("/'/")}.test(d);`],
    ],
    [
      // Review R13, probed: `for await (` records `await` as the word before the paren, so
      // the head was missed and the regex after it read as division. It is the one
      // two-word control head in the language.
      "`for await` is still a control head",
      "for await (const x of y) /'/.test(x);",
      [`for await (const x of y) ${gap("/'/")}.test(x);`],
    ],
    [
      // R12's other separating input: `]` after a reserved word, where a stale trailing
      // identifier would misread the slash.
      "an array literal returned then divided is division",
      "return [] / 2;",
      ["return [] / 2;"],
    ],
    [
      // Review R19, probed: `+` is regex-preceding, but `++` leaves a VALUE, so the slash
      // after it divides. Reading it as a regex desynchronised the scan and exposed a
      // template's declaration-shaped text as live.
      "a slash after a postfix increment divides",
      "const ratio = i++ / 2; const e = 5 / 3;",
      ["const ratio = i++ / 2; const e = 5 / 3;"],
    ],
    [
      // The other side of that rule: a SINGLE `+` is an operator, so the slash after it
      // still opens a regex.
      "a slash after a binary plus is a regex",
      "const x = 1 + /'/.test(s); const e = 5;",
      [`const x = 1 + ${gap("/'/")}.test(s); const e = 5;`],
    ],
    [
      "a slash after a doubled EQUALS is a regex",
      "const x = (a == /'/.test(s)); const e = 5;",
      [`const x = (a == ${gap("/'/")}.test(s)); const e = 5;`],
    ],
    [
      "a slash after a postfix decrement divides",
      "const ratio = i-- / 2; const e = 5 / 3;",
      ["const ratio = i-- / 2; const e = 5 / 3;"],
    ],
    [
      // A CALL's closing paren is not a control head's, so the slash after it divides.
      "a call result divided is division",
      "const v = compute(a) / 2; const e = 5;",
      ["const v = compute(a) / 2; const e = 5;"],
    ],
    [
      "`//` inside a string is not a comment",
      'const u = "// x"; const d = 4;',
      [`const u = ${gap('"// x"')}; const d = 4;`],
    ],
    [
      // Review R14, probed: a backtick inside `${...}` opens a NEW template, and treating
      // it as the outer one's closer exposed the outer template's text as live code. The
      // interpolation ITSELF is code and stays readable.
      "a nested template inside an interpolation",
      'const g = `${a ? `x` : ""}`; const c = 3;',
      [`const g = ${gap("`${")}a ? ${gap("`x`")} : ${gap('""')}${gap("}`")}; const c = 3;`],
    ],
    [
      // An object literal inside an interpolation: its braces must NOT be read as the
      // interpolation's own close, or the template never ends and the file reads as
      // unfinished.
      "braces inside an interpolation are counted",
      "const g = `${ {a:1} }`; const c = 3;",
      [`const g = ${gap("`${")} {a:1} ${gap("}`")}; const c = 3;`],
    ],
    [
      // A bare `$` is not an interpolation, and neither is a `{` on its own.
      "a lone dollar inside a template stays template text",
      "const g = `a $ b {c}`; const d = 4;",
      [`const g = ${gap("`a $ b {c}`")}; const d = 4;`],
    ],
    [
      "a template interior is blanked across lines",
      "const t = `\nconst EXPECTED_X = 1;\n`;",
      [`const t = ${gap("`")}`, gap("const EXPECTED_X = 1;"), `${gap("`")};`],
    ],
    [
      "an escaped quote does not close its string",
      'const s = "a\\"b"; const e = 5;',
      [`const s = ${gap('"a\\"b"')}; const e = 5;`],
    ],
    [
      "an escaped NEWLINE inside a string still breaks the line",
      'const s = "a\\\nb"; const f = 6;',
      [`const s = ${gap('"a\\')}`, `${gap('b"')}; const f = 6;`],
    ],
  ])("%s", (_label, src, expected) => {
    const lines = readableScriptLines(src);
    expect(lines).toEqual(expected);
    // Length parity is the property the column-0 match depends on, asserted separately so
    // a wrong expected string cannot hide a wrong length.
    expect(lines!.map((l) => l.length)).toEqual(src.split("\n").map((l) => l.length));
  });

  it.each([
    ["an unterminated string", 'const s = "a'],
    ["an unterminated template", "const t = `a"],
    ["an unterminated block comment", "/* a"],
    ["an unclosed interpolation", "const g = `${a"],
    ["an unclosed NESTED template", "const g = `${a ? `x"],
  ])("%s makes the whole scan unusable", (_label, src) => {
    expect(readableScriptLines(src)).toBeNull();
  });

  it.each([
    // A regex cannot span a line, so a newline while one is open means the `/` was
    // division after all and the scan has lost the thread. Silence, not a guess.
    ["a newline inside one", "const re = /'\nconst a = 1;"],
    // ...and an ESCAPE at end of line does not carry a regex onto the next line either:
    // consuming that newline would hide the break and let a later `/` re-close the span,
    // which is the R9 shape one level down.
    ["a trailing escape before the newline", "const re = /a\\\nb/; const c = 1;"],
    // The tail records that a regex CLOSED, so the next `/` divides rather than opening a
    // second one — without that, `/'/` here would be blanked and the scan would finish.
    ["a second slash after a closed regex", "const r = /a/ /'/;"],
  ])("an unterminated regex is an unfinished scan (%s)", (_label, src) => {
    expect(readableScriptLines(src)).toBeNull();
  });

  it("a line comment running to end of input is NOT an unfinished scan", () => {
    // The bail is for constructs a newline cannot close. A line comment is closed BY the
    // end of input, so treating it as unfinished would blank every script whose last line
    // is a comment — a silent loss of the whole arm on ordinary files.
    expect(readableScriptLines("const a = 1;\n// trailing")).toEqual([
      "const a = 1;",
      " ".repeat("// trailing".length),
    ]);
  });
});

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

  it.each([
    ["a discourse connective is NOT a dated qualifier", "at the same time"],
    ["nor is an unlisted stage word", "at teatime time"],
  ])("%s", (_label, phrase) => {
    // Matching these would EXCEED the normative exclusion rather than approximate it,
    // silencing a real advisory. Reported by whole-diff review R4 with a probe.
    const { findings } = run(`\`${PARITY_SCRIPT}\` covered 38 sites ${phrase}\n`, {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    expect(only(findings, A)).toHaveLength(1);
  });

  it("a qualifier in the NEXT clause binds nothing", () => {
    // "within the same clause" is enforced, not merely approximated by the 40-character
    // reach: a full stop separates these two. Also review R4, probed.
    const { findings } = run(
      `\`${PARITY_SCRIPT}\` covered 38 sites. At plan time it was fewer.\n`,
      { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) },
    );
    expect(only(findings, A)).toHaveLength(1);
  });

  it("the noun match is case-INSENSITIVE", () => {
    // `NOUN_AFTER` is lowercase-only for NUMERIC_NOUN_MISMATCH by ratified design, and
    // shape (a) silently inherited it: `38 Sites` was dropped while `38 sites` flagged.
    const { findings } = run(`\`${PARITY_SCRIPT}\` reports parity for all 38 Sites\n`, {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    expect(only(findings, A)).toHaveLength(1);
  });

  it.each([
    ["an -ies plural", "EXPECTED_CATEGORY_COUNT", "categories"],
    ["an -es plural after s", "EXPECTED_STATUS_COUNT", "statuses"],
    ["an -es plural after ch", "EXPECTED_BATCH_COUNT", "batches"],
    ["a plain -s plural", "EXPECTED_SITE_TOTAL", "sites"],
  ])("the noun singularizes by rule, not by stripping one s (%s)", (_label, ident, noun) => {
    // Stripping only a terminal `s` left `categorie`, which matched nothing (review R5).
    const { findings } = run(`\`${PARITY_SCRIPT}\` covers 4 ${noun}\n`, {
      [PARITY_SCRIPT]: scriptSrc(`const ${ident} = 3;`),
    });
    expect(only(findings, A)).toHaveLength(1);
  });

  it("an irregular plural is NOT singularized — documented limit, not a wrong flag", () => {
    const { findings } = run(`\`${PARITY_SCRIPT}\` covers 4 indices\n`, {
      [PARITY_SCRIPT]: scriptSrc("const EXPECTED_INDEX_COUNT = 3;"),
    });
    expect(only(findings, A)).toEqual([]);
  });

  it.each([
    [
      "a block-commented declaration",
      ["/*", "const EXPECTED_SITE_TOTAL = 37;", "*/", "const EXPECTED_SITE_TOTAL = 38;"].join("\n"),
    ],
    [
      "a declaration inside a template literal",
      [
        "const sample = `",
        "const EXPECTED_SITE_TOTAL = 37;",
        "`;",
        "const EXPECTED_SITE_TOTAL = 38;",
      ].join("\n"),
    ],
    [
      // THREE backticks on the opening line: the tracker follows odd PARITY, not the
      // presence of a tick, so a line that both closes one span and opens another still
      // flips it.
      "a template opened after an inline span",
      [
        "const label = `x` + `",
        "const EXPECTED_SITE_TOTAL = 37;",
        "`;",
        "const EXPECTED_SITE_TOTAL = 38;",
      ].join("\n"),
    ],
  ])("declaration-SHAPED text is not a declaration (%s)", (_label, body) => {
    // Reading the dead 37 drew a false advisory against prose that correctly says 38
    // (review R5, probed). The live value is 38, so the line agrees and must stay silent.
    const { findings } = run(acLine(38) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("an ESCAPED backtick does not open or close a template", () => {
    // Review R6, probed: counting raw backticks exposed template text as live and hid
    // the real declaration, so prose that correctly says 38 drew an advisory against 37.
    const body = [
      "const sample = `",
      "\\`",
      "const EXPECTED_SITE_TOTAL = 37;",
      "`;",
      siteConst(38),
    ].join("\n");
    const { findings } = run(acLine(38) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it.each([
    // Review R8, probed, and it REFUTES the earlier claim that a mis-tracked backtick can
    // only suppress findings: a backtick inside an ordinary STRING inverts the state, the
    // real template opener then restores it, and the arm reads the template's dead 37
    // while the live 38 below is blanked. Prose that agrees with the script drew an
    // advisory. A backtick is a delimiter only where the language says it is.
    ["a double-quoted string", 'const marker = "`";'],
    ["a single-quoted string", "const marker = '`';"],
    ["a line comment", "// a stray ` in prose"],
    ["a block comment", "/* a stray ` in prose */"],
  ])("a backtick inside %s does not open a template", (_label, decoy) => {
    const body = [decoy, "const sample = `", siteConst(37), "`;", siteConst(38)].join("\n");
    const { findings } = run(acLine(38) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("R19's postfix-increment script cannot invert the scan", () => {
    // The end-to-end shape of the same finding: `i++ / 2` misread as a regex swallows the
    // apostrophes and exposes the template's declaration, in a script whose only
    // declaration-shaped line is that template text — so the duplicate net cannot help.
    const body = [
      "let i = 0;",
      "const ratio = i++ / 2; // it's a ratio",
      "const generated = `author's generated module",
      siteConst(37),
      "`;",
      "const hasBacktick = /[`]/.test(generated);",
    ].join("\n");
    const { findings } = run(acLine(38) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("a declaration inside a NESTED template is not live", () => {
    // Review R14, probed: `${x ? ` opens an interpolation and the backtick after it a new
    // template, so reading that backtick as the outer literal's close exposed the
    // template's own text — and the script has no module-local site constant at all.
    const body = [
      "const generated = `${enabled ? `",
      siteConst(37),
      '` : ""}`;',
      "const EXPECTED_OTHER_COUNT = 1;",
    ].join("\n");
    const { findings } = run(acLine(38) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("a RE-SYNCHRONISING pair of quote-carrying regexes cannot invert the scan", () => {
    // Review R9's separating script, verbatim in shape: the first regex opens a literal
    // the scan closes on the apostrophe inside the template, the second closes it again,
    // and between them the state is inverted — the template's dead 37 reads as live while
    // the live 38 is blanked. It emitted "prose says 38 sites, but ... = 37".
    const body = [
      "const first = /'/;",
      "const sample = `it's dead in here",
      siteConst(37),
      "`;",
      siteConst(38),
      "const second = /`/;",
    ].join("\n");
    const { findings } = run(acLine(38) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("a SECTION reference is not a cardinality", () => {
    // Review R10, probed: `§ 38 sites` is a section label with a noun after it, and shape
    // (a) had no lexical guard at all — spec §3.2's ladder row (decimal tails, glued
    // digits, `§`, milestone ids) was written for shape (b) and never reached this arm,
    // the same way the lowercase-only noun rule leaked in at R4.
    const doc = `See \`${PARITY_SCRIPT}\` § 38 sites for details.\n`;
    const { findings } = run(doc, { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) });
    expect(only(findings, A)).toEqual([]);
  });

  it("a SECTION reference at the LINE START is not a cardinality either", () => {
    // Column 0 specifically: the guard reads the text BEFORE the number, and a scan that
    // began one character in sees an empty prefix and admits the 38.
    const doc = `§ 38 sites are covered by \`${PARITY_SCRIPT}\`.\n`;
    const { findings } = run(doc, { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) });
    expect(only(findings, A)).toEqual([]);
  });

  it.each([
    ["mid-line", `See \`${PARITY_SCRIPT}\` in M38 sites work.\n`],
    // At the LINE START specifically: the guard reads the text before the number, and a
    // scan that began one character in would see an empty prefix and admit the 38.
    ["at the line start", `M38 sites are covered by \`${PARITY_SCRIPT}\`.\n`],
  ])("a MILESTONE id is not a cardinality (%s)", (_label, doc) => {
    const { findings } = run(doc, { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) });
    expect(only(findings, A)).toEqual([]);
  });

  it("two identifiers deriving the SAME noun are both refused", () => {
    // Review R10, probed: the net keyed on the identifier, but the arm compares by NOUN, so
    // `EXPECTED_SITE_COUNT` and `EXPECTED_SITE_TOTAL` slipped past it while both claiming
    // to answer "how many sites". Ambiguity is a property of the noun, so the net is too.
    const body = ["const EXPECTED_SITE_COUNT = 37;", siteConst(38)].join("\n");
    const { findings } = run(acLine(99) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("R10's control-flow regex script cannot invert the scan", () => {
    // `if (enabled) /'/.test(input)` is ordinary JavaScript, and reading that `/` as
    // division exposed the regex body: the apostrophe opened a string that closed on the
    // one in the template below, and a second such line re-balanced it.
    const body = [
      "if (enabled) /'/.test(input);",
      "const sample = `it's dead",
      "const EXPECTED_SITE_COUNT = 37;",
      "`;",
      siteConst(38),
      "if (enabled) /`/.test(input) / 2;",
    ].join("\n");
    const { findings } = run(acLine(38) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("a line naming TWO scripts with the same noun associates with neither", () => {
    // Review R17, probed: every count was compared against every same-noun constant on the
    // line, so a line whose two claims were BOTH correct drew two advisories — 4 against
    // b's 5 and 5 against a's 4. An ambiguous reference identifies no script.
    const texts = {
      "scripts/a.mjs": scriptSrc(siteConst(4)),
      "scripts/b.mjs": scriptSrc(siteConst(5)),
    };
    const doc = "`scripts/a.mjs` covers 4 sites; `scripts/b.mjs` covers 5 sites.\n";
    expect(only(run(doc, texts).findings, A)).toEqual([]);
    // One script named on its own still associates, so the rule narrows nothing else.
    expect(only(run("`scripts/a.mjs` covers 9 sites\n", texts).findings, A)).toHaveLength(1);
  });

  it("an identifier declared TWICE at column 0 is not read at all", () => {
    // The net under the lexer, and it does not depend on the lexer being right. Every
    // refuted version of this scan (R5, R6, R8, R9) was fooled into choosing the WRONG one
    // of two declaration-shaped lines; with two of them the arm now declines outright, so
    // a future lexical gap can cost a finding but cannot invent one. Both values here are
    // wrong against the prose, so a fixture that read EITHER would fail.
    const body = [siteConst(37), "export const other = 1;", siteConst(38)].join("\n");
    const { findings } = run(acLine(99) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("a script the scan cannot finish reading contributes NOTHING", () => {
    // The soundness net. An unterminated string, template, or block comment means the
    // scan lost track of where code is, and a scan that is lost must not hand over a
    // declaration it believes in: this file's `38` is real, and the arm still declines.
    const body = ['const marker = "unterminated', siteConst(38)].join("\n");
    const { findings } = run(acLine(99) + "\n", { [PARITY_SCRIPT]: `// header\n${body}\n` });
    expect(only(findings, A)).toEqual([]);
  });

  it("an AMBIGUOUS basename identifies no script, so only the full path associates", () => {
    // Review R6, probed: `check.mjs` in two directories matched both, and the doc drew an
    // advisory against a file it never mentioned.
    // The two declare DIFFERENT nouns on purpose: with the same noun the R17 rule would
    // silence the line by itself, and this case has to fail when the BASENAME rule is the
    // thing that breaks.
    const texts = {
      "scripts/a/check.mjs": scriptSrc("const EXPECTED_SITE_TOTAL = 3;"),
      "scripts/b/check.mjs": scriptSrc("const EXPECTED_ROW_TOTAL = 4;"),
    };
    expect(only(run("`check.mjs` covers 9 sites\n", texts).findings, A)).toEqual([]);
    // The full path still names one script, so it still associates.
    expect(only(run("`scripts/b/check.mjs` covers 9 rows\n", texts).findings, A)).toHaveLength(1);
  });

  it("basename uniqueness is compared on the WHOLE basename", () => {
    // `check.mjs` and `xheck.mjs` differ only in their FIRST character, so each still names
    // exactly one script. A comparison that dropped a leading character would fuse them,
    // mark both ambiguous, and silently drop an association the doc really made — the
    // failure is a MISSING advisory, which no other fixture here would notice.
    const texts = {
      "scripts/a/check.mjs": scriptSrc(siteConst(3)),
      "scripts/a/xheck.mjs": scriptSrc(siteConst(9)),
    };
    const { findings } = run("`check.mjs` covers 4 sites\n", texts);
    expect(only(findings, A)).toHaveLength(1);
    expect(only(findings, A)[0]!.detail).toContain("scripts/a/check.mjs");
  });

  it.each([
    // Review R7, probed: `1,000 sites` split into `1` and `000`, and the `000` — the run
    // the noun actually follows — compared as 0 against a constant of 1000, so prose that
    // AGREES with the script drew an advisory reading "0 versus 1000".
    ["thousands-grouped", "1,000"],
    // The MALFORMED neighbours are the boundary, and they matter more than the well-formed
    // case: a recognizer of strict thousands grouping leaves exactly these outside the
    // exclusion, and then reads `567` / `200` as the count. Probed: both emit an advisory
    // against a constant of 1000 unless the exclusion is comma-joined runs.
    ["four leading digits", "1234,567"],
    ["a four-digit group", "1,0200"],
  ])("a comma-joined digit run is not read as one of its groups (%s)", (_label, num) => {
    const { findings } = run(
      `| AC | \`${PARITY_SCRIPT}\` reports parity for all ${num} sites |\n`,
      {
        [PARITY_SCRIPT]: scriptSrc(siteConst(1000)),
      },
    );
    expect(only(findings, A)).toEqual([]);
  });

  it("a period INSIDE a clause does not break the qualifier's binding", () => {
    // `i.e.` is not a sentence end, so the qualifier still binds the 38 (review R5).
    const { findings } = run(
      `\`${PARITY_SCRIPT}\` covers 38 sites, i.e. all entries at plan time\n`,
      { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) },
    );
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

  it.each([
    ["a longer extension", `${PARITY_SCRIPT}.bak`],
    ["a suffixed name", `${PARITY_SCRIPT}-copy`],
    ["a path that continues", `${PARITY_SCRIPT}/child.mjs`],
    ["an underscored suffix", `${PARITY_SCRIPT}_old`],
  ])("a DIFFERENT file whose name extends the script's is not a mention (%s)", (_label, path) => {
    // Reported by whole-diff review R3: the earlier right boundary matched all of
    // these, so an unrelated file resolved the real script's constants.
    const { findings } = run(`\`${path}\` reports parity for all 38 sites\n`, {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    expect(only(findings, A)).toEqual([]);
  });

  it("a path at the END OF A SENTENCE is still a mention", () => {
    // The other side of that boundary: a trailing period is prose, not a longer name.
    const { findings } = run(`Parity for all 38 sites is checked by ${PARITY_SCRIPT}.\n`, {
      [PARITY_SCRIPT]: scriptSrc(siteConst(37)),
    });
    expect(only(findings, A)).toHaveLength(1);
  });

  describe("the module-local proxy is COLUMN 0, which is not scope (documented limit)", () => {
    it("an indented TOP-LEVEL declaration is skipped — a tripwire that never fires", () => {
      const src = ["// header comment", `  ${siteConst(37)}`, "export default null;", ""].join(
        "\n",
      );
      expect(only(run(acLine(38) + "\n", { [PARITY_SCRIPT]: src }).findings, A)).toEqual([]);
    });

    it("a column-0 declaration nested inside a block IS accepted — one advisory, not silence", () => {
      const src = [
        "// header comment",
        "function compute() {",
        siteConst(37),
        "return EXPECTED_SITE_TOTAL;",
        "}",
        "",
      ].join("\n");
      expect(only(run(acLine(38) + "\n", { [PARITY_SCRIPT]: src }).findings, A)).toHaveLength(1);
    });
  });

  it("the finding's column and detail are exact", () => {
    const line = acLine(38);
    const f = only(run(line + "\n", { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) }).findings, A)[0]!;
    expect(f.docLine).toBe(1);
    expect(f.column).toBe(line.indexOf("38") + 1);
    expect(f.message).toBe("prose says 38 sites, but EXPECTED_SITE_TOTAL = 37");
    expect(f.detail).toBe(
      `${PARITY_SCRIPT} declares EXPECTED_SITE_TOTAL = 37; this line claims 38`,
    );
  });

  it("a constant whose script is named on a FENCED line only is not associated", () => {
    // The resolver may still serve the text; association is per non-fenced line.
    const doc = ["```", `\`${PARITY_SCRIPT}\``, "```", "It reports 38 sites.", ""].join("\n");
    expect(only(run(doc, { [PARITY_SCRIPT]: scriptSrc(siteConst(37)) }).findings, A)).toEqual([]);
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

  it("an ambiguous basename stays ambiguous even when only ONE of its scripts resolves", () => {
    // Review R7, probed. The adapter resolves by the WHOLE tracked universe, but the arm
    // re-derived ambiguity from the scripts it was handed — and a full-path mention of A
    // narrows that universe to {A}, which makes `check.mjs` look unambiguous again. The
    // bare mention then drew an advisory against A: exactly the false advisory the
    // ambiguity rule exists to prevent, re-entering through the adapter boundary.
    const a = "scripts/a/check.mjs";
    const b = "scripts/b/check.mjs";
    const r = lint(
      [`\`${a}\` covers 3 sites`, "`check.mjs` covers 9 sites", ""].join("\n"),
      [a, b],
      { [a]: scriptSrc(siteConst(3)), [b]: scriptSrc(siteConst(4)) },
    );
    expect(only(r.findings, A)).toEqual([]);
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

  // ---- CommonMark thematic breaks are <hr>, not siblings (review R20, probed) ----

  it("a `- - -` break after the last item is an <hr>, not a third sibling", () => {
    const doc = ["The spec names 2 measured shapes:", ...bullets(2), "- - -", ""].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("the asterisk form `* * *` is a break too", () => {
    const doc = ["The spec names three measured shapes:", ...bullets(3), "* * *", ""].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a break ENDS the list, so items after it are a different list", () => {
    const doc = [
      "The spec names 2 measured shapes:",
      ...bullets(2),
      "- - -",
      "- unrelated",
      "- also unrelated",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a break where the list would start is no list at all", () => {
    const doc = ["The spec names three measured shapes:", "- - -", ""].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("TWO markers are a list item, not a break", () => {
    // `- -` is a bullet whose content is `-`; only three or more make an <hr>.
    const doc = ["The spec names 2 measured shapes:", "- shape 1", "- -", ""].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a break INSIDE an item's content does not end the list", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "  - - -",
      "- shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  // ---- the R20 class sweep: what CommonMark calls an item, and what ends a list ----

  // An empty marker is an item, a setext underline, or a lazy continuation depending on
  // CommonMark rules a line scan cannot decide, and the readings differ by one sibling.
  // Every marker kind refuses. Before the sweep each of these reported "1 items".
  it.each([
    ["dash", ["- shape 1", "-", "- shape 3"]],
    ["star", ["* shape 1", "*", "* shape 3"]],
    ["ordered", ["1. shape 1", "2.", "3. shape 3"]],
  ])("an EMPTY %s marker at the list's indent is not counted either way", (_kind, lines) => {
    const doc = ["The spec names three measured shapes:", ...lines, ""].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("an empty marker DEEPER than the list cannot change the sibling count, so it still fires", () => {
    const doc = ["The spec names three measured shapes:", "- shape 1", "  -", "- shape 2", ""].join(
      "\n",
    );
    const findings = only(run(doc).findings, B);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("claim of 3 shapes over an adjacent list of 2 items");
  });

  it("a lazy continuation line does not end the list, so the count is not answered", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "continued lazily at column zero",
      "- shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("...and counting THROUGH the lazy line is not the answer either", () => {
    // The two readings differ by the items below the lazy line, so this claim would draw an
    // advisory against three counted siblings if the counter simply carried on.
    const doc = [
      "The spec names four measured shapes:",
      "- shape 1",
      "continued lazily at column zero",
      "- shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a table row inside an item does not end the list either", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "| a | b |",
      "- shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("an ambiguous line with no sibling below it reads the same either way, so it still fires", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "- shape 2",
      "trailing prose at column zero",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("a blank line closes the paragraph, so prose after it ends the list for certain", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "- shape 2",
      "",
      "A following paragraph.",
      "- a different list",
      "- with two items",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("a heading interrupts a paragraph, so it ends the list with no blank line needed", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "- shape 2",
      "# A heading",
      "- a different list",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("a blockquote interrupts a paragraph too", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "- shape 2",
      "> quoted",
      "- a different list",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  // ---- what the list's END is read from, pinned one rule at a time ----

  it("a heading four columns in is item content, not the list's end", () => {
    // Three spaces is CommonMark's limit for a top-level block; the fourth column belongs to
    // the item — but only where the item's content starts later than that, as it does here.
    const doc = [
      "The spec names three measured shapes:",
      "-    shape 1",
      "    # not a heading at this column",
      "-    shape 2",
      "-    shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("SEVEN hashes are not a heading, so they do not end the list", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "####### ordinary text, since a heading stops at six",
      "- shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a repeated character that is not a break character is still ordinary text", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "...",
      "- shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a break's characters must be the ONLY ones on the line", () => {
    // `- - - x` carries content, so it is a list item and the third sibling here.
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "- shape 2",
      "- - - x",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  // ---- whether the list is NESTED is read from the block above it ----

  const NESTED = ["  - shape 1", "  - shape 2", "- outside the nested list", ""];

  it("an outdent CLOSES a nested list, and the enclosing item is what says it is nested", () => {
    const doc = ["- The spec names three measured shapes:", ...NESTED].join("\n");
    const findings = only(run(doc).findings, B);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("claim of 3 shapes over an adjacent list of 2 items");
  });

  it("...across a blank line between the enclosing item and the list", () => {
    const doc = ["- The spec names three measured shapes:", "", ...NESTED].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("...across the enclosing item's own continuation lines", () => {
    const doc = ["- outer", "  The spec names three measured shapes:", ...NESTED].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("...and the outdent is measured against the list's INDENT, not its marker width", () => {
    const doc = [
      "- The spec names three measured shapes:",
      "  - shape 1",
      "  - shape 2",
      " - one column in, which is still outdented",
      "",
    ].join("\n");
    const findings = only(run(doc).findings, B);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("claim of 3 shapes over an adjacent list of 2 items");
  });

  it("...and it is the NEAREST enclosing block that decides, not the first line above it", () => {
    const doc = [
      "Prose that encloses nothing.",
      "- The spec names three measured shapes:",
      ...NESTED,
    ].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  // ---- item content resets the blank-line run, so a list is not cut in half by it ----

  it("an indented thematic break between two blanks is item content", () => {
    const doc = [
      "The spec names 2 measured shapes:",
      "- shape 1",
      "",
      "  - - -",
      "",
      "- shape 2",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("an indented empty marker between two blanks is item content", () => {
    const doc = [
      "The spec names 2 measured shapes:",
      "- shape 1",
      "",
      "  -",
      "",
      "- shape 2",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
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

  // ---- boundary pins for every numeric bound the ladder carries ----
  // Each pair straddles one bound, so moving that bound by one reds exactly one case.

  it("adjacency reaches 2 lines: a list 3 lines below the claim is not adjacent", () => {
    const doc = ["The spec names three measured shapes:", "", "", ...bullets(2), ""].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("the head-word window reaches the THIRD following word", () => {
    const doc = claimOver("The spec names three carefully measured shapes:", 2);
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("the head-word window stops at the third: a FOURTH-word plural is not the head", () => {
    const doc = claimOver("The spec names three long and careful shapes:", 2);
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  describe("the 60-character tail bound", () => {
    /** `The spec names three shapes …` padded so the tail after `three` is exactly `tail`. */
    const tailOf = (tail: number): string => {
      const head = "The spec names three";
      const line = `${head} shapes ${"z".repeat(tail - " shapes ".length)}`;
      if (line.length - head.length !== tail)
        throw new Error(`built tail ${line.length - head.length}`);
      return line;
    };

    it("a tail of exactly 60 characters still fires", () => {
      expect(only(run(claimOver(tailOf(60), 2)).findings, B)).toHaveLength(1);
    });

    it("a tail of 61 characters does not", () => {
      expect(only(run(claimOver(tailOf(61), 2)).findings, B)).toEqual([]);
    });
  });

  describe("the 40-character qualifier reach", () => {
    /** A qualifier whose start sits exactly `gap` characters past the end of `three`. */
    const gapOf = (gap: number): string => {
      const head = "The spec names three";
      const prefix = `${head} shapes ${"z".repeat(gap - " shapes ".length - 1)} `;
      if (prefix.length - head.length !== gap)
        throw new Error(`built gap ${prefix.length - head.length}`);
      return `${prefix}at plan time:`;
    };

    it("a qualifier exactly 40 characters past the claim still binds it", () => {
      expect(only(run(claimOver(gapOf(40), 2)).findings, B)).toEqual([]);
    });

    it("a qualifier 41 characters past the claim binds nothing", () => {
      expect(only(run(claimOver(gapOf(41), 2)).findings, B)).toHaveLength(1);
    });
  });

  it("two blank lines end the sibling list; a third block is not counted", () => {
    // Plain counting across the gap sees 5 items and would flag; the contract's
    // counter stops at the second blank, reads 3, and agrees with the claim.
    const doc = [
      "The spec names three measured shapes:",
      ...bullets(3),
      "",
      "",
      "- extra one",
      "- extra two",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  // ---- the sibling counter's list-shape contract ----
  // Each case is a real list shape, and each pins one counting decision.

  it("a claim at column 0 is recognized", () => {
    // A cardinality scan that began one character in would find nothing here.
    expect(only(run(claimOver("3 measured shapes:", 2)).findings, B)).toHaveLength(1);
  });

  it("a qualifier binds a claim at column 0", () => {
    expect(only(run(claimOver("3 measured shapes at plan time:", 2)).findings, B)).toEqual([]);
  });

  it("a single blank line inside the list does not end it", () => {
    const doc = ["The spec names three measured shapes:", ...bullets(2), "", "- shape 3", ""].join(
      "\n",
    );
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("two SEPARATED single blanks do not accumulate into a terminator", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "",
      "- shape 2",
      "",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a deeper sub-bullet between blanks keeps the list open", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "",
      "  - a nested detail",
      "",
      "- shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("an indented continuation line between blanks keeps the list open", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "",
      "  continued prose belonging to shape 1",
      "",
      "- shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("an OUTDENTED bullet ends the list when its marker TYPE differs, however wide it is", () => {
    // The nesting test must be the item's content column, not the marker width. A `100.` marker
    // is four characters wide against a two-space indent, so a check that compared marker width
    // would run straight past this line and swallow the item below it — reported by whole-diff
    // review R1 with a probe, which refuted the equivalence argument this case replaces. What
    // ends the list here is the marker TYPE: an ordered delimiter cannot continue a `-` list.
    const doc = [
      "The spec names three measured shapes:",
      "  - shape 1",
      "  - shape 2",
      "100. outside item",
      "  - shape 3",
      "",
    ].join("\n");
    const findings = only(run(doc).findings, B);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("claim of 3 shapes over an adjacent list of 2 items");
  });

  it("an outdented bullet of the SAME type is a sibling, not the list's end", () => {
    // Short of the item's content column a marker cannot be that item's content, so CommonMark
    // keeps it in the same list. Ending the list here instead undercounted (R20 sweep).
    const doc = [
      "The spec names three measured shapes:",
      "  - shape 1",
      "  - shape 2",
      "- shape 3",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a marker-type change at the list's own indent ends it", () => {
    const doc = ["The spec names 2 measured shapes:", "- shape 1", "- shape 2", "* other", ""].join(
      "\n",
    );
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("...and the run before the change is what gets counted", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- shape 1",
      "* other 1",
      "* other 2",
      "",
    ].join("\n");
    const findings = only(run(doc).findings, B);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("claim of 3 shapes over an adjacent list of 1 items");
  });

  it("an ordered list's NUMBERS may differ — only the delimiter decides the type", () => {
    const doc = [
      "The spec names three measured shapes:",
      "1. shape 1",
      "9. shape 2",
      "4) other",
      "",
    ].join("\n");
    const findings = only(run(doc).findings, B);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("claim of 3 shapes over an adjacent list of 2 items");
  });

  it("prose at the list's own indent leaves the extent undecided once a bullet follows", () => {
    // CommonMark reads the prose as a lazy continuation of the last item and the bullet below
    // it as a third sibling; ending the list here instead counted 2 and drew a false advisory
    // (R20 sweep, probed). Neither reading is asserted — the counter declines.
    const doc = [
      "The spec names three measured shapes:",
      ...bullets(2),
      "That is the whole enumeration.",
      "- a bullet belonging to something else",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a `***Step 4***` bullet is not a checklist step, so it counts", () => {
    // Two asterisks are the recognized emphasis width; a third is ordinary text.
    const doc = [
      "The spec names three measured shapes:",
      ...bullets(3),
      "- ***Step 4*** still an enumeration member",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("a 5-digit run is not a cardinality, so it cannot displace the claim", () => {
    const doc = claimOver("The spec names three measured shapes over 12345 files:", 2);
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("the head is the LAST plural word in the window, not the first", () => {
    const findings = only(
      run(claimOver("The spec names three failing tests shapes:", 2)).findings,
      B,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("shapes");
    expect(findings[0]!.message).not.toContain("tests");
  });

  it.each([
    ["a decimal fragment at column 1", ".3 measured shapes:"],
    ["a decimal tail after a version", "Version 4.3 items:"],
    ["a spaced section reference", "§ 12 items:"],
  ])("lexical guard rejects %s", (_label, claim) => {
    expect(only(run(claimOver(claim, 2)).findings, B)).toEqual([]);
  });

  it("a list of ONE item is still a list", () => {
    expect(
      only(run(claimOver("The spec names three measured shapes:", 1)).findings, B),
    ).toHaveLength(1);
  });

  it("a blank line between the claim and the list does not break adjacency", () => {
    const doc = ["The spec names three measured shapes:", "", ...bullets(2), ""].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("a bullet claim whose cardinal sits right after the marker is still recognized", () => {
    const doc = ["- 3 measured shapes:", ...bullets(2, "  "), ""].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("an ordered-list claim is compared against the list's INDENT, not its marker width", () => {
    const doc = ["1. The spec names three measured shapes:", " - a", " - b", ""].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("a span on ANOTHER line never masks this line's cardinal", () => {
    const doc = [
      "`" + "0".repeat(40) + "`",
      "The spec names three measured shapes:",
      ...bullets(2),
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("a span on the FOLLOWING line never masks this line's cardinal", () => {
    const doc = [
      "The spec names three measured shapes:",
      "- `" + "0".repeat(40) + "`",
      "- b",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toHaveLength(1);
  });

  it("the finding's column and detail are exact", () => {
    const claim = "The spec names three measured shapes:";
    const f = only(run(claimOver(claim, 2)).findings, B)[0]!;
    expect(f.docLine).toBe(1);
    expect(f.column).toBe(claim.indexOf("three") + 1);
    expect(f.detail).toBe('claim "three shapes"; list starts at doc line 2 with 2 sibling items');
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
      // A list length that can never equal the claim OR the claim off by one, so a
      // word whose value moved by one still reds — `one: 1` mutated to 2 would sit at
      // parity against a 2-item list and pass unnoticed.
      const items = value === 3 ? 2 : 3;
      const findings = only(
        run(claimOver(`The spec names ${word} measured shapes:`, items)).findings,
        B,
      );
      const inRange = value >= 2 && value <= 40;
      expect(findings).toHaveLength(inRange ? 1 : 0);
      if (inRange) expect(findings[0]!.message).toContain(String(value));
    },
  );

  it("a GROUPED numeral's trailing group is not a claim (shape (b))", () => {
    // The same R7 defect on this arm, and it needs a group that survives the value gate:
    // `1,020` offers a trailing run of `020`, which is 20 — inside [2, 40] and directly
    // followed by the noun — so the claim read "20 rows" over a list of 3. Probed: without
    // the grouped-numeral range this line emits exactly that advisory.
    const doc = ["the ledger carries 1,020 accepted rows:", "", "- one", "- two", "- three", ""];
    expect(only(run(doc.join("\n")).findings, B)).toEqual([]);
  });

  it("a fenced block BETWEEN items does not end the list", () => {
    // The skip has to reset the blank-line counter as an item line would: a fence sitting
    // between two blanks otherwise reads as the two consecutive blanks that end a list,
    // and every item after it stops being counted.
    const doc = [
      "There are 3 cases:",
      "",
      "- first",
      "",
      "  ~~~text",
      "  fenced",
      "  ~~~",
      "",
      "- second",
      "- third",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("only the DELIMITER decides where a fence begins and ends", () => {
    // Two lines that are fence CONTENT, one of them flush left, and the region's own
    // closing delimiter: reading either as a boundary breaks the walk. The first case
    // treats content as a new opener and stops counting; the second never notices the
    // close and swallows the following fence, so a separate list joins this one.
    const nested = [
      "There are 3 cases:",
      "- first",
      "- second",
      "  ~~~text",
      "  keep",
      "- flush interior",
      "  ~~~",
      "- third",
      "",
    ].join("\n");
    expect(only(run(nested).findings, B)).toEqual([]);
    const twoFences = [
      "There are 2 cases:",
      "- first",
      "- second",
      "  ~~~text",
      "  keep",
      "  ~~~",
      "```text",
      "- not an item",
      "```",
      "- separate",
      "",
    ].join("\n");
    expect(only(run(twoFences).findings, B)).toEqual([]);
  });

  it("a PADDED marker moves the content column with it", () => {
    // Review R18, probed: assuming one space after the marker put the content column at
    // two, so a three-space fence was swallowed as item content and the list after it
    // joined this one. `-   first` puts its content four columns in.
    const doc = [
      "There are 2 cases:",
      "-   first",
      "-   second",
      "   ~~~text",
      "- not an item",
      "   ~~~",
      "- separate list",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a fence indented LESS than the item content is a separate block", () => {
    // Review R17, probed: CommonMark lets a fence sit up to three spaces in and still be a
    // top-level block, so "deeper than the marker" admitted a one-space fence as item
    // content and the list below it was counted as a third sibling.
    const doc = [
      "There are 2 cases:",
      "- first",
      "- second",
      " ```text",
      "- not an item",
      " ```",
      "- a separate list",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a fence at the list's own indent ENDS the list", () => {
    // Review R13, probed: skipping every fenced region treated a column-zero fence as
    // content of the second item, so a SEPARATE list below it was counted as a third
    // sibling. A fence belongs to an item only when it is indented past the item marker.
    const doc = [
      "There are 2 cases:",
      "- first",
      "- second",
      "```text",
      "- not an item",
      "```",
      "- a separate list",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

  it("a bullet-shaped line INSIDE a fence is not a sibling item", () => {
    // Review R12, probed: the counter walked raw lines, so a `- ` inside an indented
    // `~~~` fence under the second item made a correct "2 cases:" list report three.
    const doc = [
      "There are 2 cases:",
      "",
      "- first",
      "- second",
      "  ~~~text",
      "- not an item",
      "  ~~~",
      "",
    ].join("\n");
    expect(only(run(doc).findings, B)).toEqual([]);
  });

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

  it("a qualifier-EXCLUDED quantity cannot manufacture drift against an included one", () => {
    // Review R7, probed. Both lines say 4; only the first carries a dated qualifier, so
    // the per-number exclusion emptied ITS quantity list and left the other's intact.
    // Comparing [] against ["4"] reported drift between two lines that agree — the
    // exclusion turning into a false advisory instead of a silence.
    const doc = [
      "every enrolled guard surface in this arc reports parity for 4 sites at plan time",
      "",
      "every enrolled guard surface in this arc reports parity for 4 sites at merge time",
      "",
    ].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
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

  it.each([
    ["a blockquote", ">"],
    ["a NESTED blockquote", "> >"],
  ])("an ordered marker inside %s is still not a quantity", (_label, quote) => {
    // Review R15, probed: the marker strip only reached a marker that STARTED the trimmed
    // line, so behind a quote prefix the ordinals survived as quantities and two
    // consecutive quoted items drifted on their own numbering alone.
    const body = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi 7";
    const doc = [`${quote} 1. ${body}`, `${quote} 2. ${body}`, ""].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
  });

  it("markers nested in ANY order are all stripped", () => {
    // Review R16, probed: stripping quote-then-bullet-then-ordered in a fixed order left
    // `- > 1. …` with its ordinal, so the same defect R15 fixed one level up reappeared one
    // level down. The rule is now a repeated alternation, which has no order to get wrong.
    const body = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi 7";
    for (const [a, b] of [
      ["- > 1. ", "- > 2. "],
      ["> - 1. ", "> - 2. "],
      ["1. > ", "2. > "],
    ]) {
      const doc = [`${a}${body}`, `${b}${body}`, ""].join("\n");
      expect(only(run(doc).findings, C)).toEqual([]);
    }
  });

  it("a `1)` marker inside a blockquote is not a quantity either", () => {
    const body = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi 7";
    const doc = [`> 1) ${body}`, `> 2) ${body}`, ""].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
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

  it("two rows of the SAME repeated token differ by how many times it repeats", () => {
    // Tokenization is a SET, so multiplicity is discarded and both rows reduce to the
    // single token `7` — union 1, similarity 1.00. The quantities are digit-run ARRAYS,
    // which is where the difference lives. A similarity function that special-cased a
    // one-token union would suppress this advisory; whole-diff review R2 refuted the
    // equivalence argument this case replaces, with this pair as its probe.
    const row = (n: number): string => `| ${Array(n).fill("7").join(" | ")} |`;
    const findings = only(run([row(11), row(10), ""].join("\n")).findings, C);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.detail).toContain("similarity 1.00");
  });

  it("an ordered-list marker is NOT a quantity", () => {
    // Two consecutive list items differing only in their own index are not drift. The
    // committed instrument strips list markers before building a candidate, and spec §3
    // enumerates every instrument/contract divergence — this is not one of them, so the
    // contract keeps it. Review R5 read §3.3's "trimmed physical lines" as forbidding the
    // strip; following that reading would flag every consecutive pair of ordered items in
    // this repo's plans on the strength of their own numbering.
    const body = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda 7";
    const doc = [`1. ${body}`, `2. ${body}`, ""].join("\n");
    expect(only(run(doc).findings, C)).toEqual([]);
  });

  it("a quantity at column 0 participates", () => {
    // The differing digit is the line's FIRST character; a quantity scan starting one
    // character in would read both lines as carrying the same (empty) quantity list.
    const line = (n: number): string =>
      `${n} reviewers dispatched against the shipped guard surface and recorded the final verdict here`;
    expect(only(run([line(4), "", line(7), ""].join("\n")).findings, C)).toHaveLength(1);
  });

  it("the finding's anchor and detail are exact", () => {
    const doc = [roundLine(4), "", roundLine(7), ""].join("\n");
    const f = only(run(doc).findings, C)[0]!;
    expect(f.docLine).toBe(1);
    expect(f.column).toBe(1);
    expect(f.detail).toBe(
      `similarity 0.88; doc line 1: "${roundLine(4)}"; doc line 3: "${roundLine(7)}"`,
    );
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
