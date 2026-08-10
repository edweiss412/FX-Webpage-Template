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
| `lib/data/adminEmails.ts` | 4 (`.from("admin_emails")`, `.rpc("upsert_admin_email_rpc")`, `.rpc("revoke_admin_email_rpc")`, `.rpc("set_admin_developer_rpc")`) | destructuring + `runAdminEmailWrite` wrapper | behavioral: `tests/auth/_metaInfraContract.test.ts` `describe("lib/data/adminEmails")` + `tests/data/adminEmails.test.ts` |
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
- **Layer 2 — registry shape pins + site-count tripwire** (§3.4): per-site regex assertions + per-file expected-count reconciliation.
- **Layer 3 — scanner self-tests** (§3.5): planted positive/negative shapes proving the scanner discriminates.

### 3.2 Scanner

```ts
const SUPABASE_CALL_RE = /\.(?:from|rpc)\(\s*["']/g;
```

applied to `stripCommentsForFile(source, file)` output (`tests/_shared/stripComments.ts`). The string-literal first-argument anchor is the discriminator: it matches every real Supabase builder/RPC call (all 17 current sites name their table/function as a string literal) and rejects the two known non-Supabase shapes in the corpus — `Array.from(` (`lib/data/normalizeDateRestriction.ts`, `const years = Array.from(`) takes no string literal, and the prose mention of `.from()` in the `adminEmails.ts` `runAdminEmailWrite` doc comment is stripped before scanning. Calibration: §4.

### 3.3 Orphan scan (Layer 1)

Walk `lib/data` recursively (same `walk` shape as the auth test, `readdirSync`/`statSync`, `.ts`/`.tsx` files). For each file whose comment-stripped source matches `SUPABASE_CALL_RE`, require one of:

1. membership in `REGISTERED_FILES` (Layer 2 pins it),
2. membership in `BEHAVIORAL_CONTRACT_FILES` — today exactly `{ "lib/data/adminEmails.ts" }`, discharged to the named suites in §2's table,
3. an inline `// not-subject-to-meta: <reason>` waiver (file-grain, matching the auth test's semantics — but see the registry-precedence rule below).

**Registry precedence:** a file in `REGISTERED_FILES` is pinned by Layer 2 regardless of any waiver comment it contains. This closes the file-grain-waiver hole for the one file that has both pins and waiver comments (`getShowForViewer.ts`, 10 sites + 2 waiver comments): its sites are individually pinned; its waiver comments cannot exempt them. Waivers only discharge files that are NOT registered.

Failure message names the file and the three discharge paths (mirrors the auth test's message).

### 3.4 Registry pins + count tripwire (Layer 2)

`REGISTERED_FILES` = `lib/data/getShowForViewer.ts`, `lib/data/listShowsForCrew.ts`, `lib/data/loadShowShareToken.ts`. Per file:

- **Shape pins** — one regex assertion per call site pinning the error-handling shape, in the style of the auth test's R41 rows. Representative pins (the plan enumerates all 17 with exact regexes, typechecked):
  - `listShowsForCrew.ts`: `/const\s+\{\s*data:\s*tokens,\s*error:\s*tokenErr\s*\}\s*=\s*await\s+supabase\.rpc\("my_share_tokens_for_email"\)/` and the matching `{ data: shows, error: showErr }` pin for the `.from("shows")` read, plus the `if (tokenErr)` / `if (showErr)` throw pins.
  - `loadShowShareToken.ts`: the try/catch wrap around `supabase.rpc("admin_read_share_token"` and the `const { data, error } = result` + `if (error)` pins.
  - `getShowForViewer.ts`: per-site result-object pins — e.g. `.from("hotel_reservations")` is read into `hotelRes` and `hotelRes.error` is checked; same for `showRes`, `roomRes`, `contactsRes`, the two `crew_members` reads, the two `shows_internal` reads, `transportation`, and the `viewer_version_token` RPC (`versionRpc`).
- **Count tripwire** — the registry row carries the file's expected site count (`getShowForViewer.ts: 10`, `listShowsForCrew.ts: 2`, `loadShowShareToken.ts: 1`); the test counts `SUPABASE_CALL_RE` matches in the comment-stripped source and fails on mismatch in either direction. This is what catches a NEW call added to an already-registered file — the class the file-grain auth scan cannot see. (Echoes the gate-count-reconciliation lesson: the gate reconciles its own counts; produced must equal classified.)
- **Behavioral-discharge count pin** — `adminEmails.ts` is not shape-pinned here (its contract lives in the behavioral suites), but its site count (4) IS pinned by the tripwire, so a fifth site added to it fails here and must be dispositioned.

### 3.5 Scanner self-tests (Layer 3)

Planted string fixtures (the `plant()` pattern from `tests/docs/_metaLedgerInProgress.test.ts`), asserting the scanner:

- matches `.from("x")` and `.rpc("x")` and single-quote variants (positive);
- does NOT match `Array.from(iterable)`, `Array.from({ length: n })` (negative);
- does NOT match `.from("x")` inside `//` or `/* */` comments (negative — proves the strip is load-bearing);
- does NOT match `.from(tableVar)` (negative — and this is the §6.1 documented limit, asserted deliberately so the limit is executable, not prose).

### 3.6 Stale-waiver reword (only production-file edit)

In `lib/data/getShowForViewer.ts`, the waiver above the `run_of_show` read currently reads `// not-subject-to-meta: lib/data is outside _metaInfraContract's auth-domain scan`. Once this meta-test lands, that reason is false. Reword to state the real discharge: the site is registry-pinned by `tests/data/_metaLibDataCallBoundary.test.ts` (and behaviorally covered by `tests/data/getShowForViewerRunOfShow.test.ts`). Comment-only edit; no code change.

### 3.7 Premises (`tests/_shared/premise.ts`)

Executed unconditionally in the suite body, per the guard-premise rule:

- `premise("lib/data files walked", files.length, 3)` — the walk found a non-degenerate corpus;
- `premise("Supabase call sites found", totalSites, 10)` — the scanner sees a non-trivial site population (17 today; the premise floor is deliberately below it so the premise doesn't duplicate the count tripwire).

## §4 Corpus probe (run 2026-08-09, pre-draft)

Candidate `grep -rn '\.\(from\|rpc\)("' lib/data/*.ts` (the string-literal anchor, double-quote form): **17 hits, all true Supabase call sites** — 4 in `adminEmails.ts`, 2 in `listShowsForCrew.ts`, 1 in `loadShowShareToken.ts`, 10 in `getShowForViewer.ts`. Zero false positives.

Complement probe (all `.from(`/`.rpc(` WITHOUT the string-literal anchor): exactly 2 lines, both non-Supabase — `lib/data/adminEmails.ts` doc-comment prose (`* failure, .from() throw) AND async-chain throws ALL surface as`) and `lib/data/normalizeDateRestriction.ts` (`const years = Array.from(`). Both rejected by the anchor; the comment is additionally removed by `stripCommentsForFile`.

The shipped scanner adds the single-quote alternative (`["']`) the probe's grep omitted; the repo is Prettier-formatted with double quotes, so this widening has zero current-corpus effect and exists for resilience only.

## §5 Mutation-family closure set

The convergence criterion for review is this enumerated set, each family carrying an executable self-test or pinned assertion — not open-ended enumeration of imaginable mutants. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| # | Mutant | Killed by |
| --- | --- | --- |
| F1 | Registered file removed from `REGISTERED_FILES` while it still has sites | Layer 1 orphan scan (file now undischarged) |
| F2 | New `.from("x")`/`.rpc("x")` site added to a registered or behavioral file | Layer 2 count tripwire (expected ≠ actual) |
| F3 | New `lib/data` file with a Supabase call, no registration/waiver | Layer 1 orphan scan (fails-by-default; disk walk, not a name list) |
| F4 | Error-handling removed at a pinned site (e.g. `if (hotelRes.error)` deleted) | that site's Layer 2 shape pin |
| F5 | Scanner regex corrupted to match nothing | §3.7 premise (`totalSites` floor) + Layer 3 planted positives |
| F6 | Comment-stripping dropped from the scan path | Layer 3 planted commented-call negative |
| F7 | Waiver comment deleted from a waiver-discharged file | Layer 1 (file becomes orphan). No live waiver-discharged file exists today, so this family is expressed through a planted Layer 3 fixture, not the live corpus — stated per the premise rule (construct the environment rather than interrogating the ambient one) |

## §6 Documented limits (accepted, not findings)

1. **Non-literal call arguments are invisible.** `.from(tableVar)` / `.rpc(fnVar)` does not match the scanner. No such site exists in `lib/data` (§4), the repo convention is literal table names, and the limit is pinned executable by a Layer 3 negative self-test. Worst case: a dynamically-named read escapes the guard — conservative miss, no silent corruption of anything the guard already covers.
2. **File-grain waivers on unregistered files.** A waiver anywhere in an unregistered file discharges all its sites (inherited from the auth test's semantics; registry precedence in §3.3 closes this for every currently-multi-site file). Worst case: a contributor waivers one site and a second site rides along — the count tripwire does not apply to waiver-discharged files. Accepted: zero waiver-discharged files exist today, and promoting one to the registry is the documented response if one appears.
3. **Shape pins are text pins.** A pin proves the source text contains the compliant shape near the call, not that control flow reaches it. The behavioral suites in §2's table carry the runtime half; this guard is the structural half. Same division as the auth meta-test.
4. **`supabase.auth.*` and storage calls are out of scan scope** — the scanner keys on `.from(`/`.rpc(` only, matching the ledger entry's scope. No such call exists in `lib/data` today; if one lands it is invisible to Layer 1. Files to the same response as limit 2: register or extend the regex when the first site appears.

## §7 Acceptance criteria

- **AC-1** `tests/data/_metaLibDataCallBoundary.test.ts` exists, runs in the unit suite with no new vitest wiring (sibling `tests/data/*.test.ts` already run), and is green on the current tree.
- **AC-2** Layer 1 discovers files from disk. Self-test: a planted in-memory fixture (not a tree mutation) proves an undischarged file shape is flagged; deleting any `REGISTERED_FILES` row and running the suite reds (verified once during TDD's red step, not left as a permanent tree mutation).
- **AC-3** All 17 current sites are dispositioned: 13 shape-pinned (10 + 2 + 1), 4 behaviorally discharged with count pin.
- **AC-4** Count tripwire per §3.4 for all four files, expected values `10/2/1/4`.
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
