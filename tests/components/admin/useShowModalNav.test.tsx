// @vitest-environment jsdom
/**
 * tests/components/admin/useShowModalNav.test.tsx (admin-show-modal spec §3 / D9 — Task 5)
 *
 * The client wrapper over the pure `showModalParams` helpers: `openHref` builds
 * a param-preserving modal href over `useSearchParams()`; `close` pushes the
 * current URL minus `show`/`alert_id` with `{ scroll: false }` (X / scrim / Esc
 * / drag-dismiss all funnel here — single source of truth for both param
 * computations).
 *
 * Failure modes caught:
 *   - close dropping unrelated params (archived-bucket context lost on close);
 *   - close leaving `show`/`alert_id` behind (modal re-opens on the pushed URL);
 *   - a scroll-jumping close (missing `{ scroll: false }`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useShowModalNav } from "@/components/admin/useShowModalNav";

const push = vi.fn();
let mockParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => mockParams,
}));

beforeEach(() => {
  mockParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("useShowModalNav.openHref", () => {
  it("builds the modal href over the CURRENT search params", () => {
    mockParams = new URLSearchParams("bucket=archived");
    const { result } = renderHook(() => useShowModalNav());
    expect(result.current.openHref("x")).toBe("/admin?bucket=archived&show=x");
  });

  it("replaces the open show and strips alert_id when a modal is already open", () => {
    mockParams = new URLSearchParams("bucket=archived&show=prev&alert_id=al-1");
    const { result } = renderHook(() => useShowModalNav());
    const q = new URLSearchParams(result.current.openHref("next-show").split("?")[1]);
    expect(q.getAll("show")).toEqual(["next-show"]);
    expect(q.get("alert_id")).toBeNull();
    expect(q.get("bucket")).toBe("archived");
  });
});

describe("useShowModalNav.close", () => {
  it("pushes the current params minus show/alert_id with { scroll: false }", () => {
    mockParams = new URLSearchParams("bucket=archived&show=x&alert_id=al-1");
    const { result } = renderHook(() => useShowModalNav());
    result.current.close();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin?bucket=archived", { scroll: false });
  });

  it("pushes bare /admin when show/alert_id were the only params", () => {
    mockParams = new URLSearchParams("show=x&alert_id=al-1");
    const { result } = renderHook(() => useShowModalNav());
    result.current.close();
    expect(push).toHaveBeenCalledWith("/admin", { scroll: false });
  });

  it("preserves every unrelated param, not just bucket", () => {
    mockParams = new URLSearchParams("bucket=archived&q=summit&show=x");
    const { result } = renderHook(() => useShowModalNav());
    result.current.close();
    const [href, opts] = push.mock.calls[0] as [string, { scroll: boolean }];
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("bucket")).toBe("archived");
    expect(q.get("q")).toBe("summit");
    expect(q.get("show")).toBeNull();
    expect(opts).toEqual({ scroll: false });
  });
});
