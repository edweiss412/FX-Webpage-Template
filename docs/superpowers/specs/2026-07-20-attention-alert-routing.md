# Attention-alert routing — every alert renders where its fix lives

**Date:** 2026-07-20
**Status:** Draft (autonomous-ship run; user approved all three PRs in-session)
**Branch:** `feat/attention-alert-routing`, based on `feat/show-scoped-alert-copy` @ `3aba6f8f5`
**Predecessors:** `docs/superpowers/specs/2026-07-19-published-show-alerts.md` (the attention surface this amends), `docs/superpowers/specs/2026-07-20-show-alert-compact.md` (the card shell).
**Concurrent, coordinated:** `feat/show-scoped-alert-copy` (owns admin-alert COPY and its spec B), `feat/warning-card-copy-restore` (owns parse-warning card copy; shrinks the shared `?` trigger to 22px).

---

## 1. Problem

`2026-07-19-published-show-alerts.md:16` ratified the intent:

> **Inline placement** — every alert renders as an inline banner at its most-relevant location.

The mechanism shipped for ONE destination. `AttentionRoute.sectionId` is narrowed to `Extract<RoutedSectionId, "crew" | "overview">` (`lib/admin/attentionItems.ts:18`), so the routing table cannot express any other section. Three codes route to `crew`; every other code falls into `overview` as a catch-all, justified at that spec's §4 as "Overview owns the sheet/sync cluster ... the closest actionable home."

That justification is true for sync codes and false for the rest. A diagram alert, a reel alert, and a parse alert all render at the top of Overview while the diagram gallery, the reel field, and the parse list sit far below. The operator reads the problem in one place and fixes it in another.

A second defect surfaced while scoping this: `PARSE_ERROR_LAST_GOOD` tells the operator to "see the per-show parse panel for the error detail," and that detail exists nowhere in the admin UI. The alert's context carries only `drive_file_id` and `sheet_name` (`lib/sync/runScheduledCronSync.ts:3388-3391`), and the panel it points at renders the LAST-GOOD version's warnings, not the failed parse (`lib/sync/runScheduledCronSync.ts:3402`, "Retain last-good: STOP before Phase 2"). The failure reason is computed and discarded.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Alerts render where the fix lives; only show-wide sync failures stay at the top. Header pill count is the at-a-glance signal and is unaffected (it counts `actionable` across ALL sections, `PublishedReviewModal.tsx:212`). | User, this session. |
| Asset/reel alerts anchor to the CONTENT (diagram sub-block, reel field), not merely the section top. "Option B" of the placement mockup. | User selected option B, this session. |
| `SHOW_FIRST_PUBLISHED` + `SHOW_UNPUBLISHED` STAY on the show surface. Neither is an admin being told what they just clicked: the first is raised by cron auto-publish (`runScheduledCronSync.ts:2364`), the second is reachable from an emailed link (`app/show/[slug]/unpublish/actions.ts:65`). | User selected "keep in Overview", this session. |
| `PICKER_EPOCH_RESET` is CUT from the attention surface. It is the third copy of one event: `PickerResetControl.tsx:187` already renders a visible success banner with a live region and 5s auto-dismiss, and `resetPickerEpoch.ts:47` writes a durable `PICKER_EPOCH_RESET_BY_ADMIN` audit record. | User, this session. |
| The two parse notices render as a banner LINE, not a card ("Option C"). They lose the manual Mark-resolved affordance and clear when the next sync succeeds. | User selected option C knowing the trade-off, this session. |
| Failure-reason capture is IN scope (option b of three), and stores the invariant CODE only, never the free-text `message`. | User selected (b), this session. |
| Show-scoped copy (`dougFacingShowScoped` authoring for the 14 per-show codes) is OUT of scope — owned by `feat/show-scoped-alert-copy` spec B, which already holds the code list (that branch's commit `3aba6f8f5`). | User, this session; sibling spec §5. |
| The FOUR global codes (`ONBOARDING_SHEET_UNREADABLE`, `WATCH_CHANNEL_ORPHANED`, `SYNC_STALLED`, `LIVE_ROW_CONFLICT`) need NO routing change: every producer passes `showId: null`, so they never reach a per-show fetch. Routing-table membership is NOT eligibility. | Verified §2.2. |

## 2. Current mechanism (verified against live code)

### 2.1 The mount

| Element | Where | Note |
| --- | --- | --- |
| Route type | `lib/admin/attentionItems.ts:18` | `sectionId: Extract<RoutedSectionId, "crew" \| "overview">` — the narrowing this spec widens |
| Route table | `lib/admin/attentionItems.ts:70` | `ATTENTION_ROUTES`, keyed over the full 45-code registry |
| Bucketing | `components/admin/showpage/PublishedReviewModal.tsx:317` | crew+crewKey → `byCrewKey`; crew w/o match → `sectionTop`; everything else → Overview |
| Transport | `components/admin/wizard/step3ReviewSections.tsx:1274` | `useContext(Step3SectionChromeContext)?.crewAttention` — generic context, crew-specific payload |
| Threading | `components/admin/review/ShowReviewSurface.tsx:919` | `...(s.id === "crew" && crewAttention ? { crewAttention } : {})` — the crew-only gate |
| Section top render | `components/admin/wizard/step3ReviewSections.tsx:1314-1315` | the slot a generalized mount reuses |

### 2.2 Eligibility (why 14, not 18)

`lib/adminAlerts/fetchPerShowAlerts.ts:17` filters `HEALTH_CODES` only; eligibility is otherwise determined by whether a producer passes a non-null `showId`. Verified raise sites:

| Code | Raise site | Scope |
| --- | --- | --- |
| `ONBOARDING_SHEET_UNREADABLE` | `app/api/admin/onboarding/scan/route.ts:308` | `showId: null` (folder/session) |
| `WATCH_CHANNEL_ORPHANED` | `lib/adminAlerts/alertIdentityMap.ts:116` declares `{ kind: "global" }` | global |
| `SYNC_STALLED` | `lib/notify/detect/stall.ts:15` | `showId: null` |
| `LIVE_ROW_CONFLICT` | `lib/sync/runOnboardingScan.ts:53` | `showId: null` |
| `DRIVE_FETCH_FAILED` | `lib/sync/runManualSyncForShow.ts:232` (`recoveryTx.upsertAdminAlert`) | PER-SHOW — eligible |

These four carry `ATTENTION_ROUTES` rows for totality (that table is set-equal to the registry, pinned by `tests/admin/_metaAttentionRoutes.test.ts`). A route row is NOT evidence of reachability — §7 adds a test that says so mechanically, because this exact confusion cost a full analysis pass during scoping.

### 2.3 The discarded failure reason

`Phase1Result.hard_fail` (`lib/sync/phase1.ts:139`) carries `code`, `failedCodes: string[]`, and `message: string`. `code` is `invariant.failedCodes[0] ?? "PARSE_HARD_FAIL"` (`lib/sync/phase1.ts:395`). The first-seen branch persists `lastErrorCode` + `lastErrorMessage` into `pending_ingestions` (`lib/sync/phase1.ts:82` type, written in the else-branch at `lib/sync/phase1.ts:405`); the EXISTING-show branch does not, so for a published show the reason reaches `sync_log` and nothing else.

`failedCodes` come from `lib/parser/invariants.ts:114` and are a closed set of eight:

`MI-1_VERSION_DETECTION_FAILED`, `MI-2_EMPTY_TITLE`, `MI-3_NO_VALID_DATES`, `MI-4_NO_CREW`, `MI-5_NO_ROOMS`, `MI-5a_DUPLICATE_CREW_NAME`, `MI-5b_DUPLICATE_CREW_EMAIL`, `VERSION_AMBIGUOUS`.

Six already have `MESSAGE_CATALOG` entries. `MI-2_EMPTY_TITLE` and `MI-3_NO_VALID_DATES` do not (verified: zero catalog hits).

---

## 3. Design

Three independently shippable units, sequenced so no copy is authored twice.

### 3.0 Producer registry (R1 finding 1)

Eligibility claims in §2.2 rest on producer completeness, which a per-code grep cannot establish: alert writes reach the DB through FIVE distinct call shapes, and the earlier `DRIVE_FETCH_FAILED` error came from searching only the first.

| Shape | Example |
| --- | --- |
| bare imported function | `app/api/admin/onboarding/scan/route.ts:306` |
| tx-bound method, object arg | `lib/sync/runManualSyncForShow.ts:232` (`recoveryTx.upsertAdminAlert({...})`) |
| tx-bound method, positional args | `lib/sync/applyStaged.ts:579` (`tx.upsertAdminAlert(showId, CODE, {...})`) |
| injected dep resolved at call time | `lib/sync/runScheduledCronSync.ts:3384` (`requireTxBoundUpsertAdminAlert`) |
| adapter that hard-codes the scope | `lib/drive/watch.ts:193` (`showId: null` fixed inside the adapter) |
| raw SQL | `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:16` |

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

**CREATES `tests/adminAlerts/_metaAlertProducerScope.test.ts`.** A filesystem-walked structural test that discovers every alert-write call site across all six shapes and requires each to be classified in a registry as `per-show`, `global`, or `both`. A NEW unclassified call site fails by default. The §2.2 eligibility table is then a projection of that registry rather than a hand-maintained list, so it cannot silently drift when a second producer is added later.

This test is the mechanism finding 1 requires: exercising today's producers would not catch tomorrow's.

### 3.1 PR 1 — capture the failure reason

**Producer.** In the hard-fail branch (`lib/sync/runScheduledCronSync.ts:3384-3392`), extend the `PARSE_ERROR_LAST_GOOD` context with:

- `error_code: string` — ONLY if it is a member of the allowlist below; otherwise the key is omitted entirely
- `failed_codes: string[]` — allowlist members only, capped at 4, remainder dropped

**Persistence allowlist (R1 finding 2).** `Phase1Result.code` and `failedCodes` are typed `string`, not a union, and `code` falls back to the ninth value `PARSE_HARD_FAIL` when `failedCodes` is empty (`lib/sync/phase1.ts:395`). Type-level safety therefore does not exist, and "the eight codes look safe" is not a guarantee. The producer filters against an explicit frozen allowlist AT THE PERSISTENCE BOUNDARY:

```
MI-1_VERSION_DETECTION_FAILED   MI-5_NO_ROOMS
MI-2_EMPTY_TITLE                MI-5a_DUPLICATE_CREW_NAME
MI-3_NO_VALID_DATES             MI-5b_DUPLICATE_CREW_EMAIL
MI-4_NO_CREW                    VERSION_AMBIGUOUS
```

Anything else — `PARSE_HARD_FAIL`, a future invariant code, an interpolated string — is DROPPED, not stored. `message` is never stored under any condition. The privacy posture is therefore enforced by a filter, not by an assumption about what upstream emits. Tests feed an interpolated/sensitive-looking value through the producer and assert it does not reach the persisted context.

**Catalog: an alias map, NOT two new §12.4 rows.** The producer spellings `MI-2_EMPTY_TITLE` and `MI-3_NO_VALID_DATES` have no catalog rows, but the SAME TWO INVARIANTS already have operator-facing rows under different names: `MI-2_TITLE_MISSING` ("Show title missing", `lib/messages/catalog.ts:705`) and `MI-3_NO_PARSEABLE_DATE` ("No readable show dates", `lib/messages/catalog.ts:717`). The producer spellings are the durable persisted values (`lib/messages/__generated__/internal-code-enums.ts:125` records both as `pending_ingestions.last_error_code` sources).

Authoring new §12.4 rows would put TWO codes in the catalog for one invariant, which is a defect, not a fix. Instead PR 1 adds a small explicit alias map (producer spelling → catalog code) consumed by the reason helper. **No new §12.4 rows, no three-way lockstep, no x1 parity impact.** The pre-existing naming drift is recorded here, not silently normalized.

**Reason helper.** Pure: allowlisted producer code → alias map → `MESSAGE_CATALOG` title, else `null`. Returns `null` for absent, unknown, unaliased, or uncataloged input.

The eight resolved titles, reproduced so the composed copy is reviewable (R1 finding 5):

| Producer code | Catalog code | Title |
| --- | --- | --- |
| `MI-1_VERSION_DETECTION_FAILED` | same | (`lib/messages/catalog.ts:678`) |
| `MI-2_EMPTY_TITLE` | `MI-2_TITLE_MISSING` | Show title missing |
| `MI-3_NO_VALID_DATES` | `MI-3_NO_PARSEABLE_DATE` | No readable show dates |
| `MI-4_NO_CREW` | same | No crew rows |
| `MI-5_NO_ROOMS` | same | (`lib/messages/catalog.ts:741`) |
| `MI-5a_DUPLICATE_CREW_NAME` | same | (`lib/messages/catalog.ts:755`) |
| `MI-5b_DUPLICATE_CREW_EMAIL` | same | (`lib/messages/catalog.ts:768`) |
| `VERSION_AMBIGUOUS` | same | (`lib/messages/catalog.ts:691`) |

**Composition contract.** The reason renders as its own sentence: `<title>.` — the title verbatim, one period appended, one space before the following sentence. No other punctuation is introduced. A test asserts the FINAL COMPOSED banner string (not the fragments) contains no em dash, for every one of the eight titles, so a catalog title acquiring one later fails here.

**Advisory-lock topology (invariant 2) (R1 finding 7).** The `show:` hashkey is acquired by the JS-side wrapper `withShowLock` — `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))` at `lib/db/advisoryLock.ts:58`, blocking variant `lib/db/advisoryLock.ts:66` — threaded into the cron path as a dependency (`lib/sync/runScheduledCronSync.ts:83`). The hard-fail branch runs inside `fn()` under that wrapper, and the alert write is tx-bound through `requireTxBoundUpsertAdminAlert` so it joins the same transaction. **Sole holder: the JS-side wrapper.** No in-RPC or nested SECURITY DEFINER acquisition exists for this hashkey on this path. This change adds context KEYS to an existing call inside that transaction: no new acquisition, no new holder, no nesting. `tests/auth/advisoryLockRpcDeadlock.test.ts` is unaffected.

### 3.2 PR 2 — generalize the mount; move the two parse notices

**Widen the route.**

```ts
type AttentionRoute = {
  sectionId: RoutedSectionId;
  anchor?: AttentionAnchor; // "diagrams" | "opening_reel"
};
```

**Transport type (R1 finding 8).** `crewAttention: CrewAttention` becomes `sectionAttention: SectionAttention`:

```ts
type SectionAttentionBucket = {
  sectionTop: ReactNode[];              // ordered: derivation order (actionable first, then raised_at DESC)
  byCrewKey?: Map<string, ReactNode[]>; // CREW ONLY: absent for every other section
  byAnchor?: Map<AttentionAnchor, ReactNode[]>;
};
type SectionAttention = Map<RoutedSectionId, SectionAttentionBucket>;
```

Ordering is the derivation order already produced by `deriveAttentionItems` (spec §3.1 of published-show-alerts: actionable before auto-clearing, then fetch order); no re-sorting. An empty bucket is NOT emitted — a section with no items has no map entry, so the consumer's optional-chain renders nothing and emits no wrapper element. `byCrewKey` remains crew-exclusive, preserving the in-`<li>` placement contract.

**Exhaustive rename inventory** (every provider, consumer, and fixture — verified by grep at plan time, enumerated in the plan): producer `components/admin/showpage/PublishedReviewModal.tsx:317`; type + prop `components/admin/review/ShowReviewSurface.tsx:165`; threading `components/admin/review/ShowReviewSurface.tsx:919`; context type `components/admin/wizard/step3ReviewSections.tsx:493`; consumer `components/admin/wizard/step3ReviewSections.tsx:1274`; section-top render `components/admin/wizard/step3ReviewSections.tsx:1314`; per-row `components/admin/wizard/step3ReviewSections.tsx:1330`; test fixtures `tests/components/admin/review/showReviewSurfaceAttention.test.tsx`, `tests/components/admin/review/attentionBanner.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/components/admin/compactAlertCompoundTransitions.test.tsx`, `tests/e2e/published-show-attention.spec.ts`, `tests/e2e/published-review-modal.deeplink.spec.ts`.

**Crew-preservation contract (behavioral, not "tests still pass").** `showReviewSurfaceAttention.test.tsx` already asserts the crew section renders BYTE-IDENTICAL DOM when attention props are absent. That assertion is retained verbatim and is the rename's regression proof; additionally, an explicit test asserts crew's in-`<li>` and section-top placement is unchanged with props present.

**Availability and fallback (R1 finding 3).** Fallback is resolved at BUCKETING time in the loader/modal, before any render, so there is no render-then-relocate loop:

1. Section availability is already computed — `renderedSectionIds(publishedData)` (`components/admin/review/sectionInclusion.ts:54`), already called at `app/admin/_showReviewModal.tsx:326`. Note `rooms`, `event`, and `warnings` are unconditional members, so every target section in this spec is always present; the check exists for future routes and for `agenda`/`report`, which are conditional.
2. Anchor availability is NEW: a pure `availableAnchors(data): Set<AttentionAnchor>` derived from the same `SectionData` the sections render from — `diagrams` present iff the Diagrams sub-block will render, `opening_reel` present iff that field will render. It is computed from the SAME predicate the section uses, so the two cannot disagree.
3. Resolution order per item: anchor available → `byAnchor`; else section available → that section's `sectionTop`; else → Overview.

**Overview is the terminal fallback and is always reachable:** an item routed there sets `hasAttention`, which is a disjunct of `overviewHasContent` (`PublishedReviewModal.tsx:385`), so the Overview section mounts to receive it. An item can therefore never be dropped.

**Copy — the complete state matrix (R1 finding 4).** `PARSE_ERROR_LAST_GOOD` has 2 (list empty/non-empty) × 2 (reason present/absent) = 4 states; `RESYNC_QUALITY_REGRESSED` has 2. All six are specified; none is impossible.

| # | Notice | List | Reason | Rendered line |
| --- | --- | --- | --- | --- |
| 1 | `PARSE_ERROR_LAST_GOOD` | non-empty | present | **Crew are still seeing the last good version.** Your latest changes didn't go through. `<Title>.` Anything listed below is from the version crew can see, not from the change that failed. |
| 2 | `PARSE_ERROR_LAST_GOOD` | non-empty | absent | **Crew are still seeing the last good version.** Your latest changes didn't go through. Anything listed below is from the version crew can see, not from the change that failed. |
| 3 | `PARSE_ERROR_LAST_GOOD` | empty | present | **Crew are still seeing the last good version.** Your latest changes didn't go through. `<Title>.` |
| 4 | `PARSE_ERROR_LAST_GOOD` | empty | absent | **Crew are still seeing the last good version.** Your latest changes didn't go through. |
| 5 | `RESYNC_QUALITY_REGRESSED` | non-empty | n/a | **This version is live for crew.** The latest changes lost some detail, and the problems below are what stopped reading. |
| 6 | `RESYNC_QUALITY_REGRESSED` | empty | n/a | **This version is live for crew.** The latest changes lost some detail. |

State 6 is the gap R1 found: `RESYNC_QUALITY_REGRESSED` fires on a quality REGRESSION, which normally implies warnings exist — but the two are computed independently (the alert from a cross-version comparison, the list from the current parse), so a zero-warning regression is representable and must not promise "problems below." Its clause is dropped exactly as in states 3-4. `RESYNC_QUALITY_REGRESSED` carries no reason field (that is `PARSE_ERROR_LAST_GOOD`-only), hence "n/a" rather than a third dimension.

**Both notices present simultaneously:** both lines render, `PARSE_ERROR_LAST_GOOD` first (it describes what crew currently see; the other describes what is live), as two sibling elements inside one container, each with its own testid.

**The banner as a rendered element (R1 finding 9).** Not a prose description:

- Element: `<p data-testid="parse-attention-note-<code>">` inside a `<div data-testid="parse-attention-notes">` container placed as the FIRST child of the Parse warnings panel body, ABOVE both the list and the empty-state line (`step3ReviewSections.tsx:2399`).
- The leading sentence is `<strong>`; the remainder is normal weight in the same paragraph.
- Type/tokens: `text-xs/relaxed`, `text-text-subtle`, container `border-b border-border pb-2 mb-1`. No card, no stripe, no background fill — the visual distinction from the cards below is the ABSENCE of card chrome.
- Accessibility: it is static page context, not a live announcement. No `role="alert"`, no `role="status"`, no `aria-live` — the content is present at first paint and never updates in place.
- Two simultaneous notices are two `<p>` siblings in the one container, not two containers.

**Cut `PICKER_EPOCH_RESET`** from attention derivation. The alert row is still written (it remains the bell's record and the audit trail); only the per-show attention surface stops rendering it. Cutting the producer is NOT in scope.

### 3.3 PR 3 — anchors for the asset/reel codes

| Anchor | Host | Live-code note |
| --- | --- | --- |
| `diagrams` | Diagrams sub-block under Rooms & scope | A level-4 SUB-block with NO `sectionId` (`components/admin/wizard/step3ReviewSections.tsx:658`), which is why the route needs an anchor rather than a section |
| `opening_reel` | the Event details field of that key | `components/admin/wizard/step3ReviewSections.tsx:382` (group key), rendered `components/admin/wizard/step3ReviewSections.tsx:1839` |

Routes: `ASSET_RECOVERY_BYTES_EXCEEDED`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `EMBEDDED_ASSET_DRIFTED` → `{ sectionId: "rooms", anchor: "diagrams" }`. `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO`, `REEL_DRIFTED` → `{ sectionId: "event", anchor: "opening_reel" }`.

These render as `CompactAlertCard` (unchanged shell), keeping stripe, footer, and resolve affordance. The stripe is the distinction from surrounding content: warning cards ship `stripe="none"` (`components/admin/PerShowActionableWarnings.tsx:125`) while attention cards default to the review stripe (`components/admin/CompactAlertCard.tsx:17`).

## 4. Final disposition of all 18 registered codes

| Code | Today | After | PR |
| --- | --- | --- | --- |
| `ONBOARDING_SHEET_UNREADABLE` | never renders (global) | unchanged | — |
| `WATCH_CHANNEL_ORPHANED` | never renders (global) | unchanged | — |
| `SYNC_STALLED` | never renders (global) | unchanged | — |
| `LIVE_ROW_CONFLICT` | never renders (global) | unchanged | — |
| `PICKER_EPOCH_RESET` | Overview card | cut from attention | 2 |
| `PARSE_ERROR_LAST_GOOD` | Overview card | `warnings` banner line + reason | 1, 2 |
| `RESYNC_QUALITY_REGRESSED` | Overview card | `warnings` banner line | 2 |
| `ASSET_RECOVERY_BYTES_EXCEEDED` | Overview card | `rooms` @ `diagrams` | 3 |
| `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` | Overview card | `rooms` @ `diagrams` | 3 |
| `EMBEDDED_ASSET_DRIFTED` | Overview card | `rooms` @ `diagrams` | 3 |
| `OPENING_REEL_PERMISSION_DENIED` | Overview card | `event` @ `opening_reel` | 3 |
| `OPENING_REEL_NOT_VIDEO` | Overview card | `event` @ `opening_reel` | 3 |
| `REEL_DRIFTED` | Overview card | `event` @ `opening_reel` | 3 |
| `DRIVE_FETCH_FAILED` | Overview card | unchanged (sync) | — |
| `SHEET_UNAVAILABLE` | Overview card | unchanged (sync) | — |
| `RESYNC_SHRINK_HELD` | Overview card | unchanged (sync; the fix is Re-sync, in the status band) | — |
| `SHOW_FIRST_PUBLISHED` | Overview card | unchanged | — |
| `SHOW_UNPUBLISHED` | Overview card | unchanged | — |

## 5. Guard conditions

| Input | Behavior |
| --- | --- |
| anchor named but unavailable for this show | that section's `sectionTop` (§3.2 resolution order, decided at bucketing) |
| section unavailable (conditional section absent) | Overview |
| Overview receives an item | `hasAttention` is true, so `overviewHasContent` mounts the section (`PublishedReviewModal.tsx:385`) — an item is never dropped |
| `error_code` absent (row predates PR 1) | states 2/4 of the §3.2 matrix; reason sentence omitted |
| `error_code` present but not allowlisted | never persisted (§3.1), so indistinguishable from absent |
| allowlisted code with no catalog row / no alias | helper returns `null`; reason sentence omitted (invariant 5: never surface a raw code) |
| `failed_codes` empty / non-array / all non-allowlisted | key omitted; `error_code` alone drives the sentence |
| `warnings.length === 0` | states 3/4/6; no "below" clause |
| both parse notices open | two `<p>` siblings, `PARSE_ERROR_LAST_GOOD` first |
| archived show | unchanged: banners render, resolve is not lifecycle-gated (`docs/superpowers/specs/2026-07-19-published-show-alerts.md` §7 row) |

## 6. Dimensional invariants / transition inventory

**Dimensional invariants.** The banner is a flow-layout `<p>` inside the existing panel column; anchored cards mount into existing flow containers. NO new fixed-dimension parent with flex/grid children is introduced, so no layout-dimensions task is required. The adjacent 22px `?` trigger is introduced and pinned by `feat/warning-card-copy-restore` §6 — see §9 for why this spec asserts nothing about it.

**Transition inventory.** Attention items appear/disappear only on server-driven re-render (`router.refresh()` after a resolve, or a sync landing); within a mounted panel the set is constant. Per-section states: (A) none, (B) section-top only, (C) anchored only, (D) both. All six pairs — A↔B, A↔C, A↔D, B↔C, B↔D, C↔D — are **instant, no animation**, matching the existing crew route, which animates none of these today. Compound: an anchor becoming unavailable while its item is mounted resolves through §5 on the next render, instantly. The deep-link flash (`attentionJump` + `aria-current`) is unchanged and orthogonal.

## 7. Meta-test inventory

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

**CREATES** `tests/adminAlerts/_metaAlertProducerScope.test.ts` — the producer-scope registry (§3.0). Filesystem-walked across all six call shapes; a new unclassified alert-write call site fails by default.

**CREATES** the reachability projection: the four §2.2 global codes yield no per-show attention item. Its registry is derived FROM the producer-scope registry, not hand-listed, so `DRIVE_FETCH_FAILED` cannot be wrongly included (a hand-listed five-code version would encode the very error this exists to prevent).

**EXTENDS** `tests/admin/_metaAttentionRoutes.test.ts` — set-equality against the registry still holds after the type widens; adds anchor-validity (an anchor may only name a declared `AttentionAnchor`).

**NOT extended:** `tests/auth/advisoryLockRpcDeadlock.test.ts` — no lock topology change (§3.1, evidenced).

**No §12.4 / x1-catalog-parity impact** — the alias map replaces new catalog rows (§3.1).

## 8. Test plan

Each entry names the concrete failure it catches.

- **Producer scope (§3.0).** Catches: a new alert-write call site added in any of the six shapes without declaring its scope. This is the test that would have caught the `DRIVE_FETCH_FAILED` error.
- **Routing.** Expected `sectionId`/`anchor` per code come from a FROZEN FIXTURE transcribed from the §4 table (the project's established pattern — the sibling warning-card spec freezes its copy table the same way). Deriving them from `ATTENTION_ROUTES` would be tautological; the fixture is an independent oracle whose diff is reviewed. Catches: a route silently changed without a spec edit.
- **Reason allowlist.** Catches: `PARSE_HARD_FAIL`, an unknown future code, or an interpolated/sensitive string reaching the persisted context. Feeds each explicitly and asserts absence.
- **`message` never persisted.** Catches: a future "helpful" addition of the free-text field. Asserts the persisted context has no free-text member.
- **Reason helper.** All eight allowlisted codes resolve to non-empty copy through the alias map; unknown/unaliased/uncataloged → `null`. Expected strings read from `MESSAGE_CATALOG` via the alias, so the test proves the ALIAS is right (the thing that can be wrong) rather than that the catalog equals itself.
- **Composed copy.** All six §3.2 states assert the FINAL rendered string, scoped to the banner's own testid so the list below cannot satisfy it. Includes the no-em-dash assertion over the composed output for all eight titles. Catches: a "below" clause surviving into an empty-list state, and a catalog title introducing a banned character.
- **Crew preservation.** The existing byte-identity assertion is retained verbatim; plus in-`<li>` and section-top placement with props present. Catches: the rename regressing crew placement.
- **Anchor fallback.** Anchor unavailable → section top; section unavailable → Overview. Catches: an item silently dropped when a data-gated sub-block does not render.
- **Real browser (Playwright).** An anchored card renders INSIDE its anchor's container (asserted by DOM ancestry, not coordinates). Catches: an anchor that resolves but mounts outside the intended subtree. NO assertion about `?` trigger geometry — see §9.

## 8.1 Known defects NOT fixed here

- `DRIVE_FETCH_FAILED` copy says "click 'Retry'" and `WATCH_CHANNEL_ORPHANED`'s auto-clear note says "use Retry to trigger it now", but `AttentionBanner` renders no Retry control (footer-right is the auto-clear note). Real, but it is admin-alert COPY, owned by the sibling `feat/show-scoped-alert-copy` spec B. Recorded so a reviewer does not raise it against this diff and so spec B has the pointer.
- The `MI-2` / `MI-3` producer-vs-catalog naming drift (§3.1) is bridged by an alias map, not normalized. Renaming either spelling would touch persisted `pending_ingestions.last_error_code` values and is out of scope.

## 9. Out of scope

- `dougFacingShowScoped` authoring for the 14 per-show codes — sibling spec B. NOTE: the list handed to that session listed 13 and wrongly excluded `DRIVE_FETCH_FAILED`; §2.2 corrects it.
- Parse-warning card copy and the `?` trigger geometry — `feat/warning-card-copy-restore`. **Branch-dependency statement (R1 finding 6):** this branch is based on `feat/show-scoped-alert-copy`, NOT on the warning-card branch, so the 22px trigger does not exist on this base. This spec therefore asserts NOTHING about trigger geometry — no 22×22 assertion, no 44px assertion. Its Playwright coverage tests only this feature's own placement, which is geometry-independent and passes under either trigger size. No merge ordering between the two branches is required.
- Removing the `PICKER_EPOCH_RESET` producer (only its attention rendering is cut).
- Storing or surfacing the hard-fail `message` text (§3.1, deliberate).
- Promoting Diagrams to a real `SectionId` (mockup option C, not selected).
- Any change to the bell, health panel, or global alert surfaces.
