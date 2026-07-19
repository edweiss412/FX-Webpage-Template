# MODAL-SKELETON-CLOSE-1 — the Suspense skeleton frame gets a real close

**Date:** 2026-07-19 · **Status:** ratified (autonomous-ship run) · **Resolves:** `DEFERRED.md` § MODAL-SKELETON-CLOSE-1 (P2)

## 1. Problem

`ShowReviewModalSkeleton` has two usages (`components/admin/showpage/ShowReviewModalSkeleton.tsx:26`):

1. **Server Suspense fallback** — `app/admin/page.tsx:168` mounts `<ShowReviewModalSkeleton />` propless. The skeleton substitutes `onClose ?? (() => {})` (`ShowReviewModalSkeleton.tsx:39`) and derives `closeAffordancesDisabled={onClose === undefined}` (`:42`), so while the `ShowReviewModal` loader streams, Esc / scrim / grab-tap / drag are all dead, body scroll is locked, and the background is inert. On a slow load the user's only escape is browser-back.
2. **Client optimistic copy** — `components/admin/ShowsTable.tsx:672` passes `onClose={() => setPending(null)}`; affordances already live.

The skeleton is a **client** component, so the RSC-serialization argument that forced the no-op applies only to the *prop*, not to the component's own body: it can call `useShowModalNav().close` itself (`components/admin/useShowModalNav.ts:30-36`) without anything crossing the RSC boundary.

## 2. Design (approved approach A)

### 2.1 Skeleton owns a default close

`ShowReviewModalSkeleton` keeps its optional `onClose?: () => void` prop (ShowsTable path byte-identical in behavior). Internally:

```tsx
const { close } = useShowModalNav();
const [closing, setClosing] = useState(false);
const defaultClose = useCallback(() => {
  setClosing(true); // instant client-side hide (#485 pattern, PublishedReviewModal.tsx:140-144)
  close();          // URL catches up in the background ({ scroll: false })
}, [close]);
const handleClose = onClose ?? defaultClose;
```

- Shell mounts with `open={!closing}` and `onClose={handleClose}`. `closing` is only ever set by `defaultClose`, i.e. only in the server-fallback usage; in the ShowsTable usage the parent unmounts the skeleton (`setPending(null)`) exactly as today.
- The exit sequence is the shell's existing `requestClose` (`components/admin/review/ReviewModalShell.tsx:313`): mode-aware exit animation, then `handleClose` at exit-end; reduced motion stays instant. No new animation code.
- No reset path needed for `closing`: when the stream resolves mid-close, the Suspense boundary swaps the fallback out for `PublishedReviewModal` — a different element type — so a fresh open never inherits `closing` (same reasoning as `PublishedReviewModal.tsx:132-139`). If the close nav commits first, `?show` is gone and `app/admin/page.tsx` renders no modal branch at all.
- `useShowModalNav` → `useRouter`/`useSearchParams`: `/admin` is a dynamic route (it awaits `searchParams`, `app/admin/page.tsx:155`), so `useSearchParams` in the fallback does not introduce a static-render suspension. The hook is called unconditionally in both usages (hooks rules); the ShowsTable usage simply never invokes `defaultClose`.

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
- the `beginDismiss` gate (`:296`),
- the `requestClose` step-0 gate (`:314`) — §3.1 of the exit-anim spec renumbers: former steps 1–5 become the whole ladder, "step 0" is deleted,
- the `handleGrabPointerDown` gate (`:407`),
- the stale part of the `requestClose` "deliberately NOT useCallback" comment that cites `closeAffordancesDisabled` staleness (`:308-312`) — the not-memoized rationale itself stays (Esc listener + `closeApiRef` need the current closure).

## 3. Spec amendments (land in the same change)

### 3.1 `docs/superpowers/specs/2026-07-18-admin-show-modal.md`

- §4 (`:73`): "…inside an open, non-interactive modal frame…" → "…inside an open, **content-non-interactive** modal frame — close affordances (X / scrim / Esc / grab / drag) are live and navigate back via `useShowModalNav().close` (MODAL-SKELETON-CLOSE-1 amendment, `2026-07-19-modal-skeleton-close.md`); the loading blocks themselves stay non-interactive."
- §6.5 transition inventory: add row `| skeleton open → closed (X/scrim/Esc/grab/drag) | same shell exit animation as the loaded modal (requestClose), then default close = instant hide + URL catch-up (server fallback) or the passed cancel (ShowsTable) |`.

### 3.2 `docs/superpowers/specs/2026-07-18-modal-close-exit-anim.md`

- §3.1 step 0 (`:64`): deleted (renumber; `requestClose` now begins at the one-exit guard).
- §3.4 (`:151-162`): rewritten — the section title becomes "The skeleton closes everywhere"; both usages pass a live `onClose`; `closeAffordancesDisabled` no longer exists. State the historical note that the prop existed between EXIT-ANIM and SKELETON-CLOSE.
- Behavior matrix rows (`:180-181`, `:210-211`): server-fallback row becomes "exit animation, then instant hide + `useShowModalNav().close` catch-up".
- §6.5 amendment quote (`:200`): trailing sentence "The Suspense-fallback skeleton stays non-interactive (MODAL-SKELETON-CLOSE-1 still deferred)" → "The Suspense-fallback skeleton closes like the loaded modal (MODAL-SKELETON-CLOSE-1 resolved, `2026-07-19-modal-skeleton-close.md`)."
- Test-shape item 4 (`:226`) and file-table rows (`:258`, `:262`, `:265`): updated to the new contract.

### 3.3 `DEFERRED.md`

MODAL-SKELETON-CLOSE-1 entry gets a **Resolved** preamble (pattern of `DEFERRED.md:14`): un-defer trigger fired (this task), what shipped, spec link.

## 4. Guard conditions

| Input / state | Behavior |
|---|---|
| `onClose` undefined (server fallback) | `handleClose = defaultClose` → `setClosing(true)` + `close()` |
| `onClose` provided (ShowsTable) | `handleClose = onClose`; `closing` never set; identical to today |
| Esc/scrim/X/grab-tap while streaming | shell exit animation → `handleClose` at exit-end |
| drag past threshold while streaming | `beginDismiss` (no gate) → transition → `handleClose` |
| reduced motion | instant `handleClose` (shell `:345-348`), unchanged contract |
| stream resolves during exit animation | Suspense swaps fallback → `PublishedReviewModal` (fresh element, entrance suppressed per §6.5); the unmount cleanup cancels the shell's timers/listeners (`ReviewModalShell.tsx:556-561`); the already-issued `close()` nav still strips `?show`, so the loaded modal unmounts on that commit — no stuck modal, no double close (`dismissingRef` one-shot is per-instance) |
| close nav commits before stream resolves | `?show` absent → `app/admin/page.tsx` renders no modal branch; nothing left to unmount |
| double-activation of an affordance | `dismissingRef` step-1 guard (`ReviewModalShell.tsx:315`), unchanged |

## 5. Test plan

Unit (jsdom, vitest):

- `tests/components/admin/showpage/showReviewModalSkeleton.test.tsx` — rewrite. Needs a `next/navigation` mock (pattern: `tests/components/admin/showpage/publishedReviewModal.test.tsx:30`).
  - Server-fallback usage: under reduced motion, Esc (and scrim click) hides the dialog AND pushes the show-stripped URL (`routerPush` called with `/admin`-shaped href, `{ scroll: false }`). Drag-past-threshold path also closes (the branch that bypasses `requestClose`).
  - Client usage: unchanged assertions — Esc calls the passed `onClose` once; `routerPush` NOT called (prop path must not leak into nav).
  - X button: rendered with `data-testid="published-show-review-close"`, `aria-label="Close"`, receives initial focus (useDialogFocus contract), and is NOT inside any `aria-hidden` subtree (closest `[aria-hidden]` is null).
  - Entrance-suppression test (`:73-79`) unchanged.
- `tests/components/admin/review/reviewModalShell.test.tsx:477` — drop the step-0 pin; add a **negative** pin: shell source contains no `closeAffordancesDisabled` (the prop must not resurrect half-wired).
- `tests/components/admin/transitionAudit.test.tsx` — no change expected: the skeleton stays motion-free in source (registry row `:49`); the new state (`closing`) unmounts via the shell's existing exit machinery.

E2e (Playwright, real browser):

- `tests/e2e/published-review-modal.interactions.spec.ts` — new test using the existing gated-RSC harness (`:456-476` pattern, which freezes the skeleton by holding the open-nav response): with the stream held, press Esc → assert the frame count drops to zero and `?show` is stripped from the URL. This exercises the server-fallback-equivalent skeleton in a real browser (inert/scroll-lock cleanup included).

Meta-test impact (declared per AGENTS.md): no registry rows added or removed — no mutation surface touched (close is a client-side nav), no Supabase calls, no §12.4 codes, no `pg_advisory*`. The transition-audit registry and shell structural tests are updated in place as above.

## 6. Out of scope

- ShowsTable's optimistic-close semantics (`setPending(null)` without cancelling the in-flight open nav) — existing behavior, unchanged.
- Any change to `Step3ReviewModal` (never used the prop).
- Back/forward-cache or popstate close paths (unchanged, per exit-anim spec).
