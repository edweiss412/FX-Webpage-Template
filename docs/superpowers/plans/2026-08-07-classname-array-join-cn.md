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
| AC-3 | `scripts/verify-cn-operand-parity.mjs` reports parity for all 36 sites; output in the PR body. One-shot, not a tracked test. |
| AC-4 | `DayCard` `tone === "set"` dot: unchanged `classList`, no trailing space. |
| AC-5 | `pnpm lint` clean; fixes applied are exactly C1–C6, no undeclared rewrite. |
| AC-6 | Census guard deleted; zero-tolerance guard replaces it with its premise fixture. |
| AC-7 | Premise pair passes: drift in `cn(...)` reported at literal AND ternary args; same drift in an array join not reported — all three separator spellings, in BOTH the inline and via-variable shape. Recognizer fixture catches all seven escape shapes. |
| AC-8 | Full suite green; `pnpm typecheck` clean. |
| AC-9 | Invariant 8 dual-gate run; P0/P1 fixed or deferred; dispositions recorded. |
| AC-10 | Ledger entry archived, marker removed in the PR's last commit; two new entries filed. |
| AC-11 | C1/C5 match a baseline captured BEFORE canonicalization, within 0.5px, via Playwright; `tests/crew/transitionAudit.test.ts` unchanged and green. |

---

## Meta-test inventory

- **Creates** `tests/specLint/canonicalClassCallee.test.ts` (zero-tolerance recognizer + premise
  fixture + eslint-coverage premise pair).
- **Deletes** `tests/specLint/canonicalClassArray.test.ts` (census guard).
- **Extends** `tests/ci/_metaE2eWorkflowCoverage.test.ts` — adds a `PATH_GATED` row for
  `tests/e2e/canonical-layout-dimensions.spec.ts` to `LOCAL_ONLY_ALLOWLIST`. **Not optional:** that
  meta-test requires every Playwright spec to be PR-covered or reason-allowlisted, and because
  `admin-layout-e2e.yml` carries a `pull_request.paths` filter, a spec wired only into that
  workflow's command and path list counts as path-gated and needs the row. Omitting it leaves the
  full Vitest suite red — a third, unintended red that would contradict the greenness table above.
  `tests/e2e/admin-layout-dimensions.spec.ts`, `tests/e2e/admin-nav-layout-dimensions.spec.ts`, and
  `tests/e2e/bell-panel-layout.spec.ts` are the precedent rows to copy.
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
4. If either half moved, **stop and amend the spec** before implementing. §2.2's table, §4.1's audit,
   and §6's delta table are all keyed to the measured base.

**Verified by:** the two sweeps above plus the existing census guard, all green.
**Commit:** none (rebase only), unless the audit moved — then the spec amendment is its own commit.


<!-- tasks: depth=2 -->

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

Fails: the module does not exist.

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

<!-- task: red=`node scripts/verify-cn-operand-parity.mjs --base 61281c23e` ac=AC-2,AC-3,AC-4 -->

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
  **The SHA is an explicit required argument, never a re-resolution of `HEAD`.** The script takes
  `--base <sha>`, and both invocations (the RED here, and the re-run in Task 6) pass the
  same **branch-base** SHA, `61281c23e`. Re-resolving `HEAD` at the second invocation would read the
  already-migrated tree, find zero array joins, and pass vacuously — the exact degenerate success the
  premise below exists to catch. It is a local history read, never a CI-time lookup, which is why
  this is a script (spec §4.3).
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
   scanner reports. So: run the scanner against an **inline fixture string** containing a known
   array-join className and assert it **is** found, immediately above the assertion that the real
   tree yields none. Unconditional, not inside a `.each` callback.
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

<!-- task: red=`pnpm exec playwright test --project=desktop-chromium tests/e2e/canonical-layout-dimensions.spec.ts` ac=AC-11 -->

The two sizing canonicalizations (C1, C5) must be shown not to move geometry, and that is only
provable against a baseline captured **before** the fix lands. A post-hoc one-sided bound does not
prove it: "width ≤ token" passes on a box that went 45px → 55px, and "height ≥ token" passes on
200px → 176px. So the harness and the capture come first, as their own task, and the canonicalization
that must not disturb them comes second.

The tree at this point is migrated but **not** canonicalized. Stage 1 changed no class token
(spec §4), so geometry here is identical to base — which is what makes this a valid baseline.

**RED.** Write `tests/e2e/canonical-layout-dimensions.spec.ts`, asserting each target's
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

1. Name the file `canonical-layout-dimensions.spec.ts` **and** add an explicit alternative to the
   `desktop-chromium` project's `testMatch` in `playwright.config.ts`. Do not rely on it incidentally
   matching the existing `layout-dimensions` alternative as a substring — implicit matching is
   exactly the silence the config comment warns about.
2. **Wire it into CI — the invocation AND the path filter.** Add the spec to the
   `admin-layout-e2e.yml` desktop-chromium invocation, which already runs this repo's dimension
   specs. `pnpm test` is Vitest only and will never execute a Playwright spec, so without this AC-11
   stays dark in real CI however well the spec is written.

   **Adding the invocation alone is not enough.** That workflow fires on an explicit `paths:`
   allow-list, and none of this gate's inputs is on it. This PR would run it only incidentally,
   because it edits the workflow file itself; a later ordinary edit to a guarded component would not.
   Add **all five** direct inputs:

   ```yaml
   - "tests/e2e/canonical-layout-dimensions.spec.ts"
   - "tests/e2e/__baselines__/canonical-dimensions.json"
   - "components/admin/OnboardingWizard.tsx"     # C1 target
   - "components/crew/RightNowHero.tsx"          # C5 target
   - "app/globals.css"                           # the tokens both assertions resolve through
   ```

   The workflow's own header documents this exact failure class — "a spec in a project no workflow
   runs is a spec that silently rots" — and a spec whose triggers omit its subject rots the same way,
   just more quietly, because the job exists and simply never fires.

3. **Register the spec in the e2e coverage meta-test.** Add a `PATH_GATED` row for
   `tests/e2e/canonical-layout-dimensions.spec.ts` to `LOCAL_ONLY_ALLOWLIST` in
   `tests/ci/_metaE2eWorkflowCoverage.test.ts`. That test asserts every e2e spec is either PR-covered
   or reason-allowlisted, and a `pull_request.paths`-filtered workflow counts as path-gated, so
   without the row the full Vitest suite goes red the moment the spec lands. Copy the shape of the
   existing `admin-layout-dimensions.spec.ts` row.

**Harness readiness** (`docs/agents/writing-plans.md` e2e checklist):

- **Boot:** the repo's existing Playwright setup and its production-build server.
  `tests/e2e/admin-layout-dimensions.spec.ts` is an existing `getBoundingClientRect()` dimension spec
  here — follow its boot, gate, and assertion shape rather than inventing a second pattern.
- **Readiness gate:** await the surface's established hydration gate before the first measurement,
  never `networkidle` alone. A rect read pre-hydration is a confident wrong number.
- **Detach safety:** both rest-state targets are static. The crossfade measurement in Task 5 samples
  a live element and must guard against auto-wait hanging on an unmounted node.

**GREEN.** Run the spec in capture mode, commit `tests/e2e/__baselines__/canonical-dimensions.json`,
and confirm the spec now passes against it.

**Capture the mid-crossfade height too, not only the rest-state rects.** Spec §9.5 and Task 6 both
rest on the claim that C5 cannot move the `RightNowHero` card's height, and the card's own ratified
invariant is that it holds 176px *through* a state crossfade (`app/globals.css:205-209`). A
rest-state-only baseline cannot support that claim: rest rects can stay equal while only the
mid-transition height moves, and every other check in the plan would still pass —
`tests/crew/transitionAudit.test.ts` is structural and measures no geometry, and the existing
compound-transition suites are skipped. So the baseline records, alongside the two rest rects, the
card's height sampled **during** the crossfade, driving the state change and sampling before it
settles. That sampled value is the comparator Task 6 needs; without it, the mid-crossfade assertion
there has nothing to compare against and proves nothing.

**Failure mode caught:** a dimension gate that never executes — the config's own documented failure —
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
2. **Operands.** Re-run `node scripts/verify-cn-operand-parity.mjs --base 61281c23e`. It must pass
   with the C1–C6 deltas allowed and no others. Note the explicit `--base`: re-resolving `HEAD` here
   would compare the migrated tree against itself.
3. **Transitions.** Spec §9.5 declares no transition is added, removed, or altered — checked, not
   trusted, because `components/crew/RightNowHero.tsx` is both a migrated file (3 sites) and the
   repo's most transition-dense surface, driving an `AnimatePresence` crossfade over the very card
   whose height C5 touches.
   - Enumerate every `AnimatePresence`, `motion.*`, ternary render, and conditional block across the
     18 migrated files; each must still carry the `initial` / `animate` / `exit` props it carried at
     base. The migration touches `className` values only; a changed motion prop means the rewrite
     escaped its scope.
   - **Compound case:** re-measure the C5 card's height **during** the crossfade and compare it to
     the mid-crossfade value captured in Task 5's baseline, within the same 0.5px tolerance. Rest
     equality is not sufficient: a min-height change surfaces only mid-transition, and rest rects
     would stay equal through it. This is why Task 5 captures a mid-crossfade sample and not just the
     two rest rects — an assertion here with no pre-change comparator would restate the invariant
     rather than test it.
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
The steps below are procedural — a docs filing, two gate runs, a review loop, a merge — and none has
a meaningful failing-first state. Declaring a `red=` for them would mean pointing a marker at a
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

**Commit:** per round, if repairs are needed.

## C4 — CI, merge, ledger graduation

Ordering matters here: the graduation commit must be **in** the PR and must itself be CI-green.

Two requirements pull against each other and the ordering below is what satisfies both: invariant 12
wants the in-progress marker to survive until the PR's **last** commit, and the merge must be
authorized by CI green on the **exact head** being merged.

1. Push; open the PR. **The marker stays on** through everything below until step 4.
2. Drive CI to green with the marker still in place, repairing and re-pushing as needed. This is
   where repair commits belong — while the branch is still declaring its claim.
3. Confirm the branch is otherwise merge-ready: C1–C3 complete, review APPROVE, CI green.
4. **Only now author the graduation commit:** archive `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` and remove
   its `**Status:** IN PROGRESS · **Branch:** …` marker **in that same commit**. Archives
   categorically reject in-progress entries, and a marker that reaches `main` names a branch the
   merge just deleted — `tests/docs/_metaLedgerInProgress.test.ts` then fails on `main` until someone
   clears it.
5. Push it and wait for CI green **on that commit**, not on an earlier one, and not local-only
   (local-passes-CI-fails is its own bug class).
6. **If that run fails, REVERT the whole graduation commit — do not re-add the marker on its own.**
   Restoring only the marker would stamp `**Status:** IN PROGRESS` onto an entry that now lives in
   the archive, and archives categorically reject in-progress entries: the "recovery" is itself
   invalid and `tests/docs/_metaLedgerInProgress.test.ts` fails on it. The correct recovery restores
   the complete pre-graduation state — the entry back in the live ledger, carrying its marker, and
   nothing in the archive — which `git revert <graduation-sha>` does in one step. Then repair with
   the claim genuinely live, return to step 2, and re-author graduation when green.

   The distinction is not pedantic: leaving the branch live without its claim is the undeclared-work
   collision invariant 12 exists to prevent, and an archived-but-marked entry is a second, louder
   failure layered on top of it.
7. `gh pr merge --merge`, then fast-forward local `main` and verify
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
