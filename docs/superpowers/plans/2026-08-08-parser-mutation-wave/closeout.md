# Parser mutation-hardening wave — closeout

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded

Wave closes when all five branches are merged, AC-W1..W3 (see [00-overview.md](./00-overview.md)) verified, and every `BL-MUTATION-*` row is archived with its residue note. The wave's ONLY UI-surface touch is the help-family rows in `app/help/errors/_families.ts` (spec §1.1.8 as amended by the 2026-08-08 retro cross-model review): the dual gate was planned to run once at `feat/mutation-column-shift` close-out. **That deferral was overturned during branch 2** by cross-model review: invariant 8 requires both gates before a UI surface SHIPS, and a later branch cannot retroactively gate UI that already merged. The gate therefore ran on branch 2, against the surface as it stands with the first family row, and the marker above is filled. Branches 3 and 4 add their own rows and re-run both gates on the surface they leave behind.

## 12. Invariant-8 dual gate — `/help/errors` (branch 2, 2026-08-09)

**critique** — no P0. One **P1, fixed**: the catalog title for `REF_ERROR_LITERAL` read "Broken spreadsheet reference in the sheet", omitting `#REF!` — the one string Doug actually recognizes and scans headings for. Now "A cell shows #REF! (broken formula reference)". Detector clean, verified against a positive control so the empty result is a real pass rather than a no-op. All page color pairs clear 4.5:1 in both themes. Family placement confirmed against Doug's mental model rather than the code's: `#REF!` appears when a sheet is read and can sit in any cell, so `syncing-sheets` is right and `crew-schedule` would have been wrong.

**audit** — 15/20, no P0, no P1. The 216 hydrated `RefAnchor` islands were measured rather than assumed: 5.8ms hydration unthrottled, 20.8ms at 4x CPU throttle, statistically indistinguishable from a plain-`<h3>` control, 3.8KB gzipped for all 216. The RSC boundary is correct (only strings cross; the catalog never reaches the client) and `prefers-reduced-motion` resolves to `0s`. Justified.

| Sev | Finding | Disposition |
| --- | --- | --- |
| P1 | Catalog title omitted `#REF!` | **Fixed** this branch |
| P2 | `RefAnchor` copy-link squeezed to 35.9px at 390px against the 44px convention; this branch's own entry is one of 31 affected | **Fixed** this branch (`shrink-0`) |
| P2 | 216 copy-links share one accessible name, and sit as 216 tab stops before the footer CTA | Deferred: pre-existing in KIND, but this branch adds the 216th — every renderable catalog entry becomes another identically-named `RefAnchor`. The fix is one `aria-label` on a shared component, so it belongs to a whole-surface a11y pass rather than to the branch that incremented the count |
| P3 | Jump-list links 18px tall, clearing WCAG only via the spacing exception | Deferred: pre-existing |
| P3 | Stale `md`-breakpoint comment (`app/globals.css:267`) | Deferred: comment-only, no behaviour change |

The two P3s are pre-existing and untouched by this diff. The P2 above is NOT untouched: a new renderable code adds one instance of it, and branches 3 and 4 will each add one more. An earlier draft of this table claimed all three were untouched, which was false — a later reviewer would have been told 216 identical links were entirely inherited when this branch contributed the last one.

Per-branch close: PR-head `mutation-harness` workflow verified green (procedural gate, spec §2.2), ledger marker removed in the PR's last commit, `git rev-list --left-right --count main...origin/main` = `0  0` after merge.

## 12b. Invariant-8 dual gate — `/help/errors` (branch 3, 2026-08-09)

Re-run on the surface branch 3 leaves behind, per the contract above: this branch adds the `ROW_CELLS_FUSED` entry and the `"ROW"` family prefix.

**critique** — 32/40, no P0, no P1. Run dual-agent, the two assessments isolated from each other. The reviewer read the new entry against its NEIGHBOURS rather than in isolation, which is what produced all three copy findings; each was **fixed in-branch** rather than deferred, since the copy had not shipped yet and the repair was one string.

**audit** — 18/20, no P0, no P1. Detector clean (exit 0, zero findings) across `app/help/errors` + `app/help/_components`. Theming 4/4 (no hard-coded color in any of the three files), performance 4/4 (`RefAnchor` remains the sole justified client island), anti-patterns 4/4. `tests/help`: 642 tests green.

| Sev | Finding | Disposition |
| --- | --- | --- |
| P2 | Terminology drifted mid-entry: the title said "columns ran together", the body said "cells are merged", so a reader could go hunting for a merged column | **Fixed** this branch: the explanation now names both in one sentence ("Merging two cells makes the export write that row one column short") |
| P2 | `longExplanation` ran ~85 words against ~50-55 for every nearby sibling, an outlier against the page's rhythm | **Fixed** this branch: cut to three sentences |
| P2 | The fix sentence sat last, behind a three-step causal chain, giving the entry the highest working-memory load on the page | **Fixed** this branch: "Unmerge the cells in that row and it will line up again" now leads |
| P2 | `RefAnchor`'s copy gives no screen-reader-perceivable confirmation | Deferred to **`BL-HELP-REFANCHOR-A11Y-PASS`**, filed this branch. Same shared component and same class as branch 2's deferred accessible-name finding — that deferral carried no ledger row, so this branch filed one and folded both findings plus the tab-stop item into it, naming exception (c) |
| P3 | `RefAnchor` hardcodes `size-11` instead of the canonical `min-h-tap-min`/`min-w-tap-min` tokens | Deferred: pre-existing, shared with other call sites (`BellPanel`, `GalleryLightbox`), not introduced by this diff |

Branch 2's note above applies unchanged here: the copy-link count is NOT untouched by this diff — a new renderable code adds one more instance, which is why the deferral now has an owner rather than a third restatement.

Review record: spec approved via substitute adversarial review (3 rounds: 8 → 1 → 0 findings) while Codex was quota-limited; implementation branches use the same substitute mechanism until the quota resets (overview "Review mechanism"), then revert to codex-guard.
