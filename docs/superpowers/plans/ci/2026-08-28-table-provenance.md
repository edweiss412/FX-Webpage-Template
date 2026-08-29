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
      (feat/speclint-table-provenance), DEMOTED ON A MEASURED REFUTATION` and dropping the `IN
      PROGRESS` / `Branch:` fields in the same edit. Carry the corrected recurrence count into the
      archive entry, since the row's own title says "four arcs" and the measurement says eleven.

      red: `pnpm vitest run --no-file-parallelism tests/docs/_metaLedgerInProgress.test.ts` fails
      while an archived entry still declares in-flight work.
      green: that suite plus `tests/docs/_metaLedgerReferentialIntegrity.test.ts` pass, the second
      proving every citation of the archived row still resolves.

- [ ] **2. Closeout.** Record the gate results in this plan's §12 and confirm the invariant-8 marker.

## Verification surface

Docs-only, so the surface is the gates that walk this corpus rather than a citation table over source.
Every one below is RUN, not resolved by reading.

| gate | what it decides for this arc | when |
| --- | --- | --- |
| `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-28-table-provenance-census.mts --at 8b4d521cac00` | AC-1, AC-2 | every task |
| `pnpm spec:lint docs/superpowers/specs/ci/2026-08-28-table-provenance.md` | citations resolve, no hard findings | every task |
| `tests/docs/specsReadmeIndexParity.test.ts` | AC-3 | every task |
| `tests/docs/_metaLedgerInProgress.test.ts` | AC-6, and that no archive holds in-flight work | after task 1 |
| `tests/docs/_metaLedgerReferentialIntegrity.test.ts` | every citation of the archived row still resolves | after task 1 |
| `tests/docs/_metaLedgerMintBar.test.ts` | the row's `Facing` and `Mint-exception` fields | every task |
| `tests/docs/_metaInvariant8Closeout.test.ts` | the closeout marker grammar | every task |
| `tests/docs/_metaReviewRoundEconomy.test.ts` | AC-7, corpus contiguity and the threshold filing | every task |
| `pnpm typecheck`, `pnpm format:check` | the `.mts` compiles; prettier clean | before push |

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
