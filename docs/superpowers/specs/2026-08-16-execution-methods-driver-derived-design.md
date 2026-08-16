# Execution methods derived from driver types — design

**Arc:** `BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES` (BACKLOG.md) · **Branch:** `test/execution-methods-driver-derived` · **Date:** 2026-08-16

Citation convention in this document: repo-tracked files are cited as backticked `path:line`. Files OUTSIDE the tracked tree (the installed driver's type declarations at node_modules/postgres/types/index.d.ts, called **the driver types file** below, with plain "line N" references) and files this design CREATES (marked "(new)") are named in plain text, since a tracked-file citation cannot exist for them yet.

## 0. Summary

`EXECUTION_METHODS` in `tests/db/_destructiveFileAnalysis.ts:541` is a hand-typed name list. A postgres.js method the list omits is silently not an execution site, so a discovered file can run destructive SQL on an unchecked client and the analyzer returns `ok:true` — the failure mode is acceptance. This shipped once already: `.file()` was absent for the entire life of the surface until diff review R6 probed it (fixture `(ca)`, `tests/db/destructiveFileAnalysis.test.ts:1151`).

This spec makes the query-submitting core of that set **derived from the installed driver's own type declarations** via a committed generated module, and leaves the remaining members as a hand-justified list whose every entry cites the type surface it comes from. The composed set is identical to the shipped one today; the deliverable is drift visibility on a postgres.js upgrade, not a behavior change.

## 1. Probe evidence — the backlog entry's equality claim is wrong, and the design must not inherit it

The backlog entry asserts that measuring the derivation against the current pin "yields exactly the shipped set" of ten members (unsafe, file, begin, end, reserve, savepoint, listen, notify, subscribe, cursor). That was probed against the installed postgres 3.4.9 driver types file on 2026-08-16 (the root package.json pins postgres at caret 3.4.9 on line 96; the installed version was confirmed 3.4.9), and the equality is **false**. The declared return types, all cited to line numbers in the driver types file:

| Member | Declared on, at line | Declared return type | In derivation? |
| --- | --- | --- | --- |
| call as template tag | ISql, 684 | PendingQuery | (not a method member — Rule 1's tagged-template leg handles it) |
| unsafe | ISql, 691 | PendingQuery | yes |
| notify | ISql, 693 | PendingRequest | yes |
| file | ISql, 696-697 (two overloads) | PendingQuery | yes |
| listen | Sql, 711 | ListenRequest | yes |
| begin | Sql, 717-718 | Promise of UnwrapPromiseArray | no |
| end | Sql, 709 | Promise of void | no |
| reserve | Sql, 720 | Promise of ReservedSql | no |
| savepoint | TransactionSql, 724-725 | Promise of UnwrapPromiseArray | no |
| subscribe | Sql, 713 | Promise of SubscriptionHandle | no |
| cursor | PendingQueryModifiers, 617-619 | AsyncIterable / Promise of ExecutionResult | no |
| json | ISql, 698 | Parameter | no — parameter member |
| array | ISql, 695 | ArrayParameter | no — parameter member |

So the literal rule "every method whose declared return type is PendingQuery / PendingRequest / ListenRequest" yields **4 of the 10 shipped members**: unsafe, file, notify, listen. The other 6 — begin, end, reserve, savepoint, subscribe, cursor — have return types the rule does not and should not match.

The entry's *framing sentence* survives the probe in one direction only: every method the types declare as returning those three types **is** an execution site (the subset direction). The equality direction does not. The design therefore asserts the implication, never the equality: the derived core must be a subset of the composed set by construction, and the six remaining members are hand-justified, not derivation theater contorted to reproduce them.

## 1.1 Resolved scope — do not relitigate

- **The equality claim is refuted by probe, not by argument.** The table above is the probe (source: the driver types file at the cited lines). A finding that re-asserts the full-set equality must bring a type declaration that contradicts the table.
- **Test-time parsing of installed type-declaration files is REJECTED** — pre-ratified in the backlog entry ("slow, brittle, install-coupled"). The generator parses at authoring/regeneration time; no vitest suite parses the driver types file. Do not resurrect the test-time parse in any form, including a "freshness" layer.
- **The json and array members stay out of the execution set.** They return Parameter and ArrayParameter (driver types file lines 698 and 695), and they collide with Response and Object members that real destructive files call on non-clients. Fixture `(cb)` (`tests/db/destructiveFileAnalysis.test.ts:1166`) pins the behavior; §2.4's disjointness arm pins the structure. Ratified at the shipped set's own doc comment (`tests/db/_destructiveFileAnalysis.ts:525-540`).
- **The shipped 10-member set does not change.** This arc is drift visibility, not set expansion or contraction. In particular cursor stays in the set although it is a result-modifier member, because removing it is a behavior change out of this arc's scope; and prepare / largeObject / release are NOT added (§4, census entry). A finding proposing membership changes is a re-scope, not a finding on this design.
- **Enrolment precedes review** (AGENTS.md, convergence bullet 4). The derivation module is authored as an importable pure module with a referring fixture suite — the registry-expressible shape — and the plan carries a named enrolment task. Actual mutation-gate runs are the implementation session's job.
- **Threat fence:** ordinary authoring mistakes plus upstream type drift on a postgres.js upgrade. Adversarial obfuscation — of repo test files or of the upstream type declarations — is out of scope and files to §4.

## 2. Design

Four pieces, following the repo's existing generator pattern: `scripts/generate-admin-tables.ts` emitting the generated module at `lib/audit/admin-tables.generated.ts`, whose `@generated ... do not edit` header convention (`scripts/generate-admin-tables.ts:46`) the new module copies; check-mode convention from `scripts/generate-schema-manifest.ts:19-20`; CI freshness-gate convention from the "Verify generated ... is fresh" steps in `.github/workflows/x-audits.yml:31-36`.

### 2.1 Derivation module — scripts/execution-methods/lib.ts (new)

An importable, pure, DB-free module (registry precedent for sources under scripts/: `scripts/lib/ledger-claims-core.ts` is enrolled at `tests/mutation/source/registry.ts:419`). Single exported function:

```ts
export type ExecutionMethodDerivation = {
  /** Method members whose declared return type head is PendingQuery | PendingRequest | ListenRequest. */
  core: string[];
  /** Method members whose declared return type head is Parameter | ArrayParameter. */
  parameterMembers: string[];
};
export function deriveExecutionMethods(dtsSource: string): ExecutionMethodDerivation;
```

Mechanics: parse the source with the TypeScript compiler API (`ts.createSourceFile` — the same dependency the analyzer itself already imports), walk every interface declaration in the file (including interfaces inside `declare namespace` blocks — the real driver types file wraps everything in one), and for every method-signature member with an identifier name, classify by the **head identifier of the declared return type annotation**:

- head is one of PendingQuery, PendingRequest, ListenRequest → `core`
- head is one of Parameter, ArrayParameter → `parameterMembers`
- anything else (including Promise, AsyncIterable, `this`, or no annotation) → not collected

Overloads dedupe by name (file appears twice, at driver types file lines 696-697, and yields one entry). Output arrays are sorted and unique. Property signatures are never candidates — this is what keeps the types / typed / options members (driver types file lines 686-689 and 706) out without naming them: they are not method-signature nodes. The head-identifier rule also handles qualified references (postgres.PendingQuery) by taking the rightmost identifier.

Against postgres 3.4.9 this yields `core = ["file", "listen", "notify", "unsafe"]` and `parameterMembers = ["array", "json"]` (per the §1 table).

### 2.2 Generator — scripts/generate-execution-methods.ts (new), run as pnpm gen:execution-methods

Reads the driver types file and the installed version from the driver package's own package.json under node_modules (a plain readFileSync plus JSON.parse — resolving that file through `require` is blocked by the package's `exports` map, probed 2026-08-16), calls `deriveExecutionMethods`, and writes the committed generated module tests/db/\_\_generated\_\_/postgresExecutionMethods.ts (new):

```ts
// GENERATED by scripts/generate-execution-methods.ts -- do not edit. pnpm gen:execution-methods
export const POSTGRES_TYPES_VERSION = "3.4.9";
export const POSTGRES_EXECUTION_CORE = ["file", "listen", "notify", "unsafe"] as const;
export const POSTGRES_PARAMETER_MEMBERS = ["array", "json"] as const;
```

A `--check` mode mirrors the schema-manifest generator's (`scripts/generate-schema-manifest.ts:19-20`): write nothing, exit 1 if regeneration would change the committed file.

**Freshness wiring, local:** register the generator in the pretest-gen manifest (`scripts/pretest-gen.mjs`, the exported `MANIFEST` array), inputs = the generator, the derivation module, the driver types file, and the driver package's package.json; output = the generated module. The content-hash cache regenerates exactly when an input or the output changes, and `tests/cross-cutting/pretest-gen-manifest.test.ts` pins manifest coverage per its own contract (extend the manifest before adding inputs). A postgres.js bump therefore regenerates on the next local pretest run, and the change lands as a visible diff on a committed file. This is authoring-time parsing under the pretest hook, not a vitest suite parsing installed type declarations — the rejected shape stays rejected.

**Freshness wiring, CI (closes the silent-merge path — spec review R1 finding 1):** the local hook alone is NOT sufficient, because CI runners also run the pretest hook: on an ephemeral runner a dependency bump regenerates the module before the version sentinel runs, the sentinel sees the freshly written version and passes, and the runner then discards the only diff — a stale committed module could merge with green CI. The closure is the repo's existing generated-file gate pattern: a "Verify generated execution-methods module is fresh" step in `.github/workflows/x-audits.yml`, exactly parallel to the existing steps at `.github/workflows/x-audits.yml:31-36` — run the generator, write the diff to a file, then `git diff --exit-code` on the generated module's path — with the diff file ALSO added to the job's artifact-upload path list (the upload step at `.github/workflows/x-audits.yml:60-71`; the freshness step alone only writes the file, and a path missing from the upload list is silently never published). `git diff --exit-code` compares the working tree against HEAD, so it fails on a stale COMMIT regardless of whether the pretest hook regenerated first — order-insensitive by construction. The plan gives this gate the mutant-red treatment required by the gate-command rule in `docs/agents/writing-plans.md` (probe it against a constructed failing input — a hand-edited generated module — and confirm non-zero exit).

### 2.3 Composition in the analyzer

`tests/db/_destructiveFileAnalysis.ts` replaces the hand-typed literal with:

```ts
import { POSTGRES_EXECUTION_CORE } from "./__generated__/postgresExecutionMethods";

/** Client-capability members the derivation deliberately does not produce: each hands out
 *  or manages client capability rather than returning a pending query. Cited to the
 *  postgres 3.4.9 driver types file: begin (line 717) and savepoint (line 724) hand a
 *  TransactionSql to a callback; end (line 709) and reserve (line 720) are session
 *  lifecycle; subscribe (line 713) opens a replication subscription; cursor (line 617)
 *  is the result-iteration member, kept for shipped behavior. */
const CLIENT_CAPABILITY_METHODS = ["begin", "end", "reserve", "savepoint", "subscribe", "cursor"] as const;

export const EXECUTION_METHODS = new Set<string>([...POSTGRES_EXECUTION_CORE, ...CLIENT_CAPABILITY_METHODS]);
```

(The `export` exists for §2.4 arm 2's composition pin; no production caller imports it.)

Composed set today: exactly the shipped 10 members. The derived core cannot silently drop out (it is imported, not retyped), and a regenerated core widens the set automatically — the drift repair is regenerating plus reviewing the diff, never re-remembering the API. The analyzer's fixture corpus (`tests/db/destructiveFileAnalysis.test.ts`) passes unchanged; the existing mutation-registry row (`tests/mutation/source/registry.ts:533-541`) continues to cover the analyzer including the composition site.

### 2.4 Guard suite — tests/db/executionMethodsManifest.test.ts (new)

The referring suite for the derivation module (its enrolment suite, §5). Four arms, none touching installed type-declaration text:

1. **Version sentinel.** Installed postgres version (read from the driver package's package.json under node_modules — a cheap JSON read, not a type-declaration parse) strictly equals `POSTGRES_TYPES_VERSION`. Failure message names the repair: run the generator. This holds even where the pretest hook was bypassed.
2. **Composition pin.** The analyzer exports its composed set (`export const EXECUTION_METHODS`, replacing the module-private const), and the test asserts that exported set equals the shipped 10 members exactly. Asserting the analyzer's own object — not a test-side recomputation from the same inputs — is the anti-tautology requirement: a recomputation would stay green while the analyzer composed differently. A regression pin: the refactor changes nothing today. On a future upstream drift this pin is updated in the same diff the regenerated module lands in — that visibility is the arc's deliverable.
3. **Disjointness.** `POSTGRES_EXECUTION_CORE` and `POSTGRES_PARAMETER_MEMBERS` share no member, and `CLIENT_CAPABILITY_METHODS` and `POSTGRES_PARAMETER_MEMBERS` share no member — the structural half of the json/array exclusion; fixture `(cb)` remains the behavioral half.
4. **Premise guard** (per the anti-tautology rule in `docs/agents/writing-plans.md` and the guard-premise rule filed as BL-GUARD-PREMISE-REACHABILITY): `POSTGRES_EXECUTION_CORE` contains "unsafe" and "file". Against an empty core the sentinel and disjointness arms pass vacuously, and arm 2's composition pin — which WOULD fail today — cannot serve as the derivation's floor, because its expected value is legitimately edited on every real drift: the one round where the pin is being updated is exactly the round a collapsed derivation could slip through. This arm pins the floor the pin cannot: the two members that must derive under every driver version this repo has shipped, and it localizes the diagnosis to the derivation rather than the composition.

### 2.5 Derivation fixture corpus (same suite)

Constructed type-declaration source strings fed to `deriveExecutionMethods` directly, pinning the accept-set (§3):

- a method returning PendingQuery is collected into `core`; two overloads collect once;
- methods returning PendingRequest and ListenRequest are collected;
- a method returning a Promise is NOT collected (the begin shape);
- a method returning Parameter / ArrayParameter lands in `parameterMembers`, not `core`;
- a **property** signature whose type is a function returning Parameter is not collected (the typed shape);
- a qualified return reference (postgres.PendingQuery) is collected;
- a method with no return annotation is not collected;
- an interface inside a `declare namespace` block is walked (the real driver types file's shape).

Every fixture derives its expectation from the fixture's own declared members, never from the live driver — the corpus stays valid across postgres versions.

## 3. Accept-set

The derivation ACCEPTS, keyed on structure rather than spelling: a method-signature member of an interface declaration, named by identifier, whose declared return type annotation's head identifier is one of PendingQuery, PendingRequest, ListenRequest (→ execution core) or Parameter, ArrayParameter (→ parameter members). Everything outside that accept-set is not collected — and "not collected" is safe by direction: a member missing from `core` can only make the composed set NARROWER than intended, never wider, bottoming out at the six-member hand list if the whole core were lost; the §2.4 composition pin makes any narrowing of today's set loud, the version sentinel makes a stale core loud, and the premise guard makes a collapsed derivation loud.

## 4. Documented limits

Conservative-plus-loud or conservative-plus-bounded, none silent-and-wrong:

- **Complete census of the not-collected remainder (discharges the §7 consequence bound; spec review R1 finding 2).** A TypeScript AST census over the installed driver types file (walk with `ts.createSourceFile`, collect every method-signature member with an identifier name, classify by return-type head — the probe script is one ordinary edit from the §2.1 derivation itself) counts **44 method-signature nodes**: 7 collected (5 core nodes across the 4 core names — file has two overloads — plus 2 parameter-member nodes), 10 nodes carrying the 6 hand-list names (begin ×2, savepoint ×2, cursor ×3, end, reserve, subscribe), and **27 remaining nodes**, dispositioned here as one class with three named judgment calls. Census output (2026-08-16):
  ColumnInfo.parser; SubscriptionHandle.unsubscribe; LargeObject.writable / readable / close / tell / read / write / truncate / seek / size; toJSON (top-level augmentation); PendingQueryModifiers.simple / readable / writable / execute / cancel / stream / forEach; PendingValuesQuery.describe; PendingQuery.describe / values / raw; ListenMeta.unlisten; Sql.largeObject; TransactionSql.prepare; ReservedSql.release.
  **Class disposition — result-object and handle members** (everything above except the three client-interface members called out next): their receivers are call results or handle objects, never bare client identifiers, and Rule 1's property-call leg keys exclusively on an identifier receiver that is a checked client (`checkedReceiver`, `tests/db/_destructiveFileAnalysis.ts:423-424`) — membership would add nothing it can act on, while importing exactly the collision class fixture `(cb)` exists for (forEach, readable, close, read, write, and toJSON are everyday member names on arrays, streams, and Response objects). Rule 2 backstops any recognized destructive string routed through them.
  **Named judgment calls — client-interface members excluded from the shipped set:** the prepare member (TransactionSql, driver types file line 727), the largeObject member (Sql, line 715), and the release member (ReservedSql, line 731). prepare submits two-phase-commit SQL and largeObject opens a large-object handle, but both return plain Promises, and prepare is a collision-prone name of exactly the kind the shipped set's own doc comment excludes (`tests/db/_destructiveFileAnalysis.ts:525-540`); release returns void, submits no SQL, and is likewise a common name. Rule 2 backstops all three. Adding any of them is a membership change fenced out by §1.1.

- **Type-alias or renamed indirection in upstream types** (a hypothetical alias of PendingQuery used as a return annotation): the head-identifier match does not resolve aliases, so such a member would drop out of `core`. Consequence: the composed set narrows toward the hand list, and the §2.4 composition pin fails on ANY change to the composed set — including a drop of listen or notify alone — while the premise guard additionally localizes a loss of unsafe or file to the derivation itself. The threat fence applies: upstream types are non-adversarial; an alias refactor upstream arrives together with a version bump, which the sentinel already flags for regeneration and review.
- **New Pending-family return types** (PendingValuesQuery, PendingRawQuery, PendingDescribeQuery at driver types file lines 622-636, or a future sibling): today these appear only as return types of members on **result** interfaces (describe / values / raw on PendingQuery), whose receivers are call results Rule 1 cannot key on anyway (`checkedReceiver` requires an identifier receiver, `tests/db/_destructiveFileAnalysis.ts:423-424`). A future *client-interface* method returning one of them would not enter `core`; Rule 2's statement recognizer is the backstop, as it is for every non-member method today. The re-open triggers below cover it.
- **The generator trusts the installed tree it reads.** If node_modules is absent the generator fails loudly (read error), and the committed module keeps tests running; the version sentinel needs the driver package's package.json, which exists wherever vitest can run at all (tests import the driver).

**Re-open triggers** (kept on the backlog entry if anything above bites): any postgres.js version bump, or a second omission found by review rather than by this guard.

## 5. Mutation enrolment intent

The derivation module is authored in the registry-expressible shape from the start: a pure importable module over a source string, DB-free, with its guard suite (§2.4) as the referring suite — the same shape as the enrolled analyzer row (`tests/mutation/source/registry.ts:523-541`). The plan carries a named task: add a registry row (id executionMethodsDerivation, sourcePath the derivation module, suitePaths its guard suite, operators spread from `OPERATOR_NAMES`, placeholder scoreFloor tightened to measured-minus-0.05 after the first run, per the analyzer row's own convention at `tests/mutation/source/registry.ts:538-541`), run the mutation gate (the mutation:guards script, root package.json line 55) BEFORE the first diff-review dispatch, and state the measured score plus the unaccepted-survivor set in the round-1 brief. A control mutant candidate: inverting the core-classification membership test (accepts every return type into `core`), which fixtures in §2.5 reject.

## 6. Acceptance criteria

- AC-1: the generator writes the generated module with `POSTGRES_TYPES_VERSION` equal to "3.4.9", `POSTGRES_EXECUTION_CORE` equal to the four-member sorted list from §2.2, and `POSTGRES_PARAMETER_MEMBERS` equal to the two-member sorted list from §2.2; `--check` exits 0 on a fresh tree and 1 when regeneration would change the committed file.
- AC-2: `EXECUTION_METHODS` in the analyzer is composed per §2.3 and equals the shipped 10 members; the full existing fixture corpus in `tests/db/destructiveFileAnalysis.test.ts` passes unchanged, including `(ca)` and `(cb)`.
- AC-3: the guard suite implements all four §2.4 arms and the §2.5 fixture corpus, and fails (a) when `POSTGRES_TYPES_VERSION` mismatches the installed version, (b) when the composed set drifts from the pinned 10, (c) when any parameter member enters either half of the composition, (d) when `core` lacks "unsafe" or "file".
- AC-4: the generator is registered in the `MANIFEST` array of `scripts/pretest-gen.mjs` and `tests/cross-cutting/pretest-gen-manifest.test.ts` passes with the new row.
- AC-5: the registry row from §5 exists and the mutation gate runs green with the row's floor satisfied and an empty unaccepted-survivor set (or each survivor dispositioned equivalent / accepted-gap with reasons, per registry convention).
- AC-6: no vitest suite reads or parses the driver types file (the rejected shape); the only test-time read under node_modules is the version sentinel's package.json read.
- AC-7: a "Verify generated execution-methods module is fresh" step exists in `.github/workflows/x-audits.yml` per §2.2's CI freshness wiring (generator run, diff file written, `git diff --exit-code` on the generated module), the diff file's path is present in the job's artifact-upload path list (upload step, `.github/workflows/x-audits.yml:60-71`), and the gate's mutant-red probe (hand-edited generated module, non-zero exit) is recorded in the plan's execution evidence.

## 7. Review convergence bounds

- **Consequence bound** (finite, per §3, and DISCHARGED by the §4 census): the pinned postgres 3.4.9 driver types file holds 44 method-signature nodes; each is collected per the accept-set (7 nodes), carried on the hand list (10 nodes over 6 names), or dispositioned in the §4 census entry (27 nodes). A member whose non-collection worst case is "composed set stays exactly as wide as shipped, Rule 2 backstops, composition pin loud on any composed-set drift" is a DOCUMENTED LIMIT, not a finding.
- **PROBE DOMAIN:** the installed postgres 3.4.9 driver types file, the fixture corpus under tests/db, and the §2.5 constructed fixtures (one ordinary edit from the real file's shapes). A constructed type-declaration input outside that domain files to §4.
- **Threat fence:** ordinary authoring mistakes plus upstream type drift on upgrade. Adversarial obfuscation of test files or upstream types is out of scope and files to §4.
- **Score:** the derivation module is enrolled per §5; a "the guard does not pin what it claims" finding is admissible only with a surviving mutant from the declared operator set.
