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
| The retry re-requests **the exact URL that just failed** — no tier change, no cache-buster. | §3. A cache-buster would change the URL, defeat the clamped-tier decision above on originals-only entries, and break the cost bound. |
| Retry labels are **UI chrome, not catalog rows**. No `lib/messages` entry, no §12.4 code. | Established precedent for exactly this control class: `components/admin/RetryWatchButton.tsx:11-12` ("Labels are UI chrome (uncataloged, like Dismiss/Details)"). Invariant 5 governs raw error CODES surfacing in UI; these strings carry no code. |
| A runtime-failed cell **keeps focus** rather than relocating. | §7. The ratified relocation rule (`2026-08-10` spec §4.2, AC-3) fires because the focused button is being removed; a retry control means it is not removed, so the rule's own guard stops matching. The rule is preserved verbatim, not overridden. |
| Parse-time-unavailable items (`available: false`) get **no retry control**. | §4. There is no asset to re-fetch; the manifest never published one. |
| The **lightbox demote path is untouched.** An original-tier failure with a smaller tier available still demotes with its announcement and chip, gated on `wantsOriginal`
(`GalleryLightbox.tsx:1033-1073`). | That path is already non-terminal, so this row does not reach it. Retry applies only where `failedKeys` is written. |
| No new design tokens. | §8. Every class used already ships (`Gallery.tsx:351`, `Gallery.tsx:416`, `Gallery.tsx:430`), so no new contrast meta-test is owed. |
| e2e coverage is **not** added for the failure path. | §11. No existing e2e forces an `onError` on a diagram; building that harness is a separate arc, and the unit surface is where `failedKeys` lives. |

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

A runtime-failed diagram cell becomes a retry control. Tapping it re-requests the image
that failed and reports the outcome, in both channels, either way.

Three surfaces write `failedKeys` and all three get the affordance, because a crew member
does not know or care which one they are looking at:

| surface | site | today | after |
|---|---|---|---|
| gallery thumbnail | `Gallery.tsx:411` | placeholder `<div>` | retry button |
| lightbox active slide | `GalleryLightbox.tsx:1121` | "Image unavailable" | retry button |
| lightbox inactive slide | `GalleryLightbox.tsx:1173` | "Image unavailable" | retry button, silent (see §6) |

## 3. Cost: the retry re-requests the exact URL that failed

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

**Therefore:** because the loader is a pure function of `width` and the remount passes the
same props, the retry resolves to the byte-identical URL that just failed. The cost bound
is not "small in absolute terms", it is **never more than the request that already
failed**. Nothing new is downloaded that was not already attempted.

Measured magnitudes, from the prior arc's probe under a venue-grade throttle
(1.5 Mbps down / 300 ms RTT, `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md`
§2): on a 707 KB fixture the 1024 tier is **6.5 KB / ~350 ms**, the original's `load`
fires at **~4,127 ms**, and real stage plots of 1-5 MB extrapolate to **5.9-28 s**. The
ladder is `[256, 512, 1024]` (`lib/sync/diagramVariants.ts`,
`DIAGRAM_VARIANT_WIDTHS`), emitted only for widths strictly below the source's own
(`lib/sync/diagramVariants.ts`, the `width >= intrinsicWidth` skip).

The asset route sends `private, max-age=0, must-revalidate`
(`app/api/asset/diagram/[show]/[rev]/[key]/route.ts:12`) with **no ETag and no
Last-Modified** — verified: a case-insensitive grep for either header over that file
returns zero matches. So every retry is a full unconditional GET; there is no revalidation
shortcut to hope for, and equally no stale cached failure to defeat.

### 3.1 Where the retry does cost the original

An entry is originals-only when `hasVariantTier` is false. Four ways to get there:

| cause | evidence | retry cost |
|---|---|---|
| source narrower than 256px | the `width >= intrinsicWidth` skip in `lib/sync/diagramVariants.ts` emits nothing | the original, which is by construction tiny |
| GIF | the generator skips the resize loop for `image/gif` to preserve animation (`lib/sync/diagramVariants.ts`) | the original, up to the route's 1-5 MB range |
| variant generation failed | the per-asset catch returns `variants: []` with `reason: "sharp_error"` (`lib/sync/diagramVariants.ts`) | as above |
| manifest predates the variant pipeline | `variants` is optional on `PersistedDiagramFields` (`lib/parser/types.ts`) and normalized to `[]` (`components/crew/DiagramsBlock.tsx`) | as above |

**Decision, stated as an assumption because it extends the ratified answer rather than
restating it:** these cells get the retry control too. Withholding it would leave the
exact dead end this row exists to close, on the subset of entries a crew member is least
able to explain, and the cost is bounded by §3 — the same bytes that just failed, spent
only when a person taps. The zoom gate's rationale (`2026-08-10` spec §4.1) is about
*automatic* original fetches; a tap is intent. If that reading is wrong it is a
one-condition change (`hasVariantTier(item.variants, item.key)` gating the control), which
is why it does not block.

## 4. The state machine

Per item, per surface. `failedKeys` stops being the whole story and becomes one of three
states; a fourth render state shares the branch but is not part of the machine.

```
                tap retry
  idle ──fail──▶ failed ──────▶ retrying ──onLoad──▶ idle
                   ▲                 │
                   └────onError──────┘
```

| state | membership test | renders |
|---|---|---|
| `idle` | `item.available && !failedKeys.has(id)` | the `<Image>`, unchanged |
| `failed` | `item.available && failedKeys.has(id) && !retrying.has(id)` | retry control |
| `retrying` | `retrying.has(id)` | in-flight control **plus** a hidden `<Image>` actually loading |
| `unavailable` | `!item.available` | today's placeholder, no control, not reachable from any other state |

`retrying` is a second `ReadonlySet<string>`, mirroring the `failedKeys` idiom already in
both files, plus a per-item `attempt` counter that keys the `<Image>` so a remount happens.

Transitions, exactly:

- **`failed` → `retrying`**: add id to `retrying`, increment `attempt[id]`, and remove the
  id from `failedKeys`. Removing it is what makes `failedKeys` non-terminal; the
  `retrying` membership is what keeps the cell from flashing the image before it loads.
- **`retrying` → `idle`**: `onLoad` removes the id from `retrying`. `failedKeys` no longer
  holds it, so the cell is plain `idle`.
- **`retrying` → `failed`**: `onError` removes the id from `retrying` and adds it back to
  `failedKeys`. The attempt counter is NOT reset, so a third tap remounts again.

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
| lightbox slide, visible | `Could not be loaded.` above a `Tap to retry` button (the slide is full-width; the name is already the `figcaption`) |
| lightbox slide, accessible name | `<name> could not be loaded. Tap to retry.` |
| announcement, retry succeeded | `<name> loaded.` |
| announcement, retry failed again | `<name> still could not be loaded.` |

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
- **Inactive lightbox slides stay silent**, on both failure and retry outcome. Embla keeps
  every slide mounted, and the existing rationale (`GalleryLightbox.tsx:1168-1171`) —
  announcing twelve diagrams the user has not swiped to — applies unchanged to retry
  outcomes. An inactive slide still gets a *visible* control; it just does not speak.

## 7. Focus

The runtime-failed cell keeps focus instead of relocating.

The ratified relocation (`2026-08-10` spec §4.2, AC-3) exists because the focused
`<button>` is removed by the failure, which would drop focus to `<body>`. Its
implementation guards on exactly that: `if (document.activeElement === button)
successor?.focus()` (`Gallery.tsx:288`). With a retry control the button is not removed, so
the guard's premise is false and no relocation is owed. The rule is unchanged; its
antecedent stops matching.

Relocating away would be actively wrong here: it would move focus off the one control that
fixes the problem, immediately after announcing "Tap to retry."

**Blast radius, enumerated rather than estimated.** The seven cases in
`tests/components/diagrams/gallery.failedItem.test.tsx:429-527` (the focus-relocation
describe block for AC-3) assert focus MOVES off a failing thumbnail, as do the two dialog
cases at `tests/components/diagrams/gallery.failedItem.test.tsx:686` and the same file at
line 706. The plan enumerates each and rewrites its expectation to `focus stays on the
cell, which is now the retry control`. It does not delete them. The case asserting focus
never lands on `<body>` (`tests/components/diagrams/gallery.failedItem.test.tsx:480`)
survives unchanged and becomes the stronger claim.

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

Four render states (§4), so `4*3/2 = 6` pairs. `unavailable` is unreachable from the other
three (it is a props-level fact, not session state), which is itself the entry.

| pair | treatment |
|---|---|
| idle → failed | instant swap, no animation. Matches the existing instant swap the prior arc shipped. |
| failed → retrying | instant label swap within the same button node, so no enter/exit is involved. |
| retrying → idle | instant. The hidden `<Image>` becomes visible on `onLoad` and the control unmounts in the same commit. |
| retrying → failed | instant label swap back, same node. |
| idle → retrying | unreachable: retrying is entered only from `failed`. |
| unavailable → anything | unreachable in both directions: `item.available` is a prop, and a props change that flips it remounts the cell by `key={item.id}` semantics anyway. |

Compound transitions:

- **Retry outcome lands while the lightbox is mid-exit.** The announcement is buffered and
  flushed on `onExitComplete`, via the same `exitBufferRef` path failures already use
  (`Gallery.tsx:267-272`). Pinned by test, alongside the existing exit-window cases.
- **A sibling fails while this cell is retrying.** Independent per-item state; the two sets
  are keyed by id, so neither transition can observe the other. Pinned.
- **The user taps retry twice.** Impossible by §4.1 (`disabled` while retrying), and pinned
  as such rather than assumed.
- **A retry succeeds after the user swiped to another slide.** The `onLoad` guard (§4.1)
  drops it if the node is disconnected; otherwise the slide updates silently because
  inactive slides do not announce (§6).

## 10. Documented limits

Each is a conservative outcome plus a surfaced signal, not silent corruption, so each files
here rather than as a finding.

1. **A retry cannot fix a genuinely absent object.** A 410 from the asset route
   (`app/api/asset/diagram/[show]/[rev]/[key]/route.ts:62` and the same file at line 68) means the revision no longer
   lists that key; every retry will fail the same way. The control stays offered and the
   announcement says so each time. Distinguishing 410 from a transport failure would need
   the fetch status, which an `<img>` `onError` does not expose. Re-file trigger: if the
   asset route ever gains a client-visible status channel.
2. **No backoff, no retry cap.** A user can tap repeatedly. Each tap costs at most the
   request that already failed (§3), and the control is disabled while in flight, so the
   worst case is user-paced. Re-file trigger: a report of a crew member hammering a dead
   diagram, or telemetry showing it.
3. **Originals-only entries can cost 1-5 MB per tap** (§3.1). Bounded by intent and by the
   fact that the same fetch already failed.
4. **No e2e coverage of the failure path.** No existing e2e forces a diagram `onError`
   (nothing under `tests/e2e/` references `failedKeys`, and the one `onError` mention in
   `tests/e2e/crew-layout-dimensions.spec.ts` is a defensive comment, not an injection).
   Building that harness is a separate arc. Re-file trigger: the next arc that needs to
   assert real-browser image-failure behavior for any reason.

## 11. Acceptance criteria

- **AC-1** Tapping retry on a failed gallery thumbnail re-requests the image; on success
  the cell shows the diagram again, in the same page session, with no reload.
- **AC-2** The retry URL is byte-identical to the URL that failed (§3), asserted against
  the loader rather than against a hardcoded string.
- **AC-3** Both outcomes are announced by name, on the channel that is audible at the time
  (gallery region, dialog region, or buffered through the exit window).
- **AC-4** The control is `disabled` and `aria-busy` while in flight, and shows `Retrying…`.
- **AC-5** A parse-time-unavailable item shows no control.
- **AC-6** A runtime-failed cell keeps focus (§7); focus never reaches `<body>`.
- **AC-7** In a real browser, the retry button's box equals the cell's within 0.5px (§8).
- **AC-8** The lightbox demote path is untouched: an original-tier failure with a smaller
  tier still demotes rather than offering retry.

## 12. Out of scope

- Automatic retry, backoff, or any retry the user did not ask for. The zoom gate's whole
  premise is that expensive fetches are user-triggered.
- Changing the asset route's cache headers or adding an ETag. That would be a real
  improvement and it is a different arc with a different blast radius.
- The `2026-08-10` demote path, chip, and zoom gate (§1.1).
- e2e image-failure injection (§10.4).
