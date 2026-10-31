// @vitest-environment jsdom
/**
 * tests/components/auth/avatarMenuSavedCopy.test.tsx
 *
 * The avatar menu's part in the crew page's saved copy.
 *
 * Spec: docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md
 *   §4.6 "Identity transitions are bracketed": "Not you? Switch person" posts
 *        `purge-show` and waits up to 500 ms for the acknowledgement before
 *        submitting `clearIdentity`, then posts it again when the action
 *        settles, success or failure.
 *   §4.7.6 "Actions offline": the row is disabled while `online` is false,
 *        labelled "Needs signal".
 * Preflight ruling D5: with no worker controlling the page, `postToWorker`
 * answers synchronously and the menu does not wait, so `clearAction` is still
 * called inside the tap (the existing avatarMenu.test.tsx cases rely on it).
 *
 * The transport is the REAL lib/offline/client/messaging.ts, posting to a fake
 * controller over a real MessageChannel, so the 500 ms bound and the ack are
 * the shipped ones rather than a stand-in's. The connection is
 * `navigator.onLine` plus the `online`/`offline` events, read through the
 * shared `useOnlineStatus` hook; the hook's hydration guarantee is pinned once,
 * in tests/components/offline/savedCopyBar.test.tsx.
 */
import "@testing-library/jest-dom/vitest";
import { Component, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

/**
 * The hook, passed through unless a case pins its answer. Always calls the real
 * hook, so the hook order is the same whichever answer the case wants.
 */
const hook = vi.hoisted(() => ({ answer: null as boolean | null }));
vi.mock("@/lib/offline/client/online", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/offline/client/online")>();
  return {
    ...real,
    useOnlineStatus: (): boolean => {
      const live = real.useOnlineStatus();
      return hook.answer ?? live;
    },
  };
});

import { AvatarMenu } from "@/components/auth/AvatarMenu";
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";

const ROUTE = {
  slug: "east-coast",
  shareToken: "t".repeat(64),
  showId: "11111111-1111-1111-1111-111111111111",
};

const PURGE = { type: "purge-show", showId: ROUTE.showId };

/** The bound the bracket waits for an ack, as a literal: a case that read the
 * component's constant could not tell it from any other number. */
const ACK_WAIT_MS = 500;

/** The switch watchdog's window (PENDING_TIMEOUT_MS), as a literal for the same reason. */
const PENDING_WINDOW_MS = 8_000;

const FAILED: ClearIdentityResult = { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };

/** What happened, in order: each post to the worker and each clear. */
let events: string[] = [];

/** Every port handed to the fake worker, closed after each case. */
let ports: MessagePort[] = [];

/**
 * A worker controlling the page. It records each message and, when `autoAck`
 * is set, answers `ack` at once on the transferred port; otherwise the case
 * answers through `ack(index)`, or never.
 */
function installWorker({ autoAck }: { autoAck: boolean }) {
  const posted: { message: unknown; port: MessagePort }[] = [];
  const controller = {
    postMessage(message: unknown, transfer: readonly unknown[]) {
      const port = transfer[0] as MessagePort;
      ports.push(port);
      posted.push({ message, port });
      events.push(`post:${(message as { type?: string }).type ?? "?"}`);
      if (autoAck) port.postMessage({ outcome: "ack" });
    },
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: { controller },
  });
  return {
    posted,
    ack: (index: number) => posted[index]!.port.postMessage({ outcome: "ack" }),
  };
}

/** A clear action whose settlement the case controls, logging when it is called. */
function heldAction() {
  let resolve!: (value: ClearIdentityResult) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ClearIdentityResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const action = vi.fn((_formData: FormData) => {
    events.push("clear");
    return promise;
  });
  return { action, promise, resolve, reject };
}

/**
 * Lets the boundary report a rethrown clear: "did the component rethrow" is
 * answerable only by asking what the boundary caught (avatarMenu.test.tsx, the
 * same shape).
 */
class CatchBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  override state = { caught: false };
  static getDerivedStateFromError() {
    return { caught: true };
  }
  override render() {
    return this.state.caught ? <div data-testid="switch-boundary" /> : this.props.children;
  }
}

function renderMenu(action: (formData: FormData) => Promise<ClearIdentityResult>) {
  return render(
    <CatchBoundary>
      <AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />
    </CatchBoundary>,
  );
}

/** The switch row renders only while the menu is open, so every case opens it. */
function openMenu(): void {
  act(() => {
    fireEvent.click(screen.getByTestId("avatar-menu-trigger"));
  });
}

function switchRow(): HTMLElement {
  return screen.getByTestId("avatar-menu-switch-person");
}

function tapSwitch(): void {
  act(() => {
    fireEvent.click(switchRow());
  });
}

/** Lets a few macrotasks run, long enough for a port message to land. */
async function drain(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
}

let onLine: MockInstance<() => boolean>;

/** Moves the connection and fires the event the browser would. */
function goOnline(value: boolean): void {
  onLine.mockReturnValue(value);
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

beforeEach(() => {
  events = [];
  ports = [];
  hook.answer = null;
  onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  for (const port of ports) port.close();
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the purge bracket around Not you? (spec 4.6)", () => {
  test("purges, waits for the ack, clears, then purges again once the clear settles", async () => {
    const worker = installWorker({ autoAck: false });
    const clear = heldAction();
    renderMenu(clear.action);
    openMenu();

    tapSwitch();
    expect(events, "the first purge goes out on the tap, before the clear").toEqual([
      "post:purge-show",
    ]);
    expect(worker.posted[0]!.message).toStrictEqual(PURGE);

    // The ack is withheld: the clear must still be waiting for it.
    await drain();
    expect(clear.action, "no clear before the ack").not.toHaveBeenCalled();

    worker.ack(0);
    await waitFor(() => expect(clear.action).toHaveBeenCalledTimes(1));
    expect(events, "nothing more is posted while the clear is in flight").toEqual([
      "post:purge-show",
      "clear",
    ]);

    await act(async () => {
      clear.resolve({ ok: true });
      await clear.promise;
    });
    expect(events).toEqual(["post:purge-show", "clear", "post:purge-show"]);
    expect(worker.posted[1]!.message).toStrictEqual(PURGE);
  });

  test("a missing ack lets the clear go ahead after 500 ms, and not before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    installWorker({ autoAck: false });
    const clear = heldAction();
    renderMenu(clear.action);
    openMenu();

    tapSwitch();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACK_WAIT_MS - 1);
    });
    expect(clear.action, "still inside the wait").not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(clear.action, "the wait ran out, so the clear proceeds").toHaveBeenCalledTimes(1);
    expect(events).toEqual(["post:purge-show", "clear"]);

    await act(async () => {
      clear.resolve({ ok: true });
      await clear.promise;
    });
    expect(events).toEqual(["post:purge-show", "clear", "post:purge-show"]);
  });

  const REDIRECT = Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;replace;/x;307;",
  });

  test.each([
    {
      settle: "success",
      finish: (c: ReturnType<typeof heldAction>) => c.resolve({ ok: true }),
      rethrown: false,
    },
    {
      settle: "a typed failure",
      finish: (c: ReturnType<typeof heldAction>) =>
        c.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }),
      rethrown: false,
    },
    {
      settle: "a thrown transport error",
      finish: (c: ReturnType<typeof heldAction>) => c.reject(new Error("network")),
      rethrown: false,
    },
    {
      settle: "a thrown redirect",
      finish: (c: ReturnType<typeof heldAction>) => c.reject(REDIRECT),
      rethrown: true,
    },
  ])("the second purge goes out on $settle", async ({ finish, rethrown }) => {
    const worker = installWorker({ autoAck: true });
    const clear = heldAction();
    renderMenu(clear.action);
    openMenu();

    tapSwitch();
    await waitFor(() => expect(clear.action).toHaveBeenCalledTimes(1));
    expect(worker.posted, "only the first purge while the clear is in flight").toHaveLength(1);

    // React logs a caught boundary error; silence it so a passing case is quiet.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        finish(clear);
        await clear.promise.catch(() => {});
      });
    } catch {
      // A rethrown redirect may surface here; what the boundary caught is the
      // assertion below.
    }
    logged.mockRestore();

    // Premise on this case's own input: the redirect really took the rethrow
    // path, and the others really did not.
    expect(screen.queryByTestId("switch-boundary") !== null, "rethrown to the boundary").toBe(
      rethrown,
    );
    expect(events).toEqual(["post:purge-show", "clear", "post:purge-show"]);
    expect(worker.posted[1]!.message).toStrictEqual(PURGE);
  });

  test("the second purge is not waited for: with no ack, a failure shows as soon as the clear settles", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // A worker that never answers, so a menu that waited on the second purge
    // would sit in the pending phase until that post's own timeout.
    const worker = installWorker({ autoAck: false });
    const clear = heldAction();
    renderMenu(clear.action);
    openMenu();

    tapSwitch();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACK_WAIT_MS);
    });
    expect(clear.action, "the first purge's wait ran out").toHaveBeenCalledTimes(1);

    // Settle with no timer advance after it: only microtasks run from here.
    await act(async () => {
      clear.resolve(FAILED);
      await clear.promise;
    });
    expect(worker.posted, "the second purge went out, and is still unanswered").toHaveLength(2);
    expect(worker.posted[1]!.message).toStrictEqual(PURGE);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(switchRow()).toHaveAttribute("aria-disabled", "false");
    expect(switchRow()).not.toHaveAttribute("aria-busy");
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe("");
  });

  test("a superseded attempt still sends its second purge when its clear settles", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const worker = installWorker({ autoAck: false });
    const first = heldAction();
    const second = heldAction();
    const action = vi
      .fn<(formData: FormData) => Promise<ClearIdentityResult>>()
      .mockImplementationOnce(first.action)
      .mockImplementationOnce(second.action);
    renderMenu(action);
    openMenu();

    tapSwitch();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACK_WAIT_MS);
    });
    expect(action, "attempt 1 reached its clear").toHaveBeenCalledTimes(1);

    // Attempt 1's clear hangs past the watchdog, which re-enables the row.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_WINDOW_MS);
    });
    expect(switchRow(), "the watchdog admits a retry").toHaveAttribute("aria-disabled", "false");

    tapSwitch();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACK_WAIT_MS);
    });
    expect(action, "attempt 2 reached its clear").toHaveBeenCalledTimes(2);
    expect(events).toEqual(["post:purge-show", "clear", "post:purge-show", "clear"]);

    // The superseded clear settles. Its cookie change can land after attempt
    // 2's first purge, so it needs its own second purge.
    await act(async () => {
      first.resolve(FAILED);
      await first.promise;
    });
    // Premise: attempt 1 really was superseded, so its failure paints nothing.
    expect(screen.queryByRole("alert"), "a superseded failure reports nothing").toBeNull();
    expect(events).toEqual([
      "post:purge-show",
      "clear",
      "post:purge-show",
      "clear",
      "post:purge-show",
    ]);
    expect(worker.posted[2]!.message).toStrictEqual(PURGE);

    await act(async () => {
      second.resolve({ ok: true });
      await second.promise;
    });
    expect(events.at(-1), "and the live attempt sends its own").toBe("post:purge-show");
    expect(worker.posted).toHaveLength(4);
  });

  test("with no worker controlling the page, the clear is called inside the tap (ruling D5)", () => {
    expect(
      (window.navigator as { serviceWorker?: unknown }).serviceWorker,
      "jsdom offers no service worker container",
    ).toBeUndefined();
    const clear = heldAction();
    renderMenu(clear.action);
    openMenu();

    // A synchronous act and no await: nothing on the phone can hold a saved
    // copy, so there is nothing to wait for.
    tapSwitch();
    expect(clear.action).toHaveBeenCalledTimes(1);
  });
});

describe("Not you? while offline (spec 4.7.6)", () => {
  test("offline, the row reads Not you? Needs signal, is named by that text, and does nothing on a tap", async () => {
    const worker = installWorker({ autoAck: true });
    const clear = heldAction();
    renderMenu(clear.action);
    goOnline(false);
    openMenu();

    const row = screen.getByRole("menuitem", { name: "Not you? Needs signal" });
    expect(row).toBe(switchRow());
    // The row still says what it is for, and why it is off.
    expect(row.textContent?.trim()).toBe("Not you? Needs signal");
    // WCAG 2.5.3, label in name: the name IS the visible text, so the words a
    // sighted person would speak to activate it are the name, with no override.
    expect(row).not.toHaveAttribute("aria-label");
    expect(row).toHaveAccessibleName(row.textContent!.trim());
    expect(row).toHaveAttribute("aria-disabled", "true");
    // Still focusable and still in the arrow traversal: aria-disabled, never
    // the native attribute (the busy phase's reasoning).
    expect(row).not.toBeDisabled();
    fireEvent.keyDown(screen.getByTestId("avatar-menu-popover"), { key: "End" });
    expect(document.activeElement).toBe(row);
    // Offline is not a switch in flight.
    expect(row).not.toHaveAttribute("aria-busy");

    fireEvent.click(row);
    await drain();
    expect(clear.action, "no clear offline").not.toHaveBeenCalled();
    expect(worker.posted, "and no purge either: nothing started").toHaveLength(0);
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("coming back online restores the label and the name, and the row works again", async () => {
    const clear = heldAction();
    renderMenu(clear.action);
    goOnline(false);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Not you? Needs signal" })).toBe(switchRow());

    goOnline(true);
    const row = screen.getByRole("menuitem", { name: "Not you? Switch person" });
    expect(row).toBe(switchRow());
    expect(row.textContent?.trim()).toBe("Not you? Switch person");
    expect(row).not.toHaveAttribute("aria-label");
    expect(row).toHaveAttribute("aria-disabled", "false");
    expect(within(screen.getByRole("menu")).queryByText(/needs signal/i)).toBeNull();

    tapSwitch();
    expect(clear.action, "online again, the tap clears").toHaveBeenCalledTimes(1);
    await act(async () => {
      clear.resolve({ ok: true });
      await clear.promise;
    });
  });

  test("going offline while the menu is open swaps the row in place", () => {
    const clear = heldAction();
    renderMenu(clear.action);
    openMenu();
    expect(switchRow()).toHaveAccessibleName("Not you? Switch person");
    expect(switchRow().textContent?.trim()).toBe("Not you? Switch person");

    goOnline(false);
    expect(switchRow()).toHaveAccessibleName("Not you? Needs signal");
    expect(switchRow().textContent?.trim()).toBe("Not you? Needs signal");
    expect(switchRow()).toHaveAttribute("aria-disabled", "true");
  });

  test("the menu reads the connection through useOnlineStatus, not navigator.onLine", () => {
    // navigator.onLine says online; only the hook says offline. A menu that
    // read navigator.onLine in render would show the online row here, and
    // would also mismatch its server HTML on a saved copy served with no
    // signal, which is the hazard the hook exists to close.
    expect(window.navigator.onLine).toBe(true);
    hook.answer = false;
    const clear = heldAction();
    renderMenu(clear.action);
    openMenu();

    const row = screen.getByRole("menuitem", { name: "Not you? Needs signal" });
    expect(row.textContent?.trim()).toBe("Not you? Needs signal");
    expect(row).toHaveAttribute("aria-disabled", "true");
  });
});
