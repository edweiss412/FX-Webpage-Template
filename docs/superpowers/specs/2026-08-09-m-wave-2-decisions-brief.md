# M-wave 2 — decisions brief (capture of record)

**Date:** 2026-08-09 · **Session:** Fable kickoff (this branch: `docs/m-wave-2-spec`) · **Companion spec:** `2026-08-09-m-wave-2-design.md`

The user ratified the wave in two AskUserQuestion batches on 2026-08-09, after a full screen of the 36 open M-tier entries (census: `pnpm ledger:mass` — 77 open, XS 4 / S 24 / M 36 / L 13, mass 365). Answers verbatim below; the spec's §1.1 restates each as a do-not-relitigate item.

## Resolved scope — do not relitigate

Every answer in this brief is a user ratification. The companion spec's §1.1 (`docs/superpowers/specs/2026-08-09-m-wave-2-design.md`) is the operative do-not-relitigate list; this document is the capture of record it cites. A reviewer disputing an answer here is disputing a ratified user decision, not a design choice.

## Batch 1

1. **Pool composition for M-wave 2?** → **"Full pool (Recommended)"** — all 5 units, ~15 work items + 2 ride-along demotes, mirroring M-wave-1's "READY + decision-unlocked" shape.
2. **BL-CRON-WORKBOOK-FAULT-CODE: corrupt workbook on the cron path — which code?** → **"PARSE_ERROR_LAST_GOOD (Recommended)"** — key on `WorkbookSynthesisError`; copy tells Doug the latest edit did not parse and the previous version is still live.
3. **BL-SOURCE-ANCHORS-STALE: where does the anchor revision stamp live?** → **"Sibling column (Recommended)"** — `shows.source_anchors_modified_time`; readers untouched; one write per anchor-writing path.
4. **BL-GLYPHS-OUTSIDE-INTER-SUBSET: fix strategy?** → **"Widen Inter subset (Recommended)"** — regenerate the woff2 with the 24 missing codepoints; markup untouched. The lucide icon migration is explicitly NOT chosen.

## Batch 2

5. **BL-TAP-TARGET-STRUCTURAL-GUARD?** → **"Skip this wave (Recommended)"** — stays open; the non-literal-className policy decision is unmade and the surface is the recognizer-ratchet class.
6. **BL-OPS-LOG-DASHBOARD-BANNER?** → **"Skip this wave (Recommended)"** — bundle partner `BL-ADMIN-PER-SHOW-HISTORY` is claimed in flight (`fix/sync-log-show-id-duration`); settle the bundle after it lands; surface form deserves mockups.
7. **TRAVEL-SUPPRESSION-PARTIAL-EXPLANATION-1?** → **"skip this wave, flag for followup"** (user's own words) — the follow-up flag is recorded in spec §4 (documented limits): a dedicated crew-page suppression pass, bundled with its S sibling `TRAVEL-FLIGHT-SUPPRESSED-LEGIBILITY-1`.
8. **Ship M-wave 2 autonomously?** → **"Yes, fully autonomous. This fable session owns spec(s) + plan(s), launch new pane(s) for opus implementation(s) + closeout(s)"** (user's own words). Both user review gates (spec, plan) WAIVED.

## Screen summary (how the pool was derived)

36 open M entries screened 2026-08-09. Excluded without an ask: 3 claimed in flight (`BL-MUTATION-LEDGERGIT-SITE-DRIFT` + `BL-LEDGER-GIT-TIMEOUT-CONSTANTS` on PR #745, `BL-MUTATION-MERGED-CELL` on `feat/mutation-merged-cell`); 2 owned by the ratified parser-mutation wave (`BL-MUTATION-COLUMN-SHIFT`, `BL-MUTATION-SECTION-ORDER` — `docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md`, branches 4–5 of 5); 10 fenced by prior ratifications with unfired triggers (`BL-ADMIN-DASHBOARD-ROW-ACTIONS`, `BL-CREW-FIELD-ENRICHMENT`, `BL-FLIGHT-LEG-ORIENTATION`, `BL-PG-CRON-HOST-ASSERTION`, `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED`, `BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST`, `BL-CI-UNIT-GATE-EXCLUSIONS`, `BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING`, `BL-SERVER-ACTION-ORIGIN-GATE`, `BL-STEP3-FULL-CREW-PREVIEW`); 3 skipped by batch-2 answers above. Remainder = the 18-entry pool in spec §0.
