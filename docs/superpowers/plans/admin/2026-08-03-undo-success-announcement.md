# Per-row undo announcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sync changes feed a screen-reader announcement when a single row's Undo succeeds, and close the same-class failure-card defect on all three feed action buttons, per the spec `docs/superpowers/specs/2026-08-03-undo-success-announcement-design.md`. Closes `BL-SYNC-FEED-UI-POLISH` and its three children.

**Architecture:** The append-shaped `role="log"` channel already shipped inside `ShowReviewSurface` is extracted into one shared module (`useAnnounceLog` + `AnnounceLogRegion`), the warnings panel is retrofitted onto it, and the two surfaces that render a single-row Undo control adopt it through a context whose default is a no-op. The region is owned by a component that the undo cannot unmount — which for the dashboard strip means moving it above the group loop and turning its `return null` into a return of the bare `sr-only` region.

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
- **CREATES** `tests/styles/_metaUndoAnnounceProvider.test.ts` — file-walk over `components/` and `app/` asserting any file rendering `<UndoChangeButton` or `<ChangeFeedEntry` references `UndoAnnounceContext.Provider` or carries `// no-undo-announce: <reason>` (Task 9). Proven by a planted violation, not only by passing on the current tree.
- **EXTENDS** none.
- No advisory-lock topology section: the plan does not touch `pg_advisory*`.

## Layout-dimensions task: N/A

No fixed-dimension parent gains a flex or grid child. Every element added is `sr-only` (`position: absolute`, therefore not a flex item) or an existing wrapper whose classes are unchanged in the failing state. Spec §3.3b carries the argument. No Playwright assertion is owed.

## e2e harness readiness: N/A

No Playwright test is added. The repo sweep in spec §7 confirmed no e2e file references any of the three result testids.

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

## Task 6 — `ChangesFeed` provides and renders the region

- [ ] Red tests, then add `useAnnounceLog`, the provider, and the region as the last child of the `<section>`; thread `announceLabel={entry.summary}` through `ChangeFeedEntry`.
- [ ] Commit `feat(admin): announce undo results in the per-show changes feed`.

| Assertion | Failure caught |
|---|---|
| `change-feed-undo-status` renders with `role="log"` and empty text on first render, **including with `entries={[]}`** | Gating the region on having rows, which reintroduces the insertion pitfall |
| Undoing a row appends one child whose text is derived from **that fixture's** `summary`, not a hardcoded string | Announcing the wrong row; and a hardcoded expectation that would pass against any summary |
| Two rows with **identical** summaries each produce their own appended child | The precise class `role="log"` was chosen for (spec §1.2) |
| The region node captured before the undo is `toBe` the node after | Remount destroying the announcement |

## Task 7 — `RecentAutoAppliedStrip` owns a strip-wide channel

- [ ] Red tests first, including the two early-return cases.
- [ ] Move state and region to the strip root; replace `return null` at `RecentAutoAppliedStrip.tsx:685` with a return of the bare region; add the region to the `infra_error` return at `RecentAutoAppliedStrip.tsx:670-681`; thread `announceLabel={row.summary}` to the button at `RecentAutoAppliedStrip.tsx:298`.
- [ ] Commit `fix(admin): keep the strip undo announcement alive when its group empties`.

| Assertion | Failure caught |
|---|---|
| `auto-applied-undo-status` renders at strip level, empty, `role="log"` | Missing channel |
| A single-row undo appends one child naming that row's summary | Channel not wired |
| With `groups: []`, the region still renders **and** `recent-auto-applied-strip` does not | The `return null` path dropping the channel; and the fix breaking the "no empty card" intent (`RecentAutoAppliedStrip.tsx:684`) |
| In the `infra_error` state, the region still renders | The error early-return dropping the channel |
| `auto-applied-bulk-undo-status-${showId}` still has `role="status"` and its existing behavior | R2 regression — the bulk channel being swept into this refactor |

## Task 8 — Unmount probes (the executable form of spec §3.7)

- [ ] Three probes per spec §11. Commit `test(admin): prove the undo announcement survives its own success`.

| Probe | Failure caught |
|---|---|
| Strip with one undoable row in one group; action resolves `{ok:true}`; parent re-renders with `groups: []`; region still holds the announcement | The production sequence exactly — the last undoable row leaves the `applied` set and the strip body disappears |
| Same, with the re-render interleaved **while the action promise is unresolved**, resolving after | The narrower race: a continuation running after its own component is gone |
| Feed: re-render with the undone row's `action` flipped to `"none"` mid-action; region still holds the text | The feed's version, where the button unmounts but the section does not |

If any probe fails, spec §3.7 is false and the design needs an owner further out. Do not weaken the probe to make it pass.

## Task 9 — Structural guard

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- [ ] Write `tests/styles/_metaUndoAnnounceProvider.test.ts` using `walk` and `stripCommentsForFile` from `tests/styles/_classScanUtils` (`_classScanUtils.ts:7`, `_classScanUtils.ts:17`).
- [ ] Detection runs on comment-stripped source; the exemption is matched on raw source (spec §5).
- [ ] Include a matcher self-check and a **planted violation** proving the walk fails a file with no provider and no exemption.
- [ ] Add `// no-undo-announce: provider lives in ChangesFeed, its only importer` to `ChangeFeedEntry.tsx`.
- [ ] Commit `test(admin): guard the undo announce provider contract`.

Expected membership after this task: `ChangeFeedEntry.tsx` (exempt), `RecentAutoAppliedStrip.tsx` (provides), `ChangesFeed.tsx` (provides, a member only because the walk also scans `<ChangeFeedEntry`).

## Task 10 — `DESIGN.md` announcement contract

- [ ] Add the paragraph naming the two channel shapes, when each applies, and the always-mounted rule.
- [ ] Commit `docs(design): record the announcement channel contract`.

## Task 11 — Ledger dispositions

- [ ] `BL-SYNCFEED-UI-1` resolved; `BL-SYNCFEED-UI-3` graduated as already-shipped (`c3920fe6a`); `BL-SYNCFEED-UI-2` ratified untriggered with its re-open trigger preserved; parent `BL-SYNC-FEED-UI-POLISH` moved to `BACKLOG-archive.md`.
- [ ] The three `KNOWN_DANGLING` rows **stay**; refresh their reason strings to name the archive (spec §9.4).
- [ ] `BL-LEDGER-GUARD-BODY-DEFINED-IDS` keeps all **eight** ids; add only the parenthetical noting the parent archived.
- [ ] File `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, `BL-ANNOUNCE-REGION-UNMOUNT-CLASS` with the spec's evidence.
- [ ] Run `pnpm exec vitest run tests/docs/` — the ledger guards are the acceptance test.
- [ ] Commit `docs(backlog): close BL-SYNC-FEED-UI-POLISH and file the swept class`.

## Task 12 — Invariant-8 dual gate and closeout

- [ ] `/impeccable critique` and `/impeccable audit` on the diff, both with the canonical v3 setup gates (the context load of PRODUCT.md + DESIGN.md, then the register reference read).
- [ ] P0 fixed inline; P1+ fixed or deferred with a `DEFERRED.md` entry.
- [ ] Record findings and dispositions in §12 below.

---

## 12. Closeout

Findings and dispositions land here.

impeccable-gate: critique=PENDING audit=PENDING p0=- p1=- dispositions=pending
