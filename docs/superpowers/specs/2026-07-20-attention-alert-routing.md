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
| Show-scoped copy (`dougFacingShowScoped` authoring for the 13 per-show codes) is OUT of scope — owned by `feat/show-scoped-alert-copy` spec B, which already holds the code list (that branch's commit `3aba6f8f5`). | User, this session; sibling spec §5. |
| The five global codes (`ONBOARDING_SHEET_UNREADABLE`, `WATCH_CHANNEL_ORPHANED`, `SYNC_STALLED`, `LIVE_ROW_CONFLICT`) and the non-alert `DRIVE_FETCH_FAILED` need NO routing change: they are raised with `showId: null` (or are not alerts) and never reach a per-show fetch. Routing-table membership is NOT eligibility. | Verified §2.2. |

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

### 2.2 Eligibility (why 13, not 18)

`lib/adminAlerts/fetchPerShowAlerts.ts:17` filters `HEALTH_CODES` only; eligibility is otherwise determined by whether a producer passes a non-null `showId`. Verified raise sites:

| Code | Raise site | Scope |
| --- | --- | --- |
| `ONBOARDING_SHEET_UNREADABLE` | `app/api/admin/onboarding/scan/route.ts:308` | `showId: null` (folder/session) |
| `WATCH_CHANNEL_ORPHANED` | `lib/adminAlerts/alertIdentityMap.ts:116` declares `{ kind: "global" }` | global |
| `SYNC_STALLED` | `lib/notify/detect/stall.ts:15` | `showId: null` |
| `LIVE_ROW_CONFLICT` | `lib/sync/runOnboardingScan.ts:53` | `showId: null` |
| `DRIVE_FETCH_FAILED` | no `upsertAdminAlert` call site exists | not an alert |

These five carry `ATTENTION_ROUTES` rows for totality (that table is set-equal to the registry, pinned by `tests/admin/_metaAttentionRoutes.test.ts`). A route row is NOT evidence of reachability — §7 adds a test that says so mechanically, because this exact confusion cost a full analysis pass during scoping.

### 2.3 The discarded failure reason

`Phase1Result.hard_fail` (`lib/sync/phase1.ts:139`) carries `code`, `failedCodes: string[]`, and `message: string`. `code` is `invariant.failedCodes[0] ?? "PARSE_HARD_FAIL"` (`lib/sync/phase1.ts:395`). The first-seen branch persists `lastErrorCode` + `lastErrorMessage` into `pending_ingestions` (`lib/sync/phase1.ts:82` type, written in the else-branch at `lib/sync/phase1.ts:405`); the EXISTING-show branch does not, so for a published show the reason reaches `sync_log` and nothing else.

`failedCodes` come from `lib/parser/invariants.ts:114` and are a closed set of eight:

`MI-1_VERSION_DETECTION_FAILED`, `MI-2_EMPTY_TITLE`, `MI-3_NO_VALID_DATES`, `MI-4_NO_CREW`, `MI-5_NO_ROOMS`, `MI-5a_DUPLICATE_CREW_NAME`, `MI-5b_DUPLICATE_CREW_EMAIL`, `VERSION_AMBIGUOUS`.

Six already have `MESSAGE_CATALOG` entries. `MI-2_EMPTY_TITLE` and `MI-3_NO_VALID_DATES` do not (verified: zero catalog hits).

---

## 3. Design

Three independently shippable units, sequenced so no copy is authored twice.

### 3.1 PR 1 — capture the failure reason

**Producer.** In the hard-fail branch (`runScheduledCronSync.ts:3384-3392`), extend the `PARSE_ERROR_LAST_GOOD` context with:

- `error_code: string` — `phase1.code` (the routed `failedCodes[0]`)
- `failed_codes: string[]` — `phase1.failedCodes`, capped at 4, remainder dropped

**`message` is deliberately NOT stored.** It is the only free-text member and can quote sheet content; the codes are a closed enum and carry no operator data. This is the whole privacy posture: we persist an enum, not a string. Stated explicitly so a future reader does not "helpfully" add the message back.

**Advisory-lock topology (invariant 2).** The producer already runs inside the locked hard-fail branch — the comment at `lib/sync/runScheduledCronSync.ts:3383` states it, and the alert is written through `requireTxBoundUpsertAdminAlert` (`lib/sync/runScheduledCronSync.ts:3386`). This change adds CONTEXT FIELDS to an existing call. It introduces no new lock holder, no new acquisition, and no new transaction. The single-holder rule is untouched.

**Catalog.** Author `MI-2_EMPTY_TITLE` and `MI-3_NO_VALID_DATES` rows via the three-way §12.4 lockstep (master-spec prose → `pnpm gen:spec-codes` → `lib/messages/catalog.ts`, one commit) so all eight reasons resolve to human copy.

**Rendering.** A pure helper resolves `error_code` to its catalog `title`, returning `null` for an unknown/absent code. Rendering is PR 2's job; PR 1 ships the helper plus its tests so PR 2 has one authored sentence, not two.

### 3.2 PR 2 — generalize the mount; move the two parse notices

**Widen the route.** `AttentionRoute.sectionId` becomes the full `RoutedSectionId`. Add an optional anchor:

```ts
type AttentionRoute = {
  sectionId: RoutedSectionId;
  anchor?: string; // content-level slot within the section
};
```

**Generalize the transport.** `crewAttention` becomes `sectionAttention`, keyed by `sectionId`, retaining the crew payload shape (`byCrewKey` / `sectionTop`) plus `byAnchor`. `ShowReviewSurface.tsx:919`'s `s.id === "crew"` gate becomes a per-section lookup. Crew behavior is preserved exactly; its tests are the regression proof.

**Guard: anchor fallback.** If a route names an anchor and the section renders no such anchor, the item falls back to that section's top. An alert must never be dropped because its anchor is absent — this is what makes anchoring safe on data-gated sub-blocks (the Diagrams block is gated on having diagrams at all).

**Route the two parse notices** to `warnings` and render them as a banner LINE above the list, not a `CompactAlertCard`.

**Copy — three variants** (approved from the mockup, verbatim):

| Situation | Line |
| --- | --- |
| `PARSE_ERROR_LAST_GOOD`, list non-empty | **Crew are still seeing the last good version.** Your latest changes didn't go through. `<reason sentence>` Anything listed below is from the version crew can see, not from the change that failed. |
| `PARSE_ERROR_LAST_GOOD`, list empty | **Crew are still seeing the last good version.** Your latest changes didn't go through. `<reason sentence>` |
| `RESYNC_QUALITY_REGRESSED` | **This version is live for crew.** The latest changes lost some detail, and the problems below are what stopped reading. |

`<reason sentence>` is PR 1's resolved catalog title, or omitted entirely when `error_code` is absent (pre-existing alert rows raised before PR 1) or unresolvable. The trailing "Anything listed below…" clause is present ONLY when the list is non-empty (`warnings.length > 0`); the empty list renders "No parse warnings for this sheet." (`step3ReviewSections.tsx:2399`) and promising problems below would read as a broken render.

**Cut `PICKER_EPOCH_RESET`** from `ATTENTION_ROUTES` participation: the derivation drops it before it becomes an `AttentionItem`. The alert row is still written (it remains the bell's and the audit trail's record) — only the per-show attention surface stops rendering it. Cutting the producer is explicitly NOT in scope.

**Guard test** for §2.2: the five global codes can never produce a per-show attention item.

### 3.3 PR 3 — anchors for the asset/reel codes

Two anchors:

| Anchor | Host | Live-code note |
| --- | --- | --- |
| `diagrams` | the Diagrams sub-block under Rooms & scope | It is a level-4 SUB-block with NO `sectionId` (`step3ReviewSections.tsx:658-663`), which is exactly why the route needs an anchor rather than a section |
| `opening_reel` | the Event details field of that key | `step3ReviewSections.tsx:382` (group key), rendered `components/admin/wizard/step3ReviewSections.tsx:1839` |

Routes: `ASSET_RECOVERY_BYTES_EXCEEDED`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `EMBEDDED_ASSET_DRIFTED` → `{ sectionId: "rooms", anchor: "diagrams" }`. `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO`, `REEL_DRIFTED` → `{ sectionId: "event", anchor: "opening_reel" }`.

These render as `CompactAlertCard` (unchanged shell), so they keep their stripe, footer, and resolve affordance. The stripe is what distinguishes them from surrounding content: warning cards ship `stripe="none"` (`PerShowActionableWarnings.tsx:125`) while attention cards default to the review stripe (`CompactAlertCard.tsx:17`).

---

## 4. Final disposition of all 18 registered codes

| Code | Today | After | PR |
| --- | --- | --- | --- |
| `ONBOARDING_SHEET_UNREADABLE` | never renders (global) | unchanged | — |
| `WATCH_CHANNEL_ORPHANED` | never renders (global) | unchanged | — |
| `SYNC_STALLED` | never renders (global) | unchanged | — |
| `LIVE_ROW_CONFLICT` | never renders (global) | unchanged | — |
| `DRIVE_FETCH_FAILED` | not an alert | unchanged | — |
| `PICKER_EPOCH_RESET` | Overview card | cut from attention | 2 |
| `PARSE_ERROR_LAST_GOOD` | Overview card | `warnings` banner line + reason | 1, 2 |
| `RESYNC_QUALITY_REGRESSED` | Overview card | `warnings` banner line | 2 |
| `ASSET_RECOVERY_BYTES_EXCEEDED` | Overview card | `rooms` @ `diagrams` | 3 |
| `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` | Overview card | `rooms` @ `diagrams` | 3 |
| `EMBEDDED_ASSET_DRIFTED` | Overview card | `rooms` @ `diagrams` | 3 |
| `OPENING_REEL_PERMISSION_DENIED` | Overview card | `event` @ `opening_reel` | 3 |
| `OPENING_REEL_NOT_VIDEO` | Overview card | `event` @ `opening_reel` | 3 |
| `REEL_DRIFTED` | Overview card | `event` @ `opening_reel` | 3 |
| `SHEET_UNAVAILABLE` | Overview card | unchanged (sync) | — |
| `RESYNC_SHRINK_HELD` | Overview card | unchanged (sync; the fix is Re-sync, in the status band) | — |
| `SHOW_FIRST_PUBLISHED` | Overview card | unchanged | — |
| `SHOW_UNPUBLISHED` | Overview card | unchanged | — |

## 5. Guard conditions

| Input | Behavior |
| --- | --- |
| route names an anchor the section does not render | fall back to that section's top (§3.2) |
| section itself renders nothing (data-gated away) | fall back to Overview, preserving today's catch-all as the floor |
| `error_code` absent (row predates PR 1) | reason sentence omitted; the rest of the line renders |
| `error_code` present but uncataloged | reason sentence omitted (invariant 5: never surface a raw code) |
| `failed_codes` empty / non-array | treated as absent; `error_code` alone drives the sentence |
| `warnings.length === 0` with a parse notice routed there | empty-list copy variant; no "below" clause |
| both parse notices open simultaneously | both lines render, `PARSE_ERROR_LAST_GOOD` first (it describes what crew see; the other describes what is live) |
| archived show | unchanged from today: banners render, resolve is not lifecycle-gated (`docs/superpowers/specs/2026-07-19-published-show-alerts.md` §7 row) |

## 6. Dimensional invariants / transition inventory

**Dimensional invariants.** The banner line is a flow-layout text block inside the existing panel column: no fixed-dimension parent, no flex/grid child relationship to pin. Anchored cards mount into existing flow containers at their anchor point. NO new fixed-dimension parent is introduced by this spec, so no layout-dimensions task is required. The one adjacent fixed-dimension parent — the 22px `?` trigger — is introduced and pinned by `feat/warning-card-copy-restore` §6, not here; this spec's real-browser assertions must EXPECT 22px rather than the historical 44px box.

**Transition inventory.** Attention items appear and disappear on server-driven re-render (`router.refresh()` after a resolve, or a sync landing). Within a mounted panel the set is constant. States per section: (A) no attention, (B) section-top items, (C) anchored items, (D) both. All six pairs — A↔B, A↔C, A↔D, B↔C, B↔D, C↔D — are **instant, no animation**, matching the existing crew-route behavior, which animates none of these today. Compound: an anchor disappearing while its item is mounted (data-gate flips) resolves through the §5 fallback on the next render, instantly. The deep-link flash (`attentionJump` + `aria-current`) is unchanged and orthogonal.

## 7. Meta-test inventory

**EXTENDS** `tests/admin/_metaAttentionRoutes.test.ts` — set-equality against the registry still holds after the type widens; add anchor-validity (an anchor may only name a slot the target section declares).

**CREATES** a per-show reachability guard: for every code in `ATTENTION_ROUTES`, assert that a code whose producers all pass `showId: null` yields no attention item. This is the mechanical form of §2.2 and exists specifically because routing-table membership was misread as eligibility during scoping.

**EXTENDS** the §12.4 catalog parity surface via the two new rows (`x1-catalog-parity`, `tests/cross-cutting/codes.test.ts`).

**NOT extended:** `tests/auth/advisoryLockRpcDeadlock.test.ts` — no lock topology change (§3.1).

## 8. Test plan

- **Derivation (jsdom-free, pure):** routing for all 18 codes with expected `sectionId`/`anchor` derived from the disposition table (§4), not hardcoded mirrors; `PICKER_EPOCH_RESET` cut; unknown code still falls back to Overview.
- **Reason helper:** all eight invariant codes resolve to non-empty copy; unknown/absent/uncataloged → `null`. Anti-tautology: expected strings read from `MESSAGE_CATALOG`, never literal.
- **Producer:** the hard-fail branch writes `error_code` and capped `failed_codes`, and does NOT write `message`. The negative is the point — assert the persisted context has no free-text member.
- **Banner copy:** all three variants, keyed on `warnings.length` and reason presence; the "below" clause is absent in the empty-list variant. Scope the assertion to the banner's own testid so the list underneath cannot satisfy it.
- **Mount generalization:** crew regression (existing tests must pass untouched), plus section-top and anchored placement for a non-crew section, plus the anchor-missing fallback.
- **Real browser (Playwright):** an anchored card renders inside its anchor's container (assert DOM ancestry, not coordinates), and the `?` trigger measures 22×22 per the sibling branch's geometry.
- **Reachability guard:** §7.

## 9. Out of scope

- `dougFacingShowScoped` authoring for the 13 per-show codes — sibling spec B.
- Parse-warning card copy and the `?` trigger geometry — `feat/warning-card-copy-restore`.
- Removing the `PICKER_EPOCH_RESET` producer (only its attention rendering is cut).
- Storing or surfacing the hard-fail `message` text (§3.1, deliberate).
- Promoting Diagrams to a real `SectionId` (mockup option C, not selected).
- Any change to the bell, health panel, or global alert surfaces.
