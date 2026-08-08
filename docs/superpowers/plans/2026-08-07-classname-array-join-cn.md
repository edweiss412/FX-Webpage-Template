# Plan — migrate array-join classNames to a local `cn` callee

**Spec:** `docs/superpowers/specs/2026-08-07-classname-array-join-cn.md` (canonical; section
references below are to it).
**Arc:** `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` (`BACKLOG.md:876`)
**Branch:** `refactor/classname-array-join-cn` · **Base:** `61281c23e`
**Implementer:** Opus / Claude Code (UI surface — routing hard rule).

`impeccable-gate: required — UI surface (18 files under components/ and app/); critique + audit both
run at Task 8, dispositions in §12.`

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
- **Extends** none.
- **Not applicable, declared:** `tests/auth/_metaInfraContract.test.ts` (no Supabase call added),
  `tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*` path),
  `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutating route or server action added),
  `tests/messages/_metaAdminAlertCatalog.test.ts` (no alert code added).

`vitest.projects.ts:34` sets `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so the
new test file needs no `testMatch` or workflow path-filter wiring. No new CI job.

---

## Commit-greenness note (read before Task 3)

Spec §4 requires stage 1 (migration) and stage 2 (canonicalization) to land as **separate commits**
so a reviewer can diff them apart. The consequence is deliberate and stated here so it is not
discovered as a finding: **the Task 3 commit has 10 known `pnpm lint` errors** — the violations the
migration makes visible for the first time (spec §2.4). They are fixed in Task 4, and the branch is
green from Task 4 onward. CI gates the PR's final state, not each intermediate commit. The Task 3
commit message must say this explicitly.

Merging the two tasks to keep every commit green would destroy the property that makes a 36-site
mechanical diff reviewable: that stage 1 changes no class token at all.

---

<!-- tasks: depth=2 -->

## Task 1 — rebase and confirm the site inventory still holds

<!-- task: red=`pnpm vitest run tests/specLint/canonicalClassArray.test.ts` ac=AC-2 -->

`fix/step3-a11y-cluster` is touching step-3 UI concurrently, including
`components/admin/wizard/Step3SheetCard.tsx`, which holds one of the 36 sites.

1. `git -C <worktree> fetch origin && git -C <worktree> rebase origin/main`.
2. Re-run the inventory probe **separator-agnostically** (spec §2.2 — a sweep keyed on the literal
   `.join(" ")` cannot see the escape spellings Task 6 closes) and confirm 36 sites across the 18
   files:
   ```
   git ls-files -z components app | tr '\0' '\n' | grep -E '\.tsx?$' \
     | xargs grep -ohE '\.join\([^)]*\)' | sort | uniq -c | sort -rn
   ```
   Expected at base: `38 .join(" ")` and no other whitespace separator — no `.join(' ')`, no
   `` .join(` `) ``. The 38 are the 36 classNames plus 2 data joins in
   `components/admin/wizard/step3ReviewSections.tsx` and
   `components/admin/review/sectionFreshness.ts` (do not migrate those two).
   **A whitespace-separated join at any other spelling means a new dark site landed** — stop and
   report; it is in scope for the migration and changes the §2.2 count.
3. The existing census guard must still pass. If the rebase changed the site set, **stop and report**
   — the spec's §2.2 table and §4.1 falsy audit are both keyed to the measured set, and a changed set
   invalidates the equivalence claim rather than merely shifting a line number.

**Failure mode caught:** a concurrent branch adding or removing an array-join site, silently
invalidating the equivalence claim's enumeration.

**Commit:** none (rebase only) unless the inventory shifted, in which case the spec is amended first.

## Task 2 — the `cn` helper

<!-- task: red=`pnpm vitest run tests/ui/cn.test.ts` ac=AC-1 -->

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

Fails: the module does not exist.

**GREEN.** Create `lib/ui/cn.ts` exactly as spec §3.1.

**Same commit — remove one obsolete assertion.** `tests/specLint/canonicalClassArray.test.ts:148-178`
("records that NO recognized callee exists to migrate to yet") asserts no `cn` helper exists
anywhere. Landing `cn` makes it fail by construction; its own failure message says a `cn` helper
existing is the signal to do this migration. Delete **only that `it(...)` block** in this commit. The
census itself and the rule-is-on pin stay until Task 6 — the census is still true and still load-bearing
until the migration lands.

**Failure mode caught:** a `cn` that trims, dedupes, or merges would silently change ~36 rendered
class strings. The negative-space rows are the only thing that catches it; a happy-path-only test
would pass against `tailwind-merge`.

**Commit:** `feat(ui): add a local cn class-name helper`

## Task 3 — migrate all 36 sites, under the operand-parity check

<!-- task: red=`node scripts/verify-cn-operand-parity.mjs` ac=AC-3 -->

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
  files at the pre-migration commit via `git show <sha>:<path>`, resolving `<sha>` once from
  `git rev-parse HEAD` taken **before** the migration edits (it is a local, unpushed-history-safe
  read, not a CI-time lookup — which is exactly why this is a script).
- Extract each array-join's operand list by bracket-matching backward from the join, tolerating an
  intervening `.filter(Boolean)`; extract the corresponding `cn(...)` argument list from the working
  tree; assert the same operand sequence, comparing after stripping comments and insignificant
  whitespace.
- **Declared-delta allowance.** Class tokens rewritten in Task 4 are permitted only where spec §6
  declares them (C1–C6), as an explicit `EXPECTED_TOKEN_DELTAS` map. An undeclared token change
  fails. (On the Task 3 run nothing has been canonicalized yet, so the map is inert here; it earns
  its keep when the script is re-run at the end of Task 4.)
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

**Do not run `eslint --fix` in this task.** That is Task 4, and conflating them defeats the staging.

`pnpm lint` is expected to report exactly the 10 errors of spec §2.4 at the end of this task — see
the commit-greenness note above, and say so in the commit message.

**Failure mode caught:** the parity script catches a migration that drops, reorders, or rewrites an
operand — the one way a mechanical 36-site diff changes rendering while looking correct in review.
The `DayCard` assertions catch the single site where operands are preserved but bytes still move.

**Commit:** `refactor(ui): migrate array-join classNames to the cn callee`

## Task 4 — canonicalize, under a captured dimensional baseline

<!-- task: red=`pnpm lint` ac=AC-5 -->

The two sizing canonicalizations (C1, C5) must be shown not to move geometry. That requires a
**baseline captured before the fix is applied** — a post-hoc "width ≤ token" assertion would pass on
a box that changed from 45px to 55px, and "height ≥ token" would pass on 200px→176px. So capture and
compare are two halves of this one task, in that order.

**Step 1 — capture the baseline (tree is migrated, NOT yet canonicalized).**

Stage 1 changed no class token (spec §4), so the geometry here is identical to base. Run the
dimension spec in capture mode and commit
`tests/e2e/__baselines__/canonical-dimensions.json`, recording `getBoundingClientRect()` for:

- the step-indicator connector rule, `components/admin/OnboardingWizard.tsx:200-203`
  (`h-px max-w-[60px] flex-1 rounded-full`) — the C1 target;
- the `RightNowHero` card, `components/crew/RightNowHero.tsx:481` — the C5 target.

**Step 2 — RED.** `pnpm lint` reports the 10 errors across 6 files of spec §2.4.

**Step 3 — GREEN.** Run `eslint --fix` scoped to the 18 files, then verify the applied fixes are
**exactly** C1–C6 from spec §6:

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

**Step 4 — assert geometry is unchanged.** Re-run the dimension spec against the captured baseline:
every recorded box matches within **0.5px**. This is an equality check against a real prior
measurement, not a one-sided bound against a token.

Re-run `node scripts/verify-cn-operand-parity.mjs`; it must now pass with the C1–C6 deltas allowed
and no others.

**Failure mode caught:** a canonicalization whose token does not resolve to the value it replaced,
moving layout by a few pixels that no unit test and no reviewer would see.

**Commit:** `fix(ui): canonicalize the classes the cn migration made visible`

## Task 5 — dimension harness readiness and the transition audit

<!-- task: red=`pnpm exec playwright test tests/e2e/canonicalDimensions.spec.ts` ac=AC-11 -->

The Task 4 measurements run in a real browser — jsdom does not compute layout — so the spec they use
is a **Playwright** spec driven by `pnpm exec playwright test`, never through vitest.

**Harness readiness** (`docs/agents/writing-plans.md` e2e checklist):

- **Boot:** the repo's existing Playwright setup and its production-build server.
  `tests/e2e/admin-layout-dimensions.spec.ts` is an existing `getBoundingClientRect()` dimension spec
  here — follow its boot, gate, and assertion shape rather than inventing a second pattern.
- **Readiness gate:** await the surface's established hydration gate before the first measurement,
  never `networkidle` alone. A rect read pre-hydration is a confident wrong number.
- **Detach safety:** both targets are static on their page, so no sampler outlives its element. The
  crossfade measurement below samples a live element — it must guard against auto-wait hanging on an
  unmounted node.

**Transition audit.** Spec §9.5 declares that no transition is added, removed, or altered; that is
checked, not trusted, because `components/crew/RightNowHero.tsx` is both a migrated file (3 sites)
and the repo's most transition-dense surface — it drives an `AnimatePresence` crossfade over the very
card whose height C5 touches.

- Enumerate every `AnimatePresence`, `motion.*`, ternary render, and conditional block across the 18
  migrated files, and confirm each still carries the `initial` / `animate` / `exit` props it carried
  at base. The migration touches `className` values only; a changed motion prop means the rewrite
  escaped its scope.
- **Compound case:** measure the C5 card's height **during** the crossfade, not only at rest. The
  176px constant is a ratified invariant (`app/globals.css:205-209`), and a min-height change would
  show up only mid-transition.
- `tests/crew/transitionAudit.test.ts` passes **unchanged**. An assertion there that moves is a
  signal the migration was not operand-preserving, not a reason to update the audit.

**Failure mode caught:** a geometry or motion regression visible only while a transition is in
flight, which a rest-state-only check reports as green.

**Commit:** `test(ui): pin the canonicalized dimensions and the transition audit`

## Task 6 — replace the census guard

<!-- task: red=`pnpm vitest run tests/specLint/canonicalClassCallee.test.ts` ac=AC-6 -->

**RED.** Write `tests/specLint/canonicalClassCallee.test.ts` (spec §7):

1. **Zero-tolerance recognizer, keyed on the join's separator and position-free.** Do **not** reuse
   the census scanner's shape. It carries three independent escapes, all probed silent in spec §7.1:
   it anchors on the literal `className={[` / `const x = [`, it matches the separator `.join(" ")`
   exactly, and it scans only `/\.tsx?$/`.

   Implement spec §7.1's accept-set instead: report **every array join whose separator is a
   non-empty whitespace string literal at any quote style, anywhere in any UI source file**
   (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`), with no positional anchor. Carry the two legitimate
   data joins as a **named exemption list with a reason each** —
   `components/admin/wizard/step3ReviewSections.tsx` and
   `components/admin/review/sectionFreshness.ts`, both `[row.date, row.time]` — so a new whitespace
   join fails by default rather than being silently absorbed by a heuristic.

   Calibration is already probed (spec §7.1): the recognizer yields 38 whitespace-join sites at base
   — 36 classNames + the 2 exemptions — and after Task 3 must report **zero**.
2. **The recognizer's premise, stated executably.** A zero-tolerance guard cannot prove its scanner
   works by finding a non-empty set — "found nothing" is both the passing state and what a broken
   scanner reports. So: run the scanner against an **inline fixture string** containing a known
   array-join className and assert it **is** found, immediately above the assertion that the real
   tree yields none. Unconditional, not inside a `.each` callback.
   **The fixture carries all seven escape shapes from spec §7.1** — ternary-at-className, template
   interpolation, backtick separator, single-quote separator, call-argument position, via-variable
   const, and the `.jsx` extension — plus the three negatives that must NOT hit (`.join(", ")`,
   `.join("")`, `cn(...)`). A fixture exercising only `.join(" ")` in the `className={[` position
   would let the recognizer silently regress to the census scanner's shape while its premise check
   still passed: the vacuous premise reintroduced one level up.
3. **Rule-is-on pin.** `eslint.config.mjs` still sets
   `"better-tailwindcss/enforce-canonical-classes": "error"`. A guard that outlives its rule pins
   nothing.
4. **The coverage premise pair** (spec §7.2) — the executable replacement for the deleted census's
   justification. Write a temp file that imports `cn` and calls it with a seeded canonical violation
   (`min-h-(--spacing-tap-min)`), at **both** a plain-literal argument and a ternary argument. Run
   ESLint programmatically against the repo config.
   - **Positive:** the rule reports it at both argument positions.
   - **Negative control:** the same seeded violation inside an array join in the same file is **not**
     reported — written at all three separator spellings, since all three were probed dark.

   The negative control is what makes the pair discriminating — without it, a harness pointed at the
   wrong file or a rule that reported everything would satisfy the positive check vacuously. It also
   permanently documents, executably, why the migration was necessary once the array-join sites are
   gone.

**GREEN.** Delete `tests/specLint/canonicalClassArray.test.ts`.

**Failure mode caught:** deleting the census and leaving nothing behind, so a new array-join
className lands dark — the exact regression the census existed to stop (spec §1.1 R4).

**Commit:** `test(lint): replace the array-join census with a zero-tolerance callee guard`

## Task 7 — file the two out-of-scope entries

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-10 -->

Both carry probe evidence, so both clear the ledger filing bar without an
`**Reachability:** INFERRED, NOT PROBED` field (spec §11).

- **`BL-SHADOW-TILE-ARROW-SYNTAX`** — 21 `shadow-(--shadow-tile)` class-string sites tree-wide (24
  textual matches across 18 files, 3 of them in doc comments), probed unreported
  by the rule. Include the spec §9.1 mechanism table: the rule canonicalizes tokens whose `@theme`
  value is a literal and skips those defined through a `var()` indirection, so **every** `-runtime`
  indirection token in this project is invisible to it — not just shadows. The entry also owns
  correcting `app/globals.css:288`, which claims the plugin enforces this and is factually wrong.
  Class-sweep exception (c): spans files this arc does not touch.
- **`BL-CLASS-CONST-LINT-BLINDSPOT`** — class strings in arbitrary-named consts and object values are
  not traversed (spec §9.2 lists the surviving sites). Attach the spec §2.3 probe table as evidence.
  Note the cheap known repair (rename to `classes`, which the plugin's variable selector matches, or
  wrap in `cn(...)`). Class-sweep exception (c): a different mechanism needing its own recognizer
  decision.

Per spec §8, `BL-CANONICAL-CLASS-ARRAY-BLINDSPOT` needs **no** edit — already CLOSED at
`docs/superpowers/plans/2026-08-04-backlog-convergence-c-guards-closeout.md:15`. Do not invent a
graduation edit for it.

**Commit:** `docs(plan): file the two lint-coverage residuals this arc leaves open`

## Task 8 — invariant 8 dual gate

<!-- task: red=`pnpm lint` ac=AC-9 -->

**Pre-code mechanical checklist first** (it is a discovery mechanism; the gate is only a verifier):
em-dash ban in user-visible copy, apostrophe literals, 44px tap targets (`min-h-tap-min` and
companions), canonical type/token classes (`text-xs/relaxed`, `text-subtle`). This arc adds no
user-visible copy and no new color token, so no new contrast pin is owed — state that rather than
skipping it silently.

Run `/impeccable critique` **and** `/impeccable audit` on the diff, with the canonical v3 setup gates
(the skill's context-load step over `PRODUCT.md` + `DESIGN.md`, then the register reference read).
P0 and P1 findings
are fixed or explicitly deferred via a `DEFERRED.md` entry. Findings and dispositions go in §12 of
this plan.

Expect a low yield: the arc changes no layout, no copy, and no color, and the six class-token
canonicalizations are semantics-preserving. A P0/P1 here most likely means a canonicalization was
**not** equivalent, so treat one as a signal to re-check spec §6 rather than as a styling nit.

**Commit:** `fix(ui): impeccable dual-gate dispositions` (only if findings require changes)

## Task 9 — whole-diff cross-model review

<!-- task: red=`pnpm test` ac=AC-8 -->

Full suite + `pnpm typecheck` green first. Then dispatch a whole-diff Codex review through
`scripts/codex-guard.mjs` with `--stage diff`, iterating to APPROVE.

The brief carries: REVIEWER ONLY, fresh-eyes posture, `VERDICT:` + `FINDINGS:` instructions, the
consequence bound and threat-model fence (the guard surface in Task 6 makes this mandatory), and the
do-not-relitigate list from spec §1.1 — **including the ratified local-`cn` decision**, which is the
single most likely thing for a fresh reviewer to reopen.

Per the split-review discipline, a 20-file diff is past the point where whole-diff reviews die
silently: dispatch scoped reviews per surface (helper + tests; the 18 migrated components; the guard
replacement) with the file list inlined in each brief, rather than attempting whole-diff first.

**Commit:** per round, if repairs are needed.

## Task 10 — CI, merge, ledger graduation

<!-- task: red=`pnpm ledger:claims --check BL-CLASSNAME-ARRAY-JOIN-MIGRATION` ac=AC-10 -->

1. Push; open the PR; wait for **real CI green**, not just local (local-passes-CI-fails is its own
   bug class).
2. **In the PR's last commit, before the merge:** archive `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` and
   remove its `**Status:** IN PROGRESS · **Branch:** …` marker **in that same commit**. Archives
   categorically reject in-progress entries, and a marker that reaches `main` names a branch the
   merge has just deleted — `tests/docs/_metaLedgerInProgress.test.ts` then fails on `main` until
   someone clears it.
3. `gh pr merge --merge`, then fast-forward local `main` and verify
   `git rev-list --left-right --count main...origin/main` reports `0  0`.

**Commit:** `docs(plan): graduate BL-CLASSNAME-ARRAY-JOIN-MIGRATION`

<!-- tasks: end -->

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

_Filled at Task 9._

| Finding | Tier | Disposition |
|---|---|---|
| _pending_ | | |
