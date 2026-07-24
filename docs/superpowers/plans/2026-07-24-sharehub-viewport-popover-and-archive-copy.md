# Plan — share-hub popover portal/placement migration + state-conditional Archive copy

**Spec:** `docs/superpowers/specs/2026-07-24-sharehub-viewport-popover-and-archive-copy.md` (canonical; §§ below refer to it)
**Branch:** `feat/sharehub-archive-copy-reveal` (worktree `FX-worktrees/sharehub-archive-copy-reveal`)
**Implementer:** Opus / Claude Code — UI surface, so the routing hard rule applies (`AGENTS.md`, "UI work is always Opus").

---

## 0. Pre-draft verification (run, not described)

### 0.1 Reconciliation sweeps — commands and their ACTUAL output

**S1 — who consumes the shared placement module today**

```
$ grep -rln "computePopoverPlacement" --include="*.tsx" --include="*.ts" components app lib | sort
components/admin/HoverHelp.tsx
lib/popover/position.ts
```

Disposition: exactly one consumer (`HoverHelp`) plus the module itself. Task 1 makes `ShareHub` the second. No other call site to keep in lockstep.

**S2 — the defect class repo-wide: anchored overlay with its OWN scroller and cap**

```
$ grep -rn "absolute[^\"]*top-full[^\"]*overflow-y-auto\|overflow-y-auto[^\"]*absolute[^\"]*top-full" --include="*.tsx" components app
components/admin/ReSyncButton.tsx:69:  "absolute inset-x-0 top-full z-50 max-h-[min(50vh,20rem)] overflow-y-auto ..."
components/admin/showpage/ShareHub.tsx:487: "absolute right-0 top-full z-40 mt-1.5 flex max-h-[min(70vh,30rem)] w-[308px] ..."
```

Disposition: two hits, both known. `ReSyncButton` is already clip-safe via `useFitWithinClip` (`ReSyncButton.tsx:100`) and is explicitly out of scope (spec §1.1). `ShareHub` is the defect. **The class is closed by this diff plus the Task 1 meta-test** — no third instance exists to miss.

**S3 — portal host providers**

```
$ grep -rn "PopoverHostContext.Provider" --include="*.tsx" components app
components/admin/review/ReviewModalShell.tsx:625:          <PopoverHostContext.Provider value={panelRef}>
components/admin/review/ReviewModalShell.tsx:714:          </PopoverHostContext.Provider>
```

Disposition: one provider, wrapping the panel. `ShareHub`'s only mount path (`StatusStrip.tsx:400` -> `PublishedReviewModal.tsx:906`) is inside it, so the host is always present in production; the `document.body` fallback is for tests.

**S4 — CI wiring for the e2e file this plan extends**

```
$ grep -c "admin-lifecycle-layout" playwright.config.ts
1
$ grep -n "admin-lifecycle-layout" .github/workflows/lifecycle-layout-e2e.yml
2:# Un-darkens tests/e2e/admin-lifecycle-layout.spec.ts (spec ...)
81:  run: pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-layout.spec.ts
```

Disposition: already matched by the `mobile-safari` `testMatch` and already invoked by a workflow. **This plan creates no new e2e file**, so no new `testMatch` entry or path-filter is needed. Every new assertion lands in the existing, already-wired spec.

### 0.2 API verification

Verified by direct read during spec authoring; re-confirmed here. `computePopoverPlacement` signature and semantics: `lib/popover/position.ts:39-63` (`PopoverPlacementInput` = `{trigger, naturalSize, wrappedHeightAt, bounds, preferredSide, align}`; returns `{kind:"hidden"}` or `{kind:"placed", side, viewport, maxHeight, maxWidth, caret}`). Helpers `intersectRects` (`lib/popover/position.ts:65`), `insetRect` (`lib/popover/position.ts:73`), constants `GAP=6` (`lib/popover/position.ts:16`), `VIEWPORT_INSET=8` (`lib/popover/position.ts:17`), `CARET_WIDTH=12` (`lib/popover/position.ts:18`), `CARET_EDGE_INSET` (`lib/popover/position.ts:23`). Host context: `components/admin/HoverHelp.tsx:79`. Reference application of all of it: `components/admin/HoverHelp.tsx:228-300`.

---

## 1. Meta-test inventory (mandatory declaration)

**CREATES:** a new `_metaPopoverPlacementContract` test under the showpage component test directory — a structural guard that every anchored, internally-scrolling overlay inside the review-modal panel resolves its geometry through `lib/popover/position.ts` rather than hand-rolled classes. Filesystem-walked over `components/**` so a NEW overlay fails by default, with a reasoned allowlist carrying exactly one entry (`ReSyncButton`, which is clip-safe by the `fitWithinClip` route instead — spec §1.1).

Rationale for creating it rather than relying on the e2e sweep: the defect shipped because a second overlay was written in the same idiom as the first without inheriting its fix, and nothing failed. Per the structural-defense calibration rule, the class is nameable at first occurrence, so the guard ships in the FIRST repair commit, not after a recurrence.

**EXTENDS:** none.

**Declared N/A, with reason:**

- Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`) — no Supabase call is added or changed.
- Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` surface is touched; no RPC, migration, or DB write is in this diff.
- `admin_alerts` catalog (`tests/messages/_metaAdminAlertCatalog.test.ts`) — no alert code added.
- Mutation-surface observability (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route handler or `"use server"` action is added or modified; the archive action itself is untouched.
- §12.4 catalog parity — no error code added or edited.
- No-inline-email-normalization — no email path touched.

## 2. Advisory-lock holder topology

**N/A — this diff touches no `pg_advisory*` surface.** No migration, no RPC, no server action. The `archive_show` lock topology (`supabase/migrations/20260601000000_b2_show_lifecycle.sql:70`) is read-only context for the copy change and is not modified.

## 3. e2e harness-readiness checklist (mandatory)

1. **Server boot.** Existing `mobile-safari` project against the baseline dev server (`playwright.config.ts:243-247`, `pnpm dev -H 127.0.0.1 -p $E2E_PORT`), `E2E_PORT` defaulting to 3000. Local runs use `E2E_PORT=3005` plus a loopback `TEST_DATABASE_URL` override, because the ambient value is non-loopback and the seeds mutate (`pnpm preflight` warns about exactly this).
2. **Readiness/hydration gate.** The shipped pattern in this file: `await expect(modal).toBeVisible({timeout:30_000})` against `LOADED_REVIEW_MODAL` (which requires the title node, so the Suspense skeleton twin cannot satisfy it), then the kebab click wrapped in `expect(async () => {...}).toPass({timeout:15_000})` to absorb pre-hydration click-swallow (`admin-lifecycle-layout.spec.ts:341-346`). Never `networkidle`. Every new case reuses this gate verbatim.
3. **Detach safety.** Placement re-measures on resize and on content change, so a `locator.evaluate` sampling a node across an arm/disarm can outlive it. All geometry sampling is done in a SINGLE `page.evaluate` that re-queries each node by testid inside the callback and returns plain data — never a held `ElementHandle` across a state change, and never `locator.evaluate` on a node the same block is about to unmount.
4. **Environment hazard (measured this session, three times).** A process outside the run clears `app_settings.watched_folder_id`, which makes `/admin` render the onboarding wizard so the modal never mounts and every case fails on the readiness gate. Task 7 adds a `beforeEach` that re-asserts the watched folder via `sqlClient` rather than depending on seed order.

---

## 4. Tasks

Every task: failing test -> minimal implementation -> passing test -> commit (invariant 1). Conventional commits, one per task (invariant 6).

### Task 1 — structural guard + portal/placement migration (ONE task, one commit)

**Why these are one task, not two (plan-review R1 BLOCKING).** The guard is red on `ShareHub.tsx` by construction and only the migration can make it green. Splitting them would give Task 1 no implementation step capable of passing its own test and would leave the branch red between commits, violating the per-task `failing test -> minimal implementation -> passing test -> commit` invariant. Red-to-green happens inside this one task.

**Test first.** Create a new `_metaPopoverPlacementContract` test under the showpage component test directory, as a **registry tripwire**, not a defect classifier.

**Why a registry and not a shape detector (plan-review R3 Q3, HIGH).** The first draft classified files by co-occurrence of `top-full` + `overflow-y-auto` + `max-h-[`. Review demonstrated that is simultaneously too narrow and too loose, with live counter-examples in this repo:

| evasion | live instance |
| --- | --- |
| Tailwind scale cap instead of arbitrary | `components/admin/showpage/AttentionMenu.tsx:130` (`max-h-96`) |
| semantic token cap | `components/admin/BellPanel.tsx:1169` (`max-h-panel-max-mobile`) |
| inline style cap | `components/shared/ReportModal.tsx:636` (`style={{ maxHeight: ... }}`) |
| arbitrary anchor instead of `top-full` | `components/admin/showpage/AttentionMenu.tsx:119` (`top-[calc(100%+8px)]`) |
| class list imported from another file | acknowledged; no live instance |

And whole-file substring co-occurrence can classify three unrelated JSX elements in one file as a single defective overlay — a false positive that trains the reader to ignore the guard.

**The registry inverts the failure mode.** The detector is deliberately BROAD — any `components/**/*.tsx` (walked with the shared `walkSourceFiles` helper, `lib/messages/__internal__/walkSourceFiles.ts:8`) whose source contains an absolute-overlay hint (`absolute` together with any of `top-full`, `bottom-full`, `top-[`, `bottom-[`) AND a scroller hint (`overflow-y-auto`, `overflow-auto`, `overflow-y-scroll`) must appear in an explicit registry. Over-matching is now harmless: it costs one registry row stating the disposition, rather than producing a silent pass. Under-matching is what the old design risked and what the counter-examples above exploit.

Each registry row carries a file and one of three dispositions with a reason string:

- `placement-module` — resolves geometry through `lib/popover/position.ts` (asserted by also requiring the import). After the migration: `ShareHub.tsx`, `HoverHelp.tsx`.
- `fit-within-clip` — clip-safe via `useFitWithinClip` instead (asserted by requiring that import): `ReSyncButton.tsx`.
- `not-clip-constrained` — anchored overlay that is not inside the review-modal panel, or has no internal scroll range, so it cannot strand content. Requires a reason naming which.

The test asserts: every detected file has a row; every row's asserted import is actually present; and **no row is unused** (so deleting an overlay cannot leave a stale exemption behind).

**Failure mode it catches:** a NEW anchored, internally-scrolling overlay added to this tree without anyone deciding how it survives the panel's `overflow-clip` — which is exactly how the share hub shipped broken after `HoverHelp` was fixed, with nothing failing. This is the repo's established registry idiom (invariants 9 and 10), not a new mechanism.

**Anti-tautology:** the classifier itself is unit-tested against synthetic sources covering each row of the evasion table above, so an over-narrow regex cannot silently match nothing. It is also asserted to fire on `ShareHub.tsx` as written today (`components/admin/showpage/ShareHub.tsx:487`), which is the red state this task starts from.

It fails on `ShareHub.tsx` when written (red, because the file has no `placement-module` import yet), and the migration below turns it green inside this same task.

Commit note: the registry file and the test land together.

**Then, in the same task — the migration.**

**Test first (jsdom, `tests/components/admin/showpage/shareHub.test.tsx`):** with a `PopoverHostContext` provider supplying a host element, opening the hub renders the popover INSIDE the host, not inside `share-hub-root`; with no provider it renders into `document.body`. Assert via `host.contains(popover)`, not by class.

**Test first, part 3 (spec §5.1, `tests/lib/popover/position.test.ts`).** Add the measured hub geometry as a decision-table case: `trigger` = the hub group at `381.3 -> 425.3`, `bounds` = the panel `84 -> 560` inset by `VIEWPORT_INSET`, natural body height 583 (border-box, per the module's metric contract at `lib/popover/position.ts:11-13`), cap 390 — asserting `side === "top"` and `maxHeight === 283`.

**Failure mode it catches:** a change to the module's tie/flip ordering that still satisfies its existing synthetic cases but breaks the hub's real numbers. Grounds the adoption in the probe (spec §9.3) rather than in invented figures.

**Implementation.** Per spec §2.1.1-§2.1.2: `mounted` gate flipped in an effect (`HoverHelp.tsx:146-154` pattern and rationale — `useHasMounted` is wrong here because a provider's ref is still null on the first client commit); `createPortal` to `hostRef.current ?? document.body`; measure and apply per §2.1.2, mirroring `HoverHelp.tsx:228-268` including the body-host bounds degeneration (`host === document.body` -> viewport rect) and the `toHostOffsets` conversion, which is shared by body and caret so the two cannot drift. Remove the bespoke `caretRightPx` layout effect (`ShareHub.tsx:180-211`) and the `absolute right-0 top-full` / `max-w-[calc(100vw-2rem)]` classes (`ShareHub.tsx:487`). Set `data-popover-side`. Handle `kind:"hidden"` per §2.1.2.

The guard written above goes green here; run it as the last step before committing.

Commit: `feat(admin): portal the share-hub popover onto the shared positioning core, with a structural guard`

### Task 2 — re-measure signals, incl. the content-growth defect

**Test first (real browser, T-REGROW, §2.1.2b).** Derive the viewport at runtime: measure the idle body's natural height and the armed body's natural height, then choose a height where the idle body fits below the trigger but the armed one does not. Arm, then assert the popover is still within `bounds` and that side or `maxHeight` changed.

**Failure mode it catches:** placement that re-measures only on viewport resize. At such a viewport the idle body fits below, so `computePopoverPlacement` returns `side:"bottom"` with no cap; arming then grows the body past the room that justified the decision and the popover overhangs the clip edge again — reintroducing the exact defect this branch closes, in the one interaction it is about. Measured growth: ~477 idle -> 583 armed (spec §9.3).

**Anti-tautology:** the viewport is computed from measured heights, never hardcoded — a hardcoded 560 cannot reach this case at all, because there the idle body already exceeds both sides and a cap is always applied.

**Implementation.** Four re-measure signals per §2.1.2b: open (layout effect), `window` resize, `ResizeObserver` on the host, `ResizeObserver` on the popover body. Feature-detect `ResizeObserver` and never construct it when absent (jsdom has none; an unguarded construction takes the component down — `ReSyncButton.tsx:137-141`). Coalesce into one `requestAnimationFrame`.

Commit: `fix(admin): re-place the share-hub popover when its own content grows`

### Task 3 — caret flip

**Test first (real browser, T-CARET-1 / T-CARET-2, §3).** The caret abuts the popover's near edge within 1px on whichever side is chosen, never overlaps the trigger, and its centre is at least `CARET_EDGE_INSET` from both popover corners.

**Implementation.** Per spec §2.1.3: caret rendered as a portal SIBLING of the body (never a child — the body is `overflow-y-auto` and a child is clipped away invisibly, `ShareHub.tsx:667-671`), keeping `pointer-events-none` for the documented hit-testing reason. Border faces flip by side (`border-t border-l` below / `border-b border-r` above). Horizontal centring keeps the opener-centre math as the §1.1 bounded carve-out, clamped to honour the corner constraint.

Commit: `feat(admin): flip the share-hub caret with the placed side`

### Task 4 — backdrop ordering

**Test first (real browser).** With the header attention menu open and the hub open, clicking `share-hub-backdrop` closes the hub. Uses `elementFromPoint`, not class reads.

**Implementation.** Per §2.1.5: backdrop stays in the hub root (viewport-fixed, needs no host) and gets an explicit z-index ordered against the portaled popover instead of relying on document order.

Commit: `fix(admin): give the share-hub backdrop an explicit order against the portaled popover`

### Task 5 — stacking: remove the root `z-30`

**Test first.** Re-run the shipped `T-HUB-ZORDER` (`tests/e2e/published-review-modal.interactions.spec.ts:871`) plus the added case from §5.4: with the hub popover OPEN, the attention menu's panel receives clicks. Both via `elementFromPoint` — the shipped test body records that a class assertion passes against a wrapper that is elevated but still loses in paint order, which is the bug.

**Implementation.** Remove `open ? "z-30" : ""` from the root (`ShareHub.tsx:371`) and update the file's header comment block (`ShareHub.tsx:40-52`), which currently documents the removed mechanism and would otherwise be actively misleading.

**Regression budget note (fix-round rule):** this task patches the same surface Task 4 touches. After it, re-run Task 4's assertion and the `shareHub.test.tsx` class-level `z >= 20` check named at `ShareHub.tsx:51`, and record both in the commit body.

Commit: `refactor(admin): drop the share-hub root z-30 now that the popover portals out`

### Task 6 — focus order across the portal boundary

**Test first (real browser, T-FOCUS, §2.1.2c).** On open, focus is inside the popover; on Escape, focus is on the trigger that opened it; both asserted with the popover placed on each side (drive the side by viewport, assert via `data-popover-side`).

**Implementation.** None expected — the contract is already implemented (`ShareHub.tsx:351-353`, `ShareHub.tsx:271-274`, `ShareHub.tsx:326-344`) and the task exists to prove the portal did not break it. If it did, fix here.

Commit: `test(admin): pin share-hub focus entry and Escape restore across the portal boundary`

### Task 7 — layout-dimensions task (mandatory; real-browser sweep)

**Test first.** Extend `tests/e2e/admin-lifecycle-layout.spec.ts`, sweeping `390 x {844, 740, 667, 620, 560}` with a Held show, hub open, Archive armed via a REAL Playwright click (the probe's `element.click()` bypassed actionability precisely because the control was unreachable; a reachability test that kept the bypass would assert nothing).

Assert the spec's exact Dimensional Invariants (§3), every one within 0.5px:

| relationship | guarantee | id |
| --- | --- | --- |
| popover box -> `bounds` | popover rect entirely within `insetRect(intersect(panelRect, viewportRect), 8)`, both axes | T-FIT-1 |
| popover box -> visual viewport | popover rect entirely within the viewport | T-FIT-2 |
| armed confirm + cancel -> viewport | at some reachable scroll of the popover's own scroller, both fully within the viewport | T-REACH-1 |
| idle Archive row -> viewport | reachable at some scroll with the popover idle | T-REACH-2 |
| `data-popover-side` -> available room | equals `computePopoverPlacement`'s side recomputed in-page from measured rects | T-SIDE-1 |
| caret -> popover near edge | abuts within 1px; never overlaps the trigger | T-CARET-1 |
| caret -> popover corner | centre at least `CARET_EDGE_INSET` from both corners | T-CARET-2 |
| popover width | 308px at every viewport | T-FIT-3 |
| armed body -> `bounds` | still inside `bounds` after idle->armed growth | T-REGROW |
| open/Escape -> focus | focus enters popover on open, returns to opener on Escape | T-FOCUS |

Containment uses `elementFromPoint` at the confirm's centre, not `getBoundingClientRect` alone: `BL-HOVERHELP-PORTAL` records that a clipped popover still reports an unclipped box, so a rect-only assertion passes against the very bug. `tests/e2e/published-review-modal.interactions.spec.ts:1523` (T4a) is the shipped template.

Also add the §3 `beforeEach` watched-folder re-assertion from the harness checklist.

**Update, do not delete,** the existing case at `admin-lifecycle-layout.spec.ts:305`: its causality assertion (production `scrollIntoView`, `block:"end"`, `after == offsetTop + offsetHeight - clientHeight`) still guards the retained handler, but its below-fold precondition must be re-derived against the placed body's `clientHeight` and must keep failing loudly if the armed morph stops overflowing.

**Anti-tautology:** every expected value is derived in-page from measured rects; no viewport-specific constant is hardcoded; T-REACH sweeps the real scroll range rather than asserting a fixed `scrollTop`.

Commit: `test(admin): real-browser sweep pinning share-hub placement and armed-confirm reachability`

### Task 8 — transition audit (mandatory)

**Test first.** Enumerate every conditional render and state pair in the popover and assert each is either explicitly instant or carries the right animation props, per the spec §4 inventory reproduced here:

| transition | required treatment |
| --- | --- |
| closed -> open-below / open-above | instant; side decided before paint, no flash at the wrong side |
| open-below/above -> closed | instant |
| open-below <-> open-above | instant re-place, no animation |
| idle -> armed | instant morph, then the retained rAF `scrollIntoView(confirm, {block:"end"})` |
| armed -> idle (Cancel) | instant; focus restored to trigger |

Compound cases asserted: viewport resize while armed (armed state preserved, confirm stays mounted, re-place instant); host resize while armed; lifecycle flip while open (popover closes, focus restored, portal unmounts); busy mid-flight while resizing (re-place happens, dismissal stays gated, resize must NOT close the popover); dev-capture `preCapture` (closes popover, waits two frames, so an open popover cannot enter the frame).

**Failure mode it catches:** a placement effect that closes or remounts the popover on resize, which would silently discard an armed destructive confirm mid-decision.

Commit: `test(admin): transition audit for the placed share-hub popover`

### Task 9 — state-conditional Archive copy

**Test first (jsdom, §5.2).** Four assertions: `published:true` -> "Ends crew access and clears it off the dashboard"; `published:false` -> "Clears this wrapped show off the dashboard"; the description node is the one the button's `aria-describedby` IDREF resolves to (NOT a text query — the popover also renders the paused note, so a container-scoped text query would pass on either branch); Rotate's description unchanged in both arms.

**Implementation.** `ShareHub.tsx:636` becomes the `published` conditional per §2.2. `rowLabel` unchanged.

Pre-code mechanical gate: no em-dash, no apostrophe literal, sentence case, no terminal period, matching the sibling rotate row.

Commit: `feat(admin): make the archive row description true in both lifecycle states`

### Task 10 — ledgers + help copy

Per §2.3 (as amended 2026-07-24: merge-atomic, not commit-atomic — the fix is nine commits, so "the same commit as the fix" never existed) and §2.4, in one dedicated commit that MUST land in this PR: correct `BACKLOG.md` `BL-SHAREHUB-ARM-VIEWPORT-REVEAL` (strike the false manual-scroll mitigation, record `overflow-clip`, raise MEDIUM -> HIGH, mark closed, cross-reference `BL-HOVERHELP-PORTAL` as the same class); move both `DEFERRED.md` entries to `DEFERRED-archive.md`, the second marked REFUTED with §1.2's reasoning; add `BL-PUBLISHED-TOGGLE-OVERLAY-CLIP`; fix `app/help/admin/dashboard/page.mdx:49` to name the share hub instead of the Overview section.

Commit: `docs: close the share-hub reveal and gravity-cue deferrals with corrected findings`

### Task 11 — close-out

Delete the throwaway probe spec. Run the full local gate set: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, then the e2e files this branch touches. Confirm the probe file is absent from the diff and that `git status` is clean.

Commit: `chore: remove the throwaway placement probe`

---

## 5. Checklist

- [ ] Task 1 — structural guard + portal/placement migration
- [ ] Task 2 — re-measure signals + T-REGROW
- [ ] Task 3 — caret flip
- [ ] Task 4 — backdrop ordering
- [ ] Task 5 — remove root `z-30`
- [ ] Task 6 — focus order
- [ ] Task 7 — layout-dimensions sweep
- [ ] Task 8 — transition audit
- [ ] Task 9 — state-conditional copy
- [ ] Task 10 — ledgers + help copy
- [ ] Task 11 — close-out (blocks merge: verify no DEFERRED.md/BACKLOG.md entry still states the refuted claims)
- [ ] Self-review
- [ ] **Adversarial review (cross-model)** — mandatory gate before execution handoff. Spec §10 records four consecutive silent Codex deaths this session; if that persists, the same self-certification rung applies and is recorded here with the attempt log.
- [ ] impeccable critique + audit (invariant 8 — UI surface)
- [ ] Execution handoff / merge

## 6. Snippet typecheck note

No implementation or test snippet is pasted verbatim into this plan, so the paste-time typecheck rule has nothing to check here. Each task instead names the shipped reference implementation to mirror (`HoverHelp.tsx:228-300` for measure/apply, `ReSyncButton.tsx:137-141` for the ResizeObserver guard, `published-review-modal.interactions.spec.ts:1523` for the `elementFromPoint` containment shape). Task-time code is typechecked by `pnpm typecheck` in Task 12 and by the pre-push gate.
