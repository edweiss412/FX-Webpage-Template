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
import type { AttentionItem } from "@/lib/admin/attentionItems";

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

describe("monitoring group", () => {
  it("is one summary row under a 'Monitoring' subheading (spec §3.4.3); individual titles NOT rendered", () => {
    renderMenu([selfHeal("s1", "Syncing stalled"), selfHeal("s2", "Drive fetch failed")]);
    expect(screen.getByText("Monitoring")).toBeInTheDocument();
    expect(screen.getByText(/2 clearing on their own, no action needed/)).toBeInTheDocument();
    expect(screen.queryByText("Syncing stalled")).toBeNull();
    expect(screen.queryByText("Drive fetch failed")).toBeNull();
  });

  it("the retired em-dash footer is gone", () => {
    renderMenu([selfHeal("s3", "Syncing stalled")]);
    expect(screen.queryByText(/more clearing on their own/)).toBeNull();
  });

  it("an actionable item wrongly tagged self_heal is NOT counted as monitoring (§3.3 guard)", () => {
    renderMenu([item("rogue", "PARSE_ERROR", { actionable: true, clearingKind: "self_heal" })]);
    // renders as an actionable row; no monitoring summary appears for it
    expect(screen.getByTestId("attention-menu-row-alert:rogue")).toBeInTheDocument();
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
    expect(scroller!.contains(screen.getByText(/1 clearing on their own/))).toBe(true);
  });
});
