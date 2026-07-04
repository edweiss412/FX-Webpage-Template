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
    expect((screen.getByTestId("picker-reset-all-button") as HTMLButtonElement).disabled).toBe(true);
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
    fireEvent.change(screen.getByTestId("picker-reset-member-select"), { target: { value: ALICE } });
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
      expect(screen.getByTestId("picker-reset-error").textContent).toMatch(/no longer on the roster/i);
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
      expect(screen.getByTestId("picker-reset-error").textContent).toMatch(/couldn.t reset the picker/i);
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
    fireEvent.change(screen.getByTestId("picker-reset-member-select"), { target: { value: ALICE } });
    fireEvent.click(screen.getByTestId("picker-reset-member-button")); // → confirm (Alice)
    expect(screen.getByTestId("picker-reset-confirm-button")).toBeTruthy();
    fireEvent.change(screen.getByTestId("picker-reset-member-select"), { target: { value: BOB } });
    // the stale Alice confirm must NOT remain
    expect(screen.queryByTestId("picker-reset-confirm-button")).toBeNull();
  });
});
