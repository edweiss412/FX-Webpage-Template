# Probe — which import and export forms does `premiseScan` actually follow, and where do they occur?

**Run:** 2026-08-16 · **Feeds:** `docs/superpowers/specs/ci/2026-08-16-premisescan-import-edge-fidelity-design.md` §3
**Target tree:** `origin/fix/scanner-scope-totality` (PR #827, commit `ac9a40cd8`) — the scanner as that PR landed it, not the copy on `main`.

## Resolved scope — do not relitigate

| Decision | Why |
| --- | --- |
| The target is the **unmerged #827 tree**, obtained with `git show origin/fix/scanner-scope-totality:tests/mutation/source/premiseScan.ts`. Measuring `main`'s 446-line copy would measure a scanner nobody will ship. | Parent spec §7 |
| The harnesses ran from a **gitignored `.claude/probe/` directory** in the branch worktree and are reproduced below rather than committed as runnable scripts. They are draft-time measurements; nothing re-runs them and no gate depends on them. | Same posture as the two 2026-08-04 probes beside this file |
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

Two seed sets: the enrolled `suitePaths` parsed out of `tests/mutation/source/registry.ts`, and `git ls-files tests`.

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

**Near domain** (2,314 seeds from `git ls-files tests`, 3,207 in-repo modules reached; the last two rows come from a second walk that also follows `export … from` and literal dynamic-import edges and therefore reaches 3,255):

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
