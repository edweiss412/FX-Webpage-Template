/**
 * tests/components/admin/dev/attentionModalSwitcher.test.tsx
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 6)
 *
 * The client switcher: index state with functional wrap, no-op action closures
 * that never write, `closingRef` self-heal across galleryClose→Reopen, and an
 * Escape-swallow that fires ONLY while the modal is open (closed mode leaves
 * Escape alone — there is no shell listener to race). The real modal is mocked
 * so we can capture the props it receives and invoke all eight action closures.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GallerySwitcherScenario, GalleryModalData } from "@/lib/dev/galleryModalTypes";

// Capture the props the real modal would have received.
let capturedProps: Record<string, unknown> | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// The mock modal consumes the real ReviewModalCloseContext (the switcher
// provides `galleryClose` as its value) and renders a close button, mirroring
// how the production modal's own X reaches the close API. An async factory lets
// us import the context without the vi.mock hoisting hazard.
vi.mock("@/components/admin/showpage/PublishedReviewModal", async () => {
  const React = await import("react");
  const { useReviewModalClose } = await import("@/components/admin/review/ReviewModalShell");
  return {
    PublishedReviewModal: (props: Record<string, unknown>) => {
      capturedProps = props;
      const close = useReviewModalClose();
      return React.createElement("div", {
        "data-testid": "mock-modal",
        "data-title": String(props.title ?? ""),
        children: React.createElement("button", {
          type: "button",
          "data-testid": "modal-close",
          onClick: close,
          children: "close",
        }),
      });
    },
  };
});

import { AttentionModalSwitcher, indexOfId } from "@/components/admin/dev/AttentionModalSwitcher";

function scenario(id: string, title: string): GallerySwitcherScenario {
  return {
    id,
    tier: 1,
    label: id,
    codes: [id.toUpperCase()],
    // The mocked modal ignores all but `title`; a lightweight cast keeps the
    // fixture from having to construct all ~20 real data props.
    data: { title } as unknown as GalleryModalData,
  };
}

const THREE = [scenario("a", "A"), scenario("b", "B"), scenario("c", "C")];

function pressKey(key: string): boolean {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  // Dispatch inside act(): the switcher's listener is a NATIVE document handler,
  // so its setIndex/setClosed updates land outside React's batching unless we
  // flush them here. `defaultPrevented` is set synchronously during dispatch.
  act(() => {
    document.dispatchEvent(ev);
  });
  return ev.defaultPrevented;
}

afterEach(cleanup);
beforeEach(() => {
  capturedProps = null;
});

describe("indexOfId", () => {
  test("valid id -> its index; unknown/null -> 0", () => {
    expect(indexOfId(THREE, "b")).toBe(1);
    expect(indexOfId(THREE, "c")).toBe(2);
    expect(indexOfId(THREE, "nope")).toBe(0);
    expect(indexOfId(THREE, null)).toBe(0);
  });
});

describe("AttentionModalSwitcher", () => {
  test("empty scenarios -> EmptyState, no scenarios[index] access", () => {
    render(<AttentionModalSwitcher scenarios={[]} excluded={[]} initialId={null} />);
    expect(screen.queryByTestId("mock-modal")).toBeNull();
    expect(screen.getByText(/no scenarios/i)).toBeTruthy();
  });

  test("initialId picks the starting index", () => {
    render(<AttentionModalSwitcher scenarios={THREE} excluded={[]} initialId="b" />);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("B");
  });

  test("ArrowRight/ArrowLeft advance with functional wraparound", () => {
    render(<AttentionModalSwitcher scenarios={THREE} excluded={[]} initialId="a" />);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("A");
    expect(pressKey("ArrowRight")).toBe(true);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("B");
    expect(pressKey("ArrowLeft")).toBe(true);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("A");
    // wrap below 0 -> last
    expect(pressKey("ArrowLeft")).toBe(true);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("C");
    // wrap above last -> first
    expect(pressKey("ArrowRight")).toBe(true);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("A");
  });

  test("all eight action closures are no-ops with the contracted return shapes", async () => {
    // The return shapes match the REAL action prop types (useActionState-style
    // reducers return their state, not void): setPublished/archive -> Lifecycle
    // `{ok:true}`; unarchive -> void; undo/approve/reject -> `{ok:true}`;
    // accept/acceptAll -> `{ok:true, count:0}` (AcceptButtonResult carries a
    // count). None of them writes anything — they resolve immediately.
    render(<AttentionModalSwitcher scenarios={THREE} excluded={[]} initialId="a" />);
    expect(capturedProps).not.toBeNull();
    const p = capturedProps!;
    await expect((p.setPublished as (n: boolean) => Promise<unknown>)(true)).resolves.toEqual({
      ok: true,
    });
    await expect((p.archiveAction as () => Promise<unknown>)()).resolves.toEqual({ ok: true });
    await expect(
      (p.unarchiveAction as (id: string) => Promise<unknown>)("x"),
    ).resolves.toBeUndefined();
    await expect((p.undoAction as (...a: unknown[]) => Promise<unknown>)()).resolves.toEqual({
      ok: true,
    });
    await expect((p.acceptAction as (...a: unknown[]) => Promise<unknown>)()).resolves.toEqual({
      ok: true,
      count: 0,
    });
    await expect((p.acceptAllAction as (...a: unknown[]) => Promise<unknown>)()).resolves.toEqual({
      ok: true,
      count: 0,
    });
    await expect((p.approveAction as (...a: unknown[]) => Promise<unknown>)()).resolves.toEqual({
      ok: true,
    });
    await expect((p.rejectAction as (...a: unknown[]) => Promise<unknown>)()).resolves.toEqual({
      ok: true,
    });
  });

  test("galleryClose unmounts the modal; Reopen restores it and arrows advance again (closingRef reset)", () => {
    render(<AttentionModalSwitcher scenarios={THREE} excluded={[]} initialId="a" />);
    // Close via the ReviewModalCloseContext value the switcher handed the modal
    // (the mock modal's close button invokes it).
    fireEvent.click(screen.getByTestId("modal-close"));
    expect(screen.queryByTestId("mock-modal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /reopen/i }));
    expect(screen.getByTestId("mock-modal")).toBeTruthy();
    // Arrows work after reopen (closingRef was reset).
    expect(pressKey("ArrowRight")).toBe(true);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("B");
  });

  test("Escape while OPEN is swallowed; Escape while CLOSED is NOT intercepted", () => {
    render(<AttentionModalSwitcher scenarios={THREE} excluded={[]} initialId="a" />);
    // Open: Escape swallowed.
    expect(pressKey("Escape")).toBe(true);
    expect(screen.getByTestId("mock-modal")).toBeTruthy();
    // Close, then Escape must NOT be intercepted.
    fireEvent.click(screen.getByTestId("modal-close"));
    expect(screen.queryByTestId("mock-modal")).toBeNull();
    expect(pressKey("Escape")).toBe(false);
  });
});
