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
 *     through whichever island is registered at resolution time.
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { FactRows, type FactRow } from "@/components/crew/primitives/FactRows";
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
    ]);
    expect(classesOf(tile!)).not.toContain("text-text-subtle");

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

  test("a write pending across a REAL remount delivers through the new owner", async () => {
    const { container, rerender } = render(<FactRows rows={[passwordRow()]} />);

    await clickCopy(container); // pending, owned by the first island
    await act(async () => {
      // A changed testId changes the row key: island A unmounts, island B mounts.
      rerender(<FactRows rows={[passwordRow({ testId: "venue-wifi-password-b" })]} />);
    });
    premiseHolds(
      "the original island really is gone",
      container.querySelector(`[data-testid="${TESTID}"]`) === null,
    );
    expect(logTexts(container)).toEqual([]);

    await settle(0);

    // The resolution routes to whichever island is registered at resolution
    // time. Without that routing it would setState on a dead island and this
    // region would stay empty.
    expect(logTexts(container)).toEqual([COPIED_TEXT]);
    expect(container.querySelector(`[data-testid="${TESTID}"]`)).toBeNull(); // the old row is gone…
    expect(
      container.querySelector("[data-testid='venue-wifi-password-b'] [data-slot='check-glyph']"),
    ).not.toBeNull(); // …and the NEW island is the one showing copied
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
