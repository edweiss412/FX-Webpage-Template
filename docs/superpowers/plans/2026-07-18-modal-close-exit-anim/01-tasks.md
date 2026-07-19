# Tasks — Review-modal close exit animation

Read `00-overview.md` first: Global Constraints and the Anti-tautology rules apply to every task below.

Run everything from `/Users/ericweiss/FX-worktrees/modal-close-exit-anim`.

---

## Task 1: `ModalCloseButton` + close context

**Files:**

- Create: `components/admin/review/ModalCloseButton.tsx`
- Create: `tests/components/admin/review/modalCloseButton.test.tsx`
- Modify: `components/admin/review/ReviewModalShell.tsx` (context + provider wrap)
- Modify: `components/admin/showpage/PublishedReviewModal.tsx:276-285`
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:436-445`

**Interfaces:**

- Produces: `ReviewModalCloseContext` (React context, default `() => {}`), `useReviewModalClose(): () => void`, `ModalCloseButton` (`forwardRef<HTMLButtonElement, {testId: string}>`). Tasks 2–5 consume the context value; Task 6 asserts the default no-op.

**Why the X cannot just call `requestClose` directly:** the X lives in each consumer's `header` slot, which the consumer passes as a prop. The shell renders that slot *inside* its provider, so a context read from the slot's JSX resolves — but a `useReviewModalClose()` call in the consumer's function body would not (see Task 5).

- [ ] **Step 1: Write the failing test**

`tests/components/admin/review/modalCloseButton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ModalCloseButton } from "@/components/admin/review/ModalCloseButton";
import { ReviewModalCloseContext } from "@/components/admin/review/ReviewModalShell";

describe("ModalCloseButton", () => {
  // Failure mode: the button renders but is wired to the wrong close path,
  // so the X snaps shut while every other affordance animates.
  it("calls the context's requestClose on click", async () => {
    const requestClose = vi.fn();
    render(
      <ReviewModalCloseContext.Provider value={requestClose}>
        <ModalCloseButton testId="x-close" />
      </ReviewModalCloseContext.Provider>,
    );
    await userEvent.click(screen.getByTestId("x-close"));
    expect(requestClose).toHaveBeenCalledTimes(1);
  });

  // Failure mode: initial focus breaks because the ref stops reaching the
  // consumer's `closeRef` (both consumers pass it as `initialFocusRef`).
  it("forwards its ref to the underlying button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<ModalCloseButton ref={ref} testId="x-close" />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.getAttribute("aria-label")).toBe("Close");
  });

  // Failure mode: a future refactor drops the provider wrap; without this the
  // button would throw instead of degrading, masking the real bug.
  it("no-ops outside a provider", async () => {
    render(<ModalCloseButton testId="x-close" />);
    await expect(userEvent.click(screen.getByTestId("x-close"))).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/review/modalCloseButton.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/admin/review/ModalCloseButton"`.

- [ ] **Step 3: Create the component**

`components/admin/review/ModalCloseButton.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { forwardRef } from "react";
import { useReviewModalClose } from "./ReviewModalShell";

/** Shared modal X. Lives in each consumer's `header` slot, which the shell
 *  renders INSIDE its close provider — so the context resolves here even
 *  though a hook call in the consumer's own body would not (spec §3.1a). */
export const ModalCloseButton = forwardRef<HTMLButtonElement, { testId: string }>(
  function ModalCloseButton({ testId }, ref) {
    const requestClose = useReviewModalClose();
    return (
      <button
        ref={ref}
        type="button"
        data-testid={testId}
        aria-label="Close"
        onClick={requestClose}
        className="-mr-1 inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
    );
  },
);
```

The `className` is lifted verbatim from the two existing buttons — verified byte-identical in the pre-draft pass. Do not "tidy" it; any change is a visual diff the impeccable gate will flag.

- [ ] **Step 4: Add the context to the shell**

In `components/admin/review/ReviewModalShell.tsx`, near the top-level exports:

```tsx
import { createContext, useContext } from "react";

/** Close entry point for consumer-owned header slots (spec §3.3). Default is a
 *  no-op so the button degrades rather than throwing outside a provider. */
export const ReviewModalCloseContext = createContext<() => void>(() => {});
export function useReviewModalClose(): () => void {
  return useContext(ReviewModalCloseContext);
}
```

Wrap the shell's returned tree in `<ReviewModalCloseContext.Provider value={requestClose}>`. Until Task 2 lands, pass `onClose` as the value — this task is a pure lift with no behavior change.

- [ ] **Step 5: Swap both consumers**

`PublishedReviewModal.tsx` — replace the `<button>` at `:276-285` with:

```tsx
<ModalCloseButton ref={closeRef} testId={`${TESTID_BASE}-close`} />
```

`Step3ReviewModal.tsx` — replace the `<button>` at `:436-445` with:

```tsx
<ModalCloseButton ref={closeRef} testId={`wizard-step3-card-${dfid}-review-close`} />
```

Add the import to both: `import { ModalCloseButton } from "@/components/admin/review/ModalCloseButton";`. Remove the now-unused `X` import from each consumer **only if** no other usage remains — grep first.

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm vitest run tests/components/admin/review/modalCloseButton.test.tsx \
  tests/components/admin/review/reviewModalShell.test.tsx \
  tests/components/admin/showpage/pageTransitions.test.tsx
```

Expected: PASS. The twin-scan stays at `toBe(3)` (entrance untouched) and the `pageTransitions` count for `PublishedReviewModal.tsx` stays `1` (no JSX conditional added).

- [ ] **Step 7: Commit**

```bash
git add components/admin/review/ModalCloseButton.tsx \
  components/admin/review/ReviewModalShell.tsx \
  components/admin/showpage/PublishedReviewModal.tsx \
  components/admin/wizard/Step3ReviewModal.tsx \
  tests/components/admin/review/modalCloseButton.test.tsx
git commit --no-verify -m "feat(admin): shared ModalCloseButton via review-modal close context"
```

---

## Task 2: `requestClose` guards + shared `beginDismiss`

**Files:**

- Modify: `components/admin/review/ReviewModalShell.tsx`
- Modify: `tests/components/admin/review/reviewModalShell.test.tsx`

**Interfaces:**

- Consumes: `ReviewModalCloseContext` (Task 1).
- Produces: `requestClose(): void`, `beginDismiss(): void` (module-internal). Task 3 adds the animation to `requestClose` step 5; Task 5 exposes it via `closeApiRef`.

This task ships the guards WITHOUT the animation — in jsdom `matchMedia` is absent, so `requestClose` takes the immediate path (spec §3.1 step 4) and behavior is byte-identical to today. That keeps the unit suite meaningful before Task 3.

**Deferred to Task 3 on purpose:** the `settleTimerRef` cancellation and the `clearPanelDragStyles` chokepoint guard. Both protect the exit's *start state*, which is Task 3's subject — and if this task cancelled the settle timer, Task 3's spring-back test could never go red (the pending settle it needs to fire would already be gone). Keeping them together makes Task 3's red step genuine rather than decorative.

- [ ] **Step 1: Write the failing test**

Append to `tests/components/admin/review/reviewModalShell.test.tsx`. **Check the file's existing imports first** — it does not currently import `userEvent`; add `import userEvent from "@testing-library/user-event";` (and `fireEvent` from `@testing-library/react`, needed in Task 3) if absent, or the red step fails to compile for a reason unrelated to the behavior under test.

```tsx
describe("requestClose guards (spec §3.1)", () => {
  // Failure mode: two fast affordances (double-Esc, Esc-then-scrim) each fire
  // onClose, producing a duplicate close — on Published, a duplicate router.push.
  it("fires onClose exactly once for repeated affordances", async () => {
    const onClose = vi.fn();
    renderShell({ onClose });
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("test-modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Failure mode: the exit window (Task 3) leaves footer buttons live, so a
  // fast click fires a mutation against an already-dismissed modal.
  it("inerts the dialog subtree at dismiss-commit", async () => {
    renderShell({ onClose: vi.fn() });
    const dialog = screen.getByRole("dialog");
    expect(dialog.hasAttribute("inert")).toBe(false);
    await userEvent.keyboard("{Escape}");
    expect(dialog.hasAttribute("inert")).toBe(true);
  });
});
```

If `renderShell` does not already exist in that file, define it alongside the existing tests using the same props the current suite uses — do not invent a new harness shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx -t "requestClose guards"`
Expected: FAIL — `onClose` called 3 times; `inert` absent.

- [ ] **Step 3: Implement the guards**

In `ReviewModalShell.tsx`, add a `dialogRef` on the `role="dialog"` element (`:377`), then:

```tsx
/** Commit the dismiss: no second exit may start, and the subtree stops taking
 *  input for the 120–220ms the exit now lasts (spec §3.1 step 3). Shared with
 *  the drag-past-threshold branch so every affordance inerts identically. */
function beginDismiss() {
  dismissingRef.current = true;
  // setAttribute, NOT `.inert = true`: jsdom does not reflect the property to
  // an attribute, so a property-only assignment is untestable in the unit
  // suite (and `hasAttribute("inert")` would read false). Every target browser
  // honours the attribute form identically.
  dialogRef.current?.setAttribute("inert", "");
}

function requestClose() {
  if (closeAffordancesDisabled) return; // step 0 — Task 4 wires the prop
  if (dismissingRef.current) return; // step 1 — one exit, one close
  // step 2: cancel an active drag so its pointerup cannot spring back over the
  // exiting panel. Do NOT clear the inline transform — it is the exit's start
  // state (spec §3.2).
  const drag = dragRef.current;
  if (drag !== null) {
    dragRef.current = null;
    const grab = grabRef.current;
    if (grab && typeof grab.releasePointerCapture === "function") {
      try {
        grab.releasePointerCapture(drag.pointerId);
      } catch {
        /* capture already released */
      }
    }
  }
  beginDismiss();
  // step 4: reduced motion / no panel / jsdom → immediate, byte-identical to today.
  onClose();
  // Task 3 replaces this line with the animated path.
}
```

Add `const grabRef = useRef<HTMLButtonElement | null>(null);` and put `ref={grabRef}` on the grab button (`:410`). Point the scrim (`:393`), Esc (`:180`), and grab `onClick` (`:414-416`) at `requestClose`. In the drag-past-threshold branch (`:281`), replace the bare `dismissingRef.current = true` with `beginDismiss()`. Add `if (dismissingRef.current) return;` at the top of `handleGrabPointerEnd`.

Declare `closeAffordancesDisabled = false` as a temporary local until Task 4 makes it a prop — do NOT leave a placeholder comment in shipped code.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx`
Expected: PASS, including every pre-existing test — this task must not change jsdom behavior.

- [ ] **Step 5: Commit**

```bash
git add components/admin/review/ReviewModalShell.tsx tests/components/admin/review/reviewModalShell.test.tsx
git commit --no-verify -m "feat(admin): requestClose guards + shared beginDismiss inert"
```

---

## Task 3: Start-state normalization + mode-aware exit + scrim fade

**Files:**

- Modify: `components/admin/review/ReviewModalShell.tsx`
- Modify: `tests/components/admin/review/reviewModalShell.test.tsx`

**Interfaces:**

- Consumes: `requestClose`, `beginDismiss` (Task 2).
- Produces: the animated exit. Task 7's real-browser matrix asserts its progression.

This is the task the spec's S1–S4 inventory exists for. The normalization order is not stylistic — getting it wrong produces a silent instant jump that still closes (R1/R2 findings).

- [ ] **Step 1: Write the failing test**

The animation itself needs a real browser (jsdom computes no layout and has no `matchMedia`), so the *unit* test pins the chokepoint guard and the settle neutralization — the parts that are observable in jsdom.

**This test must actually enter the S4 spring-back state.** Manually assigning `panel.style.transform` and pressing Esc does NOT: on today's code Esc just calls a spy `onClose`, the component stays mounted, and nothing clears the manual transform — so such a test passes BEFORE the implementation and proves nothing about `settle()` neutralization. Drive a real sub-threshold drag and fire the pending settle with fake timers instead:

```tsx
import { DRAG_SLOP_PX, DURATION_FAST_FALLBACK_MS } from "@/components/admin/review/ReviewModalShell";

describe("exit start-state (spec §3.2)", () => {
  // Failure mode: a pending spring-back's settle() fires DURING the exit and
  // calls clearPanelDragStyles(), blanking transform/transition/animation and
  // wiping the animation mid-flight. settle()'s only guard is
  // `dragRef.current === null` — which is TRUE during an exit, so it fires.
  it("a pending settle cannot blank the exit styles", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    try {
      renderShell({ onClose: vi.fn() });
      const grab = screen.getByTestId("test-modal-grab");
      const panel = screen.getByTestId("test-modal-panel");

      // Sub-threshold drag: past slop (so `wasDrag`), under the dismiss
      // threshold (so release takes the spring-back branch, arming settleTimer).
      fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
      fireEvent.pointerMove(grab, { pointerId: 1, clientY: 100 + DRAG_SLOP_PX + 10 });
      fireEvent.pointerUp(grab, { pointerId: 1, clientY: 100 + DRAG_SLOP_PX + 10 });
      expect(panel.style.transform).not.toBe(""); // spring-back is animating

      // Close INSIDE the settle window, then let the pending settle fire.
      await user.keyboard("{Escape}");
      vi.advanceTimersByTime(DURATION_FAST_FALLBACK_MS + 20);

      // The exit committed; nothing may hand the panel back to stylesheet control.
      expect(panel.style.transform).not.toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});
```

Import `fireEvent` from `@testing-library/react` if the file does not already. Confirm `test-modal-grab` / `test-modal-panel` match the `testIdBase` the existing suite renders with — use the suite's actual base, not these literals.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx -t "exit start-state"`
Expected: FAIL — the pending settle fires (Task 2 deliberately left `settleTimerRef` uncancelled), `settle()` calls `clearPanelDragStyles()`, whose only guard is `dragRef.current === null` — true during an exit — so it blanks the panel and `panel.style.transform` reads `""`. If this test passes here, STOP: the task split has drifted and the guard is being written against a test that cannot see it.

- [ ] **Step 3: Implement normalization + exit**

Two things move here from Task 2's `requestClose`, both part of the start-state contract.

First, cancel the pending settle inside `requestClose`'s step 2 (after the drag-cancel block):

```tsx
if (settleTimerRef.current !== null) {
  clearTimeout(settleTimerRef.current);
  settleTimerRef.current = null;
}
```

Then guard the chokepoint:

```tsx
function clearPanelDragStyles() {
  // Never hand the panel back to stylesheet control while an exit is in flight
  // — a pending settle() would otherwise blank the exit styles (spec §3.2).
  if (dismissingRef.current) return;
  const panel = panelRef.current;
  if (!panel) return;
  panel.style.transform = "";
  panel.style.transition = "";
  panel.style.animation = "";
}
```

Then replace `requestClose`'s step-4/5 tail:

```tsx
  const panel = panelRef.current;
  const reduced =
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (panel === null || reduced) {
    onClose(); // step 4 — byte-identical to today
    return;
  }

  // step 5 — snapshot FIRST, before neutralizing anything: an interrupted
  // entrance must continue from where it reached, not snap to resting style.
  const computed = window.getComputedStyle(panel);
  const startTransform = computed.transform === "none" ? "" : computed.transform;
  const startOpacity = computed.opacity;

  const isSheet = !window.matchMedia("(min-width: 640px)").matches;
  const durationVar = isSheet ? "--duration-normal" : "--duration-fast";
  const fallbackMs = isSheet ? DURATION_NORMAL_FALLBACK_MS : DURATION_FAST_FALLBACK_MS;

  panel.style.animation = "none";
  panel.style.transition = "none";
  if (startTransform) panel.style.transform = startTransform;
  panel.style.opacity = startOpacity;
  void panel.offsetHeight; // force a style flush so start and end resolve separately
  panel.style.transition = `transform var(${durationVar}) var(--ease-out-quart), opacity var(${durationVar}) var(--ease-out-quart)`;
  if (isSheet) {
    panel.style.transform = "translateY(100%)";
  } else {
    panel.style.opacity = "0";
    panel.style.transform = "translateY(8px) scale(0.98)";
  }

  const scrim = scrimRef.current;
  if (scrim) {
    scrim.style.animation = "none";
    scrim.style.transition = `opacity var(${durationVar}) ease-out`;
    scrim.style.opacity = "0";
  }

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    panel.removeEventListener("transitionend", onTransitionEnd);
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    onClose();
  };
  const onTransitionEnd = (ev: TransitionEvent) => {
    if (ev.target === panel && ev.propertyName === "transform") finish();
  };
  panel.addEventListener("transitionend", onTransitionEnd);
  dismissTimerRef.current = setTimeout(finish, fallbackMs);
```

Add `const scrimRef = useRef<HTMLButtonElement | null>(null);` and `ref={scrimRef}` on the scrim (`:387`). The `transitionend` predicate keys on `transform` in BOTH modes — desktop animates transform as well as opacity precisely so this one predicate works (spec §3.2).

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx
pnpm typecheck
```

Expected: PASS. jsdom still takes the immediate path (no `matchMedia`), so pre-existing assertions are unaffected.

- [ ] **Step 5: Commit**

```bash
git add components/admin/review/ReviewModalShell.tsx tests/components/admin/review/reviewModalShell.test.tsx
git commit --no-verify -m "feat(admin): mode-aware modal exit animation with snapshot-first normalization"
```

---

## Task 4: `closeAffordancesDisabled` + skeleton dual-usage

**Files:**

- Modify: `components/admin/review/ReviewModalShell.tsx`
- Modify: `components/admin/showpage/ShowReviewModalSkeleton.tsx:39`
- Create: `tests/components/admin/showpage/showReviewModalSkeleton.test.tsx`

**Interfaces:**

- Consumes: `requestClose` (Task 2), the exit (Task 3).
- Produces: `closeAffordancesDisabled?: boolean` prop on `ReviewModalShell`.

`ShowReviewModalSkeleton` has two usages: the server Suspense fallback (no `onClose` → no-op) and #485's client optimistic copy in `ShowsTable` (real cancel). Deriving the gate from that existing branch means the two cannot drift.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DRAG_DISMISS_THRESHOLD_PX } from "@/components/admin/review/ReviewModalShell";
import { ShowReviewModalSkeleton } from "@/components/admin/showpage/ShowReviewModalSkeleton";

describe("ShowReviewModalSkeleton dual usage (spec §3.4)", () => {
  // Failure mode: the shell-wide requestClose rewiring animates the LOADING
  // frame off-screen into an inert, scroll-locked state with no close. A test
  // asserting only "no X button" passes while exactly that ships.
  // All FOUR affordances, per spec §7.5 item 4 — not just Esc and scrim. The
  // drag branch bypasses requestClose entirely, so a gate that covers
  // requestClose step 0 but forgets handleGrabPointerDown / beginDismiss would
  // still animate the loading frame away while a two-affordance test passes.
  it("server-fallback usage: every affordance is inert", async () => {
    render(<ShowReviewModalSkeleton />);
    const dialog = screen.getByRole("dialog");
    const panel = screen.getByTestId("show-review-modal-panel");
    const grab = screen.getByTestId("show-review-modal-grab");

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("show-review-modal-backdrop"));
    await userEvent.click(grab); // grab TAP

    // Grab DRAG past the dismiss threshold — the branch that bypasses requestClose.
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: 100 + DRAG_DISMISS_THRESHOLD_PX + 20 });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: 100 + DRAG_DISMISS_THRESHOLD_PX + 20 });

    expect(dialog.hasAttribute("inert")).toBe(false);
    expect(panel.style.transform).toBe("");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // Failure mode: the gate is derived too broadly and the client optimistic
  // copy loses its cancel, stranding the user on a skeleton.
  it("client optimistic usage: affordances dismiss", async () => {
    const onClose = vi.fn();
    render(<ShowReviewModalSkeleton onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

Confirm the `data-testid` values against the live component before running — use whatever `testIdBase` the skeleton passes, not the names above if they differ.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/showpage/showReviewModalSkeleton.test.tsx`
Expected: FAIL — the server-fallback case inerts and animates.

- [ ] **Step 3: Implement**

Add the prop to the shell's signature (`closeAffordancesDisabled = false`), replacing the Task 2 local. Gate three places: `requestClose` step 0 (already written), `handleGrabPointerDown` (early return — no drag may start), and `beginDismiss` (the drag branch bypasses `requestClose` entirely, so it needs its own gate).

In `ShowReviewModalSkeleton.tsx`, alongside the existing `onClose ?? (() => {})` at `:39`:

```tsx
closeAffordancesDisabled={onClose === undefined}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/showpage/showReviewModalSkeleton.test.tsx tests/components/admin/review/reviewModalShell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/review/ReviewModalShell.tsx \
  components/admin/showpage/ShowReviewModalSkeleton.tsx \
  tests/components/admin/showpage/showReviewModalSkeleton.test.tsx
git commit --no-verify -m "feat(admin): gate skeleton close affordances by usage"
```

---

## Task 5: `closeApiRef` + Step3 success closes

**Files:**

- Modify: `components/admin/review/ReviewModalShell.tsx`
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:236,245,299`
- Modify: `tests/components/admin/review/reviewModalShell.test.tsx`

**Interfaces:**

- Produces: `closeApiRef?: RefObject<(() => void) | null>` on `ReviewModalShell`.

Step3's success handlers are consumer-owned closures **above** the provider — `useReviewModalClose()` there returns the default no-op and the modal would never close after a publish. The ref is the only mechanism that reaches them (spec §3.1a).

- [ ] **Step 1: Write the failing test**

```tsx
describe("closeApiRef (spec §3.1a)", () => {
  // Failure mode is SILENT: if the ref is unpopulated when an action resolves,
  // the close does nothing and the modal hangs open after a successful publish.
  it("is populated before any interaction and runs the full requestClose path", async () => {
    const onClose = vi.fn();
    const ref = createRef<(() => void) | null>();
    renderShell({ onClose, closeApiRef: ref });
    expect(typeof ref.current).toBe("function");
    ref.current?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog").hasAttribute("inert")).toBe(true);
  });

  // Failure mode: a late resolution after unmount calls a stale close.
  it("is cleared on unmount", () => {
    const ref = createRef<(() => void) | null>();
    const { unmount } = renderShell({ onClose: vi.fn(), closeApiRef: ref });
    unmount();
    expect(ref.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx -t "closeApiRef"`
Expected: FAIL — `ref.current` is `null`.

- [ ] **Step 3: Implement**

In the shell, after `requestClose` is defined:

```tsx
// Populated pre-paint so it is ready before any user-triggered action, and
// cleared on unmount so a late resolution closes nothing (spec §3.1a).
useLayoutEffect(() => {
  if (!closeApiRef) return;
  closeApiRef.current = requestClose;
  return () => {
    closeApiRef.current = null;
  };
});
```

No dependency array: `requestClose` is redefined each render and the ref must always hold the current closure.

In `Step3ReviewModal.tsx`, add `const closeApiRef = useRef<(() => void) | null>(null);`, pass `closeApiRef={closeApiRef}` to the shell, and at `:236`, `:245`, `:299` replace `onClose();` with:

```tsx
closeApiRef.current?.();
```

**No `?? onClose` fallback.** The ref is null only after unmount — i.e. a close already happened — so a fallback would fire a second close (spec §3.1a, Codex R5).

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add components/admin/review/ReviewModalShell.tsx \
  components/admin/wizard/Step3ReviewModal.tsx \
  tests/components/admin/review/reviewModalShell.test.tsx
git commit --no-verify -m "feat(admin): route Step3 success closes through closeApiRef"
```

---

## Task 6: Structural guards (spec §7.6)

**Files:**

- Modify: `tests/components/admin/review/reviewModalShell.test.tsx`

Three source-scanning guards. Each must **fail by default** — a new file, state, or call site that violates the contract breaks CI rather than inheriting broken behavior.

- [ ] **Step 1: Write the guards**

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SHELL_SRC = readFileSync(join(process.cwd(), "components/admin/review/ReviewModalShell.tsx"), "utf8");
const CONSUMERS = [
  "components/admin/showpage/PublishedReviewModal.tsx",
  "components/admin/wizard/Step3ReviewModal.tsx",
];

/** Brace-match a function body. A `slice(indexOf(decl))` + `indexOf("\n}")`
 *  scan does NOT work here: these are indented nested functions, so the closing
 *  brace is "\n  }" and the search returns -1 — leaving `body` as the rest of
 *  the FILE, which lets a required token be satisfied from unrelated code while
 *  the function under test is missing its guard entirely. */
function bodyOf(src: string, decl: string): string {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error(`${decl} not found in shell`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces scanning ${decl}`);
}

describe("structural guards (spec §7.6)", () => {
  // Failure mode: a new close site calls onClose() directly, creating a second
  // un-animated path that races the exit. Behavioral tests cannot cover a
  // FUTURE call site — only a static scan can.
  it("no consumer invokes the shell's onClose prop directly", () => {
    for (const path of CONSUMERS) {
      const src = readFileSync(join(process.cwd(), path), "utf8");
      // Literal call sites...
      const direct = src.match(/\bonClose\(\)/g) ?? [];
      expect(direct, `${path} must route every close through requestClose/closeApiRef`).toHaveLength(0);
      // ...and aliases/wrappers, which a lexical `onClose()` scan misses
      // entirely (`const close = onClose; close();` violates the contract while
      // reading clean). Passing onClose to the shell as a prop is the ONE
      // legitimate use, so allow only that shape.
      const aliased =
        [...src.matchAll(/(?:const|let)\s+\w+\s*=\s*onClose\b/g)].map((m) => m[0]);
      expect(aliased, `${path} aliases onClose; route the alias through requestClose`).toHaveLength(0);
      const referenced = [...src.matchAll(/\bonClose\b/g)].length;
      const asProp = [...src.matchAll(/onClose=\{onClose\}/g)].length;
      const inSignature = [...src.matchAll(/onClose[?]?\s*:/g)].length;
      const destructured = [...src.matchAll(/\bonClose,|\{\s*onClose\s*\}/g)].length;
      expect(
        referenced - asProp - inSignature - destructured,
        `${path} references onClose outside its signature and the shell prop — check for a wrapper close path`,
      ).toBeLessThanOrEqual(0);
    }
  });

  // Failure mode: a new motion state is added without a normalization row, so
  // exits from it silently jump instead of animating.
  //
  // DISCOVERS candidates rather than checking a hard-coded list — a positive
  // list passes for any source it does not name (a future `bounceTimerRef`),
  // which is the opposite of fail-by-default. Every discovered ref must be
  // either mapped to an inventory row or explicitly exempted here with a
  // reason, so adding one to the shell breaks CI until it is classified.
  it("every motion-state source is mapped to an inventory row or exempted", () => {
    const spec = readFileSync(
      join(process.cwd(), "docs/superpowers/specs/2026-07-18-modal-close-exit-anim.md"),
      "utf8",
    );
    // Refs the shell declares. Motion-state sources are the ones that drive or
    // schedule panel motion; the rest are exempt with a stated reason.
    const declared = [...SHELL_SRC.matchAll(/const (\w+Ref)\s*=\s*useRef/g)].map((m) => m[1]);
    const ROWS: Record<string, string> = {
      dragRef: "| S3 |",
      settleTimerRef: "| S4 |",
      dismissTimerRef: "| S5 |",
      dismissingRef: "| S5 |",
    };
    const EXEMPT: Record<string, string> = {
      panelRef: "the element itself, not a motion state",
      scrimRef: "cosmetic fade; does not gate exit-end (spec §3.2)",
      dialogRef: "inert target, not a motion state",
      grabRef: "pointer-capture target, not a motion state",
      dragConsumedClickRef: "click-swallow latch, no panel motion",
      closeApiRef: "close entry point, not a motion state",
    };
    for (const ref of declared) {
      const row = ROWS[ref];
      if (row) {
        expect(spec, `${ref} needs its ${row} row in the §3.2 motion-state inventory`).toContain(row);
        continue;
      }
      expect(
        EXEMPT[ref],
        `${ref} is a new shell ref: add an inventory row (§3.2) or an EXEMPT entry with a reason`,
      ).toBeTruthy();
    }
    // The entrance is a motion state with no ref — pin it separately (S2).
    expect(SHELL_SRC).toContain("style.animation");
    expect(spec, "entrance needs its | S2 | row in the §3.2 inventory").toContain("| S2 |");
  });

  // Failure mode: clearPanelDragStyles loses its guard and a pending settle
  // blanks the exit styles mid-animation.
  it("clearPanelDragStyles early-returns while dismissing", () => {
    // Same brace-matching rationale as above — a slice-to-"\n}" scan reads the
    // rest of the file and would pass on a guard living in some other function.
    expect(bodyOf(SHELL_SRC, "function clearPanelDragStyles")).toContain(
      "if (dismissingRef.current) return;",
    );
  });

  // Failure mode: an affordance is silently reverted to a bare onClose during a
  // later refactor, so four affordances animate and one snaps — the exact
  // asymmetry this feature exists to remove.
  it("all four non-drag affordances resolve to requestClose", () => {
    // scrim onClick, Esc keydown, grab onClick, and the context value the X reads
    expect(SHELL_SRC).toContain("onClick={requestClose}"); // scrim
    expect(SHELL_SRC).toMatch(/Escape[\s\S]{0,200}requestClose\(\)/); // Esc
    expect(SHELL_SRC).toMatch(/dragConsumedClickRef[\s\S]{0,120}requestClose\(\)/); // grab tap
    expect(SHELL_SRC).toContain("<ReviewModalCloseContext.Provider value={requestClose}>"); // X
  });

  // Failure mode: a guard is dropped and the failure is invisible until a user
  // hits the compound case in production.
  it("every §3.1 guard is present", () => {
    const body = bodyOf(SHELL_SRC, "function requestClose");
    expect(body).toContain("closeAffordancesDisabled"); // step 0
    expect(body).toContain("dismissingRef.current) return"); // step 1
    expect(body).toContain("dragRef.current"); // step 2
    expect(body).toContain("settleTimerRef"); // step 2 settle neutralization
    expect(body).toContain("prefers-reduced-motion"); // step 4
    expect(SHELL_SRC).toMatch(/handleGrabPointerEnd[\s\S]{0,160}dismissingRef\.current\) return/);
  });
});
```

Verify the `onClose()` regex against the real files before trusting it — if either consumer legitimately defines its own local `onClose` handler, narrow the scan to call sites rather than declarations, and say so in a comment.

- [ ] **Step 2: Run to verify they pass (guards, not TDD-red)**

Run: `pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx -t "structural guards"`
Expected: PASS — Tasks 1–5 already satisfy them.

- [ ] **Step 3: Verify each guard actually fails on a synthetic violation**

A guard that never fires is worse than no guard. For each: temporarily break the contract (add a bare `onClose()` to a consumer; delete the `dismissingRef` early-return), confirm RED, then revert. Do not commit any of these edits.

- [ ] **Step 4: Commit**

```bash
git add tests/components/admin/review/reviewModalShell.test.tsx
git commit --no-verify -m "test(admin): structural guards for close path, motion states, chokepoint"
```

---

## Task 7: Real-browser matrix (a)–(h)

**Files:**

- Modify: `tests/e2e/published-review-modal.interactions.spec.ts:23`, `:254-292`
- Modify: `tests/e2e/step3-review-modal.interactions.spec.ts`
- Modify: `tests/e2e/_step3ReviewModalLiveEntry.tsx` — **required for (g)/(h)**, see below
- Reference (no edit expected): `tests/e2e/_step3ReviewModalHarness.tsx` — `modalElement()` (`:172`) already accepts handler injection; `harnessResolution()` (`:201`) already builds the resolution variant

**Harness prerequisites — (g)/(h) cannot be written without these.** The live entry currently hardcodes `onRequestSetChecked: async () => true` (`_step3ReviewModalLiveEntry.tsx:65`) and passes no `resolution` prop, so there is no way to time a resolution relative to the exit window. Add, gated behind a query param so existing tests are untouched:

- **Deferred, test-controlled promises** for `onRequestSetChecked` and the resolution handlers (`onApplyResolve`, the ignore path) — resolve them from the spec via an exposed `window.__resolveAction(name)` rather than a timer, so "inside the exit window" vs "after exit-end" is deterministic rather than racing a `waitForTimeout`.
- **The resolution variant mounted** via the existing `harnessResolution()` when the param requests it.
- **Counters AND a timestamp:** `window.__closeCount` (increment per `onClose`), `window.__actionCount`, and `window.__closeAt = performance.now()` set in `onClose` — the finish-source assertion needs ordering, which a count cannot express. The existing `window.__modalClosed` boolean (`:17-20`) cannot distinguish one close from two — and "exactly once" is the whole assertion in (g)/(h).

**Config:** the Step3 spec runs under `tests/e2e/standalone.config.ts` (`:17`); the published spec runs under the app Playwright config. Run them separately — do not assume one invocation covers both.

**MOTION-POSTURE CONSTRAINT (verified — read before writing any case).** Both e2e specs default to `prefers-reduced-motion: reduce`, and `app/globals.css:411-413` zeroes `--duration-fast` / `--duration-normal` / `--duration-slow` to `0ms` under it:

- `step3-review-modal.interactions.spec.ts:194` — `openLive()` hardcodes `emulateMedia({ reducedMotion: "reduce" })`.
- `published-review-modal.interactions.spec.ts:98` — `openModal()` defaults to `"reduce"`, with an opt-in `{ reducedMotion: "no-preference" }` (used at `:452`, `:462`).

Under reduced motion `requestClose` takes the **immediate** path (spec §3.1 step 4): there is no exit window, no exit transform, and no `transitionend`. Every animation case would therefore pass **vacuously** — (b)'s suppression matrix would find no action to suppress because the window it guards does not exist, and (g)/(h)'s "inside vs after the exit window" timing would be meaningless.

Required posture per case:

| Case | Posture |
|---|---|
| (a) exit-animation flip | `no-preference` for the animated assertions; a **separate** `reduce` run asserting the instant collapse (spec §7.5(a) requires both) |
| (b) five-affordance suppression | `no-preference` — the exit window must exist |
| (c) focus continuity | `no-preference` — the point is focus lands at exit-*end* |
| (d)(e)(f)(g)(h) | `no-preference` |

For the Step3 spec, follow the existing motion-enabled pattern rather than editing `openLive`: a dedicated `test.describe` with its own `openLiveWithMotion()` helper already exists at `:806-808` for exactly this reason. Do NOT flip `openLive`'s default — the other Step3 tests depend on reduced motion for determinism (documented in that spec's header note at `:35-38`).

**Assert the window exists before asserting anything about it:** each `no-preference` case first confirms a non-identity computed transform (or a non-`0s` computed `transition-duration`) on the panel after dismissal. If that check fails the run is silently reduced-motion, and every downstream assertion in the case is vacuous.

**VIEWPORT CONSTRAINT (verified):** the grab strip is `sm:hidden` (`ReviewModalShell.tsx:423`). Grab-tap and drag runs REQUIRE `SHEET` (`{width:390,height:844}`); X/Esc/scrim run at both `SHEET` and `POPUP` (`{width:1280,height:800}`). A desktop-only matrix silently skips two of the five affordances while appearing green. Reuse the existing `SHEET`/`POPUP` consts (`published-review-modal.interactions.spec.ts:64-65`) — do not invent viewports.

- [ ] **Step 1: Flip the instant-unmount assertions**

At `:23` (header doc comment) and `:254-292`, replace "open→closed is an instant unmount" with the exit-animated contract. **#485's URL-strip polling stays exactly as-is** — it asserts the URL catches up after the push, which this change does not affect. The `7555c0316` focus-continuity pin also stays green: focus lands on the trigger at exit-end.

- [ ] **Step 2: Write (a)–(h)**

Per spec §7.5. A shared helper keeps the progression assertions honest:

```ts
/** Sample the panel's computed transform across the exit. Endpoint-only
 *  assertions ("eventually closed", "never snapped back") are BOTH satisfied
 *  by an instant jump — the exact regression this catches (spec §7.5(d)). */
async function sampleExit(page: Page, panel: string, samples = 4) {
  const out: string[] = [];
  for (let i = 0; i < samples; i++) {
    out.push(
      await page.locator(panel).evaluate((el) => getComputedStyle(el).transform).catch(() => "gone"),
    );
    await page.waitForTimeout(25);
  }
  return out;
}
```

Each case asserts: ≥2 distinct intermediate values, strict progression toward the end state, and that exit-end arrived via `transitionend` rather than the fallback timer.

**How to actually observe the finish source.** The shell does not expose which path called `onClose`, and it must not — production instrumentation for tests is a smell. Timing cannot substitute: `DURATION_NORMAL_FALLBACK_MS` (220) and `DURATION_FAST_FALLBACK_MS` (120) are the *same* nominal values as the tokens they back, so a fallback-timer close lands at roughly the right moment and a timing-only assertion passes against a broken exit.

Observe it entirely **test-side**, with two requirements that are easy to get wrong:

**(i) Gate the listener on an observable dismiss-start marker, not a timestamp.** A listener armed before the dismissal can be consumed by a *different* transform transition — the spring-back's own transition in case (e), the entrance in (f) — and a `performance.now()` stamp does not fix it: those transitions can END after the stamp but before the close actually begins, setting `__exitEnd` and letting a fallback-timer close still satisfy the ordering.

Use the DOM state the shell itself sets at dismiss-commit. `beginDismiss()` puts `inert` on the `role="dialog"` element BEFORE any exit style is applied (spec §3.1 step 3), so `dialog[inert]` is a marker guaranteed to precede the exit transition and to be absent during entrance and spring-back. It works identically for all five affordances, including drag (which reaches `beginDismiss` through its own branch):

`DIALOG` does not exist in either spec yet — define it alongside the existing selector consts (`MODAL_ANY` at `published-review-modal.interactions.spec.ts:53`):

```ts
const DIALOG = '[role="dialog"]';
```

```ts
await page.evaluate(
  ({ panelSel, dialogSel }) => {
    const el = document.querySelector(panelSel);
    const dialog = document.querySelector(dialogSel);
    const w = window as unknown as { __exitEnd?: number | null; __closeAt?: number | null };
    w.__exitEnd = null;
    el?.addEventListener("transitionend", (ev) => {
      const te = ev as TransitionEvent;
      if (te.target !== el || te.propertyName !== "transform") return;
      // Only count transitions that end while the dismiss is committed. The
      // entrance and the spring-back both run with the dialog NOT inert, so
      // neither can be mistaken for the exit.
      if (!dialog?.hasAttribute("inert")) return;
      if (w.__exitEnd === null) w.__exitEnd = performance.now();
    });
  },
  { panelSel: PANEL, dialogSel: DIALOG },
);
```

Leave the listener attached (no `{ once: true }`) — the `inert` gate, not consumption order, is what selects the right event.

**(ii) Timestamp the close from the real page, not from a harness the spec never loads.** `published-review-modal.interactions.spec.ts` drives the **real app** at `/admin?show=<slug>` (`:100`) — `tests/e2e/_publishedReviewModalHarness.tsx` serves only `published-review-modal.layout.spec.ts`, so adding a `window.__closeAt` there would give these tests nothing. Observe the unmount from the page instead:

```ts
await page.evaluate((panelSel) => {
  const w = window as unknown as { __closeAt?: number | null };
  w.__closeAt = null;
  const target = document.querySelector(panelSel);
  if (!target) return;
  const obs = new MutationObserver(() => {
    if (!document.contains(target)) {
      w.__closeAt = performance.now();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}, PANEL);
```

Then assert **both**: `__exitEnd` is non-null (a real post-dismiss transform transition completed), and `__closeAt >= __exitEnd`. Assert on the source, never on elapsed time alone.

For the **Step3** cases, counters alone cannot order close against `__exitEnd` — add `window.__closeAt = performance.now()` inside the live entry's `onClose` alongside `__closeCount`, and assert against that. Counters answer how many; the ordering assertion needs when.

**Mandatory precondition for every "Approve & apply" case — (b), (g), (h).** `harnessResolution()` includes a tier-3 radio item, and Step3 disables *Approve & apply* until every resolution item has a choice. A test that clicks a **disabled** button during the exit window observes "handler not invoked" and passes — even if `inert` and the whole suppression contract were broken. So before any close/timing sequence:

1. Select every required resolution choice.
2. Assert the button is **enabled** (`await expect(approve).toBeEnabled()`).
3. Add a **positive control in the same spec**: with no dismissal in flight, click the same button and assert the deferred handler IS invoked. Without that control, an always-disabled button makes the whole suppression matrix vacuous.

The same enabled-first rule applies to Publish and Ignore wherever their disabled conditions can be reached (`isPublishRunActive`, `resolutionPending`).

| Case | Spec | Viewport | Motion | Harness |
|---|---|---|---|---|
| (a) exit-animation flip | §7.5(a) | SHEET + POPUP | no-preference **+ separate `reduce` run** | published |
| (b) five-affordance suppression | §7.5(b) | Esc/X/scrim both; grab+drag SHEET only | no-preference | step3 |
| (c) focus continuity | §7.5(c) | POPUP | no-preference | published |
| (d) drag-held + Esc | §7.5(d) | SHEET | no-preference | published |
| (e) close during spring-back | §7.5(e) | SHEET | no-preference | published |
| (f) close during entrance | §7.5(f) | SHEET + POPUP | no-preference | published |
| (g) resolution during exit | §7.5(g) | SHEET | no-preference | step3 |
| (h) resolution after exit-end | §7.5(h) | SHEET | no-preference | step3 |

- [ ] **Step 3: Run**

```bash
# Published spec — app Playwright config
pnpm exec playwright test tests/e2e/published-review-modal.interactions.spec.ts
# Step3 spec — standalone config (tests/e2e/standalone.config.ts:17)
pnpm exec playwright test -c tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.interactions.spec.ts
```

Expected: PASS. If a sibling dev server occupies :3000, `lsof` the cwd and use a scratch alt-port config rather than fighting the port.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/published-review-modal.interactions.spec.ts \
  tests/e2e/step3-review-modal.interactions.spec.ts \
  tests/e2e/_step3ReviewModalLiveEntry.tsx
git commit --no-verify -m "test(admin): real-browser exit-animation matrix, five affordances at correct viewports"
```

---

## Task 8: Spec §6.5 amendment + `DEFERRED.md`

**Files:**

- Modify: `docs/superpowers/specs/2026-07-18-admin-show-modal.md` §6.5
- Modify: `DEFERRED.md:23`

- [ ] **Step 1: Amend the ratified transition inventory**

Replace the `open → closed | instant unmount` row with the mode-aware exit (sheet `translateY(100%)` over `--duration-normal`; desktop fade + `translateY(8px) scale(0.98)` over `--duration-fast`; reduced motion instant), citing this spec.

- [ ] **Step 2: Resolve the deferral**

Mark `MODAL-CLOSE-EXIT-ANIM-1` resolved at `DEFERRED.md:23` with the PR ref. **`MODAL-SKELETON-CLOSE-1` (`:28`) stays untouched** — user-directed as a fully separate task.

If `DEFERRED.md` conflicts on rebase, resolve then re-run `npx prettier --write DEFERRED.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-18-admin-show-modal.md DEFERRED.md
git commit --no-verify -m "docs(admin): amend §6.5 transition inventory; resolve MODAL-CLOSE-EXIT-ANIM-1"
```

---

## Task 9: Impeccable critique + audit pair (invariant 8)

Every non-test file in this diff is a UI surface, so both commands are mandatory and run BEFORE the whole-diff Codex review.

- [ ] **Step 1: Setup gates**

Canonical v3 setup: `context.mjs` context load (PRODUCT.md + DESIGN.md) → register reference read (`brand.md` or `product.md`).

- [ ] **Step 2: Run both**

```
/impeccable critique
/impeccable audit
```

- [ ] **Step 3: Triage**

P0/P1 fixed in-scope, or explicitly deferred with a `DEFERRED.md` entry. Findings + dispositions recorded in the PR body. P2/P3 at discretion.

- [ ] **Step 4: Full pre-push gates**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
```

All four. Scoped runs miss regressions; `--no-verify` skipped prettier on every commit above, so `format:check` is the first time formatting is verified.

- [ ] **Step 5: Commit any fixes**

```bash
git commit --no-verify -m "fix(admin): impeccable dual-gate findings"
```
