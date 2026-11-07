# Crew page offline, piece 2 (offline reports): implementation plan

> **For agentic workers:** executed natively by the session that wrote it (autonomous ship, approved by the owner 2026-10-26). Steps use checkbox syntax for tracking.

**Goal:** a report written with no signal is held on the phone, sent by itself later under the same idempotency key, and labelled for Doug as written offline.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**Architecture:** a phone-wide IndexedDB queue (`lib/reports/offlineQueue.ts`), a page-level sender (`lib/reports/offlineSender.ts`) driven from a new client component beside the footer report button (`components/shared/ReportQueueStatus.tsx`), and `POST /api/report` gaining an optional `offline` object and `writer` key. The modal decides when to hold a report; the sender decides what each server answer means.

**Tech stack:** Next.js 16.3, React 19, IndexedDB (`fake-indexeddb` 6.2.5 in tests), Web Locks where available, Vitest, Playwright through the existing crew offline proxy.

**Spec (canonical):** `docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md` §5, the §6 row `REPORT_SUBMITTED_FROM_OFFLINE_QUEUE`, the §7 Reports bullet. §1.1 is closed. Piece 1 merged as PR #983 (`d8d1ab390`).

**Branch:** `feat/crew-offline-reports`, worktree `../FX-worktrees/crew-offline-reports`, cut from `origin/main` at `9054c83c1`.

**Implementer:** Opus / Claude Code for every task (AGENTS.md hard rule: the diff touches `components/`).

## Global constraints

- Copy, verbatim from spec §5.1: "Saved on your phone." (bold) then "It will send by itself when you have signal."; "1 report waiting for signal" / "N reports waiting for signal"; "1 report couldn't be sent" / "N reports couldn't be sent". The waiting count is `bg-warning-bg text-warning-text`. No em dash in any user-visible string.
- Queue cap: 10 queued or failed records per phone. An 11th shows the existing failure copy.
- Sender triggers: page load, `online`, `visibilitychange` to visible, every 60 seconds while any is queued.
- Rate-limit wait: `Retry-After` when present, 20 minutes otherwise.
- Pre-switch flush: up to 3 seconds.
- `writtenAt` no later than server receipt plus 24 hours, or `offline` is dropped and logged.
- Issue section: heading "Written with no signal"; "Written at {writtenAt} (phone time), sent at {server receipt time}."; "They were looking at the copy saved at {pageRenderedAt}." (omitted when null).
- No migration. `offline` lives in `reports.context`.
- `components/crew/**` is not edited (a redesign session owns it). `app/sw.js/**`, `components/offline/**` and `lib/offline/**` are not edited: this piece only imports `lib/offline/marker.ts`, `lib/offline/crewUrl.ts` and `lib/offline/viewerKey.ts`.

## Review focus

Failure modes the spec implies and a person would meet. Each has a named test in its owning task.

1. **A captive portal answers the sender with 200 HTML.** The record must stay queued: neither delivered nor failed (Task 5 case "not our route's answer").
2. **Private browsing or a storage refusal, so IndexedDB will not open.** The modal must keep the draft and show the existing failure copy, never the "Saved on your phone" line (Task 6 case "storage unavailable").
3. **The crew member closes the modal while the POST is hanging, then it fails.** The report is held, not stranded in tab-scoped `sessionStorage` (Task 6 case "detached network failure").
4. **A shared phone: a name switch with unsent reports.** Nothing is filed under the wrong name (Task 3 mismatch cases, Task 9 flush cases).
5. **A long queue meets the 3-an-hour limit partway through a pass.** That show waits, another show's records still go, nothing is marked failed (Task 5 case "429 blocks only that show").

---

## 0. Spec questions

**Q1. §6 says the code never reaches the UI, and `tests/messages/codes-coverage.test.ts:54` requires every `REPORT_*` literal in `app/api/report/route.ts` to be in the catalog.** Plan reading: add an admin-log-only §12.4 row (`dougFacing: null`, `crewFacing: null`), the shape 31 rows already have, including piece 1's `SAVED_COPY_STATUS_LOOKUP_FAILED` (`lib/messages/catalog.ts:3643`). That satisfies both: the row renders nowhere. The gate is not edited and the literal is not moved out of its sight. The three lockstep updates land in Task 3's commit.

**Q2. §5.1 says the request "carries `writer`", and the marker is not always a `save` marker on a crew surface.** `_CrewShell.tsx:712` gives `viewer.kind === "admin"` the crew surface, and `SavedCopySlot.tsx` renders `purge` for that viewer. `saveMarkerFor` also falls back to `purge` when the viewer key or epoch is unavailable (`lib/offline/serverMarkers.ts:37-41`). Plan reading: both `writer` and `pageRenderedAt` are null when the marker is not `save`, the report still queues, and the server checks `writer` only when the body carries one. Recorded as a §9 limit (§8 of this plan).

**Q3. §5.1 "the existing failure copy" for a failed record.** A writer refusal is `401 { ok: false }` with no code, whose modal fallback today is the `NETWORK_UNREACHABLE` copy, wrong for a refusal. Plan reading: the record stores the answer's cataloged code (`errorCode`, an addition to the §5.1 field list); the failed-record modal shows a fixed line, "This report couldn't be sent. Send it again or discard it.", plus the catalog copy when `errorCode` is cataloged.

**Q4. §5.1 "manual resend".** Plan reading: a manual resend mints a fresh key. Every final answer means nothing was filed under the old key, and `REPORT_HORIZON_EXPIRED` would refuse the old key forever. Its `writtenAt` and `pageRenderedAt` stay as recorded, and `writer` is the current page's.

## 1. Readings the plan relies on

- **The queue is crew-only.** `surface === "crew"` with a non-null `showId`. Admin and help modals are byte-for-byte unchanged in behavior. `tests/components/report/_metaSurfaceComparisons.test.ts` allows only the crew comparison in the modal.
- **Own database.** `fxav-report-queue`, version 1, store `reports`, keyPath `id`. It is not `fxav-offline`: the kill switch deletes that one by name (`lib/offline/killSwitch.ts:33`), and a held report must not die with a saved copy. Each operation opens, runs one transaction, and closes.
- **Where the UI mounts.** `ReportButton` renders `<ReportQueueStatus>` when `surface === "crew"` and `showId` is non-null. Footer is the only caller with that surface (`components/admin/PreviewBanner.tsx`, the help CTA and the admin cards pass `admin` or `help`), so spec §5.1's "beside the report button" holds without editing `Footer.tsx`, and `_CrewShell.tsx`'s comment citing `Footer.tsx:186` stays true.
- **Every crew modal gets the queue.** `CardReportTrigger` and `CrewSearchResults` mount `ReportModal` directly. The modal reads the marker from the DOM, so neither caller changes.
- **The sender's rate-limit wait is in memory, per show.** A reload forgets it and costs one more 429, which the quota rollback does not count (`QuotaDeniedRollback`, `lib/reports/submit.ts:1076`).
- **What "final" requires.** A final answer must be JSON from the route. An unparseable body is not an answer from the route (captive portal, gateway HTML) and keeps the record queued.
- **The Service Worker never sees these requests.** `classifyRequest` ignores non-GET (`lib/offline/crewUrl.ts:55`).
- **`tests/reports/*` needs no partition edit**: new DB-free files there run in the default serial project as their siblings do. `tests/lib/**` and `tests/components/**` are in the parallel project.

## 2. Meta-test inventory

| Suite | Action |
|---|---|
| `tests/messages/codes-coverage.test.ts`, `tests/cross-cutting/codes.test.ts` | Satisfied by the Task 3 catalog row; not edited |
| `tests/reports/_metaInfraContract.test.ts` | the new offline fields module makes no Supabase or database call, so no registry row; `reportContext`, newly exported, carries `// not-subject-to-meta:` as its neighbours at `lib/reports/submit.ts:409` and `lib/reports/submit.ts:450` do |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | Route already instrumented (`tests/log/_metaMutationSurfaceObservability.test.ts:374`); no new surface |
| `tests/components/report/_metaSurfaceComparisons.test.ts` | Stays green: crew comparison only |
| `tests/components/_metaLiveRegionMounting.test.ts` | Extended by population: the new `role="status"` is unconditional |
| `tests/styles/_metaBgAccentInventory.test.ts` | New rows for the modal's Done and Send again buttons (ordinals 5, 6) |
| `tests/styles/controlOutlineScan.ts`, `tests/styles/_metaControlOutlineFill.test.ts`, `tests/styles/tapTargetCensus.ts` | Line-keyed rows for `ReportModal.tsx` (lines 590, 643, 666, 719) and `ReportButton.tsx` (line 142) re-keyed by content after each edit; Discard gets a census or control-outline row if the scanners claim it |
| `tests/docs/_metaInteractionTimingInventory.test.ts` | Two new §5.5 rows |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts`, `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` | Task 10 wiring |

No advisory lock is touched: the plan adds no `pg_advisory*` holder.

## 3. Sweeps run at plan time

**S1, ledger.** `grep -n 'offline\|OFFLINE' BACKLOG.md DEFERRED.md` printed nothing. No entry to claim or mark. Recorded here for invariant 12.

**S2, line-keyed rows.** `grep -rnE '(ReportModal|ReportButton|Footer|AvatarMenu)\.tsx:[0-9]|api/report/route\.ts:[0-9]|reports/submit\.ts:[0-9]' tests DESIGN.md` hits the rows in §2 plus `tests/specLint/fixtures/claimSweep/**`, which are frozen fixtures and are left alone. `tests/styles/tapTargetCensus.ts` and `controlOutlineScan.ts` key by `file` and `line` fields, so they are also found by `grep -n 'ReportModal.tsx\|ReportButton.tsx' tests/styles/*.ts`.

**S3, callers of the modal and button.** `git grep -lE 'ReportModal|ReportButton' -- app components lib` lists `Footer`, `PreviewBanner`, `DataQualityWarningControls`, `StagedReviewCard`, `AppHealthPopover`, `step3ReviewSections`, `ReviewModalShell`, `CardHeaderActions`, `CrewSearchResults`, `TileErrorFallback`, `HelpReportCta`, `CardReportTrigger`, `lib/crew/cardReportContext.ts`, `lib/notify/templates/reportProblem.ts`, `app/globals.css`. Disposition: all keep their props; the new prop is optional and only `ReportQueueStatus` passes it.

## 4. Acceptance criteria

- AC-1 A crew report submitted while `navigator.onLine` is false, or whose POST fails with a network error, becomes a queued record carrying `writtenAt`, `pageRenderedAt` and `writer`; the modal shows the §5.1 copy and a Done button (§5.1).
- AC-2 Storage: one record per key, one transaction per change, the cap check and `add` in one read-write transaction, survival across tab close, two tabs both keep their records, a failed record stays (§5.1).
- AC-3 The sender runs on all four triggers, oldest first, under a Web Lock where available, reusing the key (§5.1).
- AC-4 Result table: success removes; network error, 429, 409 `IDEMPOTENCY_IN_FLIGHT` and 5xx keep queued; every other route answer marks failed (§5.1).
- AC-5 The button shows the waiting count and the failed count for this show; tapping the failed count opens the modal with the text, for a resend under the current identity or a discard (§5.1).
- AC-6 The cap: an 11th shows the existing failure copy and keeps the draft (§5.1).
- AC-7 `POST /api/report` validates `offline` and `writer`, stores `offline` in `context`, refuses a writer mismatch with the existing authentication failure and does not file (§5.1, §5.2).
- AC-8 The issue body gains the "Written with no signal" section (§5.2).
- AC-9 `REPORT_SUBMITTED_FROM_OFFLINE_QUEUE` is emitted by `log.info` on the success branch when `offline` is present, and reaches no UI (§5.2, §6).
- AC-10 "Not you? Switch person" waits up to 3 seconds for queued records before it submits (§5.1, §8).
- AC-11 The §7 Reports cases run in a real browser in Chromium and WebKit, wired into CI (§7).

## 5. Conventions for every task

- **Worktree.** All commands run in `/Users/ericweiss/FX-worktrees/crew-offline-reports` (invariant 11).
- **TDD (invariant 1).** RED: write the test, run the task's `red=` command, observe the stated failure. GREEN: minimal implementation, same command passes. One commit per task (invariant 6), `--no-verify`.
- **New modules and RED validity.** The RED step also creates a typed stub whose exports `throw new Error("unimplemented")`, so the observed RED is a throw or assertion, never "Cannot find module".
- **Scoped vs heavy.** Scoped `pnpm exec vitest run <files>` runs unwrapped. Full-suite vitest, Playwright and builds go through `pnpm heavy`. Typecheck runs as `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`.
- **Re-key after edit.** After any edit to a file in S2, re-run the sweep and re-key rows by content (opening tag), not by adding the diff's delta. Each task's commit leaves `tests/styles` green.
- **Strings under test.** Each exact-copy assertion gets the four pre-dispatch mutants from `docs/agents/writing-plans.md`, results in the commit body.
- **Pre-code UI checklist** (AGENTS.md) before Tasks 6, 7, 8: no em dash, 44px targets on every new control, canonical token classes, contrast for every new text and background pair, focus ring offsets matching the ground.
- **Clock reads** are in event handlers and the sender only. Nothing reads the clock during render (`tests/help/_metaServerTimeGuard.test.ts`).

## 6. Transition inventory

States of the modal this plan adds or touches, and of the queue status. Nothing here animates; the modal's only motion is its entry (`sheet-rise`), which is unchanged.

| From | To | Behavior |
|---|---|---|
| composing | submitting | Existing, instant |
| submitting | queued | Instant: textarea stays, read-only; notice and Done replace the action row; focus moves to Done |
| composing (offline) | queued | Passes through `submitting` for one storage write; instant |
| submitting | failed-retryable (cap, storage unavailable) | Existing arm, instant, draft kept |
| queued | closed | Existing close path, instant unmount |
| failed record open | succeeded | Existing arm, instant |
| failed record open | queued | As submitting to queued |
| failed record open | closed (Discard) | Instant unmount |
| count 0 | count N | Instant; the status region text changes |
| count N | count 0 | Instant; visual rows unmount, the status region stays mounted and empties |
| count N | count M | Instant text change |

Compound: a record sent by the sender while the failed-record modal is open changes the waiting count behind the scrim, with no effect on the modal. A failed record removed by another tab while its modal is open: Send again still replaces or delivers (`replaceReport` adds even when the old id is gone).

## 7. Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1: Offline fields: parse and issue section

<!-- task: red=`pnpm exec vitest run tests/reports/offlineMeta.test.ts` red-state=authored red-target=`lib/reports/offlineMeta.ts` why=`parseOfflineFields and offlineIssueLines are stubs that throw, so every case fails on the throw` ac=AC-7,AC-8 -->

**Files**

```text
create  lib/reports/offlineMeta.ts
create  tests/reports/offlineMeta.test.ts
```

**Produces:**

```ts
export type OfflineFields = { writtenAt: string; pageRenderedAt: string | null; sentAt: string };
export const OFFLINE_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
export function parseOfflineFields(
  raw: unknown,
  receivedAt: Date,
): { fields: OfflineFields | null; dropped: boolean };
export function offlineIssueLines(fields: OfflineFields | null | undefined): string[];
```

- [ ] **Step 1: failing tests.** `parseOfflineFields`: `undefined` and `null` give `{ fields: null, dropped: false }`; a non-object, a missing or non-string `writtenAt`, `writtenAt: "yesterday"`, and a `writtenAt` of receipt + 24 h + 1 ms all give `{ fields: null, dropped: true }`; receipt + 24 h exactly passes (boundary derived from `OFFLINE_CLOCK_SKEW_MS`); a `writtenAt` a month old passes (no lower bound); a real `new Date().toISOString()` passes (premise that the validator accepts the shape the client writes); `pageRenderedAt` null passes as null; a malformed `pageRenderedAt` gives null with `dropped: true` and keeps `writtenAt`; `sentAt` is `receivedAt.toISOString()`. `offlineIssueLines`: `null` and `undefined` give `[]`; a fields object gives the heading line `**Written with no signal**`, a blank line, then the exact sentences; with `pageRenderedAt: null` the "They were looking" line is absent, asserted against the joined output.
- [ ] **Step 2:** run the marker command, expect throws.
- [ ] **Step 3:** implement with `isIsoUtc` (`lib/offline/marker.ts:158`, already exported and dependency-free).
- [ ] **Step 4:** same command passes; four mutants on the section strings.
- [ ] **Step 5:** commit `feat(report): parse offline fields and build the issue section`.

### Task 2: Issue bodies and stored context

<!-- task: red=`pnpm exec vitest run tests/reports/issueBody.test.ts` red-state=authored red-target=`lib/reports/submit.ts:228` why=`RequestBody has no offline field and neither builder nor reportContext reads one, so the new section and context cases fail` ac=AC-7,AC-8 -->

**Files**

```text
modify  lib/reports/submit.ts   (RequestBody line 23, reportContext line 228, buildAdminIssueBody line 410, buildCrewIssueBody line 451)
modify  tests/reports/issueBody.test.ts
```

**Produces:** `RequestBody` gains `offline?: OfflineFields | null` and `writer?: string | null`. `reportContext` becomes exported with a `// not-subject-to-meta:` comment.

- [ ] **Step 1: failing tests.** With `offline` set, the crew body has the section after the crew member's note and before "Page state at submission", and the admin body after "Doug's note" and before "Raw snippet": assert by index order with a premise that both anchors exist. Without `offline`, both bodies are unchanged byte for byte against the same fixture built without the field. `reportContext({ ...body, offline })` has `offline` equal to the fields; without it, the key is absent (`"offline" in context` is false), so stored rows do not change shape. `writer` never appears in `reportContext` output or either body, whatever its value.
- [ ] **Step 2:** run; the section cases fail.
- [ ] **Step 3:** insert `...offlineIssueLines(body.offline)` with its blank separator in both builders; add the conditional spread in `reportContext`.
- [ ] **Step 4:** command passes; `pnpm exec vitest run tests/reports/_metaInfraContract.test.ts` passes.
- [ ] **Step 5:** commit `feat(report): add the offline section to issue bodies and context`.

### Task 3: Route: validate, refuse a writer mismatch, emit the code

<!-- task: red=`pnpm exec vitest run tests/reports/offlineRoute.test.ts` red-state=authored red-target=`app/api/report/route.ts:218` why=`handleReport passes the raw body through and reads neither writer nor offline, so a mismatched writer is filed and no code is emitted` ac=AC-7,AC-9 -->

**Files**

```text
modify  app/api/report/route.ts
modify  docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md   (§12.4 row after line 3116)
modify  lib/messages/__generated__/spec-codes.ts                  (through pnpm gen:spec-codes)
modify  lib/messages/catalog.ts                                   (row after line 3643)
create  tests/reports/offlineRoute.test.ts
```

**Consumes:** `parseOfflineFields`, and `viewerKey` from `lib/offline/viewerKey.ts:20`.

- [ ] **Step 1: failing tests**, through `handleReport(req, deps)` with a spy `submitReport`, a real `viewerKey` under a test `PICKER_COOKIE_SIGNING_KEY` value, and `setLogSink`:
  - writer matches the resolved crew member: `submitReport` called once, with `offline` normalized (`sentAt` set) and the original body otherwise.
  - writer for another crew member of the show: 401 `{ ok: false }`, `submitReport` not called.
  - writer present, picker `no_selection`, admin session valid: 401, not filed. Failure mode: a queued record filed under an admin's name.
  - writer present, `viewerKey` returns null (signing key missing): 500 `REPORT_PIPELINE_FAILED`, not filed, so the record stays queued rather than failing for good.
  - writer absent, crew or admin: unchanged path (no refusal).
  - `writer: 7` and a 200-character writer: 400.
  - `offline` with a far-future `writtenAt`: filed with `offline` absent, one `log.warn` record. `offline` absent: no warn.
  - success with `offline`: one `log.info` record with `code: "REPORT_SUBMITTED_FROM_OFFLINE_QUEUE"`, `showId` and `status`, asserted through the log sink, after `submitReport` resolved. Success without `offline`, and a 502 with `offline`: no such record.
  - the record never carries `writer`, `message` or the idempotency key.
- [ ] **Step 2:** run; mismatch and emit cases fail.
- [ ] **Step 3:** `readRequestBody` rejects a non-null `writer` that is not a string of at most 128 characters. In `handleReport`, after `authenticateReportRequest`: when `body.writer` is non-null, a non-crew auth or a different key answers `errorJson(401, { ok: false })`, a null key answers `errorJson(500, { ok: false, code: "REPORT_PIPELINE_FAILED" })`. Then parse `offline` with `new Date()`, `log.warn` on `dropped`, and pass `{ ...body, offline: fields }` with the key omitted when null. Emit after `submitReport` returns (post-commit, invariant 10).
- [ ] **Step 4:** add the admin-log-only row, `pnpm gen:spec-codes`, the catalog row (`followUp: "Eric → read the report's Written with no signal section"`). Same command passes; `pnpm exec vitest run tests/messages/codes-coverage.test.ts tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts tests/reports/auth.test.ts tests/reports/nullShow.test.ts tests/cross-cutting/auth-chain-audit.test.ts` passes.
- [ ] **Step 5:** commit `feat(report): accept offline fields and refuse a mismatched writer`, the three lockstep files included.

### Task 4: The queue store

<!-- task: red=`pnpm exec vitest run tests/lib/reports/offlineQueue.test.ts` red-state=authored red-target=`lib/reports/offlineQueue.ts` why=`every export is a stub that throws, so the storage, cap and body cases fail on the throw` ac=AC-2,AC-6 -->

**Files**

```text
create  lib/reports/offlineQueue.ts
create  tests/lib/reports/offlineQueue.test.ts
create  tests/components/report/pageIdentity.test.tsx
```

A fresh `IDBFactory` is stubbed as global `indexedDB` per case, as `tests/lib/offline/idbStore.test.ts` does.

**Produces:**

```ts
export const QUEUE_CAP = 10;
export type QueuedReportStatus = "queued" | "failed";
export type QueuedReport = {
  id: string; // the idempotency key
  showId: string;
  slug: string | null;
  surface: "crew";
  surfaceId: string;
  context: Record<string, unknown>;
  message: string;
  writtenAt: string;
  pageRenderedAt: string | null;
  writer: string | null;
  status: QueuedReportStatus;
  errorCode: string | null;
};
export type HoldResult = "held" | "full" | "unavailable";
export function enqueueReport(report: QueuedReport): Promise<HoldResult>;
export function replaceReport(oldId: string, report: QueuedReport): Promise<HoldResult>;
export function listReports(): Promise<readonly QueuedReport[]>; // oldest first, [] when unavailable
export function deleteReport(id: string): Promise<void>;
export function failReport(id: string, errorCode: string | null): Promise<void>;
export function subscribeQueue(listener: () => void): () => void;
export function queuedRequestBody(report: QueuedReport): Record<string, unknown>;
export function readPageIdentity(): { writer: string | null; pageRenderedAt: string | null };
export function pageSlug(): string | null;
```

- [ ] **Step 1: failing tests.**
  - enqueue then list round-trips every field; list is oldest first by `writtenAt`, ties by `id`.
  - two enqueues of different ids from one surface both survive; `Promise.all` of 2 enqueues at 9 records gives exactly one `held`, one `full`, and 10 records (the cap check and add share a transaction). A premise asserts 9 before the race.
  - cap counts failed records: 10 failed, then `full`.
  - enqueueing an id already stored answers `held` and does not change the stored record, even at the cap.
  - `failReport` sets status and code; on a missing id it writes nothing (a resurrect mutant fails here); on an already-failed record it leaves the earlier code.
  - `replaceReport` removes the old and adds the new in one transaction, at the cap too; a missing old id still adds.
  - no `indexedDB` global, and an open that errors: enqueue `unavailable`, list `[]`, delete and fail resolve.
  - every mutation notifies subscribers; unsubscribing stops it; a no-op `failReport` does not need to notify but must not throw.
  - `queuedRequestBody`: `idempotency_key` is `id`, `offline` has exactly `writtenAt` and `pageRenderedAt`, `surface` and `show_id` beat any same-named context key, `writer` is absent when null, `showSlug` is the slug.
  - `readPageIdentity` (in the jsdom file listed above): a template built from `markerAttributes` with a `save` marker whose assets hold a URL with `&` and `"` gives its viewer and render time, so entity decoding is proven on `outerHTML`; `keep`, `purge`, absent and malformed markers give both null.
  - `pageSlug`: `/show/a-b/tok` gives `a-b`; `/help/errors` gives null.
- [ ] **Step 2:** run; throws.
- [ ] **Step 3:** implement. Open per operation with `onversionchange` closing the connection. `enqueueReport`: one read-write transaction, `getKey(id)` then `count()` then `add`. `failReport`: `get` then `put` in one transaction, only for a record whose status is `queued`. `readPageIdentity` reads `document.getElementById(MARKER_ID)?.outerHTML` through `readMarker`. Subscribers live in a module `Set`.
- [ ] **Step 4:** command passes.
- [ ] **Step 5:** commit `feat(report): add the phone-wide report queue`.

### Task 5: The sender

<!-- task: red=`pnpm exec vitest run tests/lib/reports/offlineSender.test.ts` red-state=authored red-target=`lib/reports/offlineSender.ts` why=`classifySendResponse and createReportSender are stubs that throw, so every result and ordering case fails on the throw` ac=AC-3,AC-4 -->

**Files**

```text
create  lib/reports/offlineSender.ts
create  tests/lib/reports/offlineSender.test.ts
```

**Produces:**

```ts
export const RATE_LIMIT_WAIT_MS = 20 * 60 * 1000;
export const SEND_TIMEOUT_MS = 30_000;
export type SendVerdict =
  | { kind: "delivered" }
  | { kind: "retry" }
  | { kind: "wait"; until: number }
  | { kind: "final"; code: string | null };
export function classifySendResponse(
  status: number,
  body: unknown,
  retryAfter: string | null,
  now: number,
): SendVerdict;
export type ReportSender = {
  send(): Promise<void>;
  flush(timeoutMs: number): Promise<void> | null;
  noteQueued(count: number): void;
};
export function createReportSender(deps?: {
  fetchImpl?: typeof fetch;
  now?: () => number;
}): ReportSender;
export const reportSender: ReportSender;
```

- [ ] **Step 1: failing tests.**
  - `classifySendResponse` table, one row each: 201, 200 with `ok: true` delivered; 200 HTML (`body` null) retry ("not our route's answer"); 200 JSON without `ok: true` retry; 500, 502, 503 retry with and without a JSON body; 409 `IDEMPOTENCY_IN_FLIGHT` retry; 409 with any other code final; 429 JSON with `Retry-After: 120` waits until `now + 120000`, with an HTTP-date uses the date, with none or garbage `now + RATE_LIMIT_WAIT_MS`; 429 with `body` null retry; 410 `REPORT_HORIZON_EXPIRED`, 410 picker codes, 401 `{ ok: false }`, 403, 400 final, `code` carried or null; 401 with `body` null retry.
  - `send`: posts `queuedRequestBody` to `/api/report` oldest first with the same key on every attempt; delivered removes; final calls `failReport` with the code; a thrown fetch stops the pass with later records unposted and all still queued; failed records are never posted; `navigator.onLine === false` posts nothing.
  - "429 blocks only that show": A1, A2 of show A and B1 of show B, A1 answers 429: A2 not posted, B1 posted; a second `send` before `until` posts nothing for A; a second `send` at `until` posts A1. Delivered, wait and retry never call `failReport`.
  - 5xx on the first record still posts the second in the same pass.
  - timeout: a fetch that never settles aborts at `SEND_TIMEOUT_MS` under fake timers and stops the pass.
  - two concurrent `send` calls share one pass (each record posted once).
  - Web Locks: with a `navigator.locks` stub, the pass runs inside `request("fxav-report-sender", { ifAvailable: true })`; a null lock posts nothing; with no `navigator.locks`, it runs without one.
  - `flush`: `noteQueued(0)` and no pass running answers `null` synchronously; with records it settles when the pass settles, or at `timeoutMs` if the pass hangs (fake timers); it never rejects.
- [ ] **Step 2:** run; throws.
- [ ] **Step 3:** implement as specified. `blockedUntil` is a `Map<string, number>` inside the factory; a retry continues to the next record, a network failure ends the pass.
- [ ] **Step 4:** command passes.
- [ ] **Step 5:** commit `feat(report): add the offline report sender`.

### Task 6: The modal holds a report

<!-- task: red=`pnpm exec vitest run tests/components/report/ReportModalOffline.test.tsx` red-state=authored red-target=`components/shared/ReportModal.tsx:471` why=`submitOnce has no hold path: a rejected fetch lands in failed-retryable and an offline phone still calls fetch, so the queued cases fail` ac=AC-1,AC-6 -->

**Files**

```text
modify  components/shared/ReportModal.tsx
modify  the §2 style registries
create  tests/components/report/ReportModalOffline.test.tsx   (jsdom, fresh IDBFactory per case)
```

**Produces:** `ModalStatus` gains `"queued"`. The hold path uses `enqueueReport`, `readPageIdentity`, `pageSlug`.

- [ ] **Step 1: failing tests.**
  - `navigator.onLine` false on the crew surface: `fetch` is not called, one record is stored with the modal's key, draft, `writtenAt` read at the tap (fake clock), the marker's `writer` and `pageRenderedAt`, `context` holding the autocapture and `userAgent`; `data-state="queued"`; both copy lines are visible; the status region announces them; Done has focus; Done closes.
  - rejected fetch on the crew surface: same result, one record, `writtenAt` is the tap time, not the failure time.
  - no marker in the DOM: held with `writer` and `pageRenderedAt` null.
  - after queued, `sessionStorage` has no row for the surface, and a remount is empty with a different key ("a new report gets a fresh record and key"), while the first record is untouched.
  - resume path: a persisted failed attempt resumed offline holds under the ORIGINAL key.
  - "storage unavailable": no `indexedDB`, rejected fetch: `failed-retryable`, the `NETWORK_UNREACHABLE` crew copy, draft and persisted row intact, no "Saved on your phone".
  - cap: 10 records stored, rejected fetch: same as above; the draft stays, Retry is offered, and still 10 records.
  - "detached network failure": unmount mid-POST, reject: the record is stored and the persisted row with that key is gone; a persisted row holding a DIFFERENT key survives (compare-and-clear). With no `indexedDB`, the row survives, which keeps the existing detached contract at `ReportModal.test.tsx:1079`.
  - a 502 and a 400 on the crew surface: no record, existing behavior.
  - `surface` admin and help with a rejected fetch and with `onLine` false: `fetch` is called in both, no record, existing failure path.
- [ ] **Step 2:** run; queued cases fail.
- [ ] **Step 3:** implement. `submitOnce` reads `writtenAt` first. `canHold = surface === "crew" && showId !== null`. On offline: hold without a fetch. In the `catch`: hold before the `mountedRef` check, then a detached attempt compare-and-clears and returns. On `held`: `clearPersisted`, `setStatus("queued")`, `setMountedFromResume(false)`. The persist effect's early return gains `"queued"`. The compose arm stays mounted for `queued`: textarea `readOnly`, notice block (`bg-info-bg`, check glyph, `text-text-strong`, role-free), action row is the Done button with `autoFocus`.
- [ ] **Step 4:** command passes; `pnpm exec vitest run tests/components/report tests/styles tests/components/_metaLiveRegionMounting.test.ts tests/a11y` passes after re-keying.
- [ ] **Step 5:** commit `feat(report): hold a crew report when there is no signal`.

### Task 7: The modal resends or discards a failed record

<!-- task: red=`pnpm exec vitest run tests/components/report/ReportModalFailedRecord.test.tsx` red-state=authored red-target=`components/shared/ReportModal.tsx:69` why=`ReportModalProps has no failedReport prop, so the text is not filled in and no Discard or Send again control renders` ac=AC-5 -->

**Files**

```text
modify  components/shared/ReportModal.tsx
modify  the §2 style registries
create  tests/components/report/ReportModalFailedRecord.test.tsx
```

**Produces:** `ReportModalProps.failedReport?: QueuedReport`.

- [ ] **Step 1: failing tests.** With a stored failed record:
  - the textarea holds its text; `report-modal-failed-notice` has "This report couldn't be sent. Send it again or discard it." and, for `errorCode: "REPORT_HORIZON_EXPIRED"`, the catalog crew copy, and for null nothing more; no raw code appears anywhere (invariant 5).
  - a persisted row for the same `surfaceId` is neither read nor written nor cleared, through open, edit, send and close (a footer draft survives).
  - Send again posts `queuedRequestBody` semantics: a key different from the record's, the edited text, the record's `writtenAt` and `pageRenderedAt`, the CURRENT page's `writer`; on 201 the record is gone and the success arm shows.
  - Send again with a rejected fetch: `replaceReport` leaves one record, queued, under the new key, with the edited text; the queued notice shows.
  - Send again offline: same, no fetch.
  - Send again with a 401: the record stays failed, the modal shows the failure, Retry reuses the new key.
  - Discard removes the record and closes, with no fetch.
- [ ] **Step 2:** run; fails.
- [ ] **Step 3:** implement. `persistedAtMount` is null and the persist effect returns early when `failedReport` is set; `clearPersisted` calls go through a local guard. Send again label; Discard is a secondary button left of it.
- [ ] **Step 4:** command passes; registries green.
- [ ] **Step 5:** commit `feat(report): resend or discard a report that could not be sent`.

### Task 8: Queue status beside the report button

<!-- task: red=`pnpm exec vitest run tests/components/report/ReportQueueStatus.test.tsx` red-state=authored red-target=`components/shared/ReportQueueStatus.tsx` why=`ReportQueueStatus is a stub that renders nothing and starts no sender, so the count, trigger and tap cases fail` ac=AC-3,AC-5 -->

**Files**

```text
create  components/shared/ReportQueueStatus.tsx
modify  components/shared/ReportButton.tsx
modify  DESIGN.md   (§5.5 row: QUEUE_SEND_INTERVAL_MS, 60000)
modify  the §2 style registries
create  tests/components/report/ReportQueueStatus.test.tsx
```

**Consumes:** `listReports`, `subscribeQueue`, `reportSender`, `ReportModal`.

- [ ] **Step 1: failing tests.**
  - counts: one queued for this show "1 report waiting for signal", two "2 reports waiting for signal", with `bg-warning-bg` and `text-warning-text`; one failed "1 report couldn't be sent", three "3 reports couldn't be sent"; records of another show count for neither. None: no visual row.
  - the `report-queue-region` `role="status"` element is in the first render and stays through 0 to 1 to 0, its text changing; the failed button is outside it.
  - an `enqueueReport` after mount updates the count with no remount; a stale list landing after a newer one does not win (ordinal guard).
  - triggers, with a `send` spy injected through a mocked `reportSender`: once on mount; on `online`; on `visibilitychange` when visible and not when hidden; every 60 s only while any record on the phone is queued (fake timers, including another show's record); no interval with none; listeners and the interval removed on unmount.
  - `noteQueued` gets the phone-wide queued count.
  - tap: the failed button opens the modal with the oldest failed record of this show; closing it returns focus to the failed button when it remains, and to the report trigger when it is gone.
  - no `indexedDB`: renders no row, does not throw.
  - `ReportButton`: `surface="crew"` with a `showId` mounts it; `admin`, `help`, and crew with a null `showId` do not.
- [ ] **Step 2:** run; fails.
- [ ] **Step 3:** implement. Visual rows in a `flex shrink-0 flex-col items-end gap-1` cell so the band's text cell keeps its width at 390px; the failed row is a `min-h-tap-min` button with `focus-visible:ring-offset-surface-raised`. Rendered before the trigger inside `ReportButton`'s fragment. The waiting row is `aria-hidden` because the status region speaks it.
- [ ] **Step 4:** command passes; `pnpm exec vitest run tests/docs/_metaInteractionTimingInventory.test.ts tests/components/report tests/styles tests/components/_metaLiveRegionMounting.test.ts` passes.
- [ ] **Step 5:** commit `feat(report): show waiting and failed counts beside the report button`.

### Task 9: Flush before a name switch

<!-- task: red=`pnpm exec vitest run tests/components/auth/avatarMenuReportFlush.test.tsx` red-state=authored red-target=`components/auth/AvatarMenu.tsx:214` why=`onSwitchSubmit goes straight to the purge bracket and never asks the sender to flush, so the wait case sees clearAction start early` ac=AC-10 -->

**Files**

```text
modify  components/auth/AvatarMenu.tsx
modify  DESIGN.md   (§5.5 row: REPORT_FLUSH_WAIT_MS, 3000)
create  tests/components/auth/avatarMenuReportFlush.test.tsx
```

- [ ] **Step 1: failing tests**, on the `avatarMenuSavedCopy.test.tsx` harness with `reportSender` mocked:
  - `flush` returns a pending promise: neither the first purge nor `clearAction` has run; resolving it runs them in that order.
  - `flush` returns null: `clearAction` starts inside the tap, the existing ruling D5 case at `avatarMenuSavedCopy.test.tsx`, still synchronous.
  - `flush` is called with exactly `3000`, and only on an online, non-busy tap.
  - a real sender with a never-settling fetch and `noteQueued(1)`: the clear starts at 3000 ms, not 2999 (fake timers). 3000 is under `PENDING_TIMEOUT_MS` (8000), asserted as a premise so the watchdog cannot fire mid-wait.
- [ ] **Step 2:** run; fails.
- [ ] **Step 3:** first lines of the `startSwitch` callback: `const flush = reportSender.flush(REPORT_FLUSH_WAIT_MS); if (flush !== null) await flush;`.
- [ ] **Step 4:** command plus `pnpm exec vitest run tests/components/auth tests/docs/_metaInteractionTimingInventory.test.ts` pass.
- [ ] **Step 5:** commit `feat(auth): wait for queued reports before a name switch`.

### Task 10: Real-browser cases

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/crewOfflineProxy.unit.test.ts` red-state=authored red-target=`tests/e2e/helpers/crewOfflineProxy.ts:221` why=`the proxy answers only GET stubs, so the planned POST answer queue has no method and the new unit case fails` ac=AC-11 -->

**Files**

```text
modify  tests/e2e/helpers/crewOfflineProxy.ts and its unit test
modify  playwright.config.ts              (both offline testMatch regexes)
modify  .github/workflows/crew-e2e.yml    (file list at line 219, the measured-count comment, the timeout if the measured run needs it)
modify  tests/ci/_metaE2eWorkflowCoverage.test.ts and tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts, if they pin counts
create  tests/e2e/crew-offline-reports.spec.ts
```

**Harness readiness (`docs/agents/writing-plans.md`).** (a) Production build: `CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test --project=crew-offline-chromium --project=crew-offline-webkit tests/e2e/crew-offline-reports.spec.ts`, through the fixture's proxy, `assertServerUnderTest` in `beforeAll`. (b) Readiness: `pickAndSave` (crew shell, bar hydration signal, worker control, saved copy), then an effect-flush wait that the report trigger's `data-surface-id` is present and the status region exists. (c) Detach safety: no sampler outlives an element; counts are read with `toHaveText` and `expect.poll` over `page.evaluate`.

**No real issue is ever filed.** Every POST that could reach `createIssue` is answered by the proxy. Only the writer-mismatch POST goes upstream, and that refusal precedes `submitReport`.

- [ ] **Step 1:** failing proxy unit case: `answerNext(pathPrefix, answers)` answers successive POSTs from a list with status, JSON body and headers, then passes through; `reset()` clears it.
- [ ] **Step 2:** run; fails. Implement; passes.
- [ ] **Step 3:** the spec, both engines, one `seedShowWithCrew` per case:
  1. **Queue, tab close, send.** `refuse`; open the modal, write, Submit; the copy shows; Done; "1 report waiting for signal". Close the tab, open a new one on the saved copy; the count is still there. Proxy answers 201, dispatch `online`: count clears. The POST's key equals the stored key; `offline.writtenAt` is the stored one; `offline.pageRenderedAt` equals the marker's `data-rendered-at`; `writer` equals its `data-viewer`.
  2. **Two tabs.** Two pages submit under `refuse` at once; a reload shows "2 reports waiting for signal".
  3. **Answers that keep it queued.** Answers 503, 409 `IDEMPOTENCY_IN_FLIGHT`, 429: after each `online` dispatch the count stays; a fourth `online` posts nothing (the wait is live); a reload sends, 201, count clears. All four POSTs carry one key.
  4. **Writer refusal, real server.** A record's `writer` rewritten in IndexedDB; `online`; the proxy log shows a 401 from upstream; "1 report couldn't be sent"; tap opens with the text; proxy answers 201; Send again; count clears.
  5. **Discard.** Failed record; tap; Discard; count clears; a reload keeps it gone.
  6. **Cap.** Ten seeded records; `refuse`; Submit: the failure copy shows, the draft stays, an eleventh is not stored.
  7. **Band geometry at 390px.** One queued and one failed: the footer has no horizontal overflow (`scrollWidth <= clientWidth`), the failed button is at least 44px tall, and the report trigger keeps 44x44.
- [ ] **Step 4:** run in both engines; wire CI; `pnpm exec vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` passes.
- [ ] **Step 5:** commit `test(e2e): offline reports in Chromium and WebKit`.

<!-- /tasks -->

---

## 8. After the tasks

1. Spec §9 gains the limits this piece leaves, in one docs commit: a report queued on a page with no `save` marker carries no `writer`, so nothing checks who sends it; a record whose first POST was filed but whose answer was lost, followed by a name switch, is refused and can be resent as a duplicate issue, which is conservative and visible; the rate-limit wait is per page, and a reload costs one uncounted 429; iPhone storage eviction also evicts held reports.
2. The full gate list: `pnpm heavy pnpm test`, typecheck, `pnpm exec eslint .`, `pnpm format:check`, `pnpm spec:lint`.
3. The invariant-8 UI gate on the diff, findings and dispositions in a sibling closeout file with its marker line, P0 and P1 fixed or deferred.
4. Whole-diff Codex review, split by surface if the diff is large, to APPROVE.
5. Push, real CI green, `gh pr merge --merge`, fast-forward local `main` to `0  0`.
