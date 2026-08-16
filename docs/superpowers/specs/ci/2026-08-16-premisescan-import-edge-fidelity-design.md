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

**PROBE DOMAIN.** `tests/mutation/source/registry.ts`'s enrolled `suitePaths` and every in-repo module transitively reachable from them — **31 suites / 90 in-repo modules once PR #827 lands**, which is the domain at implementation time (§3.3) — that closure is the classifier's entire live domain, since `tests/mutation/_metaPremiseContract.test.ts:181` derives the scanned set from `GUARD_SURFACES.flatMap((s) => s.suitePaths)`. The near-domain, from which the registry's next enrolment is drawn, is `git ls-files tests` plus its in-repo closure (2,326 seeds, 3,221 modules; §3.4). An admissible probe is an input from one of those two sets, or one ordinary edit from such an input — swapping `import { x }` for `import * as ns`, hoisting a helper into a barrel, renaming a default. A constructed module graph outside both sets files to §4 without a round.

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
7. **Zero live instances is not a reason to descope.** §3.3 measures zero occurrences of every repaired form inside the classifier's current domain, and that is the *point*: the repair is verdict-neutral today (AC-1) and exists so that the ordinary refactor which introduces the first instance does not silently blind the guard. The near-domain already holds 22 in-repo namespace imports, 40 in-repo default imports, and 117 named re-export specifiers across 41 statements plus one `export *` (§3.4 states both grains, because a specifier count is not reproducible against a statement count), any of which enters the live domain the day its suite is enrolled.
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

Half 1 is not "namespace edges + default names + re-export following". It is one wrong function. Replace the local-declaration lookup with an **export resolver**, and — because round-1 review found the reason channel dropped at two of its three call sites — make the traversal's return type carry its reasons instead of collapsing to a scalar:

```
type ExportResolution =
  | { kind: "extent";       nodes: ts.Node[] }              // resolved here
  | { kind: "forward";      spec: string; exportName: str } // follow to another module
  | { kind: "data" }                                        // a data file: pure (§2.4)
  | { kind: "noSuchExport" }                                // the module declares no such name
  | { kind: "unresolvable"; reason: string };               // -> unclassifiable

function resolveExport(
  facts: ModuleFacts,
  exportName: string,
  active: Set<string>,                 // modules on the CURRENT path — cycle detection (§2.5)
  done: Map<string, ExportResolution>, // completed pairs — diamond reuse (§2.5)
): ExportResolution;

// The traversal returns reasons, never a bare verdict (§2.6).
type Reach = { verdict: Verdict; reasons: string[] };
function reaches(start: ts.Node, home: ModuleFacts, homePath: string): Reach;
```

The traversal asks for an **export name**, and the importer's local name never crosses a module boundary:

| import form | export name requested |
| --- | --- |
| `import { x } from "m"` | `x` |
| `import { x as y } from "m"` | `x` (shipped: the named-import branch of `moduleFacts` records `imported: e.propertyName ? e.propertyName.text : e.name.text`) |
| `import d from "m"` | `default` |
| `import * as ns from "m"`, reference `ns.x` or `ns["x"]` | `x` |
| `const ns = await import("m")`, reference `ns.x` | `x` (§2.3) |

The change is (i) a default import records `imported: "default"`, (ii) a namespace binding — static or dynamic — is marked as such, (iii) `moduleScopeExtent` becomes `resolveExport`, (iv) `reaches` returns `Reach`, and (v) the traversal's dedup identity gains the member for namespace bindings (§2.3).

**`noSuchExport` is a distinct answer from `unresolvable`.** `unresolvable` means "I recognize a construct and cannot follow it" and reports. `noSuchExport` means "this module declares no export by that name" — what a `export *` fan-out branch that does not carry the name legitimately produces, and what a type-only import produces once types are filtered. On a *star fan-out branch* it is a benign miss and the walk continues. On a **direct** request — `import { x } from "m"` where `m` exports no `x` — it resolves to pure rather than reporting, because a guard is not a type checker and inventing a diagnostic there would fire on every mid-edit tree.

**The default-import defect is currently masked by coincidence.** §3.1 measures `import spawnHelper from "./helper"` as `environment-touching` and `import runIt from "./helper"` — same module, same default export — as `environment-free`. The first passes only because the local name happens to equal a module-scope declaration's name. No repair may be validated by the same-name case alone; AC-4 uses the renamed form, and AC-4b uses a renamed default CLASS, which §3.9 measures free today and which a default-function fixture does not exercise.

### §2.2 Export accept-set (keyed on AST form, not on spelling)

The resolver **accepts** exactly these. This is an allowlist: a form absent from the table is `unresolvable`, never silently absent.

**Resolution order is part of the contract.** A module may hold a non-exported local `spawnHelper` *and* `export { spawnHelper } from "./helper"` — legal TypeScript, measured `environment-free` today (§3.7 probe B8). An `extents`-first resolver would answer with the local and preserve the silent free through the barrel, which is §0's substitution wearing a new name. So **the export map is consulted FIRST and `extents` is never consulted on its own**; `extents` is reached only through an E1 or E2 entry that has already established the name is exported.

| # | AST form | source | resolves to |
| --- | --- | --- | --- |
| E1 | one of exactly four declaration kinds carrying an `export` modifier — `VariableStatement` (every identifier its declaration list binds, including through object and array binding patterns and multiple declarators), `FunctionDeclaration`, `ClassDeclaration`, `EnumDeclaration` | local | `extent` — the nodes registered for that name at module scope |
| E2 | `ExportDeclaration`, no `moduleSpecifier`, `NamedExports` (`export { x }`, `export { x as y }`) | local **or** forwarded | the EXPORTED name is `name`; the LOCAL name is `propertyName ?? name` — the mirror of an import specifier, and the easiest thing here to get backwards. Resolves to `extent` when that local name is **a module-scope declaration of one of the four REGISTERED kinds — an `export` modifier is NOT required and must not be tested for** (see below); to `forward` when it is a NON-namespace entry in `facts.imports`; and to `unresolvable` when it is a NAMESPACE binding (see below) |
| E3 | `ExportAssignment` with `isExportEquals: false` (`export default <expr>`) | local | `extent` = the expression |
| E4 | declaration carrying both `export` and `default` modifiers — function or class, named or anonymous | local | `extent` = the declaration |
| E5 | `ExportDeclaration` with `moduleSpecifier` + `NamedExports` (`export { x } from`, `export { x as y } from`, `export { default as x } from`, `export { x as default } from`) | forwarded | `forward` to `(spec, propertyName ?? name)` |
| E6 | `ExportDeclaration` with `moduleSpecifier`, no clause (`export * from`) | forwarded | `forward` to each star target in turn; **`default` is never forwarded by a star export** (ES semantics) |

**E2 over a NAMESPACE binding is reported, not forwarded.** `import * as helpers from "./helper"; export { helpers };` exports the namespace OBJECT, not an export of `./helper` named `helpers`. Forwarding it asks the target for a name it almost never has, gets `noSuchExport`, and — because a direct `noSuchExport` is pure — a downstream `helpers.spawnHelper()` stays silently `environment-free`. Measured free today (§3.7). The class covers `export { ns }`, `export { ns as alias }` and `export { ns as default }`. Population: **0** repo-wide, so reporting it is the narrowing choice at zero cost, and it keeps E2 consistent with `export * as ns from`, which §2.2 already declines.

**E2's local branch tests REGISTRATION, not export-ness — and a round-2 draft had it testing the wrong one.** E1 is defined as a declaration carrying an `export` modifier, so "resolves to `extent` when that local name is an E1 declaration" makes the commonest E2 shape unresolvable:

```ts
const x = …;      // no export modifier — not an E1 declaration
export { x };     // …yet AC-5 requires this branch to resolve, and §3.9 measures it touching TODAY
```

Read literally, the round-2 wording reported that as `unresolvable`; read as AC-5 requires, it resolves. The two cannot both hold, and the normative rule is the one that must be unambiguous. So E2's local branch asks only **"does this name have a module-scope extent registered under one of the four kinds?"** — the same registration test E1 relies on, minus the modifier. This is not a widening: an `export` modifier is *sufficient* for a name to be exported, never *necessary*, because E2 is itself the construct that exports it.

**E1's predicate is the four registered declaration kinds, not "carries an `export` modifier".** `moduleFacts` registers extents for exactly `VariableDeclaration`, `FunctionDeclaration`, `ClassDeclaration` and `EnumDeclaration`; anything else with an `export` modifier has no extent to return, so a predicate written as "carries an `export` modifier" resolves it to an EMPTY extent and passes it as free. `export namespace NS { … }` is the measured instance (§3.7 probe B9), population 0 repo-wide. Narrowing the predicate to the four kinds sends it to `unresolvable` instead. **All four kinds must stay** — §3.9 measures an exported class, an exported enum and a destructured `export const` each `environment-touching` today, and the enrolled closure itself contains exported classes (`tests/mutation/source/runner.ts`, `tests/mutation/source/oracle.ts`), so dropping a kind is a live regression that no `one fixture per row` criterion would catch. AC-5 therefore pins each kind separately.

**`export const` carries its modifiers on the `VariableStatement`, not on the `VariableDeclaration`** (§3.7). E1 reads the modifier from the statement and maps it to every identifier its declaration list binds. Read literally off the `VariableDeclaration`, E1 misses the commonest exported form in the repository (971 exported variable statements).

Deliberately **not** accepted, each reporting `unresolvable` with its own reason string: `export * as ns from` (`NamespaceExport`, 0 repo-wide); `export = <expr>` (`ExportAssignment` with `isExportEquals`, 0 repo-wide); `export namespace` / `export module` (0 repo-wide); E2 over a namespace binding (0 repo-wide); and any other export syntax, reported with the node's kind name. A **type-only export** (`export type { … }`, or `isTypeOnly` on the declaration or specifier) is pure rather than reported: a type reaches nothing at runtime, exactly as `isReferenceIdentifier` and `isInTypePosition` already decide for references.

**Ambiguity under multiple star exports.** If a name is sought through several `export * from` targets, every target is followed; a branch answering `noSuchExport` is a benign miss and the walk continues; the first branch yielding a provenance wins. AC-5b is its fixture — without one, this sentence is unpinned prose.

### §2.3 Namespace bindings resolve member-precisely, and the traversal identity includes the member

A namespace binding is marked on the EXISTING import binding rather than introduced as a fourth `Binding` kind: `{ kind: "import"; scope; spec; imported; namespace: true }`. A new `kind` would have to be handled at every site dispatching on `binding.kind` — `reaches`, `extentIsProvenance`, `bindingKey` — and a missed site falls through to `environment-free`.

**But one of those sites does need changing, and round-1 review found it: `bindingKey`.** The traversal dedups by the BINDING a reference resolves to — `${name}@${kind}@${scope.kind}:${scope.pos}` — and skips a binding it has already seen. For an ordinary import that is correct: the binding denotes one thing. **For a namespace it is not**: `ns.pureOne()` and `ns.spawner()` resolve the SAME binding to DIFFERENT exports. With a member-blind key, resolving the pure member first marks the namespace seen and the spawning member is never visited — a silent `environment-free` whose direction depends on source order, which is precisely the defect class §0 describes. So:

> **A namespace reference's dedup identity is `(binding, resolved member)`, not `(binding)`.** Every other binding kind keeps the shipped key.

This applies to both spellings and both accepted access forms. AC-2c is its fixture, in both orders, because a member-blind key fails in exactly one of them depending on which reference the walk meets first.

Both spellings bind the same way:

- **static** — `import * as ns from "m"`, recorded by the static-import walk.
- **dynamic** — `const ns = await import("m")` with a string-literal specifier, recorded by `bindPattern`'s identifier branch. That branch currently records `imported: name.text`, the LOCAL name — the same substitution §0 half 1(a) names, in the one place the round-1 draft declared out of scope. Probe §3.5: `const ns = await import(lit); ns.spawnHelper()` is `environment-free` today, while `tests/scripts/ledgerClaimsCheck.test.ts` already writes `await import("@/scripts/lib/ledger-git")` at three sites in destructured form, saved only by `isProvenanceModule`. Namespace-binding one of those is a single ordinary edit.

A reference to a namespace binding is resolved by its **use position**, and exactly two positions are accepted: `ns.member` (`PropertyAccessExpression` whose `expression` is the reference) and `ns["member"]` (`ElementAccessExpression` with a string-literal argument — mirroring the shipped `process[...]` rule, whose branch treats only a *non*-literal argument as unresolvable).

**Every other use of a namespace binding reports `unclassifiable`**, with the local name and the module in the reason: `Object.entries(ns)`, `vi.spyOn(ns, "f")`, `"k" in ns`, `ns as Record<string, unknown>`, `const { a } = ns`, and passing `ns` as an argument. Measured cost: 0 in the live domain, 41 in the near-domain across 10 files (§4 limit 3).

**Order matters and is preserved.** `isProvenanceModule(imported.spec)` is checked inside `reaches` **before** any member resolution, so `import * as cp from "node:child_process"` stays `environment-touching` whatever member is used. The same precedence applies inside `extentIsProvenance`, whose identifier branch tests `binding.kind === "import" && isProvenanceModule(binding.spec)`; because a namespace keeps `kind: "import"`, that test needs no edit.

### §2.4 What the resolver lands on: three answers, and no silent fourth

`resolveSpecifier` returns the first of `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `base` that exists. **This arc does not change candidate generation** — that is existing behaviour and widening it is recognizer growth on an axis with no measured defect. What this arc fixes is what happens to what the resolver DOES return, which today is "parse it as TypeScript, whatever it is". Three answers, closed:

1. **Language module → analyzed.** `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`, `.jsx`. `.jsx` is in the set because it is analyzed TODAY — §3.9 measures an explicit `.jsx` import as `environment-touching` — and 6 are tracked; omitting it would make this repair *introduce* a silent free. `.mts` (4 tracked) and `.js` (4) are likewise live.
2. **Data file → pure**, exactly like a bare specifier (L-2). **`.json` only** (20 tracked). Those files ARE parsed as TypeScript today: §3.6 measures a `.json` payload containing TypeScript that spawns as `environment-touching`. Only the inertness of real JSON keeps today's behaviour harmless — and real JSON *is* inert, which is what makes the pure answer safe here and unsafe for `.mdx`.

   **`.mdx` is NOT data, and a round-2 draft had it here.** MDX is executable in this repository: `next.config.ts:54` declares `pageExtensions: ["ts", "tsx", "mdx"]`, `next.config.ts:17-30` wraps the config in `createMDX`, and `vitest.config.ts` compiles MDX with `@mdx-js/rollup`. An `.mdx` module compiles to an ESM module that carries imports and evaluates expressions, so classifying it pure is a **silent free** — the exact failure this arc exists to close, introduced by its own repair, and the same shape as the `.jsx` finding of round 1. `.mdx` therefore falls to answer 3 and is REPORTED. Population: **31 `.mdx` import edges across 14 files in the near-domain, 0 in the live domain** (§3.11), so AC-1 is preserved and the cost is an explicit `// no-premise:` the day one of those 14 suites is enrolled (§4 limit 13).
3. **Anything else → `unresolvable`, reported.** `.mdx` (16 tracked) is the measured member of this class, per answer 2's note. Including a DIRECTORY: `resolveSpecifier`'s bare-`base` candidate can name one — an ordinary rename of a directory's index file from a `.ts` extension to a `.tsx` one is enough — and §3.9 measures that case THROWING `EISDIR` today, aborting the whole run rather than reporting. The extension test therefore runs BEFORE the read, and an unrecognized shape is reported rather than purified.

**The three-way split is closed over what the corpus actually imports.** Every in-repo import edge from `tests/**` resolves to one of exactly five extensions — `.ts`, `.tsx`, `.mjs`, `.json`, `.mdx` (§3.6) — so the split is `{.ts, .tsx, .mjs}` analyzed, `{.json}` pure, `{.mdx}` reported, with every unlisted shape falling to answer 3. That is a derived cover rather than a list of extensions someone thought of, and it is the discriminator this arc pins: answer 2 is the only one that can produce a silent free, so it holds exactly the one extension whose inertness is a property of the format rather than of the current file contents.

The third answer is what keeps this a three-way split rather than a growing list. A future extension nobody has thought of lands in it and is loud; it does not silently become data. **What is NOT fixed, and is stated as the limit it is (§4 limit 5):** an extensionless specifier for a `.mjs`/`.js`/`.mts` module does not resolve at all — `resolveSpecifier` never generates that candidate — so it stays a bare-specifier miss and is pure by L-2, measured `environment-free` (§3.9). Fixing it means widening candidate generation, which is the ratchet direction; it is filed rather than built.

### §2.5 Termination: an active path is not a completed one

Forward-following needs TWO structures, and collapsing them into one visited set is why the round-1 draft could not tell a cycle from a diamond:

- **`active`** — the `(module, exportName)` pairs on the CURRENT resolution path. Re-entering one is a back edge, and that is a genuine cycle: it reports `unresolvable` with reason `re-export cycle`.
- **`done`** — pairs whose resolution has COMPLETED, with their answers. Re-reaching one is a diamond: the memoized answer is reused and the walk continues.

A single set cannot distinguish them. The round-1 draft said "a repeat contributes nothing" while also saying "only a genuine cycle reports", and those are inconsistent: treating every repeat as a cycle falsely reports the ordinary diamond, and ignoring every repeat lets a true cycle fall through to `noSuchExport` purity.

**The diamond fixture must have a PURE shared target, or it never exercises the repeat.** §3.9 measures the round-1 draft's own shape: with a touching target, the first branch short-circuits on provenance and the second branch never reaches the shared module, so the alleged foil proves nothing. AC-10's diamond is therefore pure at the shared module, with a separate touching-diamond case for the short-circuit path.

There is no depth cap and none is wanted: a bound expressed as a NUMBER is the shape AGENTS.md's repair-economy rule says the next reviewer will find. Termination comes from the finite pair set.

### §2.6 The traversal carries its reasons, at every call site

`reaches` today returns a scalar `Verdict` and owns a reason channel — `unresolved: string[]` — that only one of its callers can observe, and that channel is dead in practice: it is populated at exactly one site, `unparseable in-repo module`, which §3.8 probes to be unreachable. Half 2 is that channel becoming real, and reaching every caller.

1. **`reaches` returns `Reach = { verdict, reasons }`** (§2.1).
2. **The two `unclassifiableWithin` rules are evaluated on each node the traversal visits**, in the facts of the module that node belongs to, and their reasons are pushed into `reasons` with the module named. **The path names the module the construct was FOUND in, never the module being visited from.** For a construct met inside a helper's own file those coincide; for an `unresolvable` produced by `resolveExport` they do not — an unfollowable re-export is a defect of the BARREL, and naming the importing test file would send the reader to the wrong file.
3. **Every caller merges reasons.** `classifyTests` calls `reaches` twice — once on the test's own call expression, once per hook — and the hook loop tests the result for a single value (`=== "environment-touching"`), discarding everything else. Probe §3.5 rows C1-C3 put each construct in a `beforeEach` body, a `beforeAll` body and a `describe.each` producer: all three classify `environment-free`, while the same construct in the test's own body classifies `unclassifiable`.
4. **Hooks declared at the FILE's top level are collected too, and today they are not collected at all.** The same defect one level further out, and worse — it loses PROVENANCE, not just reasons. `classifyTests` starts its walk with an empty hook list (`walk(facts.sf, [])`) and only adds hooks when it meets a `describe`, so a file whose `beforeEach` sits at top level has no hooks attached to any test in it. Measured (§3.5):

```
TOP-LEVEL beforeEach -> spawnHelper()   ->  environment-free      <- silent free, PROVENANCE
SAME, wrapped in describe               ->  environment-touching
TOP-LEVEL beforeAll  -> import(nonlit)  ->  environment-free
TOP-LEVEL beforeEach, pure (the foil)   ->  environment-free
```

**Six of the 31 enrolled suites carry top-level hooks** — `tests/docs/_metaReviewRoundEconomy.test.ts`, `tests/mutation/browser/mutate.test.ts`, `tests/mutation/browser/registry.test.ts`, `tests/mutation/source/premiseScan.test.ts`, `tests/scripts/ledgerClaimsCheck.test.ts`, `tests/scripts/ledgerGitSpawnSeam.test.ts` — so this is inside the live domain. **Every one of those six bodies is cleanup-or-setup only** — `rmSync`, `mkdtempSync`, `writeFileSync`, `vi.unstubAllEnvs()` — and `ENVIRONMENT_SOURCES.modules` is exactly `["node:child_process", "scripts/lib/ledger-git"]` with globals `["process.env"]` (`premiseScan.ts:29-34`), so `node:fs` and `node:os` are not provenance and **attaching these hooks moves no declared count** (§3.11). That is what makes this repair compatible with AC-1; it is a measurement, not an expectation. Vitest applies a top-level hook to every test in the file, so attaching it to all of them is the CORRECT reading rather than an over-reach.

**The collection at the seed must be NON-RECURSIVE, and a round-2 draft calling it "one line at the walk's seed" was wrong in the false-positive direction.** `hookBodies` (`premiseScan.ts:821-835`) walks its whole argument with `ts.forEachChild`, so seeding the walk with a recursive collection over the `SourceFile` attaches EVERY hook in the file — including one nested three `describe`s deep — to EVERY test in it. That is a false positive, the direction AC-10b exists to prevent, and §0's rule that a repair trading a false negative for a false positive is not a repair. So:

> **The seed collects only hook calls that are direct top-level statements of the `SourceFile`** — a hook lexically inside any `describe` is collected by that `describe`'s existing branch and by nothing else. All four registrar names participate (`beforeEach`, `beforeAll`, `afterEach`, `afterAll`), matching the shipped regex at `premiseScan.ts:827`; §3.11 measures a top-level `afterAll` reaching provenance as `environment-free` today, so naming only the two `before*` forms would leave half the defect live.

AC-12b is the isolation fixture, and it is required: AC-11's pure-hook foil stays green under the recursive seed and cannot discriminate it.

Item 3 is one ordinary edit from the live corpus: `tests/parser/_metaTransformSitesWalker.test.ts` declares `scanFiles()`, whose body holds a non-literal `import()`, and calls it from six separate `it` bodies. Hoisting it into a `beforeAll` — the exact refactor §0 records as already performed once on `phantomGapExecuted.test.ts` — moves it into the discarded path.

`unclassifiableWithin` keeps its existing own-extent call site and precedence untouched; the propagated path is additive. A construct in the test's own body is seen twice — once by each path — so reasons are de-duplicated before they reach `detail`.

### §2.7 Verdict lattice, stated once

For the test's **own extent** (unchanged, shipped as the `if (ownUnresolved.length > 0) verdict = "unclassifiable";` line in `classifyTests`):

> `unclassifiable` > `environment-touching` > `environment-free`

For everything reached **through the traversal — from the test's own extent, from any hook whether nested or top-level, or from a `describe.each` producer, identically**:

> `environment-touching` > `unclassifiable` > `environment-free`

Both branches are loud; the consequence bound quantifies over the FREE direction only, and neither can produce a silent free. §4 limit 7 records the alternative to the asymmetry and the one-line change that would adopt it.

### §2.8 What does not change

The declaration-reference fixed point, scope-keyed extents, parameter shadows, the write pass, `ENVIRONMENT_SOURCES`, the premise/exemption detection, `.each` associated-placement detection, `resolveSpecifier`'s candidate generation (§4 limit 5), the `ScriptKind.TS` parse of every module (§4 limit 9), and every declared `EXPECTED_ENV_TOUCHING` number. This arc edits the cross-module lookup, the namespace marking on import bindings and the namespace dedup identity, `reaches`'s return type and its three hook/extent call sites, the walk's hook seed (**non-recursively — `hookBodies` itself is NOT changed**, §2.6 item 4 and §4 limit 14), and the `unresolved` channel — nothing else.

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

The entry's five-row table is reproduced exactly (`direct` touching; `named_alias` now repaired; `namespace`, `default_renamed`, `reexport` free) and extended by nine further rows. `H1 local reexport` is the row that fixes the derivation: a barrel doing `import { spawnHelper } from "./helper"; export { spawnHelper };` uses no re-export *syntax* at all and still loses the edge, which is what shows the defect is the extents-only lookup rather than any list of export spellings.

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

### §3.3b Accept-set completeness — every live edge still resolves

§3.3 shows the repaired forms do not occur, so no verdict moves. That is necessary and not sufficient: the resolver is also new for the forms that DO occur, and a name it fails to find answers `noSuchExport`, which is PURE. A silent demotion of a currently-resolving edge would therefore move no count and report nothing — the exact shape this arc exists to close, reintroduced by its own repair.

So the accept-set was checked against the corpus directly. **The round-2 harness did not perform the check it claimed**, and round-2 review was right to say so: it computed a module's exported names with a model that diverged from §2.2 in eight ways — it recorded E5 forwards without following them to the target, accepted `export * as ns from` and `export =` which §2.2 declines, added `export namespace`, interfaces and type aliases as VALUE exports, recorded both `default` and `f` for `export default function f()`, never checked namespace member edges at all, and seeded and filtered on `.ts`/`.tsx` only, omitting `.jsx`. Under that model a *broken* E5 answers "resolves", so `0 MISSES` could not establish the claim below and could conceal exactly the silent `noSuchExport` demotion this section exists to exclude.

The harness was rewritten to implement `resolveExport(facts, exportName, active, done)` as §2.2 E1-E6, §2.4's three-way split and §2.5's active/done pair actually specify, and to classify every VALUE edge — named, default, **and `ns.member` / `ns["member"]`** — into the four answers. Method and full source: probe record §Method — probe 4.

```
live domain (post-#827 registry):  90 modules,   230 value import edges checked
  extent 230 · data 0 · pure-bare 0 · noSuchExport 0 · unresolvable 0

near-domain (git ls-files tests): 3,221 modules, 9,536 value import edges checked
  extent 9,499 · data 0 · pure-bare 37 · noSuchExport 0 · unresolvable 0
```

The near-domain module count is **3,221, not the 3,207 a round-2 draft reported** — the difference is the `.jsx`/`.mjs` seeds the old seed filter dropped — and the edge count rises from 9,381 to 9,536 because namespace member edges are now checked. The 37 `pure-bare` are E2/E5 branches forwarding to a bare specifier, pure by L-2.

**Every live edge in the repository's test closure resolves under E1-E6, with zero `noSuchExport` misses at either scope.** That is what makes §2.2 a derived cover rather than an enumeration: it is not a list of forms someone thought of, it is a rule checked against every edge the corpus actually contains, by a resolver that implements the rule rather than approximating it. It is also the sharper half of AC-1's argument — the repair leaves the corpus alone not merely because the new forms are absent, but because the resolver still finds everything the old lookup found.

### §3.4 Population of the near-domain — why the repair is worth shipping

Same walk seeded from `git ls-files tests` (2,326 seeds, 3,221 in-repo modules reached — the seed filter takes the full language set, not the `.ts`/`.tsx` subset a round-1 draft used; probe record §145). The last two rows come from a second walk whose closure also follows `export … from` and literal dynamic-import edges and therefore reaches 3,255 modules from the same seeds. **Import rows are per-specifier; export rows carry BOTH grains**, because round-1 review could not reproduce a bare "117" — `export { a, b, c } from "./m"` is one statement and three specifiers, and the two counts differ by nearly threefold here. The export rows are measured repo-wide over every tracked `.ts`/`.tsx` (3,271 files), a superset of this closure, so they reproduce independently of the seed set:

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
TOP-LEVEL beforeEach -> spawnHelper()                       ->  environment-free   <- silent free, PROVENANCE
SAME hook, wrapped in describe                              ->  environment-touching
TOP-LEVEL beforeAll -> import(non-literal)                  ->  environment-free
TOP-LEVEL beforeEach, pure body (the foil)                  ->  environment-free
```

The four TOP-LEVEL rows are §2.6 item 4, and they are the arc's only PROVENANCE silent free: `classifyTests` seeds its walk with an empty hook list and only adds hooks at a `describe`, so a file whose hooks sit at top level has none attached to any test. Six of the 31 enrolled suites are shaped that way. C1-C3 are §2.6 item 3: `classifyTests` tests the hook `reaches` result for one value only, so every reason reached through a hook or a `describe.each` producer is discarded. C5 and C6 are the controls that make those rows discriminating — the same construct in the test's own body DOES report, and the hook path DOES carry provenance, so what is lost is precisely the reason channel and nothing else. DYN-NS is §2.3: the dynamic namespace spelling is silently free while its destructured sibling is correctly touching.

### §3.6 Non-language import targets

In-repo import edges from `tests/**`, by resolved extension: `.ts` 4,237 · `.tsx` 677 · `.mjs` 6 · `.json` 5 · `.mdx` 2. The `.json` and `.mdx` targets are the inputs §2.4 exists for, and they are ANALYZED today rather than skipped:

```
PREMISE: .json payload is TypeScript reaching node:child_process  ->  environment-touching
PREMISE: .mdx  payload is TypeScript reaching node:child_process  ->  environment-touching
a .mjs target reaching node:child_process                         ->  environment-touching
a .json target holding real JSON                                  ->  environment-free
```

**The `.mdx` row is the premise of AC-9d, not of AC-9.** It shows the format is analyzed today; §3.11 shows it is genuinely EXECUTABLE here, which together are why §2.4 reports it rather than purifying it. The first two rows are what make §2.4 a real mechanism and AC-9 a real criterion: `resolveSpecifier`'s bare-`base` candidate resolves those files, `moduleFacts` runs the TypeScript parser over them, and only the inertness of actual JSON keeps today's behaviour harmless. The third row is AC-9b's premise — `.mjs` must stay analyzed. The fourth is why a fixture holding real JSON cannot discriminate. `scripts/lib/phantomGapExecuted.mjs` is reached from the enrolled `tests/ci/phantomGapExecuted.test.ts` by a NAMED import, and that module exports exclusively in form E1 (`export const` / `export function`), so it must resolve after the repair exactly as it does today — AC-9b, whose foil is AC-9.

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

### §3.9 Round-2 review probes, independently reproduced

Cross-model review raised seven claims about current behaviour. Each was re-measured here against the same #827 tree rather than accepted as reported:

```
NS pure-then-spawn                             ->  environment-free
NS spawn-then-pure                             ->  environment-free
namespace import then local export { ns }      ->  environment-free
extensionless .mjs specifier                   ->  environment-free
explicit .jsx specifier                        ->  environment-touching   <- analyzed TODAY
directory target (index.tsx only)              ->  THREW: EISDIR
PURE diamond (the repeat actually happens)     ->  environment-free
E1 exported class (method spawns)              ->  environment-touching
E1 exported enum                               ->  environment-touching
E1 destructured export const                   ->  environment-touching
E4 renamed default CLASS                       ->  environment-free       <- an executable RED
local declaration then export list             ->  environment-touching
```

Five of these changed the design rather than confirming it:

1. **The namespace rows are the dedup hole (§2.3).** Both orders are free today, so the input is admissible; the design defect is that `bindingKey` identifies a binding without its member, and a member-blind key would resolve the pure member, mark the binding seen and skip the spawning one. AC-2c pins both orders.
2. **`export { ns }` over a namespace import (§2.2 E2)** would be forwarded as an ordinary name, answer `noSuchExport`, and stay pure. Population 0 repo-wide, so it is reported.
3. **Explicit `.jsx` is analyzed TODAY.** An allowlist omitting it would have made this repair *introduce* a silent free — the failure the arc exists to close, caused by the fix. `.jsx` (6 tracked), `.mts` (4) and `.js` (4) are all live and all in §2.4's language set.
4. **The directory target THROWS**, so §2.4's third answer has to report rather than purify, and the extension test has to precede the read. AC-9c pins it.
5. **The PURE diamond is the only shape where the repeat happens.** With a touching shared target the first branch short-circuits and the second never arrives, so the round-1 draft's AC-10 foil never exercised the case it existed for. §2.5 now separates an active path from a completed one, and AC-10's diamond is pure.

`E4 renamed default CLASS` is an executable RED that AC-4's default-FUNCTION fixture does not reach; AC-4b covers it. The class, enum and destructured-`const` rows are why E1's narrowed predicate must keep all four declaration kinds — the enrolled closure itself contains exported classes.

### §3.10 Existing coverage of the repaired forms

`tests/mutation/source/premiseScan.test.ts` on #827 (557 lines) has fixtures for two of the canonical spec's four unclassifiable forms — the cases named `a dynamic import whose specifier is not a literal` and `a computed member access on process`. There is **no fixture for an unfollowable re-export and none for an unparseable in-repo module**, so canonical **AC-8a** (`docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md:501`) **is satisfied 2/4** today. This arc closes the re-export form (AC-8) and leaves the unparseable form open and unreachable (§4 limit 8), taking AC-8a to 3 of 4. The suite's `namespace import` case uses `import * as cp from "node:child_process"` — a provenance module, so it is decided by `isProvenanceModule` before any member resolution and cannot fail for the reason §3.1 exposes. There is no assertion anywhere in that suite on the `detail` field, so every `detail` assertion this arc adds is new coverage.

### §3.11 Round-2 review probes, independently reproduced

Cross-model review round 2 raised five claims. Each was re-probed here against the same #827 tree before acceptance; all five reproduced, and all five are repaired.

**MDX is executable in this repository** (finding 1) — so §2.4 answer 2 could not hold it:

```
next.config.ts:54    pageExtensions: ["ts", "tsx", "mdx"]
next.config.ts:17-30 createMDX(...) wraps the config
vitest.config.ts     compiles MDX with @mdx-js/rollup
.mdx import edges from tests/**: 31 across 14 files;  enrolled: 0
```

The one enrolled suite that mentions `.mdx` — `tests/help/_metaUiLabelCrosswalk.test.ts` — reaches it by a **filename walk** (`walk(helpRoot, (n) => n.endsWith(".mdx"))`, `:59`), not an import edge, so moving `.mdx` to answer 3 leaves the live domain untouched and AC-1 intact.

**The hook seed must not recurse** (finding 3). `hookBodies` walks its argument with `ts.forEachChild` (`premiseScan.ts:821-835`), and the consequence is executable today:

```
A: sibling nested describes, hook only in A   ->  inA=touching, inB=TOUCHING   <- FALSE POSITIVE, pre-existing
B: top-level sibling describes, hook only in A->  inA=touching, inB=free       [correct]
C: TOP-LEVEL beforeEach reaching provenance   ->  environment-free             <- the silent free
D: TOP-LEVEL afterAll  reaching provenance    ->  environment-free             <- the ACs named only before*
E: top-level hook PURE, describe hook spawns  ->  inA=touching, inB=free       [the isolation foil]
```

Row A is a **pre-existing** false positive that this arc does not introduce and deliberately does not fix — repairing `hookBodies`'s recursion would move live verdicts and break AC-1's neutrality. It is filed as §4 limit 14. Row D is why §2.6 item 4 names all four registrars.

**Verdict-neutrality of the seed repair, measured rather than assumed.** All six enrolled suites carrying top-level hooks hold cleanup-or-setup bodies only (`rmSync`, `mkdtempSync`, `writeFileSync`, `vi.unstubAllEnvs()`), and `ENVIRONMENT_SOURCES` is `modules: ["node:child_process", "scripts/lib/ledger-git"]` / `globals: ["process.env"]` (`premiseScan.ts:29-34`). `node:fs` and `node:os` are not provenance, so no declared count moves.

**The E2 contradiction** (finding 4) is confirmed by §3.9's `local declaration then export list -> environment-touching`: the construct resolves today, and the round-2 wording would have reported it.

**The assignment-position dynamic import.** Not a review finding — surfaced by this round's own class sweep. `premiseScan.ts:634-637` carries a comment handing exactly this case to this backlog row: for `m = await import("./x")` in ASSIGNMENT rather than declaration position, the imported name is unknown. Population repo-wide: **0**. It is therefore filed as §4 limit 15 rather than designed for, because building a rule for zero measured instances is the widening direction §1.2(e) forbids.

## §4 Documented limits

1. **`export * as ns from "m"` is reported, not followed** (§2.2). An exported namespace would need a second namespace-valued binding kind for a form with zero occurrences repo-wide. Worst case: `unclassifiable` naming the module — loud, never a silent free.
2. **`export = <expr>` is reported, not followed** (§2.2). Zero occurrences repo-wide at the statement grain (§3.4).
3. **A namespace binding used anywhere other than `ns.member` or `ns["member"]` is reported** (§2.3). 0 sites in the live domain; **41 in the near-domain across 10 test files**, and the breakdown sums exactly: `tests/admin/showPageFeed.test.tsx` 11, `tests/admin/autoAppliedActions.test.ts` 9, `tests/admin/showFeedAcceptActions.test.ts` 8, `tests/admin/feedTelemetry.test.tsx` 6, `tests/parser/opsMetadataTokens.test.ts` 2, and one each in `tests/visibility/_metaDocumentedPredicateParity.test.ts`, `tests/sync/unexpectedParentLog.test.ts`, `tests/sync/attachWarningAnchors.test.ts`, `tests/messages/_metaCatalogCopyHygiene.test.ts` and `tests/appSettings/getActiveWatchedFolder.test.ts`. (A round-1 draft listed 8 files summing to 25 — a truncated probe display read as a total, which is why this breakdown is shown summing. A reviewer independently measured 42 across 11; the extra is `tests/help/_metaTimeHelpersRequireNow.test.ts:37`, `import * as ts from "typescript"` — a BARE specifier, pure by L-2 whatever the member precision, so correctly outside a limit about in-repo namespace imports.) The population is dominated by `vi.spyOn(ns, "name")` and `Object.entries(ns)`, where the member IS statically knowable from a string-literal argument, so the conservative report is genuinely conservative there; enrolling one of those ten suites costs an explicit `// no-premise:` per affected case. Recognizing `vi.spyOn` specifically is declined as a library-shaped special case (§1.2(e)).
4. **`export namespace` / `export module` is reported, not followed** (§2.2 E1 note). Population 0 repo-wide; probe B9 (§3.7) shows it silently free TODAY, and narrowing E1's predicate to the four registered declaration kinds is what makes it loud.
5. **An extensionless specifier for a `.mjs` / `.js` / `.mts` / `.cjs` / `.jsx` module does not resolve, and stays pure.** `resolveSpecifier` generates only `${base}.ts`, `${base}.tsx`, `${base}/index.ts` and the literal `base`, so an extensionless specifier never finds a sibling module whose extension is `.mjs` — measured `environment-free` (§3.9). **This arc deliberately does not widen candidate generation**: that is existing behaviour with no measured defect behind it, and adding extensions one at a time is exactly the same-axis ratchet §1.2(e) forbids. The consequence is a missed premise requirement, the conservative direction, and identical in kind to L-2. A specifier that DOES spell its extension resolves and is analyzed (§2.4).
6. **`export { ns }` where `ns` is a namespace import is reported, not forwarded** (§2.2 E2). Forwarding would ask the target for an export it does not have, and a direct `noSuchExport` is pure — a silent free. Population 0 repo-wide, so reporting costs nothing and keeps E2 consistent with the declined `export * as ns from`.
7. **A propagated `unclassifiable` loses to a proven `environment-touching`** (§2.7). The reader is told the louder of two true things, and the module with the unresolvable corner is not named in `detail` for that test. Promoting it is a one-line lattice change; it is fenced here because it costs `reaches`'s provenance short-circuit. **The evidence for that cost is a measurement of a DIFFERENT mechanism and is stated as such:** the comment above `scopeCache` records that an unmemoized SCOPE WALK turned a 1.3 s corpus pass into 5.5 s. Nobody has measured the short-circuit's absence. A round-1 draft cited the scope-walk figure as though it measured the short-circuit; it does not, and the asymmetry rests on §2.7's design argument plus AC-14's ratio bound rather than on that number.
8. **"Unparseable in-repo module" — canonical unclassifiable form 4 — remains UNREACHABLE, and this arc does not make it reachable.** Probed three ways (§3.8): `moduleFacts` returns `null` if and only if `!existsSync(path)`; `resolveSpecifier` returns only candidates for which `existsSync` was already true; and `ts.createSourceFile` neither throws nor returns null on garbage. So the `unresolved.push("unparseable in-repo module")` site is dead code today and stays dead. A round-1 draft claimed in §1.1 item 3 that this arc "makes forms 3 and 4 actually reachable"; **that claim was false for form 4 and is retracted.** Making it real would mean a new detection rule over `sf.parseDiagnostics`, recognizer growth on an axis with zero measured instances. **Task 7 Step 1 files it as `BL-PREMISESCAN-UNPARSEABLE-MODULE-UNREACHABLE`** — that row does not exist yet and this spec does not claim it does; canonical AC-8a stands at 3 of 4 after this arc rather than 4 of 4.
9. **Every module is parsed with `ts.ScriptKind.TS`, so `.tsx` and `.jsx` targets are mis-parsed.** `moduleFacts`'s `parse()` passes a fixed script kind. JSX syntax read as TypeScript yields a wrong tree, which can lose references and therefore under-report. Pre-existing, untouched here, and stated because §2.4 keeps `.jsx` in the analyzed set: keeping it preserves today's behaviour (an explicit `.jsx` import measures `environment-touching`, §3.9) rather than improving it. No enrolled suite is `.tsx` today. Fixing it is a one-line script-kind selection, deliberately out of an arc already at its scope.
10. **Block-grain scope is still function-grain** (predecessor spec §4 limit 1, inherited unchanged).
11. **`node_modules` remains pure (L-2); undetected forms remain undetected (L-8).** Neither is widened or narrowed here.
12. **Obfuscated import graphs are out of the fence** (§1). A computed re-export table, an `eval`, or a namespace laundered through an untyped indirection is not ordinary authoring; this arc makes no claim about them.

13. **`.mdx` is REPORTED, not analyzed and not pure** (§2.4). MDX is executable here (`next.config.ts:54`, `@mdx-js/rollup` in `vitest.config.ts`), so the pure answer would be a silent free; but parsing MDX with `ts.createSourceFile` yields a wrong tree, so the analyzed answer would be a wrong one. Reporting is the only honest third option, and it is the narrowing direction. Cost: **31 import edges across 14 near-domain files, 0 enrolled** (§3.11) — an explicit `// no-premise:` per affected case the day one of those suites is enrolled. Teaching the resolver to compile MDX is recognizer growth and is declined.
14. **A hook nested inside a `describe` already leaks to sibling nested `describe`s, and this arc does not fix it.** `hookBodies` collects recursively, so under a shared outer `describe` a spawning hook in branch A marks a pure test in sibling branch B `environment-touching` — probed as §3.11 row A. It is a FALSE POSITIVE and it is **pre-existing**: repairing it would move live verdicts and break AC-1's verdict-neutrality, which is this arc's headline constraint. This arc's own seed repair is non-recursive precisely so it does not widen the leak (§2.6 item 4). Filed as `BL-PREMISESCAN-NESTED-HOOK-SIBLING-LEAK` by Task 7 Step 1; that row does not exist yet and this spec does not claim it does.
15. **A dynamic `import()` in ASSIGNMENT position (`m = await import("./x")`) is not resolved member-precisely.** `premiseScan.ts:634-637` names this case and hands it to this backlog row; the binding clause registers only `const x = await import(…)`, so an assignment reaches the write pass with an extent that names nothing. For a PROVENANCE specifier it is still caught by `extentIsProvenance`; for an in-repo specifier the imported name is unknown. Population repo-wide: **0** (§3.11). Designing for zero measured instances is the widening direction §1.2(e) forbids, so it is filed rather than built.

### Dimensional Invariants

None. This arc introduces no rendered component, no fixed-dimension parent and no box-model change: the diff is scanner code, unit fixtures, registry rows and ledger prose. No file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*` or `DESIGN.md` is touched, so the invariant-8 UI definition is not triggered. If implementation contradicts this, that task adds the relationship here plus the real-browser assertion the writing-plans layout-dimensions rule requires.

### Transition Inventory

None. No visual state is added or changed — no `AnimatePresence`, no `exit`/`initial`/`animate` props, no conditional render change. If a task adds a visual state, the inventory gains its pairs first.

## §5 Meta-test / registry inventory

- **EXTENDS** `tests/mutation/source/premiseScan.test.ts` — new fixture groups for §2.2's accept-set (each E1 declaration kind separately, E2's three branches, E4's function and class forms, E5, E6, and every reported form), §2.3's namespace positions in both spellings plus the member-dedup ordering pair, §2.4's three answers, §2.5's cycle and its PURE diamond, and §2.6's propagation cells including nested hooks, top-level hooks and `describe.each` producers.
- **EXTENDS** `tests/mutation/_metaPremiseContract.test.ts` — comment only. **No `EXPECTED_ENV_TOUCHING` number changes** (AC-1).
- **EXTENDS** `tests/mutation/source/registry.ts` — the `premiseScan` row's `accepted` array. Two distinct operations, and conflating them is how a stale acceptance survives: rows whose reasoning still holds are RE-KEYED by re-deriving `siteId`s via `enumerateSites`; the `integer-literal` row accepted on the grounds that "`unresolved` is provably always empty" is **RETIRED**, because §2.6 makes that premise false.
- **EXTENDS** `tests/mutation/guardSurfaces.gate.test.ts` — `EXPECTED_LEDGER_KINDS.premiseScan` declares `{ equivalent: 3, "accepted-gap": 1 }` and is asserted with `toEqual`, so retiring a row reds it.
- **CREATES** no new meta-test. `_metaPremiseContract.test.ts` already walks the enrolled suites from the registry and already asserts the unclassifiable set is empty.
- **FILES three backlog rows** (Task 7 Step 1), none of which exists yet and none of which this spec claims exists: `BL-PREMISESCAN-UNPARSEABLE-MODULE-UNREACHABLE` (§4 limit 8), `BL-PREMISESCAN-NESTED-HOOK-SIBLING-LEAK` (§4 limit 14, carrying §3.11 row A as its probe), and `BL-PREMISESCAN-ASSIGNMENT-DYNAMIC-IMPORT` (§4 limit 15, population 0, filed with the `premiseScan.ts:634-637` comment that hands it here).
- No Supabase call site, no invariant-10 mutation surface (tooling and test code only), no advisory locks, no §12.4 catalog row, no migration, no UI surface.

## §6 Acceptance criteria

Each criterion names the failure mode it catches. Every positive fixture has a foil, so no assertion can pass by the classifier being a constant in either direction.

- **AC-1 — verdict-neutral on the live domain, mechanically.** `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` passes with every `EXPECTED_ENV_TOUCHING` value unchanged, AND the re-baseline check is a COMMAND: `git diff $(git merge-base origin/main HEAD) -- tests/mutation/_metaPremiseContract.test.ts | rg -q '^[-+].*: *[0-9]+,' && exit 1 || exit 0`. The merge-base is the base, not `origin/main`, which moves under a live arc. The command is itself proven by mutating one declared number and observing it fail. *Catches:* a repair that over-reaches and silently re-baselines the corpus it was supposed to leave alone — the suite alone passes after a re-baseline.
- **AC-2 — namespace member edges resolve.** `ns.spawner()` and `ns["spawner"]()` classify `environment-touching`.
- **AC-2b — a DYNAMIC namespace binding resolves.** `const ns = await import("./helper"); ns.spawner()` classifies `environment-touching`, with the destructured form as its foil (touching today). *Catches:* the `bindPattern` identifier branch, measured `environment-free` (§3.5).
- **AC-2c — the namespace dedup identity includes the member, in BOTH orders.** A test calling `ns.pureOne()` then `ns.spawner()` classifies `environment-touching`, and so does the reverse order. *Catches:* the member-blind `bindingKey` (§2.3) — with it, exactly one of the two orders resolves the pure member first, marks the binding seen and skips the spawning one, giving a silent `environment-free` that depends on source order. A single-order fixture cannot catch this; both are required and neither may be removed without the other.
- **AC-3 — namespace is member-precise, not module-wide.** A module exporting both `spawner` and `pureOne`; a test calling only `ns.pureOne()` classifies `environment-free`. *Catches:* the module-closure regression §1.1 item 2 fences. AC-2's foil.
- **AC-4 — a default export is named `default`.** `export default function spawnHelper(){…}` imported as `import runIt from …` classifies `environment-touching`, using the RENAMED form; the same-name form is a second case, never the only one.
- **AC-4b — a renamed default CLASS resolves.** `export default class { go(){…spawnSync…} }` imported as `import K from …` classifies `environment-touching`. *Catches:* an E4 branch measured `environment-free` today (§3.9) that AC-4's default-FUNCTION fixture does not exercise.
- **AC-5 — every accepted export form, by AST BRANCH rather than by table row.** E1 gets four separate fixtures — `export const` (including a destructured/multi-declarator case), `export function`, `export class` whose method spawns, `export enum` — because §3.9 measures class, enum and destructured-const each touching today and the enrolled closure itself contains exported classes, so dropping one kind is a live regression. E2 gets three — local declaration, local alias `export { x as y }`, and import-then-export. E4 gets function and class, named and anonymous. E5 gets `export { x } from`, `export { x as y } from`, `export { default as x } from`, `export { x as default } from`, and a 2-deep chain. E6 gets `export * from`. **The foil is a MIXED module, not a pure one:** a barrel re-exporting both a spawner and a pure name, with only the pure name imported, classifies `environment-free` — a pure-module foil cannot discriminate against a `forward` that falls back to the target's whole closure. *Catches:* an implementation that satisfies "one fixture per row" while omitting a branch, returns direct `noSuchExport`, and classifies pure. Mutation testing cannot discover a missing branch that has no fixture.
- **AC-5b — star-export ambiguity resolves the way §2.2 says.** Two `export * from` targets, the sought name in only one: `environment-touching`. Foil: the same shape with the name in neither, classifying `environment-free` rather than reporting.
- **AC-6 — AC-10b stays quiet.** `reportEnvelope`'s parameter `res` beside `main()`'s `const res = spawnSync(...)` classifies `environment-free` when imported directly.
- **AC-7 — AC-10b stays quiet through a namespace.** The same module as `import * as env from …; env.reportEnvelope({ ok: true })` classifies `environment-free`.
- **AC-8 — the reported forms are REPORTED.** An unfollowable re-export (a target that does not exist), `export * as ns from`, `export =`, `export namespace`, **`export { ns }` over a namespace import**, and a namespace in a non-member position each classify `unclassifiable` with a `detail` naming the construct and the module it was FOUND in (§2.6 item 2). *Catches:* the silent-free direction on every form §2.2 and §2.3 decline to model. This closes canonical AC-8a's re-export form; the fourth canonical form is out of scope and unreachable (§4 limit 8), so this arc takes AC-8a from 2 of 4 to 3 of 4 and says so rather than claiming 4.
- **AC-9 — data files stay pure, on a fixture that is RED today.** A test importing a `.json` file classifies `environment-free`, with the specifier spelling the `.json` extension AND the payload being TypeScript that reaches `node:child_process` — because that file is genuinely parsed as TypeScript today (§3.6 measures it `environment-touching`). A fixture holding real JSON is free before and after and proves nothing.
- **AC-9b — a `.mjs` target stays ANALYZED**, and so does an explicit `.jsx` target. Both classify `environment-touching`. *Catches:* an extension allowlist that over-reaches — the live `tests/ci/phantomGapExecuted.test.ts` → `scripts/lib/phantomGapExecuted.mjs` edge, and the `.jsx` case §3.9 measures touching today, which an allowlist omitting `.jsx` would silently regress to pure. AC-9's foil.
- **AC-9d — an `.mdx` target is REPORTED, not purified.** A test importing an `.mdx` module whose compiled body would reach the environment classifies `unclassifiable`, naming the specifier — with the SAME payload that AC-9 asserts is pure behind a `.json` extension, so the two differ in exactly the extension. *Catches:* the round-2 draft's `DATA = {.json, .mdx}`, which would have made this edge `environment-free` — a silent free introduced by this repair, on a format this repo executes (`next.config.ts:54`, §3.11). Its foil is AC-9: identical payload, `.json` extension, pure.
- **AC-9c — an unrecognized resolution shape is REPORTED, not purified and not thrown.** A directory reached through the bare-`base` candidate — one whose only index file carries a `.tsx` extension, which `resolveSpecifier` does not generate a candidate for — classifies `unclassifiable`, naming the specifier. *Catches:* both halves of §2.4 answer 3 — today that input THROWS `EISDIR` and aborts the run (§3.9), and a guard that merely moved the extension test before the read without reporting would convert the crash into a silent pure.
- **AC-10 — cycles terminate, and a completed diamond is not a cycle.** Two modules re-exporting a name from each other classify `unclassifiable` with reason `re-export cycle`. Its foil is a **PURE** diamond — a barrel star-exporting from two modules that both star-export from a third whose export is pure — classifying `environment-free` without reporting. **The shared target must be pure**, because §3.9 measures that with a TOUCHING target the first branch short-circuits on provenance and the second never reaches the shared module, so the repeat never happens and the foil proves nothing. A touching diamond is a third case, pinning the short-circuit. *Catches:* a single visited set, which cannot tell an active back-edge from a completed revisit (§2.5).
- **AC-10c — resolution order: an export beats a same-named local.** A module holding a non-exported local `spawnHelper` AND `export { spawnHelper } from "./helper"` classifies `environment-touching` (probe B8, §3.7).
- **AC-11 — the propagation cells report, from every position.** Module-scope helper × describe-scope helper × non-literal dynamic `import()` × computed `process` access, plus the cross-module cell, plus a `beforeEach` body, a `beforeAll` body, a `describe.each` producer, **and a TOP-LEVEL hook in each of the four registrar spellings** (`beforeEach`, `beforeAll`, `afterEach`, `afterAll` — §3.11 row D), each classify `unclassifiable` with `detail` naming the module holding the construct. Foils: the same helpers and hooks without the construct classify `environment-free`. *Catches:* §3.2 and §3.5 — the hook and producer paths, where `reaches`'s scalar return discarded every reason, and the top-level path, which had no hooks attached at all.
- **AC-12 — precedence is pinned in every direction, including through hooks.** Own extent + provable touch → `unclassifiable` (shipped); construct reached only through a helper + provable touch → `environment-touching`; construct reached only through a NESTED hook → `unclassifiable`; **a TOP-LEVEL hook reaching provenance → `environment-touching`**, which §3.5 measures `environment-free` today and is the arc's only PROVENANCE silent free. **All four registrars get this case separately — `beforeEach`, `beforeAll`, `afterEach`, `afterAll`** — because §3.11 row D measures a top-level `afterAll` free today and a fixture pair covering only the `before*` forms would leave half the defect live while reading as complete.
- **AC-12b — the top-level seed does not leak a nested hook, in either direction.** A file with a spawning `beforeEach` inside `describe A` and a pure test inside sibling `describe B`, both under a shared outer `describe`: the test in B must classify exactly as it does on the pre-repair tree. And a file with a PURE top-level hook plus a spawning hook inside `describe A` classifies B's test `environment-free`. *Catches:* the recursive seed — `hookBodies` walks with `ts.forEachChild` (`premiseScan.ts:821-835`), so a seed written as one recursive call attaches every hook in the file to every test in it, turning a pure sibling `environment-touching`. That is a FALSE POSITIVE, the direction §0 forbids trading into, and **AC-11's pure-hook foil stays green under it** — this criterion is the only one that discriminates. Its pre-existing form (row A, §3.11) is §4 limit 14 and is asserted at its CURRENT value so the criterion pins "this arc did not widen it" rather than silently ratifying it.
- **AC-13 — provenance modules keep their precedence.** `import * as cp from "node:child_process"; cp.spawnSync(…)` classifies `environment-touching`, and so does a namespace import of a provenance module whose member is never accessed.
- **AC-14 — performance stays inside budget, measured at the right grain, bounded by a COMMAND.** A script measures the `classifyTests` pass over the enrolled suites — NOT the vitest suite duration — reads the Task-0 baseline from a recorded file, and **exits non-zero** if the pass exceeds the contract's 30 s budget or exceeds **3×** the baseline. Both bounds are required: the ceiling alone admits 1.5 s → 29 s, and the documented scope-walk regression was 3.7×. The band is 3× rather than 2× because the measurement is an unwrapped `tsx` run on a box that runs many arcs concurrently, and a 2× band on a ~1.5 s figure measures scheduler noise; a regression of the kind this guards against is larger than the noise. Baseline and result are both recorded in the commit message. *Catches:* a suite-grain measurement, which hides a 3.7× scan regression inside a 20.7 s duration, and a reading instruction, which is what AC-1 was repaired to remove.
- **AC-15 — mutation gate, with the falsified acceptance retired rather than re-keyed.** `pnpm heavy pnpm mutation:guards` on `premiseScan` meets `scoreFloor: 0.95` with an empty unaccepted-survivor set. Rows whose reasoning survives are re-derived via `enumerateSites`; the `integer-literal` row accepted because "`unresolved` is provably always empty" is RETIRED, since §2.6 makes that premise false. `EXPECTED_LEDGER_KINDS.premiseScan` moves with it. *Catches:* an accepted-survivor ledger that survives the very change that falsifies its reasoning — re-keying preserves a line, never re-tests an argument.

## §7 Sequencing

**This arc's implementation is blocked on PR #827 merging.** That PR rewrites `moduleScopeExtent`'s surrounding code, lands the scope-aware extents this design builds on, and enrols `premiseScan` in the mutation registry. Two writers on one file is the hazard AGENTS.md's worktree invariant exists to prevent. So:

1. Spec and plan are authored against `origin/fix/scanner-scope-totality` (this document; every citation in §0-§2 is to that tree).
2. The implementation branch does **not** edit `tests/mutation/source/premiseScan.ts` until #827 is on `main`.
3. On merge: `git merge origin/main`, then re-verify every `premiseScan.ts` line citation in §0, §2.1-§2.7 and §4 before the first diff-review dispatch — line anchors are drafting-time locators and #827's merge will move them.
4. Task 1 of the plan re-runs the §3.1/§3.2 probe harness against the merged tree and confirms the two tables are unchanged. If any row has moved, the design is re-derived before implementation, not after.

5. The merge in step 1 moves `git merge-base origin/main HEAD`, so the review-round corpus rows already written under `docs/review-rounds/fix/premisescan-import-edges/` for the pre-merge base sha will sit beside a second file keyed on the post-merge one. That is the corpus's intended behaviour, not drift — round counts are per merge-base by design — but the graduation task must read BOTH files rather than assuming one, and any filing the arc owes is written against the base sha whose rows triggered it.

At the time of writing (2026-08-16 14:33 CDT) #827 is `OPEN` / `UNSTABLE` with `mutation-harness` still running.
