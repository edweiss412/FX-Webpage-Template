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
| The two parse notices render as a banner LINE, not a card ("Option C"). **Nothing is lost by this**: both codes are already `resolution: "auto"` (`lib/messages/catalog.ts`), so neither has ever rendered a manual Mark-resolved button — the footer shows an auto-clear note instead. An earlier draft of this row claimed the affordance was surrendered; that was wrong (R3#4). **What IS given up, deliberately (R4#5):** the card footer's auto-clear note ("Clears automatically once the sheet is back or re-parses"). That copy exists to explain why there is no button; a line of page context raises no such question, and the corrected copy now tells the operator what to actually do, which is more useful than telling them to wait. Losing it is an accepted trade, not an oversight. Clearing paths verified: `PARSE_ERROR_LAST_GOOD` via `syncProblemCodeForStatus("parse_error")` + `resolveStaleSyncProblemAlerts_unlocked` (`lib/sync/runScheduledCronSync.ts:211`), `RESYNC_QUALITY_REGRESSED` via its own resolver (`lib/sync/runScheduledCronSync.ts:332`). | User selected option C, this session. |
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

Six already have catalog entries under the SAME name. `MI-2_EMPTY_TITLE` and `MI-3_NO_VALID_DATES` do not — but the same two invariants have operator-facing rows under DIFFERENT names (`MI-2_TITLE_MISSING`, `MI-3_NO_PARSEABLE_DATE`). §3.1 bridges that drift with an alias map rather than authoring duplicate rows.

---

## 3. Design

Three independently shippable units, sequenced so no copy is authored twice.

### 3.0 Producer registry (R1#1, R2#2)

Eligibility claims in §2.2 rest on producer completeness, which a per-code grep cannot establish: the earlier `DRIVE_FETCH_FAILED` error came from searching only the bare-function shape while the real write was a method on a tx object.

**Discovery is shape-agnostic WITHIN the named producer surface (R6#1).** Enumerating six syntactic forms would fail on a seventh (R2#2), so the walker keys on the NAME rather than the syntax: any CALLEE whose name is `upsertAdminAlert` regardless of receiver — bare identifier, `x.upsertAdminAlert`, `deps.upsertAdminAlert`, an injected local resolved from `requireTxBoundUpsertAdminAlert` — plus, in `supabase/**/*.sql`, any `upsert_admin_alert(` invocation. A new call shape is caught because the NAME is the anchor, not the syntax around it.

**Rows are per (call site × emitted code), not per call site (R2#2).** A single site can emit multiple codes (`lib/sync/applyStaged.ts` writes several through one helper), and a site whose code argument is a variable or expression cannot be classified by inspection. Each row records:

| field | meaning |
| --- | --- |
| `site` | `file:line` of the call |
| `code` | ONE literal code. A site emitting several yields several rows. A site with a non-literal code argument must enumerate its codes as separate rows; the test fails when such a site has NO rows at all (it is unregistered), but cannot tell whether an existing row set is complete — see the residual risk below |
| `scope` | `per-show` \| `global` — the scope FOR THAT CODE AT THAT SITE (R3#3). A dynamic site that passes `showId: null` with code A and a real id with code B produces two rows with different scopes, which a site-level `both` would have wrongly collapsed |

A code can legitimately be per-show at one site and global at another; that is two rows, not a `both` value. §2.2's table and §7's reachability projection read this relation, so neither can drift from the call sites.

**Residual risk, stated honestly (R4#1).** Two gaps remain, and neither is closed by claiming otherwise:

1. **Discovery is bounded by the NAME, so anything that writes `admin_alerts` without it is invisible (R6#1):** a direct `.from("admin_alerts").insert(...)`, a renamed import (`import { upsertAdminAlert as raise }`), a destructured alias (`const { upsertAdminAlert: write } = deps`), or raw SQL that does not spell `upsert_admin_alert(`. The guarantee is therefore scoped: **a new call site fails by default IF it goes through the named producer surface** — not "any new alert write anywhere". Note the class most likely to matter, a direct table write, is independently discouraged by the PostgREST DML lockdown discipline (AGENTS.md), which is a separate guard, not this one.
2. **For a site whose code argument is non-literal, the walker can detect that the site is dynamic and require it to be registered, but it cannot prove the registered code list is COMPLETE.** Adding a ninth possible code to an already-registered dynamic site is undetectable statically.

What the guard therefore does and does not promise: a NEW call site that goes through the NAMED producer surface fails by default; a site that evades the name (gap 1) and a new code from an EXISTING dynamic site (gap 2) do not. Gap 2 is bounded by enumerating every dynamic site in the plan (there are few, and each is read in full), and by a lint-level rule that a dynamic site's registry row carries the `file:line` of each branch that supplies its code, so review has a checklist. Closing it fully would need a runtime oracle over `admin_alerts.code`, which is out of scope for this feature and recorded as the honest limit rather than papered over.

### 3.1 PR 1 — capture the failure reason

**Producer.** In the hard-fail branch (`lib/sync/runScheduledCronSync.ts:3384`), extend the `PARSE_ERROR_LAST_GOOD` context with:

- `error_code: string` — ONLY if allowlisted (below); otherwise the key is omitted

`failed_codes` was specified in an earlier draft and is DROPPED (R3#5): nothing read it, so it had no product effect, no lifecycle, and no truncation/ordering semantics worth defining. Only the routed `code` is persisted. If a future surface needs the full list, it is a deliberate addition with its own consumer.

**Persistence allowlist (R1#2).** `Phase1Result.code` and `failedCodes` are typed `string`, not a union, and `code` falls back to a ninth value `PARSE_HARD_FAIL` when `failedCodes` is empty (`lib/sync/phase1.ts:395`). Type-level safety does not exist. The producer filters against a frozen allowlist AT THE PERSISTENCE BOUNDARY:

```
MI-1_VERSION_DETECTION_FAILED   MI-5_NO_ROOMS
MI-2_EMPTY_TITLE                MI-5a_DUPLICATE_CREW_NAME
MI-3_NO_VALID_DATES             MI-5b_DUPLICATE_CREW_EMAIL
MI-4_NO_CREW                    VERSION_AMBIGUOUS
```

Anything else — `PARSE_HARD_FAIL`, a future invariant code, an interpolated string — is DROPPED. `phase1.message` is never stored under any condition.

**What the `message` prohibition means, precisely (R2#10).** The existing context already carries `sheet_name`, which IS free text, so "the context contains no free-text member" is false and untestable. The actual contract, scoped precisely (R4#4): **no value derived from `phase1.message` enters the `admin_alerts` context payload**, and that payload gains exactly one new key, `error_code`. This is NOT a claim about all persistence in the transaction — §2.3 states that the message already reaches `sync_log` today, and that pre-existing behavior is untouched and out of scope. The test asserts over the alert context payload, not over everything written in the transaction. The test asserts (a) no `message`-like key exists, and (b) a recognizable sentinel injected into `phase1.message` appears nowhere in the persisted payload.

**Catalog: an alias map, NOT new §12.4 rows.** The producer spellings `MI-2_EMPTY_TITLE` / `MI-3_NO_VALID_DATES` have no catalog rows, but the SAME invariants already have operator-facing rows under different names: `MI-2_TITLE_MISSING` (`lib/messages/catalog.ts:705`) and `MI-3_NO_PARSEABLE_DATE` (`lib/messages/catalog.ts:717`). The producer spellings are the durable persisted values (`lib/messages/__generated__/internal-code-enums.ts:125`). Authoring new rows would put TWO codes in the catalog for one invariant. An alias map bridges them: **no new §12.4 rows, no three-way lockstep, no x1 parity impact.**

**Reason helper resolves through `lib/messages/lookup.ts` (R2#1 — invariant 5).** The helper does NOT read `MESSAGE_CATALOG` directly. It maps the producer code through the alias map to a `MessageCode`, then calls `messageFor(code)` (`lib/messages/lookup.ts:95`) and returns `.title`. Unknown, unaliased, or non-`MessageCode` input returns `null`. The lookup module stays the single resolution path for every user-visible code, exactly as invariant 5 requires; the alias map is a code-to-code mapping upstream of it, not a second resolver.

**The eight resolved titles, verbatim (R2#3):**

| Producer code | Catalog code | Title |
| --- | --- | --- |
| `MI-1_VERSION_DETECTION_FAILED` | same | Unrecognized show template |
| `MI-2_EMPTY_TITLE` | `MI-2_TITLE_MISSING` | Show title missing |
| `MI-3_NO_VALID_DATES` | `MI-3_NO_PARSEABLE_DATE` | No readable show dates |
| `MI-4_NO_CREW` | same | No crew rows |
| `MI-5_NO_ROOMS` | same | No rooms found |
| `MI-5a_DUPLICATE_CREW_NAME` | same | Two crew rows share a name |
| `MI-5b_DUPLICATE_CREW_EMAIL` | same | Two crew rows share an email |
| `VERSION_AMBIGUOUS` | same | Unsure which show template this is |

**Composition contract.** The reason renders as its own sentence: the title verbatim, one period appended, one space before the next sentence. No other punctuation. Worked example (state 1 of the §3.2 matrix, `MI-5b`):

> **Crew are still seeing the last good version.** Your latest changes didn't go through. Two crew rows share an email. Anything listed below is from the version crew can see, not from the change that failed.

None of the eight titles ends in punctuation, so the appended period never doubles. A test asserts the FINAL COMPOSED string for all eight titles: no em dash, no doubled period, no doubled space.

**Repeated raises: latest wins, and omission clears (R7#1).** The rendered copy says "your latest changes", so a stale reason would make it untruthful. The existing upsert already gives the required semantics, and this spec relies on them rather than adding merge logic.

`upsert_admin_alert` conflicts on `(coalesce(show_id::text,''), code) where resolved_at is null` and sets `context = ... else p_context` (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:47`). The `failedKeys` merge arm is the ONLY exception, and it applies only when `p_context ? 'failedKeys'`; `PARSE_ERROR_LAST_GOOD` never carries that key, so this producer always takes the `else` arm and the context is REPLACED WHOLE.

| Second raise | Result | Copy shown |
| --- | --- | --- |
| allowlisted A, then allowlisted B | context replaced; `error_code` = B | B's reason (latest) |
| allowlisted A, then a non-allowlisted code (e.g. `PARSE_HARD_FAIL`) | context replaced; `error_code` key ABSENT because the producer omits it | matrix state 2 or 4 (no reason sentence) |
| allowlisted A, then allowlisted A | context replaced identically | A's reason |

The omission case is the one worth stating: because the whole context is replaced, an omitted `error_code` does not leave the previous value behind. Degrading to "no reason" is correct — the app genuinely does not know the current reason — and is strictly better than displaying a superseded one.

**Tests (§8):** allowlisted A→B asserts the rendered reason is B's, and allowlisted→omitted asserts the reason sentence disappears. A single-fixture persist→render test cannot catch either, so both are explicit cases.

**End-to-end transport contract (R2#4).** The field crosses four layers; each is named so a per-layer test cannot pass while production drops it:

| Layer | Contract |
| --- | --- |
| persist | producer writes `context.error_code` (`lib/sync/runScheduledCronSync.ts:3384`) |
| read | `fetchPerShowAlerts` already selects `context` whole (`lib/adminAlerts/fetchPerShowAlerts.ts`); no column list change needed |
| derive | `deriveAttentionItems` reads `row.context.error_code`, validates it against the SAME allowlist, and carries it on `AttentionAlertPayload` as `errorCode: string \| null` (a NEW payload field; unvalidated input becomes `null`) |
| render | the parse-note renderer consumes `item.alert.errorCode`, resolves via the helper, and composes per the matrix |

**An integration test spans persist → render** with one fixture, asserting the composed sentence appears; the per-layer tests alone are insufficient and are explicitly not the proof.

**Advisory-lock topology (invariant 2) (R1#7).** The `show:` hashkey is acquired by the JS-side wrapper `withShowLock` — `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))` at `lib/db/advisoryLock.ts:58`, blocking variant `lib/db/advisoryLock.ts:66` — threaded into the cron path as a dependency (`lib/sync/runScheduledCronSync.ts:83`). The hard-fail branch runs inside `fn()` under that wrapper, and the alert write is tx-bound through `requireTxBoundUpsertAdminAlert` so it joins the same transaction. **Sole holder: the JS-side wrapper.** No in-RPC or nested SECURITY DEFINER acquisition exists for this hashkey on this path. This change adds context KEYS to an existing call inside that transaction: no new acquisition, no new holder, no nesting.

### 3.2 PR 2 — generalize the mount; move the two parse notices

**Widen the route, with section-aware anchors (R2#5).** A global anchor union would type-check `{sectionId: "crew", anchor: "diagrams"}`, which no consumer can render. Anchors are declared per section and the route is a discriminated union:

```ts
type AttentionRoute =
  | { sectionId: "rooms"; anchor?: "diagrams" }
  | { sectionId: "event"; anchor?: "opening_reel" }
  | { sectionId: Exclude<RoutedSectionId, "rooms" | "event"> }; // no anchors declared
```

An invalid pairing is a COMPILE error, and the extended `_metaAttentionRoutes` test asserts every anchor names a slot its own section declares. `availableAnchors` returns a per-section map, not a global set, so availability is checked against the section that will render it.

**The warnings section is ALWAYS available (R4#2).** Matrix states 3, 4 and 6 render notes when `warnings.length === 0`, so the notes' destination must exist in that case. It does, unconditionally: `warnings` is pushed into `renderedSectionIds` with no gate (`components/admin/review/sectionInclusion.ts:57`), and the panel renders its own empty-state line rather than unmounting (`components/admin/wizard/step3ReviewSections.tsx:2394`). The Overview fallback is therefore never exercised for the two note codes; it exists for the anchored card routes, whose sections are also unconditional today but need not stay that way.

**Resolution order (section first, then anchor) (R2#5).** Per item: section available? → no: Overview. → yes: anchor declared AND available for THAT section? → yes: `byAnchor`; no: that section's `sectionTop`. Checking the section first removes the state where an item lands in a bucket whose section has no consumer.

**Overview is terminal and always reachable:** an item routed there sets `hasAttention`, a disjunct of `overviewHasContent` (`components/admin/showpage/PublishedReviewModal.tsx:385`), so the section mounts to receive it. An item is never dropped.

**Transport type (R1#8).**

```ts
type SectionAttentionBucket = {
  sectionTop: ReactNode[];               // pre-rendered cards; opaque by design
  byCrewKey?: Map<string, ReactNode[]>;  // CREW ONLY
  byAnchor?: Map<string, ReactNode[]>;   // pre-rendered anchored cards
  notes?: NoteItem[];                    // DOMAIN items, NOT nodes (R3#1)
};
type SectionAttention = Map<RoutedSectionId, SectionAttentionBucket>;
```

**Two channels, deliberately (R3#1).** An earlier draft made every bucket member `ReactNode[]`, which cannot work: the parse-note renderer must read `alert.code`, `alert.errorCode`, and `warnings.length` to pick a copy variant, and a `ReactNode` is opaque. Cards CAN be pre-rendered by the modal because nothing downstream inspects them. Notes CANNOT, because only the warnings SECTION knows `warnings.length`. So notes travel as domain items and the section composes them; composition ownership is the section, stated once here.

**This is proved, not asserted.** The transport type drew a finding in all three review rounds, so per the AGENTS.md three-round prose cap the fourth pass is a spike rather than another paragraph: `docs/superpowers/specs/2026-07-20-attention-alert-routing-spike/transport.ts` declares the types, the ordering function, and the composition function, and COMPILES under the repo's strict tsconfig. It also encodes the PR ordering constraint — it must model `errorCode` explicitly because the field does not exist until PR 1, which is exactly the dependency PR 2 carries.

**The spike proves REJECTION, not just acceptance (R4#3).** Compiling valid examples says nothing about invalid ones, and two holes were real: the no-anchor union arm allowed an excess `anchor` property on a non-fresh value (structural typing only applies excess-property checks to fresh literals), and the note channel accepted any alert code, so `composeNote` had a silent `null` path that could drop a note. Both are closed: the no-anchor arm declares `anchor?: never`, and the note channel is narrowed to `NoteCode` with a REQUIRED payload, which makes `composeNote` total (no `null` return).

The "third code is a compile error" claim needed a mechanism, not just an assertion (R5#1): an `if (parse) {...} return {resync}` shape silently hands a third code the resync copy. `composeNote` is therefore an exhaustive `switch` whose `default` assigns `alert.code` to `never`, so widening `NoteCode` breaks at that line. FOUR `@ts-expect-error` negative cases pin the rejections — invalid section/anchor pairing, wrong anchor for a section, alert-less note item, and a non-member note code. Because an unused directive is itself a type error, the file fails if the types ever loosen enough to accept any of them.

Bucket arrays preserve `deriveAttentionItems` order (actionable before auto-clearing, then fetch order); no re-sorting. An empty bucket is NOT emitted, so a section with no items renders no wrapper element.

**Parse-note ordering is a RENDER-TIME rule, not a bucket-order assumption (R2#6).** Derivation order does not guarantee `PARSE_ERROR_LAST_GOOD` precedes `RESYNC_QUALITY_REGRESSED` — they can differ in actionability and `raised_at`. The notes renderer therefore sorts its own two-element input by an explicit fixed precedence (`PARSE_ERROR_LAST_GOOD` = 0, `RESYNC_QUALITY_REGRESSED` = 1). This is local to the notes container and does not re-sort any bucket. A test constructs the fixture with the WRONG derivation order and asserts the rendered order is still correct.

**Exhaustive rename inventory** (`crewAttention` → `sectionAttention`): producer `components/admin/showpage/PublishedReviewModal.tsx:317`; type + prop `components/admin/review/ShowReviewSurface.tsx:165`; threading `components/admin/review/ShowReviewSurface.tsx:919`; context type `components/admin/wizard/step3ReviewSections.tsx:493`; consumer `components/admin/wizard/step3ReviewSections.tsx:1274`; section-top render `components/admin/wizard/step3ReviewSections.tsx:1314`; per-row `components/admin/wizard/step3ReviewSections.tsx:1330`; fixtures `tests/components/admin/review/showReviewSurfaceAttention.test.tsx`, `tests/components/admin/review/attentionBanner.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/components/admin/compactAlertCompoundTransitions.test.tsx`, `tests/e2e/published-show-attention.spec.ts`, `tests/e2e/published-review-modal.deeplink.spec.ts`.

**Crew-preservation contract.** `showReviewSurfaceAttention.test.tsx` already asserts the crew section renders BYTE-IDENTICAL DOM when attention props are absent; that assertion is retained verbatim and is the rename's regression proof, plus an explicit in-`<li>` and section-top placement test with props present.

**Copy — the complete state matrix (R1#4).**

| # | Notice | List | Reason | Rendered line |
| --- | --- | --- | --- | --- |
| 1 | `PARSE_ERROR_LAST_GOOD` | non-empty | present | **Crew are still seeing the last good version.** Your latest changes didn't go through. `<Title>.` Anything listed below is from the version crew can see, not from the change that failed. |
| 2 | `PARSE_ERROR_LAST_GOOD` | non-empty | absent | **Crew are still seeing the last good version.** Your latest changes didn't go through. Anything listed below is from the version crew can see, not from the change that failed. |
| 3 | `PARSE_ERROR_LAST_GOOD` | empty | present | **Crew are still seeing the last good version.** Your latest changes didn't go through. `<Title>.` |
| 4 | `PARSE_ERROR_LAST_GOOD` | empty | absent | **Crew are still seeing the last good version.** Your latest changes didn't go through. |
| 5 | `RESYNC_QUALITY_REGRESSED` | non-empty | n/a | **This version is live for crew.** The latest changes lost some detail, and the problems below are what stopped reading. |
| 6 | `RESYNC_QUALITY_REGRESSED` | empty | n/a | **This version is live for crew.** The latest changes lost some detail. |

State 6 is representable because the alert (a cross-version comparison) and the list (the current parse) are computed independently. `RESYNC_QUALITY_REGRESSED` carries no reason field — that is `PARSE_ERROR_LAST_GOOD`-only — hence "n/a" rather than a third dimension.

**The banner as a rendered element (R1#9).**

- `<p data-testid="parse-attention-note-<code>">` inside `<div data-testid="parse-attention-notes">`, the FIRST child of the Parse warnings panel body, ABOVE both the list and the empty-state line (`components/admin/wizard/step3ReviewSections.tsx:2399`).
- Leading sentence `<strong>`; remainder normal weight, same paragraph.
- `text-xs/relaxed`, `text-text-subtle`; container `border-b border-border pb-2 mb-1`. No card, no stripe, no fill — the distinction from the cards below is the ABSENCE of card chrome.
- Two simultaneous notices are two `<p>` siblings in one container.

**Accessibility posture, corrected (R2#9).** The earlier rationale ("never updates in place") was false: `router.refresh()` can reconcile a changed note into a mounted panel. The decision stands on different grounds — these are page CONTEXT for content the operator has navigated to, not event announcements, and the same refresh re-renders the surrounding panel, so announcing one line would be arbitrary. No `role="alert"`, no `role="status"`, no `aria-live`. Stated as a deliberate choice with its real justification.

**Cut `PICKER_EPOCH_RESET`** from attention derivation. Its `ATTENTION_ROUTES` row REMAINS (the table is set-equal to the registry and the meta-test requires totality), so the cut lives in `deriveAttentionItems`, not the route table. The alert row is still written — it remains the bell's record and the audit trail. Cutting the producer is NOT in scope.

### 3.3 PR 3 — anchors for the asset/reel codes

| Anchor | Host | Live-code note |
| --- | --- | --- |
| `diagrams` | Diagrams sub-block under Rooms & scope | A level-4 SUB-block with NO `sectionId` (`components/admin/wizard/step3ReviewSections.tsx:658`), which is why the route needs an anchor rather than a section |
| `opening_reel` | the Event details field of that key | `components/admin/wizard/step3ReviewSections.tsx:382` (group key), rendered `components/admin/wizard/step3ReviewSections.tsx:1839` |

**Anchor availability predicates, exactly (R2#8).** Each is a pure function of the same `SectionData` the section renders from, and each is defined at its boundaries:

- `diagrams`: available iff the resolved diagram list is a non-empty array. `null`, `undefined`, and `[]` are all unavailable. (The sub-block's own render gate is the same non-empty check; a shared exported predicate is used by BOTH so they cannot disagree — the plan names the single function.)
- `opening_reel`: available iff the field's value, after the existing `stripOpeningReelText` cleanup and `trim()`, is a non-empty string. `null`, `undefined`, `""`, and whitespace-only are unavailable.

Routes: `ASSET_RECOVERY_BYTES_EXCEEDED`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `EMBEDDED_ASSET_DRIFTED` → `{ sectionId: "rooms", anchor: "diagrams" }`. `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO`, `REEL_DRIFTED` → `{ sectionId: "event", anchor: "opening_reel" }`.

These render as `CompactAlertCard` (unchanged shell), keeping stripe, footer, and resolve affordance. Warning cards ship `stripe="none"` (`components/admin/PerShowActionableWarnings.tsx:125`) while attention cards default to the review stripe (`components/admin/CompactAlertCard.tsx:17`), so the stripe distinguishes them from surrounding content.

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
| section unavailable | Overview (checked FIRST, §3.2) |
| section available, anchor declared but unavailable | that section's `sectionTop` |
| invalid section/anchor pairing | impossible: the route union makes it a compile error (§3.2) |
| Overview receives an item | `hasAttention` is true, so `overviewHasContent` mounts the section (`PublishedReviewModal.tsx:385`) — an item is never dropped |
| `error_code` absent (row predates PR 1) | states 2/4 of the §3.2 matrix; reason sentence omitted |
| `error_code` present but not allowlisted | never persisted (§3.1), so indistinguishable from absent |
| allowlisted code with no catalog row / no alias | helper returns `null`; reason sentence omitted (invariant 5: never surface a raw code) |
| `warnings.length === 0` | states 3/4/6; no "below" clause |
| both parse notices open | two `<p>` siblings, `PARSE_ERROR_LAST_GOOD` first |
| archived show | unchanged: banners render, resolve is not lifecycle-gated (`docs/superpowers/specs/2026-07-19-published-show-alerts.md` §7 row) |

## 6. Dimensional invariants / transition inventory

**Dimensional invariants.** The banner is a flow-layout `<p>` inside the existing panel column; anchored cards mount into existing flow containers. NO new fixed-dimension parent with flex/grid children is introduced, so no layout-dimensions task is required. The adjacent 22px `?` trigger is introduced and pinned by `feat/warning-card-copy-restore` §6 — see §9 for why this spec asserts nothing about it.

**Transition inventory.** Attention items appear/disappear only on server-driven re-render (`router.refresh()` after a resolve, or a sync landing); within a mounted panel the set is constant. Per-section states: (A) none, (B) section-top only, (C) anchored only, (D) both. All six pairs — A↔B, A↔C, A↔D, B↔C, B↔D, C↔D — are **instant, no animation**, matching the existing crew route, which animates none of these today. Compound: an anchor becoming unavailable while its item is mounted resolves through §5 on the next render, instantly. The deep-link flash (`attentionJump` + `aria-current`) is unchanged and orthogonal.

## 7. Meta-test inventory

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

**CREATES** `tests/adminAlerts/_metaAlertProducerScope.test.ts` — the producer-scope registry (§3.0). Discovery is shape-agnostic (any `upsertAdminAlert` callee, plus `upsert_admin_alert(` in SQL); rows are per (call site × emitted code). **A new unclassified SITE THAT GOES THROUGH THE NAMED PRODUCER SURFACE fails by default** (a renamed import, destructured alias, or direct table write evades discovery — §3.0 residual risk 1, R6#1). **A new CODE from an already-registered dynamic site does NOT** — that guarantee was withdrawn in §3.0 as statically unprovable, and this entry must not re-promise it (R5#2).

**CREATES** the reachability projection. A code is per-show-reachable iff **(a)** any producer row emitting it has scope `per-show`, AND **(b)** it is not in `HEALTH_CODES` — `fetchPerShowAlerts` filters health codes independently of scope (`lib/adminAlerts/fetchPerShowAlerts.ts:17`), so a scope-only equation would call a per-show-produced health code reachable when it is not (R3#2). Both conjuncts are required to reproduce the §2.2 set. Derived from the registry relation, never hand-listed, so `DRIVE_FETCH_FAILED` cannot be wrongly excluded (a hand-listed five-code version would encode the very error this exists to prevent).

**EXTENDS** `tests/admin/_metaAttentionRoutes.test.ts` — set-equality against the registry still holds after the type widens; adds anchor-validity: every anchor names a slot ITS OWN section declares (§3.2's discriminated union makes the invalid pairing a compile error; the test is the runtime backstop for the route table).

**NOT extended:** `tests/auth/advisoryLockRpcDeadlock.test.ts` — no lock topology change (§3.1, evidenced).

**No §12.4 / x1-catalog-parity impact** — the alias map replaces new catalog rows (§3.1).

## 8. Test plan

Each entry names the concrete failure it catches.

- **Producer scope (§3.0).** Catches: a new alert-write call site added without declaring its scope, in any call SHAPE, provided it calls the producer by name. Does NOT catch a renamed import, destructured alias, or direct table write (§3.0 residual risk 1). Does NOT catch a new code emitted from an already-registered dynamic site — §3.0's stated residual risk, bounded by plan-time enumeration rather than by this test (R5#2). This is the test that would have caught the `DRIVE_FETCH_FAILED` error.
- **Routing.** Expected `sectionId`/`anchor` per code come from a FROZEN FIXTURE transcribed from the §4 table (the project's established pattern — the sibling warning-card spec freezes its copy table the same way). Deriving them from `ATTENTION_ROUTES` would be tautological; the fixture is an independent oracle whose diff is reviewed. Catches: a route silently changed without a spec edit.
- **Reason allowlist.** Catches: `PARSE_HARD_FAIL`, an unknown future code, or an interpolated/sensitive string reaching the persisted context. Feeds each explicitly and asserts absence.
- **Transport spike parity.** The shipped types match the spike's shape (`docs/superpowers/specs/2026-07-20-attention-alert-routing-spike/transport.ts`). Catches: the notes channel silently collapsing back into `ReactNode[]`, which is the R3#1 defect.
- **`phase1.message` never persisted.** Catches: a future "helpful" addition of the free-text field. A recognizable sentinel is injected into `phase1.message` and asserted absent from the whole persisted payload. NOT "no free-text member" — `sheet_name` is already free text and legitimately stays (R2#10).
- **Reason helper.** All eight allowlisted codes resolve to non-empty copy through the alias map + `messageFor` (`lib/messages/lookup.ts:95`); unknown/unaliased/uncataloged → `null`. A structural assertion pins that the helper module does NOT import `MESSAGE_CATALOG` directly (invariant 5, R2#1). Expected strings are the eight titles frozen in §3.1, so the test proves the ALIAS and the composition are right rather than that the catalog equals itself.
- **Composed copy.** All six §3.2 states assert the FINAL rendered string, scoped to the banner's own testid so the list below cannot satisfy it. Includes the no-em-dash assertion over the composed output for all eight titles. Catches: a "below" clause surviving into an empty-list state, and a catalog title introducing a banned character.
- **`PICKER_EPOCH_RESET` exclusion.** Its `ATTENTION_ROUTES` row still exists (totality), so the routing fixture cannot prove the cut. A dedicated test feeds a `PICKER_EPOCH_RESET` alert row to `deriveAttentionItems` and asserts NO item is produced, and a second asserts the header pill count is unchanged by its presence (the §1.1 "unaffected" claim). Catches: the cut regressing, or the count double-subtracting.
- **Crew preservation.** The existing byte-identity assertion is retained verbatim; plus in-`<li>` and section-top placement with props present. Catches: the rename regressing crew placement.
- **Note ordering.** Fixture built in the WRONG derivation order; asserts the rendered order is still `PARSE_ERROR_LAST_GOOD` first. Catches: reliance on incidental derivation order (§3.2).
- **Anchor fallback.** Anchor unavailable → section top; section unavailable → Overview. Catches: an item silently dropped when a data-gated sub-block does not render.
- **Repeated raises (§3.1, R7#1).** Two cases beyond the single-fixture test: allowlisted A→B asserts the LATEST reason renders (not the first), and allowlisted→non-allowlisted asserts the reason sentence disappears rather than going stale. Catches: a merge-style context write, or a producer that preserves a superseded `error_code` under copy that says "latest".
- **End-to-end reason transport (§3.1).** One fixture driven persist -> read -> derive -> render, asserting the composed sentence reaches the DOM. Catches: the field being dropped between layers while every per-layer test passes.
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
