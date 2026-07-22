// @vitest-environment jsdom
/**
 * Attention-menu clearing groups
 * (spec 2026-07-21-attention-needs-attention-split §3.4, §11.6-§11.8).
 *
 * Failure modes caught: a needs-look row acquiring extra interactive
 * descendants; external links missing the full rel contract; internal links
 * leaking target/rel; monitoring items enumerated instead of summarized; a
 * dead link on a failed action resolution; a link click leaving the menu open.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import { ATTENTION_FALLBACK_TITLE, type AttentionItem } from "@/lib/admin/attentionItems";
import { autoResolveNote } from "@/lib/adminAlerts/audience";

afterEach(cleanup);

type AlertItem = Extract<AttentionItem, { kind: "alert" }>;

function item(
  id: string,
  code: string,
  over: Partial<AlertItem> & { action?: AlertItem["alert"]["action"] } = {},
): AttentionItem {
  const { action = null, ...rest } = over;
  return {
    id: `alert:${id}`,
    kind: "alert",
    tone: "notice",
    sectionId: "overview",
    crewKey: null,
    actionable: false,
    menuTitle: `Title ${id}`,
    menuSubtitle: null,
    alert: {
      alertId: id,
      code,
      template: null,
      params: {},
      action,
      helpHref: null,
      raisedAt: "2026-07-21T09:00:00.000Z",
      occurrenceCount: 1,
      autoClearNote: "note",
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
    ...rest,
  };
}

const needsLook = (
  id: string,
  code = "SHEET_UNAVAILABLE",
  action: AlertItem["alert"]["action"] = null,
) => item(id, code, { clearingKind: "needs_look", action });
const selfHeal = (id: string, menuTitle: string) =>
  item(id, "SYNC_STALLED", { clearingKind: "self_heal", menuTitle });

const SHEET = "https://docs.google.com/spreadsheets/d/FILE/edit#gid=0";

function renderMenu(items: AttentionItem[], onClose = vi.fn()) {
  const pillRef = createRef<HTMLButtonElement>();
  render(
    <AttentionMenu items={items} open onClose={onClose} onNavigate={vi.fn()} pillRef={pillRef} />,
  );
  return onClose;
}

describe("needs-a-look group", () => {
  it("external sheet link carries exact target + full rel, and label", () => {
    renderMenu([
      needsLook("n1", "SHEET_UNAVAILABLE", { label: "Open in Sheet", href: SHEET, external: true }),
    ]);
    const a = screen.getByRole("link", { name: /Open in Sheet/ });
    expect(a).toHaveAttribute("href", SHEET);
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("internal anchor carries neither target nor rel", () => {
    renderMenu([
      needsLook("n2", "SHOW_UNPUBLISHED", {
        label: "Go to Overview",
        href: "/admin?show=x#overview",
        external: false,
      }),
    ]);
    const a = screen.getByRole("link", { name: /Go to Overview/ });
    expect(a).not.toHaveAttribute("target");
    expect(a).not.toHaveAttribute("rel");
  });

  it("clicking an action link closes the menu (internal AND external)", () => {
    const onClose = renderMenu([
      needsLook("n3", "SHOW_UNPUBLISHED", {
        label: "Go to Overview",
        href: "/admin?show=x#overview",
        external: false,
      }),
      needsLook("n4", "SHEET_UNAVAILABLE", { label: "Open in Sheet", href: SHEET, external: true }),
    ]);
    fireEvent.click(screen.getByRole("link", { name: /Go to Overview/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("link", { name: /Open in Sheet/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("row carries sr-only tone text beside the aria-hidden dot (spec §3.4.2)", () => {
    renderMenu([needsLook("n7", "SHEET_UNAVAILABLE", null)]);
    const row = screen.getByTestId("attention-needslook-row-alert:n7");
    const srOnly = row.querySelector<HTMLElement>(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.textContent).toContain("needs review");
  });

  it("row shows the code's fix hint and is read-only apart from its single anchor", () => {
    renderMenu([
      needsLook("n5", "SHEET_UNAVAILABLE", { label: "Open in Sheet", href: SHEET, external: true }),
    ]);
    const row = screen.getByTestId("attention-needslook-row-alert:n5");
    expect(
      within(row).getByText(/Re-share the sheet with the service account\./),
    ).toBeInTheDocument();
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
  });

  it("boundary: a needs-look item whose action failed to resolve renders hint, NO link", () => {
    renderMenu([needsLook("n6", "SHEET_UNAVAILABLE", null)]);
    const row = screen.getByTestId("attention-needslook-row-alert:n6");
    expect(within(row).getByText(/Re-share the sheet/)).toBeInTheDocument();
    expect(within(row).queryAllByRole("link")).toHaveLength(0);
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("group headers (impeccable critique P1: no empty-section eyebrow)", () => {
  it("actionable-empty open: 'Needs your confirmation' header ABSENT, panel labeled by its real first group", () => {
    renderMenu([
      needsLook("h1", "SHEET_UNAVAILABLE", { label: "Open in Sheet", href: SHEET, external: true }),
    ]);
    expect(screen.queryByText("Needs your confirmation")).toBeNull();
    expect(screen.getByTestId("published-show-review-attention-menu")).toHaveAttribute(
      "aria-label",
      "Needs a look",
    );
  });

  it("actionable present: confirmation header renders and labels the panel", () => {
    renderMenu([item("h2", "PARSE_ERROR", { actionable: true })]);
    expect(screen.getByText("Needs your confirmation")).toBeInTheDocument();
    expect(screen.getByTestId("published-show-review-attention-menu")).toHaveAttribute(
      "aria-label",
      "Needs your confirmation",
    );
  });
});

describe("monitoring group (monitoring-badge-expand §3.2: enumerated rows)", () => {
  it("enumerates one row per self-heal item: fixture-derived block-level title + note, derivation order; summary retired MENU-WIDE", () => {
    const FIXTURE_ITEMS = [
      item("s1", "WATCH_CHANNEL_ORPHANED", {
        clearingKind: "self_heal",
        menuTitle: "Live updates need attention",
      }),
      item("s2", "SYNC_STALLED", { clearingKind: "self_heal", menuTitle: "Syncing has stalled" }),
    ];
    renderMenu(FIXTURE_ITEMS);
    const group = screen.getByTestId("attention-monitoring-group");
    expect(within(group).getByText("Monitoring")).toBeInTheDocument();
    const rows = within(group).getAllByTestId(/attention-monitoring-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "attention-monitoring-row-alert:s1",
      "attention-monitoring-row-alert:s2",
    ]);
    // titles derived from the fixture objects (anti-tautology), block-level pins:
    const t1 = within(rows[0]!).getByText(FIXTURE_ITEMS[0]!.menuTitle);
    const n1 = within(rows[0]!).getByText(autoResolveNote("WATCH_CHANNEL_ORPHANED"));
    expect(t1.className).toContain("block");
    expect(n1.className).toContain("block");
    expect(within(rows[1]!).getByText(FIXTURE_ITEMS[1]!.menuTitle)).toBeInTheDocument();
    expect(within(rows[1]!).getByText(autoResolveNote("SYNC_STALLED"))).toBeInTheDocument();
    // summary copy retired MENU-WIDE, not just inside the group
    const menu = screen.getByTestId("published-show-review-attention-menu");
    expect(within(menu).queryByText(/clearing on their own, no action needed/)).toBeNull();
  });

  it("rows are inert: structural + behavioral (spec §5.3 inertness pins)", () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    const pillRef = createRef<HTMLButtonElement>();
    render(
      <AttentionMenu
        items={[item("s1", "SYNC_STALLED", { clearingKind: "self_heal" })]}
        open
        onClose={onClose}
        onNavigate={onNavigate}
        pillRef={pillRef}
      />,
    );
    const row = screen.getByTestId("attention-monitoring-row-alert:s1");
    expect(row.tagName).toBe("DIV");
    expect(row.hasAttribute("tabindex")).toBe(false);
    expect(row.hasAttribute("role")).toBe(false);
    expect(
      [row, ...row.querySelectorAll<HTMLElement>("*")].filter((el) => el.tabIndex >= 0),
    ).toHaveLength(0);
    expect(row.querySelectorAll("button, a")).toHaveLength(0);
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
  });

  it("row visuals: single hollow positive dot, truncate title, separate note line (spec §5.3)", () => {
    const fixture = item("s1", "WATCH_CHANNEL_ORPHANED", {
      clearingKind: "self_heal",
      menuTitle: "Live updates need attention",
    });
    renderMenu([fixture]);
    const row = screen.getByTestId("attention-monitoring-row-alert:s1");
    const dots = [...row.querySelectorAll('[class*="border-status-positive"]')];
    expect(dots).toHaveLength(1);
    expect(dots[0]!.className).toContain("bg-transparent");
    expect(row.querySelector('[class*="bg-status-review"], [class*="bg-status-degraded"]')).toBeNull();
    const title = within(row).getByText(fixture.menuTitle);
    expect(title.className).toContain("truncate");
    const note = within(row).getByText(autoResolveNote("WATCH_CHANNEL_ORPHANED"));
    expect(title.contains(note)).toBe(false);
  });

  it("sr-only prefix: exactly ONE 'monitoring, ' node per row, preceding the title (spec §5.3)", () => {
    const fixture = item("s1", "SYNC_STALLED", {
      clearingKind: "self_heal",
      menuTitle: "Syncing has stalled",
    });
    renderMenu([fixture]);
    const row = screen.getByTestId("attention-monitoring-row-alert:s1");
    const srs = [...row.querySelectorAll(".sr-only")].filter(
      (el) => el.textContent === "monitoring, ",
    );
    expect(srs).toHaveLength(1);
    const title = within(row).getByText(fixture.menuTitle);
    expect(srs[0]!.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("fallbacks: no-note code renders generic line; uncataloged code renders fallback title; raw code never in textContent (spec §3.5)", () => {
    renderMenu([
      item("f1", "DRIVE_FETCH_FAILED", {
        clearingKind: "self_heal",
        menuTitle: "Drive fetch failed",
      }),
      item("f2", "TOTALLY_UNKNOWN_CODE", {
        clearingKind: "self_heal",
        menuTitle: ATTENTION_FALLBACK_TITLE,
      }),
    ]);
    const r1 = screen.getByTestId("attention-monitoring-row-alert:f1");
    expect(within(r1).getByText(autoResolveNote("DRIVE_FETCH_FAILED"))).toBeInTheDocument();
    expect(r1.textContent).not.toContain("DRIVE_FETCH_FAILED");
    const r2 = screen.getByTestId("attention-monitoring-row-alert:f2");
    expect(within(r2).getByText(ATTENTION_FALLBACK_TITLE)).toBeInTheDocument();
    expect(within(r2).getByText(autoResolveNote("TOTALLY_UNKNOWN_CODE"))).toBeInTheDocument();
    expect(r2.textContent).not.toContain("TOTALLY_UNKNOWN_CODE");
    // NOTE (anti-tautology disposition, plan R2 F4): this pins the MENU's
    // rendering only; the derivation-level fallback-title proof is the existing
    // T2_UNCATALOGED pin (tests/dev/attentionScenariosTier2.test.ts) and
    // alertTitle's own suite (lib/admin/attentionItems.ts:235-239).
  });

  it("defensive non-alert self-heal item renders menuTitle + generic note (spec §3.2)", () => {
    // Synthetic - the derivation layer cannot produce this (attentionItems.ts:262-266)
    const synthetic = {
      id: "hold:x",
      kind: "hold",
      tone: "notice",
      sectionId: "crew",
      crewKey: "dana-reed",
      actionable: false,
      clearingKind: "self_heal",
      menuTitle: "Synthetic hold",
      menuSubtitle: null,
    } as unknown as AttentionItem;
    renderMenu([synthetic]);
    const row = screen.getByTestId("attention-monitoring-row-hold:x");
    expect(within(row).getByText("Synthetic hold")).toBeInTheDocument();
    expect(within(row).getByText(autoResolveNote("__none__"))).toBeInTheDocument();
  });

  it("accessible name falls back to 'Monitoring' when only self-heal items exist (spec §3.2)", () => {
    renderMenu([item("s1", "SYNC_STALLED", { clearingKind: "self_heal" })]);
    expect(screen.getByTestId("published-show-review-attention-menu")).toHaveAttribute(
      "aria-label",
      "Monitoring",
    );
  });

  it("leading group: rounded-t-md header, no border-t; after a preceding group: border-t, no rounding (spec §3.2)", () => {
    renderMenu([item("s1", "SYNC_STALLED", { clearingKind: "self_heal" })]);
    const groupAlone = screen.getByTestId("attention-monitoring-group");
    expect(groupAlone.className ?? "").not.toContain("border-t");
    expect(groupAlone.querySelector('[class*="rounded-t-md"]')).not.toBeNull();
    cleanup();
    renderMenu([
      item("a1", "PARSE_ERROR", { actionable: true }),
      item("s1", "SYNC_STALLED", { clearingKind: "self_heal" }),
    ]);
    const groupAfter = screen.getByTestId("attention-monitoring-group");
    expect(groupAfter.className).toContain("border-t");
    expect(groupAfter.querySelector('[class*="rounded-t-md"]')).toBeNull();
  });

  it("an actionable item wrongly tagged self_heal is NOT counted as monitoring (§3.3 guard)", () => {
    renderMenu([item("rogue", "PARSE_ERROR", { actionable: true, clearingKind: "self_heal" })]);
    // renders as an actionable row; no monitoring row appears for it
    expect(screen.getByTestId("attention-menu-row-alert:rogue")).toBeInTheDocument();
    expect(screen.queryByTestId(/attention-monitoring-row-/)).toBeNull();
    expect(screen.queryByText(/clearing on their own/)).toBeNull();
  });
});

describe("scroll boundary (whole-diff review 2026-07-22)", () => {
  it("needs-look and monitoring groups live INSIDE the max-h scroll container", () => {
    // 12 needs-look rows are producible (every needs-look code at once); links
    // below the fold must stay reachable, so the scroll boundary wraps ALL
    // groups, not just the actionable rows.
    renderMenu([
      item("a1", "PARSE_ERROR", { actionable: true }),
      needsLook("nl1", "SHEET_UNAVAILABLE", {
        label: "Open in Sheet",
        href: SHEET,
        external: true,
      }),
      selfHeal("sh1", "Syncing stalled"),
    ]);
    const scroller = document.querySelector('[class*="max-h-96"]');
    expect(scroller).not.toBeNull();
    expect(scroller!.contains(screen.getByTestId("attention-menu-row-alert:a1"))).toBe(true);
    expect(scroller!.contains(screen.getByTestId("attention-needslook-row-alert:nl1"))).toBe(true);
    // re-anchored on a monitoring ROW (summary retired — monitoring-badge-expand §3.2)
    expect(scroller!.contains(screen.getByTestId("attention-monitoring-row-alert:sh1"))).toBe(true);
  });
});
