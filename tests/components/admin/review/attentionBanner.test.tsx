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
  alert?: Partial<NonNullable<AttentionItem["alert"]>>;
}): AttentionItem {
  return {
    id: over.id ?? "alert:a1",
    kind: "alert",
    tone: over.tone ?? "notice",
    sectionId: "crew",
    crewKey: null,
    actionable: true,
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
      ...over.alert,
    },
  };
}

function renderBanner(it: AttentionItem, over: Partial<Parameters<typeof AttentionBanner>[0]> = {}) {
  return render(
    <AttentionBanner
      item={it}
      slug="test-show"
      now={NOW}
      underCrewRow={false}
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
    const it = item({ alert: { template: "Check **<sheet-name>**", params: { "sheet-name": "II - Demo" } } });
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

  test("help link when helpHref; absent when null", () => {
    renderBanner(item({ alert: { helpHref: "/help/errors#x" } }));
    expect(screen.getByTestId("attention-banner-help-a1")).toHaveAttribute("href", "/help/errors#x");
    cleanup();
    const { container } = renderBanner(item({}));
    expect(container.querySelector('[data-testid="attention-banner-help-a1"]')).toBeNull();
  });

  test("failedKeys + dataGaps detail lines; absent when null", () => {
    renderBanner(
      item({
        alert: {
          failedKeys: ["hotel", "rooms"],
          dataGaps: { total: 2, classes: { unknown_section: 2 } } as never,
        },
      }),
    );
    expect(screen.getByTestId("attention-banner-failed-sources-a1").textContent).toContain(
      "hotel, rooms",
    );
    expect(screen.getByTestId("attention-banner-data-gaps-a1").textContent).toContain(
      "Data dropped while parsing:",
    );
    cleanup();
    const { container } = renderBanner(item({}));
    expect(container.querySelector('[data-testid="attention-banner-failed-sources-a1"]')).toBeNull();
    expect(container.querySelector('[data-testid="attention-banner-data-gaps-a1"]')).toBeNull();
  });

  test("identity sub-line: shown for null-template rows; hidden when underCrewRow", () => {
    renderBanner(item({}));
    expect(screen.getByTestId("attention-banner-identity").textContent).toBe("Crew · John Redcorn");
    cleanup();
    const { container } = renderBanner(item({}), { underCrewRow: true });
    expect(container.querySelector('[data-testid="attention-banner-identity"]')).toBeNull();
  });

  test("actionable → resolve button; autoClearNote → note, no button", () => {
    renderBanner(item({}));
    expect(screen.getByTestId("per-show-alert-resolve-a1")).toBeInTheDocument();
    cleanup();
    const { container } = renderBanner(
      item({ alert: { autoClearNote: "Clears automatically once the sheet is back or re-parses." } }),
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

  test("tone stripe classes: notice → border-l-status-review; critical → border-l-status-degraded", () => {
    const { container } = renderBanner(item({}));
    expect(
      container.querySelector('[data-attention-anchor="alert:a1"]')!.className,
    ).toContain("border-l-status-review");
    cleanup();
    const { container: c2 } = renderBanner(item({ tone: "critical" }));
    expect(
      c2.querySelector('[data-attention-anchor="alert:a1"]')!.className,
    ).toContain("border-l-status-degraded");
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
});
