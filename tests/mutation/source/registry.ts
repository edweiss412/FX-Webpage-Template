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
    // Measured 58/58 counted (61 mutants, 3 equivalent) on this branch. The
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
        siteId: "integer-literal:216:57:0>1",
        kind: "equivalent",
        reason:
          "the age loop at ledger-claims-core.ts:212 iterates the same `candidates` array `tipOf` was built from, so `tipOf.get(ref)` is always present and this `?? 0` is unreachable too",
      },
    ],
  },
  {
    id: "ledgerGit",
    sourcePath: "scripts/lib/ledger-git.ts",
    suitePaths: ["tests/scripts/ledgerClaimsCheck.test.ts"],
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
        siteId: "logical-connector:130:18:||>&&",
        kind: "equivalent",
        reason:
          "localRefs reads `for-each-ref --format=%(objectname) %(refname)`, which always emits BOTH fields, and a git refname cannot contain whitespace -- so a one-field line, the only input separating `||` from `&&` here, cannot occur. An empty trailing line splits to a single empty string, making oid falsy, so both operators skip it identically. Its lsRemote twin at :105 IS killed, because ls-remote's output is not under the same format guarantee",
      },
      {
        siteId: "logical-connector:83:12:||>&&",
        kind: "equivalent",
        reason:
          "parseRefLine has exactly one caller, lsRemote (ledger-git.ts:104), which feeds it lines of `git ls-remote --heads`; that format is OID TAB REF, so a line either splits into two truthy fields or is the trailing blank one, where both operands are falsy and `||` and `&&` agree. A one-truthy-field line, the only input that separates them, is not producible",
      },
      {
        siteId: "logical-connector:192:32:||>&&",
        kind: "equivalent",
        reason:
          "the only line `git branch -r --format='%(refname:short) %(objectname)'` emits with a missing field is the trailing blank one, where name is `''` and oid is undefined; `&&` declines to skip it, and the very next guard (ledger-git.ts:193) skips it on `name.length === 0` instead. Same outcome, one line later",
      },
      {
        siteId: "integer-literal:219:17:1>2",
        kind: "equivalent",
        reason:
          "`if (m?.[1] && m[2])` guards a regex whose two groups are `([0-9a-f]{40})` and `(.+)`; a match populates both non-empty and a non-match makes `m` null, so testing group 2 twice selects exactly the same lines as testing group 1 then group 2",
      },
      {
        siteId: "statement-removal:280:11:continue;>(removed)",
        kind: "equivalent",
        reason:
          "falling out of the `+++ b/` branch reaches the hunk regex, which is anchored at `^@@ ` and therefore cannot match a line the `^\\+\\+\\+ b/` regex just matched; the `!hm?.[1]` guard below then continues anyway",
      },
      {
        siteId: "logical-connector:325:14:||>&&",
        kind: "equivalent",
        reason:
          "headRepo's three inputs all end at the same answer under `&&`: an unset GITHUB_EVENT_PATH still returns null (existsSync(undefined) is false, not a throw), a set-but-missing path falls through to readFileSync, which throws into the function's own catch and returns null, and a readable path takes the identical branch either way",
      },
      // ---- accepted-gap: real, deliberately uncovered (spec §2.5) ----------
      //
      // One family, three sites. Separating a 30_000 ms bound from a 30_001 ms
      // one means a child that runs for exactly that long, so the assertion is
      // either a 30 s wait on a merge-gating suite or an injected spawn. Not
      // `equivalent`: a timeout a test COULD reach would be observable, so an
      // equivalence claim here would overclaim (spec limit L-7's posture).
      {
        siteId: "integer-literal:32:18:30000>30001",
        kind: "accepted-gap",
        reason: "FETCH_MS is passed straight to spawnSync's timeout; see the backlog entry",
        ref: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS",
      },
      {
        siteId: "integer-literal:33:22:30000>30001",
        kind: "accepted-gap",
        reason: "LS_REMOTE_MS, same family and same argument",
        ref: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS",
      },
      {
        siteId: "integer-literal:34:15:10000>10001",
        kind: "accepted-gap",
        reason: "GH_MS, same family and same argument",
        ref: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS",
      },
      // MAX_GIT_STDOUT (ledger-git.ts:62) joined the family with 229563b76: it
      // is handed straight to spawnSync's maxBuffer, so separating 64 MiB from
      // one mutant step past it means a child that emits that much stdout on a
      // merge-gating suite. Same injectable-spawn seam closes it (see the
      // backlog entry, extended to cover this fourth constant).
      {
        siteId: "integer-literal:62:24:64>65",
        kind: "accepted-gap",
        reason: "MAX_GIT_STDOUT's MiB count, passed straight to spawnSync's maxBuffer",
        ref: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS",
      },
      {
        siteId: "integer-literal:62:29:1024>1025",
        kind: "accepted-gap",
        reason: "MAX_GIT_STDOUT, same family and same argument",
        ref: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS",
      },
      {
        siteId: "integer-literal:62:36:1024>1025",
        kind: "accepted-gap",
        reason: "MAX_GIT_STDOUT, same family and same argument",
        ref: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS",
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
        siteId: "relational-boundary:161:14:<><=",
        kind: "equivalent",
        reason:
          "universeFiles' comparator reaches this `<` only when the two entry names differ, so `<=` cannot change the ordering",
      },
      {
        siteId: "integer-literal:161:26:1>2",
        kind: "equivalent",
        reason: "comparator magnitude is unread — Array.sort consumes the sign only",
      },
      {
        siteId: "integer-literal:161:30:1>2",
        kind: "equivalent",
        reason: "same comparator, positive branch; the sign is unchanged",
      },
      {
        siteId: "relational-boundary:347:50:<><=",
        kind: "equivalent",
        reason:
          "the site comparator reaches this `<` only when the files differ, because `a.file === b.file` is tested first",
      },
      {
        siteId: "integer-literal:347:62:1>2",
        kind: "equivalent",
        reason: "comparator magnitude is unread — sign only",
      },
      {
        siteId: "integer-literal:347:66:1>2",
        kind: "equivalent",
        reason: "same comparator, positive branch; the sign is unchanged",
      },
      // ---- equivalent: the flip cannot change which branch is taken -------
      {
        siteId: "logical-connector:287:43:&&>||",
        kind: "equivalent",
        reason:
          "both arms yield the SAME name for every input that reaches them: for an identifier `delay.text` equals `delay.getText(sf)` (no whitespace, far under the 60-char slice), and for a non-identifier `delay.text` is undefined so the `||` arm is false anyway",
      },
      {
        siteId: "logical-connector:362:38:||>&&",
        kind: "equivalent",
        reason:
          "the operands are never independently true: a site is `unclassified` if and only if its value is null, because the push sites guarantee it — so `||` and `&&` select the same rows",
      },
    ],
  },
];
