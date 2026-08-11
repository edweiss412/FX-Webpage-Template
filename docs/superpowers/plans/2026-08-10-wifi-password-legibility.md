# Plan: Wi-Fi password transcription affordance (+ trailing-prose closure)

**Spec:** `docs/superpowers/specs/2026-08-10-wifi-password-legibility.md` (APPROVED, round 17, 0 findings — the async-copy semantics, geometry, sentinel path, and spike evidence are all settled; do not relitigate any §1.1 or round-repaired decision) · **Branch:** `feat/wifi-password-legibility` · **Implementer:** Opus / Claude Code (crew UI — routing hard rule)

**Meta-test inventory (declared):** EXTENDS `tests/components/crew/sections/VenueSection.wifiRoom.test.tsx` + the crew wifi suites (fixture fallout enumerated in spec §6: `tests/parser/blocks/event.test.ts:33`, `tests/crew/wifiDisplay.test.ts:44`, the `tests/crew/wifiDisplay.test.ts:233` region, and `EXPECTED_SPLITS` + census at the `tests/crew/wifiDisplay.test.ts:89` region), `tests/e2e/crew-page.spec.ts` (+ `scripts/check-crew-e2e-executed.mjs` floor recalibration), `tests/e2e/standalone.config.ts` (new registered harness + `node scripts/check-standalone-baseline.mjs --write`), the font-wait `CALLERS` registry (`tests/e2e/_metaFontWaitCoverage.test.ts:31`), and the `BACKLOG_GRADUATED` registry (two rows). CREATES the shared copy-feedback timing constant module under `lib/` (spec §4.2 — `ShareLinkCopyButton`'s `2_000` literal migrates in the same PR; DEFERRED.md:242 trigger declared fired). Advisory locks / Supabase / admin alerts: none applies.

**Plan-time red transcript (run 2026-08-11, this worktree):** `grep -rn "CopyFactValue" components/` → no matches (island absent); `grep -n "code\|copyLabel" components/crew/primitives/FactRows.tsx` → neither flag exists; the spec-time spike passes (`docs/superpowers/specs/probes/2026-08-10-wifi-ownership-spike.test.tsx`, 1 passed, rerun under tests/components/); Task 4's negated entry-heading greps → exit 1 (both entries present).

**Layout-dimensions task:** REQUIRED — folded into Tasks 2-3 with the spec's Dimensional Invariants verbatim: 44×44 target (`--spacing-tap-min`), 36×28 margin box (`-my-2 -ml-2`), `size-7` tile, right edge pinned to the row edge, row height == icon-row height (±0.5px, same-row with/without counterfactual), target within the `SectionCard` `getBoundingClientRect()` border box, disjoint from every other row's rect in BOTH topologies (mid-list and `last:pb-0` last-row), focused-ring disjointness (border box inflated 4px on the value side, gap-3.5 arithmetic), 40-char wrap containment.

**Transition-audit task:** REQUIRED — the spec's inventory table verbatim in Task 1's suite: idle→copied (instant swap), copied→idle (shared-constant timeout), idle↔focus-visible, copied↔focus-visible; compounds: re-tap while copied (append + reset), prop change while copied (reset + corrective entry), overlapping same-value and different-value inversions (§4.2's ONE value-only rule), remount trace (ledger routing).

<!-- tasks: depth=2 -->

## Task 1 — FactRows flags + CopyFactValue island (unit/component)

<!-- task: red=`pnpm vitest run tests/components/crew/primitives/copyFactValue.test.tsx` ac=AC-1,AC-2,AC-3 -->

Red is written SUITE-FIRST (invariant-1): the new suite encodes the spec's settled contracts and fails because none of it exists (plan-time transcript above). Cases: `code: true` → `code-value` on the value span (scoped by testid); control renders only with non-empty `copyLabel`; the §4.2 DOM shape (conditional `flex min-w-0 items-center justify-end gap-3.5` wrapper; control-free consumers byte-identical); Class B adapted geometry classes pinned including `rounded-md` and the `text-text` glyph token; the full §4.2 ring string pinned; writeText spy-argument byte oracle (`ORDTG.` fixture); the ONE value-only resolution rule (same-value inversion → two "Copied." entries, no corrective; different-value inversion → corrective + copied-clear); every non-timeout exit from copied appends the corrective entry; layout-effect ownership (remount trace per the committed spike's regression form); rendered `role="log"` region (`label="Copy confirmations"`, `testId="venue-wifi-copy-log"`) with before/after append assertions; fake-timer contracts (shared-constant timeout reset; re-tap restart); clipboard-rejection idle path.

1. `FactRow` gains `code?: boolean` + `copyLabel?: string`; row keying by `testId` when present (stable across sibling churn).
2. New island under `components/crew/primitives/` (`"use client"`): module write ledger + layout-effect active-owner registration, value-only resolution truth, corrective entry, announce region, shared timing constant (created under `lib/`, `ShareLinkCopyButton:109` literal migrated + its suite green).
3. `VenueSection.tsx:262` push site gains `code: true, copyLabel: "Copy the Wi-Fi password"`.
4. Sentinel fixture: `N/A` password → no password row AND the raw `Crew Wi-Fi` fallback present (spec §7's fail-soft pin).
5. Green: suite passes; the fixture-fallout sites (header inventory) updated; `pnpm vitest run tests/crew tests/components/crew tests/parser` green.

## Task 2 — Production-route e2e (crew-page.spec.ts)

<!-- task: red=`sh -c 'CREW_E2E_ONLY=1 pnpm exec playwright test tests/e2e/crew-page.spec.ts --project=mobile-safari'` ac=AC-1,AC-2 -->

Red is written by this task: the Waldorf seed's internet cell becomes the parsing credential pair (spec §6) and the new describe asserts the live row's floor/pinning/containment/focus-ring cases — failing against the tree until Task 1's classes exist (the seed change alone flips the wifi rendering, so the existing wifi assertions enumerated in the header are updated in the SAME commit, red observed on the new cases). Floor derived from `--spacing-tap-min`; oracle floor in `check-crew-e2e-executed.mjs` recalibrated from a real run.

## Task 3 — Standalone geometry harness

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/wifi-password-row.standalone.spec.ts` ac=AC-2 -->

Red is written by this task: the new spec file is REGISTERED in `standalone.config.ts` (explicit allowlist lines per spec §6), renders the REAL `FactRows` + island with production compiled CSS (live-entry rule), awaits `document.fonts.ready` (+ `CALLERS` registry row), regenerates `tests/e2e/standalone-baseline.json` via the named `--write` command; cases: same-row with/without counterfactual height equality, mid-list vs last-row topologies, focused-ring disjointness, 40-char wrap. Fails until the island exists; green after.

## Task 4 — Impeccable gate, graduations, merge

<!-- task: red=`grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=[0-9]+ p1=[0-9]+ dispositions=(recorded|none)$" docs/superpowers/plans/2026-08-10-wifi-password-legibility.md` ac=AC-4,AC-5 -->

Red now (full-grammar line-anchored grep, exit 1 — plan-time transcript). Run both halves of the invariant-8 dual gate (canonical v3 setup); fill §12 (marker + full P0-P3 table; P0/P1 fixed or DEFERRED.md only); RERUN the same grep and observe exit 0. Then: PREPARE the graduation content UNCOMMITTED (BOTH entries — `BL-VENUE-WIFI-PASSWORD-TRANSCRIPTION-LEGIBILITY` and `BL-WIFI-FLATTENED-TRAILING-PROSE` with the §3 probe recorded — archive moves + two `BACKLOG_GRADUATED` rows + marker removal); whole-diff cross-model review to APPROVE with the staged diff in scope (UI-touching repairs re-gate + refresh §12); commit the reviewed graduation content as the PR's LAST commit; `pnpm vitest run tests/docs` green; real CI green; `gh pr merge --merge`; fast-forward main; `0  0`.

<!-- tasks: end -->

## Acceptance criteria (crosswalk to the spec's §8)

- AC-1: `code-value` on the password value; SSID row untouched.
- AC-2: the copy control per the settled geometry/behavior contracts, all Dimensional Invariants measured in both homes.
- AC-3: clipboard-unavailable path silent and safe.
- AC-4: both entries graduate with registry rows; markers off in the graduation commit.
- AC-5: the invariant-8 dual gate (both halves) run with P0-P3 dispositioned.

## §12 — impeccable gate record

The marker line lands here, filled, at Task 4 completion, followed by the full findings table.
