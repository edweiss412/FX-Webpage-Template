# Plan — migrate array-join classNames to a local `cn` callee

**Spec:** `docs/superpowers/specs/2026-08-07-classname-array-join-cn.md` (canonical; section
references below are to it).
**Arc:** `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` (`BACKLOG.md:876`)
**Branch:** `refactor/classname-array-join-cn` · **Base:** `61281c23e`
**Implementer:** Opus / Claude Code (UI surface — routing hard rule).

`impeccable-gate: required — UI surface (18 files under components/ and app/); critique + audit both
run at close-out step C2, dispositions in §12.`

---

## Acceptance criteria (spec §10, restated so task markers can reference them)

| id | Criterion |
|---|---|
| AC-1 | `lib/ui/cn.ts` exports `cn` + `ClassValue`; unit test covers every row of spec §3.2. |
| AC-2 | All 36 sites call `cn`; recognizer reports zero across every UI source extension (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`), any whitespace separator, any syntactic position. |
| AC-3 | `scripts/verify-cn-operand-parity.mjs` reports parity for all 36 sites; output in the PR body. One-shot, not a tracked test — so C4 step 4 re-runs it against a re-resolved anchor after the final rebase. |
| AC-4 | `DayCard` `tone === "set"` dot: unchanged `classList`, no trailing space. |
| AC-5 | `pnpm lint` clean; fixes applied are exactly C1–C6, no undeclared rewrite. |
| AC-6 | Census guard deleted; zero-tolerance guard replaces it with its premise fixture. |
| AC-7 | Premise pair passes: drift in `cn(...)` reported at literal AND ternary args; same drift in an array join not reported — all three separator spellings, in BOTH the inline and via-variable shape. Recognizer fixture catches all seven escape shapes. |
| AC-8 | Full suite green; `pnpm typecheck` clean. |
| AC-9 | Invariant 8 dual-gate run; P0/P1 fixed or deferred; dispositions recorded. |
| AC-10 | Ledger entry archived, marker removed in the PR's last commit; two new entries filed. |
| AC-11 | C1/C5 rest-state rects match a baseline captured BEFORE canonicalization, within 0.5px, via Playwright (mobile-safari); the two `@theme` token values are asserted deterministically; `tests/crew/transitionAudit.test.ts` unchanged and green. |

---

## Meta-test inventory

- **Creates** `tests/specLint/canonicalClassCallee.test.ts` (zero-tolerance recognizer + premise
  fixture + eslint-coverage premise pair).
- **Deletes** `tests/specLint/canonicalClassArray.test.ts` (census guard).
- **Extends** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — adds
  `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` to its `BACKLOG_GRADUATED` registry, with `provenance` set to
  this branch name. That guard covers every graduation since it landed and asserts archive-only
  placement plus branch provenance, so the registration is what gives C4 an entry-specific red
  (unregistered → the graduation is unverified) and green (registered → archive placement and
  provenance both proven).
- **Touches but does NOT extend** `tests/ci/_metaE2eWorkflowCoverage.test.ts`. The new Playwright
  spec is wired into `lifecycle-layout-e2e.yml`, which fires on UNFILTERED `pull_request:`, so the
  spec is PR-COVERED and needs no `LOCAL_ONLY_ALLOWLIST` row. Adding one would fail that test's
  shadowing assertion. Declared explicitly because "no row needed" and "row forgotten" look identical
  in a diff.
- **Not applicable, declared:** `tests/auth/_metaInfraContract.test.ts` (no Supabase call added),
  `tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*` path),
  `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutating route or server action added),
  `tests/messages/_metaAdminAlertCatalog.test.ts` (no alert code added).

`vitest.projects.ts:34` sets `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so the
new test file needs no `testMatch` or workflow path-filter wiring. No new CI job.

---

## Commit-greenness note (read before Task 3)

Spec §4 requires stage 1 (migration) and stage 2 (canonicalization) to land as **separate commits**
so a reviewer can diff them apart. Two consequences follow, both deliberate, both stated here so
neither is discovered as a finding. **The Task 3 commit leaves two things red:**

| Red after Task 3 | Why | Resolved by |
|---|---|---|
| `pnpm lint` — 10 errors | the violations the migration makes visible for the first time (spec §2.4) | Task 6 |
| `tests/specLint/canonicalClassArray.test.ts` | the census now names 18 files that no longer array-join a className, so its shrink-never-rot assertion fails | Task 4 |

Both are intended, and the second is load-bearing rather than incidental: it is Task 4's genuine RED
(see that task). The branch is fully green after Task 6. CI gates the PR's final state, not each
intermediate commit, and the Task 3 commit message says all of this explicitly.

Merging the tasks to keep every commit green would destroy the property that makes a 36-site
mechanical diff reviewable: that stage 1 changes no class token at all.

---

# Preflight (procedural — runs before the task region)

## P1 — rebase, then re-establish BOTH halves of the equivalence premise

`fix/step3-a11y-cluster` is touching step-3 UI concurrently, including
`components/admin/wizard/Step3SheetCard.tsx`, which holds one of the 36 sites.

1. `git -C <worktree> fetch origin && git -C <worktree> rebase origin/main`.
2. **Re-run the inventory sweep separator-agnostically** (spec §2.2 — a sweep keyed on the literal
   `.join(" ")` cannot see the escape spellings Task 4 closes):
   ```
   git ls-files -z components app | tr '\0' '\n' | grep -E '\.tsx?$' \
     | xargs grep -ohE '\.join\([^)]*\)' | sort | uniq -c | sort -rn
   ```
   Expected at base: `38 .join(" ")` and no other whitespace separator. The 38 are the 36 classNames
   plus 2 data joins in `components/admin/wizard/step3ReviewSections.tsx` and
   `components/admin/review/sectionFreshness.ts` (do not migrate those two). A whitespace-separated
   join at any other spelling means a new dark site landed — it is in scope and changes the §2.2
   count.
3. **Re-run the falsy audit — BOTH halves, not the site count.** The count is not the premise; the
   premise is spec §4.1's E1/E2 partition, and a rebase can break it without moving a single count:
   - *Literal operands:* the unfiltered sites must still yield exactly one `""`/`null`/`undefined`
     hit, `components/crew/primitives/DayCard.tsx:98`.
   - *Identifier operands:* the seven identifiers in spec §4.1's table (`base`, `focusRing`,
     `pillState`, `TRACK_BASE`, `THUMB_BASE`, `surfaceClass`, `CHIP_CLASS`) must still be truthy at
     every definition. A rebase making any one falsy creates a second E2 site that the site count,
     the operand-parity script, the `cn` unit test, and the `DayCard` test would ALL pass over.
   - *Every operand must still fall in a PROVEN-TRUTHY category.* Checking the known literals and
     the seven known names is not the same as proving no operand of an unvetted kind appeared. The
     concrete case: an upstream edit to `active && "bg-accent"` introduces a `false` operand — it is
     neither a `""`/`null`/`undefined` literal nor one of the seven names, so both checks above pass,
     while `["a", false, "b"].join(" ")` is `"a false b"` and `cn("a", false, "b")` is `"a b"`. That
     is a rendering change, not a whitespace one, and parity, the helper tests, and the `DayCard` test
     all stay green through it. So enumerate **every** top-level operand at the 30 unfiltered sites
     and assert each is one of the three kinds the base is measured to contain:
     1. a non-empty string literal;
     2. one of the seven proven-truthy identifiers from spec §4.1's table;
     3. a conditional (ternary) expression — possibly nested — **every** result branch of which is a
        non-empty string literal, with exactly one sanctioned exception:
        `components/crew/primitives/DayCard.tsx:98`, whose `tone === "set"` branch is `""` — the
        sole E2 site (spec §4.1), already pinned by its own render test.

     Kind 3 is not an allowance added for convenience; it is the measured base. An AST probe of the
     30 unfiltered sites finds **18 top-level conditional operands at 18 sites**
     (`_PickerInterstitial:174`; `OnboardingWizard:182,200`; `PublishedToggle:298,307`;
     `AutoPublishToggle:130,137`; `DeveloperToggleButton:91,96`; `NotifyToggle:138,145`;
     `Step3SheetCard:577`; `Section:175`; `RightNowHero:557,586`; `DayCard:70,77,98`), every branch
     a non-empty string literal except the one `""` above. An audit that admitted only kinds 1 and 2
     would stop on the untouched base itself. Anything outside the three kinds — a `&&`, a new
     identifier, a call, a ternary with a falsy-capable branch anywhere but `DayCard.tsx:98` — stops
     the run until spec §4.1 is re-derived.
4. If either half moved, **stop and amend the spec** before implementing. §2.2's table, §4.1's audit,
   and §6's delta table are all keyed to the measured base.

**Verified by:** the two sweeps above plus the existing census guard, all green.
**Commit:** none (rebase only), unless the audit moved — then the spec amendment is its own commit.

This preflight is written once, here, and runs **twice**: before the first edit, and again at C4
step 4 after the mandatory final rebase (spec §12 Concurrency requires both rebases; the one-shot
proofs are only as fresh as the history they ran against).


<!-- tasks: depth=2 -->

**Conjoined `red=` markers and short-circuit.** A `red=` command of the form `A && B`
short-circuits: while `A` fails, `B` never runs. So wherever a task's RED claims more than one
failing half (Tasks 2 and 3), the RED observation runs each conjunct **separately** and records
each failing on its own; the conjoined command is the GREEN criterion — it passes only when every
half passes. Task 4's conjunction is deliberately different: its second half is an existence check
that can only go green after the replacement lands, so its RED is the first half alone (the task
says so in place).

## Task 2 — the `cn` helper

<!-- task: red=`pnpm vitest run tests/ui/cn.test.ts && pnpm typecheck` ac=AC-1 -->

**RED.** Write `tests/ui/cn.test.ts` covering **every row of spec §3.2** — not a subset:

- `cn()` → `""`; `cn(null, undefined, false, "")` → `""` (both all-falsy forms).
- `cn("a")` → `"a"`; `cn("a","b")` → `"a b"`.
- Each falsy kind dropped individually: `cn("a","","b")`, `cn("a",null,"b")`,
  `cn("a",undefined,"b")`, `cn("a",false,"b")` → all `"a b"`.
- **Negative-space assertions** (these are what stop a future "improvement" from silently changing
  semantics): `cn("a  b")` → `"a  b"` (interior whitespace preserved, not collapsed);
  `cn("a","a")` → `"a a"` (no dedupe); `cn("p-2","p-4")` → `"p-2 p-4"` (no conflict resolution —
  spec §1.1 R1 rejected `tailwind-merge` precisely so this holds).
- Type-level: `ClassValue` admits `string | false | null | undefined` and **not** `number` or
  `ClassValue[]`. Assert with `@ts-expect-error` on a `cn(0)` and a `cn(["a"])` call, so the
  exclusion is enforced by the typechecker rather than described in a comment.
  **`@ts-expect-error` is invisible to Vitest** — it is a compiler directive, and an unsatisfied one
  fails only `tsc`. That is why this task's red command is the Vitest run **and** `pnpm typecheck`:
  a type contract asserted but never typechecked is a comment with extra syntax.

Fails: the module does not exist. Both halves are red for that same reason and are observed
**separately** (the conjoined-marker rule above): the Vitest run fails on the unresolvable import,
and `pnpm typecheck`, run on its own, fails on the same unresolved module — the conjunction would
otherwise short-circuit before the second half ever ran.

**GREEN.** Create `lib/ui/cn.ts` exactly as spec §3.1.

**Same commit — remove one obsolete assertion.** `tests/specLint/canonicalClassArray.test.ts:148-178`
("records that NO recognized callee exists to migrate to yet") asserts no `cn` helper exists
anywhere. Landing `cn` makes it fail by construction; its own failure message says a `cn` helper
existing is the signal to do this migration. Delete **only that `it(...)` block** in this commit. The
census itself and the rule-is-on pin stay until Task 4 — the census is still true and still load-bearing
until the migration lands.

**Failure mode caught:** a `cn` that trims, dedupes, or merges would silently change ~36 rendered
class strings. The negative-space rows are the only thing that catches it; a happy-path-only test
would pass against `tailwind-merge`.

**Commit:** `feat(ui): add a local cn class-name helper`

## Task 3 — migrate all 36 sites, under the operand-parity check

<!-- task: red=`node scripts/verify-cn-operand-parity.mjs --base $MIGRATION_PARENT && pnpm vitest run tests/components/crew/primitives.test.tsx` ac=AC-2,AC-3,AC-4 -->

RED and GREEN live in **one** task (invariant 1). The parity check is written and observed failing,
then the migration turns it green, then one commit. Splitting them across tasks would put a
deliberately-red commit on the branch.

**RED — write `scripts/verify-cn-operand-parity.mjs` and watch it fail.**

It proves the migration is a pure syntactic rewrite, and it is the load-bearing anti-tautology
mechanism for the migration.

**It is a script, not a vitest file, and that is load-bearing** (spec §4.3). As a tracked test it
would (a) be unable to resolve its own baseline — the unit workflow checks out at depth 1 and fetches
only one pinned object (`.github/workflows/unit-suite.yml:110`) — and (b) permanently freeze the
class lists of all 18 files against a closed migration's C1–C6 allowlist. Do not put it under
`tests/`, and do not wire it into any workflow.

Design, per `docs/agents/writing-plans.md`:

- **Expected values come from the pre-migration source, never from a literal.** Read each of the 18
  files at the pre-migration commit via `git show <sha>:<path>`.
  **The SHA is an explicit required argument, and it is the migration commit's PARENT — not the
  original branch base.** Two failure modes bracket the correct value:

  - Re-resolving `HEAD` at the second invocation reads the already-migrated tree, finds zero array
    joins, and passes vacuously.
  - Hard-coding the pre-rebase branch base (`61281c23e`) is wrong once P1 has rebased, which it
    always will have: P1 exists *because* `fix/step3-a11y-cluster` is editing
    `components/admin/wizard/Step3SheetCard.tsx` concurrently. If upstream changed an operand from A
    to B and the migration accidentally restored A, a comparison against the stale base would see
    A → A and pass, while stage 1 had in fact changed output relative to its real parent. The `cn`
    unit test and the `DayCard` test do not cover that site, so §4.2's composed proof would be broken
    with every check green.

  So: capture `git rev-parse HEAD` **once, after the P1 rebase and before the first migration edit**,
  export it as `MIGRATION_PARENT`, record the literal value in the task log and the PR body, and pass
  that same value to both invocations. `$MIGRATION_PARENT` appears in the declared commands above and
  in Task 6 precisely so no fixed SHA can be baked in and go stale at the next rebase.

  **The recorded literal is valid only for the history it was captured in.** Once the migration
  commit exists, the anchor is definitionally `<migration-sha>~1` — but any LATER rebase (and C4
  step 4's final pre-merge rebase is mandatory, spec §12 Concurrency) rewrites the migration commit
  **and its parent**, so the recorded value stops naming the parent of the commit being merged. After
  every such rebase the anchor is re-resolved as the REWRITTEN migration commit's `~1` and the parity
  check re-run — C4 step 4 owns that re-run and says how. It is a local history read, never a
  CI-time lookup, which is why this is a script (spec §4.3).
- Extract each array-join's operand list by bracket-matching backward from the join, tolerating an
  intervening `.filter(Boolean)`; extract the corresponding `cn(...)` argument list from the working
  tree; assert the same operand sequence, comparing after stripping comments and insignificant
  whitespace.
- **Declared-delta allowance.** Class tokens rewritten in Task 6 are permitted only where spec §6
  declares them (C1–C6), as an explicit `EXPECTED_TOKEN_DELTAS` map. An undeclared token change
  fails. (On the Task 3 run nothing has been canonicalized yet, so the map is inert here; it earns
  its keep when the script is re-run in Task 6.)
- **State the premise executably.** Immediately above the parity assertion, and unconditionally —
  never inside a `.each` callback, whose case count can be zero:
  ```js
  assert(baseSites.length === 36, "premise: base-commit extraction found all 36 array-join sites");
  ```
  Without it, an extractor that silently found zero sites would report "all sites match" while
  comparing nothing.

Run it: it fails on all 36 sites, because no `cn(...)` className exists yet.

Also add, in this task, the `DayCard` E2 assertions to `tests/components/crew/primitives.test.tsx`,
which fail against the pre-migration component:

- Render `DayCard` with `tone === "set"`; assert the dot's `className` has **no trailing space**
  (`expect(cls).toBe(cls.trimEnd())`).
- Assert its `classList` token set is unchanged versus the other tone branches' shared tokens (spec
  §4, E2 — the token set is what the migration preserves).
- Render `tone === "show"` and the default tone too, so all three branches are exercised; only `set`
  changes bytes.

The declared command's second half — `pnpm vitest run tests/components/crew/primitives.test.tsx` —
is what binds these assertions to the task: red against the pre-migration component (the trailing
space is present), green after the rewrite. Per the conjoined-marker rule at the top of the task
region, the RED observation runs it **on its own** — inside the conjunction the parity script's
expected failure would short-circuit before the DayCard suite ever ran, and the red would be
asserted, not observed. Without it in the command at all, the assertions would be promised prose
that no run ever checks red-then-green (invariant 1).

**GREEN — apply the spec §5 rewrite to all 36 sites:**

```
className={[A, B, C].join(" ")}                →  className={cn(A, B, C)}
className={[A, B].filter(Boolean).join(" ")}   →  className={cn(A, B)}
const X = [A, B].join(" ")                     →  const X = cn(A, B)
const X = [A, B].filter(Boolean).join(" ")     →  const X = cn(A, B)
```

Operands, order, and interleaved comments preserved verbatim. Add
`import { cn } from "@/lib/ui/cn";` to each of the 18 files. Run Prettier; no manual reflow.

Do **not** touch `components/admin/wizard/step3ReviewSections.tsx` or
`components/admin/review/sectionFreshness.ts` — data joins (spec §2.2).

**Do not run `eslint --fix` in this task.** That is Task 6, and conflating them defeats the staging.

`pnpm lint` is expected to report exactly the 10 errors of spec §2.4 at the end of this task — see
the commit-greenness note above, and say so in the commit message.

**Failure mode caught:** the parity script catches a migration that drops, reorders, or rewrites an
operand — the one way a mechanical 36-site diff changes rendering while looking correct in review.
The `DayCard` assertions catch the single site where operands are preserved but bytes still move.

**Commit:** `refactor(ui): migrate array-join classNames to the cn callee`

## Task 4 — replace the census guard, which Task 3 has just turned red

<!-- task: red=`pnpm vitest run tests/specLint/ && pnpm vitest run tests/specLint/canonicalClassCallee.test.ts` ac=AC-6,AC-7 -->

**RED — and the red is real, which is why this task sits here.** Task 3 migrated all 36 sites, so
the OLD census guard is now failing: its third assertion ("names no file that no longer has one — the
census shrinks, never rots") finds all 18 census rows pointing at files that no longer array-join a
className. Run it and see it fail. That failure is what this task resolves.

**The declared command is a conjunction, and each half is load-bearing:**

```
pnpm vitest run tests/specLint/ && pnpm vitest run tests/specLint/canonicalClassCallee.test.ts
```

- The **directory** half fails now, because the obsolete census guard fails inside it. Naming the
  census file directly instead would give a red that can never go green — this task's GREEN deletes
  that file, and `vitest run` on a path with no test files exits 1 with `No test files found`, so the
  command would fail before and after for two different reasons. The directory holds fifteen other
  spec-lint tests, so it can never degrade to that empty-path case.
- The **file** half is what makes the command prove the replacement. Without it, deleting the census
  alone turns the directory green even if `canonicalClassCallee.test.ts` is never written: the
  command would attest to a removal and say nothing about AC-6 or AC-7. With it, success requires the
  replacement to exist *and* pass its own assertions.

Together: red now (census fails), still red after a census-only deletion (replacement missing), green
only when the census is gone and the replacement is present and passing.

This ordering matters. Writing the replacement guard first would produce a test that passes the
moment it is authored correctly — the tree is already clean — and deleting the old file could not
turn it green, because the two are different files. There would be no red-to-green causality at all,
just a marker asserting one. The honest red is the census guard's own death rattle.

**GREEN, part 1.** Write `tests/specLint/canonicalClassCallee.test.ts` (spec §7):

1. **Zero-tolerance recognizer, keyed on the join's separator and position-free.** Do **not** reuse
   the census scanner's shape. It carries three independent escapes, all probed silent in spec §7.1:
   it anchors on the literal `className={[` / `const x = [`, it matches the separator `.join(" ")`
   exactly, and it scans only `/\.tsx?$/`.

   Implement spec §7.1's accept-set instead: report **every array join whose separator is a
   non-empty whitespace string literal at any quote style, anywhere in any UI source file**
   (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`), with no positional anchor. Carry the two legitimate
   data joins as an exemption list — `components/admin/wizard/step3ReviewSections.tsx` (joins
   `[leg.date, leg.time]`) and `components/admin/review/sectionFreshness.ts` (joins
   `[row.date, row.time]`). They are NOT the same expression, so the list carries both spellings.

   **Exempt per SITE, never per file, and assert set EQUALITY.** A file-wide exemption is a hole: an
   ordinary contributor can add an array-join className to an exempted file, ESLint stays blind, and
   the exemption suppresses the guard — silently, which breaches the consequence bound. An
   exhaustiveness check ("the file still contains a match") does not close it either, because it
   cannot tell the legitimate join from an added one.

   So each exemption row records a file **and the exact operand signature of the site it excuses**,
   and the assertion is that the file's set of whitespace-join sites **equals** exactly its recorded
   set — not "contains", not "is non-empty". Consequences, both wanted: a NEW join in an exempted
   file fails (set is larger), and a REMOVED one fails too (set is smaller), so a stale row cannot
   sit there pre-authorizing a future class join in that file.

   Calibration is already probed (spec §7.1): the recognizer yields 38 whitespace-join sites at base
   — 36 classNames + the 2 exemptions — and after Task 3 must report **zero**.
2. **The recognizer's premise, stated executably.** A zero-tolerance guard cannot prove its scanner
   works by finding a non-empty set — "found nothing" is both the passing state and what a broken
   scanner reports. So: run the scanner against a fixture holding known array-join classNames and assert they **are**
   found, immediately above the assertion that the real tree yields none. Unconditional, not inside a
   `.each` callback. (The fixture is an on-disk tree, not a source string — see the discovery-layer
   requirement below, which supersedes any inline-string reading of this sentence.)
   **The fixture must exercise the WHOLE accept-set spec §7.1 promises, not a sample of it.** A
   premise fixture proves only what it varies, and the post-migration tree is clean, so anything the
   fixture leaves constant is unpinned in both places at once. Three dimensions, varied
   independently:

   - **Shape** — all seven escapes from spec §7.1: ternary-at-className, template interpolation,
     backtick separator, single-quote separator, call-argument position, via-variable const, and the
     direct form.
   - **Separator** — not just one ASCII space. Include `"  "` (double space) and `"\t"`, because the
     accept-set says *non-empty whitespace* and a scanner hard-coded to a single space would satisfy
     a single-space-only fixture while missing both. Probed: neither form draws an ESLint finding, so
     the rule does not backstop them, and accidental double spacing is ordinary authoring.
   - **Location** — both UI roots (`app/` and `components/`) and all six extensions (`.ts`, `.tsx`,
     `.js`, `.jsx`, `.mjs`, `.cjs`). A fixture living only at one root under one extension would let
     a scanner that walks only that root, or only that extension, pass.

   Plus the three negatives that must NOT hit: `.join(", ")`, `.join("")`, and `cn(...)`.

   The failure this prevents is specific: with a one-root, one-extension, one-separator fixture, at
   least two broken scanners pass both the fixture and the clean tree — one that walks only
   `components/**/*.jsx`, and one that accepts only a single-space separator.

   **An inline string cannot pin the file-discovery layer, so the fixture is a real directory tree.**
   This is the sharper half of the same problem: a string fixture proves the *recognizer* parses, and
   proves nothing about the *walker* that decides which files reach it. After Task 3 the only live
   whitespace-join sites in the tree are the two exemptions, both under `components/` in `.ts`/`.tsx`
   — so a walker restricted to `components/**/*.{ts,tsx}` would satisfy the exemption assertions, the
   inline premise, the clean-tree assertion, and the ESLint control pair, while an ordinary
   `app/**/*.jsx` array join stayed silent forever.

   Therefore: write the scanner as a function **parameterized by its roots**, and have the premise
   point it at a temporary on-disk fixture tree holding one planted array-join className at **each**
   of the twelve root × extension combinations (`app/` and `components/` × the six extensions).
   Assert it finds all twelve. The production call then passes the real roots. A walker that drops a
   root or an extension fails the premise on the combination it drops, by name.
3. **Rule-is-on pin.** `eslint.config.mjs` still sets
   `"better-tailwindcss/enforce-canonical-classes": "error"`. A guard that outlives its rule pins
   nothing.
4. **The coverage premise pair** (spec §7.2) — the executable replacement for the deleted census's
   justification. Write a temp file that imports `cn` and calls it with a seeded canonical violation
   (`min-h-(--spacing-tap-min)`), at **both** a plain-literal argument and a ternary argument. Run
   ESLint programmatically against the repo config.
   - **Positive:** the rule reports it at both argument positions, **in both shapes** — the inline
     `className={cn(...)}` form and the via-variable `const x = cn(...)` form. Spec §2.3 probed that
     the callee match does not depend on the variable's name, and this is what pins that; AC-7 names
     both shapes, so a pair covering only the inline one leaves half the claim unowned.
   - **Negative control:** the same seeded violation inside an array join in the same file is **not**
     reported — at all three separator spellings, in both the inline and via-variable shape, since
     all were probed dark.

   Six ESLint cells in total (2 shapes × {literal arg, ternary arg, array-join negative}), not three.

   The negative control is what makes the pair discriminating — without it, a harness pointed at the
   wrong file or a rule that reported everything would satisfy the positive check vacuously. It also
   permanently documents, executably, why the migration was necessary once the array-join sites are
   gone.

**GREEN, part 2.** Delete `tests/specLint/canonicalClassArray.test.ts`. The red command now passes
by the file's removal, and the replacement carries its surviving obligations forward.

Both halves land in one commit: a commit that deleted the census without its replacement would leave
the tree momentarily unguarded against the regression spec §1.1 R4 exists to prevent.

**Failure mode caught:** deleting the census and leaving nothing behind, so a new array-join
className lands dark — the exact regression the census existed to stop (spec §1.1 R4).

**Commit:** `test(lint): replace the array-join census with a zero-tolerance callee guard`

## Task 5 — the dimension harness, and the baseline captured BEFORE canonicalization

<!-- task: red=`pnpm exec playwright test --project=mobile-safari tests/e2e/canonical-class-dimensions.spec.ts` ac=AC-11 -->

The two sizing canonicalizations (C1, C5) must be shown not to move geometry, and that is only
provable against a baseline captured **before** the fix lands. A post-hoc one-sided bound does not
prove it: "width ≤ token" passes on a box that went 45px → 55px, and "height ≥ token" passes on
200px → 176px. So the harness and the capture come first, as their own task, and the canonicalization
that must not disturb them comes second.

The tree at this point is migrated but **not** canonicalized. Stage 1 changed no class token
(spec §4), so geometry here is identical to base — which is what makes this a valid baseline.

**RED.** Write `tests/e2e/canonical-class-dimensions.spec.ts`, asserting each target's
`getBoundingClientRect()` equals the value recorded in
`tests/e2e/__baselines__/canonical-dimensions.json`. It fails: the baseline file does not exist yet.

Targets:

- the step-indicator connector rule, `components/admin/OnboardingWizard.tsx:200-203`
  (`h-px max-w-[60px] flex-1 rounded-full`) — the C1 target;
- the `RightNowHero` card, `components/crew/RightNowHero.tsx:481` — the C5 target.

**The spec must actually run, which is not automatic here.** `playwright.config.ts` uses **explicit
allow-list** `testMatch` regexes per project, and its own comment warns that "a spec absent from this
regex runs NOWHERE and silently proves nothing." A name like `canonicalDimensions.spec.ts` matches
neither default project — probed `{mobile:false, desktop:false}`. Two steps, both required:

1. **The name must not substring-match an existing alternative.** `layout-dimensions` appears in
   BOTH projects' `testMatch` (`playwright.config.ts:65` and `playwright.config.ts:79`), so a name like
   `canonical-layout-dimensions.spec.ts` would silently match both — and mobile-only execution, which
   the reachability contract requires, could not then be established by adding an alternative. Name it
   `canonical-class-dimensions.spec.ts`, which matches neither, and add an explicit alternative to the
   **`mobile-safari`** project only. Implicit substring matching is exactly the silence the config's
   own comment warns about.
2. **Wire it into CI — invocation only, and deliberately NO path filter.** Add the spec to
   `lifecycle-layout-e2e.yml`'s `--project=mobile-safari` invocation. `admin-layout-e2e.yml` is
   desktop-chromium and is the wrong host. `pnpm test` is Vitest only and will never execute a
   Playwright spec, so without this AC-11 stays dark in real CI however well the spec is written.

   **Do not add a `paths:` filter to that workflow, and do not add an allowlist row.** Its header
   records that it deliberately carries none: "four spec-review rounds proved any enumerated filter
   re-opens the dark-path hole." Because it fires on unfiltered `pull_request:`, a spec named in its
   invocation is PR-COVERED, which is the strongest state available and needs no
   `LOCAL_ONLY_ALLOWLIST` entry. Adding one would in fact FAIL
   `tests/ci/_metaE2eWorkflowCoverage.test.ts`'s shadowing assertion ("allowlisted specs that ARE
   covered - remove the row"), and adding the filter would fail its lifecycle-coverage assertion.
   Both halves of the tempting design are red; the unfiltered invocation is the green one.

**Harness readiness** (`docs/agents/writing-plans.md` e2e checklist):

- **Project: `mobile-safari`, not `desktop-chromium`.** Both targets' precedents live there —
  `tests/e2e/onboarding-wizard-step1.spec.ts` is mobile-safari, and
  `tests/e2e/crew-layout-dimensions.spec.ts` gates itself to mobile-safari explicitly
  (`if (testInfo.project.name !== "mobile-safari") return;`, a single-writer constraint). Wire the
  workflow invocation to a mobile-safari job accordingly; `admin-layout-e2e.yml` is desktop-chromium,
  so it is the wrong host for this spec.
- **Boot:** the repo's existing Playwright setup and its production-build server.
  `tests/e2e/crew-layout-dimensions.spec.ts` is the closest existing `getBoundingClientRect()`
  dimension spec — follow its boot, gate, and assertion shape rather than inventing a second pattern.
- **Reachability — both targets need setup, and neither is reachable by navigation alone.** This is
  the step most likely to be skipped, because "go to /admin" reads as sufficient and is not:
  - **C1 (`OnboardingWizard`).** Reachability needs BOTH an auth step and a database state
    contract, and neither alone is enough:
    - *Auth.* The precedent (`tests/e2e/onboarding-wizard-step1.spec.ts:29-35`) does `signOut(page)`
      in `beforeEach` **and then `signInAs(page, ADMIN_FIXTURE)` in the test body** before
      `page.goto("/admin")` — `signOut` alone lands on the unauthenticated surface, not the wizard.
      Copy both calls.
    - *State.* The wizard renders only when `app_settings.watched_folder_id` is null (precedence 2,
      `app/admin/page.tsx:237`) or a wizard session is pending (precedence 1,
      `app/admin/page.tsx:176`); the seeded DB has the folder SET and no pending session
      (`supabase/seed.ts:509`, `supabase/seed.ts:517`), so on the seeded stack `/admin` renders the
      dashboard and the connector is simply absent — for this spec AND for the workflow run. The
      repo already has the state-contract pattern to copy, in the OPPOSITE direction:
      `settleDashboardAdminState()` (`tests/e2e/helpers/dashboardState.ts:36`) captures the prior
      `app_settings` row, writes the target state, and returns a restore callback for `afterAll`
      (single-worker suite; invariant-9 destructure-and-throw on every call). Write its inverse in
      the same helper file: capture the row, null out `watched_folder_id` + its three companion
      fields, the four `pending_folder_*` fields, and both `pending_wizard_session_*` fields (all
      ten are already enumerated in that file's `FIELDS` list), restore in `afterAll`. With the row
      nulled and the admin signed in, `/admin` takes precedence 2 and mounts the wizard.
    - Then assert `[data-testid=wizard-step-connector]`
      (`components/admin/OnboardingWizard.tsx:197`) is present before measuring — a measurement on
      an absent element is the failure this bullet exists to prevent.
  - **C5 (`RightNowHero`).** It lives on the seeded crew route, which needs four things, all shown in
    `tests/e2e/crew-layout-dimensions.spec.ts` `beforeEach`: `lookupSeededShow()` for the slug,
    `lookupShareToken(showId)`, `signOut` then `signInAs(ADMIN_FIXTURE)`, and a server-clock pin via
    the `X-Screenshot-Frozen-Now: SHOW_DAY_1_INSTANT` + `Authorization: Bearer TEST_AUTH_SECRET`
    headers (the section reads the server-supplied `today`, not a browser clock). Then
    `/show/<slug>/<shareToken>?s=today`. Reuse that helper rather than re-deriving it.
- **Readiness gate:** await the surface's established hydration gate before the first measurement,
  never `networkidle` alone. A rect read pre-hydration is a confident wrong number.
  `crew-layout-dimensions.spec.ts`'s `gotoSection` helper documents the specific trap on this route
  and is the pattern to copy: `CrewSectionTransition` wraps the body in a framer `motion.div` with
  `initial={{opacity:0,y:4}}`, so reading immediately catches the subtree at its pre-commit frame
  with height 0 — and an equal-height assertion then passes tautologically, 0 == 0. Settle the
  section-enter crossfade and wait for a real laid-out height before any rest-state read.
- **Detach safety:** both targets are static at rest, so no sampler outlives its element. (The
  mid-crossfade sampler that would have needed this guard is descoped — see below.)

**GREEN — under an explicit capture/verify contract, because a baseline the verifier can write is
an oracle the verifier can bless.** No existing dimension spec in this repo commits a baseline
file, so the contract is stated here rather than inherited, and it is fail-closed in both
directions:

- **Verify mode (the default, and the only mode CI ever runs).** Baseline file present → compare
  every recorded rect within 0.5px. Baseline file MISSING → **hard fail** naming the capture
  command — never measure-and-write, never skip. A deleted or never-committed oracle is a loud red,
  not a silent regeneration.
- **Capture mode (`CAPTURE_CANONICAL_DIMENSIONS=1`, explicit, local-only).** Measure, write the
  JSON, and then **fail the run anyway** with "baseline captured — re-run without the flag to
  verify". Failing on capture is what makes self-blessing impossible even if the env var ever
  leaked into CI: a capture run can never report green, so no pipeline can both regenerate the
  oracle and pass on it in one execution. The workflow invocation sets no such variable.

So the GREEN sequence is: capture run (writes the JSON, exits red by design) → commit the baseline
→ verify run passes against it. Task 6, C3, and C4 re-runs are all verify-mode by construction —
they set no flag, so a missing or stale baseline fails them rather than being papered over.

**Rest-state rects only — the mid-crossfade sampler is DESCOPED, deliberately.** Earlier drafts also
captured the card's height sampled during the `AnimatePresence` crossfade. Three consecutive plan
review rounds landed on that sampler (reachability, then a settled-frame premise, then the premise
for the premise), and none of them was about the canonicalization: they were about driving
framer-motion deterministically. Per the three-round cap in `docs/agents/spec-self-review.md`, a
vector that survives three rounds gets a probe, a descope, or an UNRATIFIED mark rather than another
prose patch. This is the descope, and it is safe for a specific reason:

**C5 changes no value, by construction.** `min-h-(--spacing-right-now-min-h)` and
`min-h-right-now-min-h` are two spellings that resolve to the SAME `@theme` token
(`app/globals.css:216`). There is no arithmetic between them and nothing for a transition to expose:
if the token resolved differently the rest-state assertion would already fail. The mid-crossfade
sample was testing framer-motion's behavior, which this arc does not touch and which
`tests/e2e/right-now-transitions.spec.ts` already owns.

**What replaces it is stronger for the risk that actually exists** — that a canonical utility resolves
to a different value than the form it replaced. That is a token question, not a timing question, so it
is answered deterministically in Task 6 by a unit assertion on `app/globals.css`:

- C1: `--spacing-confirm-box` is exactly `60px`, the bracket literal `max-w-[60px]` encoded.
- C5: `--spacing-right-now-min-h` exists and is the token BOTH spellings reference, so the
  substitution is an identity.

No browser, no clock, no flake, and it fails on the one thing that could actually break.**Failure mode caught:** a dimension gate that never executes — the config's own documented failure —
and a baseline captured after the change it is supposed to measure.

**Commit:** `test(ui): capture the pre-canonicalization dimension baseline`

## Task 6 — canonicalize, and hold the baseline and the transitions

<!-- task: red=`pnpm lint` ac=AC-5 -->

**RED.** `pnpm lint` reports the 10 errors across 6 files of spec §2.4.

**GREEN.** Run `eslint --fix` scoped to the 18 files, then verify the applied fixes are **exactly**
C1–C6 from spec §6:

| # | File | Before → After |
|---|---|---|
| C1 | `components/admin/OnboardingWizard.tsx` | `max-w-[60px]` → `max-w-confirm-box` |
| C2 | `components/admin/PublishedToggle.tsx` | `h-5 w-5` → `size-5` |
| C3 | `components/admin/settings/AutoPublishToggle.tsx` | `h-5 w-5` → `size-5` |
| C4 | `components/admin/settings/NotifyToggle.tsx` | `h-5 w-5` → `size-5` |
| C5 | `components/crew/RightNowHero.tsx` | `min-h-(--spacing-right-now-min-h)` → `min-h-right-now-min-h` |
| C6 | `components/crew/sections/TodaySection.tsx` | `text-sm leading-snug` → `text-sm/snug` |

**A rewrite not in this table is a finding, not a fix.** Stop and report — an undeclared rewrite
means spec §2.4's measurement no longer describes the tree, and the §4/§6 equivalence argument rests
on it.

**Then hold the three things this change could disturb:**

1. **Geometry.** Re-run Task 5's spec. Every recorded box matches the committed baseline within
   **0.5px** — equality against a real prior measurement, not a bound against a token.
2. **Operands.** Re-run `node scripts/verify-cn-operand-parity.mjs --base $MIGRATION_PARENT`, passing
   the SAME value Task 3 recorded. It must pass with the C1–C6 deltas allowed and no others. Note the
   explicit `--base`: re-resolving `HEAD` here would compare the migrated tree against itself, and
   the pre-rebase branch base is the other wrong answer (Task 3 brackets both). Reusing Task 3's
   literal is correct HERE because no rebase occurs between Task 3 and this task; after C4 step 4's
   final rebase that stops being true, and that step re-resolves the anchor before re-running.
3. **Transitions.** Spec §9.5 declares no transition is added, removed, or altered — checked, not
   trusted, because `components/crew/RightNowHero.tsx` is both a migrated file (3 sites) and the
   repo's most transition-dense surface, driving an `AnimatePresence` crossfade over the very card
   whose height C5 touches.
   - Enumerate every `AnimatePresence`, `motion.*`, ternary render, and conditional block across the
     18 migrated files; each must still carry the `initial` / `animate` / `exit` props it carried at
     base. The migration touches `className` values only; a changed motion prop means the rewrite
     escaped its scope.
   - **Token identity, replacing the descoped mid-crossfade sampler (Task 5).** A NEW tracked test,
     `tests/specLint/canonicalTokenIdentity.test.ts`, run as
     `pnpm vitest run tests/specLint/canonicalTokenIdentity.test.ts` in this task's battery: parse
     `app/globals.css` and assert `--spacing-confirm-box` is exactly `60px` (what `max-w-[60px]`
     encoded) and that `--spacing-right-now-min-h` is defined once — the single token both C5
     spellings reference. This is the deterministic form of "the canonicalization changed no
     value", and it needs no browser. **It is authored green** — both facts are already true at
     base (spec §2.4 cites `app/globals.css:186` and `app/globals.css:216`) — so it is a pin, not
     this task's red
     (`pnpm lint` is); per the writing-plans micro-verification rule, observe its discriminating
     power once at authoring by locally editing the `60px` value, watching the test fail, and
     reverting. It joins the C4 step-4.3 allowlist under (a) as a file this arc creates.
   - `tests/crew/transitionAudit.test.ts` passes **unchanged**. An assertion there that moves is a
     signal the migration was not operand-preserving, not a reason to update the audit.

**Failure mode caught:** a canonicalization whose token does not resolve to the value it replaced,
moving layout by a few pixels that no unit test and no reviewer would see — including a move visible
only while a transition is in flight.

**Commit:** `fix(ui): canonicalize the classes the cn migration made visible`


<!-- tasks: end -->

---

# Close-out sequence (procedural — deliberately outside the TDD task region)

Invariant 1 governs **implementation** tasks: failing test → implementation → passing test → commit.
Tasks 2–6 above are those, and each carries a `red=` command that genuinely fails before its change.
The steps below are procedural — a docs filing, two gate runs, a review loop, a merge. Most have no
meaningful failing-first state; **C4 is the exception and does carry one**, through the
`BACKLOG_GRADUATED` registry (see its step 4), so its verification is executable even though its
sequencing is procedural. Declaring a `red=` for them would mean pointing a marker at a
command already green, which is a false TDD claim, so they sit outside the declared task region
rather than pretending. Each still names how it is verified.

## C1 — file the two out-of-scope entries

Both carry probe evidence, so both clear the ledger filing bar without a
`**Reachability:** INFERRED, NOT PROBED` field (spec §11).

- **`BL-SHADOW-TILE-ARROW-SYNTAX`** — 21 `shadow-(--shadow-tile)` class-string sites tree-wide (24
  textual matches across 18 files, 3 of them in doc comments), probed unreported by the rule.
  Include the spec §9.1 mechanism table: the rule canonicalizes tokens whose `@theme` value is a
  literal and skips those defined through a `var()` indirection, so **every** `-runtime` indirection
  token in this project is invisible to it — not just shadows. The entry also owns correcting
  `app/globals.css:288`, which claims the plugin enforces this and is factually wrong. Class-sweep
  exception (c): spans files this arc does not touch.
- **`BL-CLASS-CONST-LINT-BLINDSPOT`** — class strings in arbitrary-named consts and object values are
  not traversed (spec §9.2 lists the surviving sites; spec §7.1 records that the new guard
  deliberately does not decide them either). Attach the spec §2.3 probe table as evidence. Note the
  cheap known repair (rename to `classes`, which the plugin's variable selector matches, or wrap in
  `cn(...)`). Class-sweep exception (c): a different mechanism needing its own recognizer decision.

Per spec §8, `BL-CANONICAL-CLASS-ARRAY-BLINDSPOT` needs **no** edit — already CLOSED at
`docs/superpowers/plans/2026-08-04-backlog-convergence-c-guards-closeout.md:15`. Do not invent a
graduation edit for it.

**Verified by:** `pnpm vitest run tests/docs` (ledger meta-tests) stays green.
**Commit:** `docs(plan): file the two lint-coverage residuals this arc leaves open`

## C2 — invariant 8 dual gate

**Pre-code mechanical checklist first** (a discovery mechanism; the gate is only a verifier): em-dash
ban in user-visible copy, apostrophe literals, 44px tap targets (`min-h-tap-min` and companions),
canonical type/token classes (`text-xs/relaxed`, `text-subtle`). This arc adds no user-visible copy
and no new color token, so no new contrast pin is owed — state that rather than skipping it silently.

Run `/impeccable critique` **and** `/impeccable audit` on the diff, with the canonical v3 setup gates
(the skill's context-load step over `PRODUCT.md` + `DESIGN.md`, then the register reference read).
P0 and P1 findings are fixed or explicitly deferred via a `DEFERRED.md` entry. Findings and
dispositions go in §12 of this plan.

Expect a low yield: the arc changes no layout, no copy, and no color, and the six class-token
canonicalizations are semantics-preserving. A P0/P1 here most likely means a canonicalization was
**not** equivalent, so treat one as a signal to re-check spec §6 rather than as a styling nit.

**Commit:** `fix(ui): impeccable dual-gate dispositions` (only if findings require changes)

## C3 — whole-diff cross-model review

Full suite + `pnpm typecheck` green first. Then dispatch Codex review through
`scripts/codex-guard.mjs` with `--stage diff`, iterating to APPROVE.

The brief carries: REVIEWER ONLY, fresh-eyes posture, `VERDICT:` + `FINDINGS:` instructions, the
consequence bound and threat-model fence (the guard surface in Task 4 makes this mandatory), and the
do-not-relitigate list from spec §1.1 — **including the ratified local-`cn` decision**, the single
most likely thing for a fresh reviewer to reopen.

Per the split-review discipline, a 20-file diff is past the point where whole-diff reviews die
silently: dispatch scoped reviews per surface (helper + tests; the 18 migrated components; the guard
replacement) with the file list inlined in each brief, rather than attempting whole-diff first.

**Re-certification rule — the gate certifies the FINAL diff, not an intermediate one.** If any repair
commit in this step (or in C2) touches a file under `app/` or `components/`, then before merge:
re-run **both** impeccable commands on the updated diff, and re-run the dimension spec from Task 5
against its committed baseline. A UI edit landing after the gate would otherwise ship uncertified,
which is invariant 8 satisfied on paper and not in fact. Record the re-run in §12.

**The APPROVE binds to the reviewed head, and content-changing paths invalidate it.** On APPROVE,
record `REVIEWED_HEAD=$(git rev-parse HEAD)` in the task log. The approval's subject is the
branch-authored delta as reviewed at that commit. Afterwards, exactly two kinds of events can touch
the branch, with opposite effects:

- **Delta-preserving:** a rebase (C4 step 4) that completes without conflicts and passes the
  step-4.3 declared-delta audit with zero undeclared hunks. The branch's own patches applied
  verbatim onto newer upstream; the reviewed subject is intact, and CI plus the tracked gates cover
  the upstream-interaction risk exactly as they do for every arc. The approval STANDS.
- **Content-changing:** any repair commit (C4 step 2, or post-graduation work via step 7), and any
  rebase whose conflicts required hand resolution. The reviewed subject no longer exists, and a
  merge on the old approval would ship a diff no fresh eyes ever saw. The approval is VOID: return
  here, dispatch a delta round whose brief inlines `git diff <REVIEWED_HEAD's subject>..HEAD` —
  the incremental change plus the surfaces it touches, per the split-review discipline — iterate to
  APPROVE, and record the new `REVIEWED_HEAD`. C4's graduation commit may only be authored under a
  live approval.

(The graduation commit itself — the archive move plus marker removal that `BACKLOG_GRADUATED`'s
red/green already pins, C4 step 5 — is the one commit exempt from voiding, precisely because its
content is fully specified by an executable contract and it must be the PR's last commit. Anything
beyond that specified content in it is a step-4.3-style stop.)

**Commit:** per round, if repairs are needed.

## C4 — CI, merge, ledger graduation

Ordering matters here: the graduation commit must be **in** the PR and must itself be CI-green.

Two requirements pull against each other and the ordering below is what satisfies both: invariant 12
wants the in-progress marker to survive until the PR's **last** commit, and the merge must be
authorized by CI green on the **exact head** being merged.

1. Push; open the PR. **The marker stays on** through everything below until step 4.
2. Drive CI to green with the marker still in place, repairing and re-pushing as needed. This is
   where repair commits belong — while the branch is still declaring its claim. **Every repair
   commit voids the C3 approval** (it is content-changing by definition); before proceeding past
   step 3, return through C3's delta round and record the new `REVIEWED_HEAD`.
3. Confirm the branch is otherwise merge-ready: C1–C3 complete, **review APPROVE live — its
   recorded `REVIEWED_HEAD` reviewed the branch content being merged, with no content-changing
   event after it** — and CI green.
4. **Final rebase — mandatory, and it invalidates the one-shot proofs, so they re-run here.** Spec
   §12 Concurrency requires a rebase over `origin/main` before implementation (P1) **and again before
   merge**; this step is the second one.
   - **The no-op check runs BEFORE the rebase, or it measures nothing.** `git fetch origin`, then
     `git rev-list --count HEAD..origin/main` **first**: after any successful rebase `origin/main`
     is an ancestor of `HEAD`, so that count is `0` unconditionally — a check placed after the
     rebase would take the fast path precisely when every commit was just rewritten. So: if the
     PRE-rebase count is `0`, `origin/main` is already an ancestor, the rebase is a guaranteed no-op
     — skip it, nothing is invalidated, continue to step 5. Any other count means the rebase will
     rewrite every branch commit; run `git rebase origin/main` and then the full re-verification
     below.
   - After a real rebase, **the migration commit and its parent are rewritten**. The tracked gates
     (the zero-tolerance recognizer, the `cn` unit test, the `DayCard` test, the dimension spec)
     re-run in CI on the rebased head automatically; the one-shot proofs do NOT, and a head whose
     proofs cover a superseded history is exactly the silent-drift window the parity script exists
     to close. So, in order:
     1. **Re-run P1 steps 2–3 in full** — the separator-agnostic inventory sweep and every half of
        the operand audit (falsy literals, the seven identifiers, the three-kind enumeration). The
        equivalence premise is base-specific (spec §4.1), and a newly integrated upstream edit can
        break it without moving a single count.
     2. **Re-resolve the anchor and re-run parity.** Locate the rewritten migration commit by its
        `refactor(ui): migrate array-join classNames` subject, then
        `MIGRATION_PARENT=$(git rev-parse <rebased-migration-sha>~1)` and
        `node scripts/verify-cn-operand-parity.mjs --base $MIGRATION_PARENT` with the C1–C6 deltas
        allowed. Replace the PR-body parity transcript with this output. This catches drift in the
        MIGRATED expressions: an operand changed while resolving a rebase conflict passes every
        tracked test and only this comparison sees it.
     3. **Declared-delta diff audit — parity's blind side.** Parity compares operand lists and the
        truthiness audit checks definitions only for non-emptiness, so a conflict resolution that
        rewrites the CONTENT of a class-bearing definition — `TRACK_BASE` gaining or losing a token
        while staying non-empty, say — passes both, and the eslint rule is blind to arbitrary-named
        consts by the ratified §9.2 limit. The check that sees it is the branch's own declared
        delta, audited against the upstream side the rebase just integrated:
        `git diff origin/main HEAD` must contain ONLY (a) files this arc creates (`lib/ui/cn.ts`,
        `tests/ui/cn.test.ts`, the parity script, the replacement guard,
        `tests/specLint/canonicalTokenIdentity.test.ts`, the Playwright spec and
        its baseline JSON, the docs/ledger/corpus edits), (b) the file it deletes
        (`tests/specLint/canonicalClassArray.test.ts`), (c) the existing files it declaredly edits
        outside the 18 — `tests/components/crew/primitives.test.tsx` (Task 3),
        `tests/e2e/helpers/dashboardState.ts` (Task 5), `playwright.config.ts` (Task 5),
        `.github/workflows/lifecycle-layout-e2e.yml` (Task 5),
        `tests/docs/_metaDeferralLedgerGraduation.test.ts` (C4 step 5), `BACKLOG.md` and its
        archive (C1, C4 step 5) — and (d) inside the 18 migrated files, hunks that are the `cn`
        import line, a spec §5 rewrite, or a §6 C1–C6 token change. In particular the seven §4.1
        identifier DEFINITIONS must be byte-identical to `origin/main` — this arc never edits them,
        so any difference is conflict-resolution damage, not work. Any hunk outside the declared
        classes: stop.
     4. **A stop is a stop.** A parity-premise failure (site count moved off 36), an operand outside
        the three kinds, an undeclared diff hunk, or a dimension-spec failure on the rebased head
        all mean the measured base moved or the resolution went wrong — stop and re-derive spec
        §2.2/§4.1 (and for a dimension failure, the §9.4 targets) exactly as P1 step 4 prescribes.
        Recapturing a baseline or widening an allowance to get past this step is the forbidden move.
     5. **A conflicted rebase is content-changing: the C3 approval is VOID.** Return through C3's
        delta round (brief inlining the resolution diff and its surfaces) to a fresh APPROVE and a
        new `REVIEWED_HEAD` before the graduation commit. If any resolution touched a file under
        `app/` or `components/`, the invariant-8 re-certification also applies: re-run both
        impeccable commands and the Task 5 dimension spec before merge, and record the re-run in
        §12. A conflict-FREE rebase that passes the 4.3 audit with zero undeclared hunks is
        delta-preserving and the approval stands (C3's binding rule states why).
     6. Push with `--force-with-lease` and drive CI green on the rebased head.
   - If `origin/main` moves again before the merge completes, this step repeats — but **never with
     the graduation commit in place**: re-entry from a post-graduation state goes through step 7's
     revert FIRST (restoring the live ledger entry and its marker), THEN the repeat. The invariant
     is that the head being merged descends from current `origin/main` with its one-shot proofs
     re-established against the history actually being merged, and that the branch never carries an
     archived, unclaimed entry while work on it is still possible.
5. **Only now author the graduation commit.** It has an executable red and green, so it is not the
   unverified step the earlier draft implied: `tests/docs/_metaDeferralLedgerGraduation.test.ts`
   carries a `BACKLOG_GRADUATED` registry covering every graduation since that guard landed, and it
   asserts archive-only placement plus branch provenance per entry. Add
   `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` with `provenance: "refactor/classname-array-join-cn"`, and
   **observe both states with the guard's own command,
   `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`, before committing**: run it
   with only the registration in the working tree — RED (registered but not yet archived; an
   archive placed while the entry still sits in the live ledger fails the same way). Then complete
   the edit — the entry moved to the archive, nowhere else, provenance present, and its
   `**Status:** IN PROGRESS · **Branch:** …` marker removed — and run it again: GREEN. Both runs
   happen in the working tree of the ONE graduation commit; the red is never committed. Archives
   categorically reject in-progress entries, and a marker that reaches `main` names a branch the
   merge just deleted — `tests/docs/_metaLedgerInProgress.test.ts` then fails on `main` until someone
   clears it.
6. Push it and wait for CI green **on that commit**, not on an earlier one, and not local-only
   (local-passes-CI-fails is its own bug class).
7. **ANY post-graduation event that requires further branch work REVERTS the whole graduation
   commit first — never the marker alone, and never work-then-revert.** The events, enumerated: the
   step-6 CI run fails; `origin/main` moves and step 4 must repeat; that repeat's rebase conflicts
   or its re-verification stops. In every case the FIRST action — before the rebase, before any
   repair commit — is `git revert <graduation-sha>`, which restores the complete pre-graduation
   state in one step: the entry back in the live ledger, carrying its marker, nothing in the
   archive. Only then does the actual work happen (return to step 2, or repeat step 4), with the
   claim genuinely live — and with the C3 approval re-earned wherever that work was
   content-changing, per step 2's rule — and graduation is re-authored fresh as the new last commit
   once the branch is again merge-ready (step 3's definition, live approval included).

   Why not narrower recoveries: restoring only the marker would stamp `**Status:** IN PROGRESS`
   onto an entry that now lives in the archive, and archives categorically reject in-progress
   entries — `tests/docs/_metaLedgerInProgress.test.ts` fails on it. Working first and reverting
   later leaves the branch active with its entry archived and unclaimed — the undeclared-work
   collision invariant 12 exists to prevent — and any commit landed in that window makes the
   graduation commit no longer the PR's last, breaching the same invariant from the other side.

   The distinction is not pedantic: leaving the branch live without its claim is the undeclared-work
   collision invariant 12 exists to prevent, and an archived-but-marked entry is a second, louder
   failure layered on top of it.
8. `gh pr merge --merge`, then fast-forward local `main` and verify
   `git rev-list --left-right --count main...origin/main` reports `0  0`.

The rule in one line: **the marker comes off only when the next action is the merge itself.**

**Commit:** `docs(plan): graduate BL-CLASSNAME-ARRAY-JOIN-MIGRATION`


---

## Review-round economy

Every dispatch appends a row to a JSONL file under the branch's directory in `docs/review-rounds/`,
named for the first 12 characters of `git merge-base origin/main HEAD`, written by the wrapper at
dispatch time and committed with the arc. If any stage reaches 4 counted rounds, the sibling `.md` owes a filing with a
`## <stage> — <n> rounds` heading, an `**Examined:**` line, and at least one of
`**Mechanizable:**` / `**Judgment:**` / `**Infra:**`.

Two vectors are most likely to burn rounds here, both pre-empted in the spec rather than left to
discovery: relitigating the local-`cn` decision (spec §1.1 R1, fenced) and arguing the migration
changes bytes without first identifying which of the two stages (spec §1.1 R3, §4, §6).

## 12. Invariant-8 dual-gate findings and dispositions

_Filled at C2, and re-confirmed at C3 if any repair commit touched a UI file._

| Finding | Tier | Disposition |
|---|---|---|
| _pending_ | | |
