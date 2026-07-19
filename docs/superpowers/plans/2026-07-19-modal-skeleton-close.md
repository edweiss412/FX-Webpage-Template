# MODAL-SKELETON-CLOSE-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the review-modal Suspense skeleton's close affordances (Esc/scrim/X/grab/drag) so a user is never trapped while the loader streams; remove the now-zombie `closeAffordancesDisabled` shell prop.

**Architecture:** Per spec `docs/superpowers/specs/2026-07-19-modal-skeleton-close.md`: `ReviewModalShell` gains an optional one-shot `onDismissStart` callback fired at dismiss-commit inside `beginDismiss()` (closes the Suspense-swap-mid-exit race — the nav is issued before the exit animation, not at exit-end); `ShowReviewModalSkeleton` passes `onDismissStart={useShowModalNav().close}` in its propless (server-fallback) usage and renders a real `ModalCloseButton`; `closeAffordancesDisabled` is deleted (skeleton was the sole consumer).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, vitest + jsdom, Playwright.

## Global Constraints

- Worktree: `/Users/ericweiss/FX-worktrees/modal-skeleton-close` (branch `fix/modal-skeleton-close`). All paths below are relative to it. Commits use `--no-verify`.
- TDD per task (AGENTS.md invariant 1): failing test → minimal implementation → green → commit (invariant 6, conventional commits). **Declared exception (spec §5 honesty note):** Task 2's e2e is a wedge-regression invariant test whose pre-fix redness is timing-dependent (Esc landing in the fallback window) — a deterministic red run is not achievable without freezing the Suspense fallback, which Playwright cannot do. Its red/green proof lives in Task 1's jsdom suite; the e2e lands green-only, after implementation.
- `exactOptionalPropertyTypes: true` (tsconfig.json:9): optional props passed conditionally use spread (`{...(cond ? { prop: v } : {})}`), never `prop={cond ? v : undefined}`.
- Unit suite default matchMedia stub is `matches: false` for every query (tests/setup.ts:70) → motion ENABLED + sheet mode by default; reduced-motion tests wrap with a local matchMedia mock (pattern `tests/components/admin/showpage/publishedReviewModal.test.tsx:301-318`).
- jsdom never fires `transitionend` → motion-enabled exits resolve on the fallback timer (`DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS` = 220+80ms, sheet mode) — use `vi.useFakeTimers()`.
- No new mutation surfaces, no Supabase calls, no §12.4 codes, no `pg_advisory*` → meta-test inventory: none applies beyond the in-place updates named in Tasks 1–2 (shell structural pins, transition-audit registry untouched).
- UI files touched (`components/**`) → invariant-8 impeccable dual-gate runs at close-out (Stage 3 of the ship pipeline), before cross-model review.

---

### Task 1: Shell `onDismissStart` + skeleton default nav-close (one red→green cycle, one commit)

The shell prop deletion and the skeleton rewrite are a single compile unit — deleting `closeAffordancesDisabled` breaks the skeleton's typecheck, so splitting them would leave a red commit boundary (adversarial plan-R1 F2). Both surfaces get their failing tests FIRST, then both implementations, then one green run, then one commit.

**Files:**
- Modify: `components/admin/review/ReviewModalShell.tsx` (prop block :79-85, destructure :123, `beginDismiss` :293-303, `requestClose` step 0 :314 + comment :308-312, `handleGrabPointerDown` :407)
- Modify: `components/admin/showpage/ShowReviewModalSkeleton.tsx`
- Test: `tests/components/admin/review/reviewModalShell.test.tsx`
- Test: `tests/components/admin/showpage/showReviewModalSkeleton.test.tsx`

**Interfaces:**
- Produces: `ReviewModalShellProps.onDismissStart?: () => void` — fires exactly once per open shell instance, at dismiss-commit (inside `beginDismiss`, after the idempotence guard, after the subtree is inerted, before exit styles / before any exit-end `onClose`). `closeAffordancesDisabled` no longer exists. Skeleton signature unchanged: `{ onClose?: () => void }` — both call sites (`app/admin/page.tsx:168` propless; `components/admin/ShowsTable.tsx:672` with cancel) compile unchanged.
- Consumes: `useShowModalNav().close` (`components/admin/useShowModalNav.ts:30-36`); `ModalCloseButton` (`components/admin/review/ModalCloseButton.tsx` — `forwardRef<HTMLButtonElement, { testId: string }>`, closes via `useReviewModalClose()` context).

- [ ] **Step 1: Write the failing shell tests**

In `tests/components/admin/review/reviewModalShell.test.tsx`, replace the step-0 line in the "§3.1 guard" test and add a structural + behavioral block. The file already imports `render/fireEvent/cleanup`, `DRAG_DISMISS_THRESHOLD_PX`, reads `SHELL_SRC`, and defines `stripComments`/`bodyOf` — reuse them.

Replace (in `it("every §3.1 guard is present inside requestClose itself")`):

```ts
    expect(body).toContain("closeAffordancesDisabled"); // step 0
```

with:

```ts
    // step 0 (closeAffordancesDisabled) was DELETED by MODAL-SKELETON-CLOSE-1.
```

Add alongside the other structural tests:

```tsx
  // MODAL-SKELETON-CLOSE-1: the prop must not resurrect half-wired — a revived
  // gate on one affordance but not the drag branch is the exact bug class the
  // deletion closed.
  it("closeAffordancesDisabled is gone from the shell source", () => {
    expect(SHELL_SRC).not.toContain("closeAffordancesDisabled");
  });

  // beginDismiss is the single chokepoint both close paths share; its
  // idempotence guard is what makes onDismissStart one-shot by construction.
  it("beginDismiss early-returns when already dismissing", () => {
    expect(bodyOf(stripComments(SHELL_SRC), "function beginDismiss")).toContain(
      "if (dismissingRef.current) return;",
    );
  });
```

Add a behavioral describe block (top-level in the file; the file's existing shell-render helpers show the minimal-props pattern — if the file has none, this block is self-contained):

```tsx
describe("onDismissStart (MODAL-SKELETON-CLOSE-1 §2.1)", () => {
  function renderShell(onDismissStart: () => void, onClose: () => void) {
    const Host = () => {
      const focusRef = useRef<HTMLButtonElement | null>(null);
      return (
        <ReviewModalShell
          open
          onClose={onClose}
          onDismissStart={onDismissStart}
          labelledBy="h"
          dataAttrPrefix="review-modal"
          testIdBase="odst"
          initialFocusRef={focusRef}
          header={<h2 id="h">t</h2>}
        >
          <div />
        </ReviewModalShell>
      );
    };
    return render(<Host />);
  }

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("fires once at dismiss-commit for Esc, before exit-end onClose (motion enabled)", () => {
    vi.useFakeTimers();
    const onDismissStart = vi.fn();
    const onClose = vi.fn();
    renderShell(onDismissStart, onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismissStart).toHaveBeenCalledTimes(1); // at commit …
    expect(onClose).not.toHaveBeenCalled(); //           … exit still in flight
    vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS + 10);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDismissStart).toHaveBeenCalledTimes(1);
  });

  it("fires once at release for drag-past-threshold (the branch that bypasses requestClose)", () => {
    vi.useFakeTimers();
    const onDismissStart = vi.fn();
    const onClose = vi.fn();
    renderShell(onDismissStart, onClose);
    const grab = screen.getByTestId("odst-grab");
    const endY = 100 + DRAG_DISMISS_THRESHOLD_PX + 30;
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: endY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: endY });
    expect(onDismissStart).toHaveBeenCalledTimes(1); // at release, NOT at exit-end
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + 10);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDismissStart).toHaveBeenCalledTimes(1);
  });

  it("does not double-fire when a second affordance lands mid-exit", () => {
    vi.useFakeTimers();
    const onDismissStart = vi.fn();
    renderShell(onDismissStart, vi.fn());
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTestId("odst-backdrop"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismissStart).toHaveBeenCalledTimes(1);
  });

  it("does not fire on spring-back or tap-below-slop", () => {
    const onDismissStart = vi.fn();
    renderShell(onDismissStart, vi.fn());
    const grab = screen.getByTestId("odst-grab");
    // spring-back: past slop, below threshold
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: 160 });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: 160 });
    expect(onDismissStart).not.toHaveBeenCalled();
  });
});
```

Imports to extend at the top of the file (only those not already present — the live file imports `DRAG_SLOP_PX` but NOT `DRAG_DISMISS_THRESHOLD_PX`, `reviewModalShell.test.tsx:24-32`): `screen`, `vi`, `afterEach`, `useRef`, `ReviewModalShell`, `DRAG_DISMISS_THRESHOLD_PX`, `DURATION_NORMAL_FALLBACK_MS`, `EXIT_FALLBACK_BUFFER_MS`.

Note the tap-below-slop case: a grab TAP (travel ≤ slop) closes via the synthesized click → `requestClose` → `beginDismiss` → `onDismissStart` DOES fire — that is correct behavior (a tap IS a close affordance), which is why the "does not fire" test uses a spring-back (past slop, below threshold), not a tap.

- [ ] **Step 2: Write the failing skeleton tests** — apply the full test-file rewrite shown in Step 2a below.

- [ ] **Step 3: Run both suites to verify they fail**

Run: `cd /Users/ericweiss/FX-worktrees/modal-skeleton-close && pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx tests/components/admin/showpage/showReviewModalSkeleton.test.tsx`
Expected: FAIL — shell suite: `closeAffordancesDisabled is gone` (still present), `beginDismiss early-returns` (guard absent), behavioral block errors on the unknown `onDismissStart` prop; skeleton suite: no `-close` testid, `routerPush` never called, focus falls back to the panel.

- [ ] **Step 4: Implement in `ReviewModalShell.tsx`**

(a) Replace the `closeAffordancesDisabled` prop declaration + comment (:79-85) with:

```ts
  /** Fires exactly once per open shell instance, at the moment a dismiss
   *  COMMITS (`beginDismiss`) — after the subtree is inerted, before exit
   *  styles are applied, and before any exit-end `onClose`. Both close paths
   *  (`requestClose` and the drag-past-threshold branch) reach it through
   *  `beginDismiss`; its idempotence guard makes this one-shot. The skeleton's
   *  server-fallback usage issues its close NAVIGATION here so a Suspense swap
   *  unmounting the frame mid-exit cannot lose the close (spec
   *  2026-07-19-modal-skeleton-close.md §2.1). */
  onDismissStart?: () => void;
```

(b) Destructure `onDismissStart` instead of `closeAffordancesDisabled = false` (:123).

(c) `beginDismiss` becomes:

```ts
  function beginDismiss() {
    // Idempotence: requestClose and the drag branch both guard on
    // dismissingRef before calling, but the guard HERE is what makes
    // onDismissStart one-shot by construction rather than by caller courtesy.
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    // setAttribute, NOT `.inert = true`: jsdom does not reflect the property to
    // an attribute, so a property-only assignment is untestable in the unit
    // suite (and `hasAttribute("inert")` would read false). Every target browser
    // honours the attribute form identically.
    dialogRef.current?.setAttribute("inert", "");
    onDismissStart?.();
  }
```

(d) Delete the step-0 line `if (closeAffordancesDisabled) return; // step 0` in `requestClose` (:314) and the `if (closeAffordancesDisabled) return; // no drag may start (spec §3.4)` line in `handleGrabPointerDown` (:407). In the `requestClose` doc comment (:308-312), replace the sentence citing a stale `closeAffordancesDisabled` capture with: `a memoized one would capture stale drag refs and the current onDismissStart closure`.

**Step 2a (content for Step 2): the skeleton test-file rewrite**

Replace the whole of `tests/components/admin/showpage/showReviewModalSkeleton.test.tsx` with:

```tsx
/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  DRAG_DISMISS_THRESHOLD_PX,
  DURATION_NORMAL_FALLBACK_MS,
  EXIT_FALLBACK_BUFFER_MS,
} from "@/components/admin/review/ReviewModalShell";
import { ShowReviewModalSkeleton } from "@/components/admin/showpage/ShowReviewModalSkeleton";

const TB = "published-show-review";

// useShowModalNav → useRouter/useSearchParams (unified mock, pattern:
// publishedReviewModal.test.tsx:30). The skeleton's default close must push
// the show-stripped URL with { scroll: false }.
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: routerPush }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams("show=some-show&bucket=archived"),
}));

/** Force the reduced-motion branch (tests/setup.ts stubs matchMedia with
 *  matches:false = motion enabled, so exits otherwise resolve on timers). */
function withReducedMotion(run: () => void) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  try {
    run();
  } finally {
    window.matchMedia = original;
  }
}

afterEach(() => {
  vi.useRealTimers();
  routerPush.mockClear();
  cleanup();
});

describe("server-fallback usage (no onClose): default nav-close (spec §2.1)", () => {
  it("Esc under reduced motion hides the dialog and pushes the show-stripped URL", () => {
    withReducedMotion(() => {
      render(<ShowReviewModalSkeleton />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      // bucket survives; show (+alert_id) stripped; dashboard stays put.
      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(routerPush).toHaveBeenCalledWith("/admin?bucket=archived", { scroll: false });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("scrim click under reduced motion closes the same way", () => {
    withReducedMotion(() => {
      render(<ShowReviewModalSkeleton />);
      fireEvent.click(screen.getByTestId(`${TB}-backdrop`));
      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  // R1 F3 / R2 F1 — the race window itself. Motion enabled (setup.ts default):
  // the nav must be issued at dismiss-COMMIT, not exit-end, for BOTH the
  // requestClose path (Esc) and the drag branch that bypasses it.
  it("Esc with motion enabled pushes IMMEDIATELY (dismiss-commit), hide lands at exit-end", () => {
    vi.useFakeTimers();
    render(<ShowReviewModalSkeleton />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(routerPush).toHaveBeenCalledTimes(1); // BEFORE any timer runs
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // exit in flight
    vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS + 10);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  it("drag past threshold pushes at RELEASE, before the exit transition resolves", () => {
    vi.useFakeTimers();
    render(<ShowReviewModalSkeleton />);
    const grab = screen.getByTestId(`${TB}-grab`);
    const endY = 100 + DRAG_DISMISS_THRESHOLD_PX + 30;
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: endY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: endY });
    expect(routerPush).toHaveBeenCalledTimes(1); // at release
    vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + 10);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  it("Suspense swap mid-exit cannot lose the close: push already issued, unmount is clean", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ShowReviewModalSkeleton />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(routerPush).toHaveBeenCalledTimes(1);
    unmount(); // what the fallback→content swap does, before exit-end
    vi.runAllTimers(); // late fallback timer must not double-close or throw
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  // Spec §5 (plan-R1 F3): the drag branch bypasses requestClose — its
  // dismiss-commit push must survive an unmount-mid-transition too.
  it("drag dismiss + Suspense swap mid-transition: push already issued, no double push", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ShowReviewModalSkeleton />);
    const grab = screen.getByTestId(`${TB}-grab`);
    const endY = 100 + DRAG_DISMISS_THRESHOLD_PX + 30;
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: endY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: endY });
    expect(routerPush).toHaveBeenCalledTimes(1); // at release (dismiss-commit)
    unmount(); // swap before the translateY transition resolves
    vi.runAllTimers();
    expect(routerPush).toHaveBeenCalledTimes(1);
  });
});

describe("client optimistic usage (real onClose): prop path unchanged", () => {
  it("Esc calls the passed onClose once and never touches the router", () => {
    withReducedMotion(() => {
      const onClose = vi.fn();
      render(<ShowReviewModalSkeleton onClose={onClose} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(routerPush).not.toHaveBeenCalled();
    });
  });
});

describe("real X (spec §2.2)", () => {
  it("renders the shared ModalCloseButton, focused initially, outside any aria-hidden subtree", () => {
    render(<ShowReviewModalSkeleton />);
    const x = screen.getByTestId(`${TB}-close`);
    expect(x).toHaveAttribute("aria-label", "Close");
    expect(x.closest("[aria-hidden]")).toBeNull();
    expect(x).toHaveFocus(); // useDialogFocus initialFocusRef contract
  });

  it("X click closes via the default nav-close in the server-fallback usage", () => {
    withReducedMotion(() => {
      render(<ShowReviewModalSkeleton />);
      fireEvent.click(screen.getByTestId(`${TB}-close`));
      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("skeleton owns the closed→open entrance (§6.5)", () => {
  // The loaded modal suppresses the shell entrance (in-place swap, §6.5) —
  // which is only sound because THIS frame plays it.
  it("renders WITHOUT the entrance-suppression attr in both usages", () => {
    render(<ShowReviewModalSkeleton />);
    expect(document.querySelector("[data-review-modal-entrance]")).toBeNull();
    cleanup();
    render(<ShowReviewModalSkeleton onClose={() => {}} />);
    expect(document.querySelector("[data-review-modal-entrance]")).toBeNull();
  });
});
```

- [ ] **Step 5: Implement the skeleton**

Replace `components/admin/showpage/ShowReviewModalSkeleton.tsx` body (keep the file's role; rewrite header comment per spec §2.3):

```tsx
"use client";

/**
 * components/admin/showpage/ShowReviewModalSkeleton.tsx
 * (admin-show-modal spec §4; MODAL-SKELETON-CLOSE-1 spec
 * docs/superpowers/specs/2026-07-19-modal-skeleton-close.md)
 *
 * The open, CONTENT-non-interactive review-modal frame shown while the
 * `ShowReviewModal` server loader streams: the same `ReviewModalShell` chrome
 * (`dataAttrPrefix="review-modal"`, `testIdBase="published-show-review"`) the
 * loaded `PublishedReviewModal` renders, with loading blocks mirroring the
 * per-show route's old skeleton — so the open gesture gets immediate feedback
 * and the swap to real content happens inside an identical frame.
 *
 * Close affordances are LIVE in both usages. A client component, so the
 * server (Suspense-fallback) usage — which cannot receive a function across
 * the RSC boundary — supplies its own default: the close NAV is issued at
 * dismiss-COMMIT via the shell's `onDismissStart` (so a Suspense swap
 * unmounting this frame mid-exit can never lose the close), and `onClose` at
 * exit-end is just the instant client-side hide (#485 pattern). The CLIENT
 * optimistic copy (ShowsTable) passes a real cancel and keeps its own
 * semantics (no nav). Initial focus lands on the real X — same testid and
 * position as the loaded modal's, so the §6.5 in-place swap keeps focus on
 * the X.
 */
import { useCallback, useId, useRef, useState } from "react";
import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";
import { ModalCloseButton } from "@/components/admin/review/ModalCloseButton";
import { Skeleton } from "@/components/layout/Skeleton";
import { useShowModalNav } from "@/components/admin/useShowModalNav";

export function ShowReviewModalSkeleton({ onClose }: { onClose?: () => void } = {}) {
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { close } = useShowModalNav();
  // Server-fallback default close: hide client-side at exit-end; the nav was
  // already issued at dismiss-commit (onDismissStart below). No reset path
  // needed — a reopen streams a fresh element (spec §2.1).
  const [closing, setClosing] = useState(false);
  const hide = useCallback(() => setClosing(true), []);
  const isServerFallback = onClose === undefined;

  return (
    <ReviewModalShell
      open={!closing}
      onClose={onClose ?? hide}
      // exactOptionalPropertyTypes: pass conditionally, never `?? undefined`.
      {...(isServerFallback ? { onDismissStart: close } : {})}
      labelledBy={headingId}
      dataAttrPrefix="review-modal"
      testIdBase="published-show-review"
      initialFocusRef={closeRef}
      header={
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* The dialog's accessible name while content streams (the loaded
              modal's h2 show title replaces it). */}
          <h2 id={headingId} className="sr-only">
            Loading show details…
          </h2>
          {/* Title row: aria-hidden title-bar skeleton + the REAL close button
              (a focusable control may not sit inside an aria-hidden subtree). */}
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-1 py-1.5" aria-hidden="true">
              <Skeleton className="h-6 w-56 max-w-full" />
            </div>
            <ModalCloseButton ref={closeRef} testId="published-show-review-close" />
          </div>
          {/* Strip row: publish toggle / live-sync badges / copy-link chips. */}
          <div className="flex flex-wrap items-center gap-3" aria-hidden="true">
            <Skeleton className="h-6 w-28 rounded-pill" />
            <Skeleton className="h-6 w-20 rounded-pill" />
            <Skeleton className="h-6 w-36 rounded-pill" />
          </div>
        </div>
      }
    >
      {/* Body: fills the panel column the way the surface root does
          (min-h-0 flex-1 — Tailwind v4 does not default `.flex` to stretch),
          with block shapes mirroring the old per-show loading skeleton. */}
      <div
        data-testid="published-show-review-loading"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-bg px-tile-pad py-4"
      >
        <p role="status" className="sr-only">
          Loading show…
        </p>
        <Skeleton className="h-6 w-28" />
        {/* literal index array — mirrors the route skeleton's crew rows. */}
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    </ReviewModalShell>
  );
}
```

- [ ] **Step 6: Run the affected unit suites**

Run: `pnpm vitest run tests/components/admin/showpage/showReviewModalSkeleton.test.tsx tests/components/admin/review/reviewModalShell.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/ShowsTable.test.tsx tests/components/admin/AdminPage.test.tsx tests/components/admin/transitionAudit.test.tsx`
Expected: ALL PASS (AdminPage mocks the skeleton — `AdminPage.test.tsx:135`; ShowsTable's suite mocks next/navigation already; transition audit scans the skeleton source for motion classes — none added).

- [ ] **Step 7: Commit (one task, one commit)**

```bash
git add components/admin/review/ReviewModalShell.tsx components/admin/showpage/ShowReviewModalSkeleton.tsx tests/components/admin/review/reviewModalShell.test.tsx tests/components/admin/showpage/showReviewModalSkeleton.test.tsx
git commit --no-verify -m "feat(admin): skeleton frame closes for real — shell onDismissStart + live X (MODAL-SKELETON-CLOSE-1)"
```

### Task 2: Deeplink e2e — Esc during load never wedges

**Files:**
- Modify: `tests/e2e/published-review-modal.deeplink.spec.ts` (append one test inside the existing `test.describe`)

**Interfaces:**
- Consumes: the file's existing `MODAL_ANY`, `BASE`, `show`, `signInAs` setup (`:45-58`), and the effect-flush poll discipline from `published-review-modal.interactions.spec.ts:103-120`.

- [ ] **Step 1: Write the test**

Append inside the describe block:

```ts
  // MODAL-SKELETON-CLOSE-1: Esc during a deep-link load closes the modal from
  // EITHER frame — the Suspense skeleton (navs at dismiss-commit) or the
  // loaded modal (navs at exit-end). Pre-fix, Esc landing in the fallback
  // window was silently dead and the modal stayed. Real-browser
  // wedge-regression test; the red/green proof lives in the jsdom suite
  // (spec §5). Reduced motion → the close is synchronous once dispatched.
  test("Esc during load closes whichever frame is up and strips ?show", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/admin?show=${show.slug}`);
    // ANY frame — skeleton or loaded, whichever the stream timing yields.
    await expect(page.locator(MODAL_ANY).first()).toBeVisible({ timeout: 30_000 });
    // Effect-flush proof before the synthetic gesture (memory-#485 class): both
    // frames apply initial focus to their X, and the Esc listener flushes in
    // the same effect pass. Poll BEFORE pressing — a keypress in the gap is
    // silently lost (interactions.spec.ts:103-120).
    await expect
      .poll(
        () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
        { message: "frame effect flush completed (initial focus on the X)" },
      )
      .toBe(`${BASE}-close`);
    await page.keyboard.press("Escape");
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 10_000 });
    const u = new URL(page.url());
    expect(u.searchParams.get("show")).toBeNull();
    // Overlay hygiene restored: scroll unlocked, background un-inerted.
    const hygiene = await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      inert: document.querySelector("[data-inert-root]")?.hasAttribute("inert") ?? false,
    }));
    expect(hygiene.overflow).toBe("");
    expect(hygiene.inert).toBe(false);
  });
```

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test tests/e2e/published-review-modal.deeplink.spec.ts -g "Esc during load" --project=desktop-chromium 2>&1 | tail -20`
(Env: `.env.local` is symlinked; the spec seeds its own show. If the local dev-server port is contested by a sibling worktree, use the repo's alt-port config per the sibling-dev-server discipline — check `lsof -nP -iTCP:3000 -sTCP:LISTEN` first.)
Expected: PASS post-Task-1. (Green-only by declared exception — see Global Constraints; the red/green proof is Task 1's jsdom suite.)

- [ ] **Step 3: Run the whole deeplink + interactions specs**

Run: `pnpm exec playwright test tests/e2e/published-review-modal.deeplink.spec.ts tests/e2e/published-review-modal.interactions.spec.ts --project=desktop-chromium 2>&1 | tail -8`
Expected: ALL PASS (no regression from the live skeleton affordances — the interactions spec's helpers already scope to the loaded frame).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/published-review-modal.deeplink.spec.ts
git commit --no-verify -m "test(admin): deeplink Esc-during-load wedge regression (MODAL-SKELETON-CLOSE-1)"
```

### Task 3: Spec amendments + DEFERRED archive move

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-admin-show-modal.md` (§4 :73, §5 API list :79-90, §6.5 table :~147)
- Modify: `docs/superpowers/specs/2026-07-18-modal-close-exit-anim.md` (§3.1 :64, §3.4 :151-162, matrices :180-181 + :210-211, §6.5 quote :200, test-shape :226, file table :258/:262/:265)
- Modify: `DEFERRED.md` (drop :11-19), `DEFERRED-archive.md` (new section)

**Interfaces:** none (docs only). All edit content is specified in spec §3 (`2026-07-19-modal-skeleton-close.md:73-92`) — apply each bullet literally.

- [ ] **Step 1: Apply the admin-show-modal amendments** — §4 "non-interactive" → "content-non-interactive" sentence (spec §3.1 wording verbatim); add `onDismissStart?: () => void` to the §5 shell prop contract with the one-shot dismiss-commit sentence; add the §6.5 skeleton-close row.
- [ ] **Step 2: Apply the exit-anim amendments** — delete §3.1 step 0 and renumber; add `beginDismiss` idempotence + `onDismissStart` description; rewrite §3.4 as "The skeleton closes everywhere" with the historical note; update both matrices' server-fallback rows; update the §6.5 quote trailing sentence; update test-shape item 4 and the three file-table rows.
- [ ] **Step 3: DEFERRED move** — cut the MODAL-CLOSE-EXIT-ANIM-1 resolved block (`DEFERRED.md:11-14`) and the whole MODAL-SKELETON-CLOSE-1 entry (`:16-19`) into a new `DEFERRED-archive.md` section "## Review-modal close (2026-07-19)"; mark MODAL-SKELETON-CLOSE-1 `✅ RESOLVED` with: un-defer trigger fired (this task), what shipped (onDismissStart nav at dismiss-commit + real X + prop deletion), spec/plan links, and rewrite the archived exit-anim note's "stays deferred" cross-reference to "resolved by `2026-07-19-modal-skeleton-close.md`". Update `DEFERRED.md`'s "Last reconciled" line.
- [ ] **Step 4: Verify** — `grep -rn "closeAffordancesDisabled" docs/superpowers/specs/2026-07-18-admin-show-modal.md docs/superpowers/specs/2026-07-18-modal-close-exit-anim.md DEFERRED.md` returns only the exit-anim §3.4 historical-note mention (the 2026-07-19 spec/plan keep their intentional mentions and are out of this grep's scope); `grep -n "MODAL-SKELETON-CLOSE-1" DEFERRED.md` returns nothing.
- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-18-admin-show-modal.md docs/superpowers/specs/2026-07-18-modal-close-exit-anim.md DEFERRED.md DEFERRED-archive.md
git commit --no-verify -m "docs: ratify MODAL-SKELETON-CLOSE-1 amendments; archive resolved modal deferrals"
```

### Task 4: Full local gates

- [ ] **Step 1:** `pnpm test 2>&1 | tail -5` — full unit suite green (scoped gates miss regressions).
- [ ] **Step 2:** `pnpm typecheck 2>&1 | tail -5` — vitest strips types; typecheck is separate.
- [ ] **Step 3:** `pnpm lint 2>&1 | tail -5` — canonical Tailwind class order.
- [ ] **Step 4:** `pnpm format:check 2>&1 | tail -5` — `--no-verify` commits skipped prettier.
- [ ] **Step 5:** `pnpm build 2>&1 | tail -5` — RSC boundary violations surface only at build.
- [ ] **Step 6:** Fix anything red (each fix: failing check → fix → re-run), then `git add -A && git commit --no-verify -m "chore: gate fixes"` only if fixes were needed.

Close-out (impeccable dual-gate on the UI diff, Codex whole-diff review, push, PR, CI, merge) is owned by the ship pipeline's Stages 3–4, not this plan.
