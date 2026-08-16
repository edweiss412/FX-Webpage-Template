# Probe — which import and export forms does `premiseScan` actually follow, and where do they occur?

**Run:** 2026-08-16 · **Feeds:** `docs/superpowers/specs/ci/2026-08-16-premisescan-import-edge-fidelity-design.md` §3
**Target tree:** `origin/fix/scanner-scope-totality` at **`4e40db2b3`** (PR #827, 1,000 lines) — the scanner as that PR currently stands, not the copy on `main`. **Re-pinned in round 3:** the branch advanced five commits during review (`ac9a40cd8` → `4e40db2b3`) and a round-2 draft cited two different trees at once. Every behavioural row below was re-run against `4e40db2b3`; all are unchanged. Where a row is dated to the earlier pin it says so.

## Resolved scope — do not relitigate

| Decision | Why |
| --- | --- |
| The target is the **unmerged #827 tree**, obtained with `git show origin/fix/scanner-scope-totality:tests/mutation/source/premiseScan.ts`. Measuring `main`'s 446-line copy would measure a scanner nobody will ship. | Parent spec §7 |
| The harnesses ran from a **gitignored `.claude/probe/` directory** in the branch worktree. They are draft-time measurements; nothing re-runs them and no gate depends on them. **What is reproduced here is stated per probe rather than claimed in general:** probes 1 and 2 give the runner plus the complete fixture table, which is enough to rebuild them; **probe 4's source is INLINED in full below**, because a gitignored path does not survive in a committed record (round-3 finding 1); probe 3's AST walker is DESCRIBED, not reproduced, and its iteration completeness therefore cannot be checked from this document alone. A round-1 draft said the harnesses "are reproduced below" without that distinction — a claim wider than the artifact, corrected after cross-model review found the seed-filter defect below that such a claim would have hidden. | Same posture as the two 2026-08-04 probes beside this file |
| The measurement is a **draft-time input**. The parent spec's AC-1 re-derives the live-domain figure executably; the numbers here are not a gate. | Parent spec §6 |

## Question

Three questions, one harness each:

1. For a fixed spawning helper and a fixed call site, which **import forms** carry the environment reach across a module boundary, and which lose it?
2. Does a recognized-but-unresolvable construct in a **reachable helper** propagate to the test that calls it?
3. How often do the forms in question 1 actually **occur** — in the classifier's live domain, and in the domain its next enrolment is drawn from?

## Method — probe 1 and 2 (behavioral)

Each case writes a throwaway module tree under `mkdtempSync` and calls the #827 `classifyTests(root, "tests/probe.test.ts")`. The helper, the call site and the assertion are identical across the import-form cases; only the import form varies. Every positive case has a foil so no result can be produced by the classifier being a constant.

```ts
const SPAWNING_HELPER = `import { spawnSync } from "node:child_process";
export function spawnHelper(): string {
  return String(spawnSync("echo", ["x"]).stdout);
}
export default spawnHelper;
`;

const test = (body: string, imports: string): string =>
  `import { describe, expect, it } from "vitest";
${imports}
describe("probe", () => {
  it("case", () => {
    ${body}
  });
});
`;

function run(c: Case): string {
  const root = mkdtempSync(join(tmpdir(), "premisescan-probe-"));
  try {
    for (const [rel, body] of Object.entries(c.files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body, "utf8");
    }
    const out = classifyTests(root, "tests/probe.test.ts");
    if (out.length === 0) return "NO TESTS FOUND";
    return out.map((t) => `${t.verdict}${t.detail ? ` (${t.detail})` : ""}`).join(", ");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
```

The import-form cases, each `lib/helper` module = `SPAWNING_HELPER` unless noted:

| case | test-file import | extra module |
| --- | --- | --- |
| direct | `import { spawnHelper } from "../lib/helper"` | — |
| named_alias | `import { spawnHelper as h } from "../lib/helper"` | — |
| namespace member | `import * as helpers from "../lib/helper"`, calls `helpers.spawnHelper()` | — |
| namespace destructured | same import, `const { spawnHelper } = helpers` | — |
| default_renamed | `import runIt from "../lib/helper"` | — |
| default_samename | `import spawnHelper from "../lib/helper"` | — |
| reexport named | `import { spawnHelper } from "../lib/barrel"` | `barrel`: `export { spawnHelper } from "./helper";` |
| reexport aliased | `import { renamed } from "../lib/barrel"` | `barrel`: `export { spawnHelper as renamed } from "./helper";` |
| reexport star | `import { spawnHelper } from "../lib/barrel"` | `barrel`: `export * from "./helper";` |
| reexport default | `import runIt from "../lib/barrel"` | `barrel`: `export { default } from "./helper";` |
| reexport namespace | `import { helpers } from "../lib/barrel"` | `barrel`: `export * as helpers from "./helper";` |
| reexport chain 2-deep | `import { spawnHelper } from "../lib/barrel"` | `barrel` → `mid` → `helper`, each `export { spawnHelper } from …` |
| local reexport | `import { spawnHelper } from "../lib/barrel"` | `barrel`: `import { spawnHelper } from "./helper"; export { spawnHelper };` |
| unfollowable reexport | `import { spawnHelper } from "../lib/barrel"` | `barrel`: `export { spawnHelper } from "./gone";` (target absent) |
| NEG pure namespace member | `import * as helpers from "../lib/pure"`, calls `helpers.pureHelper()` | the `pure` module imports nothing |
| NEG spawning sibling untouched | `import * as helpers from "../lib/mixed"`, calls `helpers.pureOne()` | the `mixed` module exports `spawner` (imports `node:child_process`) **and** `pureOne` |
| NEG AC-10b collision | `import { reportEnvelope } from "../lib/envelope"` | the `envelope` module: parameter `res` in `reportEnvelope`, `const res = spawnSync(…)` in `main()` |
| NEG AC-10b via namespace | `import * as env from "../lib/envelope"`, calls `env.reportEnvelope(…)` | the same `envelope` module |

The propagation cases place the construct in a helper at module scope, in a helper inside `describe`, and in a helper in another module, with the test's own body as the baseline:

| case | construct | where |
| --- | --- | --- |
| module_dynamic | `await import(specifier)`, non-literal | module-scope `loader()` |
| describe_dynamic | same | `loader()` declared inside `describe` |
| module_computed | `process[key as keyof typeof process]` | module-scope `readEnv()` |
| describe_computed | same | `readEnv()` declared inside `describe` |
| cross-module dynamic | `await import(specifier)`, non-literal | a `lib/loader` module, imported by the test |
| baseline own body | `await import(specifier)`, non-literal | inside the `it` callback |
| both | `spawnHelper()` **and** `await import(specifier)` | inside the `it` callback |

## Results — probe 1: import forms

```
H1 direct                                                  ->  environment-touching
H1 named_alias                                             ->  environment-touching
H1 namespace member                                        ->  environment-free
H1 namespace destructured                                  ->  environment-free
H1 default_renamed                                         ->  environment-free
H1 default_samename                                        ->  environment-touching
H1 reexport named                                          ->  environment-free
H1 reexport aliased                                        ->  environment-free
H1 reexport star                                           ->  environment-free
H1 reexport default                                        ->  environment-free
H1 reexport namespace                                      ->  environment-free
H1 reexport chain 2-deep                                   ->  environment-free
H1 local reexport (import then export)                     ->  environment-free
H1 unfollowable reexport (missing target)                  ->  environment-free
NEG pure namespace member                                  ->  environment-free
NEG namespace, spawning sibling export untouched           ->  environment-free
NEG AC-10b collision (param res vs const res = spawnSync)  ->  environment-free
NEG AC-10b via namespace                                   ->  environment-free
```

## Results — probe 2: propagation

```
H2 module_dynamic (helper at module scope)                 ->  environment-free
H2 describe_dynamic (helper inside describe)               ->  environment-free
H2 module_computed (helper at module scope)                ->  environment-free
H2 describe_computed (helper inside describe)              ->  environment-free
H2 cross-module dynamic (helper in another file)           ->  environment-free
H2 baseline: construct inside the test's OWN body          ->  unclassifiable (dynamic import() with a non-literal specifier)
H2 unclassifiable AND environment-touching in one test     ->  unclassifiable (dynamic import() with a non-literal specifier)
```

## Method — probe 3 (population)

An independent AST walk — not the scanner — over a seed set and its transitive in-repo closure, mirroring `resolveSpecifier`'s candidate order (`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `base`) so the closure matches the one the scanner would walk. Each import and export declaration is classified by AST form and tagged `inrepo` or `bare` by whether the specifier resolves inside the repository.

Two seed sets: the enrolled `suitePaths` parsed out of `tests/mutation/source/registry.ts`, and the tracked files under `tests/`.

**The second seed set's filter, stated exactly, because a round-1 draft described it as plain `git ls-files tests` and it is not.** Against `ac9a40cd8`:

```
git ls-files tests                                    2498
  filtered to .ts/.tsx        (what round 1 measured)  2314
  filtered to the language set (§2.4)                  2326
```

The round-1 figure was the `.ts`/`.tsx` subset, so it silently omitted **12 `.js`/`.mjs` files that §2.4 itself calls language modules** — `tests/codexGuard/fixtures/fake-codex.mjs`, **three** `tests/cross-cutting/redirect-guard-probes/*.mjs` (`mutant-corpus.mjs`, `probe1-residual-escapes.mjs`, `red-harness.mjs` — a round-2 draft said "four", which made the categories sum to 13 against a total of 12 and defeated the claim that the omitted inventory is fully named), `tests/drive/pin15ExportProbe.mjs`, three `tests/e2e/*.mjs` bundles, `tests/e2e/helpers/useServerDirectivePlugin.mjs`, and three `tests/styles/__fixtures__/font-escapes/**` `.js` files — **1 + 3 + 1 + 3 + 1 + 3 = 12**, reproducible with `git ls-tree -r --name-only ac9a40cd8 tests | grep -E '\.(js|mjs)$'`. Re-measured over the full 2,326-seed set, the closure grows from 3,207 to 3,221 modules and **every in-repo count below is unchanged** — namespace 22, default 40, named re-export 117, local export list 28, `export *` 1, aliased named import 133, namespace-in-non-member-position 41. Only two bare-specifier counts move (`named:bare` 9,215 → 9,223, `namespace:bare` 24 → 27), and bare specifiers are pure by L-2. The conclusion survives; the declared domain and the measured domain now match.

**Probe correction (v1 → v2).** The first run parsed every file with `ts.ScriptKind.TS`, including `.tsx`. TSX content parsed as TS yields a garbage tree, and it inflated the "namespace used in a non-member position" figure from the true **41** to **68** — `COPY.EDIT_SAVED_CONFIRM` in a JSX expression was mis-read as a non-member use. Every figure below is from the corrected run, which selects `ts.ScriptKind.TSX` by extension. The import and export counts were unaffected (declarations parse identically either way); only the namespace-position figure moved. Worth recording because `premiseScan` itself parses with a fixed `ts.ScriptKind.TS` — no enrolled suite is `.tsx` today, so it is a latent limit rather than a live defect, and it is outside this arc's scope.

## Results — probe 3: population

**Live domain, measured twice.** PR #827 enrols `premiseScan` itself, so the domain grows when it lands: 29 enrolled suites / 86 in-repo modules against the registry on `main`, and 31 suites / 90 modules against `git show origin/fix/scanner-scope-totality:tests/mutation/source/registry.ts` (the two added suites are `tests/mutation/source/premiseScan.test.ts` and `tests/mutation/_metaPremiseContract.test.ts`). **Every count below is zero in both.** The figures shown are the post-#827 ones, which are the binding domain at implementation time:

```
namespace:inrepo                                0
default:inrepo                                  0
reexport-named:inrepo                           0
reexport-star:inrepo                            0
reexport-alias:inrepo                           0
reexport-ns:inrepo                              0
export-local-list                               0
export-assignment                               0
namespace used in a non-member position         0
dynamic import() with a non-literal specifier   0
computed member access on process               0
```

**Near domain** (2,314 `.ts`/`.tsx` seeds; 2,326 and 3,221 modules over the full language set, with every in-repo count identical — see Method; the last two rows come from a second walk that also follows `export … from` and literal dynamic-import edges and therefore reaches 3,255):

| form (in-repo edges only) | count |
| --- | --- |
| `import { x } from` | 9,215 |
| `import { x as y } from` | 133 |
| `export { x } from` | 117 |
| `import d from` | 40 |
| `export { x }` (local list) | 28 |
| `import * as ns from` | 22 |
| `export * from` | 1 |
| `export * as ns from` | 0 |
| `export { x as y } from` | 0 |
| `export =` / `export default <expr>` (`ExportAssignment`) | 6 |
| namespace local in a non-member position | 41 |
| dynamic `import()` with a non-literal specifier | 4 |
| computed member access on `process` | 0 |

Resolved extensions of in-repo import edges from `tests/**`: `.ts` 4,237 · `.tsx` 677 · `.mjs` 6 · `.json` 5 · `.mdx` 2.

The four non-literal dynamic imports: `tests/parser/_metaTransformSitesWalker.test.ts:67`, `tests/parser/_metaKnownSectionsWalker.test.ts:140`, `tests/help/render.test.ts:41`, `tests/e2e/helpers/useServerDirectivePlugin.test.ts:153`.

Representative non-member namespace uses: `Object.entries(roleRecognizeCopy)` (`tests/messages/_metaCatalogCopyHygiene.test.ts:141`), `vi.spyOn(driveList, "listFolder")` (`tests/sync/unexpectedParentLog.test.ts:36`), `"SECTION_HEADER_TOKENS" in ops` (`tests/parser/opsMetadataTokens.test.ts:13`), `scopeTiles as Record<string, unknown>` (`tests/visibility/_metaDocumentedPredicateParity.test.ts:138`).

## Conclusions

1. **The entry's two tables reproduce exactly against the code #827 landed.** `named_alias` is repaired there; `namespace`, `default_renamed` and `reexport` remain free, and all four propagation cells remain free.
2. **The defect is one wrong lookup, not three missing features.** `local reexport` — a barrel using no re-export *syntax* at all, just `import { x } from "./helper"; export { x };` — also loses the edge. The common cause is that the cross-module lookup reads local declarations (`extents`) and an export can be neither locally declared nor locally named.
3. **`default_samename` passes by coincidence.** The same module and the same default export classify `environment-touching` when the importer's local name happens to match a module-scope declaration and `environment-free` when it does not. Any repair validated only by the same-name case would not be a repair.
4. **Every repaired form occurs zero times in the live domain.** The repair is therefore verdict-neutral on today's corpus — a checkable claim, not an argument — and the value is that the first ordinary refactor to introduce one of these forms does not silently blind the guard.
5. **`computed member access on process` has zero instances repo-wide.** It is carried through the propagation change because it shares the mechanism with the dynamic-import rule, not because it was measured to matter.
6. **A namespace-precise repair is required, not a module-closure one.** `NEG namespace, spawning sibling export untouched` is the foil: a module-closure rule would classify it environment-touching and reproduce the over-classification the canonical spec rejected by name.

## Round-2 addendum — probes raised by round-1 review, independently reproduced

Round-1 adversarial review raised ten behavioural claims about the same #827 tree. Each was re-measured here with the same harness rather than accepted as reported, because a relayed measurement is an assumption wearing a number.

**Method.** Identical to probes 1 and 2 above: a throwaway module tree under `mkdtempSync`, then `classifyTests(root, "tests/probe.test.ts")`. The hook cases place the construct in a `beforeEach` or `beforeAll` body inside a `describe`; the producer case puts it in the argument to `describe.each`; the dynamic-namespace case binds `const ns = await import(<string literal>)` and then reads `ns.spawner()`.

```
C1 beforeEach body: non-literal import()                    ->  environment-free
C2 beforeAll body: computed process access                  ->  environment-free
C3 describe.each producer: non-literal import()             ->  environment-free
C5 CONTROL own body                                         ->  unclassifiable (dynamic import() with a non-literal specifier)
C6 CONTROL hook reaching provenance                         ->  environment-touching
DYN-NS  const ns = await import(literal); ns.spawnHelper()  ->  environment-free
DYN-DESTRUCTURED CONTROL                                    ->  environment-touching
B8 local same-name PLUS export{x}from                       ->  environment-free
B9 export namespace NS { spawning }                         ->  environment-free
GARBAGE in-repo module                                      ->  environment-free
```

All ten reproduced. Consequences, each now carried by the parent spec:

1. **The hook and `describe.each` paths discard every reason.** C1-C3 versus C5 isolates it exactly: the same construct reports from the test's own body and is silent through a hook, and C6 shows the hook path itself works for provenance. The cause is `classifyTests` testing the hook `reaches` result for a single value, so the repair is `reaches` returning its reasons rather than a scalar (parent spec §2.6).
2. **A dynamic namespace binding is unrepaired.** DYN-NS against its destructured control shows the defect is the spelling, not the dynamic path.
3. **An `extents`-first resolver would preserve the defect.** B8 is legal TypeScript holding both a non-exported local and a re-export of the same name; resolution order is therefore part of the contract (parent spec §2.2).
4. **`export namespace` matches a modifier-keyed E1 predicate and resolves to an empty extent.** B9 is why E1 is keyed on the four registered declaration kinds instead.
5. **Canonical unclassifiable form 4 is dead code.** GARBAGE parses fine — `ts.createSourceFile` is error-tolerant, `moduleFacts` returns null only when `!existsSync`, and `resolveSpecifier` has already `existsSync`-checked. The round-1 draft claimed this arc made it reachable; it does not, and the claim is retracted (parent spec §4 limit 8).

## Round-2 addendum — export-form counts, by grain

Round-1 review could not reproduce the "117 named re-export specifiers" figure and measured 54 by counting statements. Both numbers were right about different things, so the census was re-run reporting both grains explicitly. AST walk over every tracked `.ts`/`.tsx` (3,271 files):

```
   117  export-from:spec          (export { a, b } from "./m"  ->  2 specifiers)
    46  export-local:spec
    41  export-from:stmt
    29  export-local:stmt
     9  export-default-expr:stmt
     4  export-local:spec:aliased
     1  export-star-from:stmt
```

`export-from:spec:aliased`, `export-star-as:stmt` and `export-equals:stmt` are absent — zero repo-wide, which is what the parent spec's declined list rests on. The lesson is the reporting, not the value: a specifier count and a statement count for the same construct differ by nearly threefold here, and a table that does not say which one it holds is unreproducible by construction.

## Round-2 addendum — accept-set completeness pre-flight

**Question.** Under the spec's E1-E6 export rules, does every import edge that resolves TODAY still resolve? A name the new resolver cannot find answers `noSuchExport`, which is pure — so a miss would be a silent demotion that moves no declared count and emits no reason.

**The round-2 method did not perform this check, and round-2 review was right to refuse it.** Its `exportsOf` computed a NAME SET rather than resolving an export, and diverged from §2.2 in eight ways, every one in the permissive direction:

| # | divergence | consequence |
| --- | --- | --- |
| 1 | E5 named forwards recorded as exported names **without following the target** | a broken `export { x } from "./gone"` answers "resolves" |
| 2 | E2 local export lists recorded without checking local extent, imported binding, or the namespace rejection | `export { x }` with no `x` anywhere answers "resolves" |
| 3 | `NamespaceExport` accepted, though §2.2 declines it | a declined form counted as covered |
| 4 | BOTH `ExportAssignment` forms accepted as `default`, though `export =` is declined | same |
| 5 | `export namespace`, `interface`, `type` added as VALUE exports | type-only and declined forms counted as covered |
| 6 | `export default function f()` recorded both `default` **and** `f` | a name ES does not export counted as covered |
| 7 | namespace and dynamic-namespace member edges not checked at all | §2.3's whole surface unmeasured |
| 8 | seeds and `LANG` filtered to `.ts`/`.tsx`, omitting `.jsx` | 14 modules outside the measured closure |

Under that model `0 MISSES` is uninformative: the divergences make misses **less** likely, so the figure could not exclude the silent demotion the question is about.

**Corrected method (probe 4) — and it was corrected TWICE.** The round-2 rewrite implemented `resolveExport` faithfully but still discovered only static `ImportDeclaration`s, pre-filtered targets through the language set (so `data` and `unresolvable` were structurally zero), and parsed everything as `ScriptKind.TS`. Round-3 review found all three; the harness now also walks literal dynamic-import edges, classifies non-language targets rather than skipping them, selects the script kind by extension, puts every VALUE branch ahead of `typeOnly` (declaration merging makes `export interface x {}` + `export const x` legal, and checking types first silently freed the value), and reports a name bound from a dynamic `import()` instead of returning an empty extent.

**The source is INLINED below, not cited.** `.claude/probe/` is gitignored — `git ls-files --error-unmatch .claude/probe/acceptSetCover.ts` exits 1 — so a path reference would not survive in the committed record, which is the whole point of a probe record.

Run against `origin/fix/scanner-scope-totality` at `4e40db2b3`:

```
live domain (post-#827 registry):   90 modules,    233 value import edges
  by kind:  named 230 · dynamic-destructured 3
  outcomes: extent 233 · data 0 · pure-bare 0 · noSuchExport 0 · unresolvable 0
  MISSES: none, of any kind

near-domain (git ls-files tests): 3,265 modules, 10,935 value import edges
  by kind:  named 9,554 · dynamic-destructured 1,071 · ns.member 270 · default 40
  outcomes: extent 10,861 · data 5 · pure-bare 37 · noSuchExport 5 · unresolvable 27
  MISSES by kind: ns.member 5 — and nothing else
```

The five `ns.member` misses are listed in full by the harness; two are attributable to its own scope-blind namespace map (a local `mod` in one `it` body attributed to a namespace bound in another, `tests/app/admin/showReviewModalLoader.test.tsx`), and none can be a silent demotion because a namespace member edge resolves to nothing on the unrepaired tree. The 27 `unresolvable` are the near-domain's `.mdx` edges; the 5 `data` are its `.json` edges.

<details>
<summary>Full source of probe 4 (<code>acceptSetCover.ts</code>)</summary>

```ts
/**
 * CORRECTED §3.3b pre-flight — round-2 finding 2.
 *
 * The round-1 harness (noSuchExportPreflight.ts) computed a module's exported
 * NAMES with a model that diverged from spec §2.2 in eight ways (it recorded E5
 * forwards without following them, accepted `export * as ns from` and `export =`
 * which §2.2 declines, added type-only declarations as value exports, recorded
 * both `default` and `f` for `export default function f()`, never checked
 * namespace member edges, and seeded/filtered on `.ts`/`.tsx` only). "0 MISSES"
 * from that model therefore could not establish the claim §3.3b makes.
 *
 * This one implements resolveExport(facts, exportName, active, done) as §2.2
 * E1-E6 + §2.4's three-way extension split + §2.5's active/done pair actually
 * specify, and classifies every VALUE import edge into the four answers.
 * A `noSuchExport` on a DIRECT request is the silent-demotion risk §3.3b is about.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = "/Users/ericweiss/FX-worktrees/premisescan-import-edges";

// §2.4 answer 1. `.jsx` is HERE because it is analyzed today (spec §3.9).
const LANGUAGE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"]);
// §2.4 answer 2, NARROWED by round-2 finding 1: `.mdx` is executable in this
// repo (next.config.ts pageExtensions, @mdx-js/rollup in vitest), so it is no
// longer pure data. Everything not in either set is answer 3: REPORTED.
const DATA = new Set([".json"]);

/** `resolveSpecifier`'s shipped candidate generation — deliberately unchanged. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // bare specifier -> node_modules -> pure (L-2)
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base]) {
    if (existsSync(c) && !c.includes("node_modules")) return c;
  }
  return null;
}

const sfOf = (abs: string): ts.SourceFile =>
  ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.ES2022, true,
    /\.(tsx|jsx)$/.test(abs) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const mods = (n: ts.Node): readonly ts.Modifier[] =>
  ts.canHaveModifiers(n) ? (ts.getModifiers(n) ?? []) : [];
const hasMod = (n: ts.Node, k: ts.SyntaxKind): boolean => mods(n).some((m) => m.kind === k);

type ImportFact = { spec: string; imported: string; namespace: boolean };

type Facts = {
  abs: string;
  /** Module-scope declarations of the FOUR registered kinds, export modifier or not (E2 needs these). */
  declared: Set<string>;
  /** E1/E3/E4: exported name -> resolved locally. */
  localExports: Set<string>;
  /** E2: exported name -> local name. */
  exportList: Map<string, string>;
  /** E5: exported name -> [specifier, source name]. */
  forwards: Map<string, [string, string]>;
  /** E6 star targets. */
  stars: string[];
  /** Declined forms: exported name -> reason. */
  declined: Map<string, string>;
  /** Type-only exported names -> pure. */
  typeOnly: Set<string>;
  /** local name -> import fact. */
  imports: Map<string, ImportFact>;
  /**
   * Module-scope names bound from `await import(<literal>)`. #827's moduleFacts
   * files these in `scopedImports` and registers NO local extent, so E1/E2 would
   * hand back an EMPTY extent and pass a reachable spawner as pure. They are
   * reported instead — the narrowing direction (§1.2(e)).
   */
  dynamicBindings: Set<string>;
};

const factsCache = new Map<string, Facts>();

function factsFor(abs: string): Facts {
  const hit = factsCache.get(abs);
  if (hit) return hit;
  const sf = sfOf(abs);
  const f: Facts = {
    abs,
    declared: new Set(),
    localExports: new Set(),
    exportList: new Map(),
    forwards: new Map(),
    stars: [],
    declined: new Map(),
    typeOnly: new Set(),
    imports: new Map(),
    dynamicBindings: new Set(),
  };

  // imports (needed by E2's forward branch and by the namespace rejection)
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const c = s.importClause;
    if (!c || c.isTypeOnly) continue;
    const spec = s.moduleSpecifier.text;
    if (c.name) f.imports.set(c.name.text, { spec, imported: "default", namespace: false });
    const b = c.namedBindings;
    if (b && ts.isNamespaceImport(b)) f.imports.set(b.name.text, { spec, imported: "*", namespace: true });
    if (b && ts.isNamedImports(b)) {
      for (const e of b.elements) {
        if (e.isTypeOnly) continue;
        f.imports.set(e.name.text, { spec, imported: (e.propertyName ?? e.name).text, namespace: false });
      }
    }
  }

  const isDynamicImportInit = (init: ts.Expression | undefined): boolean => {
    let e = init;
    while (e && ts.isAwaitExpression(e)) e = e.expression;
    return !!e && ts.isCallExpression(e) && e.expression.kind === ts.SyntaxKind.ImportKeyword;
  };

  const bindNames = (b: ts.BindingName, into: Set<string>): void => {
    if (ts.isIdentifier(b)) into.add(b.text);
    else for (const el of b.elements) if (!ts.isOmittedExpression(el)) bindNames(el.name, into);
  };

  for (const s of sf.statements) {
    // --- the four registered declaration kinds, exported or not (E2 needs them)
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        bindNames(d.name, f.declared);
        if (isDynamicImportInit(d.initializer)) bindNames(d.name, f.dynamicBindings);
      }
    } else if (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) {
      if (s.name) f.declared.add(s.name.text);
    }

    // --- E3: export default <expr>  /  declined: export = <expr>
    if (ts.isExportAssignment(s)) {
      if (s.isExportEquals) f.declined.set("default", "export = is not followed");
      else f.localExports.add("default");
      continue;
    }

    if (ts.isExportDeclaration(s)) {
      if (s.isTypeOnly) {
        // a type reaches nothing at runtime -> pure
        if (s.exportClause && ts.isNamedExports(s.exportClause)) {
          for (const e of s.exportClause.elements) f.typeOnly.add(e.name.text);
        }
        continue;
      }
      if (s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) {
        const spec = s.moduleSpecifier.text;
        if (s.exportClause === undefined) { f.stars.push(spec); continue; }        // E6
        if (ts.isNamespaceExport(s.exportClause)) {                                 // declined
          f.declined.set(s.exportClause.name.text, "export * as ns from is not followed");
          continue;
        }
        for (const e of s.exportClause.elements) {                                  // E5
          if (e.isTypeOnly) { f.typeOnly.add(e.name.text); continue; }
          f.forwards.set(e.name.text, [spec, (e.propertyName ?? e.name).text]);
        }
        continue;
      }
      if (s.exportClause && ts.isNamedExports(s.exportClause)) {                    // E2
        for (const e of s.exportClause.elements) {
          if (e.isTypeOnly) { f.typeOnly.add(e.name.text); continue; }
          f.exportList.set(e.name.text, (e.propertyName ?? e.name).text);
        }
      }
      continue;
    }

    if (!hasMod(s, ts.SyntaxKind.ExportKeyword)) continue;

    // --- declined: export namespace / export module
    if (ts.isModuleDeclaration(s)) {
      const nm = ts.isIdentifier(s.name) ? s.name.text : s.name.text;
      f.declined.set(nm, "export namespace is not followed");
      continue;
    }
    // --- type-only declarations are pure, not value exports
    if (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) {
      f.typeOnly.add(s.name.text);
      continue;
    }

    const isDefault = hasMod(s, ts.SyntaxKind.DefaultKeyword);
    if (ts.isVariableStatement(s)) {                                               // E1
      const into = new Set<string>();
      for (const d of s.declarationList.declarations) bindNames(d.name, into);
      for (const n of into) f.localExports.add(n);
    } else if (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) {
      // E4: `export default function f(){}` exports ONLY `default`; `f` is module-local.
      if (isDefault) f.localExports.add("default");
      else if (s.name) f.localExports.add(s.name.text);                             // E1
    } else {
      // any other exported syntax -> reported with the node's kind name
      f.declined.set(`<${ts.SyntaxKind[s.kind]}>`, `unmodelled export syntax ${ts.SyntaxKind[s.kind]}`);
    }
  }

  factsCache.set(abs, f);
  return f;
}

type Res =
  | { kind: "extent" }
  | { kind: "data" }
  | { kind: "pure-bare" }
  | { kind: "noSuchExport" }
  | { kind: "unresolvable"; reason: string };

/** §2.4's three-way split, applied BEFORE any read. */
function landing(abs: string): Res | null {
  let isDir = false;
  try { isDir = statSync(abs).isDirectory(); } catch { /* ignore */ }
  const ext = extname(abs);
  if (isDir) return { kind: "unresolvable", reason: `directory target ${relative(ROOT, abs)}` };
  if (DATA.has(ext)) return { kind: "data" };
  if (!LANGUAGE.has(ext)) return { kind: "unresolvable", reason: `unrecognized module shape ${ext || "<none>"}` };
  return null; // language module: analyze
}

function resolveExport(
  abs: string,
  exportName: string,
  active: Set<string>,
  done: Map<string, Res>,
): Res {
  const key = `${abs}#${exportName}`;
  const memo = done.get(key);
  if (memo) return memo;                                    // §2.5 diamond
  if (active.has(key)) return { kind: "unresolvable", reason: "re-export cycle" }; // §2.5 cycle
  active.add(key);

  const finish = (r: Res): Res => { active.delete(key); done.set(key, r); return r; };

  const land = landing(abs);
  if (land) return finish(land);

  const f = factsFor(abs);

  if (f.declined.has(exportName)) return finish({ kind: "unresolvable", reason: f.declined.get(exportName)! });
  // F2: an exported name bound from a dynamic import has no extent to return.
  if (f.dynamicBindings.has(exportName))
    return finish({ kind: "unresolvable", reason: `export bound from a dynamic import() (${exportName})` });
  // F3: VALUE BEATS TYPE. Declaration merging makes `export interface x {}` and
  // `export const x = …` legal together; checking typeOnly first returns pure and
  // silently frees the value. Every value branch is consulted before typeOnly.
  if (f.localExports.has(exportName)) return finish({ kind: "extent" }); // E1/E3/E4

  // E2 — the export map is consulted FIRST; extents are reached only through it.
  const local = f.exportList.get(exportName);
  if (local !== undefined) {
    if (f.dynamicBindings.has(local))
      return finish({ kind: "unresolvable", reason: `export { ${local} } bound from a dynamic import()` });
    const imp = f.imports.get(local);
    if (imp?.namespace) return finish({ kind: "unresolvable", reason: `export { ns } over a namespace import (${local})` });
    if (imp) {
      const t = resolveSpecifier(abs, imp.spec);
      if (!t) return finish({ kind: "pure-bare" });
      return finish(resolveExport(t, imp.imported, active, done));
    }
    // resolves to extent when the local name is one of the four REGISTERED
    // declaration kinds at module scope — an export modifier is not required
    // and requiring one is round-2 finding 4.
    if (f.declared.has(local)) return finish({ kind: "extent" });
    return finish({ kind: "noSuchExport" });
  }

  // E5
  const fwd = f.forwards.get(exportName);
  if (fwd) {
    const t = resolveSpecifier(abs, fwd[0]);
    if (!t) return finish({ kind: "pure-bare" });
    return finish(resolveExport(t, fwd[1], active, done));
  }

  // E6 — `default` is never forwarded by a star export
  if (exportName !== "default") {
    for (const spec of f.stars) {
      const t = resolveSpecifier(abs, spec);
      if (!t) continue;
      const r = resolveExport(t, exportName, active, done);
      if (r.kind !== "noSuchExport") return finish(r); // a miss on a star branch is benign
    }
  }
  // Only now, with every VALUE branch exhausted, does a type-only export answer.
  if (f.typeOnly.has(exportName)) return finish({ kind: "data" }); // a type reaches nothing at runtime
  return finish({ kind: "noSuchExport" });
}

// ---------------------------------------------------------------- census
const registrySrc = readFileSync(
  join(ROOT, process.env.REGISTRY_SRC ?? "tests/mutation/source/registry.ts"), "utf8");
const seeds = process.env.WIDE
  ? execFileSync("git", ["ls-files", "tests"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").filter((p) => LANGUAGE.has(extname(p)))   // seed defect fixed: all language exts
  : [...new Set([...registrySrc.matchAll(/"(tests\/[^"]+\.test\.tsx?)"/g)].map((m) => m[1]!))].sort();

const files = new Set<string>();
const queue = seeds.map((p) => resolve(ROOT, p)).filter(existsSync);
const tally: Record<string, number> = {
  extent: 0, data: 0, "pure-bare": 0, noSuchExport: 0, unresolvable: 0,
};
const misses: string[] = [];
const byKind: Record<string, number> = {};
const edgeKinds: Record<string, number> = {};
const reported: string[] = [];
let edges = 0;

const check = (fromAbs: string, targetAbs: string, name: string, how: string): void => {
  edges++;
  const r = resolveExport(targetAbs, name, new Set(), new Map());
  tally[r.kind] = (tally[r.kind] ?? 0) + 1;
  const where = `${relative(ROOT, fromAbs)} -> ${relative(ROOT, targetAbs)} : ${name} (${how})`;
  if (r.kind === "noSuchExport") { misses.push(where); byKind[how] = (byKind[how] ?? 0) + 1; }
  edgeKinds[how] = (edgeKinds[how] ?? 0) + 1;
  if (r.kind === "unresolvable") reported.push(`${where} [${r.reason}]`);
};

while (queue.length) {
  const abs = queue.pop()!;
  if (files.has(abs)) continue;
  files.add(abs);
  const sf = sfOf(abs);
  // namespace locals in this file, so ns.member edges can be checked (§2.3)
  const nsLocals = new Map<string, string>();
  const walk = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const t = resolveSpecifier(abs, n.moduleSpecifier.text);
      if (t) {
        if (!files.has(t)) queue.push(t);
        const c = n.importClause;
        if (c && !c.isTypeOnly) {
          if (c.name) check(abs, t, "default", "default import");
          const b = c.namedBindings;
          if (b && ts.isNamespaceImport(b)) nsLocals.set(b.name.text, t);
          if (b && ts.isNamedImports(b)) {
            for (const e of b.elements) {
              if (e.isTypeOnly) continue;
              check(abs, t, (e.propertyName ?? e.name).text, "named import");
            }
          }
        }
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);

  // Literal dynamic-import edges — omitted by BOTH earlier harnesses, and the
  // largest single gap round-3 review found (1,126 near-domain value edges).
  // `const ns = await import("m")` is a namespace binding (§2.3); a destructured
  // form is a set of named edges.
  const walkDyn = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      let e: ts.Node = n.initializer;
      while (ts.isAwaitExpression(e)) e = e.expression;
      if (
        ts.isCallExpression(e) &&
        e.expression.kind === ts.SyntaxKind.ImportKeyword &&
        e.arguments[0] !== undefined &&
        ts.isStringLiteral(e.arguments[0])
      ) {
        const t = resolveSpecifier(abs, (e.arguments[0] as ts.StringLiteral).text);
        if (t) {
          if (!files.has(t)) queue.push(t);
          if (ts.isIdentifier(n.name)) {
            nsLocals.set(n.name.text, t); // ns.member edges picked up by walk2
          } else {
            for (const el of n.name.elements) {
              if (ts.isOmittedExpression(el) || !ts.isBindingElement(el)) continue;
              const src = el.propertyName ?? el.name;
              if (ts.isIdentifier(src)) check(abs, t, src.text, "dynamic destructured");
            }
          }
        }
      }
    }
    ts.forEachChild(n, walkDyn);
  };
  walkDyn(sf);

  // §2.3 namespace member edges — never checked by the round-1 harness
  const walk2 = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const t = nsLocals.get(n.expression.text);
      if (t) check(abs, t, n.name.text, "ns.member");
    }
    if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression)
        && n.argumentExpression && ts.isStringLiteral(n.argumentExpression)) {
      const t = nsLocals.get(n.expression.text);
      if (t) check(abs, t, n.argumentExpression.text, 'ns["member"]');
    }
    ts.forEachChild(n, walk2);
  };
  walk2(sf);
}

const scope = process.env.WIDE ? "near-domain (git ls-files tests)" : "live domain (enrolled)";
console.log(`${scope}: ${files.size} modules, ${edges} value import edges checked`);
console.log("  outcomes:", JSON.stringify(tally));
console.log("  edges by kind:", JSON.stringify(edgeKinds));
console.log("  MISSES by kind:", JSON.stringify(byKind));
console.log(`  noSuchExport MISSES (silent-demotion risk): ${misses.length}`);
for (const m of misses.slice(0, 20)) console.log("     ", m);
console.log(`  REPORTED (loud, not a miss): ${reported.length}`);
for (const r of reported.slice(0, 20)) console.log("     ", r);
```

</details>

**Conclusion, at the grain it was measured.** No edge the corpus resolves TODAY stops resolving under E1-E6: zero misses among named, default and dynamic-destructured edges at both scopes. The only misses are `ns.member`, an edge class that resolves to nothing on the unrepaired tree and therefore has no verdict to demote. This is the derived cover the class-sweep rule asks for: the claim is checked against the corpus rather than argued from a list of remembered forms — and the round-2 version is recorded above so that no later reader re-derives a number from a method that could not support it.

## Round-2 addendum — two mechanical facts the plan rests on

**Where export modifiers live.** Parsed directly, because E1's predicate depends on it:

```
export const a = 1, b = 2   ->  VariableStatement export=true;  its VariableDeclarations export=false; binds a, b
export function f() {}      ->  FunctionDeclaration  export=true
export default function d() -> FunctionDeclaration  export=true default=true
export namespace NS { … }   ->  ModuleDeclaration    export=true      <- matches a naive predicate
export type T = number      ->  TypeAliasDeclaration export=true      <- matches a naive predicate
export interface I { … }    ->  InterfaceDeclaration export=true      <- matches a naive predicate
export { plain }            ->  ExportDeclaration    (no modifier)
export default 42           ->  ExportAssignment     isExportEquals=false
export = f                  ->  ExportAssignment     isExportEquals=true
```

An E1 predicate written as "carries an `export` modifier" therefore admits `export namespace`, `export type` and `export interface`, none of which register an extent — which is why E1 is keyed on the four registered declaration kinds instead. And `export const` must be read from the STATEMENT: its declarations carry no modifier at all.

**Hoisting the test helpers is scanner-neutral.** The plan's Task 1 moves helpers to module scope inside `premiseScan.test.ts`, which is itself an enrolled suite declared `0`. Measured on the #827 tree, before and after adding module-scope helpers of the shape the plan specifies:

```
AS SHIPPED               : tests=56 touching=0 unclassifiable=0
WITH MODULE-SCOPE HELPERS: tests=56 touching=0 unclassifiable=0
```

The declared `0` holds because `node:fs` is deliberately not a provenance and the helpers read no `process.env`. The plan still runs the check, because the reasoning is only as good as the `ENVIRONMENT_SOURCES` list it rests on.
