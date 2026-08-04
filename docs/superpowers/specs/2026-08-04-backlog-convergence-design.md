# Backlog convergence program — filing bar, ledger mass, small-game sweep

**Date:** 2026-08-04 · **Arc branch:** `chore/backlog-convergence` · **Status:** DRAFT (pre-review)

## §0 Why this program exists

Measured 2026-08-04 against `origin/main` (`d9252f1e2` era): 16 new BACKLOG entries filed in the 24h window against 12 graduated — net +4 while ~10 issues' worth of work merged. Zero of the 16 were regressions; all were pre-existing gaps surfaced by review rounds, class sweeps, and graduation audits. The pipeline is a debt *discovery* engine whose discovery rate currently matches or exceeds closure rate, so the open-entry count — the number the mdview ledger UI shows in its sidebar — reads flat while the debt mass shrinks.

Authoritative census (this arc's probe, run with the repo's own parser — `scripts/lib/ledger-fields.ts` `ledgerItems`, 2026-08-04, worktree at `20fccb1f3`):

| Ledger | Open entries | XS | S | M | L | unsized |
|---|---|---|---|---|---|---|
| BACKLOG.md | 95 | 1 | 18 | 30 | 15 | 31 |
| DEFERRED.md | 15 | 1 | 1 | 1 | 1 | 11 |
| **Total** | **110** | **2** | **19** | **31** | **16** | **42** |

Baseline mass under §3.1's weights, same probe run (the numeric oracle AC-B1 and AC-PROG pin against): **BACKLOG 306 · DEFERRED 15 · total 321**. (mdview's current sidebar shows 94/109 for the same tree — its em-dash-required heading recognizer misses `BL-NULLCODE-STAMP-BATCH-2`; §3.4's mass revision closes that divergence.)

Three units, shipped in order:

- **Unit A — filing bar + probe-first demotions.** Policy: a ledger row requires probe evidence or live-surface reachability; hypothetical worst-cases whose failure mode is conservative-plus-surfaced go to the owning surface's documented-limits record instead. Existing candidates screened and probed; leftovers demoted.
- **Unit B — ledger mass metric.** Repo: `pnpm ledger:mass` (severity × effort weighted mass over the open queues) + a sizing guard on new entries. mdview (personal tool, outside this repo): its next design-doc revision surfaces the mass beside the counts it already shows — the primary viewing surface per the user's ratification.
- **Unit C — small-game sweep.** Close all closable XS/S entries, grouped by surface into 2–4 branches.

## §1.1 Resolved scope — do not relitigate

All ratified 2026-08-04 in the kickoff conversation (user answers to explicit multiple-choice questions), unless another source is cited.

1. **Sweep scope = ALL XS/S entries** (not top-5, not newest-only). User selection.
2. **Demotion procedure = probe-first.** For each screened candidate: attempt the cheap probe; probe demonstrates real corruption → entry STAYS with evidence attached; probe refutes or is infeasible on any live surface → demote. User selection. No per-row user approval gate — the probe outcome decides.
3. **Metric form = script + filing guard; primary viewing surface = the mdview ledger UI.** User selection verbatim ("1 but note that primary viewing surface is the mdview ledger ui"). No CI trend job in this arc.
4. **Sequencing A → B → C.** User selection.
5. **Fully autonomous to merged PRs** per the AGENTS.md brainstorming gate; both user review gates waived. User selection.
6. **Session routing:** spec + plan authored in the kickoff (Fable) session; implementation + closeout in a NEW pane running Opus. User instruction, same conversation.
7. **Stale-marker cleanup — RESOLVED UPSTREAM, no longer this arc's scope.** The `BL-HARNESS-FONT-FIDELITY` stale marker (shipped into main by spec-only PR #700, undetected because the merged branch was never deleted on origin) was ratified into this arc ("former", 2026-08-04) but PR #701's widened guard caught and cleared it first (`b7e0ac676 fix(backlog): clear the stale marker the widened guard just caught`). Recorded here so no reviewer asks where the task went.
8. **Filing-bar authority model** is the already-ratified admissibility contract — AGENTS.md "Finding-admissibility contract" bullet and the documented-limits posture in `docs/agents/spec-self-review.md` (documented-limits budget bullet). Unit A extends these to ledger rows; it does not reopen them.
9. **Blanket subagent authorization** stands (user CLAUDE.md, "Standing authorization to spawn subagents").
10. **This spec does not redesign the ledger format.** Fields, entry grammar, and discovery stay exactly as `scripts/lib/ledger-fields.ts` and `tests/docs/_ledgerMdast.ts` define them. Any parse-shape change is out of scope.

## §2 Unit A — filing bar + probe-first demotions

### §2.1 Policy text (AGENTS.md amendment)

Add one bullet to AGENTS.md "Cross-cutting discipline", immediately after the class-sweep bullet:

> **Ledger filing bar (2026-08-04).** A `BL-`/`DEF-` row asserts work someone should schedule, so it carries the same admissibility bar as a review finding: filed with probe evidence (command + output, or a cited live mutant/test) OR a stated reachable live surface. A hypothetical whose worst case is conservative behavior plus a surfaced signal is a DOCUMENTED LIMIT — it belongs in the owning surface's limits record (spec §, guard-file header, or archive entry with cross-ref), not in the open queue. An entry may be filed unprobed only with an explicit `**Reachability:** INFERRED, NOT PROBED` field naming the probe that would settle it — and the probe, not the entry, is then the first scheduled step. Screen precedent and demotion procedure: `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §2.

Exact final wording may be tightened at implementation; the three load-bearing elements are (probe-or-reachability at filing), (documented-limit routing for conservative worst-cases), (the INFERRED escape hatch that makes the probe the first step).

### §2.2 Screen + seeded candidates

Lexical screen (run 2026-08-04, this arc): `grep -inE 'INFERRED, NOT PROBED|not probed|unprobed|hypothetical|no corpus instance|never (been )?observed|speculative' BACKLOG.md DEFERRED.md` → hits on 2 entries (below) plus prose noise. The semantic screen — reading every open entry for probe-less claims the lexical screen can't see — is a plan-time sweep: the plan carries the per-entry disposition table (110 rows, subagent-read, orchestrator-verified), per the "sweeps are authored AND RUN at plan time" rule in `docs/agents/writing-plans.md`.

Seeded dispositions:

| Entry | Evidence state | Disposition |
|---|---|---|
| `PSQL-GUARD-RECALL-RESIDUAL` (DEFERRED.md) | Already probe-BACKED: three live mutants, each pinned by a current-behavior test; all three on surfaces this repo does not use (glob command word, non-POSIX `shell:` spawn, quoted Windows path) | DEMOTE. Move the three limits into a "Documented limits" header block in `tests/cross-cutting/psqlStartupFiles/scan.ts` (the guard's own file — precedent: the RATIFIED SCOPE header in `tests/docs/_ledgerMdast.ts`), carrying the un-defer triggers verbatim. Archive the entry to DEFERRED-archive.md with a pointer, beside `PSQL-STARTUP-FILE-NO-X-CLASSWIDE` which already lives there. |
| `NEWTAB-GUARD-UNDECIDABLE-2` (DEFERRED.md) | Item (b) CLOSED 2026-07-25; item (a) is a verbatim duplicate of ratified limits in `docs/superpowers/specs/2026-07-25-newtab-announcement-family.md` §6.4 | DEMOTE. Archive with pointer to §6.4; the spec section is the record. If §6.4 lacks the one-line fix note ("lexical assertion that no `<base target=` appears"), append it there in the same commit. |
| `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE` (BACKLOG.md) | Self-declares `**Reachability: INFERRED, NOT PROBED**`; entry's own first step is "a probe per hold kind, not a patch" | PROBE. Per-hold-kind probe over `lib/sync/holds/holdAwareApply.ts` (`heldNames.add` unconditional vs `protectedNames.add` branch-gated — the entry cites the exact lines). No hold kind produces a surviving-but-unlisted row → close as unreachable (archive with probe transcript). Any hold kind does → entry STAYS, upgraded with the probe evidence and re-sized. |

Any additional candidates the plan-time semantic screen surfaces get the same three-way disposition (stay-with-evidence / demote / probe-then-decide), recorded in the plan table.

### §2.3 Consequence bound + threat-model fence (for review of this unit)

- **Consequence bound:** every demoted row leaves a durable record (guard header, spec §, or archive entry with cross-ref) reachable by grepping the entry id; nothing is silently deleted. A wrong demotion is recoverable by construction — the archive entry carries the full original body per the archive convention.
- **Threat-model fence:** the screen defends against honest hypothetical filings by ordinary contributors. Deliberately disguised unprobed claims (prose written to dodge the lexical screen) are handled by the plan-time semantic read, and residual misses are a documented limit — the filing bar (§2.1) prevents the class going forward; the screen is a one-time cleanup, not a permanent detector.

## §3 Unit B — ledger mass metric

### §3.1 Canonical weights (single source of truth)

Effort weight: `XS=1, S=2, M=4, L=8`. Severity multiplier: `low=1, low-medium=1.5, medium=2, medium-high=2.5, high=3`. Both parsed from the leading token of the respective field, case-insensitive (`LOW-MEDIUM (false operator alert…)` → `low-medium`; `S–M depending…` → `S`; `S (read CI history) to M (if real)` → `S`). Entry mass = effort weight × severity multiplier. Severity ABSENT → multiplier 1 silently (absence is the corpus norm; severity refines, never gates). Severity PRESENT but unrecognized → multiplier 1 AND the entry id is reported under a `severity-unrecognized` list (script and mdview both) — a mistyped severity must never contribute a plausible mass with no named signal. Known corpus instances of the class: `BL-AGENDA-PROSE-SECOND-DAY` and `BL-AGENDA-POSITIONAL-DAYSET-FALLBACK` carry `very low` (both currently unsized, so mass is unaffected until they gain an effort). Effort absent or unrecognized → the entry is **unsized**: excluded from mass, reported as its own count. No guessed weights — the 2026-08-03 sizing commit's own rule ("an estimate on an undecided scope is a guess wearing a label") applies.

The weight constants live in one exported table in the script. mdview's mass revision necessarily re-implements the parse in its own code (different runtime, no shared module) — the §3.4 parity oracle, not shared source, is what keeps the two implementations honest.

### §3.2 `pnpm ledger:mass` (repo)

`scripts/ledger-mass.ts`, consuming ONLY `scripts/lib/ledger-fields.ts` exports (`ledgerFiles`, `ledgerItems` — no third grammar; §1.1 item 10). Per open ledger (archives skipped) and in total: entry count, count by effort tier, weighted mass, unsized count + ids. Flags: `--json` (machine envelope, uncapped — per queue: entry count, per-tier counts, mass, unsized id list, `severity-unrecognized` id list; plus totals), `--at <rev>` (read ledger blobs from a git rev via `git show <rev>:<file>` for before/after comparisons; default = working tree), `--root <dir>` (discover ledgers under an alternate directory — the same `root` parameter `ledgerFiles` already takes; how AC-B1's fixture copy is addressed; mutually exclusive with `--at`). No trend storage, no CI job — ratified scope (§1.1 item 3); trend questions are answered by two `--at` invocations, and the primary display is mdview.

### §3.3 Sizing guard (repo)

New meta-test `tests/docs/_metaLedgerSizing.test.ts`: every open entry in the walked ledgers (discovered from disk, same as the peer meta-tests) MUST carry a parseable `**Effort:**` field UNLESS its id is in the frozen grandfather registry `tests/docs/_ledgerSizingGrandfather.ts` — a const array snapshotting the 42 currently-unsized ids, captured at implementation time by the same parser the test uses. Fail-by-default for new entries; ratchet-only (removing ids from the registry is allowed, adding is a reviewed act with a stated reason). Grandfathered entries that get sized are pruned from the registry in the same commit (the test flags satisfied-but-still-listed ids to keep the registry honest).

- **Accept-set (keyed on structure, not spelling):** an entry PASSES if `fields.Effort` parses to `XS|S|M|L` per §3.1's leading-token rule. Everything else — absent field, unrecognized token — is rejected BY NAME (test output lists file, id, offending value). No denylist.
- **Consequence bound:** worst case of any parse disagreement is a false FAILURE naming a specific entry, repaired by sizing the entry or (with reason) registry-listing it. A silent pass on an unsized new entry is impossible while the parser returns no `Effort` key for it; parser-grammar drift is pinned by `tests/scripts/ledgerFields.test.ts`, not re-tested here.
- **Threat-model fence:** accidental omission by an ordinary contributor filing a row. Adversarial spelling games against the bold-run grammar are out of scope (same fence as the claim reader).
- **Mutation-registry enrollment (`tests/mutation/source/registry.ts`): NOT enrolled in this arc.** The guard's substance is set-membership over parser output plus a frozen data array; the shipped operator families (relational-boundary, equality-flip, …) target computational logic and would mostly mint no-op or trivially-killed mutants against it. Deferred with reason here rather than silently — re-visit if the guard grows logic worth mutating.

### §3.4 mdview mass revision (outside this repo)

mdview is the user's personal viewer (`~/bin/mdview`, design doc `~/bin/mdview.design.md`). Its ledger pane already parses these files client-side and shows per-queue counts and effort groupings; the user's open-count numbers come from its sidebar. This arc ships **the mass revision**: the design doc's next free rev — Rev 16 at spec time, since Rev 15 (the origin claims overlay) landed 2026-08-04 while this spec was in review. The doc revs fast; the implementer re-reads its rev log and takes the next number rather than trusting this spec's snapshot. The mass revision ships two things:

1. **Grammar alignment.** Rev 14's entry recognizer requires an em dash after the id and its effort reader greps `\b(XS|S|M|L)\b` anywhere in the value — both diverge from the canonical walker (probed 2026-08-04: the sidebar shows 94/109 against the canonical 95/110, missing `BL-NULLCODE-STAMP-BATCH-2`, whose heading has no em dash — the exact defect the ledger-fields header warns about; and `likely S` reads as sized S where the canonical leading-token rule says unsized). The mass revision adopts the canonical semantics: id recognition per the walker's grammar (em dash optional) and effort/severity parsed by §3.1's leading-token rule.
2. **Mass display.** A weighted-mass figure beside each queue's count (BACKLOG / DEFERRED, archives excluded), plus the unsized count and the `severity-unrecognized` list, using §3.1's constants (cite this spec § in the design doc). Placement/affordance details are design-doc decisions, not this spec's.

**Parity oracle (the AC-B3 check):** against the same working tree, the pane must EQUAL the FULL `pnpm ledger:mass --json` envelope — for each queue: entry count, per-tier counts (XS/S/M/L), mass, the unsized id LIST, and the `severity-unrecognized` id LIST; plus the cross-queue totals. Every field the JSON emits is compared; a viewer that dropped the severity warnings or an unsized id would fail the oracle by construction. Checklist-only visual verification is not sufficient — the oracle is the envelope comparison.

Repo-side caveats, stated once: mdview is not in git and has no CI. Changes follow its own conventions — design-doc revision entry, timestamped `.bak` beside the binary (existing convention: `mdview.bak.YYYYMMDD-HHMMSS`), verification against `~/bin/mdview-fixtures` scratch copies and the real ledgers read-only (its own checklist forbids live-editing the repo's ledgers during checks). The repo spec/plan record WHAT shipped there; the design doc records HOW. `file:line` citations into mdview use absolute paths and are excluded from this repo's citation-grep pass.

## §4 Unit C — small-game sweep

### §4.1 Pool (census-derived, 21 ids)

From §0's probe. Two ids route to Unit A first (`PSQL-GUARD-RECALL-RESIDUAL` demote, `NEWTAB-GUARD-UNDECIDABLE-2` demote), leaving 19:

**BACKLOG XS/S (19):** BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT (XS) · BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND · BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT · BL-LEDGER-BODY-DEFINED-ID-OVERMINT · BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR · BL-FRESHNESS-ABORTED-CLOSE-E2E · BL-REALTIME-BROADCAST-FRAME-DROP-WATCH · BL-TELEMETRY-FALLBACK-RETRY · BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY · BL-BELLPANEL-DISMISS-COMMENT-DRIFT · BL-FITWITHINCLIP-CLIP-SCROLL-STALE · BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY · BL-PICKER-LOCK-ICON-LUCIDIFY · BL-IDENTITYCHIP-SUB390-COLLISION · BL-IDENTITYCHIP-SR-SEPARATOR · BL-TERMINAL-FAILURE-ICON · BL-FEED-BUTTON-SUCCESS-ANNOUNCE · BL-CANONICAL-CLASS-ARRAY-BLINDSPOT · BL-AUTH-INTERSTITIAL-FONT

### §4.2 Triage classes

Each pool entry gets exactly one class at plan time, recorded per-entry:

- **CLOSE** — mechanically closable now; the entry's own **Work** section is the spec-of-record; TDD per invariant 1; graduates to the archive on merge.
- **DECISION-BLOCKED** — the entry names an unsettled product/copy decision (known members: BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT — "whether an operator should hear about an exhausted shadow rebuild belonging to a finalize attempt that then failed is a product question"; BL-FEED-BUTTON-SUCCESS-ANNOUNCE — success-announcement copy filed as an unsettled product decision per the AGENTS.md class-sweep worked example). These are batched into ONE user question at spec finalization (§4.4); answered → CLOSE with the answer baked in; unanswered/deferred → excluded, entry stays.
- **OWNER-ACTION** — needs repo-settings/admin action outside code (known member: BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT — flip a CI job into branch protection's required set after soak). Included in the same §4.4 question batch; approved → a task with the exact `gh api` call; declined → excluded.
- **INVESTIGATION** — the entry's S covers reading evidence, with a bigger fix behind it (known member: BL-REALTIME-BROADCAST-FRAME-DROP-WATCH — "S (read CI history) to M (if real)"). The sweep ships the INVESTIGATION (evidence read + verdict recorded on the entry); the entry closes if the watch shows nothing, or is re-sized and stays if it's real. Not a silent expansion into the M.
- **PREREQ-FENCED** — the entry's own contract names an unmet prerequisite or external trigger, so closing it now would violate the entry, not honor it. Excluded from CLOSE with the fence quoted in the disposition record; the entry stays open. Known members: BL-PICKER-LOCK-ICON-LUCIDIFY (fenced on "cross-platform visual regression suite lands"), BL-IDENTITYCHIP-SUB390-COLLISION (fenced on the mobile-primary-target widening). Both are additionally hypothetical-unprobed per the screen — if Unit A's probe demotes them first, the fence question is moot.

### §4.3 Branch grouping

2–4 branches grouped by surface so each PR's review is tight-scope by construction (AGENTS.md split-review default). Expected shape (finalized at plan time): a UI/a11y cluster (the icon/chip/announce entries — invariant-8 impeccable dual-gate applies; Opus implements per the UI hard rule), a tests/guards cluster, a docs/comment-drift cluster. Each branch claims its ids per invariant 12 (`pnpm ledger:claims --check <ids>` → mark → commit → push immediately) and removes markers in its last pre-merge commit.

### §4.4 The user-question batches

At spec finalization (before adversarial review), one `AskUserQuestion` batch covers the then-known §4.2 DECISION-BLOCKED product answers and OWNER-ACTION approvals; if a review round or the plan-time triage surfaces FURTHER embedded decisions, they are batched again — one push-notified batch per discovery event, never one silent question at a time, and never a decision silently overridden or an entry excluded without a class. Answers are baked into §4.5 as ratified rows before the next review round fires.

### §4.5 Ratified answers (2026-08-04, user, one batch per §4.4)

1. **BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT → CLOSE.** The exhausted-rebuild event ALWAYS emits, including when the outer finalize rolls back — accumulator-and-`finally`, the pattern the entry itself names. Forensic events survive rollbacks (invariant-10 posture).
2. **BL-FEED-BUTTON-SUCCESS-ANNOUNCE → CLOSE.** Copy is the generic verb form mirroring Undo's settled grammar: "Change accepted" / "Change approved" / "Change rejected". No row names in the utterance.
3. **BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT → CLOSE (soak-gated).** Owner approved the branch-protection flip. The task verifies observed-green soak of `section-header-visual` on merged PRs since 2026-07-27 first; soak green → flip via `gh api` and close; any red in soak → report the reds, entry stays with the finding attached.

Batch 2 (2026-08-04, after review R1 surfaced two further embedded decisions):

4. **BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY → CLOSE.** Make the spec:lint finding comparator total by adding the message as third sort key — the entry's own suggestion. The two `accepted-gap` survivor mutants become killable; their source-mutation-registry ledger rows retire in the same change (the gate reports stale rows rather than absorbing them, so retiring them is part of the task).
5. **BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY → CLOSE (dedicated branch).** Owner approved a standalone tight-scope branch — its own review cycle, honoring the entry's "not a rider" fence: amend master spec §17.2 AC-X.5 to name `role_token_mappings.decided_by` (and evaluate the two sibling constraints the entry names for the same amendment), regenerate `lib/audit/email-boundaries.generated.ts`, prove the `x5-email-canonicalization` gate covers both write paths.

With these, the 8 pool ids named across §4.2/§4.5 carry explicit routes. The remaining 11 (BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND, BL-LEDGER-BODY-DEFINED-ID-OVERMINT, BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR, BL-FRESHNESS-ABORTED-CLOSE-E2E, BL-TELEMETRY-FALLBACK-RETRY, BL-BELLPANEL-DISMISS-COMMENT-DRIFT, BL-FITWITHINCLIP-CLIP-SCROLL-STALE, BL-IDENTITYCHIP-SR-SEPARATOR, BL-TERMINAL-FAILURE-ICON, BL-CANONICAL-CLASS-ARRAY-BLINDSPOT, BL-AUTH-INTERSTITIAL-FONT) DEFAULT to CLOSE, subject to plan-time triage, which may reassign any of them to another §4.2 class — and the three of these the semantic screen flagged hypothetical-unprobed (FITWITHINCLIP-CLIP-SCROLL-STALE, IDENTITYCHIP-SR-SEPARATOR, TERMINAL-FAILURE-ICON) route through Unit A's probe-first gate before Unit C touches them, per the A→C ordering. A default is not a settled route: the plan's per-entry disposition table is where routing becomes final, and any further embedded decision it surfaces goes to a §4.4 batch.

## §5 Documented limits (this program's own)

1. The semantic screen (§2.2) is reader judgment; a disguised hypothetical can survive it. Bounded by: the §2.1 filing bar stops the class at the source going forward.
2. §3.1 weights are conventions, not measurements. Mass comparisons are meaningful only under a fixed table; changing weights re-bases history (acceptable — no stored trend in this arc).
3. Unsized entries are invisible to mass (reported by count only). 42 today; the grandfather registry makes the number ratchet-only.
4. mdview is outside CI; between checklist runs its implementation can drift from §3.1. Bounded by: the §3.4 parity oracle is part of its ledger checklist from the mass revision on, so every future checklist run re-proves parity against `pnpm ledger:mass --json`; between runs, drift is undetected — accepted for a personal read-only viewer.
5. `--at <rev>` reads ledger FILES as committed at that rev; entries that moved between files across history are counted where they then lived. No cross-rev id tracking.
6. `Filed:` dates are not parsed anywhere in this arc (mdview Rev 14's own history shows date-scan pitfalls; effort/severity fields suffice).

## §6 Meta-test inventory (pre-declared for the plan)

- **CREATES:** `tests/docs/_metaLedgerSizing.test.ts` + `tests/docs/_ledgerSizingGrandfather.ts` (§3.3).
- **EXTENDS:** none. `tests/scripts/ledgerFields.test.ts` already pins the parser grammar; `tests/docs/_metaLedgerInProgress.test.ts` and `tests/docs/_metaLedgerClaimCollision.test.ts` are untouched consumers of the same core.
- **Registry rows:** Supabase call-boundary / admin-mutation registries N/A — no Supabase call site and no mutation surface ships in this arc (scripts + tests + docs only). Mutation-guard registry: deliberate non-enrollment per §3.3.

## §7 Acceptance criteria

- **AC-A1:** AGENTS.md carries the §2.1 filing-bar bullet; the `pnpm spec:lint` report on this spec shows no findings beyond the planned-file class (files this arc creates, this spec's own pre-commit path, and the outside-repo mdview paths — each named in the review dispatch); the three seeded candidates carry their §2.2 dispositions (two archived with pointers + records in place, CAP-LOSS probe transcript recorded with keep/close executed).
- **AC-A2:** the plan's semantic-screen table covers every open entry (count pinned to the census at plan time) with a disposition each.
- **AC-B1:** `pnpm ledger:mass --root <fixture-dir>` against a committed fixture copy of the 2026-08-04 ledgers reproduces the §0 oracle exactly — BACKLOG mass 306 / DEFERRED mass 15 / total 321, unsized 31+11 — with the expected numbers hard-coded in the test from this spec, not read back from the script; `--json` round-trips; `--at 8d78cdf13` (this arc's spec commit) reproduces the same numbers from git history; a planted fixture entry with a present-but-unrecognized severity is reported by id under `severity-unrecognized`.
- **AC-B2:** `tests/docs/_metaLedgerSizing.test.ts` fails on a planted unsized new entry in a scratch ledger fixture, names it by id, and passes on the real tree with the 42-id grandfather registry.
- **AC-B3:** mdview's mass revision passes the §3.4 parity oracle (the FULL `--json` envelope: per-queue entry count, per-tier counts, mass, unsized id list, severity-unrecognized id list, and totals — same tree, including the previously-missed `BL-NULLCODE-STAMP-BATCH-2` heading shape), shows mass + unsized + severity-unrecognized beside the queue counts, design doc updated with a new rev entry (next free number per §3.4) citing §3.1, its ledger checklist re-run green, `.bak` snapshot taken.
- **AC-C1:** every §4.1 pool id is dispositioned (CLOSE merged + archived / excluded with class + reason recorded); no pool id remains OPEN-unaddressed at arc close.
- **AC-C2:** each sweep branch's ledger claims were checked, marked, pushed at its Stage 0, and cleared in its last pre-merge commit (invariant 12 as amended 2026-08-04).
- **AC-PROG:** at arc close, `pnpm ledger:mass` total is strictly below the §0 baseline of 321 and the canonical open-entry count is below 110. (The mdview sidebar equals the canonical count once the mass revision's parity oracle holds — its pre-revision reading of the same baseline tree is 109, an artifact of the grammar divergence §3.4 closes, not a head start.)

## §8 Impeccable gate

`impeccable-gate:` decided per-branch at plan time: the Unit C UI/a11y cluster branch carries the dual-gate (its diff touches `components/`); every other branch in this arc is `impeccable-gate: N/A — no UI surface`. mdview is personal tooling outside the repo — invariant 8's UI-surface definition (`app/`, `components/`, theme tokens, DESIGN.md) does not reach it, and its quality bar is its own design-doc checklist (§3.4).
