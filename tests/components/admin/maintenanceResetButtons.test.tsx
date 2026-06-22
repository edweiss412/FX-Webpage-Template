// @vitest-environment jsdom
/**
 * tests/components/admin/maintenanceResetButtons.test.tsx (Task 7 — validation-reset-button)
 *
 * Pins the public contract of the validation-only maintenance affordances:
 *   - "Reset validation data" (destructive, typed-confirm: the confirm button is
 *     DISABLED until the input EXACTLY equals "RESET").
 *   - "Reseed validation fixtures" (additive, simple two-step confirm).
 *
 * Coverage:
 *   (a) Page render-gate — the settings maintenance card renders the buttons
 *       ONLY when destructiveResetAllowed() is true; neither button is present
 *       when it is stubbed false. (Asserted by rendering the maintenance card's
 *       gate expression directly: {canReset && <MaintenanceResetButtons />}.)
 *   (b) Reset confirm is disabled until the user types "RESET" (fire input
 *       events; near-misses like "reset"/"RESETX" stay disabled).
 *   (c) All 4 validation codes resolve to a non-empty messageFor(code).dougFacing
 *       (guards invariant 5 — no raw codes; every error path has real copy).
 *   (d) On isPending the confirm button is `disabled` (the action promise is held
 *       open so the transition stays pending) — NOT a synchronous onClick
 *       self-disable (the React-19 form-action dispatch-cancel trap).
 *
 * Anti-tautology: every DOM-label assertion queries within the component root.
 * The 4-codes test asserts against the catalog data source (messageFor), not the
 * rendered container.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";

// The component imports the two server actions directly (no secret props), so we
// mock the action module and control each call's resolution per test.
const resetMock = vi.fn();
const reseedMock = vi.fn();
vi.mock("@/app/admin/settings/_actions/validationReset", () => ({
  resetValidationDataAction: (...args: unknown[]) => resetMock(...args),
  reseedValidationFixturesAction: (...args: unknown[]) => reseedMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/settings",
}));

import { MaintenanceResetButtons } from "@/components/admin/MaintenanceResetButtons";

beforeEach(() => {
  resetMock.mockReset();
  reseedMock.mockReset();
});

afterEach(() => cleanup());

const VALIDATION_CODES: MessageCode[] = [
  "VALIDATION_RESET_NOT_ALLOWED",
  "VALIDATION_RESET_NOT_ENABLED",
  "VALIDATION_RESET_FAILED",
  "VALIDATION_RESEED_FAILED",
];

describe("MaintenanceResetButtons — render gate", () => {
  // Mirrors the RSC page wiring: `{canReset && <MaintenanceResetButtons />}`.
  function Gate({ canReset }: { canReset: boolean }) {
    return <div data-testid="gate">{canReset && <MaintenanceResetButtons />}</div>;
  }

  test("renders neither button when the gate is false", () => {
    const { queryByTestId } = render(<Gate canReset={false} />);
    expect(queryByTestId("validation-reset-button")).toBeNull();
    expect(queryByTestId("validation-reseed-button")).toBeNull();
  });

  test("renders both buttons when the gate is true", () => {
    const { getByTestId } = render(<Gate canReset={true} />);
    expect(getByTestId("validation-reset-button")).toBeInTheDocument();
    expect(getByTestId("validation-reseed-button")).toBeInTheDocument();
  });
});

describe("MaintenanceResetButtons — Reset typed-confirm", () => {
  test("the confirm button is disabled until the input EXACTLY equals RESET", () => {
    const { getByTestId } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reset-button"));

    const modal = getByTestId("validation-reset-modal");
    const input = within(modal).getByTestId("validation-reset-input");
    const confirm = within(modal).getByTestId("validation-reset-confirm");

    // Empty → disabled.
    expect(confirm).toBeDisabled();

    // Near-misses stay disabled (case-sensitive, exact match only).
    fireEvent.change(input, { target: { value: "reset" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "RESETX" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: " RESET" } });
    expect(confirm).toBeDisabled();

    // Exact match → enabled.
    fireEvent.change(input, { target: { value: "RESET" } });
    expect(confirm).not.toBeDisabled();

    // Editing back to a near-miss re-disables.
    fireEvent.change(input, { target: { value: "RESETT" } });
    expect(confirm).toBeDisabled();
  });

  test("opening the confirm modal does not call the action; cancel closes it without a call", () => {
    const { getByTestId, queryByTestId } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reset-button"));
    expect(getByTestId("validation-reset-modal")).toBeInTheDocument();
    expect(resetMock).not.toHaveBeenCalled();

    fireEvent.click(
      within(getByTestId("validation-reset-modal")).getByTestId("validation-reset-cancel"),
    );
    expect(queryByTestId("validation-reset-modal")).toBeNull();
    expect(resetMock).not.toHaveBeenCalled();
  });
});

describe("MaintenanceResetButtons — Reseed simple confirm", () => {
  test("Reseed uses a two-step confirm: open, then confirm calls the action", async () => {
    reseedMock.mockResolvedValueOnce({ ok: true, count: 16 });
    const { getByTestId, queryByTestId } = render(<MaintenanceResetButtons />);

    fireEvent.click(getByTestId("validation-reseed-button"));
    const modal = getByTestId("validation-reseed-modal");
    expect(reseedMock).not.toHaveBeenCalled();

    fireEvent.click(within(modal).getByTestId("validation-reseed-confirm"));
    await waitFor(() => expect(reseedMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(getByTestId("validation-reseed-result").textContent ?? "").toContain("16"),
    );
    expect(queryByTestId("validation-reseed-modal")).toBeNull();
  });
});

describe("MaintenanceResetButtons — isPending disables the confirm", () => {
  test("the Reset confirm button is disabled while the action is pending", async () => {
    // Hold the action promise open so the transition stays pending.
    let resolveAction: (v: { ok: true; count: number }) => void = () => {};
    resetMock.mockImplementationOnce(
      () =>
        new Promise<{ ok: true; count: number }>((resolve) => {
          resolveAction = resolve;
        }),
    );

    const { getByTestId } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reset-button"));
    const modal = getByTestId("validation-reset-modal");
    fireEvent.change(within(modal).getByTestId("validation-reset-input"), {
      target: { value: "RESET" },
    });
    const confirm = within(modal).getByTestId("validation-reset-confirm");
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    // Pending: the confirm is disabled via isPending (not a self-disable in onClick).
    await waitFor(() => expect(confirm).toBeDisabled());

    // Drain the promise so the transition settles (no act() warning at teardown).
    resolveAction({ ok: true, count: 3 });
    await waitFor(() =>
      expect(getByTestId("validation-reset-result").textContent ?? "").toContain("3"),
    );
  });
});

describe("MaintenanceResetButtons — Escape-to-cancel (impeccable a11y HIGH-1)", () => {
  test("pressing Escape on the open Reset modal closes it without calling the action", () => {
    const { getByTestId, queryByTestId } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reset-button"));
    const modal = getByTestId("validation-reset-modal");
    expect(modal).toBeInTheDocument();

    fireEvent.keyDown(modal, { key: "Escape" });
    expect(queryByTestId("validation-reset-modal")).toBeNull();
    expect(resetMock).not.toHaveBeenCalled();
  });

  test("pressing Escape on the open Reseed modal closes it without calling the action", () => {
    const { getByTestId, queryByTestId } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reseed-button"));
    const modal = getByTestId("validation-reseed-modal");
    expect(modal).toBeInTheDocument();

    fireEvent.keyDown(modal, { key: "Escape" });
    expect(queryByTestId("validation-reseed-modal")).toBeNull();
    expect(reseedMock).not.toHaveBeenCalled();
  });

  test("pressing Escape while the Reset action is pending does NOT close the modal", async () => {
    // Hold the action promise open so the transition stays pending.
    let resolveAction: (v: { ok: true; count: number }) => void = () => {};
    resetMock.mockImplementationOnce(
      () =>
        new Promise<{ ok: true; count: number }>((resolve) => {
          resolveAction = resolve;
        }),
    );

    const { getByTestId, queryByTestId } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reset-button"));
    const modal = getByTestId("validation-reset-modal");
    fireEvent.change(within(modal).getByTestId("validation-reset-input"), {
      target: { value: "RESET" },
    });
    fireEvent.click(within(modal).getByTestId("validation-reset-confirm"));

    // While pending, the modal is still open and Escape must NOT interrupt it.
    await waitFor(() =>
      expect(within(modal).getByTestId("validation-reset-confirm")).toBeDisabled(),
    );
    fireEvent.keyDown(modal, { key: "Escape" });
    expect(getByTestId("validation-reset-modal")).toBeInTheDocument();

    // Drain the promise so the transition settles (no act() warning at teardown).
    resolveAction({ ok: true, count: 3 });
    await waitFor(() => expect(queryByTestId("validation-reset-modal")).toBeNull());
  });
});

describe("MaintenanceResetButtons — focus restoration after completion (impeccable a11y HIGH-2)", () => {
  test("after a completed Reset the focus does not drop to <body> and lands on a focusable element", async () => {
    resetMock.mockResolvedValueOnce({ ok: true, count: 3 });
    const { getByTestId } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reset-button"));
    const modal = getByTestId("validation-reset-modal");
    fireEvent.change(within(modal).getByTestId("validation-reset-input"), {
      target: { value: "RESET" },
    });
    fireEvent.click(within(modal).getByTestId("validation-reset-confirm"));

    // Wait for the action to settle: modal closed + result rendered.
    await waitFor(() =>
      expect(getByTestId("validation-reset-result").textContent ?? "").toContain("3"),
    );

    // Focus must not silently drop to <body>; it should land on a focusable
    // (non-disabled) element — the re-enabled trigger.
    await waitFor(() => {
      const active = document.activeElement;
      expect(active).not.toBe(document.body);
      expect(active).not.toBeNull();
      expect((active as HTMLElement).hasAttribute("disabled")).toBe(false);
    });
  });

  test("after a completed Reseed the focus does not drop to <body>", async () => {
    reseedMock.mockResolvedValueOnce({ ok: true, count: 16 });
    const { getByTestId } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reseed-button"));
    fireEvent.click(
      within(getByTestId("validation-reseed-modal")).getByTestId("validation-reseed-confirm"),
    );

    await waitFor(() =>
      expect(getByTestId("validation-reseed-result").textContent ?? "").toContain("16"),
    );

    await waitFor(() => {
      const active = document.activeElement;
      expect(active).not.toBe(document.body);
      expect(active).not.toBeNull();
      expect((active as HTMLElement).hasAttribute("disabled")).toBe(false);
    });
  });
});

describe("MaintenanceResetButtons — error copy resolves (invariant 5)", () => {
  test("every validation code resolves to a non-empty dougFacing string", () => {
    for (const code of VALIDATION_CODES) {
      const doug = messageFor(code).dougFacing;
      expect(typeof doug).toBe("string");
      expect((doug ?? "").trim().length).toBeGreaterThan(0);
      // Never the raw code itself.
      expect(doug).not.toBe(code);
    }
  });

  test("a failed reset renders the catalog dougFacing, never the raw code", async () => {
    resetMock.mockResolvedValueOnce({ ok: false, code: "VALIDATION_RESET_FAILED" });
    const { getByTestId, container } = render(<MaintenanceResetButtons />);
    fireEvent.click(getByTestId("validation-reset-button"));
    const modal = getByTestId("validation-reset-modal");
    fireEvent.change(within(modal).getByTestId("validation-reset-input"), {
      target: { value: "RESET" },
    });
    fireEvent.click(within(modal).getByTestId("validation-reset-confirm"));

    await waitFor(() => expect(getByTestId("validation-reset-error")).toBeInTheDocument());
    expect(getByTestId("validation-reset-error").textContent ?? "").toContain(
      messageFor("VALIDATION_RESET_FAILED").dougFacing ?? "",
    );
    expect(container.textContent ?? "").not.toContain("VALIDATION_RESET_FAILED");
  });
});
