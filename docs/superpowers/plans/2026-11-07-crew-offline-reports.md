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
3. **The crew member closes the modal while the POST is hanging, then it fails.** The report is held, not stranded in tab-scoped `sessionStorage`, unless they reopened it in the meantime, when the reopened modal owns it (Task 6 cases "detached network failure" and "reopened before the failure").
4. **A shared phone: a name switch with unsent reports.** Nothing is filed under the wrong name (Task 3 identity table, Task 9 flush cases).
5. **A long queue meets the 3-an-hour limit partway through a pass.** That show waits, another show's records still go, nothing is marked failed (Task 5 case "429 blocks only that show").

---

## 0. Spec questions

**Q1. §6 says the code never reaches the UI, and `tests/messages/codes-coverage.test.ts:54` requires every `REPORT_*` literal in `app/api/report/route.ts` to be in the catalog.** Plan reading: add an admin-log-only §12.4 row (`dougFacing: null`, `crewFacing: null`), the shape 31 rows already have, including piece 1's `SAVED_COPY_STATUS_LOOKUP_FAILED` (`lib/messages/catalog.ts:3643`). That satisfies both: the row renders nowhere. The gate is not edited and the literal is not moved out of its sight. The three lockstep updates land in Task 3's commit.

**Q2. §5.1 says the request "carries `writer`", and the marker is not always a `save` marker on a crew surface.** `_CrewShell.tsx:712` gives `viewer.kind === "admin"` the crew surface, and `SavedCopySlot.tsx` renders `purge` for that viewer. `saveMarkerFor` also falls back to `purge` when the viewer key or epoch is unavailable (`lib/offline/serverMarkers.ts:37-41`). Plan reading: a report is held only when the page names its author, because a record with no `writer` cannot be tied to anyone at send time: a later session of any kind would acquire it. So with no writer the report stays on today's failure path, the draft kept and Retry offered. `writer` comes from a `save` or `keep` marker; `pageRenderedAt` from a `save` marker, absent otherwise, as §5.3 says. The server takes the same line: a queued body with no `writer` is refused. Who loses: an admin viewing the crew page, and a crew member on a page rendered with the viewer key unavailable, keep today's behavior rather than gaining the queue. Recorded as a §9 limit.

**Q3. §5.1 "the existing failure copy" for a failed record.** A writer refusal is `401 { ok: false }` with no code, whose modal fallback today is the `NETWORK_UNREACHABLE` copy, wrong for a refusal. Plan reading: the record stores the answer's cataloged code (`errorCode`, an addition to the §5.1 field list); the failed-record modal shows a fixed line, "This report couldn't be sent. Send it again or discard it.", plus the catalog copy when `errorCode` is cataloged.

**Q4. §5.1 "manual resend".** Plan reading: the modal never POSTs a failed record. "Send again" swaps the failed record for a queued one in one transaction (`requeueReport`), which fixes a fresh key in IndexedDB before any network, and then runs the sender. So there is one sender, every resend attempt has a durable key, a closed modal changes nothing, an uncertain 5xx retries under the same key, and two tabs resending the same record cannot both win, because the swap only succeeds while the failed record exists. The key is fresh because every final answer means nothing was filed under the old one, and `REPORT_HORIZON_EXPIRED` would refuse the old one forever. `writtenAt` and `pageRenderedAt` stay as recorded; `writer` is the current page's.

## 1. Readings the plan relies on

- **The queue is crew-only.** `surface === "crew"` with a non-null `showId`. Admin and help modals are byte-for-byte unchanged in behavior. `tests/components/report/_metaSurfaceComparisons.test.ts` allows only the crew comparison in the modal.
- **Own database.** `fxav-report-queue`, version 1, store `reports`, keyPath `id`. It is not `fxav-offline`: the kill switch deletes that one by name (`lib/offline/killSwitch.ts:33`), and a held report must not die with a saved copy. Each operation opens, runs one transaction, and closes.
- **Where the UI mounts.** `ReportButton` renders `<ReportQueueStatus>` when `surface === "crew"` and `showId` is non-null. Footer is the only caller with that surface (`components/admin/PreviewBanner.tsx`, the help CTA and the admin cards pass `admin` or `help`), so spec §5.1's "beside the report button" holds without editing `Footer.tsx`, and `_CrewShell.tsx`'s comment citing `Footer.tsx:186` stays true.
- **Every crew modal gets the queue.** `CardReportTrigger` and `CrewSearchResults` mount `ReportModal` directly. The modal reads the marker from the DOM, so neither caller changes.
- **What a submission binds, at the tap.** `writer`, `pageRenderedAt`, the slug and `writtenAt` are read once when Submit is tapped, before any `await`. The page can change under a pending POST (a name switch revalidates it, and the footer's `surfaceId` survives that because it is keyed by slug, `components/layout/Footer.tsx:129`), so a read at hold time could put B's key on A's text.
- **A persisted attempt belongs to the person who wrote it.** The row also records the page's `writer`, and on the crew surface a modal only hydrates a row whose `writer` equals its own page's, read at mount (an absent field reads as null). The surface scope outlives a name switch (`components/layout/Footer.tsx:129`, `components/shared/CardReportTrigger.tsx:62`, `components/crew/search/CrewSearchResults.tsx:421`), and the key may already hold a reservation in the first person's name, so resuming it under another would recover their reservation with the second person's text (`lib/reports/submit.ts:905`). A mismatched row is treated as absent: a fresh key and an empty draft, and the first write replaces it. That also keeps one person's draft off another person's screen. It closes the same hole for an ordinary online retry.
- **Who may hold an attempt.** Each submission mints an `attemptId`, written to the persisted row before its first `await`. A hold may start only while the row still carries that id: a detached attempt that lost it to a remount or a later submission does nothing. A mounted attempt always owns its row.
- **A hold has one owner, and a remount joins it.** The running storage write is kept in a module `Map` keyed by `surfaceId`, and the row stays in place throughout. A modal that mounts while a write runs for its surface starts in `submitting` with that row's key and text, read-only, and takes the write's result: `held` shows the queued notice, a refusal shows the failure with the text kept. So a reopen during a write can neither fork a second draft nor share a key, and there is no window in which the attempt's text exists only in memory. The write's completion clears the row on `held` and leaves it on a refusal, so with nobody watching a refused attempt comes back as the ordinary resume banner.
- **Which send owns the stored `offline` fields.** The send that files the issue. `reportContext` covers a first reservation, and the retry's lease claim in `expiredLeaseRetry` (`lib/reports/submit.ts:905`) merges `offline` into the stored context in the same `UPDATE`, for an ordinary POST whose response was lost and then queued, and for a queued POST retried later, whose `sentAt` moves with the issue. A retry that finds the issue already on GitHub (`writeRecoveredIssueUrl`) changes nothing, because that issue was filed by the earlier request and carries no section of this send's.
- **The sender's rate-limit wait is in memory, per show.** A reload forgets it and costs one more 429, which the quota rollback does not count (`QuotaDeniedRollback`, `lib/reports/submit.ts:1076`).
- **What "final" requires.** A final answer must be JSON from the route. An unparseable body is not an answer from the route (captive portal, gateway HTML) and keeps the record queued. A body whose read fails or stalls is no answer at all, for the sender and the modal alike: a parse failure is told apart from a stream failure by `error.name === "SyntaxError"`.
- **Cross-tab.** Every queue change posts on a `BroadcastChannel` named `fxav-report-queue` where the browser has one, so another open tab re-reads the queue at once; with no channel, a tab catches up on `visibilitychange`.
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
| `tests/ci/_metaE2eWorkflowCoverage.test.ts`, `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts`, `scripts/check-crew-e2e-executed.mjs`, `tests/ci/modalWaitHelper/disposition.ts` | Task 10 rows, listed there |

No advisory lock is touched: the plan adds no `pg_advisory*` holder.

## 3. Sweeps run at plan time

**S1, ledger.** `grep -n 'offline\|OFFLINE' BACKLOG.md DEFERRED.md` printed nothing. No entry to claim or mark. Recorded here for invariant 12.

**S2, line-keyed rows.** Run: `grep -rnE '"?(lib/reports/submit\.ts|app/api/report/route\.ts|components/shared/ReportModal\.tsx|components/shared/ReportButton\.tsx|components/auth/AvatarMenu\.tsx)"?(:[0-9]|,? *$|", *line|.*line: *[0-9])' tests scripts DESIGN.md`, plus `grep -n 'ReportModal.tsx\|ReportButton.tsx' tests/styles/*.ts`. Hits that key by line, with their disposition, re-keyed by content in the task that moves them:

| Row | Moved by |
|---|---|
| `tests/adminAlerts/alertProducerScope.registry.ts:280` and `tests/adminAlerts/alertProducerScope.registry.ts:289` (the `submit.ts` lines 767 and 792), gate `tests/adminAlerts/_metaAlertProducerScope.test.ts:148` | Task 2 |
| `tests/styles/controlOutlineScan.ts` lines 322, 419, 420; `tests/styles/_metaControlOutlineFill.test.ts:482`; `tests/styles/tapTargetCensus.ts` lines 149, 472, 714 | Tasks 6, 7, 8 |

The other hits are path lists or prose: `tests/messages/_metaAdminAlertCatalog.test.ts`, `tests/messages/_metaAlertActionsContract.test.ts`, `tests/messages/_metaEmphasisRenderContract.test.ts`, `tests/cross-cutting/*`, `tests/log/*`, `tests/reports/*`, `tests/a11y/tapTargetInlineExemptions.test.ts` and `scripts/validation-report-fixtures.ts` name a file, or cite a line in a comment, and each task's verification runs them. `tests/specLint/fixtures/claimSweep/**` are frozen fixtures, left alone.

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
| failed record open | submitting | The swap and one sender pass; instant |
| submitting (resend) | succeeded | Existing arm, instant |
| submitting (resend) | queued | As submitting to queued |
| submitting (resend) | composing, failed notice | Refused again: the notice shows the new code, instant |
| submitting (resend) | stale | Instant: textarea stays, read-only; the notice says it was handled elsewhere; Close only |
| failed record open | closed (Discard) | Instant unmount |
| count 0 | count N | Instant; the status region text changes |
| count N | count 0 | Instant; visual rows unmount, the status region stays mounted and empties |
| count N | count M | Instant text change |

Compound: a modal closed and reopened during a hold mounts straight into `submitting` and joins it, then goes to `queued` or `failed-retryable`, all instant. A record sent by the sender while the failed-record modal is open changes the waiting count behind the scrim, with no effect on the modal. A failed record removed by another tab while its modal is open: Send again lands on `stale`, Discard is a no-op that closes.

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

<!-- task: red=`pnpm exec vitest run tests/reports/issueBody.test.ts tests/reports/offlineRecovery.test.ts` red-state=authored red-target=`lib/reports/submit.ts:228` why=`RequestBody has no offline field, neither builder nor reportContext reads one, and the lease claim in expiredLeaseRetry never touches context, so the section, context and recovery cases fail` ac=AC-7,AC-8 -->

**Files**

```text
modify  lib/reports/submit.ts   (RequestBody line 23, reportContext line 228, buildAdminIssueBody line 410, buildCrewIssueBody line 451)
modify  tests/reports/issueBody.test.ts
create  tests/reports/offlineRecovery.test.ts   (local database, the tests/reports/retry5xx.test.ts harness)
```

**Produces:** `RequestBody` gains `offline?: OfflineFields | null` and `writer?: string | null`. `reportContext` becomes exported with a `// not-subject-to-meta:` comment.

- [ ] **Step 1: failing tests.** With `offline` set, the crew body has the section after the crew member's note and before "Page state at submission", and the admin body after "Doug's note" and before "Raw snippet": assert by index order with a premise that both anchors exist. Without `offline`, each body equals a literal expected string captured from the pre-change builders before Step 3 (an independent baseline: comparing two calls of the changed builder would pass if both changed). `reportContext({ ...body, offline })` has `offline` equal to the fields; without it, the key is absent (`"offline" in context` is false), so stored rows do not change shape. `writer` never appears in `reportContext` output or either body, whatever its value.

  The recovery file, through the real `submitReport` with `createIssue` and `findIssueByMarker` mocked and the lease expired between attempts, reading `reports.context` and the issue body:
  - an ordinary POST reserves, `createIssue` fails, the retry carries `offline`: the stored context gains it and the issue has the section.
  - a queued POST at T1 fails creation, the retry at T2 succeeds: stored `sentAt` is T2, matching the issue's sentence.
  - a retry with no `offline` on a row with none: context byte-identical, no `offline` key.
  - a retry whose issue is found on GitHub: context unchanged, no second issue.
- [ ] **Step 2:** run; the section cases fail.
- [ ] **Step 3:** insert `...offlineIssueLines(body.offline)` with its blank separator in both builders; add the conditional spread in `reportContext`; the lease-claim `UPDATE` in `expiredLeaseRetry` merges `offline` into `context` when the body has it.
- [ ] **Step 4:** re-key `tests/adminAlerts/alertProducerScope.registry.ts` by content. Command passes; `pnpm exec vitest run tests/reports/_metaInfraContract.test.ts tests/adminAlerts/_metaAlertProducerScope.test.ts tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaAlertActionsContract.test.ts` passes.
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

- [ ] **Step 1: failing tests**, through `handleReport(req, deps)` with a spy `submitReport`, a real `viewerKey` under a test `PICKER_COOKIE_SIGNING_KEY` value, and `setLogSink`. A body is *queued* when it carries `offline` or `writer`. The identity table, one case per cell, asserting status and whether `submitReport` ran:

  | Signed in as | Queued, no `writer` | `writer` matches | `writer` differs |
  |---|---|---|---|
  | Crew (picker resolved) | 401, not filed | filed | 401, not filed |
  | Admin (picker `no_selection`, valid session) | 401, not filed | 401, not filed | 401, not filed |
  | Nobody | 401, not filed | 401, not filed | 401, not filed |

  A queued report is only ever filed for the crew member who wrote it. The failure mode of each refusal is a report filed under a name that did not write it, by the next crew member or the next admin on the phone. Further cases:
  - a body with neither `offline` nor `writer`: every path exactly as today.
  - `offline` present but dropped by validation still counts as queued: a far-future `writtenAt` with no `writer` on a crew session is 401.
  - `writer` present, `viewerKey` returns null (signing key missing): 500 `REPORT_PIPELINE_FAILED`, not filed, so the record stays queued rather than failing for good.
  - `writer: 7` and a 200-character writer: 400.
  - a matching writer: `submitReport` gets `offline` normalized (`sentAt` set) and the body otherwise unchanged, with `writer` passed through untouched.
  - `offline` with a far-future `writtenAt` and a matching writer: filed with `offline` absent, one `log.warn` record. `offline` absent: no warn.
  - success with `offline`: one `log.info` record with `code: "REPORT_SUBMITTED_FROM_OFFLINE_QUEUE"`, `showId` and `status`, asserted through the log sink, after `submitReport` resolved. Success without `offline`, and a 502 with `offline`: no such record.
  - the record never carries `writer`, `message` or the idempotency key.
- [ ] **Step 2:** run; mismatch and emit cases fail.
- [ ] **Step 3:** `readRequestBody` rejects a non-null `writer` that is not a string of at most 128 characters. In `handleReport`, after `authenticateReportRequest`, a queued body goes through one function implementing the table, which is: crew auth and an equal key, or refuse. a refusal answers `errorJson(401, { ok: false })`, a null key `errorJson(500, { ok: false, code: "REPORT_PIPELINE_FAILED" })`. Then parse `offline` with `new Date()`, `log.warn` on `dropped`, and pass `{ ...body, offline: fields }` with the key omitted when null. Emit after `submitReport` returns (post-commit, invariant 10).
- [ ] **Step 4:** add the admin-log-only row, `pnpm gen:spec-codes`, the catalog row (`followUp: "Eric → read the report's Written with no signal section"`). Same command passes; `pnpm exec vitest run tests/messages/codes-coverage.test.ts tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts tests/reports/auth.test.ts tests/reports/nullShow.test.ts tests/cross-cutting/auth-chain-audit.test.ts` passes.
- [ ] **Step 5:** commit `feat(report): accept offline fields and refuse a mismatched writer`, the three lockstep files included.

### Task 4: The queue store

<!-- task: red=`pnpm exec vitest run tests/lib/reports/offlineQueue.test.ts tests/components/report/pageIdentity.test.tsx` red-state=authored red-target=`lib/reports/offlineQueue.ts` why=`every export is a stub that throws, so the storage, cap and body cases fail on the throw` ac=AC-2,AC-6 -->

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
export type RequeueResult = "held" | "stale" | "unavailable";
export function enqueueReport(report: QueuedReport): Promise<HoldResult>;
export function requeueReport(failedId: string, report: QueuedReport): Promise<RequeueResult>;
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
  - enqueueing an id already stored changes nothing and does not answer `held`: the `add` aborts, so the answer is `unavailable` and the stored record keeps its text (no attempt can hold a key twice, by the ownership rule in §1).
  - `failReport` sets status and code; on a missing id it writes nothing (a resurrect mutant fails here); on an already-failed record it leaves the earlier code.
  - `requeueReport` swaps a failed record for the new one in one transaction, at the cap too, leaving the count unchanged. A missing record, and a record no longer failed, answer `stale` and add nothing, so it can never pass the cap: planted as the full-queue race, a record discarded by another tab and its slot refilled, then a stale swap, still 10 stored. Two swaps of one record racing: one `held`, one `stale`, one record.
  - no `indexedDB` global, and an open that errors: enqueue `unavailable`, list `[]`, delete and fail resolve.
  - every mutation notifies subscribers; unsubscribing stops it; a no-op `failReport` does not need to notify but must not throw.
  - cross-document: a second copy of the module (`vi.resetModules` then a fresh import, over Node's real `BroadcastChannel`) gets its subscriber called when the first copy changes the queue, and a page does not hear its own post twice. No `BroadcastChannel` global: local subscribers still fire, nothing throws.
  - `queuedRequestBody`: deep equality against the whole expected object for a record whose context holds `fieldRef`, `viewerVisibleSection`, `rightNowState` and `userAgent` with distinguishable values, so dropping the context fails; `surface`, `show_id` and `offline` beat a same-named context key; `writer` is absent when null; `showSlug` is the slug.
  - `readPageIdentity` (in the jsdom file listed above): a template built from `markerAttributes` with a `save` marker whose assets hold a URL with `&` and `"` gives its viewer and render time, so entity decoding is proven on `outerHTML`; a `keep` marker gives its viewer and a null render time; `purge`, absent and malformed markers give both null.
  - `pageSlug`: `/show/a-b/tok` gives `a-b`; `/help/errors` gives null.
- [ ] **Step 2:** run; throws.
- [ ] **Step 3:** implement. Open per operation with `onversionchange` closing the connection. `enqueueReport`: one read-write transaction, `count()` then `add`. `failReport`: `get` then `put` in one transaction, only for a record whose status is `queued`. `readPageIdentity` reads `document.getElementById(MARKER_ID)?.outerHTML` through `readMarker`: `writer` from a `save` or `keep` marker, `pageRenderedAt` from a `save` marker. Subscribers live in a module `Set`. The receiving channel opens with the first subscriber and closes with the last; a change posts on it, or on a throwaway channel closed at once when this page has no subscriber.
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
export type SendOutcome =
  | { kind: "delivered" }
  | { kind: "failed"; code: string | null }
  | { kind: "pending" };
export type ReportSender = {
  send(): Promise<void>;
  /** Runs a pass and says what this sender saw happen to one record. */
  settle(id: string): Promise<SendOutcome>;
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
  - timeout: a fetch that never settles aborts at `SEND_TIMEOUT_MS` under fake timers and stops the pass. A response whose `json()` never settles aborts at the same bound, so the budget covers the body as well as the headers; a `json()` that rejects with a stream error stops the pass; a `json()` that rejects with a `SyntaxError` is "not our route's answer" and the pass goes on.
  - two concurrent `send` calls share one pass (each record posted once).
  - Web Locks: with a `navigator.locks` stub, the pass runs inside `request("fxav-report-sender", { ifAvailable: true })`; a null lock posts nothing; with no `navigator.locks`, it runs without one.
  - `settle`: `delivered` only after a 2xx with `ok: true` for that id in this sender; `failed` with the code after a final answer; `pending` after a 502, a network failure, a 429, a lock held elsewhere, a pass already running that did not list the record, and offline. Never inferred from the record being absent: with the queue unreadable after the POST, a 502 still reads `pending`.
  - `flush`: `noteQueued(0)` and no pass running answers `null` synchronously; with records it settles when the pass settles, or at `timeoutMs` if the pass hangs (fake timers); it never rejects.
- [ ] **Step 2:** run; throws.
- [ ] **Step 3:** implement as specified. `blockedUntil` and the per-record outcomes are maps inside the factory, bounded in practice by the cap; a retry continues to the next record; no answer, whether the fetch or the body read failed, ends the pass.
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
  - no writer on the page (no marker, a `purge` marker): nothing is held. Offline at the tap the POST is still tried, and the failure path runs with the draft kept. A `keep` marker holds with `pageRenderedAt` null.
  - after queued, `sessionStorage` has no row for the surface, and a remount is empty with a different key ("a new report gets a fresh record and key"), while the first record is untouched.
  - resume path: a persisted failed attempt resumed offline holds under the ORIGINAL key, with the same writer on the row and the page.
  - person switch: a row with key K and writer A on a page now rendered for B. The modal opens empty, with no resume banner and a key other than K; B writes, goes offline and submits: one record under B's key with B's writer and B's text, and K is never sent. Also online: the POST carries B's key. Also for a row written with no writer (an admin on the crew surface) and for a row from before this field: neither hydrates on a page with a writer.
  - admin and help surfaces hydrate exactly as today, whatever the marker says.
  - "storage unavailable": no `indexedDB`, rejected fetch: `failed-retryable`, the `NETWORK_UNREACHABLE` crew copy, draft and persisted row intact, no "Saved on your phone".
  - cap: 10 records stored, rejected fetch: same as above; the draft stays, Retry is offered, and still 10 records.
  - snapshot at the tap: the marker's viewer and render time and the URL's slug change between the tap and the failure. The held record carries the tap-time values, for a rejected fetch, for a body failure, and for a detached attempt.
  - "detached network failure": unmount mid-POST, reject: the record is stored and the persisted row is gone. With no `indexedDB`, the row survives, which keeps the existing detached contract (`tests/components/report/ReportModal.test.tsx:1079`).
  - "reopened before the failure": unmount mid-POST, remount (same key, resume state), edit the text, then reject the first POST: no record is stored and the row keeps the edited text. With no edit: no record, row intact.
  - reopened and resubmitted: as above, then submit the edited text under the same key, then reject the FIRST POST: no record, the row still belongs to the second attempt. Reject the second: one record, with the edited text.
  - reopened during the hold, one case per entry point (offline at the tap, rejected fetch, stream failure on the body) and for an attempt mounted or already detached when the write starts: `enqueueReport` is held open by a deferred stub, the modal unmounts and remounts. The remount shows the attempt's text read-only in `submitting`, with the same key. On `held` it shows the queued notice and no row remains. On `full` and on `unavailable` it shows the failure with the text, editable, and the row holds it. Either way there is exactly one draft and nothing is lost.
  - a refused hold with nobody watching: the next open shows the resume banner with the text.
  - body failures: headers arrive, then `json()` rejects with a stream error: held. `json()` never settles: at `submitTimeoutMs` the attempt aborts and is held, with the modal out of `submitting`. `json()` rejects with a `SyntaxError` on a 502: no record, the existing failure path. Unmount during the body read, then a stream error: held as "detached network failure". On admin and help the same stream failures end in `failed-retryable` with the network copy, never in `submitting` forever.
  - `queued` refuses every entry point: Ctrl+Enter and Cmd+Enter in the read-only textarea make no request, change no record and write no `sessionStorage` row.
  - a 502 and a 400 on the crew surface: no record, existing behavior.
  - a report from a card, with `fieldRef` and `viewerVisibleSection` in its autocapture, held and then sent by a real `createReportSender`: the POST body carries both values.
  - `surface` admin and help with a rejected fetch and with `onLine` false: `fetch` is called in both, no record, existing failure path.
- [ ] **Step 2:** run; queued cases fail.
- [ ] **Step 3:** implement. `submitOnce` reads `writtenAt` first. The attempt can be held when `surface === "crew"`, `showId` is non-null and the page has a `writer`. On offline: hold without a fetch. In the `catch`: hold before the `mountedRef` check, then a detached attempt compare-and-clears and returns. `persistedAtMount` reads the row through the writer check (§1). `submitOnce` builds the held record before its first `await` (§1) and writes the row with its `attemptId` synchronously. One `holdReport` serves all three entry points: check the `attemptId`, start `enqueueReport`, keep the promise in the module `Map`, and on completion remove it and clear the row if `held`. A mounted instance, the attempt's own or a remount (lazy `status` init plus a mount effect that finds the `Map` entry), then shows the result: `held` is `setStatus("queued")` and `setMountedFromResume(false)`; a refusal is `failed-retryable` with the network copy. The persist effect's early return gains `"queued"`. The timeout stays armed through `response.json()`; a body read that fails other than by `SyntaxError` takes the network-failure path, and for a crew attempt the first detached return moves after the body read. `handleTextareaKeyDown` refuses `queued` as it refuses `submitting`. The compose arm stays mounted for `queued`: textarea `readOnly`, notice block (`bg-info-bg`, check glyph, `text-text-strong`, role-free), action row is the Done button with `autoFocus`.
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

**Produces:** `ReportModalProps.failedReport?: QueuedReport`; `ModalStatus` gains `"stale"`.

**Consumes:** `requeueReport`, `deleteReport`, `readPageIdentity`, `reportSender.settle`.

- [ ] **Step 1: failing tests.** With a stored failed record, the real queue and the real sender over a stubbed `fetch`:
  - the textarea holds its text; `report-modal-failed-notice` has "This report couldn't be sent. Send it again or discard it." and, for `errorCode: "REPORT_HORIZON_EXPIRED"`, the catalog crew copy, and for null nothing more; no raw code appears anywhere (invariant 5).
  - a persisted row for the same `surfaceId` is neither read nor written nor cleared, through open, edit, send and close (a footer draft survives).
  - Send again, answered 201: one POST with a key different from the record's, the edited text, the record's `writtenAt` and `pageRenderedAt`, the CURRENT page's `writer` (the record's own when the page has none, and the server decides); the record is gone; the success arm shows.
  - durable key: the new key is in IndexedDB before `fetch` is called (asserted inside the fetch stub).
  - close while the POST is pending, then 201: the record is gone, and reopening finds nothing to resend. No second POST.
  - a 502: the record is queued under the new key and the queued notice shows. A later `reportSender.send()` POSTs that same key.
  - a rejected fetch, and offline: same, queued under the new key with the edited text.
  - a 401: the record is failed again under the new key with its notice, the text kept, and Send again swaps it for another fresh key.
  - two modals on one record, Send again in both: one POST, and the second lands on `stale` with its text still on screen, read-only, with Close only.
  - stale at a full queue: the queue stays at 10.
  - `requeueReport` answering `unavailable`: no POST, the record stays failed under its old key, the text stays, `failed-retryable` with the network copy, and a retry mints another key.
  - a successful swap, a 502, then an unreadable queue: the queued notice shows, never "Report submitted."
  - Ctrl+Enter and Cmd+Enter on an open failed record take the same path as the button: durable key before the POST, the old record gone, a 502 retried under the same key, and no direct POST from the modal. Asserted by counting POSTs and reading the store, for both shortcuts.
  - Discard removes the record and closes, with no fetch.
  - `queued` and `stale` refuse Ctrl+Enter.
- [ ] **Step 2:** run; fails.
- [ ] **Step 3:** implement. `persistedAtMount` is null and the persist effect returns early when `failedReport` is set; `clearPersisted` calls go through a local guard. The record in hand is state, because a refusal replaces it. Every submission entry point reaches `submitOnce`, whose first branch for `failedReport` is the resend: `submitting`, `requeueReport` with a fresh key, then `await reportSender.settle(key)`: `delivered` is `succeeded`, `failed` is the notice with the new record and code, `pending` is the queued notice. `stale` is the stale arm; `unavailable` is `failed-retryable`. Discard is a secondary button left of Send again. `stale` copy: "This report was already sent or discarded in another tab."
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
  - the `report-queue-region` `role="status"` element is in the first render and stays through 0 to 1 to 0, its text changing; the failed button is outside it. It gains `data-queue-ready="true"` only once the first read has settled and the listeners are attached: absent before, present after, the e2e readiness signal.
  - an `enqueueReport` after mount updates the count with no remount; a stale list landing after a newer one does not win (ordinal guard).
  - an initially empty status, told by the queue subscription that another document queued a report, shows the count, starts the 60 s timer and calls `noteQueued(1)`, with no remount.
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
  - a real sender, a fresh `IDBFactory` with one seeded queued record, `noteQueued(1)`, and a never-settling fetch: a premise that the fetch was called, then the clear starts at 3000 ms, not 2999 (fake timers). 3000 is under `PENDING_TIMEOUT_MS` (8000), asserted as a premise so the watchdog cannot fire mid-wait.
- [ ] **Step 2:** run; fails.
- [ ] **Step 3:** first lines of the `startSwitch` callback: `const flush = reportSender.flush(REPORT_FLUSH_WAIT_MS); if (flush !== null) await flush;`.
- [ ] **Step 4:** command plus `pnpm exec vitest run tests/components/auth tests/docs/_metaInteractionTimingInventory.test.ts` pass.
- [ ] **Step 5:** commit `feat(auth): wait for queued reports before a name switch`.

### Task 10: Real-browser cases

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/crewOfflineProxy.unit.test.ts` red-state=authored red-target=`tests/e2e/helpers/crewOfflineProxy.ts:221` why=`the proxy answers only GET stubs, so the planned POST answer queue has no method and the new unit case fails` ac=AC-11 -->

**Files**

```text
modify  tests/e2e/helpers/crewOfflineProxy.ts and its unit test   (answerNext, upstreamStatus on ReceivedRequest)
modify  playwright.config.ts                                      (both offline testMatch regexes; the baseline server env at line 301)
modify  .github/workflows/crew-e2e.yml                            (file list at line 219, the measured-count comment, the timeout if the measured run needs it)
modify  tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts     (ENROLLED row beside line 312, EXPECTED_SKIPS row beside line 204)
modify  scripts/check-crew-e2e-executed.mjs                       (REQUIRED row with the measured two-engine count)
modify  tests/ci/_metaE2eWorkflowCoverage.test.ts                 (PATH_GATED_BY_EXCLUSION row beside line 172)
modify  tests/ci/modalWaitHelper/disposition.ts                   (the e/crew-offline-saved-copy-reload row, if the new spec's reloads join its population)
create  tests/e2e/crew-offline-reports.spec.ts
```

**Harness readiness (`docs/agents/writing-plans.md`).** (a) Production build: `CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test --project=crew-offline-chromium --project=crew-offline-webkit tests/e2e/crew-offline-reports.spec.ts`, through the fixture's proxy, `assertServerUnderTest` in `beforeAll`. (b) Readiness: `pickAndSave` (crew shell, bar hydration signal, worker control, saved copy), then `[data-testid="report-queue-region"][data-queue-ready="true"]`, which Task 8 sets only after the first queue read and the listeners. (c) Detach safety: no sampler outlives an element; counts are read with `toHaveText` and `expect.poll` over `page.evaluate`.

**No real issue can be filed, whatever the route does.** The baseline server's env (`playwright.config.ts:301`) gains `GITHUB_REPO: ""` and `GITHUB_API_TOKEN: ""`. `next start` loads `.env.local` without replacing a variable already set, and `parseRepo` (`lib/github/issues.ts:101`) then throws before any network call, so a request that reaches `createIssue` answers 502. That holds if the writer check regresses and if scripted answers run out, so it does not rest on the code under test. `assertServerUnderTest` already requires `CI=1`, so the server is the one Playwright booted with this env, never a reused one. The cases assert the upstream answer through `ReceivedRequest.upstreamStatus`, set when the proxy forwards and undefined for a stubbed or refused request, so a stub can never pass for the real refusal.

- [ ] **Step 1:** failing proxy unit cases: `answerNext(pathPrefix, answers)` answers successive POSTs from a list with status, JSON body and headers, then passes through; `reset()` clears it; a forwarded request's log row gains `upstreamStatus`, a stubbed one has none.
- [ ] **Step 2:** run; fails. Implement; passes.
- [ ] **Step 3:** the spec, both engines, one `seedShowWithCrew` per case:
  1. **Queue, tab close, send.** From a card trigger, so the body has a `fieldRef`. `refuse`; open the modal, write, Submit; the copy shows; Done; "1 report waiting for signal". Close the tab, open a new one on the saved copy; the count is still there. Proxy answers 201, dispatch `online`: count clears. The POST's key equals the stored key; `offline.writtenAt` is the stored one; `offline.pageRenderedAt` equals the marker's `data-rendered-at`; `writer` equals its `data-viewer`; `fieldRef` is the card's.
  2. **Two tabs.** Two pages submit under `refuse` at once; each page, with no reload, reaches "2 reports waiting for signal". A third page opened first with nothing queued also reaches it with no reload.
  3. **Answers that keep it queued.** Answers 503, 409 `IDEMPOTENCY_IN_FLIGHT`, 429: after each `online` dispatch the count stays; a fourth `online` posts nothing (the wait is live); a reload sends, 201, count clears. All four POSTs carry one key.
  4. **Writer check, real server.** With the record as written, `online`: `upstreamStatus` 502 and the record still queued, which proves the marker's key equals the server's. That POST reserves a `reports` row, and `reports.show_id` has no delete cascade (`supabase/migrations/20260501001000_internal_and_admin.sql:311`), so the case deletes the show's `reports` rows before the show. Then its `writer` rewritten in IndexedDB; `online`; the POST's log row has `upstreamStatus` 401; "1 report couldn't be sent"; tap opens with the text; proxy answers 201; Send again; count clears.
  5. **Discard.** Failed record; tap; Discard; count clears; a reload keeps it gone.
  6. **Cap.** Ten seeded records; `refuse`; Submit: the failure copy shows, the draft stays, an eleventh is not stored.
  7. **Sent elsewhere.** Two pages with one queued record; the first sends it; the second's count clears with no reload.
  8. **Band geometry at 390px.** One queued and one failed: the footer has no horizontal overflow (`scrollWidth <= clientWidth`), the failed button is at least 44px tall, and the report trigger keeps 44x44.
- [ ] **Step 4:** run in both engines, record the executed count (8 cases by 2 engines, 16, unless a case is engine-gated), put it in `REQUIRED`, wire CI; `pnpm exec vitest run tests/ci tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` passes.
- [ ] **Step 5:** commit `test(e2e): offline reports in Chromium and WebKit`.

<!-- /tasks -->

---

## 8. After the tasks

1. Spec §9 gains the limits this piece leaves, in one docs commit: a report written on a page that names no author is not held: that is an admin viewing the crew page, or a crew member on a page rendered with the viewer key unavailable, and both keep today's failure copy with the draft in the tab; a record whose first POST was filed but whose answer was lost, followed by a name switch, is refused and can be resent as a duplicate issue, which is conservative and visible; the rate-limit wait is per page, and a reload costs one uncounted 429; iPhone storage eviction also evicts held reports.
2. The full gate list: `pnpm heavy pnpm test`, typecheck, `pnpm exec eslint .`, `pnpm format:check`, `pnpm spec:lint`.
3. The invariant-8 UI gate on the diff, findings and dispositions in a sibling closeout file with its marker line, P0 and P1 fixed or deferred.
4. Whole-diff Codex review, split by surface if the diff is large, to APPROVE.
5. Push, real CI green, `gh pr merge --merge`, fast-forward local `main` to `0  0`.
