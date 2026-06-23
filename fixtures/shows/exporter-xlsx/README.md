# `exporter-xlsx/` — production-exporter markdown fixtures

These 7 files are the **exact output of the production ingestion exporter** —
Drive XLSX export → `synthesizeMarkdownFromXlsx` (`lib/drive/exportSheetToMarkdown.ts`) —
captured on **2026-06-18** from the live `fxav-test-shows` Drive folder
(`1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C`) via the `fxav-reader` service account.

## Why these exist (fixture-fidelity gap)

The `../raw/` fixtures were produced by the **Drive MCP `read_file_content`** converter —
a *different* renderer than what production actually feeds `parseSheet`. The
grounding audit (`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/sheet-data-grounding-audit-2026-06-18.md`)
found that running the **real** exporter surfaces a class of bugs invisible to the
`raw/` fixtures: DETAILS-column collapse, room block-orphaning, transport drops,
stale `OLD PULL SHEET` ingestion, etc. These files are the regression inputs that
pin parser behavior against what production emits.

## Frozen `.xlsx` snapshots + the creds-free round-trip guard

Each `<show>.md` has a committed sibling `<show>.xlsx` — the Drive xlsx export of that
show, **trimmed to values + merges** (the only inputs the synthesis reads; styling /
empty template rows stripped, ~12 MB → ~0.6 MB total). `tests/drive/round-trip-fixture.test.ts`
asserts `synthesizeMarkdownFromXlsx(<show>.xlsx) === <show>.md` for all 7 in the normal
`unit-suite` — **no live Drive, no secret**. This catches a synthesis-code regression
(the 2026-06-18 class) deterministically.

Deliberately pinned to the FROZEN snapshot, **not** the live sheet: the live
`fxav-test-shows` sheets must stay freely editable for exercising the app's sync /
change-detection behavior, and a live-byte guard would red-flag those intentional edits.

## Provenance (test-folder copies, not Doug's originals)

These are the `fxav-test-shows` **copies**, distinct from the original Doug sheet IDs
in `../README.md`. **Re-capture (when the synthesis changes or you re-snapshot a sheet) —
regenerate BOTH `<show>.xlsx` AND `<show>.md` together, then update parser expectations
in lockstep:** export each sheet as XLSX, run `synthesizeMarkdownFromXlsx` to write the
`.md`, and trim the `.xlsx` to values + merges (rebuild each tab via
`aoa_to_sheet(sheet_to_json(header:1))` preserving `!merges`).

| Fixture | Show | Template ver | Spreadsheet ID |
|---|---|---|---|
| `redefining-fi.md` | Redefining Fixed Income / Private Credit Forum 2025 | v2 | `1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg` |
| `consultants.md` | Consultants Roundtable 2025 (AII/III) | v2 | `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4` |
| `fintech.md` | FinTech Forum CTO Summit 2026 | v4 | `1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY` |
| `east-coast.md` | East Coast Family Office Symposium | v1/v2 | `1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY` |
| `ria.md` | RIA Investment Forum Central 2025 | v2 | `1Ll_fx6Q24y6aTSqIV7YiruDKrYtezkkKrVCXVc4Cwkw` |
| `fixed-income.md` | Fixed Income Trading Summit 2025 | v4 | `1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4` |
| `rpas.md` | RPAS Central 2026 | v4 | `1vyZMRTqeFAJgocbSJM2_HDDMsUUJFBiLKk6WKq-dUYo` |

## Known parser defects these fixtures currently exercise

As of capture, `parseSheet` on these inputs reproduces (see audit doc §end-to-end):
`event_details` empty (4 shows), General Session / breakout rooms dropped, transportation
`null` (v4 shows), `pullSheet` null/empty/stale, East Coast `dates` null + phantom
`DOCUMENTS` crew row, agenda label miss, hotel check-in/out null/inverted. Tests added
against these fixtures should assert the **corrected** behavior (failing until each bug
is fixed), per TDD.
