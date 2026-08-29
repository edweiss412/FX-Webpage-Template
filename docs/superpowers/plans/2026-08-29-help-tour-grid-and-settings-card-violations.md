# Violation inventory — observed transcript

Every acceptance criterion in
[`2026-08-29-help-tour-grid-and-settings-card.md`](2026-08-29-help-tour-grid-and-settings-card.md)
§3, staged against the finished tree, the named command observed, then reverted.

Staged by copy-aside under an EXIT trap. Never `git stash`: that stack is repo-global
across worktrees and `lint-staged` pushes an entry on every commit in every arc.

**The restore is PROVEN, not assumed.** After the first staged violation the four
touched files are checked byte-identical to HEAD, and a failed restore ABORTS the
inventory rather than annotating a row — because the failure is silent and
self-confirming: every later row would measure a tree still carrying AC-1d's violation,
and a permanently single-column page reds plausibly for almost any criterion.

| AC | staged violation | observed | result |
| --- | --- | --- | --- |
| AC-1d | all three tour grids reverted to grid-cols-1, bleed dropped | grid 1 at 752px | RED OBSERVED |
| AC-1 | minimum lowered to 16rem | measure at | RED OBSERVED |
| AC-1a | minimum lowered to 10rem, which fits two tracks in the 358px mobile container | at 390px | RED OBSERVED |
| AC-1b | errors jump list restored to sm:grid-cols-2 | at 768px | RED OBSERVED |
| AC-1c | min(...,100%) dropped, leaving a bare 22rem | grid 1 track 1 within its container at 320px: expected <= 288.5, received 352 | RED OBSERVED |
| AC-2 | the > * scoping removed, so the cap lifts entirely | reading measure too wide | RED OBSERVED |
| AC-3 | Settings card deleted | /help/admin/settings | RED OBSERVED |
| AC-4 | a ninth admin-surface NAV entry added with no card | expected 8 to be 9 | RED OBSERVED |
| AC-5 | the --help-measure declaration removed | cap the reading measure | RED OBSERVED |
| AC-6 | one card duplicated: 9 anchors, 8 distinct | expected 9 to be 8 | RED OBSERVED |
| AC-7 | an em dash placed in the Settings card body | em-dashes | RED OBSERVED |

Eleven criteria, eleven distinct staged violations, restore proven after each.

**AC-1c did NOT red on the first pass, and that is the most valuable row here.** As
originally written the criterion compared the grid ELEMENT's width to its container.
A grid element is a block child: it sits at container width whatever its tracks do, so
a minimum that cannot shrink overflows the TRACK while the element stays put. The
assertion could not fail for any layout — it was a tautology, and it had already
returned a green in task 5's run.

The row above is the re-run after the assertion was changed to read the resolved first
track. Staging the same violation then produced a 352px track in a 288.5px container.

Worth recording rather than quietly fixing: the identical detector bug was found and
corrected in this arc's own scratch probe earlier the same day, and then reproduced in
the shipped assertion. Knowing a lesson did not transfer it between two artifacts — the
same observation this arc's plan-stage round-economy filing makes about the spec and the
plan. Staging the violation is what caught it; nothing else would have.

---

## Post-review additions

Diff review rounds 1 and 2 added assertions this table predates. Their labels were
re-checked against the shipped source afterwards, which is how the AC-1c row's observed
string came to read `track 1` rather than `track` — the assertion moved from the first
track to every track, and a transcript that quotes a label the code no longer emits is
the same stale-citation defect the reviews kept finding, one artifact over.

**One post-review assertion has been staged and observed. The rest have not, and saying
so is the point of this section.**

| assertion | staged violation | observed | result |
| --- | --- | --- | --- |
| §4 rows 2/4, the bleed | `help-bleed` stripped from all three grids | grid 1 width at 1024px: expected 728, received **704.4** | RED OBSERVED |

704.4px is the capped width — the exact scenario round 1's first finding described, where
a grid that never escapes the measure satisfies every column count and every measure
bound. The assertion discriminates, and that is measured rather than asserted.

**Not yet staged:** the guard bridge (marked anchors inside measured grids), §4 row 7's
shared-height half, §4 row 4's 1440 sample, and §4 row 7's body-versus-`--help-measure`
arm. Each is scheduled for the next window in which this arc holds the DB slot, since
every one of them needs a signed-in real-browser run. Until then they are assertions
believed correct rather than assertions proven discriminating, and that distinction is
exactly what this document exists to keep visible.
