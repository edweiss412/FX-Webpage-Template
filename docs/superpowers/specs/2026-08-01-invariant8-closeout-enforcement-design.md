# Spec: invariant-8 closeout enforcement (BL-INVARIANT8-CLOSEOUT-ENFORCEMENT)

<!-- spec-lint: not-ui — test-infrastructure guard over docs/superpowers/plans; no app/, components/, or design-token surface is touched -->

**Charter:** `BACKLOG.md` entry `BL-INVARIANT8-CLOSEOUT-ENFORCEMENT` (filed off the 2026-07-24 dev-row copy close-out descope). **Branch:** `test/invariant8-closeout-enforcement`. **Status:** draft for adversarial review. **Probe sibling:** `docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-probes.mjs` (committed; all numbers below are its 2026-08-01 output).

The 2026-07-24 assertion was removed in `a20b94457` ("descope the ledger guard to what it can enforce truthfully") after three consecutive review rounds on the same vector. Its defects, verified against that commit's diff: discovery saw only TOP-LEVEL directories containing exactly `plan.md` (flat plans, `00-plan.md`/`PLAN.md` variants, and category subdirectories like `admin/` were silently invisible), and its closeout acceptance was substring-level (per `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/closeout.md:121-126`, "critique not run" satisfied it, and `/^##\s*12\b/` matched `## 12.4`). This spec restores the assertion with sound discovery and a machine-checkable grammar.

## 1 Scope

One structural guard (new test file + helper + frozen debt ledger), two write-path doc edits (AGENTS.md invariant-8 sentence; HANDOFF-TEMPLATE.md §12 marker), graduation of the BACKLOG entry. No app code, no DB, no CI workflow changes.

### 1.1 Resolved scope — do not relitigate

1. **Autonomy:** the user pre-authorized the full autonomous-ship pipeline for this item (2026-08-01, orchestrating session AskUserQuestion: "Pre-authorize all four"). User spec/plan review gates are waived; adversarial gates are not.
2. **Marker grammar supersedes the BACKLOG entry's lexical-hedge sketch.** The entry asks for "a lexical check [that] must reject hedges." Probe result: a prose hedge-scan reds the tree's three best closeouts on legitimate text — `docs/superpowers/plans/admin/2026-07-03-developer-tier/08-closeout.md:24` ("no TBD/TODO"), `docs/superpowers/plans/2026-07-23-gallery-action-outcomes/CLOSEOUT.md:14` ("hung pending state"), and `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/closeout.md:126`, which quotes "Critique skipped. Audit pending." verbatim while DOCUMENTING the old defect. The ratified mechanism is a machine marker line (§3.3): hedged prose cannot parse as a marker, so the entry's canonical bad string fails structurally (plant P-HEDGE pins it). No prose hedge-scan ships. The entry's intent (that string must not pass) is met; its sketch (scan prose for hedge words) is refuted by probe.
3. **Debt is a frozen snapshot, not a backfill.** 196 units declare the gate today (§2). Backfilling closeout markers onto ~190 shipped historical plans would fabricate compliance records for work whose gate evidence lives in handoff docs and PR bodies. The ledger freezes today's declaring units; enforcement is forward-looking plus staleness-policed (§4.3). This follows the entry's "migrate or explicitly debt-list" — we debt-list.
4. **Broad declaration predicate is deliberate.** "Unit declares" = any member file matches /impeccable critique/i AND /impeccable audit/i (§3.2). Over-breadth (a plan merely quoting AGENTS.md) is safe: the false-positive cost is one N/A marker line or one frozen ledger row, and every attempt to narrow the predicate re-opens the silent-under-report hole that killed the 2026-07-24 assertion. Same posture as the mdast ledger guard's registry-or-loud rule.
<!-- spec-lint: ignore — files created by this arc; not yet tracked -->
5. **Guard lives in a NEW file** (`tests/docs/_metaInvariant8Closeout.test.ts` + `tests/docs/_invariant8Closeout.ts`), not in `_metaDeferralLedgerGraduation.test.ts`. That file is scoped to BACKLOG ledgers (PR #646 rewrite); plans-tree closeout policing is a different corpus and walker. The BACKLOG entry's "restore the assertion" names the historical location, not a placement requirement.
6. **Marker-anywhere-in-unit IS the location rule.** The 2026-07-24 failure was "no rule locates a closeout for an arbitrary plan." The ratified rule: a unit conforms if any member file carries a valid marker line. File-placement (closeout.md vs in-plan §12) stays a style recommendation (§6), not a guard check — naming chaos (§2: closeout.md, CLOSEOUT.md, 01-closeout.md, 08-closeout.md, sibling -closeout.md, handoffs/*-closeout.md, one closeout DIRECTORY) makes any single-filename rule either a mass rename or a new silent hole.
7. **The guard verifies SHAPE, not truth** (the entry's own "honest ceiling"). A marker line is a signed claim in the diff, reviewable at PR time; the guard cannot verify a human ran the gate. Documented limit, §7.
8. **Specs tree and plan-less diffs are out of scope.** Invariant 8's closeout contract binds plans/milestone handoffs (AGENTS.md invariant 8: "Findings + dispositions go in §12 of the milestone's handoff doc"). A UI diff shipped with no plan document at all is invisible to this guard — diff-time gate enforcement is a different mechanism, deliberately not built here (§7).
<!-- spec-lint: ignore — quotes the ratified HANDOFF-TEMPLATE.md §12 string verbatim, em-dash included -->
9. **N/A branch is ratified upstream.** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/HANDOFF-TEMPLATE.md` §12: "For backend-only milestones, mark this section 'N/A — no UI surface' and skip." The grammar's N/A form (§3.3) implements exactly that branch.

## 2 Probed census (draft-time inputs; probe sibling, run 2026-08-01)

- `docs/superpowers/plans/` holds **309 units** (see §3.1) plus **13 undated files** (11 README.md at two depths, `BACKLOG.md`, `coverage.md`).
- **196 units declare both gate halves** — 118 flat files, 78 directories. The old guard's discovery shape (top-level dir with `plan.md`) saw at most a dozen.
- Closeout artifacts today: ~10 units have a `*closeout*` file; 6 units have a `## 12`-headed section anywhere; naming spans `closeout.md`, `CLOSEOUT.md`, `01-closeout.md`, `06-corpus-closeout.md`, `08-closeout.md`, flat sibling closeout files named after the plan stem, `handoffs/Phase-*.md-closeout.md`, and one closeout directory (`2026-07-26-ci-dark-descoped-closeout`).
- Undated files declaring both halves: exactly one, `docs/superpowers/plans/BACKLOG.md` (an index quoting gate language, not a plan) — allowlisted in §4.4.
- Hedge-word incidence in existing closeouts: 3 files (citations in §1.1.2) — all legitimate prose.

## 3 Definitions (input domains)

### 3.1 Unit

A unit is the topmost path segment under `docs/superpowers/plans/` matching /^\d{4}-\d{2}-\d{2}-/ — a dated flat `.md` file is a unit; a dated directory (at ANY depth, including inside category dirs `admin/`, `crew/`, `step3-onboarding/`, `v1-pre-deployment-amendments/`, …) is a unit owning every file beneath it (nested dated names inside a dated dir do NOT open sub-units; e.g. `2026-04-30-fxav-crew-pages-v1/shape-sessions/2026-05-13-*.md` belongs to the mega-unit). Files under no dated segment are "undated" (§4.4). This is the probe's partition, verified to enumerate all 309 units including every shape the old guard missed.

### 3.2 Declaration predicate

A unit declares the invariant-8 gate iff any member file matches BOTH /impeccable critique/i and /impeccable audit/i. Single-half mentions do not trigger (a doc citing only the critique command is discussing, not declaring, the dual gate; the dual-gate pairing is the invariant's own definition per AGENTS.md invariant 8).

### 3.3 Marker grammar

A marker line is any line beginning `impeccable-gate:`. Two valid forms (exact, anchored, one line):

```
impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>
impeccable-gate: N/A — no UI surface
```

Regexes (the implementation's authority):

- RAN form: `/^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(\d+) p1=(\d+) dispositions=(recorded|none)$/`
- N/A form: `/^impeccable-gate: N\/A — no UI surface$/`

Cross-check on the RAN form: `p0 + p1 > 0` requires `dispositions=recorded`; `p0 + p1 = 0` requires `dispositions=none`. A `RAN-DEGRADED` value asserts the gate ran in a degraded configuration (e.g. the dev-row single-context run) — the degradation's nature belongs in adjacent prose, which the guard does not read.

**Strictness rule:** EVERY line in a unit beginning `impeccable-gate:` must parse as one of the two forms and satisfy the cross-check. One valid marker conforms the unit; one malformed marker line anywhere in the unit reds it regardless of other valid markers (a typo'd marker must never silently not-count — that is exactly how "critique not run" passed the old substring check).

## 4 Guard architecture

<!-- spec-lint: ignore — files created by this arc; not yet tracked -->

Helper `tests/docs/_invariant8Closeout.ts` (pure functions over an in-memory file map, so plants run on fixture trees) + test `tests/docs/_metaInvariant8Closeout.test.ts` (runs the helper against the live repo). Mirrors the `_ledgerMdast.ts` / `_metaDeferralLedgerGraduation.test.ts` split shipped in PR #646.

Helper surface (names final):

- `partitionUnits(paths: string[]): { units: Map<string, string[]>; undated: string[] }` — §3.1.
- `declaresGate(text: string): boolean` — §3.2 (per file; unit-level OR is the caller's fold).
- `parseMarkers(text: string): { valid: Marker[]; malformed: string[] }` — §3.3 incl. cross-check.
- `unitVerdict(files: Map<path, text>): "conforms" | "no-marker" | "malformed-marker"` — strictness rule.

### 4.1 Live assertions (the test file)

1. Every declaring unit either conforms (§3.3) or has a `PRE_GUARD_DEBT` row. Fail message names the unit and both remedies.
2. No malformed marker line anywhere in the plans tree (including non-declaring units and undated files — a marker in a non-declaring unit is fine if valid, red if malformed).
3. Ledger staleness (§4.3).
4. Undated allowlist (§4.4).
5. Live lower bound: declaring-unit count ≥ 196 (history is immutable; the count can only grow — a drop proves discovery or predicate narrowing against the live corpus, the mutation the fixture plants cannot see if the walk itself is bypassed).

### 4.2 Debt ledger

<!-- spec-lint: ignore — files created by this arc; not yet tracked -->

`tests/docs/invariant8/preGuardDebt.ts` exports `PRE_GUARD_DEBT: ReadonlySet<string>` — the 196 unit keys from the probe, frozen at ship time, header-documented as pre-guard debt, NOT an opt-out (verbatim posture of the removed `KNOWN_PRE_GUARD_PLANS`, now with sound discovery; also the `KNOWN_UNINSTRUMENTED` posture of `tests/log/_metaMutationSurfaceObservability.test.ts`). Shrinking is welcome; growing requires a PR-body reason (prose rule — not mechanizable, §7).

### 4.3 Staleness assertions

A `PRE_GUARD_DEBT` row reds if its unit (a) no longer exists, (b) no longer declares the gate, or (c) now conforms via a valid marker — each means the row must be deleted. Keeps the ledger monotonically honest, same as the graduation registry's archive-only rule.

### 4.4 Undated files

Undated files must either not declare both halves or be in `UNDATED_DECLARING_ALLOWLIST` (ships with exactly one row: `BACKLOG.md`, reason: index quoting gate language). Same staleness rule: an allowlist row whose file stops declaring (or vanishes) reds.

## 5 Plants and mutation-family closure set

Plants are fixture-tree cases in the test file, routed through the same helper functions the live assertions use. The review converges against THIS enumeration; a new family is admissible only with a live escaping mutant (AGENTS.md finding-admissibility (c)).

| Family | Escaping mutant shape | Pinned by |
| --- | --- | --- |
| M1 discovery narrowing | partition misses flat files, nested dated dirs, category subdirs, or re-opens sub-units inside a dated dir | four fixture plants (one per shape) + live lower bound (§4.1.5) |
| M2 predicate narrowing | both-halves regex weakened (case, spacing) or single-half made triggering | plants: critique-only (no trigger), audit-only (no trigger), both-halves mixed-case (trigger) |
| M3 grammar widening | hedged/malformed text accepted | reject-table plants: "Critique skipped. Audit pending." (P-HEDGE, the entry's canonical string); `critique=SKIPPED`; missing `audit=`; `p0=1 … dispositions=none`; `N/A` with trailing text; prose paragraph containing the words critique/audit/PASS |
| M4 ledger staleness tolerated | vanished / no-longer-declaring / now-conforming row survives | three fixture plants |
| M5 ledger bypass | declaring unit with no marker and no row passes | fixture plant asserting red + message naming both remedies |
| M6 undated leak | undated declaring file outside allowlist passes | fixture plant |
| M7 malformed-marker tolerance | unit with one valid AND one malformed marker passes | fixture plant asserting red |

Live-clean criterion: against today's tree plus the ledger, the guard is green — and this arc's own plan document, which quotes the gate (making its unit declaring), conforms via `impeccable-gate: N/A — no UI surface`, so the guard polices its own shipping PR exactly as the mdast guard policed its graduation.

## 6 Write-path edits (so future plans conform by construction)

<!-- spec-lint: ignore — files created by this arc; not yet tracked -->
- **AGENTS.md invariant 8** gains one sentence: closeouts carry the machine marker line per this spec, enforced by `tests/docs/_metaInvariant8Closeout.test.ts`.
- **HANDOFF-TEMPLATE.md §12** gains the marker line (RAN form as a fill-in template, N/A form in the backend-only branch) so every future handoff carries it by template.
- Style recommendation recorded in both: marker lives in the closeout carrier — dir units: `closeout.md`/`CLOSEOUT.md` or the handoff doc's §12; flat units: a `## 12` section in the plan file or a sibling closeout file named after the plan stem. Not guard-enforced (§1.1.6).

## 7 Documented limits (honest ceiling — accepted, not findings)

1. The guard proves a unit CARRIES a well-formed gate claim, not that the gate ran or its findings are honest. A fabricated marker is a deliberate lie in a reviewed diff — reviewer territory, like the pg-cron "SELECT 1" bound.
2. A UI diff shipped with no plan document is invisible (§1.1.8). The invariant's process (brainstorming → plan) makes a plan-less UI ship already a process violation before this guard is reached.
3. Ledger growth is policed by PR review (prose reason), not mechanically — same accepted bound as `KNOWN_UNINSTRUMENTED`.
4. The N/A form's truth ("no UI surface") is not diffed against the unit's actual file list; a plan may honestly declare N/A while a later execution deviation ships UI. The staleness rules do not catch this; PR review does.
5. `RAN-DEGRADED`'s justification prose is unread by the guard.

## 8 Ship shape

<!-- spec-lint: ignore — files created by this arc; not yet tracked -->
- `tests/docs/_invariant8Closeout.ts` (helper, pure), `tests/docs/_metaInvariant8Closeout.test.ts` (live assertions + plants), `tests/docs/invariant8/preGuardDebt.ts` (frozen ledger + undated allowlist). All matched by the existing `tests/docs/**/*.test.{ts,tsx}` vitest project row (`vitest.projects.ts:126`); the helper and ledger are underscore/non-test files, not collected.
- Doc edits: AGENTS.md (one sentence), HANDOFF-TEMPLATE.md §12 (marker lines), this arc's plan document (its own N/A marker).
- Graduation: `BACKLOG_GRADUATED` registry row (in `tests/docs/_metaDeferralLedgerGraduation.test.ts` — the ONE edit to that file) + entry moved to `BACKLOG-archive.md`, provenance `test/invariant8-closeout-enforcement`; RED-first per the T5 pattern of PR #646.
- Commits: TDD per task, conventional-commits, plan to follow (writing-plans).
