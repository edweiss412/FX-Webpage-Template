// @vitest-environment jsdom
/**
 * tests/devcapture/hostMounts.test.tsx — spec §2.2/§2.3/§7 host behavior
 * (plan Task 8): visibility gating, snapshot-threading canaries (REAL bundle,
 * spied URL sink), lifecycle matrix, busy lockout on BOTH ShareHub toggles
 * (real hook + deferred capture, never a mocked hook state), the
 * activation-interval attack (R2/R5 P0s), error status + 6 s clear, staged
 * icon busy/error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { unzipSync, strFromU8 } from "fflate";

const { captureElementPng, actionMock } = vi.hoisted(() => ({
  captureElementPng: vi.fn(),
  actionMock: vi.fn(),
}));
vi.mock("@/lib/devcapture/captureElement", () => ({
  captureElementPng: (...a: unknown[]) => captureElementPng(...a),
}));
vi.mock("@/app/admin/_devCaptureAction", () => ({
  captureShowTelemetry: (...a: unknown[]) => actionMock(...a),
}));
// Router-free jsdom harness: ShareHub's popover children (Rotate/Reset) and
// the modal shell call useRouter/useSearchParams — stub them (repo precedent:
// tests/components/admin/showpage/publishedReviewModal.test.tsx:35).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { DeveloperFlagProvider } from "@/components/admin/dev/DeveloperFlagContext";
import { ShareHub } from "@/components/admin/showpage/ShareHub";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import { buildStagedSectionData } from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "../components/admin/wizard/_step3ReviewFixture";
import {
  publishedModalElement,
  TITLE,
} from "../components/admin/showpage/__fixtures__/publishedModalHarness";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 1]);
const createdBlobs: Blob[] = [];

function stagedData() {
  const pr = buildParseResult();
  return buildStagedSectionData({
    pr,
    row: stagedRow(pr, { driveFileId: "DRIVE_STAGED" }),
    dfid: "DRIVE_STAGED",
    wizardSessionId: "88888888-4444-4444-8444-cccccccccccc",
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

function shareHubEl(opts?: {
  dev?: boolean;
  archived?: boolean;
  finalizeOwned?: boolean;
  published?: boolean;
}) {
  return (
    <DeveloperFlagProvider viewerIsDeveloper={opts?.dev ?? true}>
      <ShareTokenProvider initialToken="TOK" initialEpoch={1}>
        <ShareHub
          slug="host-test-show"
          showId="33333333-3333-4333-8333-333333333333"
          published={opts?.published ?? true}
          archived={opts?.archived ?? false}
          finalizeOwned={opts?.finalizeOwned ?? false}
          crewEmails={[]}
          showTitle="Host Test Show"
          pickerCrew={[]}
          archiveAction={vi.fn(async () => ({ ok: true }) as const)}
          unarchiveAction={vi.fn(async () => undefined)}
          devCaptureSnapshot={() => ({ canary: "SHAREHUB-DIRECT" })}
        />
      </ShareTokenProvider>
    </DeveloperFlagProvider>
  );
}

function stagedEl(dev: boolean) {
  return (
    <DeveloperFlagProvider viewerIsDeveloper={dev}>
      <Step3ReviewModal
        data={stagedData()}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={async () => true}
        onClose={() => undefined}
      />
    </DeveloperFlagProvider>
  );
}

/** Microtask-only flush — safe under fake timers (never awaits setTimeout). */
async function microFlush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await new Promise((r) => setTimeout(r, 0)); // rAF-stub macrotasks
      await Promise.resolve();
      await Promise.resolve();
    }
  });
}

async function lastTelemetry(): Promise<Record<string, unknown>> {
  const blob = createdBlobs[createdBlobs.length - 1]!;
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  return JSON.parse(strFromU8(entries["telemetry.json"]!)) as Record<string, unknown>;
}

beforeEach(() => {
  // jsdom does not run rAF callbacks (memory: rAF-setState never flushes) —
  // make the preCapture settle frames deterministic macrotasks.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = setTimeout(() => cb(0), 0);
    return id as unknown as number;
  });
  // ShareHub-direct renders have no modal shell: give the capture target a
  // panel node so target() resolves. Tagged + torn down in afterEach so it
  // never shadows the REAL shell panel in the threading tests (querySelector
  // returns the first match in document order).
  const dummy = document.createElement("div");
  dummy.setAttribute("data-review-modal-panel", "");
  dummy.setAttribute("data-dummy-panel", "");
  document.body.appendChild(dummy);
  captureElementPng.mockReset();
  captureElementPng.mockResolvedValue(new Blob([PNG_BYTES]));
  actionMock.mockReset();
  actionMock.mockResolvedValue({ kind: "ok", commitSha: null });
  createdBlobs.splice(0);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (b: Blob) => {
      createdBlobs.push(b);
      return "blob:host-test";
    },
    revokeObjectURL: () => undefined,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const n of document.querySelectorAll("[data-dummy-panel]")) n.remove();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function openKebab() {
  fireEvent.click(screen.getByTestId("share-hub-kebab"));
}

describe("visibility gating (§2.1/§2.2/§2.3)", () => {
  it("non-developer: neither mount renders its control", () => {
    render(shareHubEl({ dev: false }));
    openKebab();
    expect(screen.queryByTestId("share-hub-dev-capture")).toBeNull();
    cleanup();
    render(stagedEl(false));
    expect(screen.queryByTestId(/dev-capture$/)).toBeNull();
  });

  it("developer: both render", () => {
    render(shareHubEl());
    openKebab();
    expect(screen.getByTestId("share-hub-dev-capture")).toBeTruthy();
    cleanup();
    render(stagedEl(true));
    expect(screen.getByTestId("wizard-step3-card-DRIVE_STAGED-dev-capture")).toBeTruthy();
  });
});

describe("lifecycle matrix — §2.2 amendment: dev row in every mode", () => {
  const modes: Array<[string, Parameters<typeof shareHubEl>[0]]> = [
    ["archived", { archived: true }],
    ["finalize-owned", { finalizeOwned: true }],
    ["paused (published false)", { published: false }],
    ["default", {}],
  ];
  for (const [label, opts] of modes) {
    it(label, () => {
      render(shareHubEl(opts));
      openKebab();
      expect(screen.getByTestId("share-hub-dev-capture")).toBeTruthy();
    });
  }
});

describe("snapshot threading canaries (§4.3 — real modules end-to-end)", () => {
  it("published: PublishedReviewModal -> StatusStrip -> ShareHub -> hook -> zipped JSON", async () => {
    // The REAL shell panel must be the capture target - drop the dummy.
    for (const n of document.querySelectorAll("[data-dummy-panel]")) n.remove();
    captureElementPng.mockImplementation(async (el: unknown) => {
      // Prove the target is the real shell panel, not a leaked dummy.
      expect((el as HTMLElement).hasAttribute("data-dummy-panel")).toBe(false);
      return new Blob([PNG_BYTES]);
    });
    render(
      <DeveloperFlagProvider viewerIsDeveloper={true}>
        {publishedModalElement([])}
      </DeveloperFlagProvider>,
    );
    // panel target: the harness renders the real shell with data-review-modal-panel
    openKebab();
    fireEvent.click(screen.getByTestId("share-hub-dev-capture"));
    await settle();
    const doc = await lastTelemetry();
    const snap = doc["clientSnapshot"] as Record<string, unknown>;
    expect(snap["title"]).toBe(TITLE);
    expect(JSON.stringify(snap)).not.toContain("crewEmails");
    expect((doc["meta"] as Record<string, unknown>)["modalKind"]).toBe("published");
  });

  it("staged: Step3ReviewModal -> buildStagedSnapshot -> zipped JSON (resolution omitted)", async () => {
    render(stagedEl(true));
    fireEvent.click(screen.getByTestId("wizard-step3-card-DRIVE_STAGED-dev-capture"));
    await settle();
    const doc = await lastTelemetry();
    const snap = doc["clientSnapshot"] as Record<string, unknown>;
    expect((snap["data"] as Record<string, unknown>)["dfid"]).toBe("DRIVE_STAGED");
    expect(Object.keys(snap)).not.toContain("resolution");
    expect((doc["meta"] as Record<string, unknown>)["driveFileId"]).toBe("DRIVE_STAGED");
  });
});

describe("busy lockout — real hook, deferred capture (§2.2/§7)", () => {
  let resolveCapture: (b: Blob) => void = () => undefined;
  beforeEach(() => {
    captureElementPng.mockImplementation(() => new Promise<Blob>((r) => (resolveCapture = r)));
  });

  it("while busy: both toggles aria-disabled and neither opens the popover; busy copy shows", async () => {
    render(shareHubEl());
    openKebab();
    fireEvent.click(screen.getByTestId("share-hub-dev-capture"));
    await settle(); // preCapture closes popover, capture pending
    expect(screen.queryByTestId("share-hub-popover")).toBeNull();
    expect(screen.getByTestId("share-hub-kebab").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("share-hub-primary").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByTestId("share-hub-kebab"));
    expect(screen.queryByTestId("share-hub-popover")).toBeNull();
    fireEvent.click(screen.getByTestId("share-hub-primary"));
    expect(screen.queryByTestId("share-hub-popover")).toBeNull();
    expect(screen.getByTestId("share-hub-dev-capture-status").textContent).toBe(
      "Capturing the modal…",
    );
    act(() => resolveCapture(new Blob([PNG_BYTES])));
    await settle();
    expect(screen.getByTestId("share-hub-kebab").getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByTestId("share-hub-primary").getAttribute("aria-disabled")).toBeNull();
  });

  it("activation-interval attack: same-act clicks on both toggles never reopen the popover", async () => {
    render(shareHubEl());
    openKebab();
    act(() => {
      fireEvent.click(screen.getByTestId("share-hub-dev-capture"));
      // SAME tick, before any flush — the synchronous busyRef gate must block
      fireEvent.click(screen.getByTestId("share-hub-kebab"));
      fireEvent.click(screen.getByTestId("share-hub-primary"));
    });
    expect(screen.queryByTestId("share-hub-popover")).toBeNull();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    fireEvent.click(screen.getByTestId("share-hub-kebab"));
    expect(screen.queryByTestId("share-hub-popover")).toBeNull();
    act(() => resolveCapture(new Blob([PNG_BYTES])));
    await settle();
  });

  it("error: status line shows error copy, clears after 6 s, toggles re-enable", async () => {
    let rejectCapture: (e: Error) => void = () => undefined;
    captureElementPng.mockImplementation(
      () => new Promise<Blob>((_r, rej) => (rejectCapture = rej)),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(shareHubEl());
    openKebab();
    fireEvent.click(screen.getByTestId("share-hub-dev-capture"));
    await settle();
    vi.useFakeTimers();
    act(() => rejectCapture(new Error("raster fail")));
    await microFlush();
    const status = screen.getByTestId("share-hub-dev-capture-status");
    expect(status.textContent).toBe("Capture failed. Details are in the browser console.");
    expect(screen.getByTestId("share-hub-kebab").getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByTestId("share-hub-dev-capture-status")).toBeNull();
  });
});

describe("staged icon states (§2.3/§7)", () => {
  it("busy: disabled + aria-disabled + spinner; error copy after rejection; 6 s clear", async () => {
    let rejectCapture: (e: Error) => void = () => undefined;
    captureElementPng.mockImplementation(
      () => new Promise<Blob>((_r, rej) => (rejectCapture = rej)),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(stagedEl(true));
    const btn = screen.getByTestId("wizard-step3-card-DRIVE_STAGED-dev-capture");
    fireEvent.click(btn);
    await settle();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.querySelector(".animate-spin")).toBeTruthy();
    const status = screen.getByTestId("wizard-step3-card-DRIVE_STAGED-dev-capture-status");
    expect(status.textContent).toBe("Capturing the modal…");

    vi.useFakeTimers();
    act(() => rejectCapture(new Error("raster fail")));
    await microFlush();
    expect(status.textContent).toBe("Capture failed. Details are in the browser console.");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(
      screen.queryByTestId("wizard-step3-card-DRIVE_STAGED-dev-capture-status")?.textContent ?? "",
    ).toBe("");
  });
});
