// @vitest-environment jsdom
/**
 * tests/components/admin/FinalizeButton.test.tsx (M10 §B Task 10.5 / Phase 2)
 *
 * Pins the public contract of <FinalizeButton> — the wizard-step-3
 * publish trigger. Drives the multi-batch finalize loop per spec §4.5 /
 * §9.0 + Pin-2 contract:
 *   - POST /api/admin/onboarding/finalize
 *     → { status: 'batch_complete', remaining_count, per_row, ... }
 *       → loop and POST /finalize again until all_batches_complete
 *     → { status: 'all_batches_complete', per_row, ... }
 *       → if per_row has failures → render re-apply list, DO NOT auto-fire
 *         /finalize-cas (race-row gate per plan §M10 Task 10.5 test (g))
 *       → if per_row is clean → POST /finalize-cas
 *     → { ok: false, code } → render Doug-facing copy via messageFor
 *   - POST /api/admin/onboarding/finalize-cas
 *     → { status: 'finalize_complete', ... } → router.refresh
 *     → { ok: false, code } → render Doug-facing copy
 */
import { readFileSync } from "node:fs";
import { expectActionAffordanceColour } from "../../_shared/actionAffordance";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";
import { FinalizeButton } from "@/components/admin/FinalizeButton";
import { controllableNdjson } from "./_finalizeStreamHarness";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

const WIZARD_SESSION_ID = "11111111-1111-1111-1111-111111111111";

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

describe("FinalizeButton", () => {
  test("renders the Finalize button enabled by default", () => {
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    const btn = getByTestId("wizard-finalize-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent ?? "").toMatch(/Publish|Finalize|setup/i);
  });

  test("respects disabled prop (resolution gate not met)", () => {
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} disabled />);
    const btn = getByTestId("wizard-finalize-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // ── Variant B (Task 6): layout-only panelPlacement (state machine unchanged) ──
  test("panelPlacement='above' reverses the flex column; behavior/testids unchanged", () => {
    const { getByTestId } = render(
      <FinalizeButton
        wizardSessionId={WIZARD_SESSION_ID}
        publishCount={0}
        uncheckedCleanCount={1}
        panelPlacement="above"
      />,
    );
    expect(getByTestId("wizard-finalize").className).toContain("flex-col-reverse");
    expect(getByTestId("wizard-finalize-button")).toBeTruthy(); // trigger still present
  });

  test("default (no panelPlacement) keeps the current flex order", () => {
    const { getByTestId } = render(
      <FinalizeButton
        wizardSessionId={WIZARD_SESSION_ID}
        publishCount={1}
        uncheckedCleanCount={0}
      />,
    );
    expect(getByTestId("wizard-finalize").className).not.toContain("flex-col-reverse");
  });

  // ── Task D5: "Publish N shows & finish setup" label + soft confirm ──
  describe("Task D5 — publish-count label + soft confirm", () => {
    test("label reads 'Publish N shows & finish setup' with N = publishCount", () => {
      const { getByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={3}
          uncheckedCleanCount={0}
        />,
      );
      const btn = getByTestId("wizard-finalize-button") as HTMLButtonElement;
      expect(btn.textContent ?? "").toContain("Publish 3 shows & finish setup");
    });

    test("singular: N=1 reads 'Publish 1 show & finish setup'", () => {
      const { getByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={1}
          uncheckedCleanCount={0}
        />,
      );
      expect(getByTestId("wizard-finalize-button").textContent ?? "").toContain(
        "Publish 1 show & finish setup",
      );
    });

    test("disabled still follows the disabled prop (finishable gate) regardless of counts", () => {
      const { getByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={2}
          uncheckedCleanCount={1}
          disabled
        />,
      );
      expect((getByTestId("wizard-finalize-button") as HTMLButtonElement).disabled).toBe(true);
    });

    test("with uncheckedCleanCount=0 the click runs the finalize loop directly (no confirm)", async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockJsonResponse({
            status: "all_batches_complete",
            wizard_session_id: WIZARD_SESSION_ID,
            remaining_count: 0,
            unresolved_manifest_count: 0,
            per_row: [],
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            status: "finalize_complete",
            wizard_session_id: WIZARD_SESSION_ID,
            watched_folder_id: "folder-xyz",
          }),
        );
      const { getByTestId, queryByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={2}
          uncheckedCleanCount={0}
        />,
      );
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-button"));
      });
      // No confirm dialog appears.
      expect(queryByTestId("wizard-finalize-confirm")).toBeNull();
      // The finalize loop fired.
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/onboarding/finalize");
    });

    test("with uncheckedCleanCount>0 the click shows the soft confirm and does NOT run the loop yet", async () => {
      const { getByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={2}
          uncheckedCleanCount={3}
        />,
      );
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-button"));
      });
      const confirm = getByTestId("wizard-finalize-confirm");
      // The confirm names the unchecked count + the Unpublished destination.
      expect(confirm.textContent ?? "").toContain("3 sheets");
      expect(confirm.textContent ?? "").toContain("Unpublished");
      // The finalize loop has NOT fired (no network yet).
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("the soft confirm NAMES the unchecked sheets (capped with a +N more tail)", async () => {
      const { getByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={1}
          uncheckedCleanCount={5}
          uncheckedCleanNames={[
            "Alpha Show",
            "Bravo Show",
            "Charlie Show",
            "Delta Show",
            "Echo Show",
          ]}
        />,
      );
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-button"));
      });
      const names = getByTestId("wizard-finalize-confirm-names").textContent ?? "";
      // First three named verbatim; the remaining two collapse into "+N more".
      expect(names).toContain("Alpha Show");
      expect(names).toContain("Bravo Show");
      expect(names).toContain("Charlie Show");
      expect(names).not.toContain("Delta Show");
      expect(names).toContain("and 2 more");
    });

    test("confirming the soft confirm runs the finalize loop", async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockJsonResponse({
            status: "all_batches_complete",
            wizard_session_id: WIZARD_SESSION_ID,
            remaining_count: 0,
            unresolved_manifest_count: 0,
            per_row: [],
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            status: "finalize_complete",
            wizard_session_id: WIZARD_SESSION_ID,
            watched_folder_id: "folder-xyz",
          }),
        );
      const { getByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={1}
          uncheckedCleanCount={2}
        />,
      );
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-button"));
      });
      expect(fetchMock).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-confirm-proceed"));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/onboarding/finalize");
      await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    });

    test("cancelling the soft confirm aborts: no network, dialog closes", async () => {
      const { getByTestId, queryByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={1}
          uncheckedCleanCount={2}
        />,
      );
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-button"));
      });
      expect(getByTestId("wizard-finalize-confirm")).toBeTruthy();
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-confirm-cancel"));
      });
      expect(queryByTestId("wizard-finalize-confirm")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("opening the soft confirm focuses the Continue button (AccentButton forwards its ref)", async () => {
      // FIX 2 regression: the proceed control was migrated to <AccentButton>. The
      // soft-confirm autofocus does proceedRef.current?.focus(); if the atom did
      // not forward its ref the call would silently no-op and focus would stay on
      // body. Asserting the button is the activeElement proves the ref forwards.
      const { getByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={1}
          uncheckedCleanCount={2}
        />,
      );
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-button"));
      });
      const proceed = getByTestId("wizard-finalize-confirm-proceed");
      await waitFor(() => expect(document.activeElement).toBe(proceed));
    });

    test("Escape closes the soft confirm without running the loop", async () => {
      const { getByTestId, queryByTestId } = render(
        <FinalizeButton
          wizardSessionId={WIZARD_SESSION_ID}
          publishCount={1}
          uncheckedCleanCount={2}
        />,
      );
      await act(async () => {
        fireEvent.click(getByTestId("wizard-finalize-button"));
      });
      const dialog = getByTestId("wizard-finalize-confirm");
      await act(async () => {
        fireEvent.keyDown(dialog, { key: "Escape" });
      });
      expect(queryByTestId("wizard-finalize-confirm")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  test("single-batch happy path: /finalize all_batches_complete → /finalize-cas → refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "finalize_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          watched_folder_id: "folder-xyz",
        }),
      );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toBe("/api/admin/onboarding/finalize");
    expect(urls[1]).toBe("/api/admin/onboarding/finalize-cas");
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("multi-batch loop: batch_complete → batch_complete → all_batches_complete → /finalize-cas", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "batch_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 150,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "batch_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 50,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "finalize_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          watched_folder_id: "folder-xyz",
        }),
      );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.slice(0, 3)).toEqual([
      "/api/admin/onboarding/finalize",
      "/api/admin/onboarding/finalize",
      "/api/admin/onboarding/finalize",
    ]);
    expect(urls[3]).toBe("/api/admin/onboarding/finalize-cas");
  });

  test("F-Codex-R2-2: per_row failures on a batch_complete response stop the loop (not just all_batches_complete)", async () => {
    // The first batch returns status='batch_complete' with a non-OK per_row
    // entry AND remaining work. The UI MUST surface the failure and stop;
    // looping past it would lose the actionable re_apply_url.
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "batch_complete",
        wizard_session_id: WIZARD_SESSION_ID,
        remaining_count: 100,
        unresolved_manifest_count: 1,
        per_row: [
          {
            drive_file_id: "drive-ok-1",
            wizard_session_id: WIZARD_SESSION_ID,
            code: "OK",
          },
          {
            drive_file_id: "drive-failed-mid-batch",
            wizard_session_id: WIZARD_SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${WIZARD_SESSION_ID}/drive-failed-mid-batch`,
          },
        ],
      }),
    );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Re-apply link present from the FIRST batch (no looping past the failure).
    expect(getByTestId("wizard-finalize-reapply-drive-failed-mid-batch").getAttribute("href")).toBe(
      `/admin/onboarding/staged/${WIZARD_SESSION_ID}/drive-failed-mid-batch`,
    );
    // No second /finalize call, no /finalize-cas.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("race-row gate: per_row failures stop the loop and render re-apply links — /finalize-cas is NOT called", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "all_batches_complete",
        wizard_session_id: WIZARD_SESSION_ID,
        remaining_count: 0,
        unresolved_manifest_count: 1,
        per_row: [
          {
            drive_file_id: "drive-failed-1",
            wizard_session_id: WIZARD_SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${WIZARD_SESSION_ID}/drive-failed-1`,
          },
        ],
      }),
    );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/onboarding/finalize");
    // Race-row failures rendered with re-apply link from the response's
    // pre-built re_apply_url (the client renders it verbatim, never composes).
    const failureLink = getByTestId("wizard-finalize-reapply-drive-failed-1") as HTMLAnchorElement;
    expect(failureLink.getAttribute("href")).toBe(
      `/admin/onboarding/staged/${WIZARD_SESSION_ID}/drive-failed-1`,
    );
    // /finalize-cas was NOT called.
    expect(
      fetchMock.mock.calls.filter((c) => (c[0] as string).includes("finalize-cas")),
    ).toHaveLength(0);
    // Auto-refresh not fired in this race state — the operator must re-apply.
    expect(queryByTestId("wizard-finalize-publish-complete")).toBeNull();
  });

  test("on 409 ONBOARDING_NOT_RESOLVED renders Doug-facing copy via messageFor", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }),
    );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.ONBOARDING_NOT_RESOLVED.dougFacing!,
      );
    });
    expect(getByTestId("wizard-finalize-error").textContent ?? "").not.toContain(
      "ONBOARDING_NOT_RESOLVED",
    );
  });

  test("on 409 CONCURRENT_FINALIZE_IN_FLIGHT renders Doug-facing copy", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" }, { status: 409 }),
    );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.CONCURRENT_FINALIZE_IN_FLIGHT.dougFacing!,
      );
    });
  });

  test("on /finalize-cas error (WIZARD_FINALIZE_CHECKPOINT_MISSING) renders Doug-facing copy", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          { ok: false, code: "WIZARD_FINALIZE_CHECKPOINT_MISSING" },
          { status: 409 },
        ),
      );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_FINALIZE_CHECKPOINT_MISSING.dougFacing!,
      );
    });
  });

  test("WM-R3: finalize-cas 409 per_row corrupt row renders per-entry catalog copy with the developer escape, not the generic line", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
            per_row: [
              // OK rows ride along in the 409 per_row (route returns ALL
              // shadowResults); the UI must filter them out.
              { drive_file_id: "drive-ok-1", code: "OK" },
              { drive_file_id: "drive-corrupt-1", code: "STAGED_PARSE_RESULT_CORRUPT" },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("wizard-finalize-cas-per-row")).not.toBeNull();
    });
    const panel = getByTestId("wizard-finalize-cas-per-row");
    const text = panel.textContent ?? "";
    // Per-entry catalog copy with the file's drive_file_id as context.
    expect(text).toContain("drive-corrupt-1");
    expect(text).toContain(MESSAGE_CATALOG.STAGED_PARSE_RESULT_CORRUPT.dougFacing!);
    // Corrupt-row recovery uses the developer-escape register (no per-row
    // discard affordance exists on this surface, and cleanup is 409-refused
    // for fresh sessions) — never promise a button that isn't reachable.
    expect(MESSAGE_CATALOG.STAGED_PARSE_RESULT_CORRUPT.dougFacing!).toContain(
      "contact the developer",
    );
    expect(text).toContain("contact the developer");
    expect(text).not.toContain("Discard this setup and start over");
    // OK rows are filtered out.
    expect(text).not.toContain("drive-ok-1");
    // No raw §12.4 code leaks (invariant 5).
    expect(getByTestId("wizard-finalize-cas-per-row").textContent ?? "").not.toContain(
      "STAGED_PARSE_RESULT_CORRUPT",
    );
    expect(getByTestId("wizard-finalize-cas-per-row").textContent ?? "").not.toContain(
      "STAGED_PARSE_OUTDATED_AT_PHASE_D",
    );
    // Renders INSTEAD OF (not in addition to) the generic error line.
    expect(queryByTestId("wizard-finalize-error")).toBeNull();
  });

  test("WM-R3: finalize-cas 409 per_row outdated row renders the outdated catalog copy (self-heals on retry)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
            per_row: [
              {
                drive_file_id: "drive-outdated-1",
                code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
              },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("wizard-finalize-cas-per-row")).not.toBeNull();
    });
    const text = getByTestId("wizard-finalize-cas-per-row").textContent ?? "";
    expect(text).toContain("drive-outdated-1");
    expect(text).toContain(MESSAGE_CATALOG.STAGED_PARSE_OUTDATED_AT_PHASE_D.dougFacing!);
    expect(getByTestId("wizard-finalize-cas-per-row").textContent ?? "").not.toContain(
      "STAGED_PARSE_OUTDATED_AT_PHASE_D",
    );
    expect(queryByTestId("wizard-finalize-error")).toBeNull();
  });

  test("finalize-cas 409 per_row ROLE_MAPPINGS_OUTDATED_AT_PUBLISH row offers the inline re-scan heal (spec 2026-07-16 §3.5 heal step ii)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
            per_row: [
              {
                drive_file_id: "drive-stale-roles-1",
                code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
              },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("wizard-finalize-cas-per-row")).not.toBeNull();
    });
    const text = getByTestId("wizard-finalize-cas-per-row").textContent ?? "";
    expect(text).toContain(MESSAGE_CATALOG.ROLE_MAPPINGS_OUTDATED_AT_PUBLISH.dougFacing!);
    // The heal is the re-scan; without this button the refusal is a dead end at this stage.
    expect(queryByTestId("rescan-sheet-button-drive-stale-roles-1")).not.toBeNull();
    expect(getByTestId("wizard-finalize-cas-per-row").textContent ?? "").not.toContain(
      "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
    );
  });

  test("Task 12: cas_per_row SHOW_ARCHIVED_IMMUTABLE renders BlockedRowResolver; STAGED_PARSE_OUTDATED_AT_PHASE_D STILL renders RescanSheetButton (freshness byte-parity)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "SHOW_ARCHIVED_IMMUTABLE",
            per_row: [
              { drive_file_id: "drive-archived-1", code: "SHOW_ARCHIVED_IMMUTABLE" },
              { drive_file_id: "drive-outdated-1", code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("wizard-finalize-cas-per-row")).not.toBeNull();
    });
    // Archived row: BlockedRowResolver renders (the new inline resolver).
    expect(queryByTestId("blocked-row-resolver-drive-archived-1")).not.toBeNull();
    // Freshness row: RescanSheetButton STILL renders — the freshness path is untouched.
    expect(queryByTestId("rescan-sheet-button-drive-outdated-1")).not.toBeNull();
    // The archived row does NOT also get a rescan button (mutually exclusive).
    expect(queryByTestId("rescan-sheet-button-drive-archived-1")).toBeNull();
  });

  test("Task 12: resolving a blocked cas_per_row row auto-retries the finalize loop", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "SHOW_ARCHIVED_IMMUTABLE",
            per_row: [{ drive_file_id: "drive-archived-1", code: "SHOW_ARCHIVED_IMMUTABLE" }],
          },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(mockJsonResponse({ ok: true, status: "resolved" }))
      // Auto-retry re-POST to /finalize; keep the loop terminating cleanly.
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "finalize_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          watched_folder_id: "folder-xyz",
        }),
      );
    const { getByTestId } = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("blocked-row-resolver-drive-archived-1")).toBeTruthy();
    });
    const resolverButton = getByTestId("blocked-row-resolver-drive-archived-1");
    // Two-tap: arm, then confirm — the confirm tap fires the resolve-blocker POST.
    await act(async () => {
      fireEvent.click(resolverButton);
    });
    await act(async () => {
      fireEvent.click(resolverButton);
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((c) => c[0] === "/api/admin/onboarding/resolve-blocker"),
      ).toBe(true);
    });
    // Auto-retry proof: onResolved fires run.runLoop(), which re-POSTs /finalize.
    await waitFor(() => {
      const finalizeCalls = fetchMock.mock.calls.filter(
        (c) => c[0] === "/api/admin/onboarding/finalize",
      );
      expect(finalizeCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  test("WM-R3: finalize-cas 409 WITHOUT per_row keeps the existing top-level copy path", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" }, { status: 409 }),
      );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-finalize-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.WIZARD_SESSION_SUPERSEDED.dougFacing!,
      );
    });
    expect(queryByTestId("wizard-finalize-cas-per-row")).toBeNull();
  });

  // Blocker rows label the sheet by the parsed show title (display_name), dropping the raw
  // drive_file_id from the visible <span>. The id survives only as the reapply/rescan
  // data-testid (+ key) — so the negative assertion clones the list and strips those subtrees.
  const BLOCKER_TITLE = "Consultants Roundtable";
  const BLOCKER_TITLE_ID = "1AbC_opaque_id";
  const BLOCKER_FALLBACK_ID = "2Xyz_fallback_id";

  test("Phase B race-row list: shows display_name, drops the id from the label, falls back to the id when display_name is absent", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "all_batches_complete",
        wizard_session_id: WIZARD_SESSION_ID,
        remaining_count: 0,
        unresolved_manifest_count: 1,
        per_row: [
          {
            drive_file_id: BLOCKER_TITLE_ID,
            wizard_session_id: WIZARD_SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${WIZARD_SESSION_ID}/${BLOCKER_TITLE_ID}`,
            display_name: BLOCKER_TITLE,
          },
          {
            drive_file_id: BLOCKER_FALLBACK_ID,
            wizard_session_id: WIZARD_SESSION_ID,
            code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            re_apply_url: `/admin/onboarding/staged/${WIZARD_SESSION_ID}/${BLOCKER_FALLBACK_ID}`,
            // NO display_name key (exactOptionalPropertyTypes rejects a present `undefined`).
          },
        ],
      }),
    );
    const { getByTestId, getByText } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(getByTestId("wizard-finalize-race-row")).toBeTruthy());
    // (1) the title is the row label
    expect(getByText(BLOCKER_TITLE)).toBeTruthy();
    // (2) the title row's raw id is NOT the visible label
    const list = getByTestId("wizard-finalize-race-row").cloneNode(true) as HTMLElement;
    list
      .querySelectorAll("[data-testid*='reapply'], [data-testid*='rescan']")
      .forEach((n) => n.remove());
    expect(list.textContent ?? "").not.toContain(BLOCKER_TITLE_ID);
    // (3) fallback: the entry WITHOUT display_name shows its id
    expect(getByText(BLOCKER_FALLBACK_ID)).toBeTruthy();
  });

  test("Phase D cas-per-row list: shows display_name, drops the id from the label, falls back to the id when display_name is absent", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
            per_row: [
              {
                drive_file_id: BLOCKER_TITLE_ID,
                code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
                display_name: BLOCKER_TITLE,
              },
              { drive_file_id: BLOCKER_FALLBACK_ID, code: "STAGED_PARSE_RESULT_CORRUPT" },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, getByText } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(getByTestId("wizard-finalize-cas-per-row")).toBeTruthy());
    expect(getByText(BLOCKER_TITLE)).toBeTruthy();
    const list = getByTestId("wizard-finalize-cas-per-row").cloneNode(true) as HTMLElement;
    list
      .querySelectorAll("[data-testid*='reapply'], [data-testid*='rescan']")
      .forEach((n) => n.remove());
    expect(list.textContent ?? "").not.toContain(BLOCKER_TITLE_ID);
    expect(getByText(BLOCKER_FALLBACK_ID)).toBeTruthy();
  });

  test("morphs the button into the progress panel while in flight, so a second request cannot fire", async () => {
    let resolveFirst!: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} />,
    );
    fireEvent.click(getByTestId("wizard-finalize-button"));
    // The button is REPLACED by the progress panel while running — there is nothing left to
    // double-click, so the double-fire guard is now structural (no button = no second request).
    expect(queryByTestId("wizard-finalize-button")).toBeNull();
    expect(getByTestId("wizard-finalize-progress")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      );
    });
  });
});

// ── Streaming progress panel (Task 4) + transition audit (Task 5) ──

function mockNdjsonResponse(lines: unknown[]): Response {
  const text = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
  return {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) => (k.toLowerCase() === "content-type" ? "application/x-ndjson" : null),
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    json: async () => {
      throw new Error("stream response has no json()");
    },
  } as unknown as Response;
}

const allBatchesDone = () => ({
  status: "all_batches_complete",
  wizard_session_id: WIZARD_SESSION_ID,
  remaining_count: 0,
  unresolved_manifest_count: 0,
  per_row: [],
});

const progressBar = (getByTestId: (id: string) => HTMLElement) =>
  getByTestId("wizard-finalize-progressbar") as unknown as HTMLProgressElement;

describe("FinalizeButton — streaming progress panel", () => {
  test("single-batch: bar fills to X of Y with the current sheet name, then Finishing setup, then complete + refresh", async () => {
    const batch = controllableNdjson();
    const cas = controllableNdjson();
    fetchMock.mockResolvedValueOnce(batch.response).mockResolvedValueOnce(cas.response);
    const announced: string[] = [];
    const { getByTestId, queryByTestId, findByTestId } = render(
      <UndoAnnounceContext.Provider value={{ announce: (m) => announced.push(m) }}>
        <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={2} />
      </UndoAnnounceContext.Provider>,
    );

    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    expect(queryByTestId("wizard-finalize-button")).toBeNull();
    expect(getByTestId("wizard-finalize-progress")).toBeTruthy();

    await act(async () => {
      batch.push({ type: "listed", total: 2 });
      batch.push({ type: "row", done: 1, total: 2, name: "East Coast", driveFileId: "f1" });
      batch.push({ type: "row", done: 2, total: 2, name: "RPAS", driveFileId: "f2" });
    });
    // Expected values DERIVED from the fixture (2 rows), not hardcoded independently.
    expect(progressBar(getByTestId).max).toBe(2);
    expect(progressBar(getByTestId).value).toBe(2);
    expect(getByTestId("wizard-finalize-count").textContent).toContain("2 of 2 shows");
    expect(getByTestId("wizard-finalize-current").textContent).toContain("RPAS");

    await act(async () => {
      batch.push({ type: "result", body: allBatchesDone() });
      batch.close();
    });
    // Distinct finishing step.
    expect(getByTestId("wizard-finalize-cas-phase")).toBeTruthy();
    await act(async () => {
      cas.push({ type: "phase", phase: "publishing" });
    });
    expect(getByTestId("wizard-finalize-cas-phase").textContent).toContain("Making shows live");

    await act(async () => {
      cas.push({
        type: "result",
        body: {
          status: "finalize_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          watched_folder_id: "wf",
        },
      });
      cas.close();
    });
    const complete = await findByTestId("wizard-finalize-publish-complete");
    expect(refreshMock).toHaveBeenCalled();

    // BL-ANNOUNCE-REGION-UNMOUNT-CLASS. The completion line was a live region
    // INSERTED together with its text, which screen readers do not announce —
    // they announce mutations WITHIN an existing region. This file already has
    // the right mechanism for that (`FinalizeAnnouncer`, mounted unconditionally,
    // whose text mutates) and its header already explains why; completion simply
    // never used it, so the one message a user most needs was the one not
    // announced.
    //
    // ANTI-TAUTOLOGY: the region queried is the announcer's, which is OUTSIDE
    // the completion block. Asserting on the completion block itself passes on
    // the broken shape, because the broken shape does render the text.
    // SECOND ITERATION (R2 finding 4). The local announcer was the fix for
    // "completion never announced"; whole-diff R1 then showed completion is
    // followed by `router.refresh()` OUT of the wizard, so a region this
    // component owns may be destroyed before it speaks. The channel took over —
    // and keeping both spoke the sentence twice whenever the component did
    // survive. So the assertion inverts: the sentence must reach the CHANNEL,
    // and the local announcer must be silent about completion.
    const announcer = document.querySelector(".sr-only[role='status']");
    expect(
      announcer,
      "the persistent announcer is still mounted for the running phases",
    ).not.toBeNull();
    expect(
      announcer!.textContent ?? "",
      "completion must NOT also come from the local region — that is a duplicate utterance",
    ).not.toContain("Setup is complete");
    expect(
      announced.join(" | "),
      "the completion sentence must reach the announce channel",
    ).toContain("Setup is complete");
    expect(
      complete.getAttribute("role"),
      "the completion block must not also claim to be a live region — two announcers, one event",
    ).not.toBe("status");
  });

  test("missing sheet name falls back to the driveFileId in the status line", async () => {
    const batch = controllableNdjson();
    fetchMock
      .mockResolvedValueOnce(batch.response)
      .mockResolvedValueOnce(controllableNdjson().response);
    const { getByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await act(async () => {
      batch.push({ type: "listed", total: 1 });
      batch.push({ type: "row", done: 1, total: 1, name: null, driveFileId: "drive-xyz" });
    });
    expect(getByTestId("wizard-finalize-current").textContent).toContain("drive-xyz");
  });

  test("multi-batch: the bar's grand total is reconciled across batches (no per-batch reset)", async () => {
    const batch1 = controllableNdjson();
    const batch2 = controllableNdjson();
    fetchMock
      .mockResolvedValueOnce(batch1.response)
      .mockResolvedValueOnce(batch2.response)
      .mockResolvedValueOnce(controllableNdjson().response);
    const { getByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={3} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    // Batch 1: 3 finishable remaining, processes 2.
    await act(async () => {
      batch1.push({ type: "listed", total: 3 });
      batch1.push({ type: "row", done: 1, total: 2, name: "A", driveFileId: "a" });
      batch1.push({ type: "row", done: 2, total: 2, name: "B", driveFileId: "b" });
    });
    expect(progressBar(getByTestId).max).toBe(3);
    expect(progressBar(getByTestId).value).toBe(2);
    await act(async () => {
      batch1.push({
        type: "result",
        body: {
          status: "batch_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 1,
          unresolved_manifest_count: 0,
          per_row: [],
        },
      });
      batch1.close();
    });
    // Batch 2: 1 remaining, processes 1 → grand total STILL 3, value → 3 (no reset).
    await act(async () => {
      batch2.push({ type: "listed", total: 1 });
      batch2.push({ type: "row", done: 1, total: 1, name: "C", driveFileId: "c" });
    });
    expect(progressBar(getByTestId).max).toBe(3);
    expect(progressBar(getByTestId).value).toBe(3);
  });

  test("stream interruption (no terminal result) surfaces the generic error, no raw code", async () => {
    fetchMock.mockResolvedValueOnce(
      mockNdjsonResponse([
        { type: "listed", total: 1 },
        { type: "row", done: 1, total: 1, name: "A", driveFileId: "a" },
      ]),
    );
    const { getByTestId, findByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    const err = await findByTestId("wizard-finalize-error");
    expect(err.textContent ?? "").toMatch(/could not complete|try again/i);
    expect(err.textContent ?? "").not.toContain("undefined");
  });

  test("mid-stream reader rejection (connection drop) surfaces the generic error, not a frozen bar", async () => {
    // Distinct from clean EOF above: here reader.read() REJECTS mid-stream. The
    // rejection must be caught and mapped to the error state, not escape
    // `void runLoop()` as an unhandled rejection leaving the panel on kind:'running'.
    const batch = controllableNdjson();
    fetchMock.mockResolvedValueOnce(batch.response);
    const { getByTestId, findByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await act(async () => {
      batch.push({ type: "listed", total: 1 });
      batch.error(new Error("network drop mid-stream"));
    });
    const err = await findByTestId("wizard-finalize-error");
    expect(err.textContent ?? "").toMatch(/could not complete|try again/i);
    // The frozen-bar symptom: the running panel must be gone.
    expect(queryByTestId("wizard-finalize-progress")).toBeNull();
    expect(err.textContent ?? "").not.toContain("undefined");
  });

  test("mid-stream reader rejection during /finalize-cas surfaces the generic error, not a frozen Finishing-setup bar", async () => {
    const cas = controllableNdjson();
    fetchMock
      .mockResolvedValueOnce(
        mockNdjsonResponse([
          { type: "listed", total: 1 },
          { type: "result", body: allBatchesDone() },
        ]),
      )
      .mockResolvedValueOnce(cas.response);
    const { getByTestId, findByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    // Batch completed via the closed mockNdjson stream; now blocked in the CAS reader.
    await act(async () => {
      cas.push({ type: "phase", phase: "publishing" });
      cas.error(new Error("network drop mid-stream (cas)"));
    });
    const err = await findByTestId("wizard-finalize-error");
    expect(err.textContent ?? "").toMatch(/could not complete|try again/i);
    expect(queryByTestId("wizard-finalize-progress")).toBeNull();
    expect(err.textContent ?? "").not.toContain("undefined");
  });

  test("race-row terminal on a streamed batch renders the re-apply links and does NOT call /finalize-cas", async () => {
    fetchMock.mockResolvedValueOnce(
      mockNdjsonResponse([
        { type: "listed", total: 1 },
        { type: "row", done: 1, total: 1, name: "A", driveFileId: "f1" },
        {
          type: "result",
          body: {
            status: "batch_complete",
            wizard_session_id: WIZARD_SESSION_ID,
            remaining_count: 0,
            unresolved_manifest_count: 0,
            per_row: [
              {
                drive_file_id: "f1",
                wizard_session_id: WIZARD_SESSION_ID,
                code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
                re_apply_url: "/admin/reapply/f1",
              },
            ],
          },
        },
      ]),
    );
    const { getByTestId, findByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await findByTestId("wizard-finalize-race-row");
    expect(
      (getByTestId("wizard-finalize-reapply-f1") as HTMLAnchorElement).getAttribute("href"),
    ).toBe("/admin/reapply/f1");
    expect(fetchMock).toHaveBeenCalledTimes(1); // /finalize-cas NOT fired
  });

  test("!isStream JSON safety net: a non-NDJSON ok:false error still routes through the catalog copy", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }),
    );
    const { getByTestId, findByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await findByTestId("wizard-finalize-error");
    expect(getByTestId("wizard-finalize-error").textContent ?? "").not.toContain(
      "ONBOARDING_NOT_RESOLVED",
    );
  });

  test("retry after an error starts the bar fresh (no stale accumulator inflating the denominator)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockNdjsonResponse([
        { type: "listed", total: 2 },
        { type: "row", done: 1, total: 2, name: "A", driveFileId: "a" },
      ]),
    );
    const { getByTestId, findByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={2} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await findByTestId("wizard-finalize-error");

    // Dismiss the error modal (Close → idle) — the real recovery path, since the
    // trigger sits behind the modal's inert background while it is open.
    fireEvent.click(getByTestId("wizard-finalize-blocker-dismiss"));
    await waitFor(() => expect(queryByTestId("wizard-finalize-blocker-modal")).toBeNull());

    // Retry: the button is back; a fresh single-row stream must show 1 of 1, NOT 3 of 3.
    const batch = controllableNdjson();
    fetchMock
      .mockResolvedValueOnce(batch.response)
      .mockResolvedValueOnce(controllableNdjson().response);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await act(async () => {
      batch.push({ type: "listed", total: 1 });
      batch.push({ type: "row", done: 1, total: 1, name: "Z", driveFileId: "z" });
    });
    expect(progressBar(getByTestId).max).toBe(1);
    expect(progressBar(getByTestId).value).toBe(1);
    expect(getByTestId("wizard-finalize-count").textContent).toContain("1 of 1 show");
  });

  test("layout structure (spec §7): the bar is full-width in a block flex-col panel; the button is absent while running", async () => {
    const batch = controllableNdjson();
    fetchMock
      .mockResolvedValueOnce(batch.response)
      .mockResolvedValueOnce(controllableNdjson().response);
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    const panel = getByTestId("wizard-finalize-progress");
    expect(panel.className).toContain("flex");
    expect(panel.className).toContain("flex-col");
    expect(getByTestId("wizard-finalize-progressbar").className).toContain("w-full");
    expect(queryByTestId("wizard-finalize-button")).toBeNull();
  });

  test("a11y: focus moves to the progress panel when the button morphs away (no drop to <body>)", async () => {
    const batch = controllableNdjson();
    fetchMock
      .mockResolvedValueOnce(batch.response)
      .mockResolvedValueOnce(controllableNdjson().response);
    const { getByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    getByTestId("wizard-finalize-button").focus();
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    // The focused trigger was removed; focus must land on the panel, not <body>.
    expect(document.activeElement).toBe(getByTestId("wizard-finalize-progress"));
  });

  test("a11y: focus moves to the error alert on failure so keyboard recovery is reachable", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }),
    );
    const { getByTestId, findByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await findByTestId("wizard-finalize-error");
    // Focus lands on the modal dismiss control (useDialogFocus), not the alert region.
    expect(document.activeElement).toBe(getByTestId("wizard-finalize-blocker-dismiss"));
  });

  // SHEETLINK-SUBTLE-ACTION-CLASS-1, SIXTH instance — and the one that shows why
  // that entry's four-site list was the wrong kind of cover. This control was
  // never named; it surfaced only because the z-index sweep happened to touch
  // its line. The derived census is in BL-SUBTLE-ON-INTERACTIVE-CLASS.
  test("the blocker dismiss sits at text-text, not text-text-subtle", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }),
    );
    const { getByTestId, findByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await findByTestId("wizard-finalize-error");
    expectActionAffordanceColour(
      getByTestId("wizard-finalize-blocker-dismiss"),
      "FinalizeButton blocker dismiss",
    );
  });
});

describe("FinalizeButton — transition audit (Task 5)", () => {
  test("uses NO animation library (native bar + instant state swaps only)", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/FinalizeButton.tsx"), "utf8");
    expect(src).not.toMatch(/framer-motion|AnimatePresence/);
  });

  test("state exclusivity: the button and the progress panel never render together", async () => {
    const batch = controllableNdjson();
    fetchMock
      .mockResolvedValueOnce(batch.response)
      .mockResolvedValueOnce(controllableNdjson().response);
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={1} />,
    );
    expect(getByTestId("wizard-finalize-button")).toBeTruthy();
    expect(queryByTestId("wizard-finalize-progress")).toBeNull();
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    expect(queryByTestId("wizard-finalize-button")).toBeNull();
    expect(getByTestId("wizard-finalize-progress")).toBeTruthy();
  });

  test("compound: confirming the soft confirm closes it AND enters the running panel (no button+panel overlap)", async () => {
    const batch = controllableNdjson();
    fetchMock
      .mockResolvedValueOnce(batch.response)
      .mockResolvedValueOnce(controllableNdjson().response);
    const { getByTestId, queryByTestId } = render(
      <FinalizeButton
        wizardSessionId={WIZARD_SESSION_ID}
        publishCount={2}
        uncheckedCleanCount={1}
      />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    expect(getByTestId("wizard-finalize-confirm")).toBeTruthy(); // still idle; button present
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-confirm-proceed"));
    });
    expect(queryByTestId("wizard-finalize-confirm")).toBeNull();
    expect(queryByTestId("wizard-finalize-button")).toBeNull();
    expect(getByTestId("wizard-finalize-progress")).toBeTruthy();
  });
  // ---------------------------------------------------------------------------
  // Task 1 (spec 2026-08-29-step3-finalize-progress-scope): the batch phase
  // reports SETUP, not a publish that has not happened. It creates every show
  // Held (route.ts:1407 passes firstSeenPublished:false unconditionally); the
  // Live flip belongs to /finalize-cas. So "Publishing your shows…" was wrong
  // for every row, and "Publishing: <name>" wrong for whichever row it named.
  // The subline is also PAST tense: onRow fires after the row's tx resolved and
  // carries done = rows finished, and it fires for FAILED rows too, so the label
  // must be true in both branches.
  // ---------------------------------------------------------------------------
  async function runningBatchPanel() {
    const batch = controllableNdjson();
    const cas = controllableNdjson();
    fetchMock.mockResolvedValueOnce(batch.response).mockResolvedValueOnce(cas.response);
    const view = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={2} />);
    await act(async () => {
      fireEvent.click(view.getByTestId("wizard-finalize-button"));
    });
    await act(async () => {
      batch.push({ type: "listed", total: 2 });
      batch.push({ type: "row", done: 1, total: 2, name: "East Coast", driveFileId: "f1" });
    });
    return { ...view, batch, cas };
  }

  test("batch header reports setup, and the publish verb is gone from the batch phase", async () => {
    const { getByTestId } = await runningBatchPanel();
    const panel = getByTestId("wizard-finalize-progress");
    // EXACT, not toContain: mutant (b) showed a substring assertion passes against
    // "Setting up your shows… now", so it could not distinguish the shipped copy
    // from an appended-suffix regression.
    expect(getByTestId("wizard-finalize-heading").textContent).toBe("Setting up your shows…");
    // Scoped to the batch subtree on purpose: the CAS branch and the idle button
    // legitimately carry other copy, so a document-wide assertion would either
    // pass vacuously or fail on correct code.
    expect(panel.textContent ?? "").not.toContain("Publishing your shows");
    expect(panel.textContent ?? "").not.toContain("Publishing: ");
  });

  test("row subline names the completed row and makes no claim about its outcome", async () => {
    const { getByTestId } = await runningBatchPanel();
    const line = getByTestId("wizard-finalize-current");
    // The name stands alone. Impeccable critique P1: a prefix here is a word and a
    // claim the line does not need — the labelled bar and the count above already
    // say what this name is, and on a phone the prefix ate ~11 chars of a
    // truncating line. EXACT, so a prefix creeping back in fails this.
    expect(line.textContent).toBe("East Coast");
  });

  // NOTE: runningLabel is deliberately NOT asserted here. In this composition the
  // trigger UNMOUNTS while running (the panel replaces it), so the label is only
  // observable through the wizard's FinalizeTrigger. Its coverage is the
  // pre-existing Step3 assertion this task retargets — which is why Task 1 runs
  // BOTH suites before committing.

  test("the SR announcer reports setup — it is a SIBLING of the panel, not inside it", async () => {
    const { container, getByTestId } = await runningBatchPanel();
    const status = container.querySelector('[role="status"]');
    expect(status, "the announcer must exist while running").toBeTruthy();
    // Premise: the announcer is NOT inside the labelled group, which is exactly
    // why the group-scoped assertions above cannot see it.
    expect(getByTestId("wizard-finalize-progress").contains(status)).toBe(false);
    expect(status!.textContent ?? "").toBe("Setting up your shows");
  });

  test("every accessible name in the batch phase reads Show setup progress", async () => {
    const { getByTestId } = await runningBatchPanel();
    const group = getByTestId("wizard-finalize-progress");
    // querySelectorAll is DESCENDANT-only and the aria-label sits on the SAME
    // element as the testid, so the group's own label must be added explicitly.
    const labelled = [group, ...Array.from(group.querySelectorAll("[aria-label]"))].filter((el) =>
      el.hasAttribute("aria-label"),
    );
    // An empty set trivially equals an empty set; require the real members first.
    expect(labelled.length).toBeGreaterThanOrEqual(2);
    expect(new Set(labelled.map((el) => el.getAttribute("aria-label")))).toEqual(
      new Set(["Show setup progress"]),
    );
    // The RAW attribute is not the accessible name. `aria-labelledby` WINS over
    // `aria-label`, so a labelledby pointing at stale copy leaves this set reading
    // "Show setup progress" while a screen reader announces something else — probed
    // and confirmed in whole-diff R2 finding 6. Two assertions, because each catches
    // what the other cannot: the set pins the attribute VALUE, and this pins that the
    // attribute is what the name is actually computed FROM.
    const overridden = labelled.filter((el) => el.hasAttribute("aria-labelledby"));
    expect(
      overridden.map((el) => el.getAttribute("data-testid") ?? el.tagName),
      "aria-labelledby would override the aria-label these assertions pin",
    ).toEqual([]);
  });

  test("PRESERVATION: the CAS phase header is untouched by the batch-phase edit", async () => {
    const { getByTestId, batch, cas } = await runningBatchPanel();
    await act(async () => {
      batch.push({ type: "result", body: allBatchesDone() });
      batch.close();
    });
    await act(async () => {
      cas.push({ type: "phase", phase: "applying" });
    });
    // Scoped to the header ELEMENT and exact, not `toContain` over the whole panel:
    // the panel also renders the CAS phase label, so a header that changed or vanished
    // left the searched string alive elsewhere and this preservation test stayed green
    // (whole-diff R1 finding 6).
    expect(getByTestId("wizard-finalize-cas-heading").textContent).toBe("Finishing setup…");
  });
});

describe("FinalizeButton — the settled batch receipt in the CAS phase", () => {
  // Eric's ruling, 2026-08-31: the batch the operator just watched finish does not
  // vanish at the phase boundary. It settles into a past-tense receipt, so the two
  // phases read as a sequence rather than a replacement. A project manager who sees a
  // bar disappear reads it as failure and reloads, and reloading mid-run lands in the
  // in_progress checkpoint path — a bad outcome produced by a display gap.
  //
  // NOT a publish count. Spec 2026-08-29 §7 fences those, and this carries the batch
  // phase's own ratified verb ("set up") forward over work the batch already did and
  // already displayed. Nothing counts publishes during CAS. Ratified by bl-orch
  // 2026-08-31 in reply to this arc's flag.
  async function runToCas(rows: number) {
    const batch = controllableNdjson();
    const cas = controllableNdjson();
    fetchMock.mockResolvedValueOnce(batch.response).mockResolvedValueOnce(cas.response);
    const view = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={rows} />);
    await act(async () => {
      fireEvent.click(view.getByTestId("wizard-finalize-button"));
    });
    await act(async () => {
      batch.push({ type: "listed", total: rows });
      for (let i = 1; i <= rows; i++) {
        batch.push({ type: "row", done: i, total: rows, name: `Show ${i}`, driveFileId: `f${i}` });
      }
    });
    await act(async () => {
      batch.push({ type: "result", body: allBatchesDone() });
      batch.close();
    });
    return { ...view, cas };
  }

  test.each([
    { rows: 2, expected: "2 of 2 shows set up" },
    { rows: 1, expected: "1 of 1 show set up" },
  ])("the CAS phase carries the settled count ($expected)", async ({ rows, expected }) => {
    const { getByTestId } = await runToCas(rows);
    // PREMISE: actually in the CAS phase on this case's own inputs. A run still in the
    // batch phase renders its own live count, which contains the same digits.
    expect(getByTestId("wizard-finalize-cas-heading").textContent).toContain("Finishing setup");
    expect(getByTestId("wizard-finalize-settled").textContent).toContain(expected);
  });

  // The checkpoint-resume case (mode "finish", which reaches CAS with both
  // accumulators at zero and therefore renders NO receipt) lives in the Step3 suite:
  // `mode` is a useFinalizeRun prop and FinalizeButtonProps does not expose it, while
  // Step3ReviewWithFinalize's `checkpointStatus` maps to it directly
  // (Step3ReviewWithFinalize.tsx:100-104). That is also the real surface an operator
  // reaches it through.
});
