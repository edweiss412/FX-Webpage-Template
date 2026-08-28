# Plan — remove a free scroll read, and park the measure cadence

**Spec:** `docs/superpowers/specs/admin/2026-08-28-placement-path-redundant-measures.md`
**Row:** `BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES` (partial disposition)
**Branch:** `perf/placement-measure-memo`

**This plan is what remains after ship-and-fence.** Site 1's guard ran six
adversarial rounds across two designs and neither converged; it is PARKED with the
round corpus as its record. Site 2 ships. Site 3 was refuted by its own probe. The
history is `docs/review-rounds/perf/placement-measure-memo/b608e71b32b5.md` and the
spec's §2.

**Files:**

- `lib/popover/naturalSize.ts` (edited — two `&&` operands in one `finally` block)
- `tests/components/naturalSize.test.ts` (extended — INV-F; INV-G is the two
  merged cases at `tests/components/naturalSize.test.ts:45` and
  `tests/components/naturalSize.test.ts:59`, asserted to stay green rather than
  rewritten)
- `BACKLOG.md` (the row's body becomes the park record; its `IN PROGRESS` marker
  comes off in the PR's last commit)
- this plan and its spec (closeout marker and dispositions)

**No file under `app/` or `components/` is touched**, which is what makes the
invariant-8 marker `N/A` true rather than convenient — and Task 2's `red=` asserts
it rather than trusting it.

## Meta-test inventory

**One applies, and it is the reason the repair is safe to make inside a shared
helper.** `tests/components/_metaScrollNeutralMeasurement.test.ts` pins that no
CALL SITE clears a cap itself, which is what makes `withNaturalSize` the single
owner of the clear-and-restore. This repair changes the RESTORE inside that owner
and adds no call-site clearing, so the guard's population and every assertion are
unaffected. **Task 1 runs it and records the result**, because a walked-population
guard can red from a membership change rather than a behaviour change.

Checked and not applicable: `tests/auth/_metaInfraContract.test.ts` (no Supabase
call), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*`, no DB at
all), `tests/log/_metaMutationSurfaceObservability.test.ts` (no route handler, no
`"use server"` action), `tests/components/admin/_metaPopoverViewportSource.test.ts`
(pins how popover surfaces obtain the viewport; this arc adds no viewport read and
no longer touches `components/`).

## No Playwright, and that is a property of the claim

The e2e harness-readiness checklist does not apply because this arc attaches no
browser case. Site 2's invariant is a read/write ORDER on one element, which jsdom
observes exactly; a real layout engine would not make the ordering more true. The
two browser instruments designed for site 1 were both refuted before anything
shipped, and the spec's §5 records them so the next attempt does not re-derive
them.

## Coverage map

| Spec AC | Task |
| --- | --- |
| AC-6 | Task 1 |
| AC-10 | Task 2 |

Every criterion is declared in the sibling spec; this plan declares none of its
own, so `spec:lint`'s `TASK_AC_UNDECLARED` arm stays out of scope
(`lib/specLint/taskContract.ts:466-478` declines ids on structured lines, and this
map is a table).

## Pre-push gates

| Gate | Command |
| --- | --- |
| full unit suite | `pnpm heavy pnpm test` |
| typecheck | `pnpm typecheck` |
| lint | `pnpm exec eslint .` |
| format | `pnpm format:check` |

All four before the diff review dispatch and again before the push CI reads. A
review of a red tree finds none of the red.

## Tasks

<!-- tasks: depth=2 -->

## Task 1 — an unscrolled measurement does not read the scroll offsets

<!-- task: red=`pnpm exec vitest run tests/components/naturalSize.test.ts` ac=AC-6 -->

**What is red and why.** A new case installs counting getters for `scrollTop`
and `scrollLeft` and a `style` proxy recording cap writes, runs `withNaturalSize`
on an element whose offsets are both 0, and asserts no scroll read follows the
last cap-restore write. It fails at 2 reads, because
`lib/popover/naturalSize.ts:70-71` reads both unconditionally. **The production
lines whose defect makes this red are those two**, read on the live tree and
carrying no `!== 0` guard.

**GREEN.** Add the `heldScrollTop !== 0 &&` and `heldScrollLeft !== 0 &&`
short-circuits.

**Gate commands, run and recorded in the commit:**

- `pnpm exec vitest run tests/components/naturalSize.test.ts` — the merged
  scrolled-restore case (`tests/components/naturalSize.test.ts:45`) and the
  merged no-spurious-write case (`tests/components/naturalSize.test.ts:59`) stay
  green. Both hold non-zero offsets, so both take the unchanged branch (INV-G).
- `pnpm exec vitest run tests/components/_metaScrollNeutralMeasurement.test.ts`.

## Task 2 — closeout: the row takes its partial disposition

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-28-placement-path-redundant-measures.md; grep -qE "^impeccable-gate: N/A" $P || exit 1; git diff --name-only origin/main...HEAD | grep -qE "^(app|components)/" && exit 1; awk "/^#+ BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES/{f=1;next} f&&/^#/{f=0} f" BACKLOG.md > /tmp/ppm-entry.txt; test -s /tmp/ppm-entry.txt || exit 1; grep -q "IN PROGRESS" /tmp/ppm-entry.txt && exit 1; grep -q "PARKED" /tmp/ppm-entry.txt || exit 1; exit 0'` ac=AC-10 -->

**The invariant-8 marker is `N/A — no UI surface`, and under ship-and-fence that
is TRUE rather than a dodge.** With site 1 parked this arc edits
`lib/popover/naturalSize.ts` and its tests and nothing else; `lib/` is not a UI
surface under invariant 8, which names `app/` (except `app/api/**`),
`components/`, `app/globals.css`, `DESIGN.md` and `tailwind.config.*`. The
earlier draft of this task ran the dual gate because the arc then edited
`components/admin/AnchoredPortal.tsx`. It no longer does, and the `red=` above
ASSERTS that rather than trusting it: a diff touching `app/` or `components/`
exits 1, so the `N/A` cannot silently become false if scope creeps back.

Marker grammar verified against `tests/docs/_invariant8Closeout.ts:46`, including
the em dash, which that pattern requires literally.

**The row's `Status` flips from `IN PROGRESS` to `PARKED` in this commit, and
not before.** Invariant 12 puts the marker's removal in the PR's LAST commit, so
the park record's body lands with the arc while the meta line still declares the
claim — otherwise `pnpm ledger:claims` would report the row unclaimed while this
branch is still working it, and another session could pick it up. The row
therefore carries a `Becomes on merge:` field until this task rewrites it.

**The row is REDUCED, not archived, and that is the disposition the ruling
names.** Two of its three sites are settled — site 2 repaired here, site 3
refuted — and site 1 is PARKED as live work. An archive would assert the row is
finished; it is not. So the entry stays in `BACKLOG.md`, its body replaced by the
park record, and its `IN PROGRESS` marker comes off in this PR's last commit per
invariant 12. `tests/docs/_metaDeferralLedgerGraduation.test.ts` is unaffected: no
entry graduates.

**What is red and why.** At the start of this task the plan carries no
`impeccable-gate:` line at all, so the command exits 1 on its first condition. It
passes only once the marker is written, the diff is confirmed free of UI surfaces,
and the `BACKLOG.md` entry carries `PARKED` without `IN PROGRESS`.

**This check asserts the marker is PRESENT; it deliberately does not re-assert its
GRAMMAR.** `tests/docs/_metaInvariant8Closeout.test.ts` owns the exact form,
including the em dash its pattern requires literally, and duplicating that regex
here would give the arc two places to be wrong about one rule — and a literal em
dash inside this command is itself a `spec:lint` `COPY_EM_DASH` failure, which is
how the duplication announced itself.

**The `red=` is a string-presence guard, so it gets the four pre-dispatch
mutants** before the diff review dispatch, each result recorded in the commit:
(a) the marker line emptied; (b) the line indented, which the `^` anchor must
reject; (c) a `BACKLOG.md` entry still marked `IN PROGRESS`; (d) a diff carrying
one `app/` or `components/` file, which must flip the check red.

<!-- tasks: end -->

## Where the acceptance criteria live

**Every criterion this plan's markers cite is declared in the sibling spec, and
this plan declares none of its own.** That is deliberate rather than incidental:
`spec:lint`'s `TASK_AC_UNDECLARED` fires only in a plan that declares at least
one criterion, so a plan that declared a single extra id would put all nine
spec-declared ids into scope and draw nine findings. The closeout criterion is
therefore AC-10 in the spec, next to the other nine, and this plan carries the
coverage map above instead.

**Verified against the implementation, not inferred from the guidance.** The
coverage map is a TABLE, and `lib/specLint/taskContract.ts:466-478` declines any
id on a structured line — the comment there records that without the decline the
arm reds 9 plans and 71 ids on the live corpus, "one incidental list item
beginning with an id opts a whole plan in while its real criteria sit in a table
or a coverage line." A table row is exactly that shape, so this plan opts in
nowhere and the arm stays silent. `pnpm spec:lint` on this plan is run at
authoring time and its report attached to the review dispatch, which is how that
reading is confirmed rather than trusted.

## Pre-push gates

Run in full before the whole-diff review dispatch and again before the push that
CI reads, because a review of a red tree finds none of the red. All four are
separate gates rather than one: each has caught something the others do not see.

| Gate | Command | Why it is here |
| --- | --- | --- |
| full unit suite | `pnpm heavy pnpm test` | a scoped run misses regressions in files this diff does not name; `pnpm heavy` is mandatory for a full-suite run |
| typecheck | `pnpm typecheck` | vitest strips types, so a type error survives a green suite |
| lint | `pnpm exec eslint .` | this diff moves entries OUT of a `useCallback` dep array (`components/admin/AnchoredPortal.tsx:186`), which is exactly what `react-hooks/exhaustive-deps` adjudicates |
| format | `pnpm format:check` | the arc commits with `--no-verify`, which bypasses the Prettier hook |

The lint gate is not boilerplate here. After the props-ref change
`measureAndApply` no longer references `align` or `preferredSide` in its body, so
`[anchorRef, commit]` is the correct array and the rule should be satisfied; if it
is not, the reading of the change is wrong and that is worth learning before a
reviewer says so.

## Self-review, adversarial review, closeout

1. Self-review: citation pass over every `file:line` in this plan, numeric
   sweep, and the four pre-dispatch mutants on any string-presence assertion.
2. **Adversarial review (cross-model)** — Codex, `--stage plan --round 1`.
3. Whole-diff Codex review after implementation, on a tree whose full suite is
   green — never on a red one.
4. Closeout per Task 7.

## 12. Invariant-8 findings and dispositions

Filled by Task 7.
