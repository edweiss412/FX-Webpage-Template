# Test-safety Hardening Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec `docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md` (revised after Codex R1) — closing `BL-DBTEST-LOOPBACK-EVAL-GUARD`, `BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS`, and `BL-RESCAN-PREPARE-ERROR-GRANULARITY`.

**Architecture:** Three independent work items, no shared files. WI-1 extracts a side-effect-free `assertLocalDbUrl` / `assertLocalDbUrlIfSet` module, adds a fails-by-default AST meta-test, then sweeps all 37 reading files (guard-first, sweep-second, so the meta-test is genuinely RED before the sweep). WI-2 replaces a same-line substring guard with a byte-read three-layer guard (occurrence-kind allow-list + JSX href resolution + assembled-literal scan), AST primitives extracted so they run against synthetic sources. WI-3 tags workbook-synthesis faults at their source, classifies prepare failures by error identity, and maps `kind` to an EXISTING §12.4 code at three fail-closed call sites — with that code's copy rewritten path-agnostically under the three-way §12.4 lockstep.

**Tech Stack:** Vitest (node env), `typescript` compiler API for AST guards, postgres.js in DB suites, Next.js 16 route handlers.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md`. §9 records the R1 dispositions; do not re-derive them.
- **TDD per task**: failing test → minimal implementation → green → commit. No implementation before its test.
- **No NEW §12.4 code.** `STAGED_PARSE_FAILED` already exists. One existing row's **copy** changes (Task 8), which requires the three-way lockstep in ONE commit: master-spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`. Never run prettier on the master spec.
- **No UI surface touched** → invariant 8 does NOT apply. Verify before push: `git diff --name-only origin/main...HEAD` has no path under `app/` outside `app/api/**`, nothing under `components/`, no `globals.css` / `DESIGN.md` / `tailwind.config.*`.
- **No guard may shell out to `grep`** (spec §3.2a): `components/admin/wizard/Step3Review.tsx` carries a raw NUL byte and is invisible to `grep`. Every scanner uses `readFileSync(path, "utf8")`.
- Advisory-lock topology: **unchanged** — no acquire/release added or moved.
- Meta-test inventory: **1 created** (`tests/db/_metaLocalDbUrlGuard.test.ts`), **1 rewritten** (`tests/admin/step3DeletionSafety.test.ts` test 2), 0 registries extended.
- Worktree `/Users/ericweiss/FX-worktrees/test-safety-hardening`; commits `--no-verify`; conventional-commit messages; stage exactly the paths each task names (never `git add -A`, never a bare directory).
- Pre-push gates, whole changed set: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, full `pnpm test` (check `$?`, not the "Tests" line).

---

### Task 1: `tests/db/_localDbUrl.ts` — side-effect-free guard module

**Files:** Create `tests/db/_localDbUrl.ts`, create `tests/db/_metaLocalDbUrlGuard.test.ts` (behavioral half), modify `tests/db/_remediationHelpers.ts`.

**Interfaces:**

- Produces `assertLocalDbUrl(url: string): string` and `assertLocalDbUrlIfSet(url: string | undefined): string | undefined`.
- Consumes nothing. **No side effects at eval** — 52 test files import it.

- [ ] **Step 1 (RED): behavioral tests** (spec §5 test 1):
  - identity (`toBe`) for `127.0.0.1`, `localhost`, `[::1]`, `::1` DSNs;
  - throws for `aws-1-us-east-2.pooler.supabase.com`, message contains that hostname and both env var names;
  - throws for `""`, `"not a url"`;
  - throws for `postgresql://u:p@127.0.0.1.evil.example/db` *(catches a substring check)*;
  - `assertLocalDbUrlIfSet(undefined) === undefined`;
  - **no message contains the password** of `postgresql://postgres:sup3rs3cret@remote.example:5432/db` *(catches the R1-10 credential leak)*.
- [ ] **Step 2 (GREEN): implement**, including `redactDsn` (userinfo → `***`, unparseable → `<unparseable database URL, N chars>`). Header comment: imported broadly, must stay side-effect free.
- [ ] **Step 3:** `_remediationHelpers.ts` — delete the local body, add `import { assertLocalDbUrl } from "./_localDbUrl";` **and** `export { assertLocalDbUrl };` (the local binding its `:38` call needs — R1-9).
- [ ] **Step 4: verify** `npx vitest run tests/db/_metaLocalDbUrlGuard.test.ts tests/db/onboarding-fixups-remediation.test.ts`.
- [ ] **Step 5: commit** `test(db): extract a side-effect-free local db url guard module`
  - Stage: `tests/db/_localDbUrl.ts tests/db/_metaLocalDbUrlGuard.test.ts tests/db/_remediationHelpers.ts`

---

### Task 2: the AST structural scan (RED against today's tree)

**Files:** Create `tests/db/_localDbUrlScan.ts`; modify `tests/db/_metaLocalDbUrlGuard.test.ts`.

**Interfaces:** produces `classifyLocalDbUrlSource(src: string): { envReads: number; unguardedReads: number; exemptReason: string | null }`, exported so synthetic sources exercise it directly.

- [ ] **Step 1: implement the classifier.** `ts.createSourceFile(..., /*setParentNodes*/ true, ts.ScriptKind.TS)`. Every `PropertyAccessExpression` whose full text is `process.env.LOCAL_TEST_DATABASE_URL` counts as an `envRead`; it is guarded when an ancestor is a `CallExpression` whose callee identifier is `assertLocalDbUrl` or `assertLocalDbUrlIfSet` **and** the read sits inside that call's arguments (not its callee). `exemptReason` = trimmed text after `// local-db-url-exempt:`, or `null` when absent or empty.
- [ ] **Step 2 (synthetic units — anti-tautology core)** (spec §5 test 2):
  - guarded canonical shape → `envReads:1, unguardedReads:0`;
  - `assertLocalDbUrl(fallback) ?? process.env.LOCAL_TEST_DATABASE_URL` → `unguardedReads:1` *(catches a regex/`includes` implementation)*;
  - env read with the import present but unused → `unguardedReads:1` *(catches an import-presence check)*;
  - `assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL)` → guarded;
  - a source that only **mentions** the name inside a string literal or comment → `envReads:0` *(this is what keeps the helper and this test out of their own scan set — R1-8)*;
  - `// local-db-url-exempt:` with an empty reason → `exemptReason: null`.
- [ ] **Step 3 (RED): the tree scan.** Walk `tests/**/*.{ts,tsx}` with `readFileSync` utf8; scan set = files with `envReads > 0`. Assert: offenders (`unguardedReads > 0` and no exempt reason) `toEqual([])` — **RED now, 37 files**; exempt set `toEqual([])`; scan-set size `53`, failure message naming the composition *(catches a vacuous walker)*.
- [ ] **Step 4: confirm RED**, capturing the 37-file listing. Do not fix yet.
- [ ] **Step 5: commit** `test(db): add the local-db-url structural guard (RED)`
  - Stage: `tests/db/_localDbUrlScan.ts tests/db/_metaLocalDbUrlGuard.test.ts`

---

### Task 3: sweep all 37 reading files GREEN

**Files:** 36 canonical-shape test files; `tests/sync/qualityRegressionLifecycle.test.ts`; the 15 already-guarded files (import re-point).

- [ ] **Step 1: run the codemod** (`scratchpad/sweep-local-db-url.mjs`; dry-run verified 36 files / 37 occurrences, 15 already-guarded correctly skipped): wraps each canonical read in `assertLocalDbUrl(...)` and inserts `import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";`.
- [ ] **Step 2: `qualityRegressionLifecycle.test.ts:259-261`** — guard the LOCAL leg only (spec §2.2), NOT a file exemption:

```ts
const DB_URL_EXPLICIT =
  process.env.TEST_DATABASE_URL ?? assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL);
```

  with a comment recording why `TEST_DATABASE_URL` stays unguarded (validation-capable by design, `:439-449` gate).
- [ ] **Step 3: re-point the 15 pre-existing importers** to `@/tests/db/_localDbUrl` (leave `tests/db/onboarding-fixups-remediation.test.ts`, which imports other symbols).
- [ ] **Step 4: `pnpm exec prettier --write` the changed files**, then confirm the diff contains only import lines, `assertLocalDbUrl(`/`assertLocalDbUrlIfSet(` wrappers, and the one comment.
- [ ] **Step 5 (GREEN):** `npx vitest run tests/db/_metaLocalDbUrlGuard.test.ts` — offenders `[]`, exempt `[]`, scan set 53.
- [ ] **Step 6: targeted behavior test** (spec §5 test 4) in `tests/db/_metaLocalDbUrlGuard.test.ts`: with a remote `LOCAL_TEST_DATABASE_URL` and no `TEST_DATABASE_URL`, importing a representative swept suite **throws**; with `TEST_DATABASE_URL` set, `qualityRegressionLifecycle`'s expression does not consult the LOCAL leg. Use `vi.resetModules()` + `vi.stubEnv` and dynamic import so the throw is observable.
- [ ] **Step 7: no-regression proof (scoped, per R1-11).** Capture per-file pass/skip tallies for the 36 swept files at `origin/main` and on the branch; they must match. `npx vitest run <the 36 paths> 2>&1 | tail -30` on each side.
- [ ] **Step 8: commit** `test(db): route every LOCAL_TEST_DATABASE_URL read through the loopback guard`
  - Stage: the 36 swept files + `tests/sync/qualityRegressionLifecycle.test.ts` + the 15 re-pointed files + `tests/db/_metaLocalDbUrlGuard.test.ts`

---

### Task 4: WI-2 — AST primitives for the staged-page guard

**Files:** Create `tests/admin/stagedPageRefScan.ts` + `tests/admin/stagedPageRefScan.test.ts`.

**Interfaces:**

- `classifyRetiredPathOccurrences(src: string): Array<"comment" | "string-literal" | "assembled">`
- `resolveNavHrefs(src: string): Array<{ value: string; line: number }>`
- Precedent for extract-and-test-synthetically: `tests/adminAlerts/producerScopeAst.ts:1-16`.

- [ ] **Step 1 (RED): occurrence-kind units** (spec §5 test 6/8): a comment occurrence → `["comment"]`; a string literal → `["string-literal"]`; `/api/…` prefixed → `[]`; `"/admin/onboarding/" + "staged/" + id` → `["assembled"]`; a template with the path split across substitutions → `["assembled"]`.
- [ ] **Step 2 (RED): `resolveNavHrefs` units**, one per §3.4 row, each naming its failure mode:
  - literal href; template href; same-file `const` (two hops); same-file `function` helper (**the exact BACKLOG bypass**); same-file **arrow** helper; object-literal property; `+` chain; `/api/` href (must NOT match the retired prefix); `href={dynamic}` and `{...props}` → absent from the output.
- [ ] **Step 3 (GREEN): implement.** Unwrap parens/`as`/`satisfies`/`!` (mirror `producerScopeAst.ts:32-44`). Tag names: `a`, `Link`, or ending in `Link`. Substitutions render as the `\u0001` sentinel; matching is `includes("/admin/onboarding/staged/")`.
- [ ] **Step 4: commit** `test(admin): add AST primitives for the retired staged-page guard`
  - Stage: `tests/admin/stagedPageRefScan.ts tests/admin/stagedPageRefScan.test.ts`

---

### Task 5: WI-2 — rewrite the deletion-safety guard

**Files:** Modify `tests/admin/step3DeletionSafety.test.ts` (test 2 only).

- [ ] **Step 1 (RED): old-vs-new differential** (spec §5 test 9): on the helper-built-href synthetic source, the retired same-line predicate finds nothing while `resolveNavHrefs` flags it.
- [ ] **Step 2: scan roots** = `["app", "components", "lib"]` **plus the file `next.config.ts`**; keep `readFileSync(..., "utf8")`.
- [ ] **Step 3: Layer A** — `Map<path, kind[]>` deep-equal to the ratified table:

```ts
const RATIFIED_RETIRED_PATH_REFS: Record<string, Array<"comment" | "string-literal" | "assembled">> = {
  "app/admin/show/staged/[stagedId]/page.tsx": ["comment"],
  "app/api/admin/onboarding/finalize/route.ts": ["string-literal"], // re_apply_url builder (spec §4.6)
  "components/admin/wizard/Step3Review.tsx": ["comment"],
  "lib/audit/trustDomains.ts": ["comment"],
  "lib/parser/dataGaps.ts": ["comment"],
  "next.config.ts": ["comment", "string-literal"],                  // 307 redirect source + its comment
};
```

  Failure message states both directions (new reference added / ratified reference removed or changed kind).
- [ ] **Step 4: Layer B** — no resolved nav href contains `/admin/onboarding/staged/`; report `file:line`.
- [ ] **Step 5: Layer C** — no assembled literal in any scanned file contains the retired path (kind `assembled` appears nowhere in the live map).
- [ ] **Step 6: negative-regression** (spec §5 test 10): all three layers pass on the unmodified tree.
- [ ] **Step 7: commit** `test(admin): close the helper-built href hole in the staged-page deletion guard`
  - Stage: `tests/admin/step3DeletionSafety.test.ts`

---

### Task 6: WI-3 — tag workbook-synthesis faults at the source

**Files:** Modify `lib/drive/exportSheetToMarkdown.ts`; create `tests/drive/workbookSynthesisError.test.ts`.

**Interfaces:** produces `export class WorkbookSynthesisError extends Error` (with `cause`). Consumed by Tasks 7 and 9.

- [ ] **Step 1 (RED)** (spec §5 test 11): a TRUNCATED xlsx (`PK\x03\x04` + nothing) throws `WorkbookSynthesisError`, `.cause` is the original error, and the wrapper's message CARRIES the reader's text. A VALID workbook fixture still returns markdown unchanged *(catches a wrapper that swallows the success path)*. **Corrected during implementation:** arbitrary non-ZIP bytes do NOT throw — `XLSX.read` tolerates them as a degenerate text workbook — so the original fixture could not go RED. That boundary is now pinned as documented behavior, and the wrapper deliberately adds no new format validation.
- [ ] **Step 2 (GREEN):** wrap the whole `synthesizeMarkdownFromXlsx` body (`:301-…`) in try/catch re-throwing `new WorkbookSynthesisError(message, { cause })`; never re-wrap an existing `WorkbookSynthesisError`.
- [ ] **Step 3: blast-radius check** — the other callers (`lib/drive/fetch.ts:511,642`, `lib/sync/runScheduledCronSync.ts:3118,3144`, the two pull-sheet-override routes) all catch generically; run `npx vitest run tests/drive tests/sync tests/api/admin` and confirm no assertion depended on the old error identity.
- [ ] **Step 4: commit** `feat(drive): tag workbook synthesis faults with a discriminable error type`
  - Stage: `lib/drive/exportSheetToMarkdown.ts tests/drive/workbookSynthesisError.test.ts`

---

### Task 7: WI-3 — discriminated prepare error

**Files:** Modify `lib/sync/runOnboardingScan.ts`; create `tests/sync/prepareOnboardingFilesErrorKind.test.ts`.

**Interfaces:** produces `export class PrepareOnboardingFileError extends Error { readonly kind: "drive_fetch" | "parse" }`. Mirrors `FirstSeenStagePrepareError` (`app/api/admin/pending-ingestions/[id]/retry/route.ts:79-88`).

- [ ] **Step 1 (RED): unit per propagating row of spec §4.2's table** (spec §5 test 12), each asserting `instanceof`, `.kind`, `.cause`:
  - `listFolder` throws → `drive_fetch`;
  - injected `fetchMarkdownWithBinding` throws a plain error → `drive_fetch`;
  - **injected `fetchMarkdownWithBinding` throws a `WorkbookSynthesisError` → `parse`** *(R1-1: a site-only classifier fails here)*;
  - `parseSheet` throws → `parse`; `parseSheet` throws a **string** → `parse` *(R1-2)*;
  - `enrich` throws → `drive_fetch`;
  - `finalizeArchivedTabs` / `reconcileIncludedTab` / `discardAndRerun` fix-up throws → `parse`;
  - `synthesizeMarkdownFromXlsx` inside `reparseNoOverride` throws → `parse`;
  - `applyRoleTokenMappings` throws → `parse`;
  - an already-`PrepareOnboardingFileError` → passed through, `kind` preserved.
- [ ] **Step 2 (GREEN): implement.** Hoist `parseSheet` out of the `enrich(...)` argument (`:1193`). Add `classifyPrepareThrow(cause, siteKind)`: pass-through for `PrepareOnboardingFileError`; `WorkbookSynthesisError` → `parse`; `DriveFetchError`/`InvalidDriveFileIdError` → `drive_fetch`; else `siteKind`. Wrap each enumerated site.
- [ ] **Step 3: verify** `npx vitest run tests/sync tests/onboarding tests/drive` green.
- [ ] **Step 4: commit** `feat(onboarding): classify prepare faults as drive-fetch or parse`
  - Stage: `lib/sync/runOnboardingScan.ts tests/sync/prepareOnboardingFilesErrorKind.test.ts`

---

### Task 8: WI-3 — catalog copy, path-agnostic (§12.4 three-way lockstep)

**Files:** Modify `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (`:3055` row, `:3297` helpful-context line), `lib/messages/catalog.ts:3122-3133`, and the regenerated `lib/messages/__generated__/spec-codes.ts`.

- [ ] **Step 1 (RED)** (spec §5 test 17): assert `MESSAGE_CATALOG.STAGED_PARSE_FAILED.dougFacing` and `.helpfulContext` contain neither `"retry path"` nor `"first-seen"`, and that `lookupDougFacing("STAGED_PARSE_FAILED")` is non-null. RED against today's copy.
- [ ] **Step 2: edit the master spec** (§12.4 table row + helpful-context block) with the spec §4.6 wording. **Never run prettier on the master spec.**
- [ ] **Step 3:** `pnpm gen:spec-codes`; commit the regenerated file.
- [ ] **Step 4:** update `lib/messages/catalog.ts` (`dougFacing`, `helpfulContext`, `title`, `longExplanation`; `followUp` unchanged). No em-dashes, literal apostrophes.
- [ ] **Step 5: verify** `npx vitest run tests/cross-cutting/codes.test.ts tests/messages tests/help` — x1 parity green.
- [ ] **Step 6: commit** `docs(messages): make STAGED_PARSE_FAILED copy path-agnostic`
  - Stage: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts tests/messages/<the new test file>`

---

### Task 9: WI-3 — map the kind at all three call sites

**Files:** Modify `lib/onboarding/rescanWizardSheet.ts` (`:155-158`), `app/api/admin/onboarding/finalize/route.ts` (`:820-829`, unions `:146-160` + `:470-478`), `app/api/admin/pending-ingestions/[id]/retry/route.ts` (`:169-171`), `lib/onboarding/finalizeRowSeverity.ts` (comment + test); modify `tests/onboarding/finalizeInlineRescan.test.ts`; create `tests/onboarding/rescanPrepareErrorGranularity.test.ts`.

- [ ] **Step 1 (RED): rescan** (spec §5 test 13) — injected prepare throwing `kind:"parse"` → `{ status:"needs_attention", code:"STAGED_PARSE_FAILED" }`; `"drive_fetch"` → `DRIVE_FETCH_FAILED`; `fetchDriveFileMetadata` throwing → `DRIVE_FETCH_FAILED`; `throw "boom"` → `DRIVE_FETCH_FAILED`. Every case asserts the recording `withTx` saw **no** `update`/`insert`/`delete`.
- [ ] **Step 2 (RED): finalize** (spec §5 test 14) — extend `finalizeInlineRescan.test.ts` (existing Drive case `:126-144`): `kind:"parse"` → `per_row[0].code === "STAGED_PARSE_FAILED"` **and** the demote write carries the same code.
- [ ] **Step 3 (RED): retry route** (spec §5 test 16) — a `WorkbookSynthesisError` from the export → `STAGED_PARSE_FAILED`; a transport `DriveFetchError` → `DRIVE_FETCH_FAILED`.
- [ ] **Step 4 (RED): severity** (spec §5 test 15) — `severityForFinalizeRowCode` returns `error` for `DRIVE_FETCH_FAILED` and `warn` for `STAGED_PARSE_FAILED`, with the spec §4.5 rationale in the test body.
- [ ] **Step 5 (GREEN): implement** all four, widen the two unions with `| "STAGED_PARSE_FAILED"`, and update the `finalizeRowSeverity.ts` header comment to name the parse code and why it is `warn`.
- [ ] **Step 6: verify** `npx vitest run tests/onboarding tests/api/admin tests/log` + `pnpm typecheck`.
- [ ] **Step 7: commit** `fix(onboarding): report a parse fault as STAGED_PARSE_FAILED, not DRIVE_FETCH_FAILED`
  - Stage: the six files above

---

### Task 10: BACKLOG bookkeeping + close-out gates

**Files:** Modify `BACKLOG.md`; modify the batch spec (status → shipped).

- [ ] **Step 1:** mark the three items CLOSED with the PR ref and one line each; leave `BL-ROOM-DIMS-ONLY-NOVEL-HEADER` untouched.
- [ ] **Step 2:** add `BL-SOURCE-NUL-BYTE-STEP3REVIEW` (low / SOURCE HYGIENE): `components/admin/wizard/Step3Review.tsx` carries a raw U+0000 at offset 53375, so `file(1)` reports `data` and `grep` skips the file silently; every grep-based audit of `components/**` under-reports by it. Fix = replace the raw byte with the escape `\u0000`; deferred because `components/**` is a UI surface and the edit would trigger the invariant-8 dual-gate for a zero-behavior change.
- [ ] **Step 2b:** add `BL-CRON-WORKBOOK-FAULT-CODE` (low / TELEMETRY GRANULARITY) per spec §7. **Corrected during review:** a throw at `lib/sync/runScheduledCronSync.ts:3118,3144` escapes `prepareProcessOneFile` and is caught by the outer per-file loop (`:3915-3925`) as `outcome: "parse_error"` with `classifySyncFailure(error)` — typically `SYNC_FILE_FAILED`. It does NOT run `markShowDriveError` and does not set `drive_error`, so the cron path never reported a corrupt workbook as a Drive failure in the first place. The remaining question is only whether that case should report `PARSE_ERROR_LAST_GOOD`; deferred because it changes a live crew-visible sync contract.
- [ ] **Step 3: full gates** in order: `pnpm typecheck` → `pnpm lint` over the changed set → `pnpm format:check` → `VITEST_EXCLUDE_ENV_BOUND=1 npx vitest run` (check `$?`).
- [ ] **Step 4: UI-surface assertion** — `git diff --name-only origin/main...HEAD` shows nothing under `components/`, no `app/` path outside `app/api/**`. Paste the output into the PR body as invariant-8 non-applicability evidence.
- [ ] **Step 5: commit** `docs: close three test-safety backlog items, file the NUL-byte finding`
  - Stage: `BACKLOG.md docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md`

---

## Fix-round regression budget

Any adversarial finding that requires a code change re-runs: the touched suite, then `pnpm typecheck`, then the full suite before the next dispatch. A finding of the same *shape* as a previous one triggers a class sweep across all three work items before any fix is proposed (AGENTS.md class-sweep rule) — R1 finding 1 is the worked example: it was one instance of "classification by call site is wrong when a parse step hides inside a Drive dependency," and the sweep found the same shape at the live first-seen retry route (spec §4.3).
