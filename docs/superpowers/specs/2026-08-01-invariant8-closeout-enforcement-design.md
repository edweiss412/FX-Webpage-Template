# Spec: invariant-8 closeout enforcement (BL-INVARIANT8-CLOSEOUT-ENFORCEMENT)

<!-- spec-lint: not-ui — test-infrastructure guard over docs/superpowers/plans; no app/, components/, or design-token surface is touched -->

**Charter:** `BACKLOG.md` entry `BL-INVARIANT8-CLOSEOUT-ENFORCEMENT` (filed off the 2026-07-24 dev-row copy close-out descope). **Branch:** `test/invariant8-closeout-enforcement`. **Status:** draft for adversarial review. **Probe sibling:** `docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-probes.mjs` (committed; all numbers below are its 2026-08-01 output).

The 2026-07-24 assertion was removed in `a20b94457` ("descope the ledger guard to what it can enforce truthfully") after three consecutive review rounds on the same vector. Its defects, verified against that commit's diff: discovery saw only TOP-LEVEL directories containing exactly `plan.md` (flat plans, `00-plan.md`/`PLAN.md` variants, and category subdirectories like `admin/` were silently invisible), and its closeout acceptance was substring-level (per `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/closeout.md:121-126`, "critique not run" satisfied it, and `/^##\s*12\b/` matched `## 12.4`). This spec restores the assertion with sound discovery and a machine-checkable grammar.

## 1 Scope

One structural guard (new test file + helper + frozen debt ledger), two write-path doc edits (AGENTS.md invariant-8 sentence; HANDOFF-TEMPLATE.md §12 marker), graduation of the BACKLOG entry. No app code, no DB, no CI workflow changes.

### 1.1 Resolved scope — do not relitigate

1. **Autonomy:** the user pre-authorized the full autonomous-ship pipeline for this item (2026-08-01, orchestrating session AskUserQuestion: "Pre-authorize all four"). User spec/plan review gates are waived; adversarial gates are not.
2. **Marker grammar supersedes the BACKLOG entry's lexical-hedge sketch.** The entry asks for "a lexical check [that] must reject hedges." Probe result: a prose hedge-scan reds the tree's three best closeouts on legitimate text — `docs/superpowers/plans/admin/2026-07-03-developer-tier/08-closeout.md:24` ("no TBD/TODO"), `docs/superpowers/plans/2026-07-23-gallery-action-outcomes/CLOSEOUT.md:14` ("hung pending state"), and `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/closeout.md:126`, which quotes "Critique skipped. Audit pending." verbatim while DOCUMENTING the old defect. The ratified mechanism is a machine marker line (§3.3): hedged prose cannot parse as a marker, so the entry's canonical bad string fails structurally (plant P-HEDGE pins it). No prose hedge-scan ships. The entry's intent (that string must not pass) is met; its sketch (scan prose for hedge words) is refuted by probe.
3. **Debt is a frozen snapshot, not a backfill.** 195 units declare the gate today (§2). Backfilling closeout markers onto ~190 shipped historical plans would fabricate compliance records for work whose gate evidence lives in handoff docs and PR bodies. The ledger freezes today's declaring units; enforcement is forward-looking plus staleness-policed (§4.3). This follows the entry's "migrate or explicitly debt-list" — we debt-list.
4. **Broad declaration predicate is deliberate.** "Unit declares" = any member file matches /impeccable critique/i AND /impeccable audit/i (§3.2). Over-breadth (a plan merely quoting AGENTS.md) is safe: the false-positive cost is one N/A marker line or one frozen ledger row, and every attempt to narrow the predicate re-opens the silent-under-report hole that killed the 2026-07-24 assertion. Same posture as the mdast ledger guard's registry-or-loud rule.
<!-- spec-lint: ignore — files created by this arc; not yet tracked -->
5. **Guard lives in a NEW file** (`tests/docs/_metaInvariant8Closeout.test.ts` + `tests/docs/_invariant8Closeout.ts`), not in `_metaDeferralLedgerGraduation.test.ts`. That file is scoped to BACKLOG ledgers (PR #646 rewrite); plans-tree closeout policing is a different corpus and walker. The BACKLOG entry's "restore the assertion" names the historical location, not a placement requirement.
6. **Marker-anywhere-in-unit IS the location rule.** The 2026-07-24 failure was "no rule locates a closeout for an arbitrary plan." The ratified rule: a unit conforms if any member file carries a valid marker line. File-placement (closeout.md vs in-plan §12) stays a style recommendation (§6), not a guard check — naming chaos (§2: closeout.md, CLOSEOUT.md, 01-closeout.md, 08-closeout.md, sibling -closeout.md, handoffs/*-closeout.md, one closeout DIRECTORY) makes any single-filename rule either a mass rename or a new silent hole.
7. **The guard verifies SHAPE, not truth** (the entry's own "honest ceiling"). A marker line is a signed claim in the diff, reviewable at PR time; the guard cannot verify a human ran the gate. Documented limit, §7.
8. **Specs tree and plan-less diffs are out of scope.** Invariant 8's closeout contract binds plans/milestone handoffs (AGENTS.md invariant 8: "Findings + dispositions go in §12 of the milestone's handoff doc"). A UI diff shipped with no plan document at all is invisible to this guard — diff-time gate enforcement is a different mechanism, deliberately not built here (§7).
<!-- spec-lint: ignore — quotes the ratified HANDOFF-TEMPLATE.md §12 string verbatim, em-dash included -->
9. **N/A branch is ratified upstream.** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/HANDOFF-TEMPLATE.md` §12: "For backend-only milestones, mark this section 'N/A — no UI surface' and skip." The grammar's N/A form (§3.3) implements exactly that branch.

## 2 Probed census (draft-time inputs; probe sibling, run 2026-08-01)

- `docs/superpowers/plans/` holds **301 units** (see §3.1, incl. the closeout-attach rule folding 8 sibling closeouts into their plan units) plus **13 undated files** (11 README.md at two depths, `BACKLOG.md`, `coverage.md`).
- **195 units declare both gate halves** — 117 flat files, 78 directories. The old guard's discovery shape (top-level dir with `plan.md`) saw at most a dozen.
- Closeout artifacts today (probe aggregates): 19 declaring units have a `*closeout*` file; 17 declaring units have a `## 12`-headed section somewhere; naming spans `closeout.md`, `CLOSEOUT.md`, `01-closeout.md`, `06-corpus-closeout.md`, `08-closeout.md`, flat sibling closeout files named after the plan stem, `handoffs/Phase-*.md-closeout.md`, and one closeout directory (`2026-07-26-ci-dark-descoped-closeout`).
- Undated files declaring both halves: exactly one, `BACKLOG.md` (an index quoting gate language, not a plan) — allowlisted in §4.4.
- Hedge-word incidence in existing closeouts: 3 files (citations in §1.1.2) — all legitimate prose.

## 3 Definitions (input domains)

### 3.1 Unit

<!-- spec-lint: ignore — pattern tokens (X.md, -closeout.md) are naming-scheme placeholders, not file citations -->

A unit is the topmost path segment under `docs/superpowers/plans/` matching /^\d{4}-\d{2}-\d{2}-/ — a dated flat `.md` file is a unit; a dated directory (at ANY depth, including inside category dirs `admin/`, `crew/`, `step3-onboarding/`, `v1-pre-deployment-amendments/`, …) is a unit owning every file beneath it (nested dated names inside a dated dir do NOT open sub-units; e.g. `2026-04-30-fxav-crew-pages-v1/shape-sessions/2026-05-13-*.md` belongs to the mega-unit). Files under no dated segment are "undated" (§4.4). **Closeout-attach rule (r2 F1):** a dated flat file whose basename ends `-closeout.md` or `-CLOSEOUT.md`, and whose stem-matching plan `X.md` exists in the SAME directory, is a MEMBER of unit `X.md`, not its own unit — the sibling-closeout carrier (§6) must be able to conform its plan. The rule is deliberately minimal: `*-closeout` DIRECTORIES (`2026-07-26-ci-dark-descoped-closeout`), stem-EXTENDING siblings (`2026-07-20-share-hub-fidelity-fixes` beside `2026-07-20-share-hub`), and an orphan `X-closeout.md` with no same-directory `X.md` all stay their own units. Probe: exactly 8 live files attach (the r2 reviewer's enumeration, reproduced). This is the probe's partition, verified to enumerate all 301 units including every shape the old guard missed.

### 3.2 Declaration predicate

A unit declares the invariant-8 gate iff, folding across ALL member files, some file matches /impeccable critique/i AND some file (the same or another) matches /impeccable audit/i — the unit-wide fold, exactly the census probe's semantics (r1 F3 ratification: the broader reading is the fail-safe direction per §1.1.4, and it is the semantics under which the ledger snapshot is generated; the same-file-BOTH reading was the ambiguity, refuted as narrower). Today the two readings coincide (probe: 195 same-file-BOTH, split-across-files count 0) but the fold is normative. Single-half units do not trigger (a doc citing only the critique command is discussing, not declaring, the dual gate).

### 3.3 Marker grammar

A marker line is any line whose text — after stripping a trailing carriage return (CRLF checkouts are honest inputs; whole-diff r1) and leading whitespace — begins `impeccable-gate:` (trimming first, so an indented typo'd marker is classified and rejected rather than silently invisible — grammar-probe indented cases). Three forms (exact, anchored on the trimmed line, one line):

```
impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>   (RAN form; RAN-DEGRADED also valid per half)
impeccable-gate: N/A — no UI surface                                                       (N/A form)
impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>   (TEMPLATE form — the literal placeholder line)
```

Regexes (the implementation's authority):

- RAN form: `/^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9]\d*) p1=(0|[1-9]\d*) dispositions=(recorded|none)$/` (integers reject leading zeros; `p0=00` is malformed — grammar-probe)
- N/A form: `/^impeccable-gate: N\/A — no UI surface$/`
- TEMPLATE form: the exact placeholder literal shown above (`critique=<RAN|RAN-DEGRADED> …`), matched verbatim. Valid ONLY inside a `MARKER_TEMPLATE_FILES` path (§4.5); anywhere else it is malformed. A TEMPLATE-form line NEVER confers conformance — it exists so `HANDOFF-TEMPLATE.md` can display the fill-in block without either conforming its unit or tripping the malformed-marker assertion (r1 F2).

Cross-check on the RAN form: `p0 + p1 > 0` requires `dispositions=recorded`; `p0 + p1 = 0` requires `dispositions=none`. A `RAN-DEGRADED` value asserts the gate ran in a degraded configuration (e.g. the dev-row single-context run) — the degradation's nature belongs in adjacent prose, which the guard does not read.

**Strictness rule:** EVERY line in a unit whose trimmed text begins `impeccable-gate:` must parse as one of the three forms (TEMPLATE form only where §4.5 allows) and satisfy the cross-check. One valid marker conforms the unit; one malformed marker line anywhere in the unit reds it regardless of other valid markers (a typo'd marker must never silently not-count — that is exactly how "critique not run" passed the old substring check).

## 4 Guard architecture

<!-- spec-lint: ignore — files created by this arc; not yet tracked -->

Helper `tests/docs/_invariant8Closeout.ts` (pure functions over an in-memory file map, so plants run on fixture trees) + test `tests/docs/_metaInvariant8Closeout.test.ts` (runs the helper against the live repo). Mirrors the `_ledgerMdast.ts` / `_metaDeferralLedgerGraduation.test.ts` split shipped in PR #646.

Helper surface (names final):

- `walkPlansTree(rootAbsPath: string): string[]` — the filesystem-acquisition step, its own exported function so plants exercise the fs layer against tmpdir fixture trees, not only in-memory path lists (r1 F1).
- `partitionUnits(paths: string[]): { units: Map<string, string[]>; undated: string[] }` — §3.1.
- `declaresGate(files: Map<string, string>): boolean` — §3.2 unit-wide fold (takes the unit's whole file map).
- `parseMarkers(text: string, opts: { template: boolean }): { valid: Marker[]; template: number; malformed: string[] }` — §3.3 incl. cross-check; `opts.template` says whether the containing file is a template file (§4.5). Template-ness is a PARAMETER, not a registry read — the helper stays pure; the guard test wires the real `MARKER_TEMPLATE_FILES` registry (plan r2 F1 ratified delta).
- `unitVerdict(files: Map<path, text>, opts: { templateFiles: ReadonlySet<string> }): "conforms" | "no-marker" | "malformed-marker"` — strictness rule; `opts.templateFiles` holds the template paths (literal sets in helper-contract tests; the registry in the live guard; plan r2 F1 ratified delta).

### 4.1 Live assertions (the test file)

1. Every declaring unit either conforms (§3.3) or has a `PRE_GUARD_DEBT` row. Fail message names the unit and both remedies.
2. No malformed marker line anywhere in the plans tree (including non-declaring units and undated files — a marker in a non-declaring unit is fine if valid, red if malformed).
3. Ledger staleness (§4.3).
4. Undated allowlist (§4.4).
5. Canary set: the live walk's unit map contains four named immutable historical units, one per discovery shape — flat `docs/superpowers/plans/2026-07-18-alert-copy-full-sweep.md`, category-nested flat `docs/superpowers/plans/admin/2026-06-22-validation-reset-button.md`, category-nested directory `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation`, top-level directory `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1` (unit keys are plans-relative; full paths shown for citation). (Replaces r0's fixed `≥196` floor, which r1 F1 showed is both incompatible with §4.3(b)'s supported declaration removal and blind to acquisition-layer omission of NEW units; the acquisition layer is instead pinned by the M1 tmpdir plants, which include a novel declaring unit.)
6. Template files (§4.5): every `MARKER_TEMPLATE_FILES` path exists, contains at least one TEMPLATE-form line, and contains NO valid RAN/N-A-form marker (a valid marker in the template would conform the mega-unit and silently invalidate its ledger row).

### 4.2 Debt ledger

<!-- spec-lint: ignore — files created by this arc; not yet tracked -->

`tests/docs/invariant8/preGuardDebt.ts` exports `PRE_GUARD_DEBT: ReadonlySet<string>` — the 195 unit keys from the probe (regenerated at implementation time, §8), frozen at ship time, header-documented as pre-guard debt, NOT an opt-out (verbatim posture of the removed `KNOWN_PRE_GUARD_PLANS`, now with sound discovery; also the `KNOWN_UNINSTRUMENTED` posture of `tests/log/_metaMutationSurfaceObservability.test.ts`). Shrinking is welcome; growing requires a PR-body reason (prose rule — not mechanizable, §7).

### 4.3 Staleness assertions

A `PRE_GUARD_DEBT` row reds if its unit (a) no longer exists, (b) no longer declares the gate, or (c) now conforms via a valid marker — each means the row must be deleted. Keeps the ledger monotonically honest, same as the graduation registry's archive-only rule.

### 4.4 Undated files

Undated files must either not declare both halves or be in `UNDATED_DECLARING_ALLOWLIST` (ships with exactly one row: `BACKLOG.md`, reason: index quoting gate language). Same staleness rule: an allowlist row whose file stops declaring (or vanishes) reds.

### 4.5 Template files

`MARKER_TEMPLATE_FILES: ReadonlySet<string>` ships with exactly one row: `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/HANDOFF-TEMPLATE.md`. Within these files the TEMPLATE form is valid and non-conferring (§3.3); valid RAN/N-A-form markers are forbidden there (§4.1.6). The mega-unit therefore keeps its `PRE_GUARD_DEBT` row after the §6 template edit — no contradiction between the write path, the frozen ledger, and staleness (r1 F2 resolution). The template's backend-only branch quotes the N/A form INLINE in prose (mid-line, inside backticks), which is invisible to the line-initial marker rule by construction.

## 5 Plants and mutation-family closure set

Plants are fixture-tree cases in the test file, routed through the same helper functions the live assertions use. The review converges against THIS enumeration; a new family is admissible only with a live escaping mutant (AGENTS.md finding-admissibility (c)).

| Family | Escaping mutant shape | Pinned by |
| --- | --- | --- |
| M1 discovery narrowing | partition OR filesystem acquisition misses flat files, nested dated dirs, category subdirs, novel units, re-opens sub-units inside a dated dir, or breaks the closeout-attach rule in either direction | tmpdir fixture-TREE plants through `walkPlansTree` (one per shape PLUS a novel declaring unit absent from any registry, asserting red) + live canary set (§4.1.5) + attach plants: sibling closeout conforms its plan unit; three non-attach controls (stem-extending sibling, `*-closeout` directory, orphan closeout) each stay separate units |
| M2 predicate narrowing | both-halves regex weakened (case, spacing), single-half made triggering, or unit-wide fold dropped to same-file-BOTH | plants: critique-only (no trigger), audit-only (no trigger), both-halves mixed-case (trigger), split-across-files (critique in file A, audit in file B — trigger; pins the §3.2 fold) |
| M3 grammar widening | hedged/malformed text accepted | reject-table plants: "Critique skipped. Audit pending." (P-HEDGE, the entry's canonical string); `critique=SKIPPED`; missing `audit=`; `p0=1 … dispositions=none`; `p0=00` (leading zero); indented malformed marker (trimmed-line classification); `N/A` with trailing text; TEMPLATE form outside a template file; prose paragraph containing the words critique/audit/PASS |
| M4 ledger staleness tolerated | vanished / no-longer-declaring / now-conforming row survives | three fixture plants |
| M5 ledger bypass | declaring unit with no marker and no row passes | fixture plant asserting red + message naming both remedies |
| M6 undated leak | undated declaring file outside allowlist passes | fixture plant |
| M7 malformed-marker tolerance | unit with one valid AND one malformed marker passes (incl. the malformed one indented) | two fixture plants asserting red |
| M8 template-file leak | TEMPLATE form conferring conformance, TEMPLATE form accepted outside `MARKER_TEMPLATE_FILES`, or a valid marker tolerated inside a template file | three fixture plants (non-conferring; malformed-outside; template-file-with-valid-marker reds §4.1.6) |

Live-clean criterion: against today's tree plus the ledger, the guard is green — the mega-unit keeps its ledger row (TEMPLATE form is non-conferring, §4.5), and this arc's own plan document, which quotes the gate (making its unit declaring), conforms via `impeccable-gate: N/A — no UI surface`, so the guard polices its own shipping PR exactly as the mdast guard policed its graduation.

## 6 Write-path edits (so future plans conform by construction)

<!-- spec-lint: ignore — files created by this arc; not yet tracked -->
- **AGENTS.md invariant 8** gains one sentence: closeouts carry the machine marker line per this spec, enforced by `tests/docs/_metaInvariant8Closeout.test.ts`.
- **HANDOFF-TEMPLATE.md §12** gains the TEMPLATE-form placeholder line (displayed as the fill-in block) plus a backend-only-branch sentence quoting the N/A form inline in backticks (mid-line, so it is not a marker line) — every future handoff carries the marker by template without the template itself conforming its unit (§4.5).
- Style recommendation recorded in both: marker lives in the closeout carrier — dir units: `closeout.md`/`CLOSEOUT.md` or the handoff doc's §12; flat units: a `## 12` section in the plan file or a sibling closeout file named after the plan stem. Not guard-enforced (§1.1.6).

## 7 Documented limits (honest ceiling — accepted, not findings)

1. The guard proves a unit CARRIES a well-formed gate claim, not that the gate ran or its findings are honest. A fabricated marker is a deliberate lie in a reviewed diff — reviewer territory, like the pg-cron "SELECT 1" bound.
2. A UI diff shipped with no plan document is invisible (§1.1.8). The invariant's process (brainstorming → plan) makes a plan-less UI ship already a process violation before this guard is reached.
3. Ledger growth is policed by PR review (prose reason), not mechanically — same accepted bound as `KNOWN_UNINSTRUMENTED`.
4. The N/A form's truth ("no UI surface") is not diffed against the unit's actual file list; a plan may honestly declare N/A while a later execution deviation ships UI. The staleness rules do not catch this; PR review does.
5. `RAN-DEGRADED`'s justification prose is unread by the guard.

## 8 Ship shape

<!-- spec-lint: ignore — files created by this arc; not yet tracked -->
- `tests/docs/_invariant8Closeout.ts` (helper, pure), `tests/docs/_invariant8Closeout.walker.test.ts` (helper-contract test owning the M1-M3/M7/M8 plants — ratified execution addition, plan r1 F3; mirrors PR #646's walker-test precedent), `tests/docs/_metaInvariant8Closeout.test.ts` (live assertions + M4-M6 plants), `tests/docs/invariant8/preGuardDebt.ts` (frozen ledger + undated allowlist + `MARKER_TEMPLATE_FILES`). All matched by the existing `tests/docs/**/*.test.{ts,tsx}` vitest project row (`vitest.projects.ts:126`); the helper and ledger are underscore/non-test files, not collected.
- Doc edits: AGENTS.md (one sentence), HANDOFF-TEMPLATE.md §12 (marker lines), this arc's plan document (its own N/A marker).
- Graduation: `BACKLOG_GRADUATED` registry row (in `tests/docs/_metaDeferralLedgerGraduation.test.ts` — the ONE edit to that file) + entry moved to `BACKLOG-archive.md`, provenance `test/invariant8-closeout-enforcement`; RED-first per the T5 pattern of PR #646.
- Ledger generation timing: `PRE_GUARD_DEBT` is regenerated from the probe at implementation time and again at any merge-conflict resolution, NOT pasted from this spec's draft-time snapshot — three sibling Cluster B arcs are writing plan documents concurrently, and any of them merging first adds a declaring unit. A sibling plan landing AFTER this guard merges will red loudly in its own PR with a fail message naming both remedies (marker or row); the orchestrating session notifies sibling arcs of the N/A marker line once this spec APPROVEs.
- Commits: TDD per task, conventional-commits, plan to follow (writing-plans).
