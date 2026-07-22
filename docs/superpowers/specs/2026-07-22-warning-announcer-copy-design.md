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
- **Append-only message log region.** The current single span becomes an
  sr-only container span with `role="log"` (keeping
  `data-testid="warnings-panel-status"`), always mounted. State is an
  append-only list of `{ id, text }` entries; `announce(message)` appends one
  entry. Each entry renders as a child span (keyed by id) inside the region.
  Entry ids come from a per-mount monotonic `useRef` counter incremented on
  every `announce` call (unique even for calls batched into one commit; never
  timestamp-derived — R3 finding 5).
  - Why `role="log"`, not `role="status"`: `status` carries implicit
    `aria-atomic="true"`, so any child addition could re-present the ENTIRE
    container — replaying old messages (R3 finding 1). `log` is the ARIA role
    designed for append-only message streams: implicit `aria-live="polite"`,
    implicit `aria-atomic="false"` (only the changed node is presented), and
    default `aria-relevant="additions text"`.
  - Why appends: INSERTING a message node is always announced — including when
    its text is identical to a previous announcement (R1 finding 2: identical
    TEXT CHANGES may not re-announce; identical ADDITIONS do). Two mutations
    that land in one React commit (two fetch successes batched — R2 finding 1)
    append two nodes in that commit and both are announced; nothing is
    overwritten, so no announcement can be lost to batching. The container
    itself is static from mount (a dynamically INSERTED live region is the
    classic not-announced pitfall; inserting children into a pre-existing
    region is the supported path).
  - Why recent entries are never removed: a freshly trimmed node could still
    be queued, unspoken, in the assistive technology's delivery pipeline —
    removal can strand it (R3 finding 2). Cap (R4 finding 1, project
    cap/truncation rule): the log keeps at most 50 entries; appending the
    51st removes the oldest. An entry is removed only when it is 50
    announcements old — 50 manual admin actions later, far beyond any
    plausible delivery-queue residence — so the R3 F2 strand window is not
    reopened. Removals stay outside `role="log"`'s announced set. The whole
    log is discarded on modal unmount.
  - No timers, no `requestAnimationFrame` — one state write per announcement,
    jsdom-safe.
- **Background refresh:** props change, counts change, but the message log is
  untouched — the region's text nodes are not a function of props. Silence, by
  construction rather than by suppression.
- **Overlapping actions:** each success branch appends its own clause in
  resolution order; both survive batching (see above). Two actions = two
  announcements, each accurate for its own action.
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
- Modal unmount → the message log is discarded; the region remounts empty. No
  announcement leaks across mounts.
- Action in flight at modal close (R5 finding 2) → the success continuation's
  `announce` lands after unmount and is deliberately dropped (a React state
  update on an unmounted provider is a silent no-op). Announcements are scoped
  to the panel's lifetime BY DESIGN: a message describing a panel the admin
  has already dismissed is noise, and the sighted experience is identical —
  the row's disappearance is equally invisible once the modal is closed.
- The always-mounted contract carries over to the container: same testid,
  node survives Silent-state chrome suppression
  (`ShowReviewSurface.tsx:1109-1114` comment block still holds — a live region
  must exist before its content changes for its additions to speak).

### 2.6 Transition inventory (message log)

| Transition | Treatment |
| --- | --- |
| append message node (any text, including identical to a prior node) | instant sr-only addition — announced (default `aria-relevant` includes additions; `role="log"` atomic=false presents only the new node); no visual (polish spec §11 precedent) |
| two appends in one commit (batched successes) | both nodes added; both announced (R2 F1) |
| cap-removal of a 50-announcements-old node (same commit as the newest append) | instant; announces nothing (removal outside announced set; entry long since delivered — R4 F1) |
| unmount of the whole region (modal close) | log discarded with the component; nothing announced |

Existing node text NEVER mutates, and no node younger than 50 announcements is
ever removed (R3 F2, R4 F1).
Compound: append during a background refresh commit — independent state, both
apply cleanly in one commit; the addition is the only live-region mutation. No
animation anywhere — sr-only.

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
`min-w/h-tap-min`, `z-10`), plus `aria-label` `"Show 1 more section"` when N is 1
and `"Show N more sections"` otherwise, where N is the visible count (equal to
`extra.length`, since `missCount === 0` here — the accessible name never
promises more than the reveal delivers; R1 findings 3–4, R2 finding 4). Collapsed example (5 resolved sections):
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
- Focus moves to the first revealed name button via a ONE-SHOT pending-focus
  flag: the tap handler sets a ref flag alongside the `expanded` state update;
  a layout effect on the NEXT commit consumes the flag — clears it
  UNCONDITIONALLY, and focuses the first revealed button only if one rendered
  in that commit (the button does not exist until that render, so the handler
  cannot focus it directly — R3 finding 3). If the activation commit renders
  no revealed button (overflow simultaneously vanished, a miss appeared, the
  callback dropped), the flag is still consumed and NO later data-driven
  render can inherit it (R4 finding 2). Data-driven re-renders of an
  already-expanded list — including a refresh that replaces or reorders extra
  sections while staying over-cap — NEVER move focus: the flag is set only in
  the tap handler (R2 finding 2d, R3 finding 3).
- One-way per mount: no collapse control. Local `useState`; resets on remount.

**Expanded-state semantics under data changes (R2 finding 2).** `expanded` is a
sticky per-mount PREFERENCE ("show every name while overflow exists"), and
rendering is ALWAYS derived from the preference plus CURRENT data — never from
the data that existed at tap time:

| current data | `expanded` false | `expanded` true |
| --- | --- | --- |
| `extra > 0, missCount === 0`, callback | collapsed + reveal button | full resolved list |
| `extra > 0, missCount === 0`, no callback | plain collapsed clause | plain collapsed clause (preference inapplicable without interactivity) |
| `missCount > 0` (any extra) | plain collapsed clause | plain collapsed clause (§4.2 miss rule wins over the preference) |
| no overflow (`extra === 0, missCount === 0`) | plain ≤cap sentence | plain ≤cap sentence (nothing to expand) |

Consequences, stated deliberately: a refresh that removes overflow renders the
plain sentence even if `expanded` is set; a later refresh that restores
overflow re-renders the full list WITHOUT another tap (the user already asked
for all names this session); a refresh that introduces a label miss collapses
back to the plain folded clause. A refresh that unmounts a focused reveal or
name button drops focus to `<body>` — accepted as exact parity with the
already-shipped name buttons, which a refresh can equally remove today.

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
   - Mount published surface → container present with zero message children.
     *Catches: mount-time announcement; missing always-mounted region.*
   - Rerender with changed count props, no announce → still zero children and
     a `MutationObserver` attached to the container (childList + subtree +
     characterData) recorded ZERO mutations across the rerender. *Catches:
     regression to derived text — a derived implementation cannot pass (R2
     F6a: observer sees every DOM mutation inside `act()`, not just the final
     state).*
   - `announce("Warning ignored.")` → one child with exactly that text; the
     observer recorded exactly one childList addition and no text mutations of
     existing nodes; unchanged across a subsequent changed-props rerender.
     *Catches: refresh-coupled announcement (R1 F1); clear-then-write or other
     intermediate mutations (R1 F8, R2 F6a).*
   - `announce` twice with the IDENTICAL string, in separate `act()`s → two
     children, both with that text; observer recorded two additions and no
     removals or text mutations. *Catches: identical-text non-announcement
     (R1 F2); slot-style clearing (R2 F3).*
   - Two `announce` calls scheduled inside ONE `act()` (both promises resolve
     before the commit, simulating React batching of two fetch successes) →
     BOTH messages present as children. *Catches: last-write-wins message loss
     (R2 F1).*
   - Four announces → four children, in order; the observer recorded four
     additions and ZERO removals (R3 F2: nothing is trimmed while mounted).
   - Region role is `log` (atomic-false append semantics — R3 F1), asserted
     directly on the container.
   - Ids: each entry span carries `data-announce-id={id}`; after four announces
     (two with identical text) assert all four `data-announce-id` values are
     DISTINCT (R3 F5, R4 F4 — DOM-reference stability alone cannot prove key
     uniqueness), and earlier captured element references are still the same
     nodes (no remount of prior entries).
   - Cap: drive 51 announces (loop) → exactly 50 children; the removed entry
     is the oldest (`data-announce-id` of the first announce absent); observer
     shows the single removal in the same commit as the 51st addition (R4 F1).
   - Whitespace-only announce (`"   "`) → no mutations recorded (R4 F6a).
   - Unmount then remount the published surface → zero children on the new
     mount (R4 F6b: no module-level leakage).
   - Empty-string announce → no mutations recorded.
   - Wizard-mode mount (no `routedWarnings`/`renderSectionExtras`) → container
     absent (contract carried over from the current
     `warningsPanelStatusMount.test.tsx:75` assertion).
2. **Producer integration** (controls-level RTL, mocked fetch + router,
   provider wrapping the control under test with a recording `announce` spy):
   - `DataQualityWarningControls` success (each mode) announces the pinned
     clause exactly once; non-ok response and thrown-fetch paths announce
     nothing.
   - `BulkIgnoreControls` success announces `"${n} ignored."` with n derived
     from the fixture group's item count (not hardcoded), exactly once;
     non-ok response and thrown-fetch paths announce nothing (R2 F7 — same
     negative pair as the single-row control, not only the success case).
   - Chip-region contract, stated precisely (R2 F5, R3 F4): a
     `MutationObserver` attaches to the chip's own status region at INITIAL
     render, before any tap. Across the whole flow — arm, confirm, success,
     refresh rerender — the region's text takes values from the set
     { "", "Tap again to confirm." } ONLY, every observed mutation included;
     while ARMED it is exactly "Tap again to confirm." (the ratified §1.1
     item 2 behavior, asserted positively). *Catches: the original
     double-announcement, a transient completion message cleared before the
     final assertion (R2 F6b), and a transient message substituted between
     the confirming tap and the success branch (R3 F4).*
   - No-provider mount (R2 F8): render `DataQualityWarningControls` with NO
     provider, drive the full success flow → no throw, and no
     live-region node (`role="log"` or `role="status"`) anywhere in the
     document ever contains the clause
     (assert via observer on `document.body`). *Catches: a throwing context
     default; announcements leaking through module state.*
   - Published-surface wiring (R4 F5): mount the REAL composed tree —
     `ShowReviewSurface` with the actual `sectionWarningExtras` renderer (as
     `PublishedReviewModal` wires it), not a hand-rolled provider wrapper —
     drive a bulk confirm round trip (mocked fetch + router) and assert the
     panel region gains the `"${n} ignored."` entry, and separately a single
     ignore round trip gains `"Warning ignored."`. *Catches: a provider placed
     so one producer sits outside it — manual wrappers cannot see that.*
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
   | 1 | 0 | yes | button, aria-label "Show 1 more section" (singular — R2 F4) |
   | 2 | 0 | no | plain clause, no button |
   | 0 | 1 | yes | plain clause, no button |
   | 1 | 1 | yes | plain clause ("and 2 more."), no button |
   - Tap (row 1) → expanded pinned sentence; every revealed name fires the
     jump callback with its `SectionId`; focus is on the first revealed button
     (async assertion wrapped in `waitFor` — jsdom focus timing).
   - Expanded then data change (R2 F2): with `expanded` set, rerender the same
     mount with (a) overflow removed → plain ≤cap sentence; (b) overflow
     restored → full list WITHOUT another tap; (c) a label miss introduced →
     plain folded clause; (d) one extra section replaced by another while
     staying over-cap (R3 F3) → full list re-renders with the new name;
     (e) callback removed → plain collapsed clause even though `expanded` is
     set (R4 F3); in (b)-(e) document.activeElement is unchanged (focus moves
     only via the one-shot activation flag).
   - Consumed-flag boundary (R4 F2): tap the reveal button while the SAME
     commit's data drops the overflow (rerender with new props inside the
     activation act) → no focus move; then restore overflow → full list
     renders and document.activeElement is STILL unchanged (the flag was
     consumed by the empty activation commit).
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
- `components/admin/review/ShowReviewSurface.tsx` (provider + message-log region)
- `components/admin/DataQualityWarningControls.tsx` (announce on success)
- `components/admin/BulkIgnoreControls.tsx` (announce on success)
- `components/admin/wizard/step3ReviewSections.tsx` (§3 word order, §4 reveal,
  `pointerSentenceParts` shape)
- DELETED: `lib/admin/warningsPanelStatus.ts`,
  `tests/admin/warningsPanelStatus.test.ts` (§2.4)
- `tests/components/admin/review/warningsPanelStatusMount.test.tsx` (rewrite to
  message-log contract)
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
- **F2 (P1, identical text) — FIXED STRUCTURALLY.** Append-only message log
  (§2.2): every announcement is a node ADDITION, announced regardless of text
  equality with prior messages. (R1's interim dual-slot fix was itself replaced
  in R2 — see §8 R2 F1/F3.)
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
  gone (F1); §5.1 now pins the properties that make it gone: announcement
  independent of refresh, addition-per-announce, derived-text regression
  guard.
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

## 8.1 Adversarial round 2 triage log

Inlined no-tools Codex review of the R1-revised spec, 2026-07-22, VERDICT:
NEEDS-ATTENTION, 8 findings.

- **F1 (P1, batched successes lose a message) — FIXED STRUCTURALLY.** The
  dual-slot `{seq, message}` state was last-write-wins under React batching.
  Replaced (§2.2) by the append-only message log: batched successes append two
  nodes in one commit; nothing is overwritten. Test pinned in §5.1.
- **F2 (P1, reveal state undefined across refresh) — FIXED.** §4.3 now derives
  rendering from preference + CURRENT data with a full four-row matrix, pins
  focus movement to the activation transition only, and accepts focus-drop on
  refresh-unmounted buttons as parity with the shipped name buttons. Tests
  pinned in §5.4.
- **F3 (P2, clearing one region while populating another can cancel a queued
  utterance) — FIXED STRUCTURALLY.** The append-only log never mutates or
  clears spoken text near its announcement; the only removals are
  3-announcements-old trims, outside the default `aria-relevant` set (§2.2,
  §2.6).
- **F4 (P2, "Show 1 more sections") — FIXED.** Singular/plural pinned in §4.2;
  N=1 boundary row added to the §5.4 matrix.
- **F5 (P2, chip-region test contradicts the armed prompt) — FIXED.** §5.2 now
  asserts the armed prompt positively and scopes the never-non-empty
  observation to the post-confirmation window.
- **F6 (P2, final-state assertions cannot prove mutation sequences) — FIXED.**
  §5.1/§5.2 assertions are now `MutationObserver`-based (jsdom implements
  MutationObserver; observers see every mutation flushed inside `act()`),
  pinning addition counts and forbidding text mutations of existing nodes.
- **F7 (P2, bulk negative coverage) — FIXED.** §5.2 adds the non-ok and
  thrown-fetch announce-nothing pair for `BulkIgnoreControls`.
- **F8 (P3, no-provider guard unexercised) — FIXED.** §5.2 adds the
  provider-less success-flow test asserting no throw and no leaked
  announcement.

## 8.2 Adversarial round 3 triage log

Inlined no-tools Codex review of the R2-revised spec, 2026-07-22, VERDICT:
NEEDS-ATTENTION, 5 findings. Round 3 on the announcer vector triggered the
comprehensive re-analysis rule: the full ARIA live-region contract was audited
(region pre-existence, implicit atomicity per role, relevant-set defaults,
dynamic-region insertion pitfall, identical-addition semantics, delivery
asynchrony) and §2.2 now records the result of each row rather than patching
single instances.

- **F1 (P1, `role="status"` implicit `aria-atomic="true"` replays the whole
  container) — FIXED.** Verified against the ARIA role definitions: correct.
  The region role is now `log` (implicit polite, atomic=false, additions
  announced individually) — the role designed for append-only streams. §2.2,
  §2.6, §5.1 updated; the role itself is asserted in §5.1.
- **F2 (P1, trim can strand an unspoken queued announcement) — FIXED.** No
  removal while mounted; the log is bounded by the admin's own per-mount tap
  count and discarded on unmount. §2.2, §2.6, §5.1 updated.
- **F3 (P2, focus contract impossible as literally written; refresh
  focus-steal untested) — FIXED.** One-shot pending-focus ref flag set in the
  tap handler, consumed by a layout effect; §5.4 adds the same-count
  extra-replacement rerender row asserting no focus movement.
- **F4 (P2, chip observation window starts too late) — FIXED.** Observer
  attaches at initial render; permitted-text-set contract over the entire
  flow (§5.2).
- **F5 (P2, entry-id uniqueness unspecified) — FIXED.** Per-mount monotonic
  `useRef` counter, never timestamps; §5.1 asserts node identity stability
  across appends.

## 8.3 Adversarial round 4 triage log

Inlined no-tools Codex review of the R3-revised spec, 2026-07-22, VERDICT:
NEEDS-ATTENTION — zero P1; 5 P2 + 1 P3, all spec/test-tightening. All FIXED:

- **F1 (P2, unbounded log vs the mandatory cap rule)** — cap 50 with
  oldest-entry removal; a 50-announcements-old entry cannot still be queued,
  so the R3 F2 strand window stays closed (§2.2, §2.6; cap test §5.1).
- **F2 (P2, pending-focus flag survives an empty activation)** — flag consumed
  unconditionally on the next commit (§4.3); consumed-flag boundary test
  (§5.4).
- **F3 (P2, expanded-without-callback untested)** — §5.4 row (e).
- **F4 (P2, DOM-reference stability cannot prove key uniqueness)** —
  `data-announce-id` distinctness assertion (§5.1).
- **F5 (P2, real published-surface bulk wiring unexercised)** — composed-tree
  integration test through the actual `sectionWarningExtras` renderer (§5.2).
- **F6 (P3, whitespace guard + remount leak untested)** — §5.1 additions.

## 8.4 Adversarial round 5 triage log

Inlined no-tools Codex review of the R4-revised spec, 2026-07-22, VERDICT:
NEEDS-ATTENTION — 2 P2 findings, both ACCEPTED with rationale (no spec-body
change beyond the §2.5 lifetime clause):

- **F1 (P2, 51 announces in one React batch can skip the oldest entry's DOM
  commit) — ACCEPTED, not producible.** Reaching it requires 51 success
  continuations resolving inside a single React batch — i.e. 51 concurrent
  in-flight mutations from one admin's discrete manual taps (bulk ignore
  announces exactly once per confirm). Each tap is a separate event-loop task
  and each fetch resolution a separate microtask chain; sequential actions
  commit long before the 51st arrives. The cap-removal path (§5.1) covers the
  reachable sequential case. Un-defer trigger: any producer that can emit
  dozens of announcements from one gesture.
- **F2 (P2, in-flight action stranded by modal close) — ACCEPTED as designed
  behavior.** Recorded in §2.5: announcements are scoped to the panel's
  lifetime; dropping a completion message for a dismissed panel is the
  intended parity with the sighted experience, not a missed contract. No
  "announce after unmount" test is added because the no-op IS the contract.
