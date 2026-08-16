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

**PROBE DOMAIN.** `tests/mutation/source/registry.ts`'s enrolled `suitePaths` and every in-repo module transitively reachable from them — **31 suites / 90 in-repo modules once PR #827 lands**, which is the domain at implementation time (§3.3) — that closure is the classifier's entire live domain, since `tests/mutation/_metaPremiseContract.test.ts:165` derives the scanned set from `GUARD_SURFACES.flatMap((s) => s.suitePaths)`. The near-domain, from which the registry's next enrolment is drawn, is `git ls-files tests` plus its in-repo closure (2,314 seeds, 3,207 modules; §3.4). An admissible probe is an input from one of those two sets, or one ordinary edit from such an input — swapping `import { x }` for `import * as ns`, hoisting a helper into a barrel, renaming a default. A constructed module graph outside both sets files to §4 without a round.

**Threat fence.** Ordinary repository refactors by a contributor who is not trying to evade the checker. Deliberately obfuscated import graphs — computed re-export tables, `eval`, a namespace laundered through an untyped indirection — are **out of scope** and file to §4. This is the same fence the canonical spec set at §3.3.2.1 ("refactoring a spawn behind a *local* helper is ordinary authoring and is covered; reaching the environment through a third-party package to escape the checker is not"), and every admissibility clause in §1.2 cites it.

**Mutation status (convergence bullet 4).** `premiseScan` is **already enrolled** on `origin/fix/scanner-scope-totality` (`tests/mutation/source/registry.ts`, `id: "premiseScan"`): `scoreFloor: 0.95`, operators `relational-boundary` / `equality-flip` / `integer-literal`, deciding suites `tests/mutation/source/premiseScan.test.ts` + `tests/mutation/_metaPremiseContract.test.ts`, accepted set of 4 rows (3 `equivalent`, 1 `accepted-gap`). Accepted `siteId`s are LINE-keyed, so this arc's edit shifts every row below its first hunk; the implementation branch **re-derives the accepted set via `enumerateSites` rather than hand-adjusting**, reruns `pnpm heavy pnpm mutation:guards`, and states the score plus the unaccepted-survivor set in its round-1 diff brief. **Re-keying is not the whole job.** One of those four rows — the `integer-literal` row accepted `equivalent` on the grounds that "`unresolved` is provably always empty… populated only where `factsFor` returns null" — has its premise FALSIFIED by §2.6, which populates that array from two ordinary constructs. Re-deriving a `siteId` moves a line; it never re-tests an argument. That row is RETIRED, not migrated (§5, AC-15), and `EXPECTED_LEDGER_KINDS.premiseScan` in `tests/mutation/guardSurfaces.gate.test.ts` moves with it. From that point the diff-stage convergence criterion is that score with an empty unaccepted-survivor set — a "the guard does not pin what it claims" finding is admissible only with a surviving mutant from a declared operator at a named site.

### §1.1 Resolved scope — do not relitigate

Each item carries its ratification. Verify the citation; do not re-derive the decision.

1. **Scope-aware extent resolution and the AC-10b collision are settled by PR #827.** `reportEnvelope`'s parameter `res` must not inherit `main()`'s `const res = spawnSync(...)`. The mechanism is scope-keyed extents plus parameter shadows — the `ModuleFacts.extents` / `ModuleFacts.shadows` maps and the declaration walk inside `moduleFacts` (predecessor spec §1.1 item 1). This arc changes the CROSS-MODULE lookup only and re-pins AC-10b, including through a namespace import (§6 AC-6, AC-7). Nothing here re-opens scope registration.
2. **Module-closure resolution is rejected.** A namespace import must resolve **member-precisely**, never the target module's whole import closure. The canonical spec probed the alternative and found it wrong in the damaging direction: `scripts/ledger-claims.ts` imports `realGitSurface` from a module that imports `node:child_process`, so a module-closure rule marks every test importing `reportEnvelope` environment-touching — including the 101-claim fixture that touches no environment (canonical spec §3.3.2.1, "Declarations, not modules"). AC-7 is the regression case.
3. **The recognized-unresolvable list stays closed at four forms.** Non-literal dynamic `import()`; computed member access on `process`; a re-export chain the resolver cannot follow; an in-repo module that cannot be parsed (canonical spec §3.3.2.1, and its AC-8a at `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md:501`). This arc adds **no fifth family**. It makes form 3 actually reachable and gives forms 1 and 2 a propagation path. **Form 4 stays unreachable and this arc does not change that** — round-1 review probed the `unparseable in-repo module` branch to be dead code (§3.8), and making it live would mean a new detection rule over `sf.parseDiagnostics` on an axis with zero measured instances, which is the widening direction §1.2(e) forbids. It is filed instead (§4 limit 8), and canonical AC-8a goes from 2 of 4 to 3 of 4, stated rather than overclaimed. A proposal for a fifth family is a canonical-spec change with its own probe, not a round on this diff.
4. **Symbol-level data-flow analysis is declined** (canonical spec §3.3.2.1, R6 recommendation, declined with reasons). Re-proposing it is out of scope.
5. **`node_modules` is pure (L-2); undetected ≠ unclassifiable (L-8).** A bare specifier resolves to nothing and is treated as pure. A provenance reaching a test through a form outside the analyzed list is *undetected*, and no assertion here claims otherwise.
6. **The verdict-precedence asymmetry is deliberate and is specified in §2.7.** Own-extent `unclassifiable` outranks `environment-touching` (shipped, in `classifyTests`); a *propagated* `unclassifiable` does not. Both branches are loud, so the consequence bound holds in either; preserving `reaches`'s provenance short-circuit is a performance requirement bounded by AC-14's ratio rather than by a prior measurement. **The `scopeCache` comment's 1.3 s → 5.5 s figure measures an unmemoized SCOPE WALK, not the short-circuit's absence**, and the round-1 draft cited it as though it measured the latter; nobody has measured that, and §4 limit 7 says so. Promoting propagated `unclassifiable` above `environment-touching` is a one-line lattice change filed as §4 limit 5, not a defect.
7. **Zero live instances is not a reason to descope.** §3.3 measures zero occurrences of every repaired form inside the classifier's current domain, and that is the *point*: the repair is verdict-neutral today (AC-1) and exists so that the ordinary refactor which introduces the first instance does not silently blind the guard. The near-domain already holds 22 in-repo namespace imports, 40 in-repo default imports, and 117 named re-export specifiers across 41 statements plus one `export *` (§3.4 states both grains, because a bare specifier count is not reproducible against a statement count), any of which enters the live domain the day its suite is enrolled.
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

Half 1 is not "namespace edges + default names + re-export following". It is one wrong function. Replace the local-declaration lookup with an **export resolver**, and — because the same round-1 review found the reason channel dropped at two of its three call sites — make the traversal's return type carry its reasons instead of collapsing to a scalar:

```
type ExportResolution =
  | { kind: "extent";       nodes: ts.Node[] }              // resolved here
  | { kind: "forward";      spec: string; exportName: str } // follow to another module
  | { kind: "notAModule" }                                  // out of language: pure (L-2)
  | { kind: "noSuchExport" }                                // the module declares no such name
  | { kind: "unresolvable"; reason: string };               // -> unclassifiable

function resolveExport(
  facts: ModuleFacts,
  exportName: string,
  visited: Set<string>,          // `${modulePath}#${exportName}`, see §2.5
): ExportResolution;

// The traversal returns reasons, never a bare verdict (§2.6).
type Reach = { verdict: Verdict; reasons: string[] };
function reaches(start: ts.Node, home: ModuleFacts, homePath: string): Reach;
```

The traversal then asks for an **export name**, and the importer's local name never crosses a module boundary:

| import form | export name requested |
| --- | --- |
| `import { x } from "m"` | `x` |
| `import { x as y } from "m"` | `x` (shipped: the named-import branch of `moduleFacts` records `imported: e.propertyName ? e.propertyName.text : e.name.text`) |
| `import d from "m"` | `default` |
| `import * as ns from "m"`, reference `ns.x` or `ns["x"]` | `x` |
| `const ns = await import("m")`, reference `ns.x` | `x` (§2.3; the dynamic form is bound by `bindPattern`, not by the static-import walk) |

The change is (i) a default import records `imported: "default"`, (ii) a namespace binding — static or dynamic — is marked as such rather than recorded under a same-named export, (iii) `moduleScopeExtent` becomes `resolveExport`, and (iv) `reaches` returns `Reach`.

**`noSuchExport` is a distinct answer from `unresolvable`, and the distinction is load-bearing.** `unresolvable` means "I recognize a construct and cannot follow it" and reports. `noSuchExport` means "this module declares no export by that name", which is what a `export *` fan-out branch that does not carry the name legitimately produces, and what a type-only import produces once types are filtered. A `noSuchExport` on a *star fan-out branch* is a benign miss and the walk continues to the next branch. A `noSuchExport` on a **direct** request — an `import { x } from "m"` where `m` exports no `x` — is a program that does not compile, and it resolves to pure rather than reporting, because a guard is not a type checker and inventing a diagnostic there would fire on every mid-edit tree. Both cells were unstated in the round-1 draft and both are now decided.

**The default-import defect is currently masked by coincidence.** §3.1 measures `import spawnHelper from "./helper"` as `environment-touching` and `import runIt from "./helper"` — same module, same default export — as `environment-free`. The first passes only because the local name happens to equal a module-scope declaration's name. No repair may be validated by the same-name case alone; AC-4 uses the renamed form.

### §2.2 Export accept-set (keyed on AST form, not on spelling)

The resolver **accepts** exactly these. This is an allowlist: a form absent from the table is `unresolvable`, never silently absent.

**Resolution order is part of the contract, and getting it wrong reproduces the very defect §0 diagnoses.** A module may hold a non-exported local `spawnHelper` *and* `export { spawnHelper } from "./helper"` — legal TypeScript, measured `environment-free` today (§3.7 probe B8). If the resolver consulted `extents` first it would answer with the local and preserve the silent free through the barrel, which is §0's substitution wearing a new name. So: **the export map is consulted FIRST and `extents` is never consulted on its own.** `extents` is reached only through an E1 or E2 entry that has already established the name is exported.

| # | AST form | source | resolves to |
| --- | --- | --- | --- |
| E1 | one of exactly four declaration kinds carrying an `export` modifier — `VariableStatement` (whose declarations' identifiers bind), `FunctionDeclaration`, `ClassDeclaration`, `EnumDeclaration` | local | `extent` — the nodes registered for that name at module scope |
| E2 | `ExportDeclaration`, no `moduleSpecifier`, `NamedExports` (`export { x }`, `export { x as y }`) | local **or** forwarded | the EXPORTED name is `name`; the LOCAL name is `propertyName ?? name` — the mirror image of an import specifier, and the single easiest thing in this design to get backwards. Resolves to `extent` when that local name is an E1 declaration; to `forward` when it is an entry in `facts.imports` (the import-then-export case, §3.1 row 13) |
| E3 | `ExportAssignment` with `isExportEquals: false` (`export default <expr>`) | local | `extent` = the expression |
| E4 | declaration carrying both `export` and `default` modifiers (`export default function f(){}`) | local | `extent` = the declaration |
| E5 | `ExportDeclaration` with `moduleSpecifier` + `NamedExports` (`export { x } from`, `export { x as y } from`, `export { default as x } from`, `export { x as default } from`) | forwarded | `forward` to `(spec, propertyName ?? name)` |
| E6 | `ExportDeclaration` with `moduleSpecifier`, no clause (`export * from`) | forwarded | `forward` to each star target in turn; **`default` is never forwarded by a star export** (ES semantics) |

**E1's predicate is the four registered declaration kinds, not "carries an `export` modifier".** `moduleFacts` registers extents for exactly `VariableDeclaration`, `FunctionDeclaration`, `ClassDeclaration` and `EnumDeclaration`; anything else with an `export` modifier has no extent to return, so a predicate written as "carries an `export` modifier" resolves it to an EMPTY extent and passes it as free. `export namespace NS { … }` is the measured instance — probe B9 (§3.7) classifies a spawning `NS.spawnHelper()` as `environment-free`, population **0** repo-wide. Narrowing the predicate to the four kinds sends it to `unresolvable` instead, which is the loud answer. The same slip would let `export interface` and `export type T =` match E1; they are behaviourally inert because `isInTypePosition` filters type references, but a predicate that admits them is a denylist wearing an allowlist's clothes.

**`export const` carries its modifiers on the `VariableStatement`, not on the `VariableDeclaration`.** E1's implementation reads the modifier from the statement and maps it to the identifiers its declaration list binds. Read literally off the `VariableDeclaration`, E1 misses the commonest exported form in the repository (971 exported variable statements) and would move AC-1.

Deliberately **not** accepted, each reporting `unresolvable` with its own reason string:

- **`export * as ns from "m"`** (`NamespaceExport`) — an exported binding that is itself a namespace. Measured population: **0** repo-wide (§3.4). Modelling it would add a second namespace-valued binding kind for zero live inputs; the narrowing choice is to report it.
- **`export = <expr>`** (`ExportAssignment` with `isExportEquals: true`) — the TypeScript CommonJS form. Measured **0** repo-wide, at the statement grain (§3.4).
- **`export namespace` / `export module`** — see the E1 note above. Measured **0** repo-wide.
- **A type-only export** (`export type { … }`, `isTypeOnly` on the declaration or the specifier) — resolves to `notAModule`-equivalent purity, not `unresolvable`: a type reaches nothing at runtime, exactly as `isReferenceIdentifier` and `isInTypePosition` already decide for references.
- **Any other export syntax** — reported with the node's kind name in `detail`.

**Ambiguity under multiple star exports.** If a name is sought through several `export * from` targets, every target is followed; a branch answering `noSuchExport` is a benign miss and the walk continues; the first branch yielding a provenance wins. Following all is conservative in the safe direction and cannot under-report. AC-5b is its fixture — without one, this sentence is unpinned prose.

### §2.3 Namespace bindings resolve member-precisely, and nothing else

A namespace binding is marked on the EXISTING import binding rather than introduced as a fourth `Binding` kind: `{ kind: "import"; scope; spec; imported; namespace: true }`. That is a deliberate narrowing. A new `kind` would have to be handled at every site that dispatches on `binding.kind` — `reaches`, `extentIsProvenance`, `bindingKey` — and round-1 review found that a missed site falls through to `environment-free`, the silent direction. Keeping the existing kind means every dispatch site keeps working by default and only the member-resolution step is new.

Both spellings of a namespace bind the same way:

- **static** — `import * as ns from "m"`, recorded by the static-import walk.
- **dynamic** — `const ns = await import("m")` with a string-literal specifier, recorded by `bindPattern`'s identifier branch. That branch currently records `imported: name.text`, the LOCAL name — the same substitution §0 half 1(a) names, in the one place the round-1 draft declared out of scope. Probe (§3.5): `const ns = await import(lit); ns.spawnHelper()` is `environment-free` today, and `tests/scripts/ledgerClaimsCheck.test.ts` already writes, at three sites (lines 410, 483 and 569), `await import("@/scripts/lib/ledger-git")` in destructured form, saved only by `isProvenanceModule`. Namespace-binding one of those is a single ordinary edit, so this is a silent free inside the probe domain, not a documented limit.

A reference to a namespace binding is resolved by its **use position**, and exactly two positions are accepted:

1. `ns.member` — `PropertyAccessExpression` whose `expression` is the namespace reference. Resolve export `member` of `m`.
2. `ns["member"]` — `ElementAccessExpression` with a **string-literal** argument. Same. This mirrors the shipped `process[...]` rule, whose `isElementAccessExpression` branch in `unclassifiableWithin` treats only a *non*-literal argument as unresolvable.

**Every other use of a namespace binding reports `unclassifiable`**, with the local name and the module in the reason. That covers `Object.entries(ns)`, `vi.spyOn(ns, "f")`, `"k" in ns`, `ns as Record<string, unknown>`, `const { a } = ns`, and passing `ns` as an argument. Measured cost: **0** occurrences in the live domain, 41 in the near-domain across 8 files (§4 limit 3). The alternatives are module-closure (fenced out by §1.1 item 2) or silence (violates the consequence bound). Recognizing `vi.spyOn` specifically would be a library-shaped special case and is the ratchet §1.2(e) forbids.

**Order matters and is preserved.** `isProvenanceModule(imported.spec)` is checked inside `reaches` **before** any member resolution, so `import * as cp from "node:child_process"` stays `environment-touching` whatever member is used — the shipped `namespace import` unit case keeps passing unchanged. The same precedence applies inside `extentIsProvenance`, whose identifier branch resolves a reference and tests `binding.kind === "import" && isProvenanceModule(binding.spec)`; because a namespace keeps `kind: "import"`, that test needs no edit at all.

### §2.4 A target that is not a module of this language is pure, not unresolvable

`resolveSpecifier` accepts a bare `base` candidate, so an in-repo edge can land on a file that is not TypeScript. Measured live edges from `tests/**`: 6 `.mjs`, 5 `.json`, 2 `.mdx` (§3.6). `.mjs` is a language module and is **analyzed exactly as today** — `tests/ci/phantomGapExecuted.test.ts` reaches `scripts/lib/phantomGapExecuted.mjs`, the only non-`.ts` edge inside the live domain, and AC-9b pins that it stays analyzed. `.json`, `.mdx` and any other extension are **`notAModule`**: treated exactly like a bare specifier — pure by L-2, never `unresolvable`.

Without this rule the repair would turn `import manifest from "@/supabase/__generated__/schema-manifest.json"` into a red `unclassifiable` the moment its suite is enrolled, which is a false positive introduced by a false-negative repair.

**The extension test runs BEFORE the file is read, and that ordering is a requirement rather than an implementation detail.** `moduleFacts` calls `readFileSync` on whatever `resolveSpecifier` returns, and `resolveSpecifier`'s bare `base` candidate can name a DIRECTORY — probe B1 (§3.7) shows `readFileSync` throwing `EISDIR`, which aborts the whole run rather than reporting anything. Applying the allowlist first makes a directory `notAModule` and unreachable by the read. There are zero such edges in the near-domain, so the crash itself is a documented limit (§4 limit 6); the ordering constraint is not, because it costs nothing and removes the crash by construction.

The accepted language extensions are `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`; the list lives in one named constant beside `resolveSpecifier`. It is deliberately the LANGUAGE's set rather than this repository's current inventory — `git ls-files` today holds `.ts` (2,496), `.tsx` (775) and `.mjs` (50) and none of the other four — because the failure direction of the two choices is not symmetric: an extension missing from the list makes a real module silently DATA, which is the false negative this whole arc exists to close, while an extension listed but unused costs nothing at all.

### §2.5 Termination

Forward-following visits `(modulePath, exportName)` pairs against a `visited` set threaded through `resolveExport`. **A repeat contributes nothing and the walk continues** — it means the pair was already answered on another path, which is what a DIAMOND graph produces (`barrel` re-exports from both `a` and `b`, and both re-export from `c`); reporting a cycle on any repeat would make that ordinary shape a false `unclassifiable`. A genuine cycle is the case where every path is exhausted with nothing resolved, and only that reports `unresolvable` with reason `re-export cycle`.

There is no depth cap and none is wanted: a bound expressed as a NUMBER is the shape AGENTS.md's repair-economy rule says the next reviewer will find, so termination is derived from the finite pair set — a repository has finitely many modules and each has finitely many export names.

### §2.6 The traversal carries its reasons, at every call site

`reaches` today returns a scalar `Verdict` and owns a reason channel — `unresolved: string[]` — that only one of its callers can observe, and that channel is dead in practice: it is populated at exactly one site, `unparseable in-repo module`, which §3.8 probes to be unreachable. Half 2 is that channel becoming real, and reaching every caller.

Three changes, and they are one change:

1. **`reaches` returns `Reach = { verdict, reasons }`** (§2.1). Nothing else can fix the call sites below without duplicating the traversal.
2. **The two `unclassifiableWithin` rules are evaluated on each node the traversal visits**, in the facts of the module that node belongs to, and their reasons are pushed into `reasons` with the module named — `dynamic import() with a non-literal specifier in <repo-relative path>`, `computed member access on process in <repo-relative path>`. Naming the module is not decoration: with propagation, `detail` is the only thing telling a reader which file to open.
3. **Every caller merges reasons.** `classifyTests` calls `reaches` twice — once on the test's own call expression, once per hook — and the hook loop tests the result for a single value (`=== "environment-touching"`), discarding everything else. That is a silent free the consequence bound forbids, and it is measured, not hypothesized: probe §3.5 rows C1-C3 put each construct in a `beforeEach` body, a `beforeAll` body and a `describe.each` producer and all three classify `environment-free`, while the same construct in the test's own body classifies `unclassifiable`. The class has exactly two sites — `hookBodies` (the four before/after forms) and `eachProducers` — and both merge reasons after the repair.

That last one is one ordinary edit from the live corpus, not a constructed case: `tests/parser/_metaTransformSitesWalker.test.ts:60` declares `scanFiles()`, whose body holds the non-literal `import()` a few lines below, and calls it from six separate `it` bodies. Hoisting it into a `beforeAll` — the exact refactor §0 records as already performed once on `phantomGapExecuted.test.ts` — moves it into the discarded path.

`unclassifiableWithin` keeps its existing own-extent call site and its precedence untouched; the propagated path is additive. A construct in the test's own body is therefore seen twice — once by each path — so reasons are de-duplicated before they reach `detail`.

### §2.7 Verdict lattice, stated once

For the test's **own extent** (unchanged, shipped as the `if (ownUnresolved.length > 0) verdict = "unclassifiable";` line in `classifyTests`):

> `unclassifiable` > `environment-touching` > `environment-free`

For everything reached **through the traversal — from the test's own extent, from any hook, or from a `describe.each` producer, identically**:

> `environment-touching` > `unclassifiable` > `environment-free`

The second lattice is what §2.6 item 3 makes true of the hook path; before the repair the hook path had no third state at all. Both branches are loud; the consequence bound quantifies over the FREE direction only, and neither branch can produce a silent free. §4 limit 5 records the alternative to the asymmetry and the one-line change that would adopt it.

### §2.8 What does not change

The declaration-reference fixed point, scope-keyed extents, parameter shadows, the write pass, `ENVIRONMENT_SOURCES`, the premise/exemption detection, `.each` associated-placement detection, and every declared `EXPECTED_ENV_TOUCHING` number. This arc edits the cross-module lookup, the namespace marking on import bindings (static in the import walk, dynamic in `bindPattern`), `reaches`'s return type and its two call sites, and the `unresolved` channel — nothing else.

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

An AST walk over the enrolled `suitePaths` and their transitive in-repo closure (probe record, §Results — probe 3). **Measured twice**, because PR #827 enrols `premiseScan` itself and therefore changes the domain: once against the registry on `main` (29 suites / 86 modules) and once against `git show origin/fix/scanner-scope-totality:tests/mutation/source/registry.ts` (31 suites / 90 modules, the domain at implementation time — the two added suites are `tests/mutation/source/premiseScan.test.ts`, declared `0`, and `tests/mutation/_metaPremiseContract.test.ts`, declared `1`). **Every count below is zero in BOTH measurements**; the post-#827 figures are the binding ones:

```
DOMAIN: enrolled (post-#827 registry)     seeds 31     modules reached 90
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

**Every form this arc repairs occurs zero times in the classifier's domain, before and after #827.** Therefore the repair changes no verdict: every `EXPECTED_ENV_TOUCHING` number stands (29 rows today, 31 once #827 lands) and the unclassifiable set stays empty. That is AC-1, and it is machine-checkable rather than argued.

### §3.4 Population of the near-domain — why the repair is worth shipping

Same walk seeded from `git ls-files tests` (2,314 seeds, 3,207 in-repo modules reached). The last two rows come from a second walk whose closure also follows `export … from` and literal dynamic-import edges and therefore reaches 3,255 modules from the same seeds. **Import rows are per-specifier; export rows carry BOTH grains**, because round-1 review could not reproduce a bare "117" — `export { a, b, c } from "./m"` is one statement and three specifiers, and the two counts differ by nearly threefold here. The export rows are measured repo-wide over every tracked `.ts`/`.tsx` (3,271 files), a superset of this closure, so they reproduce independently of the seed set:

| form (in-repo edges only) | count |
| --- | --- |
| `import { x } from` | 9,215 |
| `import { x as y } from` | 133 |
| `export { x } from` | 117 specifiers, in 41 statements |
| `import * as ns from` | 22 |
| `import d from` | 40 |
| `export { x }` local | 46 specifiers (4 aliased `x as y`), in 29 statements |
| `export * from` | 1 statement |
| `export * as ns from` | 0 |
| `export { x as y } from` | 0 |
| `export default <expr>` (`ExportAssignment`) | 9 statements |
| `export =` (`ExportAssignment`, `isExportEquals`) | 0 |
| namespace local in a non-member position | 41 |
| dynamic `import()` with a non-literal specifier | 4 |
| computed member access on `process` | 0 |

The live combination of both defects already exists: `tests/setup.ts:2` does `import * as logModule from "@/lib/log"`, and `lib/log/index.ts` is a barrel whose entire public surface is 12 value re-export specifiers plus 5 type-only ones (`lib/log/index.ts:2-14`). `tests/setup.ts` is not itself scanned — `classifyTests` reads only the file named in `suitePaths` — so the nearest scannable instance is `tests/messages/_metaCatalogCopyHygiene.test.ts:28`, which imports `* as roleRecognizeCopy` and consumes it opaquely at `tests/messages/_metaCatalogCopyHygiene.test.ts:141` (`Object.entries(roleRecognizeCopy)`); neither file is enrolled today. The four non-literal dynamic imports are `tests/parser/_metaTransformSitesWalker.test.ts:67`, `tests/parser/_metaKnownSectionsWalker.test.ts:140`, `tests/help/render.test.ts:41`, `tests/e2e/helpers/useServerDirectivePlugin.test.ts:153`.

`computed member access on process` has **zero** instances repo-wide. It is propagated anyway because it is one of the two rules `unclassifiableWithin` already owns and propagation is a single mechanism for both; this arc adds no rule for it.

### §3.5 Round-1 review probes, independently reproduced

Every row below was raised by round-1 review and then re-measured here against the same #827 tree, so the spec cites its own measurement rather than a relayed claim.

```
C1 beforeEach body: non-literal import()                    ->  environment-free   <- silent free
C2 beforeAll body: computed process access                  ->  environment-free   <- silent free
C3 describe.each producer: non-literal import()             ->  environment-free   <- silent free
C5 CONTROL own body                                         ->  unclassifiable (dynamic import() with a non-literal specifier)
C6 CONTROL hook reaching provenance                         ->  environment-touching
DYN-NS  const ns = await import(literal); ns.spawnHelper()  ->  environment-free   <- silent free
DYN-DESTRUCTURED CONTROL                                    ->  environment-touching
```

C1-C3 are §2.6 item 3: `classifyTests` tests the hook `reaches` result for one value only, so every reason reached through a hook or a `describe.each` producer is discarded. C5 and C6 are the controls that make those rows discriminating — the same construct in the test's own body DOES report, and the hook path DOES carry provenance, so what is lost is precisely the reason channel and nothing else. DYN-NS is §2.3: the dynamic namespace spelling is silently free while its destructured sibling is correctly touching.

### §3.6 Non-language import targets

In-repo import edges from `tests/**`, by resolved extension: `.ts` 4,237 · `.tsx` 677 · `.mjs` 6 · `.json` 5 · `.mdx` 2. The `.json` and `.mdx` targets are the inputs §2.4 exists for. `scripts/lib/phantomGapExecuted.mjs` is reached from the enrolled `tests/ci/phantomGapExecuted.test.ts` by a NAMED import, and that module exports exclusively in form E1 (`export const` / `export function`), so it must resolve after the repair exactly as it does today — AC-9b, whose foil is AC-9.

### §3.7 Three narrowing probes

```
B8 local same-name PLUS export{x}from   ->  environment-free
B9 export namespace NS { spawning }     ->  environment-free
B1 directory as a module specifier      ->  THREW: EISDIR
```

B8 is §2.2's resolution order: a module holding both a non-exported local `spawnHelper` and `export { spawnHelper } from "./helper"` is free today, and an `extents`-first resolver would keep it free — §0's diagnosed substitution surviving under a new name. B9 is the E1 predicate: `export namespace` carries an `export` modifier but registers no extent, so a predicate written as "carries an `export` modifier" resolves it to an empty extent and passes it as free. B1 is §2.4's ordering requirement — a directory specifier reaches `readFileSync` and aborts the whole run instead of reporting anything.

### §3.8 Canonical unclassifiable form 4 is dead code

```
GARBAGE in-repo module (export function spawnHelper(: string { return)  ->  environment-free
```

Three independent reasons, each checked: `moduleFacts` returns `null` if and only if `!existsSync(path)`; `resolveSpecifier` returns only candidates for which `existsSync` was already true, so that branch cannot fire through the traversal at all; and `ts.createSourceFile` is error-tolerant — it neither throws nor returns null on the garbage above, parsing it to a `SourceFile` carrying a `FunctionDeclaration`. The `unresolved.push("unparseable in-repo module")` site is therefore unreachable today, and this arc does not change that (§4 limit 8).

### §3.9 Existing coverage of the repaired forms

`tests/mutation/source/premiseScan.test.ts` on #827 (557 lines) has fixtures for two of the canonical spec's four unclassifiable forms — the cases named `a dynamic import whose specifier is not a literal` and `a computed member access on process`. There is **no fixture for an unfollowable re-export and none for an unparseable in-repo module**, so canonical **AC-8a** (`docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md:501`) **is satisfied 2/4** today. This arc closes the re-export form (AC-8) and leaves the unparseable form open and unreachable (§4 limit 8), taking AC-8a to 3 of 4. The suite's `namespace import` case uses `import * as cp from "node:child_process"` — a provenance module, so it is decided by `isProvenanceModule` before any member resolution and cannot fail for the reason §3.1 exposes. There is no assertion anywhere in that suite on the `detail` field, so every `detail` assertion this arc adds is new coverage.

## §4 Documented limits

1. **`export * as ns from "m"` is reported, not followed** (§2.2). An exported namespace would need a second namespace-valued binding kind for a form with zero occurrences repo-wide. Worst case: `unclassifiable` naming the module — loud, never a silent free.
2. **`export = <expr>` is reported, not followed** (§2.2). Zero occurrences repo-wide at the statement grain (§3.4).
3. **A namespace binding used anywhere other than `ns.member` or `ns["member"]` is reported** (§2.3). 0 sites in the live domain; 41 in the near-domain, spread over **8 test files** — `tests/admin/showPageFeed.test.tsx` (11), `tests/admin/showFeedAcceptActions.test.ts` (7), `tests/parser/opsMetadataTokens.test.ts` (2), and one each in `tests/visibility/_metaDocumentedPredicateParity.test.ts`, `tests/sync/unexpectedParentLog.test.ts`, `tests/sync/attachWarningAnchors.test.ts`, `tests/messages/_metaCatalogCopyHygiene.test.ts`, `tests/appSettings/getActiveWatchedFolder.test.ts`. The population is dominated by `vi.spyOn(ns, "name")` and `Object.entries(ns)`, where the member IS statically knowable from a string-literal argument — so the conservative report is genuinely conservative there, and enrolling one of those eight suites costs an explicit `// no-premise:` per affected case. That is the priced cost, stated rather than discovered at enrolment. Recognizing `vi.spyOn` specifically is declined as a library-shaped special case (§1.2(e)).
4. **`export namespace` / `export module` is reported, not followed** (§2.2 E1 note). Population 0 repo-wide; probe B9 (§3.7) shows it silently free TODAY, and narrowing E1's predicate to the four registered declaration kinds is what makes it loud.
5. **Non-language targets are pure, not analyzed** (§2.4). A `.json` or `.mdx` import cannot reach the environment by construction; the limit is that a future non-TS language with side effects would be treated as pure. Same posture and direction as L-2.
6. **A directory reached as a module specifier would throw, and the §2.4 ordering is what prevents it.** `resolveSpecifier`'s bare `base` candidate can name a directory, and `moduleFacts`'s `readFileSync` then throws `EISDIR` and aborts the run rather than reporting (probe B1, §3.7). Applying the extension allowlist BEFORE the read removes the crash by construction. There are zero such edges in the near-domain, so the crash is a limit; the ordering that removes it is a requirement (§2.4), not a limit.
7. **A propagated `unclassifiable` loses to a proven `environment-touching`** (§2.7). The reader is told the louder of two true things and the module with the unresolvable corner is not named in `detail` for that test. Promoting it is a one-line lattice change; it is fenced here because it costs `reaches`'s provenance short-circuit. **The evidence for that cost is a measurement of a DIFFERENT mechanism and is stated as such:** the comment above `scopeCache` records that an unmemoized SCOPE WALK turned a 1.3 s corpus pass into 5.5 s. No one has measured the short-circuit's absence. The round-1 draft cited the scope-walk figure as if it measured the short-circuit; it does not, and the asymmetry rests on the design argument in §2.7 plus AC-14's ratio bound rather than on that number.
8. **"Unparseable in-repo module" — canonical unclassifiable form 4 — remains UNREACHABLE, and this arc does not make it reachable.** Probed three ways (§3.8): `moduleFacts` returns `null` if and only if `!existsSync(path)`; `resolveSpecifier` returns only candidates for which `existsSync` was already true; and `ts.createSourceFile` neither throws nor returns null on garbage — `export function spawnHelper(: string { return` parses to a `SourceFile` with a `FunctionDeclaration`, and the whole fixture classifies `environment-free`. So the `unresolved.push("unparseable in-repo module")` site is dead code today and stays dead after this arc. The round-1 draft claimed in §1.1 item 3 that this arc "makes forms 3 and 4 actually reachable"; **that claim was false for form 4 and is retracted.** Making it real would mean a new detection rule over `sf.parseDiagnostics`, which is recognizer growth on an axis with zero measured instances — the widening direction §1.2(e) forbids — so it is filed as `BL-PREMISESCAN-UNPARSEABLE-MODULE-UNREACHABLE` with this probe as its evidence, and canonical AC-8a stands at 3 of 4 after this arc rather than 4 of 4.
9. **Block-grain scope is still function-grain** (predecessor spec §4 limit 1, inherited unchanged).
10. **`node_modules` remains pure (L-2); undetected forms remain undetected (L-8).** Neither is widened or narrowed here.
11. **Obfuscated import graphs are out of the fence** (§1). A computed re-export table, an `eval`, or a namespace laundered through an untyped indirection is not ordinary authoring; this arc makes no claim about them.

### Dimensional Invariants

None. This arc introduces no rendered component, no fixed-dimension parent and no box-model change: the diff is scanner code, unit fixtures, registry rows and ledger prose. No file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*` or `DESIGN.md` is touched, so the invariant-8 UI definition is not triggered. If implementation contradicts this, that task adds the relationship here plus the real-browser assertion the writing-plans layout-dimensions rule requires.

### Transition Inventory

None. No visual state is added or changed — no `AnimatePresence`, no `exit`/`initial`/`animate` props, no conditional render change. If a task adds a visual state, the inventory gains its pairs first.

## §5 Meta-test / registry inventory

- **EXTENDS** `tests/mutation/source/premiseScan.test.ts` — new fixture groups for §2.2's accept-set (E1-E6 plus each reported form), §2.3's namespace positions in both their static and dynamic spellings, §2.4's non-language targets, §2.5's cycle and its diamond foil, and §2.6's propagation cells including the hook and `describe.each` paths. Every positive fixture ships with the foil that makes it discriminating (§6).
- **EXTENDS** `tests/mutation/_metaPremiseContract.test.ts` — comment only. **No `EXPECTED_ENV_TOUCHING` number changes** (AC-1).
- **EXTENDS** `tests/mutation/source/registry.ts` — the `premiseScan` row's `accepted` array. Two distinct operations, and conflating them is how a stale acceptance survives: rows whose reasoning still holds are RE-KEYED by re-deriving `siteId`s via `enumerateSites` (they are line-keyed and this arc moves every line); the `integer-literal` row accepted on the grounds that "`unresolved` is provably always empty" is **RETIRED**, because §2.6 makes that premise false and its mutant becomes a live silent-free at exactly one reason.
- **EXTENDS** `tests/mutation/guardSurfaces.gate.test.ts` — `EXPECTED_LEDGER_KINDS.premiseScan` currently declares `{ equivalent: 3, "accepted-gap": 1 }` and is asserted with `toEqual`, so retiring or adding any accepted row reds it. Named here because the round-1 plan omitted it and the omission is exactly the fan-out class this inventory exists to catch.
- **CREATES** no new meta-test. `tests/mutation/_metaPremiseContract.test.ts` already walks the enrolled suites from the registry, so a newly enrolled surface is covered by default, and it already asserts the unclassifiable set is empty — the structural guard for the reporting posture this arc extends.
- No Supabase call site, no invariant-10 mutation surface (tooling and test code only), no advisory locks, no §12.4 catalog row, no migration, no UI surface.

## §6 Acceptance criteria

Each criterion names the failure mode it catches. Every positive fixture has a foil, so no assertion can pass by the classifier being a constant in either direction.

- **AC-1 — verdict-neutral on the live domain, mechanically.** `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` passes with every `EXPECTED_ENV_TOUCHING` value unchanged, AND the re-baseline check is a COMMAND, not a reading instruction: `git diff $(git merge-base origin/main HEAD) -- tests/mutation/_metaPremiseContract.test.ts | rg -q '^[-+].*: *[0-9]+,' && exit 1 || exit 0` — non-zero exit means a declared count moved. The merge-base is the base, not `origin/main`, which moves under a live arc. *Catches:* a repair that over-reaches and silently re-baselines the corpus it was supposed to leave alone. The suite alone cannot catch that: it passes after a re-baseline.
- **AC-2 — namespace member edges resolve.** `import * as ns from "./helper"; ns.spawnHelper()` classifies `environment-touching`; `ns["spawnHelper"]()` likewise. *Catches:* §3.1 rows 3-4.
- **AC-2b — a DYNAMIC namespace binding resolves.** `const ns = await import("./helper"); ns.spawnHelper()` classifies `environment-touching`, with the destructured form as its foil (already touching today). *Catches:* the `bindPattern` identifier branch measured `environment-free` at §3.5 — the one place the round-1 draft declared out of scope while the same substitution lived there.
- **AC-3 — namespace is member-precise, not module-wide.** A module exporting both `spawner` (importing `node:child_process`) and `pureOne`; a test calling only `ns.pureOne()` classifies `environment-free`. *Catches:* the module-closure regression §1.1 item 2 fences out. This is AC-2's foil and neither may be removed without the other.
- **AC-4 — a default export is named `default`.** `export default function spawnHelper(){…}` imported as `import runIt from …` classifies `environment-touching`. The fixture uses the RENAMED form; the same-name form is a second case, never the only one. *Catches:* §3.1 rows 5-6, and the name-coincidence pass that would validate a non-repair.
- **AC-5 — every accepted export form in §2.2 resolves.** One fixture per row E1-E6, plus `export { x as y } from`, `export { default as x } from`, `export { x as default } from`, a 2-deep chain, `import { x } from "./y"; export { x };`, and — for E1 — an `export const` case, because the modifier lives on the `VariableStatement` and reading it off the `VariableDeclaration` misses the commonest exported form. **The foil is a MIXED module, not a pure one:** a barrel re-exporting both a spawner and a pure name, with only the pure name imported, classifies `environment-free`. A pure-module foil cannot discriminate against a `forward` that falls back to the target's whole closure, which is the regression §1.1 item 2 fences.
- **AC-5b — star-export ambiguity resolves the way §2.2 says.** Two `export * from` targets, the sought name exported by only one of them: `environment-touching`. Its foil: the same shape with the name in neither, classifying `environment-free` rather than reporting. *Catches:* an implementation that stops at the first branch answering `noSuchExport`, and one that treats a benign miss as `unresolvable`.
- **AC-6 — AC-10b stays quiet.** `reportEnvelope`'s parameter `res` beside `main()`'s `const res = spawnSync(...)` classifies `environment-free` when imported directly. *Catches:* trading this arc's false negative for the predecessor's false positive.
- **AC-7 — AC-10b stays quiet through a namespace.** The same module reached as `import * as env from …; env.reportEnvelope({ ok: true })` classifies `environment-free`. *Catches:* the same trade, taken through the new edge rather than the old one.
- **AC-8 — the reported forms are REPORTED.** An unfollowable re-export (a target that does not exist), `export * as ns from`, `export =`, `export namespace`, and a namespace in a non-member position each classify `unclassifiable` with a `detail` naming the construct and the module. *Catches:* the silent-free direction on every form §2.2 and §2.3 decline to model. This closes canonical AC-8a's re-export form; the fourth canonical form, "unparseable in-repo module", is **out of scope and unreachable by construction** (§4 limit 8), so this arc takes AC-8a from 2 of 4 to 3 of 4 and says so rather than claiming 4.
- **AC-9 — non-language targets stay pure, with a premise that actually holds.** A test importing a `.json` file classifies `environment-free`, **and the specifier carries the `.json` extension** (written with the `.json` extension included in the specifier text), because `resolveSpecifier`'s candidates are the specifier plus `.ts`, plus `.tsx`, plus an index file inside it, and finally the bare specifier itself — a specifier written without the extension never resolves to a `.json` file at all, so a fixture spelled that way is pure whether or not the extension guard exists and proves nothing. *Catches:* the false positive §2.4 exists to prevent, on an input that genuinely reaches the guard.
- **AC-9b — a `.mjs` target stays ANALYZED.** A test importing a named binding from an in-repo `.mjs` module whose body reaches `node:child_process` classifies `environment-touching`. *Catches:* an extension allowlist that over-reaches and turns the live `tests/ci/phantomGapExecuted.test.ts` → `scripts/lib/phantomGapExecuted.mjs` edge into data. AC-9's foil; neither may be removed without the other.
- **AC-10 — re-export cycles terminate, and diamonds do not read as cycles.** Two modules re-exporting a name from each other classify `unclassifiable` with reason `re-export cycle`, and the call returns. Its foil: a DIAMOND — a barrel re-exporting from two modules that both re-export from a third, so the same `(module, exportName)` pair is reached twice — classifies `environment-touching`. *Catches:* a non-terminating fixed point, and the likelier error of treating every visited-set repeat as a cycle.
- **AC-10c — resolution order: an export beats a same-named local.** A module holding a non-exported local `spawnHelper` AND `export { spawnHelper } from "./helper"` classifies `environment-touching`. *Catches:* consulting `extents` before the export map, which preserves the silent free through a barrel — §0's diagnosed substitution under a new name (probe B8, §3.7).
- **AC-11 — the propagation cells report, from every position.** Module-scope helper × describe-scope helper × non-literal dynamic `import()` × computed `process` access, plus the cross-module cell, **plus a `beforeEach` body, a `beforeAll` body and a `describe.each` producer**, each classify `unclassifiable`, with `detail` naming the module holding the construct. Foil: the same helpers and hooks without the construct classify `environment-free`. *Catches:* §3.2 and §3.5 C1-C3 — the hook and producer paths, where `reaches`'s scalar return discarded every reason.
- **AC-12 — precedence is pinned in both directions, including through a hook.** A test whose own extent holds a construct AND which provably touches the environment classifies `unclassifiable` (shipped); a test that reaches a construct only through a helper AND provably touches the environment classifies `environment-touching`; a test reaching a construct only through a HOOK classifies `unclassifiable` rather than `environment-free`. *Catches:* an unstated lattice drifting between rounds, and the hook path silently keeping its old two-state behaviour.
- **AC-13 — provenance modules keep their precedence.** `import * as cp from "node:child_process"; cp.spawnSync(…)` classifies `environment-touching` (the shipped `namespace import` case, unchanged), and so does a namespace import of a provenance module whose member is never accessed. *Catches:* a member-precise repair that accidentally demotes the provenance-module short-circuit.
- **AC-14 — performance stays inside budget, measured at the right grain and bounded by a RATIO.** The `classifyTests` pass over the enrolled suites — NOT the vitest suite duration — stays under the contract's 30 s budget **and within 2× the Task-0 baseline recorded on the same machine in the same run sequence**. Measured 2026-08-16 on the pre-merge tree: the pass is **1.49 s** over 29 suites and 1,314 tests, while the two deciding suites together take **20.69 s** of vitest wall clock, roughly 19 s of which is the four spawned `childRun` fixtures. *Catches:* two things a bare "under 30 s" cannot — a regression at the suite grain, which the 30 s ceiling admits all the way from 1.5 s to 29 s; and the documented 1.3 s → 5.5 s scope-walk regression, a 3.7× move invisible inside a 20.7 s suite duration. The absolute ceiling and the ratio are both required; either alone passes a real regression.
- **AC-15 — mutation gate, with the falsified acceptance retired rather than re-keyed.** `pnpm heavy pnpm mutation:guards` on the `premiseScan` surface meets `scoreFloor: 0.95` with an empty unaccepted-survivor set. Rows whose reasoning survives are re-derived via `enumerateSites` (they are line-keyed); the `integer-literal` row accepted because "`unresolved` is provably always empty" is RETIRED, since §2.6 makes that premise false and its mutant becomes a live silent-free. `EXPECTED_LEDGER_KINDS.premiseScan` in `tests/mutation/guardSurfaces.gate.test.ts` moves with it. *Catches:* an accepted-survivor ledger that survives the very change that falsifies its reasoning — re-keying a row preserves its line, never re-tests its argument.

## §7 Sequencing

**This arc's implementation is blocked on PR #827 merging.** That PR rewrites `moduleScopeExtent`'s surrounding code, lands the scope-aware extents this design builds on, and enrols `premiseScan` in the mutation registry. Two writers on one file is the hazard AGENTS.md's worktree invariant exists to prevent. So:

1. Spec and plan are authored against `origin/fix/scanner-scope-totality` (this document; every citation in §0-§2 is to that tree).
2. The implementation branch does **not** edit `tests/mutation/source/premiseScan.ts` until #827 is on `main`.
3. On merge: `git merge origin/main`, then re-verify every `premiseScan.ts` line citation in §0, §2.1-§2.7 and §4 before the first diff-review dispatch — line anchors are drafting-time locators and #827's merge will move them.
4. Task 1 of the plan re-runs the §3.1/§3.2 probe harness against the merged tree and confirms the two tables are unchanged. If any row has moved, the design is re-derived before implementation, not after.

5. The merge in step 1 moves `git merge-base origin/main HEAD`, so the review-round corpus rows already written under `docs/review-rounds/fix/premisescan-import-edges/` for the pre-merge base sha will sit beside a second file keyed on the post-merge one. That is the corpus's intended behaviour, not drift — round counts are per merge-base by design — but the graduation task must read BOTH files rather than assuming one, and any filing the arc owes is written against the base sha whose rows triggered it.

At the time of writing (2026-08-16 14:33 CDT) #827 is `OPEN` / `UNSTABLE` with `mutation-harness` still running.
