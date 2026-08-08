# Spec — migrate array-join classNames to a local `cn` callee

**Arc:** `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` (`BACKLOG.md:876`)
**Branch:** `refactor/classname-array-join-cn`
**Base:** `61281c23e`
**Date:** 2026-08-07
**Surface:** UI (18 files under `components/` + `app/`) — invariant 8 applies.

---

## 1. Purpose

`better-tailwindcss/enforce-canonical-classes` (`eslint.config.mjs:72`, severity `"error"`) cannot
traverse `[...].join(" ")`. Tailwind drift inside those classNames escapes `pnpm lint` and therefore
escapes CI. The blind spot is currently *bounded* by a census guard
(`tests/specLint/canonicalClassArray.test.ts`) but not *closed*.

This arc closes it: introduce a local `cn` helper — a callee the plugin already recognizes by default
— migrate every array-join className to it, canonicalize what the rule then reports, and replace the
census guard with a zero-tolerance guard that states its premise executably.

**The blind spot was hiding real drift.** Probed on this branch (§2.4): once the rule can see inside,
it reports **10 canonical violations across 6 files** that `pnpm lint` passes over today. This is not
a hygiene refactor with a hypothetical payoff; the payoff is measured.

---

## 1.1 Resolved scope — do not relitigate

Each row is ratified. A reviewer may verify the citation; re-opening the decision is out of scope.

| # | Decision | Ratification |
|---|---|---|
| R1 | The callee is a **local** helper at `lib/ui/cn.ts`. **No new dependency.** `clsx` was considered and rejected; `tailwind-merge` was considered and rejected explicitly because its conflict-resolution semantics are a behavior risk this arc will not take on. | User decision 2026-08-07, recorded here as ratified. |
| R2 | `cn` filters falsy and joins with a single space. It does **not** merge, dedupe, resolve Tailwind conflicts, trim interior whitespace, or accept nested arrays/objects. §3.2 is the complete semantics. | R1 corollary; §3.2. |
| R3 | The equivalence claim is **staged**: stage 1 (migration) preserves emitted strings modulo one enumerated whitespace normalization; stage 2 (`eslint --fix`) *deliberately* changes emitted tokens at the 6 enumerated sites in §6. A reviewer objecting that "the migration changes bytes" must first check which stage. | §4, §6. |
| R4 | The census guard is **replaced, not merely deleted**. Its file is deleted; its recognizer survives as a zero-tolerance guard (§7.1). Deleting the recognizer outright would re-admit new array-join classNames — the exact regression the census exists to stop. This is fenced in **both** directions: do not argue for keeping the 18-file census (its premise dies with the migration), and do not argue for deleting the recognizer (its premise outlives the migration). | §7. |
| R5 | `shadow-(--shadow-tile)` → `shadow-tile` is **out of scope**, and `app/globals.css:288` is factually wrong to claim the plugin enforces it. 21 class-string sites tree-wide, probed unreported (§9.1). Class-sweep exception (c). Filed as a backlog entry. | §9.1, §11. |
| R6 | String consts holding class literals under arbitrary names (`TRACK_BASE`, `BASE_CLASS`, `SIZE_CLASS[...]`) remain unlinted after this arc. That is a **different** blind spot with a different mechanism, never covered by the census guard, and out of scope. Documented limit + backlog entry, not a finding against this arc. | §9.2, §11. |
| R7 | The backlog entry's "33 sites" is **stale**; the probed count is **36** across the same 18 files (§2.2). The entry is corrected, not the count. | §2.2. |

---

## 2. Current state — probed, not asserted

All probes ran on this branch at base `61281c23e`. Commands and outputs are in §2.5.

### 2.1 The rule and its blind spot

`eslint.config.mjs:72` sets `"better-tailwindcss/enforce-canonical-classes": "error"` for
`**/*.{ts,tsx,js,jsx,mjs,cjs}` with `entryPoint: "app/globals.css"` (`eslint.config.mjs:58-60`).
The plugin is `eslint-plugin-better-tailwindcss@4.5.0`.

`^cn$` is a **default** callee selector. In the installed plugin, the `options/callees/cn` module
exports `CN_STRINGS` (matcher `MatcherType.String`) and `CN_OBJECT_KEYS`, and both are included in
the `DEFAULT_CALLEE_SELECTORS` array exported by `options/default-options`. No config change is
needed to make `cn(...)` visible. (Both are vendored paths under `node_modules/`, cited by module
name rather than repo path because they are not tracked here.)

### 2.2 The site inventory — 36 sites, 18 files

The backlog entry says 33. Probed count is **36**. The 3 uncounted sites are the
`components/crew/primitives/PersonRow.tsx` module consts `CHIP_CLASS`, `PARTIAL_CHIP_CLASS`, and
`ACTION_CLASS` (lines 83, 99, and 117) — array-joins assigned to consts in a file the census lists
under `CENSUS_DIRECT`, so the census *covers* the file while the tally missed the sites.

| File | Sites | Lines | `.filter(Boolean)` |
|---|---|---|---|
| `components/admin/OnboardingWizard.tsx` | 4 | 167, 175, 182, 200 | no |
| `components/admin/PublishedToggle.tsx` | 2 | 298, 307 | no |
| `components/admin/settings/AutoPublishToggle.tsx` | 2 | 130, 137 | no |
| `components/admin/settings/DeveloperToggleButton.tsx` | 2 | 91, 96 | no |
| `components/admin/settings/NotifyToggle.tsx` | 2 | 138, 145 | no |
| `components/admin/wizard/Step3SheetCard.tsx` | 1 | 577 | no |
| `components/atoms/Avatar.tsx` | 1 | 77 | no |
| `components/atoms/KeyValue.tsx` | 1 | 121 | **yes** |
| `components/atoms/Section.tsx` | 1 | 175 | no |
| `components/crew/RightNowHero.tsx` | 3 | 481, 557, 586 | no |
| `components/crew/SectionChipLink.tsx` | 1 | 52 | no |
| `components/crew/primitives/DayCard.tsx` | 3 | 70, 77, 98 | no |
| `components/crew/primitives/PersonRow.tsx` | 6 | 83, 99, 117, 173, 176, 181 | no |
| `components/crew/sections/GearSection.tsx` | 2 | 303, 382 | 303 **yes**, 382 no |
| `components/crew/sections/TodaySection.tsx` | 2 | 571, 645 | **both** |
| `components/crew/sections/TravelSection.tsx` | 1 | 637 | **yes** |
| `components/shared/AccentButton.tsx` | 1 | 121 | **yes** |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` | 1 | 174 | no |
| **Total** | **36** | | 6 filtered / 30 unfiltered |

**The 18 files are the complete set, and the sweep proving it is separator-agnostic.** Sweeping every
tracked `.tsx?` under `components/` and `app/` for `.join(` at *any* separator yields 38 occurrences
of `.join(" ")` and no other whitespace separator anywhere — no `.join(' ')`, no `` .join(` `) ``.
Of the 38, 36 are the classNames tabulated above and 2 are data joins, correctly outside the census:
`components/admin/wizard/step3ReviewSections.tsx:1353` and
`components/admin/review/sectionFreshness.ts:537`. They are NOT the same expression: the first is
`[leg.date, leg.time].filter(...).join(" ")` and the second is
`[row.date, row.time].filter(...).join(" ")`. The distinction matters downstream — an exemption
written against the wrong operand text would reject legitimate code, and one broadened to cover both
by loosening the operand match would silently admit a future class join.
Every remaining `.join(...)` in the tree uses a non-whitespace separator (`", "`, `""`, `"; "`,
`"="`, `" | "`, `" · "`, `" / "`, `"\u0000"`, `"."`) and joins data, not classes.

The separator-agnostic form matters beyond bookkeeping: a sweep keyed on the literal `.join(" ")`
would have reported the same 36 while being unable to see the escape §7.1 closes.

### 2.3 What the plugin does and does not traverse — probed

A probe file exercised each shape against the real config, with a plain-string className as the
positive control and an array-join as the negative control. Seeded drift was
`min-h-(--spacing-tap-min)` (canonicalizes to `min-h-tap-min`).

| Shape | Reported? |
|---|---|
| `className="… min-h-(--spacing-tap-min)"` (control) | **yes** |
| `className={["…", cond ? "min-h-(--spacing-tap-min)" : "…"].join(" ")}` (control) | **no** — blind spot confirmed live |
| `cn("…", "min-h-(--spacing-tap-min)")` | **yes** |
| `cn("…", cond ? "min-h-(--spacing-tap-min)" : "…")` | **yes** — ternaries traverse |
| `cn("…", cond ? "min-h-(--spacing-tap-min)" : null)` | **yes** — null branches traverse |
| `const anyName = cn(…)` then used as a className | **yes** — the callee match does not depend on the variable's name |
| `cn(IDENT, …)` where `IDENT` is a class-string const | **no** — identifier args are not followed |
| `const TRACK_BASE = "… min-h-(--spacing-tap-min)"` | **no** |
| `const classes = "… min-h-(--spacing-tap-min)"` | **yes** — `^classes$` variable selector |
| `const SIZE = { sm: "… min-h-(--spacing-tap-min)" }` | **no** |

Two consequences, both load-bearing:

- Every one of the 36 sites becomes visible, because at every site the class *literals* are inline
  array elements, which become inline `cn` arguments.
- Identifier arguments stay dark. That is §9.2 / R6 — a pre-existing, different blind spot.

### 2.4 What the rule reports once it can see — 10 violations, 6 files

A throwaway full migration (36 sites rewritten mechanically, `cn` imported, tree reverted
afterward) produced these, and only these:

| File:line (post-migration) | Reported | Canonical form |
|---|---|---|
| `OnboardingWizard.tsx:202` | `max-w-[60px]` | `max-w-confirm-box` |
| `PublishedToggle.tsx:309` | `h-5`, `w-5` (×2) | `size-5` |
| `AutoPublishToggle.tsx:139` | `h-5`, `w-5` (×2) | `size-5` |
| `NotifyToggle.tsx:147` | `h-5`, `w-5` (×2) | `size-5` |
| `RightNowHero.tsx:487` | `min-h-(--spacing-right-now-min-h)` | `min-h-right-now-min-h` |
| `TodaySection.tsx:573` | `text-sm`, `leading-snug` (×2) | `text-sm/snug` |

`max-w-[60px]` → `max-w-confirm-box` is the only rewrite where the emitted CSS could in principle
differ; it does not. `app/globals.css:186` defines `--spacing-confirm-box: 60px`, exactly the
bracket value. `app/globals.css:216` defines `--spacing-right-now-min-h: 176px`, and the arrow form
and the utility resolve to the same token by construction.

### 2.5 Probe transcript

```
$ git ls-files -z components app | tr '\0' '\n' | grep -E '\.tsx?$' \
    | xargs grep -c '\.join(" ")' | grep -v ':0$'
→ 20 files; 18 census files (36 sites) + step3ReviewSections.tsx + sectionFreshness.ts (data joins)

$ npx eslint components/__probe__/CnProbe.tsx        # shape matrix, §2.3
→ 5 errors: plain-string control, cn+literal, cn+ternary, cn+ternary-null, cn-in-arbitrary-const
→ 0 errors on: array-join control, identifier arg, arbitrary-named string const, object values

$ node /tmp/codemod.mjs <18 files> && npx eslint <18 files>
→ 36 sites migrated; 10 errors / 6 files (§2.4); tree reverted via git stash -u && git stash drop

$ git ls-files -z components app | tr '\0' '\n' | grep -E '\.tsx?$' \
    | xargs grep -ohE '\.join\([^)]*\)' | sort | uniq -c | sort -rn
→ 38 .join(" ") · 16 .join(" · ") · 12 .join(", ") · 7 .join(",") · 4 .join("")
  · 3 .join("=") · 2 .join("; ") · 2 .join(" / ") · 1 .join("\u0000") · 1 .join(". ")
  · 1 .join(" | ")                      # no backtick/single-quote separator anywhere

$ npx eslint <probe with .join(` `) and .join(' ') classNames>   # §7.1 escape probe
→ 0 problems — neither the rule NOR the census scanner sees these spellings
$ npx prettier --parser typescript <same>
→ all three spellings preserved; Prettier does not normalize them to one

$ node <§7.1 recognizer prototype>              # calibration against the live tree
→ ALL whitespace-join sites: 38 · EXEMPT (named data joins): 2 · REPORTED: 36 across 18 files
$ node <same, against the seven escape shapes + three negatives>
→ HIT on all 7 escapes; miss on .join(", "), .join(""), and cn(...)
```

---

## 3. The `cn` helper

### 3.1 Location and shape

`lib/ui/cn.ts` (new file; `lib/ui/` does not exist today). Imported as `@/lib/ui/cn`
(`tsconfig.json:26` maps `@/*` → `./*`).

```ts
export type ClassValue = string | false | null | undefined;

export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}
```

### 3.2 Semantics — complete, and complete by intent

`cn` is exactly `Array.prototype.filter(Boolean)` followed by `join(" ")`. Everything below is a
behavior the reviewer can hold the implementation to; there is no unstated behavior.

| Input | Output | Note |
|---|---|---|
| `cn()` | `""` | no args |
| `cn("a")` | `"a"` | |
| `cn("a", "b")` | `"a b"` | single space |
| `cn("a", "", "b")` | `"a b"` | `""` dropped — **not** `"a  b"` |
| `cn("a", null, "b")` | `"a b"` | |
| `cn("a", undefined, "b")` | `"a b"` | |
| `cn("a", false, "b")` | `"a b"` | |
| `cn(null, undefined, false, "")` | `""` | all-falsy |
| `cn("a  b")` | `"a  b"` | interior whitespace **preserved**; `cn` never trims or collapses |
| `cn("a", "a")` | `"a a"` | **no** dedupe |
| `cn("p-2", "p-4")` | `"p-2 p-4"` | **no** conflict resolution — R1 |

Deliberately **not** in the type: `number`, `object`, nested `ClassValue[]`. No call site needs them;
excluding them keeps the eslint traversal premise in §2.3 narrow and true, and keeps `0` from ever
being silently dropped by a `Boolean` filter.

### 3.3 Guard conditions

- Zero arguments and all-falsy arguments both yield `""`. A caller passing `cn(...)` to `className`
  therefore renders `class=""`, identical to today's `[].join(" ")` behavior at the same input.
- `cn` never throws. There is no input in `ClassValue[]` that can fault it.
- `cn` is pure and has no React, DOM, or Tailwind dependency, so it is usable from server
  components, client components, and tests without a boundary concern.

---

## 4. The equivalence claim

**Stage 1 — migration (§5).** For all 36 sites, at every reachable input, the emitted string relates
to the pre-migration string by exactly one of:

- **E1 — byte-identical.** 35 of 36 sites.
  - The 6 `.filter(Boolean).join(" ")` sites are byte-identical *by definition*: `cn` is that
    expression. (`KeyValue.tsx:121`, `GearSection.tsx:303`, `TodaySection.tsx:571`,
    `TodaySection.tsx:645`, `TravelSection.tsx:637`, `AccentButton.tsx:121`.)
  - The other 29 unfiltered sites are byte-identical because **every operand is truthy at every
    input** — verified mechanically in §4.1, not by inspection.
- **E2 — whitespace-normalized.** Exactly 1 site: `components/crew/primitives/DayCard.tsx:98`,
  and only on the `tone === "set"` branch.
  - Before: `"size-1.75 shrink-0 rounded-full "` (trailing space — the ternary's empty branch became
    an empty array element, and `join` still emitted its separator).
  - After: `"size-1.75 shrink-0 rounded-full"`.
  - The **token set is identical**. Only the trailing separator differs. `Element.classList` is
    unchanged; rendered CSS is unchanged.

**Stage 2 — canonicalization (§6).** `eslint --fix` deliberately rewrites class tokens at the 6 sites
in §2.4. These are *not* covered by the E1/E2 claim; they are enumerated individually, each with the
`@theme` token that proves CSS equivalence.

The two stages land as **separate commits** so a reviewer can diff them apart. Conflating them is
what makes "did this change rendering?" unanswerable.

### 4.1 The all-truthy claim, verified mechanically

The claim "every operand at the other 29 unfiltered sites is truthy" is the one place stage 1 could
silently change output, so it is established by a scan rather than by reading.

**Two operand kinds have to be checked, not one.** A literal scan alone is not a proof: an operand
can also be an identifier whose value is falsy, and that would be an E2 site the literal scan never
sees.

*Literal operands.* Extracting every array expression and grepping the unfiltered ones for a `""` /
`null` / `undefined` operand returns exactly one hit:

```
components/crew/primitives/DayCard.tsx:98
  |tone === "show" ? "bg-accent" : tone === "set" ? "" : "bg-border-strong",
```

(The only other hit in the whole scan is `GearSection.tsx:303`, which is a `.filter(Boolean)` site
and therefore already E1.)

*Identifier operands.* The unfiltered sites pass exactly seven identifiers rather than literals, and
each is checked at its definition:

| Identifier | Defined at | Always truthy because |
|---|---|---|
| `base` | `components/admin/OnboardingWizard.tsx:126` | non-empty string literal |
| `focusRing` | `components/admin/OnboardingWizard.tsx:128` | non-empty string literal |
| `pillState` | `components/admin/OnboardingWizard.tsx:152` | 4-branch conditional, every branch a non-empty literal |
| `TRACK_BASE` | `components/admin/settings/DeveloperToggleButton.tsx:78` | non-empty string literal |
| `THUMB_BASE` | `components/admin/settings/DeveloperToggleButton.tsx:80` | non-empty string literal |
| `surfaceClass` | `components/crew/RightNowHero.tsx:435` | ternary, both branches non-empty literals |
| `CHIP_CLASS` | `components/crew/primitives/PersonRow.tsx:83` | array join of non-empty literals |

So there is exactly one E2 site at this base, across both operand kinds.

**This claim is base-specific, and the plan re-establishes it rather than inheriting it.** A rebase
that made any of the seven falsy would leave the site count, the operand-parity check, the `cn` unit
test, and the `DayCard` test all passing while output bytes changed — precisely the composition gap
§4.2 otherwise rules out. The rebase task therefore re-runs **both** halves of this audit, not the
site count alone.

### 4.2 How the claim is verified

Three mechanisms compose. None of them is a hardcoded expected string. **Two are permanent tracked
tests; one is a one-shot migration-time check, and the split is deliberate** — see §4.3.

1. **`cn` semantics** — *permanent test.* A unit test walking the whole §3.2 table, including the
   empty and all-falsy cases. Establishes `cn ≡ filter(Boolean).join(" ")`.
2. **Operand preservation** — *one-shot verification script, NOT a tracked test* (§4.3).
   `scripts/verify-cn-operand-parity.mjs` reads each of the 18 files at the pre-migration commit via
   `git show <sha>:<path>`, extracts each array-join's operand list, extracts the corresponding
   `cn(...)` argument list from the working tree, and asserts the two are the same operand sequence.
   Expected values come from the pre-migration source, never from a literal. Class tokens rewritten
   in stage 2 are permitted only where §6's table declares them; an undeclared token change fails.
3. **The one behavioral delta** — *permanent test.* A render test on `DayCard` asserting the
   `tone === "set"` dot's `classList` is unchanged and its `className` carries no trailing space.
   The single site where (1) and (2) hold but bytes still move, so it gets its own executable check
   rather than a prose note.

Composition: operands preserved (2) + `cn ≡ filter.join` (1) ⇒ output identical wherever no operand
is falsy; §4.1 enumerates the sole falsy-capable operand; (3) pins that site directly.

### 4.3 Why operand preservation is one-shot and not a tracked test

The obvious design — commit mechanism 2 as a vitest file — is wrong in two independent ways, and
both were probed rather than reasoned about:

- **It cannot resolve its own baseline in CI.** The unit workflow checks out at depth 1 and fetches
  only pinned history (`.github/workflows/unit-suite.yml:110`), so `git show <base-sha>:<path>` has
  no such object. A tracked test would fail, or worse, silently degrade to a vacuous pass on the
  error path.
- **It would freeze all 18 files forever.** Its declared-delta allowlist is C1–C6 — the tokens *this
  migration* rewrites. Retained, it rejects every legitimate future class change in those files
  unless someone amends a closed migration spec's table. That is a permanent tax for a one-time
  guarantee.

The guarantee it provides is inherently one-time: it compares two versions of the tree across a
single migration. So it ships as `scripts/verify-cn-operand-parity.mjs`, is run during the migration
task with its output recorded in the PR body, and is **not** added to the suite. It is deleted in the
same PR, or retained only as an unwired script — the plan states which.

**What is permanently guaranteed after this arc, and by what:** the `cn` unit test pins the helper's
semantics; the zero-tolerance guard (§7.1) pins that no array-join className returns; the eslint rule
itself pins canonical classes inside every `cn(...)` from here on; the `DayCard` render test pins the
one behavioral delta. None of those depends on git history, and none freezes a file's class list.

---

## 5. Migration

Purely syntactic, per site:

```
  className={[A, B, C].join(" ")}                     →  className={cn(A, B, C)}
  className={[A, B].filter(Boolean).join(" ")}        →  className={cn(A, B)}
  const X = [A, B].join(" ")                          →  const X = cn(A, B)
  const X = [A, B].filter(Boolean).join(" ")          →  const X = cn(A, B)
```

Operands, their order, and their comments are preserved verbatim. `import { cn } from "@/lib/ui/cn";`
is added to each of the 18 files. Prettier normalizes the resulting formatting; no manual reflow.

The 3 `const` sites in `components/crew/primitives/PersonRow.tsx` (lines 83, 99, 117) and the 2 in
`components/atoms/Section.tsx:175` and
`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:174` migrate identically — the call is what the
plugin matches, and §2.3 confirms the assignment target's name is irrelevant.

---

## 6. Canonicalization — the enumerated stage-2 deltas

Run `pnpm lint --fix` (or `npx eslint --fix` scoped to the 18 files) after the migration commit. The
result must be exactly this set. **A rewrite not in this table is a finding, not a fix** — the
implementer stops and reports rather than accepting it.

| # | File | Before | After | Why equivalent |
|---|---|---|---|---|
| C1 | `OnboardingWizard.tsx` | `max-w-[60px]` | `max-w-confirm-box` | `--spacing-confirm-box: 60px` (`app/globals.css:186`) — same computed value |
| C2 | `PublishedToggle.tsx` | `h-5 w-5` | `size-5` | `size-*` is the height+width shorthand |
| C3 | `AutoPublishToggle.tsx` | `h-5 w-5` | `size-5` | as C2 |
| C4 | `NotifyToggle.tsx` | `h-5 w-5` | `size-5` | as C2 |
| C5 | `RightNowHero.tsx` | `min-h-(--spacing-right-now-min-h)` | `min-h-right-now-min-h` | same token, `--spacing-right-now-min-h: 176px` (`app/globals.css:216`) |
| C6 | `TodaySection.tsx` | `text-sm leading-snug` | `text-sm/snug` | `text-<size>/<leading>` shorthand |

C5 additionally repairs a documented contract: `app/globals.css:207-209` states components must
consume that token via the canonical `min-h-right-now-min-h` utility. The blind spot is why the
violation survived.

C1 warrants a visual check because it is the only delta that changes a *layout* utility rather than a
shorthand: the affected element is the step-indicator connector rule
(`OnboardingWizard.tsx:200-203`, `h-px max-w-[60px] flex-1 rounded-full`).

---

## 7. Guard replacement

### 7.1 What dies and what survives

`tests/specLint/canonicalClassArray.test.ts` is deleted and replaced by
`tests/specLint/canonicalClassCallee.test.ts`.

Three of the old file's five assertions have their premise destroyed by this arc and die with it:
the census-membership diff, the census-shrinkage check, and, most explicitly, the
"records that NO recognized callee exists to migrate to yet" test
(`tests/specLint/canonicalClassArray.test.ts:148-178`), whose own failure message says that a `cn`
helper now existing is the signal to do the migration and delete the census.

Two survive, because their premise outlives the migration:

- **Zero-tolerance recognizer, keyed on the join's separator and not on its syntactic position.**
  The census is replaced by the empty set: no className array join may exist under `components/` or
  `app/`. Strictly stronger than the census it replaces; deleting it instead would re-admit exactly
  the regression the census was built to stop (R4).

  **It must not inherit the census guard's three structural dependencies.** That scanner anchors on
  the literal text `className={[` or `const/let x = [`, matches the separator `.join(" ")` exactly,
  and scans only `/\.tsx?$/` (`tests/specLint/canonicalClassArray.test.ts:68`,
  `tests/specLint/canonicalClassArray.test.ts:95`). Each is an escape. All seven below were probed
  silent — invisible to the scanner **and** reporting zero eslint problems — with Prettier
  preserving every spelling rather than normalizing to one:

  | Escape | Why the census scanner misses it |
  |---|---|
  | `className={flag ? [...].join(" ") : "p-2"}` | the array is not immediately after `className={` |
  | `` className={`p-2 ${[...].join(" ")}`} `` | the array sits inside a template interpolation |
  | `` [...].join(` `) `` | separator is a template literal, not `" "` |
  | `[...].join(' ')` | separator is single-quoted |
  | `foo({ className: [...].join(" ") })` | the array is a call argument, not a JSX attribute |
  | a `const` holding a join, under a name the heuristic misses | covered today only by a Tailwind-shaped-literal test |
  | the direct form in a `.jsx` file | excluded by the `/\.tsx?$/` glob |

  These are ordinary authoring, not obfuscation, so they sit inside the threat-model fence; they are
  silent and unsignaled, so under this spec's consequence bound they are gaps the replacement must
  close rather than documented limits.

  **The accept-set, stated positively, and scoped to what this guard decides** (a denylist of
  spellings or positions accepts whatever it failed to model). The guard's subject is **array-join
  class expressions**, not className expressions in general. Within that subject the accept-set is:
  a class expression built as a plain string literal, as a template literal containing no array
  join, or as a call to a plugin-recognized callee (`cn(...)`) is accepted; **every array join whose
  separator is a non-empty whitespace string literal is reported**, at any quote style, anywhere in
  any UI source file (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`), position-free, so no syntactic
  context can hide one.

  **What this guard deliberately does NOT decide.** A className that is a bare identifier or an
  object lookup (`className={TRACK_BASE}`, `className={SIZE_CLASS[size]}`) is neither accepted nor
  reported by it — those are R6's separate blind spot, with a different mechanism and its own
  backlog entry (§9.2). Saying "everything that is not a literal, template, or callee is reported"
  would contradict R6 and over-promise what the recognizer can see; the guard's scope is the join,
  and the join alone.

  **Why the separator is the right key.** It is what distinguishes a class list from data: a
  className join is whitespace-separated, and every data join in this tree uses a non-whitespace
  separator. Keying on the separator rather than on a class-shaped-literal heuristic also keeps
  arrays of pure identifiers in scope — `[base, focusRing, pillState]`
  (`components/admin/OnboardingWizard.tsx:167`) contains no string literal at all and would escape
  any literal-shape test.

  **Calibrated against the live tree, not asserted.** The recognizer yields **38** whitespace-join
  sites: the **36** classNames of §2.2, plus exactly **2** data joins that legitimately
  whitespace-join values — `components/admin/wizard/step3ReviewSections.tsx:1353` and
  `components/admin/review/sectionFreshness.ts:537` — `[leg.date, leg.time]` and
  `[row.date, row.time]` respectively, not the same expression. Those two are
  carried as a **named exemption list with a stated reason each**, not silently dropped by a
  heuristic, so a new whitespace join fails by default and must justify itself. Probed: all seven
  escape shapes above are caught, and `.join(", ")`, `.join("")`, and `cn(...)` are correctly not.

  **This is future coverage, not a missed migration.** §2.2's separator-agnostic sweep confirms the
  tree contains no whitespace-join spelling other than `.join(" ")`, so the inventory of 36 is
  complete as measured; the widening protects the tree going forward.
- **Rule-is-on pin.** `eslint.config.mjs` must still set
  `"better-tailwindcss/enforce-canonical-classes": "error"`. A guard that outlives its rule pins
  nothing.

The recognizer keeps its anti-tautology property in inverted form. A census guard proves its scanner
works by finding a non-empty expected set; a zero-tolerance guard cannot, because "found nothing" is
the passing state and is also what a broken scanner reports. So the new guard **states its premise
executably**: it runs the scanner against a fixture containing a known array-join className and
asserts it is found, immediately above the assertion that the real tree yields none. Per
`docs/agents/writing-plans.md`, the premise executes unconditionally relative to what it guards —
not inside a `.each` callback.

**The premise fixture carries all three separator spellings**, in both the inline and the
via-variable shape. A fixture exercising only `.join(" ")` would let the widened recognizer regress
back to the census guard's spelling dependency while its premise check still passed — which is
precisely the vacuous-premise failure the rule exists to prevent, reintroduced one level up.

### 7.2 The premise the deletion rests on, stated executably

The census guard's whole justification was "the rule cannot see these." Deleting it asserts "the rule
can see these now." That assertion is not left in prose — it is a test:

- **Positive.** Write a temp file that imports `cn` and calls it with a seeded canonical violation
  (`min-h-(--spacing-tap-min)`), including one plain-literal argument and one ternary argument. Run
  ESLint programmatically against the repo config. Assert the rule **reports** it, at both argument
  positions.
- **Negative control.** The same seeded violation inside an array join in the same temp file must
  **not** be reported. Without this, a rule that reported everything (or a harness linting the wrong
  file) would satisfy the positive check vacuously.
- **Separator coverage.** The negative control is written at all three spellings — `.join(" ")`,
  `.join(' ')`, and `` .join(` `) `` — because all three were probed dark (§7.1). This is what pins
  that the eslint rule's blindness is a property of the *join*, not of one way of writing its
  argument, and it is the executable counterpart to the recognizer's accept-set.

The negative control is what makes the pair discriminating. It also permanently documents *why* the
migration was necessary, in executable form, after the array-join sites are gone.

---

## 8. Ledger graduation

`BL-CLASSNAME-ARRAY-JOIN-MIGRATION` (`BACKLOG.md:876`) graduates to the archive.

Per invariant 12, archives categorically reject in-progress entries, so the
`**Status:** IN PROGRESS · **Branch:** refactor/classname-array-join-cn` marker comes off in the
**same commit that archives the entry**, and that commit is the PR's **last** commit, before the
merge. The marker must never reach `main`:
`tests/docs/_metaLedgerInProgress.test.ts` fails on `main` for a marker naming a branch the merge has
deleted.

The parent entry `BL-CANONICAL-CLASS-ARRAY-BLINDSPOT` needs **no** edit. It was already closed when
the child was split out. `docs/superpowers/plans/2026-08-04-backlog-convergence-c-guards-closeout.md:15`
records it CLOSED, with the blind spot bounded by the census and the migration filed as
`BL-CLASSNAME-ARRAY-JOIN-MIGRATION`. It survives in `BACKLOG.md` only as prose cross-references at
`BACKLOG.md:252` and `BACKLOG.md:880`, not as an open entry. The plan must not invent a graduation
edit for it.

Two new entries are filed (§11), and the archive entry cross-references them so the residual limits
are discoverable from the closed work.

---

## 9. Documented limits

These are limits of the *shipped* state, recorded here so they are not rediscovered as findings. Per
the ledger filing bar, each is either filed with probe evidence or recorded as a limit — neither is
left implicit.

### 9.1 `shadow-(--shadow-tile)` is not canonicalized (R5)

`app/globals.css:285-289` instructs components to prefer canonical `shadow-tile` over the
`shadow-(--shadow-tile)` arrow form and states *"(eslint-plugin-better-tailwindcss enforces this)."*
**Probed false.** A plain-string className carrying `shadow-(--shadow-tile)` — the shape the rule
reads best — is reported clean, and 21 class-string sites live in the tree today under a passing `pnpm lint` (24 textual matches across 18 files, 3 of them in doc comments).

**The mechanism is the token's value, not its namespace,** which matters because it predicts which
*other* tokens are dark. The rule canonicalizes a token whose `@theme` value is a literal and skips
one whose value is itself a `var()` reference. Probed, four cases in one file:

All four token definitions below live in `app/globals.css`, at the lines given.

| `@theme` value | Line | Arrow/bracket form | Reported? |
|---|---|---|---|
| `--spacing-right-now-min-h: 176px` | 216 | `min-h-(--spacing-right-now-min-h)` | **yes** |
| `--spacing-confirm-box: 60px` | 186 | `max-w-[60px]` | **yes** |
| `--shadow-tile: var(--shadow-tile-runtime)` | 293 | `shadow-(--shadow-tile)` | no |
| `--shadow-popover: var(--shadow-popover-runtime)` | 302 | `shadow-(--shadow-popover)` | no |

So this is not a `shadow-*` carve-out: every `@theme` token defined through a `-runtime` indirection
— the pattern this project uses for all light/dark-spanning tokens — is invisible to the rule.

Consequence is a documented inconsistency, not a defect: both forms resolve to the same token, so
nothing renders differently. Out of scope under class-sweep exception (c) — 21 sites, most in files
this arc does not otherwise touch. Filed (§11); the false claim in the globals.css comment is
corrected as part of that entry, not this one.

### 9.2 Class strings in arbitrary-named consts stay dark (R6)

Per §2.3, `const TRACK_BASE = "…"`, object values like `SIZE_CLASS[size]`, and identifier arguments
passed into `cn` are not traversed. After this arc, the following remain unlinted:
`DeveloperToggleButton.tsx` `TRACK_BASE:78` / `THUMB_BASE:80` / `TAP_TARGET:83`;
`AccentButton.tsx` `SIZE_CLASS:83` / `WEIGHT_CLASS:91` / `RING_OFFSET_CLASS:96` / `BASE_CLASS:104`;
`OnboardingWizard.tsx` `base:126` / `focusRing:128`.

This is a **different mechanism** from the array-join blind spot and was never covered by the census
guard, so this arc neither worsens nor is responsible for it. It has a cheap known repair (rename to
`classes`, which the plugin's variable selector matches, or wrap in `cn(…)`), which is why it is
filed rather than merely noted (§11).

### 9.3 `cn` does not resolve conflicts

By R1/R2. `cn("p-2", "p-4")` emits both; last-in-source-order wins by CSS cascade, which is exactly
today's `join` behavior. `AccentButton.tsx:130-131` already relies on this ordering ("Escape hatch
LAST so per-site overrides win cascade order") and continues to.

---

## 9.4 Dimensional Invariants

**None are introduced, and none may change.** This arc alters no layout utility, no fixed-dimension
parent, and no flex/grid child relationship. The transformation is `[…].join(" ")` → `cn(…)` over an
unchanged operand list (§5), so every emitted class token is preserved except the six declared
canonicalizations in §6, none of which changes a computed dimension:

| Delta | Dimensional effect |
|---|---|
| C1 `max-w-[60px]` → `max-w-confirm-box` | none — `--spacing-confirm-box: 60px`, identical computed `max-width` |
| C2–C4 `h-5 w-5` → `size-5` | none — `size-*` sets the same height and width |
| C5 `min-h-(--spacing-right-now-min-h)` → `min-h-right-now-min-h` | none — same token, 176px |
| C6 `text-sm leading-snug` → `text-sm/snug` | none — same font-size and line-height |

C1 and C5 are the two that touch a sizing utility, so both get a rendered check rather than resting
on this table: the plan asserts the step-indicator connector
(`components/admin/OnboardingWizard.tsx:200-203`) and the `RightNowHero` card
(`components/crew/RightNowHero.tsx:481`) keep their pre-migration `getBoundingClientRect()` box
within 0.5px. The `RightNowHero` 176px constant is already a ratified invariant
(`app/globals.css:205-209`), which is exactly why C5 is verified rather than assumed.

## 9.5 Transition Inventory

**No transition is added, removed, or altered.** This arc introduces no component state, no
`AnimatePresence`, and no conditional render. Existing transition utilities inside the migrated
arrays (`transition-colors duration-fast`, `transition-transform duration-fast`) are operands carried
through verbatim by §5 and are not among the §6 canonicalizations, so every transition pair in every
affected component is byte-identical to today.

The one site whose emitted string changes for a non-canonicalization reason,
`components/crew/primitives/DayCard.tsx:98` (§4, E2), carries no transition utility at all — its
class list is `size-1.75 shrink-0 rounded-full` plus a background token. Its `tone` values are not
animated states; the component swaps a static background with no transition, before or after.

`tests/crew/transitionAudit.test.ts` already covers the crew surfaces this arc touches and must stay
green unchanged — an assertion there that moves is a signal the migration was not operand-preserving,
not a reason to update the audit.

## 10. Acceptance criteria

- **AC-1** `lib/ui/cn.ts` exports `cn` and `ClassValue` with §3.1's signature, and a unit test covers
  every row of the §3.2 table including the empty and all-falsy cases.
- **AC-2** All 36 sites in §2.2 call `cn`. The §7.1 recognizer reports zero sites across every UI
  source extension (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`), at any whitespace separator spelling
  and in any syntactic position — the two named data-join exemptions are untouched.
- **AC-3** `scripts/verify-cn-operand-parity.mjs` reports operand parity for all 36 sites against the
  pre-migration commit, with stage-2 token rewrites permitted only where §6 declares them, and its
  output is recorded in the PR body. It is a one-shot check, not a tracked test (§4.3).
- **AC-4** `DayCard`'s `tone === "set"` dot has an unchanged `classList` and a `className` with no
  trailing space (§4.2 mechanism 3).
- **AC-5** `pnpm lint` is clean, and the fixes applied are exactly C1–C6. No undeclared rewrite.
- **AC-6** `tests/specLint/canonicalClassArray.test.ts` is deleted;
  `tests/specLint/canonicalClassCallee.test.ts` enforces the zero-tolerance recognizer with its
  premise fixture (§7.1) and the rule-is-on pin.
- **AC-7** The premise pair in §7.2 passes: seeded drift inside `cn(...)` is reported at both a
  literal and a ternary argument; the same drift inside an array join is not — checked at all three
  separator spellings, in both the inline and via-variable shape. Separately, the recognizer's own
  fixture asserts it catches all seven §7.1 escape shapes and does not catch `.join(", ")`,
  `.join("")`, or `cn(...)`.
- **AC-8** Full test suite green; `pnpm typecheck` clean.
- **AC-9** Invariant 8: `/impeccable critique` and `/impeccable audit` both run on the diff, P0/P1
  findings fixed or deferred via `DEFERRED.md`, dispositions recorded, and the plan carries an
  `impeccable-gate:` closeout marker.
- **AC-10** `BL-CLASSNAME-ARRAY-JOIN-MIGRATION` archived with its in-progress marker removed in the
  PR's last commit; the two new entries (§11) filed.
- **AC-11** The two sizing canonicalizations (C1, C5) are verified in a real browser: the
  step-indicator connector and the `RightNowHero` card each keep their pre-migration
  `getBoundingClientRect()` box within 0.5px (§9.4). `tests/crew/transitionAudit.test.ts` passes
  unchanged (§9.5).

---

## 11. Out of scope, with filings

| Item | Disposition | Exception |
|---|---|---|
| `shadow-(--shadow-tile)` → `shadow-tile`, 21 sites, plus correcting the false enforcement claim at `app/globals.css:288` | File `BL-SHADOW-TILE-ARROW-SYNTAX` | (c) — spans files this arc does not touch |
| Class strings in arbitrary-named consts / object values (§9.2) | File `BL-CLASS-CONST-LINT-BLINDSPOT`, with the §2.3 probe table as its evidence | (c) — a different mechanism needing its own recognizer decision |
| Adopting `clsx` / `tailwind-merge` | Rejected, R1 | ratified |
| Extending `cn` to nested arrays / objects | Rejected, R2 | ratified |

Both filings carry probe evidence (§2.3, §9.1), so both clear the ledger filing bar without an
`INFERRED, NOT PROBED` field.

---

## 12. Invariant compliance

| Invariant | Application |
|---|---|
| 1 TDD | Every task is red → minimal green → commit (§ plan). |
| 2 advisory lock | N/A — no DB path touched. |
| 3 email canonicalization | N/A. |
| 4 no global sync cursor | N/A. |
| 5 no raw error codes in UI | N/A — no user-visible copy changes. |
| 6 commit per task | `refactor(ui):` / `test(ui):` / `chore(lint):` / `docs(plan):`. |
| 7 spec canonical | This document. |
| **8 UI dual-gate** | **Applies** — 18 files under `components/` + `app/`. `/impeccable critique` + `/impeccable audit` before close-out; `impeccable-gate:` marker required. |
| 9 Supabase call-boundary | N/A — no Supabase call added. |
| 10 mutation-surface telemetry | N/A — no mutating route or action added. |
| 11 isolated worktree | `/Users/ericweiss/FX-worktrees/classname-array-join-cn`. |
| 12 ledger in flight | Marked and pushed at Stage 0; removed in the PR's last commit (§8). |

**Meta-test inventory.** Creates `tests/specLint/canonicalClassCallee.test.ts`; deletes
`tests/specLint/canonicalClassArray.test.ts`. No other structural meta-test is created or extended —
this arc touches no auth helper (`tests/auth/_metaInfraContract.test.ts`), no admin alert catalog, no
advisory-lock topology, and no mutation surface. `vitest.projects.ts:34` sets
`BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so the new file needs no wiring.

**Concurrency.** `fix/step3-a11y-cluster` touches step-3 UI concurrently, including
`components/admin/wizard/Step3SheetCard.tsx` (one site here). Rebase over `origin/main` before
implementation and again before merge.
