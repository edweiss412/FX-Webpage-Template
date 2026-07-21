// @vitest-environment jsdom
/**
 * tests/components/admin/dev/materializeCard.test.tsx
 * (spec 2026-07-20-attention-scenario-gallery §5.3, §7.4, §9)
 *
 * The dev-panel card that drives Apply and Clear. The assertions that matter
 * most are about the SUBMITTED FormData: the two verbs share their inputs, so a
 * card that rendered the controls but posted a partial payload would look
 * correct and refuse server-side for a reason the operator cannot see.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MaterializeCard } from "@/components/admin/dev/MaterializeCard";
import type { MaterializeCardProps } from "@/components/admin/dev/MaterializeCard";
import type { MaterializeResult } from "@/lib/dev/materialize/run";

afterEach(cleanup);

function props(over: Partial<MaterializeCardProps> = {}): MaterializeCardProps {
  return {
    scenarios: [
      { id: "t3-sheet-missing-mid-parse", label: "Sheet went missing mid-parse" },
      { id: "t3-crew-collision-with-warnings", label: "Crew email collision" },
    ],
    applyAction: vi.fn(async (): Promise<MaterializeResult> => ({ kind: "refused", reason: "" })),
    clearAction: vi.fn(async (): Promise<MaterializeResult> => ({ kind: "refused", reason: "" })),
    lastResult: null,
    ...over,
  };
}

/** The FormData a mocked action received on its first call. */
function submitted(action: unknown): FormData {
  const mock = action as { mock: { calls: unknown[][] } };
  const fd = mock.mock.calls[0]?.[0];
  if (!(fd instanceof FormData)) throw new Error("action was not called with FormData");
  return fd;
}

const env = () => screen.getByLabelText(/environment/i);
const applyButton = () => screen.getByRole("button", { name: /^apply/i });
const clearButton = () => screen.getByRole("button", { name: /^clear/i });

describe("MaterializeCard — the submitted payload", () => {
  test("Apply posts the scenario, the slug, and the target together", () => {
    const p = props();
    render(<MaterializeCard {...p} />);
    fireEvent.change(screen.getByLabelText(/show slug/i), { target: { value: "demo-show" } });
    fireEvent.change(screen.getByLabelText(/scenario/i), {
      target: { value: "t3-crew-collision-with-warnings" },
    });
    fireEvent.click(applyButton());

    const fd = submitted(p.applyAction);
    expect(fd.get("slug")).toBe("demo-show");
    expect(fd.get("scenario")).toBe("t3-crew-collision-with-warnings");
    expect(fd.get("target")).toBe("local");
  });

  test("Clear posts the SAME shared fields, so the two verbs cannot disagree", () => {
    // The failure this catches: shared controls rendered once, but only the
    // Apply form carrying them, so Clear posts an empty slug and is refused for
    // a reason that looks like a server bug.
    const p = props();
    render(<MaterializeCard {...p} />);
    fireEvent.change(screen.getByLabelText(/show slug/i), { target: { value: "demo-show" } });
    fireEvent.change(env(), { target: { value: "validation" } });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(clearButton());

    const fd = submitted(p.clearAction);
    expect(fd.get("slug")).toBe("demo-show");
    expect(fd.get("target")).toBe("validation");
    expect(fd.get("confirm")).toBe("VALIDATION");
  });

  test("an unconfirmed validation submit posts no confirmation token", () => {
    const p = props();
    render(<MaterializeCard {...p} />);
    fireEvent.change(screen.getByLabelText(/show slug/i), { target: { value: "demo-show" } });
    fireEvent.change(env(), { target: { value: "validation" } });
    fireEvent.click(applyButton());
    expect(submitted(p.applyAction).get("confirm")).toBeNull();
  });
});

describe("MaterializeCard — the confirmation gate", () => {
  test("the confirmation control appears only for the validation target", () => {
    render(<MaterializeCard {...props()} />);
    expect(screen.queryByLabelText(/confirm/i)).not.toBeInTheDocument();
    fireEvent.change(env(), { target: { value: "validation" } });
    expect(screen.getByLabelText(/confirm/i)).toBeInTheDocument();
  });

  test("switching target away and back resets confirmation to unconfirmed", () => {
    // Otherwise a confirmation given once silently authorizes every later
    // validation write in the same session.
    render(<MaterializeCard {...props()} />);
    fireEvent.change(env(), { target: { value: "validation" } });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    expect(screen.getByLabelText(/confirm/i)).toBeChecked();
    fireEvent.change(env(), { target: { value: "local" } });
    fireEvent.change(env(), { target: { value: "validation" } });
    expect(screen.getByLabelText(/confirm/i)).not.toBeChecked();
  });
});

describe("MaterializeCard — the result readout", () => {
  const OK: MaterializeResult = {
    kind: "ok",
    alerts: 2,
    holds: 0,
    warnings: "untouched",
    skipped: [],
  };

  test("a result present AT MOUNT renders, without needing a submit first", () => {
    // The redirect-and-render flow delivers lastResult on a fresh mount, so a
    // card that only revealed results after its own submit would show nothing.
    render(<MaterializeCard {...props({ lastResult: OK })} />);
    expect(screen.getByTestId("result")).toBeInTheDocument();
  });

  test("a displayed result clears when any control changes", () => {
    render(<MaterializeCard {...props({ lastResult: OK })} />);
    expect(screen.getByTestId("result")).toBeInTheDocument();
    fireEvent.change(env(), { target: { value: "validation" } });
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
  });

  test("a NEW result re-opens the readout after a previous one was dismissed", async () => {
    // Without resetting the dismissal, the first control change silences every
    // subsequent outcome for the life of the mount.
    //
    // Driven through the ACTION RETURN rather than a changed prop: a bare
    // `action={fn}` discards the return value, so useActionState is the only
    // path a live outcome takes, and a prop-swap test would pass against a card
    // that never surfaces a real result.
    const p = props({
      lastResult: OK,
      applyAction: vi.fn(
        async (): Promise<MaterializeResult> => ({ kind: "refused", reason: "show_archived" }),
      ),
    });
    render(<MaterializeCard {...p} />);
    fireEvent.change(env(), { target: { value: "validation" } });
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(applyButton());
    });
    expect(screen.getByTestId("result")).toBeInTheDocument();
    expect(screen.getByTestId("result").textContent ?? "").toContain("show_archived");
  });

  test("a refusal renders operator copy, and the raw reason only as developer detail", () => {
    render(
      <MaterializeCard {...props({ lastResult: { kind: "refused", reason: "show_archived" } })} />,
    );
    const result = screen.getByTestId("result");
    // The headline must not be the bare code.
    expect(screen.getByTestId("result-headline").textContent ?? "").not.toContain("show_archived");
    expect((screen.getByTestId("result-headline").textContent ?? "").length).toBeGreaterThan(10);
    // The code is still available, because this is a developer instrument.
    expect(result.textContent ?? "").toContain("show_archived");
  });

  test("a partial result names what committed, so a retry decision is possible", () => {
    render(
      <MaterializeCard
        {...props({
          lastResult: {
            kind: "partial",
            committed: { alerts: 2, holds: 1 },
            failedStep: "writeWarnings",
            message: "late",
          },
        })}
      />,
    );
    const text = screen.getByTestId("result").textContent ?? "";
    expect(text).toContain("writeWarnings");
    expect(text).toMatch(/2/);
  });

  test("skipped codes are named individually, not just counted", () => {
    render(
      <MaterializeCard
        {...props({
          lastResult: {
            kind: "ok",
            alerts: 1,
            holds: 0,
            warnings: "written",
            skipped: [{ code: "SYNC_STALLED", reason: "unresolved_row_present" }],
          },
        })}
      />,
    );
    expect(screen.getByTestId("result").textContent ?? "").toContain("SYNC_STALLED");
  });
});

describe("MaterializeCard — mechanical UI invariants", () => {
  test("every control meets the tap-target minimum", () => {
    render(<MaterializeCard {...props()} />);
    for (const el of [...screen.getAllByRole("button"), ...screen.getAllByRole("combobox")]) {
      expect(el.className, el.textContent ?? "").toContain("min-h-tap-min");
    }
  });

  test("the Clear control states that it removes ALL synthetic rows for the show", () => {
    render(<MaterializeCard {...props()} />);
    expect(screen.getByTestId("clear-scope-note").textContent ?? "").toMatch(
      /all synthetic rows for this show/i,
    );
  });

  test("no user-visible copy contains an em-dash", () => {
    render(<MaterializeCard {...props({ lastResult: { kind: "infra_error", message: "x" } })} />);
    expect(document.body.textContent ?? "").not.toContain("—");
  });
});
