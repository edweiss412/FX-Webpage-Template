# Parser mutation-hardening wave — closeout

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

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

## 12c. Invariant-8 dual gate — `/help/errors` (branch 4, 2026-08-14)

Re-run on the surface branch 4 leaves behind, per the contract in §12: this branch adds the `LEADING_COLUMN_AUTOCORRECTED` entry and the `"LEADING"` family prefix to `syncing-sheets`.

**critique** — 29/40, no P0, **one P1, fixed**. Run dual-agent with the two assessments isolated, dispatched sequentially so Assessment A closed before any detector output entered synthesis. Detector clean (`detect.mjs --json app/help/errors app/help/_components`, 13 files, exit 0, `[]`) and verified against a positive control — a throwaway `.tsx` offender fired exit 2 with 4 findings, and `.tsx` is in `SCANNABLE_EXTENSIONS`, so the empty result is a real pass on this file type rather than a no-op. Honest scope limit recorded rather than papered over: `.tsx` routes to the regex engine, so the contrast / z-index / tap-target / computed-font-size families need a live URL scan no static run reaches — unattributable to this diff, which adds zero DOM, zero classNames, and zero color literals. The three-lockstep was re-verified rather than assumed (spec §12.4 row at `:2918`, `helpfulContext` at `:3221`, generated codes, catalog row; `tests/cross-cutting/codes.test.ts` green). **The fixes deliberately land only on fields §12.4 does not carry** — `title` and `longExplanation` appear in neither the §12.4 columns nor the `helpfulContext` list, and they are also the entire rendered surface (`app/help/errors/page.tsx:85-94` renders `title`, `code`, `longExplanation` and nothing else), so the two free-to-edit fields are the two the gate is actually about.

**audit** — 18/20, no P0, no P1. Detector clean and likewise verified against two positive controls. Where branch 2 measured, this round re-measured rather than restated: `RefAnchor` still renders a correct 44px, and the `md`-breakpoint comment is wrong in the safe direction — `@theme` declares only `sm`/`lg`/`xl` with no `--breakpoint-*: initial` reset and there is no `tailwind.config.*`, so Tailwind v4's default `--breakpoint-md: 48rem` survives and `md:` variants **are live**, which is what the whole `/help` desktop layout depends on.

| Sev | Finding | Disposition |
| --- | --- | --- |
| P1 | `title: "Auto-corrected a shifted section"` hung the entry on "shifted", a word the rendered `longExplanation` never repeats, and omitted "empty column" — the phrase every other field uses and the one Doug would Ctrl+F for. The h3 is the only scan handle, and the entry sorts alphabetically nowhere near its semantic siblings | **Fixed** this branch (`531d89dc1`): `"Auto-corrected a section that started with an empty column"`, mirroring the body's exact phrase |
| P2 | `longExplanation` ran 56 words against a 34-39 sibling band — the only field on the row outside its family's band, and the exact overrun branch 3 was cut for. The whole excess was one speculative clause attributing the drag to an export step Doug never performs, which also forced a right/left flip across adjacent sentences | **Fixed** this branch: cut to 45 words, leading with what happened |
| P2 | No no-loss clause, where every sibling carries one. The entry offered only "it lines up and reads correctly again", which describes geometry, not safety — and on a benign auto-correct the reader's first question is whether their data is wrong | **Fixed** this branch: "Nothing was dropped; the section lines up and reads correctly again" |
| P2 | The `autocorrectGuidance.ts` SENTENCE row made the admin warning card **thinner than not having the row at all**. `resolveGuidance` uses it IN PLACE OF `catalog.helpfulContext`, never alongside, and an absent row falls back rather than composing nonsense — so the bar the row must clear is `helpfulContext`, not silence. The shipped string kept the instruction but dropped the opening diagnostic, and this code carries no `sourceCell` outside agenda/pull_sheet, so there was no instance token to make up the loss | **Fixed** this branch: diagnostic clause restored; the comment now records the real bar and why the earlier draft missed it |
| P3 | `dougFacing`'s "and it parses correctly" leaks technical vocabulary against PRODUCT.md principle 5 | **Declined — refuted, recorded so a later round does not re-derive it.** "Parse" is established house vocabulary here, not a novel leak: Doug has a parse panel in the admin UI, and `parse`/`parses`/`re-parsed`/`staged parse` appear across ~25 existing catalog entries. Changing it would cost the full three-lockstep to make one entry inconsistent with the rest |
| P3 | `"LEADING"` is a generic English prefix; a future `LEADING_*` code would route into `syncing-sheets` silently | Noted, no action: inherent to the prefix taxonomy, currently exactly one match, and the unmatched-code fallback group means nothing is ever silently dropped |
| P3 | `COLUMN_HEADER_AUTOCORRECTED` routes to `crew-schedule` via the `COLUMN` prefix while this lands in `syncing-sheets`, so a Doug thinking "column problem" can land one family off | Noted, placement **kept**: `syncing-sheets` is right for a whole-section structural read and matches `SECTION_HEADER_AUTOCORRECTED`. Pre-existing taxonomy artifact |
| P2 | 217 `RefAnchor` copy-links share one accessible name and sit as 217 tab stops before the footer CTA | Deferred to **`BL-HELP-REFANCHOR-A11Y-PASS`**, exception (c). **Incremented by this diff** (216 → 217), not inherited whole |
| P3 | `RefAnchor` hardcodes `size-11` instead of `min-h-tap-min` / `min-w-tap-min` | Deferred: pre-existing, shared with `BellPanel` / `GalleryLightbox`. Rendered size measured this round and still a correct 44px, so this is token discipline, not a tap-target failure |
| P3 | Jump-list links ~18px tall, clearing WCAG only via the spacing exception | Deferred: pre-existing **and not incremented by this diff** — the jump list gains no row, only a count text change (57 → 58) |
| P3 | Stale `md`-breakpoint comment (`app/globals.css:267-272`) | Deferred: comment-only. The comment misleads a future author; the code is right (measurement above) |

Branch 2's and branch 3's note applies once more, and for the last time in this wave: the copy-link count is NOT untouched by this diff. This branch adds the 217th instance, so the deferral is incremented here rather than inherited whole.

**A class the wave should hand forward, not a third coincidence.** Three consecutive branches have now produced a title finding on the first read against neighbours — branch 2 (`REF_ERROR_LITERAL` omitted `#REF!`), branch 3 (`ROW_CELLS_FUSED` terminology drift), branch 4 ("shifted" appears in no other field). Each `title` was authored to match sibling *grammar* ("Auto-corrected a …") without checking that it shares *vocabulary* with the `longExplanation` rendered directly beneath it. The rule is one line: **every content word in a `title` must appear in that entry's `longExplanation`, and the phrase Doug would search for must appear in both.** Branch 5 should apply it before its critique gate rather than at it, and a fifth instance earns a mechanical check in `tests/messages/_metaWarningCardCopy.test.ts`.

**Systemic note, recorded so a later reviewer does not re-derive it as a branch-4 finding:** `syncing-sheets` is now the largest family at 58 of 219 entries, 8 clear of `crew-schedule`, rendered as a flat run of `h3`s under one `h2`. That is information-architecture pressure the wave has added to across four branches, not a defect in this diff, and it belongs to a `/help/errors` grouping pass.

Review record: Codex CLI was quota-dead for this arc, so spec, plan, per-task, and whole-diff adversarial review all ran through the substitute mechanism named in the overview — independent Claude sessions under the same probe-backed admissibility contract, with real CI as the hard arbiter. **Not claimed as a cross-model APPROVE.** Because no dispatch went through `codex-guard`, this arc has no `docs/review-rounds/` corpus rows; that gate keys off wrapper-written rows, so none are owed.
