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
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { GallerySwitcherScenario, GalleryModalData } from "@/lib/dev/galleryModalTypes";

// Capture the props the real modal would have received.
let capturedProps: Record<string, unknown> | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// The mock modal captures the props the real modal would have received. The
// gallery leaves the real modal's native close intact (it navigates to /admin),
// so the switcher no longer overrides ReviewModalCloseContext — the mock does
// not need to consume it.
vi.mock("@/components/admin/showpage/PublishedReviewModal", () => ({
  PublishedReviewModal: (props: Record<string, unknown>) => {
    capturedProps = props;
    return <div data-testid="mock-modal" data-title={String(props.title ?? "")} />;
  },
}));

import { AttentionModalSwitcher, indexOfId } from "@/components/admin/dev/AttentionModalSwitcher";

function scenario(
  id: string,
  title: string,
  group: GallerySwitcherScenario["group"] = "overview",
): GallerySwitcherScenario {
  return {
    id,
    tier: 1,
    label: id,
    group,
    codes: [id.toUpperCase()],
    // The mocked modal ignores all but `title`; a lightweight cast keeps the
    // fixture from having to construct all ~20 real data props.
    data: { title } as unknown as GalleryModalData,
  };
}

const THREE = [scenario("a", "A"), scenario("b", "B"), scenario("c", "C", "crew")];

function pressKey(key: string, init: KeyboardEventInit = {}): boolean {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  // Dispatch inside act(): the switcher's listener is a NATIVE document handler,
  // so its setIndex updates land outside React's batching unless we flush them
  // here. `defaultPrevented` is set synchronously during dispatch.
  act(() => {
    document.dispatchEvent(ev);
  });
  return ev.defaultPrevented;
}

/** Dispatch a bubbling keydown whose target is a given element. */
function pressKeyOn(el: Element, key: string): boolean {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(ev);
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

  test("modified arrows and arrows on editable targets do NOT step scenarios", () => {
    render(<AttentionModalSwitcher scenarios={THREE} excluded={[]} initialId="a" />);
    // Alt+Arrow (browser nav) / other modifier combos are left alone.
    expect(pressKey("ArrowRight", { altKey: true })).toBe(false);
    expect(pressKey("ArrowRight", { metaKey: true })).toBe(false);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("A");
    // An arrow whose target is an input/textarea (cursor movement) is left alone.
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(pressKeyOn(input, "ArrowRight")).toBe(false);
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("A");
    input.remove();
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

  test("Escape is swallowed so the modal's navigate-to-/admin close never fires", () => {
    render(<AttentionModalSwitcher scenarios={THREE} excluded={[]} initialId="a" />);
    // preventDefault + stopPropagation keep Escape from reaching the modal shell,
    // whose close navigates to /admin (see the switcher's close-semantics note).
    expect(pressKey("Escape")).toBe(true);
    // The modal stays mounted on the current scenario.
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("A");
  });

  test("jumping via the group select re-renders the target scenario", () => {
    render(<AttentionModalSwitcher scenarios={THREE} excluded={[]} initialId={null} />);
    const select = screen.getByTestId("attention-switcher-group-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "crew" } });
    expect(screen.getByTestId("mock-modal").getAttribute("data-title")).toBe("C");
    expect(select.value).toBe("crew");
  });
});
