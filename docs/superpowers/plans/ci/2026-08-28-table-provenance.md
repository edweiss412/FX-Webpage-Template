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

- [ ] **1. Archive the ledger row.** Move `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` from `BACKLOG.md`
      to `BACKLOG-archive.md`, rewriting its status line to `CLOSED 2026-08-28
      (feat/speclint-table-provenance), DEMOTED ON A MEASURED REFUTATION`, dropping the `IN PROGRESS`
      and `Branch:` fields in the same edit, and carrying the corrected recurrence count into the
      archive entry (the row's own title says "four arcs"; the measurement says eleven).

      **The suites alone do not decide this, which plan review round 1 finding 1 is right about.**
      `_metaLedgerInProgress` passes on the merge-base state, passes on the current state, and passes
      if the row simply stays in `BACKLOG.md` with its marker deleted; it only fails in the forbidden
      intermediate. So the task carries an explicit four-part check, and every part must hold at the
      SAME commit:

      ```
      # 1. absent from the open ledger, present in the archive
      git show HEAD:BACKLOG.md         | grep -c 'BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE'   # expect 0
      git show HEAD:BACKLOG-archive.md | grep -c 'BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE'   # expect >=1
      # 2. the archived entry carries NO flight field (invariant 12: archives reject in-flight work)
      git show HEAD:BACKLOG-archive.md | awk '/^## BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE/,/^## [^B]/' \
        | grep -cE 'IN PROGRESS|\*\*Branch:\*\*|\*\*PR:\*\*'                                # expect 0
      # 3. atomicity: the SAME commit both removed it from BACKLOG.md and added it to the archive
      git show --stat --name-only HEAD | grep -c '^BACKLOG.md$'                                # expect 1
      git show --stat --name-only HEAD | grep -c '^BACKLOG-archive.md$'                        # expect 1
      # 4. the corrected count reached the archive entry
      git show HEAD:BACKLOG-archive.md | awk '/^## BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE/,/^## [^B]/' \
        | grep -c 'eleven arcs\|11 arcs'                                                      # expect >=1
      ```

      red, and it is a real red rather than a described one: before the change, check 1's first command
      returns 1 and its second returns 0 — the row is in the open ledger and not the archive.
      green: all four checks return their expected values, AND
      `pnpm vitest run --no-file-parallelism tests/docs/_metaLedgerInProgress.test.ts
      tests/docs/_metaLedgerReferentialIntegrity.test.ts` passes, the second proving every citation of
      the archived row still resolves.

- [ ] **2. Closeout.** Record the gate results in this plan's §12 and confirm the invariant-8 marker.

## Verification surface

Docs-only, so the surface is the gates that walk this corpus plus explicit commands for the criteria
no suite decides. **Four criteria had no deciding command in the first draft** (plan review round 1
findings 2, 3 and 4); each now names one that would fail if the thing it checks were wrong. Every
command below is RUN, not resolved by reading.

| criterion | command that decides it | why this one |
| --- | --- | --- |
| AC-1 | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-28-table-provenance-census.mts --at 8b4d521cac00` | reproduces the population figures; exits 0 |
| AC-2, default branch | the same command | reads at the rev, not the working tree |
| AC-2, **missing-value branch** | `pnpm exec tsx docs/…/2026-08-28-table-provenance-census.mts --at; echo $?` — expect the error line and **exit 2** | the `--at 8b4d521cac00` run CANNOT observe this branch, so a regression silently defaulting to `HEAD` would leave it green |
| AC-3, spec index | `tests/docs/specsReadmeIndexParity.test.ts` | walks `docs/superpowers/specs/*/README.md` |
| AC-3, **census index** | `grep -c '2026-08-28-table-provenance-census.mts' docs/superpowers/specs/ci/probes/README.md` — expect 1 | that suite reads only ONE level below `specs/`, so it never opens the probes README one level deeper; the census row is otherwise unguarded |
| AC-3, **plan index** | `grep -c '2026-08-28-table-provenance.md' docs/superpowers/plans/ci/README.md` — expect 1 | no suite covers the plans index at all |
| AC-4 | `python3` one-liner over `docs/review-rounds/LIMITS.md`: assert the declared arc count equals the number of enumerated per-arc entries and that their round counts sum to the declared total | the count and the enumeration drifted apart once already in this arc |
| AC-5 | `grep -c 'named by eleven arcs' docs/superpowers/specs/ci/probes/README.md` — expect 1 | the cross-reference carried a stale "four arcs" through two rounds |
| AC-6 | task 1's four-part check above, plus `tests/docs/_metaLedgerInProgress.test.ts` and `tests/docs/_metaLedgerReferentialIntegrity.test.ts` | the suites alone accept three states; the check pins the one that is correct |
| AC-7 | `tests/docs/_metaReviewRoundEconomy.test.ts` | declared count, `**Examined:**`, and a `Mechanizable:` entry with a `declined:` reason |
| all | `pnpm spec:lint` on both spec and plan; `pnpm typecheck`; `pnpm format:check` | citations resolve, the `.mts` compiles, prettier clean |

**A syntactic gate cannot decide whether a filing's prose contradicts the spec.** Plan review round 1
finding 5 found exactly that: `_metaReviewRoundEconomy` returned zero problems on a `declined:` reason
that misstated the ratified convention and repeated a claim round 5 had withdrawn. That is review's
class, not a gate's, and it is recorded here so the next arc does not read a green corpus check as
proof the prose is right.

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
