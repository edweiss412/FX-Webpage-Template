# Plan — table provenance, a docs-only refutation record

Spec: `docs/superpowers/specs/ci/2026-08-28-table-provenance.md` (canonical; every § below refers to
it). Ledger row: `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE`, archived by this plan.

impeccable-gate: N/A — no UI surface

This plan touches `docs/superpowers/specs/ci/`, `docs/superpowers/plans/ci/`, `docs/review-rounds/`,
`BACKLOG.md` and `BACKLOG-archive.md`. Nothing under `app/`, `components/`, `lib/`, `app/globals.css`,
`tailwind.config.*`, or `DESIGN.md`. The marker sits on its own line because the gate reads the LINE.

---

## 0. The shape of this arc, stated because it is unusual

The row asked for a lint. The measurement said not to build it, so **no file under `lib/` or
`scripts/` changes** and there is no TDD cycle in the ordinary sense. The deliverable is an evidence
record plus a ledger move, which is the same shape `BL-SPECLINT-RED-TRUTH-PROBE` and
`BL-DERIVED-NUMBERS-IN-DOCS-ROT` closed in
(`docs/superpowers/plans/2026-08-22-derived-number-provenance-convention.md`: "what is left to
implement is a paragraph, an index row, and a ledger move").

The one executable artifact is the census, and its test is that it reproduces the spec's population
figures at the sha the spec names. That is the AC-2 form the sibling arc used.

**Most of this plan is already implemented.** The spec, census, index rows, convention cross-reference
and `LIMITS.md` disposition landed across the five spec-review rounds, because the review was of the
artifact rather than of a description of it. What remains is the archive move and the closeout. The
acceptance criteria below are written to be checked against the tree as it stands, not as a forward
promise, and each names the command that decides it.

## Acceptance criteria

**Narrowed at plan review round 3, by subtraction rather than by widening.** Rounds 1 and 2 found
criteria no command could decide. Round 2's repair was an acceptance script that asserted them; round 3
then returned eight findings, six of them inputs that script did not cover, and every repair they imply
is a further widening of it. That is the recognizer-growth shape `AGENTS.md` names, where the class
repair is narrowing and never parser growth, and it is the orchestrator's pre-declared disposition for
this arc: on a refutation record the terminating repair is fewer claims.

So the script is DELETED, and the criteria below are only those a SHIPPED guard decides. Each names
that guard.

- **AC-1:** `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` ends in `BACKLOG-archive.md` and not in
  `BACKLOG.md`, the archived entry carries no `IN PROGRESS` text, and its section names the branch that
  resolved it. **Decided by** `tests/docs/_metaDeferralLedgerGraduation.test.ts` (archive-only
  membership plus heading-anchored provenance), with `tests/docs/_metaLedgerInProgress.test.ts` and
  `tests/docs/_metaLedgerReferentialIntegrity.test.ts`.
- **AC-2:** the spec has an index row under `docs/superpowers/specs/ci/`.
  **Decided by** `tests/docs/specsReadmeIndexParity.test.ts`, which has exact parity semantics.
- **AC-3:** the review-round filing declares its own per-stage round count and carries `**Examined:**`
  and a disposition. The plan stage's rounds are recorded alongside the spec stage's.
  **Decided by** `tests/docs/_metaReviewRoundEconomy.test.ts`.
- **AC-4:** if this plan carries fenced snippets, they satisfy the corpus fence rules.
  **Decided by** `tests/docs/_metaPlanSnippetFences.test.ts`, which walks `docs/superpowers/plans` from
  disk.
- **AC-5:** the closeout marker is well-formed.
  **Decided by** `tests/docs/_metaInvariant8Closeout.test.ts`. (Kept: the round-4 subtraction dropped
  this one by accident while removing the vacuous mint-bar criterion. A shipped guard does decide it,
  so it belongs — subtraction is for claims nothing decides, not for claims that hold.)

### What the named guards do NOT decide, stated because three drafts implied they did

Plan review round 4 found four criteria claiming more than their guard delivers. Each is corrected
above by describing the guard accurately; what is left over is recorded here rather than given a new
checker, for the reason the next section gives.

- **Same-commit atomicity is not machine-decided.** The graduation guard and the in-progress guard
  inspect FINAL STATE only, so two commits producing the same tree pass identically. Invariant 12's
  same-commit rule is therefore an authoring discipline this arc follows and the PR's commit history
  shows, not something these suites verify. AC-1 above no longer claims otherwise.
- **`Mechanizable: none` is legal without a `declined:` reason.** The economy guard accepts it; its own
  passing plant at `tests/docs/_metaReviewRoundEconomy.test.ts:679` confirms. This arc's filing carries
  a `declined:` reason because the entry is not `none`, which is the arc's choice rather than the
  guard's requirement, and AC-3 no longer states it as one.
- **The mint bar leaves the row's jurisdiction the moment it is archived.** That guard deliberately
  scans open ledgers only (`BACKLOG.md`, `DEFERRED.md`). It decides the row's `Facing` and
  `Mint-exception` fields while the row is OPEN and says nothing after the move, so the former AC-5 was
  vacuous as a post-archive criterion and is **deleted** rather than reworded.
- **AC-4 passes vacuously today.** The shipped analyzer reports zero fenced blocks in this plan: the
  one fenced block an earlier draft carried was the hand-rolled archive check that round 3 deleted. The
  guard stays in the inventory because it walks the plans tree from disk and would cover this file the
  moment a fence is added, which is coverage by construction rather than a criterion being met now.

### Deliberately NOT acceptance criteria

The spec's internal consistency — that its stated figures match what its census prints, that its
`LIMITS.md` enumeration matches its declared count, that its README cross-reference resolves — is
**not** listed above, and the reason is this arc's own subject.

Those are claims about one document's prose. No shipped guard decides them. Round 2 built one, and
round 3 demonstrated it was narrower than the criteria it claimed to settle in five separate ways,
each fixable only by making it wider. A checker written to bind one document's numbers to a command
does not hold the property either, which is precisely what the spec argues about the marker the ledger
row asked for. Recording that as a documented limit is more honest than a fifth widening.

What settles them instead is what settled them for five spec rounds: running the census and reading it
against the spec, which is review's job and was performed five times. The census remains committed and
reproducible at its anchor, so any reader can repeat it.

## Tasks

- [ ] **1. Archive the ledger row, and register the graduation.** Move
      `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` from `BACKLOG.md` to `BACKLOG-archive.md`, rewriting
      its status line to `CLOSED 2026-08-28 (feat/speclint-table-provenance), DEMOTED ON A MEASURED
      REFUTATION`, dropping the `IN PROGRESS` and `Branch:` fields in the same edit, carrying the
      corrected recurrence count into the archive entry (the row's own title says "four arcs"; the
      measurement says eleven), and **adding
      `{ id: "BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE", provenance: "feat/speclint-table-provenance" }`
      to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` in the SAME commit.**

      That registry is the correct oracle and it is what plan review round 2 finding 6 supplied. An
      earlier draft hand-rolled a four-part shell check whose `grep -c` exit codes were backwards — a
      correct zero count exits 1, so the check reported failure at green. The shipped guard already
      asserts both halves properly: every graduated id is archive-only (present in
      `BACKLOG-archive.md`, absent from `BACKLOG.md`), and the archived SECTION, anchored heading to
      heading rather than by substring, names the branch that resolved it.

      red: add the registry row BEFORE the archive move and run
      `pnpm vitest run --no-file-parallelism tests/docs/_metaDeferralLedgerGraduation.test.ts` — it
      fails on `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE missing from BACKLOG-archive.md`. That is the
      archive-presence assertion, which the guard checks FIRST; an earlier draft of this task claimed
      the red would read `still in BACKLOG.md`, which is the second assertion and never reached
      (plan review round 3 finding 6).
      green: the same command passes once the entry has moved and its section names the branch, and
      `tests/docs/_metaLedgerInProgress.test.ts` and `tests/docs/_metaLedgerReferentialIntegrity.test.ts`
      pass with it.

- [ ] **2. Filing and closeout.** Add the plan stage's section to
      `docs/review-rounds/feat/speclint-table-provenance/60dece4d5722.md`, declaring THIS file's plan
      round count beside the spec section already there, then record the gate results in this plan's
      §12 and confirm the invariant-8 marker.

      The plan stage reaches the threshold the same way the spec stage did, and AC-3 is false until
      the section exists (plan review round 3 finding 7 found the filing declaring only the five spec
      rounds). Filing voluntarily below the threshold is legal and is what this arc does if the plan
      stage closes under four counted rounds, since the corpus README treats a voluntary filing as
      valid and an arc's rounds are worth recording either way.

      red: `pnpm vitest run --no-file-parallelism tests/docs/_metaReviewRoundEconomy.test.ts` reds on
      the missing or miscounted plan section once the threshold is reached.
      green: the same command passes with the section present and its declared count matching.

## Verification surface

Every criterion is decided by a guard that already ships. There is no arc-authored checker, by design:
see the subtraction note above.

| criterion | command |
| --- | --- |
| AC-1 | `pnpm vitest run --no-file-parallelism tests/docs/_metaDeferralLedgerGraduation.test.ts`, then the same for `_metaLedgerInProgress` and `_metaLedgerReferentialIntegrity` |
| AC-2 | `pnpm vitest run --no-file-parallelism tests/docs/specsReadmeIndexParity.test.ts` |
| AC-3 | `pnpm vitest run --no-file-parallelism tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-4 | `pnpm vitest run --no-file-parallelism tests/docs/_metaPlanSnippetFences.test.ts` |
| AC-5 | `pnpm vitest run --no-file-parallelism tests/docs/_metaInvariant8Closeout.test.ts` |
| all | `pnpm spec:lint` on the spec and this plan; `pnpm typecheck`; `pnpm format:check` |

`_metaLedgerMintBar` remains in the inventory below because the diff is subject to it; it is not
listed here because, per the section above, it leaves the row's jurisdiction at the archive move and so
no post-move criterion can rest on it.

### Meta-test inventory

Every structural guard this arc's diff is subject to. `_metaPlanSnippetFences` was missing from an
earlier draft (plan review round 3 finding 8) even though it walks `docs/superpowers/plans` from disk.
This plan carries NO fenced blocks today, so that guard passes vacuously; it stays listed because the
walk covers this file by construction the moment one is added.

| guard | why this arc is subject to it |
| --- | --- |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | task 1 graduates a `BL-` row; it needs a `BACKLOG_GRADUATED` entry in the same commit |
| `tests/docs/_metaLedgerInProgress.test.ts` | the arc carries an in-progress marker that comes off with the archive move |
| `tests/docs/_metaLedgerReferentialIntegrity.test.ts` | citations of the archived row must still resolve |
| `tests/docs/_metaLedgerMintBar.test.ts` | the row's `Facing` and `Mint-exception` fields |
| `tests/docs/specsReadmeIndexParity.test.ts` | the arc adds a spec under `docs/superpowers/specs/ci/` |
| `tests/docs/_metaPlanSnippetFences.test.ts` | this plan lives under `docs/superpowers/plans`, which the guard walks from disk; it carries no fences today, so the pass is vacuous |
| `tests/docs/_metaInvariant8Closeout.test.ts` | task 2 confirms the closeout marker |
| `tests/docs/_metaReviewRoundEconomy.test.ts` | both stages passed the round threshold and owe filings |

**A syntactic gate cannot decide whether prose contradicts its spec.** Plan review round 1 finding 5
found exactly that: the corpus check returned zero problems on a `declined:` reason that misstated the
ratified convention and repeated a claim spec round 5 had withdrawn. That is review's class, not a
gate's, and it is why the subtraction note above declines to invent a gate for the same job.

Suites run ONE AT A TIME with `--no-file-parallelism`, per the fleet load discipline in force during
this arc.

## Out of scope, and fenced

- Building either arm of the lint. That is the spec's whole subject; §9 is its resolved-scope section.
- Retrofitting the 3425 historical tables (§5 gives the number).
- The anchor-carrying marker variant, fenced in §9 as a different proposal with its own re-file trigger.
- Widening the census recognizer to raise the executable population (§9).

## 12. Closeout

impeccable-gate: N/A — no UI surface

Nothing under `app/`, `components/`, `lib/`, `app/globals.css`, `tailwind.config.*` or `DESIGN.md` is
touched, so the invariant-8 dual gate does not apply. The one source-tree file this arc changes is
`tests/docs/_metaDeferralLedgerGraduation.test.ts`, and the change is a registry row.

### Acceptance criteria, decided

| criterion | guard | result |
| --- | --- | --- |
| AC-1 archive move, no flight field, provenance section | `_metaDeferralLedgerGraduation`, `_metaLedgerInProgress`, `_metaLedgerReferentialIntegrity` | green (139 / 17 / 27); the graduation suite went 138 to 139 with the new row |
| AC-2 spec index row | `specsReadmeIndexParity` | green (25) |
| AC-3 filing declares its per-stage counts | `_metaReviewRoundEconomy` | green (135); spec section declares 5, plan section declares 4 |
| AC-4 fenced snippets, if any | `_metaPlanSnippetFences` | green (12), vacuously — the analyzer reports zero fences in this plan |
| AC-5 closeout marker | `_metaInvariant8Closeout` | green (14) |

`_metaLedgerMintBar` green (11); in the inventory because the diff is subject to it, not because a
criterion rests on it.

`pnpm typecheck` clean, `pnpm format:check` clean, `pnpm spec:lint` 0 hard on both the spec and this
plan.

### The TDD record for task 1

Baseline first, per the orchestrator's condition: all eight guards and both task commands run at the
unmodified head `407085958`, all green.

**Red:** the `BACKLOG_GRADUATED` row added while the entry was still in `BACKLOG.md` —
`AssertionError: BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE missing from BACKLOG-archive.md`. That is
the archive-presence assertion, which the guard evaluates BEFORE the still-in-open check; plan review
round 3 finding 6 corrected an earlier draft that predicted the wrong one.

**Green:** after the move, in one commit (`cc9754b79`) touching `BACKLOG.md`, `BACKLOG-archive.md` and
the registry together.

### What this arc shipped, and what it deliberately did not

Shipped: a spec, a committed census reproducible at its anchor, two index rows, a cross-reference in
the ratified provenance convention, the `LIMITS.md` disposition with a narrowed forward re-file
trigger, a two-stage round-economy filing, and the ledger move.

Not shipped: any lint. No file under `lib/` or `scripts/` changes. Nine review rounds across two
stages argued that, and both stages terminated by subtraction rather than by convergence.

### One correction the arc made to the subtraction doctrine itself

Plan round 3 subtracted an arc-authored checker and, in the same edit, dropped the closeout criterion
by accident. Round 4 restored it. The refinement is worth stating because it is easy to over-apply:
**subtraction is for claims nothing decides, not for claims that hold.** A criterion with a shipped
guard behind it survives; a criterion with only a bespoke checker behind it is the one to cut.
