// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import type { ParseWarning } from "@/lib/parser/types";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

afterEach(() => cleanup());

const w = (rawSnippet?: string): ParseWarning => ({
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "m",
  ...(rawSnippet !== undefined ? { rawSnippet } : {}),
});
const SHOW_ID = "00000000-0000-0000-0000-000000000001";
const base = {
  target: { kind: "show", slug: "rpas", showId: SHOW_ID },
  driveFileId: "df",
  reportSurfaceId: "sid-1",
} as const;

describe("DataQualityWarningControls", () => {
  test("active + ignorable → Report + Ignore, no Un-ignore", () => {
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="active" />);
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^ignore$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /un-ignore/i })).toBeNull();
  });
  test("active + NOT ignorable (no snippet) → Report only", () => {
    render(<DataQualityWarningControls {...base} warning={w(undefined)} mode="active" />);
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^ignore$/i })).toBeNull();
  });
  test("ignored mode → Un-ignore + Report", () => {
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="ignored" />);
    expect(screen.getByRole("button", { name: /un-ignore/i })).toBeTruthy();
  });

  describe("announce producer (announcer spec 2026-07-22 §2.3)", () => {
    const fetchMock = vi.fn<typeof fetch>();
    beforeEach(() => {
      fetchMock.mockReset();
      refresh.mockReset();
      global.fetch = fetchMock as unknown as typeof fetch;
    });
    const resp = (status: string, ok = true) =>
      ({ ok, json: async () => ({ status }) }) as unknown as Response;

    function renderWithAnnounce(mode: "active" | "ignored") {
      const announce = vi.fn();
      render(
        <WarningAnnounceContext.Provider value={{ announce }}>
          <DataQualityWarningControls {...base} warning={w("Storage | x")} mode={mode} />
        </WarningAnnounceContext.Provider>,
      );
      return announce;
    }

    test("ignore success announces 'Warning ignored.' once, BEFORE refresh", async () => {
      fetchMock.mockResolvedValue(resp("ignored"));
      const announce = renderWithAnnounce("active");
      fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith("Warning ignored.");
      // Announce-before-refresh ordering (plan-review R1 F4).
      expect(announce.mock.invocationCallOrder[0]!).toBeLessThan(
        refresh.mock.invocationCallOrder[0]!,
      );
    });

    test("un-ignore success announces 'Warning restored.' once, BEFORE refresh", async () => {
      fetchMock.mockResolvedValue(resp("unignored"));
      const announce = renderWithAnnounce("ignored");
      fireEvent.click(screen.getByRole("button", { name: /un-ignore/i }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith("Warning restored.");
      expect(announce.mock.invocationCallOrder[0]!).toBeLessThan(
        refresh.mock.invocationCallOrder[0]!,
      );
    });

    test("non-ok response announces nothing", async () => {
      fetchMock.mockResolvedValue(resp("ignored", false));
      const announce = renderWithAnnounce("active");
      fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByText(/Couldn't ignore/)).toBeTruthy());
      expect(announce).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    test("thrown fetch announces nothing", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const announce = renderWithAnnounce("active");
      fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
      await waitFor(() => expect(screen.getByText(/Couldn't ignore/)).toBeTruthy());
      expect(announce).not.toHaveBeenCalled();
    });

    test("no provider: success flow neither throws nor leaks an announcement (R2 F8)", async () => {
      fetchMock.mockResolvedValue(resp("ignored"));
      // Body-wide observer with mutation-time value capture: no live-region
      // node anywhere may ever carry the clause.
      const observedTexts: string[] = [];
      const ingest = (rs: MutationRecord[]) => {
        for (const r of rs) {
          for (const n of Array.from(r.addedNodes)) observedTexts.push(n.textContent ?? "");
          if (r.type === "characterData" && r.oldValue !== null) observedTexts.push(r.oldValue);
        }
      };
      const mo = new MutationObserver(ingest);
      mo.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true,
      });
      render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="active" />);
      fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      ingest(mo.takeRecords());
      mo.disconnect();
      expect(observedTexts.some((t) => t.includes("Warning ignored."))).toBe(false);
      expect(
        document.querySelector('[role="log"], [role="status"]')?.textContent ?? "",
      ).not.toContain("Warning ignored.");
    });
  });
});

// ── wizard-warning-ignore-controls spec §2.3 / §2.6 — Task 8 ────────────────────
//
// The component learns a second backend. A FIRST-SEEN wizard row has no show record,
// so its Ignore cannot POST to a slug-keyed route — it calls the staged server action.
// The published arm must stay BYTE-IDENTICAL through that change, which is what the
// exact-URL assertion below is for: "it still works" would pass on a rewritten URL.

const stagedActionMock =
  vi.fn<
    (args: {
      wizardSessionId: string;
      driveFileId: string;
      action: "ignore" | "unignore";
      code: string;
      rawSnippet: string;
    }) => Promise<unknown>
  >();
vi.mock("@/app/admin/onboarding/_actions/stagedWarningIgnore", () => ({
  setStagedWarningIgnore: (args: never) => stagedActionMock(args),
}));

const STAGED_TARGET = {
  kind: "staged",
  wizardSessionId: "9f9f9f9f-1111-4111-8111-9f9f9f9f9f9f",
  driveFileId: "drive-file-xyz",
} as const;
const stagedBase = {
  target: STAGED_TARGET,
  driveFileId: STAGED_TARGET.driveFileId,
  reportSurfaceId: "sid-staged",
} as const;

describe("DataQualityWarningControls — discriminated backend target (§2.3)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    stagedActionMock.mockReset();
    refresh.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test("show arm posts the SAME url and body as before the target prop existed", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ignored" }),
    } as unknown as Response);
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="active" />);
    fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // Byte-exact, not a pattern: this arm is a mechanical migration and any change to
    // the URL it builds is a regression on a shipped surface.
    expect(url).toBe("/api/admin/show/rpas/data-quality/ignore");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      code: "UNKNOWN_FIELD",
      rawSnippet: "Storage | x",
    });
    expect(stagedActionMock).not.toHaveBeenCalled();
  });

  test("show arm un-ignore keeps its own url", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "unignored" }),
    } as unknown as Response);
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="ignored" />);
    fireEvent.click(screen.getByRole("button", { name: /un-ignore/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/show/rpas/data-quality/unignore");
  });

  test("staged arm calls the server action with all five args, and never fetches", async () => {
    stagedActionMock.mockResolvedValue({ ok: true, state: "ignored" });
    render(<DataQualityWarningControls {...stagedBase} warning={w("Storage | x")} mode="active" />);
    fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
    await waitFor(() => expect(stagedActionMock).toHaveBeenCalledTimes(1));

    expect(stagedActionMock).toHaveBeenCalledWith({
      wizardSessionId: STAGED_TARGET.wizardSessionId,
      driveFileId: STAGED_TARGET.driveFileId,
      action: "ignore",
      code: "UNKNOWN_FIELD",
      rawSnippet: "Storage | x",
    });
    // A staged row has no slug, so any fetch here would be to a route that cannot exist.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("staged arm un-ignore sends action: unignore", async () => {
    stagedActionMock.mockResolvedValue({ ok: true, state: "unignored" });
    render(
      <DataQualityWarningControls {...stagedBase} warning={w("Storage | x")} mode="ignored" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /un-ignore/i }));
    await waitFor(() => expect(stagedActionMock).toHaveBeenCalledTimes(1));
    expect(stagedActionMock.mock.calls[0]![0]!.action).toBe("unignore");
  });

  test("staged arm success announces then refreshes, in that order", async () => {
    stagedActionMock.mockResolvedValue({ ok: true, state: "ignored" });
    const announce = vi.fn();
    render(
      <WarningAnnounceContext.Provider value={{ announce }}>
        <DataQualityWarningControls {...stagedBase} warning={w("Storage | x")} mode="active" />
      </WarningAnnounceContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(announce).toHaveBeenCalledWith("Warning ignored.");
    expect(announce.mock.invocationCallOrder[0]!).toBeLessThan(
      refresh.mock.invocationCallOrder[0]!,
    );
  });

  // Every typed refusal the action can return. Each must reach the operator as the
  // existing copy — never a raw code (invariant 5).
  test.each([
    "session_not_found",
    "infra_error",
    "concurrent",
    "warning_not_found",
    "warning_not_ignorable",
    "warning_stale",
  ])("staged arm renders the fail plate for %s, and never the code itself", async (code) => {
    stagedActionMock.mockResolvedValue({ ok: false, code });
    render(<DataQualityWarningControls {...stagedBase} warning={w("Storage | x")} mode="active" />);
    fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
    const plate = await screen.findByRole("alert");
    expect(plate.textContent).toMatch(/Couldn't ignore that warning/);
    expect(document.body.textContent).not.toContain(code);
    expect(refresh).not.toHaveBeenCalled();
  });

  test("staged arm treats a thrown action the same as a refusal", async () => {
    stagedActionMock.mockRejectedValue(new Error("boom"));
    render(<DataQualityWarningControls {...stagedBase} warning={w("Storage | x")} mode="active" />);
    fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't ignore/);
  });

  test("Ignore still self-gates on hasIgnorableSnippet in BOTH arms", () => {
    const { unmount } = render(
      <DataQualityWarningControls {...stagedBase} warning={w(undefined)} mode="active" />,
    );
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^ignore$/i })).toBeNull();
    unmount();
    render(<DataQualityWarningControls {...base} warning={w(undefined)} mode="active" />);
    expect(screen.queryByRole("button", { name: /^ignore$/i })).toBeNull();
  });
});

describe("DataQualityWarningControls — control state transitions (spec §5)", () => {
  beforeEach(() => {
    stagedActionMock.mockReset();
    refresh.mockReset();
  });

  test("idle → running: the label swaps and aria-busy is set WHILE the action is in flight", async () => {
    // A resolve-controlled promise, because asserting after the await would only ever
    // observe the settled state — the running state would never be checked at all.
    let resolveAction!: (v: unknown) => void;
    stagedActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(<DataQualityWarningControls {...stagedBase} warning={w("Storage | x")} mode="active" />);
    const btn = screen.getByRole("button", { name: /^ignore$/i });
    fireEvent.click(btn);

    const running = await screen.findByRole("button", { name: /Ignoring…/ });
    expect(running.getAttribute("aria-busy")).toBe("true");
    expect(running.hasAttribute("disabled")).toBe(true);

    resolveAction({ ok: true, state: "ignored" });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  test("error → idle: a retry after a failure clears the plate and runs the success path", async () => {
    stagedActionMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ok: true, state: "ignored" });
    render(<DataQualityWarningControls {...stagedBase} warning={w("Storage | x")} mode="active" />);
    fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^ignore$/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // The stale plate must not survive the retry — it would tell the operator the
    // second attempt failed too.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ── Report identity plumbing (spec §2.3 / §6) ──────────────────────────────────
//
// A FIRST-SEEN report has no show id, so the ONLY thing that tells the submit path
// which sheet it is about is `fieldRef.driveFileId` (`driveFileIdFromFieldRef`,
// lib/reports/submit.ts:299-307). Without it the report reads "staged wizard sheet
// (no show record)" and nobody can act on it. Asserted against the intercepted
// request BODY, with the expected id derived from the fixture.
describe("DataQualityWarningControls — report identity travels (§2.3)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, status: "created" }),
    } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    window.sessionStorage.clear();
  });

  function submitReport() {
    fireEvent.click(screen.getByTestId("report-button-trigger"));
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "This row is wrong" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
  }

  async function postedReportBody(): Promise<Record<string, unknown>> {
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => c[0] === "/api/report")).toBe(true);
    });
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/report")!;
    return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
  }

  test("staged arm sends show_id null and the fixture's driveFileId on the fieldRef", async () => {
    render(<DataQualityWarningControls {...stagedBase} warning={w("Storage | x")} mode="active" />);
    submitReport();
    const body = await postedReportBody();

    expect(body.show_id).toBeNull();
    expect((body.fieldRef as Record<string, unknown>).driveFileId).toBe(STAGED_TARGET.driveFileId);
  });

  test("show arm carries driveFileId too — additive, and keeps its show id", async () => {
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="active" />);
    submitReport();
    const body = await postedReportBody();

    expect(body.show_id).toBe(SHOW_ID);
    expect((body.fieldRef as Record<string, unknown>).driveFileId).toBe(base.driveFileId);
  });
});
