// @vitest-environment jsdom
/**
 * tests/components/StaleFooter.test.tsx (M9 Task 9.1 — §5.4, AC-9.1)
 *
 * Pins the StaleFooter contract: render the §12.4 catalog message that
 * matches the (last_sync_status × age tier) cell. Status precedence
 * (`drive_error` / `sheet_unavailable` / `parse_error`) wins over age
 * tiers; `pending_review` falls through to age tiers EXCEPT >6h where it
 * promotes to SYNC_DELAYED_SEVERE; `ok` and `pending` always fall through.
 *
 * Anti-tautology: every assertion compares rendered text against the
 * literal MESSAGE_CATALOG[code].crewFacing string from the catalog file
 * (with placeholder substitution applied manually), NOT the messageFor()
 * runtime call.
 *
 * "No raw codes in DOM" contract (invariant 5 / §12.4): every test scans
 * the rendered DOM for the literal MessageCode strings and asserts none
 * appear in user-visible text.
 */
import { describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach } from "vitest";

import { StaleFooter } from "@/components/shared/StaleFooter";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { formatRelative } from "@/lib/time/relative";

afterEach(() => cleanup());

const STALE_FOOTER_CODES = [
  "SYNC_DELAYED_MODERATE",
  "SYNC_DELAYED_SEVERE",
  "SHEET_UNAVAILABLE",
  "DRIVE_FETCH_FAILED",
  "PARSE_ERROR_LAST_GOOD",
] as const;

function interpolate(template: string, params: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.split(`<${key}>`).join(value);
  }
  return out;
}

function assertNoRawCodes(container: HTMLElement) {
  const text = container.textContent ?? "";
  for (const code of STALE_FOOTER_CODES) {
    expect(text.includes(code)).toBe(false);
  }
}

describe("StaleFooter — age tier ladder (last_sync_status='ok')", () => {
  test("returns null when lastSyncedAt is null", () => {
    const { container } = render(
      <StaleFooter
        lastSyncedAt={null}
        lastSyncStatus="ok"
        now={new Date("2026-05-12T12:00:00Z")}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("<10 min ago renders subtle tier with raw relative time only (no code)", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const { container } = render(
      <StaleFooter lastSyncedAt={fiveMinAgo} lastSyncStatus="ok" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node).not.toBeNull();
    expect(node?.getAttribute("data-tier")).toBe("subtle");
    expect(node?.textContent).toContain(formatRelative(fiveMinAgo, now));
    assertNoRawCodes(container);
  });

  test("10min-1h renders subtle-dot tier with no code-bound copy", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const { container } = render(
      <StaleFooter lastSyncedAt={fifteenMinAgo} lastSyncStatus="ok" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("subtle-dot");
    assertNoRawCodes(container);
  });

  test("1h-6h with status='ok' renders SYNC_DELAYED_MODERATE crew copy", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const twoHrAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const { container } = render(
      <StaleFooter lastSyncedAt={twoHrAgo} lastSyncStatus="ok" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("yellow");
    const expected = interpolate(MESSAGE_CATALOG.SYNC_DELAYED_MODERATE.crewFacing ?? "", {
      time: formatRelative(twoHrAgo, now),
    });
    expect(node?.textContent).toContain(expected);
    assertNoRawCodes(container);
  });

  test(">6h with status='ok' renders SYNC_DELAYED_SEVERE crew copy", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const sevenHrAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const { container } = render(
      <StaleFooter lastSyncedAt={sevenHrAgo} lastSyncStatus="ok" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("red");
    expect(node?.textContent).toContain(MESSAGE_CATALOG.SYNC_DELAYED_SEVERE.crewFacing ?? "");
    assertNoRawCodes(container);
  });
});

describe("StaleFooter — status precedence over age tiers", () => {
  const now = new Date("2026-05-12T12:00:00Z");
  const oneMinAgo = new Date(now.getTime() - 60 * 1000); // fresh — would normally be subtle

  test("status='drive_error' renders DRIVE_FETCH_FAILED with red tier regardless of age", () => {
    const { container } = render(
      <StaleFooter lastSyncedAt={oneMinAgo} lastSyncStatus="drive_error" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("red");
    const expected = interpolate(MESSAGE_CATALOG.DRIVE_FETCH_FAILED.crewFacing ?? "", {
      time: formatRelative(oneMinAgo, now),
    });
    expect(node?.textContent).toContain(expected);
    assertNoRawCodes(container);
  });

  test("status='sheet_unavailable' renders SHEET_UNAVAILABLE with red tier regardless of age", () => {
    const { container } = render(
      <StaleFooter lastSyncedAt={oneMinAgo} lastSyncStatus="sheet_unavailable" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("red");
    const expected = interpolate(MESSAGE_CATALOG.SHEET_UNAVAILABLE.crewFacing ?? "", {
      time: formatRelative(oneMinAgo, now),
    });
    expect(node?.textContent).toContain(expected);
    assertNoRawCodes(container);
  });

  test("status='parse_error' renders PARSE_ERROR_LAST_GOOD with red tier regardless of age", () => {
    const { container } = render(
      <StaleFooter lastSyncedAt={oneMinAgo} lastSyncStatus="parse_error" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("red");
    const expected = interpolate(MESSAGE_CATALOG.PARSE_ERROR_LAST_GOOD.crewFacing ?? "", {
      time: formatRelative(oneMinAgo, now),
    });
    expect(node?.textContent).toContain(expected);
    assertNoRawCodes(container);
  });
});

describe("StaleFooter — pending_review × age branching", () => {
  test("pending_review with age <6h behaves like ok at same age (yellow at 2h)", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const twoHrAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const { container } = render(
      <StaleFooter lastSyncedAt={twoHrAgo} lastSyncStatus="pending_review" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("yellow");
    const expected = interpolate(MESSAGE_CATALOG.SYNC_DELAYED_MODERATE.crewFacing ?? "", {
      time: formatRelative(twoHrAgo, now),
    });
    expect(node?.textContent).toContain(expected);
    assertNoRawCodes(container);
  });

  test("pending_review with age >6h renders SYNC_DELAYED_SEVERE (something's wrong)", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const sevenHrAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const { container } = render(
      <StaleFooter lastSyncedAt={sevenHrAgo} lastSyncStatus="pending_review" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("red");
    expect(node?.textContent).toContain(MESSAGE_CATALOG.SYNC_DELAYED_SEVERE.crewFacing ?? "");
    assertNoRawCodes(container);
  });

  test("status='pending' falls through to age tiers (transient initial state)", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const { container } = render(
      <StaleFooter lastSyncedAt={fiveMinAgo} lastSyncStatus="pending" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("subtle");
    assertNoRawCodes(container);
  });
});

describe("StaleFooter — input shape tolerance", () => {
  test("accepts ISO string for lastSyncedAt", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const isoTwoHrAgo = "2026-05-12T10:00:00.000Z";
    const { container } = render(
      <StaleFooter lastSyncedAt={isoTwoHrAgo} lastSyncStatus="ok" now={now} />,
    );
    const node = container.querySelector('[data-testid="stale-footer"]');
    expect(node?.getAttribute("data-tier")).toBe("yellow");
  });
});

describe("formatRelative — relative time helper", () => {
  const now = new Date("2026-05-12T12:00:00Z");

  test("<1 min returns 'just now'", () => {
    expect(formatRelative(new Date(now.getTime() - 30_000), now)).toBe("just now");
  });

  test("renders minutes when <60", () => {
    expect(formatRelative(new Date(now.getTime() - 12 * 60_000), now)).toBe("12 min");
  });

  test("renders hours when <24h", () => {
    expect(formatRelative(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3 hr");
  });

  test("renders days when ≥24h with plural", () => {
    expect(formatRelative(new Date(now.getTime() - 2 * 86_400_000), now)).toBe("2 days");
  });

  test("renders 'day' (singular) for exactly 1 day", () => {
    expect(formatRelative(new Date(now.getTime() - 86_400_000), now)).toBe("1 day");
  });
});
