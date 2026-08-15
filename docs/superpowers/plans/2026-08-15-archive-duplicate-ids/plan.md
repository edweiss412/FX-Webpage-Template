# Archive duplicate entry ids — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the
> Opus pane's entry point). The spec is
> `docs/superpowers/specs/2026-08-15-archive-duplicate-ids-design.md`; this plan carries
> its own adversarial-review gate below.

**Goal:** repair the 43 duplicate-id heading pairs in the two ledger archives per the
spec's §2.1 tables, and land the within-file id-uniqueness lane in
`tests/docs/_metaDeferralLedgerGraduation.test.ts` so the class cannot return.

**Architecture:** one implementation branch, `chore/archive-duplicate-ids`, off
`origin/main`, three tasks, one PR.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/2026-08-15-archive-duplicate-ids-design.md` · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants exercised: 1 (TDD), 6 (conventional commits), 11
  (worktree-only), 12 (claims — the marker is already declared on
  `chore/archive-duplicate-ids` by the authoring handoff; it strips in the archive
  move, task A3).
- Guard premise rule (`tests/_shared/premise.ts`) applies to the new lane's plants.
- The worktree runs `pnpm install && pnpm worktree:link-env && pnpm preflight` before
  tests (the branch runs vitest suites — the docs-only preflight exemption is NOT
  invoked).
- Archive RED (spec §2.4 / L-wave preamble pattern), used by task A3: move the entry
  WITH its flight marker, observe `pnpm vitest run
  tests/docs/_metaLedgerInProgress.test.ts` fail by name, strip the marker, GREEN.

## Pre-draft verification pass (writing-plans rule)

All probes ran at spec time; scripts + raw output are committed at
`docs/superpowers/plans/2026-08-15-archive-duplicate-ids/` (`dup-census-2026-08-15.txt`
and the four scripts beside it). Facts this plan RELIES on, so no task re-derives them:

- 43 duplicate-id pairs in the guard's honest domain: 37 in `BACKLOG-archive.md`
  (35 at the family's levels [2,3] plus the two `###`/`####` pairs the all-depth scan
  surfaced — `BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK` 5481/5488,
  `BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND` 5664/5688, spec R5 F1), 6 in
  `DEFERRED-archive.md` (2 at the family's own level 3 — `USE-RAW-FULL-LIST-1`,
  `CASP-2`; 4 visible only when the scan crosses levels —
  `NEWTAB-GUARD-UNDECIDABLE-2`, `DESTRUCT-ARM-ANNOUNCE-1`, `PSQL-GUARD-RECALL-RESIDUAL`,
  `PSQL-STARTUP-FILE-NO-X-CLASSWIDE`). Active files: 0.
- Zero pairs are verbatim duplicates (max normalized similarity 0.12); every pair is a
  terminal record + a preserved-original heading. Survivor direction per pair: 42
  keep-first, 1 keep-second (`USE-RAW-FULL-LIST-1`, kept heading at
  `DEFERRED-archive.md:1905`).
- The `CI` token mints at level 2 only (`DEFERRED-archive.md:1218` and `DEFERRED-archive.md:1314`, prose
  section headings) — the domain rule excludes it by construction.
- `ledgerFiles()` (`scripts/lib/ledger-fields.ts:96`) discovers the four ledger files
  from disk; `extractEntries` (`tests/docs/_ledgerMdast.ts:313`) returns one row per
  id-heading, so duplicates are visible to a LIST consumer (only `ledgerIds`'s Set
  hides them).
- 9 of the 43 demoted headings sit under a verbatim-preamble sentence (probed
  2026-08-15, 9-line window above each demoted heading):
  `BACKLOG-archive.md` lines 2611, 2659, 2708, 2770, the "Entry preserved verbatim
  below." line above `BACKLOG-archive.md:5488`, and `DEFERRED-archive.md` lines 412,
  470, 507, 587. Each of those 9 preambles gains the
  §1.1.6 annotation (the clause keys on any verbatim-preservation claim, spec R6
  F2) "(heading demoted to a bold line; see
  BL-ARCHIVE-DUPLICATE-ENTRY-IDS)" in the same commit as its demotion.
- The demoted-bold form already has precedent in the archive: the
  "Original entry, verbatim:" series (`BACKLOG-archive.md:2166-2422`) preserves
  originals WITHOUT a second id heading — those entries never appeared in the dup
  census.

## Meta-test inventory (declared per writing-plans rule)

- **EXTENDS:** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — one new `describe`
  ("within-file id uniqueness") + plants. CI-wired already (the file runs in the
  `parallel` project on every PR); no new testMatch or workflow entry.
- **CREATES:** nothing. No invariant-9/10 registry rows (no Supabase call site, no
  mutation surface), no advisory locks, no §12.4 rows, no source-mutation enrolment
  (spec §5 states why: finite corpus, executable plants are the kill criterion).

## Task A1 — the uniqueness lane + plants + the 41 repairs (one commit)

1. **Write the lane** in `tests/docs/_metaDeferralLedgerGraduation.test.ts`:
   - Files: `ledgerFiles(process.cwd())`, imported from `@/scripts/lib/ledger-fields`
     (the path the sibling suites already use).
   - Per file, family opts via `optsFor(file)` from the same module
     (`scripts/lib/ledger-fields.ts:82`) — the registry-held grammar; it resolves to
     the same values as the suite's own constants at
     `tests/docs/_metaDeferralLedgerGraduation.test.ts:58-59` (spec R1 F3 direction:
     derive from the registry, never re-match filenames).
   - DOMAIN pass: `extractEntries(text, familyOpts)` → the id set the family's
     ratified grammar mints.
   - SCAN pass: `extractEntries(text, { requirePrefix: familyOpts.requirePrefix,
     levels: [1, 2, 3, 4, 5, 6] })` — every mdast heading depth (spec R4 F1: a
     duplicate parked at any depth, including a one-character `####` typo, is in
     scan range; the DOMAIN pass alone bounds which ids are judged).
   - Offender: an id whose SCAN occurrences exceed 1 AND that is in the DOMAIN set —
     for EVERY family, prefix or not (plan R1 F2: the earlier prefix-disjunct form
     over-flagged a prefix-family id with zero occurrences at its ratified levels,
     wider than spec §1.1.5's domain rule; pure domain membership still fires on all
     43 live pairs and every fire plant — each has at least one in-domain heading).
     Report `file`, `id`, and the `line` of every occurrence in the failure message;
     assert the offender list equals `[]`.
2. **Plants** (same `extractEntries`-on-synthetic-text pattern as the suite's terminal
   plants at `tests/docs/_metaDeferralLedgerGraduation.test.ts:698`; unconditional execution — never inside `.each`): FIRE rows —
   `## BL-X` twice; `## BL-X` + `### BL-X`; null-prefix family `## DEF-STUB-1 — RESOLVED`
   + `### DEF-STUB-1 — original`; a synthetic family opts `{ requirePrefix: null,
   levels: [4] }` with two `#### FUT-1` headings (non-default-level family, spec R3
   F2); `## BL-X — RESOLVED` + `#### BL-X — original` (the depth-typo shape, spec
   R4 F1). STAYS-QUIET rows, each naming the pin it protects —
   null-prefix family with `## CI alpha` + `## CI beta` (the live shape at
   `DEFERRED-archive.md:1218` and `DEFERRED-archive.md:1314`; pins the domain rule); one heading + one
   bold `**BL-X — title**` line (pins the repaired form); two different ids.
3. **RED, observed:** `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`
   fails naming all 43 pairs (37 + 6). Paste the failure list into the task record and
   diff it against the spec §2.1 tables — an id in one list and not the other stops
   the task (the spec table is the ratified repair set).
4. **Repair:** for each pair, rewrite the non-surviving heading line from
   `#{2,4} <text>` to `**<text>**` (exact text kept; the two R5 F1 targets are
   `####`). Survivors per the spec tables:
   keep-first everywhere except `USE-RAW-FULL-LIST-1` (keep
   `DEFERRED-archive.md:1905`, demote `DEFERRED-archive.md:1763`). Add the 9 preamble
   annotations listed above (plan R1 F1: the count is the pre-draft list's 9 — the
   earlier "8" predated the R5 census growth).
5. **GREEN:** the graduation suite passes; then `pnpm vitest run tests/docs/` all
   green (referential integrity, in-progress, sizing, claims — the archives changed,
   so the whole docs surface is the regression net).
6. **Diff discipline check, recorded:** `git diff --stat` over the two archive files
   touches exactly the 43 demoted lines + the 9 preamble lines; no other hunk.
7. Commit: `test(docs): add within-file ledger id uniqueness; demote 43 duplicate
   archive headings to bold lines`.

## Task A2 — archive the entry

1. Move `BL-ARCHIVE-DUPLICATE-ENTRY-IDS` from `BACKLOG.md` to `BACKLOG-archive.md`
   with a dated resolution paragraph: corrected mechanism (spec §0 — convention
   artifacts, zero verbatim pairs, 43 not 35), census transcript pointer, the shipped
   lane as the class defense, and the §2.3 going-forward convention. The archived
   entry follows that convention itself (single id heading; the original body rides
   below it with no second id heading).
2. Archive RED: move WITH the `**Status:** IN PROGRESS · **Branch:**
   chore/archive-duplicate-ids` marker intact → `pnpm vitest run
   tests/docs/_metaLedgerInProgress.test.ts` fails by name (archives reject in-flight
   entries — proves the guard sees THIS entry) → strip the marker → GREEN. This also
   satisfies invariant 12 (the marker never reaches main).
3. `pnpm vitest run tests/docs/` green. Commit: `docs(backlog): archive
   BL-ARCHIVE-DUPLICATE-ENTRY-IDS — 41 pairs repaired, uniqueness lane shipped`.

## Task A3 — close

1. Merge `origin/main` FIRST (BACKLOG/archive conflicts resolve per-entry, both
   sides preserved — the batch's sibling arcs are live on these files), so every
   later gate and the final review examine the tree that will merge (plan R1 F3,
   the "review covers what merges" lint shape).
2. Terminal check, run and recorded, over ALL FOUR ledger files:
   `! grep -q 'Branch:\*\* chore/archive-duplicate-ids' BACKLOG.md
   BACKLOG-archive.md DEFERRED.md DEFERRED-archive.md` — exits 0 exactly when no
   marker spelling survives anywhere (plan R1 F4: the two-file form passed a marker
   line surviving inside the archived entry), PLUS
   `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` green — the
   structural check that walks every ledger file from disk and categorically
   rejects an archived in-flight entry.
3. Pre-push gates: `pnpm heavy pnpm test:fast` (full suite under the slot
   semaphore), `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
4. Whole-diff codex-guard review (`--stage diff`) to APPROVE runs AFTER the
   origin/main merge and gates, on the final tree. If a repair commit lands, gates
   re-run and the review re-dispatches — the approved diff is the merging diff.
   After approval, only mechanical `origin/main` merge commits may land (re-run
   `pnpm vitest run tests/docs/` if such a merge touches a ledger file).
5. Push every commit, then PR (body: preflight ran; census + RED transcripts
   linked) → real CI green → `gh pr merge --merge` in the same turn → ff main,
   verify `0 0`.

## Adversarial review (cross-model)

- This plan: self-review (below) → codex-guard `--stage plan --round <n>` to APPROVE
  before execution handoff. Briefs carry REVIEWER ONLY, the numbered CONSEQUENCE
  BOUND / PROBE DOMAIN / THREAT-MODEL FENCE block with the literal phrase "never
  silently wrong", VERDICT + FINDINGS lines, round cap 4, and the spec §1.1
  do-not-relitigate list.
- The impl branch: whole-diff codex-guard `--stage diff` review to APPROVE before
  merge (single brief — the diff is two archive files + one test file + ledger moves).

## Execution handoff

After this authoring branch's PR merges, a fresh Opus pane executes Tasks A1-A3 from
`HANDOFF.md` in this directory. The impl worktree + branch + claim marker are created
by the authoring session BEFORE its PR's last commit releases the authoring claim, per
the spelled-out protocol in spec §3.2: the impl branch's `pnpm ledger:claims --check`
run EXPECTS exit 1 naming `docs/archive-dup-ids-spec` and only it (the
planned-handoff signature); any other branch named = stop. The Opus pane's own Step 0
is verification only. Never end a turn mid-pipeline; 10-minute nudge per Stage-0
semantics.

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped against the live tree (constants at
      `_metaDeferralLedgerGraduation.test.ts:58-59`, plants at
      `tests/docs/_metaDeferralLedgerGraduation.test.ts:698`,
      `ledgerFiles` at `scripts/lib/ledger-fields.ts:96`).
- [ ] Anti-tautology: the RED list is diffed against the spec table (two independent
      derivations), not against itself; plants assert both fire AND stay-quiet rows;
      every stays-quiet row names its pin.
- [ ] RED validity: the lane fails against the CURRENT tree (its failing corpus exists
      at plan time — the 41 live pairs), and the same command passes after the repair.
- [ ] Numeric sweep after every repair round (43 / 37 / 6 / 9 counts).
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-15-archive-duplicate-ids/plan.md`
      0 hard.
