# Plan — scanner precision cluster

**Spec:** `docs/superpowers/specs/2026-08-03-scanner-precision-cluster-design.md` (canonical; this plan implements it and does not override it).
**Branch:** `chore/scanner-precision-cluster` (worktree off `origin/main` at `369bfcce0`).
**Preflight:** RUN, not skipped. `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight` all green at Stage 0 (`preflight: env ✓ local DB ✓`). This branch touches `lib/`, `scripts/`, and `tests/`, so the docs-only skip does not apply.

impeccable-gate: N/A — no UI surface

Neither item touches `app/` outside `app/api/**`, `components/`, an `app/globals.css` `@theme` block, `DESIGN.md`, or `tailwind.config.*`. The generator reads `app/` as scan input; it does not edit it.

---

## Meta-test inventory

**CREATES one recognizer plus one guard:**

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- `lib/messages/__internal__/parseWarningSites.ts` — the type-aware recognizer (spec §3.1), shared
  by the generator and the guard's G1 arm. Lives beside
  `lib/messages/__internal__/stripLogEmissionCalls.ts` and
  `lib/messages/__internal__/walkSourceFiles.ts`, so `scripts/extract-internal-code-enums.ts`
  imports it through the existing `@/` alias exactly as it already imports those two
  (`scripts/extract-internal-code-enums.ts:5-6`).
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- `tests/messages/_metaParseWarningSiteCoverage.test.ts` — the guard (spec §3.4), both arms, plus
  the mutation families below.

**ts-morph, not regex.** `ts-morph` is an existing devDependency (`package.json:131`) with three
in-repo precedents: `lib/audit/noGlobalCursor.ts`, `tests/cross-cutting/no-raw-codes-audit.ts:247`,
and the ratified `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md`.
**Single compiler world** — ts-morph wrappers and its exported `ts` namespace only; the standalone
`typescript` package is never imported (that spec's §5.1 F3).

**Wiring, verified against the config:** `vitest.projects.ts:89` picks up
`tests/messages/**/*.test.{ts,tsx}`, so no config task is needed.

**EXTENDS three existing registries:**

- `tests/dev/attentionScenariosWarnings.test.ts` — residue test at
  `tests/dev/attentionScenariosWarnings.test.ts:33-40` deleted, AC-A4 replaces it;
  `generatedWarningCodes()` (`tests/dev/attentionScenariosWarnings.test.ts:19-23`) changes filter.
- `tests/docs/_metaLedgerReferentialIntegrity.test.ts` — eight `KNOWN_DANGLING` rows deleted
  (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:95`), `definedIds()`
  (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:127`) unions in body-defined ids.
- `tests/docs/_ledgerMdast.walker.test.ts` — plants P1–P4 and P6–P8. **P5, P5-live and P5-sole live in `tests/docs/_metaLedgerReferentialIntegrity.test.ts`** instead: all three are about file scoping, which `bodyDefinedIds(text, opts)` cannot see.

**Declared not applicable:** Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`) — no
Supabase call added. Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no
`pg_advisory*` surface touched, so the invariant-2 holder enumeration is vacuous. Mutation-surface
observability (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route handler and no
`"use server"` action added, changed, or deleted. Admin-alert catalog
(`tests/messages/_metaAdminAlertCatalog.test.ts`) — no `admin_alerts` code added or removed.

---

## Mutation-family closure (guard surfaces)

This is the closure set the review converges against. A reviewer-proposed NEW family is admissible
only with a **live escaping mutant demonstrated against the shipped guard**. Families A-b and A-c
below exist because R1 demonstrated exactly such mutants against the previous syntactic design.

**Item A — every family must be exercised as a fixture, and each must FAIL a syntactic recognizer
while PASSING the type-aware one:**

| # | Family | Closed by | AC |
| --- | --- | --- | --- |
| A-a | Emitter in a directory outside the generator's roots (production tree only — `tests/**` etc. excluded, or G1 is vacuous) | G1 root coverage | AC-A1 |
| A-h | `Object.assign({severity},{code},{message})` — no single argument assignable | call-expression site kind | AC-A5 |
| A-i | Warning passed where the contextual type is a UNION (`ParseWarning \| Alert`) | contextual-OR-intrinsic assignability | AC-A6 |
| A-j | Class construction (`new WarningClass()`) | `new` site kind; signals, never silent | AC-A7 |
| A-k | Warning COPY (`{...w, message}`) with no own `code` | COPY classification | AC-A1 |
| A-l | Spread whose RESULT type preserves a literal code | code read off the OWN type | AC-A5 |
| A-m | Declaration-only `const` factory / callback-parameter factory | USE test requires a body — signals | AC-A7 |
| A-n | `await asyncFactory()` | `await` is a site kind | AC-A7 |
| A-o | Object spread INTO a warning (contextual-only selection) | FRAGMENT classification | AC-A1 |
| A-p | `any`-sourced spread supplying the code (FRAGMENT swallow) | capture-link: enclosing warning site required | AC-A10 |
| A-q | `unknown` JSON validated then spread (COPY swallow) | capture-link: spread source must be warning-typed, not `any`/`unknown` | AC-A10 |
| A-r | Factory passed to `.map` — zero DIRECT call sites (FACTORY_BODY swallow) | capture-link: >=1 direct resolving call site | AC-A10 |
| A-s | Validate-and-return factory whose body has no recognized site (USE swallow) | capture-link: callee body must have produced a captured code | AC-A10 |
| **A-Z** | **Any shape not listed above** | **fail-closed default: SIGNALS**, and no classification can swallow it because every skip is capture-linked in pass 2 | AC-A7 |
| A-b | Factory whose return type is spelled indirectly (`Alias["warnings"][number]`) | type-based site recognition | **AC-A5** |
| A-c | `severity` supplied by a typed const rather than a literal | type-based site recognition | **AC-A6** |
| A-d | Shorthand `code` whose type is a union of string literals | code extraction reads the *type* | AC-A5 |
| A-e | `code` widened to `string`, codes only at call sites | call-site argument resolution | AC-A1 |
| A-f | `code` resolvable to no literal at all | **reported and fails** — never dropped | **AC-A7** |
| A-g | `severity: "info"` rather than `"warn"` | both are members of the union (`lib/parser/types.ts:68`) | AC-A1 |

**Item B — the plant set scheduled in Task 2's RED step (spec §4.2, §4.2a) IS the family
enumeration.** P7/P8 exist because R1 demonstrated the intervening-non-id-heading mutant;
**P5-live** because R4b demonstrated a widened-default mutant; **P5-sole** because the §4.2a
re-analysis found nothing pinned that `bodyDefinedIds` has no second production caller.

---

## Task 0 — reconciliation sweeps, RUN not described

**Sweep 1 — every `EXTRA_WARNING_CODES` reference.**

```
$ rg -n 'EXTRA_WARNING_CODES' --glob '!docs/**' .
lib/dev/attentionScenarios/tier1.ts:131   export const EXTRA_WARNING_CODES: readonly string[] = [
lib/dev/attentionScenarios/tier1.ts:142     return [...new Set([...generated, ...EXTRA_WARNING_CODES])].sort();
tests/dev/attentionScenariosWarnings.test.ts:7      EXTRA_WARNING_CODES,
tests/dev/attentionScenariosWarnings.test.ts:36     expect(EXTRA_WARNING_CODES.length).toBeGreaterThan(0);
tests/dev/attentionScenariosWarnings.test.ts:37     for (const code of EXTRA_WARNING_CODES) {
BACKLOG.md:104, BACKLOG.md:108                      the backlog entry's own prose
```

Disposition: the five code hits removed in Task 1, with the
`lib/dev/attentionScenarios/tier1.ts:114-130` comment block. The two `BACKLOG.md` hits leave with
the entry in Task 3.

**Sweep 2 — every exact-equality filter on `parse_warnings.code`.**

```
$ rg -n 'source === "parse_warnings.code"' --glob '!docs/**' .
lib/dev/attentionScenarios/tier1.ts:140          .filter(([, v]) => v.source === "parse_warnings.code")
tests/dev/attentionScenariosWarnings.test.ts:21    .filter(([, v]) => (v as { source: string }).source === "parse_warnings.code")
```

Disposition: both become `.split(",").includes("parse_warnings.code")`.
`tests/messages/inlineLaterGroupCopy.test.ts:128-131` names the same string but pins a code's
provenance with `.toBe(...)`; left alone, confirmed still passing in Task 1's green step.

**Sweep 3 — the eight `KNOWN_DANGLING` rows Task 2 deletes.**

```
$ rg -n '<the five mutation ids>|<the three syncfeed ids>' tests/docs/_metaLedgerReferentialIntegrity.test.ts
96, 98, 100, 102, 104   the five mutation-family rows
108, 110, 112           the three syncfeed-ui rows
```

`BL-RESOLVED` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:106`) stays — spec §1.

**Sweep 4 — every consumer of the generator or its artifact.** Authored guessing "two hits"; the
run returned thirteen, which is why it is recorded rather than described.

```
$ rg -ln 'extract-internal-code-enums|extractInternalCodeEnums|INTERNAL_CODE_ENUMS' --glob '!docs/**' .
package.json                                             gen:internal-code-enums script
scripts/extract-internal-code-enums.ts                   the file itself
lib/messages/__generated__/internal-code-enums.ts        the artifact
lib/dev/attentionScenarios/tier1.ts                      gallery consumer — Task 1 edits
tests/cross-cutting/no-raw-codes.test.ts                 ** binding, below **
tests/cross-cutting/no-raw-codes-audit.ts                ** binding, below **
tests/cross-cutting/cron-run-summary-scanner-safety.test.ts  ** binding, below **
tests/messages/inlineLaterGroupCopy.test.ts              provenance pin — Sweep 2
tests/dev/attentionScenariosWarnings.test.ts             gallery test — Task 1 edits
tests/parser/d1-empty-section-warning.test.ts            comment reference only
lib/cron/runSummary.ts, lib/parser/warnings.ts,
lib/onboarding/rescanReviewCode.ts, lib/sync/runPushSyncForShow.ts,
lib/sync/applyStagedCore.ts                              comment references only
```

**Three bindings this change must satisfy:**

1. **`tests/cross-cutting/cron-run-summary-scanner-safety.test.ts`** asserts `CRON_RUN_SUMMARY`
   never reaches the manifest. Today that holds because `lib/cron/runSummary.ts:1-3` deliberately
   keeps the file free of message-catalog keywords — i.e. it relies on the **content predicate**
   this plan removes. Verified it still holds, for a stronger reason: `CRON_RUN_SUMMARY`
   (`lib/cron/runSummary.ts:4`) is a bare `export const`, not an expression assignable to
   `ParseWarning`. AC-A9 pins this.
2. **`tests/cross-cutting/no-raw-codes.test.ts:34`** asserts `INTERNAL_CODE_ENUMS` equals a fresh
   extraction — this makes AC-A8 machine-enforced rather than a convention.
3. **`buildForbiddenCodeIndex`** (`tests/cross-cutting/no-raw-codes-audit.ts:14`) sources forbidden
   codes partly from `INTERNAL_CODE_ENUMS`, so the eleven newly-captured codes become newly
   forbidden in user-visible strings. Swept: the only `app/` or `components/` occurrences of any of
   the eleven are `components/admin/PerShowActionableWarnings.tsx:153` and
   `components/diagrams/Gallery.tsx:27`, **both inside comments**, which the ts-morph audit does not
   scan. Task 1's green step re-runs the audit to confirm.

---

## Task 1 — Item A: type-aware construction-site recognition

**RED**, in this order, each confirmed failing for the stated reason before any implementation:

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
1. `tests/messages/parseWarningSites.test.ts` — recognizer unit tests against **in-memory ts-morph
   fixtures**, not the live tree, so each proof stands on its own rather than on the repo happening
   to contain an instance. One case per family A-a…A-g. The two load-bearing ones:
   - **A-b (AC-A5)** a factory returning `Alias["warnings"][number]` with a union-typed `code`
     parameter. Failure mode caught: a recognizer keyed on the written return type. R1 proved this
     mutant escapes the syntactic design, so this case must be red before the fix and green after.
   - **A-c (AC-A6)** `{ severity: WARN_SEVERITY, code: "X", message: "y" }` with
     `const WARN_SEVERITY: ParseWarning["severity"] = "warn"`. Failure mode caught: a recognizer
     requiring a literal `severity`.
   - **A-f (AC-A7)** a site whose `code` resolves to no literal — asserts it is **reported by name**,
     not silently dropped.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
2. `tests/messages/_metaParseWarningSiteCoverage.test.ts` — G1 and G2 (spec §3.4).
3. Extend `tests/dev/attentionScenariosWarnings.test.ts` with AC-A4.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**GREEN.** Implement `lib/messages/__internal__/parseWarningSites.ts` per spec §3.1; point the
generator's parse-warnings pass (`scripts/extract-internal-code-enums.ts:70-74`) at it over roots
`["lib", "app"]` minus `lib/dev/**` — the other three passes untouched; delete
`EXTRA_WARNING_CODES` and its comment; change both filters to membership (Sweep 2); run
`pnpm gen:internal-code-enums` and commit the regenerated artifact in the same commit.

**Verify.** AC-A1 (58 codes, zero lost vs the 47, exactly the 11 gained), AC-A2, AC-A3, AC-A4,
AC-A5, AC-A6, AC-A7, AC-A8, AC-A9. Plus the three Sweep-4 bindings.

**Cost, measured (spec §3.5).** Project load 38.7 s; full extraction 64.5 s. A narrowed project is
worse (77.9 s) — refuted, not merely unchosen. Memoization alone does NOT fix the suite cost:
`vitest.config.ts` rejects `isolate: false`, so every extracting test FILE is its own process.
**This task therefore makes the guard file the single extractor** and moves the artifact-parity
assertion from `tests/cross-cutting/no-raw-codes.test.ts:34` into it, and rewrites
`tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` to assert against the committed
artifact (safe precisely because parity is asserted in the same run). One 64.5 s extraction in the
suite instead of three. Measure and record the real delta.

**Commit.** `feat(messages): recognize parse-warning sites by type, not spelling`

---

## Task 2 — Item B: body-defined ledger ids

**RED.** Extend `tests/docs/_ledgerMdast.walker.test.ts` with plants P1–P4 and P6–P8 (spec §4.2)
against synthetic ledgers, and `tests/docs/_metaLedgerReferentialIntegrity.test.ts` with **P5 and
P5-live**, which need the file-scoping seam. Failure modes caught, per the anti-tautology rule:

- **P3** — a code-span-lead rule would let `BACKLOG.md:79` define the five ids it merely
  enumerates, from the wrong parent.
- **P4** — a whole-bullet scan would let an entry define any sibling id it discusses.
- **P5** — applying the rule outside `LEDGERS` would let a typo in a plan define itself. **This
  plant does NOT go in the walker test**: `bodyDefinedIds(text, opts)` sees only markdown, so the
  same text cannot behave two ways. It goes in
  `tests/docs/_metaLedgerReferentialIntegrity.test.ts` against the newly exported
  `definedIds(ledgers, read)` seam, with an injected `read` and a **paired control** — the same
  P1 markdown resolves when its file is in `ledgers` and does not when it is not. R2b caught this
  as HIGH: without the seam, AC-B2 could only be satisfied tautologically.
- **P6** — walking list items without keying them to a resolving entry.
- **P7/P8** — the R1 mutant: bullets after an intervening **non-id** heading belong to that
  section, not to the entry whose body span swallows them. P8 uses the real
  `BACKLOG-archive.md:1094-1096` shape with its headings removed in-memory.

**GREEN.** Export `definedIds(ledgers, read)` from
`tests/docs/_metaLedgerReferentialIntegrity.test.ts` with the injectable shape `citedIds` already
uses (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:240-244`), then implement
`bodyDefinedIds(text, opts)` in `tests/docs/_ledgerMdast.ts` per spec §4.1
(ledger-only, first-child-of-first-paragraph, stop at first heading), built on `extractEntries`
(`tests/docs/_ledgerMdast.ts:302`). Union into `definedIds()`. Delete the eight `KNOWN_DANGLING`
rows.

**Verify.** AC-B1, AC-B2 (**every plant scheduled in the RED step above** — each is a prior round's
regression test, and omitting one is precisely the failure R4b, R5b and R6b each caught), AC-B3 (exactly 8 over the live ledgers, not
11), AC-B4. The guard's
existing stale-row ratchet is what proves the eight deletions were required rather than optional.

**Commit.** `fix(docs): let a ledger entry define sub-item ids in its own body`

---

## Task 3 — backlog graduation

Move both entries to `BACKLOG-archive.md`; add a new leading segment to `BACKLOG.md:7`; add both
ids to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` with provenance
`chore/scanner-precision-cluster`.

**The meta-line transition is not optional (AC-B5).** Each entry's
`**Status:** IN PROGRESS · **Branch:** chore/scanner-precision-cluster` becomes
`**Status:** RESOLVED on branch \`chore/scanner-precision-cluster\` (2026-08-03)`. Deleting the
marker instead fails the `BACKLOG_GRADUATED` provenance assertion
(`tests/docs/_metaDeferralLedgerGraduation.test.ts:393-396`), because that marker is the section's
only mention of the branch; leaving it fails `_metaLedgerInProgress.test.ts`, because an archive may
not hold in-flight work. R3b found this collision.

**Do NOT rely on `_metaLedgerInProgress.test.ts` to catch a missed transition.** R5b probed it:
that guard scans only body lines 1–12 of an entry, and `BL-LEDGER-GUARD-BODY-DEFINED-IDS` carries
its status at body line **13**, so leaving that entry's marker unchanged passes both real guards
silently. Task 3 therefore asserts the transition DIRECTLY — after the move, `rg 'IN PROGRESS'
BACKLOG-archive.md` returns nothing for either id, and each archived section contains
`chore/scanner-precision-cluster`. The window limitation is the sibling guard's, not this plan's;
it is recorded here so the gap is covered rather than assumed away.

**Ordering that matters:** `BL-LEDGER-GUARD-BODY-DEFINED-IDS`'s body contains the
`BACKLOG.md:79` bullets enumerating the eight ids as code spans, not strong — so under Task 2's
rule that entry defines nothing and the move changes no definition. Task 2 lands first so the
property is pinned independently of the entry's location.

**Rebase conflict expected** — sibling panes are graduating other rows from the same file. Resolve
by keeping BOTH sides; the entries are disjoint and the `Last reconciled:` line concatenates.

**Commit.** `docs(backlog): graduate the two scanner-precision entries`

---

## Task 4 — full local gate

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (AC-C1) — the full suite, not
scoped runs, since this edits a generated artifact consumed across `tests/messages/**`,
`tests/dev/**`, and `tests/cross-cutting/**`. Re-run `pnpm spec:lint` on spec and plan.

---

## Task 5 — adversarial review (cross-model), CI, merge

Whole-diff Codex review to APPROVE. Then push, real CI green (not just local), `gh pr merge
--merge`, and fast-forward local `main` until
`git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## 12. Close-out

**impeccable-gate: N/A — no UI surface.**
