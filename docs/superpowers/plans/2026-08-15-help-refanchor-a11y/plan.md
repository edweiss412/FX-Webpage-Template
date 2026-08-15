# Plan: /help/errors RefAnchor whole-surface a11y pass

**Spec:** `docs/superpowers/specs/2026-08-15-help-refanchor-a11y.md` (spec-APPROVED codex-guard R6, 2026-08-15, 0 findings) · **Branch:** `fix/help-refanchor-a11y` · **Implementer:** Opus / Claude Code (UI hard rule) · **Entry:** `BL-HELP-REFANCHOR-A11Y-PASS`

**Meta-test inventory (declared):** CREATES no meta-test. EXTENDS by edit: `tests/help/ref-anchor.test.tsx` (new cases + the two label-pin updates) and `tests/help/page-errors.test.tsx` (skip-path cases). EXTENDS by staying green with no new row: `tests/components/_metaLiveRegionMounting.test.ts` (its `ROOTS = ["components", "app"]` walk covers the new region; the shipped shape must be lawful shape 1 — unconditional region, text toggles). Invariant-9/10 registries untouched (no Supabase call, no mutation surface — a client clipboard write is neither a mutating route nor a server action). Advisory locks untouched. Source-mutation registry: no enrollment (UI component, not a registry-expressible guard surface). §12.4 lockstep does not fire (spec §1.1 item 6).

**Layout-dimensions / transition-audit:** no new fixed-dimension parent→child relationship (spec Dimensional Invariants); all new transitions are instant sr-only text or the layout skip-link recipe's shipped focus behavior (spec Transition Inventory) — no `AnimatePresence`, no exit/initial/animate props anywhere in the diff, asserted by inspection in the gate pass rather than a dedicated task.

**Invariant-8 marker window (deliberate, stated so review does not re-derive it):** this unit merges in two PRs — authoring (this plan + HANDOFF) first, implementation (code + `closeout.md`) second. `tests/docs/_metaInvariant8Closeout.test.ts` requires any plans-tree unit whose files match BOTH gate-half bigram regexes (`CRITIQUE`/`AUDIT`, `tests/docs/_invariant8Closeout.ts:38-39`) to carry a valid marker line at all times on main. A dual-gate unit cannot honestly carry the RAN form before the gate runs, and the `N/A — no UI surface` form would be false for this UI arc. So the authoring-time files reference the gate as "the spec §7 dual gate" (the spec, which lives outside the plans-tree walk, names both halves in full), and `closeout.md` — a committed pending stub at authoring time, completed by the implementation PR — gains the gate record and the §3.3 RAN-form marker in the same commit the gate runs. Main stays green through the window with no false claim at any instant. Task 3's `red=` is the executable proof the marker lands (the wifi-password/tap-target smalls used the same marker-grep red; the two waves instead parked a bare `N/A` line in the plan during their windows — rejected here as a false claim for a UI-only unit).

**AC index (from spec §6, referenced by the task markers):** AC-1 distinct per-code accessible names; AC-2 announcement contract; AC-3 skip path; AC-4 red-then-green + suites green; AC-5 process (worktree, claims, conventional commits, gate marker, graduation).

## Pre-draft verification pass (writing-plans rule; all run 2026-08-15 on the live tree)

- `app/help/_components/RefAnchor.tsx:80` — the static `aria-label="Copy link to this section"`; `app/help/_components/RefAnchor.tsx:65-72` `handleCopyClick` (fire-and-forget `void navigator.clipboard?.writeText?.(url)`); `app/help/_components/RefAnchor.tsx:74-86` single-`Tag` root; NO `role=` attribute anywhere in the file (`rg -n 'role=' app/help/_components/RefAnchor.tsx` → 0 hits).
- `app/help/errors/page.tsx:63-73` jump-list `<nav aria-label="Jump to an error category">`; `app/help/errors/page.tsx:79-98` family groups with `<RefAnchor id={entry.code} as="h3">`; `app/help/errors/page.tsx:100-111` trailing `<Callout type="note">` + `<HelpReportCta />`; NO `#report` anchor or `id="report"` element (probed with ripgrep: the only report-token hits in the file are the Callout prose and the `HelpReportCta` mount).
- Label pins: exactly two — `tests/help/ref-anchor.test.tsx:31` and `tests/help/ref-anchor.test.tsx:74` (`/copy link to this section/i`); `rg -in "copy link to this section" app components tests` finds no third site.
- Prior art: `components/admin/FinalizeButton.tsx:547-553` `FinalizeAnnouncer` (`sr-only`, `role="status"`, `aria-live="polite"`, text mutates); `app/help/layout.tsx:48-55` skip-link recipe (`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-overlay focus:inline-flex focus:min-h-tap-min focus:items-center focus:rounded-md focus:border focus:border-border-strong focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-text-strong focus:shadow-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`) and the `tabIndex={-1}` fragment-focus caveat on `<main id="main">`.
- Family ids (`app/help/errors/_families.ts`): `setup-drive`, `sign-in`, `syncing-sheets`, `crew-schedule`, `diagrams-reels`, `publishing-shows`, `admin-monitoring`, `other-errors` — `report` collides with nothing; catalog codes are SCREAMING_SNAKE by `VALID_ID`.
- Counts: 219 renderable / 281 total catalog entries; `pnpm exec vitest run tests/help` → 61 files / 666 tests green.
- M5-D8 patterns (`tests/messages/no-inline-error-strings.test.ts:52-61`): `const` names ending `COPY`/`MESSAGE`/`ERROR` match — the announcement string must not use such a name (or must carry `// not-subject:M5-D8` with the success-copy reason).
- Graduation registry: `tests/docs/_metaDeferralLedgerGraduation.test.ts` rows are `{ id, provenance }` + a dated comment; provenance = the archived section must contain the impl branch string.
- `/help/errors` absent from `scripts/help-screenshots.ts` and `public/help/screenshots/` — no baseline exposure; every new element is sr-only until focused.

<!-- tasks: depth=2 -->

## Task 1 — RefAnchor: per-code accessible name + copy announcement

<!-- task: red=`pnpm vitest run tests/help/ref-anchor.test.tsx` ac=AC-1,AC-2,AC-4 -->

Red is written by this task (invariant-1 shape): the new cases fail against the live tree because the `aria-label` is the static literal at `app/help/_components/RefAnchor.tsx:80` (two components render IDENTICAL accessible names) and no `role="status"` element exists anywhere in the file (verified: `rg -n 'role=' app/help/_components/RefAnchor.tsx` → 0 hits). The two existing pins (`tests/help/ref-anchor.test.tsx:31` and `tests/help/ref-anchor.test.tsx:74`) are updated to the new name shape in the same edit.

1. **Tests first**, in `tests/help/ref-anchor.test.tsx` (each states the failure mode it catches):
   - Distinct names: render `<RefAnchor id="STALE_WRITE_ABORTED">` and `<RefAnchor id="REPORT_HORIZON_EXPIRED">`; assert each copy-link's accessible name is `Copy link to <its own code>` and the two differ. Catches: the shipped single shared label. Expected names derived from the fixture ids, not hardcoded page counts.
   - Region precedes announcement: BEFORE any click, the component renders a `role="status"` element with `aria-live="polite"` and EMPTY text. Catches: a region inserted together with its text (the `BL-ANNOUNCE-REGION-UNMOUNT-CLASS` defect — announced in review, silent at runtime).
   - Region placement, BOTH modes (spec §3.2 / R3 F1): render `as="h3"` AND default-`as`; assert `heading.contains(statusRegion) === false` in each. Catches: a region nested inside the heading — passes every existence/text assertion while polluting the heading's computed name during announcements.
   - Settlement-gated announcement with DEFERRED promises (spec §3.3 / R4 F1): `writeText` returns a manually controlled deferred. While PENDING: region empty AND `vi.getTimerCount() === 0` (no clear timer armed pre-settlement). Resolve → flush → region text exactly `Link copied` AND count 1. Catches: no announcement at all (shipped tree), optimistic announce-then-retract (false success under a slow clipboard), and a pre-settlement timer that truncates a slow success.
   - Rejection stays silent: reject the deferred → flush → region empty AND `vi.getTimerCount() === 0`. Catches: announcing on click instead of on resolve ("never silently wrong" applied to the announcement).
   - Absent clipboard: with `navigator.clipboard` undefined, region stays empty after click. Catches: an implementation that gates rendering (not just announcing) on clipboard support, or announces unconditionally.
   - Fallback survives every branch (spec R1 F1): in the success, reject, AND API-absent cases, dispatch a cancelable click and assert `defaultPrevented === false`. Catches: a `preventDefault()` that leaves keyboard users with neither confirmation nor navigation.
   - Clear timer: with fake timers, after a successful copy advance past the clear window (2000 ms) and assert the region is empty again. Catches: a perpetual stale `Link copied` that blocks re-announcement and re-reads on SR scan.
   - Restart-on-recopy (spec §3.4(b)): advance partially through the window, copy again (second deferred resolve), assert the region still announces after the partial advance and clears only a full window after the SECOND copy. Catches: a fire-once timer that truncates the second announcement.
   - Unmount cleanup, by pending-timer count (spec §3.4(c) — a console-error oracle is vacuous, React no longer warns on set-state-after-unmount, probed in spec R2): under fake timers, after a successful copy assert `vi.getTimerCount() === 1` (premise — the clear timer is actually scheduled), then `unmount()` and assert `vi.getTimerCount() === 0`. Catches: a leaked timer, by count.
   - Update the two existing label pins (`tests/help/ref-anchor.test.tsx:31` and `tests/help/ref-anchor.test.tsx:74`) to the new per-code names.
2. Observe the suite RED (`pnpm vitest run tests/help/ref-anchor.test.tsx`).
3. **Implement** in `app/help/_components/RefAnchor.tsx` per spec §2.1–§2.2: template `aria-label`; fragment root `<>{heading}<span className="sr-only" role="status" aria-live="polite">{announcement}</span></>` with the region as the heading's FOLLOWING SIBLING (outside the heading so heading names stay clean; safe because `.help-prose` uses no adjacent-sibling combinators — `app/globals.css` `.help-prose` block); `useState("")` + observe the `writeText` promise (resolve → set `Link copied`, start/replace a 2000 ms clear timer; reject or absent API → nothing); timer in a ref, cleared on unmount and on re-copy. Avoid M5-D8 const-name patterns. No `preventDefault` (middle-click/open-in-tab contract at `RefAnchor.tsx:60-64` survives).
4. GREEN: the suite passes; `pnpm vitest run tests/components/_metaLiveRegionMounting.test.ts` green with NO new exemption row (the diff adds no line to `CHANNEL_ANNOUNCERS` — assert by `git diff --stat` inspection in the commit body).
5. Terminal old-label sweep (spec §2.1 lockstep): `rg -in "copy link to this section" app components tests` returns ZERO hits — run and recorded in the commit body.
6. Four pre-dispatch mutants for the string-presence assertions (writing-plans rule), run before the diff review dispatch and recorded in the commit: (a) announcement value emptied; (b) `Link copied` plus an appended suffix; (c) the string present but not live (behind a false condition); (d) the discriminating parameter varied (a different `id` must change the aria-label). Each must fail the suite.
7. Commit `fix(help): per-code copy-link names + copy announcement in RefAnchor`.

## Task 2 — /help/errors: skip path to the report CTA

<!-- task: red=`pnpm vitest run tests/help/page-errors.test.tsx` ac=AC-3,AC-4 -->

Red is written by this task (invariant-1 shape): the new cases fail against the live tree because `app/help/errors/page.tsx` renders no skip anchor and no `id="report"` element (verified on the live tree — the only "report" tokens are the Callout prose and `HelpReportCta`).

1. **Tests first**, in `tests/help/page-errors.test.tsx`:
   - Premise (executable, `tests/_shared/premise.ts`), derived from the PAGE'S OWN inputs (plan R1 F3 — the file's existing local `renderableCodes` filter excludes info-severity entries and counts 217 where the page renders 219): import `predicate` from `lib/messages/catalogDocsValidator` — the same symbol the page imports at `app/help/errors/page.tsx:30` — and assert `premise("renderable catalog entries make the many-stop problem reachable", Object.values(MESSAGE_CATALOG).filter(predicate).length, 1)`. A premise on an adjacent subset is not a premise.
   - Skip link identity (spec §3.5(a)): an anchor with accessible name `Skip to the report button` AND `href="#report"` exists. Catches: a first-position link pointing elsewhere passing the ordering checks (plan R1 F2).
   - Skip link is the FIRST page-contributed focusable (spec §3.5(a) / R3 F2): among ALL anchors/tabbables in the rendered fragment, THAT anchor is index 0 — not merely before the first copy-link (the jump-list nav contributes seven-plus family anchors that a loose ordering assertion would let precede it). Catches: the shipped tree (no anchor) and a skip link parked after the nav.
   - Copy-links stay tabbable (spec AC-3 / §1.1 item 1): assert the first rendered copy-link carries NO `tabindex` attribute (an anchor with an href is natively tabbable; a negative tabindex is the only cheap way to remove it). Catches: an implementation that "solves" the 219 stops by pulling the controls from the tab order — the pre-ratified-against remedy.
   - Target shape (spec §3.5(b)-(c)): an element with `id="report"` exists, carries `tabindex="-1"`, its FIRST tabbable descendant is the report CTA button (not merely a descendant — a wrapper spanning nav + entries + Callout satisfies bare containment while the post-jump Tab lands on an entry anchor), and it contains neither the jump-list `<nav>` nor any catalog heading. Catches: a fragment target that cannot receive focus (the Safari/VoiceOver caveat `app/help/layout.tsx` documents) and an over-wide wrapper.
   - Visibility + tap floor (spec §3.5(d) / R4 F2): the skip link's class list carries `sr-only`, `focus:not-sr-only`, AND `focus:min-h-tap-min` — class-list assertion, since jsdom computes no layout; precedent `tests/help/skip-link.test.tsx:70` pins exactly these classes on the layout skip link. Catches: a permanently sr-only or sub-44px anchor that passes every identity/ordering assertion.
2. Observe RED (`pnpm vitest run tests/help/page-errors.test.tsx`).
3. **Implement** in `app/help/errors/page.tsx` per spec §2.3: the anchor immediately before the jump-list `<nav>`, class string copied verbatim from the layout skip link; wrap the trailing `<Callout>` block in `<div id="report" tabIndex={-1}>`. Server markup only — the page keeps zero client hooks (`tests/help/page-errors.test.tsx` already pins no `useState`/`"use client"` in the page source).
4. GREEN: the file's suite passes; then `pnpm exec vitest run tests/help` green (61 files at authoring — anchor walkers, crosswalk, prose-layer, polish all still pass).
5. Four pre-dispatch mutants for Task 2's string-presence assertions (same rule as Task 1's): the skip-link visible text emptied; the text plus a suffix; the `#report` href changed while the text stays; each of the three class tokens dropped in turn. Each must fail the suite; run before the diff review dispatch and recorded in the commit.
6. Commit `fix(help): skip link past the error catalog to the report CTA`.

## Task 3 — spec §7 dual gate + closeout marker

<!-- task: red=`grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=[0-9]+ p1=[0-9]+ dispositions=(recorded|none)$" docs/superpowers/plans/2026-08-15-help-refanchor-a11y/closeout.md` ac=AC-5 -->

Red now and until the gate runs: the committed `closeout.md` is a pending stub with NO marker line, so the grep exits 1 (it exited 2 before the stub was committed); it exits 0 once the marker lands in the §3.3 grammar — same command throughout. (RUN at plan time — see the validation record below.)

1. Run the spec §7 dual gate on the arc diff (both halves, in order, with the skill's canonical setup gates — context load of PRODUCT.md + DESIGN.md, then the register reference read). The diff is `app/help/**` UI — Opus implements and gates it directly per the routing hard rule. The audit half MUST include the real-browser scenario spec §3 assigns to it BY NAME: activate the skip link on `/help/errors`, confirm focus lands on the `#report` wrapper, and confirm the NEXT Tab lands on the report button (jsdom cannot prove fragment-focus behavior; this is the gate's job, not a unit test's).
2. P0/P1 findings: fix in-branch, or defer via a `DEFERRED.md` entry per invariant 8. Re-run the failed half after any fix.
3. Write `docs/superpowers/plans/2026-08-15-help-refanchor-a11y/closeout.md`: the gate record (both halves, findings, dispositions) and the marker line in the exact §3.3 RAN grammar with honest values (cross-check rule: `p0+p1 > 0` requires `dispositions=recorded`, zero requires `none`). This is the commit where the unit starts naming both gate halves — marker and naming land together (see the marker-window note above).
4. GREEN: the task's grep passes; `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` green.
5. Commit `docs(help): invariant-8 closeout for the RefAnchor a11y arc`.

## Task 4 — graduation + merge sequence

<!-- task: red=`sh -c '! grep -q "^### BL-HELP-REFANCHOR-A11Y-PASS" BACKLOG.md'` ac=AC-5 -->

Red now (RUN at plan time, exit 1 — the entry heading is live in BACKLOG.md); exits 0 once the entry graduates to the archive. Same command both times.

1. Graduate `BL-HELP-REFANCHOR-A11Y-PASS` to `BACKLOG-archive.md` with a dated resolution paragraph naming all three repairs and the two documented-limit families (spec §4); the in-flight marker (`**Branch:** fix/help-refanchor-a11y`) comes OFF in this same move (invariant 12's sanctioned shape — archives categorically reject in-progress entries). Completion checks (the red alone would pass on a bare deletion): `grep -q "BL-HELP-REFANCHOR-A11Y-PASS" BACKLOG-archive.md` AND a registry row `{ id: "BL-HELP-REFANCHOR-A11Y-PASS", provenance: "fix/help-refanchor-a11y" }` with a dated comment in `tests/docs/_metaDeferralLedgerGraduation.test.ts`.
2. COMMIT the graduation now, before anything is pushed (plan R1 F1 — the graduation is the PR's last substantive commit, so it precedes push, review, CI, and merge): `docs(backlog): graduate BL-HELP-REFANCHOR-A11Y-PASS — RefAnchor a11y pass shipped`.
3. `pnpm vitest run tests/docs` green (ledger meta-suites walk the files from disk).
4. Pre-push gates: `pnpm heavy pnpm test` (full suite under the machine-wide slot semaphore), `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
5. Merge `origin/main` (BACKLOG.md is contended — sibling smalls groupings and live arcs touch it; resolve per-entry, preserving both sides), re-run `pnpm vitest run tests/docs`, push, open the PR (body: gates run, probe notes, the marker-window design note). Cross-model whole-diff review to APPROVE (codex-guard `--stage diff`, REVIEWER ONLY brief with the convergence contract, round cap 4). Real CI green, then `gh pr merge --merge` in the same turn; ff main and verify `git rev-list --left-right --count main...origin/main` → `0 0`.

<!-- tasks: end -->

## Plan-time `red=` validation record (writing-plans rule, run 2026-08-15)

- Task 1/Task 2 reds: written by their tasks (invariant-1 shape) — not run at plan time; the production lines whose absence fails them are named in each task body and were verified absent on the live tree (the `rg` probes above).
- Task 3 red: RUN 2026-08-15 — the full RAN-form grep against `docs/superpowers/plans/2026-08-15-help-refanchor-a11y/closeout.md`; observed exit 2 with no file, and exit 1 against the committed pending stub (no marker line). It exits 0 once the marker lands — same command throughout.
- Task 4 red: RUN 2026-08-15 — `sh -c '! grep -q "^### BL-HELP-REFANCHOR-A11Y-PASS" BACKLOG.md'`; observed exit 1 (`grep -c` on the heading → 1, the entry is live).
- Gate-command mutants (writing-plans red-executability rule), all RUN 2026-08-15: (a) the Task 3 grep against a CONSTRUCTED closeout stub carrying a cross-check-violating marker (`p0=0 p1=0 dispositions=recorded`) — observed exit 0: the grep ACCEPTS it, which is why Task 3 step 4 also runs `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` — the meta-test is the validity gate, the grep only the presence gate; (b) the Task 4 completion-check greps against the CURRENT (failing) state — `grep -q "BL-HELP-REFANCHOR-A11Y-PASS" BACKLOG-archive.md` → exit 1 and the registry grep on `tests/docs/_metaDeferralLedgerGraduation.test.ts` → exit 1, both non-zero on exactly the failure they name.

## Adversarial review (cross-model)

This plan is reviewed by codex-guard (`--stage plan`) to APPROVE before the authoring PR opens; the implementation diff gets its own `--stage diff` review to APPROVE before merge (Task 4.4). Round economy rules apply; the JSONL corpus rows commit with the arc.
