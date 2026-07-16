// @vitest-environment jsdom
/**
 * tests/components/roleMappingSettingsRows.test.tsx
 *
 * The settings "Roles you've added" surface (spec 2026-07-15 §8.2):
 *
 *   1. `RolesSettingsView` — the presentational page body. Renders the row list
 *      on ok, the empty state on ok+[], and an EXPLICIT load-failure state on
 *      infra_error (the empty state must be UNREACHABLE on error — a masked infra
 *      fault must never read as "no roles added", invariant 9 / plan-R2 F5).
 *
 *   2. `RoleMappingRow` — view (label + chips + who/when + actions), inline edit
 *      (reopens the checkbox set → `updateRoleTokenMapping`), two-step inline
 *      remove (`deleteRoleTokenMapping`), and per-row state isolation (one row's
 *      edit never migrates into another row's open remove-confirm).
 *
 * Actions mocked at module level. Every asserted string comes from
 * `roleRecognizeCopy`.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RoleMappingListResult } from "@/lib/admin/roleTokenMappings";
import type { RoleMappingRowData } from "@/app/admin/settings/roles/RoleMappingRow";
import { RolesSettingsView } from "@/app/admin/settings/roles/RolesSettingsView";
import { RoleMappingRow } from "@/app/admin/settings/roles/RoleMappingRow";
import * as COPY from "@/components/admin/roleRecognizeCopy";
import {
  updateRoleTokenMapping,
  deleteRoleTokenMapping,
} from "@/app/admin/settings/_actions/roleTokenMappings";

vi.mock("@/app/admin/settings/_actions/roleTokenMappings", () => ({
  updateRoleTokenMapping: vi.fn(),
  deleteRoleTokenMapping: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROW: RoleMappingRowData = {
  token: "DRONE OP",
  grants: ["A1", "V1"],
  decidedByLabel: "You",
  decidedAtLabel: "Jun 12",
};

function row(over: Partial<RoleMappingRowData> = {}): RoleMappingRowData {
  return { ...ROW, ...over };
}

describe("RolesSettingsView — load/empty/error branches", () => {
  it("renders title, subtitle and one row per mapping on ok", () => {
    const result: RoleMappingListResult = {
      kind: "ok",
      rows: [
        {
          token: "DRONE OP",
          grants: ["A1", "V1"],
          decidedBy: "you@x.com",
          decidedAt: "2026-06-12T12:00:00.000Z",
        },
        {
          token: "SOUND TECH",
          grants: [],
          decidedBy: "priya@x.com",
          decidedAt: "2026-05-30T12:00:00.000Z",
        },
      ],
    };
    render(<RolesSettingsView result={result} actorEmail="you@x.com" />);
    expect(screen.getByText(COPY.SETTINGS_TITLE)).toBeInTheDocument();
    expect(screen.getByText(COPY.SETTINGS_SUBTITLE)).toBeInTheDocument();
    expect(screen.getByText("DRONE OP")).toBeInTheDocument();
    expect(screen.getByText("SOUND TECH")).toBeInTheDocument();
    expect(screen.queryByTestId("roles-settings-empty")).toBeNull();
    expect(screen.queryByTestId("roles-settings-load-error")).toBeNull();
  });

  it("ok + no rows → empty state, never the load-error state", () => {
    render(<RolesSettingsView result={{ kind: "ok", rows: [] }} actorEmail="you@x.com" />);
    expect(screen.getByTestId("roles-settings-empty")).toBeInTheDocument();
    expect(screen.getByText(COPY.EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(COPY.EMPTY_BODY)).toBeInTheDocument();
    expect(screen.queryByTestId("roles-settings-load-error")).toBeNull();
  });

  it("infra_error → explicit load-failure, never the empty state", () => {
    render(<RolesSettingsView result={{ kind: "infra_error" }} actorEmail="you@x.com" />);
    expect(screen.getByTestId("roles-settings-load-error")).toBeInTheDocument();
    expect(screen.getByText(COPY.LOAD_FAILURE)).toBeInTheDocument();
    expect(screen.queryByTestId("roles-settings-empty")).toBeNull();
    expect(screen.queryByText(COPY.EMPTY_TITLE)).toBeNull();
  });

  it("shows the decider identity as You when it is the current admin, else the email", () => {
    const result: RoleMappingListResult = {
      kind: "ok",
      rows: [
        {
          token: "DRONE OP",
          grants: ["A1"],
          decidedBy: "you@x.com",
          decidedAt: "2026-06-12T12:00:00.000Z",
        },
        {
          token: "SOUND TECH",
          grants: ["A1"],
          decidedBy: "priya@x.com",
          decidedAt: "2026-05-30T12:00:00.000Z",
        },
      ],
    };
    render(<RolesSettingsView result={result} actorEmail="you@x.com" />);
    expect(screen.getByText(new RegExp(`^${COPY.YOU_LABEL} ·`))).toBeInTheDocument();
    expect(screen.getByText(/^priya@x\.com ·/)).toBeInTheDocument();
  });
});

describe("RoleMappingRow — view", () => {
  it("renders the label, a chip per grant, and the who/when meta", () => {
    render(<RoleMappingRow row={row()} />);
    expect(screen.getByText("DRONE OP")).toBeInTheDocument();
    expect(screen.getByText(COPY.CHECKBOX_AUDIO)).toBeInTheDocument();
    expect(screen.getByText(COPY.CHECKBOX_VIDEO)).toBeInTheDocument();
    expect(screen.getByText(`${COPY.YOU_LABEL} · Jun 12`)).toBeInTheDocument();
  });

  it("empty grants → a single dashed Standard page only chip", () => {
    render(<RoleMappingRow row={row({ grants: [] })} />);
    const chip = screen.getByTestId("role-mapping-chip");
    expect(chip).toHaveTextContent(COPY.STANDARD_PAGE_CHIP);
  });

  it("financial grant chip is flagged distinct (amber, not a plain chip)", () => {
    render(<RoleMappingRow row={row({ grants: ["FINANCIALS"] })} />);
    const chip = screen.getByTestId("role-mapping-chip");
    expect(chip).toHaveAttribute("data-financial", "true");
    expect(chip).toHaveTextContent(COPY.CHECKBOX_FINANCIAL);
  });
});

describe("RoleMappingRow — edit", () => {
  it("Edit reopens the checkbox set prefilled and saves through updateRoleTokenMapping", async () => {
    vi.mocked(updateRoleTokenMapping).mockResolvedValue({ ok: true });
    render(<RoleMappingRow row={row()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.EDIT_LABEL }));
    expect(screen.getByTestId("role-mapping-check-A1")).toBeChecked();
    expect(screen.getByTestId("role-mapping-check-V1")).toBeChecked();
    expect(screen.getByTestId("role-mapping-check-L1")).not.toBeChecked();
    fireEvent.click(screen.getByTestId("role-mapping-check-V1")); // drop Video
    fireEvent.click(screen.getByTestId("role-mapping-check-L1")); // add Lighting
    fireEvent.click(screen.getByRole("button", { name: COPY.SAVE_CHANGES_LABEL }));
    await waitFor(() => expect(updateRoleTokenMapping).toHaveBeenCalledTimes(1));
    expect(updateRoleTokenMapping).toHaveBeenCalledWith("DRONE OP", ["A1", "L1"]);
  });

  it("shows the saving label while the edit is in flight", async () => {
    let resolve!: (v: { ok: true }) => void;
    vi.mocked(updateRoleTokenMapping).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<RoleMappingRow row={row()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.EDIT_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: COPY.SAVE_CHANGES_LABEL }));
    await waitFor(() =>
      expect(screen.getByTestId("role-mapping-save")).toHaveTextContent(COPY.SAVING_CHANGES_LABEL),
    );
    resolve({ ok: true });
  });

  it("stale edit result → stays in edit with the benign notice (not error styling)", async () => {
    vi.mocked(updateRoleTokenMapping).mockResolvedValue({ ok: false, code: "stale" });
    render(<RoleMappingRow row={row()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.EDIT_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: COPY.SAVE_CHANGES_LABEL }));
    const notice = await screen.findByTestId("role-mapping-edit-notice");
    expect(notice).toHaveTextContent(COPY.STALE_COPY);
    expect(notice).toHaveAttribute("role", "alert");
    // still in edit (checklist present), selections kept
    expect(screen.getByTestId("role-mapping-check-A1")).toBeChecked();
  });

  it("failed edit → stays in edit with the plain error, selections kept, and clears on retry", async () => {
    vi.mocked(updateRoleTokenMapping).mockResolvedValue({ ok: false, code: "infra_error" });
    render(<RoleMappingRow row={row()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.EDIT_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: COPY.SAVE_CHANGES_LABEL }));
    const notice = await screen.findByTestId("role-mapping-edit-notice");
    expect(notice).toHaveTextContent(COPY.ERROR_COPY);
    expect(screen.getByTestId("role-mapping-check-A1")).toBeChecked();
    // a fresh selection dismisses the notice
    fireEvent.click(screen.getByTestId("role-mapping-check-L1"));
    expect(screen.queryByTestId("role-mapping-edit-notice")).toBeNull();
  });
});

describe("RoleMappingRow — remove (two-step)", () => {
  it("Remove → confirm copy → Yes deletes through deleteRoleTokenMapping", async () => {
    vi.mocked(deleteRoleTokenMapping).mockResolvedValue({ ok: true });
    render(<RoleMappingRow row={row()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.REMOVE_LABEL }));
    expect(screen.getByText(COPY.REMOVE_CONFIRM)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: COPY.REMOVE_CONFIRM_YES }));
    await waitFor(() => expect(deleteRoleTokenMapping).toHaveBeenCalledTimes(1));
    expect(deleteRoleTokenMapping).toHaveBeenCalledWith("DRONE OP");
  });

  it("Keep it dismisses the confirm without deleting", () => {
    render(<RoleMappingRow row={row()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.REMOVE_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: COPY.REMOVE_KEEP }));
    expect(screen.queryByText(COPY.REMOVE_CONFIRM)).toBeNull();
    expect(deleteRoleTokenMapping).not.toHaveBeenCalled();
    // back to the view actions
    expect(screen.getByRole("button", { name: COPY.EDIT_LABEL })).toBeInTheDocument();
  });

  it("failed delete STAYS in confirm with a plain error — never reads as removed", async () => {
    vi.mocked(deleteRoleTokenMapping).mockResolvedValue({ ok: false, code: "infra_error" });
    render(<RoleMappingRow row={row()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.REMOVE_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: COPY.REMOVE_CONFIRM_YES }));
    const notice = await screen.findByTestId("role-mapping-remove-notice");
    expect(notice).toHaveTextContent(COPY.ERROR_COPY);
    expect(notice).toHaveAttribute("role", "alert");
    // still in confirm — the confirm copy + Keep-it out are both present
    expect(screen.getByText(COPY.REMOVE_CONFIRM)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY.REMOVE_KEEP })).toBeInTheDocument();
  });
});

describe("RoleMappingRow — focus + live regions", () => {
  it("opening edit moves focus to the panel heading", async () => {
    render(<RoleMappingRow row={row()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.EDIT_LABEL }));
    await waitFor(() => expect(screen.getByText(COPY.PANEL_HEADING)).toHaveFocus());
  });
});

describe("RoleMappingRow — per-row state isolation (compound transition)", () => {
  it("opening one row's edit does not disturb another row's open remove-confirm", () => {
    render(
      <ul>
        <RoleMappingRow row={row({ token: "DRONE OP" })} />
        <RoleMappingRow row={row({ token: "SOUND TECH" })} />
      </ul>,
    );
    const rows = screen.getAllByTestId("role-mapping-row");
    const droneRow = rows[0]!;
    const soundRow = rows[1]!;

    // Open remove-confirm on SOUND TECH
    fireEvent.click(within(soundRow).getByRole("button", { name: COPY.REMOVE_LABEL }));
    expect(within(soundRow).getByText(COPY.REMOVE_CONFIRM)).toBeInTheDocument();

    // Open edit on DRONE OP — SOUND TECH's confirm stays put, DRONE has no confirm
    fireEvent.click(within(droneRow).getByRole("button", { name: COPY.EDIT_LABEL }));
    expect(within(droneRow).getByTestId("role-mapping-check-A1")).toBeInTheDocument();
    expect(within(soundRow).getByText(COPY.REMOVE_CONFIRM)).toBeInTheDocument();
    expect(within(droneRow).queryByText(COPY.REMOVE_CONFIRM)).toBeNull();
  });
});
