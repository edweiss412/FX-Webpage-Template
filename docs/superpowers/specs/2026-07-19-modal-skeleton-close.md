# MODAL-SKELETON-CLOSE-1 — the Suspense skeleton frame gets a real close

**Date:** 2026-07-19 · **Status:** ratified (autonomous-ship run) · **Resolves:** `DEFERRED.md` § MODAL-SKELETON-CLOSE-1 (P2)

## 1. Problem

`ShowReviewModalSkeleton` has two usages (`components/admin/showpage/ShowReviewModalSkeleton.tsx:26`):

1. **Server Suspense fallback** — `app/admin/page.tsx:168` mounts `<ShowReviewModalSkeleton />` propless. The skeleton substitutes `onClose ?? (() => {})` (`ShowReviewModalSkeleton.tsx:39`) and derives `closeAffordancesDisabled={onClose === undefined}` (`:42`), so while the `ShowReviewModal` loader streams, Esc / scrim / grab-tap / drag are all dead, body scroll is locked, and the background is inert. On a slow load the user's only escape is browser-back.
2. **Client optimistic copy** — `components/admin/ShowsTable.tsx:672` passes `onClose={() => setPending(null)}`; affordances already live.

The skeleton is a **client** component, so the RSC-serialization argument that forced the no-op applies only to the *prop*, not to the component's own body: it can call `useShowModalNav().close` itself (`components/admin/useShowModalNav.ts:30-36`) without anything crossing the RSC boundary.

## 2. Design (approved approach A)

### 2.1 Skeleton owns a default close — nav issued at dismiss-commit

**The race that shapes this design (adversarial R1 F1):** the shell only calls `onClose` at exit-end (`ReviewModalShell.tsx:380-390,403`). If the default close deferred the nav to `onClose` and the Suspense stream resolved mid-exit, the swap would unmount the skeleton, the unmount cleanup would cancel the exit's timer/listener (`ReviewModalShell.tsx:556-561`), and the nav would **never fire** — the user's Esc silently lost, the loaded modal opening as if nothing happened. So the nav must be issued at dismiss-**commit**, not exit-end.

The shell gains one optional callback:

```ts
/** Fires exactly once, at the moment a dismiss commits (beginDismiss) —
 *  before exit styles are applied and before any exit-end onClose. */
onDismissStart?: () => void;
```

invoked inside `beginDismiss()` (`ReviewModalShell.tsx:293`), which is the single chokepoint both close paths already share (`requestClose` step 3 and the drag-past-threshold branch). `beginDismiss` gains an idempotence guard `if (dismissingRef.current) return;` — structurally replacing the removed `closeAffordancesDisabled` gate at the same site and making `onDismissStart` one-shot by construction. In the reduced-motion path the order inside `requestClose` is unchanged: `beginDismiss()` (→ `onDismissStart`) then immediate `onClose` (`ReviewModalShell.tsx:338-348`).

`ShowReviewModalSkeleton` keeps its optional `onClose?: () => void` prop (ShowsTable path byte-identical in behavior). Internally:

```tsx
const { close } = useShowModalNav();
const [closing, setClosing] = useState(false);
// server-fallback usage only (onClose undefined):
//   onDismissStart={close}            — nav issued the moment a dismiss commits
//   onClose={() => setClosing(true)}  — instant hide at exit-end (#485 pattern)
// prop usage (ShowsTable): onDismissStart NOT passed; onClose={onClose} as today.
```

- Shell mounts with `open={!closing}`. `closing` is only ever set in the server-fallback usage; in the ShowsTable usage the parent unmounts the skeleton (`setPending(null)`) exactly as today.
- The exit sequence is the shell's existing `requestClose` (`components/admin/review/ReviewModalShell.tsx:313`): mode-aware exit animation; reduced motion stays instant. No new animation code.
- If the swap unmounts the skeleton mid-exit, `onClose` never fires — harmless: the nav was already issued by `onDismissStart`, so the close still lands (see §4).
- No reset path needed for `closing`: when the stream resolves mid-close, the Suspense boundary swaps the fallback out for `PublishedReviewModal` — a different element type — so a fresh open never inherits `closing` (same reasoning as `PublishedReviewModal.tsx:132-139`). If the close nav commits first, `?show` is gone and `app/admin/page.tsx` renders no modal branch at all.
- `useShowModalNav` → `useRouter`/`useSearchParams`: `/admin` is a dynamic route (it awaits `searchParams`, `app/admin/page.tsx:155`), so `useSearchParams` in the fallback does not introduce a static-render suspension. The hook is called unconditionally in both usages (hooks rules); the ShowsTable usage simply never invokes the default close pair.
- `PublishedReviewModal` deliberately does NOT adopt `onDismissStart` in this change (its close semantics are ratified by the exit-anim spec; no scope creep).

### 2.2 Real close button replaces the placeholder

The 44px placeholder `<Skeleton className="size-tap-min shrink-0 rounded-sm" />` (`ShowReviewModalSkeleton.tsx:59`) is replaced by the shared `ModalCloseButton` (`components/admin/review/ModalCloseButton.tsx`) — the same component the loaded modal renders at `PublishedReviewModal.tsx:281`:

```tsx
<ModalCloseButton ref={closeRef} testId="published-show-review-close" />
```

- **Same `testId` as the loaded modal's X.** The skeleton already twins every shell testid (`published-show-review-modal/-backdrop/-grab/-header`); the e2e suites handle transient twins with scoped queries and frame counts (`tests/e2e/published-review-modal.interactions.spec.ts:54-57`). The X joins that convention.
- **A11y structure:** the title row wrapper `div.flex.items-start.gap-3` (`ShowReviewModalSkeleton.tsx:55`) is today `aria-hidden="true"` and contains the placeholder. A focusable control must not sit inside an `aria-hidden` subtree, so the wrapper loses its `aria-hidden` and it moves onto the **title-bar block only** (the `div.flex.min-w-0.flex-1` holding the title `Skeleton`, `:56-58`); `ModalCloseButton` is its sibling, outside any `aria-hidden` subtree. The strip row (`:62`) keeps its `aria-hidden`. The sr-only h2 "Loading show details…" (`:51`) remains the dialog's accessible name.
- `initialFocusRef` points at the button (`closeRef = useRef<HTMLButtonElement | null>(null)`), replacing the deliberately-empty `noFocusRef` (`:30,46`) — focus parity with the loaded modal (`PublishedReviewModal.tsx:248`), so the §6.5 in-place swap moves focus from X to X (same visual position).
- The button reaches `requestClose` through `useReviewModalClose()` context (`ModalCloseButton.tsx`), which the shell provides — no wiring change needed.

### 2.3 `closeAffordancesDisabled` is removed from the shell

After 2.1 the skeleton always passes a real `onClose`, and the skeleton was the prop's **sole consumer** (repo grep: only `ShowReviewModalSkeleton.tsx:42` sets it). Keeping it would be a zombie flag (AGENTS.md flag-lifecycle rule). Remove:

- the prop declaration + doc comment (`ReviewModalShell.tsx:79-85`) and destructured default (`:123`),
- the `beginDismiss` gate (`:296`) — **replaced** by the idempotence guard `if (dismissingRef.current) return;` (§2.1),
- the `requestClose` step-0 gate (`:314`) — §3.1 of the exit-anim spec renumbers: former steps 1–5 become the whole ladder, "step 0" is deleted,
- the `handleGrabPointerDown` gate (`:407`) — the `dismissingRef` early-return on the next line (`:408`) already covers the departing-panel case,
- the stale part of the `requestClose` "deliberately NOT useCallback" comment that cites `closeAffordancesDisabled` staleness (`:308-312`) — the not-memoized rationale itself stays (Esc listener + `closeApiRef` need the current closure).

Also updated (R1 F5): the skeleton's file-header contract comment (`ShowReviewModalSkeleton.tsx:3-21`) — "MUST be a client component with ZERO props", "non-interactive", "renders no interactive control", and the empty-focus-ref rationale are all superseded; rewrite the header to the new contract (client component, optional `onClose`, default nav-close, real X, initial focus on the X).

## 3. Spec amendments (land in the same change)

### 3.1 `docs/superpowers/specs/2026-07-18-admin-show-modal.md`

- §4 (`:73`): "…inside an open, non-interactive modal frame…" → "…inside an open, **content-non-interactive** modal frame — close affordances (X / scrim / Esc / grab / drag) are live and navigate back via `useShowModalNav().close` (MODAL-SKELETON-CLOSE-1 amendment, `2026-07-19-modal-skeleton-close.md`); the loading blocks themselves stay non-interactive."
- §6.5 transition inventory: add row `| skeleton open → closed (X/scrim/Esc/grab/drag) | same shell exit animation as the loaded modal (requestClose); server fallback: nav issued at dismiss-commit (onDismissStart), instant hide at exit-end; ShowsTable: the passed cancel at exit-end |`.

### 3.2 `docs/superpowers/specs/2026-07-18-modal-close-exit-anim.md`

- §3.1 step 0 (`:64`): deleted (renumber; `requestClose` now begins at the one-exit guard). §3.1's `beginDismiss` description gains the idempotence guard + the `onDismissStart` one-shot callback (fires at dismiss-commit, before exit styles; both the `requestClose` and drag branches reach it through `beginDismiss`).
- §3.4 (`:151-162`): rewritten — the section title becomes "The skeleton closes everywhere"; both usages pass a live `onClose`; the server-fallback usage additionally passes `onDismissStart` so the close nav is issued at dismiss-commit (survives a mid-exit Suspense swap); `closeAffordancesDisabled` no longer exists. State the historical note that the prop existed between EXIT-ANIM and SKELETON-CLOSE.
- Behavior matrix rows (`:180-181`, `:210-211`): server-fallback row becomes "nav issued at dismiss-commit (`onDismissStart` → `useShowModalNav().close`), exit animation, instant hide at exit-end".
- §6.5 amendment quote (`:200`): trailing sentence "The Suspense-fallback skeleton stays non-interactive (MODAL-SKELETON-CLOSE-1 still deferred)" → "The Suspense-fallback skeleton closes like the loaded modal (MODAL-SKELETON-CLOSE-1 resolved, `2026-07-19-modal-skeleton-close.md`)."
- Test-shape item 4 (`:226`) and file-table rows (`:258`, `:262`, `:265`): updated to the new contract.

### 3.3 `DEFERRED.md` (R1 F4 — archive policy, `DEFERRED.md:5`)

MODAL-SKELETON-CLOSE-1's full entry MOVES to `DEFERRED-archive.md` with a Resolved provenance note (un-defer trigger fired — this task; what shipped; spec link). The working queue drops the entry; the "Last reconciled" line and the stale cross-reference in the MODAL-CLOSE-EXIT-ANIM resolved note (`DEFERRED.md:14`: "**`MODAL-SKELETON-CLOSE-1` below stays deferred**") are updated to point at the archive.

## 4. Guard conditions

| Input / state | Behavior |
|---|---|
| `onClose` undefined (server fallback) | shell gets `onDismissStart={close}` + `onClose={() => setClosing(true)}` |
| `onClose` provided (ShowsTable) | shell gets `onClose={onClose}`, NO `onDismissStart`; `closing` never set; identical to today |
| Esc/scrim/X/grab-tap while streaming | dismiss commits → `onDismissStart` fires the nav → shell exit animation → `onClose` at exit-end hides |
| drag past threshold while streaming | `beginDismiss` → `onDismissStart` (same chokepoint) → transition → `onClose` |
| reduced motion | `beginDismiss` (→ `onDismissStart` nav) then immediate `onClose` (shell `:338-348`) |
| stream resolves during exit animation | Suspense swaps fallback → `PublishedReviewModal` (fresh element, entrance suppressed per §6.5); the unmount cleanup cancels the shell's timers/listeners (`ReviewModalShell.tsx:556-561`), so the skeleton's `onClose` never fires — but the nav was **already issued at dismiss-commit** by `onDismissStart`, so the close commit strips `?show` and unmounts the briefly-visible loaded modal. The Esc is never lost. |
| stream resolves BEFORE any close gesture | today's behavior: in-place swap, skeleton's pending nothing |
| close nav commits before stream resolves | `?show` absent → `app/admin/page.tsx` renders no modal branch; nothing left to unmount |
| double-activation of an affordance | `dismissingRef` step guard in `requestClose` (`ReviewModalShell.tsx:315`) + new idempotence guard in `beginDismiss` → `onDismissStart` fires at most once per shell instance |

## 5. Test plan

Unit (jsdom, vitest):

- `tests/components/admin/showpage/showReviewModalSkeleton.test.tsx` — rewrite. Needs a `next/navigation` mock (pattern: `tests/components/admin/showpage/publishedReviewModal.test.tsx:30`). The **propless render IS the server usage** — the component is identical client code in both mounts, so jsdom covers the server-fallback contract directly (R1 F2).
  - Server-fallback usage, reduced motion: Esc (and scrim click) hides the dialog AND pushes the show-stripped URL (`routerPush` called with `/admin`-shaped href, `{ scroll: false }`). Drag-past-threshold path also closes (the branch that bypasses `requestClose`).
  - Server-fallback usage, **motion enabled + fake timers** (R1 F3 — the race window itself): Esc → assert `routerPush` was called **immediately** (at dismiss-commit, before any exit-end), while the dialog is still mounted mid-exit; then advance timers past `DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS` → dialog gone. Then the swap-mid-exit case: Esc, assert `routerPush` already called, **unmount the skeleton before the exit completes** (rerender without it — what a Suspense swap does), run all timers → no late `onClose` errors, no double push.
  - Client usage: unchanged assertions — Esc calls the passed `onClose` once; `routerPush` NOT called (prop path must not leak into nav).
  - X button: rendered with `data-testid="published-show-review-close"`, `aria-label="Close"`, receives initial focus (useDialogFocus contract), and is NOT inside any `aria-hidden` subtree (closest `[aria-hidden]` is null).
  - Entrance-suppression test (`:73-79`) unchanged.
- `tests/components/admin/review/reviewModalShell.test.tsx` — at `:477` drop the step-0 pin; add a **negative** pin: shell source contains no `closeAffordancesDisabled` (the prop must not resurrect half-wired); pin the `beginDismiss` idempotence guard (`bodyOf(beginDismiss)` contains `dismissingRef.current) return`). Behavioral: `onDismissStart` fires exactly once for (a) Esc, (b) drag-past-threshold, and (c) Esc followed by scrim click; and does NOT fire on spring-back or tap-below-slop before any close.
- `tests/components/admin/transitionAudit.test.tsx` — no change expected: the skeleton stays motion-free in source (registry row `:49`); the new state (`closing`) unmounts via the shell's existing exit machinery.

E2e (Playwright, real browser):

- **Honesty note (R1 F2):** the existing gated-RSC harness (`published-review-modal.interactions.spec.ts:456-478`) gates the row-click open nav, which freezes the **client optimistic** skeleton (pre-commit, `ShowsTable.tsx:672`) — it cannot mount the propless server fallback, and Playwright's `route.fulfill` cannot stream a partial RSC response to freeze the real Suspense fallback deterministically. The guaranteed-red-before/green-after coverage for the default-close path is therefore the jsdom suite above (identical code path).
- `tests/e2e/published-review-modal.deeplink.spec.ts` — new test for the end-to-end invariant: `goto /admin?show=<slug>`, press Esc as soon as the first `role="dialog"` frame appears (skeleton or loaded — whichever the timing yields), assert eventual: zero modal frames, `?show` stripped from the URL, body scroll unlocked, `[data-inert-root]` un-inerted. Post-fix this is deterministic from EITHER frame (skeleton navs at dismiss-commit; loaded modal's `handleClose` navs at exit-end). Pre-fix it fails whenever Esc lands in the fallback window; it is a real-browser wedge-regression test, not the primary red/green proof.

Meta-test impact (declared per AGENTS.md): no registry rows added or removed — no mutation surface touched (close is a client-side nav), no Supabase calls, no §12.4 codes, no `pg_advisory*`. The transition-audit registry and shell structural tests are updated in place as above.

## 6. Out of scope

- ShowsTable's optimistic-close semantics (`setPending(null)` without cancelling the in-flight open nav) — existing behavior, unchanged.
- Any change to `Step3ReviewModal` (never used the prop).
- Back/forward-cache or popstate close paths (unchanged, per exit-anim spec).
