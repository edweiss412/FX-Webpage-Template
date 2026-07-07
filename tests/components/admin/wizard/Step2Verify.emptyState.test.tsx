// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
// Flow-1 §1.1: a staged-0 scan renders a first-class in-card status block
// (empty-folder OR nothing-ready) instead of the footer "Found N items" popover,
// and the persistent submit button is relabeled "Re-scan". Harness mirrors the
// local helpers in tests/components/admin/wizard/Step2Verify.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Step2Verify } from "@/components/admin/wizard/Step2Verify";
import { toScanResponseBody } from "@/lib/onboarding/scanResponse";
import { parseDriveFolderId } from "@/lib/drive/driveFolderUrl";
import type { OnboardingManifestStatus } from "@/lib/sync/runOnboardingScan";

// The scanned folderId travels in the result body and is what the report block
// references (link href + "Re-scan" identity gate). In the real flow the route
// derives it from the submitted URL, so mirror that here: the body's folderId is
// the parsed id of the folder that was scanned, NOT the (possibly later-edited)
// input string.
function completedScanBody(
  outcomes: OnboardingManifestStatus[],
  folderId: string,
  folderName = "Folder",
) {
  const processed = outcomes.map((outcome, i) => ({ driveFileId: `file-${i}`, outcome }));
  return toScanResponseBody(
    { outcome: "completed", processed },
    { wizardSessionId: "wsid", folderId, folderName },
  );
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => cleanup());

function ndjson(...messages: unknown[]): string {
  return messages.map((m) => JSON.stringify(m) + "\n").join("");
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    headers: {
      get: (h: string) => (h.toLowerCase() === "content-type" ? "application/x-ndjson" : null),
    },
    body,
    json: async () => {
      throw new Error("json() must not be called on a stream response");
    },
  } as unknown as Response;
}

async function scan(outcomes: OnboardingManifestStatus[], folderUrl: string) {
  // The scanned folder id is the parsed id of the submitted URL (route contract);
  // fall back to a sentinel only when the URL is unparseable (not a real success
  // path, but keeps the harness total for edge probes).
  const scannedId = parseDriveFolderId(folderUrl) ?? "scanned-fallback";
  fetchMock.mockResolvedValue(
    streamResponse([
      ndjson(
        { type: "listed", total: outcomes.length },
        { type: "result", body: completedScanBody(outcomes, scannedId) },
      ),
    ]),
  );
  render(<Step2Verify />);
  fireEvent.change(screen.getByTestId("wizard-step2-folder-url-input"), {
    target: { value: folderUrl },
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("wizard-step2-submit"));
  });
}

const DRIVE_URL = "https://drive.google.com/drive/folders/xyz";

describe("Step2Verify staged-0 states", () => {
  it("empty folder → empty block, Open link points at the scanned folder, no popover", async () => {
    await scan([], DRIVE_URL);
    const block = screen.getByTestId("wizard-step2-empty");
    expect(within(block).getByText(/this folder is empty/i)).toBeInTheDocument();
    const link = within(block).getByRole("link", { name: /open the folder/i });
    // The report block references the SCANNED folder id, not the live input.
    expect(link).toHaveAttribute("href", "https://drive.google.com/drive/folders/xyz");
    expect(screen.queryByTestId("wizard-step2-success")).not.toBeInTheDocument();
  });

  it("empty folder → persistent submit button is relabeled 'Re-scan'", async () => {
    await scan([], DRIVE_URL);
    expect(screen.getByTestId("wizard-step2-submit")).toHaveTextContent("Re-scan");
  });

  it("editing the folder field after a staged-0 scan → link stays on the scanned folder, label reverts", async () => {
    // Doug scans empty folder A, then edits the input toward a different folder B
    // WITHOUT re-scanning. The report block still describes A, so its Open link must
    // keep pointing at A; the button reverts to "Verify and scan" (submitting scans B).
    await scan([], DRIVE_URL);
    fireEvent.change(screen.getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/other-folder" },
    });
    const block = screen.getByTestId("wizard-step2-empty");
    expect(within(block).getByRole("link", { name: /open the folder/i })).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/xyz",
    );
    expect(screen.getByTestId("wizard-step2-submit")).toHaveTextContent("Verify and scan");
    expect(screen.getByTestId("wizard-step2-submit")).not.toHaveTextContent("Re-scan");
  });

  it("files present none staged → nothing-ready block, non-zero bucket lines only", async () => {
    await scan(["hard_failed", "hard_failed", "skipped_non_sheet"], DRIVE_URL);
    const block = screen.getByTestId("wizard-step2-nothing-ready");
    expect(within(block).getByText(/none are ready to review/i)).toBeInTheDocument();
    expect(within(block).getByText(/couldn.t read/i)).toBeInTheDocument();
    expect(within(block).getByText(/aren.t show sheets/i)).toBeInTheDocument();
    expect(within(block).queryByText(/live sync/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step2-success")).not.toBeInTheDocument();
    expect(screen.getByTestId("wizard-step2-submit")).toHaveTextContent("Re-scan");
  });

  it("live-row-conflict-only scan → nothing-ready block, no 'couldn't read' blanket", async () => {
    await scan(["live_row_conflict", "live_row_conflict"], DRIVE_URL);
    const block = screen.getByTestId("wizard-step2-nothing-ready");
    expect(within(block).getByText(/live sync is already handling/i)).toBeInTheDocument();
    // the live-row-conflict-only case must NOT claim the sheets were unreadable
    expect(within(block).queryByText(/couldn.t read/i)).not.toBeInTheDocument();
  });

  it("staged>0 → footer popover renders, no empty/nothing-ready block, label unchanged", async () => {
    await scan(["staged", "staged"], DRIVE_URL);
    expect(screen.getByTestId("wizard-step2-success")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step2-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step2-nothing-ready")).not.toBeInTheDocument();
    expect(screen.getByTestId("wizard-step2-submit")).not.toHaveTextContent("Re-scan");
  });
});
