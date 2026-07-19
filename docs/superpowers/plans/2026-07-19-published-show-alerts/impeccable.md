# Impeccable dual-gate record — published-show-alerts (invariant 8)

Run 2026-07-19, impeccable 3.9.1, canonical v3 setup (context.mjs → PRODUCT.md + DESIGN.md, register `reference/product.md`). Surfaces: `PublishedReviewModal.tsx`, `AttentionMenu.tsx`, `AttentionBanner.tsx`, `ShowReviewSurface.tsx`, `step3ReviewSections.tsx` (attention-touched region).

## Critique (dual-agent: A design-director review · B detect.mjs + triage)

**Slop verdict: NOT slop** — single derived `AttentionItem[]` feeds pill/menu/dots/badges/banners; documented motion idioms; accName-trim and hit-band lessons applied.

Heuristic scores (0-4): visibility 4 · real-world match 4 · control/freedom 3 · consistency 3 · error prevention 2 · recognition 4 · flexibility 3 · minimalism 3 · error recovery 2 · help/docs 4.

Detector (Assessment B): 1 finding, 1 false positive (`broken-image` matched a JSDoc literal at `step3ReviewSections.tsx:3048`; the real `<img>` at :3089 has src/alt/lazy/onError and is the documented cookie-auth raw-img revert). 0 actionable.

### Findings + dispositions

| Sev | Finding | Disposition |
| --- | --- | --- |
| P1 | Text tokens on `bg-warning-bg` unaudited (`text-subtle`, `status-positive-text` — plus title/body) | **FIXED** `5440602de` — computed (light 15.6/17.4/6.1/6.1, dark 10.6/12.0/4.7/8.6, all ≥4.5) and pinned in DESIGN.md §1.2 + `tests/styles/status-token-contrast.test.ts` |
| P1 | Banner links `ring-offset-surface` inside the yellow field (white halo punch-out) | **FIXED** `5440602de` — `ring-offset-warning-bg` |
| P2 | Menu `aria-label` on a bare `div` — ignored by AT without role | **FIXED** `5440602de` — `role="group"` |
| P2 | Chevron text glyphs `⌃`/`⌄` — `⌃` is the macOS Control symbol, baseline-brittle | **FIXED** `5440602de` — lucide `ChevronDown` + `rotate-180`, motion-reduce guarded |
| P2 | Degraded state "vanishes" behind clearing/actionable pill | **NO CHANGE — per spec + unreachable.** `alertsDegraded` means the alert read failed, so zero alert-derived (clearing) items exist; only holds can coexist, and spec §5.1 pins "To-confirm state wins, menu lists holds only." Overview notice card carries the detail. |
| P3 | Duplicate crew names host banners on first row only | **NO CHANGE — per spec** (consumed-set first-match, spec §5.4). |
| P3 | `aria-current` on a non-nav div semantically thin | **NO CHANGE** — spec §6.4 mandates it; `aria-current` is a global ARIA state, valid here. |
| P3 | Menu close instant vs animated open | **NO CHANGE** — declared deliberate in spec. |

Open questions logged (not scope): undo affordance on resolve (5s Undo idea); N=1 pill could jump straight to the lone banner instead of opening the menu. Candidate BACKLOG items if the surface earns iteration.

## Audit

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | Post-fix: contrast pinned incl. warning-bg pairings; pill aria-expanded/controls; menu role=group; rows are real buttons with sr-only tone text; Esc capture layering; focus-visible rings (inset in menu, warning-bg offset in banner) |
| 2 | Performance | 4 | Transform/opacity-only menu entrance (rAF-armed); document listeners mounted only while open; no layout-property animation; flash is a compositor-cheap background keyframe |
| 3 | Responsive | 4 | Menu `w-[min(400px,calc(100vw-32px))]`; pill 48px hit band (`before:-inset-y-3`) on `--spacing-tap-min: 44px` system; 99+ cap protects 375px header; banner/menu rows `min-h-tap-min` |
| 4 | Theming | 4 | Zero raw hex; tone via `status-review`/`status-degraded` tokens; dark mode inherited through runtime tokens; new contrast rows cover both modes |
| 5 | Anti-patterns | 4 | `border-l-[3px]` stripe is the sanctioned DESIGN.md severity-rail exception (bell precedent); menu eyebrow uses the project's one deliberate `tracking-eyebrow` system; no gradient text/glass/hero-metric |
| **Total** | | **20/20** | Excellent |

P0/P1: none open. P3 observation (no action): on alert banners the one-shot flash animates `warning-bg → transparent` on a wrapper whose resting fill is already `warning-bg`, so it reads as an inverse pulse (wash fades out and back) rather than a highlight; on hold anchors (feed gate rows) it is the classic flash. Both draw the eye; reduced-motion steady-tint degrades to a no-op on banners, harmless.

Reduced-motion audit: menu transition + chevron rotate carry `motion-reduce:transition-none`; scroll glide is CSS `motion-safe` smooth-scroll (JS passes no behavior); flash keyframe has an explicit `prefers-reduced-motion` block (`app/globals.css:848-853`).

**Gate result: PASS — dual-gate satisfied, no DEFERRED.md entries required.**
