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
into exactly one of the four accepted target classes of §2.3, or **REPORTED** by name as
unclassifiable and made to carry a disposition row. The forbidden direction is **silence**: a
connection-opening file, a connect site, or a driver acquisition that the census neither classifies nor
names. A conservative report on a site the census has declined to resolve, plus the disposition row it
demands, is a **DOCUMENTED LIMIT, not a finding** (§4). On the live corpus at BASE the census is green
with exactly the disposition rows §2.5 enumerates and **zero** others; a report the corpus does not need
is a false report and IS a finding.

**What the bound does NOT say.** It does not say every connection is loopback. The census measured the
live corpus (§1.1): 78 of 174 connect sites read the validation project by declared environment
variable, by this repository's ratified posture (`scripts/preflight-env.mjs:146`, "TEST_DATABASE_URL is DELIBERATELY validation"; the destructive
guard's own header, `_metaDestructiveDbTargetGuard.test.ts:7`). The row's phrase "require the loopback
guard of all of them" is **refuted by the census** and re-scoped in §1.3 item 1; the census requires a
**CLASSIFICATION** of all of them. Nor does the bound say the census recognizes destructive SQL. It
does not read SQL at all (§1.3 item 2, §4.1).

**Usefulness is not the criterion; correct classification is.** A site reported unclassifiable that a
human resolves by reading is still correctly reported if the AST cannot resolve it and the census says
so.

**`PROBE DOMAIN:`** the live tracked `tests/**` tree at BASE (2542 `.ts`/`.mts`/`.cts`/`.tsx` files,
of which 140 default-import the driver and 139 call it — §3.1), the five connecting helper modules
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
| files walked under `tests/` | 2542 | `walk()` over TypeScript sources (`.ts`, `.mts`, `.cts`, `.tsx`), `node_modules` and `__generated__` skipped |
| files that default-import `postgres` | 140 | `import postgres from "postgres"` — default binding only |
| files that CALL a default driver binding | 139 | a `CallExpression` whose callee identifier is one of the file's default bindings |
| connect call sites | 174 | same, counted per call |
| non-default imports of `postgres` | 51 | 50 are TYPE-ONLY named imports (`type Sql`); 1 is `(await import("postgres")).default` in `tests/db/validation-schema-parity.test.ts:401` |
| namespace / `require` acquisitions | 0 / 0 | — |
| connecting helper modules (non-test, call the driver directly or transitively) | 5 | `tests/db/_b2Helpers.ts`, `tests/db/_holdsHelpers.ts`, `tests/db/_mi11Helpers.ts`, `tests/db/_remediationHelpers.ts`, `tests/e2e/helpers/devCaptureStaged.ts` |
| test files connecting ONLY through a helper | 39 | import fixpoint over `./` and `@/tests/` specifiers |
| files that import the driver and neither call it nor reach a helper | 1 | `tests/db/_censusRunner.ts` (receives a client) |

**The row's census command over-counted and under-described.** `rg -l 'from "postgres"|require\("postgres"\)' tests/`
returns 145 at BASE: the 140 default importers plus FIVE files whose only import from the module is
a TYPE (`_censusRunner.ts`, `_holdAwareTestkit.ts`, `_roleVocabDriftApplyKit.ts`,
`acknowledge-changes.test.ts`, `readShowChangeFeed.staleness.test.ts`) counted as acquisitions; it
misses the dynamic import, and says nothing about the 39 files that never import the driver and
still open a connection. The
chokepoint is the **CALL**, not the import (rule 272: importing a thing is not invoking it), and the
helper graph is part of the population. `rg` cannot derive either; the committed probe does.

**Per connect site, URL provenance classifies mechanically** (`probe-url-classes.mts`, which walks
each argument through `const` bindings, `??`/`||`, parentheses, `as`, `!`, `satisfies`):

| class | sites | what the argument resolves to |
| --- | --- | --- |
| `guard` | 85 | `assertLocalDbUrl(...)` inline, or a `const` bound to it |
| `env:TEST_DATABASE_URL\|DATABASE_URL` | 44 | `process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL [?? loopback literal]` |
| `env:TEST_DATABASE_URL` | 34 | `process.env.TEST_DATABASE_URL [?? loopback literal]` |
| `literal` | 9 | a `const` bound to the string `"postgresql://postgres:postgres@127.0.0.1:54322/postgres"` (five files, all loopback) |
| `other` | 2 | `galleryDatabaseUrl()` / `galleryDatabaseUrl(dsn)` — a call result; resolves through `resolvePsqlTarget` with `requireLocalSupabase: true` |

Files with MIXED site classes: **0**. Every file's sites share one class, which is what makes a
per-FILE class well-defined (§2.4).

**Guard coverage over the whole population:** 178 connection-opening files (139 direct + 39 via a
helper); 71 call a loopback guard, **107 do not**. Of the 107, 43 read no env var in-file (they reach a
helper that does), 62 read `TEST_DATABASE_URL` (37 of them with the `DATABASE_URL` fallback), 2 read
it alongside Supabase REST variables. None is a defect. They are the validation-targeting half of the
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
   stated here first** (rule 195). 107 of 178 connection-opening files target the validation project
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
   whole corpus needs two of them.

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
| `import postgres from "postgres"` (default binding) | the ONLY form whose calls are classified as connect sites | 140 files |
| `import { type Sql } from "postgres"` / `import type … from "postgres"` | a type — not an acquisition; ignored | 50 |
| `import { default as x } from "postgres"`, `import * as ns from "postgres"`, `require("postgres")`, `await import("postgres")` | **ACQUISITION-UNCLASSIFIABLE**: the file enters the population and REPORTS until a disposition row of kind `acquisition` names it | 0 / 0 / 0 / 1 (`validation-schema-parity.test.ts:401`) |
| a default binding re-bound to another name (`const pg = postgres`) or passed as a value | the re-binding is reported as `acquisition` too: any identifier reference to a default driver binding that is not the callee of a call | 0 |

The fourth row is what makes the chokepoint COMPLETE rather than merely unique (rule 332a): a client
obtained by aliasing the binding is not silently "not a connect site", it is a reported acquisition.
The unrecognized bucket is a SPECIFIC case — a value-position reference to the driver that is not a
direct call — never the default; a type-only import is decided (ignored) because `isTypeOnly` says so,
and a named value import is decided (reported) because the driver's default export is the only
constructor.

Module-specifier matching is exact-string on `"postgres"`. A re-export of the driver from a `tests/`
module (`export { default } from "postgres"`) is an acquisition by that module and REPORTS there
(0 live). No binder, no `Program`, no `getTypeChecker`: every walk runs over a `ts.createSourceFile(...,
setParentNodes: true)` tree, which is the one configuration in which `.parent` is populated by the
parser itself (rule 333 names the program-built tree WITHOUT that flag as the hazard, and
`_destructiveFileAnalysis.ts:651` and `_localDbUrlScan.ts:441` both rely on the same flag). The
deciding suite asserts the module never names `createProgram` or `getTypeChecker`.

### §2.3 Site classification: an accept-set over URL provenance, default-deny

For each connect site — a `CallExpression` whose callee is an unshadowed default driver binding — the
census resolves the FIRST argument through a walk that unwraps parentheses, `as`, `!`, `satisfies`
(the compiler's `OuterExpressionKinds`, read from the enum), follows an identifier to EVERY
declaration of that name in the file (any-declaration rule, no scope resolution — the same conservative
answer `checkConnection` and `_localDbUrlScan` give), and descends `??` / `||` chains. The result is
one of:

| class | accepted iff | failure direction if the classifier is wrong |
| --- | --- | --- |
| `guard-bound` | the expression is a call of a guard name imported from `tests/db/_localDbUrl` (resolved by repo path, exactly as `_localDbUrlScan.isGuardModule`), or every declaration of the identifier is a `const` initialized from one | over-acceptance would mislabel a non-guarded site as guarded — **but no safety conclusion rests on this label** (§1.3 item 4); the destructive guard still decides effectiveness |
| `validation-env` | the `??`/`||` chain's env reads are EXACTLY `[TEST_DATABASE_URL]` or `[TEST_DATABASE_URL, DATABASE_URL]` in that order, every other operand is a loopback literal, and no guard call appears | a chain with any other env NAME or ORDER is `unclassifiable` — default-deny over env names, so `PROD_DATABASE_URL` reports rather than passes |
| `loopback-literal` | a string or no-substitution template literal whose `new URL(...).hostname` is in the loopback host set shared with `assertLocalDbUrl` (`ACCEPTED_HOSTS`, imported — not copied) | a literal with any other host is **`remote-literal`**, which no disposition kind accepts: a hard-coded remote DSN in a test is repaired, never excused |
| `unclassifiable` | anything else: a call result, a parameter, a property read, a conditional, an element access, a template with substitutions, a `let`/`var` binding, an IMPORT binding (an imported URL constant is a declaration the walk does not follow across files — `_destructiveFileAnalysis.ts` whole-diff r14 counts imports as declarations for the same reason), an identifier with no declaration, a mixed chain | REPORTS; carries a disposition row of kind `resolver` or `unclassifiable` or the suite is red |

The accept-set is stated as what it ACCEPTS, keyed on structure, and everything else is reported by
class name. Two things are deliberately NOT modelled: the VALUE of any env var (the census is static
and says nothing about what `TEST_DATABASE_URL` holds — that is `preflight`'s job), and SQL (§1.3
item 2).

**Every site carries an ordinal.** A file's sites are numbered in source order; reports name
`file:line site#n class` so two sites in one file are never conflated.

### §2.4 File class and the helper graph, to a fixpoint

A file's class is the SET of its site classes. At BASE no file is mixed (§1.1); a mixed file is legal
and reports each site on its own. A file with zero sites of its own that imports a connecting module
INHERITS that module's class set through the import graph, computed as a fixpoint over:

- static `import … from "<spec>"` and `export … from "<spec>"` where `<spec>` resolves under `tests/`
  (relative `./`, `../`, or the `@/tests/` alias — the two forms live in the corpus; a bare specifier
  is a package and is not followed);
- `await import("<spec>")` with a string-literal specifier under `tests/` (the corpus uses this form,
  `validation-schema-parity.test.ts:402-404`).

Edges carry no information about WHICH export is used: a file that imports anything from a connecting
helper is treated as connecting through it. Conservative and stated; the alternative is export-level
flow, which is the call-graph §1.3 item 8 declines. Cycles terminate because the fixpoint is over a
finite set of classes. An import whose specifier cannot be resolved to a tracked file under `tests/`
is reported as `unresolved-import` (0 live) rather than dropped — a dropped edge is the silent
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
| `acquisition` | a driver acquisition that is not a static default import; the reason states the URL class the census would assign if it could follow it | 1 — `tests/db/validation-schema-parity.test.ts` `(await import("postgres")).default` (its `raw` is `process.env.TEST_DATABASE_URL`, read at 393) |
| `channel` | a file the DESTRUCTIVE guard discovers that the census population does not contain (§2.7) | 0 at BASE — every destructive-discovered file calls the driver; `resetValidationDataPostgrest.test.ts` wipes over REST AND connects, so it is in the population |
| `unclassifiable` | any other reported site, with a reason a reviewer can check | 0 at BASE |

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
`remote-literal` → "read the target from `TEST_DATABASE_URL` or guard it"; `unclassifiable` → "add a
`CONNECTION_CENSUS_DISPOSITIONS` row of kind `resolver` or `unclassifiable` naming this site";
`acquisition` → "use a static default import, or add an `acquisition` row"; stale row → "delete the
row or re-key it to the site's current text". The unrecognized bucket is the specific case and the
message says which case.

### §2.9 Premises, so the walk cannot go vacuous

Every assertion that ranges over the population states its premise executably, via
`premise` / `premiseHolds` from `tests/_shared/premise.ts`, immediately above the assertion and
unconditionally relative to it:

- files walked ≥ 1000 (2542 at BASE);
- files acquiring the driver ≥ 100 (141 at BASE: 140 default + 1 dynamic);
- connect sites ≥ 100 (174 at BASE);
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
(the outputs are evidence and must not be reflowed — rule 79). Probe scripts got their own mini-
review before their numbers entered this document: the population probe's helper label was
filename-shaped (`!*.test.*`) and over-counted four `tests/e2e/*.spec.ts` files as "helpers" — those
are consumers of `_b2Helpers`/`devCaptureStaged`, and the corrected helper count (5) is what §1.1
states; the `other-import` count (51) includes the 50 type-only imports, separated by the second
probe.

### §3.1 Population (`probe-population.mts`)

Reported in §1.1. The derivation the row's `rg` could not make: 139 direct callers + 39 helper-only
= 178 connection-opening files; 107 without a guard call; the 107 partitioned by in-file env reads
(43 none / 37 `TEST_DATABASE_URL,DATABASE_URL` / 25 `TEST_DATABASE_URL` / 2 with Supabase REST vars).

### §3.2 URL provenance (`probe-url-classes.mts`)

Reported in §1.1: 174 sites → 85 / 44 / 34 / 9 / 2. The two `other` sites are one function,
`galleryDatabaseUrl`, whose body (`devCaptureStaged.ts:94-110`) routes through `resolvePsqlTarget`
with `envVars: ["DATABASE_URL"]`, `requireLocalSupabase: true`, and no remote opt-in — a resolver with
its own accept-set, hence the `resolver` disposition kind.

### §3.3 Incident replay

Reported in §1.2. Both row incidents confirmed as discovery misses; positive control fires; zero live
executing instances across the corpus (14 textual hits, all prose).

### §3.4 Refuting the loopback-everywhere reading

The 107 unguarded connection-opening files are enumerated in `probe-population.out` with their env
reads and helper routes. Sampled by reading, not by count: `tests/db/resetValidationDataFkAudit.test.ts`
connects to `TEST_DATABASE_URL ?? DATABASE_URL` and runs a read-only FK audit whose test titles name
`reset_validation_data()` — it is the canonical validation-targeting read, it is one of the 14 prose
hits of §3.3, and it executes nothing destructive. Requiring a loopback guard of it would fail a
correct file.

### §3.5 What the census would have reported at BASE, before any disposition

Derived from §3.1-§3.2: 2 `unclassifiable` sites (one function), 1 `acquisition`, 0 `remote-literal`,
0 `unresolved-import`, 0 `channel`. Three disposition rows, all named in §2.5. A census that reports
anything else at BASE has a false report, which §0 makes a finding.

---

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

The §2.7 join catches a DESTRUCTIVE file on any of these channels if it also stops acquiring the
driver; it does not catch a non-destructive file's channel, and does not claim to.

### §4.3 Shapes the classifier declines, by design

Call results, parameters, property reads, conditionals, element accesses, templates with
substitutions, `let`/`var` bindings, and mixed `??` chains are `unclassifiable` and REPORT. The walk is
not extended for any of them (§1.3 item 8). Two live at BASE, one function, one disposition kind.

### §4.4 Env VALUES are not read

`validation-env` means "declared to read `TEST_DATABASE_URL`"; whether that variable points at
validation, production, or a loopback is `pnpm preflight`'s question
(`scripts/preflight-env.mjs`). A contributor who points `TEST_DATABASE_URL` at production defeats
every static guard in this repository equally and is outside the fence.

### §4.5 Import edges are module-grain

A file importing an unrelated constant from `_b2Helpers` inherits `validation-env`. Over-inclusion
in an accepted class costs nothing; over-inclusion in a reported class would cost a disposition row,
and the 39 helper-only files at BASE all inherit accepted classes. Export-level flow is declined
(§1.3 item 8).

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
  present, `validation-schema-parity.test.ts` dispositioned, `galleryDatabaseUrl` dispositioned
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
| **AC-C1** | Every static default import of `postgres` yields a driver binding, and every CALL of an unshadowed binding is a connect site with a source-order ordinal. A shadowed binding (parameter, local `const`, named function expression) is NOT a driver. | unit suite: constructed sources, each shadow form one variable away from an accepted call | a scanner keyed on the callee NAME `postgres` (passes a file importing the driver as `pg`; passes a local `function postgres()`) |
| **AC-C2** | Every non-default acquisition — named value import, namespace import, `require`, dynamic import, and a value-position reference to a default binding that is not a direct callee — is reported as `acquisition`; a type-only import is ignored. Positive twin: the same file with the acquisition replaced by a static default import reports nothing. | unit suite, one case per form plus the twin | a scanner that reports only dynamic import (passes `import * as ns`) ; a scanner that reports type-only imports (false report) |
| **AC-C3** | Site classification is the accept-set of §2.3: `guard-bound`, `validation-env` (exact env-name sets, in order, default-deny on any other name), `loopback-literal` (host set imported from `_localDbUrl`), `remote-literal`, `unclassifiable`. For each class, a fixture that lands in it AND a fixture one ordinary edit away that lands elsewhere. | unit suite | a classifier keyed on the substring `TEST_DATABASE_URL` (passes `PROD_TEST_DATABASE_URL`; passes `DATABASE_URL ?? TEST_DATABASE_URL` reversed); a classifier that accepts any `process.env.*` read |
| **AC-C4** | Every outer-expression wrapper the compiler defines is skipped on the argument AND on each `const` initializer: `url!`, `url as string`, `<string>url`, `url satisfies string`, `(url)`. The axis is asserted against `ts.OuterExpressionKinds`, not a list typed into the test. | unit suite + axis-parity assertion | a classifier unwrapping parentheses only |
| **AC-C5** | The helper graph reaches a fixpoint over static imports, re-exports, and string-literal dynamic imports under `tests/`, through `./` and `@/tests/` specifiers, on a constructed 3-module cycle; a specifier that resolves to no tracked file reports `unresolved-import`. | unit suite with an injected resolver | a one-level import walk (passes a helper-of-a-helper); a walk that drops unresolvable specifiers |
| **AC-C6** | The live census at HEAD reports exactly the disposition rows of §2.5 and nothing else: 0 undisposed, 0 stale, 0 ambiguous, 0 `remote-literal`, 0 `channel`. **Not proved by green alone:** every population premise of §2.9 must hold and is asserted unconditionally above the report assertions; the suite prints the per-class site counts so `0 of 0` cannot render as a pass. | meta-test; counts printed and pasted into the PR body | a census whose walk matches nothing (premises red); a census that routes every site to `validation-env` (per-class floors red) |
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
