# `lib/data` Supabase call-boundary meta-test — design

**Date:** 2026-08-09 · **Ledger:** `BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST` (BACKLOG.md) · **Branch:** `test/libdata-call-boundary-metatest`

## §0 Summary

A registry-style structural meta-test, `tests/data/_metaLibDataCallBoundary.test.ts`, that walks `lib/data/**` from disk and requires every Supabase `.from(...)`/`.rpc(...)` call site to be (a) shape-pinned in an in-file registry, (b) discharged to named behavioral coverage, or (c) explicitly waivered inline. It converts the per-read behavioral fail-soft coverage that already exists for `lib/data` into a class-wide, fails-by-default CI guard — the same conversion `tests/auth/_metaInfraContract.test.ts` performed for the auth domain (invariant 9, AGENTS.md).

Test-only arc. Zero production-code behavior change. One production-comment edit (a stale waiver reason, §3.6).

## §1 Resolved scope — do not relitigate

1. **Extend the `_metaInfraContract` pattern; do not modify `tests/auth/_metaInfraContract.test.ts`.** The auth meta-test stays byte-identical. Sibling domains own their own registry-style meta-tests by design (`tests/auth/_metaInfraContract.test.ts`, comment above the orphan-scan test: "Sibling domains (lib/notify, lib/sync, ...) are owned by their own registry-style meta-tests"). Shared mechanics come from `tests/_shared/stripComments.ts` (`stripCommentsForFile`) and `tests/_shared/premise.ts` (`premise`), both of which already exist — nothing is extracted from the auth test. Ratified: BACKLOG.md entry, "Extend the `_metaInfraContract` pattern, don't write a parallel scanner" — the pattern is the registry+orphan-scan+waiver topology, reused with the shared helpers; the auth file itself is not a library.
2. **No behavioral rewrites of `lib/data` call sites.** Both compliant styles are pinned as-is: destructuring (`const { data, error } = await ...`, `lib/data/listShowsForCrew.ts`) and result-object (`const showRes = await ...; if (showRes.error)`, `lib/data/getShowForViewer.ts`). Invariant 9's text says "destructures `{ data, error }` (not bare `data`)"; the result-object form reads `.data`/`.error` off a named result and distinguishes returned-error from thrown identically — it is the established, review-hardened shape across `getShowForViewer.ts` and is compliant. The meta-test pins current shapes; it does not force a style migration.
3. **Threat-model fence:** the guard defends against accidental authoring mistakes by an ordinary contributor — a new read added without error handling, a registered file gaining an unpinned site, a file added to `lib/data` with Supabase calls and no registration. Adversarial obfuscation (dynamic table names, aliased/re-exported clients, computed member access) is out of scope and files to §6 Documented limits.
4. **Consequence bound:** every `lib/data` Supabase call site is shape-pinned, behaviorally discharged, or waivered by name — a new unregistered site fails CI with a message naming the file and the three discharge paths. The guard's failure mode is a red test naming its subject, never silent acceptance. A conservative miss (a call shape the scanner cannot see) is a DOCUMENTED LIMIT (§6), not a finding.
5. **No source-mutation-registry enrollment** (`tests/mutation/source/registry.ts`). The scanner carries its own planted positive AND negative self-test shapes in the same file (§3.5), which is the executable closure for a text scanner; registry enrollment mutates production modules against a suite, which is the wrong grain for a guard whose subject is test-side scanning. Filed as a documented decision, not deferred work.
6. **Bundling:** this arc ships only the meta-test + the stale-waiver reword. The sibling hardening entries named in the ledger row (`BL-ADMIN-POSTGREST-DML-LOCKDOWN`, `BL-RLS-COVERAGE-CROSSCUTTING`) are NOT in scope.

## §2 Current state (live-code citations, verified 2026-08-09)

Corpus: 13 files in `lib/data/` (flat, no subdirectories today; the walker recurses anyway). 17 Supabase call sites across 4 files, verified by the §4 probe:

| File | Sites | Style | Existing coverage |
| --- | --- | --- | --- |
| `lib/data/adminEmails.ts` | 4 (`.from("admin_emails")`, `.rpc("upsert_admin_email_rpc")`, `.rpc("revoke_admin_email_rpc")`, `.rpc("set_admin_developer_rpc")`) | destructuring + `wrapInfra` wrapper (spec R3 F4: the wrapper symbol is `wrapInfra`, `lib/data/adminEmails.ts`) | behavioral: `tests/auth/_metaInfraContract.test.ts` `describe("lib/data/adminEmails")` + `tests/data/adminEmails.test.ts` (first three sites) + `tests/data/setAdminDeveloper.test.ts` (the `set_admin_developer_rpc` site — the only suite exercising it: 16 `setAdminDeveloper` grep matches there, 0 in the other two; spec R1 F3) |
| `lib/data/listShowsForCrew.ts` | 2 (`.rpc("my_share_tokens_for_email")`, `.from("shows")`) | destructuring (`{ data: tokens, error: tokenErr }`, `{ data: shows, error: showErr }`) | `tests/data/listShowsForCrew.test.ts` |
| `lib/data/loadShowShareToken.ts` | 1 (`.rpc("admin_read_share_token")`) | try/catch + `const { data, error } = result` | `tests/data/loadShowShareToken.test.ts` |
| `lib/data/getShowForViewer.ts` | 10 (`.from("crew_members")` ×2, `.from("shows")`, `.from("hotel_reservations")`, `.from("rooms")`, `.from("transportation")`, `.from("contacts")`, `.from("shows_internal")` ×2, `.rpc("viewer_version_token")`) | result-object (`showRes.error`, `hotelRes.error`, …) | `tests/data/getShowForViewer*.test.ts` family (fail-soft per tile), `tests/data/getShowForViewerRunOfShow.test.ts` |

Other `lib/data` files (`decodeRunOfShow.ts`, `diagrams.ts`, `downgradeRunOfShow.ts`, `nameMatch.ts`, `normalizeDateRestriction.ts`, `openingReel.ts`, `showCacheTag.ts`, `transportOwnerResolve.ts`, `viewerContext.ts`) contain no Supabase call site (§4 probe).

Existing waivers in `lib/data/getShowForViewer.ts` (search token `not-subject-to-meta`):

- Above the `.from("shows_internal")` `run_of_show` read: `// not-subject-to-meta: lib/data is outside _metaInfraContract's auth-domain scan` — the reason becomes FALSE the moment this meta-test lands (§3.6 rewords it).
- Near the projection code: `// not-subject-to-meta: projected from the already-fetched shows row` — attached to a non-call site; unaffected by this design (the scanner keys on call sites, not waiver comments in isolation).

The auth-domain template this design mirrors: `tests/auth/_metaInfraContract.test.ts` — registry file list (`SUPABASE_CONSTRUCTOR_CONTRACT_FILES`), per-boundary destructuring regex assertions (`describe("R41 Supabase boundary source registry")`), disk-walking orphan scan over `AUTH_DOMAIN_ROOTS` with three discharge paths, and file-grain waiver honoring (`!source.includes("// not-subject-to-meta:")`).

## §3 Design

### 3.1 File and layering

New file `tests/data/_metaLibDataCallBoundary.test.ts` (name mirrors `_metaInfraContract`; the `tests/data/` directory already runs in the unit suite — sibling tests there are green in CI today). Three layers in one file:

- **Layer 1 — orphan scan** (§3.3): disk walk, fails-by-default for any file with an undischarged call site.
- **Layer 2 — per-site registry reconciliation + shape pins** (§3.4): the scanner's extracted site list is deep-equal-reconciled against ordered registry rows, and every registered row carries its own executable discharge (a shape pin, or a covering-suite citation).
- **Layer 3 — scanner self-tests** (§3.5): planted positive/negative shapes proving the scanner discriminates.

### 3.2 Scanner

```ts
const SUPABASE_CALL_RE = /\.(from|rpc)\(\s*(["'`])([^"'`$]+)\2/g;
```

applied to `stripCommentsForFile(source, file)` output (`tests/_shared/stripComments.ts`). The scanner does not merely detect — it EXTRACTS, per file, the ordered list of `{ kind: "from" | "rpc", literal }` sites (capture groups 1 and 3; group 2 is the quote character, backreferenced so quotes cannot mismatch), which Layer 2 reconciles against the registry. The quote class includes the backtick: a NO-SUBSTITUTION template literal (`` .from(`shows`) ``) is an ordinary string argument that Prettier leaves unchanged, so it must be visible to every layer (spec R2 F2); the `$`-exclusion in the literal class keeps substitution templates (`` .from(`${t}`) ``) out — those are dynamic names and fall under §6.1. The string-literal first-argument anchor is the discriminator: it matches every real Supabase builder/RPC call (all 17 current sites name their table/function as a string literal) and rejects the two known non-Supabase shapes in the corpus — `Array.from(` (`lib/data/normalizeDateRestriction.ts`, `const years = Array.from(`) takes no string literal, and the prose mention of `.from()` in the `adminEmails.ts` `wrapInfra` doc comment is stripped before scanning. Calibration: §4.

### 3.3 Orphan scan (Layer 1)

Walk `lib/data` recursively (same `walk` shape as the auth test, `readdirSync`/`statSync`) accepting `/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/` — the full set of module extensions the toolchain compiles, not only `.ts`/`.tsx` (spec R1 F2: this project's tsconfig includes `**/*.mts`, so a `.mts` module with a Supabase call must not be invisible to the walk; only `.ts` files exist in `lib/data` today, so the widening has zero current-corpus effect). For each file whose comment-stripped source matches `SUPABASE_CALL_RE`, require one of:

1. membership in the Layer 2 registry (every site row reconciled and discharged there),
2. an inline `// not-subject-to-meta: <reason>` waiver — recognized ONLY when both hold (spec R3 F3, tightening the auth test's raw substring check): (a) the ORIGINAL source matches `/\/\/ not-subject-to-meta: \S/` (the reason is non-empty), and (b) the marker is ABSENT from the comment-STRIPPED source — present-in-original plus absent-after-strip proves the marker lives in a comment, so the marker inside a string literal cannot waive. File-grain otherwise, and see the registry-precedence rule below.

(The draft's separate `BEHAVIORAL_CONTRACT_FILES` set is folded INTO the registry: a behavioral discharge is now a per-site registry row whose discharge is a covering-suite citation instead of a shape pin — §3.4. One mechanism, one reconciliation.)

**Registry precedence:** a file with registry rows is reconciled by Layer 2 regardless of any waiver comment it contains. This closes the file-grain-waiver hole for the one file that has both pins and waiver comments (`getShowForViewer.ts`, 10 sites + 2 waiver comments): its sites are individually reconciled; its waiver comments cannot exempt them. Waivers only discharge files with NO registry rows.

Failure message names the file and the three discharge paths (mirrors the auth test's message).

### 3.4 Per-site registry reconciliation (Layer 2)

**Design principle (spec R1 F1):** the reconciliation is DERIVED from the scanner's extraction, never from an authored count. The draft carried a hand-maintained expected-count per file; the R1 probe showed that a new unchecked call plus a count bump passes every layer — the authored number reconciled against itself. So there are no counts. The registry is a per-file ORDERED list of site rows, and the test asserts deep equality between the scanner's extracted `{ kind, literal }` sequence and the registry rows' `{ kind, literal }` sequence, per file, in both directions. A new site changes the extracted sequence and cannot pass without a new registry row — and a registry row cannot exist without a discharge, because the row TYPE requires one:

```ts
type SiteRow = { kind: "from" | "rpc"; literal: string } & (
  | { pin: [RegExp, ...RegExp[]] }                    // shape pin(s), asserted against the file's stripped source
  | { coveredBy: [string, ...string[]]; via: string } // behavioral discharge: covering-suite paths + exported wrapper symbol
);
```

**Row validation (runtime, mirroring `validateSurface` in `tests/mutation/source/registry.ts` — the authoring-time half of the anti-vacuity defence; the non-empty tuple types are the compile-time half, and both exist because a cast defeats either alone):** a `validateRows()` pass runs FIRST in the suite and fails with a named problem list when any row violates:

1. `pin` and `coveredBy` are non-empty (spec R2 F3: an empty array discharges vacuously — `[].every(...)` is `true`);
2. **literal coupling** — at least one `pin` element's `source` contains the row's `literal` (spec R2 F4: without this, copying an existing site's pin into a new row silently discharges an unchecked call; a copied `shows` pin cannot contain `new_table`);
3. for `coveredBy` rows: `via` must EXACTLY match an exported identifier of the scanned source file — the check extracts the file's export names with an anchored regex over the stripped source (`/^export (?:async )?(?:function|const) ([A-Za-z_$][\w$]*)/gm`) and requires `via` to be a member of that set, so an empty `via` and a strict-prefix typo (`addAdmin` for `addAdminEmail`) both fail (spec R3 F2 — a containment predicate passes both); and EACH cited suite must contain the row's `literal` OR its `via` as a whole word — because a suite that mocks at the client boundary never mentions the table literal (spec R2 F1: `tests/data/adminEmails.test.ts` contains `listAdminEmails` 7 times but `admin_emails` zero times; the literal-only check could never be green there).

Registry contents (all 17 sites; the plan enumerates the exact pin regexes, typechecked):

- `lib/data/listShowsForCrew.ts` — 2 pin rows: `/const\s+\{\s*data:\s*tokens,\s*error:\s*tokenErr\s*\}\s*=\s*await\s+supabase\.rpc\("my_share_tokens_for_email"\)/` plus the `if (tokenErr)` throw pin; the matching `{ data: shows, error: showErr }` + `if (showErr)` pins for the `.from("shows")` read.
- `lib/data/loadShowShareToken.ts` — 1 pin row: the try/catch wrap around `supabase.rpc("admin_read_share_token"` and the `const { data, error } = result` + `if (error)` pins.
- `lib/data/getShowForViewer.ts` — 10 pin rows: per-site result-object pins — `.from("hotel_reservations")` read into `hotelRes` with `hotelRes.error` checked; same shape for `showRes`, `roomRes`, `contactsRes`, the two `crew_members` reads, the two `shows_internal` reads, `transportation`, and the `viewer_version_token` RPC (`versionRpc`).
- `lib/data/adminEmails.ts` — 4 `coveredBy` rows: the `admin_emails` read cites `tests/data/adminEmails.test.ts` with `via: "listAdminEmails"` (exported at `lib/data/adminEmails.ts`, `export async function listAdminEmails`; the suite mentions the symbol 7 times but never the table literal — spec R2 F1); the `upsert_admin_email_rpc` / `revoke_admin_email_rpc` sites cite `tests/data/adminEmails.test.ts` (literal present there), `via` `addAdminEmail` / `revokeAdminEmail` (spec R3 F1: the live export wrapping the upsert RPC is `addAdminEmail`, `export async function addAdminEmail` — there is no `upsertAdminEmail` symbol); the `set_admin_developer_rpc` site cites `tests/data/setAdminDeveloper.test.ts` (spec R1 F3), `via: "setAdminDeveloper"`.

**`coveredBy` rows are themselves executable, not prose:** the §3.4 validation asserts suite existence plus literal-or-`via` containment, so a behavioral citation to a suite that never mentions either fails, and a suite deletion or rename fails. This is what makes the behavioral discharge as falsifiable as a pin. (A suite that mentions the symbol without meaningfully exercising the boundary is a documented limit — §6.5.)

The gate-count-reconciliation lesson still holds — produced must equal classified — but the classification is now the registry itself, and the "produced" side is always the live extraction.

### 3.5 Scanner self-tests (Layer 3)

Planted string fixtures (the `plant()` pattern from `tests/docs/_metaLedgerInProgress.test.ts`), asserting the scanner:

- matches `.from("x")`, `.rpc("x")`, single-quote variants, AND no-substitution template literals `` .from(`x`) `` (positive — spec R2 F2);
- does NOT match `Array.from(iterable)`, `Array.from({ length: n })` (negative);
- does NOT match `.from("x")` inside `//` or `/* */` comments (negative — proves the strip is load-bearing);
- does NOT match `.from(tableVar)` or a substitution template `` .from(`${t}`) `` (negatives — the §6.1 documented limit, asserted deliberately so the limit is executable, not prose);
- `validateRows()` self-tests: an empty `pin`/`coveredBy` array is rejected (R2 F3); a row whose pins all lack the literal is rejected (R2 F4); a `coveredBy` row whose suites mention neither literal nor `via` is rejected (R2 F1); an empty `via` and a strict-prefix-typo `via` (`addAdmin`) are rejected by the exact-export check (R3 F2);
- waiver self-tests (R3 F3): a blank-reason marker (`// not-subject-to-meta:` with nothing after) does NOT waive; the marker inside a string literal does NOT waive; a well-formed commented marker DOES waive.

### 3.6 Stale-waiver reword (only production-file edit)

In `lib/data/getShowForViewer.ts`, the waiver above the `run_of_show` read currently reads `// not-subject-to-meta: lib/data is outside _metaInfraContract's auth-domain scan`. Once this meta-test lands, that reason is false. Reword to state the real discharge: the site is registry-pinned by `tests/data/_metaLibDataCallBoundary.test.ts` (and behaviorally covered by `tests/data/getShowForViewerRunOfShow.test.ts`). Comment-only edit; no code change.

### 3.7 Premises (`tests/_shared/premise.ts`)

Executed unconditionally in the suite body, per the guard-premise rule:

- `premise("lib/data files walked", files.length, 3)` — the walk found a non-degenerate corpus;
- `premise("Supabase call sites found", totalSites, 10)` — the scanner sees a non-trivial site population (17 today; the premise floor is deliberately below it so the premise doesn't duplicate the Layer 2 reconciliation, which is exact).

## §4 Corpus probe (run 2026-08-09, pre-draft)

Candidate `grep -rn '\.\(from\|rpc\)("' lib/data/*.ts` (the string-literal anchor, double-quote form): **17 hits, all true Supabase call sites** — 4 in `adminEmails.ts`, 2 in `listShowsForCrew.ts`, 1 in `loadShowShareToken.ts`, 10 in `getShowForViewer.ts`. Zero false positives.

Complement probe (all `.from(`/`.rpc(` WITHOUT the string-literal anchor): exactly 2 lines, both non-Supabase — `lib/data/adminEmails.ts` doc-comment prose (`* failure, .from() throw) AND async-chain throws ALL surface as`) and `lib/data/normalizeDateRestriction.ts` (`const years = Array.from(`). Both rejected by the anchor; the comment is additionally removed by `stripCommentsForFile`.

The shipped scanner adds the single-quote and backtick alternatives the probe's grep omitted (§3.2 quote class); the repo is Prettier-formatted with double quotes, so these widenings have zero current-corpus effect and exist for resilience (single quotes) and R2 F2 closure (no-substitution templates).

## §5 Mutation-family closure set

The convergence criterion for review is this enumerated set, each family carrying an executable self-test or pinned assertion — not open-ended enumeration of imaginable mutants. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| # | Mutant | Killed by |
| --- | --- | --- |
| F1 | A file's registry rows deleted while it still has sites | Layer 1 orphan scan (file now undischarged) |
| F2 | New `.from("x")`/`.rpc("x")` site added to a registered file — with or without a matching bump elsewhere | Layer 2 sequence reconciliation: the extracted `{ kind, literal }` sequence no longer deep-equals the registry rows; passing requires a NEW row, and the row type forces a `pin` or `coveredBy` discharge (no authored count exists to bump — spec R1 F1) |
| F3 | New `lib/data` file (any compiled extension, incl. `.mts` — spec R1 F2) with a Supabase call, no registration/waiver | Layer 1 orphan scan (fails-by-default; disk walk, not a name list) |
| F4 | Error-handling removed at a pinned site (e.g. `if (hotelRes.error)` deleted) | that site's Layer 2 shape pin |
| F5 | Scanner regex corrupted to match nothing | §3.7 premise (`totalSites` floor) + Layer 3 planted positives |
| F6 | Comment-stripping dropped from the scan path | Layer 3 planted commented-call negative |
| F7 | Waiver comment deleted from a waiver-discharged file | Layer 1 (file becomes orphan). No live waiver-discharged file exists today, so this family is expressed through a planted Layer 3 fixture, not the live corpus — stated per the premise rule (construct the environment rather than interrogating the ambient one) |
| F8 | `coveredBy` citation pointed at a suite that never mentions the site's literal or its `via` symbol (or at a deleted/renamed suite) | Layer 2 `coveredBy` executable check: cited path must exist AND contain literal-or-`via` (§3.4) |
| F9 | Discharge emptied: `pin: []` or `coveredBy: []` on a row (R2 F3) | `validateRows()` non-empty rule + non-empty tuple types; planted Layer 3 self-test |
| F10 | Existing pin copied onto a new row for a different literal (R2 F4) | `validateRows()` literal-coupling rule: ≥1 pin element's source must contain the row's literal; planted Layer 3 self-test |
| F11 | Site authored as a no-substitution template literal `` .from(`x`) `` (R2 F2) | §3.2 scanner backtick class + Layer 3 planted positive |

## §6 Documented limits (accepted, not findings)

1. **Dynamic call arguments are invisible.** `.from(tableVar)` / `.rpc(fnVar)` and substitution templates (`` .from(`${t}`) ``) do not match the scanner; no-substitution template literals ARE matched (§3.2, R2 F2), so this limit covers only genuinely dynamic names. No such site exists in `lib/data` (§4), the repo convention is literal table names, and the limit is pinned executable by Layer 3 negative self-tests. Worst case: a dynamically-named read escapes the guard — conservative miss, no silent corruption of anything the guard already covers.
2. **File-grain waivers on unregistered files.** A waiver anywhere in an unregistered file discharges all its sites (inherited from the auth test's semantics; registry precedence in §3.3 closes this for every currently-multi-site file). Worst case: a contributor waivers one site and a second site rides along — the per-site reconciliation does not apply to waiver-discharged files. Accepted: zero waiver-discharged files exist today, and promoting one to the registry is the documented response if one appears.
3. **Shape pins are text pins.** A pin proves the source text contains the compliant shape near the call, not that control flow reaches it. The behavioral suites in §2's table carry the runtime half; this guard is the structural half. Same division as the auth meta-test.
4. **`supabase.auth.*` and storage calls are out of scan scope** — the scanner keys on `.from(`/`.rpc(` only, matching the ledger entry's scope. No such call exists in `lib/data` today; if one lands it is invisible to Layer 1. Files to the same response as limit 2: register or extend the regex when the first site appears.
5. **`coveredBy` proves mention, not exercise.** The executable check on a behavioral row (§3.4) asserts the cited suite exists and contains the site's literal or `via` symbol — it cannot prove the suite meaningfully exercises the boundary. The runtime half stays with the behavioral suites themselves (same division as limit 3). Worst case: a hollow citation passes the structural check — conservative, and visible to any reader following the citation.
6. **Duplicate literals reconcile by position.** The two `.from("shows_internal")` and two `.from("crew_members")` sites in `getShowForViewer.ts` are distinguished only by sequence order, so swapping two same-literal sites' pins misattributes which pin guards which site while both still pass. Harmless today (each pin also names its distinct result variable) and pinned by the ordered deep-equal; noted so a reviewer doesn't re-derive it.
7. **Pin strength beyond literal-coupling is human territory.** `validateRows()` proves a pin is non-empty, matches the source, and embeds its own literal (§3.4); it cannot prove the pin asserts a MEANINGFUL error-handling shape — a contributor could author `pin: [/from\("new_table"\)/]`, which matches the call itself and nothing else. That is deliberate weak authoring, outside the §1.3 fence (accidental mistakes), and lands in PR review where the pin text is visible. Same division as limits 3 and 5: the machine proves presence and coupling; humans review strength.

## §7 Acceptance criteria

- **AC-1** `tests/data/_metaLibDataCallBoundary.test.ts` exists, runs in the unit suite with no new vitest wiring (sibling `tests/data/*.test.ts` already run), and is green on the current tree.
- **AC-2** Layer 1 discovers files from disk with the §3.3 widened extension set. Self-test: a planted in-memory fixture (not a tree mutation) proves an undischarged file shape is flagged; deleting any registered file's rows and running the suite reds (verified once during TDD's red step, not left as a permanent tree mutation).
- **AC-3** All 17 current sites have registry rows: 13 `pin` rows (10 `getShowForViewer.ts` + 2 `listShowsForCrew.ts` + 1 `loadShowShareToken.ts`), 4 `coveredBy` rows (`adminEmails.ts` — `via` symbols `listAdminEmails`/`addAdminEmail`/`revokeAdminEmail`/`setAdminDeveloper`, the last citing `tests/data/setAdminDeveloper.test.ts`).
- **AC-4** Layer 2 asserts ordered deep-equality between the scanner extraction and the registry rows per file, both directions, with NO authored count anywhere in the suite; `validateRows()` (non-empty, literal-coupling, `coveredBy` literal-or-`via`, `via`-exported) runs before any reconciliation and its rejections are covered by planted self-tests per §3.5.
- **AC-5** Layer 3 planted positives and negatives per §3.5, including the documented-limit negative.
- **AC-6** The `run_of_show` waiver reason in `getShowForViewer.ts` no longer claims `lib/data` is outside every scan (§3.6).
- **AC-7** Both §3.7 premises execute unconditionally in the suite body (not inside `.each` callbacks).
- **AC-8** `pnpm test` full suite green locally; real CI green on the PR (local-passes-CI-fails is its own bug class).

## §8 Out of scope

- Any change to `tests/auth/_metaInfraContract.test.ts` (§1.1).
- Behavioral changes to any `lib/data` module (§1.2; the §3.6 comment reword is the only production-file diff).
- Sibling domains (`lib/notify`, `lib/sync`, `app/api/**`) — owned by their own meta-tests per the auth test's domain comment.
- `BL-ADMIN-POSTGREST-DML-LOCKDOWN`, `BL-RLS-COVERAGE-CROSSCUTTING` (§1.6).
- Source-mutation registry enrollment (§1.5).
