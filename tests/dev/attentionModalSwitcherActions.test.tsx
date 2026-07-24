// @vitest-environment jsdom
/**
 * tests/dev/attentionModalSwitcherActions.test.tsx
 * (spec 2026-07-23-gallery-action-outcomes §3.1/§3.3 - ScenarioMount wiring)
 *
 * Failure modes: scripts leaking across scenarios; the override provider never
 * mounted; the guard mount lost in the relocation; scripted closures not
 * reaching the modal props.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

let capturedProps: Record<string, unknown> = {};
let capturedOverrides: unknown = "unset";
vi.mock("@/components/admin/showpage/PublishedReviewModal", async () => {
  // The mock consumes the REAL override context so the test can observe the
  // provider value exactly where the production tree would read it.
  const { useContext } = await import("react");
  const { DevActionOverrideContext } = await import(
    "@/components/admin/dev/actionOverrideContext"
  );
  return {
    PublishedReviewModal: (props: Record<string, unknown>) => {
      capturedProps = props;
      capturedOverrides = useContext(DevActionOverrideContext);
      return <div data-testid="mock-modal" />;
    },
  };
});

let capturedScripts: unknown = "unset";
vi.mock("@/components/admin/dev/GalleryWriteGuard", () => ({
  GalleryWriteGuard: (props: { scripts?: unknown }) => {
    capturedScripts = props.scripts;
    return null;
  },
}));

import { AttentionModalSwitcher } from "@/components/admin/dev/AttentionModalSwitcher";
import { NOOP_ACTIONS } from "@/lib/dev/galleryActionScripts";
import type { GalleryModalData, GallerySwitcherScenario } from "@/lib/dev/galleryModalTypes";

function scenario(
  id: string,
  actionOutcomes: GallerySwitcherScenario["actionOutcomes"],
): GallerySwitcherScenario {
  return {
    id,
    tier: 2,
    label: id,
    group: "actions",
    shareToken: null,
    actionOutcomes,
    codes: [],
    data: { title: id } as unknown as GalleryModalData,
  };
}

const SCRIPTED = scenario("a", {
  setPublished: { kind: "error", code: "PUBLISH_BLOCKED_PENDING_REVIEW" },
  crewReset: { kind: "not_found" },
  resync: { kind: "error", code: "SYNC_INFRA_ERROR" },
});
const UNSCRIPTED = scenario("b", null);

afterEach(() => {
  cleanup();
  capturedProps = {};
  capturedScripts = "unset";
  capturedOverrides = "unset";
});

describe("ScenarioMount", () => {
  test("scripted closures reach the modal; unscripted scenario keeps NOOP identity", async () => {
    render(<AttentionModalSwitcher scenarios={[SCRIPTED, UNSCRIPTED]} excluded={[]} initialId="a" />);
    const setPublished = capturedProps.setPublished as (next: boolean) => Promise<unknown>;
    await expect(setPublished(true)).resolves.toEqual({
      ok: false,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    });
    // fetch scripts derived from the scenario reach the guard
    expect(Array.isArray(capturedScripts)).toBe(true);
    expect((capturedScripts as unknown[]).length).toBe(1);

    // ArrowRight advances to the unscripted scenario (switcher keyboard nav).
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(capturedProps.setPublished).toBe(NOOP_ACTIONS.setPublished);
    expect(capturedScripts).toEqual([]);
  });

  test("override provider carries built overrides for channel-3 scripts, null otherwise", async () => {
    render(<AttentionModalSwitcher scenarios={[SCRIPTED, UNSCRIPTED]} excluded={[]} initialId="a" />);
    expect(screen.getByTestId("mock-modal")).toBeInTheDocument();
    // crewReset scripted -> the provider value the modal subtree sees carries
    // the scripted implementation with the real result union.
    const o = capturedOverrides as {
      resetCrewMemberSelection?: (i: { showId: string; crewMemberId: string }) => Promise<unknown>;
    } | null;
    expect(o).not.toBeNull();
    await expect(o!.resetCrewMemberSelection!({ showId: "x", crewMemberId: "y" })).resolves.toEqual({
      ok: false,
      code: "PICKER_CREW_MEMBER_NOT_FOUND",
    });
    // switch to the unscripted scenario: provider value drops to null
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(capturedOverrides).toBeNull();
  });
});
