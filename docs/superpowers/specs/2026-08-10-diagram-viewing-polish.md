# Diagram viewing polish: zoom-gated original, blur-row closure, failed-thumbnail a11y

**Date:** 2026-08-10 · **Branch:** `feat/diagram-viewing-polish` · **Closes:** `BL-LIGHTBOX-ORIGINAL-PROGRESS-AFFORDANCE` (ships the zoom gate), `BL-DIAGRAM-BLUR-EDGE-SIZE` (closes on probe evidence), `BL-GALLERY-FAILED-ITEM-FOCUS-AND-ANNOUNCE` (ships the a11y repair)
**Class:** UX + A11Y (UI surfaces, invariant 8 applies) · **Effort:** S

## 1.1 Resolved scope — do not relitigate

- **The zoom-gate direction is ratified by the user, 2026-08-10** (decision round, mockup + throttle measurements): open the lightbox on the clamped variant tier, load the original only on zoom intent. The alternative (keep the up-front original + progress affordance + 32px blur) was declined. Do not propose the progress ring.
- **This spec AMENDS the private-image-pipeline spec's active-slide contract** (`docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:140` and `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:146`, which ratified `pinOriginal: true` on the active slide "which needs full resolution for zoom and ignores width entirely"). The amendment is recorded here (§4.1) and back-referenced in that spec in the same PR; per AGENTS.md invariant 7, this document is the ratification. The loader's `pinOriginal` semantics (`lib/images/diagramLoader.ts:80`) are UNCHANGED — what changes is when the lightbox passes it.
- **`BL-DIAGRAM-BLUR-EDGE-SIZE` closes with `BLUR_MAX_EDGE = 16` unchanged.** Probe (§3.2): at thumbnail scale 16 vs 32 is indistinguishable (next/image wraps the blur in an SVG `feGaussianBlur stdDeviation=20`, erasing both); at lightbox scale 32 helps, but the zoom gate collapses the lightbox blur window from ~4.1 s to ~350 ms, mooting the complaint; the dark-mode brightness flash is NOT fixed by edge size (mean luma differs by 0.7/255). Do not propose raising the edge.
- **Failed-thumbnail repair uses the lightbox's own ratified pattern** (focus relocation before the interactive element unmounts) plus the shared announce implementation (`components/admin/announceLog.tsx`, DESIGN.md's do-not-hand-roll rule). Not a new focus-management design.
- **Impeccable dual gate owed** (crew UI surfaces under invariant 8).

## 2. Problem and probe evidence (2026-08-10, venue-grade throttle: 1.5 Mbps down / 300 ms RTT, CDP)

Opening a diagram in the lightbox downloads the full original (`components/diagrams/GalleryLightbox.tsx:661` passes `pinOriginal: true`). Measured on the seeded 707 KB fixture: blur paints at **28 ms**, the 1024 tier fetches in **~350 ms** (6.5 KB), the original's `load` fires at **~4,127 ms** (median of 3, spread <10 ms; transfer is latency + bytes/throughput to within 1.5%). Real stage plots run 1-5 MB (the asset route's own cap comment, `app/api/asset/diagram/[show]/[rev]/[key]/route.ts:22`), extrapolating to **5.9-28 s** of blur-only wait. The route sends `private, max-age=0, must-revalidate` with no ETag, so every open re-downloads in full. Diagrams without a blur show an empty box for the whole window (`GalleryLightbox.tsx:65` returns `{}` when `blurDataURL` is absent).

### 3.2 Blur probe (why the blur row closes)

Exact ingest pipeline (`lib/sync/diagramVariants.ts`, resize fit-inside + webp q40) rerun at edge 16 and 32 on a synthesized 1600×1200 stage plot (no real plot exists in-repo; noted): 16 → 54 B / 95 data-URI chars; 32 → 120 B / 183 chars (both far under the 2048 belt). Rendered faithfully through next/image's SVG blur wrapper: thumbnail scale — no usable difference; lightbox scale — 32 resolves a layout skeleton, 16 is a near-uniform field; dark-scrim composite — both an equally bright rectangle (mean luma delta 0.7/255). With §4.1 in place the lightbox blur shows for ~350 ms instead of 4-28 s, so the one surface where 32 helped no longer benefits. **Disposition: the entry graduates on this probe; no code change.**

## 4. Design

### 4.1 Zoom-gated original (the amendment)

- The active slide's `next/image` uses the standard clamping loader (`pinOriginal` omitted) **until zoom intent**, selecting the largest tier exactly like inactive slides (1024 on a full ladder; the R1/R2-probed clamping behavior at `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:140` guarantees no original fallthrough).
- **Zoom intent** = the first of ANY scale-changing input path the component ships (R1 F1 enumerated them from the live tree): committed pinch (the existing commitment detection around `GalleryLightbox.tsx:79`, which already distinguishes pointer-down from actual zooming), Ctrl/Meta-wheel and trackpad-pinch zoom (the `wheel` handling at `GalleryLightbox.tsx:549` and `onWheelStop` at `GalleryLightbox.tsx:608`), keyboard `+` / zoom-in control, and double-tap zoom. The implementation MUST derive intent from the scale itself where possible, using the component's existing COMMITMENT threshold — scale exceeding the documented `1.01` commitment bound, not the transient `1.001` pointer-down snapshots (`GalleryLightbox.tsx:78`) — so a future input path cannot silently bypass the gate while pointer noise never triggers it (R2 F1). Intent flips a per-slide `wantsOriginal` state to `true`, and it **stays true for that slide for the lightbox session** (matching the ratified per-diagram zoom context, `GalleryLightbox.tsx:190` region), so de-zooming does not re-downgrade and re-zooming never re-fetches.
- On flip, the same mounted `next/image` re-renders with `pinOriginal: true`. The browser keeps painting the current (1024) bitmap until the original's load completes, then swaps — the "silent sharpen" the backlog row described. No spinner, no new UI. Variant-less entries (old manifests, GIFs, generation failures) are unchanged: the loader already returns the original for them at every width (`lib/images/diagramLoader.ts:80` region), so the gate is a no-op there.
- Guard conditions: `wantsOriginal` while variants are absent — same URL either way, no-op. Slide change (Embla) resets nothing retroactively: each slide owns its state; the inactive→active transition inventory row in the pipeline spec (`docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:185`) still holds, with "active render swaps to the pinOriginal URL" now conditional on that slide's `wantsOriginal`.
- Zoom on a not-yet-sharp image: permitted (the 1024 bitmap upscales under the gesture and sharpens when the original lands). This is the accepted UX, ratified by the decision round.

### 4.2 Failed-thumbnail focus + announcement

Today a runtime load failure swaps the cell's `<button>` (`components/diagrams/Gallery.tsx:153`) for a non-interactive `<div>` (`Gallery.tsx:198`) whose only signal is `sr-only` text (`Gallery.tsx:200`); focus, if held, falls to `<body>`, and nothing announces.

- **Focus:** before the state update that removes the button, if `document.activeElement` is that button, relocate focus to the nearest still-available thumbnail button (next in DOM order, else previous), else to the gallery's "show more" button when present (`Gallery.tsx:210`), else to the gallery list (`Gallery.tsx:125`) given `tabIndex={-1}` for the purpose. This is the lightbox's ratified relocate-before-unmount pattern applied to this surface.
- **Announcement:** the failure emits one message through the shared announce implementation: `useAnnounceLog` plus a RENDERED `AnnounceLogRegion` with its required `entries`/`label`/`testId` props (`components/admin/announceLog.tsx:106`), `role="log"` shape per DESIGN.md — identical text CAN legitimately recur when multiple thumbnails fail. **Region ownership (R1 F3): the region mounts at the Gallery component's root wrapper (`Gallery.tsx:124`), which renders in every state of every cell — a branch-stable owner per DESIGN.md's placement rule — with a stable `testId` (`gallery-announce-log`).** Message: "Diagram <n> could not be loaded." where <n> is the 1-based visible position (the existing `aria-label` naming scheme, `Gallery.tsx:157`). The sr-only fallback text in the replacement cell stays (browse-time discoverability), the announcement adds the event-time signal.
- Guard conditions: failure of a thumbnail that never had focus — no relocation, announcement only. Simultaneous failures — each relocates only if it held focus (at most one can), each announces (log shape appends). Failure after unmount (stale onError) — the `failedKeys` set update is already idempotent; announce only if the item is still rendered.

## Dimensional Invariants

None new. No class, size, or layout changes on any surface: §4.1 changes a loader argument and state, §4.2 changes focus/announce behavior. The existing real-browser geometry gate (`tests/e2e/crew-layout-dimensions.spec.ts`, cited in `Gallery.tsx`'s cell comment) continues to pin the gallery cells; no re-baseline.

## Transition Inventory

New/changed state: `wantsOriginal` per active slide (false → true, one-way per session).

| pair | treatment |
| --- | --- |
| active slide, `wantsOriginal` false → true | instant loader swap; current bitmap keeps painting until the original loads, then browser-native swap (the silent sharpen). No authored animation. |
| sharpening in flight → slide becomes inactive (Embla) | inactive slide renders the clamped tier as today; the original fetch may complete unobserved (browser cache-less discard). Instant, no animation. |
| sharpening in flight → lightbox closes | unmount; no cleanup beyond existing teardown (`GalleryLightbox.tsx:153` region already guards torn-down wrappers). |
| thumbnail available → failed (had focus) | instant swap + focus relocation + one announcement. No animation (matches existing instant swap). |
| thumbnail available → failed (no focus) | instant swap + announcement only. |

Compound: zoom gesture mid-sharpen (scale changing while src swaps) — the transform layer owns the gesture and is src-agnostic; no special handling. Multiple failures while one announcement is in flight — `role="log"` appends; ratified shape for recurring text.

## 6. Verification

- **Loader/unit (red first):** active slide passes no `pinOriginal` before intent and `pinOriginal: true` after; intent flips on each of the FOUR enumerated path classes (committed pinch, Ctrl/Meta-wheel + trackpad pinch, keyboard `+`/zoom control, double-tap); state persists across de-zoom; variant-less entries produce identical URLs before/after intent. Anti-tautology: assert on the URL the loader RETURNS (the data source), not on a container attribute that renders both; derive expected tier URLs from fixture variant ladders, never hardcode.
- **Component (Gallery):** focus relocation to next/prev/show-more/list in each availability configuration, exercised by firing `onError` while focus is on the failing button (jsdom `document.activeElement` assertions); announcement asserted on the RENDERED region with a before/after oracle (R2 F3): the `role="log"` element (located by `testId` `gallery-announce-log`) EXISTS and is EMPTY before the failure, and the SAME node (same element handle) gains exactly one appended keyed child with the message text after it — a conditionally-mounted or pre-populated region fails both halves; exactly one entry per failure with the correct index; no-focus failure relocates nothing.
- **Real-browser (Playwright), split by capability (R1 F2 — CDP is Chromium-only; the mobile-safari project is WebKit, `playwright.config.ts:64`):** (a) **desktop-chromium** carries the network-order gate: open the seeded lightbox, assert via the network log that no request for the original URL fires before a programmatic zoom, and that after zoom the original request fires and `currentSrc` upgrades (CDP throttling optional — request ORDER is the oracle, so the assertion runs unthrottled and stays fast); (b) **mobile-safari** carries the tier assertion that needs no CDP: active slide `currentSrc` is a variant-tier URL (never the original) before any gesture. Both land in already-wired spec files for their projects, with executed-count floors recalibrated from a real run.
- **Impeccable critique + audit** on the diff (invariant 8).

## 7. Documented limits

- No progress affordance during the post-pinch sharpen (typically the user is mid-gesture on a live upscaled bitmap; declined by the decision round).
- The no-ETag re-download behavior of the asset route is out of scope (pre-existing; a caching arc would be its own filing with its own probe).
- Blur edge stays 16; the dark-mode brightness flash of any blur placeholder (≤350 ms post-amendment) is accepted (probe showed edge size cannot fix it).
- The synthesized-plot caveat: the blur probe used a synthetic stage plot because no real one exists in-repo; the closure reasoning is dominated by the timing collapse, which is real-fixture-measured.

## 8. Acceptance criteria

- **AC-1:** Lightbox open paints the clamped tier; the original is fetched only after zoom intent (network-log assertion), on all FOUR enumerated path classes.
- **AC-2:** Variant-less entries behave exactly as today (URL equality before/after intent).
- **AC-3:** A focused failing thumbnail relocates focus per §4.2 (never `<body>`); every runtime failure announces through the shared region.
- **AC-4:** The three backlog rows graduate with their dispositions (amendment / probe closure / repair) recorded; markers off in the PR's last commit (invariant 12).
- **AC-5:** The pipeline spec carries the §4.1 back-reference; no other pipeline contract line changes.
- **AC-6:** Impeccable dual gate passes on the diff.

impeccable-gate: pending — critique + audit due at implementation close-out (UI surfaces: components/diagrams/**)
