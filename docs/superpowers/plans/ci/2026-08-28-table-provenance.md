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

- **AC-1:** the census reproduces every population figure in spec §1, §3, §4, §6 when run with
  `--at 8b4d521cac00`, and exits 0.
- **AC-2:** the census reads committed content at a rev, never the working tree, so its output does
  not move when this arc's own documents join the corpus it walks; `--at` with no value exits 2
  rather than silently defaulting to `HEAD`.
- **AC-3:** the spec has an index row in `docs/superpowers/specs/ci/README.md`; the census has one in
  `docs/superpowers/specs/ci/probes/README.md`.
- **AC-4:** `LIM-NUMERIC-TABLE-PROVENANCE` in `docs/review-rounds/LIMITS.md` names an owning record,
  enumerates all eleven arcs with per-arc round counts summing to its declared total, and carries a
  re-file trigger that is FALSE at `8b4d521cac00`.
- **AC-5:** the probes README `## Stating a figure` convention cross-references tables.
- **AC-6:** `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` is archived, and its `**Status:** IN PROGRESS`
  marker comes off in the SAME commit that archives it (invariant 12: archives categorically reject
  in-flight entries).
- **AC-7:** the review-round filing at `docs/review-rounds/feat/speclint-table-provenance/60dece4d5722.md`
  declares this file's own round count and carries `**Examined:**` plus a `**Mechanizable:**` entry
  with a `declined:` reason.

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
      fails on `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE still in BACKLOG.md`, which is the archive
      move being genuinely absent rather than a described red.
      green: the same command passes once the entry has moved and its section names the branch, and
      `tests/docs/_metaLedgerInProgress.test.ts` and `tests/docs/_metaLedgerReferentialIntegrity.test.ts`
      pass with it.

- [ ] **2. Closeout.** Record the gate results in this plan's §12 and confirm the invariant-8 marker.

## Verification surface

**One command decides AC-1 through AC-5**, and it ASSERTS rather than produces:

```
pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-28-table-provenance-acceptance.mts
```

Plan review rounds 1 and 2 found the same defect one level apart, and this is the repair. Round 1
found four criteria with no deciding command. Round 2 found that the commands added in response still
could not fail: the census is a PRODUCER that exits 0 for any population, so a stale spec figure could
not red it, and `grep -c <filename>` is unanchored, so removing an index row while leaving the filename
in prose passed, as did duplicating it.

**The script was checked against those exact escapes rather than assumed to close them.** Each was
planted, run, and reverted:

| planted mutation | result |
| --- | --- |
| census index ROW removed, filename kept in prose | `FAIL AC-3 … found 0` |
| `**Owning record:**` changed to `none` | `FAIL AC-4 an owning record is named, and it is not none` |
| spec's §6 adjacency figure set to a stale 98 | `FAIL AC-1 … census says 99; the spec's §6 row disagrees` |
| all reverted | `all checks passed (8b4d521cac00)` |

Writing it also caught a defect in itself: the per-arc rounds reducer destructured the match's PATH
rather than its count and summed to `NaN`, which the assertion reported and a producer would have
printed happily.

| criterion | decided by | why this one |
| --- | --- | --- |
| AC-1 | the acceptance script | compares each census figure against the spec's stated value; the census alone only prints |
| AC-2 | the acceptance script | runs bare `--at` in a child and asserts **exit 2**, a branch the `--at <sha>` run cannot reach |
| AC-3 | the acceptance script, plus `tests/docs/specsReadmeIndexParity.test.ts` for the spec index | asserts exactly one TABLE ROW for the census and the plan; that suite reads only one level below `specs/` and never opens the probes README |
| AC-4 | the acceptance script | parity, a named owning record that is not `none`, and a trigger phrased forward |
| AC-5 | the acceptance script | requires the cross-reference AND the record link, not merely a surviving phrase |
| AC-6 | `tests/docs/_metaDeferralLedgerGraduation.test.ts` and `tests/docs/_metaLedgerInProgress.test.ts` | see task 1 |
| AC-7 | `tests/docs/_metaReviewRoundEconomy.test.ts` | declared count, `**Examined:**`, a `Mechanizable:` entry with a `declined:` reason |
| all | `pnpm spec:lint` on spec and plan, `pnpm typecheck`, `pnpm format:check` | citations resolve, the `.mts` files compile, prettier clean |

### Meta-test inventory

Every structural guard this arc's diff is subject to, named rather than left implicit (plan review
round 2 finding 6):

| guard | why this arc is subject to it |
| --- | --- |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | task 1 graduates a `BL-` row; the row must appear in `BACKLOG_GRADUATED` |
| `tests/docs/_metaLedgerInProgress.test.ts` | the arc carries an in-progress marker that must come off with the archive move |
| `tests/docs/_metaLedgerReferentialIntegrity.test.ts` | citations of the archived row must still resolve |
| `tests/docs/_metaLedgerMintBar.test.ts` | the row's `Facing` and `Mint-exception` fields |
| `tests/docs/specsReadmeIndexParity.test.ts` | the arc adds a spec under `docs/superpowers/specs/ci/` |
| `tests/docs/_metaInvariant8Closeout.test.ts` | task 2 confirms the closeout marker |
| `tests/docs/_metaReviewRoundEconomy.test.ts` | the arc's stages passed the round threshold and owe a filing |

**A syntactic gate cannot decide whether a filing's prose contradicts the spec.** Plan review round 1
finding 5 found exactly that: the corpus check returned zero problems on a `declined:` reason that
misstated the ratified convention and repeated a claim spec round 5 had withdrawn. That is review's
class, not a gate's, and it is recorded so the next arc does not read a green corpus check as proof the
prose is right.

Suites run ONE AT A TIME with `--no-file-parallelism`, per the fleet load discipline in force during
this arc.

## Out of scope, and fenced

- Building either arm of the lint. That is the spec's whole subject; §9 is its resolved-scope section.
- Retrofitting the 3425 historical tables (§5 gives the number).
- The anchor-carrying marker variant, fenced in §9 as a different proposal with its own re-file trigger.
- Widening the census recognizer to raise the executable population (§9).

## 12. Closeout

impeccable-gate: N/A — no UI surface

Filled at task 2.
