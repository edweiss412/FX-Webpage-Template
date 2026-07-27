// @vitest-environment jsdom
/**
 * Backoff spec §3.6 / §6 classes 11 + 19 (bell surface): the next-attempt line
 * renders ONLY when the reconnect ladder is actually in play
 * (lastAttemptOutcome === "failed"), keys its copy on nextAttemptAt, and never
 * leaks developer-tier fields. Expected time strings are derived through the
 * SAME toLocaleString options literal the spec mandates — never hardcoded.
 */
import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { BellActionRow } from "@/components/admin/BellPanel";
import type { BellEntry } from "@/lib/admin/bellFeed";
import type { WatchSurfaceState } from "@/lib/admin/watchSurfaceState";

const FUTURE_ISO = "2026-07-27T16:45:00.000Z";
const PAST_ISO = "2026-07-27T01:00:00.000Z";

// Spec §3.6: the formatStagedAt shape — month, day, hour, minute.
const SPEC_FORMAT_OPTIONS = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;
const formatted = (iso: string) => new Date(iso).toLocaleString(undefined, SPEC_FORMAT_OPTIONS);

function watchEntry(over: Partial<BellEntry> = {}): BellEntry {
  return {
    alertId: "watch-1",
    code: "WATCH_CHANNEL_ORPHANED",
    isHealth: false,
    isAutoResolving: false,
    autoResolveNote: "",
    actions: [],
    ...over,
  } as BellEntry;
}

function state(over: Partial<WatchSurfaceState> = {}): WatchSurfaceState {
  return {
    nextAttemptAt: FUTURE_ISO,
    consecutiveFailures: 2,
    lastAttemptOutcome: "failed",
    ...over,
  };
}

function renderRow(entry: BellEntry, viewerIsDeveloper = false) {
  const { container } = render(
    <BellActionRow entry={entry} onRefetch={vi.fn()} viewerIsDeveloper={viewerIsDeveloper} />,
  );
  return container.querySelector('[data-testid="bell-action-cell-watch-1"]') as HTMLElement;
}

const lineIn = (row: HTMLElement) =>
  row.querySelector('[data-testid="bell-next-attempt-watch-1"]');

describe("bell next-attempt line (spec §3.6, classes 11/19)", () => {
  it("failed + future nextAttemptAt → 'Trying again at <time> · N reconnect attempts so far'", () => {
    const row = renderRow(watchEntry({ watchState: state() }));
    const line = lineIn(row)!;
    expect(line).not.toBeNull();
    expect(line.textContent).toBe(
      `Trying again at ${formatted(FUTURE_ISO)} · 2 reconnect attempts so far`,
    );
    // the one layout contract: w-full forces its own visual line in the
    // flex-wrap action row (spec Dimensional Invariants).
    expect(line.className).toContain("w-full");
    const time = line.querySelector("time")!;
    expect(time.getAttribute("datetime")).toBe(FUTURE_ISO);
  });

  it("failed + past nextAttemptAt → 'Trying again shortly'", () => {
    const row = renderRow(watchEntry({ watchState: state({ nextAttemptAt: PAST_ISO }) }));
    expect(lineIn(row)!.textContent).toBe("Trying again shortly · 2 reconnect attempts so far");
  });

  it("failed + null nextAttemptAt → 'Trying again shortly'", () => {
    const row = renderRow(watchEntry({ watchState: state({ nextAttemptAt: null }) }));
    expect(lineIn(row)!.textContent).toBe("Trying again shortly · 2 reconnect attempts so far");
  });

  it("count 0 → clause omitted entirely (never '0 reconnect attempts')", () => {
    const row = renderRow(watchEntry({ watchState: state({ consecutiveFailures: 0 }) }));
    expect(lineIn(row)!.textContent).toBe(`Trying again at ${formatted(FUTURE_ISO)}`);
  });

  it("count 1 → singular", () => {
    const row = renderRow(watchEntry({ watchState: state({ consecutiveFailures: 1 }) }));
    expect(lineIn(row)!.textContent).toBe(
      `Trying again at ${formatted(FUTURE_ISO)} · 1 reconnect attempt so far`,
    );
  });

  it("succeeded → line absent; row renders as today", () => {
    const row = renderRow(watchEntry({ watchState: state({ lastAttemptOutcome: "succeeded" }) }));
    expect(lineIn(row)).toBeNull();
    expect(within(row).getByTestId("bell-resolve-watch-1")).toBeTruthy();
  });

  it("watchState null → absent", () => {
    expect(lineIn(renderRow(watchEntry({ watchState: null })))).toBeNull();
  });

  it("watchState absent (legacy shape) → absent", () => {
    expect(lineIn(renderRow(watchEntry()))).toBeNull();
  });

  it("non-watch entry never renders the line even with state present", () => {
    const { container } = render(
      <BellActionRow
        entry={watchEntry({ code: "SOME_CODE", watchState: state() }) as BellEntry}
        onRefetch={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="bell-next-attempt-watch-1"]')).toBeNull();
  });

  it("unparseable nextAttemptAt renders the raw string, never 'Invalid Date'", () => {
    const row = renderRow(watchEntry({ watchState: state({ nextAttemptAt: "not-a-date" }) }));
    const text = lineIn(row)!.textContent!;
    expect(text).toContain("not-a-date");
    expect(text).not.toContain("Invalid Date");
  });
});

describe("developer telemetry link on the watch row (spec §3.6 D6)", () => {
  it("renders only for developers, pointing at the unfiltered telemetry route", () => {
    const dev = renderRow(watchEntry({ watchState: state() }), true);
    const link = dev.querySelector('[data-testid="bell-telemetry-watch-1"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/admin/dev/telemetry");

    const nonDev = renderRow(watchEntry({ watchState: state() }), false);
    expect(nonDev.querySelector('[data-testid="bell-telemetry-watch-1"]')).toBeNull();
  });

  it("health rows keep their #health deep link unchanged", () => {
    const { container } = render(
      <BellActionRow
        entry={watchEntry({ isHealth: true, code: "SOME_HEALTH" })}
        onRefetch={vi.fn()}
      />,
    );
    const link = container.querySelector('[data-testid="bell-telemetry-watch-1"]');
    expect(link?.getAttribute("href")).toBe("/admin/dev/telemetry#health");
  });
});

describe("transition audit (spec Transition Inventory: every pair instant)", () => {
  it("the diff introduces no animation wrapper and guards hydration on the timestamp", () => {
    const src = readFileSync("components/admin/BellPanel.tsx", "utf8");
    expect(src).not.toContain("AnimatePresence");
    expect(src).not.toMatch(/from "framer-motion"|motion\./);
    expect(src).toContain("suppressHydrationWarning");
  });
});
