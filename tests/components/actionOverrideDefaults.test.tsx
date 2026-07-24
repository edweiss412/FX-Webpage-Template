// @vitest-environment jsdom
/**
 * tests/components/actionOverrideDefaults.test.tsx
 * (spec 2026-07-23-gallery-action-outcomes §3.3)
 *
 * The override-seam contract for the 3 modal controls that call server actions
 * by direct import. Two pins per control:
 *
 *  1. NO provider (production) -> the REAL imported action is called. This is
 *     the byte-identical-production guarantee; the components' own suites also
 *     exercise it, but here it is pinned against the seam explicitly.
 *  2. Provider mounted (gallery) -> the override is called INSTEAD, and the
 *     real import is never reached.
 *
 * Failure modes caught: a call site that ignores the override; a call site
 * that stops calling the real action when no provider exists; a hook that
 * throws without a provider.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const crewResetMock = vi.hoisted(() => vi.fn());
const rotateMock = vi.hoisted(() => vi.fn());
const epochMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/picker/resetCrewMemberSelection", () => ({
  resetCrewMemberSelection: crewResetMock,
}));
vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: rotateMock }));
vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({ resetPickerEpoch: epochMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { CrewBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import { RotateShareTokenButton } from "@/app/admin/show/[slug]/RotateShareTokenButton";
import { PickerResetControl } from "@/app/admin/show/[slug]/PickerResetControl";
import {
  DevActionOverrideContext,
  type DevActionOverrides,
} from "@/components/admin/dev/actionOverrideContext";
import type { CrewMemberRow } from "@/lib/parser/types";

const SHOW_ID = "11111111-2222-4333-8444-555555555555";
const CREW_ID = "c1111111-1111-4111-8111-111111111111";

const member: CrewMemberRow = {
  name: "Alex Rodrigues",
  email: "alex@x.test",
  phone: "5125550101",
  role: "BO",
  role_flags: [],
  date_restriction: { kind: "none" } as CrewMemberRow["date_restriction"],
  stage_restriction: { kind: "none" } as CrewMemberRow["stage_restriction"],
  flight_info: null,
};

const withProvider = (overrides: DevActionOverrides, ui: React.ReactElement) => (
  <DevActionOverrideContext.Provider value={overrides}>{ui}</DevActionOverrideContext.Provider>
);

const crewUi = () => (
  <CrewBreakdown
    dfid="df-1"
    members={[member]}
    actions={{ showId: SHOW_ID, slug: "test-show", enabled: true, crewIds: [CREW_ID] }}
  />
);

const driveCrewReset = async () => {
  fireEvent.click(screen.getByTestId(`crew-row-menu-button-${CREW_ID}`));
  fireEvent.click(screen.getByTestId(`crew-row-reset-item-${CREW_ID}`));
  fireEvent.click(screen.getByTestId("crew-row-reset-confirm-go"));
};

const driveRotate = async () => {
  fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
  fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
};

const drivePickerReset = async () => {
  fireEvent.click(screen.getByTestId("picker-reset-all-button"));
  fireEvent.click(screen.getByTestId("picker-reset-confirm-button"));
};

beforeEach(() => {
  crewResetMock.mockReset().mockResolvedValue({ ok: true, reset_at: "2026-07-01T00:00:00.000Z" });
  rotateMock.mockReset().mockResolvedValue({ ok: true, new_share_token: "t", new_epoch: 2 });
  epochMock.mockReset().mockResolvedValue({ ok: true, new_epoch: 2 });
});
afterEach(cleanup);

describe("no provider (production): real imports are called", () => {
  it("CrewRowActions calls the real resetCrewMemberSelection", async () => {
    render(crewUi());
    await driveCrewReset();
    await vi.waitFor(() =>
      expect(crewResetMock).toHaveBeenCalledWith({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    );
  });

  it("RotateShareTokenButton calls the real rotateShareToken", async () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug="test-show" />);
    await driveRotate();
    await vi.waitFor(() => expect(rotateMock).toHaveBeenCalledWith({ showId: SHOW_ID }));
  });

  it("PickerResetControl calls the real resetPickerEpoch", async () => {
    render(
      <PickerResetControl showId={SHOW_ID} crew={[{ id: CREW_ID, name: "Alex", role: "BO" }]} />,
    );
    await drivePickerReset();
    await vi.waitFor(() => expect(epochMock).toHaveBeenCalledWith({ showId: SHOW_ID }));
  });
});

describe("provider mounted (gallery): overrides are called instead", () => {
  it("CrewRowActions uses the override", async () => {
    const override = vi.fn(
      async () => ({ ok: true, reset_at: "2026-07-01T00:00:00.000Z" }) as const,
    );
    render(withProvider({ resetCrewMemberSelection: override }, crewUi()));
    await driveCrewReset();
    await vi.waitFor(() =>
      expect(override).toHaveBeenCalledWith({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    );
    expect(crewResetMock).not.toHaveBeenCalled();
  });

  it("RotateShareTokenButton uses the override", async () => {
    const override = vi.fn(async () => ({ ok: true, new_share_token: "n", new_epoch: 3 }) as const);
    render(
      withProvider(
        { rotateShareToken: override },
        <RotateShareTokenButton showId={SHOW_ID} slug="test-show" />,
      ),
    );
    await driveRotate();
    await vi.waitFor(() => expect(override).toHaveBeenCalledWith({ showId: SHOW_ID }));
    expect(rotateMock).not.toHaveBeenCalled();
  });

  it("PickerResetControl uses the override", async () => {
    const override = vi.fn(async () => ({ ok: true, new_epoch: 3 }) as const);
    render(
      withProvider(
        { resetPickerEpoch: override },
        <PickerResetControl showId={SHOW_ID} crew={[{ id: CREW_ID, name: "Alex", role: "BO" }]} />,
      ),
    );
    await drivePickerReset();
    await vi.waitFor(() => expect(override).toHaveBeenCalledWith({ showId: SHOW_ID }));
    expect(epochMock).not.toHaveBeenCalled();
  });
});
