// @vitest-environment jsdom
/**
 * EMPIRICAL PROBE (spec 2026-08-15-auth-picker-hardening §2.3) — NOT a shipped test.
 * Verifies the exact close/pending/reopen lifecycle the failure-state design relies on:
 * local useState + useTransition, state owned by an always-mounted parent, alert rendered
 * only inside the `{open ? … }` popover, reset-on-open. Run to produce the data the spec cites.
 */
import { useState, useTransition } from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function Harness({ action }: { action: () => Promise<{ ok: boolean }> }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "error">("idle");
  const [pending, start] = useTransition();
  const openMenu = () => {
    setStatus("idle"); // reset-on-open
    setOpen(true);
  };
  const submit = () => {
    if (pending) return; // R4-F1: aria-disabled item stays focusable; guard re-entry here
    setStatus("idle");
    start(async () => {
      const r = await action();
      if (!r.ok) setStatus("error");
    });
  };
  return (
    <div>
      <button data-testid="trigger" onClick={openMenu}>open</button>
      <button data-testid="close" onClick={() => setOpen(false)}>close</button>
      {open ? (
        <div data-testid="popover">
          <button data-testid="submit" aria-disabled={pending} onClick={submit}>switch</button>
          {status === "error" ? <div role="alert">Couldn't switch. Please try again.</div> : null}
        </div>
      ) : null}
    </div>
  );
}

describe("PROBE: switch-person close/pending/reopen race", () => {
  it("failure WHILE OPEN shows the alert", async () => {
    const d = deferred<{ ok: boolean }>();
    render(<Harness action={() => d.promise} />);
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("submit"));
    await act(async () => {
      d.resolve({ ok: false });
      await d.promise;
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("close-while-pending then resolve-failure does NOT throw and leaves nothing rendered", async () => {
    const d = deferred<{ ok: boolean }>();
    render(<Harness action={() => d.promise} />);
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("submit"));
    fireEvent.click(screen.getByTestId("close")); // close while the promise is still pending
    await act(async () => {
      d.resolve({ ok: false }); // resolves after close — setState on a MOUNTED parent, alert not rendered
      await d.promise;
    });
    expect(screen.queryByTestId("popover")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull(); // nothing shown while closed
  });

  it("reopen after a close-while-pending failure shows NO stale alert (reset-on-open)", async () => {
    const d = deferred<{ ok: boolean }>();
    render(<Harness action={() => d.promise} />);
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("submit"));
    fireEvent.click(screen.getByTestId("close"));
    await act(async () => {
      d.resolve({ ok: false });
      await d.promise;
    });
    fireEvent.click(screen.getByTestId("trigger")); // reopen
    await waitFor(() => expect(screen.getByTestId("popover")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull(); // reset-on-open cleared it
  });

  it("REOPEN WHILE STILL PENDING (Closed→Open-pending): submit disabled, no alert; then failure shows the alert (R3-F1)", async () => {
    const d = deferred<{ ok: boolean }>();
    render(<Harness action={() => d.promise} />);
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("submit"));
    fireEvent.click(screen.getByTestId("close"));
    // reopen BEFORE the promise settles — the transition (pending) persists on the mounted parent
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("popover")).toBeTruthy();
    // R4-F1: aria-disabled (focusable), NOT native disabled — arrow nav still reaches it
    expect(screen.getByTestId("submit").getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByTestId("submit") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull(); // idle (reset), pending, no error yet
    await act(async () => {
      d.resolve({ ok: false }); // settles while OPEN → alert appears
      await d.promise;
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("submit").getAttribute("aria-disabled")).toBe("false"); // re-enabled
  });
});
