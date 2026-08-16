// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RefAnchor } from "@/app/help/_components/RefAnchor";

afterEach(() => cleanup());

describe("<RefAnchor>", () => {
  it("renders an h2 with id={id} by default (Phase E pages use it as section heading)", () => {
    render(<RefAnchor id="REPORT_HORIZON_EXPIRED">Report horizon expired</RefAnchor>);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveAttribute("id", "REPORT_HORIZON_EXPIRED");
    expect(heading).toHaveTextContent("Report horizon expired");
  });

  // r5 fix per D-r4 finding 1: /help/errors lists every catalog code as an h3
  // beneath an h2-shaped page heading. Support optional `as` prop for that case.
  it("renders an h3 when `as='h3'` (used in /help/errors per-code list)", () => {
    render(
      <RefAnchor id="X" as="h3">
        X
      </RefAnchor>,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveAttribute("id", "X");
  });

  it("renders a copy-link affordance with aria-label", () => {
    render(<RefAnchor id="X">Y</RefAnchor>);
    const linkBtn = screen.getByRole("link", { name: /copy link to X/i });
    expect(linkBtn).toHaveAttribute("href", "#X");
  });

  it("throws when id violates the catalog-code regex (build-time invariant)", () => {
    expect(() => render(<RefAnchor id="bad-id">x</RefAnchor>)).toThrow();
    expect(() => render(<RefAnchor id="123_NUMERIC_LEAD">x</RefAnchor>)).toThrow();
  });

  it("accepts real catalog code shapes (standard + MI-class) per /help/errors plan", () => {
    // Standard SCREAMING_SNAKE_CASE
    expect(() => render(<RefAnchor id="STALE_WRITE_ABORTED">x</RefAnchor>)).not.toThrow();
    // MI-class with numeric prefix
    expect(() => render(<RefAnchor id="MI-1_VERSION_DETECTION_FAILED">x</RefAnchor>)).not.toThrow();
    // MI-class with lowercase suffix letter
    expect(() => render(<RefAnchor id="MI-5a_DUPLICATE_CREW_NAME">x</RefAnchor>)).not.toThrow();
  });

  it("throws when as is anything other than 'h2' or 'h3' (MDX runtime guard, Codex R1 finding)", () => {
    // Cast simulates a typo'd MDX call site; MDX files are not typechecked,
    // so the TS union alone is insufficient.
    expect(() =>
      render(
        <RefAnchor id="X" as={"h4" as "h2" | "h3"}>
          x
        </RefAnchor>,
      ),
    ).toThrow(/as.*h2.*h3/i);
  });

  it("copies permalink to clipboard on click (spec §6.2 / aria-label contract; Codex R2 finding)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    // Provide a deterministic location:
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "http://localhost:3000", pathname: "/help/errors", hash: "" },
    });

    render(<RefAnchor id="REPORT_HORIZON_EXPIRED">x</RefAnchor>);
    const linkBtn = screen.getByRole("link", { name: /copy link to REPORT_HORIZON_EXPIRED/i });
    linkBtn.click();

    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/help/errors#REPORT_HORIZON_EXPIRED",
    );
  });
});

/**
 * BL-HELP-REFANCHOR-A11Y-PASS — the whole-surface a11y pass.
 * Spec: docs/superpowers/specs/2026-08-15-help-refanchor-a11y.md §2.1-§2.2, §3.
 *
 * Each case names the failure mode it catches; each fails on the pre-arc tree
 * for that reason (the shipped component has ONE static aria-label and no
 * `role=` attribute anywhere in the file).
 */
describe("<RefAnchor> a11y pass", () => {
  /** Must match the component's clear window. The timer oracle below keys on
   *  this delay, so a drift here fails loudly rather than silently. */
  const CLEAR_WINDOW_MS = 2000;

  /**
   * Live count of the component's OWN clear timers.
   *
   * Probed 2026-08-15: under jsdom with React's act environment the click
   * itself arms a `setTimeout(…, 0)` (scheduler work), so a bare
   * `vi.getTimerCount()` reads 1 while the write is still PENDING and 2 once
   * it resolves. An absolute count is therefore a claim about the environment,
   * not about this component, and an absolute-zero assertion is unreachable.
   * Keying on the clear-window delay keeps the oracle discriminating: it
   * counts exactly the timers this component schedules and no others.
   */
  function trackClearTimers() {
    const originalSet = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    const live = new Set<unknown>();

    globalThis.setTimeout = ((
      fn: (...a: unknown[]) => void,
      delay?: number,
      ...rest: unknown[]
    ) => {
      if (delay !== CLEAR_WINDOW_MS) {
        return (originalSet as (...a: unknown[]) => unknown)(fn, delay, ...rest);
      }
      // The callback reads `id` only when the timer fires, which is always
      // after this assignment completes.
      const id: unknown = (originalSet as (...a: unknown[]) => unknown)(
        () => {
          live.delete(id);
          fn();
        },
        delay,
        ...rest,
      );
      live.add(id);
      return id;
    }) as unknown as typeof globalThis.setTimeout;

    globalThis.clearTimeout = ((id: unknown) => {
      live.delete(id);
      return (originalClear as (...a: unknown[]) => unknown)(id);
    }) as unknown as typeof globalThis.clearTimeout;

    return {
      count: () => live.size,
      restore: () => {
        globalThis.setTimeout = originalSet;
        globalThis.clearTimeout = originalClear;
      },
    };
  }

  let timers: ReturnType<typeof trackClearTimers> | null = null;

  /** Fake timers first, then instrumentation, so the tracker wraps the FAKE
   *  `setTimeout` — wrapping the real one would see none of the component's
   *  scheduling. */
  function useTrackedFakeTimers() {
    vi.useFakeTimers();
    timers = trackClearTimers();
    return timers;
  }

  afterEach(() => {
    timers?.restore();
    timers = null;
    vi.useRealTimers();
  });

  /** A promise whose settlement this test controls, so the PENDING window is
   *  observable. An immediately-settling mock cannot distinguish
   *  announce-on-resolve from announce-on-click-then-retract (spec §3.3). */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function stubLocation() {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "http://localhost:3000", pathname: "/help/errors", hash: "" },
    });
  }

  function stubClipboard(writeText: unknown) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  }

  function removeClipboard() {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  }

  /** The click the component actually receives in a browser: cancelable, so
   *  reading `defaultPrevented` afterwards is a real reading of the handler's
   *  behavior rather than an artifact of a non-cancelable synthetic event. */
  async function cancelableClick(el: Element): Promise<MouseEvent> {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      el.dispatchEvent(event);
    });
    return event;
  }

  /** Advance fake timers inside `act` so any resulting state update is
   *  flushed before the assertion reads the DOM. */
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  function copyLink(name: string): HTMLElement {
    return screen.getByRole("link", { name: new RegExp(`copy link to ${name}`, "i") });
  }

  function statusRegion(container: HTMLElement): HTMLElement {
    const region = container.querySelector('[role="status"]');
    if (!region) throw new Error("no role=status region rendered");
    return region as HTMLElement;
  }

  it("gives each copy-link an accessible name containing its own code", () => {
    // Catches: the single shared static label this arc retired, under which a
    // screen-reader user hears the same name on all 219 entries.
    render(
      <>
        <RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>
        <RefAnchor id="REPORT_HORIZON_EXPIRED">b</RefAnchor>
      </>,
    );

    const first = copyLink("STALE_WRITE_ABORTED");
    const second = copyLink("REPORT_HORIZON_EXPIRED");

    // Names derived from the fixture ids, never a hardcoded page-wide count.
    expect(first.getAttribute("aria-label")).toBe("Copy link to STALE_WRITE_ABORTED");
    expect(second.getAttribute("aria-label")).toBe("Copy link to REPORT_HORIZON_EXPIRED");
    expect(first.getAttribute("aria-label")).not.toBe(second.getAttribute("aria-label"));
  });

  it("renders the status region BEFORE any announcement, empty and polite", () => {
    // Catches: a region inserted together with its text — the
    // BL-ANNOUNCE-REGION-UNMOUNT-CLASS defect, which reads as announced in
    // review and is silent at runtime.
    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);

    const region = statusRegion(container);
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region.className).toContain("sr-only");
    expect(region.textContent).toBe("");
  });

  // Both call-site modes (spec §2.4): the errors page's per-code `as="h3"`
  // entries and the chapter pages' default-`as` h2 sections. `as` is omitted
  // rather than passed as undefined in the default case, because
  // `exactOptionalPropertyTypes` makes those two different call sites.
  it("keeps the status region OUTSIDE the heading (as='h3')", () => {
    // Catches: a region nested inside the heading — it passes every
    // existence/attribute/text assertion while polluting the heading's
    // computed name during announcements (spec R3 finding 1).
    const { container } = render(
      <RefAnchor id="STALE_WRITE_ABORTED" as="h3">
        a
      </RefAnchor>,
    );

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.contains(statusRegion(container))).toBe(false);
  });

  it("keeps the status region OUTSIDE the heading (default `as`)", () => {
    // Same failure mode as above, on the chapter-page call shape.
    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.contains(statusRegion(container))).toBe(false);
  });

  it("announces only once the write RESOLVES, and arms no timer before that", async () => {
    // Catches: no announcement at all (the shipped tree); an optimistic
    // announce-then-retract that flashes a false success under a slow
    // clipboard; and a clear timer armed pre-settlement, which truncates a
    // slow success's announcement.
    const clear = useTrackedFakeTimers();
    stubLocation();
    const write = deferred<void>();
    stubClipboard(vi.fn().mockReturnValue(write.promise));

    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);
    const region = statusRegion(container);

    const event = await cancelableClick(copyLink("STALE_WRITE_ABORTED"));

    // PENDING: nothing claimed, nothing scheduled.
    expect(region.textContent).toBe("");
    expect(clear.count()).toBe(0);
    // The fragment navigation must survive (no preventDefault).
    expect(event.defaultPrevented).toBe(false);

    await act(async () => {
      write.resolve();
    });

    expect(region.textContent).toBe("Link copied");
    expect(clear.count()).toBe(1);
  });

  it("stays silent when the write REJECTS, and still navigates", async () => {
    // Catches: announcing on click instead of on resolve — a claim that the
    // link was copied when it was not.
    const clear = useTrackedFakeTimers();
    stubLocation();
    const write = deferred<void>();
    write.promise.catch(() => {});
    stubClipboard(vi.fn().mockReturnValue(write.promise));

    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);
    const region = statusRegion(container);

    const event = await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    await act(async () => {
      write.reject(new Error("clipboard denied"));
    });

    expect(region.textContent).toBe("");
    expect(clear.count()).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("stays silent when the clipboard API is ABSENT, and still navigates", async () => {
    // Catches: an implementation that announces unconditionally, or one that
    // gates the region's RENDERING (not just its text) on clipboard support.
    const clear = useTrackedFakeTimers();
    stubLocation();
    removeClipboard();

    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);
    const region = statusRegion(container);

    const event = await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    await advance(0);

    expect(region.textContent).toBe("");
    expect(clear.count()).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("clears the announcement after the clear window", async () => {
    // Catches: a perpetual stale "Link copied" that re-reads on every screen
    // reader re-scan and blocks the next announcement.
    useTrackedFakeTimers();
    stubLocation();
    const write = deferred<void>();
    stubClipboard(vi.fn().mockReturnValue(write.promise));

    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);
    const region = statusRegion(container);

    await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    await act(async () => {
      write.resolve();
    });
    expect(region.textContent).toBe("Link copied");

    await advance(CLEAR_WINDOW_MS);
    expect(region.textContent).toBe("");
  });

  it("starts the clear window at SETTLEMENT, not at click", async () => {
    // Catches: a window armed on click, which under a slow clipboard expires
    // before the write lands and truncates (or entirely swallows) the
    // announcement the user was waiting for.
    useTrackedFakeTimers();
    stubLocation();
    const write = deferred<void>();
    stubClipboard(vi.fn().mockReturnValue(write.promise));

    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);
    const region = statusRegion(container);

    await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    // A clipboard slower than the whole clear window.
    await advance(CLEAR_WINDOW_MS * 2);
    expect(region.textContent).toBe("");

    await act(async () => {
      write.resolve();
    });
    expect(region.textContent).toBe("Link copied");

    // The full window is still ahead of us, measured from settlement.
    await advance(CLEAR_WINDOW_MS - 1);
    expect(region.textContent).toBe("Link copied");
    await advance(1);
    expect(region.textContent).toBe("");
  });

  it("restarts the clear window on a second successful copy", async () => {
    // Catches: a fire-once timer that truncates the second announcement
    // partway through its window.
    useTrackedFakeTimers();
    stubLocation();
    const first = deferred<void>();
    const second = deferred<void>();
    stubClipboard(vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise));

    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);
    const region = statusRegion(container);

    await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    await act(async () => {
      first.resolve();
    });
    await advance(1500);
    expect(region.textContent).toBe("Link copied");

    await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    await act(async () => {
      second.resolve();
    });

    // Past the FIRST copy's window, still announcing — the window restarted.
    await advance(1500);
    expect(region.textContent).toBe("Link copied");
    // A full window after the SECOND copy, cleared.
    await advance(600);
    expect(region.textContent).toBe("");
  });

  it.each([
    ["rejects", "reject"],
    ["has no clipboard API", "absent"],
  ] as const)("leaves no stranded announcement when the re-copy %s", async (_label, mode) => {
    // Catches: an implementation that clears the pending timer at CLICK time
    // and never re-arms on the failure branch, leaving "Link copied"
    // permanently mounted after an ordinary double-activation.
    useTrackedFakeTimers();
    stubLocation();
    const first = deferred<void>();
    const second = deferred<void>();
    second.promise.catch(() => {});
    stubClipboard(vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise));

    const { container } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);
    const region = statusRegion(container);

    await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    await act(async () => {
      first.resolve();
    });
    await advance(1500);
    expect(region.textContent).toBe("Link copied");

    if (mode === "absent") removeClipboard();
    await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    if (mode === "reject") {
      await act(async () => {
        second.reject(new Error("clipboard denied"));
      });
    }

    // The FIRST copy's clear schedule is untouched by a failed re-copy.
    await advance(500);
    expect(region.textContent).toBe("");
  });

  it("cleans the clear timer up on unmount", async () => {
    // Catches: a leaked timer, by count. A console-error oracle is VACUOUS
    // here — React no longer warns on set-state-after-unmount (probed, spec
    // R2), so a deliberately leaked timer fires with zero console output.
    const clear = useTrackedFakeTimers();
    stubLocation();
    const write = deferred<void>();
    stubClipboard(vi.fn().mockReturnValue(write.promise));

    const { container, unmount } = render(<RefAnchor id="STALE_WRITE_ABORTED">a</RefAnchor>);
    const region = statusRegion(container);

    await cancelableClick(copyLink("STALE_WRITE_ABORTED"));
    await act(async () => {
      write.resolve();
    });

    expect(region.textContent).toBe("Link copied");
    // Premise: the cleanup assertion below has nothing to discriminate unless
    // a clear timer is actually scheduled here.
    expect(clear.count()).toBe(1);

    unmount();
    expect(clear.count()).toBe(0);
  });
});
