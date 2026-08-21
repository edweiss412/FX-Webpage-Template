# PLAN — BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION

Spec: `docs/superpowers/specs/ci/2026-08-21-destructive-guard-discovery-by-connection-design.md`.
Every section reference below is to that document unless it says otherwise. New surface:
`connectionCensus` (to be enrolled in `tests/mutation/source/registry.ts`), source
`tests/db/_connectionCensus.ts (new)`, deciding suite `tests/db/connectionCensus.test.ts (new)`, live
gate `tests/db/_metaConnectionCensusGuard.test.ts (new)`, dispositions
`tests/db/_connectionCensusDispositions.ts (new)`.

**Base:** `e5d1d723d69cbab88b7424e34256ebcde865dda1`. Line numbers below are BASE-stamped and the
SYMBOL is the durable identity. The four new files do not exist at BASE, so no task can cite a line
inside them; §4 states how their `red-target` citations are handled.

---

## 0. The three constraints that shape the task order

**Nothing this plan ships edits an enrolled surface.** `_destructiveFileAnalysis.ts`,
`_destructiveStatements.ts`, `_metaDestructiveDbTargetGuard.test.ts` and
`tests/paneCompaction/sendAuthScan.ts` are byte-identical to BASE at merge (spec AC-C10; §1.3 item
3). The two one-line exports this plan needs (`ACCEPTED_HOSTS`, `isGuardModule`) live in modules that
are NOT enrolled (`tests/db/_localDbUrl.ts`, `tests/db/_localDbUrlScan.ts` — neither appears in
`GUARD_SURFACES`, verified in §2), so no score is retired by this arc except its own.

**The score is measured ONCE, in `task:enrol-and-score`, after the last edit to the module, its
deciding suite, or anything the suite imports.** Rule 27 has no test-side exception. The
`GUARD SURFACE:` line of the round-1 diff brief carries that number; any later repair says `RETIRED`.

**The live gate cannot be its own red.** A meta-test over the live tree that is authored AFTER the
dispositions exist passes the moment it is written; one authored BEFORE them goes green by editing a
registry, which is a manufactured red (rule 170). So `task:live-census-gate` sits OUTSIDE the
red-contract region with a stated acceptance and a both-directions proof, and every BEHAVIOUR the
gate relies on is red-then-green earlier, in the deciding suite, on constructed sources.

---

## 1. Meta-test inventory

**Creates:** `tests/db/_metaConnectionCensusGuard.test.ts (new)` — the structural gate over the live
`tests/` tree (spec §5). **Creates** the deciding suite `tests/db/connectionCensus.test.ts (new)`,
whose assertions all run IN-PROCESS against constructed sources (rule 102: a subprocess assertion
cannot decide a branch).

**Extends:** `tests/mutation/source/registry.ts` (one row), `tests/mutation/source/expectedLedgerKinds.ts`
(one row), `tests/mutation/_metaPremiseContract.test.ts` (`EXPECTED_ENV_TOUCHING` gains the deciding
suite's row — the third declaration every enrolment owes, rule 100), `tests/db/_localDbUrl.ts` and
`tests/db/_localDbUrlScan.ts` (one `export` keyword each).

**Does NOT extend:** the destructive guard's three files; `.prettierignore` beyond the probe-output
fence the spec commit already added (the deciding suite's fixtures are inline template literals with
no syntax-sensitive spelling — every accepted class is decided by AST SHAPE, and prettier preserves
shape; if the implementer elects a fixture directory instead, it adds the fence in the same task).

**Advisory-lock topology:** N/A — no `pg_advisory*` surface. **Supabase call boundary:** N/A.
**DB layers:** N/A — no migration, RPC, CHECK or enum (the §7 peer row is FILED, not implemented).
**Flag lifecycle:** N/A. **Mutation surface observability (invariant 10):** N/A — no route handler,
no `"use server"` action. **Impeccable:** N/A — no UI surface.

---

## 2. Pre-draft verification pass (run, not described)

Run at BASE in the arc worktree, 2026-08-21:

```
tests/db/_connectionCensus.ts                         UNTRACKED  (created by task:acquisition-and-sites)
tests/db/_connectionCensusDispositions.ts             UNTRACKED  (created by task:dispositions-both-directions)
tests/db/connectionCensus.test.ts                     UNTRACKED  (created by task:acquisition-and-sites)
tests/db/_metaConnectionCensusGuard.test.ts           UNTRACKED  (created by task:live-census-gate)
tests/db/_localDbUrl.ts                               TRACKED    `const ACCEPTED_HOSTS` at :21, not exported
tests/db/_localDbUrlScan.ts                           TRACKED    `function isGuardModule` at :40, not exported
tests/db/_destructiveStatements.ts                    TRACKED    exports DESTRUCTIVE_STATEMENT_PATTERNS, GUARD_OWN_FILES
tests/_shared/premise.ts                              TRACKED    exports premise, premiseHolds
tests/_shared/stripComments.ts                        TRACKED    exports stripCommentsForFile, stripSqlComments
tests/mutation/source/registry.ts                     TRACKED    GUARD_SURFACES; no row mentions _localDbUrl or _localDbUrlScan
tests/mutation/source/expectedLedgerKinds.ts          TRACKED    EXPECTED_LEDGER_KINDS
tests/mutation/_metaPremiseContract.test.ts           TRACKED    EXPECTED_ENV_TOUCHING at :32, keyed by suite path
tests/mutation/_metaSourceShardIntegrity.test.ts      TRACKED    pins the four shard files byte-for-byte
tests/mutation/source/ledger.ts                       TRACKED    reconcile (:45), score (:79)
tests/mutation/source/operators.ts                    TRACKED    OPERATOR_NAMES, enumerateSites (:99)
tests/cross-cutting/_metaStripCommentsSingleSource.test.ts  TRACKED  forbids local comment strippers
tests/docs/_metaLedgerInProgress.test.ts              TRACKED
tests/docs/_metaLedgerMintBar.test.ts                 TRACKED
tests/docs/_metaReviewRoundEconomy.test.ts            TRACKED
tests/paneCompaction/sendAuthScan.ts:906-925          TRACKED    the narrow `skipOuterExpressions` binding precedent (NOT imported: enrolled surface)
vitest.projects.ts:176                                TRACKED    `export const REPO_ALIAS`, the alias authority the edge walk imports
tests/help/render.test.ts:41                          TRACKED    non-literal dynamic import (disposition row 3)
tests/parser/fieldNearMiss.test.ts:180                TRACKED    template dynamic import (disposition row 4)
tests/e2e/helpers/useServerDirectivePlugin.test.ts:153  TRACKED  non-literal dynamic import (disposition row 5)
tests/parser/_metaKnownSectionsWalker.test.ts:142     TRACKED    non-literal dynamic import (disposition row 6)
tests/parser/_metaTransformSitesWalker.test.ts:67     TRACKED    non-literal dynamic import (disposition row 7)
vitest.projects.ts:8-16                               tests/db runs in the SERIAL project → unit-suite-db shards, merge-gating
```

Census numbers the tasks rely on are the spec's §1.1 values, produced by the committed probes
(`docs/superpowers/specs/ci/probes/2026-08-21-connection-census/*.out`), re-run at authoring time
and byte-identical to the committed outputs.

---

## 2b. Acceptance-criteria inventory

| AC | proved in |
| --- | --- |
| AC-C1 driver bindings, connect sites, shadowing | `task:acquisition-and-sites` |
| AC-C2 acquisition forms reported, type-only ignored | `task:acquisition-and-sites` |
| AC-C3 site accept-set, default-deny env names | `task:acquisition-and-sites` |
| AC-C4 compiler-defined wrappers, axis parity | `task:acquisition-and-sites` |
| AC-C5 helper graph fixpoint, unresolved-import | `task:helper-graph` |
| AC-C6 live census at HEAD: exactly the seven §2.5 rows, premises, printed counts, production-edge tally | `task:live-census-gate` |
| AC-C7 registry both directions, kind admissibility, remote-literal never excusable | `task:dispositions-both-directions` |
| AC-C8 join with the destructive guard | `task:destructive-join` (constructed) + `task:live-census-gate` (live) |
| AC-C9 enrolment, control uniqueness, derived score with provenance | `task:enrol-and-score` |
| AC-C10 three destructive-guard files byte-identical | `task:ledger-closeout` (closeout check) |
| AC-C11 no binder dependence | `task:acquisition-and-sites` |
| AC-C13 totality: REPORT is the only fall-through | `task:acquisition-and-sites` (sites) + `task:helper-graph` (edges) |
| AC-C12 graduation with the re-scope first, peer filed | `task:ledger-closeout` |

---

## 3. Tasks

**Every task carries a STABLE SLUG; the number is presentation only.** Cross-references use the slug.

Five tasks sit inside the red-contract region and author their own failing case against the module.
Three sit outside it with a stated acceptance, because they measure, gate the live tree, or move
documents — a red there would be asserted, not observed (rule 170).

<!-- tasks: depth=2 red-contract -->

## Task 1 — acquisitions, connect sites, and the site accept-set  `[task:acquisition-and-sites]`

**Files:** `tests/db/_connectionCensus.ts (new)`, `tests/db/connectionCensus.test.ts (new)`, `tests/db/_localDbUrl.ts`, `tests/db/_localDbUrlScan.ts`

<!-- task: red=`pnpm vitest run tests/db/connectionCensus.test.ts` red-state=authored red-target=`tests/db/_connectionCensus.ts` why=`classifySite does not exist, so the suite's first case, which feeds a source with import postgres from "postgres" and postgres(process.env.TEST_DATABASE_URL) and expects one site classified validation-env with envNames [TEST_DATABASE_URL], fails with a value assertion on the returned site list rather than with a collection error, because the suite imports the module through a default-export object the task creates first as an empty stub in the same RED step` ac=AC-C1,AC-C2,AC-C3,AC-C4,AC-C11,AC-C13 -->

**What is red and why.** The module exists only as a stub exporting `acquisitionsIn`,
`classifySite`, `classifyFile` that return empty arrays; every value assertion in the suite fails on
a real comparison. The stub is committed in the RED step so the red is a VALUE red, never a
collection failure (rule: a red from a crash is not a red from the assertion).

**Module contract** (pure; `(filePath, source)` in, records out; `ts.createSourceFile(...,
setParentNodes: true, ScriptKind by extension)`):

- `moduleSpecifiersIn(sf)` → every module-specifier position the parser has (spec §2.2/§2.4):
  `ImportDeclaration.moduleSpecifier` (clause or not), `ExportDeclaration.moduleSpecifier`,
  `ExternalModuleReference.expression`, the argument of `import(...)`, the argument of `require(...)`,
  each as `{ position, literal: string | null, node }` — `literal` is null for a non-literal
  specifier (string or no-substitution template count as literal). ONE extractor, consumed by both
  the driver walk and the edge walk.
- `acquisitionsIn(sf)` → every specifier position whose literal is exactly `"postgres"`, classified:
  a VALUE default import → driver binding; a `const` whose initializer,
  unwrapped through parentheses, `await`, `as`, `!` and a trailing `.default`, is `import("postgres")`
  or `require("postgres")` or a vitest loader call on `"postgres"` (`vi.importActual`, `vi.importMock`,
  `vi.mock`/`vi.doMock` without a factory — the same loader accept-set the edge walk reads, spec
  round 4 F1) → driver binding (spec §2.2 row 2, rounds 2 and 4); an `ImportEqualsDeclaration` whose
  `moduleReference` is an `ExternalModuleReference` with expression `"postgres"` (`import x =
  require("postgres")` — the node has NO `initializer`; plan round 2 F7) → driver binding; `import(...)`
  is recognized by `expression.kind === ts.SyntaxKind.ImportKeyword` — `ts.isImportKeyword` exists at
  runtime but not in the public type declarations, and `pnpm typecheck` rejects it (found on this arc's own
  probes); a namespace import →
  `ns.default(...)` calls are sites; anything else that yields a value the census cannot follow to a
  binding → an `acquisition` REPORT; a type-only import (`isTypeOnly` on the clause or the element)
  → nothing. A `value-reference` report is any identifier reference to a driver binding that is not
  the callee of a `CallExpression`.
- Driver bindings are the VALUE default-import names (`importClause.isTypeOnly` false). A binding whose
  name is ALSO declared anywhere in the file — parameter, `VariableDeclaration` (any form of binding
  name, destructured included), named function or class expression, another import binding, an
  `ImportEqualsDeclaration`, a catch binding — is AMBIGUOUS: every call of that name, in every scope,
  yields a `shadowed-driver` REPORT instead of a site (spec §2.2 row 5; spec round 1 F1). The
  declaration forms are the ones `declarationsOf` (`_destructiveFileAnalysis.ts:635`) enumerates,
  re-stated here for the driver — NOT imported from the enrolled analyzer — and the suite asserts the
  list against a constructed file carrying every form.
- `sitesIn(sf)` → every `CallExpression` whose callee is a driver binding (or `ns.default`) whose
  name is declared nowhere else, with `ordinal` in source order and `line`.
- `classifySite(sf, site)` → `{ cls: "guard-bound" | "validation-env" | "loopback-literal" | "remote-literal" | "unclassifiable", envNames: string[], argText: string }`
  per spec §2.3. The walk: unwrap through the compiler's outer-expression kinds (see below); a
  `CallExpression` whose callee is a guard name imported from the guard module (resolved by
  `isGuardModule`, imported) AND declared nowhere else in the file → `guard-bound` (a guard name
  declared twice — parameter, variable, named function, another import — makes the site
  `unclassifiable`, by the same any-declaration rule as `shadowed-driver`; spec §2.3); a string / no-substitution template literal → parse
  with `new URL`, host in `ACCEPTED_HOSTS` (imported) → `loopback-literal`, else `remote-literal`,
  unparseable → `unclassifiable`; `??`/`||` → classify both operands, combine (any `guard-bound` →
  `guard-bound`; all operands env-or-loopback-literal with env names EXACTLY `[TEST_DATABASE_URL]`
  or `[TEST_DATABASE_URL, DATABASE_URL]` in that order → `validation-env`; anything else →
  `unclassifiable`); an identifier → EVERY declaration of that name in the file must be a `const`
  `VariableDeclaration` with an initializer, all initializers must classify identically, else
  `unclassifiable` (an import binding, a parameter, a `let`, a destructured binding all land here).
  Then the REST of the argument list (spec §2.3, re-analysis §3.8): zero arguments → `unclassifiable`
  (libpq env decides the target); a second argument that is not an object literal, or carries a
  spread, a computed key, a shorthand property, a key outside the OPTIONS ACCEPT-SET (`max`,
  `prepare`, `idle_timeout`, `connect_timeout`, `max_lifetime`, `onnotice`, `debug`, `transform`,
  `types`, `fetch_types`, `connection`), or a third argument → `unclassifiable`, with the offending
  key or shape named in the report. `connection`'s value must be an object literal of plain
  `identifier: <string | number | boolean literal>` pairs; its KEYS are UNRESTRICTED (server-side
  runtime parameters cannot redirect the socket — spec §2.3, verified by the round-3 driver probe on
  `tests/db/watchActivationRace.db.test.ts:35`'s `connection: { statement_timeout: 5000 }`); a
  non-literal value, a spread or a computed key inside it → `unclassifiable`. The options accept-set is an exported constant the suite asserts
  contains no steering name (`host`, `hostname`, `port`, `path`, `database`, `db`, `user`,
  `username`, `password`, `pass`, `ssl`, `socket`) — a hand-written witness against a hand-written
  set, which is allowed because the two lists answer different questions.
- The outer-expression unwrap binds `ts.skipOuterExpressions` through the same narrow declared shape
  `tests/paneCompaction/sendAuthScan.ts:906-925` uses and throws loud if absent. It is a second copy
  of a ten-line BINDING, not of a rule; the comment says so and names the precedent, and extracting it
  to `tests/_shared/` is deferred because the precedent lives in an enrolled surface this arc does
  not edit (§0).

**Suite cases, each a constructed source, each with its positive twin one variable away** (the
negative alone is satisfied by a scanner that classifies nothing — rule 234 completion):

- AC-C1: `import postgres from "postgres"; postgres(u)` → one site; `import pg from "postgres"; pg(u)`
  → one site (kills the name-keyed scanner); `import type postgres from "postgres"` → zero bindings;
  for EACH declaration form, a file with a real top-level `postgres(process.env.TEST_DATABASE_URL)`
  and the shadowing declaration inside an unrelated function → exactly one `shadowed-driver` report at
  the top-level call's line and ZERO sites (kills the file-wide poison that silently drops the name —
  the shape round 1 found); twin without the declaration → one `validation-env` site, zero reports.
- AC-C2: one case per acquisition form, each asserting exactly one acquisition of the expected
  kind; `import { type Sql } from "postgres"` and `import type postgres from "postgres"` → zero;
  `const pg = postgres;` → one `value-reference`; twin: the same file with a static default import
  call → zero reports. The const-bound dynamic acquisition PAIR (spec AC-C2): `const postgres =
  (await import("postgres")).default; postgres(raw)` with `raw` env-bound → one `validation-env` site,
  zero acquisition reports; the SAME file with the argument changed to the validation pooler literal →
  one `remote-literal` report at the CALL line (the twin the plan's first draft omitted, plan round 2
  F8).
- AC-C3: one fixture per class plus the one-edit-away neighbour, and for the options axis:
  `postgres()` → unclassifiable; `postgres(u, { max: 1 })` → classifies by `u`; `postgres(u, { host: "x" })`
  → unclassifiable naming `host`; `postgres(u, opts)` → unclassifiable; `postgres(u, { ...base })` →
  unclassifiable; `postgres(u, { max: 1 }, extra)` → unclassifiable; `postgres(u, { unknown_key: 1 })` →
  unclassifiable; `postgres(u, { connection: { statement_timeout: 5000 } })` → classifies by `u` (the
  live `watchActivationRace.db.test.ts:35` shape); `postgres(u, { connection: { anything_at_all: "x" } })`
  → classifies by `u` (kills an implementation that restricts `connection` sub-keys and would red the
  live site); `postgres(u, { connection: opts })` → unclassifiable; `postgres(u, { connection: { ...c } })`
  → unclassifiable. Also `TEST_DATABASE_URL` → validation-env;
  `PROD_TEST_DATABASE_URL` → unclassifiable; `DATABASE_URL ?? TEST_DATABASE_URL` (reversed) →
  unclassifiable; `TEST_DATABASE_URL ?? DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`
  → validation-env; a loopback literal const → loopback-literal; the validation pooler host as a
  literal → remote-literal; `assertLocalDbUrl(x)` inline and via const → guard-bound; the same file
  with an unrelated `function helper(assertLocalDbUrl: string) {}` added → unclassifiable at the
  guard-bound site (kills a classifier that checks only the trusted import and the callee spelling);
  a `let` →
  unclassifiable; a parameter → unclassifiable; an imported constant → unclassifiable; a template
  with substitution → unclassifiable.
- AC-C4: `url!`, `url as string`, `<string>url`, `url satisfies string`, `(url)` on the argument AND
  on a const initializer each classify as their unwrapped form; an axis-parity assertion that every
  member of `ts.OuterExpressionKinds` (read from the enum at test time, filtered to the bit flags
  below `All`) is covered by the binding — asserted against the enum, not a typed list.
- AC-C13 (sites): an enum-driven sweep synthesizes, for every member of `ts.SyntaxKind` that can
  stand as an expression, a source `postgres(<expr>)` and asserts `classifySite` returns a member of
  the closed union and never throws; a structural assertion over the module's stripped source
  proves no function on the classification path has a bare `return` or `return undefined`, with a
  positive control (a constructed function carrying a bare `return` reds it). Kills: any classifier
  with an implicit "not mine" path.
- ONE extractor: a structural assertion proves `moduleSpecifiersIn` is the only function in the
  module that reads `moduleSpecifier`, `ExternalModuleReference`, or a call of `import`/`require`/a
  `vi` member — any second reader of those positions reds by name (the shape behind spec rounds 1,
  3 and 4: two walks knowing different positions).
- AC-C11: the module's own source, comment-stripped through `stripCommentsForFile`, contains no
  `createProgram(` and no `getTypeChecker(`, and every `createSourceFile(` call passes `true` in the
  fourth argument position; positive control: the assertion reds on a constructed source containing
  `getTypeChecker(`.

**Exports added:** `export const ACCEPTED_HOSTS` in `_localDbUrl.ts:21`; `export function
isGuardModule` in `_localDbUrlScan.ts:40`. Both suites that already pin those modules
(`_metaLocalDbUrlGuard.test.ts`) are run green in this task's GREEN step.

## Task 2 — the helper graph, to a fixpoint  `[task:helper-graph]`

**Files:** `tests/db/_connectionCensus.ts (new)`, `tests/db/connectionCensus.test.ts (new)`

<!-- task: red=`pnpm vitest run tests/db/connectionCensus.test.ts` red-state=authored red-target=`tests/db/_connectionCensus.ts` why=`propagateThroughImports does not exist, so the suite's constructed three-module cycle, where only the third module calls the driver and the first imports the second which imports the third, expects the first module's inherited class set to equal ["validation-env"] and receives an empty set from the stub` ac=AC-C5,AC-C13 -->

**What is red and why.** `propagateThroughImports(files, resolve)` is stubbed to return each file's
own class set; the cycle fixture expects inheritance and fails on the value.

**Contract.** Input: the per-file records from Task 1 plus `resolve(fromFile, specifier) → repoPath | null`
injected (so the suite supplies an in-memory resolver and the gate supplies one over the tree on
disk). Edges are DERIVED from every module-specifier position the parser has (spec §2.4, round 1
F2): `ImportDeclaration.moduleSpecifier` with OR WITHOUT an import clause (`import "./x"`),
`ExportDeclaration.moduleSpecifier`, `ExternalModuleReference.expression`, the string-literal
argument of `import(...)`, and of `require(...)`; type-only imports included. One extractor,
`moduleSpecifiersIn(sf)`, serves both the driver acquisition walk (Task 1) and the edge walk, so the
two cannot enumerate differently. A `./`/`../` or `@/tests/` specifier the resolver cannot map to a
file yields an `unresolved-import` report on the importing file (never a dropped edge); a NON-literal
specifier in any position (`literal: null`) is likewise an `unresolved-import` report (five live at
BASE by the committed AST probe, all dispositioned in Task 6). PATH-SHAPED is derived: `./`, `../`, a leading `/`, or `<key>/`
for every key of `REPO_ALIAS(root)` — `REPO_ALIAS` is a FUNCTION `(root) => ({ "@": root })`
(`vitest.projects.ts:176`), so it is imported and CALLED with the repository root, and the keys of the
returned map are the prefixes; `Object.keys(REPO_ALIAS)` would yield none (plan round 2 F7); the suite
asserts the derived prefix set is non-empty and contains `@` (round 2 F3); anything else is a
bare package specifier and not an edge. A path-shaped specifier resolving OUTSIDE `tests/` is a
`production-edge` tally on the file (printed, never red — spec §4.2), not an edge followed.
Inheritance propagates RESOLVED classes: `propagateThroughImports` takes each file's class set AFTER
`reconcileDispositions` has marked its reported sites `dispositioned` or `undisposed` (round 2 F2),
so the function signature carries the reconciled per-file sets, and an `undisposed` helper yields
ONE report at the helper with `affected: [consumers]`. Loader positions (spec §2.4, round 3 F1):
`vi.importActual`/`vi.importMock` literal args are edges; `vi.mock`/`vi.doMock` without a factory
are edges; with a factory, and `vi.unmock`/`vi.doUnmock`, are not; any OTHER `vi.<member>` call
with a PATH-SHAPED literal first argument is a `loader-call` report. AC-C13 (edges): every specifier
position fed a non-literal yields an `unresolved-import`, asserted per position.
Fixpoint: iterate until no file's class set grows; terminates because class sets are bounded.
Module-grain: any edge to a connecting module inherits its whole class set (spec §4.5).

**Cases.** A helper with a dispositioned site and three consumers → consumers inherit
`dispositioned`, zero reports; the same with the row removed → ONE report at the helper naming the
three as affected (kills the propagate-raw-report and the suppress implementations). A
root-relative `/tests/db/_helper` specifier and an `@/tests/db/_helper` specifier resolve to the same
edge (`REPO_ALIAS(root)` called, its keys read, never retyped); a `../` specifier from a nested
directory resolves to the helper (kills a resolver that drops `../`, plan round 2 F8); a non-literal
`import(x)` → one `unresolved-import`. One
fixture per LOADER form, each a consumer reaching a connecting helper only through that form (spec
AC-C5): `await vi.importActual("./_helper")` inside a `vi.mock` factory → inherits the helper's class
(one ordinary edit from `tests/app/admin/setDeveloperAction.test.ts:42`); `vi.importMock("./_helper")`
→ inherits; `vi.mock("./_helper")` without a factory → inherits; `vi.mock("./_helper", () => ({}))` →
no edge, no report; `vi.doMock` the same pair; `vi.unmock("./_helper")` → no edge; `vi.somethingElse("./_helper")`
→ one `loader-call` report; `vi.stubEnv("X", "y")` → nothing. Kills an implementation that reads
loader positions for driver acquisition (Task 1) but not for edge propagation — the two walks share
`moduleSpecifiersIn`, and this pair is what proves the edge walk consumes it. The
three-module cycle (A→B→C→A, C connects): A and B inherit C's set; a one-level walk
(the weaker implementation) leaves A empty — asserted by ALSO running a deliberately one-level
variant inside the test and showing the two disagree on A, so the fixture is proven to discriminate
rather than merely pass. ONE fixture PER SPECIFIER POSITION (six), each a consumer that reaches a
connecting helper only through that position and inherits its class — the clause-less
`import "./helper"` fixture is one ordinary edit from `tests/db/_b2Helpers.ts:25` and kills a walk
keyed on `import … from`. An unresolvable specifier → one `unresolved-import` report naming the
specifier; twin: the same file with a resolvable specifier → zero reports. A bare specifier
(`"node:fs"`) → no edge, no report. A `@/tests/db/_x` alias → resolved identically to `./_x`.

## Task 3 — dispositions, both directions  `[task:dispositions-both-directions]`

**Files:** `tests/db/_connectionCensus.ts (new)`, `tests/db/_connectionCensusDispositions.ts (new)`, `tests/db/connectionCensus.test.ts (new)`

<!-- task: red=`pnpm vitest run tests/db/connectionCensus.test.ts` red-state=authored red-target=`tests/db/_connectionCensus.ts` why=`reconcileDispositions does not exist, so the suite's constructed registry with one row naming a site that no constructed source contains expects a stale report naming that row's file and site text, and receives an empty report list from the stub` ac=AC-C7 -->

**What is red and why.** `reconcileDispositions(reports, rows)` is stubbed to return `[]`; the
stale-row case fails on the value.

**Contract.** `DispositionKind = "resolver" | "acquisition" | "channel" | "unclassifiable"` (closed
union). `reconcileDispositions(reports, rows)` returns `{ undisposed, stale, ambiguous, inadmissible }`:
a row's key is `(file, site, nth)` where `nth` (1-based, default 1) is the occurrence ordinal of that
exact `site` text among the file's reports in source order, so two identical sites in one file are
two distinct keys (`nth: 1`, `nth: 2`); a report with no row whose key equals its own
`(file, site, occurrence)` is `undisposed`; a row matching zero reports is `stale`; a row matching two
or more is `ambiguous` (reachable only if a row omits `nth` while two identical sites exist — the
default `1` then matches the first and the second is `undisposed`, never silently covered — plan
round 2 F1 showed the earlier text-only key could not reach green on that pair); a row whose kind is not admissible
for the report it matches is `inadmissible` (`resolver` only for a site whose argument is a call;
`acquisition` only for an acquisition report; `channel` only for a join report; `unclassifiable` for
any site report OR any edge report — `unresolved-import` and `loader-call` are edge reports, and
five of the seven BASE rows are non-literal import edges, spec §2.5). A `remote-literal` site is ALWAYS `undisposed` regardless of rows. The module
exports `CONNECTION_CENSUS_DISPOSITIONS` EMPTY in this task; the seven BASE rows land in
`task:live-census-gate`, where they are observed to turn seven live reports green one at a time.

**Cases,** each proven in both directions on constructed registries: undisposed / disposed twin;
stale / live twin; two identical sites in one file with one `nth: 1` row → the second `undisposed`,
with rows `nth: 1` and `nth: 2` → zero reports (the pair the text-only key could not satisfy); each
inadmissible kind pairing / its admissible twin; a `remote-literal` with a matching
`unclassifiable` row still `undisposed`. Keying is per SITE: a file with one disposed site and a
second undisposed site reports the second (rule 16).

## Task 4 — the join with the destructive guard  `[task:destructive-join]`

**Files:** `tests/db/_connectionCensus.ts (new)`, `tests/db/connectionCensus.test.ts (new)`

<!-- task: red=`pnpm vitest run tests/db/connectionCensus.test.ts` red-state=authored red-target=`tests/db/_connectionCensus.ts` why=`discoveredByDestructiveGuard does not exist, so the suite's constructed file whose stripped source contains select public.prune_sync_log() and acquires no driver expects one channel report naming it, and receives an empty list from the stub` ac=AC-C8 -->

**Contract.** `discoveredByDestructiveGuard(files, deps = DEFAULT_JOIN_DEPS)` = files whose
`deps.strip` output, OR its `stripSqlComments` re-strip, matches any value of `deps.patterns` (the
UNION-of-views rule the destructive meta-test documents at its `destructive` filter), minus
`GUARD_OWN_FILES`. `DEFAULT_JOIN_DEPS` binds `patterns: DESTRUCTIVE_STATEMENT_PATTERNS` and
`strip: stripCommentsForFile` — both IMPORTED — and the suite asserts the defaults ARE those objects
by identity (`toBe`, rule 193), then INJECTS a pattern set matching a sentinel string and asserts
the discovered set moves to exactly the sentinel file (spec round 4 F2: a `new RegExp` copy passes a
literal-only structural check and reproduces the live seven; it cannot respond to an injected set).
`channelReports(discovered, population)` = discovered files not in the population.

**Cases.** The constructed destructive non-acquirer → one `channel` report; twin: the same file with
a default import and a guarded call → zero. A file naming the destructive function only in a
comment → not discovered (the stripper decides, exactly as in the destructive guard). A GUARD_OWN_FILES
path → excluded.

## Task 5 — the report shape and the remedy text  `[task:report-shape]`

**Files:** `tests/db/_connectionCensus.ts (new)`, `tests/db/connectionCensus.test.ts (new)`

<!-- task: red=`pnpm vitest run tests/db/connectionCensus.test.ts` red-state=authored red-target=`tests/db/_connectionCensus.ts` why=`renderReport does not exist, so the case that feeds one unclassifiable site and expects a line containing the file, the 1-based line, site#1, the class name and the remedy sentence for that class compares against an empty string from the stub` ac=AC-C6 -->

**Contract.** `renderReport(reports)` → one line per report:
`<file>:<line> site#<n> <class> — <remedy>` with the remedy sentence per class from spec §2.8, and a
trailing per-class count block (`guard-bound N / validation-env N / loopback-literal N / ...`) so a
zero always prints beside its population (rule 47). The strings are asserted by EQUALITY on the
full rendered line, derived from the report's own fields, so a superset wording cannot pass (rule 85).

<!-- tasks: end -->

## Task 6 — the live census gate, with its seven BASE rows  `[task:live-census-gate]`

**Files:** `tests/db/_metaConnectionCensusGuard.test.ts (new)`, `tests/db/_connectionCensusDispositions.ts (new)`

**OUTSIDE the red-contract region** (§0, third constraint). **Acceptance:**
`pnpm vitest run tests/db/_metaConnectionCensusGuard.test.ts` passes at HEAD with the per-class
counts printed (AC-C6), AND the both-directions proof below is recorded in the task's commit message.

**The gate.** Walks `tests/` (the destructive meta-test's `walk`, re-stated — skip `node_modules`,
`__generated__`; the TypeScript and JavaScript extensions the spec lists), builds every file's records through the module, resolves
imports over the tracked tree (`git ls-files` is NOT used — the resolver stats the path candidates
the specifier plus each of `.ts`, `.mts`, `.tsx`, and an `index.ts` inside a directory of that name, on disk, so an untracked scratch file is visible, which is the
conservative direction), propagates, reconciles against `CONNECTION_CENSUS_DISPOSITIONS`, joins
with the destructive guard, and asserts: premises of spec §2.9 (each via `premise`/`premiseHolds`,
unconditionally, above the assertions they license); `undisposed`, `stale`, `ambiguous`,
`inadmissible`, `remote-literal`, `unresolved-import`, `channel` all EMPTY, each assertion's message
the rendered report; the anti-vacuity names: `tests/db/_b2Helpers.ts` is a connecting helper,
`tests/db/validation-schema-parity.test.ts` holds a DRIVER BINDING through its const-bound dynamic
acquisition and its site at line 407 classifies `validation-env` with NO row, `galleryDatabaseUrl` is
dispositioned at both sites, and each of the five non-literal import edges has its row.

**The seven rows**, added one at a time in this task's commit history so each is observed to retire
exactly one report:

```
{ file: "tests/admin/step3StateGallery.test.ts", site: "galleryDatabaseUrl()", kind: "resolver",
  reason: "resolvePsqlTarget with requireLocalSupabase, envVars [DATABASE_URL], no remote opt-in (devCaptureStaged.ts galleryDatabaseUrl)" }
{ file: "tests/e2e/helpers/devCaptureStaged.ts", site: "galleryDatabaseUrl(dsn)", kind: "resolver", reason: same }
{ file: "tests/help/render.test.ts", site: "pathToFileURL(file).href", kind: "unclassifiable",
  reason: "non-literal dynamic import of a help page module by computed file URL; the target is under app/help and opens no connection" }
{ file: "tests/parser/fieldNearMiss.test.ts", site: "`../../lib/parser/blocks/${stem}.ts`", kind: "unclassifiable",
  reason: "template dynamic import of a parser block under lib/parser; parser blocks open no connection" }
{ file: "tests/e2e/helpers/useServerDirectivePlugin.test.ts", site: "pathToFileURL(out).href", kind: "unclassifiable",
  reason: "non-literal dynamic import of a Vite plugin's build output by computed file URL; the output is a fixture bundle and opens no connection" }
{ file: "tests/parser/_metaKnownSectionsWalker.test.ts", site: "path", kind: "unclassifiable",
  reason: "non-literal dynamic import of a parser module by a computed path under lib/parser; opens no connection" }
{ file: "tests/parser/_metaTransformSitesWalker.test.ts", site: "path", kind: "unclassifiable",
  reason: "non-literal dynamic import of a parser module by a computed path under lib/parser; opens no connection" }
```

**Both-directions proof** (recorded, restored byte-exact): delete one row → the gate reds naming that
site as `undisposed`; change a row's `site` text by one character → reds as `stale`; duplicate the
`step3StateGallery` call in a scratch copy of that file → reds as `undisposed` for site#2 (keying
per site); plant `postgres("postgresql://x@aws-1-us-east-2.pooler.supabase.com:5432/postgres")` in a
scratch file → reds as `remote-literal`; for EVERY premise of spec §2.9 — files walked, files with
a driver binding, connect sites, connecting helpers, `_b2Helpers` present by name, each of the three
accepted classes non-empty, the destructive-discovered set ≥ 4 — raise its floor above the live count
(or, for the by-name premise, rename the expected name) and observe THAT premise red naming the real
count, one at a time, restored between (rule 104; plan round 2 F2: one perturbation proves one
premise, and the live gate is outside the mutation score so nothing else proves the rest). Each perturbation's red line is quoted in the
commit message.

**Placement:** `tests/db/` runs in the SERIAL project (`vitest.projects.ts:8-16`), which is
`unit-suite-db`, a required context by name. Not nightly.

## Task 7 — enrolment, the derived control, the score, the killer audit  `[task:enrol-and-score]`

**Files:** `tests/mutation/source/registry.ts`, `tests/mutation/source/expectedLedgerKinds.ts`, `tests/mutation/_metaPremiseContract.test.ts`, `tests/db/connectionCensus.test.ts (new)`

**OUTSIDE the red-contract region:** a measurement. **Acceptance:** the registry row exists with a
`control.from` line the deciding suite asserts occurs EXACTLY ONCE in the module (an executable
`grep -c -F` = 1, rule 112); `EXPECTED_LEDGER_KINDS.connectionCensus` declared; `EXPECTED_ENV_TOUCHING`
carries the deciding suite's path as its key with the count `_metaPremiseContract` REPORTS for it
(run the suite, read the number, never guess — the deciding suite reads no `process.env` and no live
tree, so the expected value is 0 and the suite proves it); `pnpm mutation:guards` on a scoped scratch
shard passes its floor; the score is DERIVED through `score()` from `tests/mutation/source/ledger.ts:79`
and stated with provenance.

**Procedure.**
1. Add the row: `id: "connectionCensus"`, `sourcePath: "tests/db/_connectionCensus.ts"`,
   `suitePaths: ["tests/db/connectionCensus.test.ts"]`, `operators: [...OPERATOR_NAMES]`, `scoreFloor`
   provisional `0.8`, a `control` inverting the `validation-env` env-name exact-match (the line that
   decides default-deny), `accepted: []`.
2. Scratch shard (an untracked `guardSurfaces.shardTMP` test file beside the four real shards) filtering `GUARD_SURFACES` to this
   id, run under `pnpm heavy` (under ten minutes expected — the deciding suite is constructed-source
   only; if it exceeds 600 s, background it). Provenance stamp INSIDE the invocation, before and
   after, over the §5.1 input set: DERIVED from the registry row's `sourcePath` + `suitePaths` and
   their transitive local imports (`tsx` one-liner), UNIONED with the normative members the contract
   names outside the import graph — `tests/mutation/source/registry.ts`,
   `tests/mutation/source/expectedLedgerKinds.ts`, `tests/mutation/source/operators.ts`, and
   `tests/mutation/_metaPremiseContract.test.ts` — and the stamp ABORTS unless the derived set
   CONTAINS every one of those four by name AND the deciding suite AND the source (an asymmetric
   premise: a missing member is the failure, an extra one is benign), with a floor of ten files
   (plan round 2 F3: a set of "at least six" is satisfied by ordinary imports while omitting the
   ledger-kinds row).
3. Survivors: kill with a case, or DELETE the code, before any `equivalent` row (rule 223). Re-run.
4. Set `scoreFloor` to measured minus 0.05. Record `killed/total` derived through `score()`.
5. Killer audit over spec §6's fourth column: for each named weaker implementation, apply it (or
   the nearest source edit that produces it), run the deciding suite, record ABSENT /
   PRESENT-BUT-UNPROVEN / PROVEN (rule 17.1), restore byte-exact. **Acceptance requires every row
   PROVEN**: an ABSENT row means a fixture is missing and the task authors it (then the score is
   retired and re-measured, rule 27); a PRESENT-BUT-UNPROVEN row means the killing check has never
   been run against its mutant and the task runs it. Neither status may stand in the PR body (plan
   round 2 F8). Paste the table into the PR body.
6. Delete the scratch shard; prove `_metaSourceShardIntegrity` reds with it present and greens
   without; `git ls-tree` every commit for the shard name.
7. `pnpm mutation:sites` last before push.

## Task 8 — ledger closeout, EARLY, as ONE commit before whole-diff review  `[task:ledger-closeout]`

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`

**OUTSIDE the red-contract region.** **Acceptance:** `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts
tests/docs/_metaLedgerMintBar.test.ts tests/docs/_metaReviewRoundEconomy.test.ts` passes; the set
arithmetic below verifies in both directions; the marker is absent at HEAD; AC-C10's byte-identity
check is empty.

**Ratification, stated inline because the tracked `AGENTS.md` text and the operative ruling
diverge** (plan round 2 F4 read the tracked sentence; the sendauth-unification plan drew the same
finding for the same reason). `AGENTS.md` invariant 12 says the marker "comes off in the PR's last
commit"; that is the MECHANISM, and the PROPERTY it serves is "so it never reaches main". The
fleet ruling of 2026-08-18 (recorded in `docs/superpowers/plans/ci/2026-08-21-sendauth-arm-classifier-unification.md`,
`task:ledger-closeout`, and applied by every arc of this batch) is that the whole ledger change lands
as ONE commit BEFORE whole-diff review, because (a) a ledger commit after the final review round is
unreviewed code in the merge, which `docs/agents/writing-plans.md`'s final-diff-ordering rule
forbids, and (b) the hazard the last-commit wording guards against, a marker reaching main, is
covered by the ARMING WINDOW: auto-merge is armed only after the closeout commit is pushed AND the
review has approved (incident: PR #838 shipped a marker to main because `--auto` was armed at push
time, not because the ledger commit sat early). Absence is then GUARANTEED rather than maintained:
gone at commit N is gone at every commit after N. **What this task owes for the window between
closeout and merge:** after EVERY post-review repair commit, re-run
`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` and the set arithmetic below, and the
merge is taken only when HEAD's ledger carries no marker, so a repair cannot reintroduce it
unnoticed. The `AGENTS.md` wording is the orchestrator's to reconcile; this plan follows the ruling
and says so rather than editing the invariant mid-arc.

**The archive entry opens with the re-scope** (spec §1.3 item 1, rule 195): the row graduated on a
CLASSIFICATION of every connection-opening file with a validation accept-set and per-site
dispositions, NOT on loopback-everywhere, because the census measured 99 of 179 connection-opening
files targeting validation by declared env (63 directly, 36 through a helper; a further 5 are
loopback literals, 2 resolver sites, 3 dispositioned consumers, 70 guard-bound — the per-FILE tally
in `probe-url-classes.out`; "108 with no guard call" is a different quantity and is not the claim). The census numbers and the zero-live-incident
replay are the probe record. Both refutations stay in the entry.

**The peer row** (spec §7): `BL-VALIDATION-PRUNE-DB-SIDE-GATE` is ALREADY FILED in `BACKLOG.md` by
this branch (the commit after plan round 2; `**Facing:** product`, `**Class-sweep exception:** (c)`,
`**Reachability:** INFERRED, NOT PROBED` naming the probe, eliminations carried), because a plan
citing an unfiled id fails `tests/docs/_metaLedgerReferentialIntegrity.test.ts`, and because the row
text belongs in the ledger rather than in a plan for an implementer to transcribe (plan round 2 F6).
This task does NOT touch it: it archives the graduating row and removes the marker. The same ledger
commit appended the cross-arc typecheck incident to `BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE` on the
orchestrator's instruction.

**Reconciliation, authored AND RUN at plan time (BASE + this branch's marker):**

```
comm -12 <(grep -oE '^## (BL|DEF)-[A-Z0-9-]+' BACKLOG.md | sort) \
         <(grep -oE '^## (BL|DEF)-[A-Z0-9-]+' BACKLOG-archive.md | sort)   -> EMPTY at authoring
grep -c 'Status:\*\* IN PROGRESS' BACKLOG.md BACKLOG-archive.md
  CURRENT OUTPUT at authoring:  BACKLOG.md:1   BACKLOG-archive.md:0
  (the 1 is THIS branch's own marker, which invariant 12 requires to be there now)
  EXPECTATION AT CLOSEOUT (not a measurement): 0 and 0
git diff --stat origin/main...HEAD -- tests/db/_destructiveFileAnalysis.ts tests/db/_destructiveStatements.ts tests/db/_metaDestructiveDbTargetGuard.test.ts
  CURRENT OUTPUT at authoring: empty     EXPECTATION AT CLOSEOUT: empty  (AC-C10)
```

Open = union(open) − union(archived); archive = union; body-level three-way over every entry with
`matches-NEITHER` 0 after any main merge (rule 177). **Re-verify after every subsequent merge from
main.**

---

## 3b. Tautology audit — population derived from the instruments this plan ships

Instruments: the deciding suite's cases (Tasks 1–5), the live gate (Task 6), the control and the
killer audit (Task 7), the closeout checks (Task 8). For each: which rule DECIDES the observation,
and what else could produce it.

- Every accept-class fixture has a one-edit-away neighbour in a DIFFERENT class, so a classifier that
  routes everything to one class fails the neighbour (Task 1).
- Every negative (zero reports, zero sites) has a positive twin through the SAME code path, so a
  scanner that matches nothing fails the twin (rule 234).
- The fixpoint case runs the one-level variant beside the real one and asserts they DISAGREE on the
  cycle's head, so the fixture is proven discriminating rather than assumed (Task 2).
- The registry cases construct both the report list and the row list, so neither side is derived
  from the other (rule 154); the live gate's two sides are the live tree and a hand-written row
  list — independent by construction.
- The join's recognizer is IMPORTED and the suite asserts no local regex, so the join cannot drift
  into agreeing with itself.
- The control line's uniqueness is asserted executably, not commented (rule 112).
- The premise floors are perturbed in Task 6's proof so each is shown to evaluate a real population
  (rule 104); an `|| true` premise cannot survive that step.
- The closeout's `grep -c` expectation is labelled an EXPECTATION beside the CURRENT output.

---

## 3c. Weaker implementations, and the fixture that kills each

| weaker implementation | killed by |
| --- | --- |
| callee-NAME scanner (`postgres(`) | `import pg from "postgres"; pg(u)` → 1 site |
| file-wide poison that silently DROPS a shadowed name | real top-level call + unrelated `function f(postgres) {}` → one `shadowed-driver` report, zero sites |
| walk keyed on `import … from` | the clause-less `import "./helper"` fixture inherits the helper's class |
| classifier keyed on substring `TEST_DATABASE_URL` | `PROD_TEST_DATABASE_URL` → unclassifiable; reversed chain → unclassifiable |
| classifier accepting any `process.env.*` | `process.env.SOMETHING_ELSE` → unclassifiable |
| classifier that reads only the FIRST argument | `postgres(u, { host: "x" })` → unclassifiable naming `host`; `postgres()` → unclassifiable |
| scanner that reports a dynamic acquisition and drops its sites | `const postgres = (await import("postgres")).default; postgres(raw)` → one site classified by `raw`, zero acquisition reports |
| resolver filtering to `./` and `@/tests/` | the root-relative fixture resolves to the helper |
| inheritance propagating RAW reports (three false obligations) or suppressing them (three silent files) | the dispositioned-helper pair |
| parentheses-only unwrap | `url as string`, `url!`, `<string>url`, `url satisfies string` each classify as unwrapped; axis parity against the enum |
| one-level import walk | the 3-module cycle, run beside the one-level variant |
| walk that drops unresolvable specifiers | `unresolved-import` report on a bad specifier |
| forward-only registry check | the stale-row case |
| file-keyed dispositions | second undisposed site in a dispositioned file |
| join re-implementing the recognizer (incl. a `new RegExp` copy) | identity assertion on the default deps + the injected-sentinel case |
| classifier with an implicit "not mine" return | the enum-driven totality sweep + the bare-return structural assertion |
| a second specifier reader beside `moduleSpecifiersIn` | the one-extractor structural assertion |
| driver walk that ignores loader positions | `const postgres = await vi.importActual("postgres"); postgres(raw)` → one site |
| edge walk that ignores loader positions | the per-loader-form fixtures in Task 2 (importActual inside a mock factory inherits the helper's class) |
| classifier that restricts `connection` sub-keys | `connection: { anything_at_all: "x" }` classifies by the URL; the live `statement_timeout` site stays green |
| guard-bound by trusted import + callee spelling only | the twice-declared `assertLocalDbUrl` fixture → unclassifiable |
| `toMatch` on report lines | equality on the full rendered line derived from the report's fields |
| census whose walk matches nothing | premise floors (Task 6), perturbed |

---

## 3d. Every red, checked against the three ways an authored red fails

For each of Tasks 1–5: **(i)** it fails on BEHAVIOUR — a value assertion against a stub that returns
the empty/neutral value, never on a missing import (the stub exports exist from the RED step of Task
1; each later task's new function is added to the stub in ITS red step so the suite collects); **(ii)**
it has an ORACLE that can differ — a constructed expected record, never a re-derivation from the
module; **(iii)** it can fail AT ITS OWN SEQUENCE POSITION — no task's red depends on a later task,
and no earlier task pre-satisfies it (Task 2's fixpoint case cannot pass on Task 1's code because
Task 1 returns per-file classes only; Task 3's stale case cannot pass on Tasks 1–2 because
`reconcileDispositions` is introduced here; Task 4's channel case is the first consumer of the
recognizer; Task 5's render case is the first consumer of the remedy table).

**The `red-target` lifetime (rule 22.1).** All five cite the new module's path path-only
because the module does not exist at BASE and a path-only target is valid exactly while the path is
untracked. Task 1 tracks it. **At each of Tasks 2–5's RED step the implementer re-points the
citation to the line of the stub function the red fails against, in that task's commit**, following
the re-point-not-waive precedent; the plan is therefore lint-clean at authoring and the markers stay
valid through execution. The `why=` clauses name the function and the observed value, so the
re-pointed line is verified by READING it against the named symbol, not by resolving.

---

## 4. What each RED actually is

Every `why=` above names output the implementation must PRODUCE (a classified site, an inherited
class set, a stale-row report, a channel report, a rendered line), never a symbol's absence. The
three tasks outside the region — `task:live-census-gate`, `task:enrol-and-score`,
`task:ledger-closeout` — carry NO marker by design and state their acceptance: the first gates a
live tree that is green the moment its rows exist, the second measures, the third moves documents.

---

## 4b. Review state at handover — DISPOSITIONED, not converged

Plan round 1 (BLOCKING, 5) and round 2 (BLOCKING, 8) were accepted in full and repaired; round 3
returned `no_verdict` because the Codex weekly usage limit was reached (three 10 s attempts, reset
2026-08-25 17:47), recorded as the corpus row it is. The orchestrator's ruling (2026-08-21): the plan
closes DISPOSITIONED on two repaired BLOCKING rounds, the implementation proceeds now, and the
implementation's whole-diff review — which was always the plan residue's re-reader — lands after the
reset on the FINAL tree, so implementation time and the wall overlap rather than stack. The thirteen
repairs after round 2 were reviewed by nobody at this stage; the diff stage reads them. **The
whole-diff review is WALL-GATED until 2026-08-25 17:47 or alternate Codex auth**: the implementer
sequences CI and the score FIRST and holds at readiness if the wall has not lifted.

## 5. Checklist

- [ ] five red-contract tasks (`task:acquisition-and-sites` … `task:report-shape`), each
      red-then-green on the SAME command, committed per task, `red-target` re-pointed at each RED
- [ ] three acceptance tasks (`task:live-census-gate`, `task:enrol-and-score`,
      `task:ledger-closeout`), each meeting its stated acceptance, both-directions proofs quoted in
      commit messages
- [ ] Self-review
- [ ] Adversarial review (cross-model) — plan stage, to APPROVE
- [ ] Execution handoff (fresh Opus implementation pane; HANDOFF brief in `_briefs/`)

**impeccable-gate: N/A — no UI surface.** No file under `app/`, `components/`, `app/globals.css`,
`DESIGN.md` or a Tailwind config is touched.
