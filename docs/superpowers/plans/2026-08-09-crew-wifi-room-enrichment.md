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

<!-- task: red=`pnpm vitest run tests/components/crew/factRows.test.tsx` ac=AC-3 -->

RED: FactRows unit test asserting a row with `testId` emits `data-testid` and a row without emits none — fails against the current `k/v/sub/icon` type. Implement the optional field. Every existing FactRows consumer untouched (additive optional). **Commit:** `feat(crew-page): FactRow optional testId`.

## Task 3 — VenueSection wiring (Wi-Fi rows + room row) + transition audit

<!-- task: red=`pnpm vitest run tests/components/crew/sections/VenueSection.wifiRoom.test.tsx tests/components/crew/sections/VenueSection.test.tsx` ac=AC-3,AC-4 -->

RED: VenueSection RTL cases — split value renders `venue-wifi-ssid` ("Wi-Fi network"), `venue-wifi-password` (only when non-null), `venue-wifi-notes` rows; unsplittable renders the existing raw "Crew Wi-Fi" row BYTE-identically (snapshot equality against a pre-change capture — the fail-soft regression pin); empty renders nothing; room row `venue-room` renders a REAL gs name, and is ABSENT for zero rooms / empty name / synthesized `General Session` / `tileErrors["rooms"]` set / breakout-only shows; multi-gs picks first by `compareRooms`. **The synthesized-name case is FIXTURE-DERIVED (plan R3 F1):** it runs `parseSheet` on one of the five raw fixtures that produce the synthesized name (e.g. `fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md`), projects its parsed rooms into the `makeShowForViewer` override, and asserts no row — a parser-to-UI regression, never a hand-authored `{ kind, name }` literal (which would pass vacuously against a renamed fallback). Transition audit folded here per the spec §3.5 inventory, reproduced verbatim (plan R1 F1):

| Transition | Treatment |
| --- | --- |
| any state → any state (across server re-render) | instant — server-rendered fact list, no animation, no client state (matches every existing VenueSection row) |

State pairs enumerated for the audit (each is a server-render delta, all instant): Wi-Fi raw ↔ split ↔ absent; password row present ↔ absent; notes row present ↔ absent; room row present ↔ absent. Conditional-branch enumeration covers the IMPERATIVE `factRows.push` conditions in `VenueSection.tsx` (:172-188 region — the push-guard style, not just JSX ternaries) plus every new push this task adds; the audit test lists each condition and asserts the new rows introduce NO client component, NO AnimatePresence, NO transition classes. Anti-tautology: the raw-fallback snapshot is captured from the CURRENT component before the change lands (committed as a fixture), so the byte-identical claim is against the true pre-change render. **Commit:** `feat(crew-page): venue Wi-Fi split rows + room row`.

## Task 4 — graduations (both entries, markers off, registry rows)

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts` ac=AC-5 -->

RED: add the two `BACKLOG_GRADUATED` rows FIRST (`BL-FLIGHT-LEG-ORIENTATION`, `BL-CREW-FIELD-ENRICHMENT`, provenance `feat/crew-field-enrichment`) — the graduation meta-test fails: registry rows without archived sections. Implement: move both entries to `BACKLOG-archive.md` (`BL-FLIGHT-LEG-ORIENTATION` as OBSOLETE with the §0.3 evidence — structured flight card shipped, PR-38-217 audit line, live successor filed as TRAVEL-FLIGHT-SUPPRESSED-LEGIBILITY-1; `BL-CREW-FIELD-ENRICHMENT` as RESOLVED — flight bullet shipped prior with the stale-claim correction recorded, Wi-Fi + room bullets this PR), each with `Recorded by feat/crew-field-enrichment.` and original text preserved; remove both from BACKLOG.md WITH their IN PROGRESS markers (same commit — archives reject in-flight entries). GREEN both meta-tests. **Commit:** `docs: graduate BL-FLIGHT-LEG-ORIENTATION (OBSOLETE) + BL-CREW-FIELD-ENRICHMENT (RESOLVED)`.

<!-- tasks: end -->

**RED-command corrections (diff review R2 F4).** Task 2's command named `tests/components/crew/primitives/factRows.test.ts`, which does not exist — the FactRows suite lives at `tests/components/crew/factRows.test.tsx`, and the task extends it rather than creating a sibling, so the command could never have completed a RED-to-GREEN cycle as written. Task 3's command named the pre-existing Venue suite plus Task 1's already-green parser suite, omitting the new `VenueSection.wifiRoom.test.tsx` that carries its RED. Both are corrected above to the files the implementation actually drove, so the invariant-1 evidence is reproducible from the plan.

Task 3's suite is a SIBLING file (`VenueSection.wifiRoom.test.tsx`) rather than an append to the 228-line `VenueSection.test.tsx`, matching the `ScheduleSection.*` / `TravelSection.*` convention already in that directory.

## Close-out (not a TDD task)

Impeccable dual-gate with the canonical v3 setup sequence (the skill's context loader: PRODUCT.md + DESIGN.md → register reference read → `/impeccable critique` → `/impeccable audit`) on the diff; findings + dispositions in §12 below; the machine-valid `impeccable-gate:` marker written there at close-out per the parser grammar in `tests/docs/_invariant8Closeout.ts` (`critique=RAN audit=RAN p0=... p1=... dispositions=...`; no placeholder until then). Full ladder: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Whole-diff codex review, DETACHED dispatch (nohup — harness background tasks get killed on this box), brief: REVIEWER ONLY; consequence bound "every internet value is split correctly or rendered raw verbatim (handled correctly OR signaled, never silently wrong; the notes prose is never discarded)"; fence "organically-authored sheet text; adversarial cell content files to documented limits"; convergence = the AC suite + §4 corpus as the closure. Push → real CI green (12 required contexts; Vercel rate-limit fail is not required) → merge → main sync `0  0` (AC-6, AC-7). Note: NO invariant-12 marker removal in the last commit — the markers leave in Task 4's archiving commit (a graduating entry's marker comes off in the same commit that archives it).

## §12 Impeccable closeout

Run 2026-08-10 against the diff's UI surface: `components/crew/sections/VenueSection.tsx` (Wi-Fi split rows + Room row) and `components/crew/primitives/FactRows.tsx` (optional `testId`). Canonical v3 setup gates ran first: `context.mjs` loaded PRODUCT.md + DESIGN.md, and the **product** register reference was read (app UI — design SERVES the product), per the register-selection rule.

**⚠️ DEGRADED: single-context (both isolated assessment sub-agents were dispatched and died without returning).** Recorded rather than hidden, per the critique contract's rule that a silent degraded run is a failed run. Cause is the machine, not the diff: this box was running ~172 concurrent peer sessions at a load average that peaked over 500 during the window, and both agents were lost to the same background-process kill class already documented for it (`AGENTS.md`, Codex silent-death section). The deterministic half did NOT degrade — `detect.mjs` ran directly against both files and returned `[]` (exit 0), and the mechanical UI invariants were re-run by hand over the diff. What degraded is the isolation between the design review and the detector evidence, not their coverage.

### Deterministic scan

`detect.mjs` on both files: **0 findings**, exit 0. Hand-run mechanical invariants over `git diff origin/main...HEAD -- components/`:

| Invariant | Result |
| --- | --- |
| em-dash in user-visible copy | PASS — four hits, all inside code comments; no rendered string contains one |
| arbitrary bracket values (`text-[`, `bg-[`, `shadow-[`, `duration-[`) | PASS — none added |
| new `className` strings | PASS — none; the diff adds row DATA to an existing primitive, no new markup |
| 44px tap targets | N/A — the diff introduces no interactive element (`<button>`, `<a>`, `onClick`, `role="button"`, `href` all absent from added lines) |
| new color token | PASS — none; no `DESIGN.md` contrast pin owed |
| browser overlay | SKIPPED — no dev server, and starting one risks the documented sibling-worktree `:3000` collision. Fallback signal recorded here rather than claimed as run. |

### Findings and dispositions

**P0: 0. P1: 1 (fixed). P2: 2 (one filed, one accepted). P3: 1 (accepted).**

- **[P1 — FIXED] The retained notes row was labeled "Crew Wi-Fi" while its value describes a hardline.** Probe over the corpus values that produce notes: `Hardline from Encore`, `Encore to provide hardline for streaming`, `Hardline from Encore`, `Encore to provide hardline for streaming`, `Wifi for Polling` — four of five describe a WIRED connection. "Crew Wi-Fi: Hardline from Encore" tells a crew member deciding how to get a stream online the opposite of what the sheet says, which is a correctness defect in copy, not a preference. Renamed to **"Internet notes"**. The RAW-FALLBACK row keeps "Crew Wi-Fi" — there the value is the whole internet cell, so the label is still true, and keeping it is also what preserves the byte-identical fail-soft pin. Spec §3.2 carries the amendment with the same probe, so spec and code do not drift.
- **[P2 — FILED] The Wi-Fi password row has no transcription affordance.** Proportional `text-sm font-semibold` does not disambiguate `O`/`0` or `l`/`1`/`I` for a value that exists to be typed by hand into a phone in a dim ballroom, and `DESIGN.md` already mandates tabular figures for the same glance-and-transcribe reason on times, dates, counts, and confirmation numbers. Deferred because the affordance is a design decision this PR cannot settle (tabular / monospace / tap-to-copy / larger step) and every option widens `FactRows` past the single declared `testId`. Filed as `BL-VENUE-WIFI-PASSWORD-TRANSCRIPTION-LEGIBILITY` with the live-surface probe (two of four live sheets reach the row).
- **[P2 — ACCEPTED] "Room" understates that the row names the general-session room only.** A crew member working a breakout can read `Room: SALON ABC` as theirs. Accepted rather than fixed: spec §6.6 already ratifies general-session-only as the scope line, breakout names render in their own room-scoped tiles, and the precise alternative ("General session") is a 15-character `whitespace-nowrap` label that squeezes the value column at 390px — the fix costs more than the ambiguity on the surface where it matters most.
- **[P3 — ACCEPTED] The three Wi-Fi rows have a ragged left edge**, because only the first carries the WifiIcon. Deliberate: the icon marks where the connectivity group starts, and repeating it three times would be noise against "every element earns its pixel". The ragged edge is a property of the existing `FactRows` primitive (each row is its own flex container with a `shrink-0` label), not something this diff introduced.

### Audit dimensions

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | `<dl>`/`<dt>`/`<dd>` label-before-value semantics preserved; no new interactive element, so no focus/target surface added; no state carried by color |
| 2 | Performance | 4 | Pure synchronous server render; one line-oriented regex scan per render, no client boundary, no motion |
| 3 | Responsive | 3 | Label `whitespace-nowrap` + `shrink-0` against a `wrap-break-word` value column handles a long SSID; "Wi-Fi password" is the longest new label and the one narrowing the value column at 390px |
| 4 | Theming | 4 | No new token, no hard-coded color, no class change at all |
| 5 | Anti-patterns | 4 | Detector clean; the rows reuse the existing fact-list vocabulary rather than inventing an affordance |
| **Total** | | **19/20** | Excellent (minor polish) |

### Second gate run — 2026-08-10, on the FINAL diff

The first run (above) gated commit `7cb562004`. Review then found, correctly, that `VenueSection.tsx` changed materially afterwards — the all-or-nothing fallback and the derived-sentinel handling — so the recorded gate no longer covered the shipping UI. Invariant 8 gates the affected diff, and the affected diff moved. Re-run here against the final state.

**What actually changed on the UI surface since the first run**, isolated with `git diff 7cb562004..HEAD -- components/crew/sections/VenueSection.tsx components/crew/primitives/FactRows.tsx`: the Wi-Fi split is rejected when any derived field is a sentinel, the split is rejected when the cell carries syntax the grammar did not resolve, the room name is sentinel-gated at its read site, and three comments were corrected. **No rendered string changed** — "Internet notes" landed in the gated commit itself — and the deterministic sweep over the final diff confirms zero new `className` strings, zero arbitrary bracket values, zero new color tokens, zero new interactive elements, and every em-dash hit inside a code comment rather than user-visible copy. `detect.mjs` on both files: `[]`, exit 0.

**The design question this run actually has to answer** is therefore not "is there new UI" but "does the surface degrade now that more cells take the raw fallback?" It does not, and the reason is structural rather than a judgment call: the raw fallback IS the pre-change v1 row — the same label, the same icon, the same markup, pinned byte-for-byte against a capture of the component before this arc. The worst case of every tightening in this arc is the surface that already shipped and already passed a gate. What the tightenings removed is the case where a crew member saw a confident, wrong credential, and the case where the cell vanished entirely — both strictly worse than the fallback for someone standing in a ballroom trying to get online.

**Findings: P0 0 · P1 0 · P2 0 · P3 0.** The three dispositions from the first run stand unchanged: the P1 was fixed, one P2 is filed as `BL-VENUE-WIFI-PASSWORD-TRANSCRIPTION-LEGIBILITY`, the other P2 and the P3 are accepted with reasons recorded above. No new finding arises from the delta, because the delta adds no copy, no color, no control, and no motion — only a stricter gate in front of rows that were already gated.

**Scope of this claim, after a concurrent upstream change (review S5 R4).** `origin/main` edited `VenueSection.tsx` while this arc was in review — a `thumbnailSizes` hint on the DIAGRAMS block, unrelated to the Facilities rows — and it arrived here by merge carrying its own invariant-8 gate from its own arc (`4dbff05de chore(crew-page): impeccable dual-gate dispositions`). This record therefore gates THIS arc's delta, measured as `git diff origin/main...HEAD` over the two UI files, with the branch fully reconciled so that command has a SINGLE merge base (repeated merges had left four, and git then picks one arbitrarily and warns — the diff it produced included unrelated merged work, so the claim could not be substantiated until the bases collapsed; review S8 R2); upstream's lines are gated where they were written. Re-running `detect.mjs` against the merged files after that merge still returns `[]`. The alternative reading — that a merge obliges an arc to re-gate everything already on main — would make every merge unbounded and would gate the same lines twice while gating nothing new.

**⚠️ DEGRADED: single-context (sub-agent assessments unavailable).** Same declaration as the first run and the same cause: both isolated assessment agents dispatched for that run died without returning, to this machine's documented background-process kill class, and a second attempt was not worth another multi-hour loss when the deterministic half — which is the half that can be automated — runs identically inline. `detect.mjs` and every mechanical invariant executed for real; what is missing is assessment isolation, not coverage.

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=1 dispositions=recorded

## Invariant checklist

- Invariant 1: each task's RED is corpus/production-derived (absent module, absent type field, current component render, registry-without-archive).
- Invariants 2/10: N/A — no locks, no mutation surfaces.
- Invariant 5: no raw codes involved; the fail-soft path renders sheet text verbatim (not an error surface).
- Invariant 8: dual-gate in close-out; §12 carries the marker.
- Invariant 9: no Supabase call changes.
- Invariant 12: markers off in Task 4's archiving commit.
- AC map (spec §5): AC-1/AC-2 Task 1 · AC-3 Tasks 2+3 · AC-4 Task 3 · AC-5 Task 4 · AC-6/AC-7 Close-out.
