<!-- spec-lint: not-ui — no UI surface: changes land in tests/e2e/helpers/openShowReviewModal.ts, two e2e specs' wait/assertion lines, tests/ci/modalWaitHelper/**, tests/ci/_metaModalWaitHelper.test.ts, tests/mutation/source/registry.ts, and docs; app/ and components/ files are cited as evidence, not modified surfaces -->

# Modal-wait skeleton-tolerant sites — frame-reporting wait for the two excluded members

**Date:** 2026-08-17 · **Ledger:** `BL-MODAL-WAIT-SKELETON-TOLERANT-SITES` · **Branch:** `fix/modal-wait-skeleton-tolerant`
**Status:** DRAFT (spec/plan-only arc; implementation is a separate session)
**Parents:** `docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md` (PR #830 — the helper, the guard, limit 3b) and `docs/superpowers/specs/ci/2026-08-17-modal-wait-candidate-contract-design.md` (PR #840 — candidate contract v2, the N-wait registry, and §4.6's extension seam, which this arc lands through).

The adoption arc hardened every open-site wait it could reach and excluded exactly two members (parent-#830 §2.5, limit 3b): `published-review-modal.deeplink.spec.ts:354` and `published-review-modal.realtime.spec.ts:917` wait on `MODAL_ANY` — the modal-shell testid without the loaded-title qualifier — because each tests a state where the Suspense skeleton is a legitimate frame. The skeleton renders through the same shell with the same `testIdBase` (`components/admin/showpage/ShowReviewModalSkeleton.tsx:32` → `components/admin/review/ReviewModalShell.tsx:584` stamps `data-testid="published-show-review-modal"`), so a modal-or-boundary race on that selector is won by the skeleton, and the shipped helper would return on it, emit no `infra-recovery` annotation, and hide the fault (`tests/e2e/helpers/openShowReviewModal.ts:23-27`). The cost of leaving them, per the ledger row: a transient boundary at either site still fails the test, but as a bare downstream timeout — no annotation, no `show_review_snapshot_failed` hint.

This arc closes that gap with three moves, each probe-backed (§2):

1. A **frame-reporting entry** on the helper module — race skeleton | loaded | boundary, recover once on boundary, RETURN the frame it found — for the one site whose subject genuinely is "whichever frame is up" (the deeplink Esc test), plus a **boundary watchdog** that annotates a boundary arriving AFTER a skeleton return, which is the window where the measured 502 class actually lands.
2. **Plain adoption of the existing loaded-only helper** at the realtime site: the probe (§2.3) shows its discriminating path satisfies `LOADED_REVIEW_MODAL` in the same paint as `MODAL_ANY` (4/4 observations, `loadedAt == anyAt`), so the either-frame wait there was tolerance the case never used.
3. The **census duties** parent-#840 §4.6 pre-enumerated: two disposition rows move, one exemption unpins, `HELPER_CALL` gains the new names, and both enrolled mutation surfaces are re-scored in the same commits that edit them.

## 1. Scope

In scope:

- **Helper module** (`tests/e2e/helpers/openShowReviewModal.ts`): new exported selector `SKELETON_REVIEW_MODAL`, new core `awaitReviewFrameOrRecover`, new URL entry `openShowReviewFrameAt`, and the boundary watchdog (§4.1-§4.2). The existing loaded-only core keeps its selectors, its recovery bound, and all three entry points with their CONTRACTS unchanged. Two edits touch it: the module header comment (§4.1), and the timeout normalization both cores now share — extracted verbatim into `normalizeTimeoutMs` and called from the loaded core, behaviour-identical and pinned by that suite's existing 1_234/NaN case.
- **Two e2e wait/assertion rewrites**: `published-review-modal.deeplink.spec.ts:349-354` (the Esc-during-load test adopts `openShowReviewFrameAt`; its `modal-wait-exempt` marker at `published-review-modal.deeplink.spec.ts:351` is deleted) and `published-review-modal.realtime.spec.ts:916-917` (the aborted-close reopen wait adopts `awaitReviewModalOrRecover`; the stale `MODAL_ANY` rationale comment at `published-review-modal.realtime.spec.ts:54-58` is rewritten to cite the probe). Downstream assertions at both sites are unchanged except where §4.3/§4.4 says otherwise.
- **Census extension per the #840 §4.6 seam**: one `HELPER_CALL` alternation set (`tests/ci/modalWaitHelper/scan.ts:135`), one new origin-(f) member rule for the frame entry, `d/skeleton-tolerant-click` retired (`tests/ci/modalWaitHelper/disposition.ts:598`), the realtime click re-claimed by `d/member-row-activation` (`tests/ci/modalWaitHelper/disposition.ts:543`), one `N_WAIT_SITES` row added (`tests/ci/modalWaitHelper/disposition.ts:110`), and the `PINNED_EXEMPTIONS` inventory dropped from two entries to one (`tests/ci/_metaModalWaitHelper.test.ts:55`).
- **New sibling unit suite** (`tests/e2e/helpers/openShowReviewFrame.unit.test.ts`): frame-race cases on a copy of the existing FakePage harness, so the shipped loaded-only suite stays loadable and green through the red span (§4.5).
- **Mutation-registry duties** (§4.6): `modal-wait-helper-scan` and `modal-wait-disposition` re-scored in the same commit as their source edits (accepted `siteId`s relocate on ANY edit — `tests/mutation/source/registry.ts:361`, `tests/mutation/source/registry.ts:440`); enrolment posture for the helper module itself resolved with a probe run at implementation.
- Ledger graduation for the one row + README index row (§4.7).

Out of scope:

- **`scanForViolations` (`tests/ci/modalWaitHelper/scan.ts:280`) is untouched in mechanism.** Its single-line recognizer and exemption grammar are ratified (parent-#830 §4.4, parent limit 5; re-ratified #840 §1.1). This arc changes only the pinned INVENTORY the meta-test asserts (§4.4) — the deeplink goto disappears into the helper, so no new exemption and no guard-shape change.
- **The candidate contract, the statement unit, and the registry ASSERTIONS** (#840 §4.1-§4.2). Per that spec's §4.6: "new member sites are new rows in existing vocabularies." This arc adds rows and rules; it does not touch `enumerateCandidates`, the registry reconciliation, or either archived row's mechanism (`BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS`, `BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION` — both stay archived).
- **The loaded-only core's contract**: recovery bound stays 1; `--retries=0` posture untouched; no timeout change; `openShowReviewModal` / `openShowReviewModalAt` / `awaitReviewModalOrRecover` signatures unchanged.
- **The realtime case's discrimination mechanism** (arm stamps, freshness observer, throttle values, `SECTION_FRESHNESS_FLASH_MS_E2E`). This arc changes what the reopen WAIT accepts, nothing about how the case measures.
- **Product code.** No `app/` or `components/` file changes; the skeleton's `published-show-review-loading` testid and the boundary's testids are consumed as they ship today.

### 1.1 Resolved scope — do not relitigate

- **`readySelector` stays removed.** Parent-#830 spec-review R3 finding 1 removed a caller-supplied ready-selector option because a frame-only selector silently wins the race (`tests/e2e/helpers/openShowReviewModal.ts:23-27`). The frame entry here is NOT that option returning: it is a fixed three-way race over module-owned selectors that REPORTS which frame it found and never lets a caller substitute a selector. Findings proposing a configurable selector, or proposing to fold the frame entry into the loaded core behind an option flag, relitigate the R3 ratification.
- **The deeplink test's subject is "whichever frame is up," ratified twice.** The test's own header (`published-review-modal.deeplink.spec.ts:349`, MODAL-SKELETON-CLOSE-1) and the exclusion record (parent-#830 §2.5) both state it. A finding proposing the deeplink site wait for the LOADED frame changes what the test proves and is the exact assertion change parent-#830 §2.5 declined; the jsdom suite owns the deterministic red/green proof (docs/superpowers/specs/2026-07-19-modal-skeleton-close.md), and this e2e keeps the opportunistic real-browser path.
- **The realtime adoption is probe-ratified, not analogized.** The committed comment at `published-review-modal.realtime.spec.ts:54-58` says waiting for `MODAL` "means waiting out a deliberately throttled RSC fetch (measured 3.9s of a 1600ms budget)." §2.3's probe refutes that for the current drive: the 3.9s figure was measured at the REOPEN spec's 2500ms throttle (the test's own comment at `published-review-modal.realtime.spec.ts:884-887` attributes it), while this case's throttle is 200ms, and 4/4 probe reps show the loaded selector satisfied in the same observation as the shell selector. Findings re-asserting the 3.9s cost against this adoption must carry a probe under the CURRENT 200ms drive.
- **The watchdog annotates; it never recovers and never fails a test.** After a skeleton return the calling test is mid-action; clicking Retry underneath it would race the test's own gestures. One recovery before return, zero after — the recovery bound stays 1 by construction. Findings proposing post-return recovery or a hard failure on watchdog fire propose a second recovery, which parent-#830 §1.1 fences ("The recovery bound is ONE by design").
- **The watchdog reuses the `infra-recovery` annotation type.** The single collector filters on exactly that type (`scripts/lib/infraRecoveryAnnotations.mjs:30`) and every member workflow already prints it. A new annotation type means a collector extension, new print plumbing, and a new workflow contract for a rare-path diagnostic; the description text carries the distinction (§4.2). Deliberate reuse, not an oversight.
- **Counts are as-of-authoring and non-normative** (#840 §1.1 precedent). Every disposition count, the registry row set, and the exemption inventory are re-derived at implementation; the meta-suite's drift assertions are the normative comparison. Findings that a count here is stale against the live tree are not admissible.
- **Line numbers are drafting-time locators** (docs/agents/spec-self-review.md citation rule). Anchors are file + symbol/testid; a drifted line number on an otherwise-correct claim is not a finding.

## 2. Current mechanism and probes (run 2026-08-17 against the branch head at `b24e3ac5f` + #840's merge; re-derive at implementation)

### 2.1 The two sites and their selectors

Both specs build `MODAL_ANY = '[data-testid="published-show-review-modal"]'` and `MODAL = MODAL_ANY + ':has([data-testid="published-show-review-title"])'` (`published-review-modal.deeplink.spec.ts:52-56`, `published-review-modal.realtime.spec.ts:59-60`). The title node exists only in the loaded frame (`components/admin/showpage/PublishedReviewModal.tsx:912`); the skeleton body carries `data-testid="published-show-review-loading"` (`components/admin/showpage/ShowReviewModalSkeleton.tsx:171`), a testid no other `app/` or `components/` file emits (rg over both trees: the only hits are the skeleton component itself; the realtime spec already consumes it as `SKELETON_TESTID`, `published-review-modal.realtime.spec.ts:63`). Attribute selectors match exactly, so `-loading-title-row` (the skeleton's header band, `ShowReviewModalSkeleton.tsx:78`) can never satisfy the loaded qualifier. The admin boundary renders `data-testid="admin-route-error-boundary"` with a retry button `admin-route-error-retry` (`app/admin/error.tsx:35`, `app/admin/error.tsx:46`) — the selectors the helper already owns (`tests/e2e/helpers/openShowReviewModal.ts:46-47`).

Consequence: three mutually-exclusive-by-construction frame states are each independently selectable — skeleton (`MODAL_ANY:has(-loading)`), loaded (`MODAL_ANY:has(-title)`), boundary — and the shipped helper races only the last two.

### 2.2 Probe: deeplink Esc-during-load frame timing

Temporary instrumentation in the worktree (frame classification at wait-satisfaction; patch reverted after the run), 5 reps against a prod-build server on :3000 (`pnpm build` + `pnpm start`, the flags from `playwright.config.ts`'s CI webServer command), `BASELINE_SERVER_ONLY=1`, loopback `TEST_DATABASE_URL`:

```
PROBE-A2 deeplink frame: first=loaded anyAt=+393ms
PROBE-A2 deeplink frame: first=loaded anyAt=+384ms
PROBE-A2 deeplink frame: first=loaded anyAt=+47ms
PROBE-A2 deeplink frame: first=loaded anyAt=+385ms
PROBE-A2 deeplink frame: first=loaded anyAt=+377ms
5 passed (8.0s)
```

The first visible frame on a cold `/admin?show=` deep link was the LOADED frame in 5/5 local reps — the RSC stream resolves before the wait's first poll observes the shell. Two readings, both load-bearing:

- The skeleton window is real but narrow, and timing-dependent (CI is slower; the test's own design says "whichever the stream timing yields"). A frame-reporting wait preserves the opportunistic skeleton-Esc path exactly as the current `MODAL_ANY` wait does — and in the common case reports `loaded`, identical behavior to today.
- The 502-class failure this arc exists to name (two CI occurrences with server-log correlation, `docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md` §2.1) manifests as the boundary REPLACING the skeleton when the loader's rejection streams — i.e., typically AFTER a first-match race has already returned. That is why the design pairs the race with a watchdog (§4.2) instead of pretending the race alone reaches the fault.

### 2.3 Probe: realtime aborted-close reopen frame timing

Same harness, `MODAL_REALTIME_E2E=1` (the case's prod-server gate, `published-review-modal.realtime.spec.ts:76-79`), 5 reps:

```
PROBE-A2 reopen frame: first=loaded anyAt=+864ms loadedAt=+864ms
PROBE-A2 reopen frame: first=loaded anyAt=+363ms loadedAt=+363ms
PROBE-A2 reopen frame: first=loaded anyAt=+359ms loadedAt=+359ms
PROBE-A2 reopen frame: first=loaded anyAt=+864ms loadedAt=+864ms
2 failed / 3 passed
```

In every observation the reopen after an aborted close satisfied `MODAL` in the same instant as `MODAL_ANY` (`loadedAt == anyAt`; the probe checked the loaded selector's visibility synchronously at shell-visibility time and never had to wait further). That is the retained-tree mechanism the case itself documents: the abort's self-heal is a client-side un-hide (`published-review-modal.realtime.spec.ts:54-58`), and an un-hidden modal carries its title. The two failures were environmental and pre-probe or timing-only: one cold-start rep red on the case's own `sinceArm < 1600` premise at 5492ms (the premise message names the drive, not the modal), one on the phase-i invalidation frame (`published-review-modal.realtime.spec.ts:857`) — the realtime-broadcast flake class, upstream of the reopen under study.

Consequence: adopting the LOADED-only helper at `published-review-modal.realtime.spec.ts:917` costs zero observed milliseconds on the discriminating path. On the non-discriminating path (a fresh mount — close nav committed before the re-click), the skeleton appears, the loaded wait outlasts the flash window, and the case's own premise reds LOUDLY ("abort drive outran the …ms flash window", `published-review-modal.realtime.spec.ts:934-940`) — which is strictly better than today's behavior, where the `MODAL_ANY` wait returns on that skeleton and the page-wide `flashing === 0` read passes vacuously against an empty frame. The adoption converts a silent-pass path into a premise failure without any new machinery.

### 2.4 What the census sees today

- The deeplink goto at `published-review-modal.deeplink.spec.ts:352` is the guard's second pinned exemption (`tests/ci/_metaModalWaitHelper.test.ts:55`, the `/skeleton-tolerant/` row; inventory asserted two-deep at `tests/ci/_metaModalWaitHelper.test.ts:252`).
- The realtime re-click at `published-review-modal.realtime.spec.ts:916` is the sole match of `d/skeleton-tolerant-click` (`tests/ci/modalWaitHelper/disposition.ts:598`, `expectedCount: 1`, matched by `/noWaitAfter/` on the match line); `d/member-row-activation` (`tests/ci/modalWaitHelper/disposition.ts:543`, count 8) excludes `noWaitAfter` lines precisely to route this one site to the exclusion rule.
- `N_WAIT_SITES` holds 12 rows (`tests/ci/modalWaitHelper/disposition.ts:110`); `f/member-shape-N`'s count derives from it (`tests/ci/modalWaitHelper/disposition.ts:409`). `HELPER_CALL` recognizes the three shipped entry points (`tests/ci/modalWaitHelper/scan.ts:135-136`).
- Both census halves are enrolled mutation surfaces with same-commit re-score duties (`tests/mutation/source/registry.ts:361` `modal-wait-helper-scan`, two accepted equivalents; `tests/mutation/source/registry.ts:440` `modal-wait-disposition`, `accepted: []`).

## 3. Approaches considered

1. **Frame-reporting race + boundary watchdog at deeplink; plain loaded-only adoption at realtime (CHOSEN, §4).** Matches each test's actual subject: deeplink keeps its either-frame semantics with the fault made loud (recovery before return, annotation after), realtime gets the stronger wait its discriminating path already satisfies for free (§2.3). Cons: the watchdog is a fire-and-forget promise with no deterministic unit test for its fire path (documented limit 2) — accepted, it is diagnostic-only.
2. **The ledger sketch verbatim: after skeleton is observed, keep racing loaded-vs-boundary for the remainder of the timeout at BOTH sites.** Rejected for deeplink: the test would then only ever act on the loaded frame, deleting the opportunistic skeleton-Esc path that is the test's stated subject (§1.1). For realtime it is equivalent to the chosen loaded-only adoption but through new machinery the shipped helper already has.
3. **Loaded-only adoption at both sites.** Rejected for deeplink alone, same reason as 2; §1.1 fences it.
4. **`readySelector` / configurable frame option on the existing core.** Rejected: re-ratifies away parent-#830 R3 finding 1 (§1.1).
5. **Watchdog that clicks Retry or fails the test on boundary-after-skeleton.** Rejected: a second recovery (bound is 1, fenced), and a hard fail turns a diagnostic into a new flake source while the test's own downstream assertion is already the loud failure.
6. **Doing nothing beyond annotating the two sites' timeouts in prose.** Rejected: the ledger row's re-open trigger is CI flake on this signature; the repair direction it prescribes is the wait contract, and the census seam (#840 §4.6) was built for exactly this landing.

## 4. Design

### 4.1 Helper surface — one new selector, one new core, one new URL entry

`tests/e2e/helpers/openShowReviewModal.ts` gains:

```ts
export const SKELETON_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-loading"])';

export type ReviewFrame = "skeleton" | "loaded";
export type AwaitFrameResult = { frame: ReviewFrame; locator: Locator };
```

`awaitReviewFrameOrRecover(page, opts?: AwaitModalOptions): Promise<AwaitFrameResult>`:

1. Race `LOADED_REVIEW_MODAL.first()` | `SKELETON_REVIEW_MODAL.first()` | boundary, via the same `.or(…).first().waitFor({state:"visible"})` composition the loaded core uses (`tests/e2e/helpers/openShowReviewModal.ts:94`), with the same timeout normalization (`tests/e2e/helpers/openShowReviewModal.ts:84-87`).
2. Classify by SAMPLING, and the classification is TOTAL — every branch below is entered because something was OBSERVED, never because something else was absent (diff review R1 finding 1; the repair is `classify` in the shipped helper). Sample the SKELETON first and LOADED second, so the later sample decides: any overlap in which the loaded frame is up at its own sample point resolves `loaded`, which is this contract's tie-break. Each `isVisible()` is a live DOM query and the streaming swap is milliseconds wide, so sample ORDER is the only part of the race the helper owns.
3. Loaded observed → return `{ frame: "loaded", locator: page.locator(LOADED_REVIEW_MODAL) }` (unscoped, the §4.1 parent contract). Skeleton observed and loaded not → arm the watchdog (§4.2), then return `{ frame: "skeleton", locator: page.locator(SKELETON_REVIEW_MODAL) }`.
4. Boundary OBSERVED → push the `infra-recovery` annotation and click retry exactly as the loaded core does (`tests/e2e/helpers/openShowReviewModal.ts:101-106`), then re-race loaded|skeleton once with the same timeout. The post-recovery classification is total for the same reason: a second boundary throws the persisted-boundary error rather than being reported as a stale skeleton, and "neither frame" throws the named starve rather than assuming one.
5. NOTHING observed after a race that resolved — the frame moved between the race and the samples — → ONE bounded re-race, then classify again; still nothing → the starve error naming all THREE selectors and `show_review_snapshot_failed`, same shape as `starveError` (`tests/e2e/helpers/openShowReviewModal.ts:60-67`). What this forbids is the inference "not loaded, not skeleton, therefore boundary", which clicks a Retry no page is showing and dies on a generic Playwright error naming neither selector nor the signature.

`openShowReviewFrameAt(page, url, opts?: OpenAtOptions): Promise<AwaitFrameResult>` = `page.goto(url, opts?.gotoOptions)` + the frame core, label defaulting to `url=${url}` — the exact `openShowReviewModalAt` composition (`tests/e2e/helpers/openShowReviewModal.ts:127-137`) over the new core.

Shared mechanics, stated so the plan pins them: no top-level `@playwright/test` value import (the annotation path keeps the lazy dynamic import — parent-#830 §1.1 pin); internal waits `.first()`-narrowed, returned locators unscoped; `label ?? "label=unspecified"`. The module header's "There is deliberately NO readySelector" paragraph (`tests/e2e/helpers/openShowReviewModal.ts:23-27`) is extended, not weakened: it now also names the frame entry as the sanctioned path for the two either-frame callers and says why a caller-supplied selector still does not exist.

### 4.2 The boundary watchdog

Armed only on a skeleton return (the one state where the measured fault class can still arrive, §2.2):

```ts
void page
  .locator(BOUNDARY_SELECTOR)
  .waitFor({ state: "visible", timeout: timeoutMs })
  .then(async () => {
    const { test } = await import("@playwright/test");
    test.info().annotations.push({
      type: "infra-recovery",
      description:
        `${label}: admin error boundary replaced the skeleton AFTER the frame wait returned; ` +
        `no recovery attempted (test already in flight). Downstream failures in this test are ` +
        `the boundary fault; grep the server log for ${SERVER_SIGNATURE}.`,
    });
  })
  .catch(() => {});
```

Contract points, each deliberate: it never throws (both arms swallowed — a watchdog rejection after page close must not surface as an unhandled rejection); it never recovers (§1.1); it fires at most once per arm; it reuses the `infra-recovery` type so the existing collector (`scripts/lib/infraRecoveryAnnotations.mjs:30`, printed per `scripts/lib/infraRecoveryAnnotations.mjs:50`) and every member workflow's print step carry it with zero plumbing changes. If the boundary never appears, the promise times out into the swallowed catch and nothing is emitted.

### 4.3 Deeplink adoption (`published-review-modal.deeplink.spec.ts:349-354`)

- Delete the `modal-wait-exempt` marker (`published-review-modal.deeplink.spec.ts:351`) and the raw `page.goto` + `MODAL_ANY` visibility wait (`published-review-modal.deeplink.spec.ts:352-354`).
- Replace with `await openShowReviewFrameAt(page, \`/admin?show=${show.slug}\`, { label: "deeplink-esc:any-frame" })` — the helper owns navigation, race, single recovery, and watchdog.
- Downstream is UNCHANGED: the focus poll, the two-frame Esc handling, the `MODAL_ANY` count-0 assertions and the URL-strip wait all already handle both frames (`published-review-modal.deeplink.spec.ts:355-394`). The return value's `frame` is deliberately unused here — the test's subject is whichever frame is up.
- The spec file already imports from the helper module (`published-review-modal.deeplink.spec.ts:44`); the import list gains the new entry.

### 4.4 Realtime adoption (`published-review-modal.realtime.spec.ts:916-917`)

- Replace the `MODAL_ANY` visibility wait (`published-review-modal.realtime.spec.ts:917`) with `await awaitReviewModalOrRecover(page, { timeoutMs: MODAL_OPEN_TIMEOUT_MS, label: "reopen:aborted-close" })` after the unchanged `noWaitAfter` re-click (`published-review-modal.realtime.spec.ts:916`). (`MODAL_OPEN_TIMEOUT_MS = 15_000`, `tests/e2e/helpers/realtimeOracle.ts:38`; the helper accepts it via `timeoutMs`, `tests/e2e/helpers/openShowReviewModal.ts:57`.)
- Rewrite the stale `MODAL_ANY` rationale comment (`published-review-modal.realtime.spec.ts:54-58`): the "3.9s of a 1600ms budget" figure belongs to the reopen spec's 2500ms-throttle measurement (as `published-review-modal.realtime.spec.ts:884-887` itself records); under this case's 200ms throttle the retained frame satisfies the loaded selector in the same paint (§2.3 probe). The comment now says the aborted-close reopen waits for the LOADED frame because the retained tree carries its title, and that a skeleton here means the non-discriminating fresh-mount path, which the `sinceArm` premise reds by design.
- Downstream is unchanged: the ONE-evaluate read, both `sinceArm` premises, and the `flashing === 0` assertion (`published-review-modal.realtime.spec.ts:919-946`) stand as shipped. The wait change alone upgrades the fresh-mount path from a vacuous pass to a loud premise failure (§2.3) and gives boundary/starve the annotation + named error at last.
- The spec file already imports `awaitReviewModalOrRecover` (`published-review-modal.realtime.spec.ts:39`) for its `published-review-modal.realtime.spec.ts:790` site; no import change.

### 4.5 New sibling unit suite (`tests/e2e/helpers/openShowReviewFrame.unit.test.ts`)

New cases in a SIBLING file rather than appended to the shipped suite, so the loaded-only suite stays loadable and green through this arc's red span. They run on a copy of the existing FakePage harness (`tests/e2e/helpers/openShowReviewModal.unit.test.ts:40-104`; the harness is module-local, so it is copied — the `waitForRowHydration` suite sets that precedent), red-first per invariant 1:

- **Frame race composition**: `awaitReviewFrameOrRecover` waits on an `.or` chain containing all three selectors, `.first()`-scoped, honoring `timeoutMs` normalization (the loaded core's existing case shapes).
- **Loaded return**: loaded visible → `{ frame: "loaded" }` with an UNSCOPED `LOADED_REVIEW_MODAL` locator.
- **Skeleton return**: skeleton visible, loaded not → `{ frame: "skeleton" }` with an unscoped `SKELETON_REVIEW_MODAL` locator, and a boundary `waitFor` armed on the fake page (the watchdog's ARM is unit-observable as a recorded `waitFor` on the boundary selector; its FIRE path is not — limit 2).
- **Twin-frame cardinality** (parent-#830 AC-1 pattern): with BOTH a bare skeleton `…-modal` and a loaded `…-modal:has(…-title)` shape present, `SKELETON_REVIEW_MODAL` and `LOADED_REVIEW_MODAL` each resolve one distinct node — selector disjointness is the property that makes `frame` truthful.
- **Starve**: nothing visible → the error names all three selectors and `show_review_snapshot_failed`.
- **`openShowReviewFrameAt` delegation**: goto called with the exact url + `gotoOptions` pass-through + label fallback `url=…` (mirrors the shipped `openShowReviewModalAt` cases at `tests/e2e/helpers/openShowReviewModal.unit.test.ts:123-137`).

The recovery/watchdog-fire branches stay outside unit reach (dynamic `@playwright/test` import — parent-#830 limit 2, inherited as limit 2 here).

### 4.6 Census + mutation duties (the #840 §4.6 seam, item by item)

1. **`HELPER_CALL`** (`tests/ci/modalWaitHelper/scan.ts:135-136`) gains BOTH new names — `openShowReviewFrameAt` and `awaitReviewFrameOrRecover` — so a future spec-file caller of the bare frame core cannot be an origin-(f) blind spot. `callsHelper` in `disposition.ts` (`tests/ci/modalWaitHelper/disposition.ts:254`; sole use `a/member-helper-call`) gains `openShowReviewFrameAt` for the same reason on the origin-(a) side: the adopted deeplink URL literal remains an origin-(a) candidate, claimed by `a/member-helper-call` (count 9 as-of-authoring), while `a/exempt-declared` drops to 1 with the deleted marker (plan review R3 finding 1 made this seam item explicit; the counts were always re-derived-at-implementation per §1.1). Any `scan.ts` edit relocates the two accepted equivalent-mutant ids: re-run `pnpm mutation:guards` (scoped per the lessons-file shard mechanics) and refresh both `siteId`s in the SAME commit (`tests/mutation/source/registry.ts:415-421` NOTE); score floor 0.95, survivors repaid or accepted per-row, score + unaccepted-survivor set stated in the implementation arc's round-1 diff brief (AGENTS.md convergence criterion 4).
2. **New origin-(f) member rule** `f/member-shape-U-frame` in `disposition.ts`: matches `/\b(?:openShowReviewFrameAt|awaitReviewFrameOrRecover)\s*\(/` on the match line, shape U, count 1 as-of-authoring (the deeplink site), reason naming the frame-reporting contract. One rule for both names keeps AC-3's every-rule-matches-≥1 invariant satisfiable while the bare-core spelling has no corpus caller; a future direct caller lands in this rule and drifts its count loudly. If that future caller is shape-N (open owned elsewhere), the drift lands it in front of a human who then extends the N registry vocabulary — recorded here so that session re-opens nothing.
   **The adopted-site arithmetic test derives its sum — the new rule cannot be silently omitted** (spec-review R1 finding 1, probe: with the naive edit, the fixed three-id sum reads 52, the natural literal update also reads 52, and the assertion passes while `f/member-shape-U-frame` is excluded; the true all-member total is 53). The test at `tests/ci/_metaModalWaitHelper.test.ts:432-446` is rewritten so `adopted` sums over ALL rules with `origin === "f-helper-call"` and `disposition.kind === "member"` — a derived cover per the AGENTS.md class-sweep rule, so any FUTURE member rule joins the sum by construction — with the per-id pins retained (G 30, U 9, U-frame 1, N derived from `N_WAIT_SITES.length` = 13 as-of-authoring) and the total updated to 53. Class-sweep over the meta-suite for the same shape: the `tests/ci/_metaModalWaitHelper.test.ts:432-446` test is the only aggregation over a fixed member-id list; the shape allowlist at `tests/ci/_metaModalWaitHelper.test.ts:427` is unaffected because the frame rule's shape stays `"U"`.
3. **`d/skeleton-tolerant-click` retired** (`tests/ci/modalWaitHelper/disposition.ts:598-607`) and the `!/noWaitAfter/` exclusion arm dropped from `d/member-row-activation`'s match (`tests/ci/modalWaitHelper/disposition.ts:557-559`), whose count absorbs the realtime re-click (8 → 9 as-of-authoring). The realtime site is the ONLY `noWaitAfter` origin-(d) candidate in the corpus (`d/skeleton-tolerant-click`'s `expectedCount: 1`; the same file's scrim click targets `[data-review-modal-scrim]`, which is not a product open-surface testid, so origin (d) never proposes it) — dropping the exclusion arm therefore moves exactly one site; implementation re-derives and the disjointness assertions (`ambiguous === []`) are the check.
4. **`N_WAIT_SITES` + 1 row** (13 as-of-authoring): `published-review-modal.realtime.spec.ts`, scope "an ABORTED close clears armed freshness cues (BL-FRESHNESS-ABORTED-CLOSE-E2E)" (`published-review-modal.realtime.spec.ts:747`), labelSource `"reopen:aborted-close"`, protects prose naming the `published-review-modal.realtime.spec.ts:916` re-click. Scope-local uniqueness holds, and NOT because the rows sit in different tests — they share this exact scope. Registry identity is the (file, scope, LABEL) triple and `duplicateInScope` compares all three (`tests/ci/modalWaitHelper/disposition.ts`), so `"click:dashboard-row"` and `"reopen:aborted-close"` coexist in one scope legally (#840 §2.2). `f/member-shape-N`'s derived count follows automatically (`tests/ci/modalWaitHelper/disposition.ts:409`).
5. **`PINNED_EXEMPTIONS` drops to one entry** (`tests/ci/_metaModalWaitHelper.test.ts:55-68`): the `/skeleton-tolerant/` row is deleted with the marker it pins; the `/non-member/` row (`published-review-modal.deeplink.spec.ts:304` site) is untouched. The inventory test's length assertion derives from the array (`tests/ci/_metaModalWaitHelper.test.ts:252-263`) and needs no numeric edit.
6. **`modal-wait-disposition` re-score** in the same commit as the `disposition.ts` edits (`tests/mutation/source/registry.ts:440`, `accepted: []` — a first survivor is repaid with a deciding case or accepted with a per-row reason, never silently).
7. **Helper-module enrolment resolved at implementation, before the first diff dispatch** (#840 §4.5 posture): `tests/e2e/helpers/openShowReviewModal.ts` is registry-expressible in shape (importable module, referring suites `openShowReviewModal.unit.test.ts` and its frame sibling), and this arc grows its logic (frame race, watchdog). Attempt enrolment with a probe run; the recovery and watchdog branches sit behind the dynamic import neither unit suite can execute, so survivors clustering there take honest per-row `accepted` entries or a probe-backed not-expressible disposition (the step3 precedent, AGENTS.md criterion 4) — never symbolic enrolment.

### 4.7 Ledger + docs bookkeeping

- `BL-MODAL-WAIT-SKELETON-TOLERANT-SITES` graduates to `BACKLOG-archive.md` on the implementation PR's merge, recording this spec as the durable form; the IN PROGRESS marker comes off in that PR's last commit (invariant 12).
- Parent-#830's limit 3b and #840's `d/skeleton-tolerant-click` citation are historical records — not edited (dated documents; the ledger archive row carries the closure pointer).
- This spec gets its `docs/superpowers/specs/ci/README.md` index row in this arc's own commits.
- The plan carries `impeccable-gate: N/A — no UI surface`.

## 5. Acceptance criteria

- **AC-1 (frame core):** `awaitReviewFrameOrRecover` and `openShowReviewFrameAt` exist per §4.1 — three-way race on module-owned selectors, single recovery on boundary-first, watchdog armed on skeleton return only, named starve over all three selectors, unscoped returned locators, no top-level `@playwright/test` value import — and the §4.5 unit cases pass red-first. Existing helper exports and unit cases pass without assertion edits.
- **AC-2 (deeplink site):** the Esc-during-load test navigates through `openShowReviewFrameAt`; the raw goto, the `MODAL_ANY` wait, and the `modal-wait-exempt` marker at the site are gone; downstream assertions are byte-unchanged; the guard reports the site neither as violation nor exemption.
- **AC-3 (realtime site):** the aborted-close reopen waits through `awaitReviewModalOrRecover` with `MODAL_OPEN_TIMEOUT_MS` and the declared label; the `published-review-modal.realtime.spec.ts:54-58` rationale comment is rewritten per §4.4; downstream assertions are byte-unchanged.
- **AC-4 (census total):** on the live corpus: `undisposed === []`, `ambiguous === []`, drift `=== []`, every rule matches ≥1 candidate; `d/skeleton-tolerant-click` no longer exists; `f/member-shape-U-frame` claims the deeplink site; `N_WAIT_SITES` reconciles with the new realtime row; the adopted-site arithmetic test sums over ALL origin-(f) member rules by derivation (§4.6-2 — never a fixed id list) and reads 53 as-of-authoring; `PINNED_EXEMPTIONS` holds exactly the one `/non-member/` entry and the inventory test passes without a length literal edit.
- **AC-5 (guard mechanism untouched):** `scanForViolations` behavior is unchanged — all guard premise proofs pass without assertion edits; only the pinned inventory (AC-4) moved.
- **AC-6 (mutation duties):** `modal-wait-helper-scan` and `modal-wait-disposition` re-scored ≥0.95 with ids refreshed in the same commits as their source edits; helper-module enrolment resolved per §4.6-7 with its probe evidence; all stated in the implementation round-1 diff brief.
- **AC-7 (e2e verification):** both rewritten cases pass under the prod-build harness — the deeplink case in the default local run, the realtime case under `MODAL_REALTIME_E2E=1` — run FOREGROUND under `pnpm heavy`, with the run transcript in the implementation record.
- **AC-8 (bookkeeping):** ledger graduation wiring, README index row, review-rounds corpus rows land with their respective arcs.

## 6. Consequence bound, probe domain, threat fence (for review dispatches)

- **Consequence bound:** over the two adopted sites and the helper's own claims: every wait ends in exactly one of — a frame/locator return, ONE annotated recovery then a return, or a thrown error naming the selectors and the server signature; a boundary that arrives after a skeleton return is annotated by the watchdog while the test's own downstream assertion remains the loud failure. There is no silent-pass path through the helper's claims. The bound ranges over the helper contract and these two call sites only — never over all imaginable frames, timings, or future callers; residues stated in §7 are DOCUMENTED LIMITS, not findings.
- **PROBE DOMAIN:** `tests/e2e/helpers/openShowReviewModal.ts` + its two unit suites, `tests/e2e/published-review-modal.deeplink.spec.ts`, `tests/e2e/published-review-modal.realtime.spec.ts`, `tests/ci/modalWaitHelper/**`, `tests/ci/_metaModalWaitHelper.test.ts` (fixtures included), at the branch head. An admissible probe is drawn from those files or one ordinary edit away (a reformat, a move, a comment-out, a deletion). Claims about frame timing are settled by probes under the CURRENT drive parameters (§2.2/§2.3 transcripts; §1.1).
- **Threat fence:** ordinary authoring mistakes by a contributor editing these surfaces, and the measured infra fault class (transient boundary at open). Out of scope, each filing to documented limits: adversarial obfuscation; product regressions in the skeleton/boundary components themselves (their testids are consumed as shipped); faults arriving after the loaded frame is returned; flow analysis connecting waits to opens (ratified out by both parents). Every admissibility judgement cites this fence and the probe domain together.
- **Convergence criterion:** both census surfaces are enrolled (`tests/mutation/source/registry.ts:361`, `tests/mutation/source/registry.ts:440`); for implementation-stage review, convergence is the mutation scores plus empty unaccepted-survivor sets, and a "the census does not pin what it claims" finding is admissible only with a surviving mutant from the declared operator set. For THIS arc's spec/plan stages: no finding admissible under the bound, domain, and fence above — a review that finds none says so plainly and APPROVEs. Round cap 4 per stage; a late-arc brief states this criterion and opens no fresh axis.

## 7. Documented limits

1. **A boundary that lands between the skeleton's paint and the race's poll is returned as a skeleton one poll early; one that lands after return is annotation-only.** In both windows the test's downstream assertion fails loudly and the watchdog annotation names the fault and the grep target — degraded to today's failure SHAPE with diagnosis attached, never a silent pass. Recovering there is a second recovery, fenced (§1.1).
2. **The watchdog's fire path has no deterministic test.** It lives behind the same dynamic `@playwright/test` import as the recovery branch (parent-#830 limit 2); the frame unit suite proves the ARM (the boundary `waitFor` is recorded), not the fire. Cost: a regression in the annotation text/type surfaces only in a live boundary run.
3. **The deeplink skeleton-Esc path remains opportunistic.** Locally the loaded frame won 5/5 (§2.2); the e2e exercises skeleton-Esc only when CI timing yields it, exactly as today. The deterministic proof stays in the jsdom suite (MODAL-SKELETON-CLOSE-1). Forcing the skeleton (route-throttling the RSC stream) is a test-behavior change parent-#830 §2.5 declined and this arc's ledger row does not mandate.
4. **The realtime fresh-mount path reds on the case's own premise, not on a frame assertion.** A skeleton at reopen now produces "abort drive outran the flash window" (loud, honest: the case cannot discriminate there) rather than a vacuous pass. The premise message names the drive; re-open trigger: that premise firing at a rate that reads as flake in CI.
5. **The frame vocabulary is closed at two.** A future third frame through the same shell (a partial-hydration frame, a new fallback) is invisible to the race until someone extends the selector set; the twin-frame cardinality case (§4.5) reds if the selectors stop being disjoint, which is the loud edge of this limit.
6. **The overlap tie-break is decided at SAMPLE time, not at truth time.** Sequential live DOM queries cannot observe two selectors in one instant, so a loaded frame that arrives after BOTH samples is honestly reported as the skeleton that was up when it was asked. Ordering makes the window as small as sequential sampling allows and the residue is conservative: the caller gets a frame that was really there, plus a watchdog it did not strictly need, and never a wrong-frame claim about the instant sampled. The two unit regression cases (§4.5) pin the ordering and the totality; the peer instance in the shipped loaded-only core is fenced out of this arc and filed as `BL-MODAL-WAIT-LOADED-CORE-CLASSIFY-TOTALITY`.
7. **Wait-to-open association stays declared, not inferred** — inherited unchanged from #840 (its limits 1-3 apply to the new registry row verbatim).

## 8. Invariant-8 disposition

No UI surface: changes land in `tests/e2e/**`, `tests/ci/**`, `tests/mutation/source/registry.ts`, and docs. The plan closeout carries `impeccable-gate: N/A — no UI surface`.
