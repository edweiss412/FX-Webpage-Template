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
| P2 | 216 copy-links share one accessible name, and sit as 216 tab stops before the footer CTA | Deferred: pre-existing, whole-surface a11y change |
| P3 | Jump-list links 18px tall, clearing WCAG only via the spacing exception | Deferred: pre-existing |
| P3 | Stale `md`-breakpoint comment (`app/globals.css:267`) | Deferred: comment-only, no behaviour change |

Both deferrals are pre-existing and untouched by this diff.

Per-branch close: PR-head `mutation-harness` workflow verified green (procedural gate, spec §2.2), ledger marker removed in the PR's last commit, `git rev-list --left-right --count main...origin/main` = `0  0` after merge.

Review record: spec approved via substitute adversarial review (3 rounds: 8 → 1 → 0 findings) while Codex was quota-limited; implementation branches use the same substitute mechanism until the quota resets (overview "Review mechanism"), then revert to codex-guard.
