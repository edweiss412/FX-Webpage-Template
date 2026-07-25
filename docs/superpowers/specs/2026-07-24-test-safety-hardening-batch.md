# Spec — Test-safety hardening batch (2026-07-24)

**Status:** draft — revised after Codex adversarial review R1 (BLOCKING, 11 findings; all accepted, dispositions in §9)
**Branch:** `test/safety-hardening-batch`
**Backlog items closed:** `BL-DBTEST-LOOPBACK-EVAL-GUARD`, `BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS`, `BL-RESCAN-PREPARE-ERROR-GRANULARITY` (BACKLOG.md §"Test-safety hardening (2026-07-05)", lines 282–298)
**Explicitly NOT in scope:** `BL-ROOM-DIMS-ONLY-NOVEL-HEADER` (BACKLOG.md:300) stays deferred — 14 adversarial rounds established that every dims-based admit gate reopens asset fabrication.

---

## 1. Why these three, together

Three independent defects, one theme: **a guard that reads as authoritative but is bypassable, or a signal that reports the wrong reason.** Each is cheap in isolation and none share a file, so they batch into one PR without coupling.

| # | Item | Class | Surface |
| --- | --- | --- | --- |
| WI-1 | Loopback eval guard retrofit | TEST SAFETY | 37 test files + 1 new helper module + 1 new meta-test |
| WI-2 | Step-3 staged-Link guard bypass | TEST COVERAGE | 1 existing meta-test file + 1 new scanner module |
| WI-3 | Re-scan prepare error granularity | TELEMETRY GRANULARITY | 3 production call sites + 2 production helpers + 1 catalog copy row |

Every citation below was verified against the live tree at `origin/main` = `705798048`. Line numbers that drifted from the BACKLOG text are called out.

---

## 2. WI-1 — Loopback eval guard retrofit

### 2.1 The defect

`tests/db/_remediationHelpers.ts:19-36` defines `assertLocalDbUrl(url)`: it parses the URL and throws unless the hostname is one of `127.0.0.1`, `localhost`, `[::1]`, `::1`. It is applied at **module eval**, before any postgres handle exists (`_remediationHelpers.ts:38-41`).

15 test suites already route their URL through it. **37 test files read `process.env.LOCAL_TEST_DATABASE_URL` and do not.** Their shape is uniform — e.g. `tests/onboarding/finalizeCasFullApply.db.test.ts:32-34`:

```ts
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
```

…consumed by a probe `beforeAll` that opens `postgres(LOCAL_URL)` and flips `dbUp = true` (e.g. `tests/onboarding/finalizeGateStaged.db.test.ts:33-47`), with an `afterAll` that runs `if (dbUp) await cleanup()` — DELETE/UPDATE statements. If `LOCAL_TEST_DATABASE_URL` is ever pointed at a remote host, the probe connects remote, `dbUp` flips true, and teardown mutates that remote database. `TEST_DATABASE_URL` in this repo **is** the validation project — `pnpm preflight` on this worktree printed:

```
WARN: TEST_DATABASE_URL is NON-LOOPBACK (aws-1-us-east-2.pooler.supabase.com) …
```

so a mistyped copy-paste between the two variable names is the realistic trigger.

### 2.2 Scope — all 37, no file-level exemption

The guard's meaning is **"a value arriving through `LOCAL_TEST_DATABASE_URL` must be local."** That is a property of the *variable*, not of the suite, so **every** file that reads it is swept. There is no exempt file.

- **36 files** use the canonical `process.env.LOCAL_TEST_DATABASE_URL ?? "<loopback default>"` shape (37 occurrences; `tests/log/adminOutcomeBehavior.test.ts` has two, `:3723` and `:4237`). These take `assertLocalDbUrl(...)`.
- **1 file** — `tests/sync/qualityRegressionLifecycle.test.ts:261` — is deliberately validation-capable:

```ts
const DB_URL_EXPLICIT = process.env.TEST_DATABASE_URL ?? process.env.LOCAL_TEST_DATABASE_URL;
```

  It DELETEs from `public.admin_alerts` and `public.shows` (`:288-297`). **R1 finding 3:** exempting the whole file would have preserved exactly the hazard this work item exists to remove — a remote value supplied through `LOCAL_TEST_DATABASE_URL` would still connect and mutate remotely. Instead the **`LOCAL_` leg alone** is guarded:

```ts
const DB_URL_EXPLICIT =
  process.env.TEST_DATABASE_URL ?? assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL);
```

  `TEST_DATABASE_URL` stays unconstrained, so the suite's validation-project capability is untouched, and its "explicitly configured URL must connect" gate (`:439-449`) behaves identically.

  Correction to R1 finding 3's supporting point, which this spec had stated wrongly: **CI does NOT set `TEST_DATABASE_URL` for the merge-gating suite.** `.github/workflows/unit-suite.yml:120-123` sets only `VITEST_EXCLUDE_ENV_BOUND` and boots a local Supabase (`:117`). The workflows that set `TEST_DATABASE_URL` (`x-audits.yml:298,336,403`) run targeted files. So in the merge-gating job `DB_URL_EXPLICIT` is `undefined` and the suite runs against the CI-local database — which the guard permits unchanged.

- **Out of scope (~71 files):** test files that open `postgres(...)` on `TEST_DATABASE_URL`/`DATABASE_URL` only. Those are validation-targeted by intent. Recorded in §7.

Verified: of the 37, only `qualityRegressionLifecycle.test.ts` assigns `process.env.TEST_DATABASE_URL` / `process.env.DATABASE_URL`. The other 36 use their local constant solely for their own handles, so the sweep cannot change which database any production code path resolves.

### 2.3 Helper extraction (required, not cosmetic)

`assertLocalDbUrl` currently lives in a module that at eval also constructs `sql` and `newConn` postgres clients (`_remediationHelpers.ts:38-41`) and pins the F2/F4 remediation migration path; its throw message names that migration, which is wrong for a generic caller.

**New module `tests/db/_localDbUrl.ts`** — side-effect free (no env read, no client, no filesystem at eval) — exporting exactly two functions:

```ts
export function assertLocalDbUrl(url: string): string;
export function assertLocalDbUrlIfSet(url: string | undefined): string | undefined;
```

- Parse with `new URL(url)`; unparseable → throw.
- Hostname not exactly one of `127.0.0.1`, `localhost`, `[::1]`, `::1` → throw, naming the offending **hostname**, both env var names, and that `TEST_DATABASE_URL` is the validation project.
- Otherwise return the input unchanged (composes inline).
- `assertLocalDbUrlIfSet(undefined)` → `undefined`; `assertLocalDbUrlIfSet("")` → throws (an empty string is a misconfiguration, not "unset"), matching `??` semantics where `""` does not fall back.

**Credential redaction (R1 finding 10).** No message embeds the raw DSN: a database URL carries a password, and this helper's output lands in Vitest/CI logs. Messages are built from `redactDsn(url)`, which replaces the userinfo segment (`//user:pass@` becomes `//***@`) and, when the value will not parse at all, emits `<unparseable database URL, N chars>` with no content. The parsed path reports `url.hostname` only, which carries no secret.

`tests/db/_remediationHelpers.ts` keeps working for its 16 importers via a **local binding plus re-export** — `import { assertLocalDbUrl } from "./_localDbUrl"; export { assertLocalDbUrl };`. R1 finding 9 was right that a bare `export … from` would not have introduced the local binding its own `DB_URL` line (`:38`) calls.

### 2.4 The per-file edit

```ts
import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";

const LOCAL_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
```

Constant names differ across files (`LOCAL_URL`, `DB_URL`, …); the edit preserves each file's existing name and default string verbatim. The 15 files already importing the symbol from `_remediationHelpers` are re-pointed to `@/tests/db/_localDbUrl`.

### 2.5 Behavior guard conditions

| Condition | Before | After | Rationale |
| --- | --- | --- | --- |
| `LOCAL_TEST_DATABASE_URL` unset (CI, and default local dev) | loopback default | loopback default, guard passes | **No behavior change.** Verified: no workflow, script, `package.json` entry, or `.env.local` line sets `LOCAL_TEST_DATABASE_URL`. |
| unset + no local Postgres listening | probe fails, `dbUp=false`, `test.skipIf` skips | identical | The skip path must survive; the guard runs before the probe and passes on the loopback default. |
| set to a loopback URL on a custom port | runs | runs | Port is not inspected; hostname only. |
| set to a remote host | connects + mutates remote | **module eval throws**, whole file errors | The fix. Loud, before any handle exists. |
| set to an unparseable string | `postgres()` throws mid-probe | module eval throws, value redacted | Earlier, clearer, no secret in logs. |
| set to `""` | `??` does not fall back, so `postgres("")` | throws (also via `assertLocalDbUrlIfSet`) | Documented, not incidental. |
| host merely *contains* a loopback token (`127.0.0.1.evil.example`) | connects remote | throws | Equality, never substring — pinned by test. |
| `qualityRegressionLifecycle` with `TEST_DATABASE_URL` set to validation | runs against validation | identical | The `LOCAL_` leg is not consulted when `TEST_DATABASE_URL` is set. |
| `qualityRegressionLifecycle` with only `LOCAL_TEST_DATABASE_URL` set, remote | connects + DELETEs remote | throws | The hole R1 finding 3 identified. |

### 2.6 Structural meta-test — `tests/db/_metaLocalDbUrlGuard.test.ts`

**Scan-set predicate (R1 finding 8).** Membership is **an AST-resolved read** of `process.env.LOCAL_TEST_DATABASE_URL` — a `PropertyAccessExpression` — not a textual "mentions". A textual predicate is self-contradictory: the helper names the variable in its error copy, and the meta-test names it in its own synthetic fixtures, so both would enter their own scan set. Under the AST predicate the helper (string literal only) and the meta-test's fixtures (string literals) are naturally outside it.

For every file in the scan set the test asserts:

1. **Guarded:** every such read is lexically an argument of a `CallExpression` whose callee is `assertLocalDbUrl` or `assertLocalDbUrlIfSet`; **or**
2. **Exempted:** the file carries `// local-db-url-exempt: <non-empty reason>`.

Expected state on landing: **53 files in the scan set** (36 swept + 15 already guarded + `tests/sync/qualityRegressionLifecycle.test.ts` + `tests/db/_remediationHelpers.ts`), **53 guarded, exempt set `[]`**. The exempt set is asserted by equality against the empty array, so introducing the first exemption is a deliberate, reviewable act.

The positional check is AST-based (`typescript` is a devDependency, `^5`; precedent `tests/adminAlerts/producerScopeAst.ts:17`). A regex would accept `assertLocalDbUrl(x) ?? process.env.LOCAL_TEST_DATABASE_URL` — the exact bypass this test exists to reject.

The meta-test also exercises the helper behaviorally (identity on each accepted host; throw on remote, unparseable, empty, and loopback-prefixed hostnames; **no credential in any message**), so it is not merely a source scan.

---

## 3. WI-2 — Step-3 staged-Link guard bypass

### 3.1 The defect

`tests/admin/step3DeletionSafety.test.ts` (test 2) flags a line only when that **same line** contains `href`, contains `/admin/onboarding/staged/`, and lacks `/api/`. A helper-built href — `href={buildStagedUrl(id)}` with the literal elsewhere — reintroduces navigation to the retired page with the guard green. The retired page 307s to `/admin` (`next.config.ts:83-92`), so the regression is a degraded operator path, not a 404.

### 3.2 The ratified reference set

| Site | Occurrences | Kind | Ratified by |
| --- | --- | --- | --- |
| `app/api/admin/onboarding/finalize/route.ts:270-272` (`reApplyUrl`) | 1 | string literal (code) | spec §4.6; 307s to `/admin` |
| `next.config.ts:84`, `:89` | 2 | 1 comment + 1 string literal (redirect `source`) | spec §4.6 |
| `app/admin/show/staged/[stagedId]/page.tsx:23` | 1 | comment | — |
| `components/admin/wizard/Step3Review.tsx:~30` | 1 | comment | — |
| `lib/parser/dataGaps.ts:473` | 1 | comment | — |
| `lib/audit/trustDomains.ts:66` | 1 | comment | — |

**6 files, 7 occurrences**, derived by a byte-level read (see §3.2a). R1 finding 4 reported 6 occurrences across 5 files and correctly flagged this spec's earlier 5-reference table; the corrected count is **7**, not 6 — the review's own enumeration also missed `components/admin/wizard/Step3Review.tsx`, for the reason below.

### 3.2a A grep-invisible file is in the scanned tree

`components/admin/wizard/Step3Review.tsx` contains a **raw NUL byte** at offset 53375 — `uncheckedCleanNames.join("<NUL>")`, committed as a literal U+0000 instead of the two-character escape `\u0000` (commit `fc75a9bcd`). `file(1)` reports the file as `data`, and **`grep` therefore skips it silently** — no match, no "Binary file matches" line, no error.

Consequences:

- Every scanner in this spec reads with `readFileSync(path, "utf8")`. **No guard here may shell out to `grep`.**
- Any grep-based audit of `components/**` in this repo under-reports by this file. Filed as `BL-SOURCE-NUL-BYTE-STEP3REVIEW` rather than fixed inline: `components/**` is a UI surface, so a zero-behavior byte fix would drag in the invariant-8 impeccable dual-gate.

### 3.3 The replacement guard — three layers

All three run over `app/`, `components/`, `lib/`, **plus the single file `next.config.ts`** (today outside `ROOTS`, which is itself a hole — the redirect source lives there).

**Layer A — occurrence identity, not just count (R1 finding 5b).** For each occurrence of `/admin/onboarding/staged/` not preceded by `/api`, classify it via AST position as `comment` | `string-literal` | `assembled` (see Layer C), and assert the resulting `Map<path, kind[]>` equals the ratified table by deep equality. Counting alone would let someone delete a ratified comment and add `const routes = { staged: "/admin/onboarding/staged/" }` in the same file at the same count; the kind vector changes (`comment` becomes `string-literal`) and fails. Deleting a ratified reference also fails.

**Layer B — JSX href resolution.** For every JSX element named `a`, `Link`, or `*Link`, resolve the `href` attribute statically where possible:

- string literal → its text;
- template literal → the static parts joined with a sentinel placeholder (`\u0001`) for each substitution;
- identifier → its same-file `const` initializer, **up to two hops**;
- call of a same-file `function` declaration or `const` **arrow function** whose body is a single `return` → that return value (one hop);
- property access on a same-file object literal → that property's value;
- binary `+` chain → the concatenation of the statically resolvable parts;
- anything else → unresolved, ignored.

Assert no resolved value contains `/admin/onboarding/staged/`. (Contains, not starts-with: a `+` chain resolves with a leading placeholder when the prefix is dynamic.)

**Layer C — assembled-literal scan (R1 finding 5a).** Independently of JSX, walk every template literal and every `+` chain in each file, join their static parts (each substitution replaced by the same `\u0001` sentinel), and test the joined string for `/admin/onboarding/staged/`. This catches `"/admin/onboarding/" + "staged/" + id`, which contains no single matching literal and is therefore invisible to Layer A's per-literal scan and to Layer B when it is not an `href`. Hits are reported to Layer A as kind `assembled`; the ratified table contains none today, so any hit fails.

**Residual, documented limits:** a path assembled across module boundaries (segment consts imported from another file, joined at runtime), and `href` supplied via `{...props}`. Both are recorded in §7 rather than claimed closed.

### 3.4 Guard conditions

| Input | Expected |
| --- | --- |
| `href="/admin/onboarding/staged/x/y"` | A + B fail |
| `href={buildStagedUrl(id)}` — same-file `function` helper | A (literal in file) + B (one-hop) fail |
| `href={buildStagedUrl(id)}` — same-file **arrow** helper | A + B fail |
| `href={routes.staged + id}` — same-file object literal | A (kind flips) + B (property + `+` chain) fail |
| `href={"/admin/" + "onboarding/staged/" + id}` | C fails (no single literal matches) |
| `` href={`/admin/onboarding/staged/${a}/${b}`} `` | A + B fail |
| helper imported from another module | A fails in that module (literal present there) |
| `href={"/api/admin/onboarding/staged/…/apply"}` | none fail — `/api/` excluded (`components/admin/StagedReviewCard.tsx:277,282`) |
| `reApplyUrl` at `finalize/route.ts:271` | none fail — ratified, kind `string-literal`, not a JSX href |
| `next.config.ts:84` comment + `:89` source | none fail — ratified, kinds `[comment, string-literal]` |
| a ratified comment deleted, or converted to code | A fails (kind vector / membership) |
| `href={dynamic}` / `{...props}` | unresolved, ignored (documented) |

Tests 1 and 3 of the existing file (retired-import scan, re-homed-button tripwire) are unchanged.

---

## 4. WI-3 — Re-scan prepare error granularity

### 4.1 The defect

Two fail-closed catch sites map **any** `prepareOnboardingFiles` throw to `DRIVE_FETCH_FAILED`:

- `lib/onboarding/rescanWizardSheet.ts:143-158` (BACKLOG cites `:127`; drifted). The `try` spans `fetchDriveFileMetadata` **and** `prepareOnboardingFiles`.
- `app/api/admin/onboarding/finalize/route.ts:811-829` (inline auto-heal re-parse).

Doug is told "we couldn't fetch <sheet-name> from Google Drive … check the sheet's share settings" (`lib/messages/catalog.ts:112-113`) when the truth is that his sheet's structure broke the parser.

### 4.2 Classification is by error identity, not by call site (R1 findings 1 + 2)

The naive split — "wrap the parse calls, everything else is Drive" — does not work, because **the workbook-to-markdown conversion runs inside the Drive dependency**: `fetchSheetMarkdownWithBinding` calls `synthesizeMarkdownFromXlsx` at `lib/drive/fetch.ts:641-645`, and `fetchSheetMarkdownAndBytesAtRevision` calls it at `:511-514`. A corrupt XLSX therefore throws *after* Drive has successfully returned bytes, inside a call the earlier draft labelled `drive_fetch` — leaving the BACKLOG's named malformed-workbook case unfixed.

Therefore:

1. **`lib/drive/exportSheetToMarkdown.ts` gains `export class WorkbookSynthesisError extends Error`**, and `synthesizeMarkdownFromXlsx` wraps its whole body so any throw (corrupt ZIP, `XLSX.read` failure, malformed grid) surfaces as that type with `cause` preserved. It is a pure function over already-fetched bytes; every fault it can raise is a workbook fault.
2. **Classification precedence** inside `prepareOnboardingFiles`:
   - already a `PrepareOnboardingFileError` → passed through unchanged (idempotent, never re-wrapped);
   - `WorkbookSynthesisError` → `kind: "parse"`, **wherever it surfaces**, including from inside `fetchMarkdownWithBinding`;
   - `DriveFetchError` / `InvalidDriveFileIdError` (`lib/drive/fetch.ts:111,128`) → `kind: "drive_fetch"`;
   - otherwise by **site**, per the table below.
3. **Site classification is independent of the thrown value's type** (resolving R1 finding 2's contradiction): a `string` thrown from a parse site is still `parse`. Only a throw from a site not in the table defaults to `drive_fetch`.

**Complete throw-site enumeration** (every site in the live body, verified):

| Site | Line | Kind |
| --- | --- | --- |
| `listFolder(folderId)` | 1146 | `drive_fetch` |
| `readOverride(...)` | 1179 | `drive_fetch` (default catches internally at `:313`; only an injected stub throws) |
| `fetchMarkdownWithBinding(...)` | 1180 | `drive_fetch`, **except** a `WorkbookSynthesisError` from within → `parse` |
| `parseSheet(markdown, …)` | 1193 | `parse` — hoisted out of the `enrich(...)` argument so the two are separable |
| `enrich(...)` | 1193 | `drive_fetch` |
| `finalizeArchivedTabs(...)` | 1196 | `parse` |
| `reconcileIncludedTab(...)` | 1204 | `parse` |
| `discardAndRerun(...)` incl. its post-parse fix-up (`lib/sync/pullSheetOverride.ts:208-216`) | 1210 | `parse` |
| `synthesizeMarkdownFromXlsx(bytes)` inside `reparseNoOverride` | 1214 | `parse` |
| inner `parseSheet` + `finalizeArchivedTabs` in `reparseNoOverride` | 1216-1220 | `parse` |
| inner `enrich(...)` in `reparseNoOverride` | 1215-1219 | `drive_fetch` |
| `applyRoleTokenMappings(...)` | 1239 | `parse` |
| `listSheetGids` / `extractSourceAnchors` / `attachWarningAnchors` | 1256-1283 | already caught locally; never propagate |
| `readRoleTokenMappings` | 1161-1163 | already `.catch(() => [])`; never propagates |

### 4.3 The third call site (class sweep)

`app/api/admin/pending-ingestions/[id]/retry/route.ts` has the same conflation: its `try` around `fetchSheetMarkdownAndBytesAtRevision` maps to `DRIVE_FETCH_FAILED` (`:169-171`), and that function synthesizes at `fetch.ts:511-514`. Per the class-sweep rule it is fixed in the same PR: a `WorkbookSynthesisError` there throws `FirstSeenStagePrepareError("STAGED_PARSE_FAILED", cause)`, matching the parse branch it already has at `:176`.

### 4.4 Mapping at the call sites

```ts
} catch (err) {
  const code =
    err instanceof PrepareOnboardingFileError && err.kind === "parse"
      ? "STAGED_PARSE_FAILED"
      : "DRIVE_FETCH_FAILED";
  …
}
```

`rescanWizardSheet.ts`'s `try` also covers `fetchDriveFileMetadata`, which throws `DriveFetchError` → `DRIVE_FETCH_FAILED` by the default. Unchanged.

**Type unions to widen** in `app/api/admin/onboarding/finalize/route.ts`: the `PerRowResult` failure branch (`:146-160`) and `demotePending`'s `code` parameter (`:470-478`) each gain `| "STAGED_PARSE_FAILED"`. `RescanResult.needs_attention.code` is already `string` (`rescanWizardSheet.ts:35`), and `app/api/admin/onboarding/rescan-sheet/route.ts:42-45` passes it through to the button, which renders via `lookupDougFacing` (invariant 5).

### 4.5 Downstream: telemetry severity (R1 finding 7)

`lib/onboarding/finalizeRowSeverity.ts:8` maps `DRIVE_FETCH_FAILED` → `error` and everything else → `warn`, and the finalize post-commit sink uses it (`finalize/route.ts:1598`). So emitting `STAGED_PARSE_FAILED` moves a malformed-sheet row from `error` to `warn`.

**That is the intended direction, not a regression.** The map's own contract (`finalizeRowSeverity.ts:1-7`) is "INFRA fault → error; operator-recoverable staleness → warn." A sheet whose structure broke the parser is operator-recoverable — Doug fixes the sheet — so `warn` is its correct classification, and today's `error` is a symptom of the same conflation this work item removes. The change is explicit, the comment in that file is updated to name the new code, and a test pins the severity of both codes so a later edit cannot flip either silently.

### 4.6 Catalog copy must stop naming the retry path (R1 finding 6)

`STAGED_PARSE_FAILED`'s existing copy says "during retry" and "The live first-seen retry path…" (`lib/messages/catalog.ts:3124,3128,3131`). Its new producers are the wizard re-scan and the finalize inline auto-heal — not that path — and `helpfulContext` is rendered verbatim to the operator by `HelpAffordance` (`components/admin/HelpAffordance.tsx:101`). Shipping as-is would replace one wrong reason with another.

The row's copy is therefore rewritten to be **path-agnostic and true of all three producers**. This is an edit to an existing row, **not a new code**: no `gen:internal-code-enums`, no `_families.ts` prefix, no `trustDomains.ts` row, no new scenario. It does require the three-way §12.4 lockstep in one commit:

1. `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3055` (the §12.4 table row) and `:3297` (the helpful-context block);
2. `pnpm gen:spec-codes` → regenerates `lib/messages/__generated__/spec-codes.ts`;
3. `lib/messages/catalog.ts:3122-3133`.

`tests/cross-cutting/codes.test.ts:69-88` (x1) compares `dougFacing` / `crewFacing` / `followUp` / `helpfulContext` between the catalog and the generated prose, so drift among the three fails the gate. Copy constraints: no em-dashes, literal apostrophes, no raw codes.

Proposed copy (final wording settled at implementation, subject to these constraints):

- **dougFacing:** "We reached that sheet but couldn't read it into a show. Open the sheet, fix its structure, then try again."
- **followUp:** "Doug → open the sheet and fix its structure, then retry" (unchanged)
- **helpfulContext:** "Google Drive gave us the sheet, so this is not a sharing or network problem. Something in the sheet's structure stopped the parser from turning it into a show. Open the sheet, fix the part that changed, then run the same action again. Any previously approved version stays live for crew until a clean version parses."
- **title:** "Sheet could not be read"
- **longExplanation:** path-agnostic restatement of the above (catalog-only field).

### 4.7 Guard conditions

| Throw origin | Classification | Code |
| --- | --- | --- |
| `fetchDriveFileMetadata` (rescan pre-check) | `DriveFetchError` | `DRIVE_FETCH_FAILED` |
| `listFolder` / injected `listFolder` | site | `DRIVE_FETCH_FAILED` |
| Drive export transport failure inside `fetchMarkdownWithBinding` | `DriveFetchError` | `DRIVE_FETCH_FAILED` |
| **corrupt XLSX inside `fetchMarkdownWithBinding`** | `WorkbookSynthesisError` | **`STAGED_PARSE_FAILED`** |
| `parseSheet` (initial or re-parse), incl. a non-`Error` throw | site | `STAGED_PARSE_FAILED` |
| `finalizeArchivedTabs` / `reconcileIncludedTab` / `discardAndRerun` fix-up | site | `STAGED_PARSE_FAILED` |
| `synthesizeMarkdownFromXlsx` in `reparseNoOverride` | `WorkbookSynthesisError` | `STAGED_PARSE_FAILED` |
| `enrichWithDrivePins` (either position) | site | `DRIVE_FETCH_FAILED` |
| `applyRoleTokenMappings` | site | `STAGED_PARSE_FAILED` |
| `readPullSheetOverride` / `readRoleTokenMappings` (defaults) | caught internally | never reaches a caller |
| throw from an unenumerated site, any value type | default | `DRIVE_FETCH_FAILED` (conservative; preserves today's behavior) |
| corrupt XLSX in the live first-seen retry route | `WorkbookSynthesisError` | `STAGED_PARSE_FAILED` (§4.3) |

Recovery behavior is byte-identical in every branch (demote fail-closed + re-apply surface). What changes: the persisted code, the operator-visible copy, and the finalize log severity (§4.5).

---

## 5. Test plan (anti-tautology)

Every assertion names the concrete failure it catches.

**WI-1**

1. Helper behavioral unit: identity (`toBe`) on all four accepted hosts; throws on remote, on `""`, on `"not a url"`, and on `127.0.0.1.evil.example` (*catches a substring check*); `assertLocalDbUrlIfSet(undefined)` returns `undefined`. Every throw message asserted to **exclude** the password substring of a credentialed DSN (*catches the R1-finding-10 leak*).
2. AST-classifier synthetic units: guarded shape → 0 unguarded reads; `assertLocalDbUrl(x) ?? process.env.LOCAL_TEST_DATABASE_URL` → 1 unguarded read (*catches the regex implementation*); env read with the import present but unused → 1 (*catches an import-presence check*); `// local-db-url-exempt:` with an empty reason → not exempt.
3. Tree scan: offenders `[]`; exempt set `[]`; scan-set size 53 with the composition in the failure message (*catches a walker that silently stops finding files, which would make the guard vacuous*).
4. `tests/sync/qualityRegressionLifecycle.test.ts` specifically: with `TEST_DATABASE_URL` set, the `LOCAL_` leg is not consulted; with only a remote `LOCAL_TEST_DATABASE_URL`, module eval throws (*catches the R1-finding-3 hole*).
5. Sweep no-regression: for the 36 swept files only (new tests excluded), the per-file pass/skip tallies match `origin/main` exactly (*catches a sweep that broke the `dbUp` skip path*). Per R1 finding 11 the comparison is scoped to the swept set, since the PR adds new passing tests.

**WI-2**

6. Layer A `Map<path, kind[]>` deep-equality against the ratified table (*catches a new reference, a deleted ratified one, and a comment-to-code conversion at constant count*).
7. Layer B synthetic units, one per row of §3.4 including the arrow-helper, two-hop identifier, object-property, and `+`-chain shapes (*catches the exact BACKLOG bypass and the R1-finding-5 variants*).
8. Layer C synthetic unit: `"/admin/onboarding/" + "staged/" + id` is flagged; `"/api/admin/onboarding/" + "staged/" + id` is not.
9. Old-vs-new differential: the retired same-line predicate finds nothing on the helper-built-href source while the new guard flags it (*makes the rewrite's justification executable*).
10. Negative-regression: all three layers pass on the unmodified tree (*catches a guard so strict it fails on ratified code — the reason the item was deferred*).

**WI-3**

11. `synthesizeMarkdownFromXlsx` unit: a corrupt buffer throws `WorkbookSynthesisError` with `cause` preserved (*catches a re-throw that drops provenance*).
12. `prepareOnboardingFiles` unit with injected leaf deps, one case per propagating row of §4.2's table, asserting `instanceof PrepareOnboardingFileError`, `.kind`, and `.cause`. Includes: a `WorkbookSynthesisError` raised **from inside the injected `fetchMarkdownWithBinding`** → `kind:"parse"` (*R1 finding 1 — a site-only classifier fails here*); a `string` thrown from `parseSheet` → `kind:"parse"` (*R1 finding 2*); an already-`PrepareOnboardingFileError` → not re-wrapped.
13. `rescanWizardSheet`: injected prepare throwing each kind → `STAGED_PARSE_FAILED` / `DRIVE_FETCH_FAILED`; `fetchDriveFileMetadata` throwing → `DRIVE_FETCH_FAILED`; a non-`Error` throw → `DRIVE_FETCH_FAILED`. Each case also asserts **no mutating statement ran** on the recording `withTx` (*catches a mapping that moves the failure past the pre-lock boundary*).
14. Finalize inline auto-heal: a `kind:"parse"` throw yields `per_row[0].code === "STAGED_PARSE_FAILED"` **and** the demote write carries the same code (*catches response and persisted code drifting apart*).
15. Severity: `severityForFinalizeRowCode("DRIVE_FETCH_FAILED") === "error"` and `("STAGED_PARSE_FAILED") === "warn"`, rationale cited in the test (*catches a silent flip of either*).
16. Retry route (§4.3): a `WorkbookSynthesisError` from the export yields `STAGED_PARSE_FAILED`; a transport `DriveFetchError` still yields `DRIVE_FETCH_FAILED`.
17. Catalog: `STAGED_PARSE_FAILED` resolves through `lib/messages/lookup.ts` to non-null Doug-facing copy, and the copy contains neither "retry path" nor "first-seen" (*catches the R1-finding-6 wording surviving the edit*). x1 parity is the structural gate.

---

## 6. Invariants touched

- **Invariant 1 (TDD per task):** every task is failing-test-first.
- **Invariant 5 (no raw codes in UI):** WI-3 emits an already-cataloged code; test 17 pins resolution.
- **Invariant 2 (advisory locks):** untouched. WI-3 changes only classification inside an existing pre-lock `try` (rescan) and inside the already-held-lock branch (finalize). No lock acquired, released, or moved; no new holder.
- **Invariant 9 (Supabase call-boundary):** no Supabase client calls added.
- **Invariant 10 (mutation-surface telemetry):** no new mutation surface, no new route. `app/api/admin/pending-ingestions/[id]/retry/route.ts` is an existing registered admin surface; only the code it emits on one branch changes.
- **Invariant 8 (UI gate):** **not triggered** — no file under `app/` except `app/api/**`, nothing under `components/`, no `globals.css` / `DESIGN.md` / tailwind config. WI-2 edits a test that *scans* UI, which is not a UI surface. Verified mechanically before push.
- **Invariant 11 (worktree):** all work in `FX-worktrees/test-safety-hardening`.
- **§12.4 lockstep:** §4.6 is a copy edit to an existing row; all three files land in one commit and x1 gates them.

No migration, so the `validation-schema-parity` post-migration checklist does not apply.

---

## 7. Out of scope (recorded, not forgotten)

- The ~71 test files opening `postgres(...)` on `TEST_DATABASE_URL`/`DATABASE_URL`. Validation-targeted by intent; a guard there is a different contract.
- `BL-ROOM-DIMS-ONLY-NOVEL-HEADER` — unchanged, still deferred.
- WI-2 residual bypasses: a path assembled across module boundaries, and `href` via `{...props}`.
- Splitting `DRIVE_FETCH_FAILED` further (network vs permission vs 404) — `SHEET_UNAVAILABLE` already covers moved/unshared.
- The NUL byte itself (`BL-SOURCE-NUL-BYTE-STEP3REVIEW`).
- **A fourth instance of the WI-3 shape, deliberately deferred.** The cron sync path also runs `synthesizeMarkdownFromXlsx` (`lib/sync/runScheduledCronSync.ts:3118,3144`) inside its export phase, and a throw there is funnelled through `markShowDriveError` into `shows.last_sync_status = 'drive_error'`, which `syncProblemCodeForStatus` (`:207-213`) maps to `DRIVE_FETCH_FAILED` — so a corrupt workbook is reported to Doug as a Drive failure on the cron path too. It is NOT swept here because that path has its own two-state classification (`drive_error` vs `parse_error` → `PARSE_ERROR_LAST_GOOD`) with different persistence (`last_sync_status`), different alert-resolution wiring (`resolveStaleSyncProblemAlerts_unlocked`, `:2663-2668`), and a different recovery contract for crew (last-good stays live). Re-pointing it is a behavior change to the live sync pipeline, not a classification fix, and belongs in its own spec. Filed as `BL-CRON-WORKBOOK-FAULT-MISCLASSIFIED`. The `WorkbookSynthesisError` type this spec introduces is what a later fix would key on, so this PR leaves that path strictly easier to correct, never harder.

---

## 8. Numeric self-consistency

- `37` = test files reading `process.env.LOCAL_TEST_DATABASE_URL` today without the guard; **all 37 are swept** (36 via `assertLocalDbUrl`, 1 via `assertLocalDbUrlIfSet`).
- `37` = canonical occurrences edited across the 36 canonical-shape files (`adminOutcomeBehavior.test.ts` has two).
- `17` = files containing `assertLocalDbUrl` today = 15 canonical-guard suites + `tests/db/onboarding-fixups-remediation.test.ts` (imports the symbol to test it; never reads the env var) + `tests/db/_remediationHelpers.ts`.
- `15` = already-guarded suites re-pointed to `@/tests/db/_localDbUrl`.
- `53` = scan-set size after landing (36 + 15 + `qualityRegressionLifecycle` + `_remediationHelpers`); `53` guarded; `0` exempt.
- `7` = ratified `/admin/onboarding/staged/` occurrences across `6` files (byte-level; `grep` under-reports by 1 per §3.2a).
- `3` = fail-closed call sites mapping the discriminated kind (rescan, finalize inline, live first-seen retry).
- `0` = new §12.4 codes; `0` = migrations; `1` = §12.4 row whose copy changes.

---

## 9. R1 dispositions

| # | Severity | Disposition |
| --- | --- | --- |
| 1 | BLOCKING | Accepted. §4.2 re-bases classification on error identity; `WorkbookSynthesisError` is `parse` even when raised inside a Drive call. Test 12 exercises it through an injected `fetchMarkdownWithBinding`. |
| 2 | HIGH | Accepted. §4.2's table enumerates every site including `synthesizeMarkdownFromXlsx`, `discardAndRerun`'s fix-up, and `applyRoleTokenMappings`; the non-`Error` contradiction is resolved — site classification ignores the thrown value's type, and only unenumerated sites default to `drive_fetch`. |
| 3 | HIGH | Accepted, and the supporting CI claim corrected in §2.2. No file-level exemption; the `LOCAL_` leg is guarded via `assertLocalDbUrlIfSet`. Exempt set is now `[]`. |
| 4 | HIGH | Accepted; the count was wrong. Corrected to 7 occurrences / 6 files — one more than the review found, because `Step3Review.tsx` is grep-invisible (§3.2a). |
| 5 | HIGH | Accepted. Layer A pins occurrence **kind vectors**, not counts; Layer B gains arrow helpers, two-hop identifiers, object properties, and `+` chains; Layer C scans assembled literals. Cross-module assembly and `{...props}` are documented residuals. |
| 6 | HIGH | Accepted. §4.6 rewrites the row's copy path-agnostically under the three-way §12.4 lockstep; test 17 pins the wording. |
| 7 | MEDIUM | Accepted with a documented decision: `warn` is correct for an operator-recoverable parse fault under the map's own contract; the change is deliberate, the comment updated, and test 15 pins both codes. |
| 8 | MEDIUM | Accepted. Scan-set membership is an AST-resolved env read, not a textual mention, so the helper and the meta-test's fixtures are naturally excluded. |
| 9 | MEDIUM | Accepted. `_remediationHelpers.ts` imports the symbol and re-exports it, giving the local binding its `:38` call needs. |
| 10 | MEDIUM | Accepted. Messages redact the DSN userinfo and report only the hostname, or a content-free unparseable notice; test 1 asserts no password reaches a message. |
| 11 | LOW | Accepted. §8 restates the 15-suites-plus-helper composition, and test 5 scopes the before/after comparison to the swept files. |
