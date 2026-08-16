# Probe — which import and export forms does `premiseScan` actually follow, and where do they occur?

**Run:** 2026-08-16 · **Feeds:** `docs/superpowers/specs/ci/2026-08-16-premisescan-import-edge-fidelity-design.md` §3
**Target tree:** `origin/fix/scanner-scope-totality` (PR #827, commit `ac9a40cd8`) — the scanner as that PR landed it, not the copy on `main`.

## Resolved scope — do not relitigate

| Decision | Why |
| --- | --- |
| The target is the **unmerged #827 tree**, obtained with `git show origin/fix/scanner-scope-totality:tests/mutation/source/premiseScan.ts`. Measuring `main`'s 446-line copy would measure a scanner nobody will ship. | Parent spec §7 |
| The harnesses ran from a **gitignored `.claude/probe/` directory** in the branch worktree. They are draft-time measurements; nothing re-runs them and no gate depends on them. **What is reproduced here is stated per probe rather than claimed in general:** probes 1 and 2 give the runner plus the complete fixture table, which is enough to rebuild them; probe 3's AST walker is DESCRIBED, not reproduced, and its iteration completeness therefore cannot be checked from this document alone. A round-1 draft said the harnesses "are reproduced below" without that distinction — a claim wider than the artifact, corrected after cross-model review found the seed-filter defect below that such a claim would have hidden. | Same posture as the two 2026-08-04 probes beside this file |
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

**Corrected method (probe 4).** `.claude/probe/acceptSetCover.ts`, gitignored, run against the same `ac9a40cd8` tree. It implements `resolveExport(abs, exportName, active, done)` as §2.2 E1-E6, §2.4's three-way extension split and §2.5's active/done pair specify — E5 and E6 FOLLOW to their target, E2 resolves through registration or the import map and rejects a namespace binding, `export =` / `export * as ns from` / `export namespace` return `unresolvable`, type-only returns pure, `export default function f()` yields `default` only, and `default` is never forwarded by a star. It then classifies every VALUE edge — named, default, **and `ns.member` / `ns["member"]`** — into the five outcomes. Seeds are filtered on the full language set, so the near-domain closure is the declared one.

```
live domain (post-#827 registry):  90 modules,   230 value import edges checked
  outcomes: {"extent":230,"data":0,"pure-bare":0,"noSuchExport":0,"unresolvable":0}
  noSuchExport MISSES (silent-demotion risk): 0

near-domain (git ls-files tests): 3,221 modules, 9,536 value import edges checked
  outcomes: {"extent":9499,"data":0,"pure-bare":37,"noSuchExport":0,"unresolvable":0}
  noSuchExport MISSES (silent-demotion risk): 0
```

The near-domain module count is **3,221** (the round-2 draft's 3,207 dropped the `.jsx`/`.mjs` seeds) and the edge count **9,536** (up from 9,381 because namespace member edges are now checked). The 37 `pure-bare` are E2/E5 branches forwarding to a bare specifier — pure by L-2, not misses.

**Conclusion.** The accept-set covers every value import edge the corpus contains, at both scopes, under a resolver that implements §2.2 rather than approximating it. This is the derived cover the class-sweep rule asks for: the claim is checked against the corpus rather than argued from a list of remembered forms — and the round-2 version is recorded above so that no later reader re-derives a number from a method that could not support it.

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
