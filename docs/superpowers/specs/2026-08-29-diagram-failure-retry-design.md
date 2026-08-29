# Diagram failure retry — design spec (2026-08-29)

Closes `DIAGRAM-FAILURE-RECOVERY-1` (DEFERRED.md). Branch `feat/diagram-failure-retry`.

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

What survives, and is the actual bound: **the retry draws from the same candidate set the
failed render offered, and for any entry with a variant ladder that set never contains the
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
| `failed` | `item.available && failedKeys.has(id) && !retrying.has(id)` | retry control, or the inert placeholder where §3.1 withholds it |
| `retrying` | `item.available && retrying.has(id)` | in-flight control **plus** a hidden `<Image>` actually loading |
| `unavailable` | `!item.available` | today's placeholder, no control |

`item.available` is a conjunct of all three session states, so they cannot overlap with
`unavailable`. An earlier draft omitted it from `retrying` and the two could both hold.

`retrying` is a second `ReadonlySet<string>`, mirroring the `failedKeys` idiom already in
both files, plus a per-item `attempt` counter that keys the `<Image>` so a remount happens.

Transitions, exactly:

- **`failed` → `retrying`**: add the id to `retrying`, increment `attempt[id]`, remove the
  id from `failedKeys`, **and delete it from `pendingFailuresRef`** (see below). Removing it
  from `failedKeys` is what makes that set non-terminal; the `retrying` membership is what
  keeps the cell from flashing the image before it loads.
- **`retrying` → `idle`**: `onLoad` removes the id from `retrying`.
- **`retrying` → `failed`**: `onError` removes the id from `retrying` and adds it back to
  `failedKeys`. `attempt[id]` is NOT reset, so a third tap remounts again.

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

### 4.0.3 Per-item state has a lifetime table, because four rounds' findings were this class

Rounds 1 and 2 returned six findings between them, and every one was the same shape: a
per-item variable whose lifetime the retry machine did not define. Patching them one at a
time is what the class-sweep rule exists to prevent, so the closure is a **derived** cover
rather than a longer list of instances.

The cover is every `useState`/`useRef` in either component whose value is keyed by, or holds,
an item id. Derived mechanically rather than enumerated by hand:

```
grep -nE 'const .*= (useRef|useState).*(Map|Set|id)'   components/diagrams/Gallery.tsx components/diagrams/GalleryLightbox.tsx
```

Seven existing members, plus `restoreTargetRef` and `demoteTimerRef`, which hold a node and
a timer belonging to one item and so are item-scoped without matching that pattern. Every
member gets a row. A member with no row is a defect in this table, not an omission the
implementation may improvise around.

| member | site | cleared by, after this change |
|---|---|---|
| `failedKeys` (gallery) | `Gallery.tsx:122` | entering `retrying`; the item going unavailable (§9.1) |
| `pendingFailuresRef` | `Gallery.tsx:156` | entering `retrying` (§4.0.1); the item going unavailable |
| `thumbRefs` | `Gallery.tsx:132` | React, on unmount. **Holds ONLY the healthy thumbnail button**; the retry button gets its own `retryRefs` map (§7), so an id's entry unambiguously says which kind of button it currently holds |
| `restoreTargetRef` | `Gallery.tsx:139` | re-pointed on every failure that removes the current target (§7) |
| `failedKeys` (lightbox) | `GalleryLightbox.tsx:293` | entering `retrying`; the item going unavailable |
| `wantsOriginal` | `GalleryLightbox.tsx:303` | entering `retrying` (§4.0.2); the demote path, unchanged |
| `demotedRef` | `GalleryLightbox.tsx:312` | **nothing, unchanged.** This spec adds no write to it. Its absence of a clear path is pre-existing and now load-bearing (§4.0.2) |
| `demotedNotice` | `GalleryLightbox.tsx:320` | its own timer; `failedKeys` gaining the id; **and now the item going unavailable** (§9.1) |
| `demoteTimerRef` | `GalleryLightbox.tsx:321` | cleared with `demotedNotice`, never separately |
| `retrying` (NEW) | both | `onLoad`, `onError`, a slide going inactive (§4.0.4), the item going unavailable |
| `attempt` (NEW) | both | never. Monotonic per item; that is what makes it a usable remount key |
| `focusOnMount` (NEW) | `Gallery.tsx` | the retry button's ref callback, on consume (§7) |
| `retryRefs` (NEW) | both | React, on unmount |

### 4.0.4 A slide going inactive ends its retry

The lightbox control lives only on the ACTIVE slide (§2), so the active-to-inactive
transition has to say what happens to a retry in flight and to focus.

- **`retrying` is cleared and the id returns to `failedKeys`.** The hidden `<Image>`
  unmounts with the active branch, so its request is abandoned and no `onLoad` or `onError`
  will arrive. Leaving the id in `retrying` would strand the slide showing a disabled
  `Retrying…` with nothing behind it, which is the state the reviewer named.
- **Focus moves to the Close button** if it was on the retry control, matching the
  destination the existing error path already uses when a focused lightbox element is about
  to unmount (`GalleryLightbox.tsx:1096-1103`). The Embla `select` handler preserves focus
  only for the two chevrons (`GalleryLightbox.tsx:405-409`), so nothing else would catch it.
- **The same destination covers the other two removals** of an active retry control: a
  successful retry, and `item.available` flipping false. In all three the control is gone and
  focus must not fall to `<body>`.

### 4.1 Guard conditions for every input

| input | null / empty / zero | behavior |
|---|---|---|
| `item.alt` | empty string | already handled: `nameOf(item, i)` falls back to the 1-based visible position (`Gallery.tsx`, used at `Gallery.tsx:293`). The retry control's accessible name uses the same helper, so it can never be nameless. |
| `item.variants` | `[]`, or malformed | `servingVariants` in `lib/images/diagramLoader.ts` drops malformed rows and the loader falls back to the original. The retry control is unaffected: it does not read `variants`. |
| `item.available` | `false` | no control (§4, `unavailable` row). |
| `item.blurDataURL` | absent | unchanged. The `retrying` state does not depend on it; the in-flight signal is text, not the blur. |
| `attempt[id]` | absent | treated as `0`. A missing counter means "never retried", which is the correct initial key. |
| rapid double-tap | — | the control is `disabled` while `retrying`, so the second tap cannot fire. This is the same guard `RetryWatchButton.tsx:42` uses. |
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
- `aria-busy` and `disabled` while retrying, matching `RetryWatchButton.tsx:42-43`.
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
ref callback on the retry button, gated by a per-item `focusOnMount` flag the handler sets
and the callback clears. A synchronous `focus()` in the handler would target a node that has
not mounted.

Where §3.1 withholds the control, there is no button to hold focus, and the ratified
successor relocation is still the right and only behavior for those cells. This is the one
case that keeps the old target, and it is why `successorTo` cannot simply be deleted
unconditionally — see below.

**`successorTo` is DELETED, and the override is what settles it.** It has exactly one
caller (`Gallery.tsx:287`, verified by grep). Whether that caller survives turned on §3.1,
and §3.1 moved twice:

- while originals-only entries were withheld a control, those cells still relocated to a
  sibling, so the caller remained and its eligibility predicate needed tightening
- under the ratified override every runtime-failed cell with `item.available` gets a
  control, so focus always has somewhere to land inside the cell itself

Parse-time-unavailable cells are the only ones left without a control, and they never had a
thumbnail button to hold focus, so `handleThumbnailFailure` never runs for them. The caller
therefore has no remaining case: `successorTo` goes, and with it the whole successor
concept for runtime failures.

**This dissolves round 2's third finding rather than repairing it.** That finding was that
clearing `pendingFailuresRef` on retry would make a `disabled` in-flight retry button
eligible in `usable` (`Gallery.tsx:222-225`), and `focus()` on a disabled element is a
no-op, so focus would land on `<body>` — the ratified rule's own failure mode, reintroduced
by its repair. With the predicate deleted there is no eligibility question. Two guards
proposed against that finding are dropped with it, and one is kept for an independent
reason:

- DROPPED: adding a `retrying`/`failedKeys` conjunct to `usable`. There is no `usable`.
- KEPT: **`thumbRefs` holds only the healthy thumbnail button, and the retry button gets its
  own `retryRefs` map** (§4.0.3). Not for eligibility any more, but because §7's focus move
  and §4's `focusOnMount` need to address the retry button specifically, and a shared map
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
| failed → retrying | instant label swap within the same button node. The hidden `<Image>` MOUNTS in this same commit, which is the point of the transition. |
| retrying → idle | instant. The `<Image>` becomes visible on `onLoad` and the control unmounts in the same commit. |
| retrying → failed | instant label swap back, same node. |
| idle → retrying | unreachable by construction: `retrying` is entered only from `failed`, and only by a tap on a control that exists only in `failed`. |
| any session state ↔ unavailable | reachable in both directions and instant. `item.available` flipping does not remount the cell, so the rules below are load-bearing rather than theoretical. |

### 9.1 The `unavailable` boundary, since it is reachable

**The clear happens when the item goes unavailable, not when it comes back.** An earlier
draft did the opposite, and the ordering was the whole defect: an effect that runs AFTER
`item.available` becomes true leaves the first render observing a retained `retrying` id,
which mounts the hidden `<Image>` and starts a request nobody asked for. This spec excludes
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
- **`demotedNotice` and `demoteTimerRef` are cleared by the same effect.** The chip's
  predicate tests `demotedNotice.id`, its nonce, and `!failedKeys.has(id)`
  (`GalleryLightbox.tsx:789-791`) — **not `item.available`**. So without this, a demoted
  slide that goes unavailable keeps showing the `Full detail unavailable` chip stacked over
  the `Image unavailable` placeholder until the timer expires. The predicate also gains `item.available` directly,
  so the chip cannot render over an unavailable slide even for the one frame before the
  effect runs. Belt and brace, deliberately: the predicate fixes the frame, the effect fixes
  the timer.
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
2. **No backoff, no retry cap.** A user can tap repeatedly. Each tap draws from the clamped
   ladder (§3), and the control is disabled while in flight, so the worst case is user-paced
   and bounded by the 1024 tier. Re-file trigger: a report of a crew member hammering a dead
   diagram, or telemetry showing it.
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

## 11. Acceptance criteria

- **AC-1** Tapping retry on a failed gallery thumbnail with a variant ladder re-requests the
  image; on success the cell shows the diagram again, in the same page session, with no
  reload.
- **AC-2** The `srcSet` candidate set the retry renders equals the set rendered before the
  failure, and contains no original-tier URL. Asserted against the rendered attribute, not a
  written-out URL, because the browser and not the app picks the candidate (§3).
- **AC-3** Both outcomes are announced by name, on the channel audible at the time (gallery
  region, dialog region, or buffered through the exit window).
- **AC-4** The control is `disabled` and `aria-busy` while in flight, and shows `Retrying…`.
- **AC-5** A parse-time-unavailable item shows no control. An originals-only item DOES
  show one, and its active-slide variant renders the `Full size.` line (§3.1, §5).
- **AC-6** A runtime-failed cell that HAS a control keeps focus; one that does not still
  relocates to a sibling; focus never reaches `<body>` in either case.
- **AC-7** In a real browser, the retry button's box equals the cell's within 0.5px (§8).
- **AC-8** The lightbox demote path is untouched: an original-tier failure with a smaller
  tier still demotes rather than offering retry.
- **AC-9** A retry on the active slide never requests the original, including for a slide
  that holds `wantsOriginal` from an earlier zoom (§4.0.2).
- **AC-10** After a successful retry, a SECOND failure of the same item announces and shows
  the control again — `pendingFailuresRef` does not swallow it (§4.0.1).
- **AC-11** An item that goes unavailable and available again returns to `idle`, with no
  retained placeholder or control (§9.1).
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
  deliberately none. Asserted as a source-derived guard over the grep in that section, so a
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

**The class, not the five instances.** Six of the eleven findings across both rounds were one
shape: per-item state whose lifetime the retry machine did not define. §4.0.3 closes it with
a derived cover — every `useState`/`useRef` in either component keyed by or holding an item
id gets a row, produced by a grep the section states, so a member added later fails by
default rather than being silently exempt. AC-17 makes that executable. Per the
structural-defense-calibration rule, it ships in this repair commit rather than waiting for a
third round to confirm the class.
