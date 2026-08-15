// @vitest-environment jsdom
/**
 * tests/components/crew/primitives/copyFactValue.test.tsx
 *
 * Spec: docs/superpowers/specs/2026-08-10-wifi-password-legibility.md
 * Plan: docs/superpowers/plans/2026-08-10-wifi-password-legibility.md Task 1
 *
 * The two new `FactRow` flags (`code`, `copyLabel`) and the `CopyFactValue`
 * client island they reach. Written SUITE-FIRST: at authoring time none of the
 * subject exists, so every case below is red for the same reason.
 *
 * The oracles that matter, and the failure each one catches:
 *
 *   - `code-value` is asserted on the VALUE SPAN scoped by the row's testid,
 *     never on a container — a container match passes when the class lands on
 *     the wrong node (anti-tautology rule).
 *   - the clipboard spy's ARGUMENT is compared byte-for-byte against the row's
 *     `v`, with `ORDTG.` (a live password whose trailing period is part of the
 *     secret) as the fixture. A copied-state assertion alone passes for an
 *     implementation that writes constant or trimmed text.
 *   - the announce assertions read the RENDERED `role="log"` element located by
 *     its testid, before AND after the copy. A sink-spy alone passes with a
 *     region that was never mounted (spec §6, R2 F4).
 *   - the sibling-churn case removes a PRECEDING row on rerender. Under the
 *     label-plus-index row key that shipped before this arc, the password row's
 *     key changes, React remounts the island, and its copied state is lost.
 *   - the remount-routing case drives the spike's regression form: a write that
 *     is still pending when its island is replaced must deliver its outcome
 *     through the island proven to have replaced it in that commit — never
 *     through a name lookup, which also matches a row that never asked.
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useLayoutEffect, useState } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { FactRows, type FactRow } from "@/components/crew/primitives/FactRows";
import { ANNOUNCE_LOG_TTL_MS } from "@/components/admin/announceLog";
import { COPY_FEEDBACK_RESET_MS } from "@/lib/ui/copyFeedback";
import { premise, premiseHolds } from "@/tests/_shared/premise";

/** The live FinTech Forum password. Its trailing period IS part of the secret
 *  (lib/crew/wifiDisplay.ts:39), which is what makes it the byte oracle. */
const PASSWORD = "ORDTG.";
const COPY_LABEL = "Copy the Wi-Fi password";
const TESTID = "venue-wifi-password";
const LOG_TESTID = "venue-wifi-copy-log";
const COPIED_TEXT = "Copied.";
const CORRECTIVE_TEXT = "Copy again - the clipboard may be out of date.";

/** Today's value-span class string, verbatim from FactRows before this arc.
 *  A control-free, code-free row must still render EXACTLY this. */
const BASE_VALUE_CLASS = "min-w-0 wrap-break-word text-sm font-semibold text-text";

type Deferred = { value: string; resolve: () => void; reject: (reason?: unknown) => void };

let writes: Deferred[] = [];
let writeText: ReturnType<typeof vi.fn>;

function installClipboard(): void {
  writes = [];
  writeText = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        writes.push({ value, resolve: () => resolve(), reject });
      }),
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function removeClipboard(): void {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
}

beforeEach(() => {
  installClipboard();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** `Partial<FactRow>` cannot express "drop this key" under
 *  exactOptionalPropertyTypes, and dropping `copyLabel` is exactly the case
 *  under test, so an explicit undefined DELETES the key here. */
type RowOverrides = { [K in keyof FactRow]?: FactRow[K] | undefined };

function passwordRow(overrides: RowOverrides = {}): FactRow {
  const row: Record<string, unknown> = {
    k: "Wi-Fi password",
    v: PASSWORD,
    testId: TESTID,
    code: true,
    copyLabel: COPY_LABEL,
  };
  for (const [key, val] of Object.entries(overrides)) {
    if (val === undefined) delete row[key];
    else row[key] = val;
  }
  return row as unknown as FactRow;
}

function rowEl(container: HTMLElement, testId = TESTID): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (el === null) throw new Error(`row ${testId} not rendered`);
  return el;
}

/** The value span, scoped INSIDE the row and excluding the `sub` line. */
function valueSpan(container: HTMLElement, testId = TESTID): HTMLElement {
  const dd = rowEl(container, testId).querySelector("dd");
  if (dd === null) throw new Error("row has no <dd>");
  const span = dd.querySelector<HTMLElement>(
    "span:not([data-slot='fact-row-sub']):not([role='log'])",
  );
  if (span === null) throw new Error("row has no value span");
  return span;
}

function copyButton(container: HTMLElement, testId = TESTID): HTMLButtonElement | null {
  return rowEl(container, testId).querySelector<HTMLButtonElement>("button");
}

function requireCopyButton(container: HTMLElement, testId = TESTID): HTMLButtonElement {
  const button = copyButton(container, testId);
  if (button === null) throw new Error("copy control not rendered");
  return button;
}

function logRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector<HTMLElement>(`[data-testid="${LOG_TESTID}"]`);
  if (region === null) throw new Error("copy-confirmation log region not rendered");
  return region;
}

function logTexts(container: HTMLElement): string[] {
  return Array.from(logRegion(container).querySelectorAll("[data-announce-id]")).map(
    (node) => node.textContent ?? "",
  );
}

function isCopied(container: HTMLElement): boolean {
  return rowEl(container).querySelector("[data-slot='check-glyph']") !== null;
}

async function clickCopy(container: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(requireCopyButton(container));
  });
}

/** Resolve one pending clipboard write by index, flushing React work. */
async function settle(index: number): Promise<void> {
  const pending = writes[index];
  if (pending === undefined) throw new Error(`no pending write at index ${index}`);
  await act(async () => {
    pending.resolve();
  });
}

/** Reads the `class` ATTRIBUTE, not `className` — on an SVG element the latter
 *  is an SVGAnimatedString, not a string. */
function classesOf(el: Element): Set<string> {
  return new Set((el.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.length > 0));
}

function expectClasses(el: Element, expected: string[]): void {
  const actual = classesOf(el);
  for (const cls of expected) expect(Array.from(actual)).toContain(cls);
}

// ---------------------------------------------------------------------------
// AC-1 — the type treatment
// ---------------------------------------------------------------------------

describe("code flag (AC-1)", () => {
  test("code: true puts code-value on the value span, scoped to that row", () => {
    const { container } = render(
      <FactRows
        rows={[
          { k: "Wi-Fi network", v: "WaldorfMeeting", testId: "venue-wifi-ssid" },
          passwordRow(),
        ]}
      />,
    );

    expect(classesOf(valueSpan(container))).toContain("code-value");
    // The SSID row is explicitly out of scope (spec §1.1) — it must not inherit
    // the treatment, and asserting it here is what makes the flag per-row.
    expect(classesOf(valueSpan(container, "venue-wifi-ssid"))).not.toContain("code-value");
  });

  test("a row without the flag keeps today's value-span class string byte for byte", () => {
    const { container } = render(
      <FactRows rows={[{ k: "Power", v: "3 x 20A", testId: "venue-power" }]} />,
    );

    expect(valueSpan(container, "venue-power").className).toBe(BASE_VALUE_CLASS);
  });

  test("code: true appends to the base class rather than replacing it", () => {
    const { container } = render(<FactRows rows={[passwordRow({ copyLabel: undefined })]} />);

    expect(valueSpan(container).className).toBe(`${BASE_VALUE_CLASS} code-value`);
  });
});

// ---------------------------------------------------------------------------
// §4.2 DOM shape — the wrapper exists only on the opted-in row
// ---------------------------------------------------------------------------

describe("copyLabel gating and DOM shape (§4.2)", () => {
  test("the control renders only when copyLabel is a non-empty string", () => {
    const cases: Array<[string | undefined, boolean]> = [
      [undefined, false],
      ["", false],
      ["   ", false],
      [COPY_LABEL, true],
    ];
    for (const [label, expected] of cases) {
      const { container, unmount } = render(
        <FactRows rows={[passwordRow({ copyLabel: label })]} />,
      );
      expect(copyButton(container) !== null).toBe(expected);
      unmount();
    }
  });

  test("a control-free row's <dd> renders exactly today's children, with no wrapper", () => {
    const { container } = render(
      <FactRows rows={[{ k: "Power", v: "3 x 20A", sub: "house feed", testId: "venue-power" }]} />,
    );
    const dd = rowEl(container, "venue-power").querySelector("dd");
    premiseHolds("the control-free row rendered a <dd>", dd !== null);

    // Two direct children, both spans: value then sub. A wrapper div here is
    // the regression this pins — it would change every control-free consumer.
    const children = Array.from(dd!.children);
    expect(children.map((c) => c.tagName)).toEqual(["SPAN", "SPAN"]);
    expect(children[0]!.className).toBe(BASE_VALUE_CLASS);
  });

  test("the opted-in row wraps value + control in the §4.2 inline row", () => {
    const { container } = render(<FactRows rows={[passwordRow({ sub: "guest network" })]} />);
    const dd = rowEl(container).querySelector("dd")!;

    const wrapper = dd.children[0]!;
    expect(wrapper.tagName).toBe("DIV");
    expectClasses(wrapper, ["flex", "min-w-0", "items-center", "justify-end", "gap-3.5"]);
    // The value span and the island live INSIDE the wrapper; the sub line stays
    // a following sibling of it, not a child.
    expect(wrapper.contains(valueSpan(container))).toBe(true);
    expect(wrapper.contains(requireCopyButton(container))).toBe(true);
    expect(dd.querySelector("[data-slot='fact-row-sub']")!.parentElement).toBe(dd);
  });
});

// ---------------------------------------------------------------------------
// Class B adapted geometry + focus ring
// ---------------------------------------------------------------------------

describe("copy control presentation (§4.2)", () => {
  test("the button carries the adapted Class B geometry", () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);
    const button = requireCopyButton(container);

    expect(button.getAttribute("type")).toBe("button");
    expectClasses(button, [
      "-my-2",
      "-ml-2",
      "inline-flex",
      "size-tap-min",
      "shrink-0",
      "items-center",
      "justify-center",
      "rounded-md",
    ]);
    // The right margin stays at 0 so the 44px target's right edge is pinned to
    // the row edge (R3 F1). A verbatim `-m-2` would protrude past it.
    const classes = classesOf(button);
    expect(Array.from(classes).some((c) => c === "-mr-2" || c === "-m-2")).toBe(false);
  });

  test("the button carries the full container-matched focus ring", () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    expectClasses(requireCopyButton(container), [
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-focus-ring",
      "focus-visible:ring-offset-2",
      // The row sits on SectionCard's bg-surface, so the offset must match that
      // backdrop (DESIGN.md:40) — `ring-offset-bg` would be wrong here.
      "focus-visible:ring-offset-surface",
    ]);
  });

  test("the painted tile adapts the FactRows icon tile, with the action-target glyph token", () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);
    const tile = requireCopyButton(container).querySelector("span");
    premiseHolds("the button renders an inner visual span", tile !== null);

    expectClasses(tile!, [
      "grid",
      "size-7",
      "shrink-0",
      "place-items-center",
      "rounded-md",
      "bg-surface-sunken",
      // text-text-subtle is forbidden on action targets (DESIGN.md:27) and
      // text-accent-text belongs on an accent fill; this is the neutral-surface
      // treatment ShareLinkCopyButton uses.
      "text-text",
      // The hover step, asserted with the `group` that drives it: a
      // `group-hover:` utility on the tile is inert unless the button carries
      // `group`, and that pair silently splitting is the whole failure mode.
      // It darkens the GLYPH rather than the tile fill, because the tile's 28px
      // box is the row-height oracle (DI-1) and a fill change is also a
      // contrast question on a surface that is already sunken.
      "transition-colors",
      "duration-fast",
      "group-hover:text-text-strong",
    ]);
    expect(classesOf(tile!)).not.toContain("text-text-subtle");
    expect(classesOf(requireCopyButton(container)), "group-hover needs its group").toContain(
      "group",
    );

    const glyph = tile!.querySelector("svg");
    premiseHolds("the tile renders a glyph", glyph !== null);
    expect(classesOf(glyph!)).toContain("size-3.5");
    expect(glyph!.getAttribute("aria-hidden")).toBe("true");
  });

  test("the accessible name is the copyLabel and does NOT change when copied", async () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);
    const button = requireCopyButton(container);
    expect(button.getAttribute("aria-label")).toBe(COPY_LABEL);

    await clickCopy(container);
    await settle(0);

    premiseHolds("the control reached the copied state", isCopied(container));
    // State rides the log region, never a label swap: a name that changes under
    // a screen reader re-labels the control mid-interaction.
    expect(requireCopyButton(container).getAttribute("aria-label")).toBe(COPY_LABEL);
  });
});

// ---------------------------------------------------------------------------
// AC-2 — clipboard bytes and the rendered announce region
// ---------------------------------------------------------------------------

describe("copy behavior (AC-2)", () => {
  test("writeText receives the row's value byte for byte, trailing period included", async () => {
    premiseHolds("the fixture carries trailing punctuation", PASSWORD.endsWith("."));
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toBe(PASSWORD);
  });

  test("the log region is rendered with its required props and appends on success", async () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);
    const region = logRegion(container);

    expect(region.getAttribute("role")).toBe("log");
    expect(region.getAttribute("aria-label")).toBe("Copy confirmations");
    expect(classesOf(region)).toContain("sr-only");
    expect(logTexts(container)).toEqual([]);

    await clickCopy(container);
    expect(logTexts(container)).toEqual([]); // nothing announced until the write lands
    await settle(0);

    expect(logTexts(container)).toEqual([COPIED_TEXT]);
    expect(isCopied(container)).toBe(true);
  });

  test("a repeat copy of the identical value appends a SECOND entry", async () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    await clickCopy(container);
    await settle(1);

    // Identical text: an append always re-announces where a status swap may not.
    expect(logTexts(container)).toEqual([COPIED_TEXT, COPIED_TEXT]);
  });

  test("a rejected write leaves the control idle and announces nothing (AC-3)", async () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);
    await clickCopy(container);

    await act(async () => {
      writes[0]!.reject(new Error("denied"));
    });

    expect(isCopied(container)).toBe(false);
    expect(logTexts(container)).toEqual([]);
  });

  test("an absent Clipboard API no-ops without throwing (AC-3)", async () => {
    removeClipboard();
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);

    expect(isCopied(container)).toBe(false);
    expect(logTexts(container)).toEqual([]);
    // The value is still on screen for manual transcription — that is the
    // documented fallback (spec §7).
    expect(valueSpan(container).textContent).toBe(PASSWORD);
  });
});

// ---------------------------------------------------------------------------
// §4.2 — the ONE value-only resolution rule
// ---------------------------------------------------------------------------

describe("overlapping writes resolve by VALUE alone (§4.2)", () => {
  test("same-value inversion appends two Copied. entries and NO corrective", async () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await clickCopy(container);
    premise("two writes are genuinely in flight", writes.length, 1);

    await settle(1); // the later write resolves first
    await settle(0); // the earlier one lands after it

    expect(logTexts(container)).toEqual([COPIED_TEXT, COPIED_TEXT]);
    expect(isCopied(container)).toBe(true);
  });

  test("different-value inversion appends the corrective and clears copied", async () => {
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container); // write #0 for ORDTG.
    await act(async () => {
      rerender(<FactRows rows={[passwordRow({ v: "FITS2025" })]} />);
    });
    await clickCopy(container); // write #1 for FITS2025

    await settle(1); // the current value lands first
    expect(logTexts(container)).toEqual([COPIED_TEXT]);
    expect(isCopied(container)).toBe(true);

    await settle(0); // the STALE write resolves last, leaving ORDTG. in the clipboard

    expect(logTexts(container)).toEqual([COPIED_TEXT, CORRECTIVE_TEXT]);
    expect(isCopied(container)).toBe(false);
  });

  test("different-value inversion clears copied even when BOTH resolve in one batch", async () => {
    // The same inversion as above, with the two resolutions in ONE React batch.
    // That is the case a ref-read guard cannot survive: `copiedRef` is written
    // in a layout effect, so within a single batch it still reads the value
    // from BEFORE the current-value resolution set copied. Guarding the clear
    // on that ref skipped it, and the run ended with the corrective announced
    // and the check glyph still lit for the full window — the log and the
    // painted state disagreeing about the same clipboard.
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container); // write #0 for ORDTG.
    await act(async () => {
      rerender(<FactRows rows={[passwordRow({ v: "FITS2025" })]} />);
    });
    await clickCopy(container); // write #1 for FITS2025
    premise("two writes are genuinely in flight", writes.length, 1);

    await act(async () => {
      writes[1]!.resolve(); // current value
      writes[0]!.resolve(); // stale value, same batch
    });

    expect(logTexts(container)).toEqual([COPIED_TEXT, CORRECTIVE_TEXT]);
    expect(
      isCopied(container),
      "a corrective announcement with the check glyph still lit is the state this pins",
    ).toBe(false);
  });

  test("a standing confirmation still expires when the NEWEST write fails", async () => {
    // Only the newest write arms the reset, so an older same-value success sets
    // copied WITHOUT a timer. If the newest write then rejects — the silent
    // failure path — nothing was left to end the window, and the check glyph
    // stayed lit indefinitely on a page crew leave open for the whole show.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await clickCopy(container);
    premise("two writes are genuinely in flight", writes.length, 1);

    await settle(0); // the OLDER write succeeds: copied, but it does not own the window
    premiseHolds("the older success set copied", isCopied(container));

    await act(async () => {
      writes[1]!.reject(new Error("clipboard unavailable"));
    });

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS + 1);
    });
    expect(isCopied(container), "the confirmation must not outlive its window").toBe(false);
    // Failure stays silent (spec §4.2) and the natural expiry appends nothing.
    expect(logTexts(container)).toEqual([COPIED_TEXT]);
  });

  test("an older same-value success landing AFTER the window still gets a window", async () => {
    // The other ordering of the standing-confirmation class. The newest write
    // resolves and its window runs out; THEN an older same-value write lands
    // and sets copied again. It does not own the window, so it must not extend
    // one — but there is none left to extend, and without arming here the check
    // glyph stays lit for as long as the page is open.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await clickCopy(container);
    premise("two writes are genuinely in flight", writes.length, 1);

    await settle(1); // the NEWEST write resolves and owns the window
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS + 1);
    });
    premiseHolds("the newest write's window really expired", !isCopied(container));

    await settle(0); // the older write lands afterwards
    premiseHolds("the older success re-lit the confirmation", isCopied(container));

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS + 1);
    });
    expect(isCopied(container), "a re-lit confirmation must expire too").toBe(false);
  });

  test("a confirmation gets its FULL window after a failed write, not an inherited clock", async () => {
    // The general form of the two cases above: a reset timer must never run
    // without a confirmation behind it. A timer armed while nothing is standing
    // is an ORPHAN CLOCK — the next success sees a non-null timer, declines to
    // arm, and inherits whatever fraction of the window is left, so a
    // confirmation the component promised for 2s can vanish in 600ms.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await clickCopy(container);
    premise("two writes are genuinely in flight", writes.length, 1);

    await act(async () => {
      writes[1]!.reject(new Error("clipboard unavailable")); // newest fails, nothing standing
    });
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 600);
    });

    await settle(0); // the older write succeeds well into what would be the orphan's clock
    premiseHolds("the older success set copied", isCopied(container));

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 1);
    });
    expect(isCopied(container), "the confirmation must last its own full window").toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(isCopied(container)).toBe(false);
  });

  test("a confirmation gets its FULL window after a corrective cleared the previous one", async () => {
    // Same invariant, reached through the prop-change corrective: clearing
    // `copied` without clearing its timer leaves the same orphan clock.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    premiseHolds("the first confirmation is standing", isCopied(container));

    await act(async () => {
      rerender(<FactRows rows={[passwordRow({ v: "FITS2025" })]} />);
    });
    premiseHolds("the value change cleared it", !isCopied(container));
    await act(async () => {
      rerender(<FactRows rows={[passwordRow()]} />); // value comes back
    });

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 600);
    });

    await clickCopy(container);
    await clickCopy(container);
    await settle(1); // a NON-latest success, which arms only if nothing is running
    premiseHolds("the new confirmation is standing", isCopied(container));

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 1);
    });
    expect(isCopied(container), "an orphaned clock must not shorten this window").toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(isCopied(container)).toBe(false);
  });

  test("a FAILED newer write does not keep the window it can never fill", async () => {
    // The seq gate exists so an older success cannot extend the NEWEST write's
    // window. A write that REJECTED has no window to protect, so it must stop
    // counting as the newest — otherwise the success that follows it is treated
    // as stale, keeps whatever is left of an older timer, and the confirmation
    // it just earned expires early. Here it would have shown for 250ms of its
    // 2 seconds.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 250);
    });
    premiseHolds("the first window is nearly out", isCopied(container));

    await clickCopy(container); // write #1
    await clickCopy(container); // write #2, the newest
    await act(async () => {
      writes[2]!.reject(new Error("clipboard unavailable"));
    });
    await settle(1); // #1 succeeds AFTER the newest failed

    await act(async () => {
      vi.advanceTimersByTime(251); // past the ORIGINAL deadline
    });
    expect(
      isCopied(container),
      "the confirmation must run its own window, not the remains of an older one",
    ).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS);
    });
    expect(isCopied(container)).toBe(false);
  });

  test("a PENDING newer write does not shorten the confirmation now standing", async () => {
    // The other half of the round-14 class, and the reason the seq gate was the
    // wrong shape rather than merely incomplete: a newer write that has not
    // resolved YET has no confirmation to protect either. It may reject, or
    // resolve to a different value; until it lands, the confirmation on screen
    // is this one and it is entitled to its full window. Measured against the
    // newest write DISPATCHED, this success kept 250ms of an older clock.
    // (Whole-diff review round 16.)
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 250);
    });
    premiseHolds("the first window is nearly out", isCopied(container));

    await clickCopy(container); // write #1
    await clickCopy(container); // write #2, newer, and it stays PENDING
    await settle(1);
    premise("the newer write really is still in flight", writes.length, 2);

    await act(async () => {
      vi.advanceTimersByTime(251); // past the ORIGINAL deadline
    });
    expect(
      isCopied(container),
      "the confirmation must run its own window, not the remains of an older one",
    ).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS);
    });
    expect(isCopied(container)).toBe(false);
  });

  test("a write from a row sharing the identity does not shorten this row's window", async () => {
    // The same defect reached across islands, and the reason the comparison
    // belongs to the ISLAND rather than the module: the sequence counter is
    // keyed by identity, identity is caller-supplied, and two lists reusing one
    // testid therefore share the counter. Their confirmations are otherwise
    // routed by instance and fully independent — but a write dispatched by the
    // untapped row made the tapped row's own success look stale, and its
    // confirmation expired on the remains of an earlier clock.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(
      <>
        <FactRows rows={[passwordRow()]} />
        <FactRows rows={[passwordRow()]} />
      </>,
    );
    const rows = container.querySelectorAll(`[data-testid="${TESTID}"]`);
    premiseHolds("both lists rendered the same testid", rows.length === 2);
    const tap = async (index: number) => {
      await act(async () => {
        fireEvent.click(rows[index]!.querySelector("button")!);
      });
    };
    const firstCopied = () => rows[0]!.querySelector("[data-slot='check-glyph']") !== null;

    await tap(0);
    await settle(0);
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 250);
    });
    premiseHolds("the first row's window is nearly out", firstCopied());

    await tap(0); // the tapped row's second write
    await tap(1); // the OTHER row's write, newer on the shared counter, pending
    await settle(1);
    premise("the other row's write really is still in flight", writes.length, 2);

    await act(async () => {
      vi.advanceTimersByTime(251);
    });
    expect(
      firstCopied(),
      "another row's in-flight write must not expire this row's confirmation",
    ).toBe(true);
  });

  test("a value change while copied resets AND appends the corrective", async () => {
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    premiseHolds("the control is copied before the value moves", isCopied(container));

    await act(async () => {
      rerender(<FactRows rows={[passwordRow({ v: "FITS2025" })]} />);
    });

    // Every non-timeout exit from copied appends the corrective, so the
    // append-only log never ends on a claim the component cannot vouch for.
    expect(isCopied(container)).toBe(false);
    expect(logTexts(container)).toEqual([COPIED_TEXT, CORRECTIVE_TEXT]);
  });

  test("a value change AFTER the window still retracts the standing announcement", async () => {
    // The glyph is gone by then, correctly and silently — but the "Copied."
    // entry is still in the log, so it is still this row's last word to a
    // screen-reader user while the value beneath it moved and the clipboard
    // went stale.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS + 1);
    });
    premiseHolds("the window closed silently", !isCopied(container));
    premiseHolds("the affirmative entry is still in the log", logTexts(container).length === 1);

    await act(async () => {
      rerender(<FactRows rows={[passwordRow({ v: "FITS2025" })]} />);
    });

    expect(logTexts(container)).toEqual([COPIED_TEXT, CORRECTIVE_TEXT]);
  });

  test("a value change after the entry is PRUNED announces nothing", async () => {
    // The other half, and the reason this is bounded by the channel's TTL
    // rather than running forever: once the entry is gone the log ends on
    // nothing, so there is no claim to retract — and a crew page whose values
    // refresh all day must not narrate a copy the user made an hour ago.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    await act(async () => {
      vi.advanceTimersByTime(ANNOUNCE_LOG_TTL_MS + 1);
    });
    premiseHolds("the log is empty once the entry is pruned", logTexts(container).length === 0);

    await act(async () => {
      rerender(<FactRows rows={[passwordRow({ v: "FITS2025" })]} />);
    });

    expect(logTexts(container)).toEqual([]);
  });

  test("a value change while NOT copied appends nothing", async () => {
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await act(async () => {
      rerender(<FactRows rows={[passwordRow({ v: "FITS2025" })]} />);
    });

    expect(logTexts(container)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle — keying and ownership
// ---------------------------------------------------------------------------

describe("island lifecycle (§4.1)", () => {
  test("a SECOND opted-in row does not receive the first row's confirmation", async () => {
    // The module holds the island registrations so a write can outlive a
    // remount (§4.1). Held as ONE global, the LAST island to mount wins it, and a
    // second opted-in row anywhere on the page silently steals every
    // confirmation: the row the user tapped stays idle while an untouched row
    // lights up and announces. Production renders one island today, but that is
    // a fact about the call sites, not a guard — an ordinary second `copyLabel`
    // is all it takes.
    const { container } = render(
      <FactRows
        rows={[
          passwordRow(),
          { k: "Room code", v: "4821", testId: "venue-room-code", copyLabel: "Copy the room code" },
        ]}
      />,
    );
    premiseHolds(
      "both rows really render their own control",
      copyButton(container) !== null && copyButton(container, "venue-room-code") !== null,
    );

    await act(async () => {
      fireEvent.click(requireCopyButton(container));
    });
    await settle(0);

    expect(isCopied(container), "the tapped row must be the one that confirms").toBe(true);
    expect(
      rowEl(container, "venue-room-code").querySelector("[data-slot='check-glyph']"),
      "an untouched row must not confirm a copy nobody asked it for",
    ).toBeNull();
  });

  test("removing a PRECEDING sibling row does not remount the island", async () => {
    const dock: FactRow = { k: "Loading dock", v: "Rear of house", testId: "venue-dock" };
    const { container, rerender } = render(<FactRows rows={[dock, passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    premiseHolds("the island is copied before the churn", isCopied(container));

    await act(async () => {
      rerender(<FactRows rows={[passwordRow()]} />);
    });

    // Under the label-plus-index key this row's key moved from index 1 to index
    // 0, React remounted the island, and the copied state vanished. Keying by
    // testId is what keeps this instance alive.
    expect(isCopied(container)).toBe(true);
    expect(logTexts(container)).toEqual([COPIED_TEXT]);
  });

  test("two lists sharing one testId do not steal each other's confirmations", async () => {
    // Identity is caller-supplied and only as unique as the caller makes it,
    // while the registry is module-wide — so two separate `FactRows` lists that
    // reuse a testid (or both fall back to label-plus-index) collide. Routing a
    // resolution to the DISPATCHING island whenever it is still mounted is what
    // makes that a degraded fallback rather than a mis-delivery: the untouched
    // control must never announce a copy nobody asked it for.
    const { container } = render(
      <>
        <FactRows rows={[passwordRow()]} />
        <FactRows rows={[passwordRow()]} />
      </>,
    );
    const rows = container.querySelectorAll(`[data-testid="${TESTID}"]`);
    premiseHolds("both lists really rendered the same testid", rows.length === 2);

    const first = rows[0]!.querySelector("button")!;
    await act(async () => {
      fireEvent.click(first);
    });
    await settle(0);

    expect(
      rows[0]!.querySelector("[data-slot='check-glyph']"),
      "the tapped row must be the one that confirms",
    ).not.toBeNull();
    expect(
      rows[1]!.querySelector("[data-slot='check-glyph']"),
      "an untouched row must not confirm a copy nobody asked it for",
    ).toBeNull();
    expect(
      Array.from(rows[1]!.querySelectorAll("[data-announce-id]")).map((n) => n.textContent),
    ).toEqual([]);
  });

  test("a duplicated identity never delivers to the row that did not dispatch", async () => {
    // Two lists sharing one testid, then the ordering that defeated every
    // name-based version of this: tap B, let A re-register, then unmount B with
    // its write still pending. A name lookup hands B's write to A. A proven
    // successor link cannot: A never replaced B, so B's write lands NOWHERE —
    // the value is on screen, the clipboard already holds it, nothing is
    // claimed.
    const both = (keyA: string) => (
      <>
        <FactRows key={keyA} rows={[passwordRow()]} />
        <FactRows key="b" rows={[passwordRow()]} />
      </>
    );
    const { container, rerender } = render(both("a1"));
    const rows = () => container.querySelectorAll(`[data-testid="${TESTID}"]`);
    premiseHolds("both lists rendered the same testid", rows().length === 2);

    await act(async () => {
      fireEvent.click(rows()[1]!.querySelector("button")!); // tap the SECOND list
    });
    await act(async () => {
      rerender(both("a2")); // the FIRST list remounts and would re-claim any name
    });
    await act(async () => {
      rerender(
        <>
          <FactRows key="a2" rows={[passwordRow()]} />
        </>,
      ); // the tapped list unmounts with its write still pending
    });
    premiseHolds("only the untapped list survives", rows().length === 1);

    await settle(0);

    const remaining = rows()[0]!;
    expect(
      remaining.querySelector("[data-slot='check-glyph']"),
      "the surviving row must not inherit another row's confirmation",
    ).toBeNull();
    expect(
      Array.from(remaining.querySelectorAll("[data-announce-id]")).map((n) => n.textContent),
    ).toEqual([]);
  });

  test("two rows remounting together each keep their OWN replacement", async () => {
    // React batches cleanups ahead of setups when several islands remount in
    // one commit — `cleanup A, cleanup B, setup A, setup B` — so a single
    // vacancy slot holds B by the time A's setup runs. With distinct identities
    // that merely LOSES A's link (its confirmation vanishes); with a shared one
    // it hands A the wrong predecessor. Per-identity vacancies are what make
    // the pairing survive the batching.
    const rowB = (): FactRow => ({
      k: "Room code",
      v: "4821",
      testId: "venue-room-code",
      copyLabel: "Copy the room code",
    });
    const lists = (key: string) => <FactRows key={key} rows={[passwordRow(), rowB()]} />;
    const { container, rerender } = render(lists("v1"));

    await clickCopy(container); // a write for the FIRST row
    await act(async () => {
      rerender(lists("v2")); // both islands remount in one commit
    });
    await settle(0);

    expect(isCopied(container), "the first row's replacement must show it").toBe(true);
    expect(
      rowEl(container, "venue-room-code").querySelector("[data-slot='check-glyph']"),
      "the second row was never tapped",
    ).toBeNull();
  });

  test("two islands vacating under ONE identity offer no replacement at all", async () => {
    // Indistinguishable by construction, so neither is offered — landing
    // nowhere beats landing on the wrong row.
    const both = (key: string) => (
      <>
        <FactRows key={`${key}-a`} rows={[passwordRow()]} />
        <FactRows key={`${key}-b`} rows={[passwordRow()]} />
      </>
    );
    const { container, rerender } = render(both("v1"));
    const rows = () => container.querySelectorAll(`[data-testid="${TESTID}"]`);
    premiseHolds("both lists rendered the same testid", rows().length === 2);

    await act(async () => {
      fireEvent.click(rows()[0]!.querySelector("button")!);
    });
    await act(async () => {
      rerender(both("v2")); // BOTH vacate under the same identity in one commit
    });
    await settle(0);

    for (const row of rows()) {
      expect(
        row.querySelector("[data-slot='check-glyph']"),
        "an ambiguous vacancy must not confirm on either row",
      ).toBeNull();
    }
  });

  test("two vacancies collapsing to ONE survivor still confirm nothing", async () => {
    // Both lists vacate under one identity and a single island survives. Which
    // of the two it replaces is unknowable, so the survivor is not offered
    // either link — otherwise the confirmation lands on a row chosen by
    // whichever cleanup happened to run last.
    const { container, rerender } = render(
      <>
        <FactRows key="a1" rows={[passwordRow()]} />
        <FactRows key="b1" rows={[passwordRow()]} />
      </>,
    );
    const rows = () => container.querySelectorAll(`[data-testid="${TESTID}"]`);
    premiseHolds("both lists rendered the same testid", rows().length === 2);

    await act(async () => {
      fireEvent.click(rows()[1]!.querySelector("button")!); // tap the SECOND
    });
    await act(async () => {
      // One commit: both islands vacate, one island mounts under that identity.
      rerender(<FactRows key="c1" rows={[passwordRow()]} />);
    });
    premiseHolds("one row survives", rows().length === 1);

    await settle(0);

    expect(
      rows()[0]!.querySelector("[data-slot='check-glyph']"),
      "an unknowable replacement must confirm nothing",
    ).toBeNull();
  });

  test("one vacancy is claimed once, so a second mount cannot inherit it too", async () => {
    // The dispatching island vacates, its replacement claims the vacancy — and
    // then a SECOND island mounts under the same identity in the same window.
    // If the vacancy were still on offer, the predecessor would end up pointing
    // at whichever island claimed last, and the confirmation would follow it
    // onto a row that never asked. Claiming marks it used.
    const { container, rerender } = render(<FactRows key="v1" rows={[passwordRow()]} />);

    await clickCopy(container); // pending, dispatched by the first island
    await act(async () => {
      // One commit: the original list remounts (its island is replaced) AND a
      // second list appears carrying the same identity.
      rerender(
        <>
          <FactRows key="v2" rows={[passwordRow()]} />
          <FactRows key="extra" rows={[passwordRow()]} />
        </>,
      );
    });
    const rows = container.querySelectorAll(`[data-testid="${TESTID}"]`);
    premiseHolds("two islands now carry the identity", rows.length === 2);

    await settle(0);

    const confirmed = Array.from(rows).filter(
      (r) => r.querySelector("[data-slot='check-glyph']") !== null,
    );
    expect(
      confirmed.length,
      "at most the one replacement may confirm — never two rows, and never the newcomer alone",
    ).toBeLessThanOrEqual(1);
    expect(
      confirmed[0] ?? rows[0],
      "the confirmation belongs to the row that replaced the dispatcher",
    ).toBe(rows[0]);
  });

  test("a LATER row reusing the identity is not treated as a replacement", async () => {
    // Sequential reuse: the row that dispatched is gone, and a different row
    // takes its testid in a LATER commit. Same name, unrelated island — and the
    // distinction is exactly what a name lookup cannot make. A replacement is
    // recognized only inside the commit that performs the swap.
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container); // pending
    await act(async () => {
      rerender(<FactRows rows={[{ k: "Power", v: "3 x 20A", testId: "other" }]} />);
    });
    premiseHolds(
      "the dispatching row is gone",
      container.querySelector(`[data-testid="${TESTID}"]`) === null,
    );
    await act(async () => {
      // A DIFFERENT row, mounting later, reusing the identity.
      rerender(
        <FactRows
          rows={[{ k: "Room code", v: PASSWORD, testId: TESTID, copyLabel: "Copy the room code" }]}
        />,
      );
    });

    await settle(0);

    expect(
      rowEl(container).querySelector("[data-slot='check-glyph']"),
      "an unrelated later row must not inherit the confirmation",
    ).toBeNull();
    expect(logTexts(container)).toEqual([]);
  });

  test("a write pending across a REAL remount delivers through the new owner", async () => {
    const { container, rerender } = render(<FactRows key="a" rows={[passwordRow()]} />);

    await clickCopy(container); // pending, owned by the first island
    const firstButton = requireCopyButton(container);
    await act(async () => {
      // A key change on the list REMOUNTS the whole subtree: island A unmounts
      // and island B mounts for the SAME row. The row's identity is what the
      // registration is keyed by, so it survives — which is the point. (Changing
      // the row's testId instead would be a different row, not a remount of this
      // one, and a write for one row must never land on another.)
      rerender(<FactRows key="b" rows={[passwordRow()]} />);
    });
    premiseHolds(
      "the island really was replaced, not merely re-rendered",
      requireCopyButton(container) !== firstButton,
    );
    expect(logTexts(container)).toEqual([]);

    await settle(0);

    // The resolution routes along the successor link proven in the commit that
    // performed the swap. Without that routing it would setState on a dead
    // island and this region would stay empty.
    expect(logTexts(container)).toEqual([COPIED_TEXT]);
    expect(isCopied(container), "the live island is the one showing copied").toBe(true);
  });

  test("a write landing with its island long gone still retracts the claim it invalidated", async () => {
    // A resolution is a fact about the CLIPBOARD, which is one global resource,
    // while a confirmation is per island. Routing the AFFIRMATIVE by proven
    // chain is what keeps a "Copied." off a row that never asked — but applying
    // the same routing to the RETRACTION means an unlinked write lands nowhere
    // and says nothing, and the clipboard it just overwrote is now stale
    // underneath whichever row is standing a confirmation. Here the row is
    // removed and restored across two commits (a live crew page takes realtime
    // refreshes), so no replacement link exists by construction. (Round 17.)
    const OTHER = "FITS2025";
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container); // pending write for PASSWORD
    const firstButton = requireCopyButton(container);
    await act(async () => {
      rerender(<FactRows rows={[{ k: "Power", v: "3 x 20A", testId: "other" }]} />);
    });
    premiseHolds(
      "the dispatching island really unmounted",
      container.querySelector(`[data-testid="${TESTID}"]`) === null,
    );
    await act(async () => {
      rerender(<FactRows rows={[passwordRow({ v: OTHER })]} />); // a LATER commit
    });
    premiseHolds("the restored row is a new island", requireCopyButton(container) !== firstButton);

    await clickCopy(container);
    await settle(1);
    premiseHolds("the restored island's own confirmation is standing", isCopied(container));

    await settle(0); // the original write finally lands, overwriting the clipboard

    expect(
      isCopied(container),
      "a confirmation the clipboard no longer backs must not stay lit",
    ).toBe(false);
    expect(
      logTexts(container),
      "the log must not end on a claim the clipboard stopped backing",
    ).toEqual([COPIED_TEXT, CORRECTIVE_TEXT]);
  });

  test("a copy on ANOTHER row retracts the confirmation it invalidated", async () => {
    // The same fact from its other producer, and the one that needs no unmount:
    // two opted-in rows write to the same clipboard, so the second copy makes
    // the first row's standing "Copied." false. Same value on both rows is NOT
    // this case — the claim is about the string, so it stays true (§4.2).
    const roomCode: FactRow = {
      k: "Room code",
      v: "4821",
      testId: "venue-room-code",
      copyLabel: "Copy the room code",
    };
    const { container } = render(<FactRows rows={[passwordRow(), roomCode]} />);
    const entriesIn = (testId: string) =>
      Array.from(rowEl(container, testId).querySelectorAll("[data-announce-id]")).map(
        (n) => n.textContent ?? "",
      );
    const copiedIn = (testId: string) =>
      rowEl(container, testId).querySelector("[data-slot='check-glyph']") !== null;

    await act(async () => {
      fireEvent.click(requireCopyButton(container, "venue-room-code"));
    });
    await settle(0);
    premiseHolds("the room code's confirmation is standing", copiedIn("venue-room-code"));

    await clickCopy(container); // the password row copies over it
    await settle(1);

    expect(copiedIn(TESTID), "the row just tapped confirms").toBe(true);
    expect(
      copiedIn("venue-room-code"),
      "a confirmation the clipboard no longer backs must not stay lit",
    ).toBe(false);
    expect(entriesIn("venue-room-code")).toEqual([COPIED_TEXT, CORRECTIVE_TEXT]);
    expect(entriesIn(TESTID), "the tapped row's own claim is still true").toEqual([COPIED_TEXT]);
  });

  test.each([
    ["the password row last", 1, 0],
    ["the room code last", 0, 1],
  ])(
    "two rows resolving in ONE batch leave the LAST writer's claim standing (%s)",
    async (_label, firstIndex, lastIndex) => {
      // Both rows' writes land in one React batch. Whichever resolved LAST is
      // what the clipboard holds, so that row's claim is true and the other's
      // is not — and the retraction must be decided against the clipboard's
      // FINAL content, never against whichever broadcast happened to arrive
      // while the batch was still running. Excluding the delivered owner from
      // its own broadcast made the last writer process only the PREVIOUS
      // writer's message, so it retracted a claim that was true and both rows
      // ended corrected. (Round 19.)
      const roomCode: FactRow = {
        k: "Room code",
        v: "4821",
        testId: "venue-room-code",
        copyLabel: "Copy the room code",
      };
      const { container } = render(<FactRows rows={[passwordRow(), roomCode]} />);
      const testIdOf = (writeIndex: number) => (writeIndex === 0 ? TESTID : "venue-room-code");
      const entriesIn = (testId: string) =>
        Array.from(rowEl(container, testId).querySelectorAll("[data-announce-id]")).map(
          (n) => n.textContent ?? "",
        );
      const copiedIn = (testId: string) =>
        rowEl(container, testId).querySelector("[data-slot='check-glyph']") !== null;

      await clickCopy(container); // write 0 — the password row
      await act(async () => {
        fireEvent.click(requireCopyButton(container, "venue-room-code")); // write 1
      });
      premise("both writes are genuinely in flight", writes.length, 1);

      await act(async () => {
        writes[firstIndex]!.resolve();
        writes[lastIndex]!.resolve(); // same batch, no await between them
      });

      const last = testIdOf(lastIndex);
      const first = testIdOf(firstIndex);
      expect(copiedIn(last), "the row the clipboard actually holds must confirm").toBe(true);
      expect(entriesIn(last), "a true claim must not be retracted").toEqual([COPIED_TEXT]);
      expect(copiedIn(first), "the overwritten row's claim is no longer true").toBe(false);
      expect(entriesIn(first)).toEqual([COPIED_TEXT, CORRECTIVE_TEXT]);
    },
  );

  test("a replacement replaced AGAIN before the sweep still carries the chain", async () => {
    // TWO swaps inside one vacancy window: a commit replaces island A with B,
    // and a layout effect committed with it synchronously replaces B with C —
    // no microtask runs in between, so the sweep has not cleared anything.
    // Consuming a claimed vacancy by MARKING IT AMBIGUOUS conflated "already
    // claimed" with "two islands vacated at once", so B's offer was refused, B
    // got no successor, and A's older write walked A -> B -> null and landed
    // nowhere. Nothing is mis-delivered — but nothing is RETRACTED either, and
    // the consequence is the exact shape this arc's consequence bound forbids:
    // C's "Copied." stays the log's last word while the clipboard holds the
    // value A wrote. (Whole-diff review round 16.)
    const OTHER = "FITS2025";
    const commits: number[] = [];
    function Swapper({ swap }: { swap: boolean }) {
      const [generation, setGeneration] = useState(1);
      useLayoutEffect(() => {
        commits.push(generation);
        // A layout effect's update commits synchronously, before the browser
        // paints and before any microtask runs — which is what puts the second
        // swap inside the first one's vacancy window.
        if (swap && generation === 1) setGeneration(2);
        else if (generation === 2) setGeneration(3);
      }, [swap, generation]);
      return (
        <FactRows
          key={`v${generation}`}
          rows={[passwordRow(generation === 1 ? {} : { v: OTHER })]}
        />
      );
    }

    const { container, rerender } = render(<Swapper swap={false} />);
    await clickCopy(container); // island A's write, for PASSWORD, still pending

    await act(async () => {
      rerender(<Swapper swap />);
    });
    premiseHolds(
      "three islands really committed in order, so B existed to be replaced",
      commits.slice(-3).join(",") === "1,2,3",
    );
    premiseHolds(
      "the surviving island shows the NEW value",
      valueSpan(container).textContent === OTHER,
    );

    // C copies its own value and stands a confirmation.
    await clickCopy(container);
    await settle(1);
    premiseHolds("the survivor's own confirmation is standing", isCopied(container));

    await settle(0); // A's older write finally lands, carrying the OLD value

    expect(
      isCopied(container),
      "a confirmation the clipboard no longer backs must not stay lit",
    ).toBe(false);
    expect(
      logTexts(container),
      "the log must not end on a claim the clipboard stopped backing",
    ).toEqual([COPIED_TEXT, CORRECTIVE_TEXT]);
  });
});

// ---------------------------------------------------------------------------
// Timer contract — the shared constant
// ---------------------------------------------------------------------------

describe("copied window (§4.2, fake timers)", () => {
  test("copied clears at exactly the shared reset constant", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    expect(isCopied(container)).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 1);
    });
    expect(isCopied(container)).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(isCopied(container)).toBe(false);
    // The natural timeout is the ONE exit that appends no corrective.
    expect(logTexts(container)).toEqual([COPIED_TEXT]);
  });

  test("an announcement is pruned from the log at the shared TTL, not before", async () => {
    // The channel is TTL-pruned rather than cap-only because a crew page is
    // opened once and left open for the show: an unpruned log leaves every
    // "Copied." sitting in the accessibility tree hours later, so a top-down
    // screen-reader read recites them all (the audit finding that put the TTL
    // on the admin layout channel). Both halves are asserted — pruning EARLY
    // would strand an announcement assistive technology has not spoken yet,
    // which is the opposite defect and the reason the delay is 30s.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    expect(logTexts(container)).toEqual([COPIED_TEXT]);

    await act(async () => {
      vi.advanceTimersByTime(ANNOUNCE_LOG_TTL_MS - 1);
    });
    expect(
      logTexts(container),
      "an entry pruned before the TTL could be one the screen reader has not spoken",
    ).toEqual([COPIED_TEXT]);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(logTexts(container), "the entry must not outlive its TTL").toEqual([]);
  });

  test("a re-tap inside the window restarts it rather than inheriting the old timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    const half = Math.floor(COPY_FEEDBACK_RESET_MS / 2);
    await act(async () => {
      vi.advanceTimersByTime(half);
    });

    await clickCopy(container);
    await settle(1);

    // Past the FIRST window's deadline, still copied…
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - half + 1);
    });
    expect(isCopied(container)).toBe(true);

    // …and clearing only once the SECOND window elapses.
    await act(async () => {
      vi.advanceTimersByTime(half);
    });
    expect(isCopied(container)).toBe(false);
  });

  test("a stale-order resolution does not extend the newest write's window", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await clickCopy(container);
    await settle(1); // newest write arms the window
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    await settle(0); // the older write lands mid-window

    // Truth is value-only, so the older write still appends its entry…
    expect(logTexts(container)).toEqual([COPIED_TEXT, COPIED_TEXT]);
    // …but arming is routed by sequence, so the window still ends on the
    // NEWEST write's clock, not 500ms later.
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 500);
    });
    expect(isCopied(container)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The shared timing constant, pinned at the SOURCE
// ---------------------------------------------------------------------------

describe("copy-feedback reset constant (DEFERRED.md timing-inventory trigger)", () => {
  const CONSUMERS = [
    "components/crew/primitives/CopyFactValue.tsx",
    "app/admin/show/[slug]/ShareLinkCopyButton.tsx",
  ];

  test("the constant is the 2s window both consumers share", () => {
    expect(COPY_FEEDBACK_RESET_MS).toBe(2_000);
  });

  test.each(CONSUMERS)("%s imports the constant instead of inlining a literal", (file) => {
    const src = readFileSync(file, "utf8");

    expect(src).toMatch(
      /import\s*\{[^}]*\bCOPY_FEEDBACK_RESET_MS\b[^}]*\}\s*from\s*"@\/lib\/ui\/copyFeedback"/,
    );
    // A re-inlined literal is the drift this pin exists to catch: the source
    // assertion fails where a behavioral test would still pass.
    expect(src).not.toMatch(/setTimeout\([^;]*?,\s*2_?000\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// Transition inventory (spec §"Transition Inventory", verbatim)
// ---------------------------------------------------------------------------
//
// | pair                     | treatment                                        |
// | ---                      | ---                                              |
// | idle -> copied           | instant glyph swap (copy->check), no animation   |
// | copied -> idle (2 s)     | instant swap back                                |
// | idle <-> focus-visible   | ring paints/clears instantly (CSS state)         |
// | copied <-> focus-visible | ring over the check glyph; both states compose   |
//
// Compounds: re-tap while copied (append + reset); prop change while copied
// (reset + corrective); overlapping same-value and different-value inversions;
// remount trace (ledger routing). The compounds are covered by the describes
// above; this block covers the four base pairs.

describe("transition inventory", () => {
  test("idle -> copied is an instant glyph swap with no animation classes", async () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);
    const button = requireCopyButton(container);

    expect(button.querySelector("[data-slot='copy-glyph']")).not.toBeNull();
    expect(button.querySelector("[data-slot='check-glyph']")).toBeNull();

    await clickCopy(container);
    await settle(0);

    const after = requireCopyButton(container);
    expect(after.querySelector("[data-slot='check-glyph']")).not.toBeNull();
    expect(after.querySelector("[data-slot='copy-glyph']")).toBeNull();
    // No animation anywhere, so prefers-reduced-motion is moot (spec).
    const classes = Array.from(classesOf(after));
    expect(classes.some((c) => c.startsWith("animate-") || c.startsWith("transition"))).toBe(false);
  });

  test("copied -> idle swaps straight back", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container);
    await settle(0);
    await act(async () => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS);
    });

    expect(requireCopyButton(container).querySelector("[data-slot='copy-glyph']")).not.toBeNull();
  });

  test("the focus ring is a pure CSS state, so it composes with both glyphs", async () => {
    const { container } = render(<FactRows rows={[passwordRow()]} />);
    const idleClasses = classesOf(requireCopyButton(container));

    await clickCopy(container);
    await settle(0);
    const copiedClasses = classesOf(requireCopyButton(container));

    // Same ring declarations in both states: nothing in the copied branch adds,
    // removes, or overrides a focus-visible class, so idle<->focus-visible and
    // copied<->focus-visible are the same transition.
    const rings = (set: Set<string>) =>
      Array.from(set).filter((c) => c.startsWith("focus-visible:"));
    premise("the idle state declares a ring at all", rings(idleClasses).length, 0);
    expect(rings(copiedClasses).sort()).toEqual(rings(idleClasses).sort());
  });
});
