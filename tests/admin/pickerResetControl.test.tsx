// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/picker/resetCrewMemberSelection", () => ({
  resetCrewMemberSelection: vi.fn(),
}));
vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({
  resetPickerEpoch: vi.fn(),
}));

import { PickerResetControl } from "@/app/admin/show/[slug]/PickerResetControl";
import { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";
import { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";
import { getDougFacing } from "@/lib/messages/lookup";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const ALICE = "aaaaaaaa-0000-0000-0000-000000000000";
const BOB = "bbbbbbbb-0000-0000-0000-000000000000";
const roster = [
  { id: ALICE, name: "Alice", role: "A2" },
  { id: BOB, name: "Bob", role: "A2" },
];

const mockMember = resetCrewMemberSelection as unknown as ReturnType<typeof vi.fn>;
const mockAll = resetPickerEpoch as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers();
});

async function flush() {
  vi.useRealTimers();
  await Promise.resolve();
  await Promise.resolve();
}

describe("PickerResetControl", () => {
  test("renders a member selector from the roster", () => {
    render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    expect(screen.getByRole("option", { name: /Alice/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Bob/ })).toBeTruthy();
  });

  test("empty roster → no selector; reset-everyone DISABLED + helper text", () => {
    render(<PickerResetControl showId={SHOW_ID} crew={[]} />);
    expect(screen.queryByTestId("picker-reset-member-select")).toBeNull();
    expect(screen.getByText(/No crew to reset yet/)).toBeTruthy();
    expect((screen.getByTestId("picker-reset-all-button") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  test("empty name+role → id-derived placeholder label", () => {
    render(
      <PickerResetControl
        showId={SHOW_ID}
        crew={[{ id: "abcdef12-0000-0000-0000-000000000000", name: "", role: "" }]}
      />,
    );
    expect(screen.getByRole("option", { name: /unnamed · abcdef12/ })).toBeTruthy();
  });

  test("per-member reset calls resetCrewMemberSelection with the selected id", async () => {
    mockMember.mockResolvedValue({ ok: true, reset_at: "2026-07-03T12:00:00Z" });
    render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    fireEvent.change(screen.getByTestId("picker-reset-member-select"), {
      target: { value: ALICE },
    });
    fireEvent.click(screen.getByTestId("picker-reset-member-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
      await flush();
    });
    expect(resetCrewMemberSelection).toHaveBeenCalledWith({ showId: SHOW_ID, crewMemberId: ALICE });
  });

  test("not-found renders benign inline notice, not the crew catalog copy", async () => {
    mockMember.mockResolvedValue({ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" });
    const { container } = render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    fireEvent.click(screen.getByTestId("picker-reset-member-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
      await flush();
    });
    await waitFor(() => {
      expect(screen.getByTestId("picker-reset-error").textContent).toMatch(
        /no longer on the roster/i,
      );
    });
    const catalog = getDougFacing("PICKER_CREW_MEMBER_NOT_FOUND");
    if (catalog) expect(container.textContent).not.toContain(catalog);
  });

  test("no raw error code string appears in the DOM after a failure", async () => {
    mockMember.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    const { container } = render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    fireEvent.click(screen.getByTestId("picker-reset-member-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
      await flush();
    });
    await waitFor(() => {
      expect(screen.getByTestId("picker-reset-error").textContent).toMatch(
        /couldn.t reset the picker/i,
      );
    });
    expect(container.textContent).not.toMatch(/PICKER_[A-Z_]+/);
  });

  test("reset-everyone calls resetPickerEpoch", async () => {
    mockAll.mockResolvedValue({ ok: true, new_epoch: 5 });
    render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    fireEvent.click(screen.getByTestId("picker-reset-all-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
      await flush();
    });
    expect(resetPickerEpoch).toHaveBeenCalledWith({ showId: SHOW_ID });
  });

  test("compound: changing the selected member while a per-member confirm is pending resets the confirm", () => {
    render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    fireEvent.change(screen.getByTestId("picker-reset-member-select"), {
      target: { value: ALICE },
    });
    fireEvent.click(screen.getByTestId("picker-reset-member-button")); // → confirm (Alice)
    expect(screen.getByTestId("picker-reset-confirm-button")).toBeTruthy();
    fireEvent.change(screen.getByTestId("picker-reset-member-select"), { target: { value: BOB } });
    // the stale Alice confirm must NOT remain
    expect(screen.queryByTestId("picker-reset-confirm-button")).toBeNull();
  });

  // PCR-1 item (c): DESIGN §focus specifies a ring PLUS a 2px offset. Every
  // focusable control (idle + confirm) must carry the offset, not just the ring.
  test("(c) every focusable control carries the DESIGN focus-ring offset", () => {
    const { container } = render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    const checkAll = () => {
      const focusables = container.querySelectorAll("button, select");
      expect(focusables.length).toBeGreaterThan(0);
      focusables.forEach((el) =>
        expect((el as HTMLElement).className).toContain("focus-visible:ring-offset-2"),
      );
    };
    checkAll(); // idle: select, per-member Reset, reset-everyone
    fireEvent.click(screen.getByTestId("picker-reset-member-button")); // → confirm
    checkAll(); // confirm + cancel
  });

  // PCR-1 (a) regression (Codex R3): the visible outcome banner must never
  // render beside the still-"resolving" confirm actions — it appears only at rest.
  test("(regression) success banner does not render beside the resolving confirm actions", async () => {
    let resolve!: (v: unknown) => void;
    mockMember.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    fireEvent.click(screen.getByTestId("picker-reset-member-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
      await Promise.resolve();
    });
    // resolving: the "Resetting…" confirm button is present; NO banner yet
    expect(screen.getByTestId("picker-reset-confirm-button")).toBeTruthy();
    expect(screen.queryByTestId("picker-reset-ok")).toBeNull();
    await act(async () => {
      resolve({ ok: true, reset_at: "2026-07-03T12:00:00Z" });
      await vi.advanceTimersByTimeAsync(0);
    });
    // settled: confirm actions gone, banner shown
    expect(screen.queryByTestId("picker-reset-confirm-button")).toBeNull();
    expect(screen.getByTestId("picker-reset-ok")).toBeTruthy();
  });

  // PCR-1 item (d): the SUCCESS banner auto-dismisses after its window; an ERROR
  // banner persists until the admin acts on it.
  const DISMISS_MS = 5_000;
  test("(d) success banner auto-dismisses after the window", async () => {
    mockMember.mockResolvedValueOnce({ ok: true, reset_at: "2026-07-03T12:00:00Z" });
    render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    fireEvent.click(screen.getByTestId("picker-reset-member-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("picker-reset-ok")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DISMISS_MS + 1);
    });
    expect(screen.queryByTestId("picker-reset-ok")).toBeNull();
  });

  test("(d) error banner does NOT auto-dismiss", async () => {
    mockMember.mockResolvedValueOnce({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    fireEvent.click(screen.getByTestId("picker-reset-member-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("picker-reset-error")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DISMISS_MS + 5_000);
    });
    expect(screen.getByTestId("picker-reset-error")).toBeTruthy();
  });

  // PCR-1 item (b): the row label is a heading (sits under the panel's <h3>),
  // not a plain <p>, so the control is reachable in the SR heading outline.
  test("(b) the row label is a heading", () => {
    render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    expect(screen.getByRole("heading", { name: /Reset name picker/i })).toBeTruthy();
  });

  // PCR-1 item (a): the success announcement must live in a live region that is
  // ALREADY mounted (and empty) before the success occurs, so SRs that skip
  // insert-time announcements on a freshly-mounted region still announce it.
  test("(a) a persistent, empty aria-live=polite status region exists at mount", () => {
    const { container } = render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    const region = container.querySelector('[role="status"][aria-live="polite"]');
    expect(region).not.toBeNull();
    // no success banner yet — the region is present but empty
    expect(screen.queryByTestId("picker-reset-ok")).toBeNull();
  });

  test("(a) the success text populates the SAME status region node captured at mount", async () => {
    mockMember.mockResolvedValue({ ok: true, reset_at: "2026-07-03T12:00:00Z" });
    const { container } = render(<PickerResetControl showId={SHOW_ID} crew={roster} />);
    // Capture the region node BEFORE any action; it must be empty and stable.
    const region = container.querySelector('[role="status"][aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region!.textContent).toBe("");
    fireEvent.click(screen.getByTestId("picker-reset-member-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
      await vi.advanceTimersByTimeAsync(0);
    });
    // The announcement swaps INTO the pre-existing node (proves it was not a
    // freshly mounted region), and the visible banner renders separately.
    expect(region!.textContent).toMatch(/pick again/i);
    expect(screen.getByTestId("picker-reset-ok")).toBeTruthy();
  });
});
