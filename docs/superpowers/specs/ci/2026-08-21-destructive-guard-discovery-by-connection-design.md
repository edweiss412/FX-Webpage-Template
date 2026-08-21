# BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION — a connection census over `tests/`, so no file that opens a database connection passes silently

Ledger row: `BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION` (`BACKLOG.md`). Filing spec:
`docs/superpowers/specs/ci/2026-08-14-guard-completeness-wave-design.md` §2.5. The shipped guard whose
DISCOVERY this row is about: `tests/db/_metaDestructiveDbTargetGuard.test.ts` (discovery walk) feeding
`tests/db/_destructiveFileAnalysis.ts` (the analyzer, enrolled as `destructiveFileAnalysis` in
`tests/mutation/source/registry.ts`).

**Anchor table.** Every line number in this document is stamped at BASE
`e5d1d723d69cbab88b7424e34256ebcde865dda1` (`origin/main` at Stage 0). The SYMBOL is the durable
identity; the line is a drafting-time locator. No HEAD column is carried.

| symbol | file | BASE line | role |
| --- | --- | --- | --- |
| `DESTRUCTIVE_STATEMENT_PATTERNS` | `tests/db/_destructiveStatements.ts` | 16 | the spelling recognizer both discovery and the analyzer import |
| `GUARD_OWN_FILES` | `tests/db/_destructiveStatements.ts` | 31 | the only exemption the destructive guard has |
| `DISCOVERY_PATTERNS` / `destructive` | `tests/db/_metaDestructiveDbTargetGuard.test.ts` | 53 / 86 | discovery: stripped source matched against the recognizer |
| `analyseDestructiveFile` | `tests/db/_destructiveFileAnalysis.ts` | 99 | the analyzer; collects driver default-import bindings at 163, connect calls at 178 |
| `checkConnection` | `tests/db/_destructiveFileAnalysis.ts` | 569 | every connection in a discovered file must be a `const` bound to a trusted guard call |
| `assertLocalDbUrl` / `assertLocalDbUrlIfSet` | `tests/db/_localDbUrl.ts` | 50 / 77 | the one loopback guard; `ACCEPTED_HOSTS` is its host set |
| `classifyLocalDbUrlSource` | `tests/db/_localDbUrlScan.ts` | 433 | the sibling axis: every READ of `LOCAL_TEST_DATABASE_URL` routes through the guard |
| `resolvePsqlTarget` / `LOOPBACK_HOSTS` | `tests/e2e/helpers/psqlTarget.ts` | 76 | the e2e fixture DSN resolver (accept-set of query params, scrubbed child env) |
| `galleryDatabaseUrl` | `tests/e2e/helpers/devCaptureStaged.ts` | 94 | the one live connect argument the census cannot classify by AST |
| `premise` / `premiseHolds` | `tests/_shared/premise.ts` | 26 / 36 | executable premises |
| `stripCommentsForFile` / `stripSqlComments` | `tests/_shared/stripComments.ts` | 215 / 114 | THE comment stripper; local copies are forbidden by `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` |
| `EXPECTED_LEDGER_KINDS` | `tests/mutation/source/expectedLedgerKinds.ts` | 24 | second declaration every enrolment owes |

---

## §0 The bound this arc is held to

**Consequence bound.** Every input is handled correctly OR signaled, **never silently wrong**: every
file under `tests/` that opens a database connection through the `postgres` driver is **CLASSIFIED**
into exactly one of the three accepted target classes of §2.3 (`guard-bound`, `validation-env`,
`loopback-literal`), or **REPORTED** by name as
unclassifiable and made to carry a disposition row. The forbidden direction is **silence**: a
connection-opening file, a connect site, or a driver acquisition that the census neither classifies nor
names. A conservative report on a site the census has declined to resolve, plus the disposition row it
demands, is a **DOCUMENTED LIMIT, not a finding** (§4). On the live corpus at BASE the census is green
with exactly the disposition rows §2.5 enumerates and **zero** others; a report the corpus does not need
is a false report and IS a finding.

**What the bound does NOT say.** It does not say every connection is loopback. The census measured the
live corpus (§1.1): 79 of 175 connect sites read the validation project by declared environment
variable, by this repository's ratified posture (`scripts/preflight-env.mjs:146`, "TEST_DATABASE_URL is DELIBERATELY validation"; the destructive
guard's own header, `_metaDestructiveDbTargetGuard.test.ts:7`). The row's phrase "require the loopback
guard of all of them" is **refuted by the census** and re-scoped in §1.3 item 1; the census requires a
**CLASSIFICATION** of all of them. Nor does the bound say the census recognizes destructive SQL. It
does not read SQL at all (§1.3 item 2, §4.1).

**Usefulness is not the criterion; correct classification is.** A site reported unclassifiable that a
human resolves by reading is still correctly reported if the AST cannot resolve it and the census says
so.

**`PROBE DOMAIN:`** the live tracked `tests/**` tree at BASE (2542 `.ts`/`.mts`/`.cts`/`.tsx` files,
of which 140 hold a driver binding and 140 call it at 175 sites — §3.1), the five connecting helper modules
named in §3.1, the two incident spellings named in the ledger row (`select prune_sync_log()`,
`select "public"."prune_sync_log"()`), and the dispositioned sites of §2.5. A constructed input more
than one ordinary edit away from that set files to documented limits, not to a finding.

**Threat fence.** Ordinary authoring mistakes by a contributor adding or editing a DB test: a new
`postgres(...)` call, a new env-var name, a helper that changes its URL source, a hard-coded DSN, a
test that reaches a connecting helper through a new import. Adversarial obfuscation — a driver
obtained by a route built to evade an import walk, a URL assembled at runtime to look local — is out
of scope and files to documented limits. The census is a fixture-safety guard, not a sandbox; the
same fence `tests/e2e/helpers/psqlTarget.ts` states for itself.

**Score.** The census module is authored as an IMPORTABLE MODULE with a referring Vitest suite from
the start and is ENROLLED (`connectionCensus`, §5) before the round-1 diff dispatch. The `GUARD
SURFACE:` line of that brief carries `MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors", measured
by `pnpm mutation:guards` on a scoped scratch shard, derived through the shipped `score()` in
`tests/mutation/source/ledger.ts` because a green gate prints no counts. Every repair that edits the
module, its deciding suite, or a fixture the suite reads RETIRES the score (rule 27, no test-side
exception) and the brief says `RETIRED` rather than quoting the last number.

---

## §1 The measured case

### §1.1 The census, derived at BASE

Run from the worktree root with `pnpm tsx docs/superpowers/specs/ci/probes/2026-08-21-connection-census/probe-population.mts`
and `pnpm tsx docs/superpowers/specs/ci/probes/2026-08-21-connection-census/probe-url-classes.mts`; full outputs committed beside them as `*.out`. Numbers below are
copied from those outputs, not re-derived by hand.

| quantity | value | extractor |
| --- | --- | --- |
| files walked under `tests/` | 2542 | `walk()` over TypeScript sources (`.ts`, `.mts`, `.cts`, `.tsx`), `node_modules` and `__generated__` skipped. The census ALSO walks `.js`, `.mjs`, `.cjs`, `.jsx` (parsed as JS); zero such files under `tests/` name the driver at BASE (`rg -l '"postgres"' tests/ --glob '*.{js,mjs,cjs,jsx}'` → 0), so the count here is unchanged |
| files that default-import `postgres` as a VALUE | 139 | `import postgres from "postgres"` — default binding, `importClause.isTypeOnly` false |
| files holding a DRIVER BINDING | 140 | the 139 above plus `tests/db/validation-schema-parity.test.ts:401`, `const postgres = (await import("postgres")).default` — a `const` initialized from an acquisition expression is a driver binding (spec round 2 F1) |
| files whose default import is TYPE-ONLY | 1 | `tests/db/_censusRunner.ts:13`, `import type postgres from "postgres"` — not an acquisition |
| files that CALL a driver binding | 140 | a `CallExpression` whose callee identifier is one of the file's driver bindings |
| connect call sites | 175 | same, counted per call |
| non-default imports of `postgres` | 51 | 50 are TYPE-ONLY named imports (`type Sql`); 1 is the dynamic acquisition above, followed to its `const` |
| namespace / `require` acquisitions | 0 / 0 | — |
| connecting helper modules (non-test, call the driver directly or transitively) | 5 | `tests/db/_b2Helpers.ts`, `tests/db/_holdsHelpers.ts`, `tests/db/_mi11Helpers.ts`, `tests/db/_remediationHelpers.ts`, `tests/e2e/helpers/devCaptureStaged.ts` |
| test files connecting ONLY through a helper | 39 | import fixpoint over every module-specifier position (§2.4) |
| files that import the driver as a value and neither call it nor reach a helper | 0 | — |

**The row's census command over-counted and under-described.** `rg -l 'from "postgres"|require\("postgres"\)' tests/`
returns 145 at BASE: the 139 value default importers, plus FIVE files whose only import from the
module is a TYPE (`_censusRunner.ts`, `_holdAwareTestkit.ts`, `_roleVocabDriftApplyKit.ts`,
`acknowledge-changes.test.ts`, `readShowChangeFeed.staleness.test.ts`), plus
`tests/db/destructiveFileAnalysis.test.ts`, which carries the import as FIXTURE TEXT inside string
literals; it misses the dynamic import, and says nothing about the 39 files that never import the
driver and still open a connection. The
chokepoint is the **CALL**, not the import (rule 272: importing a thing is not invoking it), and the
helper graph is part of the population. `rg` cannot derive either; the committed probe does.

**Per connect site, URL provenance classifies mechanically** (`probe-url-classes.mts`, which walks
each argument through `const` bindings, `??`/`||`, parentheses, `as`, `!`, `satisfies`):

| class | sites | what the argument resolves to |
| --- | --- | --- |
| `guard` | 85 | `assertLocalDbUrl(...)` inline, or a `const` bound to it |
| `env:TEST_DATABASE_URL\|DATABASE_URL` | 44 | `process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL [?? loopback literal]` |
| `env:TEST_DATABASE_URL` | 35 | `process.env.TEST_DATABASE_URL [?? loopback literal]` (one of them the dynamic-acquisition site, `validation-schema-parity.test.ts:407`, whose `raw` is read at line 393) |
| `literal` | 9 | a `const` bound to the string `"postgresql://postgres:postgres@127.0.0.1:54322/postgres"` (five files, all loopback) |
| `other` | 2 | `galleryDatabaseUrl()` / `galleryDatabaseUrl(dsn)` — a call result; resolves through `resolvePsqlTarget` with `requireLocalSupabase: true` |

Files with MIXED site classes: **0**. Every file's sites share one class, which is what makes a
per-FILE class well-defined (§2.4).

**Guard coverage over the whole population:** 179 connection-opening files (140 direct + 39 via a
helper); 71 call a loopback guard, **108 do not**. Of the 108, 43 read no env var in-file (they reach a
helper that does), 62 read `TEST_DATABASE_URL` (37 of them with the `DATABASE_URL` fallback), 2 read
it alongside Supabase REST variables, and 1 (`validation-schema-parity.test.ts`) reads it alongside
`SCHEMA_MANIFEST_DB_URL`. None is a defect. They are the validation-targeting half of the
suite, and they are why "loopback of all of them" is not a design.

### §1.2 The incident replay: the spelling miss is real and has ZERO live instances

Rule 337: a ledger row is a hypothesis set, and its incidents are its cheapest probes. Both incidents
the row names were replayed against the shipped recognizer before a line of this design was written
(`probe-population.out`, tail):

```
shipped DISCOVERY_PATTERNS on constructed spellings:
    DISCOVERED      select public.prune_sync_log()
    not discovered  select prune_sync_log()
    not discovered  select "public"."prune_sync_log"()
    DISCOVERED      select PUBLIC.Prune_Sync_Log()
    not discovered  select public .prune_sync_log()
    not discovered  select reset_validation_data()
    not discovered  select "public".reset_validation_data()
control tests/db/syncLogIndexesAndPrune.db.test.ts discovered today: true
constructed unqualified file: discovered=false; analyzer verdict if it WERE discovered: {"ok":false,"reason":"no loopback guard is called"}
```

The miss is confirmed, the positive control fires, and the analyzer WOULD reject the constructed file
if discovery handed it over — the gap is discovery's alone, exactly as the row says.

Then the live corpus: every string and template literal under `tests/` was scanned (SQL comments
stripped) for a destructive name NOT preceded by `public.`, and for the quoted-qualified form.
**Fourteen hits in eight files, every one a test TITLE or an assertion MESSAGE** —
a describe title naming `reset_validation_data()` with a dash and a description, an assertion message about a non-cascade FK child that must be explicit-deleted in `reset_validation_data()`, and their kin. **Zero executions.** The only
two files whose literals could be mistaken for SQL are the destructive guard's own fixture files
(`GUARD_OWN_FILES`) and `tests/db/_metaLocalDbUrlGuard.test.ts`, which quotes prose.

So the row's motivating defect is a CONSTRUCTED fixture, not a live one. That changes what a
terminating repair looks like: there is nothing to find with a wider SQL recognizer today, and the
documented history of that recognizer (`_metaDestructiveDbTargetGuard.test.ts` header, r15/r16) says
widening it is how the last arc spent its rounds. What IS live is the **silent pass**: a connection-
opening file that the spelling recognizer does not discover receives no analysis, no classification,
and no report. That is the thing this design closes.

### §1.3 Resolved scope — do not relitigate

Each with its ratification.

1. **The row's phrase "require the loopback guard of all of them" is RE-SCOPED, and the re-scope is
   stated here first** (rule 195). 108 of 179 connection-opening files target the validation project
   by declared environment variable and by ratified posture (`scripts/preflight-env.mjs:146`;
   `_metaDestructiveDbTargetGuard.test.ts:7`). Requiring `assertLocalDbUrl` of them is
   requiring the suite to stop running against validation, which is a product/infra decision outside a
   structural-guard row. The deliverable is a **classification** of all of them with an accept-set for
   validation targeting — which is the row's own second paragraph ("per-file dispositions ... and a
   validation-target accept-set"). Arguing the loopback-everywhere reading is out of scope.
2. **The census does not read SQL and does not widen `DESTRUCTIVE_STATEMENT_PATTERNS`.** The row
   says "Do not attempt this as a widening of the existing guard"; the shipped guard's header records
   the ratchet (r15 added four spellings, r16 found the repair's regression). A finding of the form
   "spelling X is still not discovered" is a finding against the SQL recognizer, which this arc does
   not touch, and files to §4.1. Asking the census to recognize destructive SQL would make it the
   second copy of the recognizer whose single-ownership `_destructiveStatements.ts` exists to protect.
3. **`tests/db/_destructiveFileAnalysis.ts` is not edited.** It is an enrolled surface
   (`destructiveFileAnalysis`, eight `equivalent` rows, line-keyed, currently RED on main's nightly for
   line drift — `BL-MUTATION-HARNESS-MAIN-RED`, `BACKLOG.md`). Editing it retires a score this arc has
   no business re-measuring and re-keys eight rows (rule 213). The census is a NEW module that
   IMPORTS the analyzer's shared constants where it needs them and re-implements nothing the
   analyzer decides (§2.6 states the one overlap and why it is not a copy).
4. **The census proves WHERE a connection goes, never that a guard is EFFECTIVE.** "Effective" — the
   connected string is the guarded string, the guard ran first, the name resolves to the imported
   guard — is `checkConnection`'s question, answered for destructive files only, and it stays there.
   The census class `guard-bound` is a LABEL for a site whose argument resolves to a guard call; a file
   in that class that executes destructive SQL is still analyzed by the destructive guard exactly as
   today.
5. **Discovery by the destructive guard is UNCHANGED.** The census adds a JOIN (§2.7): every file the
   destructive guard discovers must be in the census population, so a destructive file reaching the
   database through a channel the census does not model is REPORTED. It does not replace the
   destructive guard's discovery and does not feed it a different file set.
6. **Other channels are documented limits, with counts** (§4.2): `createClient(` (supabase-js, 12
   files), PostgREST `fetch`, and `psql` child processes (65 files, the e2e fixture path behind
   `resolvePsqlTarget`). The row is about the `postgres` driver; modelling a second channel is a
   second arc.
7. **Per-site dispositions are TEXT-KEYED on the argument source and a rename REDS as stale.** That
   is the ratified posture for `sendAuthScan`'s disposition mapping (spec `2026-08-21-sendauth-arm-classifier-unification-design.md`
   §4.5) and for the spawn-disposition rows (`fix/mutation-browser-child-lifetime`): a key that cannot
   go stale cannot detect a site that moved under it. An argument that a stable key would be nicer is
   an argument for a key the census cannot verify.
8. **No call-graph, no interprocedural URL resolution, no runtime.** A connect argument that is a
   call result (`galleryDatabaseUrl()`), a parameter, a property read, a conditional, or anything the
   `const`-chain walk of §2.3 does not resolve is `unclassifiable` and REPORTS. Making the walk
   smarter is the recognizer ratchet; the disposition row is the terminating answer, and at BASE the
   whole corpus needs two of them for SITES (plus five for non-literal import edges, §2.4).

### §1.4 Convergence criterion

Stated in every review brief; every admissibility clause cites the fence and the probe domain.

1. **Consequence bound** — §0. Closable because it ranges over the finite population of §1.1, not
   over the space of possible TypeScript.
2. **`PROBE DOMAIN:`** — §0.
3. **Threat fence** — §0.
4. **Score** — §0 and §5. A "the guard does not pin what it claims" finding is admissible only with
   the surviving mutant that demonstrates it: a declared operator and a site. Without one it is
   refuted, or it is an operator proposal with its own before/after numbers — neither is a round on
   this diff.

A probe that shows a connection-opening file the census passes SILENTLY — no class, no report — is
the admissible finding shape. A probe that shows a site the census REPORTS and a human could have
resolved is §4 by construction.

---

## §2 The design

### §2.1 One sentence

A census module walks `tests/`, finds every acquisition of the `postgres` driver, classifies every
call of it by where its URL argument comes from, propagates classes through the helper-import graph
to a fixpoint, and fails the suite for any file, site, or acquisition that is neither in an accepted
class nor carried by a disposition row — while a second assertion proves every disposition row still
names a live site, and a third proves every file the destructive guard discovers is a file the census
saw.

### §2.2 The population: acquisition is the chokepoint, and its unrecognized forms REPORT

Rule 332: when the uses are an open set, detect the chokepoint every use must pass through. Every
spelling of a destructive execution must first hold a client, and every client must first be obtained
from the driver module. The census therefore keys the population on **any reference to the module
specifier `"postgres"`** in a position that can yield a value:

| acquisition form | census treatment at BASE | live count |
| --- | --- | --- |
| `import postgres from "postgres"` (value default binding) | a DRIVER BINDING: its calls are connect sites | 139 files |
| `const x = (await import("postgres")).default`, `const x = require("postgres")` (with or without `.default`), `import x = require("postgres")` — a `const` or import-equals binding whose initializer, unwrapped through parentheses, `await`, `as`, `!` and a trailing `.default`, is an acquisition expression | a DRIVER BINDING too, subject to the same shadow rule: its calls are connect sites, classified exactly as a default import's. **Spec round 2 F1: the earlier design reported the acquisition and then lost every site it produced** — `validation-schema-parity.test.ts:407` was absent from the 174-site census, and changing its argument to a remote literal would have left the line-401 acquisition row green while the site went unreported | 1 file, 1 site |
| `import * as ns from "postgres"` | `ns.default(...)` is a connect site whose callee is the namespace binding's `default` member; any other use of `ns` is a `value-reference` acquisition report | 0 |
| `import { type Sql } from "postgres"` / `import type … from "postgres"` | a type — not an acquisition; ignored | 50 |
| `import { default as x } from "postgres"` (a named value import of `default`) — and any acquisition expression NOT bound by a `const`/import-equals: a `let`, a destructuring, an argument, a bare statement | **ACQUISITION-UNCLASSIFIABLE**: the file enters the population and REPORTS until a disposition row of kind `acquisition` names it — this is the residual bucket for acquisitions the census cannot follow to a binding, and it is EMPTY at BASE | 0 |
| a default binding re-bound to another name (`const pg = postgres`) or passed as a value | the re-binding is reported as `acquisition` too: any identifier reference to a default driver binding that is not the callee of a call | 0 |
| a default binding whose NAME is also declared anywhere in the file — a parameter, a variable, a named function or class expression, another import | **`shadowed-driver`**: every call of that name, in every scope, is REPORTED (disposition kind `unclassifiable`), never silently dropped and never resolved by scope. The census does no scope resolution (§1.3 item 8), so it cannot tell the outer real call from the inner shadowed one, and declining to classify is the only answer that is not a guess | 0 — three files name `postgres` again only in comments, which the stripper removes |
| `import "postgres"` (side-effect form) and `import x = require("postgres")` | `acquisition`, reported | 0 / 0 |

The fourth and fifth rows are what make the chokepoint COMPLETE rather than merely unique (rule
332a): a client obtained by aliasing the binding is not silently "not a connect site", it is a
reported acquisition; and a binding whose name is ambiguous in the file is not silently "not a
driver", it is a reported `shadowed-driver` at every call. **Spec round 1 found the earlier wording
("a shadowed binding is NOT a driver") to be a silent pass**: `tests/admin/extractAgenda.test.ts`
with an unrelated parameter named `postgres` appended to one function would have had both of its real
top-level connections erased from the census with no report. The analyzer's file-wide poison rule is
correct FOR THE ANALYZER because the analyzer REJECTS on a poisoned name; a census that merely
classifies must REPORT instead. The unrecognized bucket is a SPECIFIC case — a value-position
reference that is not a direct call, a name declared twice — never the default; a type-only import is
decided (ignored) because `isTypeOnly` says so, and a named value import is decided (reported)
because the driver's default export is the only constructor.

All rows are derived from one rule: **every module-specifier position the parser has** —
`ImportDeclaration.moduleSpecifier` (with or without an import clause), `ExportDeclaration.moduleSpecifier`,
`ExternalModuleReference.expression`, the argument of `import(...)`, the argument of `require(...)` —
is examined for the exact string `"postgres"`, and the binding it introduces (if any) is classified by
the row it matches. The table enumerates the CONSEQUENCES of that rule; it is not the rule.

Module-specifier matching is exact-string on `"postgres"`. A re-export of the driver from a `tests/`
module (`export { default } from "postgres"`) is an acquisition by that module and REPORTS there
(0 live). No binder, no `Program`, no `getTypeChecker`: every walk runs over a `ts.createSourceFile(...,
setParentNodes: true)` tree, which is the one configuration in which `.parent` is populated by the
parser itself (rule 333 names the program-built tree WITHOUT that flag as the hazard, and
`_destructiveFileAnalysis.ts:651` and `_localDbUrlScan.ts:441` both rely on the same flag). The
deciding suite asserts the module never names `createProgram` or `getTypeChecker`.

### §2.3 Site classification: an accept-set over URL provenance, default-deny

For each connect site — a `CallExpression` whose callee is a default driver binding whose name is
declared nowhere else in the file (a name declared twice is `shadowed-driver`, §2.2) — the
census resolves the FIRST argument through a walk that unwraps parentheses, `as`, `!`, `satisfies`
(the compiler's `OuterExpressionKinds`, read from the enum), follows an identifier to EVERY
declaration of that name in the file (any-declaration rule, no scope resolution — the same conservative
answer `checkConnection` and `_localDbUrlScan` give), and descends `??` / `||` chains. The result is
one of:

| class | accepted iff | failure direction if the classifier is wrong |
| --- | --- | --- |
| `guard-bound` | the expression is a call of a guard name imported from `tests/db/_localDbUrl` (resolved by repo path, exactly as `_localDbUrlScan.isGuardModule`) and declared nowhere else in the file, or every declaration of the identifier is a `const` initialized from one; a guard NAME declared twice makes the site `unclassifiable`, by the same rule as `shadowed-driver` | over-acceptance would mislabel a non-guarded site as guarded — **but no safety conclusion rests on this label** (§1.3 item 4); the destructive guard still decides effectiveness |
| `validation-env` | the `??`/`||` chain's env reads are EXACTLY `[TEST_DATABASE_URL]` or `[TEST_DATABASE_URL, DATABASE_URL]` in that order, every other operand is a loopback literal, and no guard call appears | a chain with any other env NAME or ORDER is `unclassifiable` — default-deny over env names, so `PROD_DATABASE_URL` reports rather than passes |
| `loopback-literal` | a string or no-substitution template literal whose `new URL(...).hostname` is in the loopback host set shared with `assertLocalDbUrl` (`ACCEPTED_HOSTS`, imported — not copied) | a literal with any other host is **`remote-literal`**, which no disposition kind accepts: a hard-coded remote DSN in a test is repaired, never excused |
| `unclassifiable` | anything else: a call result, a parameter, a property read, a conditional, an element access, a template with substitutions, a `let`/`var` binding, an IMPORT binding (an imported URL constant is a declaration the walk does not follow across files — `_destructiveFileAnalysis.ts` whole-diff r14 counts imports as declarations for the same reason), an identifier with no declaration, a mixed chain | REPORTS; carries a disposition row of kind `resolver` or `unclassifiable` or the suite is red |

**The arguments AFTER the URL are part of the accept-set, because postgres.js lets them steer the
target.** `postgres()` with NO argument connects wherever libpq's `PG*` environment points, and
`postgres(url, { host: "…" })` overrides the URL's host. So a site is in an accepted class only if,
in addition to the first argument classifying: there IS a first argument; the second argument is
absent or is an object literal whose every property is a plain `name: value` pair (no spread, no
computed key, no shorthand from an outer binding) with a name in the OPTIONS ACCEPT-SET — `max`,
`prepare`, `idle_timeout`, `connect_timeout`, `max_lifetime`, `onnotice`, `debug`, `transform`,
`types`, `fetch_types`, and `connection` — and there is no third argument. `connection`'s value must
itself be an object literal of plain `identifier: <string | number | boolean literal>` pairs; its KEYS
are unrestricted, because they are server-side runtime parameters (GUCs such as `statement_timeout`
or `application_name`) that postgres.js sends AFTER the socket is open and that cannot redirect the
connection — a fact spec round 3 F3 verified with a driver probe on the live site
`tests/db/watchActivationRace.db.test.ts:35` (`connection: { statement_timeout: 5000 }`, target
unchanged). Any other shape — a steering key at the outer level (`host`, `hostname`, `port`, `path`,
`database`, `db`, `user`, `username`, `password`, `pass`, `ssl`, `socket`), an unknown outer key, an
identifier as options, a spread, a computed key, a non-literal `connection` value — makes the site
`unclassifiable` (default-deny over outer option names, the same posture `resolvePsqlTarget` takes
over DSN query parameters). Measured on the corpus at BASE BY AST, not by regex
(`probe-loaders-options.mts`, committed output beside it): 175 sites, arity `2` at 174 and `1` at 1;
outer keys `max` 173, `prepare` 168, `idle_timeout` 79, `connect_timeout` 69, `connection` 1;
`connection` sub-keys `statement_timeout` 1; non-plain shapes 0; zero-argument calls 0. **The
round-2 draft of this paragraph carried regex-derived counts (`max` 182, and a `statement_timeout` at
the OUTER level that is really the one `connection` sub-key) — spec round 3 F3 found them wrong, and
they are replaced rather than corrected in place.** The zero-argument and steering-option shapes were
found by the pre-round-3 re-analysis (§3.8); the live `connection` sub-key and the AST census are
round 3's.

The accept-set is stated as what it ACCEPTS, keyed on structure, and everything else is reported by
class name. Two things are deliberately NOT modelled: the VALUE of any env var (the census is static
and says nothing about what `TEST_DATABASE_URL` holds — that is `preflight`'s job), and SQL (§1.3
item 2).

**Every site carries an ordinal.** A file's sites are numbered in source order; reports name
`file:line site#n class` so two sites in one file are never conflated.

### §2.4 File class and the helper graph, to a fixpoint

A file's class is the SET of its site classes **after dispositions are applied**: an accepted site
contributes its class; a reported site that a disposition row covers contributes `dispositioned`; a
reported site with NO row contributes `undisposed`. At BASE no file is mixed (§1.1); a mixed file is
legal and reports each site on its own. A file with zero sites of its own that imports a connecting
module INHERITS that module's RESOLVED class set through the import graph. Consequences, stated because
spec round 2 F2 found the draft contradicting itself here: a consumer of a helper whose only site is
dispositioned inherits `dispositioned` and owes NOTHING — the row on the helper's site is the whole
obligation, keyed once where the site lives (the three consumers of `devCaptureStaged` at BASE:
`tests/admin/galleryDatabaseUrl.test.ts`, `tests/e2e/dev-capture.spec.ts`,
`tests/e2e/tap-target-inline-controls.layout.spec.ts`); a consumer of a helper with an UNDISPOSED site
is listed under that helper's report as AFFECTED, and the report is ONE report at the helper, not one
per consumer, so the remedy is one row. The fixpoint runs over:

- **every module-specifier position the parser has** — the same derivation §2.2 uses for the driver —
  whose string is PATH-SHAPED: it starts with `./` or `../` (module-relative), with `/` (root-relative,
  which Vite resolves against the project root and spec round 2 F3 showed is one ordinary edit from
  `tests/api/show-unpublish-route.realdb.test.ts`'s `@/tests/db/_b2Helpers`), or with `<key>/` for a
  key of `REPO_ALIAS` (`vitest.projects.ts:176`, IMPORTED — the shipped alias authority, `{ "@": root }`
  today, so a second alias added there is covered without a census edit). Anything else is a bare
  package specifier and is not followed. A path-shaped specifier that resolves OUTSIDE `tests/`
  (an `@/lib` or `@/app` path) is a PRODUCTION edge, counted and reported in §4.2 as a documented channel,
  not followed (the walk root is `tests/`, the destructive guard's own root): `ImportDeclaration.moduleSpecifier` **with or without an import
  clause** (`import "./_b2Helpers"` is the side-effect form, and it executes the helper's top-level
  `postgres(...)` exactly as a named import does — spec round 1 found it missing from the earlier
  enumeration, one ordinary edit from `tests/db/_b2Helpers.ts:25`), `ExportDeclaration.moduleSpecifier`,
  `ExternalModuleReference.expression` (`import x = require("…")`), the string-literal-like argument of
  `import(...)` (string or no-substitution template — the corpus uses the string form,
  `validation-schema-parity.test.ts:402-404`; the analyzer's whole-diff r9 recorded the template form),
  and the string-literal-like argument of `require(...)`. **A NON-literal specifier in any of these
  positions** (`import(pathToFileURL(file).href)`, a template with substitutions) is an edge the census
  cannot follow and is reported as `unresolved-import` on the importing file — never dropped. FIVE
  live at BASE by AST census (`probe-loaders-options.mts` (a); the round-2 draft said two, from an
  `rg` that did not see a `/* @vite-ignore */` comment before the argument — spec round 3 F2):
  `tests/e2e/helpers/useServerDirectivePlugin.test.ts:153`, `tests/help/render.test.ts:41`,
  `tests/parser/_metaKnownSectionsWalker.test.ts:142`, `tests/parser/_metaTransformSitesWalker.test.ts:67`,
  `tests/parser/fieldNearMiss.test.ts:180` — every target outside `tests/` and non-connecting, each
  carrying an `unclassifiable` row (§2.5);
- **vitest's module loaders are specifier positions too** (spec round 3 F1: `vi.importActual` is
  ordinary authoring, 15 live calls with a literal argument, and `await vi.importActual("@/tests/db/_b2Helpers")`
  inside an existing mock factory would have loaded a connecting helper with no edge). The loader
  accept-set is the members of `vi` that LOAD the named module: `importActual` and `importMock`
  always; `mock` and `doMock` when called WITHOUT a factory (automocking evaluates the original);
  `mock`/`doMock` WITH a factory replace the module and are not edges (an `importActual` inside the
  factory is its own call and is caught); `unmock`/`doUnmock` load nothing. Any OTHER `vi.<member>`
  call whose first argument is a PATH-SHAPED literal is reported as `loader-call` — default-deny over
  loaders, so a member added to vitest later reports rather than passes; `stubGlobal`/`stubEnv` take
  bare names and never trigger it. At BASE: `importActual` 15 (11 production, 4 bare), `mock` 1136
  (834 production, 301 bare, 1 under `tests/` — `../source/spawnBounded`, with a factory), `doMock` 64
  (49 production, 15 bare); ZERO loader edges reach a connecting helper, ZERO `loader-call` reports;
- type-only imports (`import type … from`, `import { type X } from`) are edges too. Executing nothing at
  runtime makes them over-inclusive, and over-inclusion can only ADD an inherited class or a
  disposition obligation, never remove a report; the conservative direction costs a row, the other
  direction is the silent one.

Edges carry no information about WHICH export is used: a file that imports anything from a connecting
helper is treated as connecting through it. Conservative and stated; the alternative is export-level
flow, which is the call-graph §1.3 item 8 declines. Cycles terminate because the fixpoint is over a
finite set of classes. A PATH-SHAPED specifier in any of those positions that cannot be resolved to a file — under `tests/`
or anywhere in the repository — is reported as `unresolved-import` (0 live) rather than dropped — a
dropped edge is the silent
direction.

The five connecting helpers at BASE classify as: `_remediationHelpers` → `guard-bound`;
`_b2Helpers`, `_holdsHelpers`, `_mi11Helpers` → `validation-env`; `devCaptureStaged` →
`unclassifiable` (one `resolver` disposition, §2.5). The 39 helper-only files inherit accordingly.

### §2.5 Dispositions: a registry, both directions, one row per site, keyed so a move REDS

`tests/db/_connectionCensusDispositions.ts (new)` exports `CONNECTION_CENSUS_DISPOSITIONS`, an array of
rows `{ file, site, kind, reason }` where `site` is the connect argument's SOURCE TEXT (or the
acquisition expression's text for `acquisition` rows) and `kind` is a CLOSED UNION:

| kind | admits | BASE rows |
| --- | --- | --- |
| `resolver` | a site whose argument is a call of a function that itself resolves the target through an accept-set (`resolvePsqlTarget` family); the reason names the resolver and its accept-set | 2 — `tests/admin/step3StateGallery.test.ts` `galleryDatabaseUrl()`, `tests/e2e/helpers/devCaptureStaged.ts` `galleryDatabaseUrl(dsn)` |
| `acquisition` | a driver acquisition the census cannot follow to a `const`/import-equals binding (§2.2, residual row); the reason states what the site would have classified as | 0 — `validation-schema-parity.test.ts`'s dynamic import IS followed to its `const` since round 2, and its site classifies `validation-env` on its own |
| `channel` | a file the DESTRUCTIVE guard discovers that the census population does not contain (§2.7) | 0 at BASE — every destructive-discovered file calls the driver; `resetValidationDataPostgrest.test.ts` wipes over REST AND connects, so it is in the population |
| `unclassifiable` | any other reported site or edge, with a reason a reviewer can check | 5 at BASE — the five non-literal dynamic-import edges named in §2.4; every target resolves outside `tests/` to a non-connecting module (a help page, a Vite plugin fixture output, two walker targets, a parser block), which each row's reason states and a reviewer can check by reading the line |

Three assertions, in the meta-test:

1. **Every reported site or acquisition has exactly one row** matching `(file, site)` by text
   equality. An UNDISPOSED report is red, naming `file:line site#n class`.
2. **Every row matches exactly one live report.** A row matching zero is STALE and red (the site was
   repaired, moved, or re-spelled — text-keyed by design, §1.3 item 7); a row matching two is
   AMBIGUOUS and red. Rule 141: a registry needs both directions or it accumulates dead rows.
3. **A row's kind is admissible for what it excuses.** `resolver` rows must name a site whose argument
   is a call; `acquisition` rows must name a non-default-import acquisition; `channel` rows must name a
   file in the destructive guard's discovered set. A `remote-literal` site has NO admissible kind.

**No inline comment exemption.** The destructive guard deleted its inline form after it self-exempted
by coincidence (`_metaDestructiveDbTargetGuard.test.ts`, "There is no inline opt-out"); the census
starts without one. The disposition channel is one line in one file, so dodging is never cheaper
than dispositioning (rule 326), and a rewording that moves a site out of the classifier's view REDS
the row as stale rather than going quiet.

**Keying grain** (rule 16): rows are keyed per SITE, not per file, so a second, unclassifiable site
added later to a file that already carries a row is not absorbed by it.

### §2.6 What is shared and what is deliberately not a copy

- The recognizer: `DESTRUCTIVE_STATEMENT_PATTERNS` is imported for the §2.7 join only. The census
  never runs it on its own behalf and never extends it.
- The comment stripper: `stripCommentsForFile` for the §2.7 join (the destructive guard strips
  before matching; the join must reproduce the discovered set BY CALLING the same function on the
  same inputs — it asserts equality against the destructive guard's own `destructive` list computed
  the same way, not a re-derivation).
- The loopback host set: `ACCEPTED_HOSTS` — **exported from `tests/db/_localDbUrl.ts` for the first
  time** (one-line change to a non-enrolled module; the guard's behaviour is untouched and its
  behavioural suite in `_metaLocalDbUrlGuard.test.ts` still pins it).
- The guard-module resolution: `_localDbUrlScan.isGuardModule` is module-private today. The census
  EXPORTS and IMPORTS it rather than re-implementing the repo-path resolution
  (`tests/db/_localDbUrlScan.ts:40`) — the whole-diff R2/R3 findings that shaped it (a sibling
  `./_localDbUrl` no-op; a nested `tests/vendor/tests/db/_localDbUrl`) would otherwise be re-learned.
  `_localDbUrlScan` is not enrolled, so exporting a function retires no score.
- **The one overlap with `checkConnection`, and why it is a different question.** `checkConnection`
  decides whether a connection in a DESTRUCTIVE file is PROVABLY guarded (const, trusted, ordered).
  The census decides WHICH accept-class a site's argument belongs to, for EVERY file. The
  `guard-bound` branch shares the "const bound to a trusted guard call" shape by necessity, and the
  spec fences it: the census's label carries no safety conclusion (§1.3 item 4), and the meta-test
  asserts that every file in the destructive guard's discovered set is ALSO analyzed by
  `analyseDestructiveFile` exactly as today (§2.7). Two readers of one fact is the drift hazard rule
  280a names; here the two readers answer two facts, and the join is what keeps them from disagreeing
  silently.

### §2.7 The join with the destructive guard

`discoveredByDestructiveGuard = files whose stripped source matches any DESTRUCTIVE_STATEMENT_PATTERNS, minus GUARD_OWN_FILES`
— computed by the same walk, the same stripper, and the same patterns the destructive meta-test uses.
The census asserts `discoveredByDestructiveGuard ⊆ censusPopulation`, reporting each violation as
`channel` — a file that executes destructive SQL without acquiring the driver the census models. At
BASE the difference is empty and the assertion carries a premise that the discovered set is non-empty
(four known files, `_metaDestructiveDbTargetGuard.test.ts` anti-vacuity list) so the subset claim
cannot hold vacuously.

This is the only place the census and the recognizer meet, and it closes the one silent pass the
census alone cannot see: a destructive statement reaching the database through something that is not
`postgres(...)`.

### §2.8 Reports are specific and the suite names the next action

A red names the file, line, site ordinal, class, and the one-line remedy for that class:
`validation-env` needs nothing; `guard-bound` needs nothing; `loopback-literal` needs nothing;
`remote-literal` → "read the target from `TEST_DATABASE_URL` or guard it"; `shadowed-driver` → "rename the
local declaration that reuses the driver binding's name"; `unclassifiable` → "add a
`CONNECTION_CENSUS_DISPOSITIONS` row of kind `resolver` or `unclassifiable` naming this site";
`acquisition` → "use a static default import, or add an `acquisition` row"; stale row → "delete the
row or re-key it to the site's current text". The unrecognized bucket is the specific case and the
message says which case.

### §2.9 Premises, so the walk cannot go vacuous

Every assertion that ranges over the population states its premise executably, via
`premise` / `premiseHolds` from `tests/_shared/premise.ts`, immediately above the assertion and
unconditionally relative to it:

- files walked ≥ 1000 (2542 at BASE);
- files holding a driver binding ≥ 100 (140 at BASE: 139 value default + 1 const-bound dynamic);
- connect sites ≥ 100 (175 at BASE);
- connecting helpers ≥ 3 (5 at BASE), and `tests/db/_b2Helpers` among them by name;
- each accepted class has ≥ 1 live member (`guard-bound` 85 sites, `validation-env` 78,
  `loopback-literal` 9), so a classifier that routes everything to one class reds on the others;
- the destructive guard's discovered set ≥ 4 (§2.7).

The unit suite additionally exercises every class and every report kind on CONSTRUCTED sources
(positive AND negative, the positive twin beside each negative — rule 234's completion of 218a), so
the live corpus is not the only place a branch is reached.

---

## §3 Probes

All probes are committed under `docs/superpowers/specs/ci/probes/2026-08-21-connection-census/`
with their outputs, and the probe directory is the first `.prettierignore` candidate for the plan
(the outputs are evidence and must not be reflowed — rule 79). **Spec round 1 (F3) found the population probe wrong in two places and the prose describing a
correction the committed output did not carry**: its helper label was filename-shaped (`!*.test.*`) and
counted four `tests/e2e/*.spec.ts` consumers as helpers (committed output said 9, prose said 5), and it
counted a type-only default import as an acquisition (140 where the value count is 139). Both are
REPAIRED IN THE SCRIPT — `isSuiteFile` excludes `.spec.` as well as `.test.`, and the default binding
is collected only when `importClause.isTypeOnly` is false — and the committed `.out` was regenerated
from the repaired script at this branch's HEAD, so every number in §1.1 is now copied from a committed
output the committed script reproduces. A probe is a spec input and rots like one; prose that
describes a correction the artifact does not carry is the claim-without-its-evidence shape, and it
is recorded here rather than deleted so a reviewer re-running the old output understands the
difference.

### §3.1 Population (`probe-population.mts`)

Reported in §1.1. The derivation the row's `rg` could not make: 140 direct callers + 39 helper-only
= 179 connection-opening files; 108 without a guard call; the 108 partitioned by in-file env reads
(43 none / 37 `TEST_DATABASE_URL,DATABASE_URL` / 25 `TEST_DATABASE_URL` / 2 with Supabase REST vars /
1 with `SCHEMA_MANIFEST_DB_URL`). The probe follows a `const` bound to a dynamic or `require`
acquisition since spec round 2 (`isDriverAcquisitionExpr`), which is what moved 139 to 140.

### §3.2 URL provenance (`probe-url-classes.mts`)

Reported in §1.1: 175 sites → 85 / 44 / 35 / 9 / 2. The two `other` sites are one function,
`galleryDatabaseUrl`, whose body (`devCaptureStaged.ts:94-110`) routes through `resolvePsqlTarget`
with `envVars: ["DATABASE_URL"]`, `requireLocalSupabase: true`, and no remote opt-in — a resolver with
its own accept-set, hence the `resolver` disposition kind.

### §3.3 Incident replay

Reported in §1.2. Both row incidents confirmed as discovery misses; positive control fires; zero live
executing instances across the corpus (14 textual hits, all prose).

### §3.4 Refuting the loopback-everywhere reading

The 108 unguarded connection-opening files are enumerated in `probe-population.out` with their env
reads and helper routes. Sampled by reading, not by count: `tests/db/resetValidationDataFkAudit.test.ts`
connects to `TEST_DATABASE_URL ?? DATABASE_URL` and runs a read-only FK audit whose test titles name
`reset_validation_data()` — it is the canonical validation-targeting read, it is one of the 14 prose
hits of §3.3, and it executes nothing destructive. Requiring a loopback guard of it would fail a
correct file.

### §3.5 What the census would have reported at BASE, before any disposition

Derived from §3.1-§3.2, §3.8 and the round-3 AST census: 2 `unclassifiable` sites (one function, in
`devCaptureStaged` and in `step3StateGallery`), 5 `unresolved-import` edges (non-literal dynamic
specifiers), 0 `acquisition`, 0 `remote-literal`, 0 `channel`, 0 `shadowed-driver`, 0 `loader-call`,
0 option-set violations. Seven disposition rows, all named in §2.5; the three consumers of `devCaptureStaged` inherit `dispositioned` and owe nothing
(§2.4). A census that reports anything else at BASE has a
false report, which §0 makes a finding.

---

### §3.6 Spec round 1: three findings, all admissible, all repaired

Dispatch `dbconn-spec-r1-20260821-121043`, read at `13e9ee6ad`, verdict NEEDS-ATTENTION, `FINDINGS: 3`.
Breakdown: two real SILENT-PASS defects in the design, one real defect in the probe. Zero refuted.

- **F1 (P1) — file-wide shadowing erased real driver calls silently.** The draft said a shadowed
  binding "is NOT a driver"; the analyzer's file-wide poison is safe there only because the analyzer
  REJECTS. Probed on `tests/admin/extractAgenda.test.ts` with one appended parameter named
  `postgres`: both real connections (lines 76 and 563) vanished with no report. Repaired by the
  `shadowed-driver` row of §2.2 — every call of a twice-declared name REPORTS — and the same rule
  applied to a twice-declared GUARD name in §2.3. Class-swept: the only other "silently not X"
  decision in the design is the type-only import, which is decided by `isTypeOnly` and stays.
- **F2 (P1) — the side-effect import `import "./_b2Helpers"` was not an edge.** The draft
  enumerated `import … from`, `export … from` and `import()`; the clause-less form executes the
  helper's top-level `postgres(...)` and was one ordinary edit away. Repaired by deriving edges from
  EVERY module-specifier position the parser has (§2.4), and applying the same derivation to the
  driver's acquisition forms (§2.2), so the two enumerations share one rule.
- **F3 (P2) — the committed probe did not produce the numbers the spec claimed.** Two defects: a
  type-only default import counted as an acquisition (140 vs 139), and Playwright spec consumers counted
  as helpers (9 vs 5), with prose describing a correction the output did not carry. Repaired in the
  script, output regenerated, numbers re-copied (§3).

The review's offered dispositions for the 18 lint advisories were accepted by the reviewer.

### §3.7 Spec round 2: three findings, all admissible, all repaired

Dispatch `dbconn-spec-r2-20260821-122551`, read at `563612985`, verdict NEEDS-ATTENTION, `FINDINGS: 3`.
Breakdown: two SILENT-PASS defects in the design, one internal inconsistency. Zero refuted.

- **F1 (P1) — a dynamic acquisition's SITES were invisible.** The draft reported the acquisition
  and dispositioned it, and the call at `validation-schema-parity.test.ts:407` was in no census;
  a remote literal there would have stayed unreported behind a green `acquisition` row. Repaired:
  a `const`/import-equals binding initialized from an acquisition expression IS a driver binding
  (§2.2), its sites classify as any other's, and the `acquisition` kind is the residual for
  acquisitions the census cannot follow. Both probes follow the binding now; the census moved
  174→175 sites, 139→140 direct callers, 178→179 files, 107→108 unguarded, and the BASE row count
  3→2. Class-swept: the namespace form (`ns.default(...)`) is given the same treatment rather than
  left to the residual.
- **F2 (P1) — helper dispositions did not inherit, so §2.4, §2.5, §3.5 and §4.5 disagreed.** Three
  consumers of `devCaptureStaged` would have owed rows §2.5 did not list, or gone silent. Repaired:
  a file's class set is taken AFTER dispositions (`dispositioned` inherits; `undisposed` reports
  once at the helper with consumers listed as affected) — §2.4, §3.5, §4.5, AC-C5, AC-C6.
- **F3 (P1) — root-relative specifiers (a leading slash) were outside the edge accept-set.** Vite
  resolves them; the draft listed `./` and `@/tests/` only. Repaired by deriving PATH-SHAPED from the
  module system's two forms plus every key of the imported `REPO_ALIAS` (§2.4), with the residual
  (`@/lib`, `@/app` production edges) counted and recorded as a channel in §4.2 rather than dropped.

### §3.8 Pre-round-3 re-analysis of the silent-pass vector (same-vector rule, applied before the third round)

Rounds 1 and 2 each returned three findings on ONE vector — a connection-opening file, site, or edge
the census neither classified nor reported. The writing-plans rule says a third round on the same
vector is preceded by a comprehensive re-analysis, so before dispatching round 3 every decision point
at which the census DECLINES to follow something was enumerated and each was checked for a report:

| decision point | outcome at BASE | disposition |
| --- | --- | --- |
| walk: file extensions | 0 non-TS files name the driver | walk widened to the JavaScript extensions anyway (§1.1); cost nothing |
| acquisition: specifier spelling | 0 deep imports (a `postgres` sub-path); 0 template-literal `import(\`postgres\`)` outside the analyzer's fixture | specifier match is `isStringLiteralLike` on exactly `"postgres"`; a deep import is a bare package specifier that is NOT the driver and is not followed (documented: the driver has one entry point) |
| site: ZERO arguments | 0 outside comments | `unclassifiable` — libpq `PG*` env decides the target (§2.3) |
| site: the OPTIONS object steering the host | 0 steering keys; 5 outer names and 1 `connection` sub-key live (AST census) | options accept-set with default-deny over outer names; `connection` sub-keys unrestricted by driver probe (§2.3) |
| site: a third argument, a spread, identifier options | 0 | `unclassifiable` (§2.3) |
| edge: non-literal dynamic specifier | 5 live by AST (the round-2 count of 2 was an `rg` miss — round 3 F2) | `unresolved-import` report + `unclassifiable` rows (§2.4, §2.5) |
| edge: a FRAMEWORK loader (`vi.importActual`, automock) | 15 `importActual` calls, none reaching a connecting helper (round 3 F1) | loader accept-set as specifier positions; unknown `vi` member with a path-shaped literal → `loader-call` report (§2.4) |
| edge: path-shaped specifier outside `tests/` | production edges, counted | §4.2 channel, tallied in the gate's printed block |
| edge: type-only import | edges, over-inclusive | §2.4 |
| class: site classes after dispositions | `dispositioned` inherits | §2.4 (round 2 F2) |
| join: destructive file off-channel | 0 | `channel` report (§2.7) |

Three of the ten were new at the re-analysis (zero-argument call, options steering, non-literal
specifier); round 3 added an eleventh (framework loaders) and corrected two counts the re-analysis
had taken from `rg` instead of from the AST. Every number in this table now comes from the three
committed probe scripts.

### §3.9 Spec round 3: four findings, all admissible, all repaired — two of them against the author's own instruments

Dispatch `dbconn-spec-r3-20260821-124846`, read at `d17287a25`, verdict NEEDS-ATTENTION, `FINDINGS: 4`.
Breakdown: two design gaps (F1 loaders, F4 a weaker implementation AC-C3 did not kill), two
measurement defects in the re-analysis's evidence (F2, F3). Zero refuted.

- **F1 (P1) — `vi.importActual` loads a connecting helper with no edge.** Repaired by adding
  vitest's loader members to the specifier-position derivation with an accept-set and a
  `loader-call` report for unknown members (§2.4), measured by AST: 15 live `importActual`, none
  reaching a helper.
- **F2 (P2) — five non-literal dynamic specifiers, not two.** The re-analysis counted by `rg`,
  which did not see `/* @vite-ignore */` between `import(` and its argument. Repaired by an AST
  census (`probe-loaders-options.mts` (a)); §2.4, §2.5, §3.5, §3.8 and AC-C6 now carry five rows.
- **F3 (P1) — a live `connection: { statement_timeout }` would have been `unclassifiable`.** The
  re-analysis's regex census mis-attributed that sub-key to the outer level and over-counted `max`
  (182 vs 173). Repaired: `connection` sub-keys are unrestricted (server GUCs cannot redirect a
  socket, verified by the reviewer's driver probe), the outer set dropped the phantom entry, and the
  counts are the AST census's (§2.3).
- **F4 (P1) — a first-argument-only classifier survived AC-C3.** The plan draft already carried the
  options fixtures; the SPEC's AC did not. Repaired in AC-C3 with nine options fixtures, the first
  argument held fixed, and the weaker implementation named in the fourth column.

**The instrument lesson, recorded because it cost two findings in one round:** every count in this
document that was produced by `rg` over a language with comments, templates and nesting was wrong
at least once (type-only default import, `.spec.` helpers, non-literal specifiers, option keys). The
three committed probes are now the only source for every number in §1, §2.3, §2.4, §3 and §3.8, and
the plan's pre-draft pass re-runs them rather than re-grepping.

## §4 Documented limits

Each is conservative-plus-loud or explicitly out of the row's channel; none is silent.

### §4.1 The census does not read SQL — the spelling miss is closed by CLASSIFICATION, not by recognition

A `validation-env` file that executes a destructive RPC in a spelling `DESTRUCTIVE_STATEMENT_PATTERNS`
does not match is classified `validation-env` and passes the census. It is not discovered by the
destructive guard either — the row's original limit, unchanged in substance. What changed: the file
is no longer SILENT. It is in a named class, in a counted population, and a reviewer or an audit can
enumerate "every validation-env file" mechanically, which at BASE nobody could.

**Live incidence: zero** (§1.2). **Re-file trigger:** a live executing unqualified or quoted-qualified
destructive call found in a `validation-env` file — which the §2.7 join would not see, so the
trigger is a human or a DB-side observation, not this guard. **The terminating answer is DB-side:**
`destructive_reset_gate` already gates `reset_validation_data()` at the database
(`tests/db/destructiveResetGate.test.ts` header); `prune_sync_log` / `prune_app_events` have no such
gate on the validation project. A gate there closes the class regardless of spelling and regardless of
client. That is product-facing work on a surface this arc does not touch — filed as a peer under
class-sweep exception (c), §7.

### §4.2 Other channels, with their counts at BASE

| channel | count | why out of this row |
| --- | --- | --- |
| `createClient(` (supabase-js / ssr) | 12 files | REST; the destructive guard's header already records `resetValidationDataPostgrest.test.ts` as unmodeled |
| PostgREST `fetch` | `destructiveResetGate.test.ts`, `resetValidationDataPostgrest.test.ts` | same |
| `psql` child processes | 65 files | the e2e fixture write path, guarded by `resolvePsqlTarget` on its own terms (spec `2026-08-09-quick-wins-2-mech.md` §2.6) |
| PRODUCTION modules that open connections, reached from tests by an `@/lib` or `@/app` edge | 62 `postgres(` sites under `lib/`, `app/`, `scripts/`; 57 of them pass a module-local `databaseUrl()` reading `TEST_DATABASE_URL ?? DATABASE_URL` (`lib/sync/lockedShowTx.ts:40`, `lib/db/advisoryLock.ts:23` and five more definitions), 5 pass another expression | the walk root is `tests/`, as it is for the destructive guard; production URL provenance is its own accept-set and its own arc. The census COUNTS production edges from test files (reported as a per-file `production-edge` tally in the gate's printed block, never as a red) so the population is visible, and no production module executes a destructive RPC directly (`rg` over `lib app scripts`: one hit, the admin reset action's `serviceClient.rpc("reset_validation_data")` over REST behind `destructive_reset_gate`) |

The §2.7 join catches a DESTRUCTIVE file on any of these channels if it also stops acquiring the
driver; it does not catch a non-destructive file's channel, and does not claim to.

### §4.3 Shapes the classifier declines, by design

Call results, parameters, property reads, conditionals, element accesses, templates with
substitutions, `let`/`var` bindings, import bindings, and mixed `??` chains are `unclassifiable` and
REPORT; a driver or guard name declared twice in a file is `shadowed-driver` / `unclassifiable` and
REPORTS at every call. The walk is not extended for any of them and no scope is resolved (§1.3 item
8). Two live SITES at BASE, one function, one disposition kind, plus five non-literal import edges
(§2.4); zero live shadowings (the three files that spell `postgres` twice do so in comments).

### §4.4 Env VALUES are not read

`validation-env` means "declared to read `TEST_DATABASE_URL`"; whether that variable points at
validation, production, or a loopback is `pnpm preflight`'s question
(`scripts/preflight-env.mjs`). A contributor who points `TEST_DATABASE_URL` at production defeats
every static guard in this repository equally and is outside the fence.

### §4.5 Import edges are module-grain

A file importing an unrelated constant from `_b2Helpers` inherits `validation-env`. Over-inclusion
in an accepted class costs nothing; over-inclusion in a reported-and-dispositioned class costs nothing
either, because `dispositioned` inherits (§2.4). At BASE the 39 helper-only files inherit: 36 an
accepted class (`_b2Helpers`, `_holdsHelpers`, `_mi11Helpers` → `validation-env`; `_remediationHelpers`
→ `guard-bound`), 3 `dispositioned` through `devCaptureStaged`. Export-level flow is declined (§1.3
item 8).

### §4.6 Text-keyed dispositions are a maintenance cost, paid on purpose

A rename of `galleryDatabaseUrl` reds one row as stale. That red is the mechanism noticing a moved
site, and the fix is a one-line re-key with the reason re-read (re-keying is not re-validating).

### §4.7 A mutation score certifies the declared operators, not correctness

Rule 164: the census can score 1.0000 with an empty survivor set while a class it does not model is
live. The score ranges over `OPERATOR_NAMES`; §4.1-§4.5 are outside any operator's reach by
construction and are stated here so the number is read at its real width.

### Dimensional Invariants

None. No UI surface.

### Transition Inventory

None. No UI surface.

---

## §5 Meta-test / registry inventory

**Creates.**

- `tests/db/_connectionCensus.ts (new)` — the importable module: `walkTests`, `acquisitionsIn`,
  `classifySite`, `classifyFile`, `propagateThroughImports`, `censusReport`. Pure functions of
  `(filePath, source)` plus an import resolver injected for the graph, so the unit suite drives them
  on constructed sources and the meta-test drives them on the live tree. No subprocess anywhere
  (rule 102).
- `tests/db/_connectionCensusDispositions.ts (new)` — `CONNECTION_CENSUS_DISPOSITIONS` and the
  `DispositionKind` union.
- `tests/db/connectionCensus.test.ts (new)` — the DECIDING suite: every class, every report kind, every
  acquisition form, positive and negative twins, the fixpoint on a constructed 3-module cycle, the
  both-directions disposition assertions on constructed registries, the `OuterExpressionKinds`
  axis-parity assertion, and the §2.9 premise floors exercised by perturbing their thresholds (rule
  104).
- `tests/db/_metaConnectionCensusGuard.test.ts (new)` — the live-tree gate: population premises, zero
  undisposed reports, zero stale rows, the §2.7 join, and the anti-vacuity list (`_b2Helpers`
  present, `validation-schema-parity.test.ts` classified `validation-env` through its const-bound dynamic acquisition, `galleryDatabaseUrl` dispositioned
  twice). Runs in the same project the destructive meta-test runs in (merge-gating, not nightly —
  rule 229).

**Extends.**

- `tests/db/_localDbUrl.ts` — exports `ACCEPTED_HOSTS` (one line; not enrolled).
- `tests/db/_localDbUrlScan.ts` — exports `isGuardModule` (one line; not enrolled).
- `tests/mutation/source/registry.ts` — row `connectionCensus`: `sourcePath: tests/db/_connectionCensus.ts`,
  `suitePaths` naming the new deciding suite, `operators: [...OPERATOR_NAMES]`, `scoreFloor`
  set from the first measured run minus 0.05 (the `destructiveFileAnalysis` precedent, registry.ts:994),
  a `control` whose `from:` line the suite asserts occurs exactly once (`grep -c -F` = 1 made
  executable — rule 112).
- `tests/mutation/source/expectedLedgerKinds.ts` — row `connectionCensus: {}` until the first run
  says otherwise; survivors are killed or deleted before any `equivalent` row is written (rule 223:
  an empty accepted ledger has no future liability).
- `.prettierignore` — the probe output directory. The deciding suite's fixture
  strings are inline template literals with no syntax-sensitive spelling, so no fixture directory is
  added. If the plan elects a fixture directory, it goes here too.

**Not created.** No new ledger file, no CI workflow change (the gate rides in `unit-suite` where
`tests/db/` already runs), no change to `_metaDestructiveDbTargetGuard.test.ts` or
`_destructiveFileAnalysis.ts` or `_destructiveStatements.ts`.

### §5.1 Score inputs, stamped as a set derived from the contract

Source, declared operators (`tests/mutation/source/operators.ts`), the registry row, the ledger-kinds
row, the deciding suite, and every local module the suite transitively imports (`tests/_shared/premise.ts`,
`tests/_shared/stripComments.ts`, `tests/db/_localDbUrl.ts`, `tests/db/_localDbUrlScan.ts`,
`tests/db/_destructiveStatements.ts`, and the new dispositions module). The deciding suite reads NO live tree — that is the meta-test's
job — so the repository is NOT a score input, which is what keeps the stamp closable. Provenance is
printed inside the measuring invocation, before and after, over that derived list with a floor on its
length.

---

## §6 Acceptance criteria

Every row names the executable step that proves it, the channel the proof arrives on, and the
STRICTLY WEAKER implementation its fixture must kill (rule 17 / 196). A green suite is not proof for
AC-C6 or AC-C9; see their rows.

| id | claim | proved by | weaker implementation killed |
| --- | --- | --- | --- |
| **AC-C1** | Every static VALUE default import of `postgres` yields a driver binding (a type-only default import yields none), and every CALL of a binding whose name is declared nowhere else in the file is a connect site with a source-order ordinal. A binding whose name is ALSO declared elsewhere — parameter, variable, named function or class expression, another import — makes EVERY call of that name a `shadowed-driver` REPORT, including a real top-level call outside the shadowing scope. | unit suite: constructed sources; for each shadow form, a file carrying a real top-level `postgres(process.env.TEST_DATABASE_URL)` AND the shadowing declaration in an unrelated function, asserting ONE `shadowed-driver` report at the top-level call's line and ZERO `validation-env` sites; twin without the declaration → one `validation-env` site, zero reports | a scanner keyed on the callee NAME `postgres` (passes a file importing the driver as `pg`); **a file-wide poison that silently DROPS a shadowed name** (spec round 1 F1: erases `tests/admin/extractAgenda.test.ts:76` and line 563 with no report when one parameter is named `postgres`) |
| **AC-C2** | A `const` or import-equals binding initialized from an acquisition expression (`(await import("postgres")).default`, `require("postgres")`, with the §2.2 unwrap) is a DRIVER BINDING whose calls are connect sites classified exactly as a default import's — asserted by a fixture that is `validation-schema-parity.test.ts`'s shape (dynamic import, `const`, call with an env-bound `raw`) expecting ONE `validation-env` site and ZERO acquisition reports, and its twin with the argument changed to a remote literal expecting ONE `remote-literal` report at the CALL line. A `ns.default(...)` call through a namespace import is a site. Every acquisition the census cannot follow to such a binding — a named value import of `default`, a non-const binding, a value-position reference — is reported as `acquisition`; a type-only import is ignored. | unit suite, one case per form plus twins | a scanner that reports the acquisition and DROPS the sites it produces (spec round 2 F1: `validation-schema-parity.test.ts:407` absent from the census, a remote literal there invisible); a scanner keyed on default imports only; a scanner that reports type-only imports |
| **AC-C3** | Site classification is the accept-set of §2.3 over ALL arguments: the first argument classifies to `guard-bound`, `validation-env` (exact env-name sets, in order, default-deny on any other name), `loopback-literal` (host set imported from `_localDbUrl`), `remote-literal`, `unclassifiable`. For each class, a fixture that lands in it AND a fixture one ordinary edit away that lands elsewhere. **And the options axis, each fixture holding the first argument FIXED at an accepted `validation-env` chain so only the later arguments can decide the observation:** `postgres()` → `unclassifiable`; `postgres(u, { max: 1 })` → `validation-env`; `postgres(u, { host: "db.example.invalid", max: 1 })` → `unclassifiable` naming `host` (one ordinary edit from `tests/db/backfill-email-deliveries-context.test.ts:17`, spec round 3 F4, where postgres.js connects to the overridden host while the URL says loopback); `postgres(u, { unknown_key: 1 })` → `unclassifiable`; `postgres(u, opts)` → `unclassifiable`; `postgres(u, { ...base })` → `unclassifiable`; `postgres(u, { max: 1 }, extra)` → `unclassifiable`; `postgres(u, { connection: { statement_timeout: 5000 } })` → `validation-env` (the live `watchActivationRace.db.test.ts:35` shape); `postgres(u, { connection: opts })` → `unclassifiable`. | unit suite | a classifier keyed on the substring `TEST_DATABASE_URL` (passes `PROD_TEST_DATABASE_URL`; passes `DATABASE_URL ?? TEST_DATABASE_URL` reversed); a classifier that accepts any `process.env.*` read; **a classifier that reads only the FIRST argument** (spec round 3 F4 — passes every first-argument fixture and AC-C6, and is silent while the driver connects to `db.example.invalid`); a classifier that rejects `connection` sub-keys it has not listed (reds the live `statement_timeout` site) |
| **AC-C4** | Every outer-expression wrapper the compiler defines is skipped on the argument AND on each `const` initializer: `url!`, `url as string`, `<string>url`, `url satisfies string`, `(url)`. The axis is asserted against `ts.OuterExpressionKinds`, not a list typed into the test. | unit suite + axis-parity assertion | a classifier unwrapping parentheses only |
| **AC-C5** | The helper graph reaches a fixpoint over EVERY module-specifier position the parser has — import with a clause, **import WITHOUT a clause** (`import "./_b2Helpers"`), `export … from`, `import x = require(…)`, `import("…")`, `require("…")` — for every PATH-SHAPED specifier: `./`, `../`, root-relative (a leading slash, Vite's project-root form), and `<key>/` for each key of the imported `REPO_ALIAS` — on a constructed 3-module cycle; a path-shaped specifier that resolves to no file reports `unresolved-import`; a bare specifier is not an edge. One fixture per specifier position AND one per specifier shape, each asserting the consumer inherits the helper's RESOLVED class; the side-effect-import fixture is one ordinary edit from `tests/db/_b2Helpers.ts:25` (spec round 1 F2); the root-relative fixture is one ordinary edit from `tests/api/show-unpublish-route.realdb.test.ts`'s `@/tests/db/_b2Helpers` (spec round 2 F3). One fixture per LOADER form: `await vi.importActual("./_helper")` inside a `vi.mock` factory → edge (one ordinary edit from `tests/app/admin/setDeveloperAction.test.ts:42`, spec round 3 F1); `vi.mock("./_helper")` without a factory → edge; `vi.mock("./_helper", () => ({}))` → no edge; `vi.unmock("./_helper")` → no edge; `vi.somethingElse("./_helper")` → one `loader-call` report; `vi.stubEnv("X", "y")` → nothing. A consumer of a helper whose only site is DISPOSITIONED inherits `dispositioned` and is absent from every report; a consumer of a helper with an UNDISPOSED site appears as AFFECTED under the helper's single report (spec round 2 F2). | unit suite with an injected resolver | a one-level import walk (passes a helper-of-a-helper); a walk that drops unresolvable specifiers; **a walk keyed on `import … from` that never sees `import "x"`**; **a resolver that filters to `./` and `@/tests/` and silently ignores the root-relative form**; **an edge walk that sees only the parser's own specifier positions and never a `vi.importActual` argument** (spec round 3 F1); an inheritance that propagates the helper's RAW report to every consumer (three false obligations at BASE) or that suppresses it (three silent files) |
| **AC-C6** | The live census at HEAD reports exactly the disposition rows of §2.5 (seven: two `resolver`, five `unclassifiable` edges) and nothing else: 0 undisposed, 0 stale, 0 ambiguous, 0 `remote-literal`, 0 `channel`, 0 `shadowed-driver`, 0 `acquisition`, 0 `unresolved-import`; the three `devCaptureStaged` consumers inherit `dispositioned` and appear in no report. **Not proved by green alone:** every population premise of §2.9 must hold and is asserted unconditionally above the report assertions; the suite prints the per-class site counts so `0 of 0` cannot render as a pass. | meta-test; counts printed and pasted into the PR body | a census whose walk matches nothing (premises red); a census that routes every site to `validation-env` (per-class floors red) |
| **AC-C7** | A disposition row matching no live site is red (stale); a row matching two is red (ambiguous); a report with no row is red (undisposed); a `remote-literal` site is red regardless of rows. Each proved on a constructed registry + constructed sources, both directions. | unit suite | a forward-only registry check (passes a dead row) |
| **AC-C8** | The §2.7 join: the set of files the destructive guard discovers — computed by calling `stripCommentsForFile` then the shared `DESTRUCTIVE_STATEMENT_PATTERNS`, minus `GUARD_OWN_FILES` — is a subset of the census population, with a premise that the discovered set has ≥ 4 members. A constructed destructive file that acquires no driver is reported `channel`. | meta-test (live) + unit suite (constructed) | a join that re-implements the recognizer or the stripper (drift) — killed by a structural assertion that the join module imports `DESTRUCTIVE_STATEMENT_PATTERNS` and `stripCommentsForFile` and declares no regex literal of its own, plus the four-file anti-vacuity premise |
| **AC-C9** | `connectionCensus` is enrolled with a control line occurring exactly once, asserted by the suite; `EXPECTED_LEDGER_KINDS` carries its row; the first measured score is derived through the shipped `score()` and stated in the PR body with provenance stamped inside the measuring invocation over the §5.1 input set. **Not proved by green:** the number is READ from the score function's return, not from the gate log. | `pnpm mutation:guards` on a scoped scratch shard (deleted after; `_metaSourceShardIntegrity` proven red with it present and green without) | — (measurement, not a behaviour) |
| **AC-C10** | `_destructiveFileAnalysis.ts`, `_destructiveStatements.ts`, `_metaDestructiveDbTargetGuard.test.ts` are byte-identical to `origin/main` at merge. | `git diff origin/main...HEAD --stat -- <three paths>` empty, run at closeout | — |
| **AC-C11** | No binder dependence: the module never names `createProgram` or `getTypeChecker`, and every `createSourceFile` call passes `setParentNodes` true. | a structural assertion in the deciding suite over the module's own source (comment-stripped via the shared stripper), plus a positive control that the assertion reds on a constructed source containing `getTypeChecker(` | a module whose upward walks silently no-op on an unparented tree (rule 333) |
| **AC-C12** | The ledger row graduates with the §1.3 item 1 re-scope stated FIRST in the archive entry, the census numbers as its probe record, and the §4.1 peer filed with its exception named. | the closeout commit; set arithmetic over both ledger files (open = union(open) − union(archived); archive union; body-level three-way with `matches-NEITHER` 0) | — |

---

## §7 Ledger disposition

- **Graduates:** `BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION`, on the re-scoped condition of §1.3
  item 1, stated first in the archive entry per rule 195.
- **Files (peer, class-sweep exception (c)):** a product-facing row for a DB-side gate on
  `prune_sync_log` / `prune_app_events` on the validation project, the terminating answer to §4.1
  that no client-side guard reaches. Exception (c) because it is a migration plus RPC change on a
  surface this arc does not touch; `**Facing:** product`; `**Reachability:** INFERRED, NOT PROBED`
  with the named probe being a live `select public.prune_sync_log()` against validation from an
  unguarded client showing rows deleted. The plan carries the row text.
- **Does not file:** a row for the SQL-spelling recognizer (§1.3 item 2 — documented limit, zero
  incidence, re-file trigger stated), a row for other channels (§4.2 — counts recorded, no incident).

---

## §8 Lint disposition

`pnpm spec:lint` output for this document and its plan is attached to every review dispatch, with the
`summary:` line, every finding, and an explicit statement if anything is abridged.
