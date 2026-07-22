# Warning-panel announcer + elsewhere-copy polish — design

**Date:** 2026-07-22
**Status:** Draft (owner decisions ratified 2026-07-22 in-session)
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
   (`components/admin/wizard/step3ReviewSections.tsx:2604` and `components/admin/wizard/step3ReviewSections.tsx:2635`).
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
   fired — the defensive label-miss fold is UNCHANGED in semantics (misses stay
   folded, even after reveal; see §4.3). Only over-cap resolved names become
   revealable. "Name them all, always" (cap removal) was offered and rejected.
5. **Dashboard `UnignoreButton` is out of scope.**
   `components/admin/Dashboard.tsx:864` mounts it in the dashboard table, not
   inside `ShowReviewSurface`; the modal is closed when it is used, so it has no
   announcer to feed. No change.
6. **The staged wizard surface is unchanged.** The live region is
   published-only, gated on `routedWarningsRenderElsewhere`
   (`ShowReviewSurface.tsx:1115`, precondition pair at
   `ShowReviewSurface.tsx:246-252`); the wizard passes neither `routedWarnings`
   nor `renderSectionExtras` (`ShowReviewSurface.tsx:193-197`). The pointer
   sentence (§3, §4) renders on both surfaces through the shared
   `step3ReviewSections.tsx` registry — copy and reveal changes apply wherever
   the elsewhere state renders, which today is the published modal (the wizard
   never sets `routedWarningsRenderElsewhere`; `step3ReviewSections.tsx:522`
   ties the elsewhere branch to the same precondition pair).
7. **The remaining six warning-surface-trim parks (DEFERRED.md:102-137) are
   untouched** — each carries its own 2026-07-21 owner re-confirmation.

---

## 2. Announcer: actions-only via imperative arm

### 2.1 Current behavior

`ShowReviewSurface.tsx:1115-1123` renders an always-mounted sr-only
`role="status"` span (`data-testid="warnings-panel-status"`) whose text is
DERIVED per render: `warningsPanelStatusSentence(listed, here, elsewhere)`
(`lib/admin/warningsPanelStatus.ts:7`). Any props change that alters the tuple
— Doug's action or a background refresh — changes the text and speaks.

### 2.2 New behavior

The span's text becomes React STATE, written only when a Doug-initiated
mutation completes. Mechanism:

- **New module** (created by this spec) in `components/admin/review/`, named `warningAnnounceContext` (a TypeScript file), exporting
  `WarningAnnounceContext` with value `{ armAnnounce(clause: string): void }`
  and default value `{ armAnnounce: () => {} }` (no-op — a control mounted
  outside the provider announces nothing and never throws).
- **Provider** in `ShowReviewSurface`, wrapping the section-render subtree that
  contains `renderSectionExtras` output (the ignore controls all mount there:
  `components/admin/showpage/sectionWarningExtras.tsx:109` and `components/admin/showpage/sectionWarningExtras.tsx:237` via
  `PublishedReviewModal.tsx:258` and `PublishedReviewModal.tsx:908`). Mounted only on the published surface
  (same `routedWarningsRenderElsewhere` gate as the region itself); on the
  wizard the default no-op context is in effect.
- **State machine** (all state local to `ShowReviewSurface`):
  - `idle` — region text is whatever was last announced (initially `""`).
  - `armed(clause)` — entered by `armAnnounce(clause)`. Re-arming while armed
    OVERWRITES the clause (rapid successive actions: last clause wins; the
    eventual announcement carries the freshest counts, so nothing is lost that
    the visible panel shows).
  - On any commit where the count tuple `(listed, here, elsewhere)` differs
    from the tuple captured at arm time, an effect composes
    `clause + " " + warningsPanelStatusSentence(listed, here, elsewhere)`,
    writes it to the region state, and disarms.
  - Tuple source, unchanged from today: `visibleWarningRows(data.warnings,
    true).length`, `routedWarnings?.here ?? 0`, `routedWarnings?.elsewhere ?? 0`
    (`ShowReviewSurface.tsx:1118-1121`).
  - Soundness: every ignore/un-ignore transition changes the tuple — that is
    the documented reason the sentence is a function of the FULL tuple
    (`lib/admin/warningsPanelStatus.ts:3-6`) — so an armed action always gets
    its announcement after `router.refresh()` lands.
- **Background refresh with no arm:** props change, tuple changes, but no
  effect writes the region — text is untouched, screen reader stays silent.
- **Background refresh WHILE armed** (lands between fetch-ok and the action's
  own refresh): the tuple change triggers the announcement early, with counts
  that already include Doug's committed action (the server state is the same
  one his refresh will fetch). Accepted; spec'd as correct.

### 2.3 Clause producers (pinned strings)

| Producer | Success branch | Clause |
| --- | --- | --- |
| `DataQualityWarningControls` ignore (`components/admin/DataQualityWarningControls.tsx:55-57`, `mode === "active"`) | `res.ok && json.status === "ignored"` | `"Warning ignored."` |
| `DataQualityWarningControls` un-ignore (same file, `mode === "ignored"`) | `res.ok && json.status === "unignored"` | `"Warning restored."` |
| `BulkIgnoreControls` (`components/admin/BulkIgnoreControls.tsx:89-106`) | success branch before `router.refresh()` | `"1 ignored."` / `"${n} ignored."` (n = the group's item count sent in the request) |

Each producer calls `armAnnounce(clause)` on its success branch, immediately
before its existing `router.refresh()`. Failure branches never arm — errors
already surface visually and assertively (`role="alert"`:
`BulkIgnoreControls.tsx:183`; error state copy in
`DataQualityWarningControls.tsx:39-41` and `DataQualityWarningControls.tsx:57`).

Example full announcement after a 3-item bulk ignore that leaves 2 listed rows
and 1 routed-here card: `"3 ignored. 2 warnings listed. 1 warning needs a look
below."`

### 2.4 Guard conditions

- `armAnnounce` with empty/whitespace clause → no-op (defensive; producers pin
  non-empty strings).
- Controls mounted with no provider (wizard, standalone harnesses) → default
  no-op context; nothing renders, nothing throws.
- Modal unmount while armed → state discarded with the component; no
  announcement leaks to a later mount (region remounts with `""`).
- The always-mounted contract of the span is UNCHANGED: same testid, same
  `role="status"`, same survival across Silent-state chrome suppression
  (`ShowReviewSurface.tsx:1109-1114` comment block still holds — the node must
  exist before the announcement for `role="status"` to speak).

### 2.5 Transition inventory (region text)

States: `empty`, `messageA`, `messageB` (successive announcements).

| Transition | Treatment |
| --- | --- |
| empty → messageA | instant sr-only text swap — deliberate, no visual (polish spec §11 precedent) |
| messageA → messageB | instant text swap |
| messageA → messageA (identical text re-announcement) | cannot occur: disarm-on-announce means a second announcement requires a new arm AND a new tuple change; if the composed string were somehow identical, `role="status"` would not re-speak identical text — accepted |
| any → empty | only via unmount/remount |

Compound: re-arm while armed = clause overwrite (§2.2); background tuple change
while armed = early announcement (§2.2). No animation anywhere — sr-only.

---

## 3. Elsewhere sentence: pointer first

Both branches of the elsewhere row (`step3ReviewSections.tsx:2588-2652`) flip
their clause order. Pinned strings:

- **Named branch** (`step3ReviewSections.tsx:2634-2650`): parts open with
  `"The warnings that need a look are in "`, then the name list (grammar
  unchanged from polish §8.6: "A." / "A and B." / "A, B, and C." /
  comma-separated + terminal overflow clause), then `"."`, then
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

## 4. Overflow: tap to reveal

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

When N > 0 AND the jump callback is present, `"N more"` renders as a button
(not plain text): same inline text-button treatment and centered tap-floor
overlay class string as the section-name buttons
(`step3ReviewSections.tsx:2624-2630` — the `before:` overlay with
`min-w/h-tap-min`, `z-10`), plus `aria-label="Show N more sections"`. The
sentence reads `…are in Hotels, Rooms & scope, Crew, and 2 more. Nothing else
to note here.` with only "2 more" tappable in the terminal clause.

When the jump callback is ABSENT (legacy/no-chrome mounts — the same guard that
renders names as plain `<strong>`, `step3ReviewSections.tsx:2631-2634`), the
overflow clause stays plain text exactly as today. No new interactive element
appears on a mount that has none.

### 4.3 Expanded state

Tapping the reveal button replaces it in place:

- All `extra` targets render as tappable name buttons appended to the named
  list with the standard grammar (the full resolved list reads "A, B, C, D, and
  E." — the polish §8.6 grammar applied to `named.length + extra.length`
  names).
- `missCount > 0` → the terminal clause `", and M more."` (M = `missCount`)
  remains, PLAIN and non-interactive — label misses have no label to reveal and
  no live producer (handoff §12: "every elsewhere section is a rendered
  registry section"); the defensive fold's semantics are unchanged.
- Focus moves to the first revealed name button (the reveal button unmounts;
  without an explicit move, focus would drop to `<body>`).
- One-way per mount: no collapse control. Local `useState`; resets on remount.
- The trailing `" Nothing else to note here."` stays after the expanded list.

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

1. **Announcer unit** (`tests/components/admin/review/` — extends or sits
   beside `warningsPanelStatusMount.test.tsx`):
   - Mount published surface → region text is `""`. *Catches: mount-time
     announcement.*
   - Rerender with changed count props, NO arm → region text still `""`.
     *Catches: regression to derived text — the exact class this spec removes;
     a derived implementation cannot pass.*
   - `armAnnounce("3 ignored.")` then rerender with changed tuple → region text
     equals the pinned composed string (full textContent equality, e.g.
     `"3 ignored. 2 warnings listed. 1 warning needs a look below."`), derived
     from the fixture's counts, not hardcoded independently of them. *Catches:
     clause-only or tuple-only announcements; stale-tuple composition.*
   - Re-arm before tuple change → single announcement, last clause. *Catches:
     queued double announcements.*
   - Arm then rerender with IDENTICAL tuple → no announcement yet (armed
     persists). *Catches: announce-on-any-commit.*
   - Empty-clause arm → no-op.
   - Always-mounted contract assertions carried over from
     `warningsPanelStatusMount.test.tsx:25-75` (same node across states;
     absent on wizard).
2. **Producer integration** (controls-level RTL, mocked fetch + router):
   - `DataQualityWarningControls` success (each mode) arms with the pinned
     clause; failure does not arm. Assert through the provider (spy context
     value), not implementation internals.
   - `BulkIgnoreControls` success arms `"${n} ignored."` with n from the
     fixture group's item count (derived, not hardcoded); the chip's own status
     region never contains completion text (assert its textContent is `""` on
     the success path). *Catches: the original double-announcement.*
3. **Copy reorder** (`tests/components/admin/wizard/pointerSentence.test.tsx`):
   every pinned string in the §8.6 matrix updated to pointer-first with
   trailing reassurance, still asserted as FULL textContent equality
   (1/2/3 names, first overflow, miss folds, all-miss fallback, no-callback
   bold-only).
4. **Reveal** (same test file):
   - 5-section fixture: collapsed sentence pinned (button labeled "2 more",
     `aria-label="Show 2 more sections"`).
   - Tap → expanded sentence pinned; every revealed name fires the jump
     callback with its `SectionId`; focus is on the first revealed button
     (async assertion wrapped in `waitFor` — jsdom focus timing).
   - Fixture with 1 synthetic label miss + over-cap: expanded keeps
     `", and 1 more."` plain. *Catches: reveal leaking unresolved ids.*
   - No-callback fixture: overflow clause is plain text, no button.
5. **e2e** (existing published-modal harness,
   `tests/e2e/warning-panel-polish.spec.ts` — the file already reads the
   region at line 112):
   - After a real ignore round trip, region textContent matches the composed
     announcement; before any action it is empty.
   - Reveal tap: pre-click guard that the target section is NOT at the aligned
     scroll position, tap a revealed name, assert alignment (same shape as the
     polish spec's pointer-link e2e), hydration-gated, detach-safe.

Meta-test inventory: none applies — no new mutation surface (producers reuse
existing API routes), no Supabase call sites, no alert codes, no §12.4 rows, no
tile sentinel copy. The mutation-surface observability walker
(`tests/log/_metaMutationSurfaceObservability.test.ts`) sees no new files.

---

## 6. Files touched

- new module `warningAnnounceContext` (TypeScript file) in `components/admin/review/`
- `components/admin/review/ShowReviewSurface.tsx` (provider + state machine +
  region renders state)
- `components/admin/DataQualityWarningControls.tsx` (arm on success)
- `components/admin/BulkIgnoreControls.tsx` (arm on success)
- `components/admin/wizard/step3ReviewSections.tsx` (§3 word order, §4 reveal,
  `pointerSentenceParts` shape)
- `tests/components/admin/review/warningsPanelStatusMount.test.tsx` (rewrite to
  state contract)
- `tests/components/admin/wizard/pointerSentence.test.tsx` (pinned-string
  updates + reveal)
- controls tests (producer integration)
- `tests/e2e/warning-panel-polish.spec.ts` (announcer + reveal)
- `DEFERRED.md` (graduate the four entries to `DEFERRED-archive.md`)

## 7. Out of scope

- Dashboard `UnignoreButton` (§1.1 item 5).
- The six warning-surface-trim parks (§1.1 item 7).
- Hybrid/debounced background announcements (§1.1 item 1).
- Any change to `warningsPanelStatusSentence`'s tuple grammar or the §3.4
  four-row matrix of empty states.
