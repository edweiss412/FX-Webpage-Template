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
        siteId: "regex-quantifier-bound:30:17:{0,3}>{0,4}",
        kind: "equivalent",
        reason:
          "GATE only ever runs on lines already admitted by GATE_ANY (redContract.ts:29, itself {0,3}), so every candidate has <=3 leading spaces and widening this bound admits nothing — the same reachability argument the taskContract MARKER rows carry",
      },
      {
        siteId: "relational-boundary:73:21:<><=",
        kind: "equivalent",
        reason:
          "the marker scan reads one index past the end; model.fencedInfo[len] is undefined, so the loop's own fence guard skips the iteration before model.lines[i] is read",
      },
      {
        siteId: "integer-literal:136:58:1>2",
        kind: "equivalent",
        reason:
          'Math.min(extent.end, lines.length + 1) -> + 2 extends the fenced scan one line past the end, where fencedInfo is undefined and the `typeof !== "string"` guard skips it — fence CONTENT can never sit past the last line',
      },
      {
        siteId: "relational-boundary:137:32:<><=",
        kind: "equivalent",
        reason: "same one-past-the-end argument as the clamp above; the fence guard skips it",
      },
      {
        siteId: "relational-boundary:203:53:>>>=",
        kind: "equivalent",
        reason:
          "`line > e.start` at equality means a marker ON the task heading line, and a heading cannot match MARKER_ANY, so the case is unreachable",
      },
      {
        siteId: "relational-boundary:203:71:<><=",
        kind: "equivalent",
        reason:
          "`line < e.end` at equality means a marker ON the extent's terminating line — the next heading or the region close — and neither is marker-shaped",
      },
      {
        siteId: "relational-boundary:233:21:<><=",
        kind: "equivalent",
        reason: "gate scan one-past-the-end, same argument as the marker scan at :73",
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
    // deleted rather than blessed. These seven are reachability arguments.
    accepted: [
      {
        siteId: "logical-connector:387:32:&&>||",
        kind: "equivalent",
        reason:
          "`receiver !== null && checked.has(receiver)` decides whether a `.begin` callback parameter is checked. Under `||` a callback of an UNCHECKED receiver would also be checked -- but Rule 1 rejects that `.begin(...)` call itself (`begin` is in EXECUTION_METHODS and the receiver is not a checked client), and the call is an ANCESTOR of the callback body, so the walk reaches it first. Both operators produce the same verdict and the same reason; fixture (aj) is the case",
      },
      {
        siteId: "integer-literal:391:19:0>1",
        kind: "equivalent",
        reason:
          "the checked-set fixpoint's start index. The loop breaks the first time a pass adds nothing, and each growing pass adds at least one name, so at most `candidates.size` passes can grow; starting at 1 still allows `size` iterations, which is enough to resolve any dependency chain over `size` names",
      },
      {
        siteId: "relational-boundary:391:27:<><=",
        kind: "equivalent",
        reason:
          "same loop: `<=` permits one further iteration that the `!grew` break has already made unreachable",
      },
      {
        siteId: "integer-literal:391:47:1>2",
        kind: "equivalent",
        reason:
          "same loop: the bound is `candidates.size + n` for any n >= 1, and the break-on-no-growth condition fires before either bound is reached",
      },
      {
        siteId: "relational-boundary:396:24:>>>=",
        kind: "equivalent",
        reason:
          "`decls.length > 0` guards `every()` returning true vacuously. A candidate name is only ever added from a VariableDeclaration or a Parameter, and declarationsOf collects both, so a candidate with zero declarations cannot occur -- the `>= 0` mutant admits a case the candidate set cannot contain",
      },
      {
        siteId: "logical-connector:502:73:&&>||",
        kind: "equivalent",
        reason:
          "Rule 3's tag test, `isTaggedTemplateExpression(p) && p.tag === n`. Under `||` the second disjunct alone would admit an identifier whose parent is a tagged template but which is NOT its tag -- and a TaggedTemplateExpression's identifier children are the tag and its type arguments only. A type argument is a type, not a value, so no checked CLIENT identifier can occupy that position",
      },
      {
        siteId: "relational-boundary:602:29:>>>=",
        kind: "equivalent",
        reason:
          "`d.node.getStart(sf) > connectPos` is the ordering leg: the guard declaration must precede the connection. `>=` additionally rejects a declaration starting at exactly the connection's offset, which two distinct AST nodes in one file cannot do",
      },
      {
        siteId: "logical-connector:370:61:&&>||",
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
    accepted: [
      // ---- equivalent: comparator sign-not-magnitude (spec §2.4) ----------
      //
      // Array.sort consumes the SIGN of a comparator's result and never its
      // magnitude, so -1 -> -2 and 1 -> 2 sort identically. The `<` -> `<=`
      // flips are unreachable for a related reason: each sits in the ELSE
      // branch of an equality test, so the operands are already known to
      // differ and `<=` cannot decide anything `<` did not. Same class
      // taskContract carries four of.
      {
        siteId: "relational-boundary:208:14:<><=",
        kind: "equivalent",
        reason:
          "universeFiles' comparator reaches this `<` only when the two entry names differ, so `<=` cannot change the ordering",
      },
      {
        siteId: "integer-literal:208:26:1>2",
        kind: "equivalent",
        reason: "comparator magnitude is unread — Array.sort consumes the sign only",
      },
      {
        siteId: "integer-literal:208:30:1>2",
        kind: "equivalent",
        reason: "same comparator, positive branch; the sign is unchanged",
      },
      {
        siteId: "relational-boundary:453:50:<><=",
        kind: "equivalent",
        reason:
          "the site comparator reaches this `<` only when the files differ, because `a.file === b.file` is tested first",
      },
      {
        siteId: "integer-literal:453:62:1>2",
        kind: "equivalent",
        reason: "comparator magnitude is unread — sign only",
      },
      {
        siteId: "integer-literal:453:66:1>2",
        kind: "equivalent",
        reason: "same comparator, positive branch; the sign is unchanged",
      },
      // ---- equivalent: the flip cannot change which branch is taken -------
      {
        siteId: "logical-connector:393:43:&&>||",
        kind: "equivalent",
        reason:
          "both arms yield the SAME name for every input that reaches them: for an identifier `delay.text` equals `delay.getText(sf)` (no whitespace, far under the 60-char slice), and for a non-identifier `delay.text` is undefined so the `||` arm is false anyway",
      },
      {
        siteId: "logical-connector:468:38:||>&&",
        kind: "equivalent",
        reason:
          "the operands are never independently true: a site is `unclassified` if and only if its value is null, because the push sites guarantee it — so `||` and `&&` select the same rows",
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
    accepted: [],
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
    accepted: [],
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
];
