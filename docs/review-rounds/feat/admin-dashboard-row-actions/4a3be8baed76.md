# Review rounds — feat/admin-dashboard-row-actions @ 4a3be8baed76

Second base for this arc. The spec and plan stages, and the first whole-diff round, ran against
`7e04cd6f04e9` and are filed there; merging `origin/main` moved the merge-base, so the corpus keys
the later diff rounds here. Round numbers restart with the base, as the corpus is keyed by it.

## diff — 5 rounds

**Examined:** (R1 ran against the previous base and its row lives in `7e04cd6f04e9.jsonl`; it is
summarized here because the vector below runs through it.) R1: six (empty alert for codes with no catalog copy; a pending request dismissable out
from under its own outcome; `runArchive` with no `catch`; failed-Accept focus; `maxHeight` with no
overflow; the archive confirm passing raw `row.title` past its own slug fallback). R2: three (the
pending-surface repair incomplete on four further paths — sub-panel Escape, native Tab, the trigger,
and a backdrop trapped in the row's `z-10` seat below the mobile tab bar; one `pending` boolean
shared by two actions, so Archive made Re-sync announce "Syncing…"; a flip pin implied by
containment). R3: one (`router.refresh()` preserves React state and the row keeps its `row.id` key,
so a background refresh does NOT remount the row — the §3.5 compound row assumed it did, leaving the
Archive confirm and held decision actionable on a row that had become ineligible). R6: six (an eligibility mirror updated in a passive
effect, losing the commit-to-effect race an awaited answer can land in; a confirm that owned the
surface for the keyboard but not the pointer, so Re-sync could still fire beside it and put two
decision panels on screen; eight arrow-key focus moves ignoring the `preventScroll` contract; a
generic sr-only span owned by the submenu's `role="menu"`; `lib/admin/archiveCopy.ts` missing from
the geometry gate's path filter although the confirm it measures is SIZED by that copy; and the
§3.5 row still saying failure banners close on eligibility loss, contradicting §6, the code, the
tests and the standing rule). R5: two (invariant 12 violated — the ledger entry was archived at what turned
out to be eight commits before the end, leaving live work unclaimed; and the ARIA content-model
guard running only a crew-populated fixture, so it never saw the empty-roster hint as a direct child
of `role="menu"`). R4: six (a position-only reorder leaving the portal on the wrong row; an outcome landing after eligibility loss
being swallowed by the R3 gate; that same transition stranding focus; a §12 row claiming a separator
repair the ARIA restructure had removed; a "close after `router.refresh()` resolves" contract the
framework cannot offer, `refresh(): void`; and two documents left contradicting themselves by R3).

**Judgment:** one vector produced R1 F2, R2 F1, R3 F1 and R4 F2/F3 — "an outcome must reach the
admin" — and each round repaired the instance in front of it. That is the shape the project's
class-sweep rule names, and the honest reading is that the first three rounds were patching where a
rule was owed. R4 also caught the repair itself creating a new instance: the eligibility gate added
for R3 could swallow a late answer, which is the same defect wearing the previous fix's clothes.

**Mechanizable:** yes, and shipped in the R4 repair commit rather than filed for later.
`tests/components/admin/rowActions/_metaOutcomeVisibility.test.tsx` states the rule the four rounds
were circling: every renderable region is either ACTIONABLE (it can start or complete a mutation,
and must be eligibility-gated) or a READ-ONLY OUTCOME (it only reports what happened, and must
render unconditionally). It drives the component into each region, flips eligibility on the same
instance, and asserts which side of the line it falls on. It caught two live instances the moment it
was written — the sync and archive failure banners, both wrongly gated — and one of this arc's own
earlier assertions, written at R3, that had the rule backwards. A new region cannot be added without
answering the question.

**Infra:** three dispatches produced `no_verdict` (two of them the rows numbered 1 and 2 in this
file, which is why the counted rounds here trail the narrative's numbering) without reviewer fault. Two died to SIGTERM at 0s:
`nohup` + `disown` does NOT survive the Bash tool call's shell exiting, and the fix was the
harness-tracked background runner, which does. The third was killed by a machine crash mid-run,
which also wiped the scratchpad holding the brief. Per the guard's own contract these are
infrastructure faults and were re-dispatched, not read as clean rounds.

**Disposition (post-R6):** ship. R6's six are repaired. Two are worth naming: the eligibility mirror
moved from a passive effect to a render-time "latest value" ref, because the effect form loses the
exact window an awaited answer lands in; and `busy` gained `confirmingArchive`, since a confirm that
takes focus while a pointer can still fire the item beside it is only half a confirm.

**Disposition (post-R5):** ship. R5's two findings are repaired — the ledger claim is live again and
graduates in the genuinely final commit, and the content-model guard now runs both crew states.

**Disposition (post-R4):** ship. Every finding across the four rounds is repaired, the recurring
vector is closed by an executable rule rather than a fifth instance fix, and the remaining evidence
is machine-checked: 901 tests green across the arc and every registry it touches, eslint clean, and
the real-browser geometry spec passing 4/4 locally and green in CI as `admin-layout-e2e`.
