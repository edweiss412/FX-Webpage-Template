# Diagram failure retry — design spec (2026-08-29)

Closes `DIAGRAM-FAILURE-RECOVERY-1` (DEFERRED.md). Branch `feat/diagram-failure-retry`.

## 0. AS-BUILT DIVERGENCE — read this before implementing anything below

This spec is canonical under plan invariant 7, which is exactly why this section
exists at the top rather than as footnotes. Six mechanisms specified below were
DELETED OR REPLACED during implementation, and the prose describing them was left
in place. Whole-diff review round 3 found that, and it was right to call it
blocking: an implementer following the normative text literally would reintroduce
defects this branch removed.

Every later mention of these names is superseded by this table. Where a section
still reads as a requirement, this section wins.

| specified below | what actually ships | why it changed |
|---|---|---|
| `attempt` counter keying `<Image>` for a remount | NOTHING. The image node is deliberately NOT remounted | §4.0.5 requires the same node to survive. The asset route sends `private, max-age=0, must-revalidate` with no validator, so a remount is a second unconditional GET and a crew member pays twice for one tap. A counter whose only purpose was to force that remount was specifying the defect. **Must not be re-added.** |
| `focusOnMount` flag | `focusRetryingRef`, `focusFailedRef`, `focusThumbRef` — one hand-off per transition — plus a single root-scoped focus rescue | One flag could not express which of several destinations a given removal wanted, and the per-transition enumeration was itself a defect: rounds kept finding removal paths the table had not listed. The rescue asks where focus IS after any commit instead of predicting which transitions strand it |
| `retryRefs` (one map) | `retryControlRefs` and `retryingRefs`, split | The failed control and the in-flight overlay are DIFFERENT elements; one map could not address them separately |
| `successorTo` | DELETED, zero callers | The product owner's override gives every runtime-failed cell its own control, so focus never leaves the cell and the eligibility question dissolved rather than being answered |
| `demotedRef` cleared by "deliberately none" | cleared on a `snapshotRevisionId` change | Crew ids are STABLE ACROSS SYNCS while the asset key and variants change, so a never-cleared latch silently denied full detail to a healthy replacement asset. Not conservative, as the original text claimed |
| retry transitions as "the same node re-labelled" | a separate in-flight overlay replaces the failed control, with an explicit focus hand-off | The overlay must not be natively `disabled` (that drops focus to `<body>`), so it is a distinct element and focus has to be handed to it deliberately |

## 1. Problem and probe evidence

A runtime image failure is terminal for the rest of the page session. `failedKeys` is
added to and never cleared, in both gallery surfaces:

- `components/diagrams/Gallery.tsx:122` declares it; the only writer is the add-only
  updater in `handleThumbnailFailure` (`Gallery.tsx:295`).
- `components/diagrams/GalleryLightbox.tsx:293` declares it; its two writers are the `setFailedKeys` calls in the
  active-slide `onError` (`GalleryLightbox.tsx:1121`) and the inactive-slide `onError`
  (`GalleryLightbox.tsx:1173`). Both add only.

So one dropped request on venue wifi costs that diagram until the page is reloaded, and
the crew member has no reason to suspect a reload would help. The cell left behind is a
non-interactive `<div>` (`Gallery.tsx:416-419`) with no next step. The prior arc
(`docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md`) made the failure legible
— focus relocates and the event is announced by name — and stopped there; its invariant-8
critique scored heuristic 9 (recover from errors) 2/4 on exactly this account.

## 1.1 Resolved scope — do not relitigate

| decision | ratification |
|---|---|
| Retry fetches the **clamped tier**, not the original. Copy shape `"<name> could not be loaded. Tap to retry."` with an explicit in-flight state. | Eric, 2026-08-29, relayed through bl-orch. This is the ledger row's blocking product decision (class-sweep exception (a)) being answered. |
| **No cache-buster query parameter.** The retry re-renders the same `srcSet` candidate set and the browser picks from it. | §3. A cache-buster would change every URL, defeat HTTP caching, and put the retry outside the ladder the cost bound rests on. It is not needed: a remount re-requests on its own (§1.3). |
| Retry labels are **UI chrome, not catalog rows**. No `lib/messages` entry, no §12.4 code. | Established precedent for exactly this control class: `components/admin/RetryWatchButton.tsx:11-12` ("Labels are UI chrome (uncataloged, like Dismiss/Details)"). Invariant 5 governs raw error CODES surfacing in UI; these strings carry no code. |
| A runtime-failed cell **keeps focus** rather than relocating to a sibling, and `successorTo` is deleted. | §7, and it is an explicit **amendment** to `2026-08-10` spec §4.2 / AC-3, not a reinterpretation of it. Under the §3.1 override every runtime-failed cell has a control, so no relocation case remains. Parse-time-unavailable cells never held focus. |
| Parse-time-unavailable items (`available: false`) get **no retry control**. | §4. There is no asset to re-fetch; the manifest never published one. |
| Originals-only entries **do** get the control, at original cost, up to the route's 50 MB cap. | §3.1. Eric via bl-orch, 2026-08-29, decided with the 50 MB figure stated. Supersedes an earlier withhold that was my default, not his answer. |
| Inactive lightbox slides get **no control**; active slides and gallery thumbnails do. | §2, on a11y grounds, and §3.1 explains why the no-dead-ends argument does not reach it: an inactive slide has two recovery routes, originals-only had none. |
| The **lightbox demote path is untouched.** An original-tier failure with a smaller tier available still demotes with its announcement and chip, gated on `wantsOriginal`
(`GalleryLightbox.tsx:1033-1073`). | That path is already non-terminal, so this row does not reach it. Retry applies only where `failedKeys` is written. |
| No new design tokens. | §8. Every class used already ships (`Gallery.tsx:351`, `Gallery.tsx:416`, `Gallery.tsx:430`), so no new contrast meta-test is owed. |
| The e2e failure path **is** built here: `page.route` aborts the diagram asset request so the failed state can be rendered in a real browser. | §10.6. An earlier row fenced this out as a separate arc, which contradicted AC-7's mandatory real-browser measurement. Retracted in round 2. |

### 1.2 Probe: the terminality is measured, not assumed

`tests/components/diagrams/gallery.failureRecovery.test.tsx` (committed ahead of this
spec) pins the behavior as it stands. Five cases, all green against the current code:

| claim | oracle |
|---|---|
| the failed cell holds no interactive element of any kind | a DOM-derived interactive-element query returns empty, against a healthy sibling that returns non-empty |
| the failure is announced (the gap is the next step, not the signal) | one new `[data-announce-id]` entry containing "could not be loaded" |
| a re-render with identical props leaves the cell failed | image still absent after `rerender` with the same `items` |
| a fresh mount restores it | positive control: unmount + mount brings the image back |
| a parse-time-unavailable item reaches the SAME branch | both render `data-unavailable="true"` with no image |

The last row is load-bearing for §4: `!item.available` and a runtime failure share one
render branch today, and only the second has an asset behind it.

### 1.3 Probe: the retry mechanism, verified against the installed framework

The retry has to make the browser re-request a URL it has already failed. Read from the
installed Next source rather than reasoned from React semantics, per the empirical-spike
rule in `docs/agents/spec-self-review.md`:

- **A remount re-requests.** The only "already handled" tracking in `next/image` is
  per-DOM-node: the installed `next/image` client component sets and reads `img['data-loaded-src']`
  (`image-component` in the installed `next` package, lines 34 and 37). A new `<img>` node does not carry it, so nothing suppresses
  the request. The module-level `allImgs` map
  (`get-img-props` in the same package, line 36) is dev-only and gates a
  `warnOnce` LCP check, never a request.
- **There is no persistent error flag to clear.** `onError` sets `showAltText` and
  `blurComplete` (`image-component`, lines 213-220), both plain `useState`
  (same file, lines 290-291). A new instance starts fresh. No `hasErrored` exists.
- **After `onError`, `next/image` leaves `src` and `srcSet` alone**
  (`get-img-props`, lines 516 and 519, touch only `style.color` and the blur background), so the
  failed element keeps showing the browser's broken-image glyph until the app replaces it.
- **A custom loader receives `{src, width, quality}` with `src` verbatim**
  (`get-img-props`, lines 196-200), which is what makes the URL identity claim in §3 hold.

**Consequence:** the retry is a React `key` bump that remounts the `<Image>`. It needs no
cache-busting query parameter, and must not use one, per the fence in §1.1.

## 1.4 UNRATIFIED claims — what this spec asserts but cannot prove

The spec stage closed at three rounds by orchestrator ruling, not by converging (record:
`docs/review-rounds/feat/diagram-failure-retry/e7751f61de2c.md`). The reason was that the
findings had stopped being about the design and started being about runtime behaviour, which
prose review cannot decide and a running browser decides immediately.

**Every claim below is UNRATIFIED.** Each is this spec's best current answer, each was
corrected at least once by review, and none is settled until the named probe or RED says so.
If a probe contradicts one, the probe wins and this section is amended — that is not a
finding against the spec, it is the mechanism working. Five of the six are the plan's FIRST tasks, run against
STANDALONE fixtures rather than the shipped component — they are claims about React, the
browser and `next/image`, so they need none of this feature to exist. U-6 is the exception:
it is feature behaviour, so it is settled by the task that implements it.

| # | UNRATIFIED claim | where | settled by |
|---|---|---|---|
| U-1 | **RATIFIED 2026-08-29.** Setting native `disabled` on the focused retry control ejects focus to `<body>`; `aria-disabled` does not | §7.1 | **Task P1, run.** `tests/e2e/focus-disabled-eject.probe.spec.ts`, 2 passed in Chromium: the native arm reported `body`, the `aria-disabled` arm reported the button. Each arm carries a premise asserting focus was ON the button first, or "focus is on body afterwards" would be trivially true. Firefox is not independently probed; one engine ejecting is sufficient to reject the attribute |
| U-2 | **RATIFIED 2026-08-29.** A separate element on `retrying → idle` costs a second unconditional GET; the surviving element costs none | §4.0.5 | **Task P2, run.** `tests/e2e/image-remount-request-count.probe.spec.ts`, 2 passed in Chromium: the remount arm issued exactly one further request, the same-node arm zero. Only node reuse varies — same URL, same headers, same interception, `loading="eager"` on every element, explicit load awaits — and the count window opens after the first load is asserted served |
| U-3 | **REFUTED 2026-08-29, and the design changed.** Covering is NOT what defers a lazy image; being off-screen is. The retry is reached by a TAP, so the cell is in the viewport and a covered in-view lazy image loads | §4.0.5 | **Task P3, run.** `tests/e2e/covered-image-load-eligibility.probe.spec.ts`, **5 passed in Chromium AND 5 in WebKit** (`standalone-webkit-load-eligibility`). Three off-screen arms refute the covering mechanism; **the two IN-VIEW arms are what the design actually rests on** and both issue the request. Plan review R2 found the off-screen arms could not carry the conclusion; R3 found the evidence was Chromium-only while mobile Safari is a shipped target. Both closed |
| U-4 | **PARTLY RATIFIED 2026-08-29.** The BROWSER half is settled: a pick moves with device scale and never leaves the offered set. The APPLICATION half — that `next/image` plus `makeDiagramLoader` render a stable, original-free set — is NOT settled by P4 and is ratified by plan Task 2's assertion against the real component | §3 | **Task P4, run.** `tests/e2e/srcset-candidate-stability.probe.spec.ts`, 2 passed in Chromium. The rendered `srcset` was byte-identical at DPR 1 and DPR 3 while the requested tier changed between them, which both confirms the bound and proves the fixture discriminates rather than being insensitive |
| U-5 | **RATIFIED 2026-08-29, and it proved itself on first contact.** A parser enumerating every `useState`/`useRef` is a cover where the grep was not | §4.0.3 | **Task P5, run.** `tests/components/diagrams/perItemStateLifetime.probe.test.ts`, 7 passed. Four planted shapes are each SEEN and each RED while unclassified. Its first run against the live tree found `prefersReducedMotion` (`GalleryLightbox.tsx:257`), a member every hand-derivation had missed |
| U-6 | Clearing session state when an item goes unavailable OR leaves `items`, keyed on the rendered id set, leaves no render able to observe retained state | §9.1 | **Plan Task 7**, not a probe: this is feature behaviour, so it is settled where its implementation lands. EVERY per-item member §4.0.3 classifies is planted and the FIRST frame after the flip asserted, `wantsOriginal` included |

Two things deliberately NOT in this table, because they are settled by reading rather than by
running: **[SUPERSEDED — §0]** ~~`demotedRef` has no clear path~~ — it is cleared on a
`snapshotRevisionId` change, and
`servingVariants` excludes any row naming the original (the function's body establishes it).
Round 2 verified the second directly.

## 2. What ships

A runtime-failed diagram cell becomes a retry control. Tapping it re-requests the image that
failed and reports the outcome, in both channels, either way.

Three sites write `failedKeys`. Only two of them get a control, and the third is a
deliberate exclusion rather than an oversight:

| site | code | after |
|---|---|---|
| gallery thumbnail | `Gallery.tsx:411` | retry button, on every runtime-failed item (§3.1) |
| lightbox ACTIVE slide | `GalleryLightbox.tsx:1121` | retry button, same |
| lightbox INACTIVE slide | `GalleryLightbox.tsx:1173` | **no control.** Still terminal until the user swipes to it |

**Why inactive slides get nothing.** Every inactive figure carries
`aria-hidden={!isActive}` (`GalleryLightbox.tsx:783`), and the dialog focus trap collects
`button:not([disabled])` filtered only on `offsetParent !== null` and `tabIndex >= 0`
(`lib/a11y/dialogFocus.ts:26-43`) — it does not exclude `aria-hidden` ancestors. Embla keeps
every slide mounted and offsets them by transform, so `offsetParent` is non-null. A control
there would therefore be an off-screen Tab stop with no accessible representation, and its
outcome would be silent by the existing rationale (`GalleryLightbox.tsx:1168-1171`): a
keyboard user would reach a button that announces nothing and refers to nothing. Twelve of
them on a full gallery.

The recovery for an inactive failure is to swipe to it, which makes it active, which is
where the control lives. Recorded as a limit at §10.4 rather than treated as complete.

## 3. Cost: the retry never reaches past the clamped ladder

The fork this row was deferred on ("retry the clamped tier" vs "retry the original")
collapses under the code as it stands, and the collapse is what makes the decision cheap
to honor.

**Gallery thumbnails never ask for the original.** `Gallery.tsx:398-403` builds the loader
with no `pinOriginal`, so `makeDiagramLoader` returns the clamping selector
(`lib/images/diagramLoader.ts`, `makeDiagramLoader`) and picks the smallest ladder tier at
or above the requested width. A thumbnail failure is therefore already a clamped-tier
failure.

**The lightbox's expensive failure is already non-terminal.** The active slide pins the
original only once a slide has shown zoom intent (`GalleryLightbox.tsx:987`,
`pinOriginal: wantsOriginal.has(item.id)`), and when that original fails with a smaller
tier available it demotes rather than dying, gated on `wantsOriginal` (`GalleryLightbox.tsx:1033-1073`). So the
terminal branch is reached with a clamped request, or on an originals-only entry where
`hasVariantTier` is false (`lib/images/diagramLoader.ts`, `hasVariantTier`) and the
clamped loader resolves to the original anyway — the same URL either way.

**The bound, stated correctly.** An earlier draft claimed the retry re-requests the
byte-identical URL. That is wrong, and the correction matters. `next/image` does not render
one URL: it calls the loader once per ladder width and emits a responsive `srcSet`
(`get-img-props`, lines 126-147), and the BROWSER picks a candidate. A remount with
identical props reproduces the same candidate set, but a viewport, layout, orientation or
DPR change between the failure and the tap can move the selection, so a 256-tier failure
can retry at 512 or 1024.

What survives, and is the actual bound (RATIFIED — Task P4 measured a byte-identical `srcset`
across device-scale factors while the selected tier moved between them:
`tests/e2e/srcset-candidate-stability.probe.spec.ts`): **the retry
draws from the same candidate set the failed render offered, and for any entry with a variant ladder that set never contains the
original.** The clamped selector excludes any row naming the original by construction
(`servingVariants` in `lib/images/diagramLoader.ts`), so the worst case is the largest
ladder tier — 1024 — not the multi-megabyte source. That is a real ceiling and it is
checkable in the DOM, which is what AC-2 asserts: the `srcSet` candidate set after the
retry equals the set before the failure. A single-URL equality assertion could not observe
browser candidate selection and so would prove neither the claim nor the bound.

Measured magnitudes, from the prior arc's probe under a venue-grade throttle
(1.5 Mbps down / 300 ms RTT, `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md`
§2): on a 707 KB fixture the 1024 tier is **6.5 KB / ~350 ms**, the original's `load`
fires at **~4,127 ms**, and a 1-5 MB stage plot extrapolates to **5.9-28 s**.

**The ceiling is not 5 MB.** An earlier draft of this section said the route's range was
1-5 MB. It is not: `MAX_DIAGRAM_BYTES = 50 * 1024 * 1024`
(`app/api/asset/diagram/[show]/[rev]/[key]/route.ts:25`), and the 1-5 MB figure is the
*typical* size in that constant's own comment (same file, line 23), not a cap. An original
the route will happily serve can approach **50 MB**, which at the probe's throughput is
several minutes. Every bound below is stated against 50 MB. The
ladder is `[256, 512, 1024]` (`lib/sync/diagramVariants.ts`,
`DIAGRAM_VARIANT_WIDTHS`), emitted only for widths strictly below the source's own
(`lib/sync/diagramVariants.ts`, the `width >= intrinsicWidth` skip).

The asset route sends `private, max-age=0, must-revalidate`
(`app/api/asset/diagram/[show]/[rev]/[key]/route.ts:12`) with **no ETag and no
Last-Modified** — verified: a case-insensitive grep for either header over that file
returns zero matches. So every retry is a full unconditional GET; there is no revalidation
shortcut to hope for, and equally no stale cached failure to defeat.

### 3.1 Originals-only entries: the control ships, at original cost

An entry is originals-only when `hasVariantTier` is false. Four ways to get there:

| cause | evidence |
|---|---|
| source narrower than 256px | the `width >= intrinsicWidth` skip (`lib/sync/diagramVariants.ts:75`) emits nothing |
| GIF | the generator skips the resize loop for `image/gif` to preserve animation (`lib/sync/diagramVariants.ts:71-73`) |
| variant generation failed | the per-asset catch returns `variants: []` with `reason: "sharp_error"` (`lib/sync/diagramVariants.ts:110-118`) |
| manifest predates the variant pipeline | `variants` is optional on `PersistedDiagramFields` (`lib/parser/types.ts`) and normalized to `[]` (`components/crew/DiagramsBlock.tsx`) |

For all four there is no clamped tier, so a retry fetches the original — up to the route's
50 MB cap, per tap.

**Ratified: offer it anyway.** Eric, 2026-08-29 through bl-orch, taken WITH the 50 MB figure
in hand, on the ground that no diagram should be a dead end. That is the decision this row
was deferred for; it is not this spec's to re-take.

This section reversed twice and both reversals are fenced, so neither is re-argued:

1. draft 1 offered the control, reasoning from a cost bound that was wrong
2. draft 2 withheld it, on the literal reading of "clamped tier", after review correctly
   objected that draft 1 was making a product decision
3. draft 3 offers it, because the product owner made that decision explicitly

A reviewer re-arguing the cost is re-arguing a call that was made with the cost stated. A
reviewer re-arguing the literal reading is re-arguing a fork the owner resolved.

**Why the same argument does not reopen the inactive-slide exclusion (§2).** The test that
decided this one is whether the user has any route back. Originals-only had **zero**: no
surface offered anything, for the rest of the session. An inactive lightbox slide has
**two** — swipe to it, which makes it active where the control lives, or use its gallery
thumbnail, which carries its own control independently. So the exclusion in §2 is a
one-gesture detour, not a dead end, and it stands on its a11y grounds.

## 4. The state machine

Per item, per surface. `failedKeys` stops being the whole story and becomes one of three
states; a fourth render state shares the branch and is entered only from props.

```
                tap retry
  idle ──fail──▶ failed ──────▶ retrying ──onLoad──▶ idle
                   ▲                 │
                   └────onError──────┘
```

| state | membership test | renders |
|---|---|---|
| `idle` | `item.available && !failedKeys.has(id) && !retrying.has(id)` | the `<Image>`, unchanged |
| `failed` | `item.available && failedKeys.has(id) && !retrying.has(id)` | retry control, always (§3.1 withholds from nothing) |
| `retrying` | `item.available && retrying.has(id)` | the real `<Image>`, mounted in its FINAL position, with the in-flight control overlaid (§4.0.5) |
| `unavailable` | `!item.available` | today's placeholder, no control |

`item.available` is a conjunct of all three session states, so they cannot overlap with
`unavailable`. An earlier draft omitted it from `retrying` and the two could both hold.

`retrying` is a second `ReadonlySet<string>`, mirroring the `failedKeys` idiom already in
both files.

> **AMENDED 2026-08-29, after implementation (diff review R2 finding 5).** This paragraph
> originally also specified a per-item `attempt` counter keying the `<Image>` so a remount
> happens. **That counter does not ship and must not be re-added.** It was removed during
> implementation once mutation probing showed nothing could kill it: the image node is
> deliberately NOT remounted, because §4.0.5 requires the same node to survive the retry —
> the asset route sends `private, max-age=0, must-revalidate` with no validator, so a remount
> is a second unconditional GET and the crew member pays twice for one tap. A counter whose
> only purpose was to force that remount was specifying the defect. The close-out recorded the
> removal; the spec did not, which is the gap this amendment closes.

Transitions, exactly:

- **`failed` → `retrying`**: add the id to `retrying`, **[SUPERSEDED — see §0]** ~~increment `attempt[id]`~~, remove the
  id from `failedKeys`, **and delete it from `pendingFailuresRef`** (see below). Removing it
  from `failedKeys` is what makes that set non-terminal; the `retrying` membership is what
  keeps the cell from flashing the image before it loads.
- **`retrying` → `idle`**: `onLoad` removes the id from `retrying`, which removes the
  overlay. **The `<Image>` node itself does not change** (§4.0.5).
- **`retrying` → `failed`**: `onError` removes the id from `retrying` and adds it back to
  `failedKeys`. **[SUPERSEDED — see §0]** ~~`attempt[id]` is NOT reset, so a third tap remounts again~~ — nothing remounts; the node survives (§4.0.5).

### 4.0.1 `pendingFailuresRef` is part of the machine, not outside it

`pendingFailuresRef` (`Gallery.tsx:156`) is add-only today: written at `Gallery.tsx:283`,
read at `Gallery.tsx:223` and `Gallery.tsx:280`, and never cleared. An earlier draft of this
spec modelled `failedKeys` alone, which left a real defect: after a successful retry the
item would render again, but `Gallery.tsx:280` would discard its NEXT failure — no
announcement, no `failedKeys` entry, no control — because the id is still pending. The
diagram would break a second time and say nothing.

So the `failed → retrying` transition clears it. Its other reader (`Gallery.tsx:223`, inside
`successorTo`) disappears with `successorTo` itself (§7), leaving the de-duplication guard at
line 280 as its only remaining purpose, which is exactly the purpose clearing serves.

### 4.0.2 A retry never re-pins the original, and never costs the re-pinch

`wantsOriginal` (`GalleryLightbox.tsx:303`) is keyed by item id and deliberately persists
for the whole lightbox session — zooming a slide, swiping away and returning must not need
a fresh gesture. That persistence creates a path an earlier draft missed:

1. the user zooms slide A, so `wantsOriginal` holds A
2. the user swipes away; A is now inactive and renders through the CLAMPED loader
3. A's clamped request fails, so A enters `failed`. `demotedRef` was never set, because no
   original failed
4. the user swipes back; A is active again, and `pinOriginal: wantsOriginal.has(item.id)`
   (`GalleryLightbox.tsx:987`) is still true

A naive remount at step 4 would retry at the ORIGINAL — the one thing the ratified answer
excludes.

**So entering `retrying` removes the id from `wantsOriginal`.** That, and only that.

**It must NOT also write `demotedRef`,** which an earlier draft proposed by analogy with the
demote path. `demotedRef` (`GalleryLightbox.tsx:312`) is written once
(`GalleryLightbox.tsx:1036`) and has **no delete or clear path anywhere in the component** —
verified by grep, its only other appearance is the read at `GalleryLightbox.tsx:367`. That
read is `markZoomIntent`'s early return, so an id in `demotedRef` can never re-acquire
`wantsOriginal` for the rest of the lightbox session. Writing it on retry would have made
the re-pinch this spec promises permanently impossible.

**And it is not needed here.** `demotedRef` exists for one hazard: the zoom library publishes
a scale above the commitment bound for as long as a gesture lasts, so a demote mid-pinch
would re-pin and loop (`GalleryLightbox.tsx:1019-1024`). On the retry path no gesture can be
live — a slide in `failed` renders the inert placeholder branch
(`GalleryLightbox.tsx:1192-1196`), which does not mount `TransformWrapper`, so
`markZoomIntent` has nothing to fire from. The guard has no hazard to guard.

After a successful retry the slide shows the clamped tier. A fresh pinch calls
`markZoomIntent`, which is not blocked, and the user gets full detail. That is the promised
behavior, reached by removing a write rather than adding one.

### 4.0.3 Per-item state: a registry asserted against a scanner, not a grep

Rounds 1 and 2 returned thirteen findings between them (eight then five), and six were the
same shape: a per-item variable whose lifetime the retry machine did not define. Patching
them one at a time is what the class-sweep rule exists to prevent.

**An earlier draft's closure was not actually derived, and round 3 was right to say so.** It
stated a grep — `const .*= (useRef|useState).*(Map|Set|id)` — over both components and called
its output a cover. A grep over declaration TEXT is a lexical scan, which is the exact shape
the class-sweep rule tells you not to trust: it silently misses a `Record<string, number>`,
an object literal, or any future member whose declaration spells none of those three tokens,
and it missed three existing members outright — `activeScale`, `requestedScaleRef` and
`controlsSlotRef`, all of which the current failure handler explicitly resets
(`GalleryLightbox.tsx:1110-1112`) and which are therefore item-scoped in exactly the sense
that matters here.

**The cover is a registry asserted against a scanner** — a new structural meta-test this
work creates, under `tests/components/diagrams/`, named for per-item state lifetime:

1. The scanner parses both component files and enumerates **every** `useState` and `useRef`
   declaration — all of them, with no filter on the declaration's text. Parsed, not
   pattern-matched, so a `Record`, an object literal, or a shape nobody has thought of yet is
   still enumerated.
2. The registry classifies each declaration by name as `per-item` or `not-per-item`, and
   every `per-item` row states its clear path. **[SUPERSEDED — §0]** ~~or the explicit words
   `deliberately none`~~ — that vocabulary was retired with its last user, `demotedRef`, once
   review showed the claim behind it was false.
3. The test fails when the scanner finds a declaration the registry does not classify.

That is what makes it fail by default: a member added later is unclassified, so the suite
reds until someone decides.

**RATIFIED, and the evidence is better than the argument.** On its very first run against the
live tree the scanner found a member no hand-derivation had: `prefersReducedMotion`
(`GalleryLightbox.tsx:257`). Both greps that preceded it — the one this section rejects, and
the tightened one used to draft this section — matched only `const [x, setX] = useState`, and
this declaration is `const [prefersReducedMotion] = useState(...)`, a single-element
destructure with no setter. Neither could see it. That is not a hypothetical gap in a lexical
scan; it is the gap, found in this file's own subject, by the replacement, immediately. AC-17 is that test. The classification is a judgement the
registry records; the ENUMERATION is mechanical, and the enumeration is the half that was
previously being trusted to a grep.

Current `per-item` rows:

| member | site | cleared by, after this change |
|---|---|---|
| `failedKeys` (gallery) | `Gallery.tsx:122` | entering `retrying`; the item going unavailable or leaving `items` (§9.1) |
| `pendingFailuresRef` | `Gallery.tsx:156` | entering `retrying` (§4.0.1); the item going unavailable or leaving `items` |
| `thumbRefs` | `Gallery.tsx:132` | React, on unmount. **Holds ONLY the healthy thumbnail button**; the retry control and the in-flight overlay get `retryControlRefs` and `retryingRefs` respectively **[was `retryRefs` — superseded, §0]** |
| `restoreTargetRef` | `Gallery.tsx:139` | re-pointed on every failure that removes the current target (§7) |
| `failedKeys` (lightbox) | `GalleryLightbox.tsx:293` | entering `retrying`; the item going unavailable or leaving `items` |
| `wantsOriginal` | `GalleryLightbox.tsx:303` | entering `retrying` (§4.0.2); the demote path, unchanged |
| `demotedRef` | `GalleryLightbox.tsx:312` | **[SUPERSEDED — §0]** ~~**deliberately none, unchanged.**~~ Cleared on a `snapshotRevisionId` change. This spec adds no write to it (§4.0.2) |
| `demotedNotice` | `GalleryLightbox.tsx:320` | its own timer; `failedKeys` gaining the id; the item going unavailable (§9.1) |
| `demoteTimerRef` | `GalleryLightbox.tsx:321` | cleared with `demotedNotice`, never separately |
| `activeScale` | `GalleryLightbox.tsx:272` | the active-slide error path already resets it (`GalleryLightbox.tsx:1110-1112`); a retry that returns the slide to `idle` leaves it at 1, which is correct for a freshly loaded clamped tier |
| `requestedScaleRef` | `GalleryLightbox.tsx:391` | same handler, same reason (`GalleryLightbox.tsx:1110`) |
| `controlsSlotRef` | `GalleryLightbox.tsx:380` | React, on `TransformWrapper` unmount. The `failed` branch does not mount it, so it is null for the whole failed-and-retrying window |
| `retrying` (NEW) | both | `onLoad`, `onError`, a slide going inactive (§4.0.4), the item going unavailable or leaving `items` |
| ~~`attempt`~~ **[SUPERSEDED — §0]** | — | DOES NOT SHIP. Its only purpose was to force the remount §4.0.5 forbids |
| ~~`focusOnMount`~~ **[SUPERSEDED — §0]** | `Gallery.tsx` | replaced by three per-transition hand-off refs plus one root-scoped focus rescue |
| ~~`retryRefs`~~ **[SUPERSEDED — §0]** | both | split into `retryControlRefs` and `retryingRefs`; React, on unmount |

### 4.0.4 A slide going inactive ends its retry

The lightbox control lives only on the ACTIVE slide (§2), so the active-to-inactive
transition has to say what happens to a retry in flight and to focus.

- **`retrying` is cleared and the id returns to `failedKeys`.** The retry `<Image>` unmounts
  with the active branch, so its request is abandoned and no `onLoad` or `onError` will
  arrive. Leaving the id in `retrying` would strand the slide showing a disabled
  `Retrying…` with nothing behind it, which is the state the reviewer named.
- **Focus moves to the Close button** if it was on the retry control, matching the
  destination the existing error path already uses when a focused lightbox element is about
  to unmount (`GalleryLightbox.tsx:1096-1103`). The Embla `select` handler preserves focus
  only for the two chevrons (`GalleryLightbox.tsx:405-409`), so nothing else would catch it.
- **The same destination covers the other two removals** of an active retry control: a
  successful retry, and `item.available` flipping false. In all three the control is gone and
  focus must not fall to `<body>`.

### 4.0.5 One tap is one request, and the bytes that arrive are the bytes that are shown

An earlier draft said `retrying` renders "a hidden `<Image>` actually loading" alongside the
control, and let `idle` render the image as it always had. Both halves were wrong, and the
second is expensive.

**The loaded image must survive `retrying → idle`.** If the in-flight image is a different
element from the one `idle` renders, React unmounts the first and mounts the second, and the
route sends `private, max-age=0, must-revalidate` with no validator (§3) — so the second
mount issues a fresh unconditional GET. The user would pay twice for one tap, and for an
originals-only entry that is up to 100 MB to display 50 MB, immediately after being told the
retry succeeded.

So: **the `<Image>` is mounted once, in its final position, for both `retrying` and `idle`.**
(RATIFIED — Task P2 measured +1 request for the remount shape and 0 for the surviving element:
`tests/e2e/image-remount-request-count.probe.spec.ts`.)
`retrying` differs only by an overlay above it carrying the in-flight control and
`Retrying…`. `onLoad` removes the overlay. Nothing about the image element changes, so
nothing remounts and no second request is issued. AC-1 asserts the node identity across the
transition, and AC-2 counts requests rather than only inspecting the URL.

**The in-flight image needs no `loading` override, and an earlier draft was wrong about why
it might.** That draft said a covered image at the `loading` default could be deferred
indefinitely, and specified `loading="eager"` while retrying. Task P3 measured it and the
mechanism does not hold: an uncovered off-screen lazy image is deferred exactly as a covered
one is, so the OVERLAY is not what defers — being off-screen is.

That distinction removes the requirement rather than restating it. The retry is reached by a
tap on the control, and a tap implies the cell is in the viewport, so the image `next/image`
mounts is intersecting at the moment it mounts and loads without help — **measured directly,
not inferred**: a lazy image mounted in view UNDER an opaque overlay issues its request
(`tests/e2e/covered-image-load-eligibility.probe.spec.ts`, the in-view arms), **in Chromium and
in WebKit**. Two review rounds were needed to get this evidence right: R2 found that three
off-screen arms show only that covering is not what defers, and R3 found that a Chromium-only
result cannot remove an attribute for every supported client when mobile Safari is a shipped
target. Both engines now agree on all five arms.

The stake in getting it right: if a covered in-view lazy image WERE deferred, neither `onLoad`
nor `onError` would fire, the control would sit on `Retrying…` indefinitely, and that is a
consequence-bound violation rather than a cosmetic gap. No `loading` prop is
set, which leaves `next/image` emitting its own `loading="lazy"` (`get-img-props`, lines 271
and 553) — correct here, and one less attribute than the rejected design.

**The in-viewport guarantee is enumerated, not assumed.** Every way the retry image can
mount today:

| path | in viewport when it mounts? |
|---|---|
| the user taps a visible failed cell | yes, by definition of tapping it |
| the user Tabs to the control and presses it | yes — focusing an element scrolls it into view |
| **[SUPERSEDED — see §0]** ~~`focusOnMount` focuses the retry button after a failure (§7)~~ | yes, same reason |
| the user scrolls away DURING the in-flight window | irrelevant: the request was issued at mount, which happened in view |
| the lightbox active slide | yes — only the ACTIVE slide carries a control (§2), and it is the one on screen |
| "Show more" expands the grid | mounts thumbnails, not retry images; a newly revealed failed cell has not been tapped |

There is no path that mounts a retry image off-screen, which is why no `loading` override is
needed rather than merely why one seems unnecessary.

**Re-file trigger:** if a retry ever becomes programmatic rather than tap-driven — an
automatic retry, a retry-all control, a retry fired without focus moving to the cell — the
guarantee above is gone and this decision is revisited.

The overlay's own constraint survives on a different and simpler ground: it must not be
`display: none` or `visibility: hidden` ON THE IMAGE and must not unmount it, because an image
that is not rendered has no layout box, and `next/image`'s lazy observer needs one to fire.
Painting OVER the image satisfies that; replacing it does not.

### 4.1 Guard conditions for every input

| input | null / empty / zero | behavior |
|---|---|---|
| `item.alt` | empty string | already handled: `nameOf(item, i)` falls back to the 1-based visible position (`Gallery.tsx`, used at `Gallery.tsx:293`). The retry control's accessible name uses the same helper, so it can never be nameless. |
| `item.variants` | `[]`, or malformed | `servingVariants` in `lib/images/diagramLoader.ts` drops malformed rows and the loader falls back to the original. The retry control is unaffected: it does not read `variants`. |
| `item.available` | `false` | no control (§4, `unavailable` row). |
| `item.blurDataURL` | absent | unchanged. The `retrying` state does not depend on it; the in-flight signal is text, not the blur. |
| **[SUPERSEDED — see §0]** ~~`attempt[id]`~~ | — | DOES NOT SHIP |
| rapid double-tap | — | the click handler returns early while the id is in `retrying`, and the control carries `aria-disabled`. NOT the native `disabled` attribute, which would eject focus (§7.1). |
| the item stops rendering mid-retry | — | the existing stale-handler guard (`Gallery.tsx:276-279`, `if (!button?.isConnected) return`) already covers `onError` after unmount; `onLoad` gets the same guard for the same reason. |

## 5. Copy

No em dashes, straight apostrophes, plain language. Run through the pre-code mechanical
gate before implementation, per the AGENTS.md pre-code UI checklist.

| slot | text |
|---|---|
| gallery cell, visible | `Tap to retry` (the cell is ~117px at `30vw` on a 390px phone; the diagram name does not fit) |
| gallery cell, accessible name | `<name> could not be loaded. Tap to retry.` — Eric's ratified shape, carried by the control's `aria-label` |
| gallery cell, in-flight visible | `Retrying…` |
| lightbox ACTIVE slide, visible | `Could not be loaded.` above a `Tap to retry` button (the slide is full-width; the name is already the `figcaption`) |
| lightbox ACTIVE slide, accessible name | `<name> could not be loaded. Tap to retry.` |
| announcement, retry succeeded | `<name> loaded.` |
| announcement, retry failed again | `<name> still could not be loaded.` |

### 5.1 Cost honesty: the copy differs by SURFACE, not by entry type

Eric asked that the copy stay honest about cost where it matters, and that the choice be
recorded either way. It is recorded here.

**The gallery thumbnail says nothing extra.** The cell is roughly 117px at `30vw` on a
390px viewport. There is no room, and more to the point there is nothing honest to put
there: the app cannot know the byte count before the request runs, because the asset route
sends no `Content-Length` the client can read in advance. An adjective would be vague and a
number would be invented. Both are worse than silence on a control the user reaches by
tapping a broken thumbnail.

**The lightbox ACTIVE slide adds one line, `Full size.`, and only for originals-only
entries.** The slide is full width, so the room is free, and the lightbox is where someone
is deliberately looking at one diagram rather than scanning twelve. `Full size` is the thing
we actually know to be true: there is no smaller tier, so this fetch is the whole object.

The predicate is `hasVariantTier(item.variants, item.key)`
(`lib/images/diagramLoader.ts`), already imported by `GalleryLightbox`. `Gallery` does not
need it, because its copy does not branch.

**In-flight copy stays `Retrying…` on both surfaces.** For a 50 MB fetch on venue wifi the
honest signal is that it stays on screen a long time, which it will. A second variant would
add a string without adding information.

The first-failure announcement is unchanged (`<name> could not be loaded.`,
`Gallery.tsx:293`). `Retrying…` uses the same single-character ellipsis and the same
label-swap shape as `components/admin/RetryWatchButton.tsx:24-26` and the same file at
line 48.

## 6. Accessibility

- The control is a real `<button type="button">`, so it is reachable by keyboard and
  carries the button role without ARIA.
- Its accessible name is tied to the diagram (§5), never a bare "Retry" — twelve bare
  "Retry" buttons in one grid is the failure mode.
- `aria-busy="true"` and `aria-disabled="true"` while retrying — never the native `disabled`
  attribute, which ejects focus from the button the user just pressed (§7.1).
- **The outcome is announced both ways** through the existing channel router
  (`routeAnnouncement`, `Gallery.tsx:238-253`), so a retry inside an open lightbox reaches
  the dialog-local region and one during the exit window is buffered, exactly as failures
  already are.
- **Inactive lightbox slides stay silent AND carry no control.** Embla keeps every slide
  mounted, and the existing rationale (`GalleryLightbox.tsx:1168-1171`) — announcing twelve
  diagrams the user has not swiped to — is why they do not speak. §2 gives the second half:
  a control on a slide that does not speak, inside an `aria-hidden` figure the focus trap
  still collects, is a Tab stop with no accessible representation. Silence and no control go
  together; either alone would be worse than both.

## 7. Focus — an AMENDMENT to the ratified relocation contract

The runtime-failed cell keeps focus instead of relocating to a sibling.

**This is an amendment, and it is dispositioned here rather than argued away.** An earlier
draft claimed the ratified rule (`2026-08-10` spec §4.2, AC-3) simply stops firing because
the focused button was not removed. That is false on two counts. The guard at
`Gallery.tsx:288` tests `document.activeElement === button` BEFORE the state update, so
adding a control cannot make it false. And the thumbnail button and the retry button are
different branches of one ternary, so the thumbnail button IS unmounted and focus IS lost
to `<body>` unless something moves it. AC-3 as ratified reads `a focused failing thumbnail relocates focus`, with no removal
qualifier to hang the reinterpretation on.

So: the machinery is kept in full and its TARGET changes, from `successorTo(item.id)` to the
failed cell's own retry button. That is a deliberate change to a ratified acceptance
criterion, taken because relocating away from the one control that fixes the problem,
immediately after announcing `Tap to retry`, is worse for every user and actively hostile to
a screen-reader user. The prior AC is superseded for the runtime-failure case only;
parse-time-unavailable cells never held focus, so nothing about them changes.

**Ordering constraint.** The retry button does not exist when `handleThumbnailFailure` runs;
it mounts in the commit that handler's state update causes. Focus is therefore moved from a
**[SUPERSEDED — §0]** ~~ref callback on the retry button, gated by a per-item `focusOnMount` flag the handler sets~~
and the callback clears. A synchronous `focus()` in the handler would target a node that has
not mounted.

Where §3.1 withholds the control, there is no button to hold focus, and the ratified
successor relocation is still the right and only behavior for those cells. This is the one
case that keeps the old target, and it is why `successorTo` cannot simply be deleted
unconditionally — see below.

**`successorTo` is DELETED.** It has exactly one caller (`Gallery.tsx:287`, verified by
grep), and under the ratified §3.1 every runtime-failed cell with `item.available` carries a
control, so focus always has somewhere to land inside the cell itself. Parse-time-unavailable
cells are the only ones without a control, and they never had a thumbnail button to hold
focus, so `handleThumbnailFailure` never runs for them. The caller has no remaining case:
`successorTo` goes, and with it the whole successor concept for runtime failures.

(An interim draft kept it, on the withhold that §3.1 no longer contains. That is recorded
here only so the deletion is not mistaken for an oversight.)

**This dissolves round 2's third finding rather than repairing it.** That finding was that
clearing `pendingFailuresRef` on retry would make a `disabled` in-flight retry button
eligible in `usable` (`Gallery.tsx:222-225`), and `focus()` on a disabled element is a
no-op, so focus would land on `<body>` — the ratified rule's own failure mode, reintroduced
by its repair. With the predicate deleted there is no eligibility question. Two guards
proposed against that finding are dropped with it, and one is kept for an independent
reason:

- DROPPED: adding a `retrying`/`failedKeys` conjunct to `usable`. There is no `usable`.
- KEPT: **`thumbRefs` holds only the healthy thumbnail button, and the retry button gets its
  own map** **[SUPERSEDED — §0]** ~~`retryRefs`~~ — shipped as `retryControlRefs` and `retryingRefs` (§4.0.3). Not for eligibility any more, but because §7's focus move
  and §4's focus hand-offs **[SUPERSEDED — §0]** ~~`focusOnMount`~~ need to address the retry button specifically, and a shared map
  cannot say which kind of button an id currently holds.

AC-15 is restated accordingly: no successor-hop exists at all. It is a source-scan guard
rather than only a behavioral one, because a behavioral test passes if someone reintroduces
the helper unused.

**Blast radius, enumerated — and it grew when §3.1 reversed.** The seven cases in
`tests/components/diagrams/gallery.failedItem.test.tsx:429-527` and the two dialog cases at
`tests/components/diagrams/gallery.failedItem.test.tsx:686` and the same file at line 706
assert focus moves off a failing thumbnail. All nine build items through the shared helper
at `tests/components/diagrams/gallery.failedItem.test.tsx:264-273`, which sets
`variants: []` — confirmed by round 2's reviewer.

Under the withhold that made them the no-control case and they would have passed unchanged.
**Under the override it makes them the control case, so all nine change expectation**: focus
stays on the failed cell's retry button. That is the larger reading, and it is the one that
now holds. No case is deleted; the plan's blast-radius table gives the per-test disposition,
and the case that asserts focus never lands on `<body>`
(`tests/components/diagrams/gallery.failedItem.test.tsx:480`) survives unchanged and becomes
a stronger claim.

The one case that needs more than a retargeted expectation is
`tests/components/diagrams/gallery.failedItem.test.tsx:470`, "with no control at all it
relocates to the gallery list itself". Its premise — a grid where nothing focusable remains
— is now unreachable, because a failed cell always carries a control. It is rewritten as
the positive claim rather than deleted, since the property it was defending (focus never
falls out of the gallery) still matters.

### 7.1 Every control removal names its focus destination, and the in-flight control is NOT natively `disabled`

An earlier draft said the in-flight control is `disabled`, by analogy with
`components/admin/RetryWatchButton.tsx:42`. **That is wrong on a control that currently holds
focus**, and this repository already records why: setting `disabled` on a focused button makes
Chrome and Firefox eject focus to `<body>`
(`components/admin/RecentAutoAppliedStrip.tsx:371-380`, which carries a worked description of
the same trap and the workaround it needed). Since the whole point of §7 is that the user's
focus is ON this control when they press it, `failed → retrying` would drop focus to `<body>`
immediately — the exact failure the amendment exists to avoid, reintroduced by the amendment.

**So the in-flight control uses `aria-disabled="true"` plus an early-returning click handler,
never the native attribute.** (RATIFIED — Task P1 measured both arms in Chromium and both
behaved as claimed: `tests/e2e/focus-disabled-eject.probe.spec.ts`.) It stays focusable, focus stays put, and assistive technology
still reports it as unavailable. `aria-busy="true"` is unchanged. `RetryWatchButton`'s native
`disabled` is correct for its own site, where the button is not the focus origin; it is not a
precedent for this one.

Every other transition that REMOVES a control names its destination, so no path is left to
`<body>`:

| transition | control removed? | focus goes to |
|---|---|---|
| `failed → retrying` (gallery and lightbox) | the failed control is replaced by a separate in-flight overlay | relocated by an explicit hand-off. This is why the overlay must not be natively `disabled` |
| `retrying → idle` (gallery) | yes, the image returns | the cell's `<button>` wrapper, which is the healthy thumbnail's own control and is focusable |
| any control removal not listed above | yes | the gallery list (`listRef`), via the single focus rescue. **AMENDED 2026-08-29 (R2 finding 1):** this table originally enumerated destinations per transition, and that enumeration was the defect — each round found a removal path it had not listed. The rescue now asks where focus IS after any commit rather than predicting which transitions can strand it |
| `retrying → failed` | **[SUPERSEDED — §0]** ~~no, same node~~ — the in-flight overlay is REPLACED by the failed control | relocated by explicit hand-off |
| any session state → `unavailable` (gallery) | yes, nothing focusable remains in the cell | the gallery list (`listRef`), the existing last-resort destination (`Gallery.tsx:130`) |
| active slide's control removed for any reason (retry succeeds, slide goes inactive, item goes unavailable) | yes | the dialog's Close button, matching the existing error path (`GalleryLightbox.tsx:1096-1103`) |
| a thumbnail fails while its lightbox is OPEN | n/a — focus is inside the dialog | untouched. `restoreTargetRef` is re-pointed to the new retry button so CLOSING lands correctly, which is a different thing from moving focus now |

The last row is the distinction the focus hand-offs must respect **[SUPERSEDED — §0]** ~~`focusOnMount`~~: it means "focus this button
when it mounts" only when focus was on its predecessor in the gallery, and never when the
dialog is open. Otherwise a failure behind an open lightbox would steal focus out of the
modal. `lightboxOpenRef` (`Gallery.tsx:169`) is the existing signal for that, already read by
the announcement router.

## 8. Dimensional invariants

The gallery cell is a fixed-aspect parent (`aspect-square`, `Gallery.tsx:351`) with a flex
child, and this project's Tailwind v4 does not default `.flex` to `align-items: stretch`.

| parent | child | guarantee |
|---|---|---|
| `<li>` `aspect-square overflow-hidden` (`Gallery.tsx:351`) | retry `<button>` | `size-full` on the button, matching what the healthy thumbnail button already carries (`Gallery.tsx:382`) |
| retry `<button>` | icon + label column | `flex size-full flex-col items-center justify-center`, the placeholder `<div>`'s existing classes (`Gallery.tsx:416`) moved onto the button |
| retry `<button>` | tap target | the cell is the target. At `30vw` on a 390px viewport that is ~117px, comfortably past the 44px floor; `min-h-tap-min` (`Gallery.tsx:430`) is added anyway so the guarantee does not depend on the viewport |

The plan carries a real-browser `getBoundingClientRect` assertion that the retry button's
height equals the cell's within 0.5px, per the writing-plans layout-dimensions rule. jsdom
cannot establish this.

No new tokens: every class above already ships in `Gallery.tsx`.

## 9. Transition inventory

Four render states (§4), so `4*3/2 = 6` pairs. An earlier draft called three of them
unreachable on the strength of `key={item.id}` forcing a remount when `item.available`
flips. **That is wrong** — an unchanged key preserves component identity and remounts
nothing, so session state survives a props flip and every pair below is reachable.

| pair | treatment |
|---|---|
| idle → failed | instant swap, no animation. Matches the existing instant swap. |
| failed → retrying | instant. **[SUPERSEDED — §0]** ~~The control keeps its node and re-labels~~ — a SEPARATE overlay replaces the failed control; the `<Image>` MOUNTS in its FINAL position beneath the overlay in the same commit (§4.0.5), which is the point of the transition. |
| retrying → idle | instant. The `<Image>` becomes visible on `onLoad` and the control unmounts in the same commit. |
| retrying → failed | instant. **[SUPERSEDED — §0]** ~~label swap back, same node~~ — the overlay is replaced by the failed control. |
| idle → retrying | unreachable by construction: `retrying` is entered only from `failed`, and only by a tap on a control that exists only in `failed`. |
| any session state ↔ unavailable | reachable in both directions and instant. `item.available` flipping does not remount the cell, so the rules below are load-bearing rather than theoretical. |

### 9.1 The `unavailable` boundary, since it is reachable

**The clear happens when the item goes unavailable, not when it comes back.** (UNRATIFIED,
U-6 — Task 7 settles it.) An earlier
draft did the opposite, and the ordering was the whole defect: an effect that runs AFTER
`item.available` becomes true leaves the first render observing a retained `retrying` id,
which mounts the retry `<Image>` and starts a request nobody asked for. This spec excludes
automatic retry (§12), so that render is a contract violation, not a cosmetic race.

Clearing on the way in has no such window. All three session states require
`item.available` (§4), so between the flip to false and the effect, the retained ids render
nothing at all. A late clear cannot produce a wrong frame because there is no frame it
could affect.

- **`failed`/`retrying` → `unavailable`** (a resync unpublishes the item): the cell renders
  the inert placeholder immediately, because `item.available` gates every session state. The
  effect keyed on `item.available` becoming false then clears the id from `failedKeys`,
  `retrying` and `pendingFailuresRef`. Any in-flight `<Image>` unmounts with the branch and
  its handlers are dropped by the connectedness guard (§4.1).
- **The zoom members are cleared by the same sweep, and leaving them out was the SECOND
  instance of this defect.** `activeScale` (`GalleryLightbox.tsx:272`) and `requestedScaleRef`
  (`GalleryLightbox.tsx:391`) are reset only by the active-slide ERROR path
  (`GalleryLightbox.tsx:1110-1112`), which an availability flip does not run. So a zoomed slide
  that goes unavailable keeps `activeScale > 1`, the Reset chip stays rendered because its
  predicate is `zoomed` (`GalleryLightbox.tsx:726`), and `controlsSlotRef` is null because the
  unavailable branch does not mount `TransformWrapper` — a visible control whose action cannot
  fire, with `watchDrag` still disabled underneath it. The sweep resets both to 1, which hides
  the chip and re-enables the drag by the component's own existing predicates rather than by
  new logic. `controlsSlotRef` needs no sweep entry: React nulls it on that unmount, and the
  chip it would have stranded is gone once `activeScale` is 1.
- **`restoreTargetRef` is cleared by the same sweep, and it was the THIRD instance.** Plan
  review R4: the failure closure at `Gallery.tsx:274` runs on a FAILURE, and an availability
  flip is not one. So a thumbnail that opened the lightbox and then goes unavailable leaves
  this ref naming a detached button; `useDialogFocus` calls `focus()` on it at close
  (`lib/a11y/dialogFocus.ts:90`) and focus falls to `<body>` — the exact outcome AC-6 forbids,
  and the exact path that file's own comment describes.
- **`wantsOriginal` is cleared by the same sweep, and leaving it out was a real defect.**
  Plan review R2 found it: the member has no availability clear path, so a slide that is
  zoomed, goes unavailable, and comes back still holds its id — and `pinOriginal:
  wantsOriginal.has(item.id)` (`GalleryLightbox.tsx:987`) then makes the returning ACTIVE
  slide request the original immediately, with no gesture and no tap. That is precisely what
  §4.0.2 exists to prevent, reached by a route §4.0.2 does not cover. The user's zoom intent
  did not survive the item being unpublished and republished; treating it as if it did costs
  up to 50 MB on a slide nobody asked to see at full detail.
- **`demotedNotice` and `demoteTimerRef` are cleared by the same effect.** The chip's
  predicate tests `demotedNotice.id`, its nonce, and `!failedKeys.has(id)`
  (`GalleryLightbox.tsx:789-791`) — **not `item.available`**. So without this, a demoted
  slide that goes unavailable keeps showing the `Full detail unavailable` chip stacked over
  the `Image unavailable` placeholder until the timer expires. The predicate also gains `item.available` directly,
  so the chip cannot render over an unavailable slide even for the one frame before the
  effect runs. Belt and brace, deliberately: the predicate fixes the frame, the effect fixes
  the timer.
- **An item REMOVED from `items` never flips `available` at all**, so an effect keyed on
  that prop would never run for it. The sweep is therefore keyed on the rendered id set, not
  on a per-item flag: one effect diffs `items` and drops every session-state entry whose id
  is no longer present OR whose item is no longer `available`. A stable id that later returns
  then arrives clean, rather than resurrecting a `retrying` entry and issuing a request
  nobody asked for.
- **`unavailable` → `idle`**: nothing to clear, because the way in already did it. The cell
  returns as `idle` by construction rather than by an effect winning a race.
- **`failed` → `unavailable` → `available`**: same. The round trip cannot land in `failed`
  with a control offering to retry an asset the manifest just republished.

Compound transitions:

- **Retry outcome lands while the lightbox is mid-exit.** Buffered and flushed on
  `onExitComplete`, through the `exitBufferRef` path failures already use
  (`Gallery.tsx:267-272`). Pinned.
- **A sibling fails while this cell is retrying.** Independent per-item state, both sets
  keyed by id. Pinned.
- **The user taps retry twice.** Impossible by §4.1 (`disabled` while retrying), pinned as
  such rather than assumed.
- **A retry succeeds after the user swiped to another slide.** The connectedness guard
  (§4.1) drops it if the node is gone; otherwise the slide updates silently, since inactive
  slides do not announce (§6).
- **A slide is zoomed, swiped away, fails inactive, and is swiped back.** §4.0.2. The retry
  clears `wantsOriginal` and deliberately does NOT write `demotedRef`, so it cannot re-pin
  the original AND a later re-pinch still works. Pinned
  with an assertion on the requested tier, not merely on the outcome.

## 10. Documented limits

Each is a conservative outcome plus a surfaced signal, not silent corruption, so each files
here rather than as a finding.

1. **A retry cannot fix a genuinely absent object.** A 410 from the asset route
   (`app/api/asset/diagram/[show]/[rev]/[key]/route.ts:62` and the same file at line 68)
   means the revision no longer lists that key; every retry fails the same way. The control
   stays offered and the announcement says so each time. Distinguishing 410 from a transport
   failure needs the fetch status, which an `<img>` `onError` does not expose. Re-file
   trigger: the asset route gaining a client-visible status channel.
2. **No backoff, no retry cap.** A user can tap repeatedly. For a laddered entry each tap is
   bounded by the 1024 tier (§3); for an originals-only entry it is bounded by the route's
   50 MB cap (§3.1, §10.5). The control refuses further taps while one is in flight, so the
   worst case is user-paced either way. Re-file trigger: a report of a crew member hammering
   a dead diagram, or telemetry showing it.
3. **The retry may select a different ladder tier than the one that failed.** The browser
   picks from the `srcSet` candidate set and a viewport, orientation or DPR change between
   the failure and the tap can move that pick (§3). Bounded by the ladder, never the
   original. Re-file trigger: a `sizes` or ladder change that widens the candidate set.
4. **An inactive lightbox slide that fails carries no control until the user swipes to it.** §2
   gives the reason: a control there would be an off-screen Tab stop with no accessible
   representation. The recovery exists and costs one swipe. Re-file trigger: the dialog focus
   trap gaining `aria-hidden`-ancestor exclusion, which would remove the objection.
5. **A retry on an originals-only diagram can transfer up to 50 MB, and the app cannot
   know the size before the request runs.** There is no `Content-Length` until the response
   arrives, so no number can be shown in advance. Ratified in §3.1 with the ceiling stated.
   The control is disabled while in flight, so the worst case is user-paced. Re-file
   trigger: the variant pipeline gaining a fallback tier for GIFs and sub-256px sources,
   which would remove the case entirely.
6. **RETRACTED — the e2e failure path is built here, not deferred.** An earlier draft
   fenced it out as a separate arc, which contradicted AC-7: the writing-plans rule makes a
   real-browser layout assertion mandatory for a fixed-dimension parent, and the retry
   button only exists in the failed state, so the fence removed the only admissible setup
   for a measurement the same document required. The fence was wrong, not the requirement.
   It is also cheap to retract: `page.route` is established in this suite (six specs use it,
   e.g. `tests/e2e/published-review-modal.prefetch.spec.ts:115`), so aborting the diagram
   asset request is a few lines rather than a harness. §8's measurement runs against that.
7. **A `swept: true` row records that a decision EXISTS, not that it is TRUE.** §4.0.3's
   registry requires a typed `{ swept, why }` on every per-item member, and the meta-test
   refuses a missing decision, a `false` without a reason, and a field gone decorative. None
   of that checks the decision against behaviour, because the registry holds prose and has no
   observation hook: it cannot render the component and see what a member actually does.
   **Its instance, found by plan review R5 and repaired in this branch:** `activeScale` was
   marked `swept: true` while the Reset chip's render condition
   (`components/diagrams/GalleryLightbox.tsx:726`) tested only `zoomed`. The sweep cleared the
   ref; the predicate was never gated; a zoomed item going unavailable rendered one commit
   holding an enabled Reset button whose `controlsSlotRef` was already null. An executed React
   probe observed `{available:false, activeScale:2, resetVisible:true}` before cleanup. That is
   the same visible-control-whose-action-cannot-fire shape R3 found on this component, so the
   structural cover closed the enumeration and not the class. What closes the behaviour is the
   per-member case in Task 7, one per rendered member, not the registry row. Re-file trigger: a
   third instance of this shape, which would say the per-member cases are not being written and
   the gap needs a mechanical oracle rather than a documented limit.

## 11. Acceptance criteria

- **AC-1** Tapping retry on a failed gallery thumbnail re-requests the image; on success the
  cell shows the diagram again, in the same page session, with no reload. The `<img>` element
  that loaded is the SAME node the idle cell then shows, asserted by node identity across the
  transition (§4.0.5).
- **AC-2** One tap issues exactly ONE request for the asset, counted in a real browser, and
  the `srcSet` candidate set the retry renders equals the set rendered before the failure.
  For a laddered entry that set contains no original-tier URL. Asserted against the rendered
  attribute and a request count, not a written-out URL, because the browser and not the app
  picks the candidate (§3, §4.0.5).
- **AC-3** Both outcomes are announced by name, on the channel audible at the time (gallery
  region, dialog region, or buffered through the exit window).
- **AC-4** The in-flight control shows `Retrying…`, carries `aria-busy="true"` and
  `aria-disabled="true"`, does NOT carry the native `disabled` attribute, and still holds
  focus after the transition (§7.1).
- **AC-5** A parse-time-unavailable item shows no control. An originals-only item DOES
  show one, and its active-slide variant renders the `Full size.` line (§3.1, §5).
- **AC-6** A runtime-failed cell keeps focus on its retry control. Focus never reaches
  `<body>` on ANY transition that removes a control (§7.1).
- **AC-7** In a real browser, the retry button's box equals the cell's within 0.5px (§8).
- **AC-8** The lightbox demote path is untouched: an original-tier failure with a smaller
  tier still demotes rather than offering retry.
- **AC-9** A retry on the active slide never requests the original, including for a slide
  that holds `wantsOriginal` from an earlier zoom (§4.0.2).
- **AC-10** After a successful retry, a SECOND failure of the same item announces and shows
  the control again — `pendingFailuresRef` does not swallow it (§4.0.1).
- **AC-11** An item that goes unavailable and available again returns to `idle`, with no
  retained placeholder or control, and every member the §4.0.3 registry marks `swept: true` is
  observably clear through the component's own rendered surface. The registry is prose plus a
  typed sweep decision, not a handle on private hook state, so the oracle is the DOM and the
  requested URLs — not reflection over the registry, which plan review R3 correctly said it
  cannot support. The registry's job is to make the LIST complete; this criterion's job is to
  check the behaviour.
- **AC-18** A slide that is zoomed, goes unavailable, and returns does NOT request the
  original: `wantsOriginal` did not survive the round trip (§9.1).
- **AC-12** No retry control is rendered on an inactive lightbox slide (§2).
- **AC-13** A retry does not write `demotedRef`, so a re-pinch after a successful retry
  still reaches the original (§4.0.2).
- **AC-14** A demoted slide that goes unavailable shows no demote chip, in the first frame
  and after its timer would have expired (§9.1).
- **AC-15** `successorTo` is gone and no successor-hop returns, asserted by a source scan
  as well as behaviorally (§7).
- **AC-16** A slide swiped away mid-retry does not return holding a disabled `Retrying…`,
  and focus does not reach `<body>` when its control unmounts (§4.0.4).
- **AC-17** Every per-item member of the §4.0.3 table has a clear path, or a row saying
  **[SUPERSEDED — §0]** ~~deliberately none~~ — that vocabulary was retired with its last user. Asserted as a source-derived guard over the grep in that section, so a
  new member fails by default.

## 12. Out of scope

- Automatic retry, backoff, or any retry the user did not ask for. The zoom gate's whole
  premise is that expensive fetches are user-triggered.
- Changing the asset route's cache headers or adding an ETag. That would be a real
  improvement and it is a different arc with a different blast radius.
- The `2026-08-10` demote path, chip, and zoom gate (§1.1).

## 13. Round-1 review dispositions

Round 1 returned BLOCKING with eight findings. All eight were verified against the code and
all eight are repaired here. Recorded so a later round does not re-derive them, and so the
reversals are fenced in both directions.

| # | finding | disposition |
|---|---|---|
| 1 | a slide holding `wantsOriginal` that fails while INACTIVE would retry at the original when swiped back | CONFIRMED. §4.0.2: entering `retrying` clears `wantsOriginal`. **The `demotedRef` half of this repair was itself wrong and round 2 caught it — see §14 finding 1.** AC-9 pins the requested tier. |
| 2 | §7 amended the ratified focus contract while claiming to preserve it | CONFIRMED, and I had reached the same conclusion independently while enumerating the blast radius. §7 is now titled and argued as an amendment with its disposition. |
| 3 | the byte-identical-URL claim is false; `next/image` emits a `srcSet` and the browser picks | CONFIRMED. §3 restated: the bound is the candidate SET, which for a laddered entry never contains the original. AC-2 now asserts the rendered `srcSet`, since a single-URL assertion cannot observe browser selection. |
| 4 | a control on an inactive slide is `aria-hidden` yet still collected by the focus trap | CONFIRMED. §2: inactive slides get no control at all. §10.4 records the cost and its re-file trigger. |
| 5 | `pendingFailuresRef` is add-only, so a second failure after a successful retry would be swallowed | CONFIRMED. §4.0.1: the `failed → retrying` transition clears it. AC-10 pins the second failure. |
| 6 | `key={item.id}` does not force a remount when `item.available` flips, so three "unreachable" pairs are reachable | CONFIRMED. §9.1 defines all three, and `item.available` is now a conjunct of every session state so `retrying` and `unavailable` cannot both hold. AC-11 pins the round trip. |
| 7 | offering retry on originals-only entries picks the other fork of the deferred product question | CONFIRMED. §3.1 reversed: the control is withheld, which is the literal reading of the ratification. Escalated to the product owner separately; until answered, withheld ships. |
| 8 | the cost ceiling is the route's 50 MB cap, not 1-5 MB, and "a narrow source is tiny" is unsupported | CONFIRMED. §3 states 50 MB with the constant cited; the narrow-source premise is retracted in §3.1, since `lib/sync/diagramVariants.ts:75` tests width only. |

**Fenced in both directions**, per the reversal rule: findings 3 and 7 each reversed a claim
this spec previously made. Neither reversal is reopened by re-arguing the original — §3 has
the srcSet mechanism cited in the framework source, and §3.1 has the ratification wording.

**Finding 7 was then decided the other way by the product owner.** Review was right that it
was a product fork this spec should not settle; it was escalated, and Eric chose to offer the
control at original cost, knowing the ceiling is 50 MB. §3.1 carries all three positions and
the reason the same argument does not reach §2.

## 14. Round-2 review dispositions

Round 2 returned BLOCKING with five findings. All five verified, all five repaired. The
reviewer also positively confirmed two watchpoints the round-2 brief named: all nine
relocation fixtures use `variants: []`, and a laddered `srcSet` cannot resolve to the
original through `servingVariants`.

| # | finding | disposition |
|---|---|---|
| 1 | writing `demotedRef` on retry makes the promised re-pinch permanently impossible; it has no clear path | CONFIRMED. §4.0.2 now removes a write instead of adding one: retry clears `wantsOriginal` and does NOT touch `demotedRef`. Its guard has no hazard on this path, because a `failed` slide does not mount `TransformWrapper`. AC-13. |
| 2 | the availability clear runs too late, and `demotedNotice`/`demoteTimerRef` were omitted | CONFIRMED. §9.1 inverted: the clear happens when the item goes UNAVAILABLE, where no render can observe the retained state. The chip predicate also gains `item.available`. AC-11, AC-14. |
| 3 | clearing `pendingFailuresRef` makes an in-flight retry button eligible in `successorTo` | CONFIRMED, then DISSOLVED. The product owner's override gives every runtime-failed cell a control, so focus never leaves the cell and `successorTo` has zero callers. §7 deletes it, which removes the eligibility question rather than repairing it. The `retryRefs` split is kept for an independent reason stated there. AC-15. |
| 4 | the active-to-inactive lifetime of the new control is undefined | CONFIRMED. §4.0.4 defines it: `retrying` clears and the id returns to `failedKeys`; focus moves to Close, the destination the existing error path already uses. AC-16. |
| 5 | AC-7 cannot be discharged under §10.6's own e2e fence | CONFIRMED. §10.6 RETRACTED. The fence was mine and it contradicted a mandatory rule; `page.route` is already established in six specs, so the setup is a few lines. |

**The class, not the five instances.** Six of the thirteen findings across rounds 1 and 2 (eight
then five) were one shape: per-item state whose lifetime the retry machine did not define. §4.0.3 closes it with
a derived cover — every `useState`/`useRef` in either component keyed by or holding an item
id gets a row, produced by a grep the section states, so a member added later fails by
default rather than being silently exempt. AC-17 makes that executable. Per the
structural-defense-calibration rule, it ships in this repair commit rather than waiting for a
third round to confirm the class.
