# premiseScan Import-Edge Fidelity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `premiseScan`'s cross-module lookup resolve EXPORTS rather than local declarations, and make the traversal carry its reasons to every caller — closing both false negatives of `BL-PREMISESCAN-IMPORT-EDGE-FIDELITY` without re-opening the AC-10b false positive.

**Architecture:** One merge-gate task, then five TDD tasks. Task 1 is the structural one: it replaces the lookup AND changes `reaches` to return `{ verdict, reasons }`, so the reason channel reaches all three call sites and every later task can go red and green entirely within itself. Round-1 review found the earlier decomposition had Task 2's green depending on Task 3's routing; that is why routing moved into Task 1. Then a verification task (performance ratio + mutation ledger, with one acceptance retired rather than re-keyed) and a graduation task.

**Tech Stack:** TypeScript, the `typescript` compiler API (AST only — never the type checker), vitest, the in-repo source-mutation harness (`tests/mutation/source/*`), tsx.

**Spec:** `docs/superpowers/specs/ci/2026-08-16-premisescan-import-edge-fidelity-design.md` — read it in full first. §1 (convergence contract), §1.1 (do-not-relitigate), §2 (design), §4 (documented limits) and §6 (acceptance criteria) are the contract every task argues from. Probe record: `docs/superpowers/specs/ci/probes/2026-08-16-premisescan-import-edge-probe.md`.

## Global Constraints

- Worktree-only work (AGENTS.md invariant 11); TDD per task (invariant 1); commit per task, conventional-commits (invariant 6). Scope prefix: `fix(mutation)` for scanner changes, `test(infra)` for registry work, `docs(backlog)` for graduation.
- **BLOCKED ON PR #827 (`fix/scanner-scope-totality`) MERGING.** That PR rewrites the very lookup this arc replaces. Do not edit `tests/mutation/source/premiseScan.ts` before Task 0 confirms #827 is on `origin/main`.
- Spec §1.1 is binding and every item ratified: scope-aware extents and the AC-10b `res` collision are settled; module-closure resolution is REJECTED; the recognized-unresolvable list stays CLOSED at four forms, and this arc makes form 3 reachable while form 4 stays unreachable and filed; symbol-level data-flow analysis is declined; `node_modules` is pure (L-2) and undetected ≠ unclassifiable (L-8); the §2.7 precedence asymmetry is a decision.
- **Verdict-neutrality is the headline constraint.** `tests/mutation/_metaPremiseContract.test.ts` asserts each enrolled suite's `environment-touching` count with an exact `toBe` AND asserts the unclassifiable set is EMPTY. No task may edit a numeric value in `EXPECTED_ENV_TOUCHING`, and no task may leave any enrolled test `unclassifiable`. Spec §3.3 measured zero occurrences of every repaired form in that domain, so this is achievable rather than aspirational — if a task needs to change a number, the repair over-reached and the task stops.
- **The test-file placeholder is `__MODULE__`, not `MODULE`.** The shipped helper is `testSrc.replace("__MODULE__", \`./mod${id}\`)`, inside the `scope-aware extent resolution` block. A fixture written `from "./MODULE"` is not substituted at all, `resolveSpecifier` misses, and the case is pure for a TEST-LOCAL reason — an invalid RED by construction that can never go green. Round-1 review found every Task 1 fixture broken this way. Note also that `String.prototype.replace` with a string pattern replaces only the FIRST occurrence, which is why the multi-module helper below uses `split`/`join`.
- **A `-t` filter that matches nothing EXITS 0 — probed, not assumed.** `npx vitest run tests/mutation/source/premiseScan.test.ts -t "no such block name xyzzy"` reports `Tests 22 skipped (22)` and exits `0`. Every `red=` below filters on a describe block that does not exist until that task's Step 1 writes it, so: (a) Step 1 always precedes the red observation — never reorder; (b) the red criterion is a non-zero **FAILING** count, never a non-zero exit and never `skipped`.
- **Heavy-slot rule (AGENTS.md).** Every full harness run is `pnpm heavy pnpm mutation:guards`; every full suite run is `pnpm heavy pnpm test`. Scoped vitest runs with an explicit file list stay UNWRAPPED — Tasks 1-5 and 7 use such runs deliberately unwrapped; Task 6's `red=` is the harness itself and IS wrapped.
- **AST only, never the type checker.** `premiseScan` builds source files with `ts.createSourceFile` and has no `ts.Program`. Introducing one would need a program build per module and blow AC-14.
- **Every reporting case asserts its REASON, via `expectReported` — no bare `.toBe("unclassifiable")` anywhere.** Round-2 review counted 28 such executions and round-3 counted 30 after the re-cut that asserted only the verdict, across Tasks 1, 3, 4 and 5; each would pass on a generic or misattributed reason while the arc's central reason-carrying contract went unproved. The rule is stated once here and enforced by the helper rather than by 30 hand-written checks, so a case added later inherits it: if a new case expects `unclassifiable`, it calls `expectReported(classificationWithModules(…), { construct, module })`. The only exception is a case whose subject IS the verdict lattice (AC-12's precedence branches), which asserts the verdict alone and says so inline.
- **No bound expressed as a NUMBER.** Termination comes from the finite `(modulePath, exportName)` visited set (spec §2.5), never a depth counter.
- impeccable-gate: N/A — no UI surface. No file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*` or `DESIGN.md` is touched.

**Meta-test inventory (writing-plans rule):** **EXTENDS** `tests/mutation/source/premiseScan.test.ts` (new fixture groups and three module-scope helpers); **EXTENDS** `tests/mutation/source/registry.ts` (the `premiseScan` row's `accepted` array — re-keyed where the reasoning survives, one row RETIRED); **EXTENDS** `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS.premiseScan` is `{ equivalent: 3, "accepted-gap": 1 }` asserted with `toEqual`, so retiring a row reds it — this file was missing from the round-1 plan, and its omission is the exact fan-out class this inventory exists to catch); **EXTENDS COMMENTS ONLY** in `tests/mutation/_metaPremiseContract.test.ts`. **CREATES** no new meta-test — `_metaPremiseContract.test.ts` already walks the enrolled suites from the registry and already asserts the unclassifiable set is empty. No Supabase call boundary, no `admin_alerts` row, no tile sentinel, no advisory lock, no §12.4 row, no migration.

**Mutation-family closure (writing-plans rule):** the operator families are fixed by the ratified registry row — `relational-boundary`, `equality-flip`, `integer-literal` over `tests/mutation/source/premiseScan.ts`, `scoreFloor: 0.95`. A reviewer-proposed NEW family is a registry change carrying its own before/after numbers, not a finding against this plan.

**Probe evidence, authored AND run**, re-verified 2026-08-16 against `origin/fix/scanner-scope-totality` at **`4e40db2b3`** — the branch advanced five commits during spec review and every row below was re-run against the new head UNCHANGED (spec §3.12). Task 0 Step 3 re-runs them once more against the merged tree:

| task | probe rows | current verdict |
| --- | --- | --- |
| Task 1 | `H1 default_renamed` (+ `default_samename` as the coincidence foil), `B8` | `environment-free` |
| Task 2 | `H1 reexport named` / `aliased` / `star` / `default` / `chain 2-deep` / `local reexport` | all `environment-free` |
| Task 3 | `H1 unfollowable reexport`, `H1 reexport namespace`, `B9 export namespace` | all `environment-free` |
| Task 4 | `H1 namespace member`, `H1 namespace destructured`, `DYN-NS` | all `environment-free` |
| Task 5 | `H2` four cells, `H2 cross-module dynamic`, `C1` / `C2` / `C3` | all `environment-free` |

---

### Task 0 (setup, outside the checked task region): Merge gate, baseline, citation refresh

**Files:** none tracked, unless the merge conflicts.

**Interfaces:** Produces a worktree whose `tests/mutation/source/premiseScan.ts` is the post-#827 version, a confirmation that the probe tables still hold, and the corpus-pass baseline AC-14's ratio is measured against. Every later task assumes all three.

- [ ] **Step 1: Confirm #827 is merged.**

```bash
git fetch origin
gh pr view 827 --json state,mergedAt --jq '{state, mergedAt}'
```

Expected: `{"state":"MERGED", …}`. If still `OPEN`, STOP — set the ship marker's `blockedOn` to `awaiting PR #827 merge` and wait. Nothing below is safe to start.

- [ ] **Step 2: Merge and verify the target is present.**

```bash
git merge origin/main --no-edit
rg -n "function moduleScopeExtent|function unclassifiableWithin|function resolveSpecifier|function extentIsProvenance|const scopeCache" tests/mutation/source/premiseScan.ts
```

Expected: all five symbols resolve. If `moduleScopeExtent` is absent, the design's central citation is stale — STOP and re-derive spec §2.1 before writing code.

- [ ] **Step 3: Re-run the BEHAVIOURAL probe harnesses against the merged tree.** Recreate them from the probe record's Method sections under a gitignored `.claude/probe/` directory, importing `classifyTests` from the merged source. **Name what is re-run and what is not** — a round-1 draft ran one script and claimed the probe record's tables entire, which is the "claim wider than its harness" class that cost the spec three rounds.

**Re-point the harnesses at the MERGED tree first — this is a command, not an instruction.** Every behavioural harness was authored against a draft-time SNAPSHOT of the scanner (`premiseScan827`) and the runtime harness hardcodes a snapshot registry. Re-running them as authored re-measures the snapshot and reports "unchanged" without ever reading the merged scanner, which is the exact failure this step exists to prevent:

```bash
mkdir -p .claude/probe && git check-ignore -v .claude/probe
# 1. Point every harness at the MERGED source and the TRACKED registry.
cp tests/mutation/source/premiseScan.ts .claude/probe/premiseScan827.ts
perl -pi -e 's{readFileSync\(join\(ROOT, "\.claude/probe/registry827\.ts"\)}{readFileSync(join(ROOT, process.env.REGISTRY_SRC ?? "tests/mutation/source/registry.ts")}g' \
  .claude/probe/runtimeImportShapes.ts
# 2. Prove the re-point took: the copied snapshot must equal the merged source.
diff -q .claude/probe/premiseScan827.ts tests/mutation/source/premiseScan.ts \
  || { echo "harness is not reading the merged scanner"; exit 1; }
grep -q 'registry827' .claude/probe/runtimeImportShapes.ts \
  && { echo "runtime harness still hardcodes the snapshot registry"; exit 1; }
```

Then run them:

```bash
npx tsx .claude/probe/importForms.ts        # spec §3.1 + §3.2 tables
npx tsx .claude/probe/hookSeed.ts           # spec §3.11 rows A-E
npx tsx .claude/probe/exportedDynamic.ts    # spec §3.12 exported-dynamic rows
REGISTRY_SRC=tests/mutation/source/registry.ts npx tsx .claude/probe/runtimeImportShapes.ts # spec §3.13
REGISTRY_SRC=tests/mutation/source/registry.ts npx tsx .claude/probe/acceptSetCover.ts
WIDE=1 REGISTRY_SRC=tests/mutation/source/registry.ts npx tsx .claude/probe/acceptSetCover.ts
```

**Point every harness at the LIVE registry, not the gitignored snapshot.** The runtime-shape harness and the accept-set cover harness both read `REGISTRY_SRC`, which defaults to a registry SNAPSHOT taken under the gitignored probe directory at draft time; that snapshot held 31 `suitePaths` while the branch had already moved to 33. Re-anchoring against a stale snapshot is the moving-base defect this step exists to catch, wearing the step's own clothes — so each command above passes the tracked registry explicitly.

Expected: spec §3.1, §3.2, §3.11, §3.12 and §3.13 unchanged, and §3.3b's live figure still zero misses. **NOT re-run here, and not claimed:** probe 3 (the §3.3/§3.4 population walk) whose source the probe record deliberately describes rather than reproduces, and the §3.6-§3.9 one-off narrowing probes. Those fed draft-time design decisions that AC-1 re-derives executably; if a §3.1/§3.2/§3.11/§3.13 row has moved, **the design is re-derived before implementation, not after.**

- [ ] **Step 4: Record the AC-14 baseline — the CORPUS PASS, not the suite duration.** The two deciding suites take about 20.7 s of vitest wall clock, roughly 19 s of which is four spawned `childRun` fixtures; the scan itself is ~1.5 s, and the regression AC-14 guards against is a 3.7× move at that grain.

```bash
npx tsx -e '
import { classifyTests } from "./tests/mutation/source/premiseScan";
import { GUARD_SURFACES } from "./tests/mutation/source/registry";
const ROOT = process.cwd();
const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();
const t0 = Date.now();
let n = 0;
for (const s of suites) n += classifyTests(ROOT, s).length;
console.log(`suites=${suites.length} tests=${n} corpus-pass=${((Date.now() - t0) / 1000).toFixed(2)}s`);
'
npx vitest run tests/mutation/_metaPremiseContract.test.ts 2>&1 | tail -6
```

Write the seconds figure to `"$PROBE_DIR/corpus-pass-baseline.txt"`, where **`PROBE_DIR="$(git rev-parse --show-toplevel)/.claude/probe"`** — define it in the shell before the command below, and use the same definition in Task 6 Step 1. A round-1 draft referenced `$PROBE_DIR` in Task 6 without ever defining it anywhere, so the ratio gate failed on a missing file (`cat: /corpus-pass-baseline.txt: No such file or directory`) rather than on scanner performance. Write it with:

```bash
PROBE_DIR="$(git rev-parse --show-toplevel)/.claude/probe"; mkdir -p "$PROBE_DIR"
# … run the measurement above, then:
# Write it from the MEASUREMENT, never by transcription: a literal placeholder,
# a copied figure, or any typo becomes NaN, and NaN fails both AC-14 comparisons
# OPEN (`NaN > 30` and `NaN > base*3` are both false), so a 1.5s -> 29s
# regression would pass the very gate that exists to catch it. This is the whole
# command, with no elision: a round-2 draft wrote `npx tsx -e '…the measurement
# above…'`, which is not runnable (`ERROR: Unexpected "…"`).
npx tsx -e '
import { classifyTests } from "./tests/mutation/source/premiseScan";
import { GUARD_SURFACES } from "./tests/mutation/source/registry";
const ROOT = process.cwd();
const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();
const t0 = Date.now();
for (const s of suites) classifyTests(ROOT, s);
console.log(((Date.now() - t0) / 1000).toFixed(2));
' > "$PROBE_DIR/corpus-pass-baseline.txt"
grep -Eq '^[0-9]+(\.[0-9]+)?$' "$PROBE_DIR/corpus-pass-baseline.txt" \
  || { echo "baseline is not a bare positive number"; exit 1; }
```

The file is a gitignored scratch file in the worktree's probe directory — Task 6 Step 1 reads that file and fails on a ratio, so the baseline must be a recorded value rather than a remembered one. The pre-merge measurement on 2026-08-16 was `suites=29 tests=1314 corpus-pass=1.49s`; post-#827 the suite count is 33 unique `suitePaths` across 40 registry rows (re-parsed from the tracked registry at round 3; a round-1 draft said 31, which was the count when this plan was first drafted and the branch has moved since), so re-measure rather than reusing that number. Expected: the meta-contract PASSES with every declared count holding — 33 rows post-#827, the two added being `tests/mutation/source/premiseScan.test.ts` (declared `0`) and `tests/mutation/_metaPremiseContract.test.ts` (declared `1`).

- [ ] **Step 6: Confirm the two backlog rows are present** — they are already filed on this branch, in the spec+plan segment, because the tracked spec and plan cite both IDs and `_metaLedgerReferentialIntegrity.test.ts` reds the moment a citation has no definition. That gate is red on a docs-only branch, not merely at Task 6, which is why the rows could not wait for the implementation segment.

```bash
rg -n "^### BL-PREMISESCAN-(UNPARSEABLE-MODULE-UNREACHABLE|NESTED-HOOK-SIBLING-LEAK)" BACKLOG.md
```

Expected: both headings present, each with `**Status:** OPEN` and an `**Effort:**` field (`tests/docs/_metaLedgerSizing.test.ts` rejects an unsized open row). If either is missing, file it before writing any code rather than deferring to Task 7.

- [ ] **Step 7: Run the ledger gates now that the rows exist.**

```bash
npx vitest run tests/docs/_metaLedgerInProgress.test.ts \
  tests/docs/_metaLedgerSizing.test.ts \
  tests/docs/_metaLedgerReferentialIntegrity.test.ts \
  tests/docs/_metaDeferralLedgerGraduation.test.ts \
  tests/docs/_metaReviewRoundEconomy.test.ts \
  tests/docs/specsReadmeIndexParity.test.ts
```

Expected: all PASS. This is the fan-out a round-3 draft ran only three of; the sizing gate rejects an unsized row, referential integrity is what Task 6's full suite needs, and the graduation gate checks active/archive consistency at Task 7.

- [ ] **Step 5b: Typecheck this plan's own test blocks before writing any of them.**

Three consecutive review rounds found defects in the fenced `ts` blocks below that a compiler reports instantly: a duplicate helper definition, 43 calls to a helper a previous edit had renamed away, 13 `expect(x, {…})` calls with no matcher, and classification objects compared to verdict strings. Each was introduced by a scripted edit to this document and caught by a reviewer rather than by its author.

```bash
npx tsx .claude/probe/planTypecheck.ts docs/superpowers/plans/2026-08-16-premisescan-import-edge-fidelity.md
```

Expected: `reported=0 shapes=0`, exit 0. The script splices every test-shaped `ts` block into one virtual file ahead of the module surface those blocks assume and reports the diagnostic classes that matter here (`TS2393` duplicate implementation, `TS2304` undefined name, `TS2554` wrong arity, `TS2339`/`TS2551` bad property, `TS2367` impossible comparison, `TS2345` bad argument).

**It also carries shape checks the compiler cannot make.** `expect(classificationWithModules(…)).toBe("environment-touching")` compares an OBJECT to a STRING; `toBe` accepts anything, so it typechecks cleanly and fails at runtime on every such case. Six survived a pass that reported zero diagnostics, which is why `shapes` is a separate counter and why "the typecheck was green" is not by itself evidence a block is sound. **Re-run it after ANY edit to a test block in this plan** — that is the gate the three rounds above were paying for, and copying a block into `premiseScan.test.ts` before it typechecks here just moves the failure.

- [ ] **Step 5: Note the corpus base-sha split.** The merge moves `git merge-base origin/main HEAD`, so rows already written under `docs/review-rounds/fix/premisescan-import-edges/` for the pre-merge base sit beside a second file keyed on the post-merge one. That is intended — round counts are per merge-base — but Task 7 must read BOTH.

```bash
ls docs/review-rounds/fix/premisescan-import-edges/
git merge-base origin/main HEAD | cut -c1-12
```

---

<!-- tasks: depth=3 red-contract -->

### Task 1: Export resolution core, and a traversal that carries its reasons

Spec §2.1, §2.2 rows E1-E4, §2.4, and §2.6 items 1 and 3. The structural task.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "export resolution"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:111` why=`ANCHOR IS PRE-MERGE: :111 is the default-import registration on the tracked tree today (imports.set(clause.name.text, spec)); Task 0 merges #827 and re-anchors before this task runs. The defect is identical in both versions - the default-import branch records the LOCAL name, so the cross-module lookup asks the target for an export named "runIt" when its default export is named "default". Probe row H1 default_renamed measures environment-free today and the new "a renamed default import resolves" case reds on exactly that, greening once the branch records "default" and resolveExport handles E3/E4` ac=AC-4,AC-4b,AC-5,AC-5d,AC-9,AC-9b,AC-9c,AC-9d -->

**Files:**

- Modify: `tests/mutation/source/premiseScan.ts`
- Test: `tests/mutation/source/premiseScan.test.ts`

**Interfaces:**

- Produces, in `premiseScan.ts` (module-private):

```ts
type ExportResolution =
  | { kind: "extent"; nodes: ts.Node[] }
  | { kind: "forward"; spec: string; exportName: string }
  | { kind: "data" }                       // .json ONLY -> pure, like a bare specifier (.mdx REPORTS)
  | { kind: "noSuchExport" }               // pure on a direct request, benign miss on a star branch
  | { kind: "unresolvable"; reason: string };

type Reach = { verdict: Verdict; reasons: string[] };

// §2.4's three answers. `.jsx` is HERE because it is analyzed today (probe §3.9);
// omitting it would make this repair introduce a silent free.
const LANGUAGE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"] as const;
// `.json` ONLY. `.mdx` is NOT data: this repo executes MDX (next.config.ts:54
// pageExtensions, @mdx-js/rollup in vitest.config.ts), so purifying it is a
// silent free: spec §2.4 answer 2, §3.11, §4 limit 13. It falls to answer 3.
const DATA_EXTENSIONS = [".json"] as const;
// Every other shape resolveSpecifier lands on, `.mdx` and a directory
// included, is REPORTED.

function resolveExport(
  root: string,                        // Task 2 widens to this: following a forward
  facts: ModuleFacts,                  //   needs resolveSpecifier + factsFor INSIDE
  exportName: string,                  //   the function, or star fan-out loses its
  active: Set<string>,                 //   continuation and AC-5b's second target
  done: Map<string, ExportResolution>, //   is unreachable. Task 1 uses the same
): ExportResolution;                   //   shape and simply never returns `forward`.
```

  `reaches` changes from `=> Verdict` to `=> Reach`. `moduleScopeExtent` is deleted.

- Produces, in `premiseScan.test.ts`, three MODULE-SCOPE helpers. The shipped `verdictWithModule` is block-scoped inside `scope-aware extent resolution` and cannot be called from a new block, and it writes one module only; it is left exactly as it is so no shipped case changes spelling.

```ts
/**
 * Write N helper modules plus a test importing them; return the classification.
 * `modules` is keyed by basename; a key containing a dot carries its own
 * extension ("data.json"), otherwise `.ts`. In every source string,
 * `__MODULE_<basename>__` is replaced by the generated specifier, and
 * `__MODULE_NOEXT_<basename>__` by the same specifier with its extension
 * stripped (AC-5c's extensionless case): with the
 * extension included when it is not `.ts`, because `resolveSpecifier` only
 * reaches a non-TS file when the specifier spells it out.
 * split/join, not `replace`, so a module referenced twice substitutes twice.
 *
 * A key containing a SLASH ("d/index.tsx") builds a directory and registers its
 * placeholder under the FIRST segment, pointing at the DIRECTORY itself, which
 * is what AC-9c needs: resolveSpecifier reaches a directory only through its
 * bare-base candidate. Both halves were probed. Without the mkdir the write
 * throws ENOENT; without the first-segment rule `__MODULE_d__` substitutes
 * nothing and the fixture silently tests an unresolved bare specifier instead.
 */
function classificationsWithModules(
  modules: Record<string, string>,
  testSrc: string,
): TestClassification[] {
  const id = n++;
  const parse = (key: string): { base: string; ext: string } => {
    const dot = key.lastIndexOf(".");
    return dot === -1
      ? { base: key, ext: ".ts" }
      : { base: key.slice(0, dot), ext: key.slice(dot) };
  };
  const spec: Record<string, string> = {};
  for (const key of Object.keys(modules)) {
    const { base, ext } = parse(key);
    const slash = base.indexOf("/");
    if (slash !== -1) spec[base.slice(0, slash)] = `./mod${id}_${base.slice(0, slash)}`;
    else spec[base] = ext === ".ts" ? `./mod${id}_${base}` : `./mod${id}_${base}${ext}`;
  }
  const subst = (text: string): string => {
    let out = text;
    for (const [base, s] of Object.entries(spec)) {
      // `__MODULE_NOEXT_<base>__` yields the SAME specifier with its extension
      // stripped. AC-5c's unresolved-specifier case needs an extensionless
      // reference to an EXISTING `.mjs` sibling, same basename, so that it
      // reports only because candidate generation is not widened. A fixture
      // pointing at a different basename reports either way and cannot pin
      // that settled decision.
      out = out.split(`__MODULE_NOEXT_${base}__`).join(s.replace(/\.[^./]+$/, ""));
      out = out.split(`__MODULE_${base}__`).join(s);
    }
    return out;
  };
  for (const [key, src] of Object.entries(modules)) {
    const { base, ext } = parse(key);
    const abs = join(scratch, `mod${id}_${base}${ext}`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, subst(src), "utf8");
  }
  const p = join(scratch, `case${id}-user.ts`);
  writeFileSync(p, subst(testSrc), "utf8");
  return classifyTests(ROOT, p);
}

/**
 * The FIRST classification. Most cases build a single test, so this is the
 * ergonomic form, but a case asserting about a SIBLING test must use
 * `classificationsWithModules` and select by `testName`, or it asserts about a
 * test it never meant (AC-12b).
 */
function classificationWithModules(
  modules: Record<string, string>,
  testSrc: string,
): TestClassification | undefined {
  return classificationsWithModules(modules, testSrc)[0];
}

function verdictWithModules(modules: Record<string, string>, testSrc: string): string {
  return classificationWithModules(modules, testSrc)?.verdict ?? "<no test found>";
}

/**
 * EVERY case that expects a report goes through this, never through a bare
 * `.toBe("unclassifiable")`. A verdict-only assertion passes on a generic or
 * MISATTRIBUTED reason, and the whole contract of reporting is that the reader
 * is told which construct, in which module (spec §2.6 item 2), so a
 * verdict-only reporting case leaves the arc's central claim unproved.
 *
 * `construct` matches the reason text; `module` matches the module the
 * construct was FOUND in, which for a barrel defect is the BARREL, not the
 * importing test file.
 */
function expectReported(
  c: TestClassification | undefined,
  expected: { construct: RegExp; module: RegExp; notModule?: RegExp },
): void {
  expect(c?.verdict).toBe("unclassifiable");
  expect(c?.detail ?? "").toMatch(expected.construct);
  expect(c?.detail ?? "").toMatch(expected.module);
  // `notModule` is what stops module attribution passing tautologically. For a
  // BARREL defect the reason must name the barrel and NOT the importing test
  // file (spec §2.6 item 2); without the negative, /barrel/ also matches the
  // import specifier quoted back in a generic reason, so the assertion proves
  // nothing about where the construct was found.
  if (expected.notModule) expect(c?.detail ?? "").not.toMatch(expected.notModule);
}

/** Single-module sibling of `classificationWithModules`, for `verdict`-style cases. */
function classification(src: string): TestClassification | undefined {
  const p = join(scratch, `case${n++}.ts`);
  writeFileSync(p, src, "utf8");
  return classifyTests(ROOT, p)[0];
}

/**
 * The reason families this arc reports. Cases name a family rather than
 * re-spelling a regex, so a wording change is one edit and no case silently
 * stops discriminating.
 */
const REPORTS = {
  dynamicImport: /dynamic import/i,
  sideEffect: /side-effect/i,
  unresolvedSpecifier: /unresolved in-repo specifier/i,
  moduleShape: /unsupported module shape/i,
  reexportCycle: /re-export cycle/i,
  unfollowable: /unfollowable re-export/i,
  namespaceExport: /export \* as/i,
  exportEquals: /export =/i,
  exportNamespace: /export namespace/i,
  nsLocalReexport: /local re-export of a namespace binding/i,
  nsNonMember: /no statically known member/i,
  computedProcess: /computed member access on process/i,
} as const;

/** The generated test file, for own-file constructs. */
const OWN_FILE = /case\d+/;
```

- Consumes: `ModuleFacts`, `resolveSpecifier`, `bindingIdentifiers`, `unclassifiableWithin`, all already in `premiseScan.ts`.

- [ ] **Step 1: Add the three module-scope helpers**, beside the existing module-scope `verdict` (`tests/mutation/source/premiseScan.test.ts:15`) and the `scratch` / `n` state they close over.

  **Extend the imports in the same edit, or Step 1's own green run fails to COMPILE** and every later `red=` in this task is invalid for a test-local reason:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"; // + mkdirSync
import { dirname, join } from "node:path";                              // + dirname
import { classifyTests, type TestClassification } from "./premiseScan";  // + the type
```

  `mkdirSync` and `dirname` are needed because a module key may name a nested path (the AC-9c directory case), and `TestClassification` is the return type of the plural helper. Compiling the exact splice without them reports `Cannot find name 'mkdirSync'` and `Cannot find name 'dirname'`; with them, every planned block reports `diagnostics=0`. Run BOTH suites before writing any new case:

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: both GREEN. **The second run is not ceremony:** `premiseScan.test.ts` is itself an enrolled suite declared `0`, so adding module-scope functions changes what the scanner sees when it scans this very file. If that `0` moves, the helpers reach something they should not — reconsider rather than re-baseline.

- [ ] **Step 2: Write the failing tests.**

```ts
describe("export resolution: the lookup asks for an EXPORT, not a local name", () => {
  const SPAWNER_DEFAULT = `import { spawnSync } from "node:child_process";
    export default function spawnHelper(): string {
      return String(spawnSync("echo", ["x"]).stdout);
    }`;

  // A NON-default spawning declaration, for the AC-5d branch cases that need a
  // local to re-export or merge with. Kept separate from SPAWNER_DEFAULT so no
  // case accidentally passes through E4 when it means to exercise E1 or E3.
  const SPAWNER_NAMED = `import { spawnSync } from "node:child_process";
    function spawnHelper(): string {
      return String(spawnSync("echo", ["x"]).stdout);
    }`;

  it("a renamed default import resolves", () => {
    expect(
      classificationWithModules(
        { helper: SPAWNER_DEFAULT },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("a same-named default import resolves for the RIGHT reason", () => {
    // The foil: passes even before the repair, by coincidence, because the local
    // name happens to match a module-scope declaration. Kept so no future repair
    // can be validated by it alone.
    expect(
      classificationWithModules(
        { helper: SPAWNER_DEFAULT },
        `import spawnHelper from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("a default export that is an EXPRESSION resolves", () => {
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export default () => String(spawnSync("echo", ["x"]).stdout);`,
        },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a pure default export stays free", () => {
    expect(
      verdictWithModules(
        { helper: `export default function pureHelper(): number { return 2; }` },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-free");
  });

  it("an exported `const` resolves: the modifier is on the STATEMENT", () => {
    // `export const` carries its modifiers on the VariableStatement, not on the
    // VariableDeclaration. An E1 predicate read off the declaration misses the
    // commonest exported form in the repository (971 exported variable statements).
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export const spawnHelper = (): string => String(spawnSync("echo", ["x"]).stdout);`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { x }` with no specifier resolves to the local declaration", () => {
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
            export { spawnHelper };`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { x as y }` with no specifier resolves by the EXPORTED name", () => {
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
            export { spawnHelper as runIt };`,
        },
        `import { runIt } from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a data import is PURE, on a fixture that is RED today (AC-9)", () => {
    // Two conditions make this discriminating. The specifier must spell out the
    // extension, or resolveSpecifier never reaches the file at all. And the
    // payload must be TypeScript that reaches node:child_process, because a
    // .json target IS parsed as TypeScript today: probed environment-touching
    // on the unrepaired tree. A fixture holding real JSON is free before and
    // after and proves nothing.
    expect(
      verdictWithModules(
        {
          "data.json": `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_data__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-free");
  });

  it("E4: an ANONYMOUS default function declaration resolves (AC-5d)", () => {
    expect(
      verdictWithModules(
        { helper: `import { spawnSync } from "node:child_process";
            export default function (): string { return String(spawnSync("echo", ["x"]).stdout); }` },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E4: a NAMED default class declaration resolves (AC-5d)", () => {
    // `export default class K {}` exports `default`; the name K is module-local.
    // A resolver recording BOTH names passes AC-4b while mis-modelling ES.
    expect(
      verdictWithModules(
        { helper: `import { spawnSync } from "node:child_process";
            export default class K { go(): string { return String(spawnSync("echo", ["x"]).stdout); } }` },
        `import K from "__MODULE_helper__";
         it("x", () => { new K().go(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E3: `export default <expr>` resolves under a renamed default (AC-5d)", () => {
    // E3 has NO fixture in the round-3 plan and probes environment-free TODAY
    // (spec §3.13). AC-4 covers E4's `export default function`; an implementation
    // can omit E3 entirely and satisfy every other criterion.
    expect(
      verdictWithModules(
        { helper: `${SPAWNER_NAMED}\nexport default spawnHelper;` },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E1: an ARRAY binding pattern binds every identifier (AC-5d)", () => {
    expect(
      verdictWithModules(
        { helper: `${SPAWNER_NAMED}\nexport const [ , second ] = [null, spawnHelper];` },
        `import { second } from "__MODULE_helper__";
         it("x", () => { second(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E1: MULTIPLE declarators in one statement each bind (AC-5d)", () => {
    // `export const a = …, b = …`: the modifier is on the VariableStatement and
    // must map to every declarator, not just the first.
    expect(
      verdictWithModules(
        { helper: `${SPAWNER_NAMED}\nexport const first = 1, second = spawnHelper;` },
        `import { second } from "__MODULE_helper__";
         it("x", () => { second(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("value BEATS type when both export the same name (AC-5d)", () => {
    // Declaration merging is legal. A resolver checking typeOnly first returns
    // pure and silently frees the value, with every other AC still green.
    expect(
      verdictWithModules(
        {
          helper: `${SPAWNER_NAMED}\nexport interface thing { k: string }\nexport const thing = spawnHelper;`,
        },
        `import { thing } from "__MODULE_helper__";
         it("x", () => { thing(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a DIRECT noSuchExport is pure, not reported (AC-5d)", () => {
    // A guard is not a type checker: inventing a diagnostic here would fire on
    // every mid-edit tree. AC-5b covers only the star-fan-out miss.
    expect(
      verdictWithModules(
        { helper: SPAWNER_NAMED },
        `import { absent } from "__MODULE_helper__";
         it("x", () => { void absent; });`,
      ),
    ).toBe("environment-free");
  });

  it("an `.mdx` target is REPORTED, not purified (AC-9d)", () => {
    // AC-9's discriminating twin: byte-identical payload, only the extension
    // differs. MDX is EXECUTABLE in this repo (next.config.ts:54 pageExtensions,
    // @mdx-js/rollup in vitest.config.ts), so answer 2 would be a silent free
    // introduced by this repair; spec §2.4, §3.11, §4 limit 13. 31 .mdx import
    // edges live in the near-domain across 14 files; 0 are enrolled, so AC-1 holds.
    expectReported(
      classificationWithModules(
        {
          "page.mdx": `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_page__";
         it("x", () => { spawnHelper(); });`,
      ),
      { construct: REPORTS.moduleShape, module: /mod\d+_page\.mdx/ },
    ); // expectReported: construct /unsupported module shape|mdx/, module /page/
  });

  it("a renamed default CLASS resolves (AC-4b)", () => {
    // An E4 branch AC-4's default-FUNCTION fixture never reaches. Probe §3.9
    // measures this environment-free today.
    expect(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export default class { go(): string { return String(spawnSync("echo", ["x"]).stdout); } }`,
        },
        `import K from "__MODULE_helper__";
         it("x", () => { new K().go(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("an exported CLASS resolves (AC-5, E1 branch)", () => {
    expect(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export class C { go(): string { return String(spawnSync("echo", ["x"]).stdout); } }`,
        },
        `import { C } from "__MODULE_helper__";
         it("x", () => { new C().go(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("an exported ENUM resolves (AC-5, E1 branch)", () => {
    // Ask for the ENUM by name. A round-1 draft imported a sibling `useIt` that
    // merely READ the enum, so the case passed even if EnumDeclaration were
    // dropped from the E1 predicate entirely, it never requested the exported
    // enum, which is the branch it claims to pin.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export enum E { A = String(spawnSync("echo", ["x"]).stdout) as unknown as never }`,
        },
        `import { E } from "__MODULE_helper__";
         it("x", () => { void E; });`,
      ),
    ).toBe("environment-touching");
  });

  it("a DESTRUCTURED exported const resolves (AC-5, E1 branch)", () => {
    // The modifier is on the VariableStatement and the names come out of a
    // binding pattern; an implementation reading only simple identifiers misses it.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export const { stdout: out } = spawnSync("echo", ["x"]);`,
        },
        `import { out } from "__MODULE_helper__";
         it("x", () => { void out; });`,
      ),
    ).toBe("environment-touching");
  });

  it("an unrecognized module shape is REPORTED, not purified (AC-9c)", () => {
    // A directory reached through resolveSpecifier's bare-base candidate.
    // NOTE THE RED'S SHAPE: today this case THROWS EISDIR rather than returning
    // a wrong verdict (probe §3.9), so Step 3 sees an ERROR, not a mismatch.
    // That is a valid red (the test fails, and greens on the same command) but
    // an implementer who expects a wrong verdict may read the exception as a
    // broken fixture and repair the test instead of the scanner.
    // A guard that only moved the extension test before the read would turn the
    // crash into a silent pure, which is why the third answer must REPORT.
    expectReported(
      classificationWithModules(
        { "d/index.tsx": `export const x = 1;` },
        `import { x } from "__MODULE_d__";
         it("x", () => { void x; });`,
      ),
      { construct: REPORTS.moduleShape, module: /mod\d+_d/ },
    );
  });

  it("an explicit `.jsx` target stays ANALYZED (AC-9b)", () => {
    // Probed environment-touching TODAY. An allowlist omitting .jsx would make
    // this repair introduce the very silent free the arc exists to close.
    expect(
      classificationWithModules(
        {
          "helper.jsx": `import { spawnSync } from "node:child_process";
            export function spawnHelper() { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("a `.mjs` target stays ANALYZED (AC-9b)", () => {
    // AC-9's foil. The live tests/ci/phantomGapExecuted.test.ts edge is a named
    // import of an in-repo .mjs module; an over-reaching allowlist turns it into
    // data and silences a real environment reach.
    expect(
      classificationWithModules(
        {
          "helper.mjs": `import { spawnSync } from "node:child_process";
            export function spawnHelper() { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "export resolution"
```

Expected: a non-zero FAILING count (never `skipped`). Red: `a renamed default import resolves`, `a default export that is an EXPRESSION resolves`, `export { x as y }` (the lookup asks the target for `runIt`), `a renamed default CLASS resolves`, and `an unrecognized module shape is REPORTED` — that last one fails by THROWING `EISDIR`, not by returning a wrong verdict. Also red: `a data import is PURE` — a `.json` target is parsed as TypeScript today, so the fixture measures `environment-touching` until the extension guard lands. Also red: `an .mdx target is REPORTED` — an `.mdx` target is likewise parsed as TypeScript today and measures `environment-touching`, so it reds against the expected `unclassifiable` until answer 3 lands; it is the twin of the `.json` case and the two differ in exactly the extension, which is what makes each discriminating. Already green, as foils: `a same-named default import` (name coincidence), `a pure default export stays free` — which passes by lookup MISS, not by purity, so record that rather than letting it read as evidence — `export { x }` local, the exported `const`, and the `.mjs` case. Record which cases were red.

- [ ] **Step 4: Implement — and ONLY what this task's own tests require.** TDD invariant 1 is per task: a production behaviour whose failing test lives in a later task does not get written here. A round-1 draft implemented five such behaviours in this step (the E2 forward stub, static and dynamic namespace marking, `export { ns }` rejection, unresolved-in-repo-specifier reporting, and hook reason merging) and every one of them had its test in Task 2, 3, 4 or 5. Each has moved to the task that tests it; the note at the end of this step records where.

In `premiseScan.ts`:

  1. Default-import registration becomes `imports.set(clause.name.text, { spec, imported: "default" })`.
  2. Add `exports` to `ModuleFacts`, mapping an EXPORTED name to either a local name or a node. Populate it in the same walk: for an `ExportDeclaration` without a `moduleSpecifier` whose clause is `NamedExports`, the exported name is `e.name.text` and the local name is `(e.propertyName ?? e.name).text` — the mirror of an import specifier, and the easiest thing here to get backwards; for a `VariableStatement`, `FunctionDeclaration`, `ClassDeclaration` or `EnumDeclaration` carrying an `export` modifier, map every identifier it binds to itself, reading the modifier from the STATEMENT in the variable case and walking object and array binding patterns and multiple declarators; for an `ExportAssignment` with `isExportEquals === false`, map `default` to the expression; for a declaration carrying both `export` and `default` — function OR class, named or anonymous — map `default` to the declaration, and **only** `default`, since the declaration's own name is module-local under ES. Skip anything `isTypeOnly`. **All four E1 declaration kinds are required**: probe §3.9 measures an exported class, an exported enum and a destructured `export const` each touching today, and the enrolled closure itself contains exported classes, so dropping a kind is a live regression.
  3. Add `resolveExport(root, facts, exportName, active, done)` — **the same five-parameter signature the Interfaces block declares and Tasks 2-4 consume**, taking `root` from the outset so Task 2 widens no signature. In THIS task it never returns `forward`, so `root` is unused until then; declaring it now is what keeps one topology across the arc. **Consult `exports` FIRST and never `extents` on its own**; `extents` is reached only through an entry that has already established the name is exported. **VALUE branches are consulted before type-only** (spec §2.2): declaration merging makes `export interface x {}` beside `export const x = …` legal, and a type-first resolver returns pure and silently frees the value. A local name resolves through module-scope `extents`; a recorded node resolves to `{ kind: "extent", nodes: [node] }`; a name in neither map resolves to `{ kind: "noSuchExport" }`, which is PURE on a direct request and adds no reason (spec §2.1). `active` and `done` are threaded now and first exercised in Task 2.
  4. Classify the resolved target **before any read**, three ways (spec §2.4): extension in `LANGUAGE_EXTENSIONS` → analyze as today; extension in `DATA_EXTENSIONS` → `data`, pure exactly as a bare specifier is; **anything else, including a DIRECTORY → `{ kind: "unresolvable", reason: `unsupported module shape for ${spec}` }`**. Never call `factsFor` on the last two, so a directory can no longer reach `readFileSync` and throw `EISDIR` — probe §3.9 measures that crash today. Do NOT widen `resolveSpecifier`'s candidate list.
  5. Change `reaches` to return `Reach`, routing every `{ kind: "unresolvable", reason }` into `reasons`, and update the **test-extent call site only** — it takes `.verdict` and merges `.reasons`. **The path names the module the unresolvable was FOUND in, not the module being visited from** (spec §2.6 item 2). **The HOOK call site must still COMPILE**, so it takes `.verdict` in this task — `reaches(h, facts, abs).verdict === "environment-touching"` — and nothing else. Leaving the shipped scalar comparison in place is a type error (`TS2367: types 'Reach' and 'string' have no overlap`), which would break this task's own green run. Taking `.verdict` is the minimal edit that compiles and preserves today's behaviour exactly: hook REASONS are still discarded, which is the defect Task 5's cases red on and Task 5 repairs.
  6. Delete `moduleScopeExtent`.
  7. Add `extname` and `relative` to the `node:path` import — the file imports only `dirname, join, resolve`.

**Deliberately NOT implemented here, each with the task that tests it.** Until its task lands, each of these keeps today's behaviour, and this task's cases neither depend on nor assert any of them:

| behaviour | implemented in | because its failing test is there |
| --- | --- | --- |
| E5/E6 forwarding, the `forward` resolution kind, **and E2's forward branch** (`import { x }; export { x }`, its aliased form, and its default form) | Task 2 | AC-5 E5/E6, AC-5 E2-forward, AC-5b, AC-10, AC-10c |
| the `namespace` field, namespace marking, member resolution, `export { ns }` rejection | Task 4 | AC-2, AC-2b, AC-2c, AC-3, AC-13 |
| unresolved in-repo specifier reporting, and §2.4b's runtime rule | Task 3 | AC-5c |
| hook-call reason MERGING, and the walk's hook seed | Task 5 | AC-11, AC-12, AC-12b — Task 1 makes that call site take `.verdict` so it compiles, and changes nothing else about it |

- [ ] **Step 5: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "export resolution"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, all 33 declared counts unchanged, unclassifiable set empty. The sharpest live risk is in that last run: `tests/ci/phantomGapExecuted.test.ts` imports named bindings from `scripts/lib/phantomGapExecuted.mjs` (written with the @-alias), the only non-`.ts` in-repo edge inside the enrolled domain, and that module exports exclusively in form E1 (`scripts/lib/phantomGapExecuted.mjs:59-179`). Its declared `3` must hold; if it moves, the extension guard or E1 is wrong.

- [ ] **Step 6: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): resolve cross-module EXPORTS, and carry traversal reasons to every caller"
```

---

### Task 2: Forwarded exports — `export … from`, `export *`, termination

Spec §2.2 rows E5 and E6, the `forward` branch Task 1 stubbed, and §2.5.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "forwarded exports"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:291` why=`ANCHOR IS PRE-MERGE: :291 is the cross-module lookup on the tracked tree today (for (const ext of tf.extents.get(name) ?? [])), which reads local declarations only; Task 0 merges #827 and re-anchors. After Task 1 no ExportDeclaration carrying a moduleSpecifier is recorded at all, so a barrel re-exporting a spawning helper hits the forward stub and classifies unclassifiable instead of environment-touching; probe rows H1 reexport named/aliased/star/chain 2-deep/local reexport all measure environment-free on the unrepaired tree, and every touching case in this block reds until the forward branch follows the edge` ac=AC-5,AC-5b,AC-10,AC-10c -->

**Files:** Modify `tests/mutation/source/premiseScan.ts`; test `tests/mutation/source/premiseScan.test.ts`.

**Interfaces:** Consumes `resolveExport`, `ExportResolution` and `Reach` from Task 1. **There is no `visited`** — a round-1 draft named one, and §2.5's structures are `active` (pushed and popped, the cycle test) and `done` (memoization). Produces no new helper.

- [ ] **Step 1: Write the failing tests.**

```ts
describe("forwarded exports: a re-export is followed to its source", () => {
  const SPAWNER = `import { spawnSync } from "node:child_process";
    export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
    export default spawnHelper;
    export function pureOne(): number { return 1; }`;

  it("`export { x } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { spawnHelper } from "__MODULE_helper__";` },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { x as y } from` is followed by the SOURCE name", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { spawnHelper as renamed } from "__MODULE_helper__";` },
        `import { renamed } from "__MODULE_barrel__";
         it("x", () => { renamed(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { default as x } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { default as runIt } from "__MODULE_helper__";` },
        `import { runIt } from "__MODULE_barrel__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { default } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { default } from "__MODULE_helper__";` },
        `import runIt from "__MODULE_barrel__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export * from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export * from "__MODULE_helper__";` },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export * from` does NOT forward `default`", () => {
    // ES semantics, and the foil that stops `export *` becoming a module-closure
    // rule by the back door. `default` is not exported by the barrel, so the
    // request answers noSuchExport and resolves pure: loud would be wrong here.
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export * from "__MODULE_helper__";` },
        `import runIt from "__MODULE_barrel__";
         it("x", () => { void runIt; });`,
      ),
    ).toBe("environment-free");
  });

  it("star-export ambiguity: the branch that HAS the name wins (AC-5b)", () => {
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          other: `export function unrelated(): number { return 7; }`,
          barrel: `export * from "__MODULE_other__";
                   export * from "__MODULE_helper__";`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a star-export miss on every branch is benign, not a report", () => {
    // AC-5b's foil: a name in no target resolves pure rather than loud.
    expect(
      verdictWithModules(
        {
          other: `export function unrelated(): number { return 7; }`,
          barrel: `export * from "__MODULE_other__";`,
        },
        `import { absent } from "__MODULE_barrel__";
         it("x", () => { void absent; });`,
      ),
    ).toBe("environment-free");
  });

  it("a re-export chain two deep is followed", () => {
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          mid: `export { spawnHelper } from "__MODULE_helper__";`,
          barrel: `export { spawnHelper } from "__MODULE_mid__";`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("import-then-`export { x }` is followed", () => {
    // No re-export SYNTAX at all: the case showing the defect is the
    // extents-only lookup, not any list of export spellings.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          barrel: `import { spawnHelper } from "__MODULE_helper__";
                   export { spawnHelper };`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("an EXPORT beats a same-named non-exported local (AC-10c), moved here from Task 1, because it needs E5", () => {
    // Resolution order. An extents-first resolver answers with the local and
    // preserves the silent free through the barrel: the diagnosed defect under
    // a new name. Probe B8 measures this environment-free today.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
          barrel: `function spawnHelper(): number { return 0; }
            void spawnHelper;
            export { spawnHelper } from "__MODULE_helper__";`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E5: `export { x as default } from` forwards named-to-DEFAULT", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { spawnHelper as default } from "__MODULE_helper__";` },
        `import runIt from "__MODULE_barrel__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E2: an import ALIAS then a local export forwards by the IMPORTED name", () => {
    // A resolver forwarding by the LOCAL name asks the target for `h`, gets
    // noSuchExport, and goes silently pure. The plain import-then-export case
    // cannot catch that, because there the two names coincide.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          barrel: `import { spawnHelper as h } from "__MODULE_helper__";
                   export { h };`,
        },
        `import { h } from "__MODULE_barrel__";
         it("x", () => { h(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E2: a DEFAULT import then a local export forwards as `default`", () => {
    expect(
      verdictWithModules(
        {
          helper: `${SPAWNER}\nexport default spawnHelper;`,
          barrel: `import runIt from "__MODULE_helper__";
                   export { runIt };`,
        },
        `import { runIt } from "__MODULE_barrel__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a re-exported PURE binding stays free", () => {
    // The foil: following the edge must not mark the target's whole closure.
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { pureOne } from "__MODULE_helper__";` },
        `import { pureOne } from "__MODULE_barrel__";
         it("x", () => { pureOne(); });`,
      ),
    ).toBe("environment-free");
  });

  it("a MIXED barrel: importing only the pure name stays free (AC-5 foil)", () => {
    // Discriminates against a `forward` that falls back to the target's whole
    // closure: the regression spec §1.1 item 2 fences. A pure-module foil
    // cannot catch that; this one can.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          barrel: `export { spawnHelper, pureOne } from "__MODULE_helper__";`,
        },
        `import { pureOne } from "__MODULE_barrel__";
         it("x", () => { pureOne(); });`,
      ),
    ).toBe("environment-free");
  });

  // NOTE what this pair can and cannot discriminate (spec §2.5, AC-10): it
  // catches an `active` set that is never POPPED, which would report this legal
  // barrel shape as a re-export cycle. It does NOT catch removing `done`, and no
  // fixture here pretends to. The star branch returns on the first arm that is
  // not noSuchExport, so the shared pair is never revisited inside one
  // resolution. `done` is a performance structure; AC-14 is its bound.
  it("a diamond whose shared target MISSES is not mistaken for a cycle (AC-10)", () => {
    // The shared target must MISS the sought name (spec AC-10). Two earlier
    // drafts gave `d` the export, and then the FIRST star arm returns an extent,
    // §2.2's source-order rule short-circuits, the second arm never revisits
    // (d, name), and the case passes even with an `active` set that is never
    // popped. Here both arms reach (d, "absent"), the first completes with
    // noSuchExport and POPS, and the second re-reaches the same pair: a
    // never-popped set sees a back edge and falsely reports `re-export cycle`.
    expect(
      verdictWithModules(
        {
          d: `export function present(): number { return 1; }`,
          b: `export * from "__MODULE_d__";`,
          c: `export * from "__MODULE_d__";`,
          a: `export * from "__MODULE_b__";
              export * from "__MODULE_c__";`,
        },
        `import { absent } from "__MODULE_a__";
         it("t", () => { void absent; });`,
      ),
    ).toBe("environment-free");
  });

  it("a TOUCHING diamond still short-circuits on the first branch", () => {
    // The pure diamond's companion: pins that the short-circuit is intact, so
    // the pure case cannot be satisfied by removing it.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          left: `export { spawnHelper } from "__MODULE_helper__";`,
          right: `export { spawnHelper } from "__MODULE_helper__";`,
          barrel: `export * from "__MODULE_left__";
                   export * from "__MODULE_right__";`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a re-export CYCLE terminates and reports, with its own reason", () => {
    const modules = {
      a: `export { spawnHelper } from "__MODULE_b__";`,
      b: `export { spawnHelper } from "__MODULE_a__";`,
    };
    const src = `import { spawnHelper } from "__MODULE_a__";
      it("x", () => { spawnHelper(); });`;
    expectReported(classificationWithModules(modules, src), { construct: REPORTS.reexportCycle, module: /mod\d+_/ });
    // The verdict alone cannot discriminate: Task 1's stub also reports
    // unclassifiable, so the REASON above is what proves cycle detection.
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "forwarded exports"
```

Expected: a non-zero FAILING count. **The red reason differs per case and the plan states which, because a wrong rationale is how a red gets accepted for the wrong cause.** After Task 1, a module's `exports` map records only LOCAL forms — no `ExportDeclaration` carrying a `moduleSpecifier` is recorded at all — so E5 and E6 cases resolve `noSuchExport` and classify **`environment-free`**. `import-then-export { x }`, its aliased form and its default form also classify **`environment-free`**, not `unclassifiable`: Task 1 records E2's exported name but has no forward branch at all — that branch is this task's Step 0b — so the local name resolves through neither `extents` nor a forward and answers `noSuchExport`, which is pure. A round-3 draft said these reached a `forwarded export (not yet followed)` stub in Task 1; Task 1 creates no such stub, so the rationale named a mechanism that does not exist even though the command still failed. The cycle case therefore fails on its VERDICT (it is `environment-free`, not `unclassifiable`), and its `detail` assertion is the second gate that stops the stub reason from being mistaken for cycle detection. Already green, as foils: `does NOT forward default`, the benign miss, the pure re-export, the mixed barrel, and the PURE diamond.

- [ ] **Step 3: Implement.** In `premiseScan.ts`:

  1. In `moduleFacts`, record every `ExportDeclaration` that HAS a `moduleSpecifier`: for `NamedExports`, exported `e.name.text` → `{ spec, sourceName: (e.propertyName ?? e.name).text }`; for no clause (`export *`), append `spec` to a `starExports: string[]` on `ModuleFacts`. Skip `isTypeOnly` on the declaration and on each specifier.
  2. In `resolveExport`, return `{ kind: "forward", spec, exportName: sourceName }` for a recorded forwarded name. For a name in neither the local nor the forwarded map, try each `starExports` entry in turn — skipping the star pass entirely when `exportName === "default"`, which a star export never forwards — and return `noSuchExport` if no branch carries it.
  0. **One topology, stated once: `resolveExport` follows forwards INTERNALLY, and `reaches` never sees a `forward`.** Task 1 already declares the five-parameter signature, so nothing is widened here. Two mechanical consequences: (a) `factsFor` is local to `classifyTests` on `4e40db2b3`, so **lift it to module scope** (or pass it in) — `resolveExport` cannot call it otherwise, and a round-3 draft assumed an access it does not have; (b) because forwards resolve inside, `ExportResolution` keeps `forward` as an INTERNAL step only, and the `visited` value a round-1 draft's Interfaces block mentioned does not exist — `active` and `done` are the only two structures. Star fan-out is expressible only this way: returning a single `{ spec, exportName }` to the caller loses the continuation and AC-5b's second target becomes unreachable.
  0b. **E2's forward branch lands here too**, not in Task 1: for an E2 local name that is a NON-namespace entry in `facts.imports`, resolve `(imp.spec, imp.imported)` — by the IMPORTED name, never the local one. This covers `import { x }; export { x }`, `import { x as h }; export { h }`, and the default-import form, all three of which Task 1 leaves answering `noSuchExport`, and all three of which have their cases in this task.
  3. Inside `resolveExport`, follow a forward: resolve its `spec` against the CURRENT module's path, apply Task 1's three-way target classification, load the target's facts, and recurse, threading BOTH structures keyed `` `${targetPath}#${exportName}` ``. **`active` holds the pairs on the current path, PUSHED on entry and POPPED on completion — re-entering one is a back edge and IS the cycle**, returning `{ kind: "unresolvable", reason: "re-export cycle" }`. **The popping is the whole mechanism**: by the time a diamond's second arm reaches the shared pair, the first arm has completed and removed it, so a properly popped `active` handles the diamond on its own. A set that is never popped is what reports an ordinary diamond as a cycle. **`done` is MEMOIZATION, not the cycle test** — spec §2.5 says so plainly, and round-3 review demonstrated that removing it leaves the pure diamond, the touching diamond and the cycle case all passing. Do not write a test that appears to pin it; its budget is AC-14's ratio. For a star fan-out, try every candidate in SOURCE ORDER, treat `noSuchExport` as a benign miss, and **return the first answer that is not `noSuchExport`** — "stop at the first provenance" is not decidable inside `resolveExport`, which returns an extent and cannot know what the traversal will make of it (spec §2.2).
  4. No depth counter, by design.

- [ ] **Step 4: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "forwarded exports"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, 33 counts unchanged, unclassifiable set empty.

- [ ] **Step 5: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): follow forwarded exports across module boundaries"
```

---

### Task 3: The declined forms are REPORTED, not passed

**Spec §2.4b is this task's centre of gravity.** It replaced the round-3 enumeration of four accepted dynamic spellings with ONE rule, a module reference the resolver cannot bind to a member-precise in-repo edge is REPORTED, after round-4 review listed six more shapes the enumeration missed.

**Step 1 authors BOTH describe blocks below and Step 3 implements BOTH**; a round-1 draft left this first block outside every checkbox, which meant AC-5c was neither authored nor implemented while the task still claimed it. Write the cases as one `it.each` over §2.4b's table so a seventh shape lands in the rule rather than needing a seventh fixture:

```ts
const SPAWNS = `import { spawnSync } from "node:child_process";
  export function spawner(): string { return String(spawnSync("echo", ["x"]).stdout); }`;

describe("declined export forms: unmodelled runtime references REPORT (AC-5c)", () => {
  // Every case in this block reports, so every case goes through
  // `expectReported` with the construct AND the module it was found in, the
  // BARREL for a re-export defect, never the importing test file (spec §2.6
  // item 2). A bare .toBe("unclassifiable") is not sufficient here.
  it.each([
    ["assignment position", `let m: any; m = await import("__MODULE_helper__"); it("x", async () => { (await m).spawner(); });`, REPORTS.dynamicImport],
    ["embedded: awaited member call", `it("x", async () => { (await import("__MODULE_helper__")).spawner(); });`, REPORTS.dynamicImport],
    ["embedded: .then destructure", `it("x", () => { void import("__MODULE_helper__").then(({ spawner }) => spawner()); });`, REPORTS.dynamicImport],
    ["bare side-effect dynamic", `it("x", async () => { await import("__MODULE_helper__"); });`, REPORTS.dynamicImport],
  ])("an unmodelled runtime reference REPORTS: %s", (_label, testSrc, construct) => {
    // Assert the REASON, not only the verdict. A generic or misattributed
    // reason satisfies a verdict-only assertion while violating AC-5c, and the
    // whole point of REPORTING is that the reader is told WHICH construct and
    // WHICH module. Spec §2.6 item 2: the path names the module the construct
    // was FOUND in.
    // `module` matches the GENERATED module path (mod<N>_helper), not the bare
    // word "helper", and `notModule` rules out the test file. A round-2 draft
    // used /helper/, which the import specifier already contains, so it matched
    // even when the reason named the wrong module or none.
    // Each row carries its OWN construct, never a union: a union lets any row
    // pass on another row's reason. And these four constructs sit in the
    // GENERATED TEST FILE, not in the helper, so the module is OWN_FILE, a
    // round-3 draft asserted /mod\d+_helper/ and rejected the test file, which
    // is backwards for this table.
    expectReported(classificationWithModules({ helper: SPAWNS }, testSrc), {
      construct,
      module: OWN_FILE,
    });
  });

  it("an EXPORTED embedded dynamic import REPORTS through the importer", () => {
    expectReported(
      classificationWithModules(
        { helper: SPAWNS, barrel: `export const run = (await import("__MODULE_helper__")).spawner;` },
        `import { run } from "__MODULE_barrel__";\n it("x", () => { run(); });`,
      ),
      // The construct is in the BARREL (spec §2.6 item 2), not the test file.
      { construct: REPORTS.dynamicImport, module: /mod\d+_barrel/, notModule: /case\d+-user/ },
    );
  });

  it("an in-repo STATIC side-effect import REPORTS", () => {
    // `import "./side"` has no importClause at all, so every clause-driven
    // branch skips it and the module's spawn is never seen. 9 near-domain sites.
    expectReported(
      classificationWithModules(
        { side: `import { spawnSync } from "node:child_process";\n spawnSync("echo", []);` },
        `import "__MODULE_side__";\n it("x", () => { expect(1).toBe(1); });`,
      ),
      // The construct is the side-effect IMPORT, in the test file that writes it.
      { construct: REPORTS.sideEffect, module: OWN_FILE },
    );
  });

  it("an in-repo specifier that does NOT resolve REPORTS", () => {
    // Extensionless `./h` for a `.mjs` sibling. resolveSpecifier's candidates are
    // NOT widened (spec §2.4b): the miss is reported instead of passed as pure.
    expectReported(
      classificationWithModules(
        { "helper.mjs": SPAWNS },
        `import { spawner } from "__MODULE_NOEXT_helper__";\n it("x", () => { spawner(); });`,
      ),
      { construct: REPORTS.unresolvedSpecifier, module: OWN_FILE },
    );
  });

  it("a BARE unresolved specifier stays FREE, L-2 is unchanged", () => {
    // The foil that stops the rule swallowing node_modules. Without it, §2.4b
    // would report every third-party import in the corpus.
    expect(
      verdictWithModules({}, `import { thing } from "some-npm-package";\n it("x", () => { thing(); });`),
    ).toBe("environment-free");
  });

  // NOTE the LOCAL dynamic-namespace foil is NOT here. It expects
  // `environment-touching`, which needs Task 4's member resolution; probe DYN-NS
  // measures it environment-free today and nothing in this task changes that, so
  // asserting it here would make this task's green command depend on a later one.
  // It lives in Task 4 beside the other namespace cases.

  it.each([
    ["export const ns = await import()", `export const ns = await import("__MODULE_helper__");`, "ns"],
    ["export const { spawner } = await import()", `export const { spawner } = await import("__MODULE_helper__");`, "spawner"],
    ["const ns = await import(); export { ns }", `const ns = await import("__MODULE_helper__");\nexport { ns };`, "ns"],
    ["const { spawner } = await import(); export { spawner }", `const { spawner } = await import("__MODULE_helper__");\nexport { spawner };`, "spawner"],
  ])("an EXPORTED dynamic binding REPORTS: %s (spec §2.2)", (_l, barrel, name) => {
    // Each imports the name its own barrel exports. A fixture importing a name
    // the barrel lacks would be pure for a test-local reason and never go green.
    expectReported(
      classificationWithModules(
        { helper: SPAWNS, barrel },
        `import { ${name} } from "__MODULE_barrel__";\n it("x", () => { void ${name}; });`,
      ),
      // The construct is in the BARREL, not the test file (spec §2.6 item 2).
      { construct: REPORTS.dynamicImport, module: /mod\d+_barrel/, notModule: /case\d+-user/ },
    );
  });
});
```


Spec §2.2's declined list and §4 limits 1, 2 and 4. **Scope note:** the canonical "unparseable in-repo module" form is NOT in this task. It is dead code — `moduleFacts` returns null only when `!existsSync`, `resolveSpecifier` already `existsSync`-checked, and `ts.createSourceFile` never throws on garbage (spec §3.8) — so a fixture for it can never go green. Spec §4 limit 8 files it and Task 7 Step 1 opens the row; this task does not attempt it.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "declined export forms"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:291` why=`ANCHOR IS PRE-MERGE: :291 is the cross-module lookup on the tracked tree today; Task 0 merges #827 and re-anchors. An unfollowable re-export, an export * as ns from, an export = and an export namespace all resolve to nothing after Task 2 and answer noSuchExport, which is pure, so the traversal stops and each test reads environment-free; probe rows H1 unfollowable reexport and B9 export namespace measure exactly that. Each case reds until moduleFacts records those forms explicitly and resolveExport returns unresolvable with its own reason` ac=AC-8,AC-5c -->

**Files:** Modify `tests/mutation/source/premiseScan.ts`; test `tests/mutation/source/premiseScan.test.ts`.

**Interfaces:** Consumes `resolveExport`, `Reach`, `classificationWithModules`. Produces no new helper — this task only makes the remaining declined forms resolve to `unresolvable` with their own reason strings.

- [ ] **Step 1: Write the failing tests — BOTH blocks: the §2.4b runtime-reference block above AND the declined-export-form block here.**

```ts
describe("declined export forms: recognized, unresolvable, and REPORTED", () => {
  const SPAWNER = `import { spawnSync } from "node:child_process";
    export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`;

  it("an unfollowable re-export reports, naming the module", () => {
    const modules = { barrel: `export { spawnHelper } from "./definitely-not-here";` };
    const src = `import { spawnHelper } from "__MODULE_barrel__";
      it("x", () => { spawnHelper(); });`;
    expectReported(classificationWithModules(modules, src), { construct: REPORTS.unfollowable, module: /mod\d+_barrel/, notModule: /case\d+-user/ });
    expect(classificationWithModules(modules, src)?.detail ?? "").toMatch(/barrel/);
  });

  it("`export * as ns from` reports", () => {
    expectReported(
      classificationWithModules(
        { helper: SPAWNER, barrel: `export * as helpers from "__MODULE_helper__";` },
        `import { helpers } from "__MODULE_barrel__";
         it("x", () => { helpers.spawnHelper(); });`,
      ),
      { construct: REPORTS.namespaceExport, module: /mod\d+_barrel/ },
    );
  });

  it("`export =` reports", () => {
    expectReported(
      classificationWithModules(
        { helper: `${SPAWNER}\nexport = spawnHelper;` },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
      { construct: REPORTS.exportEquals, module: /mod\d+_helper/ },
    );
  });

  it("`export namespace` reports", () => {
    // Probe B9: it carries an `export` modifier but registers no extent, so an
    // E1 predicate keyed on the modifier resolves it to an EMPTY extent and
    // passes it as free.
    expectReported(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export namespace NS {
              export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
            }`,
        },
        `import { NS } from "__MODULE_helper__";
         it("x", () => { NS.spawnHelper(); });`,
      ),
      { construct: REPORTS.exportNamespace, module: /mod\d+_helper/ },
    );
  });

  it("a VALUE import of a type-only export is PURE, not unresolvable", () => {
    // NOT written as `import type { Thing }`: that form is filtered by
    // isInTypePosition before any resolution, so it would pass whatever §2.2
    // decides about type-only exports and could not discriminate the rule it is
    // the foil for. This imports the name in a VALUE position, so it genuinely
    // reaches resolveExport and pins that a type-only export resolves pure.
    expect(
      verdictWithModules(
        { helper: `export type Thing = { a: number };\n${SPAWNER}` },
        `import { Thing } from "__MODULE_helper__";
         it("x", () => { void Thing; });`,
      ),
    ).toBe("environment-free");
  });

  it("an ordinary named export is NOT reported", () => {
    // The foil that stops this task's rule becoming "report everything".
    expect(
      verdictWithModules(
        { helper: SPAWNER },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "declined export forms"
```

Expected: a non-zero FAILING count. The five reporting cases classify `environment-free` — each resolves to `noSuchExport`, which Task 1 makes pure — The `export { ns }` case is NOT in this task; it moved to Task 4 with the namespace flag it depends on. Both foils are already green.

- [ ] **Step 3: Implement.** In `moduleFacts`, record the declined forms explicitly so they resolve to `unresolvable` with their own reasons rather than falling through to `noSuchExport`: an `ExportDeclaration` whose clause is a `NamespaceExport` (`export * as ns from`); an `ExportAssignment` with `isExportEquals === true` (`export =`); and a `ModuleDeclaration` carrying an `export` modifier (`export namespace` / `export module`). E1's predicate is already the four registered declaration kinds — Task 1 Step 4.2 writes it that way — so nothing is narrowed here; that is why `export namespace` reaches this task's rule at all rather than resolving to an empty extent.

  **Implement spec §2.4b's rule in this same step**, since Step 1 authored its block: in `reaches`/`moduleFacts`, a literal `import()` whose enclosing node is NOT a direct local variable-declaration initializer — assignment position, embedded in a larger expression, or a bare statement — reports `{ kind: "unresolvable", reason: \`unbindable dynamic import of ${spec}\` }`; an in-repo static `import "./x"` with NO import clause reports likewise — **and this one needs a SEED, not a traversal rule**: the walk starts at the `it` call, its hooks and its producers, so a top-level `ImportDeclaration` that nothing references is never visited. Collect clause-less in-repo import declarations in `moduleFacts` as a file-level `sideEffectImports: string[]`, and have `classifyTests` merge one reason per entry into EVERY test in that file, exactly as a top-level hook applies to every test. A round-2 draft said only "report it in `reaches`/`moduleFacts`", which named no route by which the reason could ever reach a classification; an EXPORTED dynamic binding reports (spec §2.2); and an in-repo specifier that does not resolve reports (Task 1 Step 4.4). Live-domain population of every row is ZERO (spec §3.13), so `_metaPremiseContract` must stay green with no declared count moving — if one moves, the rule over-reached and the task stops.

  The unfollowable re-export needs care, because `resolveSpecifier` returns `null` for TWO different things: a relative or `@/` specifier that does not exist, and a BARE specifier, which must stay pure by L-2 (spec §4 limit 6's neighbour). **Split by specifier SHAPE, not by the null**: only a specifier starting `.` or `@/` becomes `{ kind: "unresolvable", reason: \`unfollowable re-export of ${exportName} from ${spec}\` }`; a bare specifier stays pure exactly as today. `export { ns }` over a namespace binding is NOT handled here — it needs the `namespace` flag, which Task 4 Step 3.0-3.1 introduces, so its case lives in Task 4 beside the other namespace work.

- [ ] **Step 4: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "declined export forms"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, 33 counts unchanged, unclassifiable set empty.

- [ ] **Step 5: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): report the export forms the resolver declines to follow"
```

---

### Task 4: Namespace bindings resolve member-precisely, in both spellings

Spec §2.3. The task that must not become a module-closure rule.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "namespace bindings"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:113` why=`ANCHOR IS PRE-MERGE: :113 is the namespace-import registration on the tracked tree today (imports.set(b.name.text, spec)); Task 0 merges #827 and re-anchors. The binding is recorded under the LOCAL alias, so resolveExport is asked for an export named after the alias and answers noSuchExport, and the member identifier is not even a reference (isReferenceIdentifier returns false for a property-access name); probe rows H1 namespace member, H1 namespace destructured and DYN-NS all measure environment-free, and every touching case here reds until a namespace-marked import binding resolves ns.member to the export named member` ac=AC-2,AC-2b,AC-2c,AC-3,AC-6,AC-7,AC-13 -->

**Files:** Modify `tests/mutation/source/premiseScan.ts`; test `tests/mutation/source/premiseScan.test.ts`.

**Interfaces:** Extends the EXISTING `Binding` import variant with `namespace?: true` rather than adding a fourth `kind`. Deliberate: a new `kind` must be handled at every site dispatching on `binding.kind` — `reaches`, `extentIsProvenance`, `bindingKey` — and a missed site falls through to `environment-free`, the silent direction. Keeping `kind: "import"` means every dispatch site keeps working by default and only member resolution is new.

- [ ] **Step 1: Write the failing tests.**

```ts
describe("namespace bindings: member-precise, and nothing else", () => {
  // The three non-member cases in this block report; each uses
  // `expectReported` with construct /namespace .* no statically known member/
  // and the module the namespace was imported from.
  const MIXED = `import { spawnSync } from "node:child_process";
    export function spawner(): string { return String(spawnSync("echo", ["x"]).stdout); }
    export function pureOne(): number { return 1; }`;

  const ENVELOPE = `import { spawnSync } from "node:child_process";
    export function reportEnvelope(res: { ok: boolean }): string { return res.ok ? "ok" : "no"; }
    export function main(): string {
      const res = spawnSync("git", ["status"]);
      return String(res.stdout);
    }`;

  it("`ns.member` resolves to that member", () => {
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "__MODULE_helper__";
        it("x", () => { ns.spawner(); });`),
    ).toBe("environment-touching");
  });

  it('`ns["member"]` resolves to that member', () => {
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "__MODULE_helper__";
        it("x", () => { ns["spawner"](); });`),
    ).toBe("environment-touching");
  });

  it("a DYNAMIC namespace binding resolves (AC-2b)", () => {
    // bindPattern's identifier branch records the LOCAL name: the same
    // substitution, in the one place the round-1 draft called out of scope.
    expect(
      verdictWithModules({ helper: MIXED },
        `it("x", async () => { const ns = await import("__MODULE_helper__"); ns.spawner(); });`),
    ).toBe("environment-touching");
  });

  it("a DYNAMIC destructured binding still resolves", () => {
    // AC-2b's foil: already touching today, so it proves the dynamic path was
    // never wholly broken and only the namespace spelling was.
    expect(
      verdictWithModules({ helper: MIXED },
        `it("x", async () => { const { spawner } = await import("__MODULE_helper__"); spawner(); });`),
    ).toBe("environment-touching");
  });

  it("the namespace dedup identity includes the MEMBER: pure first (AC-2c)", () => {
    // The traversal dedups by the BINDING a reference resolves to. A namespace
    // resolves the SAME binding to DIFFERENT exports, so a member-blind key
    // marks it seen on ns.pureOne() and never visits ns.spawner().
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "__MODULE_helper__";
        it("x", () => { ns.pureOne(); ns.spawner(); });`),
    ).toBe("environment-touching");
  });

  it("the namespace dedup identity includes the MEMBER: spawn first (AC-2c)", () => {
    // Both orders are required: a member-blind key fails in exactly one of them
    // depending on which reference the walk meets first, so a single-order
    // fixture can pass while the hole remains.
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "__MODULE_helper__";
        it("x", () => { ns.spawner(); ns.pureOne(); });`),
    ).toBe("environment-touching");
  });

  it("`export { ns }` over a namespace import reports", () => {
    // E2 forwarding would ask the target for an export named after the local
    // alias, get noSuchExport, and go silently pure. Probe §3.9 measures free
    // today; population 0 repo-wide, so reporting costs nothing.
    expectReported(
      classificationWithModules(
        {
          helper: MIXED,
          barrel: `import * as helpers from "__MODULE_helper__";
                   export { helpers };`,
        },
        `import { helpers } from "__MODULE_barrel__";
         it("x", () => { helpers.spawnHelper(); });`,
      ),
      { construct: REPORTS.nsLocalReexport, module: /mod\d+_barrel/, notModule: /case\d+-user/ },
    );
  });

  it("a namespace member that is PURE stays free even when a sibling spawns", () => {
    // AC-3, and the regression case for spec §1.1 item 2: a module-closure rule
    // fails here. AC-2's foil; neither may be removed without the other.
    expect(
      classificationWithModules({ helper: MIXED }, `import * as ns from "__MODULE_helper__";
        it("x", () => { ns.pureOne(); });`)?.verdict,
    ).toBe("environment-free");
  });

  it("AC-10b stays quiet through a namespace", () => {
    expect(
      verdictWithModules({ helper: ENVELOPE }, `import * as env from "__MODULE_helper__";
        it("x", () => { env.reportEnvelope({ ok: true }); });`),
    ).toBe("environment-free");
  });

  it("AC-10b stays quiet through a direct import", () => {
    expect(
      verdictWithModules({ helper: ENVELOPE }, `import { reportEnvelope } from "__MODULE_helper__";
        it("x", () => { reportEnvelope({ ok: true }); });`),
    ).toBe("environment-free");
  });

  it("a namespace in a NON-member position reports", () => {
    expectReported(
      classificationWithModules({ helper: MIXED }, `import * as ns from "__MODULE_helper__";
        it("x", () => { Object.entries(ns); });`),
      // Found in the TEST file; the helper is named too, as the origin.
      { construct: REPORTS.nsNonMember, module: OWN_FILE },
    );
  });

  it("a destructured namespace reports", () => {
    expectReported(
      classificationWithModules({ helper: MIXED }, `import * as ns from "__MODULE_helper__";
        it("x", () => { const { pureOne } = ns; pureOne(); });`),
      { construct: REPORTS.nsNonMember, module: OWN_FILE },
    );
  });

  it("`ns[computed]` reports", () => {
    expectReported(
      classificationWithModules({ helper: MIXED }, `import * as ns from "__MODULE_helper__";
        const k = "spawner";
        it("x", () => { ns[k as keyof typeof ns]; });`),
      // A NON-literal element access is a namespace used with no statically
      // known member (spec §2.3), not a dynamic import. Found in the TEST file.
      { construct: REPORTS.nsNonMember, module: OWN_FILE },
    );
  });

  it("a namespace import of a PROVENANCE module stays touching whatever the member", () => {
    // AC-13. isProvenanceModule is checked before member resolution.
    expect(
      verdict(`import * as cp from "node:child_process";
        it("x", () => { cp.execSync("git status"); });`),
    ).toBe("environment-touching");
  });

  it("a namespace of a provenance module in a NON-member position stays touching", () => {
    // Order matters: provenance first, member precision second. A repair that
    // resolved members first would report unclassifiable here.
    expect(
      classification(`import * as cp from "node:child_process";
        it("x", () => { void Object.keys(cp); });`)?.verdict,
    ).toBe("environment-touching");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "namespace bindings"
```

Expected: a non-zero FAILING count. Red: both member cases, the dynamic namespace case, the three reporting cases, BOTH AC-2c ordering cases, **and the `export { ns }` case that moved here from Task 3 — NINE**. A round-1 draft said six and omitted the ordering pair, reasoning that only one order can expose a member-blind `bindingKey`; that is true AFTER the member-precise binding lands, and false before it. Right now neither namespace member resolves at all, so both orders are `environment-free` and both are red. Already green, as foils: the dynamic destructured case, `pureOne`, both AC-10b cases, both provenance-module cases — **six**. Record that split; a foil already green is what makes the reds meaningful, and a red transcript that miscounts is how a red gets accepted for the wrong cause.

- [ ] **Step 3: Implement.** In `premiseScan.ts`:

  0. **Widen the binding TYPES first, or nothing below compiles.** The import-fact value type is `{ spec: string; imported: string }` on `4e40db2b3`; add `namespace?: boolean` to it and to every map that stores one — `ModuleFacts.imports`, `scopedImports`, the local `imports` map inside `moduleFacts`, and `bindPattern`'s parameter type. A round-1 draft placed the two registrations in Task 1 without the type change, and that task did not compile: `TS2353 'namespace' does not exist in type '{ spec: string; imported: string; }'` at both registration sites.
  1. Mark the static namespace import: `imports.set(b.name.text, { spec, imported: b.name.text, namespace: true })`.
  2. Mark the dynamic one: in `bindPattern`'s identifier branch, record `{ spec, imported: name.text, namespace: true }`. The destructured branch is unchanged.
  2b. Resolve `export { ns }` over a namespace binding to `{ kind: "unresolvable", reason: `local re-export of a namespace binding (${local})` }` in `resolveExport`'s E2 branch — it exports the namespace OBJECT, not a target export, and forwarding it answers `noSuchExport` and goes silently pure (spec §2.2 E2, probe §3.9, population 0). This lands here rather than in Task 1 because it reads the `namespace` flag set above.
  3. In `reaches`, for a binding with `namespace === true`: FIRST, if `isProvenanceModule(binding.spec)` return touching — before any member inspection, preserving the shipped ordering. Otherwise inspect the reference's parent: a `PropertyAccessExpression` whose `expression` is this reference resolves the export named `p.name.text`; an `ElementAccessExpression` whose `argumentExpression` is a string literal resolves that export; **anything else pushes** `` `namespace ${name} (imported from ${spec}) used in a position with no statically known member, in ${foundIn}` `` **into `reasons`**, where `foundIn` is the module the USE was written in — the test file for a use in the test file. Spec §2.6 item 2 keys attribution on where the construct was found, and naming only `${spec}` attributes the construct to the module being visited, which is the wrong file to send a reader to. Both appear because the reader needs the namespace's origin as well.
  4. `extentIsProvenance` needs no edit — the binding keeps `kind: "import"`. **`bindingKey` DOES need one:** for a namespace reference the dedup identity is `(binding, resolved member)`, not `(binding)`. A namespace resolves one binding to many exports, so the shipped member-blind key lets the first-resolved member mark the binding seen and skips every other — a silent `environment-free` whose direction depends on source order (spec §2.3). Every other binding kind keeps the shipped key exactly.

- [ ] **Step 4: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "namespace bindings"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, 33 counts unchanged, unclassifiable set empty. This is the task most likely to move a count — spec §3.3 measured zero in-repo namespace imports in the enrolled closure, so if one moves, re-derive rather than re-baseline.

- [ ] **Step 5: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): resolve namespace imports member-precisely, report the rest"
```

---

### Task 5: The two recognized-unresolvable constructs propagate, from every position

Spec §2.6 items 2-3 and §2.7 — Half 2. Task 1 built the channel; this task fills it.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "unclassifiable propagation"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:341` why=`ANCHOR IS PRE-MERGE: :341 is the single ownUnresolved call on the tracked tree today; Task 0 merges #827 and re-anchors. unclassifiableWithin is evaluated on exactly one node, the test's own call expression, so a construct in a reachable helper, a hook body or a describe.each producer is never seen; probe rows H2 module_dynamic, describe_dynamic, module_computed, describe_computed, cross-module dynamic and C1-C3 all measure environment-free, and every case here reds until the two rules run at each node the traversal visits` ac=AC-11,AC-12,AC-12b -->

**Files:** Modify `tests/mutation/source/premiseScan.ts`; test `tests/mutation/source/premiseScan.test.ts`.

**Interfaces:** Consumes `unclassifiableWithin`, `Reach`, and the merged-reason `detail` from Task 1. Produces no new type.

- [ ] **Step 1: Write the failing tests.**

```ts
describe("unclassifiable propagation: a construct anywhere reachable reaches the verdict", () => {
  // Every reporting case in this block uses `expectReported`, with the module
  // being the one HOLDING the construct, for the cross-module case that is the
  // loader module, not the test file. AC-12's precedence branches are the stated
  // exception: their subject is the lattice, so they assert the verdict alone.
  it("a module-scope helper holding a non-literal dynamic import reports", () => {
    expectReported(
      classification(`const specifier = "./x" + String(1);
        async function loader(): Promise<unknown> { return await import(specifier); }
        it("x", async () => { await loader(); });`), { construct: REPORTS.dynamicImport, module: OWN_FILE });
  });

  it("a describe-scope helper holding a non-literal dynamic import reports", () => {
    expectReported(classification(`const specifier = "./x" + String(1);
        describe("d", () => {
          async function loader(): Promise<unknown> { return await import(specifier); }
          it("x", async () => { await loader(); });
        });`), { construct: REPORTS.dynamicImport, module: OWN_FILE });
  });

  it("a module-scope helper holding a computed process access reports", () => {
    expectReported(classification(`const k = "PATH";
        function readEnv(): unknown { return (process as never)[k]; }
        it("x", () => { readEnv(); });`), { construct: REPORTS.computedProcess, module: OWN_FILE });
  });

  it("a describe-scope helper holding a computed process access reports", () => {
    expectReported(classification(`const k = "PATH";
        describe("d", () => {
          function readEnv(): unknown { return (process as never)[k]; }
          it("x", () => { readEnv(); });
        });`), { construct: REPORTS.computedProcess, module: OWN_FILE });
  });

  it("a beforeEach body holding a construct reports (C1)", () => {
    // The hook path: classifyTests tested the hook reaches() result for one
    // value only, so every reason reached this way was discarded.
    expectReported(classification(`const specifier = "./x" + String(1);
        describe("d", () => {
          beforeEach(async () => { await import(specifier); });
          it("x", () => { expect(1).toBe(1); });
        });`), { construct: REPORTS.dynamicImport, module: OWN_FILE });
  });

  it("a beforeAll body holding a construct reports (C2)", () => {
    // computed PROCESS access, not a dynamic import: unclassifiableWithin emits
    // the process reason and a dynamicImport expectation could never match.
    expectReported(classification(`const k = "PATH";
        describe("d", () => {
          beforeAll(() => { void (process as never)[k]; });
          it("x", () => { expect(1).toBe(1); });
        });`), { construct: REPORTS.computedProcess, module: OWN_FILE });
  });

  it("a describe.each producer holding a construct reports (C3)", () => {
    expectReported(classification(`const specifier = "./x" + String(1);
        const rows = [1];
        async function make(): Promise<unknown> { return await import(specifier); }
        describe.each(rows.map(() => make()))("d", () => {
          it("x", () => { expect(1).toBe(1); });
        });`), { construct: REPORTS.dynamicImport, module: OWN_FILE });
  });

  it("a TOP-LEVEL hook reaching PROVENANCE classifies touching (AC-12)", () => {
    // The arc's only PROVENANCE silent free. classifyTests seeds its walk with
    // an empty hook list and only adds hooks at a `describe`, so a file whose
    // beforeEach sits at top level has none attached to any test. Probe §3.5
    // measures this environment-free today; 6 of the 33 enrolled suites are
    // shaped this way.
    expect(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         beforeEach(() => { spawnHelper(); });
         it("x", () => { expect(1).toBe(1); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it.each(["beforeEach", "beforeAll", "afterEach", "afterAll"])(
    "a TOP-LEVEL %s holding a construct reports (AC-11)",
    (hook) => {
      // AC-11 requires this separately for all four registrars, not just
      // beforeAll: probe §3.11 row D measures a top-level afterAll free today
      // exactly as beforeEach is, so a single-registrar block would read as
      // complete while leaving half the defect live.
      expectReported(
        classification(`const specifier = "./x" + String(1);
          ${hook}(async () => { await import(specifier); });
          it("x", () => { expect(1).toBe(1); });`),
        { construct: REPORTS.dynamicImport, module: OWN_FILE },
      );
    },
  );

  it("a TOP-LEVEL hook with a PURE body stays free", () => {
    // The foil: attaching top-level hooks must not mark every test in every
    // file that has one: and 6 enrolled suites have one.
    expect(
      verdict(`function pure(): number { return 1; }
        beforeEach(() => { pure(); });
        it("x", () => { expect(1).toBe(1); });`),
    ).toBe("environment-free");
  });

  it.each(["beforeEach", "beforeAll", "afterEach", "afterAll"])(
    "a TOP-LEVEL %s reaching provenance classifies touching (AC-12)",
    (hook) => {
      // Probe §3.11 row D measures a top-level afterAll environment-free today,
      // exactly as beforeEach is. Pinning only the two before* forms would leave
      // half the defect live while the block read as complete. The shipped
      // registrar regex already covers all four (premiseScan.ts:827).
      expect(
        classificationWithModules(
          {
            helper: `import { spawnSync } from "node:child_process";
              export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
          },
          `import { spawnHelper } from "__MODULE_helper__";
           ${hook}(() => { spawnHelper(); });
           it("x", () => { expect(1).toBe(1); });`,
        )?.verdict,
      ).toBe("environment-touching");
    },
  );

  it("the top-level seed does NOT leak a nested hook to a sibling (AC-12b)", () => {
    // The criterion AC-11's pure-hook foil cannot catch. hookBodies walks with
    // ts.forEachChild (premiseScan.ts:895), so a seed written as one recursive
    // call over the SourceFile attaches EVERY hook in the file to EVERY test in
    // it, turning this pure sibling environment-touching. A FALSE POSITIVE,
    // the direction spec §0 forbids trading into.
    //
    // Read by NAME, not by first-classification: verdictWithModules returns the
    // FIRST test (inA), which is environment-touching before the repair, after
    // it, AND under the wrong recursive implementation, so a fixture written
    // that way cannot fail for the reason it claims. inB is the discriminating
    // assertion and it is only reachable through the full list.
    //
    // NOTE the shared outer describe is deliberately ABSENT: with one, the
    // pre-existing recursive collection in the describe branch already leaks
    // (probe §3.11 row A, spec §4 limit 14) and inB would be touching before
    // and after, proving nothing about the seed.
    const all = classificationsWithModules(
      {
        helper: `import { spawnSync } from "node:child_process";
          export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
      },
      `import { spawnHelper } from "__MODULE_helper__";
       describe("A", () => {
         beforeEach(() => { spawnHelper(); });
         it("inA", () => { expect(1).toBe(1); });
       });
       describe("B", () => {
         it("inB", () => { expect(1).toBe(1); });
       });`,
    );
    expect(all.find((t) => t.testName === "inA")?.verdict).toBe("environment-touching");
    expect(all.find((t) => t.testName === "inB")?.verdict).toBe("environment-free");
  });

  it("AC-12b: a PURE top-level hook beside a spawning nested one", () => {
    // The second shape AC-12b requires. The top-level hook attaches to BOTH
    // tests, so if the seed were to carry the nested hook's provenance with it,
    // inB would flip. Pinning the pure top-level hook separately is what shows
    // the seed adds the hook without adding the nested one's reach.
    const all = classificationsWithModules(
      {
        helper: `import { spawnSync } from "node:child_process";
          export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
      },
      `import { spawnHelper } from "__MODULE_helper__";
       beforeEach(() => { void 0; });
       describe("A", () => {
         beforeEach(() => { spawnHelper(); });
         it("inA", () => { expect(1).toBe(1); });
       });
       describe("B", () => { it("inB", () => { expect(1).toBe(1); }); });`,
    );
    expect(all.find((t) => t.testName === "inA")?.verdict).toBe("environment-touching");
    expect(all.find((t) => t.testName === "inB")?.verdict).toBe("environment-free");
  });

  it("AC-12b: the SHARED-OUTER leak is pinned at its CURRENT value", () => {
    // Spec §4 limit 14 and AC-12b: under a shared outer describe, hookBodies'
    // recursion ALREADY leaks branch A's hook to sibling B, and this arc does
    // not fix it (repairing it moves live verdicts and breaks AC-1). Asserting
    // the leaked value pins "this arc did not WIDEN it", without this case a
    // seed change could deepen the leak with nothing going red.
    const all = classificationsWithModules(
      {
        helper: `import { spawnSync } from "node:child_process";
          export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
      },
      `import { spawnHelper } from "__MODULE_helper__";
       describe("outer", () => {
         describe("A", () => {
           beforeEach(() => { spawnHelper(); });
           it("inA", () => { expect(1).toBe(1); });
         });
         describe("B", () => { it("inB", () => { expect(1).toBe(1); }); });
       });`,
    );
    expect(all.find((t) => t.testName === "inA")?.verdict).toBe("environment-touching");
    // The documented pre-existing FALSE POSITIVE, asserted as-is (probe §3.11 row A).
    expect(all.find((t) => t.testName === "inB")?.verdict).toBe("environment-touching");
  });

  it("a hook reaching PROVENANCE still classifies touching (C6 foil)", () => {
    // The foil for the three hook cases: the hook path already carried
    // provenance correctly, so what the repair adds is the reason channel and
    // nothing else. If this regresses, the merge broke the hook loop.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         describe("d", () => {
           beforeEach(() => { spawnHelper(); });
           it("x", () => { expect(1).toBe(1); });
         });`,
      ),
    ).toBe("environment-touching");
  });

  it("a CROSS-MODULE helper holding a construct reports, naming that module", () => {
    const modules = {
      loader: `const specifier = "./x" + String(1);
        export async function load(): Promise<unknown> { return await import(specifier); }`,
    };
    const src = `import { load } from "__MODULE_loader__";
      it("x", async () => { await load(); });`;
    expectReported(classificationWithModules(modules, src), { construct: REPORTS.dynamicImport, module: /mod\d+_loader/, notModule: /case\d+-user/ });
    expect(classificationWithModules(modules, src)?.detail ?? "").toMatch(/loader/);
  });

  it("a helper WITHOUT the construct stays free", () => {
    // The foil: propagation must not report every reachable helper.
    //
    // It must contain NO import at all. A round-1 draft used
    // `return await import("./x")`, which after Task 3 is BOTH an embedded
    // dynamic import and an unresolved in-repo specifier, so §2.4b reports it
    // and the foil asserts a value no later task may restore.
    expect(
      verdict(`function loader(): number { return 1; }
        it("x", () => { loader(); });`),
    ).toBe("environment-free");
  });

  it("a construct in the test's OWN body outranks a provable environment reach", () => {
    // AC-12, branch one: shipped precedence, unchanged (spec §2.7).
    expectReported(
      classification(`import { spawnSync } from "node:child_process";
        const specifier = "./x" + String(1);
        it("x", async () => { spawnSync("git", []); await import(specifier); });`),
      { construct: REPORTS.dynamicImport, module: OWN_FILE },
    );
  });

  it("a construct reached only through a HELPER loses to a provable environment reach", () => {
    // AC-12, branch two: the asymmetry §2.7 states and §4 limit 7 files.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const specifier = "./x" + String(1);
        async function loader(): Promise<unknown> { return await import(specifier); }
        it("x", async () => { spawnSync("git", []); await loader(); });`),
    ).toBe("environment-touching");
  });

  it("a reason is reported once, not twice", () => {
    // The test's own extent is also visited by the traversal, so both paths see
    // a construct in the test body; `detail` must not repeat it.
    const c = classificationWithModules(
      {},
      `const specifier = "./x" + String(1);
       it("x", async () => { await import(specifier); });`,
    );
    expect((c?.detail ?? "").match(/non-literal specifier/g) ?? []).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "unclassifiable propagation"
```

Expected: a non-zero FAILING count. Red: the four helper-position cases, the three nested hook and producer cases, the cross-module case, and **both TOP-LEVEL cases** — the provenance one especially, which is `environment-free` today and is the arc's only provenance silent free. Already green, as foils: the C6 nested provenance hook, the top-level PURE hook, the no-construct helper, and both AC-12 helper/own-extent branches. `a reason is reported once` is also green at authoring time — a regression pin for the double-report the merge could introduce, not a red.

- [ ] **Step 3: Implement.** Two changes:

  1. Inside `reaches`'s `visit`, evaluate `unclassifiableWithin(node, f)` on each visited node and push each reason into `reasons`, naming the module the node belongs to (Task 1 Step 5's rule). **And merge the hook loop's reasons here, because nothing else does.** Task 1 changed the hook call site to read `.verdict` only so the file compiles; hook reasons are still discarded at that point, which is exactly what the nested `beforeEach`, nested `beforeAll` and `describe.each` producer cases red on. In `classifyTests`, capture the full `Reach` from each hook and producer call, keep the existing `verdict === "environment-touching"` comparison, and merge `reasons` into the same de-duplicated `detail` the test-extent call site feeds. Without this line those three cases stay `environment-free` and this task's command cannot green.
  2. **Collect the file's TOP-LEVEL hooks and seed the walk with them.** `classifyTests` starts `walk(facts.sf, [])` and only ever adds hooks when it meets a `describe`, so a top-level `beforeEach` is attached to nothing. Gather the hook calls that are direct statements of the `SourceFile` and pass them as the walk's initial `hooks` array. Vitest applies a top-level hook to every test in the file, so this is the correct reading rather than an over-reach — and it is the only change in this arc that repairs a PROVENANCE silent free rather than a reason one.

  Leave `classifyTests`'s own-extent `ownUnresolved` call and its precedence exactly as they are — the propagated path is additive and the own-extent path keeps outranking `environment-touching`. Do NOT move the provenance short-circuit in `visit`: that ordering is what makes AC-12's helper branch true.

- [ ] **Step 4: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "unclassifiable propagation"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, 33 counts unchanged, unclassifiable set empty.

- [ ] **Step 5: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): propagate unresolvable constructs from helpers, hooks and producers"
```

---

### Task 6: Performance ratio, the retired acceptance, and the mechanical AC-1 gate

<!-- task: red=`pnpm heavy pnpm mutation:guards` red-state=authored red-target=`tests/mutation/source/registry.ts:37` why=`ANCHOR IS PRE-MERGE: :37 declares accepted: AcceptedSurvivor[], the line-keyed ledger every surface row carries; the premiseScan row itself arrives with #827 and Task 0 re-anchors. Its accepted siteIds are LINE-keyed and Tasks 1-5 move every line below their first hunk, so after the repair the ledger holds stale rows. The gate is the ONLY thing that reads them - stale-ledger-row and unaccepted-survivor live in tests/mutation/source/gate.ts and are reached by pnpm mutation:guards, NOT by the registry meta-test, whose validateSurface checks siteId SHAPE only and passes before and after. The same command greens once the surviving rows are re-derived and the falsified one is retired` ac=AC-1,AC-14,AC-15 -->

**Files:**

- Modify: `tests/mutation/source/registry.ts` (the `premiseScan` row's `accepted` array and comments)
- Modify: `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS.premiseScan`)
- Modify: `tests/mutation/_metaPremiseContract.test.ts` (comment only — no numeric change)

**Interfaces:** Consumes `enumerateSites` / `siteId` (`tests/mutation/source/operators.ts`). Produces the score and unaccepted-survivor set the round-1 diff brief must state.

- [ ] **Step 0: Observe the task's `red=` FIRST, before changing anything.**

```bash
pnpm heavy pnpm mutation:guards
```

Expected: **FAIL**, with `stale-ledger-row` for `premiseScan`. Tasks 1-5 moved every line below their first hunk and the accepted `siteId`s are LINE-keyed, so the ledger holds stale rows on entry to this task. A round-1 draft ran this command only at Step 5, AFTER re-deriving and retiring — so the named `red=` was never observed red before being made green, which is the same-command red/green contract this plan is written under. Record the failing condition and the rows it names.

- [ ] **Step 1: Measure the corpus pass and compare against Task 0's baseline as a RATIO.**

```bash
npx tsx -e '
import { classifyTests } from "./tests/mutation/source/premiseScan";
import { GUARD_SURFACES } from "./tests/mutation/source/registry";
const ROOT = process.cwd();
const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();
const t0 = Date.now();
let n = 0;
for (const s of suites) n += classifyTests(ROOT, s).length;
console.log(`suites=${suites.length} tests=${n} corpus-pass=${((Date.now() - t0) / 1000).toFixed(2)}s`);
'
```

Make it a COMMAND that exits non-zero, not a figure to eyeball — a reading instruction is the defect AC-1 was repaired to remove. Task 0 Step 4 writes its figure to a gitignored scratch file under the worktree's probe directory, `corpus-pass-baseline.txt`; this step reads it:

```bash
PROBE_DIR="$(git rev-parse --show-toplevel)/.claude/probe"   # defined in Task 0 Step 4
BASE=$(cat "$PROBE_DIR/corpus-pass-baseline.txt")
# Validate BEFORE comparing. Both AC-14 comparisons fail OPEN on NaN.
grep -Eq '^[0-9]+(\.[0-9]+)?$' <<<"$BASE" && [ "$(echo "$BASE > 0" | bc)" = 1 ] \
  || { echo "AC-14 FAIL: baseline '$BASE' is not a positive number"; exit 1; }
npx tsx -e '
import { classifyTests } from "./tests/mutation/source/premiseScan";
import { GUARD_SURFACES } from "./tests/mutation/source/registry";
const base = Number(process.argv[1]);
if (!Number.isFinite(base) || base <= 0) { console.error(`AC-14 FAIL: baseline ${process.argv[1]} is not a positive number`); process.exit(1); }
const ROOT = process.cwd();
const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();
const t0 = Date.now();
for (const s of suites) classifyTests(ROOT, s);
const secs = (Date.now() - t0) / 1000;
console.log(`corpus-pass=${secs.toFixed(2)}s baseline=${base.toFixed(2)}s ratio=${(secs / base).toFixed(2)}x`);
if (secs > 30) { console.error("AC-14 FAIL: over the 30s budget"); process.exit(1); }
if (secs > base * 3) { console.error("AC-14 FAIL: over 3x the baseline"); process.exit(1); }
' "$BASE"
```

Expected: exit 0. **Both bounds are required** — the 30 s ceiling alone admits a 1.5 s → 29 s regression, and the documented scope-walk regression was 3.7×. The band is 3× rather than 2× because this is an unwrapped `tsx` run on a box running many arcs concurrently, so a 2× band on a ~1.5 s figure measures scheduler noise rather than the scanner. Record both figures in the commit message. A failure means the provenance short-circuit moved; revisit Task 5 Step 3 rather than relaxing the bound.

- [ ] **Step 2: Re-derive the surviving accepted rows.** Do not hand-adjust line numbers.

```bash
npx tsx -e '
import { readFileSync } from "node:fs";
import { enumerateSites, siteId } from "./tests/mutation/source/operators";
// enumerateSites(sourcePath, text, operators) — tests/mutation/source/operators.ts:99
const SOURCE = "tests/mutation/source/premiseScan.ts";
const src = readFileSync(SOURCE, "utf8");
for (const s of enumerateSites(SOURCE, src, ["relational-boundary", "equality-flip", "integer-literal"])) {
  console.log(siteId(s));
}'
```

Match each surviving row to its new `siteId` by the mutated EXPRESSION, never by line.

- [ ] **Step 3: RETIRE the falsified acceptance.** The `integer-literal` row accepted `equivalent` on the grounds that "`unresolved` is provably always empty… populated only where `factsFor` returns null" has its premise destroyed by Tasks 1 and 5: `reasons` is now populated from two ordinary constructs plus every declined export form, so the `> 0` → `> 1` mutant becomes a live silent-free at exactly one reason. **Delete the row** — re-keying it moves a line and never re-tests its argument — and let the gate demand a kill. If the mutant survives, the case that kills it is a fixture with exactly one propagated reason, which Task 5's cross-module case already is.

- [ ] **Step 4: Update `EXPECTED_LEDGER_KINDS`.** `tests/mutation/guardSurfaces.gate.test.ts` declares `premiseScan: { equivalent: 3, "accepted-gap": 1 }` and asserts it with `toEqual`, so retiring the row reds it until the declaration matches the ledger.

- [ ] **Step 5: Run the gate** — a full harness run, under the heavy semaphore. This is the task's `red=` command.

```bash
pnpm heavy pnpm mutation:guards
```

Expected: `premiseScan` meets `scoreFloor: 0.95` with an EMPTY unaccepted-survivor set. Any unaccepted survivor is a real coverage gap in Tasks 1-5's cases: add the case that kills it, or accept it with a row meeting the registry's stated bar. Record the score and survivor set — the round-1 diff brief must state both.

- [ ] **Step 6: Run the mechanical AC-1 gate, after proving it discriminates.** The suite alone cannot catch a re-baseline; it passes afterwards.

```bash
BASE=$(git merge-base origin/main HEAD)
if git diff "$BASE" -- tests/mutation/_metaPremiseContract.test.ts | rg -q '^[-+].*: *[0-9]+,'; then
  echo "AC-1 FAIL: a declared count moved"; exit 1
else
  echo "AC-1 ok"
fi
```

Expected: `AC-1 ok`, exit 0. The base is the merge-base, not `origin/main`, which moves under a live arc. **Prove the gate before trusting it:** temporarily change one declared number, confirm the command prints `AC-1 FAIL` and exits 1, then revert and re-run.

- [ ] **Step 7: Run the full suite and the static gates — but note what it CANNOT be green on yet.**

`_metaLedgerReferentialIntegrity.test.ts` scans the tracked spec and plan, both of which already cite `BL-PREMISESCAN-UNPARSEABLE-MODULE-UNREACHABLE` and `BL-PREMISESCAN-NESTED-HOOK-SIBLING-LEAK`, and those rows do not exist until Task 7 Step 1 writes them. That gate reds on a citation whose definition is absent, so it was red on the docs-only branch as soon as the spec named its own filings. **Both rows are therefore already filed**, in the spec+plan segment rather than at Task 7; Task 0 Step 6 verifies them and Task 7 keeps only the archive move, the marker removal and the corpus read. This run is consequently green on referential integrity like any other.

```bash
pnpm heavy pnpm test
pnpm typecheck && pnpm exec eslint . && pnpm format:check
```

- [ ] **Step 8: Commit.**

```bash
git add tests/mutation/source/registry.ts tests/mutation/guardSurfaces.gate.test.ts tests/mutation/_metaPremiseContract.test.ts
git commit -m "test(infra): re-derive the premiseScan ledger and retire the acceptance this arc falsifies"
```

---

### Task 7: Graduation — the new limit's row, the ledger, the round corpus

<!-- task: red=`npx vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:52` why=`:52 is the isArchive predicate the rule rests on (:51 is its doc comment) - an archive holds finished work, so moving BL-PREMISESCAN-IMPORT-EDGE-FIDELITY into BACKLOG-archive.md with its IN PROGRESS marker still attached (Step 2) reds this suite; stripping the marker in the same edit session (Step 3) greens the same command, which is what proves the marker came off before the merge` ac=AC-1 -->

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`, `docs/review-rounds/fix/premisescan-import-edges/`.

**Interfaces:** Consumes Task 6's score. Produces a merged, archived row, a clean ledger, and the filed limit.

- [ ] **Step 1: (already done — the rows were filed in the spec+plan segment.)** Both `BL-PREMISESCAN-UNPARSEABLE-MODULE-UNREACHABLE` and `BL-PREMISESCAN-NESTED-HOOK-SIBLING-LEAK` exist in `BACKLOG.md` on this branch, because the spec and plan cite them and referential integrity reds on a citation without a definition. Task 0 Step 6 verifies they are still there; this task adds nothing.


- [ ] **Step 2: Move the entry to the archive WITH its marker still attached, and observe the red.**

```bash
npx vitest run tests/docs/_metaLedgerInProgress.test.ts
```

Expected: FAIL — an archive may not hold an entry whose status is IN PROGRESS.

- [ ] **Step 3: Strip the `**Status:** IN PROGRESS · **Branch:** fix/premisescan-import-edges` field**, replacing it with the graduation record: date, PR number, what shipped, and which of spec §4's limits remain open as documented limits rather than defects. **This is the same edit session as Step 2's archive move, and that is required rather than convenient:** AGENTS.md invariant 12 says a GRADUATING entry's marker comes off in the same commit that archives it, precisely because archives categorically reject in-progress entries. A round-5 draft deferred the strip to a post-review commit, which left Step 4's `_metaLedgerInProgress` run asserting PASS over an archived entry still marked in progress — a state the guard rejects by construction (`{"isArchive":true,"isInProgress":true,"rejected":true}`).

- [ ] **Step 4: Run the ledger and docs gates.**

```bash
npx vitest run tests/docs/_metaLedgerInProgress.test.ts \
  tests/docs/_metaLedgerSizing.test.ts \
  tests/docs/_metaLedgerReferentialIntegrity.test.ts \
  tests/docs/_metaDeferralLedgerGraduation.test.ts \
  tests/docs/_metaReviewRoundEconomy.test.ts \
  tests/docs/specsReadmeIndexParity.test.ts
ls docs/review-rounds/fix/premisescan-import-edges/
```

Expected: all PASS. **Read every file in that directory, not one** — Task 0's merge moved the merge-base, so the arc's rows are split across a pre-merge and a post-merge base sha. If `_metaReviewRoundEconomy` reds, a stage reached `ROUND_THRESHOLD` counted rounds and the arc owes a filing beside the rows that triggered it. A `no_verdict` dispatch is NOT a counted round.

- [ ] **Step 5: Commit — this must be the PR's LAST commit**, so the IN PROGRESS marker never reaches `main` (AGENTS.md invariant 12).

**Sequencing, and the constraint it has to satisfy in both directions.** Two binding rules meet here: the whole-diff review must examine the diff that actually merges (writing-plans), and the IN PROGRESS marker must come off in the PR's last commit so it never reaches `main` (invariant 12). A round-3 draft deferred ALL of Step 5 until after review, which puts the archive move, the new rows and the corpus update outside the reviewed diff — the first rule broken to satisfy the second.

The resolution, and it has to account for the review's own footprint:

1. **Steps 2-5 land BEFORE the whole-diff review** — archive move, marker strip and graduation record in one commit, then the gate runs. The reviewer therefore sees every substantive line that will merge, including the graduation.
2. **The marker comes off WITH the archive, in Step 3, not later.** Invariant 12 is explicit that a graduating entry works this way, and the guard enforces it: an archived entry still marked in progress is rejected, so deferring the strip makes Step 4 un-greenable. This arc's marker therefore never reaches `main` by virtue of the archive commit itself, which is the outcome invariant 12 wants.
3. Any repair commits from the review land next.
4. **The only post-review commit is the review-corpus rows for that review**, and there is no marker in it. The corpus rows cannot be in the reviewed tree by construction — the wrapper writes them at dispatch time, so the row describing a review always postdates the tree that review examined. That is true of every arc in this repo, not a property of this plan, and AGENTS.md's corpus contract already says the rows are committed with the arc. They are mechanically generated dispatch records, not substantive change. Nothing else may enter this commit.
5. Re-read `docs/review-rounds/` before that commit: the diff-stage rows do not exist when Steps 2-4 first run, and a stage may cross `ROUND_THRESHOLD` on the strength of them, which would owe a filing that must itself be in the final commit.

```bash
git add BACKLOG.md BACKLOG-archive.md docs/review-rounds/
git commit -m "docs(backlog): graduate BL-PREMISESCAN-IMPORT-EDGE-FIDELITY"
```

<!-- tasks: end -->

---

## Verification summary

| spec AC | proven by |
| --- | --- |
| AC-1 verdict-neutral | Task 6 Step 6 (mechanical, merge-base keyed, discrimination proven) + the `_metaPremiseContract` run ending every task |
| AC-2 namespace member edges | Task 4, `ns.member` and `ns["member"]` |
| AC-2b dynamic namespace | Task 4, `a DYNAMIC namespace binding resolves` + its destructured foil |
| AC-2c namespace dedup includes the member | Task 4, both orders (pure-first and spawn-first) |
| AC-3 member-precise, not module-wide | Task 4, `a namespace member that is PURE stays free even when a sibling spawns` |
| AC-4 default named `default` | Task 1, `a renamed default import resolves` + the same-name foil |
| AC-4b renamed default CLASS | Task 1, `a renamed default CLASS resolves` |
| AC-5 every accepted export BRANCH | Task 1 (E1's four kinds separately — const incl. destructured, function, class, enum — plus E3/E4) + Task 2 (E5-E6, chain, import-then-export) with the MIXED-barrel foil |
| AC-5b star-export ambiguity | Task 2, `the branch that HAS the name wins` + the benign-miss foil |
| AC-5c unmodelled runtime references REPORT, by rule | Task 3, one `it.each` over §2.4b's table, the four EXPORTED dynamic spellings as further reporting cases, and the BARE-specifier foil that keeps L-2 intact. The modelled foil is the LOCAL dynamic namespace, which lives in Task 4 with the member resolution it needs |
| AC-5d the branches AC-5 named but did not pin | Task 1, E3 (`export default <expr>`, free today), E1 array-binding and multi-declarator separately, E2 by imported-name (aliased + default), value-over-type precedence, E6's `default` negative, and the direct `noSuchExport` cell |
| AC-6 AC-10b direct | Task 4, `AC-10b stays quiet through a direct import` |
| AC-7 AC-10b via namespace | Task 4, `AC-10b stays quiet through a namespace` |
| AC-8 declined forms REPORTED | Task 3, four forms; `export { ns }` is proven in Task 4, which owns the namespace flag it reads + a VALUE-position type-only foil; the unparseable form is out of scope (spec §4 limit 8), filed in Task 7 Step 1 |
| AC-9 non-language targets pure | Task 1, `a data import is PURE, and the specifier carries the extension` |
| AC-9b `.mjs` and `.jsx` stay analyzed | Task 1, `a .mjs target stays ANALYZED` and `an explicit .jsx target stays ANALYZED` — AC-9's foils |
| AC-9c unrecognized shape REPORTED | Task 1, `an unrecognized module shape is REPORTED, not purified` |
| AC-9d `.mdx` REPORTED, not purified | Task 1, `an .mdx target is REPORTED, not purified` — AC-9's twin, same payload, extension the only difference |
| AC-10 cycles terminate, diamonds do not | Task 2, the cycle case (asserting the REASON) + the PURE diamond foil + the touching-diamond short-circuit pin |
| AC-10c export beats same-named local | Task 2, `an EXPORT beats a same-named non-exported local` — it needs E5 following, which Task 1 does not implement |
| AC-11 propagation from every position | Task 5, four helper positions + three nested hook/producer cases + a TOP-LEVEL hook + cross-module, with the C6, top-level-pure and no-construct foils |
| AC-12 precedence every direction | Task 5, own-extent and helper branches plus the TOP-LEVEL hook reaching provenance, in all four registrar spellings — the arc's only provenance silent free |
| AC-12b top-level seed does not leak a nested hook | Task 5, the sibling-describe pair read by `testName` (not by first-classification) |
| AC-13 provenance-module precedence | Task 4, both `node:child_process` namespace cases |
| AC-14 performance, ratio-bounded | Task 6 Step 1 against Task 0 Step 4 |
| AC-15 mutation gate, acceptance retired | Task 6 Steps 2-5 |
