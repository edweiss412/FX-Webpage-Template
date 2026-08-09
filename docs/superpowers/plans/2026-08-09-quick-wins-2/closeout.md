# Quick wins 2 — closeout

Per-branch invariant-8 dual-gate findings and dispositions, the observed-RED transcripts index, and the census/sweep dispositions. Each block lands ON ITS OWN BRANCH before that branch's final review and merge, so every closeout edit is part of a reviewed, merged diff.

Plan: `docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md` · Specs: `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md`, `docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md`

## Branch A — fix/quick-wins-2-mech

### §12.1 Design gate

Both halves ran on the branch diff (`git diff origin/main...HEAD` restricted to `app/**/*.tsx`, `components/**/*.tsx`, `app/globals.css`, `DESIGN.md`), with the canonical v3 setup: `context.mjs` context load (PRODUCT.md + DESIGN.md) then the product-register read (`reference/product.md` — this is admin/crew app UI, design serves the product). Critique ran dual-agent (Assessment A design review · Assessment B detector + compiled-CSS evidence, isolated until synthesis). Audit ran as its own pass.

**Expected outcome was zero visual delta, and that is what both halves measured** — not asserted. Assessment B and the audit each compiled every rewritten class pair with the project's own Tailwind 4.2.4 against a copy of `app/globals.css` and diffed the emitted declarations:

| Pair | Emitted | Verdict |
| --- | --- | --- |
| `break-words` → `wrap-break-word` | `overflow-wrap: break-word` both sides | identical, byte for byte |
| `min-w-[8.5rem]` → `min-w-34` | `min-width: 8.5rem` vs `calc(var(--spacing) * 34)`, `--spacing: 0.25rem` | text differs, computed identical (34 × 0.25rem = 8.5rem); zero `--spacing` overrides exist under `app/` or `components/` |
| `h-full w-full` → `size-full` | same two declarations, one rule | equivalent; no competing `h-*`/`w-*` at the call site, and `cn` carries no tailwind-merge conflict resolution |
| `h-5 w-5` → `size-5` | same two declarations, one rule | equivalent |
| `shadow-(--shadow-tile)` → `shadow-tile` | `--tw-shadow: var(--shadow-tile)` vs `var(--shadow-tile-runtime)` | text differs, computed identical — `@theme` declares `--shadow-tile: var(--shadow-tile-runtime)`, and only the `-runtime` token is redeclared under `[data-theme="dark"]` and `@media(prefers-color-scheme:dark)`, so light AND dark match |
| `shadow-(--shadow-popover)` → `shadow-popover` | as above | identical, both themes |

Critique heuristics: 8 of 10 unchanged by the diff; Consistency 3 (uneven wrap coverage — fixed, below), Error prevention 4 (a derived guard replaces an enumerated census). Audit dimensions: Accessibility 4, Performance 4, Theming 4, Responsive 4, Anti-Patterns 3 — **19/20, Excellent**.

Accessibility and responsive were checked as a normalized multiset diff of every rewritten class string, old versus new, across all 48 files: zero deltas in any `min-h-tap-min` / `min-w-tap-min` / `size-tap-min`, `focus-visible:ring-*`, or `ring-offset-*` token; no orphaned `ring-offset-2`; every `sm:` / `min-[480px]:` / `min-[720|768|960px]:` variant preserved through the six concatenation rewrites.

**P0: 0 · P1: 0.**

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| A-1 | P2 | `ShareLinkCopyButton.tsx` comment still read "`min-w-[8.5rem]` reserves the WIDER of…" after the class became `min-w-34`; the next person tuning the no-shift width greps `8.5rem` and finds nothing. | **FIXED** — comment now reads `min-w-34` (34 × 0.25rem = 8.5rem). |
| A-2 | P3 | `DESIGN.md` had no token-table row for `--shadow-popover` at all, though this arc canonicalized it and the new guard bans its arrow form. | **FIXED** — row added, light/dark values verified against `app/globals.css:356`/`:409`. |
| A-3 | P3 | Uneven `cn` coverage inside single files (`CompactAlertCard` wrapped `TONE_SKIN` but not `TONE_DIVIDER`/`TONE_DASHED_DIVIDER`; `RecentAutoAppliedStrip` wrapped `FALLBACK_PILL.cls` but not the sibling `KIND_PILL` map) — drift there still escaped `pnpm lint`. | **FIXED** — root cause was the census detector, not the sweep: its Tailwind-bearing heuristic required ≥2 tokens and did not model the `/opacity` modifier, so single-token values (`bg-status-idle`) and `border-status-warn/40` were invisible. Detector widened, re-run, and the 76 further sites repaired. See §12.3. |
| A-4 | P3 | `cn("single-class")` reads as a runtime no-op at the call site; the rationale lived only in `lib/ui/cn.ts` with nothing pointing there. | **PARTIALLY FIXED, remainder accepted** — `lib/ui/cn.ts` now states the single-argument idiom explicitly and names the pinning guard. A per-call-site comment across ~100 sites was rejected as worse than the problem: it would add 100 lines of identical prose to carry one fact that has one home. |
| A-5 | P3 | `app/globals.css`'s new comment embeds a dated plugin-behavior measurement (29 of 35 tokens canonicalized, six silent) that will rot. | **ACCEPTED** — spec §2.2 part 2 requires the comment to state the MEASURED mechanism rather than a theory, precisely because the previous claim was an unmeasured assertion that probed false. The measurement is date-stamped in the text and the comment already names the derived guard as the durable enforcement, so a reader who finds the numbers stale still lands on the thing that is not. |

Detector (`detect.mjs`) over the 45 changed `.tsx` files: exit 2, 14 findings, all `broken-image`, **all false positives** — every flagged line is an `<img>` mentioned inside a JSDoc or line comment, and none of the 14 lines is in this diff. The real JSX `<img>` tags at `VenueMapTile.tsx:100`, `step3ReviewSections.tsx:3726`, `GalleryLightbox.tsx:634`/`:703` carry real `src` values and were not flagged. Zero actionable detector findings.

Browser visualization: skipped. The change is source-level class spelling with no running dev server, and the compiled-CSS diff is strictly stronger evidence than a screenshot — it proves the emitted declarations rather than sampling one rendered state, and it covers dark mode, which a single light-mode capture would not.

The marker below reads `dispositions=none` because the grammar's cross-check ties that field to the P0/P1 count (`p0 + p1 > 0` requires `recorded`, zero requires `none`), and this gate found no P0 and no P1. The P2/P3 dispositions are the table above.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none

### §12.2 Observed-RED transcripts index

Every RED in this branch was observed against the live tree, and both observations recorded in the task's own commit message.

| Task | RED observed | Restored |
| --- | --- | --- |
| A1 | `rg -q 'hand on initial canonicalization' eslint.config.mjs` exit 0 before, exit 1 after | n/a (comment edit) |
| A2 | guard failed with a 22-site census (21 `--shadow-tile`, 1 `--shadow-popover`) | green post-sweep |
| A2 mutants | M1 parse-namespace narrowing → 3 named failures · M2 extension narrowing → 1 · M3 exclusion removal → 2 · M4 literal-restriction removal → 1 | 4 passed |
| A3 | structural case failed on 15 unwrapped initializers across the nine consts | green post-wrap |
| A3 evidence | planted `min-h-[44px]`: SILENT pre-wrap in all three files; REPORTED post-wrap at `DeveloperToggleButton.tsx:80`, `OnboardingWizard.tsx:166`, `AccentButton.tsx:88` | plants removed |
| A4 | `nameMatch.ts` multi-token surname branch neutered → 6 failed / 36 passed, including three of the new set's own legs | 42 passed, `git diff` empty |
| A5 | the two spawn-level cases failed (no refusal; ambient env reached the child) | green post-migration |
| A6 | mutant #14 per container: HelpSheet `gap-3`→`gap-0`, Step3Review `gap-2`→`gap-0`, StagedReviewCard `gap-2`→`gap-0`, each killing exactly its own case | 4 passed, tree clean |

### §12.3 Census and sweep dispositions

**A2 arrow-form census** — derived from the guard's own RED output, never copied from the spec or the entry (the entry's 2026-08-07 count of 24 had already rotted): 22 sites, 2 distinct tokens, all canonicalized. Residue grep `rg 'shadow-\(--shadow-(tile|popover)\)' app components lib` returns exactly one hit, `app/globals.css:287`, the deprecation mention that names the form in order to forbid it. Test-side fallout (three jsdom assertions, four e2e verbatim transcriptions, two rationale comments, one DESIGN.md row) repaired in the same PR.

**A3 class-const census** — the spec's `rg` shape misses one-line declarations, function-scoped consts, object VALUES and literal concatenations, so the sweep ran as an AST pass over every tracked `.ts`/`.tsx` under `app/` and `components/`. Two rounds, because the design-gate found the first round's detector under-inclusive:

| Round | Cover | Sites | Disposition |
| --- | --- | --- | --- |
| 1 | initializer or Record value, Tailwind-bearing (≥2 tokens, ≥60% matching a utility prefix), not already inside a recognized callee | 56 across 31 files | all repaired |
| 2 (gate finding A-3) | round 1 widened: `/opacity` modifiers modeled, single-token values admitted when they carry a dash, nested object values walked | 76 further across 12 files | all repaired |

Deferral was considered under class-sweep exception (c) — "spans enough sites to blow the review scope" — and REJECTED on measurement rather than feel: the transform is mechanical, `tsc --noEmit` is clean, and the whole class produced only four Tailwind drifts. Deferring would have cost a full pipeline to re-earn context already held.

**A5 psql-target class sweep**, the spec's scoped command re-run at implementation time:

```
rg -n 'TEST_DATABASE_URL \?\?' tests/e2e/helpers --glob '*.ts'
```

Three hits, all prose inside comments describing the removed pattern (`psqlTarget.ts:9`, `lockedCrewRestriction.ts:53`, `devCaptureStaged.ts:42`). Zero live module-load captures remain; both in-class helpers consume the one shared resolver through every DSN entry point.
