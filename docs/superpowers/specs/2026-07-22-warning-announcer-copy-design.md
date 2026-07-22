# Warning-panel announcer + elsewhere-copy polish — design

**Date:** 2026-07-22
**Status:** Draft, revised after adversarial round 1 (owner decisions ratified
2026-07-22 in-session; R1 triage log in §8)
**Scope:** the published Parse-warnings panel's screen-reader live region and the
"warnings are elsewhere" pointer sentence. Resolves the four open
warning-panel-polish critique deferrals (DEFERRED.md:69-91).

---

## 1. Problem

Four findings deferred from the 2026-07-22 warning-panel-polish impeccable
critique (dispositions:
`docs/superpowers/plans/2026-07-22-warning-panel-polish/handoff.md` §12):

1. **[P2] Bulk ignore produces two polite announcements in one refresh.** The
   bulk chip's own `role="status"` (`components/admin/BulkIgnoreControls.tsx:175`)
   and the panel's count-tuple live region
   (`components/admin/review/ShowReviewSurface.tsx:1116`) both change on the same
   server round trip.
2. **[P2] The live region announces background count changes.** `role="status"`
   speaks on ANY text change, including a realtime refresh (#505) altering
   counts mid-task.
3. **[P3] The elsewhere sentence opens with an apology before the action.**
   "Nothing else to note here." precedes the tappable pointer
   (`components/admin/wizard/step3ReviewSections.tsx:2604` and
   `components/admin/wizard/step3ReviewSections.tsx:2635`).
4. **[P3] "and N more." is a dead end.** Non-interactive overflow clause
   (`components/admin/wizard/step3ReviewSections.tsx:712-719`,
   `POINTER_NAME_CAP = 3` at `step3ReviewSections.tsx:708`).

## 1.1 Resolved scope — do not relitigate

Owner decisions ratified 2026-07-22 (this session, mockup-backed A/B choice):

1. **Announcer is ACTIONS-only.** The DEFERRED.md:77-82 un-defer trigger ("an
   owner decision on whether the panel's live region reports STATE or only
   Doug-initiated ACTIONS") has FIRED: owner chose ACTIONS. Background realtime
   count changes stay silent, matching the sighted experience. Hybrid
   (debounced background summary) was offered and REJECTED as YAGNI.
2. **One merged completion message.** The DEFERRED.md:69-75 trigger ("an
   accessibility pass composing the modal's live regions") is this pass. The
   bulk chip's armed prompt "Tap again to confirm." STAYS (arming is itself a
   Doug action; its completion-clearing writes empty text, which `role="status"`
   does not announce). Only the completion announcement is composed into a
   single panel-region message.
3. **Pointer-first word order.** Owner re-opened and re-ratified the polish-spec
   §3.5 copy (DEFERRED.md:84-86): the pointer clause leads, "Nothing else to
   note here." trails, in BOTH the named branch and the all-miss/no-chrome
   fallback.
4. **Tap-to-reveal overflow.** Owner chose to make the "and N more." clause a
   tappable reveal (DEFERRED.md:88-91). The label-miss un-defer trigger has NOT
   fired — the defensive label-miss fold is UNCHANGED in semantics AND in
   rendering (any `missCount > 0` keeps the clause plain; see §4.2). Only
   pure over-cap resolved names become revealable. "Name them all, always"
   (cap removal) was offered and rejected.
5. **Dashboard `UnignoreButton` is out of scope.**
   `components/admin/Dashboard.tsx:864` mounts it in the dashboard table, not
   inside `ShowReviewSurface`; the modal is closed when it is used, so it has no
   announcer to feed. No change.
6. **The staged wizard surface is unchanged.** The live region is
   published-only, gated on `routedWarningsRenderElsewhere`
   (`ShowReviewSurface.tsx:1115`, precondition pair at
   `ShowReviewSurface.tsx:246-252`); the wizard passes neither `routedWarnings`
   nor `renderSectionExtras` (`ShowReviewSurface.tsx:193-197`). The pointer
   sentence (§3, §4) renders through the shared `step3ReviewSections.tsx`
   registry, but the elsewhere branch is tied to the same precondition pair
   (`step3ReviewSections.tsx:522`), so today it renders only on the published
   modal.
7. **The remaining six warning-surface-trim parks (DEFERRED.md:102-137) are
   untouched** — each carries its own 2026-07-21 owner re-confirmation.
8. **Ratified amendment: the count-tuple sentence is RETIRED, not recomposed.**
   The polish spec's §3.2 count-tuple region (implemented as
   `warningsPanelStatusSentence`, `lib/admin/warningsPanelStatus.ts:7`) is
   superseded by the clause-only announcer in §2. The decision mockup showed a
   composed message ("3 ignored. 1 warning needs a look below."); R1 finding 1
   (§8) established that ANY composition of action clause + refreshed counts is
   causally untied to the action under the panel's three concurrent refresh
   sources (action `router.refresh()`, #505 realtime refresh, overlapping
   actions) and cannot be made race-free in prose. The ratified substance —
   actions-only, exactly one message per action — is preserved; the count
   suffix is dropped. Counts stay fully visible on the panel itself, which the
   screen-reader user can read on demand; the previous always-current spoken
   tuple was itself the STATE behavior the owner rejected in item 1.

---

## 2. Announcer: announce-at-arm, clause-only

### 2.1 Current behavior

`ShowReviewSurface.tsx:1115-1123` renders an always-mounted sr-only
`role="status"` span (`data-testid="warnings-panel-status"`) whose text is
DERIVED per render: `warningsPanelStatusSentence(listed, here, elsewhere)`
(`lib/admin/warningsPanelStatus.ts:7`). Any props change that alters the tuple
— Doug's action or a background refresh — changes the text and speaks.

### 2.2 New behavior

The region announces a producer-supplied clause AT THE MOMENT the mutation's
success branch runs. No refresh observation, no count capture, no state
machine: the message content and its timing are both independent of when
`router.refresh()` or a realtime refresh lands. This is the structural answer
to R1 finding 1 — there is no ordering to get wrong.

- **New module** (created by this spec) in `components/admin/review/`, named
  `warningAnnounceContext` (a TypeScript file), exporting
  `WarningAnnounceContext` with value `{ announce(message: string): void }` and
  default value `{ announce: () => {} }` (no-op — a control mounted outside the
  provider announces nothing and never throws).
- **Provider** in `ShowReviewSurface`, wrapping the section-render subtree that
  contains `renderSectionExtras` output (the ignore controls all mount there:
  `components/admin/showpage/sectionWarningExtras.tsx:109` and
  `components/admin/showpage/sectionWarningExtras.tsx:237` via
  `PublishedReviewModal.tsx:258` and `PublishedReviewModal.tsx:908`). Provided
  only on the published surface (same `routedWarningsRenderElsewhere` gate as
  the region itself); on the wizard the default no-op context is in effect.
- **Alternating dual-slot region.** The current single span becomes a container
  span (keeping `data-testid="warnings-panel-status"`) holding TWO sr-only
  `role="status"` child spans (slot 0, slot 1), both always mounted. State is
  `{ seq: number, message: string }` (initial `{ seq: -1, message: "" }`; both
  slots render empty). `announce(message)` increments `seq` and stores the
  message; slot `seq % 2` renders the message, the other slot renders `""`.
  - Why two slots: `role="status"` speaks on text CHANGE, and a screen reader
    is not required to re-announce identical text (R1 finding 2). Two
    successive identical clauses ("Warning ignored." twice) land in alternating
    slots, so the written slot always transitions empty → message — a real text
    change every time. The slot being cleared transitions message → empty,
    which announces nothing (same empty-clear silence the shipped bulk chip
    already relies on, `BulkIgnoreControls.tsx:173-177`).
  - No timers, no `requestAnimationFrame`, no double-render tricks — one state
    write per announcement, jsdom-safe.
- **Background refresh:** props change, counts change, but the slot state is
  untouched — the region's text nodes are not a function of props. Silence, by
  construction rather than by suppression.
- **Overlapping actions:** each success branch announces its own clause in
  order; alternation guarantees each is a fresh text change. Two actions =
  two announcements, each accurate for its own action.
- **Failure paths:** never announce — errors already surface assertively
  (`role="alert"`: `BulkIgnoreControls.tsx:183`; error state copy in
  `DataQualityWarningControls.tsx:39-41` and `DataQualityWarningControls.tsx:57`).

### 2.3 Clause producers (pinned strings)

| Producer | Success branch | Full announced message |
| --- | --- | --- |
| `DataQualityWarningControls` ignore (`components/admin/DataQualityWarningControls.tsx:55-57`, `mode === "active"`) | `res.ok && json.status === "ignored"` | `"Warning ignored."` |
| `DataQualityWarningControls` un-ignore (same file, `mode === "ignored"`) | `res.ok && json.status === "unignored"` | `"Warning restored."` |
| `BulkIgnoreControls` (`components/admin/BulkIgnoreControls.tsx:89-106`) | success branch before `router.refresh()` | `"1 ignored."` / `"${n} ignored."` (n = the group's item count sent in the request; see §8 F6 for the cardinality disposition) |

Each producer calls `announce(message)` on its success branch, immediately
before its existing `router.refresh()`. The message IS the full announcement —
no suffix is appended (§1.1 item 8).

### 2.4 Retirement

`lib/admin/warningsPanelStatus.ts` and its unit test
`tests/admin/warningsPanelStatus.test.ts` are DELETED. The region was the sole
consumer (verified by repo-wide grep this session: the only non-test import is
`ShowReviewSurface.tsx:45`). The §3.4 four-row visible empty-state matrix and
all visible panel copy are untouched — only the sr-only sentence retires.

### 2.5 Guard conditions

- `announce` with empty/whitespace message → no-op (defensive; producers pin
  non-empty strings).
- Controls mounted with no provider (wizard, standalone harnesses) → default
  no-op context; nothing renders, nothing throws.
- Modal unmount → slot state discarded; region remounts empty. No announcement
  leaks across mounts.
- The always-mounted contract carries over to the container AND both slots:
  same testid on the container, nodes survive Silent-state chrome suppression
  (`ShowReviewSurface.tsx:1109-1114` comment block still holds — a live region
  must exist before its content changes for `role="status"` to speak).

### 2.6 Transition inventory (per slot)

| Transition | Treatment |
| --- | --- |
| empty → message (written slot) | instant sr-only text swap — deliberate, no visual (polish spec §11 precedent) |
| message → empty (cleared slot) | instant; announces nothing (empty text) |
| message → different message (same slot, two announcements apart) | instant; ordinary text change |
| message → identical message (same slot) | cannot occur: consecutive announcements always target alternate slots |

Compound: announcement during a background refresh commit — independent state,
both apply cleanly in one commit; the slot text change is the only live-region
mutation. No animation anywhere — sr-only.

---

## 3. Elsewhere sentence: pointer first

Both branches of the elsewhere row (`step3ReviewSections.tsx:2588-2652`) flip
their clause order. Pinned strings:

- **Named branch** (`step3ReviewSections.tsx:2634-2650`): parts open with
  `"The warnings that need a look are in "`, then the name list (grammar
  unchanged from polish §8.6: "A." / "A and B." / "A, B, and C." /
  comma-separated + terminal overflow clause), then the terminal period, then
  `" Nothing else to note here."`.
  - Example: `The warnings that need a look are in Hotels and Rooms & scope.
    Nothing else to note here.`
- **All-miss / no-chrome fallback** (`step3ReviewSections.tsx:2604`):
  `"The warnings that need a look are in their own sections. Nothing else to
  note here."`

No other copy on the panel changes. The clean row (`"Nothing needs a look on
this sheet."`, `step3ReviewSections.tsx:2655-2661`) and the empty row
(`"No parse warnings for this sheet."`) are untouched.

---

## 4. Overflow: tap to reveal (pure over-cap only)

### 4.1 Data

`pointerSentenceParts` (`step3ReviewSections.tsx:712-719`) changes shape:

```ts
{ named, extra, missCount }
// named:     first POINTER_NAME_CAP resolved targets (unchanged)
// extra:     resolved targets beyond the cap (new; previously discarded)
// missCount: totalSections - resolved targets length (label misses only)
```

Collapsed overflow count N = `extra.length + missCount` — numerically identical
to today's unified rule (polish spec §8.6: N = missed + over-cap), so every
collapsed pinned string from the polish spec is unchanged except for word order
(§3). `POINTER_NAME_CAP = 3` is unchanged.

### 4.2 Collapsed state

The `"N more"` clause renders as a tappable reveal button IFF ALL of:

- the jump callback is present (same guard that makes names buttons,
  `step3ReviewSections.tsx:2631-2634`), AND
- `extra.length > 0`, AND
- `missCount === 0`.

In that case the button carries the same inline text-button treatment and
centered tap-floor overlay class string as the section-name buttons
(`step3ReviewSections.tsx:2624-2630` — the `before:` overlay with
`min-w/h-tap-min`, `z-10`), plus `aria-label` `"Show N more sections"` where N
is the visible count (equal to `extra.length`, since `missCount === 0` here —
the accessible name never promises more than the reveal delivers; R1 findings
3–4). Collapsed example (5 resolved sections):
`The warnings that need a look are in Hotels, Rooms & scope, Crew, and 2 more.
Nothing else to note here.` — only "2 more" is tappable.

In EVERY other overflow case — callback absent, OR `missCount > 0` (with or
without `extra`) — the clause renders plain and non-interactive, exactly
today's rendering. The defensive label-miss path (no live producer; handoff
§12: "every elsewhere section is a rendered registry section") therefore never
grows an interactive control, and no button can promise sections it cannot
reveal.

### 4.3 Expanded state

Tapping the reveal button replaces it in place:

- The sentence re-renders as the FULL resolved list — the polish §8.6 grammar
  applied to `named.length + extra.length` names, terminal period, then the
  trailing `" Nothing else to note here."`. Pinned example (5 resolved):
  `The warnings that need a look are in Hotels, Rooms & scope, Crew, Contacts,
  and Schedule. Nothing else to note here.` — every name tappable. No residual
  "more" clause can occur (the button exists only when `missCount === 0`).
- Focus moves to the first revealed name button (the reveal button unmounts;
  without an explicit move, focus would drop to `<body>`).
- One-way per mount: no collapse control. Local `useState`; resets on remount.

### 4.4 Dimensional Invariants

None new: the reveal button reuses the exact inline-button class recipe already
shipped for name buttons, including the raised `z-10` tap-floor overlay whose
hit-zone disjointness argument (`step3ReviewSections.tsx:2620-2629` comment) is
unchanged — the sentence remains the panel's only body content in the elsewhere
state, and adjacent inline buttons were already possible (3 named). No
fixed-dimension parent is introduced.

---

## 5. Tests (TDD; per-task failing-test-first)

Harness note: published-surface RTL fixtures come from
`tests/helpers/publishedSurfaceProps.tsx` (created by the polish bundle,
handoff table row 4). `router.refresh()` in jsdom follows the existing mocked
`useRouter` patterns in the controls' tests.

1. **Announcer unit** (rewrite of
   `tests/components/admin/review/warningsPanelStatusMount.test.tsx`):
   - Mount published surface → container and both slots present, all empty.
     *Catches: mount-time announcement; missing always-mounted nodes.*
   - Rerender with changed count props, no announce → every slot still empty.
     *Catches: regression to derived text — a derived implementation cannot
     pass.*
   - `announce("Warning ignored.")` → exactly one slot contains exactly that
     string; the write happens in a single commit (assert immediately after
     the announcing `act()`, then assert unchanged across a subsequent
     changed-props rerender). *Catches: refresh-coupled announcement (R1 F1);
     multi-commit intermediate writes (R1 F8).*
   - `announce` twice with the IDENTICAL string → the two writes land in
     ALTERNATE slots (slot A then slot B), the previously-written slot now
     empty. *Catches: identical-text non-announcement (R1 F2).*
   - Empty-string announce → no slot changes.
   - Wizard-mode mount (no `routedWarnings`/`renderSectionExtras`) → container
     absent (contract carried over from the current
     `warningsPanelStatusMount.test.tsx:75` assertion).
2. **Producer integration** (controls-level RTL, mocked fetch + router,
   provider wrapping the control under test with a recording `announce` spy):
   - `DataQualityWarningControls` success (each mode) announces the pinned
     clause exactly once; failure and thrown-fetch paths announce nothing.
   - `BulkIgnoreControls` success announces `"${n} ignored."` with n derived
     from the fixture group's item count (not hardcoded); the chip's own status
     region contains `""` on the success path both before and after refresh
     (assert its textContent never becomes non-empty across the flow).
     *Catches: the original double-announcement.*
3. **Copy reorder** (`tests/components/admin/wizard/pointerSentence.test.tsx`):
   every pinned string in the §8.6 matrix updated to pointer-first with
   trailing reassurance, still asserted as FULL textContent equality
   (1/2/3 names, first overflow, miss folds, all-miss fallback, no-callback
   bold-only).
4. **Reveal** (same test file). Boundary matrix — each row a distinct fixture,
   expected values derived from the fixture's section count (R1 F9):
   | extra | missCount | callback | expected |
   | --- | --- | --- | --- |
   | 2 | 0 | yes | button, aria-label "Show 2 more sections" |
   | 2 | 0 | no | plain clause, no button |
   | 0 | 1 | yes | plain clause, no button |
   | 1 | 1 | yes | plain clause ("and 2 more."), no button |
   - Tap (row 1) → expanded pinned sentence; every revealed name fires the
     jump callback with its `SectionId`; focus is on the first revealed button
     (async assertion wrapped in `waitFor` — jsdom focus timing).
5. **e2e** (existing published-modal harness,
   `tests/e2e/warning-panel-polish.spec.ts` — the file already reads the
   region at line 112):
   - Region container is empty on load; after a real ignore round trip its
     textContent equals the pinned clause.
   - Reveal tap: pre-click guard that the target section is NOT at the aligned
     scroll position, tap a revealed name, assert alignment (same shape as the
     polish spec's pointer-link e2e), hydration-gated, detach-safe.

Meta-test inventory: none applies — no new mutation surface (producers reuse
existing API routes), no Supabase call sites, no alert codes, no §12.4 rows, no
tile sentinel copy. The mutation-surface observability walker
(`tests/log/_metaMutationSurfaceObservability.test.ts`) sees no new files.

---

## 6. Files touched

- new module `warningAnnounceContext` (TypeScript file) in
  `components/admin/review/`
- `components/admin/review/ShowReviewSurface.tsx` (provider + dual-slot region)
- `components/admin/DataQualityWarningControls.tsx` (announce on success)
- `components/admin/BulkIgnoreControls.tsx` (announce on success)
- `components/admin/wizard/step3ReviewSections.tsx` (§3 word order, §4 reveal,
  `pointerSentenceParts` shape)
- DELETED: `lib/admin/warningsPanelStatus.ts`,
  `tests/admin/warningsPanelStatus.test.ts` (§2.4)
- `tests/components/admin/review/warningsPanelStatusMount.test.tsx` (rewrite to
  slot contract)
- `tests/components/admin/wizard/pointerSentence.test.tsx` (pinned-string
  updates + reveal matrix)
- controls tests (producer integration)
- `tests/e2e/warning-panel-polish.spec.ts` (announcer + reveal)
- `DEFERRED.md` (graduate the four entries to `DEFERRED-archive.md`)

## 7. Out of scope

- Dashboard `UnignoreButton` (§1.1 item 5).
- The six warning-surface-trim parks (§1.1 item 7).
- Hybrid/debounced background announcements (§1.1 item 1).
- Any change to the §3.4 four-row matrix of visible empty states or any other
  visible panel copy beyond §3.

---

## 8. Adversarial round 1 triage log

Inlined no-tools Codex review, 2026-07-22, VERDICT: NEEDS-ATTENTION,
10 findings. Recorded per the refuted-claims discipline so later rounds do not
re-derive them.

- **F1 (P1, races) — FIXED STRUCTURALLY.** The tuple-diff arm/announce machine
  had five real orderings that stranded or misattributed announcements. Rather
  than patch the machine in prose (the exact anti-pattern the repo's
  empirical-spike rule names), §2.2 removes the machine: announce-at-arm,
  clause-only, no refresh observation. Every enumerated ordering is moot —
  message content and timing no longer depend on any refresh.
- **F2 (P1, identical text) — FIXED STRUCTURALLY.** Alternating dual slots
  (§2.2): every announcement is an empty→message transition.
- **F3/F4 (P1, dead/misleading reveal button) — FIXED.** §4.2: button only
  when `extra.length > 0 && missCount === 0`; any miss keeps the clause plain.
- **F5 (P2, expanded grammar punctuation) — FIXED / MOOT.** The mixed
  expansion case no longer exists; §4.3 pins the full expanded sentence.
- **F6 (P2, bulk cardinality) — ACCEPTED, no change.** The clause reports
  request cardinality (n items sent). The visible UI shares exactly this
  framing — the chip Doug taps says "Ignore all N"
  (`BulkIgnoreControls.tsx:139-143`) — and the ignore API exposes no
  newly-transitioned count in its response for the client to report instead.
  Announcing the request cardinality is parity with what sighted users see,
  which is the ratified standard of §1.1 item 1. Un-defer trigger: the API
  response gaining a mutation-count field.
- **F7 (P1, tests omit races) — MOOT + STRENGTHENED.** The race surface is
  gone (F1); §5.1 now pins the properties that make it gone: single-commit
  announcement independent of refresh, slot alternation, derived-text
  regression guard.
- **F8 (P2, final-state assertions) — FIXED.** §5.1/§5.2 assert at each commit
  boundary (immediately post-announce, then across a subsequent refresh
  rerender), and the chip region is asserted empty across the whole success
  flow, not just at the end.
- **F9 (P2, missing boundary fixture) — FIXED.** §5.4 boundary matrix includes
  `extra === 0 && missCount > 0` and the mixed row, both with callback present.
- **F10 (P2, AT behavior unverifiable in RTL/e2e) — ACCEPTED with mitigation.**
  DOM-level tests cannot prove utterances; the design therefore avoids relying
  on AT edge behavior where it can (alternation removes the identical-text
  assumption entirely; the only remaining assumption is empty-clear silence,
  which the shipped bulk chip has relied on since the polish bundle). The
  impeccable audit's a11y dimension covers the surface pre-merge, and a manual
  VoiceOver spot-check of ignore/bulk-ignore/reveal is part of the
  implementation plan's verification step.
