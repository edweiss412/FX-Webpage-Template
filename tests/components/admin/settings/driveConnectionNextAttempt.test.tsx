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
// 15 minutes after the injected NOW: the sentence renders a RELATIVE wait off
// the page clock (server component - an absolute local time would render the
// SERVER's timezone; impeccable audit P1). Fully deterministic.
const FUTURE_ISO = "2026-06-01T12:15:00.000Z";

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
      expect(line()!.textContent).toBe("Trying again in 15 min · 2 reconnect attempts so far");
      expect(line()!.querySelector("span.tabular-nums")?.textContent).toBe("2");
      expect(line()!.querySelector("time")?.getAttribute("datetime")).toBe(FUTURE_ISO);
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
    expect(line()!.textContent).toBe("Trying again in 15 min");
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

  it("PAST nextAttemptAt (before the injected now) → 'shortly' variant", () => {
    render(
      <DriveConnectionPanel
        health={warnHealth("watch_expired")}
        now={NOW}
        watchState={state({ nextAttemptAt: "2026-06-01T11:59:00.000Z" })}
      />,
    );
    expect(line()!.textContent).toBe("Trying again shortly · 2 reconnect attempts so far");
  });

  it("lastAttemptOutcome null (row exists, no attempt yet) → absent", () => {
    render(
      <DriveConnectionPanel
        health={warnHealth("watch_expired")}
        now={NOW}
        watchState={state({ lastAttemptOutcome: null })}
      />,
    );
    expect(line()).toBeNull();
  });

  it.each([
    "sync_drive_error",
    "sync_sheet_unavailable",
    "sync_parse_error",
    "sync_shrink_held",
    "sync_unknown",
    "stale_severe",
    "stale_moderate",
  ] as const)("absent for non-watch warn reason %s even with a failed state", (reason) => {
    render(<DriveConnectionPanel health={warnHealth(reason)} now={NOW} watchState={state()} />);
    expect(line()).toBeNull();
  });

  it("absent for the infra_error health arm", () => {
    render(
      <DriveConnectionPanel health={{ kind: "infra_error" }} now={NOW} watchState={state()} />,
    );
    expect(line()).toBeNull();
  });

  it("sentinel scan: developer-tier error fields never render even if smuggled onto the state", () => {
    const smuggled = {
      ...state(),
      lastErrorClass: "drive_api_SENTINEL",
      lastErrorMessage: "boom_SENTINEL_message",
    } as unknown as WatchSurfaceState;
    const { container } = render(
      <DriveConnectionPanel health={warnHealth("watch_expired")} now={NOW} watchState={smuggled} />,
    );
    expect(container.textContent).not.toContain("SENTINEL");
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
