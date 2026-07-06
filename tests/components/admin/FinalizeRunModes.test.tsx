// @vitest-environment jsdom
/**
 * tests/components/admin/FinalizeRunModes.test.tsx (Phase 3 Task 3.1 — spec §4.5)
 *
 * The mode contract on useFinalizeRun's endpoint sequence:
 *   publish → /finalize loop THEN /finalize-cas
 *   resume  → /finalize loop THEN /finalize-cas (auto-continue when nothing blocks —
 *             owner decision 2026-07-06, supersedes spec §4.5's stop-before-CAS split)
 *   finish  → ONLY /finalize-cas
 * Asserts the actual endpoint call counts (a no-op / wrong-sequence impl fails).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { useFinalizeRun } from "@/components/admin/FinalizeButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Non-stream JSON finalize/CAS responses so readFinalizeBatch/Cas take the
 *  `!isStream` JSON path. /finalize terminates immediately (all_batches_complete);
 *  /finalize-cas succeeds. */
function mockFinalizeFetch() {
  const calls: string[] = [];
  const jsonResp = (body: unknown) => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => body,
  });
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url);
    calls.push(path);
    if (path.includes("/finalize-cas")) return jsonResp({ status: "finalize_complete" });
    return jsonResp({ status: "all_batches_complete", per_row: [] });
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return {
    finalizeCalls: () => calls.filter((u) => u.endsWith("/finalize")).length,
    casCalls: () => calls.filter((u) => u.includes("/finalize-cas")).length,
  };
}

const base = { wizardSessionId: "s1", disabled: false, publishCount: 2, uncheckedCleanCount: 0 };

describe("useFinalizeRun mode endpoint contract (spec §4.5)", () => {
  test("publish: /finalize loop THEN /finalize-cas", async () => {
    const calls = mockFinalizeFetch();
    const { result } = renderHook(() => useFinalizeRun({ ...base, mode: "publish" }));
    await act(async () => {
      await result.current.runLoop();
    });
    await waitFor(() => expect(calls.casCalls()).toBe(1));
    expect(calls.finalizeCalls()).toBeGreaterThan(0);
  });

  test("resume: /finalize loop THEN /finalize-cas (auto-continue, no blockers)", async () => {
    const calls = mockFinalizeFetch();
    const { result } = renderHook(() => useFinalizeRun({ ...base, mode: "resume" }));
    await act(async () => {
      await result.current.runLoop();
    });
    await waitFor(() => expect(calls.casCalls()).toBe(1));
    expect(calls.finalizeCalls()).toBeGreaterThan(0);
  });

  test("resume: STOPS before /finalize-cas when a row needs review (race_row)", async () => {
    // A per-row failure in the batch loop must still halt resume BEFORE the CAS
    // flip — auto-continue only applies to a clean drain.
    const calls: string[] = [];
    const jsonResp = (body: unknown) => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => body,
    });
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      calls.push(path);
      if (path.includes("/finalize-cas")) return jsonResp({ status: "finalize_complete" });
      return jsonResp({
        status: "all_batches_complete",
        per_row: [
          { drive_file_id: "d1", code: "STAGED_PARSE_OUTDATED_AT_PHASE_D", re_apply_url: "/x" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const { result } = renderHook(() => useFinalizeRun({ ...base, mode: "resume" }));
    await act(async () => {
      await result.current.runLoop();
    });
    await waitFor(() => expect(result.current.state.kind).toBe("race_row"));
    expect(calls.filter((u) => u.includes("/finalize-cas")).length).toBe(0);
  });

  test("finish: ONLY /finalize-cas (no /finalize)", async () => {
    const calls = mockFinalizeFetch();
    const { result } = renderHook(() => useFinalizeRun({ ...base, mode: "finish" }));
    await act(async () => {
      await result.current.runLoop();
    });
    await waitFor(() => expect(calls.casCalls()).toBe(1));
    expect(calls.finalizeCalls()).toBe(0);
  });
});
