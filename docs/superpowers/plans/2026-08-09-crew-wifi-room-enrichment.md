# Plan — crew Wi-Fi split + room surfacing + two graduations

**Spec:** `docs/superpowers/specs/crew/2026-08-09-crew-wifi-room-enrichment-design.md` (converged: R4 APPROVE, FINDINGS: 0) · **Branch:** `feat/crew-field-enrichment` · **Ledger:** `BL-CREW-FIELD-ENRICHMENT` + `BL-FLIGHT-LEG-ORIENTATION` (both graduate in this PR)

Implementer: Opus / Claude Code (UI arc: `components/crew/**`). Impeccable dual-gate applies (invariant 8).

## Meta-test inventory (mandatory declaration)

CREATES: none. EXTENDS: `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED` gains two rows — Task 4). No Supabase call site changes (display-time parsing only); no mutation surface; no locks. The graduation + in-progress ledger meta-tests are the structural gates on Task 4.

## Pre-draft verification pass (2026-08-09; the spec's four review rounds probe-verified every citation)

`VenueSection.tsx` internet/power fact rows + `shouldHideGenericOptional`; `FactRow` type = `k/v/sub/icon` only (`components/crew/primitives/FactRows.tsx:28-36`); `ProjectedRoomRow = RoomRow & { id }` + `compareRooms` + kind ranks (`lib/crew/resolveKeyTimes.ts:15` (type), with the ranks and compareRooms just below); `readRooms` fail-soft `[]` + `tileErrors["rooms"]` (`lib/data/getShowForViewer.ts` rooms reader); synthesized GS literal `General Session` (`lib/parser/blocks/rooms.ts` fallback branch); corpus values verbatim in spec §4 (both fixture families + 4 live sheets); graduation registry shape (`tests/docs/_metaDeferralLedgerGraduation.test.ts:95` `BACKLOG_GRADUATED`, provenance = string the archived section must contain); archive entry shape (BACKLOG-archive.md precedents: RESOLVED + OBSOLETE forms).

<!-- tasks: depth=2 -->

## Task 1 — `parseWifiValue` (corpus-derived TDD)

<!-- task: red=`pnpm vitest run tests/crew/wifiDisplay.test.ts` ac=AC-1,AC-2 -->

RED: new `tests/crew/wifiDisplay.test.ts` with every §4 corpus value verbatim as a case — the two live multi-line values, the flattened fixture shapes, Consultants (ssid `Institutional Investor` / password `Investor2025` / notes `Wifi for Polling` — the R1 corruption regression pin), RIA (dash separator), all four prose-only values → `null`, empty → `null`, password-only → `null`, plus the accept-set negatives (`Dress Code: formal` as the internet value → `null` for want of a network label; `Backdrop / Scenic`-class → `null`). Fails: `lib/crew/wifiDisplay.ts` absent. Implement per spec §3.1 (NET/PWD label sets, colon+dash separators, lookahead stops at any label, notes never discarded, trailing-punctuation preserved). Anti-tautology: expected values are typed literals FROM the spec table, never derived by running the parser. **Commit:** `feat(crew-page): Wi-Fi SSID/password display parser`.

## Task 2 — `FactRow.testId` (declared shared-primitive change)

<!-- task: red=`pnpm vitest run tests/components/crew/primitives/factRows.test.ts` ac=AC-3 -->

RED: FactRows unit test asserting a row with `testId` emits `data-testid` and a row without emits none — fails against the current `k/v/sub/icon` type. Implement the optional field. Every existing FactRows consumer untouched (additive optional). **Commit:** `feat(crew-page): FactRow optional testId`.

## Task 3 — VenueSection wiring (Wi-Fi rows + room row) + transition audit

<!-- task: red=`pnpm vitest run tests/components/crew/sections/VenueSection.test.tsx tests/crew/wifiDisplay.test.ts` ac=AC-3,AC-4 -->

RED: VenueSection RTL cases — split value renders `venue-wifi-ssid` ("Wi-Fi network"), `venue-wifi-password` (only when non-null), `venue-wifi-notes` rows; unsplittable renders the existing raw "Crew Wi-Fi" row BYTE-identically (snapshot equality against a pre-change capture — the fail-soft regression pin); empty renders nothing; room row `venue-room` renders a REAL gs name, and is ABSENT for zero rooms / empty name / synthesized `General Session` / `tileErrors["rooms"]` set / breakout-only shows; multi-gs picks first by `compareRooms`. Transition audit folded here per the spec §3.5 inventory (single row: all transitions instant, server-rendered, no client state): the audit test asserts the new rows introduce NO client component, NO AnimatePresence, NO transition classes — enumerated over the diff's JSX. Anti-tautology: the raw-fallback snapshot is captured from the CURRENT component before the change lands (committed as a fixture), so the byte-identical claim is against the true pre-change render. **Commit:** `feat(crew-page): venue Wi-Fi split rows + room row`.

## Task 4 — graduations (both entries, markers off, registry rows)

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts` ac=AC-5 -->

RED: add the two `BACKLOG_GRADUATED` rows FIRST (`BL-FLIGHT-LEG-ORIENTATION`, `BL-CREW-FIELD-ENRICHMENT`, provenance `feat/crew-field-enrichment`) — the graduation meta-test fails: registry rows without archived sections. Implement: move both entries to `BACKLOG-archive.md` (`BL-FLIGHT-LEG-ORIENTATION` as OBSOLETE with the §0.3 evidence — structured flight card shipped, PR-38-217 audit line, live successor filed as TRAVEL-FLIGHT-SUPPRESSED-LEGIBILITY-1; `BL-CREW-FIELD-ENRICHMENT` as RESOLVED — flight bullet shipped prior with the stale-claim correction recorded, Wi-Fi + room bullets this PR), each with `Recorded by feat/crew-field-enrichment.` and original text preserved; remove both from BACKLOG.md WITH their IN PROGRESS markers (same commit — archives reject in-flight entries). GREEN both meta-tests. **Commit:** `docs: graduate BL-FLIGHT-LEG-ORIENTATION (OBSOLETE) + BL-CREW-FIELD-ENRICHMENT (RESOLVED)`.

<!-- tasks: end -->

## Close-out (not a TDD task)

Impeccable dual-gate with the canonical v3 setup sequence (the skill's context loader: PRODUCT.md + DESIGN.md → register reference read → `/impeccable critique` → `/impeccable audit`) on the diff; findings + dispositions in §12 below; the machine-valid `impeccable-gate:` marker written there at close-out per the parser grammar in `tests/docs/_invariant8Closeout.ts` (`critique=RAN audit=RAN p0=... p1=... dispositions=...`; no placeholder until then). Full ladder: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Whole-diff codex review, DETACHED dispatch (nohup — harness background tasks get killed on this box), brief: REVIEWER ONLY; consequence bound "every internet value is split correctly or rendered raw verbatim (handled correctly OR signaled, never silently wrong; the notes prose is never discarded)"; fence "organically-authored sheet text; adversarial cell content files to documented limits"; convergence = the AC suite + §4 corpus as the closure. Push → real CI green (12 required contexts; Vercel rate-limit fail is not required) → merge → main sync `0  0` (AC-6, AC-7). Note: NO invariant-12 marker removal in the last commit — the markers leave in Task 4's archiving commit (a graduating entry's marker comes off in the same commit that archives it).

## §12 Impeccable closeout (populated at close-out)

Findings + dispositions land here; the standalone marker line is written here at close-out.

## Invariant checklist

- Invariant 1: each task's RED is corpus/production-derived (absent module, absent type field, current component render, registry-without-archive).
- Invariants 2/10: N/A — no locks, no mutation surfaces.
- Invariant 5: no raw codes involved; the fail-soft path renders sheet text verbatim (not an error surface).
- Invariant 8: dual-gate in close-out; §12 carries the marker.
- Invariant 9: no Supabase call changes.
- Invariant 12: markers off in Task 4's archiving commit.
- AC map (spec §5): AC-1/AC-2 Task 1 · AC-3 Tasks 2+3 · AC-4 Task 3 · AC-5 Task 4 · AC-6/AC-7 Close-out.
