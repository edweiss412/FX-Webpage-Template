// @vitest-environment jsdom
/**
 * tests/components/admin/review/attentionBanner.test.tsx
 *
 * AttentionBanner render rules (published-show-alerts spec §5.4) — parity with
 * the retired PerShowAlertSection row: emphasis-rendered template with
 * fallback, action/help links, failedKeys + dataGaps detail lines, identity
 * suppression (inline-identity codes AND under-crew-row), auto-clear note vs
 * resolve button, confirmed swap + onResolved. Invariant 5: the raw code never
 * reaches the DOM.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import { formatDataGapBreakdown } from "@/lib/parser/dataGaps";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

const NOW = new Date("2026-07-19T12:00:00Z");

function item(over: {
  id?: string;
  tone?: "critical" | "notice";
  menuSubtitle?: string | null;
  actionable?: boolean;
  clearingKind?: "self_heal" | "needs_look";
  sectionId?: AttentionItem["sectionId"];
  alert?: Partial<NonNullable<AttentionItem["alert"]>>;
}): AttentionItem {
  return {
    id: over.id ?? "alert:a1",
    kind: "alert",
    tone: over.tone ?? "notice",
    sectionId: over.sectionId ?? "crew",
    crewKey: null,
    actionable: over.actionable ?? true,
    ...(over.clearingKind ? { clearingKind: over.clearingKind } : {}),
    menuTitle: "Role flags changed",
    menuSubtitle: over.menuSubtitle === undefined ? "Crew · John Redcorn" : over.menuSubtitle,
    alert: {
      alertId: "a1",
      code: "TEST_FAKE_CODE_FOR_BANNER",
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-19T10:00:00Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
      ...over.alert,
    },
  };
}

function renderBanner(
  it: AttentionItem,
  over: Partial<Parameters<typeof AttentionBanner>[0]> = {},
) {
  return render(
    <AttentionBanner
      item={it}
      slug="test-show"
      now={NOW}
      highlighted={false}
      onResolved={() => {}}
      {...over}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AttentionBanner", () => {
  test("hold items render nothing", () => {
    const hold: AttentionItem = {
      id: "hold:h1",
      kind: "hold",
      tone: "critical",
      sectionId: "changes",
      crewKey: null,
      actionable: true,
      menuTitle: "x",
      menuSubtitle: null,
    };
    const { container } = renderBanner(hold);
    expect(container.innerHTML).toBe("");
  });

  test("template renders via emphasis; no literal markers; anchor + testid present", () => {
    const it = item({
      alert: { template: "Check **<sheet-name>**", params: { "sheet-name": "II - Demo" } },
    });
    const { container } = renderBanner(it);
    const root = container.querySelector('[data-attention-anchor="alert:a1"]')!;
    expect(root).toBeTruthy();
    expect(root.querySelector("strong, b")).toBeTruthy();
    expect(root.textContent).toContain("II - Demo");
    expect(root.textContent).not.toContain("**");
  });

  test("null template → fallback line; the raw code NEVER appears in the DOM (invariant 5)", () => {
    const { container } = renderBanner(item({}));
    expect(container.textContent).toContain("Something needs your attention on this show.");
    expect(container.textContent).not.toContain("TEST_FAKE_CODE_FOR_BANNER");
  });

  test("action link with external marker; absent when null", () => {
    const withAction = item({
      alert: { action: { label: "Open in Sheet", href: "https://x.example/s", external: true } },
    });
    renderBanner(withAction);
    const link = screen.getByTestId("attention-banner-action-a1");
    expect(link).toHaveAttribute("href", "https://x.example/s");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.textContent).toContain("↗");
    cleanup();
    const { container } = renderBanner(item({}));
    expect(container.querySelector('[data-testid="attention-banner-action-a1"]')).toBeNull();
  });

  // The freestanding "Learn more" link is retired; help now lives behind the
  // "?" popover trigger (R3/G2). Presence is driven by the §3.2 contract.
  test("help trigger present with a helpHref; absent with neither help source", () => {
    renderBanner(item({ alert: { helpHref: "/help/errors#x" } }));
    expect(screen.getByTestId("attention-banner-help-a1-trigger")).toBeInTheDocument();
    cleanup();
    const { container } = renderBanner(item({}));
    expect(container.querySelector('[data-testid="attention-banner-help-a1-trigger"]')).toBeNull();
  });

  test("failedKeys + dataGaps detail lines; absent when null", () => {
    renderBanner(
      item({
        alert: {
          failedKeys: ["hotel", "rooms"],
          // Real gap-class code (GAP_CLASSES registry, lib/parser/dataGaps.ts:30).
          // The previous fixture used a made-up `unknown_section` key cast to
          // `never`, so formatDataGapBreakdown returned "" and the old
          // assertion passed purely on the static prefix it checked.
          dataGaps: { total: 2, classes: { UNKNOWN_SECTION_HEADER: 2 } } as never,
        },
      }),
    );
    // Detail band joins with the middot separator (spec §4.1), and the entry
    // carries its caps micro-label.
    expect(screen.getByTestId("attention-banner-failed-sources-a1").textContent).toContain(
      "hotel · rooms",
    );
    // Derived from the fixture via the same formatter the component uses, so a
    // silently-empty breakdown cannot pass (that is exactly what the old
    // prefix-only assertion allowed).
    expect(screen.getByTestId("attention-banner-data-gaps-a1").textContent).toContain(
      formatDataGapBreakdown({ total: 2, classes: { UNKNOWN_SECTION_HEADER: 2 } } as never),
    );
    expect(screen.getByTestId("attention-banner-data-gaps-a1").textContent).toContain(
      "unknown section",
    );
    cleanup();
    const { container } = renderBanner(item({}));
    expect(
      container.querySelector('[data-testid="attention-banner-failed-sources-a1"]'),
    ).toBeNull();
    expect(container.querySelector('[data-testid="attention-banner-data-gaps-a1"]')).toBeNull();
  });

  // R6: the identity sub-line is gone. This card only renders inside the show
  // modal, which already establishes the show, so the line was redundant.
  test("identity sub-line is never rendered", () => {
    const { container } = renderBanner(item({}));
    expect(container.querySelector('[data-testid="attention-banner-identity"]')).toBeNull();
    expect(container.textContent).not.toContain("John Redcorn");
  });

  test("actionable → resolve button; autoClearNote → note, no button", () => {
    renderBanner(item({}));
    expect(screen.getByTestId("per-show-alert-resolve-a1")).toBeInTheDocument();
    cleanup();
    const { container } = renderBanner(
      item({
        alert: { autoClearNote: "Clears automatically once the sheet is back or re-parses." },
      }),
    );
    expect(screen.getByTestId("attention-banner-autoclear-a1")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="per-show-alert-resolve-a1"]')).toBeNull();
  });

  test("resolve success → ✓ Confirmed swap, anchor stays mounted, onResolved(id) fires", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ status: "resolved", id: "a1", resolved_at: "2026-07-19T12:01:00Z" }),
      })),
    );
    const onResolved = vi.fn();
    const { container } = renderBanner(item({}), { onResolved });
    screen.getByTestId("per-show-alert-resolve-a1").click();
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith("alert:a1"));
    expect(screen.getByTestId("attention-banner-confirmed-a1")).toBeInTheDocument();
    expect(container.querySelector('[data-attention-anchor="alert:a1"]')).toBeTruthy();
  });

  // The stripe now lives on the CompactAlertCard element; the anchor wrapper
  // stays a bare positioning/identity host (it must remain mounted across the
  // confirmed swap, so it carries no skin of its own).
  test("tone stripe classes: notice → border-l-status-review; critical → border-l-status-degraded", () => {
    renderBanner(item({}));
    expect(screen.getByTestId("compact-alert-card").className).toContain("border-l-status-review");
    cleanup();
    renderBanner(item({ tone: "critical" }));
    expect(screen.getByTestId("compact-alert-card").className).toContain(
      "border-l-status-degraded",
    );
  });

  test("highlighted → aria-current true; otherwise absent", () => {
    const { container } = renderBanner(item({}), { highlighted: true });
    expect(
      container.querySelector('[data-attention-anchor="alert:a1"]')!.getAttribute("aria-current"),
    ).toBe("true");
    cleanup();
    const { container: c2 } = renderBanner(item({}));
    expect(
      c2.querySelector('[data-attention-anchor="alert:a1"]')!.getAttribute("aria-current"),
    ).toBeNull();
  });

  // ---- guard cases added after plan review R1 (findings 11, 12, 13, 21) ----

  // Failure mode: guarding only the INPUT string. A template of bare emphasis
  // markers is non-empty but renders no visible text, so the card would show an
  // empty message row instead of the fallback.
  test.each([["**"], ["  __  "], ["``"]])(
    "template %j renders no visible text → fallback line",
    (template) => {
      const { container } = renderBanner(item({ alert: { template } }));
      expect(container.textContent).toContain("Something needs your attention on this show.");
    },
  );

  // Failure mode: a "nonzero and not NaN" guard. Negative and infinite totals
  // would render a nonsense Dropped entry.
  test.each([
    ["zero", 0],
    ["negative", -3],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("dataGaps total %s → no Dropped entry", (_label, total) => {
    const { container } = renderBanner(
      item({ alert: { dataGaps: { total, classes: { UNKNOWN_SECTION_HEADER: 2 } } as never } }),
    );
    expect(container.querySelector('[data-testid="attention-banner-data-gaps-a1"]')).toBeNull();
  });

  test("failedKeys of only whitespace entries → no Failed entry", () => {
    const { container } = renderBanner(item({ alert: { failedKeys: ["  ", "\t"] } }));
    expect(
      container.querySelector('[data-testid="attention-banner-failed-sources-a1"]'),
    ).toBeNull();
  });

  // Boundary: exactly at the cap must NOT emit "+0 more", and one past it must
  // show the cap plus an accurate remainder.
  test("exactly 6 failed keys → all six, no overflow suffix", () => {
    const keys = ["a", "b", "c", "d", "e", "f"];
    renderBanner(item({ alert: { failedKeys: keys } }));
    const text = screen.getByTestId("attention-banner-failed-sources-a1").textContent ?? "";
    for (const k of keys) expect(text).toContain(k);
    expect(text).not.toContain("more");
  });

  test("7 failed keys → six shown plus '+1 more'", () => {
    renderBanner(item({ alert: { failedKeys: ["a", "b", "c", "d", "e", "f", "g"] } }));
    const text = screen.getByTestId("attention-banner-failed-sources-a1").textContent ?? "";
    expect(text).toContain("+1 more");
    expect(text).not.toContain("g");
  });

  test("whitespace-only autoClearNote → resolve button, not a note", () => {
    const { container } = renderBanner(item({ alert: { autoClearNote: "   " } }));
    expect(screen.getByTestId("per-show-alert-resolve-a1")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="attention-banner-autoclear-a1"]')).toBeNull();
  });

  test("no action → footer shows the time with no leading separator", () => {
    renderBanner(item({}));
    const footerLeft = screen.getByTestId("compact-alert-footer-left");
    expect(footerLeft.textContent?.trimStart().startsWith("Raised")).toBe(true);
  });

  // A wholesale markup rewrite can silently drop these; every deep link and the
  // scroll-into-view machinery depends on them.
  test("preserved DOM contracts: anchor, aria-current, and the confirmed-swap host", () => {
    const { container } = renderBanner(item({}), { highlighted: true });
    const anchor = container.querySelector('[data-attention-anchor="alert:a1"]');
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute("aria-current", "true");
    cleanup();
    const { container: c2 } = renderBanner(item({}));
    expect(c2.querySelector('[data-attention-anchor="alert:a1"]')).not.toBeNull();
    expect(
      c2.querySelector('[data-attention-anchor="alert:a1"]')!.getAttribute("aria-current"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Destination chip (attention-index §2.3, plan Task 4)
//
// For needs-you items that are NOT actionable, the footer-right slot holds a
// destination chip instead of the auto-clear note, and footerLeft's duplicate
// action link is dropped. The chip is EXTERNAL-ONLY: every chip that can render
// reads "Google Sheets ↗", because the only internal-action needs-look codes
// route their card to the same section their action targets.
// ---------------------------------------------------------------------------

const SHEET_HREF = "https://docs.google.com/spreadsheets/d/FILE/edit#gid=0";

function needsLookItem(over: Parameters<typeof item>[0] = {}) {
  return item({ actionable: false, clearingKind: "needs_look", ...over });
}

describe("destination chip", () => {
  // Spec test 7.
  test("external action: footer-right holds the Google Sheets chip; note gone, no duplicate link", () => {
    renderBanner(
      needsLookItem({
        sectionId: "overview",
        alert: {
          code: "SHEET_UNAVAILABLE",
          autoClearNote: "Clears when the sheet is reachable again.",
          action: { label: "Open in Sheet", href: SHEET_HREF, external: true },
        },
      }),
    );
    const chip = screen.getByTestId("attention-banner-destination-a1");
    expect(chip).toHaveAttribute("href", SHEET_HREF);
    expect(chip).toHaveAttribute("target", "_blank");
    expect(chip).toHaveAttribute("rel", "noopener noreferrer");
    expect(chip.textContent).toContain("Google Sheets");
    // the note is replaced, not merely hidden
    expect(screen.queryByTestId("attention-banner-autoclear-a1")).toBeNull();
    // footerLeft's action link is gone — the chip is the single way out
    expect(screen.queryByTestId("attention-banner-action-a1")).toBeNull();
    // "Raised ..." survives
    expect(screen.getByText(/Raised/)).toBeInTheDocument();
  });

  // Spec test 8 — the anti-tautology case for test 7. A naive implementation
  // that always renders the chip passes 7 and fails this. The mechanism is the
  // `external` gate: this action is internal, so no chip can render.
  test("an internal action renders NO chip (card and action both in Overview)", () => {
    renderBanner(
      needsLookItem({
        sectionId: "overview",
        alert: {
          code: "SHOW_UNPUBLISHED",
          autoClearNote: "Clears when the show is published again.",
          action: { label: "Go to Overview", href: "/admin?show=x#overview", external: false },
        },
      }),
    );
    expect(screen.queryByTestId("attention-banner-destination-a1")).toBeNull();
    expect(screen.queryByTestId("attention-banner-autoclear-a1")).toBeNull();
    expect(screen.getByText(/Raised/)).toBeInTheDocument();
  });

  // Spec test 9. The note assertion is the load-bearing half:
  // ASSET_RECOVERY_BYTES_EXCEEDED is a reachable needs-look code with no
  // registered action, so an implementation that swaps note-for-chip only when
  // an action exists leaves the note in place for it and still passes 7 and 8.
  test("null action: no chip, no crash, and the auto-clear note is ABSENT", () => {
    renderBanner(
      needsLookItem({
        sectionId: "overview",
        alert: {
          code: "ASSET_RECOVERY_BYTES_EXCEEDED",
          autoClearNote: "Clears when the gallery fits.",
          action: null,
        },
      }),
    );
    expect(screen.queryByTestId("attention-banner-destination-a1")).toBeNull();
    expect(screen.queryByTestId("attention-banner-autoclear-a1")).toBeNull();
    expect(screen.getByText(/Raised/)).toBeInTheDocument();
  });

  // Spec test 9b, warnings-UNAVAILABLE column. The notes channel normally
  // intercepts these two codes before the card path, but when the warnings
  // section is unavailable they fall THROUGH to an Overview card — the state an
  // earlier spec draft wrongly called unreachable. Their actions are internal,
  // so the `external` gate keeps them chip-less there too.
  test.each(["PARSE_ERROR_LAST_GOOD", "RESYNC_QUALITY_REGRESSED"])(
    "%s on the Overview fallback carries NO chip (internal action)",
    (code) => {
      renderBanner(
        needsLookItem({
          sectionId: "warnings",
          alert: {
            code,
            autoClearNote: "Clears on the next good sync.",
            action: { label: "Go to Overview", href: "/admin?show=x#overview", external: false },
          },
        }),
      );
      expect(screen.queryByTestId("attention-banner-destination-a1")).toBeNull();
      expect(screen.queryByTestId("attention-banner-autoclear-a1")).toBeNull();
    },
  );

  // §2.3 says an internal-destination chip is NOT implemented and would need an
  // amendment. So an internal action renders NO chip AT ALL — not a same-tab
  // chip wearing the action's own label. Deliberately uses a card section that
  // DIFFERS from the action's target, so an implementation gated on same-section
  // routing rather than on `external` would render a chip here and fail.
  test("an internal action renders NO chip even when it points at a DIFFERENT section", () => {
    renderBanner(
      needsLookItem({
        // card in warnings, action targets overview: the sections DIFFER, so a
        // same-section rule would render a chip here — only the `external` gate
        // suppresses it
        sectionId: "warnings",
        alert: {
          code: "PARSE_ERROR_LAST_GOOD",
          autoClearNote: "Clears on the next good sync.",
          action: { label: "Go to Overview", href: "/admin?show=x#overview", external: false },
        },
      }),
    );
    expect(screen.queryByTestId("attention-banner-destination-a1")).toBeNull();
    // and it does not silently fall back to the row-style inline action link
    expect(screen.queryByTestId("attention-banner-action-a1")).toBeNull();
  });

  test("monitoring (self-heal) cards are unchanged: auto-clear note, no chip", () => {
    renderBanner(
      needsLookItem({
        clearingKind: "self_heal",
        sectionId: "overview",
        alert: {
          code: "SYNC_STALLED",
          autoClearNote: "Clears when syncing resumes.",
          action: { label: "Open in Sheet", href: SHEET_HREF, external: true },
        },
      }),
    );
    expect(screen.getByTestId("attention-banner-autoclear-a1")).toBeInTheDocument();
    expect(screen.queryByTestId("attention-banner-destination-a1")).toBeNull();
  });
});
