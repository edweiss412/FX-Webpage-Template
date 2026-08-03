# Per-row undo announcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sync changes feed a screen-reader announcement when a single row's Undo succeeds, and close the same-class failure-card defect on all three feed action buttons, per the spec `docs/superpowers/specs/2026-08-03-undo-success-announcement-design.md`. Closes `BL-SYNC-FEED-UI-POLISH` and its three children.

**Architecture:** The append-shaped `role="log"` channel already shipped inside `ShowReviewSurface` is extracted into one shared module (`useAnnounceLog` + `AnnounceLogRegion`) and the warnings panel is retrofitted onto it. The channel is then mounted **once, by `app/admin/layout.tsx`**, inside a new `AdminAnnounceProvider` whose region is its always-first child. No surface component owns announcement state: two review rounds established that any owner below a data-dependent branch has its region node replaced on the very success it announces, so the owner sits above every such branch. The feed surfaces only thread an `announceLabel` prop.

**Tech Stack:** Next.js 16 / React 19 (`useActionState`), vitest 4.1.5 + jsdom, Testing Library, Tailwind v4 tokens.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-08-03-undo-success-announcement-design.md`. Its §1.1 do-not-relitigate table binds implementation too.
- TDD per task (invariant 1): red test → minimal implementation → green → commit, test and implementation in the SAME task commit.
- No advisory lock (invariant 2 N/A — presentation only, no mutation path touched).
- No Supabase client call added or moved (invariant 9 N/A).
- No new mutation surface (invariant 10 N/A — the wrapped action is a client-side wrapper around an already-registered server action; it adds no route handler and no `"use server"` export).
- Invariant 5 holds unchanged: no raw error code reaches the DOM or an announcement. `ErrorExplainer` keeps sole ownership of failure copy.
- Invariant 8 applies (`components/**` changes): `/impeccable critique` AND `/impeccable audit` before the whole-diff cross-model review; P0 fixed inline, P1+ either fixed or deferred with a `DEFERRED.md` entry. Marker line in §12.
- Copy: no em dash in any user-visible or announced string (`DESIGN.md:381`).
- Commit style: conventional commits, one commit per task, `--no-verify` (shared lint-staged hook belongs to the main checkout).

## Meta-test inventory (mandatory declaration)

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- **CREATES** `tests/styles/_metaUndoAnnounceProvider.test.ts` — four assertions (Task 10): A1, `app/admin/layout.tsx` wraps every `return` in `AdminAnnounceProvider`; A2, no file outside the provider module references `UndoAnnounceContext.Provider`; A3, the provider is never a descendant of a `data-inert-root` element; A4, no `UndoChangeButton` outside the admin tree. Each carries its own planted violation.
- **EXTENDS** none.
- No advisory-lock topology section: the plan does not touch `pg_advisory*`.

## Layout-dimensions task: N/A

No fixed-dimension parent gains a flex or grid child. Every element added is `sr-only` (`position: absolute`, therefore not a flex item) or an existing wrapper whose classes are unchanged in the failing state. Spec §3.3b carries the argument. No Playwright assertion is owed.

## e2e harness readiness — REQUIRED (was N/A; corrected in review)

An earlier draft declared this N/A. That was wrong, and the reason is the whole point of spec §3.5.1: every feed undo happens inside `PublishedReviewModal`, which sets `inert` and `aria-hidden="true"` on the admin layout's shells while open (`components/admin/review/ReviewModalShell.tsx:180-189`, `app/admin/layout.tsx:160`, `layout.tsx:182`). jsdom enforces neither attribute (`ReviewModalShell.tsx:176`) and Testing Library ignores `aria-hidden`, so the entire unit suite stays green on a feature that announces nothing. Only a real browser can prove the region is in the accessibility tree at the moment it matters.

- **Where it lands: an EXISTING spec file, not a new one.** The assertion is added to `tests/e2e/published-review-modal.crew-actions.spec.ts`, which already opens the published review modal against the real app. This is not a stylistic preference — `playwright.config.ts:79` matches specs by an explicit regex enumerating every filename, so a **new** spec file would silently never run, and `tests/ci/_metaE2eWorkflowCoverage.test.ts:156-158` requires a registry row per spec. Reusing a listed file avoids both wiring changes; creating one would require editing the regex AND adding a coverage row, and forgetting either yields a test that appears to exist and never executes.
- **Server boot:** the `desktop-chromium` project (`playwright.config.ts:77`); no new server mechanism.
- **Readiness gate:** the suite's existing modal-open and row-hydration gates before the first assertion, never `networkidle` alone.
- **Detach safety:** the undo click removes its own row, so the post-click assertion targets the region (a stable body-level node), never the removed button; no `locator.evaluate` on an element that can unmount.

Covered by Task 9.

---

## Task 1 — Extract the announce-log channel

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- [ ] Write `tests/components/admin/announceLog.test.tsx` (`// @vitest-environment jsdom` pragma on line 1), red against a non-existent module.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- [ ] Create `components/admin/announceLog.tsx` (`"use client"`), exporting `ANNOUNCE_LOG_CAP = 50`, `type AnnounceLogEntry`, `useAnnounceLog()`, `AnnounceLogRegion`.
- [ ] Behavior is transcribed from `components/admin/review/ShowReviewSurface.tsx:382-392` and `ShowReviewSurface.tsx:1160-1170`, not reinvented.
- [ ] Green; commit `feat(admin): extract the shared announce-log channel`.

**Assertions and the failure each catches** (spec §11):

| Assertion | Failure caught |
|---|---|
| Two `announce` calls inside one `act()` produce two entries with distinct `id`s | Timestamp- or length-derived ids colliding under React batching — the exact defect `ShowReviewSurface.tsx:378-382` warns about |
| `announce("   ")` and `announce("")` append nothing | Whitespace entering the region and being read aloud as a blank announcement |
| Appending the 51st entry leaves exactly 50, oldest dropped, newest last | Off-by-one in the slice, or dropping the newest instead of the oldest |
| `announce` identity is referentially stable across a rerender | Consumers re-subscribing every render once it lands in a dependency array |
| Region renders `role="log"`, `className="sr-only"`, the given `aria-label` and `data-testid`, and carries **no** `aria-live`, `aria-atomic`, or `aria-relevant` attribute | Someone "helpfully" adding explicit attributes that fight the role's implicits (spec §3.1) |
| Each child is `<span data-announce-id={id}>` in insertion order | Losing the per-entry id the append semantics depend on |

Derive the cap assertion from the exported `ANNOUNCE_LOG_CAP`, never a hardcoded 50, so the test cannot silently disagree with the module.

## Task 2 — Retrofit `ShowReviewSurface` onto the shared module

- [ ] Replace `ShowReviewSurface.tsx:382-392` with `useAnnounceLog()` and `ShowReviewSurface.tsx:1160-1170` with `<AnnounceLogRegion entries={announceLog} label="Warning updates" testId="warnings-panel-status" />`. Delete the local `ANNOUNCE_CAP` at `ShowReviewSurface.tsx:68`.
- [ ] Run `tests/components/admin/review/warningsPanelStatusMount.test.tsx` **unedited**.
- [ ] Commit `refactor(admin): retrofit the warnings channel onto the shared announce log`.

**The acceptance criterion is that no warnings-panel test changes.** Those tests pin the exact `aria-label`, assert the container is the same DOM node across a rerender (`expect(region()).toBe(node)`), and assert zero added/removed/characterData mutations on a non-announcing prop change (`warningsPanelStatusMount.test.tsx:95-140`). If any of them needs editing, the extraction changed observable behavior and is wrong — stop and reconsider rather than adjusting the test.

## Task 3 — The undo announce context and its copy

- [ ] Red test for `undoneAnnouncement`.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- [ ] Create `components/admin/undoAnnounceContext.ts` (`"use client"`) with `UndoAnnounce`, `NOOP_UNDO_ANNOUNCE`, `UndoAnnounceContext`, and `undoneAnnouncement(label?: string)`.
- [ ] Commit `feat(admin): undo announce context and copy`.

| Assertion | Failure caught |
|---|---|
| `undoneAnnouncement("Crew member Alice Chen removed")` is exactly `"Change undone: Crew member Alice Chen removed"` | Copy drift; the literal is pinned here once so per-surface tests can assert the rendered string without importing the function (anti-tautology) |
| `undoneAnnouncement(undefined)` and `undoneAnnouncement("   ")` are both exactly `"Change undone."` | The dangling-colon guard condition in spec §3.3 |
| The returned string contains no em dash | `DESIGN.md:381` |
| `NOOP_UNDO_ANNOUNCE.announce("x")` returns undefined and does not throw | The default that keeps an unprovided mount from crashing |

## Task 4 — `UndoChangeButton` announces success

- [ ] Red tests, then wrap `undoAction` per spec §3.3a and consume the context.
- [ ] Commit `feat(admin): announce a successful single-row undo`.

| Assertion | Failure caught |
|---|---|
| Under a spy provider, `{ok:true}` calls `announce` exactly **once** with the literal `"Change undone: <fixture summary>"` | The feature silently not firing; and double-announcing on a single submit |
| `{ok:false}` calls `announce` zero times | Announcing a success that did not happen |
| A rejected action calls `announce` zero times | Announcing on a thrown error |
| `announceLabel` omitted → the bare `"Change undone."` | Guard condition |
| With **no** provider, `{ok:true}` neither throws nor announces | The no-op default |

## Task 5 — Failure cards become always-mounted live regions (class sweep)

- [ ] Red first: for each of the three buttons, assert the result node exists with `""` text before any submit, and is the **same node** (`toBe`) after a failure.
- [ ] Apply the always-mounted `role="status"` wrapper to `UndoChangeButton.tsx:88`, `AcceptChangeButton.tsx:86`, `Mi11GateActions.tsx:165`, moving each `data-testid` to the persistent node.
- [ ] Sweep all ten existing assertion sites per the spec §7 table: six `toBeNull()` → `toHaveTextContent("")`, four `toBeInTheDocument()` → catalog-copy assertions.
- [ ] Commit `fix(admin): make the feed action failure cards announce`.

**`Mi11GateActions.test.tsx:95` is the one that must not be converted mechanically.** Undo and Accept keep independent catalog-copy assertions elsewhere in their files, so their node checks were redundant; MI-11's is the file's only positive evidence that a failure renders at all. It gains a copy assertion or the file is left with zero coverage of its failure path (spec §7).

## Task 6 — `AdminAnnounceProvider`, mounted by the admin layout

- [ ] Red tests first, then create the provider and mount it.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- [ ] Create `components/admin/AdminAnnounceProvider.tsx` (`"use client"`): holds `useAnnounceLog`, provides `UndoAnnounceContext`, renders `<AnnounceLogRegion … testId="admin-undo-status" label="Undo updates" />` as its **always-first** child, then `{children}`.
- [ ] Mount a **second** `AdminAnnounceProvider` inside `ReviewModalShell`'s dialog element as its always-first child (spec §3.5.2). Nested context resolves to the nearest provider, so no flag or prop decides which channel a button uses.
- [ ] Edit `app/admin/layout.tsx` to wrap the branch it selected — one wrapper around the chosen return value, **not** an edit inside each of the three returns (`app/admin/layout.tsx:90`, `layout.tsx:155`, `layout.tsx:177`), and **outside** `PageTransition` (`layout.tsx:171`).
- [ ] Commit `feat(admin): mount the announce channel on the admin layout`.

| Assertion | Failure caught |
|---|---|
| The provider renders `admin-undo-status` as its first child, with `{children}` after it | The region drifting to a position whose index can change |
| Swapping `children` for an entirely different subtree leaves the region node `toBe` identical | The round-2 defect: node replacement while state survives |
| A consumer deep inside `children` calling `announce` appends to the region | The context not actually reaching descendants |
| A consumer inside a nested second provider announces into the INNER region only, leaving the outer empty | The dialog channel silently falling through to the layout channel, which is the case §3.5.2 exists to prevent |

The layout edit is the whole point of the redesign; wrapping each return separately would recreate the branch-replaces-region defect it exists to remove.

## Task 7 — Thread `announceLabel` at the two call sites

- [ ] Red tests, then pass `announceLabel={entry.summary}` at `ChangeFeedEntry.tsx:141` and `announceLabel={row.summary}` at `RecentAutoAppliedStrip.tsx:298`.
- [ ] Commit `feat(admin): announce undo results from both feed surfaces`.

| Assertion | Failure caught |
|---|---|
| Rendering `ChangesFeed` inside the provider and undoing a row appends one child derived from **that fixture's** summary | Wrong row announced; hardcoded expectation |
| Two feed rows with identical summaries each append their own child | The class `role="log"` was chosen for (spec §1.2) |
| Rendering the strip inside the provider and undoing a row appends one child naming that row's summary | Second surface not wired |
| `auto-applied-bulk-undo-status-${showId}` keeps `role="status"` and its behavior | R2 regression |
| The strip still renders nothing with `groups: []` | The withdrawn return-a-span proposal creeping back |

`ChangesFeed.tsx` is not edited in this task or any other. If a diff to it appears, the redesign was not followed.

## Task 8 — Survival probes (spec §3.7, seven branches)

- [ ] Seven probes per spec §11. **Every one captures the region node before the action and asserts `toBe` afterwards** — text equality alone passes when the region was destroyed and a populated replacement mounted, which is precisely the round-2 failure mode.
- [ ] Commit `test(admin): prove the undo announcement survives every branch`.

Branches covered, each one a case a prior review round proved could replace a per-surface region: strip to `groups: []`; the same interleaved with an unresolved action promise; strip to `infra_error`; the provider's `children` swapped wholesale (the `components/admin/Dashboard.tsx:565` shape); feed row `action` flipped to `"none"`; `ChangesSection` flipped to its `feed === null` rendering (`components/admin/showpage/ChangesSection.tsx:60`); and the layout's own branch flip, which is §3.5's central claim and until round 3 had no falsifier.

If any probe fails, the layout-level owner is not immune and the design is wrong again. Do not weaken a probe to make it pass.

## Task 9 — Real-browser accessibility-tree assertion

- [ ] Add the assertion to the **existing** `tests/e2e/published-review-modal.crew-actions.spec.ts` (see the e2e-readiness section for why a new spec file would never run): open the published review modal on a seeded show with an undoable feed row; assert the receiving region is **inside the dialog subtree** (spec §3.5.2) and that no ancestor carries `aria-hidden="true"` or `inert`; click Undo; assert the announcement text lands in that region.
- [ ] Confirm the spec actually executed — a passing run that collected zero tests is the failure this task exists to avoid.
- [ ] Commit `test(admin): prove the undo region stays in the a11y tree under the review modal`.

Failure caught: the region nested inside `[data-inert-root]` instead of wrapping it — a placement that passes every jsdom test in this plan while the feature is completely dead for screen-reader users. This is the only assertion that can catch it.

## Task 10 — Structural guard

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- [ ] Write `tests/styles/_metaUndoAnnounceProvider.test.ts` with the four assertions of spec §5, using `walk` and `stripCommentsForFile` from `tests/styles/_classScanUtils` (`_classScanUtils.ts:7`, `_classScanUtils.ts:17`).
- [ ] **A1** — `app/admin/layout.tsx` references `AdminAnnounceProvider` and every `return` in the file is wrapped in it. Planted violation: a copy of the layout source with one `return` unwrapped.
- [ ] **A2** — no file outside the provider module references `UndoAnnounceContext.Provider`. Planted violation: a file rendering `<UndoAnnounceContext.Provider>`.
- [ ] **A3** — `AdminAnnounceProvider` is not a descendant of any `data-inert-root` element in the layout. Planted violation: the layout source with the provider nested inside that div.
- [ ] **A4** — every file rendering `<UndoChangeButton` lives under `app/admin/` or `components/admin/`. Planted violation: such a file outside those trees. This is the escaping mutant the earlier guard admitted, where a non-admin call site silently consumes the no-op context.
- [ ] A1's negative case: a nested helper in the layout file with its own unwrapped `return` must NOT fail the guard.
- [ ] Commit `test(admin): guard the announce channel's single layout-level owner`.

Each assertion carries its **own** planted violation. Round 2's finding was a widened guard shipping a mutant for only one branch, so a guard silently ignoring the second would still have passed.
## Task 11 — `DESIGN.md` announcement contract

**Extend the existing paragraph; do not add a new one.** `DESIGN.md:479` already carries an Announcements paragraph, and it already states the branch-stability rule this whole spec rediscovered: the region node must be branch-stable, single-return components render it as a key-stable sibling, and it never sits behind `display: contents`. A second paragraph restating it would create exactly the kind of duplicated contract that drifts.

- [ ] Extend `DESIGN.md:479` with: the append-shaped `role="log"` channel as the second sanctioned shape and when to choose it over `role="status"` (repeated announcements whose text can repeat); the shared `useAnnounceLog` / `AnnounceLogRegion` module as the one implementation; and the inert-root constraint from spec §3.5.1, which the existing paragraph does not cover.
- [ ] Commit `docs(design): record the append-shaped announcement channel`.

## Task 12 — Ledger dispositions

- [ ] `BL-SYNCFEED-UI-1` resolved; `BL-SYNCFEED-UI-3` graduated as already-shipped (`c3920fe6a`); `BL-SYNCFEED-UI-2` ratified untriggered with its re-open trigger preserved; parent `BL-SYNC-FEED-UI-POLISH` moved to `BACKLOG-archive.md`.
- [ ] The three `KNOWN_DANGLING` rows **stay**; refresh their reason strings to name the archive (spec §9.4).
- [ ] `BL-LEDGER-GUARD-BODY-DEFINED-IDS` keeps all **eight** ids; add only the parenthetical noting the parent archived.
- [ ] File `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, `BL-ANNOUNCE-REGION-UNMOUNT-CLASS` with the spec's evidence.
- [ ] **Strip the `**Status:** IN PROGRESS · **Branch:** …` line from the entry as part of archiving it.** `tests/docs/_metaLedgerInProgress.test.ts:149` fails any in-flight marker found in an archive file, so carrying the marker across would break the build. This is not a conflict with invariant 12's "clear the marker at Stage 4.4": AGENTS.md states an entry graduating to an archive takes its marker with it by construction. The consequence to remember is that **Stage 4.4 will have no marker left to clear for this entry**, which is correct rather than a missed step.
- [ ] Update the `Last reconciled:` line at `BACKLOG.md:7` with this branch's graduation, following the existing prose convention there.
- [ ] Run `pnpm exec vitest run tests/docs/` — the ledger guards are the acceptance test.
- [ ] Commit `docs(backlog): close BL-SYNC-FEED-UI-POLISH and file the swept class`.

## Task 13 — Transition audit

The spec's §10.2 Transition Inventory has six rows, five of which are invisible (`sr-only` additions and removals) and one of which is the failure card's instant appear/disappear. The audit confirms that inventory describes what shipped.

- [ ] Enumerate every conditional render and `AnimatePresence` in the five touched components; assert each added or modified branch is deliberately instant, with no `transition-*`, `animate-*`, or `AnimatePresence` introduced on the failure wrapper or either region.
- [ ] Compound case: toggle a failure card while an announcement is mid-delivery; assert the two regions are independent and neither clears the other.
- [ ] Commit `test(admin): audit the announcement and failure-card transitions`.

Failure caught: an implementer "improving" the error card with a fade, which delays the assistive-technology announcement behind an animation, and which the inventory explicitly forbids.

## Task 14 — Adversarial review (cross-model)

- [ ] Dispatch the whole-diff Codex review per the `AGENTS.md` cross-CLI discipline: fresh-eyes posture, REVIEWER ONLY, do-not-relitigate list drawn from spec §1.1, iterate to APPROVE with no round budget.
- [ ] Triage findings by deferral discipline: land-now, `DEFERRED.md`, or `BACKLOG.md`.

## Task 15 — Invariant-8 dual gate and closeout

- [ ] `/impeccable critique` and `/impeccable audit` on the diff, both with the canonical v3 setup gates (the context load of PRODUCT.md + DESIGN.md, then the register reference read).
- [ ] P0 fixed inline; P1+ fixed or deferred with a `DEFERRED.md` entry.
- [ ] Record findings and dispositions in §12 below.

---

## 12. Closeout

Findings and dispositions land here.

impeccable-gate: critique=PENDING audit=PENDING p0=- p1=- dispositions=pending
