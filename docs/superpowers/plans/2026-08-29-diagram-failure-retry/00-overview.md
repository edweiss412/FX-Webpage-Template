# Diagram failure retry — implementation plan

Spec: `docs/superpowers/specs/2026-08-29-diagram-failure-retry-design.md`.
Closes `DIAGRAM-FAILURE-RECOVERY-1` (DEFERRED.md). Branch `feat/diagram-failure-retry`.

## Why the probes come first

The spec stage closed at three rounds by orchestrator ruling rather than by converging
(record: `docs/review-rounds/feat/diagram-failure-retry/e7751f61de2c.md`). Six of its claims
are marked UNRATIFIED in spec §1.4 because they are statements about runtime behaviour that
prose review cannot decide.

**Tasks P1 through P6 settle those six, and they run before any feature work.** Each is a
probe with an executable assertion, each maps to exactly one UNRATIFIED row, and each is
cheap. If a probe contradicts the spec, the spec is amended and the feature tasks are
re-planned around the real behaviour — which is the entire point of running them first
rather than discovering it in a diff review round.

A probe is throwaway only in the sense that it does not ship a feature. Every one lands as a
committed test, because a claim worth proving once is worth pinning.

## Meta-test inventory

**CREATES** one: the per-item state lifetime registry (spec §4.0.3, AC-17), under
`tests/components/diagrams/`. A scanner parses both diagram components and enumerates every
`useState` and `useRef` declaration with no filter on declaration text; a registry classifies
each as per-item or not; an unclassified declaration reds the suite. Task P5 proves it is a
cover before Task 4 relies on it.

**EXTENDS** none.

**Advisory-lock topology: N/A.** No `pg_advisory` call, and no path that mutates `shows`,
`crew_members`, `crew_member_auth`, `pending_syncs` or `pending_ingestions`.

**Invariant 9 (Supabase call boundary): N/A.** No Supabase client call is added.

**Invariant 10 (mutation-surface observability): N/A.** No HTTP route handler and no
`"use server"` action. The retry is a client-side remount.

## Pre-draft code verification (RUN, output pasted)

Symbols the tasks name, verified against the live tree at `e7751f61de2c`:

| symbol | site | occurrences |
|---|---|---|
| `failedKeys` (gallery) | `Gallery.tsx:122` | 4 |
| `thumbRefs` | `Gallery.tsx:132` | 4 |
| `restoreTargetRef` | `Gallery.tsx:139` | 5 |
| `exitBufferRef` | `Gallery.tsx:149` | 6 |
| `pendingFailuresRef` | `Gallery.tsx:156` | 4 |
| `lightboxOpenRef` | `Gallery.tsx:169` | — read by the announcement router |
| `visible` | `Gallery.tsx:206` | 7 |
| `nameOf` | `Gallery.tsx:211` | 4 |
| `successorTo` | `Gallery.tsx:219` | 2 (declaration + its single caller at 287) |
| `routeAnnouncement` | `Gallery.tsx:239` | 4 |
| `activeScale` | `GalleryLightbox.tsx:272` | reset by the error path at 1112 |
| `failedKeys` (lightbox) | `GalleryLightbox.tsx:293` | — |
| `wantsOriginal` | `GalleryLightbox.tsx:303` | — |
| `demotedRef` | `GalleryLightbox.tsx:312` | 3, no clear path |
| `demotedNotice` | `GalleryLightbox.tsx:320` | — |
| `demoteTimerRef` | `GalleryLightbox.tsx:321` | — |
| `controlsSlotRef` | `GalleryLightbox.tsx:380` | — |
| `requestedScaleRef` | `GalleryLightbox.tsx:391` | reset at 1110 |
| `markZoomIntent` | `GalleryLightbox.tsx:366` | early-returns on `demotedRef` |

Existing test ids: `diagrams-lightbox`, `lightbox-demote-chip`, `lightbox-page-indicator`,
`lightbox-reset-chip`, `lightbox-zoom-live-region`, `diagram-slot-${i}`. The announce regions
carry theirs through `AnnounceLogRegion`'s `testId` prop.

NEW ids: `diagram-retry-${i}` (gallery cell), `lightbox-retry` (active slide),
`diagram-retry-overlay-${i}`. None collides.

## Reuse question, settled so review does not raise it

`components/shared/AccentButton.tsx` is the obvious "reuse this" candidate and is the WRONG
atom here. It emits `bg-accent text-accent-text` as always-on chrome, which inside a ~117px
thumbnail is the loudest element on the crew page for the least important state on it. Its
structural meta-test constrains a named `MIGRATED_FILES` list of admin sites; neither diagram
component is on it, and adding them would widen an admin contract onto a crew surface.

The retry control is a plain `<button type="button">` carrying the placeholder's existing
classes (`Gallery.tsx:416`) plus the focus and tap treatment the healthy thumbnail button
already has (`Gallery.tsx:382`, `Gallery.tsx:430`). No new atom, no new tokens.

## Heavy-phase discipline

Every Playwright task (P1 through P4, and Task 9) runs under `pnpm heavy`. Scoped vitest runs
stay unwrapped. No DB suite is touched by any task in this plan.

## Red-command validation (run at plan time, output pasted)

The task region was reordered after plan round 1, so this was re-derived against the current
files rather than carried forward. Fourteen `red=` commands across both task files.

**`sh -nc` parse check: 14 of 14 PARSE_OK.** A command the executing shell cannot parse
expresses no verdict in either direction, and the classifier would read its non-zero exit as
red observed.

**Collection probe**, for the vitest-shaped reds whose target files exist today:

| target | result |
|---|---|
| `tests/components/diagrams/gallery.failureRecovery.test.tsx` | collects |
| `tests/components/diagrams/gallery.failedItem.test.tsx` | collects |
| `tests/components/diagrams/GalleryLightbox.test.tsx` | collects |
| `tests/components/diagrams/perItemStateLifetime.probe.test.ts` | collects |
| the availability-sweep suite under `tests/components/diagrams/` | absent — Task 7 creates it |
| the transition-audit suite under `tests/components/diagrams/` | absent — Task 9 creates it |

The two absences are the ordinary `red-state=authored` shape, not defects: a task that writes
its own failing case cannot collect it beforehand. No `red=` uses a `-t` name filter, so none
can silently exit 0 by matching nothing.

The four probe commands carry `--config tests/e2e/standalone.config.ts`; the two feature
Playwright commands deliberately do not, because they drive the real crew page under the
default config and its `desktop-chromium` project.
