# premiseScan Import-Edge Fidelity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `premiseScan`'s cross-module lookup resolve EXPORTS rather than local declarations, and propagate the two recognized-but-unresolvable constructs through the traversal — closing both false negatives of `BL-PREMISESCAN-IMPORT-EDGE-FIDELITY` without re-opening the AC-10b false positive.

**Architecture:** One merge-gate task, then five TDD tasks that each replace or extend exactly one mechanism: (1) the export resolver's local forms plus default naming plus the non-language-target guard, (2) forwarded exports with termination, (3) the declined forms reporting `unclassifiable`, (4) namespace bindings resolved member-precisely, (5) propagation of the two constructs through `reaches`. Then a verification task (performance + mutation re-derivation) and a graduation task. Every task's RED is a new case in the existing `premiseScan.test.ts` whose failure is caused by a named production defect, each already demonstrated by the committed probe record.

**Tech Stack:** TypeScript, the `typescript` compiler API (AST only — never the type checker), vitest, the in-repo source-mutation harness (`tests/mutation/source/*`), tsx.

**Spec:** `docs/superpowers/specs/ci/2026-08-16-premisescan-import-edge-fidelity-design.md` — read it in full first. §1 (convergence contract), §1.1 (do-not-relitigate), §2 (design), §4 (documented limits) and §6 (acceptance criteria) are the contract every task below argues from. Its probe record is `docs/superpowers/specs/ci/probes/2026-08-16-premisescan-import-edge-probe.md`.

## Global Constraints

- Worktree-only work (AGENTS.md invariant 11); TDD per task (invariant 1); commit per task, conventional-commits (invariant 6). Scope prefix for this arc: `fix(mutation)` for scanner changes, `test(mutation)` for test-only tasks, `docs(backlog)` for graduation.
- **BLOCKED ON PR #827 (`fix/scanner-scope-totality`) MERGING.** That PR rewrites the very lookup this arc replaces. Do not edit `tests/mutation/source/premiseScan.ts` before Task 0 confirms #827 is on `origin/main`. Two writers on one file is the hazard invariant 11 exists to prevent.
- Spec §1.1 is binding and every item is ratified: scope-aware extents and the AC-10b `res` collision are settled; module-closure resolution is REJECTED (a namespace must resolve member-precisely); the recognized-unresolvable list stays CLOSED at four forms — this arc adds no fifth family; symbol-level data-flow analysis is declined; `node_modules` is pure (L-2) and undetected ≠ unclassifiable (L-8); the §2.7 precedence asymmetry is a decision with the alternative filed as §4 limit 5.
- **Verdict-neutrality is the headline constraint.** `tests/mutation/_metaPremiseContract.test.ts` asserts each enrolled suite's `environment-touching` count with an exact `toBe`, AND asserts the unclassifiable set is EMPTY. No task may edit a numeric value in `EXPECTED_ENV_TOUCHING`, and no task may leave any enrolled test `unclassifiable`. Spec §3.3 measured zero occurrences of every repaired form in that domain, so this is achievable, not aspirational — if a task needs to change a number, the repair over-reached and the task stops.
- **Heavy-slot rule (AGENTS.md).** Every full harness run is `pnpm heavy pnpm mutation:guards`; every full suite run is `pnpm heavy pnpm test`. Scoped vitest runs with an explicit file list stay UNWRAPPED — every `red=` command in this plan is a scoped run and is deliberately unwrapped.
- **AST only, never the type checker.** `premiseScan` builds source files with `ts.createSourceFile` and has no `ts.Program`. Every rule added here is a syntactic AST rule. Do not introduce a type checker: it would require a program build per module and blow the performance budget the arc must defend (AC-14).
- **No bound expressed as a NUMBER.** Termination comes from the finite `(modulePath, exportName)` visited set (spec §2.5), never a depth counter — AGENTS.md's repair-economy rule, bullet 1.
- Convergence criterion for review of this arc: spec §1's consequence bound, `PROBE DOMAIN` and threat fence, plus — from the round-1 diff brief onward — the `premiseScan` mutation score with an empty unaccepted-survivor set.
- impeccable-gate: N/A — no UI surface. No file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*` or `DESIGN.md` is touched.
- **A `-t` filter that matches nothing EXITS 0 — probed, not assumed.** `npx vitest run tests/mutation/source/premiseScan.test.ts -t "no such block name xyzzy"` reports `Tests 22 skipped (22)` and exits `0`. Every `red=` command in this plan is a `-t` filter on a describe block that does not exist until that task's Step 1 writes it, so running the red command BEFORE Step 1 produces a false green. Two consequences, binding on every task below: (a) Step 1 (write the cases) always precedes Step 2 (observe the red) — never reorder them; (b) Step 2's pass criterion is that the run reports the named cases as **FAILED**, with a non-zero failing count, never merely a non-zero exit and never `skipped`. A step-2 run reporting `0 failed` has not observed a red, whatever its exit code.

**Meta-test inventory (writing-plans rule):** this plan **EXTENDS** `tests/mutation/source/premiseScan.test.ts` (new fixture groups) and `tests/mutation/source/registry.ts` (the `premiseScan` row's `accepted` array, re-derived). It **EXTENDS COMMENTS ONLY** in `tests/mutation/_metaPremiseContract.test.ts` — no numeric change. It **CREATES no new meta-test**: `_metaPremiseContract.test.ts` already walks the enrolled suites from the registry (so a newly enrolled surface is covered by default) and already asserts the unclassifiable set is empty, which is the structural guard for the reporting posture this arc extends. No other registry applies — no Supabase call boundary, no `admin_alerts` row, no tile sentinel, no advisory lock, no §12.4 catalog row, no migration.

**Mutation-family closure (writing-plans rule):** the operator families are fixed by the already-ratified registry row — `relational-boundary`, `equality-flip`, `integer-literal` over `tests/mutation/source/premiseScan.ts`, `scoreFloor: 0.95`. A reviewer-proposed NEW family is a registry change carrying its own before/after numbers (AGENTS.md convergence bullet 4), not a finding against this plan.

**Probe evidence, authored AND run (2026-08-16, against `origin/fix/scanner-scope-totality` at `ac9a40cd8`).** Every RED below names a production defect that the committed probe record already demonstrates. The mapping from task to probe row:

| task | probe rows that demonstrate the defect | current verdict |
| --- | --- | --- |
| Task 1 | `H1 default_renamed`, and `H1 default_samename` as the coincidence foil | `environment-free` / `environment-touching` |
| Task 2 | `H1 reexport named`, `reexport aliased`, `reexport star`, `reexport default`, `reexport chain 2-deep`, `local reexport` | all `environment-free` |
| Task 3 | `H1 unfollowable reexport (missing target)`, `H1 reexport namespace` | both `environment-free` |
| Task 4 | `H1 namespace member`, `H1 namespace destructured` | both `environment-free` |
| Task 5 | `H2 module_dynamic`, `describe_dynamic`, `module_computed`, `describe_computed`, `cross-module dynamic` | all `environment-free` |

**Shared test helper.** `tests/mutation/source/premiseScan.test.ts` already owns `verdictWithModule(moduleSrc, testSrc)` (in its `scope-aware extent resolution` describe block), which writes one helper module plus one test file into the suite's `scratch` dir and returns the verdict. Several tasks below need TWO extra modules (a barrel and its target), so Task 2 Step 1 generalizes it once and every later task consumes the generalized form. Its exact signature is in Task 2's **Interfaces**.

---

### Task 0 (setup, outside the checked task region): Merge gate and citation refresh

**Files:**

- Modify: none tracked, unless the merge produces conflicts
- Read: `tests/mutation/source/premiseScan.ts` (post-merge), the spec, the probe record

**Interfaces:**

- Produces: a worktree whose `tests/mutation/source/premiseScan.ts` is the 843-line #827 version, and a confirmation that the spec's two probe tables still hold. Every later task assumes both.
- Consumes: nothing.

- [ ] **Step 1: Confirm #827 is merged.** Do not proceed while it is open.

```bash
git fetch origin
gh pr view 827 --json state,mergedAt --jq '{state, mergedAt}'
```

Expected: `{"state":"MERGED", ...}`. If it is still `OPEN`, STOP — set the ship marker's `blockedOn` to `awaiting PR #827 merge` and wait. Nothing below is safe to start.

- [ ] **Step 2: Merge and verify the target is present.**

```bash
git merge origin/main --no-edit
wc -l tests/mutation/source/premiseScan.ts
rg -n "moduleScopeExtent|unclassifiableWithin|scopedImports|isProvenanceModule" tests/mutation/source/premiseScan.ts
```

Expected: the file is the scope-aware version (roughly 843 lines, not 446) and all four symbols resolve. If `moduleScopeExtent` is absent, the design's central citation is stale — STOP and re-derive §2.1 before writing code.

- [ ] **Step 3: Re-run the probe harness against the merged tree.** Recreate the two behavioral harnesses from the probe record's Method sections under a gitignored `.claude/probe/` directory, importing `classifyTests` from the merged `tests/mutation/source/premiseScan.ts` rather than from a `git show` copy.

```bash
mkdir -p .claude/probe   # gitignored; verify with: git check-ignore -v .claude/probe
npx tsx .claude/probe/importForms.ts
```

Expected: the two tables in the probe record's Results sections, unchanged. **If any row has moved, the design is re-derived before implementation, not after** — a moved row means #827's final state differs from what the spec was written against.

- [ ] **Step 4: Re-verify every symbol anchor the spec cites.** The spec anchors by symbol precisely because the target was on an unmerged branch; confirm each still names what §2 claims.

```bash
rg -n "function moduleScopeExtent|function unclassifiableWithin|function resolveSpecifier|function extentIsProvenance|const scopeCache|isProvenanceModule\(imported.spec\)|ownUnresolved" tests/mutation/source/premiseScan.ts
```

- [ ] **Step 5: Record the baseline.** Capture the pre-change CORPUS PASS, which AC-14 compares against — the scan itself, not the vitest suite duration, which is dominated by spawned child fixtures and would hide a several-fold scan regression.

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

Record the reported `corpus-pass` figure in the Task 6 notes; the pre-merge measurement on 2026-08-16 was `suites=29 tests=1314 corpus-pass=1.49s`. Expected: PASS, with every declared count holding — 31 rows post-#827, the two added ones being `tests/mutation/source/premiseScan.test.ts` (declared `0`) and `tests/mutation/_metaPremiseContract.test.ts` (declared `1`).

- [ ] **Step 6: Commit** (only if the merge produced a commit).

```bash
git log --oneline -1
```

---

<!-- tasks: depth=3 red-contract -->

### Task 1: Export resolution — local forms, default naming, and the non-language-target guard

Replaces `moduleScopeExtent` with `resolveExport`, covering spec §2.2 rows E1-E4 and spec §2.4. This is the task that makes the importer's local name stop crossing a module boundary.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "export resolution"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:111` why=`ANCHOR IS PRE-MERGE: :111 is the default-import registration on the tracked tree today (imports.set(clause.name.text, spec)); Task 0 merges #827 and re-anchors before this task runs. The defect is identical in both versions - the default-import branch of moduleFacts records — the LOCAL name — so moduleScopeExtent looks up "runIt" in a module whose default export is named "default"; the probe row H1 default_renamed measures environment-free today and the new "a renamed default import resolves" case reds on exactly that line, greening when the branch records "default" and resolveExport handles E3/E4` ac=AC-4,AC-9 -->

**Files:**

- Modify: `tests/mutation/source/premiseScan.ts`
- Test: `tests/mutation/source/premiseScan.test.ts`

**Interfaces:**

- Produces, in `premiseScan.ts` (module-private, not exported):

```ts
/** What a module's export named `exportName` resolves to. */
type ExportResolution =
  | { kind: "extent"; nodes: ts.Node[] }
  | { kind: "namespace"; module: string }
  | { kind: "forward"; spec: string; exportName: string }
  | { kind: "notAModule" }
  | { kind: "unresolvable"; reason: string };

/** Language modules this scanner can analyze. Anything else is data (spec §2.4). */
const LANGUAGE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"] as const;

function resolveExport(facts: ModuleFacts, exportName: string): ExportResolution;
```

- Consumes: `ModuleFacts`, `moduleScopeExtent` (deleted by this task), `resolveSpecifier`, `bindingIdentifiers`, all already in `premiseScan.ts`.

- [ ] **Step 1a: Hoist the shared helper.** `verdictWithModule(moduleSrc, testSrc)` currently lives INSIDE the `scope-aware extent resolution` describe block (`tests/mutation/source/premiseScan.test.ts:176` on the #827 tree), so a new describe block cannot call it. Move it to the test file's module scope, beside the existing module-scope `verdict` helper (`tests/mutation/source/premiseScan.test.ts:15`) and the `scratch` / `n` state both close over. Move only — do not change its body or its name, so every existing case keeps its exact spelling. Run the whole suite immediately after the move and before writing any new case: `npx vitest run tests/mutation/source/premiseScan.test.ts` must be GREEN, proving the move was behaviour-preserving. **This suite is itself enrolled**, so also run `npx vitest run tests/mutation/_metaPremiseContract.test.ts` — moving a helper from describe scope to module scope changes what the scanner sees when it scans this very file, and its declared count is `0`; if that number moves, the hoist changed the suite's own classification and must be reconsidered rather than re-baselined.

- [ ] **Step 1: Write the failing tests.** Append a new describe block to `tests/mutation/source/premiseScan.test.ts`, beside the existing `scope-aware extent resolution` block, using the now module-scoped `verdictWithModule` helper.

```ts
describe("export resolution: the lookup asks for an EXPORT, not a local name", () => {
  it("a renamed default import resolves", () => {
    expect(
      verdictWithModule(
        `import { spawnSync } from "node:child_process";
         export default function spawnHelper(): string {
           return String(spawnSync("echo", ["x"]).stdout);
         }`,
        `import runIt from "./MODULE";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a same-named default import resolves for the RIGHT reason", () => {
    // The foil for the case above: this one passes even before the repair,
    // by coincidence: the local name happens to match a module-scope
    // declaration. Kept so no future repair can be validated by it alone.
    expect(
      verdictWithModule(
        `import { spawnSync } from "node:child_process";
         export default function spawnHelper(): string {
           return String(spawnSync("echo", ["x"]).stdout);
         }`,
        `import spawnHelper from "./MODULE";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a default export that is an EXPRESSION resolves", () => {
    expect(
      verdictWithModule(
        `import { spawnSync } from "node:child_process";
         export default () => String(spawnSync("echo", ["x"]).stdout);`,
        `import runIt from "./MODULE";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a pure default export stays free", () => {
    expect(
      verdictWithModule(
        `export default function pureHelper(): number { return 2; }`,
        `import runIt from "./MODULE";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-free");
  });

  it("`export { x }` with no specifier resolves to the local declaration", () => {
    expect(
      verdictWithModule(
        `import { spawnSync } from "node:child_process";
         function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
         export { spawnHelper };`,
        `import { spawnHelper } from "./MODULE";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { x as y }` with no specifier resolves by the EXPORTED name", () => {
    expect(
      verdictWithModule(
        `import { spawnSync } from "node:child_process";
         function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
         export { spawnHelper as runIt };`,
        `import { runIt } from "./MODULE";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a data import is PURE, not unclassifiable", () => {
    // spec §2.4: resolveSpecifier accepts a bare `base` candidate, so an
    // in-repo edge can land on a .json file. Five such edges exist live.
    expect(
      verdictWithDataModule(`{ "a": 1 }`, "json", `import data from "./MODULE";
         it("x", () => { void data; });`),
    ).toBe("environment-free");
  });
});
```

`verdictWithDataModule(contents, extension, testSrc)` is a new sibling of `verdictWithModule` that writes the extra module with the given extension instead of `.ts`; add it beside `verdictWithModule` in the same step. In both helpers, `MODULE` in `testSrc` is substituted with the generated module's basename, exactly as the existing helper already does.

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "export resolution"
```

Expected: FAIL, with a non-zero FAILING count (not `skipped` — see the `-t` constraint above). `a renamed default import resolves` and `a default export that is an EXPRESSION resolves` report `environment-free`; `export { x as y }` reports `environment-free`. `a same-named default import resolves for the RIGHT reason` and `a pure default export stays free` PASS already — that is the point of the foils. Record which cases were red in the commit message.

- [ ] **Step 3: Implement.** In `premiseScan.ts`:

  1. In `moduleFacts`'s static-import branch, change the default-import registration from `imports.set(clause.name.text, { spec, imported: clause.name.text })` to `imports.set(clause.name.text, { spec, imported: "default" })`.
  2. Add an `exports` map to `ModuleFacts`, populated in the same walk: for every `ExportDeclaration` without a `moduleSpecifier` whose clause is `NamedExports`, record `exportedName -> localName` (`propertyName ?? name` is the LOCAL name here and `name` is the exported one — the reverse of an import specifier, which is the single easiest thing to get backwards in this task); for every declaration carrying an `export` modifier, record `name -> name`; for an `ExportAssignment` with `isExportEquals === false`, record `default -> <the expression node>`; for a declaration carrying both `export` and `default` modifiers, record `default -> <the declaration node>`. Skip anything `isTypeOnly`.
  3. Add `resolveExport(facts, exportName)` returning `ExportResolution`, consulting that map: a local name resolves through the existing module-scope `extents` to `{ kind: "extent" }`; an expression or declaration node recorded directly resolves to `{ kind: "extent", nodes: [node] }`; a name that is an entry in `facts.imports` resolves to `{ kind: "forward", spec, exportName: imported }` (Task 2 consumes this branch — until then, treat `forward` as `unresolvable` with reason `forwarded export (not yet followed)`); anything else resolves to `{ kind: "unresolvable", reason: \`no export named ${exportName}\` }`.
  4. Guard the module boundary on extension: in `reaches`, after `resolveSpecifier` returns a target, if `extname(target)` is not in `LANGUAGE_EXTENSIONS`, `continue` — pure, exactly as a bare specifier is. Do this BEFORE `factsFor(target)`, so a `.json` file is never parsed as TypeScript.
  5. Replace the `moduleScopeExtent` call in `reaches` with `resolveExport`, and delete `moduleScopeExtent`.

- [ ] **Step 4: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "export resolution"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, with `_metaPremiseContract` holding all 31 declared counts and an empty unclassifiable set.

The sharpest live regression risk sits in this run: `tests/ci/phantomGapExecuted.test.ts:41` imports named bindings from `scripts/lib/phantomGapExecuted.mjs` (written with the @-alias at that import site), the only non-`.ts` in-repo edge inside the enrolled domain. That module exports exclusively in form E1 (`export const` / `export function`, `scripts/lib/phantomGapExecuted.mjs:59-179`), so `resolveExport` must resolve it exactly as the old lookup did and the suite must hold its declared `3`. If that count moves, the extension guard or `resolveExport`'s E1 branch is wrong. If any count moves, STOP: spec §3.3 measured zero live instances of these forms, so a moved count means the repair reached somewhere it was not designed to.

- [ ] **Step 5: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): resolve cross-module EXPORTS, not local declaration names"
```

---

### Task 2: Forwarded exports — `export … from`, `export *`, and termination

Spec §2.2 rows E5 and E6, plus the `forward` branch Task 1 stubbed, plus spec §2.5's termination.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "forwarded exports"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:291` why=`ANCHOR IS PRE-MERGE: :291 is the cross-module lookup on the tracked tree today (for (const ext of tf.extents.get(name) ?? [])), which reads local declarations only; Task 0 merges #827 and re-anchors before this task runs. After Task 1, resolveExport's forward branch returns unresolvable and no ExportDeclaration carrying a moduleSpecifier is recorded at all, so a barrel re-exporting a spawning helper resolves to nothing; the probe rows H1 reexport named / aliased / star / chain 2-deep / local reexport all measure environment-free today and every case in this block reds until the forward branch follows the edge, greening on the same command` ac=AC-5,AC-10 -->

**Files:**

- Modify: `tests/mutation/source/premiseScan.ts`
- Test: `tests/mutation/source/premiseScan.test.ts`

**Interfaces:**

- Produces, in `premiseScan.test.ts`, the generalized helper every later task uses:

```ts
/**
 * Write N helper modules plus a test that imports them, and return the verdict.
 * `modules` is keyed by basename WITHOUT extension; each value is the source.
 * Every occurrence of `MODULE_<basename>` in any source is replaced by that
 * module's generated basename, so modules can import each other.
 */
function verdictWithModules(modules: Record<string, string>, testSrc: string): string;
```

- Consumes: `resolveExport` and `ExportResolution` from Task 1.

- [ ] **Step 1: Generalize the test helper.** Add `verdictWithModules` beside the existing `verdictWithModule` in `premiseScan.test.ts`, and reimplement `verdictWithModule(moduleSrc, testSrc)` as a one-line call into it so the existing cases keep their exact spelling and no already-passing case changes behavior.

- [ ] **Step 2: Write the failing tests.**

```ts
describe("forwarded exports: a re-export is followed to its source", () => {
  const SPAWNER = `import { spawnSync } from "node:child_process";
    export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
    export default spawnHelper;
    export function pureOne(): number { return 1; }`;

  it("`export { x } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { spawnHelper } from "./MODULE_helper";` },
        `import { spawnHelper } from "./MODULE_barrel";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { x as y } from` is followed by the SOURCE name", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { spawnHelper as renamed } from "./MODULE_helper";` },
        `import { renamed } from "./MODULE_barrel";
         it("x", () => { renamed(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { default as x } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { default as runIt } from "./MODULE_helper";` },
        `import { runIt } from "./MODULE_barrel";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { default } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { default } from "./MODULE_helper";` },
        `import runIt from "./MODULE_barrel";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export * from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export * from "./MODULE_helper";` },
        `import { spawnHelper } from "./MODULE_barrel";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export * from` does NOT forward `default`", () => {
    // ES semantics. The foil that stops `export *` becoming a module-closure
    // rule by the back door (spec §1.1 item 2).
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export * from "./MODULE_helper";` },
        `import runIt from "./MODULE_barrel";
         it("x", () => { void runIt; });`,
      ),
    ).toBe("unclassifiable");
  });

  it("a re-export chain two deep is followed", () => {
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          mid: `export { spawnHelper } from "./MODULE_helper";`,
          barrel: `export { spawnHelper } from "./MODULE_mid";`,
        },
        `import { spawnHelper } from "./MODULE_barrel";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("import-then-`export { x }` is followed", () => {
    // No re-export SYNTAX at all. This is the case that shows the defect is
    // the extents-only lookup, not any list of export spellings.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          barrel: `import { spawnHelper } from "./MODULE_helper";
                   export { spawnHelper };`,
        },
        `import { spawnHelper } from "./MODULE_barrel";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a re-exported PURE binding stays free", () => {
    // The foil: following the edge must not mark everything touching.
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { pureOne } from "./MODULE_helper";` },
        `import { pureOne } from "./MODULE_barrel";
         it("x", () => { pureOne(); });`,
      ),
    ).toBe("environment-free");
  });

  it("a DIAMOND re-export graph resolves, and is not mistaken for a cycle", () => {
    // The foil for the cycle case below: the pair (helper, spawnHelper) is
    // reached twice, once through each side. A visited-set repeat means
    // "already answered", not "cycle". Getting this wrong turns an ordinary
    // barrel shape into a false unclassifiable.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          left: `export { spawnHelper } from "./MODULE_helper";`,
          right: `export { spawnHelper } from "./MODULE_helper";`,
          barrel: [`export * from "./MODULE_left";`, `export * from "./MODULE_right";`].join("\n"),
        },
        `import { spawnHelper } from "./MODULE_barrel";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a re-export CYCLE terminates and reports", () => {
    expect(
      verdictWithModules(
        {
          a: `export { spawnHelper } from "./MODULE_b";`,
          b: `export { spawnHelper } from "./MODULE_a";`,
        },
        `import { spawnHelper } from "./MODULE_a";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("unclassifiable");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "forwarded exports"
```

Expected: FAIL, with a non-zero FAILING count (not `skipped` — see the `-t` constraint above). Every `environment-touching` case reports `unclassifiable` (Task 1's stub reason `forwarded export (not yet followed)`); `a re-export CYCLE terminates and reports` may hang or report the stub reason — if the run does not terminate, that is itself the red and it is fixed by this task's visited set.

- [ ] **Step 4: Implement.** In `premiseScan.ts`:

  1. In `moduleFacts`'s walk, record every `ExportDeclaration` that HAS a `moduleSpecifier`: for `NamedExports`, `exportedName -> { spec, sourceName: propertyName ?? name }`; for no clause (`export *`), append `spec` to a `starExports: string[]` on `ModuleFacts`. Skip `isTypeOnly` on the declaration and on each specifier.
  2. In `resolveExport`, return `{ kind: "forward", spec, exportName: sourceName }` for a recorded forwarded name. For a name found nowhere else, and only then, try each `starExports` entry in turn — a star export forwards named exports but never `default`, so if `exportName === "default"` skip the star pass entirely and fall through to `unresolvable`.
  3. In `reaches`, follow a `forward` result: resolve its `spec` against the CURRENT module's path, apply Task 1's extension guard, load the target's facts, and call `resolveExport` again — carrying a `visited: Set<string>` keyed `` `${targetPath}#${exportName}` ``. **A repeat contributes nothing and the walk continues**; it does NOT mean a cycle. Reporting a cycle on any repeat would make a DIAMOND graph (a barrel re-exporting from two modules that both re-export from a third) a false `unclassifiable` — the pair is simply already answered on another path. A genuine cycle is the case where every path is exhausted with nothing resolved, and only that returns `{ kind: "unresolvable", reason: "re-export cycle" }`. For a star fan-out, follow every candidate and stop at the first that yields a provenance.
  4. There is no depth counter, by design (spec §2.5). Termination comes from the finite visited set.

- [ ] **Step 5: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "forwarded exports"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, all 31 counts unchanged, unclassifiable set empty.

- [ ] **Step 6: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): follow forwarded exports across module boundaries"
```

---

### Task 3: The declined forms are REPORTED, not passed

Spec §2.2's declined list and §4 limits 1-2, plus the canonical spec's AC-8a gap measured in spec §3.6 (2 of its 4 unclassifiable forms have no fixture).

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "declined export forms"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:291` why=`ANCHOR IS PRE-MERGE: :291 is the cross-module lookup on the tracked tree today; Task 0 merges #827 and re-anchors before this task runs. An unfollowable re-export currently resolves to nothing and the traversal simply stops, so the test reads environment-free — probe row H1 unfollowable reexport (missing target) measures exactly that; the canonical spec's closed unclassifiable list requires it REPORTED, and each case in this block reds until resolveExport returns unresolvable with a reason that reaches the unresolved channel` ac=AC-8 -->

**Files:**

- Modify: `tests/mutation/source/premiseScan.ts`
- Test: `tests/mutation/source/premiseScan.test.ts`

**Interfaces:**

- Consumes: `resolveExport`, `ExportResolution`, the `visited` set, all from Tasks 1-2.
- Produces: nothing new; this task only routes existing `unresolvable` reasons into `reaches`'s `unresolved` channel with the module named.

- [ ] **Step 1: Write the failing tests.**

```ts
describe("declined export forms: recognized, unresolvable, and REPORTED", () => {
  const SPAWNER = `import { spawnSync } from "node:child_process";
    export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`;

  const detailOf = (modules: Record<string, string>, testSrc: string): string =>
    classificationWithModules(modules, testSrc).detail;

  it("an unfollowable re-export reports, naming the module", () => {
    const modules = { barrel: `export { spawnHelper } from "./nonexistent";` };
    const src = `import { spawnHelper } from "./MODULE_barrel";
      it("x", () => { spawnHelper(); });`;
    expect(verdictWithModules(modules, src)).toBe("unclassifiable");
    expect(detailOf(modules, src)).toMatch(/barrel/);
  });

  it("`export * as ns from` reports", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export * as helpers from "./MODULE_helper";` },
        `import { helpers } from "./MODULE_barrel";
         it("x", () => { helpers.spawnHelper(); });`,
      ),
    ).toBe("unclassifiable");
  });

  it("`export =` reports", () => {
    expect(
      verdictWithModules(
        { helper: `${SPAWNER}\nexport = spawnHelper;` },
        `import runIt from "./MODULE_helper";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("unclassifiable");
  });

  it("an in-repo module that cannot be parsed reports", () => {
    // The canonical spec's fourth unclassifiable form, which had no fixture.
    expect(
      verdictWithModules(
        { broken: `export function spawnHelper(: string { return` },
        `import { spawnHelper } from "./MODULE_broken";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("unclassifiable");
  });

  it("a type-only export is PURE, not unresolvable", () => {
    // The foil: a type reaches nothing at runtime, so declining to model it
    // as a value must not make it loud.
    expect(
      verdictWithModules(
        { helper: `export type Thing = { a: number };\n${SPAWNER}` },
        `import type { Thing } from "./MODULE_helper";
         it("x", () => { const t: Thing = { a: 1 }; void t; });`,
      ),
    ).toBe("environment-free");
  });

  it("an ordinary named export is NOT reported", () => {
    // The foil that stops this task's rule becoming "report everything".
    expect(
      verdictWithModules(
        { helper: SPAWNER },
        `import { spawnHelper } from "./MODULE_helper";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });
});
```

`classificationWithModules(modules, testSrc)` returns the whole `TestClassification` rather than just the verdict; add it beside `verdictWithModules` in this step, and reimplement `verdictWithModules` to call it. `detail` is the field the reader acts on, so it is asserted, not just the verdict.

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "declined export forms"
```

Expected: FAIL, with a non-zero FAILING count (not `skipped` — see the `-t` constraint above). `an unfollowable re-export reports` and `an in-repo module that cannot be parsed reports` report `environment-free`; the `export * as ns from` and `export =` cases report `environment-free`. The two foils PASS already.

- [ ] **Step 3: Implement.** In `premiseScan.ts`, route every `{ kind: "unresolvable", reason }` from `resolveExport` into `reaches`'s existing `unresolved` array, formatted as `` `${reason} in ${relative(root, modulePath)}` ``. Record `export * as ns from` (a `NamespaceExport` clause) and `export =` (an `ExportAssignment` with `isExportEquals === true`) explicitly during the `moduleFacts` walk so they resolve to `unresolvable` with their own reasons rather than falling through to the generic `no export named` message. A `null` from `factsFor` already pushes `unparseable in-repo module`; keep that reason string exactly as it is so nothing downstream that matches on it breaks.

- [ ] **Step 4: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "declined export forms"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, 31 counts unchanged, unclassifiable set empty.

- [ ] **Step 5: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): report the export forms the resolver declines to follow"
```

---

### Task 4: Namespace bindings resolve member-precisely

Spec §2.3. The task that must not become a module-closure rule.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "namespace bindings"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:113` why=`ANCHOR IS PRE-MERGE: :113 is the namespace-import registration on the tracked tree today (imports.set(b.name.text, spec)); Task 0 merges #827 and re-anchors before this task runs. moduleFacts registers a namespace import under the LOCAL alias, so resolveExport is asked for an export named after the LOCAL alias and finds nothing, and the member identifier is not even a reference (isReferenceIdentifier returns false for a property-access name); probe rows H1 namespace member and H1 namespace destructured both measure environment-free, and every case here reds until a namespace Binding variant resolves ns.member to the export named member` ac=AC-2,AC-3,AC-7,AC-13 -->

**Files:**

- Modify: `tests/mutation/source/premiseScan.ts`
- Test: `tests/mutation/source/premiseScan.test.ts`

**Interfaces:**

- Produces, in `premiseScan.ts`: a fourth `Binding` variant, `{ kind: "namespace"; scope: Scope; spec: string }`, returned by `resolveUncached` for a namespace import. `bindingKey` gains a matching arm so two namespace bindings of one name in different scopes stay distinct.
- Consumes: `resolveExport` (Tasks 1-3), `resolveBinding`, `isProvenanceModule`.

- [ ] **Step 1: Write the failing tests.**

```ts
describe("namespace bindings: member-precise, and nothing else", () => {
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
      verdictWithModules({ helper: MIXED }, `import * as ns from "./MODULE_helper";
        it("x", () => { ns.spawner(); });`),
    ).toBe("environment-touching");
  });

  it('`ns["member"]` resolves to that member', () => {
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "./MODULE_helper";
        it("x", () => { ns["spawner"](); });`),
    ).toBe("environment-touching");
  });

  it("a namespace member that is PURE stays free even when a sibling spawns", () => {
    // AC-3. The foil that makes the two cases above discriminating, and the
    // regression case for spec §1.1 item 2: a module-closure rule fails here.
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "./MODULE_helper";
        it("x", () => { ns.pureOne(); });`),
    ).toBe("environment-free");
  });

  it("AC-10b stays quiet through a namespace", () => {
    // AC-7. reportEnvelope's parameter `res` must not inherit main()'s
    // `const res = spawnSync(...)`, reached by the NEW edge rather than the old.
    expect(
      verdictWithModules({ helper: ENVELOPE }, `import * as env from "./MODULE_helper";
        it("x", () => { env.reportEnvelope({ ok: true }); });`),
    ).toBe("environment-free");
  });

  it("AC-10b stays quiet through a direct import", () => {
    // AC-6, kept beside AC-7 so neither can be removed without the other.
    expect(
      verdictWithModules({ helper: ENVELOPE }, `import { reportEnvelope } from "./MODULE_helper";
        it("x", () => { reportEnvelope({ ok: true }); });`),
    ).toBe("environment-free");
  });

  it("a namespace in a NON-member position reports", () => {
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "./MODULE_helper";
        it("x", () => { Object.entries(ns); });`),
    ).toBe("unclassifiable");
  });

  it("a destructured namespace reports", () => {
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "./MODULE_helper";
        it("x", () => { const { pureOne } = ns; pureOne(); });`),
    ).toBe("unclassifiable");
  });

  it("`ns[computed]` reports", () => {
    expect(
      verdictWithModules({ helper: MIXED }, `import * as ns from "./MODULE_helper";
        const k = "spawner";
        it("x", () => { ns[k as keyof typeof ns]; });`),
    ).toBe("unclassifiable");
  });

  it("a namespace import of a PROVENANCE module stays touching whatever the member", () => {
    // AC-13. isProvenanceModule is checked before member resolution; this is
    // the shipped `namespace import` case's harder sibling.
    expect(
      verdict(`import * as cp from "node:child_process";
        it("x", () => { cp.execSync("git status"); });`),
    ).toBe("environment-touching");
  });

  it("a namespace of a provenance module in a NON-member position stays touching", () => {
    // The order matters: provenance first, member precision second. A repair
    // that resolved members first would report unclassifiable here.
    expect(
      verdict(`import * as cp from "node:child_process";
        it("x", () => { void Object.keys(cp); });`),
    ).toBe("environment-touching");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "namespace bindings"
```

Expected: FAIL, with a non-zero FAILING count (not `skipped` — see the `-t` constraint above). The two member cases and the three reporting cases report `environment-free`. The four foils (`pureOne`, both AC-10b cases, both provenance-module cases) PASS already — record that in the commit message, since a foil that was already green is exactly what makes the reds meaningful.

- [ ] **Step 3: Implement.** In `premiseScan.ts`:

  1. In `moduleFacts`, register a namespace import into a new `namespaceImports: Map<string, string>` (local name → spec) instead of into `imports`.
  2. In `resolveUncached`, return `{ kind: "namespace", scope: facts.sf, spec }` for a name in that map, at the same point in the innermost-out walk where `imports` is consulted — so an inner binding that reuses the alias still shadows it.
  3. In `reaches`, handle `binding.kind === "namespace"`: FIRST, if `isProvenanceModule(binding.spec)` return `true` — before any member inspection, preserving the shipped ordering. Otherwise inspect the reference's parent: a `PropertyAccessExpression` whose `expression` is this reference resolves the export named `p.name.text`; an `ElementAccessExpression` whose `argumentExpression` is a string literal resolves that export; **anything else pushes** `` `namespace ${name} used in a position with no statically known member, from ${spec}` `` **into `unresolved`**.
  4. In `extentIsProvenance`, add the same namespace arm to the identifier branch so a namespace binding of a provenance module reads as provenance there too.
  5. Add a `bindingKey` arm for `namespace`.

- [ ] **Step 4: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "namespace bindings"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, 31 counts unchanged, unclassifiable set empty. This is the task most likely to move a count — spec §3.3 measured zero in-repo namespace imports in the enrolled closure, so if a count moves, re-derive rather than re-baseline.

- [ ] **Step 5: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): resolve namespace imports member-precisely, report the rest"
```

---

### Task 5: The two recognized-unresolvable constructs propagate

Spec §2.6 and §2.7 — Half 2.

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "unclassifiable propagation"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:341` why=`ANCHOR IS PRE-MERGE: :341 is the single ownUnresolved call on the tracked tree today; Task 0 merges #827 and re-anchors before this task runs. unclassifiableWithin is called on exactly one node — the test's own call expression, at the single ownUnresolved call inside classifyTests — so a construct in a reachable helper is never seen; probe rows H2 module_dynamic, describe_dynamic, module_computed, describe_computed and cross-module dynamic all measure environment-free, and every case here reds until the two rules are evaluated at each node the traversal visits` ac=AC-11,AC-12 -->

**Files:**

- Modify: `tests/mutation/source/premiseScan.ts`
- Test: `tests/mutation/source/premiseScan.test.ts`

**Interfaces:**

- Consumes: `unclassifiableWithin`, `reaches`'s `unresolved` array, `classificationWithModules` (Task 3).
- Produces: nothing new; the propagated reasons flow through the existing channel.

- [ ] **Step 1: Write the failing tests.**

```ts
describe("unclassifiable propagation: a construct in a HELPER reaches its callers", () => {
  it("a module-scope helper holding a non-literal dynamic import reports", () => {
    expect(
      verdict(`const specifier = "./x" + String(1);
        async function loader(): Promise<unknown> { return await import(specifier); }
        it("x", async () => { await loader(); });`),
    ).toBe("unclassifiable");
  });

  it("a describe-scope helper holding a non-literal dynamic import reports", () => {
    expect(
      verdict(`const specifier = "./x" + String(1);
        describe("d", () => {
          async function loader(): Promise<unknown> { return await import(specifier); }
          it("x", async () => { await loader(); });
        });`),
    ).toBe("unclassifiable");
  });

  it("a module-scope helper holding a computed process access reports", () => {
    expect(
      verdict(`const k = "PATH";
        function readEnv(): unknown { return (process as never)[k]; }
        it("x", () => { readEnv(); });`),
    ).toBe("unclassifiable");
  });

  it("a describe-scope helper holding a computed process access reports", () => {
    expect(
      verdict(`const k = "PATH";
        describe("d", () => {
          function readEnv(): unknown { return (process as never)[k]; }
          it("x", () => { readEnv(); });
        });`),
    ).toBe("unclassifiable");
  });

  it("a CROSS-MODULE helper holding a construct reports, naming that module", () => {
    const modules = {
      loader: `const specifier = "./x" + String(1);
        export async function load(): Promise<unknown> { return await import(specifier); }`,
    };
    const src = `import { load } from "./MODULE_loader";
      it("x", async () => { await load(); });`;
    expect(verdictWithModules(modules, src)).toBe("unclassifiable");
    expect(classificationWithModules(modules, src).detail).toMatch(/loader/);
  });

  it("a helper WITHOUT the construct stays free", () => {
    // The foil: propagation must not report every reachable helper.
    expect(
      verdict(`async function loader(): Promise<unknown> { return await import("./x"); }
        it("x", async () => { await loader(); });`),
    ).toBe("environment-free");
  });

  it("a construct in the test's OWN body outranks a provable environment reach", () => {
    // AC-12, branch one: shipped precedence, unchanged (spec §2.7).
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const specifier = "./x" + String(1);
        it("x", async () => { spawnSync("git", []); await import(specifier); });`),
    ).toBe("unclassifiable");
  });

  it("a construct reached only through a HELPER loses to a provable environment reach", () => {
    // AC-12, branch two: the asymmetry spec §2.7 states and §4 limit 5 files.
    // Pinned so it cannot drift silently between rounds.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const specifier = "./x" + String(1);
        async function loader(): Promise<unknown> { return await import(specifier); }
        it("x", async () => { spawnSync("git", []); await loader(); });`),
    ).toBe("environment-touching");
  });

  it("a reason is reported once, not twice", () => {
    // The test's own extent is also visited by the traversal, so both paths
    // see a construct in the test body; `detail` must not repeat it.
    const c = classification(`const specifier = "./x" + String(1);
      it("x", async () => { await import(specifier); });`);
    expect(c.detail.match(/non-literal specifier/g)).toHaveLength(1);
  });
});
```

`classification(src)` is the single-module sibling of `classificationWithModules`; add it beside `verdict` in this step if it does not already exist.

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "unclassifiable propagation"
```

Expected: FAIL, with a non-zero FAILING count (not `skipped` — see the `-t` constraint above). The five propagation cases report `environment-free`. The three foils (`a helper WITHOUT the construct`, both AC-12 branches) and `a reason is reported once` PASS already.

- [ ] **Step 3: Implement.** In `premiseScan.ts`, inside `reaches`'s `visit`, evaluate `unclassifiableWithin(node, f)` on each visited node and push each reason as `` `${reason} in ${relative(root, path)}` `` into `unresolved`. Leave `classifyTests`'s own-extent `ownUnresolved` call and its precedence exactly as they are — the propagated path is additive, and the own-extent path keeps outranking `environment-touching`. De-duplicate `unresolved` before joining it into `detail`. Do NOT move the `if (visit(start, home, homePath)) return "environment-touching";` short-circuit: that ordering is what makes the second AC-12 branch true and it is the measured performance requirement (spec §1.1 item 6).

- [ ] **Step 4: Run the tests to verify they pass.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts -t "unclassifiable propagation"
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: all PASS, 31 counts unchanged, unclassifiable set empty.

- [ ] **Step 5: Commit.**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "fix(mutation): propagate unresolvable constructs from reachable helpers"
```

---

### Task 6: Performance budget and mutation-gate acceptance

<!-- task: red=`npx vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:37` why=`ANCHOR IS PRE-MERGE: :37 declares accepted: AcceptedSurvivor[], the line-keyed ledger every surface row carries; the premiseScan row itself arrives with #827, and Task 0 re-anchors. Its accepted siteIds are LINE-keyed and Tasks 1-5 move every line below their first hunk, so after the repair the registry holds stale rows; the registry meta-test reds on a row whose site no longer exists, and greens when the accepted array is re-derived via enumerateSites` ac=AC-14,AC-15 -->

**Files:**

- Modify: `tests/mutation/source/registry.ts` (the `premiseScan` row's `accepted` array and its comments)
- Modify: `tests/mutation/_metaPremiseContract.test.ts` (comment only — no numeric change)

**Interfaces:**

- Consumes: `enumerateSites` / `siteId` (`tests/mutation/source/operators.ts`), `runSurface` (`tests/mutation/source/runner.ts`).
- Produces: the score and unaccepted-survivor set that the round-1 diff review brief must state.

- [ ] **Step 1: Measure the CORPUS PASS and compare against Task 0's baseline.** Measure the scan itself, not the vitest suite duration: the two deciding suites take about 20.7 s of wall clock, of which roughly 19 s is the four spawned `childRun` fixtures. The regression this guards against moved the pass from 1.3 s to 5.5 s — a 3.7× change that a 20.7 s suite duration hides completely.

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

Expected: well under the contract's 30 s budget. The pre-merge baseline measured 2026-08-16 is `suites=29 tests=1314 corpus-pass=1.49s`; post-#827 the suite count is 31, so the comparison is against Task 0 Step 5's own re-measurement, not against 1.49 s directly. Record both numbers in the commit message. A pass that has grown several-fold means the provenance short-circuit was moved — revisit Task 5 Step 3 rather than raising the budget.

- [ ] **Step 2: Re-derive the accepted survivor set.** Do not hand-adjust line numbers; enumerate them.

```bash
npx tsx -e '
import { enumerateSites, siteId } from "./tests/mutation/source/operators";
import { readFileSync } from "node:fs";
const src = readFileSync("tests/mutation/source/premiseScan.ts", "utf8");
// enumerateSites(sourcePath, text, operators) — tests/mutation/source/operators.ts:99
const SOURCE = "tests/mutation/source/premiseScan.ts";
for (const s of enumerateSites(SOURCE, src, ["relational-boundary","equality-flip","integer-literal"])) {
  console.log(siteId(s));
}'
```

Match each of the four existing accepted rows to its new `siteId` by the mutated EXPRESSION, not by line, and rewrite the `accepted` array. A row whose expression no longer exists is deleted with a note in the commit message.

- [ ] **Step 3: Run the mutation gate.** Under the heavy semaphore — this is a full harness run.

```bash
pnpm heavy pnpm mutation:guards
```

Expected: the `premiseScan` surface meets `scoreFloor: 0.95` with an EMPTY unaccepted-survivor set. Any unaccepted survivor is a real coverage gap in the cases Tasks 1-5 wrote: add the case that kills it, or accept it with an `equivalent` / `accepted-gap` row meeting the registry's stated bar. Record the score and the survivor set — the round-1 diff brief must state both.

- [ ] **Step 4: Confirm no `EXPECTED_ENV_TOUCHING` number moved.** AC-1's machine-checkable half.

```bash
git diff origin/main -- tests/mutation/_metaPremiseContract.test.ts | rg '^[-+].*: *[0-9]+,'
```

Expected: NO output. Any hit is a re-baselined count and a stop condition.

- [ ] **Step 5: Run the full suite and the static gates.**

```bash
pnpm heavy pnpm test
pnpm typecheck && pnpm exec eslint . && pnpm format:check
```

- [ ] **Step 6: Commit.**

```bash
git add tests/mutation/source/registry.ts tests/mutation/_metaPremiseContract.test.ts
git commit -m "test(infra): re-derive the premiseScan accepted set after the import-edge repair"
```

---

### Task 7: Graduation — ledger, documented limits, round corpus

<!-- task: red=`npx vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:51` why=`:51 is the isArchive predicate the rule rests on - archives categorically reject in-flight entries, so moving BL-PREMISESCAN-IMPORT-EDGE-FIDELITY into BACKLOG-archive.md with its IN PROGRESS marker still on (Step 1) reds this suite; stripping the marker in the same edit session (Step 2) greens the same command, which is what proves the marker actually came off before the merge` ac=AC-1 -->

**Files:**

- Modify: `BACKLOG.md` (remove the entry), `BACKLOG-archive.md` (add it), `docs/review-rounds/fix/premisescan-import-edges/` (corpus rows + filing if a stage reached the threshold)

**Interfaces:**

- Consumes: the score from Task 6 Step 3.
- Produces: a merged, archived row and a clean ledger.

- [ ] **Step 1: Move the entry to the archive WITH its marker still attached, and observe the red.**

```bash
npx vitest run tests/docs/_metaLedgerInProgress.test.ts
```

Expected: FAIL — an archive may not hold an entry whose status is IN PROGRESS.

- [ ] **Step 2: Strip the `**Status:** IN PROGRESS · **Branch:** fix/premisescan-import-edges` field**, replacing it with the graduation record (date, PR number, what shipped, and which of spec §4's limits remain open as documented limits rather than defects).

- [ ] **Step 3: Run the ledger and docs gates.**

```bash
npx vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaReviewRoundEconomy.test.ts tests/docs/specsReadmeIndexParity.test.ts
```

Expected: all PASS. If `_metaReviewRoundEconomy` reds, a stage reached `ROUND_THRESHOLD` counted rounds and the arc owes its filing in the `docs/review-rounds/fix/premisescan-import-edges/` directory, in the markdown file named for the first 12 characters of `git merge-base origin/main HEAD` — write it before proceeding. Note that a `no_verdict` dispatch is NOT a counted round.

- [ ] **Step 4: Commit — this must be the PR's LAST commit**, so the IN PROGRESS marker never reaches `main` (AGENTS.md invariant 12).

```bash
git add BACKLOG.md BACKLOG-archive.md docs/review-rounds/
git commit -m "docs(backlog): graduate BL-PREMISESCAN-IMPORT-EDGE-FIDELITY"
```

<!-- tasks: end -->

---

## Verification summary

| spec AC | proven by |
| --- | --- |
| AC-1 verdict-neutral | Task 6 Step 4 (no numeric diff) + the `_metaPremiseContract` run ending every task |
| AC-2 namespace member edges | Task 4, `ns.member` and `ns["member"]` |
| AC-3 member-precise, not module-wide | Task 4, `a namespace member that is PURE stays free even when a sibling spawns` |
| AC-4 default named `default` | Task 1, `a renamed default import resolves` (+ the same-name foil) |
| AC-5 every accepted export form | Task 1 (E1-E4) + Task 2 (E5-E6, chain, import-then-export) |
| AC-6 AC-10b direct | Task 4, `AC-10b stays quiet through a direct import` |
| AC-7 AC-10b via namespace | Task 4, `AC-10b stays quiet through a namespace` |
| AC-8 declined forms REPORTED | Task 3, all four canonical forms + two foils |
| AC-9 non-language targets pure | Task 1, `a data import is PURE, not unclassifiable` |
| AC-10 cycles terminate, diamonds do not | Task 2, `a re-export CYCLE terminates and reports` + its `a DIAMOND re-export graph resolves` foil |
| AC-11 four propagation cells | Task 5, all five cases + the no-construct foil |
| AC-12 precedence both directions | Task 5, the two AC-12 branches |
| AC-13 provenance-module precedence | Task 4, both `node:child_process` namespace cases |
| AC-14 performance, at the corpus-pass grain | Task 6 Step 1, against Task 0 Step 5's baseline |
| AC-15 mutation gate | Task 6 Steps 2-3 |
