# Plan — the scheduled-job health fallback gets a retry control

No spec: `BACKLOG.md`'s `BL-TELEMETRY-FALLBACK-RETRY` already states the fix and the idiom, and the telemetry page spec `docs/superpowers/specs/observability/2026-07-06-telemetry-console-redesign.md` §7.1 already ratifies the control being copied. Branch `feat/telemetry-fallback-retry`. Closes `BL-TELEMETRY-FALLBACK-RETRY`.

**The invariant-8 closeout marker lives in the stem-named sibling closeout file**, this plan's own stem with a closeout suffix, alongside it in `docs/superpowers/plans/`, written by Task 5 when the gate actually runs. A plan authored before the run cannot state a true `p0=`/`p1=` count, and the marker grammar has no placeholder.

## 0. What makes this correct, in one paragraph

The page is a server component (`app/admin/dev/telemetry/page.tsx:19`) whose four reads run in one `Promise.all` (`app/admin/dev/telemetry/page.tsx:28-33`), and the fallback is the else arm of the health.kind ternary at `app/admin/dev/telemetry/page.tsx:77`, so it renders whenever `loadCronHealth()` did not return `kind: "ok"`. Re-reading therefore means re-running the server render, and the page already has exactly one mechanism for that: `router.refresh()`, which `AutoRefreshControl` calls from both its 20s interval and its manual icon-button (`components/admin/telemetry/AutoRefreshControl.tsx:19`). The retry is that same call, placed inside the branch that has no recourse. Nothing about the data path changes: the same loader, the same gate, the same `force-dynamic` render. What changes is that the reader can ask for the re-read instead of waiting 20 seconds or reloading the page.

## 1. Plan-wide invariants that bear on this diff

- **Invariant 1, TDD per task.** Every task is red-then-green on the same command, with the red observed and pasted into the commit body. Task 4 is a REGRESSION-SHAPE change and names the planted mutant that makes it red instead.
- **Invariant 2, advisory locks.** N/A. No code path here mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs` or `pending_ingestions`; nothing acquires, moves or releases a lock.
- **Invariant 5, no raw error codes in user-visible UI.** The fallback's copy is unchanged and carries no code; the new button label and announcement carry none either.
- **Invariant 6, commit per task.** `feat(admin):`, `test(admin):`, `docs(plan):`.
- **Invariant 8, UI quality gate.** IN SCOPE. `app/admin/dev/telemetry/page.tsx` and a new file under `components/`. Task 5 runs `/impeccable critique` and `/impeccable audit` and fills the marker line in the sibling closeout.
- **Invariant 9, Supabase call boundaries.** N/A. No Supabase client call is added. `loadCronHealth` is untouched and already registered (`tests/admin/_infraRegistry.ts`).
- **Invariant 10, mutation-surface observability.** N/A, and the reason is load-bearing rather than assumed: the retry adds no mutating route handler and no `"use server"` action of either form. `router.refresh()` re-runs a READ. Nothing is written, so there is no admin mutation surface to register in `AUDITABLE_MUTATIONS` and no `// no-telemetry:` exemption is owed.
- **Invariant 11, worktree.** `../FX-worktrees/telemretry`, branched from `origin/main` `66c9857f5`.
- **Invariant 12, ledger.** Marked in progress at Stage 0 (`8ce978c98`); archived and unmarked in the PR's last commit.

**No enrolled mutation surface is touched.** `grep -n sourcePath tests/mutation/source/registry.ts` lists no path under `app/admin/dev/telemetry/` or `components/admin/telemetry/`, so no score is claimed and none is enrolled under review pressure.

## 1.1 Do not relitigate

- **The 2026-08-04 PREREQ-FENCED disposition on this row.** It fenced the entry out of `chore/sweep-guards-tests`, a guards-only branch that marked itself `impeccable-gate: N/A — no UI surface`, on the stated ground that "the fix is a retry control on `app/admin/dev/telemetry/page.tsx`, which is an invariant-8 UI surface". This branch IS the UI branch and runs the dual gate. The fence is satisfied, not overridden.
- **The fallback copy's two sentences** (“Couldn’t load scheduled-job health right now. The jobs are probably still running.”) landed in the #601 follow-up and are OUT OF SCOPE. The row's own text says what is still missing is "the recourse half". A finding that re-words either sentence is a documented limit, not a round.
- **The row's trigger is met.** "The next telemetry pass, or a report of the readout failing in practice" — Eric queued this arc 2026-08-27 07:39. Do not re-derive whether the entry is ripe.
- **The reference finding, quoted, so its scope is not re-expanded.** #601 impeccable critique P1, as the entry records it: the fallback "named neither a cause nor a recourse at the moment Doug’s stress is highest". The cause half shipped in the follow-up. This arc closes the recourse half. A finding that the cause half is inadequate re-opens a closed P1.
- **No pending or disabled state on the control, and this is a decision rather than an omission.** §3.2 gives the reasoning and the sibling that shares it. A finding that the button should disable itself while a refresh is in flight must first show a defect the App Router's own coalescing does not already prevent.
- **Success is not announced.** §3.2 again: the control unmounts with the branch it lives in, and every sibling control on this page family behaves the same way. A finding that success needs an announcement is a proposal to hoist the channel, which is a different arc.
- **No new ledger row**, of any facing, under any exception clause, per the 2026-08-27 arc-batch directive. Unrepaired peers go in the PR body under "Unfixed peers" and in the readiness message.

## 2. Pre-draft code-verification pass, run 2026-08-27

Every claim this plan makes about existing code, checked against the live tree at `66c9857f5`.

```
$ sed -n '77,87p' app/admin/dev/telemetry/page.tsx
health.kind === "ok" ? <CronHealthList …/> : <div data-testid="cron-health-degraded"
  className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm">…

$ grep -n 'autorefresh-manual' -A 6 components/admin/telemetry/AutoRefreshControl.tsx
:121 data-testid, :122 aria-label="Refresh now", :123 onClick={doRefresh},
:124 className="inline-flex min-h-tap-min min-w-tap-min … border border-text-faint p-1.5 …",
:126 <RotateCw className="size-4" aria-hidden />

$ grep -n 'CORPUS_DIRS' tests/styles/interactiveScanCore.ts
85:const CORPUS_DIRS = ["app", "components"] as const;

$ grep -n sourcePath tests/mutation/source/registry.ts | grep -c telemetry
0
```

| Claim | Anchor | Confirmed shape |
| --- | --- | --- |
| the fallback branch and its plate | `app/admin/dev/telemetry/page.tsx:81` | `data-testid="cron-health-degraded"`, on `bg-warning-bg`, one text node |
| the fallback's copy, with a curly apostrophe | `app/admin/dev/telemetry/page.tsx:84` | `Couldn’t load scheduled-job health right now. The jobs are probably still running.` |
| the control being mirrored | `components/admin/telemetry/AutoRefreshControl.tsx:119-127` | `RotateCw` icon button, `min-h-tap-min`, `onClick={doRefresh}` |
| the refresh call itself | `components/admin/telemetry/AutoRefreshControl.tsx:19` | `router.refresh()` inside `doRefresh` |
| §7.1 ratifies the manual button | `docs/superpowers/specs/observability/2026-07-06-telemetry-console-redesign.md:263` | 30px rotate-cw icon-button, `min-h-tap-min` tap target |
| the page mounts that control | `app/admin/dev/telemetry/page.tsx:15` and `app/admin/dev/telemetry/page.tsx:51` | the import, and `rightSlot={<AutoRefreshControl />}` |
| a control on a tinted plate wears its own outline token | `docs/superpowers/specs/2026-08-25-ui-polish-class-sweep-design.md:20` (D2) | `--color-control-outline-tinted`, used only on `warning-bg` / `info-bg` / `danger-bg` |
| the token exists in both themes | `app/globals.css:98`, `app/globals.css:385`, `app/globals.css:447` | `#7e7f86` light, `#88867f` dark |
| the nearest sibling: a button on a warning plate that calls `router.refresh()` | `components/admin/PerShowAlertResolveButton.tsx:81` and `components/admin/PerShowAlertResolveButton.tsx:94` | `border-control-outline-tinted bg-bg … focus-visible:ring-offset-warning-bg` |
| a sibling control that unmounts on its own success | `components/admin/telemetry/HealthAlertResolveButton.tsx:20-33` | resolve removes the row that renders the button |
| the always-mounted live region idiom | `components/admin/ShowRowActions.tsx:603-609` | `role="status"`, `aria-live="polite"`, `sr-only`, text toggled |
| a repeated identical string needs a seq toggle to re-announce | `components/admin/ShowRowActions.tsx:608` | parity on `announcement.seq`, appending a non-breaking space on one branch |
| the tap-target floor walks `components/` | `tests/styles/interactiveScanCore.ts:85`, `tests/styles/_metaTapTargetFloor.test.ts:39` | `CORPUS_DIRS = ["app","components"]`, scanned from `process.cwd()` |
| the transition audit's population is a hand-written list | `tests/components/telemetry/transitionAudit.test.tsx:27-36` | nine literal filenames |
| the page's existing test fixtures | `tests/app/admin/telemetryPage.test.tsx:50-70` | `loadCronHealth` mocked to `{ kind: "infra_error", message: "x" }`, `next/navigation` mocked |
| the em-dash ban and its guard | `DESIGN.md:879` | `tests/styles/_metaEmDashCopy.test.ts` |

**Two claims checked and REFUTED before they reached a task, recorded so nobody re-derives them in the wrong direction.**

1. `border-text-faint` is what the mirrored button wears (`components/admin/telemetry/AutoRefreshControl.tsx:124`), and copying it verbatim onto the fallback would be WRONG. That button stands on `bg-surface`; the retry stands on `bg-warning-bg`, and D2 exists because `text-faint` measures 2.79-3.04 against a tinted plate and misses the 3:1 non-text floor in one theme per plate. "Same shape as the manual refresh" means the same icon, the same tap floor and the same one-tap contract, not the same border token.
2. A guard WOULD have caught it, and this plan's first draft asserted the opposite. `tests/styles/_metaControlOutlineFill.test.ts:7` does fence itself to the closed 57-row census and does say it "does NOT defend against a contributor adding a NEW control at either token", so that half was right. It is not the whole picture. `tests/styles/tintedPlateOutline.test.ts:82` derives its subject list from each element's OWN class strings: anything declaring both a `focus-visible:ring-offset-(warning|info|danger)-bg` plate and a resting outline token. The new control declares both, so it enrols on arrival and `border-text-faint` reds it. That guard is a later arc closing the limit the 2026-08-25 design had recorded as open, that "a fourteenth file gaining its first tinted-plate control is still outside the cover". **Recorded in both directions so neither half is re-derived:** the census guard's fence is accurate and unchanged, and a forward cover exists anyway, from a guard written afterwards.

## 3. The change

### 3.1 The control

One new client component, **CronHealthRetryButton.tsx** under `components/admin/telemetry/`, taking no props (so no prop can be null, empty, zero or NaN, and there is no guard table to write for its inputs):

- A `<button type="button">` carrying `data-testid="cron-health-retry"`, the `RotateCw` lucide icon (`size-4`, `aria-hidden`) and the visible text `Try again`.
- `aria-label="Try again to load scheduled-job health"`. The visible string is a prefix of the accessible name, so WCAG 2.5.3 (label in name) holds; the longer name is what a screen-reader user hears when landing on the control out of context, where a bare "Try again" names nothing.
- `onClick` increments an attempt counter and calls `router.refresh()`.
- Classes, taken from `components/admin/PerShowAlertResolveButton.tsx:94` because that is the shipped control on this exact plate: `inline-flex min-h-tap-min shrink-0 items-center justify-center gap-1.5 rounded-sm border border-control-outline-tinted bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg`.
- A sibling `<span role="status" aria-live="polite" className="sr-only" data-testid="cron-health-retry-status">`, mounted unconditionally with empty text and filled on activation. Mounted-then-filled is the order that actually announces; a region inserted together with its text is not.
- Three exported string constants (`CRON_HEALTH_RETRY_TEXT`, `CRON_HEALTH_RETRY_LABEL`, `CRON_HEALTH_RETRY_ANNOUNCEMENT`) so the tests assert against the shipped copy rather than a retyped duplicate of it.

### 3.2 Guard conditions, each with the reason it resolves the way it does

| Condition | Behaviour | Why |
| --- | --- | --- |
| A retry is activated while a refresh is already in flight | Nothing is disabled; a second tap issues a second `router.refresh()` | The control this mirrors has no pending state either (`components/admin/telemetry/AutoRefreshControl.tsx:119-127`), and its 20s interval already fires refreshes that overlap a manual one. Adding a disable would need an in-flight signal `router.refresh()` does not return, and the state it would introduce is the only state in this component that could get STUCK, on a surface whose whole defect is having no recourse. No state, nothing to strand. |
| The retry succeeds | The health branch flips to `CronHealthList`; the fallback, the button and the status region unmount together | This is the same swap the 20s auto-refresh already performs unannounced today. Nothing announces success, matching `HealthAlertResolveButton` and `PerShowAlertResolveButton`, both of which unmount on their own success on this page family. |
| The retry fails again | The server re-renders the same fallback: copy unchanged, control still mounted, counter incremented, region re-announces | The counter's parity toggle appends a non-breaking space on alternate attempts so a screen reader does not swallow the repeated identical string (`components/admin/ShowRowActions.tsx:608`). Without it the second failed attempt is silent, which is the same silence the row exists to fix. |
| `health.kind` is anything other than `"ok"` | The fallback renders exactly as today, retry included | The branch is on `kind`, not on a message; `loadCronHealth`'s non-ok shape carries no field the control reads. |
| A viewer with reduced motion | Unchanged | The control has no animation at all. See §4. |

### 3.3 The page edit

`app/admin/dev/telemetry/page.tsx` imports the control and the fallback becomes a column: the existing `<p>` of copy, then the button. Stacked rather than side by side because the fallback lives in the 340px sidebar (`app/admin/dev/telemetry/page.tsx:57`), where a 44px-tall button beside two sentences leaves the text a column too narrow to read. The plate, the border, the padding and both sentences are byte-identical to what ships today.

### 3.4 Transition inventory

| Element | States | Treatment |
| --- | --- | --- |
| Retry button | default / hover / focus-visible / active | `transition-colors duration-fast` on the hover fill, the token pair every sibling control uses. No transform, no layout animation. |
| Retry button | present / absent (health recovers) | Instant. The branch swap is a server re-render; nothing animates in or out, exactly as §9 of the telemetry spec specifies for every element on this page except `EventRow`. |
| Status region | empty / announcing | Instant, and deliberately: it is `sr-only`, so it has no visual state to transition. |

Compound states: a retry activated while an `EventRow` is mid-expand touches independent subtrees, the same independence `tests/components/telemetry/transitionAudit.test.tsx:94-111` already asserts for the auto-refresh toggle. A retry activated while the 20s auto-refresh is mid-flight is two `router.refresh()` calls, which is the pre-existing contract of that control and is out of scope per the brief's fence.

### 3.5 Dimensional invariants

None introduced. The fallback is a content-height `<div>` with no fixed dimension, and it gains a content-height child. No fixed-dimension parent acquires a flex or grid child anywhere in this diff, so the layout-dimensions rule's real-browser assertion is not triggered.

## 4. Meta-test inventory

**The cover is derived, not enumerated, and the derivation is the point.** Two populations gain a member: guards that walk `app/` and `components/` see the new component, and guards that derive from `tests/**` see the new test file. A grep for walkers over those roots returns more than forty files, and the count over `tests/` alone is in the hundreds, so a hand-picked list of "the guards this diff touches" is exactly the shape that goes stale the day someone adds another walker. **What actually proves the cover is running the whole tree before the push**, and the pre-push set is derived from `.github/workflows/quality.yml` rather than remembered: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, plus the full suite.

The table below is therefore NOT the cover. It is the shorter list of guards whose claim the implementation must actively SATISFY, each with the thing it demands, so a failure is attributed rather than guessed at. A red from any guard outside it is still this diff's to explain.

| Guard | What it demands of this diff | Status |
| --- | --- | --- |
| `tests/styles/tintedPlateOutline.test.ts:82` | derives its subjects from the element's own classes: a `focus-visible:ring-offset-warning-bg` plate plus a resting outline must carry `border-control-outline-tinted` | the control enrols on arrival and carries the tinted token; this is the guard §2 originally claimed did not exist |
| `tests/styles/noBareRingOffset.test.ts:19` | a `ring-offset-2` needs a same-variant-chain companion naming a `FOCUS_BACKDROP_ALLOWLIST` token | `focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg`, and `warning-bg` is a member (`tests/styles/_focusBackdropAllowlist.ts:14`) |
| `tests/components/_metaLiveRegionMounting.test.ts` | a live region may not be born populated: no `cond && <region>`, no `cond ? <region> : null`, no hiding className | the region is unconditionally rendered and its TEXT is what the ternary selects; `sr-only` is explicitly not a hiding class there (`tests/components/_metaLiveRegionMounting.test.ts:705`) |
| `tests/components/_metaOrphanedComponents.test.ts:40` | a new component needs a production importer, not just a test one | imported by `app/admin/dev/telemetry/page.tsx` in the same task |
| `tests/styles/_metaTapTargetFloor.test.ts:39` | walks `app` + `components`; the element must be CLEAR, an unconditional height floor with no defeater | `min-h-tap-min` is unconditional in the class string |
| `tests/styles/_metaEmDashCopy.test.ts` | no em dash and no `--` in any string literal | none in the new copy |
| `tests/cross-cutting/vitest-projects-partition.test.ts:231` | the new test file must land in exactly one project's population | `tests/components/**/*.test.{ts,tsx}` is already in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:105`) |
| `tests/cross-cutting/vitest-shard-balance.test.ts:41` | the derived shard population gains the file and must still balance | no action; recorded so a shard-balance red is attributed to this diff rather than hunted |
| `tests/docs/_metaInvariant8Closeout.test.ts` | this plan declares both gate halves, so it owes a marker | RED for the whole arc by construction; Task 5 closes it |
| `tests/styles/_metaControlOutlineFill.test.ts` | pins a closed 57-row census | UNCHANGED; the new element is not a census row |
| `tests/styles/_metaUndoAnnounceProvider.test.ts` | guards providers, not consumers | UNCHANGED; no provider is added |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | filesystem-walked, fails a new mutation surface by default | UNCHANGED; no mutating route handler and no `"use server"` action |
| `tests/components/telemetry/transitionAudit.test.tsx` | its population is nine literal filenames today | Task 4 derives it, which is how the new file gets covered without an edit |

## 4.1 Test wiring, and the sweeps this plan ran rather than described

The one new test file lands under `tests/components/telemetry/`. No wiring step is owed: `BASE_INCLUDE` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) and `PARALLEL_TEST_GLOBS` already carries `tests/components/**/*.test.{ts,tsx}` (`vitest.projects.ts:105`), so the file joins the parallel project on arrival. Nothing in `.github/workflows/` filters on a narrower path for the unit suite.

**Sweep run at plan time, 2026-08-27, for Task 4's derivation.** The question the derivation rests on is whether every `.tsx` in the telemetry component directory except `EventRow.tsx` is animation-free today. Run, not described:

```
$ for f in components/admin/telemetry/*.tsx; do
    echo "$(basename $f) animated=$(grep -cE 'AnimatePresence|motion\.|exit=\{' $f)"; done
ActiveFilterChips.tsx animated=0     EventLevelBadge.tsx animated=0
AutoRefreshControl.tsx animated=0    EventRow.tsx animated=6
ContextDetail.tsx animated=0         EventTimeline.tsx animated=0
CronHealthHeader.tsx animated=0      EventVolumeSparkline.tsx animated=0
CronHealthList.tsx animated=0        HealthAlertResolveButton.tsx animated=0
CronRunSummaryCard.tsx animated=0    HealthAlertsPanel.tsx animated=0
EventFilters.tsx animated=0          TelemetryOverviewStrip.tsx animated=0
```

Fourteen files, one animated, and it is the one the audit already exempts. So the derived population is green on arrival, and it covers five files the literal list omits: `ContextDetail.tsx`, `EventLevelBadge.tsx`, `HealthAlertResolveButton.tsx`, `HealthAlertsPanel.tsx`, and the file this arc adds.

**Mutation families for Task 4, enumerated up front as the closure set.** The derived population changes WHICH files are scanned, never WHAT is asserted, so the families are exactly the three tokens the existing assertion already matches, applied to a file the literal list did not name: (i) `AnimatePresence` in a newly added telemetry component; (ii) `motion.` in one; (iii) `exit={` in one. A reviewer-proposed fourth family is admissible only with a live escaping mutant demonstrated against the shipped derivation.

## 5. Task list

<!-- tasks: depth=3 red-contract -->

### Task 1 — the control renders in the fallback and one tap re-reads

<!-- task: red=`pnpm vitest run tests/app/admin/telemetryPage.test.tsx` red-state=authored red-target=`app/admin/dev/telemetry/page.tsx:84` why=`the fallback at page.tsx:84 renders one text node and no control, so a new case querying cron-health-retry inside cron-health-degraded cannot find it and the loader-count assertion never reaches two` ac=AC-1,AC-2,AC-3 -->

- [ ] **1.1** Add one case to `tests/app/admin/telemetryPage.test.tsx`, built on the file's existing mock shape (`tests/app/admin/telemetryPage.test.tsx:50-56`): `loadCronHealth` a `vi.fn` returning `{ kind: "infra_error", message: "x" }`, `loadAppEvents` returning the empty ok shape.
- [ ] **1.2** **Premise, on the case's own inputs, executed unconditionally.** Before the click, `premise("the fallback branch is the one rendered", screen.queryAllByTestId("cron-health-degraded").length, 0)` from `tests/_shared/premise.ts`. Without it every later assertion is vacuously satisfiable by a page that rendered the ok branch and has no fallback at all, which is exactly the degenerate case a drifting `loadCronHealth` mock produces.
- [ ] **1.3** Assert `cron-health-retry` is inside `cron-health-degraded`, using `within(screen.getByTestId("cron-health-degraded"))`. **Scoped deliberately**: the page's header slot already renders `autorefresh-manual`, a second rotate-icon refresh control, and an unscoped query would be satisfied by it.
- [ ] **1.4** Capture `before = loadCronHealth.mock.calls.length` after the first render. Click. Assert the count reaches `before + 1`, derived from observed state rather than written as a literal, and separately assert `renders === 2` so a harness that silently re-rendered twice cannot satisfy it. **An earlier draft asked for both "exactly two" and `renders + 1`; with `renders` at two after the refresh those are 2 and 3, so a correct implementation would have stayed red for a test-local reason.** Swept: this was the plan's only derived-count expression, and §6's AC-2 wording is corrected to match.
- [ ] **1.5** The second call is driven by the CLICK, not by the test body. The `refresh` mock is given an implementation that re-invokes `Page(...)` and re-renders the result, which is what the App Router does on `router.refresh()` for a `force-dynamic` server component (`app/admin/dev/telemetry/page.tsx:17`). Nothing else in the case re-renders, so a button that never calls `refresh` leaves the count at one. The assertion is on `loadCronHealth`, the data source, so a control that calls `refresh` without the page re-reading also fails.
- [ ] **1.6** The consequence bound, written as assertions: `push` and `replace` were never called, and the control is `type="button"` carrying no `href`, which is every navigation vector a control in this position has. **No `window.location.reload` spy**: jsdom defines `reload` non-writable and non-configurable, so `vi.spyOn(window.location, "reload")` throws before it can prove anything, and a test that cannot reach green through the named production change is not a test. The reload half of the bound is instead carried by the mechanism: `router.refresh()` is the only navigation call the control makes, asserted at Task 3 case 5. Swept: the reload spy appeared nowhere else in this plan.
- [ ] **1.7** Run the RED. Record the observed failure (the `within` query finds no `cron-health-retry`) in the commit body.
- [ ] **1.8** GREEN: the new **CronHealthRetryButton.tsx** per §3.1, plus the page edit per §3.3.
- [ ] **1.9** Commit `feat(admin): the scheduled-job health fallback offers a retry`.

### Task 2 — success replaces the fallback, repeated failure keeps it

<!-- task: red=`pnpm vitest run tests/app/admin/telemetryPage.test.tsx` red-state=authored red-target=`components/admin/telemetry/CronHealthRetryButton.tsx` why=`the repeat-failure case is red under a planted early return in the control shipped by Task 1, which is the defect shape it exists to catch; both cases then pass against the unplanted implementation` ac=AC-4,AC-5 -->

- [ ] **2.1** Success case: `loadCronHealth` returns `infra_error` once, then `{ kind: "ok", jobs: [oneFixtureRow] }`, reusing the row shape already in this file (`tests/app/admin/telemetryPage.test.tsx:80-94`). After the click, `cron-health-degraded` is gone, `cron-health-retry` is gone with it, and the job's label is on screen. **The expected label is read off the fixture object** (`jobs[0].label`), never retyped, so a fixture whose label changes cannot leave the assertion passing against a stale string.
- [ ] **2.2** Repeat-failure case: `loadCronHealth` returns `infra_error` every time. After two clicks, `cron-health-degraded` is still present, `cron-health-retry` is still present, the fallback's text still contains both shipped sentences, and `loadCronHealth` has been called exactly three times. Asserting the two sentences is what turns "copy unchanged" from a claim into a test.
- [ ] **2.3** **Premise for the success case, on its own inputs**: assert the fixture row's label is a non-empty string before asserting it renders. A fixture whose label is `""` makes the on-screen assertion pass against any DOM.
- [ ] **2.4** Observe RED by planting `if (attempts > 0) return null;` in the control. That reds the repeat-failure case while leaving the success case green, which is the discrimination the pair claims. Both runs go in the commit body.
- [ ] **2.5** Remove the plant, confirm both green, commit `test(admin): the retry's success and repeat-failure outcomes`.

### Task 3 — the announcement, and the repeat that would have been silent

<!-- task: red=`pnpm vitest run tests/components/telemetry/cronHealthRetryButton.test.tsx` red-state=authored red-target=`components/admin/telemetry/CronHealthRetryButton.tsx` why=`the seq-toggle branch in the status region is the only production code that makes a second identical failure announcement distinguishable from the first; planting it away reds case 3 alone` ac=AC-6 -->

- [ ] **3.1** New file under `tests/components/telemetry/`, named for the component (**cronHealthRetryButton.test.tsx**), `@vitest-environment jsdom`, rendering the control in isolation with `next/navigation` mocked in the shape `tests/components/telemetry/transitionAudit.test.tsx:10-14` already uses.
- [ ] **3.2** Case 1: before any click the status region EXISTS and its text is empty. This pins mounted-then-filled. A control that renders its region only once it has something to say passes every other case here and announces nothing in a real browser, because a live region inserted together with its text is not announced.
- [ ] **3.3** Case 2: after one click the region's text contains `CRON_HEALTH_RETRY_ANNOUNCEMENT`, imported from the component rather than retyped, AND its trimmed length is greater than zero. **The second half is not decoration.** Every string contains the empty string, so with the constant emptied `toContain` passes; the parity space still makes attempt two differ from attempt one, so case 3 passes too, and mutant (a) survives the whole file. Asserting the RENDERED text is non-empty is what kills it, and it is asserted on the DOM rather than on the constant so the check cannot be satisfied by the constant alone.
- [ ] **3.4** Case 3: after a second click the region's text DIFFERS from the value captured after the first click, while still containing the announcement. Compared against the captured value, not against a literal carrying a specific whitespace character, so the case states the property (a repeat is distinguishable) rather than the current encoding of it.
- [ ] **3.5** Case 4: the accessible name contains the visible text (WCAG 2.5.3), both read off the rendered button rather than off the constants.
- [ ] **3.6** Case 5: `router.refresh` called once per click; `push` and `replace` never.
- [ ] **3.7** **The four pre-dispatch mutants, run and recorded before any review dispatch**, because cases 2 and 3 are string-presence assertions: (a) `CRON_HEALTH_RETRY_ANNOUNCEMENT` emptied; (b) the announcement with an appended suffix, which must still pass case 2 and must still pass case 3, confirming neither case is pinned to an exact-equality it does not claim; (c) the announcement present in the file but not live, moved into an `aria-hidden` sibling outside the status region, which must red case 2; (d) the discriminating parameter of the region's text varied: the parity alternation replaced by an unconditional suffix (`${CRON_HEALTH_RETRY_ANNOUNCEMENT}\u00A0` on every attempt), which makes attempts one and two identical and must red case 3. **The click count is NOT mutant (d)** — an earlier draft named it, and it is an input case 3 already ranges over rather than a variation of the production code. Each result in the commit body.
- [ ] **3.8** Observe RED by planting the seq toggle away (`{attempts === 0 ? "" : CRON_HEALTH_RETRY_ANNOUNCEMENT}`), which reds case 3 alone. That mutant is the whole point of the case: it is the exact shape that ships a silent second attempt.
- [ ] **3.9** Commit `test(admin): the retry announcement survives a repeated failure`.

### Task 4 — the transition audit stops being a hand-written list

<!-- task: red=`pnpm vitest run tests/components/telemetry/transitionAudit.test.tsx` red-state=authored red-target=`tests/components/telemetry/transitionAudit.test.tsx:27` why=`the population at line 27 is nine literal filenames, so a motion. token planted into the component this arc adds is invisible to it; the same plant reds the derived population` ac=AC-9 -->

- [ ] **4.1** Replace the literal `INSTANT` list (`tests/components/telemetry/transitionAudit.test.tsx:27-36`) with a directory read: every `.tsx` in `components/admin/telemetry/` except `EventRow.tsx`, the one deliberately animated file, which keeps its own dedicated cases.
- [ ] **4.2** Assert the derived population is non-empty and contains `EventRow.tsx` nowhere. A `readdirSync` against a mistyped path returns nothing and makes the loop vacuous, which is the degenerate case this guards.
- [ ] **4.3** Observe RED with the paired run that is the evidence the change does anything: plant `motion.div` into the new control, run the suite with the LITERAL list (green, the defect), then with the derived list (red). Both outputs in the commit body.
- [ ] **4.4** The assertion, the matchers and the threat fence are unchanged; only the population becomes derived. This is a repair inside the arc that hit the defect, not a new guard, and no ledger row is filed for it.
- [ ] **4.5** Commit `test(admin): derive the telemetry transition audit's population from disk`.

### Task 5 — close-out

<!-- task: red=`pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=live why=`this plan declares both halves of the invariant-8 dual gate and carries no impeccable-gate marker, so the live-tree conformance case names it by filename today; observed red at plan time, 1 failed / 13 passed, and only writing the sibling closeout with a real marker turns the SAME command green` ac=AC-8 -->

- [ ] **5.0** The red is already observed, at plan time, not described. `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` on this branch: `1 failed | 13 passed`, the failing case naming this file, `"2026-08-27-telemetry-fallback-retry.md: declares the invariant-8 dual gate but carries no valid impeccable-gate marker line"`. It stays red for the whole arc by construction and only 5.3 closes it, which is also why the pre-push tree check has to run AFTER this task rather than before it.
- [ ] **5.1** Pre-code mechanical checklist, re-run as a post-code check on the actual diff: no em dash in any user-visible string; apostrophes match each file's existing convention, and the fallback's `’` is untouched; `min-h-tap-min` present on the one new interactive element; type and token classes drawn from the sibling control rather than invented.
- [ ] **5.2** `/impeccable critique` and `/impeccable audit` on the diff, with the canonical v3 setup gates (the skill's own context load of PRODUCT.md and DESIGN.md, then the register reference read). P0 and P1 findings fixed in-round or deferred with a `DEFERRED.md` entry.
- [ ] **5.3** Write the sibling closeout file described at the top of this plan, with the findings, the dispositions, and the marker line in the exact grammar: `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>`.
- [ ] **5.4** Record the one behavioural limit this control has, with its precedent: on a successful retry the focused button unmounts, so focus falls to the document body. Both sibling controls on this page family (`components/admin/telemetry/HealthAlertResolveButton.tsx:20`, `components/admin/PerShowAlertResolveButton.tsx:81`) already behave this way on their own success, and the 20s auto-refresh performs the same swap with nobody focused at all. Recorded in the closeout, named in the PR body under "Unfixed peers", not filed.
- [ ] **5.5** Archive `BL-TELEMETRY-FALLBACK-RETRY` and strip its in-progress marker in the PR's LAST commit.
- [ ] **5.6** Commit `docs(plan): telemetry retry close-out and impeccable dispositions`.

## 6. Acceptance-criteria coverage

| AC | Statement | Proven by |
| --- | --- | --- |
| AC-1 | The fallback renders exactly one retry control | Task 1, queried with `within(cron-health-degraded)` |
| AC-2 | One tap re-invokes the health loader, its call count reaching `before + 1` | Task 1, asserted on the `loadCronHealth` spy |
| AC-3 | The retry never navigates and never reloads | Task 1, `push` and `replace` asserted uncalled and the control asserted `type="button"` with no `href`; Task 3 case 5 asserts `router.refresh` is the only navigation call it makes |
| AC-4 | A retry that succeeds replaces the fallback with the job list | Task 2, success case, label read off the fixture |
| AC-5 | A retry that fails again leaves the copy and the control unchanged | Task 2, repeat-failure case, both sentences asserted |
| AC-6 | Every activation is announced, including a repeat of an identical outcome | Task 3, cases 1 through 3 |
| AC-7 | The control clears the 44px tap floor | `tests/styles/_metaTapTargetFloor.test.ts`, which scans it on arrival |
| AC-8 | The control's outline clears the 3:1 non-text floor on its tinted plate | `border-control-outline-tinted` per D2, verified by reading, and by the impeccable audit's theming dimension in Task 5 |
| AC-9 | A component added to the telemetry directory is inside the transition audit by default | Task 4, proven by the mutant the literal list missed |

## 7. Close-out

Whole-diff cross-model review through `codex-guard` (REVIEWER ONLY, the three convergence lines, `VERDICT:` and `FINDINGS:`), round cap 4. Twelve required checks green on a base equal to `origin/main`. One green `pnpm heavy pnpm test` at the shipping head, taken only under the named local-Postgres slot. Then readiness to bl-orch. This arc does not merge.
