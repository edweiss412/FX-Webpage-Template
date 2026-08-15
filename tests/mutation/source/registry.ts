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
    id: "taskContract",
    sourcePath: "lib/specLint/taskContract.ts",
    // BOTH suites, and the second one is load-bearing: `compareFindings` is
    // exercised only by the ordering suite, so without it every mutant inside
    // the comparator survives for want of a test that ever calls it — which is
    // exactly what the gate reported when the function was first extracted.
    suitePaths: [
      "tests/specLint/taskContract.test.ts",
      "tests/specLint/taskContractFindingOrder.test.ts",
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
        siteId: "regex-quantifier-bound:39:30:{0,3}>{0,4}",
        kind: "equivalent",
        reason:
          "MARKER only ever runs on lines already admitted by MARKER_ANY (taskContract.ts:22, itself {0,3}), so every candidate has <=3 leading spaces and widening this bound admits nothing",
      },
      {
        siteId: "regex-quantifier-bound:45:40:{0,3}>{0,4}",
        kind: "equivalent",
        reason:
          "same reachability argument as MARKER; MARKER_AC_ABSENT runs only on MARKER_ANY hits",
      },
      {
        siteId: "relational-boundary:57:21:<><=",
        kind: "equivalent",
        reason:
          "the extra iteration reads lines[i] === undefined; RegExp.test coerces it to the string 'undefined', which no AC-id pattern matches",
      },
      {
        siteId: "integer-literal:84:19:0>1",
        kind: "equivalent",
        reason:
          "openDepth's initial value is dead: it is read only where a region is pushed, and both push sites are guarded by `open`, which is set true only by the OPEN branch that assigns openDepth two lines later (taskContract.ts:97-101)",
      },
      {
        siteId: "integer-literal:85:19:0>1",
        kind: "equivalent",
        reason:
          "openStart's initial value is dead by the same guarded-by-`open` argument as openDepth: it is assigned in the branch that sets `open`, and read only where `open` is true",
      },
      {
        siteId: "relational-boundary:89:21:<><=",
        kind: "equivalent",
        reason:
          "the extra iteration reads model.lines[i] === undefined; OPEN/END/TASKS_ANY/MARKER_ANY all fail against the coerced string 'undefined'",
      },
      {
        siteId: "statement-removal:138:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falling through reaches MARKER_ANY, which cannot match a '<!-- tasks:' line: after '<!-- task' the next character is 's', not ':'",
      },
      {
        siteId: "integer-literal:148:16:0>1",
        kind: "equivalent",
        reason:
          "a marker-shaped line on document line 1 cannot be fenced (no fence opens before line 1, and a fence-opening line is backticks/tildes so it is never marker-shaped), so it is already in markerLines from pass 1",
      },
      {
        siteId: "relational-boundary:148:21:<><=",
        kind: "equivalent",
        reason: "extra iteration reads undefined; MARKER_ANY.test('undefined') is false",
      },
      {
        siteId: "integer-literal:153:90:1>2",
        kind: "equivalent",
        reason:
          "the EOF-closed region's end: no heading or marker can exist at length+1, so '< length+1' and '< length+2' select identically",
      },
      {
        siteId: "relational-boundary:166:49:>>>=",
        kind: "equivalent",
        reason: "a heading cannot occupy the same line as the '<!-- tasks: depth=N -->' opening",
      },
      {
        siteId: "relational-boundary:166:74:<><=",
        kind: "equivalent",
        reason:
          "a heading cannot occupy the same line as '<!-- tasks: end -->', and for the one region that can be unclosed, region.end is past EOF",
      },
      {
        siteId: "statement-removal:191:11:break;>(removed)",
        kind: "equivalent",
        reason:
          "model.headings is built by one ascending loop (lib/specLint/parse.ts:86, push at :134), so with end = Math.min(end, h.line) the first match is already the minimum and continuing cannot lower it",
      },
      {
        siteId: "relational-boundary:202:40:>>>=",
        kind: "equivalent",
        reason: "a marker line can never equal a heading line",
      },
      {
        siteId: "relational-boundary:202:58:<><=",
        kind: "equivalent",
        reason:
          "an extent's end is either the next heading line or its own region's close; a marker can occupy neither",
      },
      {
        siteId: "statement-removal:216:7:continue;>(removed)",
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
        siteId: "integer-literal:289:52:1>2",
        kind: "equivalent",
        reason:
          "Array.prototype.sort observes a comparator result's SIGN, never its magnitude; -1 and -2 are indistinguishable to it",
      },
      {
        siteId: "integer-literal:289:56:1>2",
        kind: "equivalent",
        reason: "same sign-not-magnitude argument: 1 and 2 are indistinguishable to sort",
      },
      {
        siteId: "integer-literal:290:64:1>2",
        kind: "equivalent",
        reason: "same sign-not-magnitude argument, on the message tiebreak",
      },
      {
        siteId: "integer-literal:290:68:1>2",
        kind: "equivalent",
        reason: "same sign-not-magnitude argument, on the message tiebreak",
      },
      {
        siteId: "relational-boundary:289:40:<><=",
        kind: "equivalent",
        reason:
          "the branch is guarded by `a.code !== b.code`, so `<` and `<=` are only ever evaluated on UNEQUAL operands, where they agree. Unlike the old accepted-gap rows this rests on control flow in the function itself, not on V8's sort being stable",
      },
      {
        siteId: "relational-boundary:290:49:<><=",
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
        siteId: "statement-removal:77:7:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falling through after the recursive walk reaches `if (!entry.isFile()) continue;` on the very next line (corpus.ts:79), and a Dirent for a directory returns false from isFile(), so neither push below it can be reached",
      },
      {
        siteId: "relational-boundary:144:25:<><=",
        kind: "equivalent",
        reason:
          'the extra iteration reads lines[i] === undefined, which `?? ""` turns into the empty string, and the blank-line skip at corpus.ts:146 continues before parseRow sees it',
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
        siteId: "relational-boundary:454:50:<><=",
        kind: "equivalent",
        reason:
          "the site comparator reaches this `<` only when the files differ, because `a.file === b.file` is tested first",
      },
      {
        siteId: "integer-literal:454:62:1>2",
        kind: "equivalent",
        reason: "comparator magnitude is unread — sign only",
      },
      {
        siteId: "integer-literal:454:66:1>2",
        kind: "equivalent",
        reason: "same comparator, positive branch; the sign is unchanged",
      },
      // ---- equivalent: the flip cannot change which branch is taken -------
      {
        siteId: "logical-connector:394:43:&&>||",
        kind: "equivalent",
        reason:
          "both arms yield the SAME name for every input that reaches them: for an identifier `delay.text` equals `delay.getText(sf)` (no whitespace, far under the 60-char slice), and for a non-identifier `delay.text` is undefined so the `||` arm is false anyway",
      },
      {
        siteId: "logical-connector:469:38:||>&&",
        kind: "equivalent",
        reason:
          "the operands are never independently true: a site is `unclassified` if and only if its value is null, because the push sites guarantee it — so `||` and `&&` select the same rows",
      },
    ],
  },
];
