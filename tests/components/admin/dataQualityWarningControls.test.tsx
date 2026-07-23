// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import type { ParseWarning } from "@/lib/parser/types";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";
import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach } from "vitest";

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
const base = {
  slug: "rpas",
  showId: "00000000-0000-0000-0000-000000000001",
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
