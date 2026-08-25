import { describe, expect, it } from "vitest";
import { discoverPins, type Pin, type PinDisposition } from "../../lib/specLint/declaredLimitPins";
import { SYNTHETIC_TITLES as T } from "./__fixtures__/declaredLimitPins/syntheticTitles";

/**
 * Task 1 — pin discovery grammar (spec
 * `docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md`
 * §3.1, AC-1).
 *
 * ── THE HARD REQUIREMENT ON THIS FILE ───────────────────────────────────────────
 * **No accept-case title here may appear anywhere in the live corpus.** The strictly
 * weaker implementation this suite exists to kill is "the seven live pin titles,
 * hardcoded" (spec §6), which passes the corpus assertion AND every accept case whose
 * title was copied from the corpus.
 *
 * Every title therefore comes from `__fixtures__/declaredLimitPins/syntheticTitles.ts`
 * and is asserted BY REFERENCE to it, so the meta-test's collision check is keyed on
 * that DATA rather than on a naming convention. A check keyed on a convention — a
 * nonce token, an id prefix, an extension — is blind to every entry that does not use
 * it, and reports a confident zero rather than an error. That file's header carries
 * the measurement.
 *
 * ── A TITLE IN THIS FILE IS A TITLE IN AN ENROLLED SUITE ────────────────────────
 * This suite becomes a `suitePath` of the `declaredLimitPins` surface, so the arm
 * scans it and any REAL `test(`/`it(` title here carrying one of the three phrases
 * would become a live pin and move the §2.6 corpus set. Three titles in the first
 * draft did exactly that. Real titles here therefore name the phrase's POSITION
 * ("the LEADING-position phrase") and never spell the phrase itself; the phrases live
 * only inside quoted fixture source, which the opener anchor declines because such a
 * line starts with a quote rather than with `test(`.
 *
 * ── WHAT THE CORE DECIDES, AND WHAT IT DOES NOT ─────────────────────────────────
 * The core scans PREPARED lines (spec §3.1): the adapter has already blanked comments,
 * template-literal bodies and MULTI-LINE ordinary strings, position-for-position. So
 * the decline shapes below split into two kinds and the split is stated, not blurred:
 *
 *   - **The core's own rules** — the line-opener anchor (`describe(`, `.each`, a `//`
 *     line) and the first-argument-literal rule (a template title, a phrase in the
 *     SECOND argument, a literal that does not close on the opener's line).
 *   - **Preparation's rules** (spec §3.1 items 1-3) — a test-shaped line inside a
 *     block comment or a multi-line ordinary string. The core cannot decide these and
 *     must not try; asserting otherwise here would be a fixture authored against the
 *     rule it tests while a DIFFERENT rule decides the observation. Those cases assert
 *     the core over PREPARED input, paired against the identical bytes UNPREPARED, and
 *     Task 7b proves the preparation itself against the real adapter.
 *
 * ── EVERY NEGATIVE IS PAIRED, AND THE PAIR IS DERIVED ───────────────────────────
 * An expect-CLEAN fixture is satisfied by any implementation that FAILS TO LOOK — a
 * garbage parse, an empty walk, a scanner returning `[]` unconditionally. So (a) every
 * decline fixture carries a LIVE PIN alongside and the assertion is the exact pin SET
 * rather than emptiness, and (b) each decline is paired with the identical bytes minus
 * the declining feature, which REPORTS. The pair is produced by a mechanical transform
 * of the decline fixture, so "differs by exactly ONE VARIABLE" is true by construction
 * rather than by an author's claim.
 */

const SUITE = "tests/fixtures/qplinthAlpha.test.ts";
const OTHER_SUITE = "tests/fixtures/qplinthBeta.test.ts";

const COMPANION = `test("${T.piCompanion}", () => {});`;

function pins(
  source: readonly string[],
  dispositions: readonly PinDisposition[] = [],
  path = SUITE,
): Pin[] {
  return discoverPins(path, source, dispositions);
}

/** Order-independent: findings on one surface have no natural order (spec §3.3). */
const titlesOf = (found: Pin[]): string[] => found.map((p) => p.title).sort();

/** Sorted expectation, so no assertion depends on emission order. */
const expectTitles = (found: Pin[], ...expected: string[]): void => {
  expect(titlesOf(found)).toEqual([...expected].sort());
};

/** Position-preserving blank, which is what `stripCommentsSafely` does to a span. */
const blanked = (line: string): string => " ".repeat(line.length);

describe("discoverPins — the accept set (spec §3.1 items 1-3)", () => {
  // Each case names the concrete failure mode it catches, and the phrase sits in a
  // DIFFERENT position in each title, so an implementation anchored to one position
  // cannot pass the set.

  it("reads the LEADING-position phrase in a double-quoted test( title", () => {
    // Kills: a matcher anchored to the END of a title.
    expectTitles(pins([`test("${T.alphaLeading}", () => {});`]), T.alphaLeading);
  });

  it("reads the MEDIAL-position phrase in a single-quoted it( title", () => {
    // Kills two at once: a matcher anchored to `test(` alone misses the six live `it(`
    // pins, and a double-quote-only literal reader misses every single-quoted title.
    expectTitles(pins([`it('${T.betaMedial}', () => {});`]), T.betaMedial);
  });

  it("reads the TRAILING-position phrase in a test( title", () => {
    // Kills: a matcher anchored to the START of a title.
    expectTitles(pins([`test("${T.gammaTrailing}", () => {});`]), T.gammaTrailing);
  });

  it("matches the phrase CASE-INSENSITIVELY", () => {
    // Kills: a case-sensitive matcher, which misses the live
    // `CLOSED (was DOCUMENTED LIMIT): …` shape outright.
    expectTitles(pins([`it("${T.deltaUpper}", () => {});`]), T.deltaUpper);
  });

  it("reads a literal containing an ESCAPED QUOTE, and decodes it", () => {
    // Kills: a naive double-quote-to-double-quote match, which ends the literal at the
    // escaped quote and never sees the phrase after it. The SOURCE spelling is written
    // out here; the expectation is the DECODED title from the shared source.
    expectTitles(
      pins(['test("the qplinth \\"epsilon\\" shim is a known miss", () => {});']),
      T.epsilonEscapedQuote,
    );
  });

  it("decodes a doubled backslash to ONE backslash (spec §3.1 item 2, its own case)", () => {
    // Kills: a decoder implementing only the quote, newline and tab escapes. It passes
    // every other case in this file while violating §3.1's explicit contract and
    // drawing a false advisory on any plan naming the real runtime title.
    expectTitles(
      pins(['test("a qplinth zeta path C:\\\\tmp is a declared miss", () => {});']),
      T.zetaBackslash,
    );
  });

  it("matches the opener modulo LEADING WHITESPACE", () => {
    // Kills: an anchor requiring the call at column 1, which misses every nested test.
    expectTitles(pins([`    it("${T.omicronIndented}", () => {});`]), T.omicronIndented);
  });

  it("reports the pin's PATH and its 1-based LINE", () => {
    const found = pins([
      'import { test } from "vitest";',
      "",
      `test("${T.alphaLineProbe}", () => {});`,
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.path).toBe(SUITE);
    expect(found[0]!.line).toBe(3);
  });
});

describe("discoverPins — the accept set is EXACTLY three phrases (spec §8 item 6)", () => {
  it("draws nothing for a near-miss phrase, while the real phrase in the same input draws", () => {
    // Paired: an unpaired "draws nothing" is satisfied by an implementation that never
    // looked. The companion proves this input was scanned and decided.
    expectTitles(pins([`test("${T.rhoNearMiss}", () => {});`, COMPANION]), T.piCompanion);
  });
});

describe("discoverPins — declines the core itself decides", () => {
  // ── describe( ─────────────────────────────────────────────────────────────────
  // Spec §2.3: a describe title summarizes a group; the zero lives in its member
  // tests, which carry their own phrase-bearing titles where they are pins.
  const DESCRIBE_DECLINE = [COMPANION, `describe("${T.etaDescribe}", () => {});`];
  // ONE VARIABLE, applied mechanically rather than retyped.
  const DESCRIBE_ACCEPT = DESCRIBE_DECLINE.map((l) => l.replace(/^describe\(/, "test("));

  it("declines a describe( title (spec §2.3)", () => {
    expectTitles(pins(DESCRIBE_DECLINE), T.piCompanion);
  });

  it("…and the SAME BYTES with the group opener swapped for a test opener REPORT it", () => {
    expectTitles(pins(DESCRIBE_ACCEPT), T.etaDescribe, T.piCompanion);
  });

  // ── .each ─────────────────────────────────────────────────────────────────────
  // Spec §8 item 3: the title follows the case table, and admitting it means reading
  // across the array — the block-extent road §1.1 item 3 declines.
  const EACH_DECLINE = [COMPANION, `test.each([[1], [2]])("${T.thetaEach}", () => {});`];
  const EACH_ACCEPT = EACH_DECLINE.map((l) => l.replace(".each([[1], [2]])", ""));

  it("declines a table-driven form (spec §8 item 3)", () => {
    expectTitles(pins(EACH_DECLINE), T.piCompanion);
  });

  it("…and the SAME BYTES without the table suffix REPORT it", () => {
    expectTitles(pins(EACH_ACCEPT), T.thetaEach, T.piCompanion);
  });

  // ── template-literal title ────────────────────────────────────────────────────
  // Spec §8 item 4: substitution would make the title non-constant.
  const TEMPLATE_DECLINE = [COMPANION, `test(\`${T.iotaTemplate}\`, () => {});`];
  const TEMPLATE_ACCEPT = TEMPLATE_DECLINE.map((l) => l.replace(/`/g, '"'));

  it("declines a TEMPLATE-LITERAL title (spec §8 item 4)", () => {
    expectTitles(pins(TEMPLATE_DECLINE), T.piCompanion);
  });

  it("…and the SAME BYTES with backticks swapped for quotes REPORT it", () => {
    expectTitles(pins(TEMPLATE_ACCEPT), T.iotaTemplate, T.piCompanion);
  });

  // ── literal not closing on the opener's line ──────────────────────────────────
  // Spec §8 item 5. The one variable is whether the call is collapsed onto one line.
  const MULTILINE_CALL_DECLINE = [
    COMPANION,
    "test(",
    `  "${T.kappaMultilineCall}",`,
    "  () => {},",
    ");",
  ];
  const MULTILINE_CALL_ACCEPT = [COMPANION, `test("${T.kappaMultilineCall}", () => {});`];

  it("declines a call whose literal does not close on the opener's line (spec §8 item 5)", () => {
    expectTitles(pins(MULTILINE_CALL_DECLINE), T.piCompanion);
  });

  it("…and the SAME CALL collapsed onto one line REPORTS it", () => {
    expectTitles(pins(MULTILINE_CALL_ACCEPT), T.kappaMultilineCall, T.piCompanion);
  });

  // ── phrase in the SECOND argument ─────────────────────────────────────────────
  // Spec §3.1 item 2: the pin is the FIRST argument's literal, never the line.
  const SECOND_ARG_DECLINE = [
    COMPANION,
    'test("plain qplinth lambda heading", () => expect(g).toBe("a documented limit"));',
  ];
  const SECOND_ARG_ACCEPT = SECOND_ARG_DECLINE.map((l) =>
    l.replace('"plain qplinth lambda heading"', () => `"${T.lambdaSecondArg}"`),
  );

  it("declines a phrase in the SECOND argument, never the title (spec §3.1 item 2)", () => {
    // Kills: matching the phrase anywhere on the line (spec §6, "§3.1 title position").
    expectTitles(pins(SECOND_ARG_DECLINE), T.piCompanion);
  });

  it("…and the SAME LINE with the phrase moved into the title REPORTS it", () => {
    expectTitles(pins(SECOND_ARG_ACCEPT), T.lambdaSecondArg, T.piCompanion);
  });

  // ── a `//` line ───────────────────────────────────────────────────────────────
  // This one the CORE decides, by the line-opener anchor: a `//`-prefixed line does not
  // open a call at the start of the line modulo whitespace. Preparation would also
  // blank it; the anchor means the core does not depend on that.
  const SLASH_COMMENT_DECLINE = [COMPANION, `// test("${T.muSlashComment}", () => {});`];
  const SLASH_COMMENT_ACCEPT = SLASH_COMMENT_DECLINE.map((l) => l.replace(/^\/\/ /, ""));

  it("declines a comment-prefixed test line by the OPENER ANCHOR (spec §2.2)", () => {
    expectTitles(pins(SLASH_COMMENT_DECLINE), T.piCompanion);
  });

  it("…and the SAME BYTES with the comment marker removed REPORT it", () => {
    expectTitles(pins(SLASH_COMMENT_ACCEPT), T.muSlashComment, T.piCompanion);
  });
});

describe("discoverPins — spans PREPARATION owns, asserted at the core's own grain", () => {
  /**
   * The deciding rule for both cases below is spec §3.1's PREPARATION, not any rule of
   * the core, and saying so is the point: the core scans what it is given,
   * position-for-position, and owns no notion of comment or string state. Task 7b
   * proves the preparation itself against the real adapter over decoy-bearing text.
   *
   * What these DO prove about the core: it does not skip, re-derive or second-guess a
   * blanked span, and it still reports the surviving pin — the direction a preparation
   * that blanked everything would fail.
   */

  const BLOCK_COMMENT_RAW = [COMPANION, "/*", `test("${T.xiBlockComment}", () => {});`, "*/"];
  const BLOCK_COMMENT_PREPARED = BLOCK_COMMENT_RAW.map((l, i) => (i === 2 ? blanked(l) : l));

  it("reports only the live pin once a block-commented pin is BLANKED by preparation", () => {
    expectTitles(pins(BLOCK_COMMENT_PREPARED), T.piCompanion);
  });

  it("…and the identical bytes UNPREPARED report both — so preparation is the deciding rule", () => {
    expectTitles(pins(BLOCK_COMMENT_RAW), T.xiBlockComment, T.piCompanion);
  });

  // The outer string is SINGLE-quoted deliberately. With a double-quoted outer string
  // the inner quotes must be backslash-escaped, and the line is then declined by the
  // first-argument-literal rule (its first character after `(` is a backslash) rather
  // than by preparation — a different rule deciding the observation, which would make
  // this fixture prove nothing about the channel it names. Round 5's actual shape is a
  // physical line beginning `test("… documented limit …")`, and that needs the outer
  // delimiter to be the other quote. Caught by EXECUTION, after passing every reading.
  const MULTILINE_STRING_RAW = [
    COMPANION,
    "const qplinthFixture = '\\",
    `test("${T.nuMultilineString}", () => {});\\`,
    "';",
  ];
  const MULTILINE_STRING_PREPARED = MULTILINE_STRING_RAW.map((l, i) => (i === 2 ? blanked(l) : l));

  it("reports only the live pin once a multi-line ordinary string is BLANKED", () => {
    expectTitles(pins(MULTILINE_STRING_PREPARED), T.piCompanion);
  });

  it("…and the identical bytes UNPREPARED read the fixture text as a pin", () => {
    // The round-5 finding made executable: preserving such a string wholesale let
    // fixture text read as a live pin.
    expectTitles(pins(MULTILINE_STRING_RAW), T.nuMultilineString, T.piCompanion);
  });
});

describe("discoverPins — the GRAIN is the test, not the zero it tabulates (spec §8 item 12)", () => {
  const TABULATING = [
    `test("${T.omegaGrain}", () => {`,
    "  for (const spelling of [",
    '    ["alpha", "a declared miss"],',
    '    ["beta", "a declared miss"],',
    '    ["gamma", "a declared miss"],',
    '    ["delta", "a declared miss"],',
    '    ["epsilon", "a declared miss"],',
    '    ["zeta", "a declared miss"],',
    "  ]) {",
    "    expect(scan(spelling)).toHaveLength(0);",
    "  }",
    "});",
  ];

  it("yields exactly ONE pin whose LINE is the enclosing title's, not a table row's", () => {
    // The count alone cannot separate "one pin, correctly grained" from "six pins,
    // collapsed": an implementation emitting one pin PER ROW and then deduplicating by
    // title also yields one. The LINE is what discriminates, so the LINE is asserted.
    const found = pins(TABULATING);
    expect(found).toHaveLength(1);
    expect(found[0]!.title).toBe(T.omegaGrain);
    expect(found[0]!.line).toBe(1);
  });
});

describe("discoverPins — dispositions are keyed on (path, title) (spec §5)", () => {
  const SOURCE = [`test("${T.sigmaDispositioned}", () => {});`, `test("${T.tauLive}", () => {});`];
  const ROW: PinDisposition[] = [
    { path: SUITE, title: T.sigmaDispositioned, reason: "constructed for this suite" },
  ];

  it("suppresses the dispositioned title while the same file's other pin still reports", () => {
    // Paired: "draws nothing" alone is satisfied by an arm that went silent everywhere.
    expectTitles(pins(SOURCE, ROW), T.tauLive);
  });

  it("does NOT suppress the SAME TITLE at a DIFFERENT path", () => {
    // The finer grain, asserted directly. A row keyed on the path alone would absorb
    // every future pin in that file, and that is invisible in every positive test
    // because the absorbed thing does not exist yet.
    expectTitles(pins(SOURCE, ROW, OTHER_SUITE), T.sigmaDispositioned, T.tauLive);
  });

  it("suppresses nothing when the registry is empty", () => {
    expectTitles(pins(SOURCE), T.sigmaDispositioned, T.tauLive);
  });
});

describe("discoverPins — NUMERIC escapes are decoded, and malformed ones fall through", () => {
  /**
   * These paths exist because DELETING them was the wrong repair. An earlier round cut
   * the numeric decoder after 26 of the surface's 48 mutation survivors landed in it —
   * but a survivor means UNTESTED, not DEAD, and removing reachable code made the arm
   * fall SILENT on a class it can meet: two live titles in this repo already carry
   * `\x1b`, on a suite belonging to an enrolled surface. A decline with no channel is
   * the fail-open direction wearing the conservative one's clothes.
   *
   * So the paths are back and each is asserted. Every case pins the DECODED title
   * exactly, which is what kills the offset arithmetic inside the decoder: a mutant that
   * consumes one character too few or too many corrupts the tail of the title rather
   * than the escape itself.
   */
  it("decodes a 4-digit `\\u` escape and keeps decoding after it", () => {
    expectTitles(
      pins([`test("a qplinth chi\\u2014rotor is a documented limit", () => {});`]),
      "a qplinth chi\u2014rotor is a documented limit",
    );
  });

  it("decodes a 2-digit `\\x` escape and keeps decoding after it", () => {
    expectTitles(
      pins([`test("a qplinth psi\\x41rotor is a known miss", () => {});`]),
      "a qplinth psi\x41rotor is a known miss",
    );
  });

  it("decodes a braced `\\u{…}` escape of more than four digits", () => {
    expectTitles(
      pins([`test("a qplinth omega\\u{1F600}rotor is a declared miss", () => {});`]),
      "a qplinth omega\u{1F600}rotor is a declared miss",
    );
  });

  it("treats a MALFORMED `\\u` as an ordinary escape rather than declining the line", () => {
    // The direction matters: falling through to the identity rule keeps a faithful-ish
    // title and keeps the pin REPORTED, where declining would drop it silently.
    expectTitles(
      pins([`test("a qplinth tau\\uZZZZ rotor is a documented limit", () => {});`]),
      "a qplinth tauuZZZZ rotor is a documented limit",
    );
  });

  it("treats a MALFORMED `\\x` the same way", () => {
    expectTitles(
      pins([`test("a qplinth rho\\xZZ rotor is a known miss", () => {});`]),
      "a qplinth rhoxZZ rotor is a known miss",
    );
  });

  it("decodes the MAXIMUM valid code point, one below the ceiling's rejection", () => {
    // Pairs with the case below on the ceiling itself: `\u{10FFFF}` is the largest legal
    // code point and must DECODE, so a comparison that rejects it too is caught here
    // rather than silently narrowing the accept set by one.
    expectTitles(
      pins([`test("a qplinth nu\\u{10FFFF} rotor is a declared miss", () => {});`]),
      "a qplinth nu\u{10FFFF} rotor is a declared miss",
    );
  });

  it("falls through when a braced escape is never closed", () => {
    // No `}` at all, so the brace scan finds nothing and the escape is not one.
    expectTitles(
      pins([`test("a qplinth mu\\u{ABC rotor is a known miss", () => {});`]),
      "a qplinth muu{ABC rotor is a known miss",
    );
  });

  it("falls through when a braced escape exceeds the maximum code point", () => {
    // The 0x10FFFF ceiling. `\u{110000}` is one past it, so it is not a valid escape and
    // the identity rule keeps the title readable and the pin REPORTED.
    expectTitles(
      pins([`test("a qplinth iota\\u{110000} rotor is a documented limit", () => {});`]),
      "a qplinth iotau{110000} rotor is a documented limit",
    );
  });

  it("falls through when a braced escape carries more digits than the grammar allows", () => {
    // CONSTRUCTED IN THE GAP BETWEEN TWO BOUNDS, and that is the whole point. An earlier
    // version of this case used `\u{1234567}` and killed NOTHING: seven digits, yes, but
    // 0x1234567 is 19088743, which the 0x10FFFF ceiling rejects too — so the decoder
    // returned null under the mutant AND without it, and a DIFFERENT RULE decided the
    // observation. `\u{00010FF}` is seven hex digits whose VALUE is 4351, which the
    // ceiling accepts, so only the digit bound can reject it.
    expectTitles(
      pins([`test("a qplinth kappa\\u{00010FF} rotor is a known miss", () => {});`]),
      "a qplinth kappau{00010FF} rotor is a known miss",
    );
  });

  it("decodes the `\\0` escape, which no other case exercises", () => {
    expectTitles(
      pins([`test("a qplinth upsilon\\0gap is a documented limit", () => {});`]),
      T.upsilonNullEscape,
    );
  });

  it("skips WHITESPACE between the open paren and the literal", () => {
    // Kills an advance that moves more than one character at a time: with a two-step
    // advance the scan lands past the quote and the pin is lost.
    expectTitles(pins([`test( \t "${T.phiSpacedLiteral}", () => {});`]), T.phiSpacedLiteral);
  });
});

describe("discoverPins — the opener boundary has TWO axes, and both are varied", () => {
  /**
   * CHARACTERIZATION, disclosed rather than dressed as a TDD cycle: this asserts
   * behavior Task 1 already shipped. It exists because a boundary tested along one axis
   * only is the same defect as a fixture whose observation a different rule decides.
   *
   * The anchor is "the start of the line modulo leading whitespace". The obvious axis is
   * POSITION WITHIN THE LINE, varied above by an indented opener. The axis NOT varied
   * there is ANOTHER CALL ON THE SAME LINE — a pin sitting after a preceding statement,
   * which the anchor declines. That is a missed advisory, never a false one, which is
   * the side the consequence bound requires; it is recorded as a documented limit rather
   * than left as an untested corner.
   */
  const SECOND_ON_LINE = [COMPANION, `}); test("${T.psiSecondOnLine}", () => {});`];
  const AT_LINE_START = SECOND_ON_LINE.map((l) => l.replace(/^\}\); /, ""));

  it("declines a pin that follows another call on the SAME physical line", () => {
    expectTitles(pins(SECOND_ON_LINE), T.piCompanion);
  });

  it("…and the SAME BYTES with the preceding statement removed REPORT it", () => {
    expectTitles(pins(AT_LINE_START), T.psiSecondOnLine, T.piCompanion);
  });
});

describe("discoverPins — degenerate inputs, each paired with a reporting run", () => {
  it("returns no pins for an empty file, while a pin-bearing file in the same run reports", () => {
    expect(pins([])).toEqual([]);
    expectTitles(pins([COMPANION]), T.piCompanion);
  });

  it("returns no pins for a file with no phrase, while a pin-bearing file reports", () => {
    expect(pins(['test("an ordinary qplinth title", () => {});'])).toEqual([]);
    expectTitles(pins([COMPANION]), T.piCompanion);
  });
});
