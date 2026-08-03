# Plan — close `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED — WON'T BUILD

**Spec:** `docs/superpowers/specs/data-quality/2026-08-03-close-v1-override-wont-build.md` (canonical; this plan implements it and does not override it).
**Branch:** `docs/close-v1-override-wont-build` (worktree off `origin/main` at `67074d4dc`).
**Preflight:** skipped — docs plus one test-registry file; no env, no DB, no app code. Declared in the PR body.

impeccable-gate: N/A — no UI surface

## Meta-test inventory

No new guard is created. One convention-mandated registry row is appended to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` — the graduation ledger's own registry, required by the existing guard. That row is not bookkeeping: it is this change's executable red state (Task 1).

No other registry applies. No Supabase calls (invariant 9 inapplicable), no advisory locks (invariant 2), no mutation surface (invariant 10), no `§12.4` catalog row, no migration, no UI.

**Invariant 12 (ledger in-flight declaration, landed in `origin/main` @ `67074d4dc`).** This branch performs the full lifecycle, per spec §4.0: Task 0 declares the entry in flight, Task 2 graduates it and the marker leaves with it. The earlier reading — that the guard is opt-in, so declaring nothing also complies — was wrong: `tests/docs/_metaLedgerInProgress.test.ts` being conditional is a statement about enforcement coverage, not permission, and `AGENTS.md` invariant 12 states the rule unconditionally.

Two mechanical consequences the implementer must respect:

- **The declared branch must exist on `origin` while the marker is live.** The staleness case runs `git ls-remote --heads origin` and is deliberately not skip-on-failure (`tests/docs/_metaLedgerInProgress.test.ts:200-217`). It matches the branch NAME, not a pushed commit, so Task 0 publishes the ref as a prerequisite step *before* its red/green/commit sequence — invariant 1's ordering is untouched.
- **The status line must NOT travel into the archive.** Archives may not hold in-flight work, so Task 2 drops it rather than copying the body verbatim.

## Verification transcripts captured at plan time

- **`pnpm spec:lint` baseline on `docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md`: 7 hard, 16 advisory**, measured before any edit. This is the delta base for Task 3 — the amendments must not raise either count. The seven hard findings are three pre-existing `CITATION_MALFORMED` hits (at that file's L14, L76 and L210 — comma-list and tilde line coordinates the linter rejects; not requoted here, since a verbatim copy would be parsed as this plan's own malformed citation), one `CITATION_FILE_MISSING`, and three `SECTION_MISSING_*` structural findings. None sit at an edit site this plan touches.
- **`pnpm spec:lint` on the new spec doc: 0 hard, 6 advisory**, and **on this plan: 0 hard, 5 advisory** — both measured after the round-2 spec repairs. Re-measure both at Task 5 rather than trusting these numbers; they are a delta base, not a target.
- **Corpus probe:** `classifyVersion` over all 10 committed fixtures → 10/10 `confident` (6× v2 at 7/0, 4× v4 at 8/0), zero ambiguous, zero v1. Recorded verbatim in spec §3.2.

## TDD framing (docs tasks)

Every task here edits tracked files and produces a commit, so **invariant 1 binds to all of them** — the repo's own precedent for exactly this reasoning is `tests/docs/backlogClusterArchival.test.ts:3`, which records that its own Task 7 "edits tracked files and commits, so invariant 1 binds and it needs a real red step", while its Tasks 6 and 8 are exempt only because they commit nothing. None of the tasks below is exempt, and each names a measured red state from an existing guard, lint, or grep, plus the pinned green that follows.

**Anti-tautology note.** Each red must be checked to fail for the *right* assertion, not merely to fail. Every task below names its expected failure message; a run that reds for any other reason is a different bug and stops the task.

---

## Task 0 — declare the entry in flight (invariant 12)

**Spec:** §4.0 step 1, §4.1 first bullet.

**Prerequisite, before any edit: publish the branch ref.**

```sh
git push -u origin docs/close-v1-override-wont-build
```

No task work is on the branch yet; this only makes the ref resolvable. It is required because the guard's staleness case runs `git ls-remote --heads origin` and is deliberately not skip-on-failure (`tests/docs/_metaLedgerInProgress.test.ts:200-217`). It matches on the **branch name**, not on whether any particular commit has been pushed — which is what lets the push happen here, before the task's red/green/commit sequence, instead of between its green and its commit. Invariant 1's ordering is therefore fully preserved.

**RED.** In `BACKLOG.md`, replace the entry's status line

```
**Status:** OPEN.
```

with the status alone, no branch:

```
**Status:** IN PROGRESS
```

Run `pnpm test tests/docs/`. Expect **exactly one** failing case: `gives every in-progress entry a branch or a PR to point at`, whose assertion message begins `IN PROGRESS with nothing to check it against` and goes on to call such a marker unactionable and unfalsifiable once stale. The other four in-progress cases must stay green — no flight field is present, the entry is not in an archive, and the staleness case returns early on an empty branch list. A red anywhere else is a different defect; stop and diagnose.

This is a real red, not a manufactured one: an in-progress marker with nothing to resolve is precisely the unfalsifiable-when-stale state the guard exists to reject.

**GREEN.** Append the branch field:

```
**Status:** IN PROGRESS · **Branch:** docs/close-v1-override-wont-build
```

`docs/close-v1-override-wont-build` satisfies the guard's `BRANCH_SHAPE` (`tests/docs/_metaLedgerInProgress.test.ts:123`), and the prerequisite push satisfies the staleness case it now arms. Re-run `pnpm test tests/docs/` → all five in-progress cases green.

**Commit** — after green, never before: `docs(backlog): declare BL-VERSION-AMBIGUOUS-V1-OVERRIDE in flight`

This is a commit of its own. A declaration landing in the same commit as the graduation never existed as an observable state, which defeats the point of declaring it.

---

## Task 1 — arm the graduation guard (RED)

**Spec:** §4.3, §7 step 2.

Append one row to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (the array at L90-L334), following the surrounding comment convention — a short lead comment naming the branch, the date, and what was decided:

```ts
// docs/close-v1-override-wont-build (2026-08-03): closed WON'T BUILD, not shipped.
// A force-classify override is the approve-ambiguous path the confidence gate
// exists to prevent, and the row's premise was false: a real legacy-v1 sheet is
// registrable via the spec 7.1 marker-registration path like any other
// unregistered template. Leaving the open queue is what a graduation is.
{ id: "BL-VERSION-AMBIGUOUS-V1-OVERRIDE", provenance: "docs/close-v1-override-wont-build" },
```

**Red state — run `pnpm test tests/docs/` and confirm BOTH of these, by name:**

1. `every graduated id is archive-only` fails with `BL-VERSION-AMBIGUOUS-V1-OVERRIDE missing from BACKLOG-archive.md`.
2. The per-id provenance case (`%s's archived section names the branch that resolved it`) fails with `BL-VERSION-AMBIGUOUS-V1-OVERRIDE has no heading in the archive`.

If the run reds for any other reason, stop and diagnose — that is a different defect.

**Do not commit alone.** Tasks 1 and 2 land in one commit: a commit whose suite is red is not a valid history entry here, and the two halves are one logical move.

---

## Task 2 — move the entry (GREEN)

**Spec:** §4.1 second and third bullets, §4.2.

**2a. `BACKLOG.md`** — delete the whole `## BL-VERSION-AMBIGUOUS-V1-OVERRIDE` entry: from its heading (L59) through its status line (now the Task 0 `IN PROGRESS` line) and the trailing `---` separator, leaving exactly one blank-line-separated `---` between the neighbouring entries. Verify no double separator and no orphaned blank block.

**2b. `BACKLOG.md` L7** — prepend a new `Last reconciled:` segment naming this branch and what it graduated, demoting the previous content behind `Prior:`.

**The historical `Prior:` chain is left exactly as written.** The "Eight open rows here" phrase and its parenthesised list — which names both `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` and `BL-UNPUBLISH-TO-HELD` — belongs to the 2026-08-02 segment and describes the state at *that* reconciliation, when it was true. Demoting it behind `Prior:` is precisely what marks it as history. Editing it would falsify a dated record, and the same-day precedent confirms the reading: `docs/graduate-bl-unpublish-to-held` graduated one of those eight hours earlier and left the list untouched.

So the count discipline lives entirely in the NEW segment, which must state current state explicitly rather than leave it to be inferred: with both same-day graduations landed, **six** of the original eight remain open (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`). Re-derive that list from the file at implementation time rather than trusting this one; if it disagrees, the file wins and the discrepancy is worth a note in the PR body.

**2c. `BACKLOG-archive.md`** — add the graduated entry immediately after the `BL-UNPUBLISH-TO-HELD` block (L35-L45), keeping same-day graduations adjacent. Format follows the archive's established two-heading shape:

```
## BL-VERSION-AMBIGUOUS-V1-OVERRIDE — RESOLVED — WON'T BUILD (2026-08-03, `docs/close-v1-override-wont-build`)

## BL-VERSION-AMBIGUOUS-V1-OVERRIDE — no admin force-classify for a genuine legacy-v1 sheet

<the original body: the Filed line and the two prose paragraphs, verbatim — NOT the status line>

**Resolution (2026-08-03): WON'T BUILD.** <rationale>
```

**The status line is dropped, not copied.** It reads `IN PROGRESS` by now, and `tests/docs/_metaLedgerInProgress.test.ts` fails on in-flight state inside an archive; the terminal heading carries the status instead, which is the archive's own convention.

The `**Resolution:**` paragraph carries, from spec §3:

- that `v1` is a fallback bucket rather than a confirmed legacy template — `lib/parser/schema.ts:37` calls it the fallback when table syntax is present but no v2/v4 markers, and `lib/parser/schema.ts:53` is `{ id: "v1", fallback: true }` with no `requires` array;
- that **the committed corpus contains no v1 sheet** — 10/10 fixtures classify confidently, the oldest (`2024-05-east-coast-family-office.md`) at 7/0 for v2 on the `Hotal Contact Info` typo. State this narrow claim only. Per spec §3.2 and §8 the probe supports neither "no v1 sheet has ever existed" nor any claim about the live-sheet population, and the rationale does not need either;
- the four indistinguishable bucket occupants and why an override serves none of them better than its existing disposition;
- the insight that closes it: a real legacy-v1 sheet, once seen, is indistinguishable from a genuinely-new template, and the §7.1 resolution-#2 path is not limited to new templates — the row's "has neither" conflated *no markers registered today* with *no registrable structure*;
- that the override converts a signaled failure into a silent one, inverting the preparedness-audit posture;
- **the re-open trigger, verbatim:** a real legacy sheet surfaces **AND** marker registration proves impossible (the sheet has no stable column-0 labels spanning ≥2 blocks). Both halves required.

The paragraph must contain the literal string `docs/close-v1-override-wont-build` — the guard's provenance assertion scopes to this section and matches on it.

**Green state:** `pnpm test tests/docs/` passes in full, including:

- `every graduated id is archive-only` (both directions) and `no id is both active and archived`;
- the per-id provenance case;
- `no active backlog entry carries a terminal status` and its heading twin — the terminal claim now lives in the archive, where it belongs;
- `tests/docs/_metaLedgerReferentialIntegrity.test.ts` — the three spec citations of the id still resolve, because the archive is a registered ledger and both new headings carry the id;
- `tests/docs/_metaLedgerInProgress.test.ts` — the archive holds no in-flight work, and with the marker gone the origin-existence constraint from Task 0 no longer applies.

**Commit** (Tasks 1+2 together): `docs(backlog): graduate BL-VERSION-AMBIGUOUS-V1-OVERRIDE as RESOLVED — WON'T BUILD`
---

## Task 3 — amend the four confidence-gate spec sites

**Spec:** §4.4.

`docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md`, four one-sentence amendments. Every `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` citation is preserved verbatim at each site that has one — the referential-integrity guard resolves them, and dropping one would silently sever the link this change exists to keep meaningful.

| Line | Section | Change |
| --- | --- | --- |
| L171 | §7.1, third bullet | The override is not built **and will not be**; citation restated as resolved won't-build (2026-08-03); one clause of reason — a real legacy sheet is registrable like any other unregistered template. |
| L205 | §10 out-of-scope list | Records the closure and its conjunctive re-open trigger, keeping the **bold** id spelling so the citation still resolves. |
| L211 | §11 watchpoint 2 | Deferred becomes resolved won't-build (2026-08-03), keeping the backticked id, plus one clause on why the override serves no bucket occupant. |
| L212 | §11 watchpoint 3 | `Documented risk + backlog override (§10).` becomes a statement that the override is closed won't-build, still pointing at §10. |

**Deliberately NOT edited:** §11 watchpoint 1 (L210). It already states the correct resolution — a genuine legacy-v1 sheet flags ambiguous and is resolved via §7.1, by restoring a marker or by the developer registering it — which is the position this change ratifies. Recorded here and in spec §4.4 so a reviewer does not read its absence as an oversight.

**Red state — the pinned command, measured at plan time.** A bare `grep 'deferred'` does NOT work and must not be used: it also matches L23 (the non-goals sentence) and L201 (the §10 heading "Out of scope (deferred, with the item that owns each)"), both of which are legitimately retained and would still match after the amendments, making the green assertion unachievable. The site-specific pattern instead:

```sh
D=docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md
grep -nE 'deferred — .BL-VERSION|filed as \*\*BL-VERSION-AMBIGUOUS-V1-OVERRIDE\*\* if one ever surfaces|is deferred \(.BL-VERSION|Documented risk \+ backlog override' "$D"
```

Measured **RED = 4 hits**, at exactly L171, L205, L211, L212. **GREEN = 0 hits**, with two invariants alongside it:

- `grep -c 'BL-VERSION-AMBIGUOUS-V1-OVERRIDE' "$D"` still returns **3** (L171, L205, L211 — L212 never named the id), so no citation was dropped;
- L23 and L201 still contain "deferred" and are untouched — they describe other deferrals and the section title, neither of which this change closes.

**Lint delta gate:** re-run `pnpm spec:lint` on the file and confirm the summary is still **7 hard, 16 advisory**. Any increase means an amendment introduced a new finding and must be reworked, not accepted. In particular: the section quotes prose containing em-dashes, and `COPY_EM_DASH` is a hard rule over double-quoted prose — the amendments must not wrap em-dash-bearing text in straight double quotes.

**Commit:** `docs(spec): record the v1-override closure at the four confidence-gate sites`

---

## Task 4 — spec + index

**Spec:** §4.5.

The new spec doc (`docs/superpowers/specs/data-quality/2026-08-03-close-v1-override-wont-build.md`) and its index row in `docs/superpowers/specs/data-quality/README.md`, plus this plan.

**Red state:** with the doc present and the README row absent, `pnpm test tests/docs/specsReadmeIndexParity.test.ts` fails naming the unlisted doc. **Green:** it passes, in both directions (no dangling row either).

Also confirm `pnpm test tests/docs/_metaInvariant8Closeout.test.ts` is green — this plan carries `impeccable-gate: N/A — no UI surface`, whose exact grammar is pinned by `NA_FORM` in `tests/docs/_invariant8Closeout.ts:46`.

**Commit:** `docs(plan): spec + plan for closing the v1-override backlog entry`

---

## Task 5 — full-suite gate and merge

The branch ref is already on `origin` — Task 0 published it as a prerequisite, because the in-progress marker's staleness check resolves against it. Task 5 pushes every commit and gates the merge.

Before that push, in the worktree:

- `pnpm test tests/docs/` — the directly-affected suite.
- `pnpm test` — the full unit suite. Scoped gates miss regressions; a `BL-` id string appears in test bodies and doc-walking guards outside `tests/docs/`, so the whole suite is the gate, not the subtree.
- `pnpm typecheck` — the `BACKLOG_GRADUATED` row is TypeScript, and `origin/main` @ `fb939e6bf` shows `noUncheckedIndexedAccess` is live in this tree.
- `pnpm lint` and `pnpm format:check` — `--no-verify` on the commit bypasses Prettier, so `format:check` is the real gate. Markdown tables and long prose lines are Prettier-formatted in this repo.
- `pnpm spec:lint` on all three reviewed documents — the two spec docs **and this plan**. Confirm: the 2026-07-04 spec still at 7 hard / 16 advisory, and the new spec and the plan each still at 0 hard.

Then push the remaining commits, open the PR (declaring the preflight skip and the docs-only scope in the body), wait for **real CI green** — not local green — and merge with `gh pr merge --merge`. Finally fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0	0`.

One CI note specific to this branch: the merged state carries **no** in-progress marker, so `tests/docs/_metaLedgerInProgress.test.ts` runs its conditional rules against an empty set and never reaches `git ls-remote`. The origin-existence dependency exists only on the Task 0 commit and cannot make CI flaky at the head.

## What this plan does NOT touch

Restated from spec §5 so the implementer does not go looking: `lib/parser/schema.ts`, the marker sets and thresholds, the `VERSION_AMBIGUOUS` code and its `§12.4` catalog row (so no `pnpm gen:spec-codes`), `supabase/migrations/` (so no `pnpm gen:schema-manifest` and no validation-project apply), any file under `app/` or `components/`, and the `DEFERRED.md` / `DEFERRED-archive.md` pair.
