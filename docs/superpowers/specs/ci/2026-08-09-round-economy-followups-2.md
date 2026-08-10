# Round-economy followups 2: post-#732 filing promotions

**Date:** 2026-08-09 · **Authoring branch:** `docs/round-economy-followups-2-specs` · **Implementation branch:** `feat/round-economy-followups-2` (Opus pane) · **Status:** DRAFT

## §0 Why this arc exists, and its scope

Second reconciliation of the `docs/review-rounds/` corpus, after PR #732
(`docs/superpowers/specs/ci/2026-08-07-round-economy-followups.md`, merged 2026-08-07). The
2026-08-09 sweep read all eleven filings committed to `origin/main` after #732's merge base and
classified every **Mechanizable** item: most are reconciled (a BL row exists, the repair shipped
in-arc, or the filing declined with a stated recurrence trigger), and three nominations meet the
recurrence bar — the same durable-rule shape independently nominated by two or more merged arcs,
existing nowhere outside the filings that named them. This arc promotes those three (P1–P3) and
files the two buildable lint arms as ordinary `BL-` rows.

The user ratified the batch 2026-08-09 in-session and granted full autonomy ("Yes, fully
autonomous. This fable session owns spec + plan, launches new pane for opus implementation +
closeout"). Docs-only diff: `docs/agents/writing-plans.md`, `AGENTS.md`,
`docs/agents/spec-self-review.md`, `BACKLOG.md`, this spec, and the
`docs/superpowers/specs/ci/README.md` index row.

## §1.1 Resolved scope — do not relitigate

All ratified 2026-08-09 by the user in the authoring session unless another source is cited.

1. **The promotion set is decided: exactly three.** P1 (RED/gate-command executability), P2
   (pre-dispatch mutation enrolment), P3 (executable single source for re-derived counts). The
   eight single-instance mechanizable items surfaced by the same sweep (accept-set calibration
   probe, recorded-SHA expiry, workflow-trigger claim cross-check, isolated snippet compilation,
   pre-draft registry sweep, `.click()`-inside-`toPass` grep, stale-topology prose derivation,
   registry-semantics lookup) stay in their filings — the user selected "silent on singles"
   (AskUserQuestion, 2026-08-09), so this spec neither promotes them nor carries a declined
   list. Do not relitigate toward adding rows or bullets for them; the recurrence bar
   (`AGENTS.md` ledger filing bar, 2026-08-04) is the promotion trigger and each filing already
   records its own item.
2. **Rule text plus two BL rows; neither arm is built in this arc.** The user selected "rule
   text + 2 BL rows" (AskUserQuestion, 2026-08-09). Building either lint arm inside a docs arc
   is the scope blowout class-sweep exception (c) exists to prevent — the same disposition every
   source filing itself chose ("filed rather than built here").
3. **Autonomy: both user review gates WAIVED** (user grant 2026-08-09). This session owns spec
   and plan through adversarial APPROVE and the authoring-branch merge; implementation and
   closeout belong to a new Opus pane. Stop only for a genuinely NEW question.
4. **P3 lands in `docs/agents/spec-self-review.md`, not `AGENTS.md`.** The citation pass found
   the single-source-of-truth prose lives in that file's numeric-sweep bullet
   (`docs/agents/spec-self-review.md:14`), which is "canonical for its subject and carries the
   same authority as `AGENTS.md`" (`docs/agents/spec-self-review.md:3`). The design
   presentation named AGENTS.md before the citation pass; this correction is the citation pass
   working, not a scope change.
5. **Filings are the evidence base, not re-derived.** Each promotion and each BL row cites its
   source filings under `docs/review-rounds/`. The filings' own probe evidence (round tables,
   measured finding counts, escaping-input samples) is not re-verified here; a filing committed
   with a merged arc is the record (#732 spec §1.1.6 precedent).
6. **Sweep completeness is bounded to the eleven post-#732 filings on `origin/main`** at
   `d2a31e4aa` (enumerated by `git diff --name-only --diff-filter=AM cf1e55473..origin/main
   -- 'docs/review-rounds/**/*.md'` filtered to the `^[0-9a-f]{12}\.md$` arc shape;
   `cf1e55473` is #732's merge commit). Filings on
   live unmerged branches are the NEXT reconciliation's input, by the same rule that makes the
   corpus accumulate forward (round-economy spec §12).

## §2 The three promotions

Format follows #732 §2: each row names its target by file + anchor symbol, the action, the
substance to land, and the source filings. Wording below is normative in substance; the
implementer may adjust connective phrasing to match the target file's idiom, but each landed
edit MUST cite its source filing paths inline.

### P1 — RED and gate commands are validated executably at authoring time

**Target:** `docs/agents/writing-plans.md`, new bullet directly after "Typecheck pasted
snippets + verify CI wiring" (`docs/agents/writing-plans.md:25`). **Action:** new bullet.

**Substance:** The task-marker contract is red-then-green ON THE SAME COMMAND: a `red=` (the
declared task contract, `docs/agents/spec-self-review.md:27-36`) is valid only if the task
has a point where the command is OBSERVED failing for the stated reason and a later point
where the SAME command passes. Before a plan is dispatched for review, each marker is
validated against that cycle. A `red=` asserting the current tree already fails (its failing
case exists at plan time) is RUN — one that exits 0 is a plan defect. A `red=` whose failing
case the task itself writes — a NEW test file OR a new case added to an EXISTING suite — is
the ordinary invariant-1 shape: it is not run at plan time (the pre-change suite may
legitimately be green, or the file absent), and the plan-time check is static instead: the
task names the production line whose absence or defect will make the new case fail (the
RED-validity bullet in the same file), verified absent or defective on the live tree, with
the observed-red obligation landing in the task's RED step. Rejected statically, in either
branch, is any marker whose cycle cannot complete: a guard test that passes the moment it is
authored (no observable red); a command whose target the GREEN step deletes or renames, so
the SAME command never passes (the classname arc's census case — red observable before the
deletion, never green after it); a conjunct behind `&&` where an earlier expected failure
short-circuits it (asserted red, never observed; the conjunction is the GREEN criterion); and
a task body with no one-line "what is red and why" statement. Declared gate commands (merge gates, closeout checks, CI probes) get the same
treatment as a test's mutant-red: probe each against a CONSTRUCTED failing input and confirm
non-zero exit — a bare `gh run list`, an unresolvable sha that empties a diff into a passing
`test -z`, and a fail-open shell chain all exit 0 on the exact failure they name. Mechanical
arm: `BL-SPECLINT-RED-EXECUTABILITY-ARM`.

**Sources (three arcs):**
`docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md` (spec §, Mechanizable 1 —
three rounds, three spots; "I 'fixed' the TDD markers in R3 and still shipped a false one into
R4"); `docs/review-rounds/docs/quick-wins-2-specs/97e179d831aa.md` (plan § — running each
`red=` would have caught four of R1's fourteen findings and both halves of R2 F1);
`docs/review-rounds/test/resurrect-mobile-safari-e2e/9bd0a8456151.md` (plan §, Mechanizable 1 —
three rounds of gate commands exiting 0 on the failure they name; "probed against a CONSTRUCTED
failing input before it goes in the plan").

### P2 — a guard/proof surface is enrolled in the mutation registry BEFORE its first review dispatch

**Target:** `AGENTS.md`, the convergence-criterion block's bullet 3 ("Score, when the surface
is enrolled", `AGENTS.md:264`). **Action:** extend the bullet.

**Substance:** Enrolment precedes review; it does not follow it. When a review's subject IS a
guard, proof, or equivalence surface the registry can express (a lib module or script whose
defect class is "reports OK while the output moved"), enrol it in
`tests/mutation/source/registry.ts` and run `pnpm mutation:guards` BEFORE the first dispatch,
and state the score plus the unaccepted-survivor set in the round-1 brief. Enrolment-precedes-
review includes SHAPE: the runner overlays a target only when a Vitest suite imports it, so a
new proof/guard surface is authored as an importable module with a referring suite from the
start — not as a terminal CLI script. Two arcs measured the cost of deciding this late: the
classname equivalence scripts were never enrolled and, as shipped, not even enrollable without
restructuring (CLI-shaped — no exports, unconditional `process.exit`, no importing suite) and
drew fifty false-pass findings across fourteen diff rounds at roughly 25 minutes of dispatch
per mutant (that arc's own figure; the step3 filing records no per-mutant duration),
and the step3-a11y tap-target suite spent six of nine diff rounds the same way before a later
probe showed the registry cannot express that Playwright surface at all (its nineteen mutants
are bespoke component edits). An enrolled surface runs in roughly 93 seconds (the
convergence-criterion block's own measured first customer). The step3 outcome is the other
branch of the same rule: a surface the registry cannot express is re-dispositioned honestly
with the probe that shows it, the quick-wins-2 §2.4 pattern
(`docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4), not enrolled symbolically.

**Sources (two arcs):** `docs/review-rounds/fix/step3-a11y-cluster/61281c23e8ce.md` (diff §
carry-forward — "enrol it in the source-mutation registry BEFORE the first review dispatch";
six of nine rounds hand-discovering mutants);
`docs/review-rounds/refactor/classname-array-join-cn/9bd0a8456151.md` (diff §, Mechanizable —
"These two scripts were not enrolled, and that is the defect"; 50 real false passes across
fourteen rounds; the un-filed enrolment nomination this row now records).

### P3 — a count that exists in both an executable declaration and prose has the executable one as its single source

**Target:** `docs/agents/spec-self-review.md`, the "Numeric sweep (discrete pass)" bullet
(`docs/agents/spec-self-review.md:14`). **Action:** extend the bullet.

**Substance:** Where a count exists in BOTH an executable declaration and prose, the executable
one (a single named declaration — the `EXPECTED_SITE_TOTAL` pattern, a module-local `const` at
`scripts/verify-cn-operand-parity.mjs:80`) is the single source. Prose either references the
constant by name or carries a dated "at authoring time" qualifier; a present-tense prose
cardinality that repeats the literal is a defect even while the values are equal, because the
next re-derivation updates the executable declarations (they gate) and strands the prose. The
classname delta arc spent four review rounds plus one CI cycle clearing exactly this class
instance-by-instance — including its own filing hard-coding a round count the corpus then
contradicted — and the wedge-remeasure arc filed the sibling-list-count and cross-template
variants of the same shape against `NUMERIC_NOUN_MISMATCH` (`lib/specLint/numerics.ts:88`).
Mechanical arm: `BL-SPECLINT-PROSE-COUNT-PARITY`.

**Sources (two arcs):**
`docs/review-rounds/refactor/classname-array-join-cn/b2aca7b02547.md` (diff §, Mechanizable —
"a re-derived cardinality needs a single source, or a lint that ties prose to it");
`docs/review-rounds/chore/next-1630-wedge-remeasure/9bec2e11ab11.md` (spec §, Mechanizable 2 —
cross-template quantity comparison; diff §, Mechanizable 2 — sibling-list counting).

## §3 The two BL rows

Both land in `BACKLOG.md`'s open queue, shaped like the existing rows (heading + meta line +
description). Normative content below; exact prose may be tightened at implementation.

### §3.1 BL-SPECLINT-RED-EXECUTABILITY-ARM

Heading: `BL-SPECLINT-RED-EXECUTABILITY-ARM — spec:lint arm that observes each declared red=/gate command`

Meta line: **Severity:** LOW (tooling; no product surface) · **Class:** review-round reduction
(tooling) · **Filed:** 2026-08-09 (round-economy followups-2, promotion P1) · **Effort:** M ·
**Reachability:** PROBED via three merged filings — quick-wins-2 plan R1 (four of fourteen
findings were `red=` commands that already exit 0), classname plan R3-F5/R4-F1/R5-F1
(cycle-breaker markers across three rounds — two never observably red, one whose command
never goes green), resurrect-mobile-safari plan (three rounds of
gate commands exiting 0 on the failure they name).

Description: extend `spec:lint`'s declared-task-contract arm (`pnpm spec:lint`,
`scripts/spec-lint.ts`; task-region grammar per `docs/agents/spec-self-review.md:27-36`). For
an enrolled plan, validating the same-command red-then-green cycle: (a) an execution mode
that RUNS each `red=` the plan asserts is red NOW (its failing case exists at plan time) and
reports a new code (e.g. `RED_ALREADY_GREEN`) when it exits 0 — opt-in per invocation, since
a `red=` may be expensive; a `red=` whose failing case the task itself writes (a new test
file OR a new case in an existing suite) is exempt from execution, not from validation: the
arm instead checks the task names a production line verifiable as absent or defective on the
live tree; (b) static cycle-breaker shapes needing no execution: a guard test green at
authoring, a command whose target the GREEN step deletes or renames (the SAME command never
passes), an `&&` conjunct behind an expected failure, and a task body with no one-line "what
is red and why" statement;
(c) an advisory listing declared gate commands that carry no
"probed against a constructed failing input" annotation. The rule half binds immediately via
P1; this row is the mechanical enforcement. Design and thresholds belong to the implementing
arc, not this row.

### §3.2 BL-SPECLINT-PROSE-COUNT-PARITY

Heading: `BL-SPECLINT-PROSE-COUNT-PARITY — numeric-sweep extension: prose cardinalities against executable declarations`

Meta line: **Severity:** LOW (docs drift; nothing renders differently) · **Class:**
review-round reduction (tooling) · **Filed:** 2026-08-09 (round-economy followups-2, promotion
P3) · **Effort:** S · **Reachability:** PROBED via merged filings — classname delta arc: five
findings across four rounds plus one CI cycle (`_metaReviewRoundEconomy` "stage diff declares 4
rounds; the corpus counts 5"), all one class; wedge-remeasure: spec r3-3 (quantity drift across
quoted disposition templates), diff r4 (stale cardinality over a grown sibling list).

Description: extend `lib/specLint/numerics.ts` beyond `NUMERIC_NOUN_MISMATCH`
(`lib/specLint/numerics.ts:88`) with the three measured shapes: (a) when a doc names a script
that declares a count constant (the `EXPECTED_SITE_TOTAL` pattern — a module-local `const` in
the live precedent, so the arm reads the declaration textually rather than importing it),
compare the doc's prose cardinalities against the constant's live value; (b) count the sibling list items directly
beneath an "N shapes/items" claim and compare; (c) compare quantities repeated across quoted
disposition templates within one doc. Advisory-first is acceptable; the rule half binds
immediately via P3. Design and opt-in mechanics belong to the implementing arc.

## §4 Acceptance criteria

- AC-1: each P-row lands in its named target file, at its named anchor, with its source filing
  paths cited inline; wording preserves every normative element of §2 (the same-command
  red-then-green cycle contract with its rejected
  shapes, the constructed-failing-input probe, "enrolment precedes review", the
  cannot-express re-disposition, the executable-single-source rule and its qualifier escape).
- AC-2: both BL rows land in `BACKLOG.md`'s open queue with heading, meta line (including
  `**Reachability:** PROBED …`), and description per §3; the ids `BL-SPECLINT-RED-EXECUTABILITY-ARM`
  and `BL-SPECLINT-PROSE-COUNT-PARITY` resolve for any future filing that cites them
  (`tests/docs/_metaReviewRoundEconomy.test.ts` resolves cited ids against live ledgers).
- AC-3: `pnpm spec:lint docs/superpowers/specs/ci/2026-08-09-round-economy-followups-2.md`
  reports zero HARD findings on the final spec; advisory findings are acceptable only as
  `COPY_UNPAIRED_QUOTE` artifacts of verbatim quotation (filing prose, user-ratification
  wording, and target-file anchor text), and each review dispatch acknowledges the advisory
  count rather than omitting it.
- AC-4: the docs test suite is green on the branch (at minimum `pnpm vitest run tests/docs`),
  covering the ledger guards and the review-round economy gate.
- AC-5: this spec gains its `docs/superpowers/specs/ci/README.md` index row in the same PR.
- AC-6: no file under `docs/review-rounds/` is edited (filings are the immutable evidence
  base), and no lint arm implementation lands (invariant: §1.1.2).

## §5 Non-goals

- Building either lint arm (BL rows only; §1.1.2).
- Promoting, declining, or otherwise dispositioning the single-instance items (§1.1.1).
- Editing the per-machine review-convergence gate hook (it lives in each account's untracked
  Claude config tree, outside this repo) — P2 changes the repo-durable contract text only.
- Re-verifying the filings' probe evidence (§1.1.5).
- Any change under `app/`, `components/`, `supabase/`, or `lib/` outside this spec's named doc
  targets. `impeccable-gate: N/A — no UI surface` (the plan will carry the closeout marker).
