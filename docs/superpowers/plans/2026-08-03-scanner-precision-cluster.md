# Plan — scanner precision cluster

**Spec:** `docs/superpowers/specs/2026-08-03-scanner-precision-cluster-design.md` (canonical; this plan implements it and does not override it).
**Branch:** `chore/scanner-precision-cluster` (worktree off `origin/main` at `369bfcce0`).
**Preflight:** RUN, not skipped. `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight` all green at Stage 0 (`preflight: env ✓ local DB ✓`). This branch touches `lib/`, `scripts/`, and `tests/`, so the docs-only skip does not apply.

impeccable-gate: N/A — no UI surface

Neither item touches `app/` outside `app/api/**`, `components/`, an `app/globals.css` `@theme` block, `DESIGN.md`, or `tailwind.config.*`. The generator reads `app/` as scan input; it does not edit it.

---

## Meta-test inventory

**CREATES one guard, in two files** — the core/guard split the repo already uses for
`tests/docs/_invariant8Closeout.ts` + `tests/docs/_metaInvariant8Closeout.test.ts`:

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- `lib/messages/__internal__/parseWarningSites.ts` — the pure recognizer (R1/R2/R3 of spec §3.1),
  shared by the generator and the guard's G1 arm. Lives beside
  `lib/messages/__internal__/stripLogEmissionCalls.ts` and
  `lib/messages/__internal__/walkSourceFiles.ts`, so `scripts/extract-internal-code-enums.ts` can
  import it through the existing `@/` alias exactly as it already imports those two
  (`scripts/extract-internal-code-enums.ts:5-6`).
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- `tests/messages/_metaParseWarningSiteCoverage.test.ts` — the guard (spec §3.5), both arms, plus
  the mutation families below.

**Wiring, verified against the config, not assumed:** `vitest.projects.ts` picks up
`tests/messages/**/*.test.ts`, so no config task is needed. Confirmed by Task 0's sweep.

**EXTENDS two existing registries:**

- `tests/dev/attentionScenariosWarnings.test.ts` — the residue test at
  `tests/dev/attentionScenariosWarnings.test.ts:33-40` is deleted and the membership assertion of
  AC-A4 replaces it; `generatedWarningCodes()`
  (`tests/dev/attentionScenariosWarnings.test.ts:19-23`) changes filter.
- `tests/docs/_metaLedgerReferentialIntegrity.test.ts` — eight `KNOWN_DANGLING` rows deleted
  (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:92`), `definedIds()`
  (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:124`) unions in body-defined ids, and the
  P1–P6 plants land beside the existing synthetic-corpus cases.

**Declared not applicable:** Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`) — no
Supabase call is added. Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no
`pg_advisory*` surface is touched, so the invariant-2 holder enumeration is vacuous.
Mutation-surface observability (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route
handler and no `"use server"` action is added, changed, or deleted. Admin-alert catalog
(`tests/messages/_metaAdminAlertCatalog.test.ts`) — no `admin_alerts` code is added or removed; the
generator's admin-alerts pass is untouched.

---

## Mutation-family closure (guard surfaces)

Per the round-economy rule, this is the closure set the review converges against. A reviewer-proposed
NEW family is admissible only with a **live escaping mutant demonstrated against the shipped guard**.

**Item A guard — families the two arms must catch:**

| # | Family | Caught by | Plant |
| --- | --- | --- | --- |
| A-a | Emitter in a directory outside the generator's roots | G1 | fixture file under a synthetic root |
| A-b | Factory named neither `warn` nor `warning` (e.g. `mkWarn`, `pw`) | G2 (return-type discovery) | AC-A6 |
| A-c | `code: IDENT` where IDENT resolves to no const binding | G2 (unresolved-identifier failure) | synthetic source |
| A-d | New severity-adjacent literal inside the roots, absent from the generated enum | G2 | stale-enum fixture |
| A-e | Emitter using `severity: "info"` rather than `"warn"` | R1 accepts both members of the union (`lib/parser/types.ts:68`) | synthetic source |

**Item B guard — families:** the six plants P1–P6 of spec §4.2 ARE the family enumeration
(strong-wrapping-code lead, strong-plain lead, code-span lead, non-lead strong, non-ledger file,
non-resolving parent).

---

## Task 0 — reconciliation sweeps, authored AND RUN

Per the writing-plans rule these are run at plan-authoring time with their output recorded, not
described as future work.

**Sweep 1 — every `EXTRA_WARNING_CODES` reference (Task 1 must reconcile all of them).**

```
$ rg -n 'EXTRA_WARNING_CODES' --glob '!docs/**' .
lib/dev/attentionScenarios/tier1.ts:131   export const EXTRA_WARNING_CODES: readonly string[] = [
lib/dev/attentionScenarios/tier1.ts:142     return [...new Set([...generated, ...EXTRA_WARNING_CODES])].sort();
tests/dev/attentionScenariosWarnings.test.ts:7      EXTRA_WARNING_CODES,
tests/dev/attentionScenariosWarnings.test.ts:36     expect(EXTRA_WARNING_CODES.length).toBeGreaterThan(0);
tests/dev/attentionScenariosWarnings.test.ts:37     for (const code of EXTRA_WARNING_CODES) {
BACKLOG.md:104, BACKLOG.md:108                      the backlog entry's own prose
```

Disposition: the five code hits removed in Task 1; the `tier1.ts:114-130` comment block above the
export goes with them (its rationale is refuted by spec §2.2). The two `BACKLOG.md` hits are the
entry being graduated in Task 3 — they leave `BACKLOG.md` with it, which is why this sweep is run
before Task 3 rather than after.

**Sweep 2 — every exact-equality filter on `parse_warnings.code` (Task 1 must change both).**

```
$ rg -n 'source === "parse_warnings.code"' --glob '!docs/**' .
lib/dev/attentionScenarios/tier1.ts:140          .filter(([, v]) => v.source === "parse_warnings.code")
tests/dev/attentionScenariosWarnings.test.ts:21    .filter(([, v]) => (v as { source: string }).source === "parse_warnings.code")
```

Disposition: both become `.split(",").includes("parse_warnings.code")`. Note
`tests/messages/inlineLaterGroupCopy.test.ts:128-131` also names that string, but it pins a
specific code's provenance with `.toBe(...)` rather than selecting the gallery set; it is left
alone, and Task 1's green step confirms it still passes.

**Sweep 3 — the eight `KNOWN_DANGLING` rows Task 2 deletes.**

```
$ rg -n 'BL-MUTATION-(REF-SUB|UNICODE|COLUMN-SHIFT|MERGED-CELL|SECTION-ORDER)|BL-SYNCFEED-UI-[123]' \
    tests/docs/_metaLedgerReferentialIntegrity.test.ts
93,95,97,99,101   the five BL-MUTATION-* rows
105,107,109       the three BL-SYNCFEED-UI-* rows
```

Disposition: all eight deleted in Task 2. `BL-RESOLVED` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:103`) stays — spec §1.

**Sweep 4 — every consumer of the generator or its artifact.** Run wide on purpose; the first
draft of this plan guessed "two hits" and was wrong by eleven.

```
$ rg -ln 'extract-internal-code-enums|extractInternalCodeEnums|INTERNAL_CODE_ENUMS' --glob '!docs/**' .
package.json                                            gen:internal-code-enums script
scripts/extract-internal-code-enums.ts                  the file itself
lib/messages/__generated__/internal-code-enums.ts       the artifact
lib/dev/attentionScenarios/tier1.ts                     gallery consumer — Task 1 edits
tests/cross-cutting/no-raw-codes.test.ts                ** binding, see below **
tests/cross-cutting/no-raw-codes-audit.ts               ** binding, see below **
tests/cross-cutting/cron-run-summary-scanner-safety.ts  ** binding, see below **
tests/messages/inlineLaterGroupCopy.test.ts             provenance pin — Sweep 2
tests/dev/attentionScenariosWarnings.test.ts            gallery test — Task 1 edits
tests/parser/d1-empty-section-warning.test.ts           comment reference only
lib/cron/runSummary.ts, lib/parser/warnings.ts,
lib/onboarding/rescanReviewCode.ts, lib/sync/runPushSyncForShow.ts,
lib/sync/applyStagedCore.ts                             comment references only
```

**Two bindings this change must satisfy, both pre-existing guards:**

1. **`tests/cross-cutting/cron-run-summary-scanner-safety.test.ts`** asserts `CRON_RUN_SUMMARY`
   never reaches the extracted manifest. Today that holds because `lib/cron/runSummary.ts:1-3`
   deliberately keeps the file free of message-catalog keywords, i.e. it relies on the **content
   predicate** this plan removes from the parse-warnings pass. Verified it still holds under
   construction-site scoping for a different and stronger reason: `CRON_RUN_SUMMARY`
   (`lib/cron/runSummary.ts:4`) is a bare `export const`, not a `code:` key and not
   severity-adjacent, so R1 does not match it and R3 only resolves identifiers that already sit at
   an R1 site. Task 1's green step runs this test explicitly.
2. **`tests/cross-cutting/no-raw-codes.test.ts:34`** asserts
   `expect(INTERNAL_CODE_ENUMS).toEqual(extracted)` — the committed artifact must equal a fresh
   extraction. This is what makes AC-A7 (regenerate and commit in the same commit) machine-enforced
   rather than a convention. The same file's `buildForbiddenCodeIndex`
   (`tests/cross-cutting/no-raw-codes-audit.ts:14`) sources forbidden codes partly from
   `INTERNAL_CODE_ENUMS`, so the seven newly-captured codes become newly-forbidden in user-visible
   strings. Swept: the only `app/` or `components/` occurrences of any of the seven are
   `components/admin/PerShowActionableWarnings.tsx:153` and `components/diagrams/Gallery.tsx:27`,
   **both inside comments**, which the ts-morph audit does not scan. No new violation.

---

## Task 1 — Item A: construction-site scoping, residue deletion, guard

**RED.** Write, in this order, and confirm each fails for the stated reason before writing any
implementation:

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
1. `tests/messages/parseWarningSites.test.ts` — unit tests for the recognizer against **synthetic
   sources**, not the live tree, so the proof does not depend on the repo happening to contain an
   instance. One case per rule and per mutation family A-a…A-e. Concrete failure modes caught:
   - R1 accepts `{ severity: "warn", code: "X" }` and `{ severity: "info", code: "X" }`; **rejects**
     `{ code: "X" }` with no severity sibling, and rejects a `severity:` in a *different* object at
     the same textual distance (the brace-scoping proof — a proximity-window implementation passes
     the first and fails this one).
   - R2 discovers `mkWarn` from `function mkWarn(...): ParseWarning` and matches
     `mkWarn("X", …)`; does **not** match `notMkWarn("X", …)` (the word-boundary proof) and does
     not match `log.warn("X", …)` (strip proof).
   - R3 resolves `code: SOME_CONST` against `const SOME_CONST = "X"`; an unresolved identifier is
     **reported**, not dropped.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
2. `tests/messages/_metaParseWarningSiteCoverage.test.ts` — G1 and G2 (spec §3.5). Anti-tautology:
   G2's recognizer is written independently in that file and must NOT import the shared recognizer
   module; the test asserts the two disagree on nothing over the real tree, which is
   only meaningful because they are separate implementations.
3. Extend `tests/dev/attentionScenariosWarnings.test.ts` with AC-A4: all four former residue codes
   present, sourced from the generator alone.

Expected RED reasons: (1) and (2) fail on a missing module; (3) fails because
`AGENDA_SCHEDULE_LOW_CONFIDENCE` is absent from the generated enum once `EXTRA_WARNING_CODES` is
gone.

**GREEN.** Implement:

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- `lib/messages/__internal__/parseWarningSites.ts` — R1/R2/R3 per spec §3.1. The brace walk is
  string-, template-literal- and comment-aware, mirroring the posture of
  `lib/messages/__internal__/stripLogEmissionCalls.ts` (conservative: on an unbalanced brace, stop
  and return what is known rather than corrupt the scan).
- `scripts/extract-internal-code-enums.ts:70-74` — the parse-warnings pass calls the recognizer over
  roots `["lib", "app"]` minus `lib/dev/**`. The other three passes are untouched.
- `lib/dev/attentionScenarios/tier1.ts` — delete `EXTRA_WARNING_CODES`
  (`lib/dev/attentionScenarios/tier1.ts:131`) and its comment
  (`lib/dev/attentionScenarios/tier1.ts:114-130`); the `warningCodes()` filter
  (`lib/dev/attentionScenarios/tier1.ts:140`) becomes membership.
- `tests/dev/attentionScenariosWarnings.test.ts` — delete the residue import
  (`tests/dev/attentionScenariosWarnings.test.ts:7`) and the residue test
  (`tests/dev/attentionScenariosWarnings.test.ts:33-40`); the `generatedWarningCodes()` filter
  (`tests/dev/attentionScenariosWarnings.test.ts:21`) becomes membership.
- Run `pnpm gen:internal-code-enums` and commit the regenerated
  `lib/messages/__generated__/internal-code-enums.ts` in the same commit (AC-A7).

**Verify.** AC-A1 (54 codes), AC-A2 (none of the eleven false positives carries the provenance),
AC-A3 (`rg EXTRA_WARNING_CODES` is empty outside `docs/`), AC-A4, AC-A5, AC-A6.

**Commit.** `feat(messages): scope the parse-warning scan to construction sites, drop the residue`

---

## Task 2 — Item B: body-defined ledger ids

**RED.** Extend `tests/docs/_ledgerMdast.walker.test.ts` (the existing synthetic-corpus walker
suite) with plants P1–P6 of spec §4.2, each against a synthetic ledger string. Concrete failure
modes caught, stated per the anti-tautology rule:

- P3 catches a recognizer keyed on "bullet lead with a code span" — which would let
  `BACKLOG.md:91` define the five ids it merely enumerates, from the wrong parent.
- P4 catches a recognizer that scans the whole bullet rather than its first child — which would let
  an entry define any sibling id it discusses.
- P5 catches a recognizer applied outside `LEDGERS` — which would let a typo in a plan define
  itself and make the guard decorative.
- P6 catches a recognizer that walks list items without keying them to a resolving entry.

Expected RED: `bodyDefinedIds` does not exist.

**GREEN.** Implement `bodyDefinedIds(text, opts)` in `tests/docs/_ledgerMdast.ts` per spec §4.1,
built on `extractEntries` (`tests/docs/_ledgerMdast.ts:302`). Union it into `definedIds()`
(`tests/docs/_metaLedgerReferentialIntegrity.test.ts:124`). Delete the eight `KNOWN_DANGLING` rows
(Sweep 3).

**Verify.** AC-B1, AC-B2, AC-B3. The guard's existing stale-row ratchet is the check that the eight
deletions were required rather than optional — leaving any of them fails.

**Commit.** `fix(docs): let a ledger entry define sub-item ids in its body`

---

## Task 3 — backlog graduation

Move `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` and `BL-LEDGER-GUARD-BODY-DEFINED-IDS` from `BACKLOG.md` to
`BACKLOG-archive.md` at their terminal state, and add a new leading segment to the
`Last reconciled:` line (`BACKLOG.md:7`). Add both ids to `BACKLOG_GRADUATED` in
`tests/docs/_metaDeferralLedgerGraduation.test.ts`.

**Ordering note that matters:** `BL-LEDGER-GUARD-BODY-DEFINED-IDS`'s body contains the
`BACKLOG.md:91-92` bullets that enumerate the eight ids as **code spans, not strong** — so under
Task 2's rule that entry defines nothing, and moving it to the archive changes no definition.
Task 2's plants must land before this move so the property is pinned independently of the entry's
location.

**Rebase conflict is expected** — two sibling panes are graduating other rows from the same file.
Resolve by keeping BOTH sides; the entries are disjoint and the `Last reconciled:` line
concatenates.

**Commit.** `docs(backlog): graduate the two scanner-precision entries`

---

## Task 4 — full local gate

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (AC-C1). The full suite, not scoped
runs — scoped gates miss regressions, and this change edits a generated artifact consumed across
`tests/messages/**` and `tests/dev/**`.

Also re-run `pnpm spec:lint` on the spec and this plan.

---

## Task 5 — adversarial review (cross-model), CI, merge

Whole-diff Codex review to APPROVE. Then push, real CI green (not just local), `gh pr merge
--merge`, and fast-forward local `main` until
`git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## 12. Close-out

**impeccable-gate: N/A — no UI surface.**
