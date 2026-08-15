<!-- spec-lint: not-ui — no UI surface: changes land in tests/, scripts/, .github/workflows/, and a log-content-only lib/ edit; app/ files are cited as evidence, not modified surfaces -->

# Changes-feed modal batch flake — root cause + repair design

**Date:** 2026-08-15 · **Ledger:** `BL-CHANGES-FEED-MODAL-BATCH-FLAKE` · **Branch:** `fix/changes-feed-batch-flake`
**Status:** DRAFT (spec/plan-only arc; implementation is a separate takeover)

`tests/e2e/admin-changes-feed-layout.spec.ts` was dropped from app-e2e batch 1 under AC-4 after failing two of five acceptance runs (`published-show-review-modal` never visible inside a 30s wait after `page.goto('/admin?show=<slug>')`). This spec records the measured root cause — which is NOT the filed cross-spec fixture-collision theory — and designs the repair that lets the spec re-enter the batch.

## 1. Scope

In scope:

- A shared e2e wait helper that opens `/admin?show=<slug>` and recovers ONCE from the admin route error boundary, surfacing the recovery as a test annotation.
- Adoption of that helper in `tests/e2e/admin-changes-feed-layout.spec.ts` (the only spec this arc touches).
- A log-content fix in `lib/admin/readShowReviewSnapshot.ts` so the next occurrence of the underlying fault is diagnosable from CI logs.
- Re-wiring the spec into `app-e2e.yml` batch 1: run-step file list, executed-count oracle row, workflow-coverage allowlist row removal.
- Acceptance = the AC-4 bar the spec was dropped under: five consecutive green `pull_request` runs of `app-e2e.yml`, `--retries=0`.

Out of scope (ledger filings in §8): peer adoption of the helper across the other modal-waiting specs; any change to the loader's fail-hard posture (product decision); root-causing WHY the local Supabase gateway 502s in CI (documented limit, §7).

### 1.1 Resolved scope — do not relitigate

- **The filed theory (shared Waldorf fixture collision with `report-modal.spec.ts`) is DISPROVEN, not deferred.** Evidence in §2: in both failing CI runs the failure occurred inside the FIRST spec executed, before `report-modal.spec.ts` or any other spec had run. Do not re-raise fixture isolation as the fix; the ledger entry's "first thing to check" was checked and refuted.
- **The loader's fail-hard posture stays.** `app/admin/_showReviewModal.tsx` deliberately throws infra faults to the error boundary (header comment, `app/admin/_showReviewModal.tsx:25-30`; throw at the `snapResult.kind === "infra_error"` branch, `app/admin/_showReviewModal.tsx:281-283`). Changing it to retry or fail open is a product decision filed as a ledger entry (§8.2), not part of this arc.
- **`--retries=0` on the workflow run step stays** (`.github/workflows/app-e2e.yml:144`, rationale in the comment block at `.github/workflows/app-e2e.yml:137-140`). The helper's single in-test recovery is not a Playwright retry and does not launder a fail-then-pass: the recovery is surfaced as a first-class annotation in the run's own JSON report (§4.1), and a deterministic product defect still fails — the boundary re-appearing after one reset is terminal.
- **One recovery attempt, not N.** The bound is 1 by design: a transient gateway blip clears on one reset; anything that survives a reset is treated as real and fails the test. Do not widen.
- **The spec re-enters the batch in this arc.** The ledger entry's cost is coverage ("the spec stays UNSEEN until it is stable"); the repair and the re-wiring ship together, gated by the five-green acceptance loop.

## 2. Root cause (measured, not theorized)

### 2.1 Failure signature

Both AC-4 failures reproduce the same server-side signature at the exact failure timestamp. Evidence from the failing runs' job logs and Playwright JSON reports (artifacts `app-e2e-playwright-31335985584-1`, `app-e2e-playwright-31337109375-1`, downloaded 2026-08-15):

| run | failing test | verdict-relevant sequence (mobile-safari project, runs FIRST; this spec is its first file) |
| --- | --- | --- |
| [31335519416](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/31335519416) | — | green |
| [31335770085](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/31335770085) | — | green |
| [31335985584](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/31335985584) | `@720` | `@390` passed (3s) → `@720` FAILED (31s, full timeout starve) → `@1280` passed (1s) |
| [31337109375](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/31337109375) | `@1280` | `@390` passed (4s) → `@720` passed (1s) → `@1280` FAILED (32s) |

Server log at 21:11:28.69 (run 31335985584 — the `@720` test began 21:11:27.90):

```
[WebServer] [admin.showReview.snapshot] get_admin_show_review_snapshot returned error { level: 'error', error: '[object Object]' }
[WebServer] ⨯ Error: show_review_snapshot_failed
[WebServer]   digest: '1334120221'
[WebServer]   url: 'http://127.0.0.1:3000/admin?show=2026-04-asset-management-institute-cfo-coo-roundtable'
```

Run 31337109375 shows the identical two-line signature at 21:36:40.39 (its `@1280` test began 21:36:39.22). No other `show_review_snapshot_failed` occurrences appear in either run.

### 2.2 Causal chain

1. **A transient Supabase gateway 502 hits the foreground snapshot RPC.** The snapshot error's own message is masked (§2.4), but the same run carries an unmasked same-class witness 62s later: `code: 'ADMIN_SHOW_VERSION_TOKEN_READ_FAILED' … error: 'An invalid response was received from the upstream server'` — the Kong gateway's 502 body, returned when the PostgREST upstream fails to answer.
2. **The loader converts it to a hard throw.** `readShowReviewSnapshot` maps any returned error to `{ kind: "infra_error" }` (`lib/admin/readShowReviewSnapshot.ts:48-53`); `ShowReviewModal` throws `show_review_snapshot_failed` on that kind (`app/admin/_showReviewModal.tsx:281-283`). This posture is deliberate and ratified (§1.1).
3. **The error boundary replaces the surface.** `app/admin/error.tsx` renders `data-testid="admin-route-error-boundary"` (`app/admin/error.tsx:35`) with a Retry button (`admin-route-error-retry`, wired to Next's `reset()`, `app/admin/error.tsx:46`). The modal will never mount on this render.
4. **The test starves.** The spec waits only for the loaded-modal locator (`tests/e2e/admin-changes-feed-layout.spec.ts:134-135`, 30s). The boundary is terminal, so the wait consumes the full timeout and the test fails with "element(s) not found" — exactly the filed symptom.

### 2.3 Why the filed cross-spec theory is wrong

- Project order runs mobile-safari before desktop-chromium, and within mobile-safari this spec is the first file (both reports' chronological test sequences, §2.1). In run 31335985584 the failure is the SECOND test executed in the entire run; nothing else had touched the database.
- `report-modal.spec.ts` only READS the Waldorf show (`tests/e2e/report-modal.spec.ts:30-61` — `select` on `shows` and `show_share_tokens`; its `/api/report` POST is `page.route()`-mocked). It cannot disturb the modal's mount condition.
- The failures bracket PASSING tests of the same describe block against the same seeded rows — the fixture data was demonstrably intact seconds before and after each failure.
- "Passes standalone, fails in batch" was a sampling artifact: standalone was only ever run locally, where the fault environment (a CI-runner-hosted local Supabase stack) does not exist. The batch runs were the only CI samples, so the flake correlated with "batch" by measurement design, not mechanism. (This is the ledger's own "Only CI settles a flake question" principle applied to the exoneration side.)

### 2.4 Compounding defect: the fatal path's error is unreadable

`lib/admin/readShowReviewSnapshot.ts:49-52` logs the raw PostgREST error object as a context value; the log pipeline's `serializeError` stringifies non-`Error` values (`lib/log/serializeError.ts:8-10`), and a PostgREST error object reaching that branch renders as `'[object Object]'`. The non-fatal reads in the same loader log `error.message` and are readable (e.g. `app/admin/_showReviewModal.tsx:149`). The 502 attribution in §2.2 therefore leans on the version-token witness; the fatal path itself must start carrying its message (§4.2).

### 2.5 Exposure amplifier (context, not the trigger)

The dashboard prefetches the full modal loader for every visible show row (`components/admin/ShowsTable.tsx:551` and `components/admin/ArchivedShowRow.tsx:80`, both `prefetch={true}` per spec `2026-07-19-show-modal-prefetch`). The failing runs' logs show the version-token 502 firing for a show slug no test ever navigated to (`2025-10-fixed-income-trading-summit-2025`) plus 9-12 `The destination stream closed early` aborted-prefetch errors per run — the gateway is being exercised far beyond the foreground navigations. This raises the odds a blip lands on a foreground snapshot read but is working-as-designed product behavior; no change here.

## 3. Approaches considered

1. **Recover at the test seam (CHOSEN).** Wait for modal OR error boundary; on boundary, click the product's own Retry once and re-wait. Pros: matches the fault's transience; exercises the product's real recovery affordance; persistent defects still fail; zero product-behavior change. Cons: does not shrink the underlying 502 rate (filed, §8.2/§7).
2. **Bounded retry inside `readShowReviewSnapshot`.** Would fix crew-invisible flashes of the error boundary in production too — but it reverses a ratified fail-hard posture and touches every consumer; a product decision, filed as §8.2.
3. **Raise the wait timeout.** Useless: the boundary is terminal; 300s starves the same as 30s.
4. **Tune the CI Supabase stack (pool size, Kong timeouts).** Speculative while the upstream cause is unmeasured (§7); the §4.2 logging fix is the instrument that makes this actionable later.

## 4. Design

<!-- spec-lint: ignore — tests/e2e/helpers/openShowReviewModal.ts is created by this spec's implementation -->
### 4.1 Shared helper: `tests/e2e/helpers/openShowReviewModal.ts`

New helper module exporting:

- `LOADED_REVIEW_MODAL` — the loaded-modal selector, moved verbatim from `tests/e2e/admin-changes-feed-layout.spec.ts:37-38` (`'[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])'`; the CSS has-clause scoping keeps the streaming skeleton twin out of strict-mode matches, per the comment at `tests/e2e/admin-changes-feed-layout.spec.ts:33-36`).
- `openShowReviewModal(page: Page, slug: string): Promise<Locator>` with this contract:
  1. Guard: `slug` empty/absent → throw immediately with a message naming the caller's seeding as the suspect (mirrors the resolve-failure message shape at `tests/e2e/admin-changes-feed-layout.spec.ts:51-53`). Never navigate to `/admin?show=` with an empty value — that renders the bare dashboard (`firstParam` guard, `app/admin/page.tsx:161-166`) and would starve confusingly.
  2. `page.goto('/admin?show=' + slug)`.
  3. Wait up to 30s for EITHER the loaded modal OR `[data-testid="admin-route-error-boundary"]` (Playwright `locator.or()`).
  4. Modal visible → return the modal locator (happy path, no annotation).
  5. Boundary visible → push a test annotation `{ type: "infra-recovery", description: <slug + which wait observed the boundary> }` via `test.info().annotations` (recorded in the run's JSON report; §4.4 makes it visible in job output — the list reporter does not print annotations, and green runs upload no artifact, so the JSON report alone is not operator-visible), click `[data-testid="admin-route-error-retry"]` (the product's `reset()` affordance, `app/admin/error.tsx:41-50`), and wait up to 30s for the loaded modal ONLY.
  6. Modal visible after retry → return it. Boundary again → fail with an error message that names the boundary, the spent retry, and the `show_review_snapshot_failed` server signature to grep for.
  7. NEITHER locator visible within a 30s wait (step 3 or step 5's re-wait) → the helper catches the timeout and re-throws an enriched error naming both locators it waited on, whether a recovery had been attempted, and the `show_review_snapshot_failed` server signature to grep for — Playwright's bare locator-pair timeout message is not sufficient for the §6 consequence bound.
  - Recovery bound is exactly 1 (ratified, §1.1).

Guard conditions: `slug` is the only input beyond `page`; its null/empty behavior is step 1. The helper never swallows a timeout — every timeout path exits through step 7's enriched error.

### 4.2 Logging fix: `lib/admin/readShowReviewSnapshot.ts`

Replace the raw-object context value at `lib/admin/readShowReviewSnapshot.ts:51` with explicit fields: `error: error.message, pgrstCode: error.code, pgrstDetails: error.details, pgrstHint: error.hint` (the PostgREST error shape, `PostgrestError { details, hint, code } extends Error` per the pinned postgrest-js 2.105.1 type declarations; message-style matches the loader's sibling sites, e.g. `app/admin/_showReviewModal.tsx:110`). **Deliberately NOT the `code` log field:** that key is the §12.4 telemetry-code slot (`lib/log/types.ts:6`), and the existing suite pins this read path as stamping NO code ("Zero-new-codes constraint", `tests/admin/readShowReviewSnapshot.test.ts:97-114`) — the PostgREST SQLSTATE rides under `pgrst*` keys so the pin stays true. That existing returned-error test case is EXTENDED in the same change (red first, invariant 1): it currently proves nothing about the `error` context value; it gains assertions that `fields.error` is the message string (`"permission denied"`), `fields.pgrstCode` is `"42501"`, and `fields` still has no `code` property. The defective production line is `lib/admin/readShowReviewSnapshot.ts:51` (raw object → `serializeError`'s non-`Error` arm → `String(...)` → `'[object Object]'`, `lib/log/serializeError.ts:8-10` via `lib/log/logger.ts:38` — the CI runtime object is a plain object, not `instanceof Error`, which is why the fatal path was unreadable). The `catch` branch at `lib/admin/readShowReviewSnapshot.ts:60-63` is unchanged. No behavior change — same return values, same log level, same code path; log content only.

### 4.3 Spec adoption

`tests/e2e/admin-changes-feed-layout.spec.ts`: delete the local `LOADED_REVIEW_MODAL` constant (import from the helper), and replace lines 133-135 (`page.goto` + bare `toBeVisible`) with `const modal = await openShowReviewModal(page, slug)`. Everything downstream (list lookup, atomic measure poll) is unchanged.

### 4.4 Re-wiring into batch 1

- `.github/workflows/app-e2e.yml:144`: add `tests/e2e/admin-changes-feed-layout.spec.ts` to the run-step file list (alphabetical position irrelevant to Playwright ordering; keep the list readable).
- `scripts/check-app-e2e-executed.mjs:33-53` (`REQUIRED`): add `"admin-changes-feed-layout.spec.ts": 6` — 3 bands × 2 projects, first-attempt-passed semantics per the oracle's own rules (`scripts/check-app-e2e-executed.mjs:88-101`). Update the stale header comment at `scripts/check-app-e2e-executed.mjs:25` (which records the spec leaving the batch).
- `tests/ci/_metaE2eWorkflowCoverage.test.ts:119`: delete the `UNSEEN` allowlist row (the guard makes wiring explicit by design).
- `scripts/check-app-e2e-executed.mjs` (same script, second duty): after the floor check passes, read the run's own JSON report and PRINT every `infra-recovery` annotation (test title + description) to stdout, plus a total count line, so recoveries are visible in the job log of GREEN runs — the list reporter does not print annotations, and the artifact upload step is failure/dispatch-only (`.github/workflows/app-e2e.yml:152-160`). Informational output only; never a gate (a recovered run is a green run by design).
- `.github/workflows/app-e2e.yml` header comment block (`.github/workflows/app-e2e.yml:5-14`): rewrite the admin-changes-feed paragraph — it currently records the AC-4 drop and the (now-disproven) flake framing; it should record the re-entry and cite this spec.

### 4.5 Ledger + docs bookkeeping

- `BACKLOG.md` `BL-CHANGES-FEED-MODAL-BATCH-FLAKE` entry graduates to `BACKLOG-archive.md` on merge with the measured mechanism recorded (the archive entry corrects the filed theory explicitly so no future reader re-derives fixture isolation).
- New spec doc (this file) gets its `docs/superpowers/specs/README.md` index row.

## 5. Acceptance criteria

- **AC-1:** `openShowReviewModal` exists with the §4.1 contract. The empty-slug guard is cheaply assertable and gets a test (the plan chooses the mechanics — pure-function extraction under vitest, or a scoped playwright case; `test.info()` is playwright-runtime, so any annotation assertion must run under playwright). The recovery branch (steps 5-7) has NO deterministic test — that is §7 limit 2, stated there with its accepted survivor — so AC-1 claims existence and contract conformance by review plus the happy path executing in AC-2, nothing more.
- **AC-2:** `tests/e2e/admin-changes-feed-layout.spec.ts` passes locally 6/6 (`--project=mobile-safari --project=desktop-chromium`) against a freshly seeded database using the helper.
- **AC-3:** The fatal snapshot log context carries `error` (the message string), `pgrstCode`, `pgrstDetails`, `pgrstHint` — and still no `code` property — asserted by extending the existing returned-error case in `tests/admin/readShowReviewSnapshot.test.ts:97-114`, red first (§4.2 names the defective production line).
- **AC-4:** Workflow wiring lands as §4.4 (run list + oracle row + allowlist removal + comment refresh) in the same PR.
- **AC-5:** Five consecutive green `pull_request` runs of `app-e2e.yml` with the spec wired in, `--retries=0`, zero `test.fail()`/skip laundering (the executed-count oracle enforces the floor). Any red restarts the count; a red whose server log shows a NON-`show_review_snapshot_failed` cause is triaged on its own merits.
- **AC-6:** Every `infra-recovery` annotation occurrence in those five runs is reported in the PR, read from the job logs' §4.4 oracle print (count may be zero). The oracle's annotation-print duty itself gets a vitest case against a fixture report containing one `infra-recovery` annotation (red first: the print code does not exist).

## 6. Consequence bound + threat fence (for review dispatches)

- **Consequence bound:** every navigation to the modal either (a) yields the loaded modal, (b) recovers once from the error boundary with a surfaced annotation, or (c) fails loudly naming the boundary and the server signature. A conservative failure plus a surfaced annotation is a DOCUMENTED LIMIT, not a finding. There is no silent-pass path: a deterministic defect fails on the post-reset re-wait.
- **Threat fence:** the helper defends against transient infrastructure faults (gateway 502-class) on CI-hosted local Supabase during e2e runs. Adversarial inputs, production outages, non-CI environments, and faults that survive a reset are out of scope — the last of these is deliberately allowed to fail the test.

## 7. Documented limits

1. **The upstream cause of the Kong 502 is not settled.** PostgREST restart, pool pressure, and upstream timeout are all consistent with the observed body text. The §4.2 logging fix is the instrument: the next occurrence carries `message`/`code`/`details` in the fatal path itself. Until then, tuning the CI Supabase stack (§3, option 4) stays unfiled speculation.
2. **The recovery path has no synthetic fault-injection test.** The snapshot RPC is called server-side (Next server → Supabase), out of `page.route()` reach, and a dev-only fault hook is product surface this arc refuses to add. The recovery path's proof is the five-green loop plus the annotation trail (AC-5/AC-6). A mutant that deletes the retry branch reverts the helper to the pre-fix behavior — which the five-green loop only catches probabilistically (~2/5 per-run historical failure rate). Accepted: the alternative guards all require product-side fault injection.
3. **The historical failure rate is a two-sample estimate.** Two failures in five acceptance runs bounds nothing tightly; the five-green bar is the operative acceptance, not a statistical claim.
4. **A real regression that happens to render the admin error boundary gets one free reset per test.** Cost bound: one reset + ≤30s per test, annotation always surfaced; a deterministic regression still fails every test. Accepted as the price of recovering the transient class.

## 8. Ledger filings (peers this arc does not fix)

1. **`BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION`** — two overlapping censuses (2026-08-15, not deduplicated against each other) share the starve-on-boundary shape: `rg -l 'published-show-review-modal' tests/e2e/*.spec.ts` names 7 other specs asserting the modal testid (`admin-lifecycle-layout`, `admin-lifecycle-transitions`, `admin-parse-panel`, `attention-modal-gallery`, `dev-capture`, `font-binding`, `picker-flow`), and `rg -c 'admin\?show=' tests/e2e/published-*.spec.ts` names 7 navigating the modal URL directly (`published-review-modal.{layout,crew-actions,deeplink,interactions,reopen,realtime}`, `published-show-attention`). The filing derives its member list from re-running both greps, not from this snapshot. Deferral reason (c): spans many sites and several workflows (`published-modal-e2e.yml`, `lifecycle-layout-e2e.yml`, …), blowing this arc's review scope. **Reachability:** INFERRED, NOT PROBED per-spec — the class mechanism is proven by this arc's CI evidence; the probe that settles each peer is its own workflow's failure history.
2. **`BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`** — whether `readShowReviewSnapshot` (and the loader's other fail-hard read) should absorb one bounded retry before throwing, sparing real admins the error-boundary flash on a transient 502. Deferral reason (a): reverses a ratified fail-hard posture (`app/admin/_showReviewModal.tsx:25-30`) — a product decision this test-infra arc cannot settle. Evidence: §2.1 log excerpts.

## 9. Invariant-8 disposition

No UI surface is touched: changes land in `tests/`, `scripts/`, `.github/workflows/`, and one log-content-only edit in `lib/admin/`. Plan closeout carries `impeccable-gate: N/A — no UI surface`.
