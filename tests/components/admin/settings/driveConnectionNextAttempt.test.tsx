// @vitest-environment jsdom
//
// Backoff spec §3.6 / §6 class 12: the Settings next-attempt sentence renders
// under the SAME visibility condition as the Retry control (watch_inactive /
// watch_expired / not_configured-with-folder) and only while the ladder is in
// play (lastAttemptOutcome === "failed"). Copy branches mirror the bell line;
// expected time strings derive through the spec's toLocaleString options
// literal, never hardcoded.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DriveConnectionPanel } from "@/components/admin/settings/DriveConnectionPanel";
import type { DriveConnectionHealth } from "@/lib/admin/driveConnectionHealth";
import type { WatchSurfaceState } from "@/lib/admin/watchSurfaceState";

const { retryWatchSpy } = vi.hoisted(() => ({
  retryWatchSpy: vi.fn(async () => {}),
}));
vi.mock("@/app/admin/actions", () => ({
  retryWatchSubscriptionFormAction: retryWatchSpy,
}));

afterEach(() => {
  cleanup();
});

const NOW = new Date("2026-06-01T12:00:00.000Z");
const TWO_HR_AGO = new Date("2026-06-01T10:00:00.000Z").toISOString();
// Far future so the viewer-clock (real Date.now) future/past branch is
// deterministic for years; the formatter output is still derived, not hardcoded.
const FUTURE_ISO = "2030-01-01T16:45:00.000Z";

const SPEC_FORMAT_OPTIONS = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;
const formatted = (iso: string) => new Date(iso).toLocaleString(undefined, SPEC_FORMAT_OPTIONS);

type WarnHealth = Extract<DriveConnectionHealth, { health: "warn" }>;

function warnHealth(
  reason: WarnHealth["reason"],
  folderId: string | null = "abc123",
): DriveConnectionHealth {
  return {
    health: "warn",
    reason,
    code: "WATCH_CHANNEL_ORPHANED",
    folderName: "Show Sheets 2026",
    folderId,
    syncingCount: 3,
    attentionCount: 1,
    lastReadAt: TWO_HR_AGO,
  };
}

function state(over: Partial<WatchSurfaceState> = {}): WatchSurfaceState {
  return {
    nextAttemptAt: FUTURE_ISO,
    consecutiveFailures: 2,
    lastAttemptOutcome: "failed",
    ...over,
  };
}

const line = () => screen.queryByTestId("drive-connection-next-attempt");

describe("Settings next-attempt sentence (spec §3.6, class 12)", () => {
  it.each(["watch_inactive", "watch_expired"] as const)(
    "renders for %s with a failed state",
    (reason) => {
      render(<DriveConnectionPanel health={warnHealth(reason)} now={NOW} watchState={state()} />);
      expect(line()).not.toBeNull();
      expect(line()!.textContent).toBe(
        `Trying again at ${formatted(FUTURE_ISO)} · 2 reconnect attempts so far`,
      );
      expect(line()!.querySelector("span.tabular-nums")?.textContent).toBe("2");
    },
  );

  it("renders for not_configured WITH a folder; absent without one", () => {
    render(
      <DriveConnectionPanel health={warnHealth("not_configured")} now={NOW} watchState={state()} />,
    );
    expect(line()).not.toBeNull();
    cleanup();
    render(
      <DriveConnectionPanel
        health={warnHealth("not_configured", null)}
        now={NOW}
        watchState={state()}
      />,
    );
    expect(line()).toBeNull();
  });

  it("past/null nextAttemptAt → 'shortly' variant; count 1 singular; count 0 clause omitted", () => {
    render(
      <DriveConnectionPanel
        health={warnHealth("watch_expired")}
        now={NOW}
        watchState={state({ nextAttemptAt: null, consecutiveFailures: 1 })}
      />,
    );
    expect(line()!.textContent).toBe("Trying again shortly · 1 reconnect attempt so far");
    cleanup();
    render(
      <DriveConnectionPanel
        health={warnHealth("watch_expired")}
        now={NOW}
        watchState={state({ consecutiveFailures: 0 })}
      />,
    );
    expect(line()!.textContent).toBe(`Trying again at ${formatted(FUTURE_ISO)}`);
  });

  it("absent when the last attempt succeeded, when watchState is null, and when the prop is omitted", () => {
    render(
      <DriveConnectionPanel
        health={warnHealth("watch_expired")}
        now={NOW}
        watchState={state({ lastAttemptOutcome: "succeeded" })}
      />,
    );
    expect(line()).toBeNull();
    cleanup();
    render(<DriveConnectionPanel health={warnHealth("watch_expired")} now={NOW} watchState={null} />);
    expect(line()).toBeNull();
    cleanup();
    render(<DriveConnectionPanel health={warnHealth("watch_expired")} now={NOW} />);
    expect(line()).toBeNull();
  });

  it("absent for a positive fleet even with a stale failed row (mixed-outcome race residue)", () => {
    const health: DriveConnectionHealth = {
      health: "positive",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 4,
      lastReadAt: TWO_HR_AGO,
    };
    render(<DriveConnectionPanel health={health} now={NOW} watchState={state()} />);
    expect(line()).toBeNull();
  });
});
