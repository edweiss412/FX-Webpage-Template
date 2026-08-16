# premiseScan import-edge fidelity — export resolution across module boundaries, and unclassifiable propagation

**Row:** `BL-PREMISESCAN-IMPORT-EDGE-FIDELITY` (BACKLOG.md) · **Branch:** `fix/premisescan-import-edges` · **Effort:** M
**Surface:** `tests/mutation/source/premiseScan.ts` (guard/recognizer) · **Consumers:** `tests/mutation/_metaPremiseContract.test.ts`, `tests/mutation/source/premiseScan.test.ts`
**Canonical parent spec:** `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md` (§3.3.2.1 closed unclassifiable list, §4 consequence bound, L-2, L-8)
**Immediate predecessor:** `docs/superpowers/specs/ci/2026-08-15-scanner-scope-totality-design.md` — this arc closes that spec's **§4 documented limit 3**, which names both halves of this row by ID and hands them off.

---

## §0 Why

`premiseScan` decides which tests must carry an executable premise. Both defects here are **false negatives**: the recognizer reports `environment-free` for a test that reaches the environment. That is the direction that does not announce itself — the meta-contract's `EXPECTED_ENV_TOUCHING` row reads a truthful-looking number and nothing fails. The live cost of the sibling defect was already paid once: `tests/ci/phantomGapExecuted.test.ts` recorded a false `0` for three spawning cases until the helper was hoisted (registry comment, `tests/mutation/_metaPremiseContract.test.ts`).

**Half 1 — the cross-module lookup answers the wrong question.** `moduleScopeExtent(facts, name)` (the `moduleScopeExtent` helper, `tests/mutation/source/premiseScan.ts` on `origin/fix/scanner-scope-totality`) reads `facts.extents.get(facts.sf).get(name)` — a lookup of a **local declaration** in a module, standing in for a lookup of an **export** of that module. Two independent falsehoods live in that substitution:

- **(a) the local name is not the export name.** A default export is named `default`, not whatever the importer calls it. A namespace member is named by the member, and the member identifier is not even a reference (`isReferenceIdentifier` returns `false` for a property-access name: `if (ts.isPropertyAccessExpression(p) && p.name === id) return false;`). An aliased re-export renames again.
- **(b) an export need not be a local declaration at all.** `export { x } from "./y"`, `export * from "./y"`, and even `import { x } from "./y"; export { x };` all register in `imports`, never in `extents`. The lookup finds nothing and the traversal stops — silently, as `environment-free`.

**Half 2 — the two recognized-but-unresolvable constructs do not propagate.** `unclassifiableWithin` is evaluated on exactly one node: the test's own call expression, at the single `const ownUnresolved = unclassifiableWithin(node, facts);` call inside `classifyTests`. A helper whose body holds a non-literal dynamic `import()` or a computed access on `process` is invisible to its callers, so the test reads clean.

Both were probed by the predecessor arc's spec reviewer, and both are re-probed here against the code PR #827 actually landed (§3).

---

## §1 Convergence contract

Stated before the first review dispatch, per AGENTS.md's convergence-criterion section. A sibling arc on this exact recognizer ran to spec round 22 on 2026-08-16; the fences below are what that arc lacked.

**Consequence bound (closable).** For every input drawn from the probe domain below, a module edge this scanner cannot resolve reports `unclassifiable` — never a silent `environment-free`. `unclassifiable` is loud by construction: `_metaPremiseContract.test.ts` asserts the unclassifiable set is empty and reds the run on any member, and clearing one costs an explicit `// no-premise: <reason>` visible in the diff. A conservative demote plus a surfaced signal is a **documented limit** (§4), not a finding.

**PROBE DOMAIN.** `tests/mutation/source/registry.ts`'s enrolled `suitePaths` (29 suites) and every in-repo module transitively reachable from them (86 modules; §3.3) — that closure is the classifier's entire live domain, since `tests/mutation/_metaPremiseContract.test.ts:165` derives the scanned set from `GUARD_SURFACES.flatMap((s) => s.suitePaths)`. The near-domain, from which the registry's next enrolment is drawn, is `git ls-files tests` plus its in-repo closure (2,314 seeds, 3,207 modules; §3.4). An admissible probe is an input from one of those two sets, or one ordinary edit from such an input — swapping `import { x }` for `import * as ns`, hoisting a helper into a barrel, renaming a default. A constructed module graph outside both sets files to §4 without a round.

**Threat fence.** Ordinary repository refactors by a contributor who is not trying to evade the checker. Deliberately obfuscated import graphs — computed re-export tables, `eval`, a namespace laundered through an untyped indirection — are **out of scope** and file to §4. This is the same fence the canonical spec set at §3.3.2.1 ("refactoring a spawn behind a *local* helper is ordinary authoring and is covered; reaching the environment through a third-party package to escape the checker is not"), and every admissibility clause in §1.2 cites it.

**Mutation status (convergence bullet 4).** `premiseScan` is **already enrolled** on `origin/fix/scanner-scope-totality` (`tests/mutation/source/registry.ts`, `id: "premiseScan"`): `scoreFloor: 0.95`, operators `relational-boundary` / `equality-flip` / `integer-literal`, deciding suites `tests/mutation/source/premiseScan.test.ts` + `tests/mutation/_metaPremiseContract.test.ts`, accepted set of 4 rows (3 `equivalent`, 1 `accepted-gap`). Accepted `siteId`s are LINE-keyed, so this arc's edit shifts every row below its first hunk; the implementation branch **re-derives the accepted set via `enumerateSites` rather than hand-adjusting**, reruns `pnpm heavy pnpm mutation:guards`, and states the score plus the unaccepted-survivor set in its round-1 diff brief. From that point the diff-stage convergence criterion is that score with an empty unaccepted-survivor set — a "the guard does not pin what it claims" finding is admissible only with a surviving mutant from a declared operator at a named site.

### §1.1 Resolved scope — do not relitigate

Each item carries its ratification. Verify the citation; do not re-derive the decision.

1. **Scope-aware extent resolution and the AC-10b collision are settled by PR #827.** `reportEnvelope`'s parameter `res` must not inherit `main()`'s `const res = spawnSync(...)`. The mechanism is scope-keyed extents plus parameter shadows — the `ModuleFacts.extents` / `ModuleFacts.shadows` maps and the declaration walk inside `moduleFacts` (predecessor spec §1.1 item 1). This arc changes the CROSS-MODULE lookup only and re-pins AC-10b, including through a namespace import (§6 AC-6, AC-7). Nothing here re-opens scope registration.
2. **Module-closure resolution is rejected.** A namespace import must resolve **member-precisely**, never the target module's whole import closure. The canonical spec probed the alternative and found it wrong in the damaging direction: `scripts/ledger-claims.ts` imports `realGitSurface` from a module that imports `node:child_process`, so a module-closure rule marks every test importing `reportEnvelope` environment-touching — including the 101-claim fixture that touches no environment (canonical spec §3.3.2.1, "Declarations, not modules"). AC-7 is the regression case.
3. **The recognized-unresolvable list stays closed at four forms.** Non-literal dynamic `import()`; computed member access on `process`; a re-export chain the resolver cannot follow; an in-repo module that cannot be parsed (canonical spec §3.3.2.1, and its AC-8a at `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md:501`). This arc adds **no fifth family**. It makes forms 3 and 4 actually reachable and gives forms 1 and 2 a propagation path. A proposal for a fifth family is a canonical-spec change with its own probe, not a round on this diff.
4. **Symbol-level data-flow analysis is declined** (canonical spec §3.3.2.1, R6 recommendation, declined with reasons). Re-proposing it is out of scope.
5. **`node_modules` is pure (L-2); undetected ≠ unclassifiable (L-8).** A bare specifier resolves to nothing and is treated as pure. A provenance reaching a test through a form outside the analyzed list is *undetected*, and no assertion here claims otherwise.
6. **The verdict-precedence asymmetry is deliberate and is specified in §2.7.** Own-extent `unclassifiable` outranks `environment-touching` (shipped, in `classifyTests`); a *propagated* `unclassifiable` does not. Both branches are loud, so the consequence bound holds in either; preserving `reaches`'s provenance short-circuit is a measured performance requirement (the comment above `scopeCache` records it: an unmemoized walk turned a 1.3 s corpus pass into 5.5 s and timed out a 30 s budget). Promoting propagated `unclassifiable` above `environment-touching` is a one-line lattice change filed as §4 limit 5, not a defect.
7. **Zero live instances is not a reason to descope.** §3.3 measures zero occurrences of every repaired form inside the classifier's current domain, and that is the *point*: the repair is verdict-neutral today (AC-1) and exists so that the ordinary refactor which introduces the first instance does not silently blind the guard. The near-domain already holds 22 in-repo namespace imports, 40 in-repo default imports, 117 named re-export specifiers and one `export *` (§3.4), any of which enters the live domain the day its suite is enrolled.
8. **Autonomy.** User grant 2026-08-16 (Eric), batch-wide: autonomous, both user review gates WAIVED. Stop only for a genuinely new question.

### §1.2 Finding admissibility

Per AGENTS.md's detector/guard contract, each clause citing the fence and probe domain of §1:

- **(a)** A claim about current behavior is settled by probe, not argument. Include the probe output. The harness in §3.1 runs any new case in seconds.
- **(b)** A hypothetical input is a finding only if a probe shows a **silent** wrong answer — an `environment-free` where the truth is touching. A worst case of `unclassifiable` plus a named module in `detail` is a documented limit and files to §4 without a round.
- **(c)** No widening of the recognizer is accepted without a probe demonstrating the corruption it prevents, **and** an input drawn from the §1 probe domain or one ordinary edit from one. A constructed module graph outside both sets is fenced out by §1's threat model.
- **(d)** For the mutation surface: a "the guard does not pin what it claims" finding requires a surviving mutant — a declared operator at a named site — from the run stated in the round-1 diff brief. If no declared operator produces one, the finding is refuted or it is an operator proposal carrying its own before/after numbers.
- **(e)** **Repair direction under same-axis recurrence is NARROWING.** If successive rounds each name one more export or import form, the response is not another grammar case: it is to shrink the accept-set of §2.2 and let the residue fall to `unclassifiable`. Every widening is a bigger target for the next round.

---

## §2 Design

### §2.1 One mechanism, not three features

Half 1 is not "namespace edges + default names + re-export following". It is one wrong function. Replace the local-declaration lookup with an **export resolver**:

```
resolveExport(module, exportName, visited)
  -> { kind: "extent",       nodes: ts.Node[] }              // resolved here
   | { kind: "namespace",    module: path }                  // this export IS a module namespace
   | { kind: "forward",      spec: string, exportName: str } // follow to another module
   | { kind: "notAModule" }                                  // out of language: treat as pure (L-2)
   | { kind: "unresolvable", reason: string }                // -> unclassifiable
```

The traversal then asks for an **export name**, and the importer's local name never crosses a module boundary:

| import form | export name requested |
| --- | --- |
| `import { x } from "m"` | `x` |
| `import { x as y } from "m"` | `x` (shipped: the named-import branch of `moduleFacts` records `imported: e.propertyName ? e.propertyName.text : e.name.text`) |
| `import d from "m"` | `default` |
| `import * as ns from "m"`, reference `ns.x` or `ns["x"]` | `x` |

`imports` already carries `{ spec, imported }`. The change is (i) a default import records `imported: "default"`, (ii) a namespace import records a namespace binding rather than a same-named export, and (iii) `moduleScopeExtent` becomes `resolveExport`.

**The default-import defect is currently masked by coincidence.** §3.1 measures `import spawnHelper from "./helper"` as `environment-touching` and `import runIt from "./helper"` — same module, same default export — as `environment-free`. The first passes only because the local name happens to equal a module-scope declaration's name. No repair may be validated by the same-name case alone; AC-4 uses the renamed form.

### §2.2 Export accept-set (keyed on AST form, not on spelling)

The resolver **accepts** exactly these, and reports everything else by name. This is an allowlist: a form absent from the table is `unresolvable`, never silently absent.

| # | AST form | source | resolves to |
| --- | --- | --- | --- |
| E1 | declaration carrying an `export` modifier (`export const/let/var/function/class/enum`) | local | `extent` — the nodes already registered at module scope |
| E2 | `ExportDeclaration`, no `moduleSpecifier`, `NamedExports` (`export { x }`, `export { x as y }`) | local **or** forwarded | `extent` when the local name is a module-scope declaration; `forward` when it is an entry in `imports` (the `import`-then-`export` case, §3.1 row 13) |
| E3 | `ExportAssignment` with `isExportEquals: false` (`export default <expr>`) | local | `extent` = the expression |
| E4 | declaration carrying both `export` and `default` modifiers (`export default function f(){}`) | local | `extent` = the declaration |
| E5 | `ExportDeclaration` with `moduleSpecifier` + `NamedExports` (`export { x } from`, `export { x as y } from`, `export { default as x } from`, `export { x as default } from`) | forwarded | `forward` to `(spec, propertyName ?? name)` |
| E6 | `ExportDeclaration` with `moduleSpecifier`, no clause (`export * from`) | forwarded | `forward` to each star target in turn; **`default` is never forwarded by a star export** (ES semantics) |

Deliberately **not** accepted, each reporting `unresolvable` with its own reason string:

- **`export * as ns from "m"`** (`NamespaceExport`) — an exported binding that is itself a namespace. Measured population: **0** repo-wide (§3.2). Modelling it would add a second namespace-valued binding kind for zero live inputs; the narrowing choice is to report it.
- **`export = <expr>`** (`ExportAssignment` with `isExportEquals: true`) — the TypeScript CommonJS form. Measured population as an in-repo import target: 0.
- **A type-only export** (`export type { … }`, `isTypeOnly` on the declaration or the specifier) — resolves to `notAModule`-equivalent purity, not `unresolvable`: a type reaches nothing at runtime, exactly as `isReferenceIdentifier` and `isInTypePosition` already decide for references.
- **Any other export syntax** — reported with the node's kind name in `detail`.

**Ambiguity under multiple star exports.** If a name is sought through several `export * from` targets, every target is followed and the first provenance wins. Following all is conservative in the safe direction and cannot under-report; a name genuinely exported by two star targets is a TypeScript error already.

### §2.3 Namespace imports resolve member-precisely, and nothing else

A namespace binding (`import * as ns from "m"`) is a distinct `Binding` variant. A reference to `ns` is resolved by its **use position**, and exactly two positions are accepted:

1. `ns.member` — `PropertyAccessExpression` whose `expression` is the namespace reference. Resolve export `member` of `m`.
2. `ns["member"]` — `ElementAccessExpression` with a **string-literal** argument. Same. This is the exact mirror of the shipped `process[...]` rule, whose `isElementAccessExpression` branch in `unclassifiableWithin` treats only a *non*-literal argument as unresolvable.

**Every other use of a namespace binding reports `unclassifiable`**, with the local name and the module in `detail`. That covers `Object.entries(ns)`, `vi.spyOn(ns, "f")`, `"k" in ns`, `ns as Record<string, unknown>`, `const { a } = ns`, and passing `ns` as an argument. Measured cost: **0** occurrences in the live domain, 41 in the near-domain (§3.2, §3.4). The alternatives are module-closure (fenced out by §1.1 item 2) or silence (violates the consequence bound). Recognizing `vi.spyOn(ns, "f")` specifically would be a library-shaped special case and is the ratchet §1.2(e) forbids.

**Order matters and is preserved.** `isProvenanceModule(imported.spec)` is checked inside `reaches` **before** any member resolution, so `import * as cp from "node:child_process"` stays `environment-touching` whatever member is used — the shipped unit case named `namespace import` keeps passing unchanged. The same precedence applies inside `extentIsProvenance`, whose identifier branch resolves a reference and tests `binding.kind === "import" && isProvenanceModule(binding.spec)`; it must recognize a namespace binding of a provenance module as provenance.

### §2.4 A target that is not a module of this language is pure, not unresolvable

`resolveSpecifier` accepts a bare `base` candidate — its list is `[`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base]` — so an in-repo edge can land on a file that is not TypeScript. Measured live edges from `tests/**`: 6 `.mjs`, 5 `.json`, 2 `.mdx` (§3.5). `.mjs` is a language module and is parsed as today. `.json`, `.mdx` and any other extension are **`notAModule`**: treated exactly like a bare specifier — pure by L-2, never `unresolvable`.

Without this rule the repair would turn `import manifest from "@/supabase/__generated__/schema-manifest.json"` into a red `unclassifiable` the moment its suite is enrolled, which is a false positive introduced by a false-negative repair. The accepted language extensions are `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`; the list lives in one named constant beside `resolveSpecifier`.

### §2.5 Termination

Forward-following visits `(modulePath, exportName)` pairs against a `visited` set. A repeat is `unresolvable` with reason `re-export cycle`. There is no depth cap and none is wanted: a bound expressed as a NUMBER is the shape AGENTS.md's repair-economy bullet says the next reviewer will find, so termination is derived from the finite pair set — a repository has finitely many modules and each has finitely many export names, so the walk terminates without a counter.

### §2.6 Half 2 — the two constructs propagate through the traversal

`reaches` already owns a propagation channel: `unresolved: string[]`, populated today only by the single `unresolved.push(\`unparseable in-repo module ${imported.spec}\`)` site, and returned as `unclassifiable` at `return unresolved.length > 0 ? "unclassifiable" : "environment-free";` when no provenance was found. Half 2 is that channel gaining the two constructs already recognized by `unclassifiableWithin`.

The rules are evaluated on **each node the traversal visits**, in the facts of the module that node belongs to, and their reasons are pushed into `unresolved` with the module named:

- `dynamic import() with a non-literal specifier in <repo-relative path>`
- `computed member access on process in <repo-relative path>`

`unclassifiableWithin` keeps its existing own-extent call site and precedence untouched; the propagated path is additive. A construct in the test's own body is therefore seen twice — once by each path — so the reason list is de-duplicated before it reaches `detail`. Naming the module is not decoration: with propagation, `detail` is the only thing that tells a reader which file to open.

### §2.7 Verdict lattice, stated once

For the test's **own extent** (unchanged; shipped as the `if (ownUnresolved.length > 0) verdict = "unclassifiable";` line in `classifyTests`, with the comment above it stating that unclassifiable outranks environment-touching):

> `unclassifiable` > `environment-touching` > `environment-free`

For everything reached **through the traversal**:

> `environment-touching` > `unclassifiable` > `environment-free`

Both branches are loud; the consequence bound quantifies over the FREE direction only, and neither branch can produce a silent free. The asymmetry buys `reaches`'s provenance short-circuit, which §1.1 item 6 cites as a measured performance requirement (the `scopeCache` comment). §4 limit 5 records the alternative and the one-line change that would adopt it.

### §2.8 What does not change

The declaration-reference fixed point, scope-keyed extents, parameter shadows, `scopedImports`, the write pass, `ENVIRONMENT_SOURCES`, the premise/exemption detection, `.each` associated-placement detection, and `EXPECTED_ENV_TOUCHING`'s 29 declared numbers. This arc edits the cross-module lookup, the namespace binding kind, and the `unresolved` channel — nothing else.

---

## §3 Probe transcripts

All probes run against `origin/fix/scanner-scope-totality` (PR #827, commit `ac9a40cd8`) — the code this arc extends. Full method, fixture tables and raw output: `docs/superpowers/specs/ci/probes/2026-08-16-premisescan-import-edge-probe.md`. Each case writes a fresh module tree under `mkdtempSync` and calls `classifyTests(root, "tests/probe.test.ts")`.

### §3.1 Import forms — same helper, same call site, only the form varies

```
H1 direct                                                  ->  environment-touching
H1 named_alias                                             ->  environment-touching   [repaired by #827]
H1 namespace member                                        ->  environment-free       <- defect
H1 namespace destructured                                  ->  environment-free       <- defect
H1 default_renamed                                         ->  environment-free       <- defect
H1 default_samename                                        ->  environment-touching   [passes by name coincidence only]
H1 reexport named                                          ->  environment-free       <- defect
H1 reexport aliased                                        ->  environment-free       <- defect
H1 reexport star                                           ->  environment-free       <- defect
H1 reexport default                                        ->  environment-free       <- defect
H1 reexport namespace                                      ->  environment-free       <- defect
H1 reexport chain 2-deep                                   ->  environment-free       <- defect
H1 local reexport (import then export)                     ->  environment-free       <- defect
H1 unfollowable reexport (missing target)                  ->  environment-free       <- must report unclassifiable
NEG pure namespace member                                  ->  environment-free       [correct]
NEG namespace, spawning sibling export untouched           ->  environment-free       [correct — the AC-7 foil]
NEG AC-10b collision (param res vs const res = spawnSync)  ->  environment-free       [correct]
NEG AC-10b via namespace                                   ->  environment-free       [correct]
```

The entry's five-row table is reproduced exactly (`direct` touching; `named_alias` now repaired; `namespace`, `default_renamed`, `reexport` free) and extended by eight further rows. `H1 local reexport` is the row that fixes the derivation: a barrel doing `import { spawnHelper } from "./helper"; export { spawnHelper };` uses no re-export *syntax* at all and still loses the edge, which is what shows the defect is the extents-only lookup rather than any list of export spellings.

### §3.2 Unclassifiable propagation

```
H2 module_dynamic (helper at module scope)                 ->  environment-free   <- defect
H2 describe_dynamic (helper inside describe)               ->  environment-free   <- defect
H2 module_computed (helper at module scope)                ->  environment-free   <- defect
H2 describe_computed (helper inside describe)              ->  environment-free   <- defect
H2 cross-module dynamic (helper in another file)           ->  environment-free   <- defect
H2 baseline: construct inside the test's OWN body          ->  unclassifiable (dynamic import() with a non-literal specifier)
H2 unclassifiable AND environment-touching in one test     ->  unclassifiable (dynamic import() with a non-literal specifier)
```

The entry's four-cell table is reproduced exactly, extended by a cross-module cell and by the two baselines that pin the shipped own-extent behavior §2.7 preserves.

### §3.3 Population of the live domain — the blast-radius measurement

An AST walk over the enrolled `suitePaths` and their transitive in-repo closure (probe record, §Results — probe 3):

```
DOMAIN: enrolled     seeds 29     modules reached 86
  namespace:inrepo         0
  default:inrepo           0
  reexport-named:inrepo    0
  reexport-star:inrepo     0
  reexport-alias:inrepo    0
  reexport-ns:inrepo       0
  export-local-list        0
  export-assignment        0
  namespace used in a non-member position   0
  dynamic import() with a non-literal specifier   0
  computed member access on process               0
```

**Every form this arc repairs occurs zero times in the classifier's current domain.** Therefore the repair changes no verdict today: all 29 `EXPECTED_ENV_TOUCHING` numbers stand and the unclassifiable set stays empty. That is AC-1, and it is machine-checkable rather than argued.

### §3.4 Population of the near-domain — why the repair is worth shipping

Same walk seeded from `git ls-files tests` (2,314 seeds, 3,207 in-repo modules reached). The last two rows come from a second walk whose closure also follows `export … from` and literal dynamic-import edges and therefore reaches 3,255 modules from the same seeds:

| form (in-repo edges only) | count |
| --- | --- |
| `import { x } from` | 9,215 |
| `import { x as y } from` | 133 |
| `export { x } from` | 117 |
| `import * as ns from` | 22 |
| `import d from` | 40 |
| `export { x }` (local list) | 28 |
| `export * from` | 1 |
| `export * as ns from` | 0 |
| `export { x as y } from` | 0 |
| namespace local in a non-member position | 41 |
| dynamic `import()` with a non-literal specifier | 4 |
| computed member access on `process` | 0 |

The live combination of both defects already exists: `tests/setup.ts:2` does `import * as logModule from "@/lib/log"`, and `lib/log/index.ts` is a barrel whose entire public surface is 12 value re-export specifiers plus 5 type-only ones (`lib/log/index.ts:2-14`). `tests/setup.ts` is not itself scanned — `classifyTests` reads only the file named in `suitePaths` — so the nearest scannable instance is `tests/messages/_metaCatalogCopyHygiene.test.ts:28`, which imports `* as roleRecognizeCopy` and consumes it opaquely at `tests/messages/_metaCatalogCopyHygiene.test.ts:141` (`Object.entries(roleRecognizeCopy)`); neither file is enrolled today. The four non-literal dynamic imports are `tests/parser/_metaTransformSitesWalker.test.ts:67`, `tests/parser/_metaKnownSectionsWalker.test.ts:140`, `tests/help/render.test.ts:41`, `tests/e2e/helpers/useServerDirectivePlugin.test.ts:153`.

`computed member access on process` has **zero** instances repo-wide. It is propagated anyway because it is one of the two rules `unclassifiableWithin` already owns and propagation is a single mechanism for both; this arc adds no rule for it.

### §3.5 Non-language import targets

In-repo import edges from `tests/**`, by resolved extension: `.ts` 4,237 · `.tsx` 677 · `.mjs` 6 · `.json` 5 · `.mdx` 2. The `.json` and `.mdx` targets are the inputs §2.4 exists for; `scripts/lib/phantomGapExecuted.mjs` is reached from the enrolled `tests/ci/phantomGapExecuted.test.ts` and must keep behaving exactly as today.

### §3.6 Existing coverage of the repaired forms

`tests/mutation/source/premiseScan.test.ts` on #827 (557 lines) has fixtures for two of the canonical spec's four unclassifiable forms — the cases named `a dynamic import whose specifier is not a literal` and `a computed member access on process`. There is **no fixture for an unfollowable re-export and none for an unparseable in-repo module**, so canonical **AC-8a** (`docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md:501`) **is satisfied 2/4** today. The suite's `namespace import` case uses `import * as cp from "node:child_process"` — a provenance module, so it is decided by `isProvenanceModule` before any member resolution and cannot fail for the reason §3.1 exposes. AC-3 and AC-8 close both gaps.

---

## §4 Documented limits

1. **`export * as ns from "m"` is reported, not followed** (§2.2). An exported namespace would need a second namespace-valued binding kind for a form with zero occurrences repo-wide. Worst case: `unclassifiable` naming the module — loud, never a silent free.
2. **`export = <expr>` is reported, not followed** (§2.2). Zero occurrences as an in-repo import target.
3. **A namespace binding used anywhere other than `ns.member` or `ns["member"]` is reported** (§2.3). 41 near-domain sites, 0 live. The cost of the alternatives is either module-closure over-classification (fenced, §1.1 item 2) or silence (violates the bound).
4. **Non-language targets are pure, not analyzed** (§2.4). A `.json` or `.mdx` import cannot reach the environment by construction; the limit is that a future non-TS language with side effects would be treated as pure. Same posture and same direction as L-2.
5. **A propagated `unclassifiable` loses to a proven `environment-touching`** (§2.7). The reader is told the louder of two true things and the module with the unresolvable corner is not named in `detail` for that test. Promoting it is a one-line lattice change; it is fenced here because it costs `reaches`'s provenance short-circuit, whose absence was measured at 1.3 s → 5.5 s across the enrolled corpus (the `scopeCache` comment).
6. **Block-grain scope is still function-grain** (predecessor spec §4 limit 1, inherited unchanged).
7. **`node_modules` remains pure (L-2); undetected forms remain undetected (L-8).** Neither is widened or narrowed here.
8. **Obfuscated import graphs are out of the fence** (§1). A computed re-export table, an `eval`, or a namespace laundered through an untyped indirection is not ordinary authoring; this arc makes no claim about them.

### Dimensional Invariants

None. This arc introduces no rendered component, no fixed-dimension parent and no box-model change: the diff is scanner code, unit fixtures, registry rows and ledger prose. No file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*` or `DESIGN.md` is touched, so the invariant-8 UI definition is not triggered. If implementation contradicts this, that task adds the relationship here plus the real-browser assertion the writing-plans layout-dimensions rule requires.

### Transition Inventory

None. No visual state is added or changed — no `AnimatePresence`, no `exit`/`initial`/`animate` props, no conditional render change. If a task adds a visual state, the inventory gains its pairs first.

---

## §5 Meta-test / registry inventory

- **EXTENDS** `tests/mutation/source/premiseScan.test.ts` — new fixture groups for §2.2's accept-set (E1-E6 plus each reported form), §2.3's namespace positions, §2.4's non-language targets, §2.5's cycle, and §2.6's propagation cells. Every positive fixture ships with the foil that makes it discriminating (§6).
- **EXTENDS** `tests/mutation/_metaPremiseContract.test.ts` — comment only. **No `EXPECTED_ENV_TOUCHING` number changes** (AC-1); the diff is asserted to contain no edit to a numeric value in that map.
- **EXTENDS** `tests/mutation/source/registry.ts` — the `premiseScan` row's `accepted` array, re-derived via `enumerateSites` because `siteId`s are line-keyed (§1).
- **CREATES** no new meta-test. `tests/mutation/_metaPremiseContract.test.ts` already walks the enrolled suites from the registry, so a newly enrolled surface is covered by default; and `tests/mutation/_metaPremiseContract.test.ts`'s unclassifiable assertion is already the structural guard for the reporting posture.
- No Supabase call site, no invariant-10 mutation surface (tooling and test code only), no advisory locks, no §12.4 catalog row, no migration, no UI surface.

---

## §6 Acceptance criteria

Each criterion names the failure mode it catches. Every positive fixture has a foil, so no assertion can pass by the classifier being a constant in either direction.

- **AC-1 — verdict-neutral on the live domain.** `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` passes with all 29 `EXPECTED_ENV_TOUCHING` values unchanged, and the diff contains no edit to any numeric value in that map. *Catches:* a repair that over-reaches and silently re-baselines the corpus it was supposed to leave alone.
- **AC-2 — namespace member edges resolve.** `import * as ns from "./helper"; ns.spawnHelper()` classifies `environment-touching`; `ns["spawnHelper"]()` likewise. *Catches:* §3.1 rows 3-4.
- **AC-3 — namespace is member-precise, not module-wide.** A module exporting both `spawner` (importing `node:child_process`) and `pureOne`; a test calling only `ns.pureOne()` classifies `environment-free`. *Catches:* the module-closure regression §1.1 item 2 fences out. This is AC-2's foil and neither may be removed without the other.
- **AC-4 — a default export is named `default`.** `export default function spawnHelper(){…}` imported as `import runIt from …` classifies `environment-touching`. The fixture uses the RENAMED form; the same-name form is a second case, never the only one. *Catches:* §3.1 rows 5-6, and the name-coincidence pass that would validate a non-repair.
- **AC-5 — every accepted export form in §2.2 resolves.** One fixture per row E1-E6, plus `export { x as y } from`, `export { default as x } from`, `export { x as default } from`, a 2-deep chain, and `import { x } from "./y"; export { x };`. Each has a pure-module foil. *Catches:* §3.1 rows 7-13.
- **AC-6 — AC-10b stays quiet.** `reportEnvelope`'s parameter `res` beside `main()`'s `const res = spawnSync(...)` classifies `environment-free` when imported directly. *Catches:* trading this arc's false negative for the predecessor's false positive.
- **AC-7 — AC-10b stays quiet through a namespace.** The same module reached as `import * as env from …; env.reportEnvelope({ ok: true })` classifies `environment-free`. *Catches:* the same trade, taken through the new edge rather than the old one.
- **AC-8 — the reported forms are REPORTED.** An unfollowable re-export (missing target), an unparseable in-repo module, `export * as ns from`, `export =`, and a namespace in a non-member position each classify `unclassifiable` with a `detail` naming the construct and the module. *Catches:* the silent-free direction on every form §2.2 and §2.3 decline to model; closes canonical AC-8a's (`2026-08-04-guard-premise-reachability-design.md:501`) missing 2 of 4 (§3.6).
- **AC-9 — non-language targets stay pure.** A test importing a `.json` file classifies `environment-free`, not `unclassifiable`. *Catches:* the false positive §2.4 exists to prevent.
- **AC-10 — re-export cycles terminate.** Two modules re-exporting a name from each other classify `unclassifiable` with reason `re-export cycle`, and the call returns. *Catches:* a non-terminating fixed point.
- **AC-11 — the four propagation cells report.** Module-scope helper × describe-scope helper × non-literal dynamic `import()` × computed `process` access, plus the cross-module cell, each classify `unclassifiable`, with `detail` naming the module holding the construct. Foil: the same helpers without the construct classify `environment-free`. *Catches:* §3.2.
- **AC-12 — precedence is pinned in both directions.** A test whose own extent holds a construct AND which provably touches the environment classifies `unclassifiable` (shipped); a test that reaches a construct only through a helper AND provably touches the environment classifies `environment-touching`. *Catches:* an unstated lattice drifting between rounds, and pins §2.7 so neither branch is relitigated.
- **AC-13 — provenance modules keep their precedence.** `import * as cp from "node:child_process"; cp.spawnSync(…)` classifies `environment-touching` (the shipped `namespace import` case, unchanged), and so does a namespace import of a provenance module whose member is never accessed. *Catches:* a member-precise repair that accidentally demotes the provenance-module short-circuit.
- **AC-14 — performance stays inside budget.** The enrolled-corpus pass stays under the contract's 30 s budget, with the before/after wall clock recorded. *Catches:* the regression `premiseScan.ts:207-210` measured once already.
- **AC-15 — mutation gate.** `pnpm heavy pnpm mutation:guards` on the `premiseScan` surface meets `scoreFloor: 0.95` with an empty unaccepted-survivor set, the accepted array re-derived by `enumerateSites` rather than hand-edited. The score and survivor set are stated in the round-1 diff brief.

---

## §7 Sequencing

**This arc's implementation is blocked on PR #827 merging.** That PR rewrites `moduleScopeExtent`'s surrounding code, lands the scope-aware extents this design builds on, and enrols `premiseScan` in the mutation registry. Two writers on one file is the hazard AGENTS.md's worktree invariant exists to prevent. So:

1. Spec and plan are authored against `origin/fix/scanner-scope-totality` (this document; every citation in §0-§2 is to that tree).
2. The implementation branch does **not** edit `tests/mutation/source/premiseScan.ts` until #827 is on `main`.
3. On merge: `git merge origin/main`, then re-verify every `premiseScan.ts` line citation in §0, §2.1-§2.7 and §4 before the first diff-review dispatch — line anchors are drafting-time locators and #827's merge will move them.
4. Task 1 of the plan re-runs the §3.1/§3.2 probe harness against the merged tree and confirms the two tables are unchanged. If any row has moved, the design is re-derived before implementation, not after.

At the time of writing (2026-08-16 14:33 CDT) #827 is `OPEN` / `UNSTABLE` with `mutation-harness` still running.
