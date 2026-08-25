import { existsSync, readFileSync } from "node:fs";
import { type AcceptedSurvivor } from "./ledger";
import { OPERATOR_NAMES, type OperatorName } from "./operators";

/**
 * The guard-surface registry (spec §3.7).
 *
 * Enrollment is opt-in, one explicit row per surface. There is no discovery and
 * no inference from path or filename: a surface not listed here is untouched by
 * the harness.
 */
export type GuardSurface = {
  id: string;
  /** Repo-relative path of the module under mutation. */
  sourcePath: string;
  /** Repo-relative suite(s) whose verdict decides KILLED vs SURVIVED. */
  suitePaths: string[];
  /** Per-surface subset of the declared operator set. */
  operators: OperatorName[];
  /** Minimum acceptable mutation score, in (0, 1]. */
  scoreFloor: number;
  /**
   * A deliberately behavior-changing edit the surface's own suite MUST notice.
   *
   * It proves the overlay is live: a harness whose overlay silently failed to
   * apply reports a PERFECT score, every mutant having run against clean
   * source, with every other gate condition still passing.
   *
   * Per-surface, because the first version hardcoded a literal that exists only
   * in taskContract.ts inside a `describe.each` over this registry -- so
   * enrolling any second surface red the gate. It was also never RUN: the
   * `broken` text was computed, asserted non-equal to the source, and then
   * never passed to the runner, so the assertion proved a string existed in a
   * file.
   */
  control: { from: string; to: string };
  accepted: AcceptedSurvivor[];
};

const KNOWN_OPERATORS = new Set<string>(OPERATOR_NAMES);

/** Operator prefix of a site id (`operator:line:column:from>to`). */
const operatorOf = (siteId: string): string => siteId.split(":")[0] ?? "";

/** A `BACKLOG.md` / `DEFERRED.md` entry id, matching the repo-wide citation shape. */
const BACKLOG_REF = /^(BL|DEF)-[A-Z0-9]+(-[A-Z0-9]+)*$/;

/**
 * Static validation. Returns a list of problems; empty means valid.
 *
 * The non-empty checks are not boilerplate. An empty `operators` list is
 * exactly what makes the runtime gate pass vacuously — no mutants, `0/0 = NaN`,
 * and `NaN < floor` is `false` — so this is the authoring-time half of that
 * defence, with gate condition 6 as the runtime half.
 */
export function validateSurface(surface: GuardSurface): string[] {
  const problems: string[] = [];

  if (!surface.sourcePath || !existsSync(surface.sourcePath)) {
    problems.push(`${surface.id}: sourcePath does not exist on disk: ${surface.sourcePath}`);
  }

  if (surface.suitePaths.length === 0) {
    problems.push(`${surface.id}: suitePaths is empty; no suite can decide any verdict`);
  }
  for (const suite of surface.suitePaths) {
    if (!existsSync(suite)) problems.push(`${surface.id}: suitePath does not exist: ${suite}`);
  }

  if (surface.operators.length === 0) {
    problems.push(
      `${surface.id}: operators is empty; the run would generate 0 mutants and score NaN`,
    );
  }
  for (const op of surface.operators) {
    if (!KNOWN_OPERATORS.has(op)) problems.push(`${surface.id}: undeclared operator: ${op}`);
  }

  const floor = surface.scoreFloor;
  if (!Number.isFinite(floor) || floor <= 0 || floor > 1) {
    problems.push(`${surface.id}: scoreFloor must be a finite number in (0, 1], got ${floor}`);
  }

  const { from, to } = surface.control;
  if (from === to) {
    problems.push(`${surface.id}: control.from and control.to are identical; it mutates nothing`);
  }
  if (existsSync(surface.sourcePath)) {
    const occurrences = readFileSync(surface.sourcePath, "utf8").split(from).length - 1;
    if (occurrences === 0) {
      problems.push(`${surface.id}: control.from does not occur in ${surface.sourcePath}`);
    } else if (occurrences > 1) {
      problems.push(
        `${surface.id}: control.from occurs ${occurrences} times in ${surface.sourcePath}; ` +
          `an ambiguous anchor makes the control's target unknowable, so it must occur exactly once`,
      );
    }
  }

  const declared = new Set<string>(surface.operators);
  const seen = new Set<string>();
  for (const row of surface.accepted) {
    if (seen.has(row.siteId))
      problems.push(`${surface.id}: duplicate ledger siteId: ${row.siteId}`);
    seen.add(row.siteId);

    const op = operatorOf(row.siteId);
    if (!KNOWN_OPERATORS.has(op)) {
      problems.push(`${surface.id}: ledger row siteId names an unknown operator: ${row.siteId}`);
    } else if (!declared.has(op)) {
      problems.push(
        `${surface.id}: ledger row names operator ${op}, which this surface does not declare`,
      );
    }

    if (row.reason.trim() === "") {
      problems.push(`${surface.id}: ledger row has an empty reason: ${row.siteId}`);
    }

    // Asymmetric on purpose: a deliberately-uncovered gap is debt and must be
    // tracked; a proven equivalence is not debt.
    //
    // The ref must be SHAPED like a real ledger id, not merely non-empty. A
    // free-text ref makes an accepted gap look tracked while resolving to no
    // debt entry, which defeats the only reason the field is mandatory. The
    // shape is checked here; that the id RESOLVES is enforced repo-wide by
    // tests/docs/_metaLedgerReferentialIntegrity.test.ts.
    if (row.kind === "accepted-gap") {
      const ref = row.ref?.trim() ?? "";
      if (ref === "") {
        problems.push(`${surface.id}: accepted-gap row requires a ref: ${row.siteId}`);
      } else if (!BACKLOG_REF.test(ref)) {
        problems.push(
          `${surface.id}: accepted-gap ref must be a BL-*/DEF-* ledger id, got "${ref}" (${row.siteId})`,
        );
      }
    }
  }

  return problems;
}

/**
 * Enrolled surfaces.
 *
 * `lib/specLint/taskContract.ts` is the first customer (spec §4): 250 lines,
 * freshly merged, and it survived five rounds of adversarial review — so its
 * residual debt is representative of what review leaves behind rather than of
 * an unreviewed surface.
 */
export const GUARD_SURFACES: GuardSurface[] = [
  /**
   * The premise recognizer, enrolled 2026-08-16 with a SCOPED operator subset.
   *
   * Both suites are listed because both are load-bearing consumers: the unit
   * suite pins the recognizer's form-by-form contract, and `_metaPremiseContract`
   * is the corpus consumer whose declared counts a misclassification moves.
   *
   * Budget, measured on the POST-edit source: the full operator set is 148 sites
   * against a 52.20s suite, unrunnable nightly. The enrolled three are 31 sites
   * (relational-boundary 4, equality-flip 15, integer-literal 12) at roughly 27
   * minutes worst case, inside the ~45-minute ceiling. `logical-connector` (51)
   * and `statement-removal` (66) are excluded for WALL CLOCK and nothing else —
   * that is a budget, not a claim their mutants are uninteresting; widening is a
   * registry change carrying its own numbers.
   */
  {
    id: "premiseScan",
    sourcePath: "tests/mutation/source/premiseScan.ts",
    suitePaths: [
      "tests/mutation/source/premiseScan.test.ts",
      "tests/mutation/_metaPremiseContract.test.ts",
    ],
    operators: ["relational-boundary", "equality-flip", "integer-literal"],
    scoreFloor: 0.95,
    // Blinds the `process.env` global test, so every env-reading test classifies
    // environment-free. Re-anchored when R3 #1 replaced the text match with a
    // structural one — the old `from` was that deleted expression, and a control
    // whose text no longer occurs proves nothing. Verified unique on the current
    // source (`grep -c -F 'id.text === "process"'` = 1; the sibling check in
    // `unclassifiableWithin` reads `obj.text`); the provenance fixtures kill it
    // deterministically.
    control: {
      from: 'id.text === "process"',
      to: 'id.text === "processNEVERMATCHES"',
    },
    accepted: [
      {
        siteId: "relational-boundary:994:29:>>>=",
        kind: "equivalent",
        reason:
          "`here.length > 0` versus `>= 0` agree on every reachable input: an extents entry is " +
          "only ever created by `addExtent` or the write pass, and both PUSH a node before storing, " +
          "so the array is never empty. The guard reads as belt-and-braces and is exactly that. " +
          "Re-keyed by the mutated EXPRESSION, not by line: the import-edge repair moved every line " +
          "below its first hunk, the round-1 repairs moved it again, and the round-2 withdrawal moved " +
          "it back, the round-3 repairs nudged it once more, and the accept-set derivation moved it again " +
          "(601 -> 721 -> 604 -> 603 -> 735 -> 748 -> 881 -> 890 -> 955 -> 994). The expression and its 1-based column are byte-identical at " +
          "every key, which is what " +
          "makes this a re-key rather than a new acceptance. The fifth key was re-checked by INSPECTION rather " +
          "than re-measured: an extents entry is still written only by `addExtentIn` or the write pass, both " +
          "still spread-and-append a node before storing, and the derivation change touched neither writer, so " +
          "the array is still never empty. THE SEQUENCE ABOVE WAS ELLIPTICAL UNTIL THE EIGHTH KEY: it stopped at " +
          "735 while this row had in fact moved three more times (748, 881, 890), and those keys were recorded " +
          "only in the SIBLING row's prose, where a reader of THIS row would never look. A history split across " +
          "two records is not a shorter history, it is a wrong one, and the row that omits the moves is the row " +
          "whose next re-key looks unprecedented. Completed here rather than appended to. Re-validated at the " +
          "eighth key by AST rather than by grep: `addExtentIn` has three call expressions and zero declarations " +
          "on `origin/main` and the same at HEAD, and the only diff line matching this row's machinery is a DOC " +
          "COMMENT naming `loadTimePremises` — a mention, not a use, which is the distinction a raw grep loses.",
      },
      {
        siteId: "relational-boundary:2765:28:<><=",
        kind: "equivalent",
        reason:
          "The premise-placement test asks whether the premise call starts BEFORE the registration " +
          "call. `<` and `<=` differ only when the two nodes start at the identical offset, which " +
          "two distinct sibling statements cannot do — equality there would mean they are the same " +
          "node, and the walk never compares a node against itself. Re-keyed by the mutated " +
          "EXPRESSION (1752 -> 2061 -> 1864 -> 1872 -> 1881 -> 1891 -> 1906 -> 1932 -> 1936 -> 1955 -> 1936 -> 2138 -> 2199 -> 2205 -> 2207 -> 2256), byte-identical at every key. FIVE consecutive keys from ONE arc now (2138, 2199, 2205, 2207, 2256): the sixteenth key is that arc's diff-review r4 and r5 repairs plus the closeout killer audit's own repair, and it is the most expensive one yet -- it was discovered by a FAILING GATE at the end of a ten-minute measuring run, so the re-key cost a full re-measure rather than an edit. Re-validated at it rather than carried: `premiseIsAssociated` has ONE call expression and one function declaration on `origin/main` and the same at HEAD, the comparison is byte-identical at both keys, and the diff contains zero lines matching `premiseIsAssociated`, `addExtent`, `here.length` or `loadTimePremises`. The earlier four: the work, then diff-review r1's demanded repair, then r2's, then r3's -- and r3's repair DELETED code, so the row moved even as the file shrank. Direction of edit is irrelevant; only line motion is charged. Re-validated at every key: one call expression on `origin/main` and one at HEAD throughout, the comparison byte-identical, and no diff line touching this function or its operands. THE CALLER COUNT IN EVERY KEY BEFORE THE SEVENTEENTH SAID TWO-AND-TWO AND IT WAS WRONG. It came from a `grep -c` over the name, which counts the FUNCTION DECLARATION alongside the single call site. Counted by AST instead: one call expression and one declaration, identical on both trees. The premise is UNAFFECTED -- what it needs is that the caller set did not change and the comparison is byte-identical, and both hold at one caller as well as at two. What is instructive is how it survived SIXTEEN keys: every re-validation re-ran the SAME flawed instrument, so it agreed with itself every time. A stable wrong number never contradicts anything, which makes repetition feel like corroboration. Re-running one measurement is not re-validation; re-deriving it by a different route is. Caught by diff review r6, the round that was almost not dispatched. THE FOURTEENTH KEY IS THE SAME ARC AGAIN, and the three consecutive keys 2138, 2199 and 2205 are the measured argument for name-keying: the twelfth was the work, the thirteenth was diff-review r1's demanded repair, and the fourteenth is diff-review r2's -- SIX LINES OF COMMENT above this function. A line-keyed record does not cost one re-key per arc; it costs one per LINE-SHIFTING EDIT, and a review round's entire output is line-shifting edits, so the tax scales with scrutiny and falls hardest on the arcs under the most of it. Re-validated at each key rather than carried: one call expression on `origin/main` and one at HEAD throughout, the comparison byte-identical, and no diff line touching this function or its operands. The THIRTEENTH key is the same arc's diff-review r1 repair, which inserted a shared registration walker above this function: the twelfth key was taken before that review and the repair moved it again 61 lines, so ONE arc bought two keys. Re-validated a second time rather than re-keyed on the strength of the first: one call expression on `origin/main` and one at HEAD, the comparison byte-identical at both keys, and the only diff lines matching the premise machinery are the two producers computing a REPORTED LINE with `getStart` -- neither a caller nor an operand of this comparison. The TWELFTH key is the hook-attachment arc, and it is the first that moved this row for a reason: two new producers plus their accessor sit ABOVE this function, so 202 lines of real additions pushed it down. RE-KEYED IS NOT RE-VALIDATED, so the premise was re-checked against the shipped source rather than inherited. What would VOID it is a new caller of `premiseIsAssociated` comparing a node against itself, or any change to that comparison's operands. Neither exists in that arc: one call expression on `origin/main` and one at HEAD, the comparison is byte-identical at both keys, and zero diff lines touch `premiseIsAssociated`, `addExtent`, `here.length` or `loadTimePremises` -- checked against the diff rather than assumed. Both producers append to a file-level reason array and neither goes near this function. Keys six through ELEVEN were bought by ONE arc that never touched this function -- its stop in `hookBodies` seventy lines above, then four review-driven repairs of that stop and its neighbours, and finally a REVERT of one of them. SIX full gate cycles, roughly forty-eight minutes of pure measurement, for an expression nobody edited. Two facts fall out that no earlier key could show: the tenth moved the OTHER accepted row as well (603 -> 622) because reformatting one `Set` literal to multi-line pushed every site below it down nineteen lines, so the churn is proportional to LINES MOVED rather than to semantic change; and the eleventh moved both BACK (622 -> 603, 1955 -> 1936), because an UNDO costs exactly what the change did. A key that tracks position rather than identity charges for motion in either direction. Every key is a re-run, so it taxes wall clock and not just attention. This is the measured case for BL-MUTATION-SITEID-LINE-KEYED-CHURN. The NON-UNIFORM SHIFT is carried over from the parallel twelfth key on the registrar-accept-sets arc (1936 -> 2089), and it is the measured refutation of re-keying by arithmetic: on ONE change the two accepted rows moved by DIFFERENT amounts, +153 and +132 lines. A re-key computed as a uniform offset would have written a WRONG key for exactly one of them, and a wrong key reads as a fresh stale row rather than as an error in the repair. Both were taken from the run artifact's own survivor ids and then verified by reading the expression and its 1-based  The EIGHTEENTH key (2256 -> 2412) was taken from `pnpm mutation:sites`, which walks the enrolled surfaces and prints ok/STALE per accepted row with a successor candidate, rather than from a full gate run - the tool exists for exactly this and its own header says to run it LAST before pushing any change to an enrolled source. It sharpens the non-uniform argument past the +153/+132 pair: on THIS change the two accepted rows moved by 156 and by ZERO - `relational-boundary:735:29` read `ok` and did not move at all while this one moved 156 lines. A uniform offset is refuted by a pair that differs; a pair where one member does not move at all refutes the whole idea that a single number describes the shift. Same operator, same 1-based COLUMN 28, same replacement at both keys - only the line moved,  The NINETEENTH key came with the diff-review r3 repair and moved BOTH accepted rows AGAIN by DIFFERENT amounts: 735 -> 748 is +13 while 2412 -> 2433 is +21. That is the THIRD independent non-uniform pair on this row (+153/+132, then 156 and ZERO, now 13 and 21), and the three together say more than any one of them: the shift is not a property of the CHANGE, it is a property of each SITE's position relative to the edit. No single number describes it and no arithmetic recovers it,  The TWENTIETH key is a FOURTH non-uniform pair - 748 -> 881 is +133 while 2433 -> 2573 is +140 - and its cause is worth separating from its predecessor. A probe an hour earlier found the pending merge owed NO re-key, and that was TRUE of the tree it probed; what moved these rows was this arc's OWN r2 repair commits landing above both sites, not the merge that followed. A base-versus-live probe answers for the tree it read, and one's own subsequent commits supersede it as surely as anyone else's. The TWENTY-FIRST key (2573 -> 2582) is the first UNIFORM pair in the whole sequence — the sibling row moved 881 -> 890, both exactly +9 — and it is worth recording precisely because it looks like a counterexample to the four non-uniform pairs above and is not one. The claim those pairs establish is that the shift is a property of each SITE's position relative to the edit, and this change (the element-access key unwrap inside `calleeName`) sits ABOVE BOTH sites, so both moved by the same amount. Uniformity is what that claim PREDICTS when the edit is above everything; a uniform pair confirms the rule rather than restoring the arithmetic the rule refutes. The trap this closes is the inverse of the one at the twentieth key: having been burned by non-uniform shifts, the tempting reading of +9/+9 is \"the offset is recoverable after all\", and applying it to the next edit — one landing BETWEEN the two sites — writes a wrong key for exactly one of them. Both keys were taken from the gate run's own survivor ids, not computed. Re-validated at this key rather than carried: `premiseIsAssociated` has one call expression and one declaration on `origin/main` and the same at HEAD, counted by AST, and the comparison is byte-identical at both keys. THE TWENTY-SECOND KEY (2582 -> 2701) ARRIVED ONE COMMIT LATER AND SETTLED THE QUESTION THE TWENTY-FIRST RAISED. That key was the first uniform pair (+9/+9) and was recorded as CONFIRMING the non-uniform rule rather than refuting it, with an explicit warning that the next edit landing between the two sites would write a wrong key for exactly one of them if anyone applied the offset. This is that edit -- the diff-round-1 repairs, which inserted a shared outer-expression binding near the top of the file and a whole new reporter between the two sites -- and the pair moved +65 and +119. A reader who had generalised +9 into `the offset is recoverable` would have keyed this row to 2591 and filed a fresh stale row as the symptom. The prediction was written down before the measurement existed, which is the only form in which a prediction is worth anything. Both keys taken from the run artifact's own survivor ids. Re-validated rather than carried: one call expression and one declaration on both trees, counted by AST, comparison byte-identical, and the diff's only line matching this row's machinery is a doc comment. THE TWENTY-THIRD KEY (2701 -> 2715) IS THE FIFTH NON-UNIFORM PAIR AND IT IS THE `ONE MOVED, ONE DID NOT` SHAPE AGAIN -- this row moved +14 while the sibling read `ok` and stayed at 955. That shape has now occurred twice (the eighteenth key, 156 and ZERO, and this one), and the two together say something the merely-unequal pairs cannot: a pair where one member does not move at all refutes not just a particular offset but the whole idea that a single number describes the shift. The cause here is ordinary and worth naming because it is the common case rather than a special one: the diff-round-2 repair edited `undecidableRegistrarReports`, which sits between the two sites -- above this one and below that one. Every edit has such a position, so non-uniformity is the DEFAULT and the uniform pair at the twenty-first key was the special case, not the reverse. Re-validated at this key: `premiseIsAssociated` remains one call expression and one declaration on both trees by AST, and the comparison is byte-identical. THE TWENTY-FOURTH KEY (2715 -> 2765, +50, against the sibling's 955 -> 994, +39) is the SIXTH non-uniform pair and the last one this arc will record, so it is worth stating what twenty-four keys bought. Six pairs measured non-uniform, two of them with one member not moving at all, and exactly ONE pair uniform -- and the uniform one was correctly predicted in advance to be the special case, by an edit that happened to sit above both sites. That is no longer a series of anecdotes about churn; it is a settled fact about the KEY. A position-keyed record is re-keyed once per line-shifting edit, the shift is a property of each site's position rather than of the change, and no arithmetic recovers it -- which is the whole content of BL-MUTATION-SITEID-LINE-KEYED-CHURN, now with a measured cost of twenty-four re-keys on one arc.",
      },
    ],
  },
  {
    // The heavy-orphan reaper's decision function (2026-08-16 spec §9). One suite:
    // every rule is reachable from a literal row table, which is why the module is
    // pure and the CLI is not the enrolled surface.
    id: "heavyReapClassify",
    sourcePath: "lib/heavyReap/classify.ts",
    suitePaths: ["tests/heavyReap/classify.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    control: {
      from: "export const DEFAULT_MIN_AGE_SECONDS = 14400;",
      to: "export const DEFAULT_MIN_AGE_SECONDS = 1;",
    },
    accepted: [],
  },
  {
    // The orchestrator pane-compaction classifier. Enrolled BEFORE the
    // whole-diff review, because that review's brief must carry a
    // `GUARD SURFACE:` line with a real score.
    id: "paneCompactionCore",
    sourcePath: "scripts/lib/pane-compaction-core.ts",
    suitePaths: [
      "tests/paneCompaction/bands.test.ts",
      "tests/paneCompaction/precedence.test.ts",
      "tests/paneCompaction/acceptSet.test.ts",
      "tests/paneCompaction/position.test.ts",
      "tests/paneCompaction/purview.test.ts",
      "tests/paneCompaction/cli.test.ts",
      "tests/paneCompaction/driver.test.ts",
      // Pins which RULE decided, not merely which verdict came out. Rules 4-6
      // share a verdict and rules 7/8/11/12 can share one, so without this the
      // hit(5..8) and verdictFor-key mutants all survived.
      "tests/paneCompaction/ruleIdentity.test.ts",
      // Lands ON the band boundaries the other suites straddle, pins renderRow's
      // absolute column offsets, and COUNTS mintNonce's retries. The first run
      // scored 0.8282 with 28 survivors and every one was a boundary approached
      // from both sides but never landed on, an offset nothing asserted, or a
      // loop bound nothing counted.
      "tests/paneCompaction/mutantKills.test.ts",
      "tests/paneCompaction/revalidate.test.ts",
      // The send-authorization arc's deciding suite (BL-PANE-COMPACTION-SEND-AUTHORIZATION).
      // Enrolled in the SAME task that authors it: a deciding suite outside
      // `suitePaths` runs, passes, and buys zero score, which is how eight #831
      // survivors existed under a green suite.
      "tests/paneCompaction/authorization.test.ts",
    ],
    // Five of the six. `regex-quantifier-bound` is EXCLUDED, and the exclusion
    // is probed rather than assumed: it recognizes only `{m,n}` quantifiers
    // inside literal text, and this surface's two regexes use `{5}` (exact) and
    // `\s+` / `\b`, so it generates ZERO sites here. Measured:
    //
    //     11  relational-boundary      65  integer-literal
    //     51  equality-flip             0  regex-quantifier-bound
    //     19  logical-connector        17  statement-removal
    //
    // Declaring it anyway would be a DARK operator: the gate asserts only that
    // total mutants exceed zero, so it would pass while contributing nothing.
    // The enrolment suite asserts every DECLARED operator has a site, which is
    // what turned this from a plan claim into a measurement.
    operators: [
      "relational-boundary",
      "equality-flip",
      "logical-connector",
      "integer-literal",
      "statement-removal",
    ],
    // The house value. A FLOOR, not a snapshot: pinning it at the measured
    // score turns every future line of this module into a gate failure before
    // it has a test, which is how a ratchet becomes a wall.
    scoreFloor: 0.95,
    // Lowering the eligibility threshold makes every below-band fixture band
    // as eligible, which bands.test.ts asserts IN PROCESS. Run, not merely
    // asserted non-equal to the source.
    control: { from: "export const ELIGIBLE_AT = 5;", to: "export const ELIGIBLE_AT = 0;" },
    // Six survivors, every one argued rather than deferred. NO `accepted-gap`
    // rows: a gap is real coverage debt and owes a BL- ref, and none of these is
    // debt.
    //
    // FOUR are TYPE ANNOTATIONS (`: 0 | 1 | 2`, `exitCode: 1`). TypeScript
    // erases them and the runner's children transpile without typechecking, so
    // the emitted JavaScript is byte-identical and no test could ever kill one.
    //
    // Eight until 2026-08-21. The send-authorization arc deleted `runCompact`'s
    // `{ exitCode: 0 | 1; message: string }` return type -- the function stopped
    // GATING, and the two rows keyed to that annotation went with the code they
    // described. It returns `boolean` today (diff round 3, finding 4 corrected
    // this sentence, which said "returns nothing" and was falsified by the round
    // 2 repair that made the send conditional on the consume's answer). What
    // retired those two rows is the loss of the RICHER annotation, not the
    // absence of a return type. `pnpm mutation:sites`
    // reported them as `(none -- the site is gone)` rather than as moved, which
    // is the distinction that separates a re-key from a deletion.
    //
    // TWO are counter details inside `newestVerdictTie`, which reports
    // `count > 1`. Neither the initial value nor the increment SIZE can move that
    // predicate: the counter is reset to 1 on every new maximum, so it is 1 with
    // no tie and >= 2 with one, whichever constant is used. Argued, not assumed.
    //
    // Line-keyed, and re-keyed once already: the round-1 repairs moved the core
    // and the gate correctly reported all six original rows stale. That staleness
    // is the ledger working, not a defect in it.
    accepted: [
      {
        siteId: "integer-literal:557:53:0>1",
        kind: "equivalent",
        reason:
          "`checkExitCode`'s RETURN TYPE `0 | 1 | 2`, not a returned value. The literals it " +
          "actually returns live in the body and are killed by cli.test.ts.",
      },
      {
        siteId: "integer-literal:557:57:1>2",
        kind: "equivalent",
        reason: "The `1` of the same `0 | 1 | 2` return-type annotation on `checkExitCode`.",
      },
      {
        siteId: "integer-literal:557:61:2>3",
        kind: "equivalent",
        reason: "The `2` of the same `0 | 1 | 2` return-type annotation on `checkExitCode`.",
      },
      {
        // Re-keyed 700 -> 801 -> 828 -> 854, each time RE-VALIDATED by READING the new
        // line rather than by the key resolving: a resolving key proves the site
        // still exists, never that the reason still holds. Line 854 reads
        // `export type Refusal = { exitCode: 1; sends: never[]; message: string
        // };`, so it is the same annotation under a new line. 801 -> 828 was diff
        // round 3's refusal-cause split; 828 -> 854 was round 4's one-pass
        // substitution block, MY OWN commit, which moved it again while I was
        // still describing the previous move. Checked because the merge prompted
        // a re-key sweep, not because anything flagged it -- CI would have.
        //
        // Third re-key on one row, and the pattern is the point: this ledger is
        // keyed by LINE, so any edit above a row silently invalidates it and the
        // gate reports the same site as one unaccepted survivor plus one stale
        // row. That pair -- an unaccounted site and an unmatched row, both
        // integer-literal, same column, same mutation -- is the signature of a
        // MOVE rather than a regression, and it is worth recognising before
        // treating it as a new gap.
        siteId: "integer-literal:854:35:1>2",
        kind: "equivalent",
        reason:
          "`export type Refusal = { exitCode: 1; ... }` -- a type alias. The refusal objects that " +
          "carry a real `exitCode: 1` are constructed elsewhere and asserted by cli.test.ts.",
      },
      {
        siteId: "integer-literal:386:15:0>1",
        kind: "equivalent",
        reason:
          "`let count = 0` in newestVerdictTie. PROBED, not argued from the line's shape: a " +
          "differential run over 3616 row sequences (every combination up to length 3 over " +
          "null/invalid/valid timestamps x verdict/no_verdict/other statuses) found ZERO inputs " +
          "separating 0 from 1. The counter is ASSIGNED 1 on the first qualifying row, and with " +
          "none the predicate `count > 1` is false either way.",
      },
      {
        siteId: "integer-literal:395:16:1>2",
        kind: "equivalent",
        reason:
          "`count += 1` in newestVerdictTie. PROBED by the same 3616-sequence differential run: ZERO " +
          "inputs separate `+= 1` from `+= 2`. The increment fires only on a tie, where the count " +
          "is already >= 1, so `count > 1` is true under both. Argued from evaluated OUTPUT, never " +
          "from the site's shape -- a boundary or literal that merely LOOKS inert is how a real " +
          "defect gets blessed as equivalent.",
      },
    ],
  },
  {
    // The modal-wait guard's predicate module (2026-08-16 adoption arc §4.4,
    // AC-3). Authored as an importable module with a referring suite from the
    // start, so enrolment is a registry row rather than a restructuring.
    id: "modal-wait-helper-scan",
    sourcePath: "tests/ci/modalWaitHelper/scan.ts",
    // TWO deciding suites since the candidate-contract v2 arc (2026-08-17): the
    // corpus suite, and the premise proofs, whose constructed fixtures are the
    // only place the statement unit's discrimination is exercised on input the
    // live tree does not happen to hold.
    suitePaths: [
      "tests/ci/_metaModalWaitHelper.test.ts",
      "tests/ci/_metaModalWaitCandidateV2.test.ts",
    ],
    // All six declared families. A narrowed subset is a CLAIM about which
    // mutations cannot escape, and this surface has no evidence for one. That
    // is emphatically NOT a claim all six are exercised here: the gate checks
    // only that the surface produces some mutants, never one per family, so
    // every family yielding zero sites is recorded in the plan's closeout as
    // not-exercised. Probed at plan time: `regex-quantifier-bound` recognizes
    // bounded `{m,n}` syntax only, and this module's regexes use `*`, so it
    // yields zero sites here.
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // Drops the empty-reason arm of the exemption check, so a
    // `// modal-wait-exempt:` with nothing after it silently becomes a valid
    // exemption. The premise proof's empty-reason case is what notices.
    control: { from: 'reason === null || reason === ""', to: "reason === null" },
    accepted: [
      // ---- equivalent: cannot change observable behavior ------------------
      //
      // First real run scored 49/57 with EIGHT survivors. Six were coverage gaps
      // and were repaid with cases in the deciding suite, each proven against its
      // own mutant (testid-window bound and its same-line edge, the quoted
      // data-testid capture group, the product surface's own line number, and the
      // two-rule ambiguity threshold). Re-run: 55/57 with exactly these two left.
      // Making the scan comment-aware then grew the surface to 61 sites; every
      // one of the four new sites is killed, so the score is 59/61 = 0.9672 with
      // these same two rows, and it has stayed those two through every later
      // revision: 59/61, 60/62, 58/60, and 121/123 after the candidate-contract
      // v2 rewrite (2026-08-17). A THIRD row here is a gap to repay, not a
      // number to bump.
      //
      // v2 held that line the hard way. The statement machinery's first run
      // reported 28 unaccepted survivors at 95/123 = 0.7724, and every one was
      // repaid rather than blessed: twelve by NARROWING the surface (the
      // module-block, switch-clause and unbraced-control-flow arms of
      // `isStatementLike`, the redundant SourceFile guard in the climb, and an
      // import-declaration check the origin pattern's own call paren already
      // made unreachable), five by deleting hand-rolled arithmetic in favour of
      // the TypeScript APIs that define it (`getPositionOfLineAndCharacter`,
      // `textSpanContainsPosition`, one prefix alternation instead of a
      // min-of-indexes), and the rest by cases in the v2 premise suite pinning
      // the column-0 and statement-start attribution edges, the scope-callee
      // discrimination, and the quoted-label-key limit.
      //
      // NOTE FOR THE NEXT EDITOR OF scan.ts: a siteId is
      // `operator:LINE:column:from>to`, so ANY edit to that file relocates these
      // ids and the gate then reports a stale-ledger-row for an id no generated
      // site has. Diff review caught exactly that twice. Re-run the score and
      // update both ids in the SAME commit as the source change — the ledger is
      // a measurement of one revision, not a standing claim.
      {
        siteId: "statement-removal:250:9:continue;>(removed)",
        kind: "equivalent",
        reason:
          "Drops the `continue` after `visit(child)` in walkSourceFiles, so a DIRECTORY falls through to the `child.endsWith('.ts') || child.endsWith('.tsx')` test below it. No directory in app/ or components/ ends in .ts or .tsx, so the extra test is always false and the walk's output is identical. Observable only for a directory literally named `*.ts`, which the tree does not contain.",
      },
      {
        siteId: "integer-literal:640:83:0>1",
        kind: "equivalent",
        reason:
          "Changes the `?? 0` fallback in classifyCandidates' count increment to `?? 1`. The branch is unreachable: countsByRule is pre-seeded with a 0 entry for EVERY rule at construction (`new Map(rules.map((rule) => [rule.id, 0]))`), so `countsByRule.get(hit.id)` never returns undefined and the nullish fallback never evaluates.",
      },
    ],
  },
  {
    // The modal-wait census's AUTHORED half (2026-08-17 candidate-contract v2
    // §4.5). Enrolled once the v2 rewrite made it more than a literal table: it
    // now carries the statement-level refusal gates, the match-line
    // discriminations, and `reconcileNWaitSites`, all of which are logic a
    // survivor can hide in. Registry-expressible shape by construction — an
    // importable module whose two referring suites already exist.
    id: "modal-wait-disposition",
    sourcePath: "tests/ci/modalWaitHelper/disposition.ts",
    suitePaths: [
      "tests/ci/_metaModalWaitHelper.test.ts",
      "tests/ci/_metaModalWaitCandidateV2.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // Drops the NEGATION from the in-page-evaluate refusal, so the rule claims
    // exactly the activating bodies it exists to refuse and releases the reads it
    // exists to claim. Both deciding suites notice: the corpus's ten evaluate
    // reads fall through to `d/reference-not-activation` and drift both counts,
    // and the premise suite's paired poll case loses its claim.
    //
    // The FIRST control tried here was narrowing `isTestTitle` from
    // `(?:test|describe)` to `(?:test)`, and the gate REFUTED it: the corpus
    // spells every block `test.describe(`, which `(?:\.\w+)*` still matches, so
    // the "control" was itself an equivalent mutant and the AC-3 case failed
    // exactly as designed. Recorded because a control that cannot fail is the
    // one defect that case exists to catch.
    control: {
      from: "/\\.evaluate\\(/.test(candidate.text) && !ACTIVATION_VERB.test(candidate.text)",
      to: "/\\.evaluate\\(/.test(candidate.text) && ACTIVATION_VERB.test(candidate.text)",
    },
    accepted: [],
  },
  // NOT ENROLLED — tests/e2e/helpers/openShowReviewModal.ts, probed 2026-08-18 on
  // fix/modal-wait-skeleton-tolerant and dispositioned honestly rather than symbolically
  // (spec §4.6-7; the step3 precedent, AGENTS.md convergence criterion 4).
  //
  // The row was authored, the gate red as designed on the missing EXPECTED_LEDGER_KINDS key,
  // and the scoring run measured the surface. RE-MEASURED at branch head after the diff
  // review round-1 repair rewrote the classifier (diff review R2 finding 1: the first probe
  // described source that no longer existed — 27 sites then, 35 now). Head numbers, declared
  // operator set: 26 of 35 killed, 0.7429, against a 0.95 floor. The nine survivors:
  //
  //   - SIX are the boundary-recovery and watchdog statements (both
  //     `test.info().annotations.push` calls, both `RETRY_SELECTOR` clicks, the loaded core's
  //     post-recovery re-wait) and TWO are the post-recovery `=== "boundary"` / `=== null`
  //     comparisons that only run after them. All eight sit behind the lazy
  //     `@playwright/test` dynamic import, which is exactly why this module has no top-level
  //     value import from it: the unit suites run under vitest and cannot execute those
  //     branches at all. Killing them needs a real 502, not a test. Parent-#830 limit 2
  //     recorded this; this arc's spec §7 limit 2 inherits it.
  //   - ONE (`integer-literal:78:57`) is inside `Parameters<Page["goto"]>[1]`, a TYPE
  //     position with no runtime behaviour to observe.
  //
  // TWO were real gaps across the two probes and BOTH were repaid rather than blessed:
  // `timeoutMs > 0` mutated to `> 1` (the normalization case now pins the boundary from the
  // passing side), and `observed = await classify()` removed after the bounded re-race, which
  // left the helper starving while the modal was on screen (the reappearing-frame case pins
  // it). Each kill was verified by hand-applying its own mutant.
  //
  // So the reachable ceiling is the recovery shadow plus one type position — 26/35 — and
  // enrolling would mean either a floor no guard can be trusted at or nine blessed rows.
  // Neither is a guard; both are a number that looks like one. Re-open when the recovery
  // branches become executable under vitest (an injectable annotation sink would do it) —
  // a helper redesign, not this arc's scope, and a documented limit rather than a ledger row
  // because its worst case is exactly today's behaviour.
  {
    // The citation-intent classifier (2026-08-15 arms spec §3, §7). Its three
    // suites split the surface deliberately: the unit suite pins the matching
    // discipline per consumer, the wiring suite pins the two-pass relocation
    // that only `checkCitations` can exercise, and the corpus suite pins the
    // measured tier table.
    id: "citationIntent",
    sourcePath: "lib/specLint/citationIntent.ts",
    suitePaths: [
      "tests/specLint/citationIntent.test.ts",
      "tests/specLint/citationIntentWiring.test.ts",
      "tests/specLint/citationIntentCorpus.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // The plan named `const lo = Math.max(1, start - 5);`; the implementation
    // hoisted the 5 into PROXIMITY_WINDOW (matching the shipped citations.ts),
    // so the control moves to the constant. Same mutant class: it narrows the
    // window by one line, which the start-5 / end+5 edge cases catch.
    control: { from: "const PROXIMITY_WINDOW = 5;", to: "const PROXIMITY_WINDOW = 4;" },
    accepted: [],
  },
  {
    // The red-contract field semantics (2026-08-15 arms spec §4, §7). The
    // wiring suite is listed because it holds the span-exclusion coordinates,
    // which no other suite observes.
    id: "redContract",
    sourcePath: "lib/specLint/redContract.ts",
    suitePaths: [
      "tests/specLint/redContract.test.ts",
      "tests/specLint/redExec.test.ts",
      "tests/specLint/citationIntentWiring.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    control: { from: 'kind !== "plan"', to: 'kind === "plan"' },
    accepted: [
      // ---- equivalent: cannot change observable behavior (spec §2.4) -------
      //
      // Seven rows, three arguments. Every OTHER survivor of the first run was
      // repaid by a test rather than blessed (fourteen of them), which is why
      // these seven are argued individually instead of as a family.
      {
        siteId: "regex-quantifier-bound:37:17:{0,3}>{0,4}",
        kind: "equivalent",
        reason:
          "GATE only ever runs on lines already admitted by GATE_ANY (redContract.ts:36, itself {0,3}), so every candidate has <=3 leading spaces and widening this bound admits nothing — the same reachability argument the taskContract MARKER rows carry",
      },
      {
        siteId: "relational-boundary:110:21:<><=",
        kind: "equivalent",
        reason:
          "the marker scan reads one index past the end; model.fencedInfo[len] is undefined, so the loop's own fence guard skips the iteration before model.lines[i] is read",
      },
      {
        siteId: "integer-literal:190:58:1>2",
        kind: "equivalent",
        reason:
          'Math.min(extent.end, lines.length + 1) -> + 2 extends the fenced scan one line past the end, where fencedInfo is undefined and the `typeof !== "string"` guard skips it — fence CONTENT can never sit past the last line',
      },
      {
        siteId: "relational-boundary:191:32:<><=",
        kind: "equivalent",
        reason: "same one-past-the-end argument as the clamp above; the fence guard skips it",
      },
      {
        siteId: "relational-boundary:257:53:>>>=",
        kind: "equivalent",
        reason:
          "`line > e.start` at equality means a marker ON the task heading line, and a heading cannot match MARKER_ANY, so the case is unreachable",
      },
      {
        siteId: "relational-boundary:257:71:<><=",
        kind: "equivalent",
        reason:
          "`line < e.end` at equality means a marker ON the extent's terminating line — the next heading or the region close — and neither is marker-shaped",
      },
      {
        siteId: "relational-boundary:127:21:<><=",
        kind: "equivalent",
        reason: "gate scan one-past-the-end, same argument as the marker scan at :110",
      },
    ],
  },
  {
    // The fixture-satisfiability arm (2026-08-18 fixture spec §7). Its defect
    // class is exactly "reports OK while the output moved": every branch of the
    // §4.3 ladder either emits a code or DELIBERATELY says nothing, so a mutant
    // that turns a verdict into silence — or the reverse — is invisible to any
    // green suite. Enrolment precedes review (AGENTS.md convergence-criterion
    // bullet 4), and the module ships as an importable core with referring
    // suites from the start rather than as a terminal script.
    //
    // The CLI suite is deliberately NOT a suitePath: it spawns a real vitest
    // child per case, and the four pure suites above already hold every
    // deciding assertion. If a survivor turns out to need it, it belongs here —
    // placement outside suitePaths buys zero score (the #831 lesson).
    id: "declaredLimitPins",
    sourcePath: "lib/specLint/declaredLimitPins.ts",
    suitePaths: [
      "tests/specLint/declaredLimitPins.test.ts",
      "tests/specLint/declaredLimitPinsFiles.test.ts",
      "tests/specLint/declaredLimitPinsObligation.test.ts",
      "tests/specLint/declaredLimitPinsWiring.test.ts",
      "tests/specLint/declaredLimitPinsCorpus.test.ts",
      "tests/specLint/declaredLimitPinsCli.test.ts",
      "tests/specLint/_metaDeclaredLimitPins.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    control: { from: 'kind !== "plan"', to: 'kind === "plan"' },
    // Declared EMPTY before the first scored run, per enrolment-precedes-review. The run
    // refuted it — 48 survivors at 0.6471 — and all but five were repaid by DELETING dead
    // code or adding cases. These five are argued, and rule 20 puts that rung LAST.
    //
    // THREE OF THEM SHARE ONE INVARIANT rather than having three separate stories, which
    // is what makes them a derived cover instead of three rationalisations:
    //
    //   IN LIST FORM THE HEADER LINE CARRIES NO ENROLLED PATH. A header whose remainder
    //   names a path is classified INLINE by the branch above, and every enrolled path is
    //   PATH_SHAPED (it contains a directory separator). So by the time control reaches
    //   the LIST test, the header's own line cannot name a surface.
    //
    // That invariant is not invented for these rows — it is the same one that made the
    // declined-branch push deletable, so it is exercised by something other than the
    // argument that needs it. IF IT EVER BECOMES FALSE, ALL THREE ROWS ARE VOID AT ONCE.
    accepted: [
      {
        siteId: "logical-connector:329:30:&&>||",
        kind: "equivalent",
        reason:
          "header on the LAST line: conjunct 1 is false, but under || the next disjunct (fencedInfo[next] === undefined, undefined out of range) is true, so the LIST branch is entered. Its span loop is j = next; j < model.lines.length with next === model.lines.length, so the body never runs and span stays [i]. Per the LIST-form invariant, scanning [i] names nothing — identical to the declined path, which records nothing. Argued BEFORE the confirming run.",
      },
      {
        siteId: "logical-connector:330:44:&&>||",
        kind: "equivalent",
        reason:
          "next line opens a FENCE: conjunct 1 (nextLine !== undefined) is true, so || short-circuits into the LIST branch. The span loop's FIRST statement is the fence guard, which fires on that very line, leaving span = [i]. Per the LIST-form invariant, names nothing. Argued BEFORE the confirming run.",
      },
      {
        siteId: "relational-boundary:334:28:<><=",
        kind: "equivalent",
        reason:
          'at j === model.lines.length the read is model.lines[j] ?? "", which yields "", and the next statement breaks on item.trim() === "". The extra iteration reads nothing and appends nothing. Depends on the total ?? "" read rather than a non-null assertion, which would have thrown instead. Argued BEFORE the confirming run.',
      },
      {
        siteId: "integer-literal:392:17:0>1",
        kind: "equivalent",
        reason:
          "starting the scan at 1 skips index 0, and NO LINE THIS ARM SCANS CAN BEGIN WITH AN ENROLLED PATH AT INDEX 0. Structural: a line inside a declaration span is the header (opens **Files:** or a list marker), a list item (opens [-*+] plus whitespace), or an indented continuation (opens with whitespace) — all three hold a non-path character at index 0, and a bare path at column 0 matches none of them, so it ENDS the run rather than being scanned. Probed as well as argued: 51061 declaration-shaped lines across the tracked corpus, ZERO beginning with an enrolled path, with a control confirming enrolled paths do occur. Origin noted honestly - written after seeing the survivor list - but the support is the structural proof and the probe, not the survival. FALSIFIER IS EXECUTABLE, not prose: if this site stops surviving, the row becomes a stale-ledger-row and the gate REDS on it (tests/mutation/source/gate.ts), so nobody has to remember to re-check.",
      },
      {
        siteId: "relational-boundary:392:23:<><=",
        kind: "equivalent",
        reason:
          'STRUCTURAL: the mutant grants exactly ONE extra iteration, at at === line.length, where the first statement is line.startsWith(path, at). startsWith at an index equal to the string length is TRUE ONLY FOR THE EMPTY STRING, so for any non-empty path the body continues and the loop exits on the next increment — every later statement is unreachable in that iteration. PROBED: all 107 paths in the closed enrolled candidate set are non-empty and all 107 return false for startsWith(path, line.length), with a CONTROL confirming startsWith("", length) is true, so the zero is attributable rather than the probe being broken. PREMISE: no enrolled path is the empty string. Origin noted honestly - written after seeing the survivor list - but the support is the proof and the probe, not the survival.',
      },
    ],
  },
  {
    id: "fixtureContract",
    sourcePath: "lib/specLint/fixtureContract.ts",
    suitePaths: [
      "tests/specLint/fixtureContract.test.ts",
      "tests/specLint/fixtureSplicePlan.test.ts",
      "tests/specLint/fixtureClassify.test.ts",
      "tests/specLint/fixtureWiring.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    control: { from: 'kind !== "plan"', to: 'kind === "plan"' },
    accepted: [
      // ---- equivalent: cannot change observable behavior --------------------
      //
      // TWO rows, ONE argument, and it is the same one-past-the-end reachability
      // the redContract rows above carry. Every OTHER survivor of the first
      // scored run was repaid by a test or removed by deleting the duplicated
      // rule that made it unreachable — eleven of them — which is why these two
      // are argued rather than blessed as a family.
      {
        siteId: "relational-boundary:99:21:<><=",
        kind: "equivalent",
        reason:
          "the marker scan reads one index past the end; model.fencedInfo[len] is undefined, so the loop's own fence guard (`!== undefined`) continues before model.lines[i] is used, and the extra iteration emits nothing",
      },
      {
        siteId: "relational-boundary:204:43:<><=",
        kind: "equivalent",
        reason:
          'the fence-body scan reads one index past the end; model.fencedInfo[len] is undefined, so the `typeof !== "string"` guard breaks on that iteration before model.lines[j] is pushed — fence CONTENT can never sit past the last line',
      },
    ],
  },
  {
    id: "taskContract",
    sourcePath: "lib/specLint/taskContract.ts",
    // BOTH suites, and the second one is load-bearing: `compareFindings` is
    // exercised only by the ordering suite, so without it every mutant inside
    // the comparator survives for want of a test that ever calls it — which is
    // exactly what the gate reported when the function was first extracted.
    suitePaths: [
      "tests/specLint/taskContract.test.ts",
      "tests/specLint/taskContractFindingOrder.test.ts",
      // The v2 grammar suite (2026-08-15 arms spec §4.1-§4.2): it is the only
      // one that sees the widened region attribute, `parseMarker` and
      // `taskTopology`, so without it every mutant inside those survives.
      "tests/specLint/taskContractV2Grammar.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // Moved here from the gate test body, where it was hardcoded for this one
    // surface. Same text, same behavior; it is now a property of the surface.
    control: { from: 'if (kind !== "plan") return [];', to: 'if (kind === "plan") return [];' },
    accepted: [
      // ---- equivalent: cannot change observable behavior (spec §2.4) -------
      //
      // Every row below moved coordinates on 2026-08-09 with the multi-region
      // enrollment rewrite. Site ids carry position by design (ledger.ts:38-44:
      // "a ledger that quietly follows its site around stops being a ratchet"),
      // so the rewrite retired all 22 rows as stale and re-raised the same 22
      // mutants as unaccepted survivors. The re-anchoring is 1:1 and checkable:
      // the surface produced exactly 22 survivors before and after, and each
      // row keeps its operator AND its `from>to` text, so no row was moved onto
      // a different mutant. Of those 20, sixteen kept their column exactly and
      // four moved, because the statement around them got longer or more
      // deeply nested.
      //
      // TWO rows are NOT re-anchorings and are re-argued from scratch, because
      // the variables they were about no longer exist: the old `regionStart` /
      // `regionEnd` pass-1 state became `openStart` / `openDepth`. Their new
      // arguments rest on the region-list model, not on the retired `openCount`.
      {
        siteId: "regex-quantifier-bound:51:6:{0,3}>{0,4}",
        kind: "equivalent",
        reason:
          "MARKER only ever runs on lines already admitted by MARKER_ANY (taskContract.ts:22, itself {0,3}), so every candidate has <=3 leading spaces and widening this bound admits nothing",
      },
      {
        siteId: "regex-quantifier-bound:59:6:{0,3}>{0,4}",
        kind: "equivalent",
        reason:
          "same reachability argument as MARKER; MARKER_AC_ABSENT runs only on MARKER_ANY hits",
      },
      {
        siteId: "relational-boundary:121:21:<><=",
        kind: "equivalent",
        reason:
          "the extra iteration reads lines[i] === undefined; RegExp.test coerces it to the string 'undefined', which no AC-id pattern matches",
      },
      {
        siteId: "integer-literal:159:19:0>1",
        kind: "equivalent",
        reason:
          "openDepth's initial value is dead: it is read only where a region is pushed, and both push sites are guarded by `open`, which is set true only by the OPEN branch that assigns openDepth two lines later (taskContract.ts:97-101)",
      },
      {
        siteId: "integer-literal:160:19:0>1",
        kind: "equivalent",
        reason:
          "openStart's initial value is dead by the same guarded-by-`open` argument as openDepth: it is assigned in the branch that sets `open`, and read only where `open` is true",
      },
      {
        siteId: "relational-boundary:165:21:<><=",
        kind: "equivalent",
        reason:
          "the extra iteration reads model.lines[i] === undefined; OPEN/END/TASKS_ANY/MARKER_ANY all fail against the coerced string 'undefined'",
      },
      {
        siteId: "statement-removal:215:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falling through reaches MARKER_ANY, which cannot match a '<!-- tasks:' line: after '<!-- task' the next character is 's', not ':'",
      },
      {
        siteId: "integer-literal:225:16:0>1",
        kind: "equivalent",
        reason:
          "a marker-shaped line on document line 1 cannot be fenced (no fence opens before line 1, and a fence-opening line is backticks/tildes so it is never marker-shaped), so it is already in markerLines from pass 1",
      },
      {
        siteId: "relational-boundary:225:21:<><=",
        kind: "equivalent",
        reason: "extra iteration reads undefined; MARKER_ANY.test('undefined') is false",
      },
      {
        siteId: "integer-literal:234:33:1>2",
        kind: "equivalent",
        reason:
          "the EOF-closed region's end: no heading or marker can exist at length+1, so '< length+1' and '< length+2' select identically",
      },
      {
        siteId: "relational-boundary:255:49:>>>=",
        kind: "equivalent",
        reason: "a heading cannot occupy the same line as the '<!-- tasks: depth=N -->' opening",
      },
      {
        siteId: "relational-boundary:255:74:<><=",
        kind: "equivalent",
        reason:
          "a heading cannot occupy the same line as '<!-- tasks: end -->', and for the one region that can be unclosed, region.end is past EOF",
      },
      {
        siteId: "statement-removal:280:11:break;>(removed)",
        kind: "equivalent",
        reason:
          "model.headings is built by one ascending loop (lib/specLint/parse.ts:86, push at :134), so with end = Math.min(end, h.line) the first match is already the minimum and continuing cannot lower it",
      },
      {
        siteId: "relational-boundary:290:40:>>>=",
        kind: "equivalent",
        reason: "a marker line can never equal a heading line",
      },
      {
        siteId: "relational-boundary:290:58:<><=",
        kind: "equivalent",
        reason:
          "an extent's end is either the next heading line or its own region's close; a marker can occupy neither",
      },
      {
        siteId: "statement-removal:329:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          "ms.length === 0 makes the following 'ms.length > 1' false and the for-of over ms empty",
      },
      // The comparator moved out of `checkTaskContract` into the exported
      // `compareFindings` (2026-08-04), so the two `:247:` rows that used to sit
      // here are retired with their sites. Their arguments survive unchanged on
      // the rows below, which now cover the same mutants at the new coordinates
      // — and cover the message tiebreak the old comparator did not have.
      {
        siteId: "integer-literal:408:52:1>2",
        kind: "equivalent",
        reason:
          "Array.prototype.sort observes a comparator result's SIGN, never its magnitude; -1 and -2 are indistinguishable to it",
      },
      {
        siteId: "integer-literal:408:56:1>2",
        kind: "equivalent",
        reason: "same sign-not-magnitude argument: 1 and 2 are indistinguishable to sort",
      },
      {
        siteId: "integer-literal:409:64:1>2",
        kind: "equivalent",
        reason: "same sign-not-magnitude argument, on the message tiebreak",
      },
      {
        siteId: "integer-literal:409:68:1>2",
        kind: "equivalent",
        reason: "same sign-not-magnitude argument, on the message tiebreak",
      },
      {
        siteId: "relational-boundary:408:40:<><=",
        kind: "equivalent",
        reason:
          "the branch is guarded by `a.code !== b.code`, so `<` and `<=` are only ever evaluated on UNEQUAL operands, where they agree. Unlike the old accepted-gap rows this rests on control flow in the function itself, not on V8's sort being stable",
      },
      {
        siteId: "relational-boundary:409:49:<><=",
        kind: "equivalent",
        reason:
          "same guarded-branch argument on the message tiebreak: `a.message !== b.message` has already excluded the only inputs on which `<` and `<=` differ",
      },
      // ---- accepted-gap: none. -----------------------------------------------
      // Two rows lived here until 2026-08-04
      // (BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY). Both described mutants of the
      // old inline comparator that differed from clean ONLY for findings sharing
      // (docLine, code) — a gap that existed precisely because the comparator was
      // partial over that pair, and whose acceptance rested on V8's stable sort
      // rather than on control flow. Adding the message as a third key makes the
      // comparator total, so both mutants are now killable and the rows would be
      // stale debt claiming coverage nobody is missing. The gate reports stale
      // rows, which is why they retire in the same commit as the fix.
    ],
  },
  {
    id: "ledgerClaimsCore",
    sourcePath: "scripts/lib/ledger-claims-core.ts",
    suitePaths: ["tests/scripts/ledgerClaimsCheck.test.ts", "tests/scripts/ledgerClaims.test.ts"],
    operators: [...OPERATOR_NAMES],
    // Measured 60/60 counted (63 mutants, 3 equivalent) on this branch. The
    // floor is a FLOOR, not a snapshot: pinning it at the measured value turns
    // every future line of this module into a gate failure before it has a
    // test, which is how a ratchet becomes a wall.
    scoreFloor: 0.95,
    // Inverting the fetch branch makes `--no-fetch` fetch and stop emitting
    // `no-fetch-cached-refs`, which ledgerClaims.test.ts asserts IN PROCESS.
    control: { from: "if (opts.fetch) {", to: "if (!opts.fetch) {" },
    accepted: [
      // ---- equivalent: cannot change observable behavior (spec §2.4) -------
      //
      // All three are the same argument: `tipOf` is constructed FROM
      // `candidates` (ledger-claims-core.ts:193-195), and every later lookup is
      // keyed on a member of that same array, so no `?? 0` fallback can ever be
      // taken. `candidates.sort` at :198 reorders the array in place; it adds
      // and removes nothing, so the key set the sort and the loop read is the
      // key set the map was built from.
      {
        siteId: "integer-literal:198:46:0>1",
        kind: "equivalent",
        reason:
          "the comparator at ledger-claims-core.ts:198 sorts `candidates`, and `tipOf` was built from `candidates` at :193-195, so `tipOf.get(b)` is always present and the `?? 0` fallback is unreachable",
      },
      {
        siteId: "integer-literal:198:68:0>1",
        kind: "equivalent",
        reason: "same reachability argument for `tipOf.get(a)` in the same comparator",
      },
      {
        siteId: "integer-literal:227:57:0>1",
        kind: "equivalent",
        reason:
          "the age loop at ledger-claims-core.ts:212 iterates the same `candidates` array `tipOf` was built from, so `tipOf.get(ref)` is always present and this `?? 0` is unreachable too",
      },
    ],
  },
  {
    id: "ledgerGit",
    sourcePath: "scripts/lib/ledger-git.ts",
    // The seam suite is registered because the runner executes ONLY registered
    // suites (tests/mutation/source/runner.ts:129, :142) — without this row the
    // spawn-seam assertions would kill nothing.
    suitePaths: [
      "tests/scripts/ledgerClaimsCheck.test.ts",
      "tests/scripts/ledgerGitSpawnSeam.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    // Measured 72/78 counted (84 mutants, 6 equivalent, 6 accepted-gap) on
    // fix/mutation-ledgergit-site-drift, after 229563b76 grew the file by 3
    // mutants and relocated six ledgered sites. Every verdict is
    // environment-INDEPENDENT by construction: each case builds the
    // repository, remote, ref namespace or environment it asserts against, so
    // none of them can read differently on a developer's full clone than in
    // CI's zero-ref checkout (spec AC-6, limit L-6). That claim was measured
    // FALSE 2026-08-08 for the diffHunks count pair (killed locally, survived
    // CI) and re-established by the constructed multi-line hunk case in
    // ledgerClaimsCheck.test.ts (BL-MUTATION-LEDGERGIT-SITE-DRIFT).
    scoreFloor: 0.9,
    // Inverting the origin/HEAD exclusion makes localRefs return ONLY a ref
    // named HEAD, which the constructed-namespace case in the suite notices.
    control: { from: 'if (name === "HEAD") continue;', to: 'if (name !== "HEAD") continue;' },
    accepted: [
      // ---- equivalent: cannot change observable behavior (spec §2.4) -------
      {
        siteId: "logical-connector:142:18:||>&&",
        kind: "equivalent",
        reason:
          "localRefs reads `for-each-ref --format=%(objectname) %(refname)`, which always emits BOTH fields, and a git refname cannot contain whitespace -- so a one-field line, the only input separating `||` from `&&` here, cannot occur. An empty trailing line splits to a single empty string, making oid falsy, so both operators skip it identically. Its lsRemote twin at :105 IS killed, because ls-remote's output is not under the same format guarantee",
      },
      {
        siteId: "logical-connector:66:12:||>&&",
        kind: "equivalent",
        reason:
          "parseRefLine has exactly one caller, lsRemote (ledger-git.ts:104), which feeds it lines of `git ls-remote --heads`; that format is OID TAB REF, so a line either splits into two truthy fields or is the trailing blank one, where both operands are falsy and `||` and `&&` agree. A one-truthy-field line, the only input that separates them, is not producible",
      },
      {
        siteId: "logical-connector:232:32:||>&&",
        kind: "equivalent",
        reason:
          "the only line `git branch -r --format='%(refname:short) %(objectname)'` emits with a missing field is the trailing blank one, where name is `''` and oid is undefined; `&&` declines to skip it, and the very next guard (ledger-git.ts:193) skips it on `name.length === 0` instead. Same outcome, one line later",
      },
      {
        siteId: "integer-literal:259:17:1>2",
        kind: "equivalent",
        reason:
          "`if (m?.[1] && m[2])` guards a regex whose two groups are `([0-9a-f]{40})` and `(.+)`; a match populates both non-empty and a non-match makes `m` null, so testing group 2 twice selects exactly the same lines as testing group 1 then group 2",
      },
      {
        siteId: "statement-removal:320:11:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falling out of the `+++ b/` branch reaches the hunk regex, which is anchored at `^@@ ` and therefore cannot match a line the `^\\+\\+\\+ b/` regex just matched; the `!hm?.[1]` guard below then continues anyway",
      },
      {
        siteId: "logical-connector:365:14:||>&&",
        kind: "equivalent",
        reason:
          "headRepo's three inputs all end at the same answer under `&&`: an unset GITHUB_EVENT_PATH still returns null (existsSync(undefined) is false, not a throw), a set-but-missing path falls through to readFileSync, which throws into the function's own catch and returns null, and a readable path takes the identical branch either way",
      },
      // ---- accepted-gap: killable, but not from CI's checkout ------------
      {
        siteId: "logical-connector:259:20:&&>||",
        kind: "accepted-gap",
        ref: "BL-LEDGERGIT-FILEOIDS-AMBIENT-REF-VERDICT",
        reason:
          "NOT equivalent, and killed locally: the regex has two mandatory groups, so the forms agree whenever `m` is non-null and diverge only when it is NULL, where the mutant evaluates `m[2]` on null and throws. `m` is null on every call, because splitting on a trailing newline always yields an empty final line the regex rejects. PREMISE, which is what makes this a gap rather than a kill: the only reader of this line in either registered suite is ledgerClaimsCheck.test.ts:570, which calls `resolveClaims(realGitSurface(), { fetch: false })` against the AMBIENT checkout, and `fileOids` runs once per `refs/remotes/origin/*` ref. CI checks out with none, so the function never executes there. Measured 2026-08-24 by instrumenting `fileOids` with one variable changed: 14 calls and a kill against the live worktree, 0 calls and a survivor against a constructed zero-ref repo. The other three `realGitSurface()` reads in these suites (:443, :487, and :811 inside `atRepo`) all run under a constructed LEDGER_GIT_ROOT, so :570 is the sole ambient reader and this is the sole site the surface's environment-independence claim fails at. FALSIFIER: give any case a constructed repository carrying one `refs/remotes/origin/*` ref and drive `resolveClaims` through it. One call is enough, and the mutant is then killable in every environment, at which point this row is wrong and must be deleted rather than re-reasoned",
      },
    ],
  },
  /**
   * The destructive-file analyzer (chore/guard-completeness-wave,
   * BL-DESTRUCTIVE-GUARD-EXECUTION-SITE). Pure AST over a source string, DB-free, and
   * its suite is a fixture corpus — exactly the shape the registry can express, and the
   * shape the AGENTS.md enrolment contract asks for BEFORE the first diff-review round.
   *
   * The surface's own history is why it belongs here: every previous round of it was a
   * recognizer argued in prose, and "the guard does not pin what it claims" is precisely
   * the finding class a mutation score plus an empty survivor set settles mechanically.
   */
  {
    id: "destructiveFileAnalysis",
    sourcePath: "tests/db/_destructiveFileAnalysis.ts",
    suitePaths: ["tests/db/destructiveFileAnalysis.test.ts"],
    operators: [...OPERATOR_NAMES],
    // Measured 1.00 (185/185 counted, 7 equivalent excluded) on first enrolment, so the
    // floor is measured-minus-0.05 rather than the 0.8 placeholder the row was authored
    // with: a floor below the shipped state cannot detect a regression toward it.
    scoreFloor: 0.95,
    // Inverting Rule 1's tagged-template leg accepts every unchecked tag, which is what
    // fixtures (ah) and (af) exist to reject.
    control: {
      from: "if (ts.isTaggedTemplateExpression(n) && !checkedTag(n.tag)) {",
      to: "if (ts.isTaggedTemplateExpression(n) && checkedTag(n.tag)) {",
    },
    // First run: 0.82 with 35 unaccepted survivors. Twenty-six were real gaps and are now
    // killed by fixtures (ak)-(bd); one was DEAD CODE the gate proved dead (an explicit
    // catch-clause branch in declarationsOf that forEachChild already covered) and was
    // deleted rather than blessed. These EIGHT are reachability arguments.
    //
    // The count said "seven" until 2026-08-21. dddd7158d wrote it when seven was right;
    // 1d4a715b3 added the eighth row about five hours later and left the prose. Same shape
    // as the two defects this arc repaired -- a hand-written number sitting beside the
    // derived data it describes, drifting the moment the data moves.
    //
    // The first draft of this comment blamed cdac23ae9, and the way it got that wrong is
    // worth keeping. `git log -S "logical-connector:370:61:&&>||"` names cdac23ae9 because
    // that is where the STRING first appears -- but only because cdac23ae9 RE-KEYED the row
    // from 360:61, which 1d4a715b3 had added. A pickaxe over a line-keyed id dates the KEY,
    // not the ROW, so the churn class this file is being repaired for corrupted the
    // archaeology used to repair it. Date a ledger row by the diff that introduced the ROW.
    //
    // RE-KEYED 2026-08-21, by EXPRESSION AND SOURCE LINE, never by offset. fbfc04fdf
    // ("compose EXECUTION_METHODS from the derived core") moved every row: its two hunks
    // are `@@ -56,6 +56,7 @@` and `@@ -534,13 +535,36 @@`, so rows above the second hunk
    // shifted by 1 and the single row below BOTH shifted by 24 (602 -> 626). A uniform
    // shift is the exception, not the rule, and a key written from an assumed offset reads
    // as a fresh stale row rather than as an error -- silent and self-disguising.
    //
    // OPERATOR + COLUMN + MUTATION IS NOT A KEY. It is ambiguous for three of these eight
    // rows (6, 4 and 2 candidate sites respectively): `&&>||` at column 61 alone matches
    // four distinct expressions in this file. The source LINE TEXT is what disambiguates,
    // and with it all eight resolve uniquely, each new line byte-identical to its old one.
    // Enumerated through the shipped enumerator over both trees: 237 sites before, 237
    // after -- the commit changed 30 lines (27 added, 3 removed, net +24) and produced not
    // one new mutation site.
    //
    // RE-KEYING IS NOT RE-VALIDATING, so each premise was re-checked rather than carried:
    // seven of the eight cite code outside both hunks and are untouched by construction
    // (the hunk headers bound what the commit could reach). The eighth, 388:32, is the one
    // that cites EXECUTION_METHODS by name -- exactly the set fbfc04fdf rewrote -- so its
    // premise was PROBED rather than reasoned: the composed set is member-for-member equal
    // to the hand-typed one it replaced (same 10 names, none added, none removed), and
    // `begin`, which that argument turns on, is still in it.
    accepted: [
      {
        siteId: "logical-connector:388:32:&&>||",
        kind: "equivalent",
        reason:
          "`receiver !== null && checked.has(receiver)` decides whether a `.begin` callback parameter is checked. Under `||` a callback of an UNCHECKED receiver would also be checked -- but Rule 1 rejects that `.begin(...)` call itself (`begin` is in EXECUTION_METHODS and the receiver is not a checked client), and the call is an ANCESTOR of the callback body, so the walk reaches it first. Both operators produce the same verdict and the same reason; fixture (aj) is the case",
      },
      {
        siteId: "integer-literal:392:19:0>1",
        kind: "equivalent",
        reason:
          "the checked-set fixpoint's start index. The loop breaks the first time a pass adds nothing, and each growing pass adds at least one name, so at most `candidates.size` passes can grow; starting at 1 still allows `size` iterations, which is enough to resolve any dependency chain over `size` names",
      },
      {
        siteId: "relational-boundary:392:27:<><=",
        kind: "equivalent",
        reason:
          "same loop: `<=` permits one further iteration that the `!grew` break has already made unreachable",
      },
      {
        siteId: "integer-literal:392:47:1>2",
        kind: "equivalent",
        reason:
          "same loop: the bound is `candidates.size + n` for any n >= 1, and the break-on-no-growth condition fires before either bound is reached",
      },
      {
        siteId: "relational-boundary:397:24:>>>=",
        kind: "equivalent",
        reason:
          "`decls.length > 0` guards `every()` returning true vacuously. A candidate name is only ever added from a VariableDeclaration or a Parameter, and declarationsOf collects both, so a candidate with zero declarations cannot occur -- the `>= 0` mutant admits a case the candidate set cannot contain",
      },
      {
        siteId: "logical-connector:503:73:&&>||",
        kind: "equivalent",
        reason:
          "Rule 3's tag test, `isTaggedTemplateExpression(p) && p.tag === n`. Under `||` the second disjunct alone would admit an identifier whose parent is a tagged template but which is NOT its tag -- and a TaggedTemplateExpression's identifier children are the tag and its type arguments only. A type argument is a type, not a value, so no checked CLIENT identifier can occupy that position",
      },
      {
        siteId: "relational-boundary:626:29:>>>=",
        kind: "equivalent",
        reason:
          "`d.node.getStart(sf) > connectPos` is the ordering leg: the guard declaration must precede the connection. `>=` additionally rejects a declaration starting at exactly the connection's offset, which two distinct AST nodes in one file cannot do",
      },
      {
        siteId: "logical-connector:371:61:&&>||",
        kind: "equivalent",
        reason:
          "`walkCandidates`'s parameter leg. `&&` binds tighter, so the mutant reads `(isParameter && isIdentifier) || beginParamReceiver(n) !== null` and every identifier-named parameter joins `candidates`. Candidacy confers nothing on its own: `declQualifies` re-derives `.begin`-ness for a parameter independently (`beginParamReceiver(d.node) !== null && checked.has(receiver)`), so a wider CANDIDATE set cannot widen the CHECKED set, and only the checked set gates execution. The second disjunct admits no node either -- `beginParamReceiver` requires its argument to BE `fn.parameters[0]` of an arrow or function expression, which a non-parameter node never is. Probed against 13 inputs spanning both legs, including a plain parameter used as a client: neither the verdict nor the reason differs. This was the ONLY equivalent one of the twelve unaccepted survivors CI's whole-gate run found; the other eleven were real and are killed by fixtures (br)-(bz)",
      },
    ],
  },
  /**
   * The pg-cron smoke helpers (chore/guard-completeness-wave,
   * BL-PG-CRON-HOST-ASSERTION). Exported pure functions with a DB-free referring suite:
   * the dispatch-origin comparator, the firing-smoke SQL builder, and the two probe
   * parsers. The census that consumes them needs a live database; these do not, which is
   * what makes them expressible here at all.
   */
  {
    id: "pgCronSmokes",
    sourcePath: "tests/cross-cutting/pgCronSmokes.ts",
    suitePaths: ["tests/cross-cutting/pgCronSmokesUnit.test.ts"],
    operators: [...OPERATOR_NAMES],
    // Measured 1.00 (14/14) on first enrolment; floor is measured-minus-0.05.
    scoreFloor: 0.95,
    // Flipping the scheme check accepts http:// in validation mode — the entry's own
    // "worse than none, because it would read as coverage" case.
    control: {
      from: 'if (url.protocol !== "https:") {',
      to: 'if (url.protocol === "https:") {',
    },
    accepted: [],
  },
  /**
   * The claim sweep (`BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`), enrolled
   * 2026-08-20 BEFORE the first diff dispatch, because its defect class is
   * exactly "reports OK while the output moved".
   *
   * `suitePaths` is DERIVED, not typed: every `tests/specLint/claimSweep*.test.ts`.
   * The derivation is asserted in BOTH directions by
   * `tests/mutation/_metaClaimSweepSuiteDerivation.test.ts` — the list EQUALS
   * the glob (containment either way alone passes a phantom path or a dropped
   * suite), and no file that imports the module directly sits outside the glob —
   * so a suite added under either rule fails rather than silently buying zero
   * score. That check is named outside the glob deliberately: it would otherwise
   * match its own rule and have to enrol itself, and it decides nothing about
   * the module. This sentence cited `claimSweepIdentity.test.ts` for one commit
   * and that file asserts no such thing — a guard docstring claiming a check
   * that did not exist, which is this arc's own defect class landing on the
   * arc. Eight further suites reach the module TRANSITIVELY through
   * `run.ts`/`spec-lint.ts` and are deliberately absent: they never declare a
   * repair, so they decide nothing about this surface and would buy wall clock
   * at no score. That is a declared choice, not an oversight.
   */
  {
    id: "claimSweep",
    sourcePath: "lib/specLint/claimSweep.ts",
    suitePaths: [
      "tests/specLint/claimSweepNumeric.test.ts",
      "tests/specLint/claimSweepNamed.test.ts",
      "tests/specLint/claimSweepNotFound.test.ts",
      "tests/specLint/claimSweepDocumentSet.test.ts",
      "tests/specLint/claimSweepIdentity.test.ts",
      "tests/specLint/claimSweepRefusals.test.ts",
      "tests/specLint/claimSweepCli.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // Inverts the whole numeric discriminator: with the co-occurrence test
    // flipped, a transition sentence naming BOTH values reports and a stale
    // claim naming only the superseded one is suppressed. The incident replay
    // asserts both directions as a SET (nine survivors, three excluded), so the
    // suite cannot miss it. Verified unique on the current source:
    // `grep -c -F 'if (carries(sentence, replacement, NUMERIC_BOUNDARY)) continue;'` = 1.
    control: {
      from: "if (carries(sentence, replacement, NUMERIC_BOUNDARY)) continue;",
      to: "if (!carries(sentence, replacement, NUMERIC_BOUNDARY)) continue;",
    },
    /**
     * SEVEN rows under THREE derived covers, not seven independent stories.
     *
     * PROPERTY (d) CANNOT BE MET AND IS NOT CLAIMED. These arguments were
     * composed AFTER the discovery run named the survivors, so each is written
     * as a PREDICTION with a falsifier rather than as a proof that was on
     * record first: if the confirming run KILLS any site below, that row's
     * argument is wrong and the row comes out. Reconciliation reports a killed
     * accepted site as STALE, so the run adjudicates this without anyone
     * remembering to check.
     *
     * RE-KEYED ONCE, by EXPRESSION and not by line, when §5 gained limit 11 and
     * the numeric finding's detail gained the completion-not-deletion remedy
     * (264/283 -> 293/312, and 391/499 -> 424/532). The first five moved by the
     * 29 lines the header limit added; the last two by 33, the header plus the
     * detail's extra lines. Every mutated expression and its 1-based COLUMN is
     * byte-identical at both keys, which is what makes this a re-key rather than
     * a new acceptance -- and the gate proved it in both directions, reporting
     * exactly seven stale rows and exactly seven new survivors with no others.
     * Measured cost of this one edit: two full gate runs. This is the case
     * `BL-MUTATION-SITEID-LINE-KEYED-CHURN` exists for.
     *
     * Rungs 1-3 were refused for each, with the reason stated per cover. Every
     * repair for this surface landed in the SUITES, never in the source: the
     * eighteen other survivors of the discovery run were killed with cases, and
     * `lib/specLint/claimSweep.ts` is byte-identical across the two runs. That
     * is the direction evidence rule 26 asks for -- no site was made
     * unrepresentable, because no site moved.
     */
    accepted: [
      // ---- COVER A: the loop ceiling is UNREACHABLE ------------------------
      //
      // ONE invariant, five rows. Both scanning loops carry a counter whose
      // ceiling is EXTERNAL to the predicate, exactly so that no mutant can lift
      // it into a hang -- the plan's own totalisation rule. The loops exit on
      // their OWN condition (`re.exec` returning null, `indexOf` returning -1),
      // and the iteration that does so pushes nothing: its whole body is the
      // break. So for `k` items found, `k + 1` iterations are consumed and any
      // ceiling `>= k` produces byte-identical output.
      //
      // The bound that closes it: `k <= line.length` for BOTH loops.
      // `boundedOccurrences` advances `from` by one per success, so `k` is at
      // most one success per offset, `k <= L`. `sentenceSpans` matches `\s+`
      // preceded by one of `.;:`; the punctuation is not part of the match and
      // precedes at most one match, so each match accounts for two distinct
      // offsets and `k <= floor(L / 2)`.
      //
      // Every mutated ceiling below is `>= k` for every input, so none can
      // change the output. Rung 1 (delete) and rung 2 (totalise) are BOTH
      // refused for the same reason and it is not tidiness: deleting the guard
      // or folding termination into the predicate is precisely the reshaping
      // that converts a visible survivor into a HANG, and a hang scores as a
      // KILL. Rung 3 (kill with a case) is refused because no input can reach
      // the ceiling -- a case that killed one of these would falsify the bound
      // above, which is what makes these rows testable rather than merely
      // argued.
      //
      // WHAT VOIDS ALL FIVE AT ONCE: either loop losing its own exit (the
      // `break`), the final iteration gaining a side effect, or a ceiling
      // written in terms of anything other than `line.length`.
      {
        siteId: "integer-literal:293:20:0>1",
        kind: "equivalent",
        reason:
          "`sentenceSpans`' guard initialiser. Starting at 1 costs the loop its LAST available " +
          "iteration, and the last iteration is the one that only breaks: matches k <= floor(L/2) " +
          "< L for every line, so L iterations still find all k. Cover A.",
      },
      {
        siteId: "relational-boundary:293:29:<=><",
        kind: "equivalent",
        reason:
          "`sentenceSpans`' guard ceiling, L+1 iterations to L. Same bound as the row above: " +
          "k <= floor(L/2), so L iterations are never fewer than the k+1 the loop consumes, and " +
          "the empty line (L=0, k=0, zero iterations either way) reaches the trailing push " +
          "identically. Cover A.",
      },
      {
        siteId: "integer-literal:293:54:1>2",
        kind: "equivalent",
        reason:
          "`sentenceSpans`' guard step, halving the ceiling to floor(L/2)+1 iterations. This is " +
          "the tight case of cover A and the reason the bound is stated as floor(L/2) rather than " +
          "L: SENTENCE_BREAK is `(?<=[.;:])\\s+`, each match consumes at least one whitespace " +
          "character and is preceded by a punctuation character that belongs to no match, so " +
          "2k <= L. floor(L/2)+1 >= k+1 holds with no slack, and a fixture denser than `. . .` " +
          "does not exist. Cover A.",
      },
      {
        siteId: "integer-literal:312:20:0>1",
        kind: "equivalent",
        reason:
          "`boundedOccurrences`' guard initialiser, L+1 iterations to L. `from` advances by one " +
          "per success so k <= L; the dropped iteration is the failing `indexOf` that only " +
          'breaks. Measured at the tight end: `boundedOccurrences("aaa", "a", /[0-9]/)` has ' +
          "k = L = 3 and returns [0,1,2] under both the original and this mutant. Cover A.",
      },
      {
        siteId: "relational-boundary:312:29:<=><",
        kind: "equivalent",
        reason:
          "`boundedOccurrences`' guard ceiling, the same L+1 to L as the row above and killed or " +
          "spared by the same input. Cover A.",
      },
      // ---- COVER B: a counter whose ONLY consumer is a zero test -----------
      {
        siteId: "integer-literal:424:29:1>2",
        kind: "equivalent",
        reason:
          "`exactOccurrences += 1` in `namedHalf`. The counter has exactly one reader, " +
          "`if (exactOccurrences === 0)` at the foot of the same function, and no other " +
          "expression in the module names it (`rg -n exactOccurrences lib/specLint/claimSweep.ts` " +
          "= 3 hits: the declaration, this increment, the zero test). Any strictly positive step " +
          "gives the same answer to `=== 0`, so 2k and k are indistinguishable at the only place " +
          "the value is observed. Rung 1 (delete the site) is REFUSED deliberately: replacing the " +
          "counter with a boolean would remove the mutation site by reshaping the source, which " +
          "is rule 26 exactly. VOIDED BY: any second reader of `exactOccurrences` -- a count in a " +
          "message, a threshold, a comparison against the reported list -- at which point this " +
          "row must come out and the site must be killed with a case.",
      },
      // ---- COVER C: two recognisers anchored on DISJOINT prefixes ----------
      {
        siteId: "statement-removal:532:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          "The `continue` after a `+++ b/<path>` header in `parseRepairSpans`. Removing it lets " +
          "the header line fall through to the hunk recogniser, which is `/^@@ -\\d+.../` -- " +
          "anchored on a prefix that `+++ b/` cannot also carry, so the match is null and the " +
          "very next line is `if (hunk === null || current === null) continue;`. The fall-through " +
          "path IS a continue, reached one statement later with nothing in between. Rung 3 is " +
          "refused because no diff line can match both anchors, which is the same fact the " +
          "argument rests on. VOIDED BY: either recogniser losing its `^` anchor, or any " +
          "statement appearing between the two.",
      },
    ],
  },
  /**
   * The review-round economy gate's two sources, enrolled as TWO rows because
   * `sourcePath` is singular and the harness mutates exactly that file. A single
   * row naming count.ts would leave every structural decision in corpus.ts
   * outside the mutant set while the gate still announced a score and an empty
   * unaccepted-survivor set over it — `if (n < ROUND_THRESHOLD) continue;` in
   * `checkCorpus` is the named site, whose `<=` mutant suppresses the filing
   * duty at exactly the threshold.
   *
   * They share tests/docs/_metaReviewRoundEconomy.test.ts: count.ts is reached
   * through `checkCorpus` as well as directly, and a mutant is KILLED if ANY
   * listed suite goes red.
   */
  {
    id: "reviewRoundCount",
    sourcePath: "lib/reviewRounds/count.ts",
    suitePaths: ["tests/reviewRounds/count.test.ts", "tests/docs/_metaReviewRoundEconomy.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 1,
    // Inverts the counting rule's status conjunct, so an infra fault counts as
    // a round.
    control: { from: 'r.status === "verdict"', to: 'r.status !== "verdict"' },
    accepted: [],
  },
  {
    id: "specLintNumerics",
    sourcePath: "lib/specLint/numerics.ts",
    suitePaths: ["tests/specLint/numerics.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Inverts the nearest-predecessor scan in qualifierBoundStarts, so a dated
    // qualifier binds a number that FOLLOWS it instead of the one before it. The
    // SYNTHETIC mixed-line pair asserts both directions of that binding, so the
    // suite cannot miss this.
    control: { from: "if (n.end > q.index) continue;", to: "if (n.end < q.index) continue;" },
    accepted: [
      // ---- equivalent: cannot change observable behavior (spec §2.4) -------
      //
      // Three families, and each argument rests on control flow or on the accept-set
      // in this file rather than on "no test happens to notice".
      //
      // FAMILY 1 — redundant `lastIndex` resets. Every `while ((m = RE.exec(x)) !== null)`
      // loop in this module runs to exhaustion, and `exec` sets `lastIndex` back to 0 when
      // it returns null. So on entry the regex's `lastIndex` is ALREADY 0 and the explicit
      // assignment cannot change what the next scan sees. The paired `0 > 1` mutants of the
      // same assignments are NOT here: starting a scan at index 1 skips a match at index 0,
      // which is observable, and each is killed by a column-0 fixture.
      {
        siteId: "statement-removal:23:5:re.lastIndex = 0;>(removed)",
        kind: "equivalent",
        reason:
          "rangesOn's exec loop runs to exhaustion, and exec resets lastIndex to 0 on the null result, so the assignment is redundant on entry",
      },
      {
        siteId: "statement-removal:151:3:QUANTITY_RE.lastIndex = 0;>(removed)",
        kind: "equivalent",
        reason: "same exhaustion argument, in quantityRanges",
      },
      {
        siteId: "statement-removal:169:3:DATED_QUALIFIER_RE.lastIndex = 0;>(removed)",
        kind: "equivalent",
        reason: "same exhaustion argument, in qualifierBoundStarts",
      },
      {
        siteId: "statement-removal:729:3:CARDINAL_RE.lastIndex = 0;>(removed)",
        kind: "equivalent",
        reason: "same exhaustion argument, in cardinalsOn",
      },
      {
        siteId: "statement-removal:981:5:DIGIT_SEQ_RE.lastIndex = 0;>(removed)",
        kind: "equivalent",
        reason: "same exhaustion argument, in templateCandidates",
      },
      {
        siteId: "statement-removal:1037:5:LEXICON.lastIndex = 0;>(removed)",
        kind: "equivalent",
        reason: "same exhaustion argument, in the hit scan",
      },
      // FAMILY 2 — inputs the accept-set cannot produce.
      {
        siteId: "integer-literal:169:34:0>1",
        kind: "equivalent",
        reason:
          "starting the qualifier scan at index 1 can only skip a qualifier at index 0, and a qualifier at index 0 has no preceding number to bind (every number range ends at >= 1), so the bound set is identical",
      },
      {
        siteId: "relational-boundary:30:87:<><=",
        kind: "equivalent",
        reason:
          "i === r.end is unreachable: for a span range, end is the closing backtick's position, which cannot start a numeric match; for an exclusion range, end sits immediately after a digit or hex character, so no \\b-anchored match can begin there",
      },
      {
        siteId: "integer-literal:69:10:50>51",
        kind: "equivalent",
        reason:
          "fifty's value is read only through the 2..40 claim-range gate, which rejects 50 and 51 alike, so nothing downstream ever sees it. forty's twin IS killed, because 41 crosses that gate",
      },
      {
        siteId: "integer-literal:154:49:0>1",
        kind: "equivalent",
        reason:
          "QUANTITY_RE is `\\b(...)\\b`, so capture group 1 spans the whole match: m[1] === m[0]",
      },
      {
        siteId: "relational-boundary:174:17:>>>=",
        kind: "equivalent",
        reason:
          "n.end === q.index needs the qualifier to begin at the character immediately after a digit, but the qualifier is \\bat…, and a digit-to-letter transition is not a word boundary",
      },
      {
        siteId: "relational-boundary:175:37:>>>=",
        kind: "equivalent",
        reason: "two matches from one global scan cannot share an end offset, so > and >= agree",
      },
      {
        siteId: "integer-literal:677:28:1>2",
        kind: "equivalent",
        reason:
          "with a slash, slash >= 0 so both -1 and -2 are false and the else branch runs; without one, slice(-1 + 1) is slice(0), so forms becomes [path, path] and the alternation is unchanged",
      },
      {
        siteId: "statement-removal:470:7:inWord = false;>(removed)",
        kind: "equivalent",
        reason:
          "the same branch has already set lastWord to the empty string, so a next identifier character appends to nothing and produces exactly the word a fresh start would; whitespace clears inWord on its own path",
      },
      {
        siteId: "integer-literal:583:23:0>1",
        kind: "equivalent",
        reason:
          "a frame count of exactly one means the single open frame is a TEMPLATE, and a template frame is left only by its closing backtick or by pushing an interpolation, so the state at that point is `template` and the following return already yields null; the two conditions can never disagree",
      },
      {
        siteId: "statement-removal:573:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          'falls through to the string-escape test (c is `$`, not a backslash) and then to `closers[c] === state`, and `closers["$"]` is undefined, which is not a scan state',
      },
      {
        siteId: "statement-removal:578:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          'the state is already `code` when it falls through, and the only remaining test is `closers["`"] === state`, which compares `template` against `code`',
      },
      {
        siteId: "statement-removal:504:9:inClass = false;>(removed)",
        kind: "equivalent",
        reason:
          "already false on every path that reaches it: the regex state is entered only from code, and it is left only by the branch that requires !inClass -- a regex still inside a character class at the newline or at end of input returns null instead",
      },
      {
        siteId: "statement-removal:549:9:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falls through to the delimiter tests with c === backslash, which is neither `[` nor `]` nor `/`, so every branch is skipped and the next statement is the continue at the end of the same block",
      },
      {
        siteId: "statement-removal:557:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          'falls through to the string-escape test (c is not a backslash; that case returned above) and then to `closers[c] === state`, which no regex-state character can satisfy: the closer map\'s values are single, double and template, never regex, and on the closing slash the state is already code and `closers["/"]` is undefined',
      },
      {
        siteId: "statement-removal:566:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          'the only statement after it is the closer check, and a backslash can never be a closer: `closers["\\\\"]` is undefined, which equals no scan state, so falling through changes nothing',
      },
      {
        siteId: "integer-literal:1098:30:1>2",
        kind: "equivalent",
        reason:
          "column - 2 tests the character BEFORE the hit, and it lands in a comma-joined run exactly when the hit itself does. Inside a run, only a non-FIRST group can be noun-followed (the first is always followed by the comma), so such a hit starts at least two characters past the run's start and its predecessor is still inside. Outside every run, a run's own end is a non-digit (the pattern closes on \\b), so a digit hit begins at least one character past it and the predecessor index equals the exclusive end -- outside either way",
      },
      {
        siteId: "integer-literal:824:30:0>1",
        kind: "equivalent",
        reason:
          "unreachable: both call sites pass a line index BULLET_RE has already matched, so `first` is never null",
      },

      {
        siteId: "relational-boundary:1029:25:<><=",
        kind: "equivalent",
        reason:
          "the extra iteration reads model.lines[idx] === undefined, which every consumer coerces to the string 'undefined': it holds no digit, so the hit scan produces nothing",
      },
      {
        siteId: "relational-boundary:1135:25:<><=",
        kind: "equivalent",
        reason:
          "same one-past-the-end argument in the shape (b) pass: 'undefined' carries no digit and no number-word, so cardinalsOn returns an empty list and the iteration continues",
      },
      {
        siteId: "relational-boundary:1187:21:<><=",
        kind: "equivalent",
        reason:
          "the extra outer index makes the inner loop's `j = i + 1 < candidates.length` false immediately, so no pair is formed",
      },
      // FAMILY 3 — offsets and orderings that cannot move an outcome.
      {
        siteId: "integer-literal:1035:40:1>2",
        kind: "equivalent",
        reason:
          "the span range's START: the character before a span's content is its opening backtick, which cannot be a digit, so widening the range leftward admits nothing. Its END twin IS killed, by a fixture whose digit is the span's last character",
      },
      {
        siteId: "integer-literal:1143:40:1>2",
        kind: "equivalent",
        reason: "same opening-backtick argument for the shape (b) span ranges",
      },
      {
        siteId: "integer-literal:1143:59:1>2",
        kind: "equivalent",
        reason:
          "the shape (b) span range's END: a cardinal is recognized only when followed by whitespace, and the character after a span's last content character is the closing backtick, so a cardinal ending at the boundary is rejected whether or not the range covered it",
      },
      {
        siteId:
          "statement-removal:1068:3:mismatches.sort((a, b) => a.first.docLine - b.first.docLine || a.first.column - b.first.column);>(removed)",
        kind: "equivalent",
        reason:
          "mismatches is built by iterating a Map whose insertion order is first-hit order, which is document order already, so the sort reorders nothing. Its comparator's `||` mutant IS killed, because an inconsistent comparator can still swap an already-ordered pair",
      },
      {
        siteId: "relational-boundary:1091:49:>>>=",
        kind: "equivalent",
        reason: "an entry with zero constants contributes an empty inner loop either way",
      },
      {
        siteId: "statement-removal:1104:9:boundCache.set(h.docLine, bound);>(removed)",
        kind: "equivalent",
        reason:
          "memoization only: without the write, qualifierBoundStarts is recomputed for the same line and returns the same set",
      },
      {
        siteId: "integer-literal:1153:20:1>2",
        kind: "equivalent",
        reason: "the listIdx < 0 guard rejects -1 and -2 alike",
      },
      {
        siteId: "relational-boundary:1160:17:<><=",
        kind: "equivalent",
        reason: "a resolved listIdx is always >= 1, so < 0 and <= 0 select identically",
      },
      {
        siteId: "integer-literal:1160:19:0>1",
        kind: "equivalent",
        reason: "same argument: listIdx is either -1 or >= 1, so < 0 and < 1 select identically",
      },
      {
        siteId: "statement-removal:925:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falling through calls countListItems(model, -1, …), which reads undefined, fails BULLET_RE against the coerced 'undefined' and returns 0 — which the very next guard rejects anyway",
      },
      {
        siteId: "integer-literal:1002:24:0>1",
        kind: "equivalent",
        reason:
          "the union === 0 branch is unreachable: a candidate must contain a digit, so its token set is never empty",
      },
      {
        siteId: "integer-literal:747:22:0>1",
        kind: "equivalent",
        reason:
          "the fallback head is read only when NO word in the window is plural, so isPluralWord drops the claim either way (words[1] may be undefined, which .test coerces to 'undefined' and rejects)",
      },
      {
        siteId: "relational-boundary:748:38:>=>>",
        kind: "equivalent",
        reason:
          "skipping k === 0 matters only when words[0] is the sole plural word, and the fallback head IS words[0], so the selected head is identical",
      },
      {
        siteId: "integer-literal:748:41:0>1",
        kind: "equivalent",
        reason: "same argument as the loop bound beside it",
      },
      {
        siteId: "relational-boundary:755:74:<=><",
        kind: "equivalent",
        reason:
          "m.index === markerEnd needs a cardinal at the character immediately after a list marker, and BULLET_RE requires whitespace there",
      },
      {
        siteId: "relational-boundary:1220:61:<><=",
        kind: "equivalent",
        reason:
          "the inventory comparator's raws are Map keys and therefore distinct, so the equal-operand input that separates < from <= cannot occur",
      },
      {
        siteId: "integer-literal:1220:72:1>2",
        kind: "equivalent",
        reason: "Array.prototype.sort reads a comparator result's SIGN, never its magnitude",
      },
      {
        siteId: "relational-boundary:1220:82:>>>=",
        kind: "equivalent",
        reason: "same distinct-keys argument as its sibling comparison",
      },
      {
        siteId: "integer-literal:1220:92:1>2",
        kind: "equivalent",
        reason: "same sign-not-magnitude argument",
      },
      {
        siteId: "integer-literal:1220:96:0>1",
        kind: "equivalent",
        reason:
          "the final tiebreak is reached only when two raws are equal, which distinct Map keys make impossible",
      },
      {
        siteId: "integer-literal:852:16:0>1",
        kind: "equivalent",
        reason:
          "blanks' initial value is dead: the loop starts AT the first bullet, whose branch assigns blanks = 0 before any blank line can be seen",
      },
      {
        siteId: "statement-removal:888:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falling through reaches the leading-whitespace branch, which continues on the same lines for the same reason",
      },
      {
        siteId: "integer-literal:1140:97:1>2",
        kind: "equivalent",
        reason:
          "markerEnd's non-bullet sentinel: `m.index <= -1` and `m.index <= -2` are both false for every real index",
      },
      {
        siteId: "relational-boundary:991:33:>>>=",
        kind: "equivalent",
        reason:
          'the empty-token filter can never drop anything: the tokenizer replaces every RUN of non-alphanumerics with ONE space and then trims, so split(" ") cannot yield an empty string',
      },
      // ---- accepted-gap: none. Every survivor above carries a reachability or
      // control-flow argument, so this surface blesses no uncovered behaviour.
    ],
  },
  {
    id: "specLintUniversals",
    sourcePath: "lib/specLint/universals.ts",
    suitePaths: [
      "tests/specLint/universals.test.ts",
      "tests/specLint/universalsInventory.test.ts",
      "tests/specLint/universalsMutantKills.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.94,
    // Inverts arm A's value bound, so the accept-set admits 0 and 1 and rejects
    // every real population. Both directions are asserted: the "all 0" fixture
    // reds because a below-bound value now emits, and the E1 retro-fixture reds
    // because a 21-row population no longer does.
    control: {
      from: "if (Number(cardinal) < MIN_CARDINAL_VALUE) continue;",
      to: "if (Number(cardinal) > MIN_CARDINAL_VALUE) continue;",
    },
    accepted: [
      // ---- equivalent: cannot change observable behavior (spec §2.4) -------
      //
      // The first scored run left 41 survivors at 0.6306. Thirty-five were REPAID with
      // cases in the deciding suites (`universalsMutantKills.test.ts`), not accepted.
      // The six below are the ones with an argument that rests on control flow or on
      // the accept-set rather than on "no test happens to notice".
      //
      // FAMILY 1 — widths no lookup can reach. Gate 4's index is keyed by the CLAIM's
      // cardinal, and the claim regex admits 1-3 digits only, so a token of 4 or 5
      // digits can never equal a lookup key. Widening the indexer's own bound adds keys
      // nothing asks for. The paired NARROWING is not here: {1,3} would drop the 4-digit
      // tokens the record's own rows depend on being absent, which is observable.
      {
        siteId: "regex-quantifier-bound:48:29:{1,4}>{1,5}",
        kind: "equivalent",
        reason:
          "CARDINAL_TOKEN only ever indexes keys that UNIVERSAL_CARDINAL's 1-3 digit capture can look up, so a wider token bound adds unreachable keys",
      },
      // FAMILY 2 — a span-start shift the match can never sit in. `s.column` is the
      // 1-based offset of the span's CONTENT, so the character one before it is the
      // opening backtick. Widening the range's start by one admits only matchStart ===
      // r.start - 1, and a match must begin with `every`/`each`/`all` — never a
      // backtick — so the widened cell is unreachable. The paired `- 1 > - 0` mutant is
      // NOT here: it narrows the span and lets a claim at the span's first character
      // escape the exclusion, which the boundary case in universalsMutantKills kills.
      {
        siteId: "integer-literal:91:35:1>2",
        kind: "equivalent",
        reason:
          "shifting a span's start one character left admits only a match beginning on the opening backtick, which the quantifier accept-set makes impossible",
      },
      // FAMILY 3 — one-past-the-end loop bounds. Both scans index `model.lines[i]` at
      // `i === length`, which is `undefined`; every guard on that iteration coerces to
      // the string "undefined", which carries no leading pipe, no ISO date, no
      // quantifier and no digits, so the iteration contributes nothing and cannot
      // throw. The paired `0 > 1` start mutants ARE observable — they skip line 1 — and
      // both are killed by first-line fixtures rather than accepted.
      {
        siteId: "relational-boundary:154:21:<><=",
        kind: "equivalent",
        reason:
          "the extra iteration reads undefined, and every guard in the evidence scan coerces it to a string with no pipe, date, quantifier or digit",
      },
      {
        siteId: "relational-boundary:171:21:<><=",
        kind: "equivalent",
        reason: "same one-past-the-end argument, in the advisory scan",
      },
      // FAMILY 4 — a redundant lastIndex reset, and the argument turns on EXHAUSTION
      // rather than on the assignment looking redundant. The evidence loop runs
      // `while ((m = CARDINAL_TOKEN.exec(line)) !== null)` with no early exit, and
      // `exec` sets `lastIndex` back to 0 when it returns null, so on entry it is
      // ALREADY 0. Its SIBLING is the counter-example that proves the argument is doing
      // real work: the advisory scan's `UNIVERSAL_CARDINAL.lastIndex = 0` looks
      // identical and is NOT equivalent, because that loop BREAKS on the first
      // qualifying candidate and so leaves `lastIndex` mid-line, where it would leak
      // into the next line and hide any claim before that offset. That mutant is killed
      // by a case in universalsMutantKills, not accepted. The paired `0 > 1` mutant here
      // is likewise NOT accepted: starting at index 1 skips a cardinal at the line
      // start, and the line-start evidence fixture kills it.
      {
        siteId: "statement-removal:158:5:CARDINAL_TOKEN.lastIndex = 0;>(removed)",
        kind: "equivalent",
        reason:
          "the evidence loop runs to exhaustion and exec resets lastIndex to 0 on the null result, so the assignment is redundant on entry",
      },
      // FAMILY 5 — an initial value read only after it is overwritten. `regionDepth` is
      // guarded by `inRegion`, which starts false, and the only path that sets
      // `inRegion = true` assigns `regionDepth` in the same block. So no read of the
      // initial value can reach the comparison.
      {
        siteId: "integer-literal:256:21:0>1",
        kind: "equivalent",
        reason:
          "regionDepth is read only under inRegion, which is false until the same block that assigns regionDepth sets it",
      },
    ],
  },
  {
    id: "reviewRoundCorpus",
    sourcePath: "lib/reviewRounds/corpus.ts",
    suitePaths: ["tests/docs/_metaReviewRoundEconomy.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 1,
    // The threshold comparison, which off by one suppresses the filing duty at
    // exactly the threshold.
    control: {
      from: "if (n < ROUND_THRESHOLD) continue;",
      to: "if (n <= ROUND_THRESHOLD) continue;",
    },
    accepted: [
      // ---- equivalent: cannot change observable behavior (spec §2.4) -------
      {
        // Line-keyed siteIds re-derived after the enforcement-pair arc's edits
        // shifted corpus.ts by two lines (an import and a ProblemKind member).
        siteId: "statement-removal:79:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falling through after the recursive walk reaches `if (!entry.isFile()) continue;` on the very next line (corpus.ts:81), and a Dirent for a directory returns false from isFile(), so neither push below it can be reached",
      },
      {
        siteId: "relational-boundary:146:25:<><=",
        kind: "equivalent",
        reason:
          'the extra iteration reads lines[i] === undefined, which `?? ""` turns into the empty string, and the blank-line skip at corpus.ts:148 continues before parseRow sees it',
      },
    ],
  },
  {
    // Enrolled by the enforcement-pair arc (its spec §6.3, dogfood): enrolment
    // precedes this surface's own round-1 diff review, and the run's score
    // feeds the brief's GUARD SURFACE: line that the new codex-guard dispatch
    // gate checks.
    id: "reviewRoundFiling",
    sourcePath: "lib/reviewRounds/filing.ts",
    suitePaths: ["tests/reviewRounds/filing.test.ts", "tests/docs/_metaReviewRoundEconomy.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 1,
    // Inverts the none decision: every non-none Mechanizable entry reads as
    // none, so the parity duty never fires anywhere.
    control: {
      from: "const isNone = /^none\\b/i.test(remainder);",
      to: "const isNone = !/^none\\b/i.test(remainder);",
    },
    accepted: [
      // ---- equivalent: cannot change observable behavior ------------------
      // Re-derived after the diff R1/R2 repairs reshaped the walkers: label
      // collection is PARAGRAPH-scoped (line-opening strong children), and
      // fieldName/beginsWithDecline fire only on paragraph nodes - so every
      // guard flip below descends into subtrees those recognizers are inert
      // over. Site ids re-keyed to the post-repair lines.
      {
        siteId: "logical-connector:69:28:||>&&",
        kind: "equivalent",
        reason:
          'visibleText\'s code/html guard: both node types are mdast LITERALS (a value, no children), so they fail every typed branch below and land on the final `return ""` either way',
      },
      {
        siteId: "logical-connector:117:30:||>&&",
        kind: "equivalent",
        reason:
          "renderedFieldLabels' inner flip leaves `|| delete` intact; only code/html stop being skipped, and both are childless literals that are not paragraphs, so the paragraph-scoped collector extracts nothing",
      },
      {
        siteId: "logical-connector:117:54:||>&&",
        kind: "equivalent",
        reason:
          "the outer flip lets `delete` descend, but its children are phrasing nodes and collection happens only under a `paragraph` branch - a struck label is skipped as a non-strong paragraph CHILD before the guard is ever consulted (pinned by the struck-label test)",
      },
      {
        siteId: "logical-connector:149:30:||>&&",
        kind: "equivalent",
        reason:
          "hasNestedMechanizable's inner flip: code/html are childless literals and fieldName answers null for every non-paragraph node, so descending finds nothing",
      },
      {
        siteId: "logical-connector:149:54:||>&&",
        kind: "equivalent",
        reason:
          "the outer flip lets `delete` descend; a delete's children are phrasing nodes, never paragraphs, so fieldName stays null throughout",
      },
      {
        siteId: "logical-connector:166:30:||>&&",
        kind: "equivalent",
        reason:
          "declinesAnywhere's inner flip: code/html are childless literals and beginsWithDecline answers false for every non-paragraph node",
      },
      {
        siteId: "logical-connector:166:54:||>&&",
        kind: "equivalent",
        reason:
          "the outer flip lets `delete` descend; its phrasing children are never paragraphs, so beginsWithDecline stays false throughout - the struck-decline fixtures stay green",
      },
      {
        siteId: "statement-removal:258:5:current = null;>(removed)",
        kind: "equivalent",
        reason:
          "both heading branches reassign `current` immediately after their close() call, and after the final close() nothing reads it - the null is hygiene against a future reader, not reachable state",
      },
    ],
  },
  {
    id: "phantomGapExecuted",
    // A `.mjs` module, unlike every row above it: the phantom-gap job's diagram
    // step needs a plain-node CLI, so the logic ships as ESM the wrapper can
    // import without a transpile step.
    //
    // The DECISIONS live here and the CLI lives in
    // scripts/check-phantom-gap-executed.mjs, which this row deliberately does
    // NOT name. The repo's sibling oracle (scripts/check-crew-e2e-executed.mjs)
    // is one file — exported table plus an `import.meta.url === argv[1]` main
    // block — and that shape is un-enrollable, measured rather than argued:
    // enrolled whole, this surface scored 0.27 with 18 of its 19 survivors
    // inside the main block, because a referring suite imports the module and
    // never runs that block, so those mutants are unreachable by construction.
    sourcePath: "scripts/lib/phantomGapExecuted.mjs",
    suitePaths: ["tests/ci/phantomGapExecuted.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 1,
    // The executed-vs-skipped predicate: inverted, a skipped case counts as
    // executed and the entire oracle reports green on a dark step.
    control: { from: 'result.status === "passed"', to: 'result.status === "skipped"' },
    accepted: [],
  },
  /**
   * M-wave 2 W-GUARDS (2026-08-10): both guard extractors enrolled BEFORE
   * their first review dispatch, per the AGENTS.md convergence rule — the
   * defect class is exactly "reports OK while the output moved", and the
   * round-1 brief states the score plus the unaccepted-survivor set as the
   * convergence criterion.
   */
  {
    id: "popoverOverlayExtract",
    sourcePath: "tests/components/admin/showpage/_popoverOverlayExtract.ts",
    suitePaths: ["tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Demands edge-anchoring even of self-scrolling overlays, so HoverHelp's
    // runtime-anchored popover (and the whole match table's self-scroller rows)
    // stops being detected.
    control: {
      from: "signals.selfScrolls || (signals.edgeAnchored",
      to: "signals.selfScrolls && (signals.edgeAnchored",
    },
    accepted: [
      // ---- equivalent: cannot change observable behavior -------------------
      {
        siteId: "logical-connector:109:42:&&>||",
        kind: "equivalent",
        reason:
          "the flipped guard admits interpolations that are not const-resolving identifiers, where `consts.get` misses and the template text gains the literal token `undefined` instead of a bare separator; no accept-set token contains `undefined`, so no classification signal can flip in either direction",
      },
      {
        siteId: "statement-removal:185:11:continue;>(removed)",
        kind: "equivalent",
        reason:
          "the null-key unreadable mark on the line above has already happened; falling through reaches only the key === comparisons (position/top/bottom/overflowY/overflow), none of which can match a null key, so no signal changes",
      },
    ],
  },
  {
    id: "renderedTextHaystack",
    sourcePath: "tests/help/_renderedTextHaystack.ts",
    suitePaths: ["tests/help/_metaUiLabelCrosswalk.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Silences the user-visible attribute channel, so aria-label/placeholder
    // copy stops reaching the haystack and the positive premise fixture fails.
    control: {
      from: "if (USER_VISIBLE_ATTRS.has(name)) attrText(attr, out);",
      to: "if (!USER_VISIBLE_ATTRS.has(name)) attrText(attr, out);",
    },
    accepted: [],
  },
  {
    id: "interactionTimingScan",
    sourcePath: "scripts/scan-interaction-timings.ts",
    suitePaths: [
      "tests/docs/_metaInteractionTimingInventory.test.ts",
      "tests/docs/interactionTimingScan.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    // Enrolled at authoring time rather than after review, because this is a
    // guard whose defect class is exactly "reports OK while the output moved":
    // a recognizer that quietly stops matching a form leaves DESIGN.md §5.5
    // agreeing with a scan that sees less than it used to, and every other
    // check stays green. The module is importable with a referring suite for
    // that reason — a terminal CLI script cannot be overlaid at all.
    scoreFloor: 0.95,
    // Dropping `duration` from the timing-name pattern makes PageTransition's
    // `duration: 0.22` and every *Duration binding vanish from the population,
    // which the §5.5 parity assertion notices in BOTH directions.
    control: {
      from: "(?:ms|delay|duration|timeout|seconds)$",
      to: "(?:ms|delay|timeout|seconds)$",
    },
    // A siteId is keyed by LINE, so ANY edit to the source above a row shifts
    // every row below it and the gate reports the whole accepted set stale by
    // construction. Re-derive rather than hand-adjust: `enumerateSites(path,
    // source, OPERATOR_NAMES)` from tests/mutation/source/operators.ts prints
    // the current ids. (Whole-diff review round 3 caught all eight of these
    // stale after the recognizer widening moved them 161/287/347/362 to
    // 188/333/393/408 — same columns, same operators, same reasons.)
    // Re-derived again 2026-08-16 after the property-totality edit
    // (BL-TIMING-SCAN-PROPERTY-TOTALITY): 208/393/453/468 -> 293/520/580/595,
    // and ONCE MORE after the whole-diff R1 repair moved every line again:
    // 293/520/580/595 -> 340/581/644/659, same columns, same operators, same
    // reasons. A stale row here is not cosmetic — it is what left
    // `logical-connector:&&>||` reported as an unaccepted survivor on main's
    // nightly (run 31933821808).
    accepted: [
      // The JSX initializer narrowing is NOT equivalent, and the argument that
      // said it was rested on a false claim about the TypeScript API: probed,
      // `ts.isJsxExpression(undefined)` THROWS rather than returning false, so
      // with `||` the valueless prop `<Thing ttlMs />` crashes the scan. Killed
      // by the valueless-attribute case rather than argued away (R1 #5).
      // ---- equivalent: comparator sign-not-magnitude (spec §2.4) ----------
      //
      // Array.sort consumes the SIGN of a comparator's result and never its
      // magnitude, so -1 -> -2 and 1 -> 2 sort identically. The `<` -> `<=`
      // flips are unreachable for a related reason: each sits in the ELSE
      // branch of an equality test, so the operands are already known to
      // differ and `<=` cannot decide anything `<` did not. Same class
      // taskContract carries four of.
      {
        siteId: "relational-boundary:368:14:<><=",
        kind: "equivalent",
        reason:
          "universeFiles' comparator reaches this `<` only when the two entry names differ, so `<=` cannot change the ordering",
      },
      {
        siteId: "integer-literal:368:26:1>2",
        kind: "equivalent",
        reason: "comparator magnitude is unread — Array.sort consumes the sign only",
      },
      {
        siteId: "integer-literal:368:30:1>2",
        kind: "equivalent",
        reason: "same comparator, positive branch; the sign is unchanged",
      },
      {
        siteId: "relational-boundary:894:50:<><=",
        kind: "equivalent",
        reason:
          "the site comparator reaches this `<` only when the files differ, because `a.file === b.file` is tested first",
      },
      {
        siteId: "integer-literal:894:62:1>2",
        kind: "equivalent",
        reason: "comparator magnitude is unread — sign only",
      },
      {
        siteId: "integer-literal:894:66:1>2",
        kind: "equivalent",
        reason: "same comparator, positive branch; the sign is unchanged",
      },
      // ---- equivalent: the flip cannot change which branch is taken -------
      {
        siteId: "logical-connector:909:38:||>&&",
        kind: "equivalent",
        reason:
          "the operands are never independently true: a site is `unclassified` if and only if its value is null, because the push sites guarantee it — so `||` and `&&` select the same rows",
      },
      // ---- the resolver this arc added (2026-08-16 binding resolution) -----
      //
      // Every row below was probed against the shipped guard, not argued from
      // the diff. The memo's OWN key is deliberately absent from this list: its
      // statement-removal mutant is KILLED by the "second scan of the SAME
      // root" case, which was written for it after the first attempt passed
      // against the mutant for an accidental reason (unequal offsets).
      {
        siteId: "statement-removal:736:3:resolverMemo = { key, resolve };>(removed)",
        kind: "equivalent",
        reason:
          "removing the memo WRITE only stops the cache from ever being populated: every scan then builds its own program and returns the same answer, so the mutation is observable in wall clock alone",
      },
      {
        siteId: "statement-removal:759:5:parsed.set(key, sf);>(removed)",
        kind: "equivalent",
        reason:
          "same shape one level down — the parse cache is re-populated per lookup instead of once, and ts.createSourceFile is a pure function of (name, text), so every consumer sees an identical tree",
      },
      {
        siteId: "logical-connector:809:32:||>&&",
        kind: "equivalent",
        reason:
          "the bounds test only PRUNES the walk; with `&&` fewer subtrees are skipped and more are descended, but the identifier is accepted on the exact-offset test below it, so a wider walk finds the same node",
      },
      {
        siteId: "relational-boundary:809:39:>=>>",
        kind: "equivalent",
        reason:
          "same pruning test at its upper bound: `pos === n.getEnd()` is the only input the flip changes, and descending into a node whose end equals pos finds no identifier STARTING at pos either",
      },
      {
        siteId: "integer-literal:828:51:0>1",
        kind: "equivalent",
        reason:
          "ts.SymbolFlags.Alias is 2097152, so `flags & Alias` is 0 or 2097152 and can never be 1 (probed); `!== 1` is therefore always true, and calling getAliasedSymbol on a non-alias is already handled — the catch keeps the original symbol",
      },
      {
        siteId: "logical-connector:879:50:&&>||",
        kind: "equivalent",
        reason:
          "declPos is written on named-constant sites and on no other kind, so the right operand IMPLIES the left and `A || B` selects exactly the rows `A && B` did",
      },
      {
        siteId: "logical-connector:885:35:||>&&",
        kind: "equivalent",
        reason:
          "narrowing the early return sends non-resolvable sites into resolveBinding instead of past it; with refPos undefined the walk matches nothing, the key list is empty, and the site is kept exactly as the early return would have kept it",
      },
      {
        siteId: "logical-connector:885:61:||>&&",
        kind: "equivalent",
        reason:
          "same early return, the name leg: a site with a null name reaches the resolver, whose anchor check requires found.text === name and rejects it, so the site is kept either way",
      },
      // ---- defensive guards no EMIT PATH can reach -------------------------
      //
      // `equivalent`, not `accepted-gap`, and the distinction is the point. A
      // gap needs a `ref` to open work; these have no work to open. Each mutant
      // changes behaviour only for an input no emit path in this module can
      // produce, so across every reachable input the mutated program computes
      // what the original does — which is what equivalent MEANS here. The
      // guards stay because a future emit path could produce that input; that
      // is an argument for keeping them, not for filing a queue entry whose
      // worst case today is unreachable.
      {
        siteId: "logical-connector:820:29:||>&&",
        kind: "equivalent",
        reason:
          "the mis-anchored-token guard: under `&&` a refPos landing on a non-identifier would resolve whatever symbol it hit instead of reporting. Every refPos this module writes is taken from an identifier node, so no emit path produces the input that distinguishes them",
      },
      {
        siteId: "logical-connector:824:72:&&>||",
        kind: "equivalent",
        reason:
          "the shorthand discriminator: under `||` a non-shorthand parent whose NAME node is the anchor would take the shorthand branch. Property emits anchor refPos at the VALUE and shorthand emits at the name, so parent.name === found holds only where the branch is already correct",
      },
    ],
  },
  // ── The field near-miss detector (AC-N7, spec parser/2026-08-15-field-near-miss-
  //    detector-design.md). TWO rows, not one, and the second is the point: the detector
  //    is content-keyed, but a candidate row's OCCURRENCE identity comes from its block
  //    opener, and that derivation lives in `blocks/_rowScan.ts` because `blocks/venue.ts`
  //    reads openers too. Enrolling only the detector would leave the half that
  //    distinguishes a `Room Diagram` row in a DETAILS block from a byte-identical one in
  //    a Timestamp block outside every mutant. See `_rowScan.ts`'s header for why it is
  //    its own file rather than part of `_helpers.ts`.
  {
    id: "fieldNearMiss",
    sourcePath: "lib/parser/fieldNearMiss.ts",
    // The per-class suite decides first (it is the cheaper boot and kills most mutants),
    // the 65-row corpus baseline second: guard-calibration mutants that keep every
    // per-class case green still move the corpus multiset.
    suitePaths: [
      "tests/parser/fieldNearMiss.test.ts",
      "tests/parser/fieldNearMissBaseline.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // Kills every type-(b) true positive: with the ceiling at 0 no candidate token can be
    // distinctive enough, `passesGuards` rejects everything, and the detector emits
    // nothing at all. A suite that does not notice that is not deciding anything.
    control: { from: "const DISTINCTIVENESS_MAX = 4", to: "const DISTINCTIVENESS_MAX = 0" },
    accepted: [
      {
        siteId: "statement-removal:161:11:break;>(removed)",
        kind: "equivalent",
        reason:
          "a loop-exit optimization with no observable effect: the `break` fires only after `subset = false` on the line above, and nothing inside the remaining iterations can set it back to true — the loop body's only write to `subset` is that same `false`. Removing it costs iterations of a token set whose size is already bounded by the `candTokens.size > entry.tokens.size` skip at :156, never a different answer",
      },
      {
        siteId: "relational-boundary:156:27:>>>=",
        kind: "accepted-gap",
        ref: "BL-NEARMISS-EQUAL-SIZE-TOKEN-SUBSET",
        reason:
          "`>` to `>=` additionally rejects an EQUAL-size token subset — which, being a subset of equal size, is set EQUALITY under a normalized form that differs from the entry's (a type-(a) miss reaching type (b), e.g. a reordered two-token label). Behaviorally different, so not equivalent; unreachable on the declared probe domain, so not killable from it. Probed over every row of all 20 corpus fixtures: ZERO col0 labels produce a type-(b) match whose token-set size equals its entry's — every live type-(b) match is a STRICT subset. Killing it would take a hand-authored label outside the corpus, which this suite's header forbids for exactly the reason it would be tuned until it passed",
      },
    ],
  },
  {
    id: "rowScanOpener",
    sourcePath: "lib/parser/blocks/_rowScan.ts",
    suitePaths: [
      "tests/parser/fieldNearMiss.test.ts",
      "tests/parser/fieldNearMissBaseline.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // The opener is the whole reason this module exists; pinning it to the empty string
    // collapses every block namespace onto one and the row-scan cases red immediately.
    control: { from: 'opener = clean(cells[0] ?? "")', to: 'opener = ""' },
    accepted: [
      {
        siteId: "relational-boundary:57:22:>>>=",
        kind: "equivalent",
        reason:
          "`cells.length > 0` can never be reached with a length of 0, so widening it to `>= 0` admits nothing: the alignment-row skip one line above is `cells.every(...)`, and `[].every(...)` is VACUOUSLY TRUE, so an empty cell array always `continue`s first. An empty array is itself only producible by a bare `|` line (`splitRow` slices off the leading and trailing fragments), which that same vacuous-true path already drops. Probed differentially — the mutated scan against the shipped one over all 20 corpus fixtures plus 14 adversarial documents (`|`, `||`, `|||`, alignment-only tables, table/non-table interleavings): zero output divergence",
      },
      {
        siteId: 'statement-removal:85:7:opener = "";>(removed)',
        kind: "equivalent",
        reason:
          "the reset is redundant with the reassignment it precedes. On a non-table line the branch pushes the `\"\"` LITERAL, not `opener`, so the stale value is not read there; and the same branch sets `inTable = false`, which makes `!inTable` true at the next table line and reassigns `opener` from that line's first cell before any push reads it. No path exists on which the removed assignment's value is ever observed. Probed differentially — the mutated `openerByLine` against the shipped one over all 20 corpus fixtures plus the same 14 adversarial documents: zero output divergence",
      },
    ],
  },
  // ---- the browser-mutant mode's own modules (browser spec §6) ------------
  //
  // Promotion P2 applied to itself: the new decision logic is guard code whose
  // defect class is exactly "reports OK while the output moved" — a validation
  // that stops rejecting a drifted anchor, a verdict table that folds an infra
  // fault into KILLED — so both modules were authored as importable lib-shaped
  // units with referring suites and enrolled BEFORE this arc's first review
  // dispatch, per AGENTS.md's convergence-criterion bullet 4. What the registry
  // CANNOT express is stated rather than enrolled symbolically: the spawn
  // boundary in tests/mutation/browser/runner.ts needs a real Playwright child,
  // the same shape limit the step3-a11y filing recorded, so its pure seams live
  // in the two modules below and the residual wrapper is covered by the wiring
  // meta-test plus the enrolment run itself.
  {
    id: "browserRegistry",
    sourcePath: "tests/mutation/browser/registry.ts",
    suitePaths: ["tests/mutation/browser/registry.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 1,
    // Turns the empty-mutants rejection into an unreachable comparison, so a
    // surface that would generate no mutants at all validates cleanly — the
    // vacuous-gate hole, at authoring time.
    control: {
      from: "if (surface.mutants.length === 0) {",
      to: "if (surface.mutants.length === -1) {",
    },
    accepted: [],
  },
  {
    id: "browserMutate",
    sourcePath: "tests/mutation/browser/mutate.ts",
    suitePaths: ["tests/mutation/browser/mutate.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 1,
    // Inverts the §3.4 table's detection row: every mutant that a suite
    // REJECTED would be scored as survival, which is the single edit that turns
    // this mode's score inside out.
    control: {
      from: 'if (input.exitStatus !== 0) return "KILLED";',
      to: 'if (input.exitStatus !== 0) return "DID_NOT_KILL";',
    },
    // ONE equivalent, and it is the only one of the surface's first-run
    // survivors that was blessed rather than repaid: the other eight were real
    // coverage gaps and are now killed by cases in mutate.test.ts, each proven
    // against its own mutant before the row was written.
    accepted: [
      {
        siteId: "integer-literal:88:44:2>3",
        kind: "equivalent",
        reason:
          "the JSON.stringify indent argument in buildManifest. It changes only whitespace inside " +
          "the manifest, and every consumer of that file parses it — the esbuild overlay plugin, " +
          "the tap-target spec's @source assembly, and the browser-mode vitest config all call " +
          "JSON.parse (or parseManifest, which does). No caller reads the manifest as bytes, so no " +
          "verdict can differ. Pinning the exact serialization instead would assert a formatting " +
          "detail nothing depends on, which is a tautological pin rather than coverage",
      },
    ],
  },
  {
    id: "interactiveScanCore",
    sourcePath: "tests/styles/interactiveScanCore.ts",
    // All three suites: the core's own unit + fixture cases, plus the two
    // guards that consume it. A mutant that survives the unit cases can still
    // be killed by the census it silently changes, and vice versa.
    suitePaths: [
      "tests/styles/interactiveScanCore.test.ts",
      "tests/styles/_metaSubtleOnInteractive.test.ts",
      "tests/styles/_metaTapTargetFloor.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Universal -> existential on the path set: a floor on ANY render
    // alternative would clear, which is exactly the branch-ancestry defect the
    // path model exists to prevent.
    control: {
      from: "el.paths.length > 0 && el.paths.every((path) => pathHasFloor(path))",
      to: "el.paths.length > 0 && el.paths.some((path) => pathHasFloor(path))",
    },
    // Five equivalents, all one shape: the mutation's only effect is on a value
    // no consumer can distinguish. The first run's other 56 survivors were real
    // coverage gaps and were repaid with tests, not with rows.
    accepted: [
      {
        siteId: "relational-boundary:141:50:>>>=",
        kind: "equivalent",
        reason:
          'tokenize\'s filter becomes a no-op, so the only extra member is the empty string. Its four consumers are all existential (the floor scan and two recipe checks inside `pathHasFloor`, plus `defeaterPresent`) and both predicates reject "": baseToken("") is not sr-only and utilityPx("") is null in `tokenIsFloor`, and neither regex in `tokenIsDefeater` matches. tokenize is module-private, so no length or .every consumer exists',
      },
      {
        siteId: "integer-literal:141:52:0>1",
        kind: "equivalent",
        reason:
          'the same filter in the other direction: it now also drops 1-character tokens. The shortest string any predicate in this module can match is 3 characters ("p-3" in `verticalPaddingPx`, "h-4" via the utility regex in `utilityPx`, "-m-1" in the negative-margin test inside `pathHasFloor`), so a 1-character token evaluates false whether it is kept or dropped',
      },
      {
        siteId: "relational-boundary:153:21:<><=",
        kind: "equivalent",
        reason:
          "one extra iteration of baseToken's scan reads raw[raw.length], which is undefined in JS rather than a throw, so all three comparisons in the loop body are false and neither `depth` nor `lastSep` changes; the return reads only those two",
      },
      {
        siteId: "relational-boundary:180:21:<><=",
        kind: "equivalent",
        reason:
          "the same off-the-end iteration in variantPrefixes: no branch in the loop body fires on undefined, and the function returns exactly what the loop accumulated with no post-loop push, so a trailing prefix cannot be appended",
      },
      {
        siteId: "relational-boundary:236:16:<><=",
        kind: "equivalent",
        reason:
          'themeBlocks\' brace walk: the loop bound only decides where an UNBALANCED block stops, and both consumers erase the difference. `String.slice` clamps an end past the length, and `indexOf("@theme", end)` is -1 for every end at or past the length, so the extra iteration (which reads `undefined` and matches neither brace) cannot change the returned string',
      },
      {
        siteId: "logical-connector:312:50:&&>||",
        kind: "equivalent",
        reason:
          'only two operand combinations reach this line. With allowPseudo=false the scope is necessarily "element" (pseudo and descendant returned already), so both `false && X` and `false || (scope === "pseudo")` are false; the single allowPseudo=true call site filters on `t.startsWith("before:")`, and any such token has "before" among its variant prefixes, so both operators are true. The combination the operators disagree on is unreachable',
      },
      {
        siteId: "equality-flip:380:21:===>!==",
        kind: "equivalent",
        reason:
          'a consistent relabelling of the two padding accumulators: "t" writes bottom and "b" writes top, while "" and "y" still write both, so after any token sequence the pair is exactly the original pair transposed. Its only consumer is `Math.min(top ?? 0, bottom ?? 0) * 2`, which is symmetric in the two',
      },
      {
        siteId: "integer-literal:383:26:0>1",
        kind: "equivalent",
        reason:
          "the missing-side fallback can only ever be 0 or 1, so it moves the returned padding by at most 2px. The sole consumer compares `ASSUMED_TEXT_ROW_PX + padding` against FLOOR_PX with a 24px gap (20 -> 22 against 44), and the base is pinned at 20 because any readable declared height is already a floor token or a rule-8 defeater. No input can cross the floor",
      },
      {
        siteId: "integer-literal:383:39:0>1",
        kind: "equivalent",
        reason:
          "the mirror of the row above, on the other accumulator, with the same 2px-against-24px argument",
      },
      {
        siteId: "integer-literal:394:15:0>1",
        kind: "equivalent",
        reason:
          "the bleed initializer survives only when NO `before:-inset*` token matches or every match is horizontal — any real vertical bleed overwrites it last-wins. In that case the recipe computes 20 + 2*1 = 22 against a floor of 44, so the changed initial value cannot reach a verdict",
      },
      {
        siteId: "integer-literal:285:34:0>1",
        kind: "equivalent",
        reason:
          "lengthPx's zero-length return value is only ever null-checked or compared against FLOOR_PX=44 (the `spacingTokens` map build, `tokenIsFloor`, and both arms of `tokenIsDefeater`). 0 and 1 are both non-null and both under 44, and no consumer does arithmetic on it",
      },
    ],
  },
  // NOT ENROLLED: tests/styles/subtleInteractiveScan.ts.
  //
  // It was enrolled on 2026-08-14 and the harness rejected it by its own
  // no-mutants condition: the module produced ZERO mutants, so the row asserted
  // nothing while looking like coverage. The cause is structural, not an
  // oversight to patch — the module is a filter over `interactiveScanCore`
  // (enrolled below) plus two data declarations, and the declared operator set
  // is control-flow shaped: no relational, equality or logical operator, no
  // integer literal, no regex quantifier, no removable statement. Every
  // decision it makes belongs to the core, which IS mutated, through the suite
  // that also decides this module's verdicts. Restructuring the module to grow
  // mutation sites would be gaming the operator set, and a vacuous row is worse
  // than an honest absence: the gate's no-mutants condition exists to say so.
  {
    id: "tapTargetScan",
    sourcePath: "tests/styles/tapTargetScan.ts",
    suitePaths: ["tests/styles/_metaTapTargetFloor.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Clears everything: the census rows all go stale, which is the failure a
    // guard that silently passes would produce.
    control: {
      from: 'state: heightFloorSatisfied(el) && !defeaterPresent(el) ? "clear" : "unclassified",',
      to: 'state: "clear",',
    },
    accepted: [],
  },
  // ENROLLED after an ATTEMPT, not by analogy. The `subtleInteractiveScan` note
  // above is the nearest precedent — a filter over `interactiveScanCore` in the
  // same directory — and an earlier draft of this arc's plan predicted the same
  // no-mutants outcome from it. Plan review R2 refuted that by running the live
  // enumerator: the shapes differ where it counts, because this module carries
  // numeric `line` literals plus a `file === … && line === …` comparison,
  // which is an integer-literal site per census row plus an equality-flip and a
  // logical-connector site in the resolver. The count was 21 when this was
  // written; the 2026-08-18 arc widened the census to 57 rows and added a
  // five-row DIVIDERS list, so the surface is now 62 line literals plus the
  // resolver operators. Re-scored at 65/65 with zero unaccepted survivors.
  {
    id: "controlOutlineScan",
    sourcePath: "tests/styles/controlOutlineScan.ts",
    suitePaths: ["tests/styles/_metaControlOutlineFill.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 1,
    // Detaches the resolver from its census row: every row resolves to the same
    // first scanned element. The pin still LOOKS like it read every census row, and
    // that is exactly the failure a census reader can have — resolving
    // something, just not the thing the row names.
    control: {
      from: "scanned.find((e) => e.file === row.file && e.line === row.line) ?? null",
      to: "scanned.find(() => true) ?? null",
    },
    accepted: [],
  },
  /**
   * The control-outline RESIDUE CENSUS: the derived population of interactive elements whose own
   * Tailwind utilities paint a weak outline, keyed by content and reasons-required
   * (BL-CONTROL-OUTLINE-FORWARD-GUARD, Outcome C). Enrolled BEFORE the arc's first diff-review
   * round per the AGENTS.md contract.
   */
  {
    id: "controlOutlineResidue",
    sourcePath: "tests/styles/controlOutlineResidue.ts",
    suitePaths: ["tests/styles/_metaControlOutlineResidue.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Detaches the KEY from its paint projection: every residue element collapses to
    // `(file, tag, [])`, so twelve distinct keys become as few as eleven and the census reads as
    // if it had checked content when it checked nothing but the file and the tag. That is the
    // failure a census reader can actually have. The oracle's own liveness is not this control's
    // job: AC-15 asserts it at module scope, before any census case runs.
    // Verified unique on the current source (`grep -c -F` = 1); re-verify after any refactor that
    // duplicates the line, because a text-keyed control expires the moment it is copied.
    control: {
      from: "return el.paths.map((p) => paintProjection(p, paint)).sort();",
      to: "return [] as string[];",
    },
    accepted: [
      // ---- three loop bounds where the extra index reads `undefined` (§4.1) ----
      // `token[i]`/`raw[i]`/`chain[i]` at i === length is `undefined`, and every branch in the
      // body compares it against a one-character literal, so none can fire. The extra iteration
      // appends nothing and mutates no counter. Falsifier: a body branch testing for `undefined`,
      // or one reading a property of the character.
      {
        siteId: "relational-boundary:45:21:<><=",
        kind: "equivalent",
        reason:
          "utilityOf's scan: token[token.length] is undefined and every branch compares against a one-char literal, so the extra iteration is inert; §4.1",
      },
      {
        siteId: "relational-boundary:62:21:<><=",
        kind: "equivalent",
        reason:
          "variantsOf's cut scan: raw[raw.length] is undefined, same inert extra iteration; §4.1",
      },
      {
        siteId: "relational-boundary:80:21:<><=",
        kind: "equivalent",
        reason:
          "the chain split's scan: chain[chain.length] is undefined, and the post-loop push reads `start` which the extra iteration cannot move; §4.1",
      },

      // ---- a sentinel comparison whose two branches coincide ----
      // `cut === -1` becomes `cut === -2`, which no value of `cut` satisfies: it is either -1 or a
      // valid index. So the ternary always takes `token.slice(cut + 1)` — and when cut is -1 that
      // is `slice(0)`, which returns the token itself, exactly the branch the mutant skipped.
      // Falsifier: any `cut` value below -1, which the scan cannot produce.
      {
        siteId: "integer-literal:51:20:1>2",
        kind: "equivalent",
        reason:
          "cut === -2 is unsatisfiable, and the branch it forces (slice(cut + 1) with cut === -1) is slice(0), which equals the branch it skipped; §4.1",
      },

      // ---- guards over MANDATORY capture groups ----
      // Both groups of BORDER_COLOUR_DECL are mandatory, so on a successful match neither is
      // undefined: the guard is a narrowing formality and both disjuncts are constantly false.
      // `false || false` and `false && false` are both false. Falsifier: making either group
      // optional in the pattern.
      {
        siteId: "logical-connector:307:30:||>&&",
        kind: "equivalent",
        reason:
          "BORDER_COLOUR_DECL's groups 1 and 2 are both mandatory, so both disjuncts are constantly false and || and && agree; §4.2",
      },
      // PAINT_PROP's group 1 is mandatory, so `prop !== undefined` is constantly true and the flip
      // reduces to dropping the dedup. `props` is read at exactly two sites, both `length > 0`
      // (controlOutlineResidue.ts:385 and the same predicate in classify's consumer), and a
      // repeated entry cannot move a `> 0`. Falsifier: any consumer reading props by identity,
      // index, or set membership.
      {
        siteId: "logical-connector:321:30:&&>||",
        kind: "equivalent",
        reason:
          "PAINT_PROP group 1 is mandatory so the left conjunct is constantly true; the flip only drops the dedup, and both reads of props are `length > 0`, which a duplicate cannot move; §4.2",
      },

      // ---- `??` fallbacks whose left side is never nullish ----
      // classify passes getClassOrder the same token list it just compiled and getClassOrder
      // returns one entry per input, so `order.get(token)` is never undefined at this site.
      // Falsifier: a candidate that compiles but is absent from getClassOrder's result.
      {
        siteId: "integer-literal:324:41:0>1",
        kind: "equivalent",
        reason:
          "order.get(token) is never undefined here — classify queries getClassOrder with the tokens it just compiled — so the BigInt fallback is unreachable; §4.3",
      },
      // Same shape: validateRow classifies `alternatives.flat()` and then indexes rowPaint with
      // tokens drawn from that same list, so the optional chain never yields undefined.
      // Falsifier: a token reaching this filter that was not in the classify call above it.
      {
        siteId: "integer-literal:659:82:0>1",
        kind: "equivalent",
        reason:
          "rowPaint is built from alternatives.flat() and indexed with tokens from that same list, so the ?? fallback is unreachable; §4.3",
      },

      // ---- a tie-break over a total order ----
      // Tailwind's class order is a total order with a distinct position per class, and the two
      // sides of this comparison are always DIFFERENT tokens (the held one and the candidate), so
      // p.order === held.paint.order cannot hold and `>` and `>=` agree on every reachable pair.
      // Falsifier: two distinct classes sharing one order value.
      {
        siteId: "relational-boundary:373:60:>>>=",
        kind: "equivalent",
        reason:
          "getClassOrder is a total order with a distinct position per class and the compared tokens are always distinct, so the tie the mutant redirects cannot occur; §4.4",
      },

      // ---- a pre-filter dominated by the conjunct beside it ----
      // `t.length > 0 && (paint.get(t)?.props.length ?? 0) > 0`. Every token the boundary could
      // admit or exclude — the empty string, a one-character token — has no paint entry, so the
      // SECOND conjunct is false for it either way and the conjunction's value is unchanged.
      // Falsifier: a one-character Tailwind utility that paints.
      {
        siteId: "relational-boundary:415:29:>>>=",
        kind: "equivalent",
        reason:
          "the length test is a pre-filter and the props conjunct beside it excludes every token the boundary could admit, so the conjunction is unchanged; §4.5",
      },
      {
        siteId: "integer-literal:415:31:0>1",
        kind: "equivalent",
        reason:
          "same conjunction: a one-char token has no paint entry, so the props conjunct excludes it whichever way the length boundary falls; §4.5",
      },

      // ---- the same domination, one step downstream ----
      // validateRow's split has no second conjunct, so the boundary really does change the token
      // LIST. It cannot change any VERDICT: every consumer of `alternatives` reads paint, and both
      // the empty string and a one-character token carry none. Probed in both directions on a live
      // side-divider row — identical problem lists for a clean, a double-spaced and a one-char
      // paint string. Falsifier: a consumer reading token spelling or counting tokens directly.
      {
        siteId: "relational-boundary:591:81:>>>=",
        kind: "equivalent",
        reason:
          "an empty token admitted by >= 0 carries no paint, and every consumer of alternatives reads paint; probed against a live divider row with identical output; §4.6",
      },
      {
        siteId: "integer-literal:591:83:0>1",
        kind: "equivalent",
        reason:
          "a one-char token dropped by > 1 carries no paint, same probe, same identical output; §4.6",
      },

      // ---- a float boundary outside the function's domain ----
      // relLuminance feeds `lin` only values of the form b/255 for an integer b in 0..255, because
      // its sole caller is `ch(i) = parseInt(<two hex digits>, 16) / 255`. The boundary is
      // 0.03928, and 0.03928 * 255 = 10.0164 is not an integer: enumerating all 256 values, NONE
      // equals it (nearest is 10/255 = 0.0392156862745098, which is strictly below under both
      // spellings). `<=` and `<` therefore agree on the whole domain. Falsifier: a caller passing
      // a value not of the form b/255.
      {
        siteId: "relational-boundary:504:33:<=><",
        kind: "equivalent",
        reason:
          "lin's domain is {b/255 : b in 0..255} and 0.03928*255 = 10.0164 is not an integer, so no input reaches the boundary — all 256 enumerated; §4.7",
      },
    ],
  },
  /**
   * Derivation of the destructive-file analyzer's execution-method core from the
   * driver's type declarations (BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES).
   * Pure AST over a source string, DB-free, fixture-corpus suite -- enrolled
   * before the arc's first diff-review round per the AGENTS.md contract.
   */
  {
    id: "executionMethodsDerivation",
    sourcePath: "scripts/execution-methods/lib.ts",
    suitePaths: ["tests/db/executionMethodsManifest.test.ts"],
    operators: [...OPERATOR_NAMES],
    // The FIRST enrolment run scored 10/11 (0.909) with one unaccepted survivor,
    // logical-connector:44:43; it was repaid with a PROPERTY-signature fixture
    // rather than blessed, and the re-run measures 1.00 over the same 11 counted
    // mutants. The floor is that measured 1.00 minus 0.05, rather than the 0.8
    // placeholder the row was authored with: a floor below the shipped state
    // cannot detect a regression toward it. At 11 mutants one survivor scores
    // 0.909, which trips 0.95 -- the granularity is coarse enough that the floor
    // catches a single lost kill, which is exactly what the first run's survivor
    // would have cost had it been accepted instead of repaid.
    scoreFloor: 0.95,
    // Inverting core classification collects every annotated return type into
    // core; the Promise-shape and Parameter-routing fixtures reject it.
    control: {
      from: "if (CORE_HEADS.has(head)) core.add(member.name.text);",
      to: "if (!CORE_HEADS.has(head)) core.add(member.name.text);",
    },
    accepted: [],
  },
  {
    // The psql startup-file scanner (2026-08-16 enrolment spec
    // `docs/superpowers/specs/ci/2026-08-16-psql-scan-mutation-enrolment-design.md`
    // §3). SCOPED operator subset, ratified in the 2026-08-15 local-harness spec
    // §2.3: the full six-operator set is 978 sites, about 11 h of per-mutant
    // children (statement-removal 324, integer-literal 258, equality-flip 196,
    // logical-connector 152 — budget-excluded, with that probe as the reason);
    // this pair is 48 sites, 20-30 min. A wider subset is a future registry
    // change carrying its own numbers, not a finding against this row.
    id: "psqlStartupScan",
    sourcePath: "tests/cross-cutting/psqlStartupFiles/scan.ts",
    suitePaths: ["tests/cross-cutting/psqlStartupFileSuppression.test.ts"],
    operators: ["relational-boundary", "regex-quantifier-bound"],
    // RE-DERIVED 2026-08-20 for the quoted-value recall arc
    // (BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE + BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE),
    // which edits lexShellWords and the binding rules and therefore moved every
    // site below the lexer: 63 mutants -> 69, and all 24 accepted rows re-keyed,
    // with a 25th added for the line loop in the function arm 1 introduced.
    // The gate's FIRST run on this arc scored 0.9545 with two unaccepted
    // survivors, and both were dispositioned rather than accepted: the line-loop
    // bound is genuinely equivalent and now carries the row below, and a
    // `depth > 8` recursion counter in acceptedExpansionOperand was DELETED
    // rather than covered - an operand is strictly shorter than the span it came
    // from, so the descent terminates on length alone and the counter was a
    // bound nothing could reach. Narrowing, per the standing repair direction:
    // it removes the site instead of adding a fixture for machinery that earns
    // nothing.
    // Re-keying is the cheap half. Each ARGUMENT was re-read at its new site,
    // and one had genuinely STOPPED being true: the split-reading filter row
    // (now relational-boundary:2632:72) rested on every caller trimming the
    // value's IFS edges, and arm 2 added a caller that did not. Repaired by
    // trimming the candidate where it is produced, with the separating input
    // recorded on that row and pinned in the deciding suite. None of the 24 is
    // carried over on the strength of having been true before.
    // Re-keyed ONCE MORE after diff review round 1, whose four repairs moved
    // every site below them again: read's first-line-and-IFS semantics, the
    // one-command-per-logical-line narrowing, the widened parameter name, and
    // deciding nested expansions on the RAW operand rather than the dequoted
    // one. 67 -> 69 mutants; all 25 rows re-keyed and every argument re-read.
    // Re-keyed ONCE MORE after diff review rounds 2 and 3, which moved every
    // site again. The round-3 F2 repair (ownership by operator IDENTITY rather
    // than by offset ordering) then RETIRED a `relational-boundary` site, so the
    // final shipped vector is 74 mutants and 26 rows, 48 counted. An earlier
    // draft of this comment said `69 -> 75 mutants, 25 -> 27 rows`; that was the
    // pre-retirement count and it survived a stale-number sweep because 75 - 27
    // and 74 - 26 BOTH equal 48 — a derived value cannot witness a change its
    // derivation is invariant over, so sweep the INPUTS, not the difference.
    // Every one of the rows carried over was re-read at its new site rather than
    // translated on the strength of having been true before.
    // Achieved 39/39 counted (63 mutants, 24 equivalent, NO accepted gap) after
    // the 2026-08-17 arc, whose diff-review repairs moved every site twice; it was 30/30
    // (48 mutants, 18 equivalent) after the 2026-08-16 disposition arc, whose
    // accepted-gap row came off during cross-model review — refuted with a
    // separating input the shell decides — so the surface declares 1, matching
    // the other surfaces
    // whose ledgers carry no counted survivor. The floor is a FLOOR, not a
    // snapshot: the ratchet against silent regression is the empty unaccepted
    // set plus the declared kind counts, and at 1 a future accepted gap must
    // move this number rather than hide under headroom.
    scoreFloor: 1,
    // `--no-psqlrc` recognition: the suite pins [["--no-psqlrc"], true]
    // directly, so a flipped verdict is unmissable. The bare string occurs four
    // times in the file, so the anchor is the whole guard expression, which
    // occurs exactly once.
    control: {
      from: 'if (name === "--no-psqlrc") return true;',
      to: 'if (name === "--no-psqlrc") return false;',
    },
    accepted: [
      // ---- equivalent: comparisons on RAW OFFSETS, which are unique ------
      //
      // ONE row now. Its sibling -- the word route's `target.offset <
      // effective.offset` check -- was RETIRED by diff round 3: ordering could
      // not express ownership, so the comparison became an EQUALITY on the
      // producing operator's offset and the relational site ceased to exist.
      // The site went away as a CONSEQUENCE of a correctness repair (it stops
      // `read -r PG <<< notpsql 2<<< psql` reporting), not by reshaping code so
      // an operator could not reach it -- that repair changes behaviour, which
      // is the test that separates the two.
      {
        siteId: "relational-boundary:1374:50:>>>=",
        kind: "equivalent",
        reason:
          "TWO DISTINCT REDIRECTIONS CANNOT SHARE A RAW OFFSET. `offset` is the raw index of an item's first character in the text handed to this lexer; the scan visits each index at most once, there is exactly ONE `redirections.push` site, and a consumed operator advances the cursor before the next push can occur. The mutant widens a strict comparison into a non-strict one, so it can only differ from the shipped reading on an EQUAL pair of offsets, which the invariant forbids. RE-DERIVED 2026-08-21, not carried across: BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION triggered TWO clauses of this row's previous falsifier - it took `targets.push` from one site to three and it RETAINS attached targets - and the row survives only because its site reads `redirections`, whose push count is unchanged. Derived rather than recalled: `grep -c redirections.push` is 1 at `e5d1d723d` and 1 at HEAD, while `targets.push` moved 1 to 3. Two stale claims from the previous wording are corrected rather than left standing: this was written as a SHARED argument covering TWO rows, and `grep -c` for its own invariant sentence returns 1 across the whole registry, so no twin exists to share it; and the `targets` half of the falsifier justified nothing in the accepted set. VOIDS THIS ROW: a second `redirections.push` site, or an offset assigned from anything but the scan position. Composed AFTER a discovery run named the survivor, so it stands as a PREDICTION for the confirming run: if this site is KILLED the invariant is wrong and the row comes out. HAND-PROBED at the new key on 2026-08-21: the mutant applied to the shipped source leaves the deciding suite at 998/998, so it is not killed today. APPLIED HERE: effectiveStdin keeps the LAST fd-0 input redirection by comparing offsets, and the widened bound would let a later redirection at an EQUAL offset replace the one held. WHY THE EARLIER RUNGS DO NOT APPLY: deletion is available in form - overwriting `effective` unconditionally takes the last match in ARRAY order, which agrees with source order today - and is DECLINED, because it re-founds the function on insertion order when its contract is about SOURCE POSITION, and nothing asserts the push order. Totalising does not apply: there is no bound to widen, only a comparison between two positions. Boundary pin: `a later here-string overrides the psql one`.",
      },
      {
        siteId: "relational-boundary:1656:29:<><=",
        kind: "equivalent",
        reason:
          'hereStringBindingLines\'s line loop indexes lines[index], so the widened bound adds one iteration at index === lines.length. There lines[index] is undefined and the `?? ""` yields the empty string, commentAt[index] is undefined so no comment slice happens, and splicedAt("", lines, lines.length) returns immediately because /\\\\$/ does not match the empty string. READ_HERE_STRING_PREFIX then requires a literal `read` and cannot match "", so the iteration hits `continue` before reaching the target loop: `found` is untouched and no target is examined. Same one-past-the-end shape as the commentIndexPerLine and matchBrace rows above, in the function arm 1 added (scan.ts, symbol hereStringBindingLines). Boundary pin: \'a `<<<` target on ANOTHER logical line does not bind the read\'.',
      },
      // ---- equivalent: one-past-the-end scan bounds (spec §2.2) -----------
      //
      // Both loops index a string by their own counter, so the widened bound
      // adds exactly one iteration reading `undefined`, which is strictly equal
      // to none of the one-character literals the body compares against and
      // moves no state.
      {
        siteId: "relational-boundary:820:23:<><=",
        kind: "equivalent",
        reason:
          "commentIndexPerLine's character loop indexes line[i], so the widened bound adds one iteration at i === line.length where line[i] is undefined. Every branch of the body compares `character` against a one-character literal (backslash, the active quote, double quote, single quote, backtick, '#', '/'), and undefined is strictly equal to none of them - the '#' branch's line[i - 1] whitespace regex sits behind that comparison and never runs. No branch assigns found, quote or i, so the extra iteration leaves the loop's entire state untouched (scan.ts, symbol commentIndexPerLine). Boundary pin: 'a quote closing at end-of-line clears, so the next line's # is a comment'.",
      },
      {
        siteId: "relational-boundary:981:25:<><=",
        kind: "equivalent",
        reason:
          "matchBrace's scan loop indexes text[i], so the widened bound adds one iteration at i === text.length where text[i] is undefined. The body compares `character` against backslash, the active quote, double quote, single quote, and the open/close delimiters its three call sites pass ('{' and '}', '(' and ')'), and undefined equals none of them, so neither depth nor quote moves and the function still falls through to its text.length - 1 fallback (scan.ts, symbol matchBrace). Boundary pin: 'an unclosed command substitution still exposes the psql call inside it'.",
      },
      // ---- equivalent: containment and length guards that admit nothing ---
      {
        siteId: "relational-boundary:880:83:<><=",
        kind: "equivalent",
        reason:
          "The widened containment bound in exemptionOnLines can only admit a range whose end equals `at`, the marker's own start column. For such a range the reason is sliced over [at + EXEMPTION_MARKER.length, at), an empty range, so reason.length > 0 is false and control falls through to the next candidate line exactly as the original's `continue` does - no returned value differs. It cannot shadow a wider range either: a range containing `at` must begin at or before `at`, a range ending at `at` belongs to a different comment, and TypeScript comment ranges on one line never overlap, so `find` cannot return the narrow range where the original returned a wider one. Every range commentIndexPerLine produces ends at Infinity and is unaffected (scan.ts, symbols exemptionOnLines and jsCommentRangesPerLine). Boundary pin: 'a marker beginning exactly where the comment ends grants no exemption'.",
      },
      {
        siteId: "relational-boundary:2362:46:>>>=",
        kind: "equivalent",
        reason:
          "The length bound is a redundant partner of the conjunct it is ANDed with: /^-[a-zA-Z]*S[\\s\\S]/ requires a dash, an S and at least one character after it, so it matches nothing shorter than three characters. The only candidates the widened bound newly admits are exactly two characters long, and every one of them fails that regex, so the attached-script branch is entered on precisely the same set (scan.ts, symbol scanShellText, the env -S attached-script slice). Boundary pin: 'env -S takes the next word, and the attached form carries its own script'.",
      },
      {
        siteId: "relational-boundary:2191:22:>>>=",
        kind: "equivalent",
        reason:
          "The widened bound changes behaviour only when `raw` is the empty string, and there it evaluates the delimiter regex against raw[0], which is undefined. RegExp.prototype.test coerces its argument to the string 'undefined', which contains none of the four delimiter characters, so the test is false and `i` is 0 either way (scan.ts, symbol mapRawToLines). Boundary pin: 'a template literal reports the physical line its psql text came from'.",
      },
      {
        siteId: "relational-boundary:2537:26:>>>=",
        kind: "equivalent",
        reason:
          "The widened bound admits only raw.length === i, reachable in two shapes and outcome-neutral in both. With i === 0 the slice is empty, raw.at(-1) is undefined, and test('undefined') is false, so `end` is raw.length either way. With i === 1 the slice is a single delimiter character; the mutant sets `end` to 0 where the original sets it to 1, but `end` is used only as the `while (i < end)` bound and both 1 < 0 and 1 < 1 are false, so the walk emits nothing and the function returns the same produced === cooked verdict (scan.ts, symbol mapRawToLines). Boundary pin: 'a template literal reports the physical line its psql text came from'.",
      },
      // ---- equivalent: an appended empty command, and a uniform shift -----
      {
        siteId: "relational-boundary:2536:22:>>>=",
        kind: "equivalent",
        reason:
          "The trailing flush in scanShellText can only APPEND an empty command, never insert one, so the parallel commands/followedBy arrays stay index-aligned - the two pushes are unconditional partners. Every consumer treats the extra entry exactly as the original treated its absence: the bare-shell stdin scan skips it as a stage because its followedBy entry is the empty string rather than '|', and skips it as a SUCCESSOR because next[0] is undefined precisely where `next === undefined` was; the per-command scan's findIndex returns -1 on an empty argv and continues (scan.ts, symbol scanShellText). Boundary pin: 'a command terminated by a trailing ; is still reported'.",
      },
      {
        siteId: "relational-boundary:2272:30:>>>=",
        kind: "equivalent",
        reason:
          "When `remaining` is empty the widened guard runs a block that reduces to scanShellText('', file, 0): the join loop has nothing to iterate, `joined` stays empty, that call lexes no words and returns no sites, and the sites loop - the only place `anchor` (remaining[0], undefined here) is dereferenced - never runs. The `joinedHandled = true` and `break` that follow sit OUTSIDE the guard and run identically either way. The empty case is reachable, not hypothetical: `ssh database` with no remote command (scan.ts, symbol scanShellText, the trailing-script/eval joining branch). Boundary pin: 'an ssh host with no remote command is not a site'.",
      },
      {
        siteId: "relational-boundary:2282:19:>>>=",
        kind: "equivalent",
        reason:
          "Admitting k === 0 prepends one separator to `joined` and one entry to each of joinedOffsets and joinedLines, so the mutant's joined string is exactly ' ' + the original's and each array is exactly one extra element followed by the original array. A leading space is word-separator whitespace to the re-lexer, so the same words are produced with every offset raised by one, and the two lookups joinedOffsets[site.offset] and joinedLines[site.offset] therefore read the SAME element as before; the `?? anchor` fallbacks cannot fire in one and not the other. The mapping the arrays exist to serve is unchanged (scan.ts, symbol scanShellText, the joined-string builder). Boundary pin: 'an ssh remote command on a continuation line reports its own physical line'.",
      },
      // ---- equivalent: out-of-range lookbacks that collapse to "" ---------
      //
      // The spec §2.2 worked example, verified PER SITE rather than assumed as a
      // family: the `index > 1` rows read a different element from the
      // `index > 0` rows, so each carries its own citation.
      {
        siteId: "relational-boundary:2728:12:>>>=",
        kind: "equivalent",
        reason:
          "The clause is `index > 0 && WRAPPERS.test(basename(before[index - 1] ?? ''))` in isStrongPrefixWord. Widening the guard admits only index === 0, where before[-1] is undefined, the ?? yields the empty string, the file's own basename returns '' for it (Math.max of two missing lastIndexOf results is -1, so slice(0) returns the whole empty word), and WRAPPERS is an anchored alternation of non-empty program names that cannot match ''. The clause evaluates to false exactly as the short-circuit did (scan.ts, symbol isStrongPrefixWord). Boundary pin: 'the first preceding word vouches only through its own spelling'.",
      },
      {
        siteId: "relational-boundary:2729:12:>>>=",
        kind: "equivalent",
        reason:
          "The twin clause `index > 1 && WRAPPERS.test(basename(before[index - 2] ?? ''))` in isStrongPrefixWord. Widening admits only index === 1, whose lookback is before[-1] - undefined, so the same collapse applies: '' through the ??, '' through basename, and no match against the anchored WRAPPERS alternation. Argued separately from the index > 0 twin because it reads a DIFFERENT element (scan.ts, symbol isStrongPrefixWord). Boundary pin: 'the first preceding word vouches only through its own spelling'.",
      },
      {
        siteId: "relational-boundary:2745:16:>>>=",
        kind: "equivalent",
        reason:
          "The same lookback clause `index > 0 && WRAPPERS.test(basename(before[index - 1] ?? ''))`, in prefixIsCommandish's per-word predicate rather than isStrongPrefixWord. `before` here is the site's full precedingWords array and `index` is the callback's own index, so index === 0 again reads before[-1]: undefined, then '', then no match against the anchored alternation (scan.ts, symbol prefixIsCommandish). Boundary pin: 'the first preceding word vouches only through its own spelling'.",
      },
      {
        siteId: "relational-boundary:2746:16:>>>=",
        kind: "equivalent",
        reason:
          "The two-word lookback `index > 1 && WRAPPERS.test(basename(before[index - 2] ?? ''))` in prefixIsCommandish. Widening admits index === 1 only, reading before[-1]: undefined, '' through the ??, '' through basename, no match against the anchored WRAPPERS alternation (scan.ts, symbol prefixIsCommandish). Boundary pin: 'the first preceding word vouches only through its own spelling'.",
      },
      // ---- equivalent: a quantifier its own character class already covers -
      {
        siteId: "regex-quantifier-bound:3249:21:{1,2}>{1,3}",
        kind: "equivalent",
        reason:
          "The dash run in INTERPRETER_POSITIONAL_BINDING is followed by [A-Za-z-]*, a character class that ALREADY contains a dash, so -{1,2}[A-Za-z-]* and -{1,3}[A-Za-z-]* denote the same language: one dash followed by any run of letters and dashes. Every extra dash the widened quantifier could consume is a dash the class consumes instead, so no input matches one and not the other, and the pattern is only ever consulted through .test (scan.ts, symbol INTERPRETER_POSITIONAL_BINDING, used in scanShellIndirection). Its twin at 2372:38 has the follower class [A-Za-z0-9], which contains no dash - that one is killed by a test rather than blessed here. Boundary pin: 'an extra dash in the -c spelling still reports the positional binding'.",
      },
      {
        siteId: "relational-boundary:3531:54:<><=",
        kind: "equivalent",
        reason:
          "The `logical` continuation loop can take the extra iteration only when the accumulated text still ends with a backslash at k + 1 === lines.length - that is, when the final element of `lines` ends with one. That iteration appends lines[k+1] ?? '' (the empty string) and replaces the trailing backslash with a SPACE, after which the loop's own trailing-backslash test fails and it exits, so the mutant's `logical` differs from the original's in exactly its last character. Neither consumer can tell those apart: the quoted-binding pattern requires a closing quote, which neither a backslash nor a space supplies, and every whitespace run in INTERPRETER_POSITIONAL_BINDING is followed by required content that the extra iteration adds nothing to. Both characters are non-word, so a trailing word boundary holds identically (scan.ts, symbol scanShellIndirection). Boundary pin: 'a quoted binding split by a backslash continuation is one assignment'.",
      },
      // ---- equivalent: bounds a parsed YAML document cannot reach ---------
      {
        siteId: "relational-boundary:3833:31:<><=",
        kind: "equivalent",
        reason:
          "The alias-resolution loop cannot approach its bound: the yaml parser refuses to register an anchor on an alias node - probed on this tree, `a: &x one` / `b: &y *x` / `c: *y` throws 'Unresolved alias (the anchor must be set before the alias): y' - so an Alias always resolves to a NON-alias node and resolveNode returns on its second pass with `depth` never exceeding 1. A bound of 32 versus 33 is unreachable in either direction (scan.ts, symbol resolveRunShells, helper resolveNode). Boundary pin: 'an aliased run body resolves, and its site is pinned to the run key'.",
      },
      {
        siteId: "relational-boundary:3965:35:<><=",
        kind: "equivalent",
        reason:
          "The depth guard in the YAML alias walk's `resolved` helper: `depth < 32` widened to `depth <= 32` grants ONE extra iteration of a loop that returns as soon as `asAlias?.resolve` is not a function, so a document whose alias chain is shorter than 32 -- which every document in the corpus is -- reaches the same fixed point either way. RESTORED after being briefly removed on diff round 3. This site is the arc's own instance of BL-MUTATION-SCORE-NONDETERMINISM and the evidence is recorded rather than smoothed over: across FOUR observations with byte-identical scan.ts (a1f9db0c) and deciding suite (cb45f9ea) it reported SURVIVOR (discovery), then KILLED (26-row run), then SURVIVOR again (25-row run), while a hand-applied mutant survives the suite 3/3. Three of four say it survives, so the row stands; the one that disagreed is why the row was wrongly dropped for one round. Do NOT remove this row on a single stale-row report -- re-run first.",
      },
      {
        siteId: "relational-boundary:4075:32:<><=",
        kind: "equivalent",
        reason:
          "`range` is the run VALUE node's range and `keyRange` its own key's, and equality between them is unreachable: in a block mapping the key's characters and the ':' separator occupy the offsets before the value, so a non-alias value starts strictly after its key, while an alias resolves to an anchor defined elsewhere in the document - never at the byte offset this pair's key scalar occupies. The `?? 0` fallback cannot produce equality either, because a pair produced by parseDocument always carries a key range; it is defensive against the optional chain, not a reachable state (scan.ts, symbol scanWorkflowIndirection, the alias anchor comparison). Boundary pin: 'an aliased run body resolves, and its site is pinned to the run key'.",
      },
      // ---- equivalent: the 2026-08-17 lexer-routing repair's own four -------
      //
      // Three sit in code this repair added (the ANSI-C close scan and the
      // word-split reading's two count guards); the fourth is a site whose
      // DISPOSITION changed because the repair removed its only distinguishing
      // consumer, which the closing note below argues rather than glosses.
      {
        siteId: "relational-boundary:3318:29:<><=",
        kind: "equivalent",
        reason:
          "The ANSI-C close-quote scan indexes text[k] by its own counter, so the widened bound adds one iteration at k === text.length where text[k] is undefined. The body compares that character against exactly two one-character literals - a backslash, whose branch skips the escaped character, and the closing single quote, whose branch assigns `close` and breaks - and undefined is strictly equal to neither, so `close` is still -1 and the unterminated-string path is taken identically (scan.ts, symbol lexShellWords, the ANSI-C branch). Boundary pin: 'an unterminated ANSI-C string keeps the old undecoded reading'.",
      },
      {
        siteId: "relational-boundary:3200:72:>>>=",
        kind: "equivalent",
        reason:
          "The filter drops empty parts from value.split(/[ \\t\\n]+/), and EVERY value reaching this branch has had its leading and trailing [ \\t\\n] runs stripped: the assignment and compound-array callers trim two statements above, arm 2's expansion CANDIDATE is trimmed where it is produced in acceptedExpansionOperand, and the HERE-STRING route - both spellings - trims through `firstLine` in hereStringBindingLines, which strips a leading and trailing run of spaces and tabs from whichever string is about to be read. RE-CHECKED 2026-08-21 against the shipped source rather than remembered, because BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION added a caller: an ATTACHED here-string target now reaches valueBinds, and its dequoted text can carry QUOTED padding (`read -r PG <<<\" psql -qAt \"`) that no walk-level rule strips. It is the shared `firstLine` helper that trims it, applied to attached and detached alike, so the premise holds for the new caller by the same statement it held for the old ones. Splitting on a whitespace-RUN separator can only produce an empty part at the very start or the very end of the subject, so a trimmed subject produces none: the predicate is true for every part either way, and the widened bound admits a part that cannot exist. RE-DERIVED 2026-08-20 and this row is why the candidate is trimmed at all - the argument had genuinely STOPPED being true when arm 2 added a caller that did not trim. Probed on that branch: `PG=${U:-\" /tmp/O'Reilly/psql -X\"}` reported 1 shipped and 0 under this mutant, a separating input, because the SPLIT reading decides that value (the eval reading takes the pathname apostrophe as syntax) and a leading empty part puts \"\" at argv[0]. Pinned by 'a candidate is trimmed on its IFS edges, so the split reading still sees argv[0]' (scan.ts, symbols valueBinds and acceptedExpansionOperand). Boundary pin: 'an unquoted $CMD binds when its first word is psql and a later word is a flag'.",
      },
      {
        siteId: "relational-boundary:3202:20:>>>=",
        kind: "equivalent",
        reason:
          "`parts.length > 1` is a readability partner of the conjunct two lines below it, not an independent gate: that last conjunct is parts.slice(1).some(...), and for parts.length <= 1 the slice is empty, so `.some` returns false and `splitBound` is false regardless. Admitting parts.length === 1 changes no verdict - it only evaluates isPsqlCommandWord(parts[0]) before reaching the same false (scan.ts, symbol assignmentBindingLines, the word-split reading). Boundary pin: 'an unquoted $CMD binds when its first word is psql and a later word is a flag'.",
      },
      {
        siteId: "relational-boundary:3270:52:<><=",
        kind: "equivalent",
        reason:
          "The `spliced` continuation loop's widened bound can take its extra iteration only when the FINAL element of `lines` ends with a backslash, and that iteration appends lines[k+1] ?? '' - the empty string - after deleting the trailing backslash, so the mutant's `spliced` differs from the original's by exactly one trailing backslash at end of subject. Neither remaining consumer can observe that. READ_HERE_STRING and githubEnvWrite both end their psql clause in \\bpsql\\b followed by a character class that matches the empty string, so no match can END at that final backslash and deleting it destroys no match; nor can deleting it create one, because a newly created match would have to end at the new final character - meaning the subject ended `psql\\` - and \\bpsql\\b already matched there, a backslash being a non-word character. githubEnvWrite's other clause is the fixed GITHUB_ENV/GITHUB_OUTPUT literal, whose trailing boundary holds against a backslash and against end of subject alike (scan.ts, symbol scanShellIndirection). Boundary pin: 'a trailing backslash at end of input is literal, so it binds nothing'.",
      },
      // ---- equivalent: the compound-array reading's two redundant guards ---
      //
      // Both added by the diff-review-r1 repair, and both partners of a
      // condition beside them rather than independent gates.
      {
        siteId: "relational-boundary:3146:24:<><=",
        kind: "equivalent",
        reason:
          "The element walk's bound stops BEFORE `close`, the index of the closing `)`. Widening it to include that index adds one iteration whose word is that `)` - an operator - and the loop body's first statement is `if (word.operator) continue`, so the iteration reads no element and moves no state. `close` is assigned only from a word whose text is exactly `)`, so no other word can occupy that index (scan.ts, symbol compoundArrayBinds). Boundary pin: 'an element after the closing paren is not part of the value'.",
      },
      {
        siteId: "relational-boundary:3153:22:>>>=",
        kind: "equivalent",
        reason:
          '`value.length > 0` is a readability partner of the `valueBinds(...)` conjunct beside it, not an independent gate: widening it admits only the empty string, and valueBinds("") is false on every path - /\\s/ does not match it, basename("") is "" which isPsqlName rejects, and /\\bpsql\\b/ cannot match an empty subject. RE-READ 2026-08-20: this line now passes arm 2\'s candidate as a third argument, and that cannot change the verdict, because an empty value means the value starts at the END of the word, so no recorded span can begin at or after it and wholeValueCandidate returns null - the candidate disjunct is skipped and the call is valueBinds("", file, null) exactly as before. The empty case is reachable rather than hypothetical (`PG=([0]=)`), and probed at zero both ways (scan.ts, symbol compoundArrayBinds). Boundary pin: \'a compound array of other programs binds nothing\'.',
      },
      {
        siteId: "relational-boundary:1043:29:<><=",
        kind: "equivalent",
        reason:
          "SHARED INVARIANT, and these four rows are ONE argument applied four times rather than four independent stories: A CHARACTER-INDEXING LOOP'S WIDENED BOUND ADDS ONE ITERATION AT `index === text.length`, WHERE `text[index]` IS `undefined`. Every branch in each of these four bodies compares that character against a ONE-CHARACTER LITERAL - a backslash, a double quote, a single quote, a backtick - and `undefined` is strictly equal to none of them, so no branch assigns, returns or breaks and the extra iteration leaves the loop's whole state untouched. This is the SAME invariant the rows for `commentIndexPerLine`, `matchBrace` and the ANSI-C close-quote scan already rest on, applied at the four sites BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION added. Stated once because four independent arguments are four chances to be wrong and one invariant is one. WHY THE EARLIER RUNGS DO NOT APPLY, checked in order: deletion is unavailable - the bound is what terminates the loop; TOTALISING IS REFUSED - removing the bound moves termination into the predicate, where an equality-flip mutant spins forever and the whole measurement is lost to a hang rather than to a survivor you can see; and no test can kill it, because the differing iteration reads past the end and no branch can observe it. The one place the extra iteration DOES change a value is `attachedTargetEnd`'s own return - `end` becomes `text.length + 1` - and it is still unobservable: `text.slice(start, end)` clamps to the same bytes and the caller's `i = end - 1` reaches the same place. That is the same argument that let this arc DELETE the dangling-backslash branch beside it rather than carry a fifth row, and it was probed across the whole backslash-at-EOF family with every case ending WITHOUT a trailing newline. POST-HOC: all four arguments were composed AFTER a discovery run named the survivors, so they are PREDICTIONS for the confirming run rather than claimed properties. VOIDS ALL FOUR AT ONCE: any branch in one of these bodies comparing the character against something other than a one-character literal, or reading a second character, or any of these loops gaining a body that observes the index rather than the character. If any of the four is KILLED, the invariant is wrong and the rows come out. APPLIED HERE: `closingBacktick`'s scan for the backtick that closes a substitution.",
      },
      {
        siteId: "relational-boundary:1089:26:<><=",
        kind: "equivalent",
        reason:
          "See the SHARED INVARIANT on relational-boundary:1043:29 - one argument, four sites, voided together.  APPLIED HERE: the ANSI-C close-quote scan inside `attachedTargetEnd`.",
      },
      {
        siteId: "relational-boundary:1103:26:<><=",
        kind: "equivalent",
        reason:
          "See the SHARED INVARIANT on relational-boundary:1043:29 - one argument, four sites, voided together.  APPLIED HERE: the double-quoted span walk inside `attachedTargetEnd`, which is where the accept-set recurses.",
      },
      {
        siteId: "relational-boundary:1151:12:<><=",
        kind: "equivalent",
        reason:
          "See the SHARED INVARIANT on relational-boundary:1043:29 - one argument, four sites, voided together.  APPLIED HERE: `attachedTargetEnd`'s own top-level walk, the one whose `end` the caller consumes.",
      },
      // The surface carries NO accepted gap. It carried one - the `spliced`
      // continuation bound, then at relational-boundary:2167:54 - and cross-model
      // review refuted the argument, so a test killed it instead: `PG='psql'\` at
      // end of input binds `psql\`, which is not the psql command, while the
      // mutant deleted the backslash and reported a binding the shell never makes.
      //
      // The 2026-08-17 lexer-routing repair removed that observation, and the row
      // above records the change rather than quietly restoring a gap. The kill ran
      // through the ASSIGNMENT patterns, which read `spliced`; the assignment
      // family reads LEXED WORDS now, and the lexer performs its own splice and
      // keeps a dangling final backslash literal on its own (spec §3.2 fix 1), so
      // those zeros are unchanged and the mutant no longer moves them. What is
      // left to observe `spliced` is two regexes that provably cannot - which is
      // why the site is `equivalent` rather than a re-accepted gap, and why the
      // floor stays at 1. An `accepted-gap` row appearing here later is a new
      // family owing its own filing and its own floor edit, not a number to bump.
    ],
  },
  {
    id: "serializeErrorStructure",
    sourcePath: "lib/log/serializeError.ts",
    suitePaths: ["tests/log/serializeError.test.ts"],
    operators: [
      "relational-boundary",
      "equality-flip",
      "logical-connector",
      "integer-literal",
      "statement-removal",
    ],
    scoreFloor: 0.95,
    // Inverts the depth guard so truncation fires one level EARLY -- the
    // boundary-pair cases in the suite must notice both directions.
    control: {
      from: 'if (depth > DEPTH_MAX) return "[Truncated: depth]";',
      to: 'if (depth >= DEPTH_MAX) return "[Truncated: depth]";',
    },
    accepted: [],
  },
  {
    id: "sameOriginServerAction",
    sourcePath: "lib/auth/sameOriginServerAction.ts",
    suitePaths: ["tests/auth/sameOriginServerAction.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // Flips the Fetch-Metadata verdict for the ONE state the whole gate exists
    // to allow. Every `same-origin` row of the truth table reverses, so a
    // silently-inert overlay cannot report a perfect score off this surface.
    control: {
      from: 'return secFetchSite === "same-origin" || secFetchSite === "none";',
      to: 'return secFetchSite !== "same-origin" || secFetchSite === "none";',
    },
    accepted: [],
  },
  {
    // The two guard surfaces the mutation-gate sharding arc itself ships
    // (wall-clock spec docs/superpowers/specs/ci/2026-08-16-mutation-gate-wallclock-design.md).
    // Enrolled BEFORE this arc's first whole-diff review dispatch, so the
    // convergence criterion is a mutation score plus an empty unaccepted-survivor
    // set -- both machine-computed -- rather than reviewer imagination.
    //
    // The budget checker's DECISION LOGIC is here and its CLI is a separate file
    // (scripts/check-shard-budget.ts) deliberately: `phantomGapExecuted` below
    // records what the combined shape costs, scoring 0.27 with 18 of 19 survivors
    // in code no referring suite could execute through an import.
    id: "shardBudget",
    sourcePath: "lib/ci/shardBudget.ts",
    suitePaths: ["tests/ci/shardBudget.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Turns the strictly-above budget comparison into at-or-above, which the
    // exactly-at-budget case is built to notice.
    control: { from: "r.seconds > budgetSeconds)", to: "r.seconds >= budgetSeconds)" },
    accepted: [],
  },
  {
    id: "sourceShardPartition",
    sourcePath: "tests/mutation/source/shardPartition.ts",
    // TWO deciding suites, and the second is load-bearing rather than tidy. The
    // unit suite decides every BEHAVIOUR in this module, but it reads
    // SOURCE_SHARD_COUNT and SHARD_BUDGET_SECONDS to build its own expectations,
    // so a mutant of either constant is self-consistent and survives -- which is
    // exactly what enrolment's first run reported (integer-literal:26:35:4>5 and
    // both halves of 60 * 60). The integrity meta-test compares the same two
    // constants against the WORKFLOW's hard-coded `[0, 1, 2, 3]` and `"3600"`,
    // which no mutant of this file can move, so it is what kills them.
    suitePaths: [
      "tests/mutation/source/shardPartition.test.ts",
      "tests/mutation/_metaSourceShardIntegrity.test.ts",
    ],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Drops the `accepted` term from the weight, which the delta case in the
    // suite is built to notice: it holds the SOURCE fixed and varies only the
    // suite count and ledger size, so the mutant moves the asserted delta from
    // 4 to 2 rather than leaving a self-consistent number.
    control: {
      from: "surface.accepted.length * (suites - 1) + suites",
      to: "suites",
    },
    accepted: [],
  },
  /**
   * The invariant-10 discovery engine, enrolled 2026-08-17 (spec §3.7).
   *
   * Two rows rather than one because the arc split the engine in two modules:
   * `enumerate.ts` decides WHAT is a unit, totality.ts decides what the
   * residue is. Both suites decide both rows — `enumerate.test.ts` pins the
   * accept side and totality.test.ts the refusal side, and the two are one
   * contract (a unit that stops being produced becomes a refusal, which the
   * OTHER suite is what notices). Listing one suite per row would let exactly
   * that swap survive.
   *
   * Operator subset: the defect class here is "reports units/gaps while the
   * truth moved" — a dropped statement (a skipped export form), a flipped
   * predicate (kind checks, directive comparison), a flipped connector (the
   * per-kind filters). `relational-boundary` and `integer-literal` have almost
   * no sites (no numeric thresholds beyond the D2 count comparison), and
   * `regex-quantifier-bound` touches only `SHOUTY`, which is scanBody's
   * inherited surface rather than discovery's.
   */
  {
    id: "mutationSurfaceEnumerate",
    sourcePath: "tests/log/mutationSurface/enumerate.ts",
    suitePaths: [
      "tests/log/mutationSurface/enumerate.test.ts",
      "tests/log/mutationSurface/totality.test.ts",
    ],
    operators: ["equality-flip", "logical-connector", "statement-removal"],
    // 0.95, set FROM the measured 169/172 = 0.9826 (2026-08-17, after the
    // round-1 repairs). Headroom is eight survivors, so the floor cannot
    // detect one or two rows migrating between kinds -- that is
    // EXPECTED_LEDGER_KINDS' job, not this number's.
    scoreFloor: 0.95,
    // Blinds the awaited-logAdminOutcome recogniser, so every admin action
    // classifies as emitting nothing. Verified unique on the current source
    // (`grep -c -F 'c.text === "logAdminOutcome"'` = 1); the scanBody durability
    // cases at the head of enumerate.test.ts kill it deterministically.
    control: {
      from: 'c.text === "logAdminOutcome"',
      to: 'c.text === "logAdminOutcomeNEVERMATCHES"',
    },
    // Every siteId below is RE-DERIVED from a run against the current source
    // after each edit, never carried forward: a siteId is a line number, and
    // diff review round 2 caught this ledger citing 433 after the round-1 repair
    // moved the site to 434. The gate says so in both directions at once --
    // `unaccepted-survivor` for the real site and `stale-ledger-row` for the
    // citation -- so a green report taken before an edit is not evidence after
    // one.
    accepted: [
      {
        siteId: "equality-flip:204:50:===>!==",
        kind: "equivalent",
        reason:
          "`moduleDefaultExports` reads `hasExport && hasDefault`, so flipping the ExportKeyword " +
          "comparison can only matter where `some(=== Export)` and `some(!== Export)` disagree AND " +
          "a default modifier is present. Disagreement needs either no export modifier (then " +
          "`default` stands alone, which does not parse) or a modifier list of exactly `[export]` " +
          "(then there is no default modifier). Both conjuncts cannot hold, so no input " +
          "distinguishes them. The sibling flip on the DefaultKeyword line IS distinguishable and " +
          "is killed by the `export async function` negative.",
      },
      {
        siteId: "logical-connector:338:32:&&>||",
        kind: "equivalent",
        reason:
          "`isCheckableFunction`'s body requirement, flipped to `(one of four kinds) || has a " +
          "body`. To distinguish it a node must reach here with NO kind match but a `body` " +
          "property, or a kind match with no body. The second is impossible: the only producer of " +
          "a bodyless candidate was the overload signature, and `resolveModuleName` now refuses " +
          "those at the source. The first requires a non-function node carrying `.body`, and every " +
          "node reaching here is either a body-checked `FunctionDeclaration` or the result of " +
          "`reduceModuleExpr` — an `Expression`, and the only Expression kinds with a `body` are " +
          "`ArrowFunction` and `FunctionExpression`, both already in the accept list. Accessors and " +
          "`ModuleDeclaration` do carry `.body` but cannot reach this call: the object-literal " +
          "branch matches only property assignments, method declarations and shorthands, and a " +
          "namespace is never returned by the resolver. Probed: `const bag = { get doIt() {...} }` " +
          "refuses identically under both.",
      },
      {
        siteId: "logical-connector:658:49:||>&&",
        kind: "equivalent",
        reason:
          "The SECOND disjunct of `!item || isOmitted(item) || isSpread(item)`. Under the flip it " +
          "reads `!item || (isOmitted(item) && isSpread(item))`, and a node cannot be both an " +
          "omitted expression and a spread element, so that arm is dead. Its two inputs then fall " +
          "through to `reduceModuleExpr`, which returns the node unchanged, and " +
          "`isCheckableFunction` rejects it — the same `undefined` the guard would have returned. " +
          "The `!item` disjunct is untouched and still short-circuits the past-the-end case (killed " +
          "by its own fixture), and an array literal containing a spread is now refused BEFORE this " +
          "line is reached. This argument does not rest on a downstream re-check being reachable: " +
          "the reachable inputs are enumerated above, which is what round 1 refuted about two " +
          "earlier rows on this surface — both are now killed by fixtures instead.",
      },
    ],
  },
  {
    id: "mutationSurfaceTotality",
    sourcePath: "tests/log/mutationSurface/totality.ts",
    suitePaths: [
      "tests/log/mutationSurface/enumerate.test.ts",
      "tests/log/mutationSurface/totality.test.ts",
    ],
    operators: ["equality-flip", "logical-connector", "statement-removal"],
    // 0.95, set FROM the measured 20/20 = 1.0 (2026-08-17). Headroom is ONE
    // survivor: this module is new, small, and fully covered, so the first
    // survivor is a coverage question and the second is a gate failure.
    scoreFloor: 0.95,
    // Empties the module-action side of the per-kind reconciliation, so every
    // "use server" export reads as unresolved. Verified unique on the current
    // source (`grep -c -F 'u.kind === "module-action"'` = 1); the QUIET negative
    // halves in totality.test.ts kill it deterministically — which is the point
    // of having them, since the refusal cases alone would pass under it.
    control: {
      from: 'u.kind === "module-action"',
      to: 'u.kind === "module-actionNEVERMATCHES"',
    },
    accepted: [],
  },
  /**
   * The bounded-spawn module, enrolled 2026-08-17 with a SCOPED operator subset.
   *
   * Only the mocked suite decides verdicts. The live process-tree suite is
   * deliberately NOT listed: every one of its cases spawns real processes, and
   * `suitePaths` is executed once per mutant, so listing it would multiply the
   * whole surface's cost by a live-spawn suite for behaviour the registry
   * cannot mutate anyway.
   *
   * `regex-quantifier-bound` is excluded because the module contains no regex,
   * and `relational-boundary` because it contains no ordering comparison — both
   * would generate zero sites rather than being a judgement call. The remaining
   * four are the module's whole substance: the equality checks that separate a
   * timeout from an infra fault, the connector in `killGroup`'s guard, the
   * default ceiling, and the statements that arm and reap.
   *
   * The perl watchdog is a string literal and no declared operator rewrites
   * string content (`./operators.ts:17-24`), so the registry can generate no
   * semantic mutant of the program's behaviour: CANNOT-EXPRESS, guarded by
   * `./spawnBounded.live.test.ts` instead (spec §8).
   */
  {
    id: "spawnBounded",
    sourcePath: "tests/mutation/source/spawnBounded.ts",
    suitePaths: ["tests/mutation/source/spawnBounded.test.ts"],
    operators: ["equality-flip", "logical-connector", "integer-literal", "statement-removal"],
    // MEASURED 12/12 on 2026-08-17, no survivor and no no-op, so the floor is
    // the score. Twelve sites: equality-flip 5, integer-literal 3,
    // logical-connector 2, statement-removal 2. A floor of 1 means the first
    // survivor this surface ever produces reds the gate and owes a written
    // disposition, which is the right trade on a module this small — there is
    // no coarse-floor slack to hide a row migrating between kinds.
    scoreFloor: 1,
    // Reaps the group on the arm that must NOT reap it and skips the two that
    // must, so the suite's "never reaps after a clean exit" case and both
    // "reaps after ..." cases move in opposite directions at once. Verified
    // unique on the current source (grep -c -F = 1).
    control: {
      from: 'if (outcome.kind !== "exit") killGroup(result.pid, ownGroup);',
      to: 'if (outcome.kind === "exit") killGroup(result.pid, ownGroup);',
    },
    accepted: [],
  },
  /**
   * The send-authorization single-read lint
   * (BL-SEND-AUTH-SINGLE-READ-LINT, spec
   * docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md §5).
   *
   * Enrolled BEFORE this arc's first diff-review round, per the AGENTS.md
   * convergence contract: the mutation score plus an EMPTY unaccepted-survivor
   * set IS this arc's closable convergence criterion, and it is the acceptance
   * test for the one class four plan rounds bounded without proving empty —
   * "a weaker implementation passes my fixtures".
   *
   * A SURVIVING MUTANT OF THAT SHAPE IS BLOCKING AND MAY NOT BE ACCEPTED. The
   * `accepted-gap` mechanism is legitimate for a mutant whose kill would need
   * machinery out of proportion to the risk; it is NOT available here. If a
   * survivor demonstrates that a weaker implementation passes the suite — a node
   * kind unexamined, a comment syntax unrecognized, an import form unfollowed, an
   * exemption reaching past its rule — the repair is a fixture and a code change.
   * `equivalent` is likewise unavailable for that shape: a mutant that changes
   * which inputs the scanner classifies is not behaviour-preserving by
   * definition.
   */
  {
    id: "sendAuthScan",
    sourcePath: "tests/paneCompaction/sendAuthScan.ts",
    suitePaths: ["tests/paneCompaction/_metaSendAuthSingleRead.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 1,
    // Widens the ambient exemption from "an AMBIENT member handed on as a
    // callback" to "anything handed on", which is precisely the hole the AC-2
    // triple exists to close: `read-callback-reports` must report and would fall
    // silent. Verified unique on the current source (grep -c -F = 1).
    control: {
      from: "if (ambient.has(member) && handedOn) return;",
      to: "if (handedOn) return;",
    },
    accepted: [],
  },
  /**
   * The connection census (BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION). Pure AST over a
   * source string plus an INJECTED import resolver, DB-free and subprocess-free, with a
   * deciding suite that is entirely constructed sources — the shape the registry can
   * express, enrolled BEFORE the first diff-review round because "the guard does not pin
   * what it claims" is exactly the finding class a score plus an empty survivor set
   * settles mechanically.
   *
   * The LIVE gate (`_metaConnectionCensusGuard.test.ts`) is deliberately NOT a deciding
   * suite: it reads the whole `tests/` tree, and a score whose input set includes the
   * repository is not closable. What it proves — that the corpus needs exactly the
   * disposition rows it carries — is a measurement, not a behaviour.
   */
  {
    id: "connectionCensus",
    sourcePath: "tests/db/_connectionCensus.ts",
    suitePaths: ["tests/db/connectionCensus.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.95,
    // Inverts the exact-match that decides `validation-env`: under `!==` no environment
    // chain matches its accept-set entry, so every validation-env fixture — the largest
    // class in the suite — reds. Verified unique on the current source (grep -c -F = 1),
    // and the deciding suite asserts that uniqueness executably rather than in prose.
    control: {
      from: "chain.every((n, i) => n === r.names[i])",
      to: "chain.every((n, i) => n !== r.names[i])",
    },
    accepted: [
      {
        siteId: "statement-removal:1326:9:continue;>(removed)",
        kind: "equivalent",
        reason:
          "Removing the `continue` also pushes an out-of-population target onto `targets`, " +
          "so it reaches `edges` and then a file's `reaches` set. Nothing downstream can " +
          "observe it: `reaches.get(target)` and `classes.get(target)` are both absent for a " +
          "path that is not in `files` and fall through their `?? []`, and `affected` " +
          "(tests/db/_connectionCensus.ts:1367) only ever asks `reaches.get(f)?.has(input.file)` " +
          "for an `input` drawn from `files` — which an out-of-population target is, by the " +
          "definition of the branch, not a member of. The report is pushed on both sides.",
      },
      {
        siteId: "statement-removal:1358:13:grew = true;>(removed)",
        kind: "equivalent",
        reason:
          "Class growth can never be the LAST growth of a pass, so its signal is never the " +
          "one that keeps the loop alive. Classes and reach travel the same edge relation at " +
          "the same rate — one hop per pass — because both read the target's already-" +
          "propagated map in the same iteration. If `mine` gains a class at distance N, a " +
          "node exists at distance N, and that node grows `myReach` in the same pass " +
          "(tests/db/_connectionCensus.ts:1347,1352), which signals. The converse does not " +
          "hold, which is why the reach sites at 1211 and 1216 ARE killed, each by its own " +
          "chain fixture in the deciding suite.",
      },
    ],
  },
];
