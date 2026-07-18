# Invariant-8 impeccable dual-gate record — roles settings desktop grid (2026-07-16)

Both commands ran with the canonical v3 setup gates (context.mjs PRODUCT.md+DESIGN.md load → product register reference). Diff scope: `app/admin/settings/roles/RoleMappingRow.tsx`, `app/admin/settings/roles/page.tsx`, `components/admin/roleRecognizeCopy.ts`.

## Critique (dual-agent: design-review + detector) — 33/40, P0=0, P1=0

Snapshot: `.impeccable/critique/2026-07-16T16-43-59Z__app-admin-settings-roles.md` (not committed — `.impeccable/` untracked; scores + dispositions recorded here).

- Candidate P0 (remove-confirm renders empty at desktop): **REFUTED** — `role-recognize-pop` starts at `opacity:0` (`app/globals.css:444-448`); the flagged captures were mid-animation. Settled re-captures (desktop + mobile confirm, desktop edit) all render fully: amber confirm panel spans the row (col-span-4 visually confirmed), edit panel crisp with solid accent CTA. The e2e spec independently asserts settled confirm copy + rects.
- Candidate P2 (mock's `#fafaf9` rounded container absent): **DISMISSED** — that container is the mock's per-state framing chrome (it also wraps the 360px mobile prototype, mock line 37); the shipped #396 mobile page — already dual-gated — floats rows identically. Matching it desktop-only would fork the surface chrome.
- P3 (meta floats mid-row on chip-light rows): matches the mock's col-3 `auto` placement exactly; no action, revisit if list grows.
- Detector (`detect.mjs`): zero findings. Assessment-B visual flags triaged: "strikethrough pill" = intentional dashed border (mock line 216); label divergence across breakpoints = the spec'd EDIT_LABEL/EDIT_LABEL_SHORT swap.

## Audit (technical, diff scope) — 20/20

| Dimension | Score | Note |
| --- | --- | --- |
| Accessibility | 4 | constant `aria-label` (WCAG 2.5.3: visible "Edit" is a prefix); `aria-hidden` label spans; `display:contents` only on a role-less layout div; meta `#5a5b62` on white ≈6.9:1 (AA+); 44px targets at both layouts |
| Performance | 4 | pure CSS media variants, no new JS/renders; popIn is transform+opacity with `motion-reduce:animate-none` |
| Theming | 4 | tokens only; no hard-coded colors introduced; grid `150px` is a mock-pinned dimension; dark mode inherits tokens |
| Responsive | 4 | `min-[760px]:` variant (no global `md`); 760–807px window verified (grid fits viewport-wide main); 800px + 390px screenshots clean; chips wrap gracefully in guard case |
| Anti-patterns | 4 | detector clean; no slop tells |

P0/P1: none. P3 notes: `title`-only access to a truncated >150px token (rare; mobile always shows full token); meta column float (mock-faithful).

**Gate verdict: PASS — no P0/P1 findings; nothing deferred to DEFERRED.md.**
