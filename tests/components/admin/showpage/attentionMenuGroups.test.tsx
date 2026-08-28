// @vitest-environment jsdom
/**
 * Attention-menu groups
 * (spec 2026-07-24-attention-index-consolidation §2.1/§2.2, superseding the
 * three-group split in 2026-07-21-attention-needs-attention-split §3.4).
 *
 * Failure modes caught: a third group surviving the merge; a needs-you row
 * regressing to a non-pressable shape or regaining an inner link; the
 * fail-visible boundary row losing its second line; hint/subtitle precedence
 * inverting; monitoring items summarized instead of enumerated, or gaining an
 * interactive descendant; a heading moving relative to the scroll container.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import { ATTENTION_FALLBACK_TITLE, type AttentionItem } from "@/lib/admin/attentionItems";
// Moved to a shared module so the published byte baselines render the SAME items.
import {
  item,
  needsLookItem as needsLook,
  selfHealItem as selfHeal,
} from "./_attentionItemFixture";
import { deriveWarningAttention } from "@/lib/admin/warningAttention";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";
import { autoResolveNote } from "@/lib/adminAlerts/audience";

afterEach(cleanup);

const SHEET = "https://docs.google.com/spreadsheets/d/FILE/edit#gid=0";

function renderMenu(items: AttentionItem[], onClose = vi.fn()) {
  const pillRef = createRef<HTMLButtonElement>();
  render(
    <AttentionMenu items={items} open onClose={onClose} onNavigate={vi.fn()} pillRef={pillRef} />,
  );
  return onClose;
}

describe("merged needs-you rows (attention-index §2.2)", () => {
  // Spec test 3. The row IS the affordance now: one pressable button, no inner
  // link. Scoped to the row's own testid, never the panel — a panel-wide link
  // query would pass with a link rendered anywhere else.
  it("a former needs-look row is a BUTTON that jumps, with NO <a> descendant", () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    const calls: string[] = [];
    const ITEM = needsLook("n1", "SHEET_UNAVAILABLE", {
      label: "Open in Sheet",
      href: SHEET,
      external: true,
    });
    const pillRef = createRef<HTMLButtonElement>();
    render(
      <AttentionMenu
        items={[ITEM]}
        open
        onClose={vi.fn(() => calls.push("close")) as unknown as () => void}
        onNavigate={vi.fn((i) => {
          calls.push("navigate");
          onNavigate(i);
        })}
        pillRef={pillRef}
      />,
    );
    void onClose;
    const row = screen.getByTestId(`attention-menu-row-${ITEM.id}`);
    expect(row.tagName).toBe("BUTTON");
    expect(row.querySelectorAll("a")).toHaveLength(0);
    fireEvent.click(row);
    expect(calls).toEqual(["close", "navigate"]);
    expect(onNavigate).toHaveBeenCalledWith(ITEM);
  });

  // Spec test 3b — the ONE case where the merged rule changes observable output.
  // Deliberate (§2.2): the fail-visible path exists so an unclassified item still
  // surfaces, and surfacing it with its identity text beats a bare title. The old
  // one-line render was an artefact of two renderers differing, not a decision.
  it("fail-visible boundary row gains its subtitle (was title-only)", () => {
    const BOUNDARY = item("b1", "ROLE_FLAGS_NOTICE", {
      actionable: false,
      menuTitle: "Sheet unavailable",
      menuSubtitle: "Crew · John Redcorn",
    });
    renderMenu([BOUNDARY]);
    const row = screen.getByTestId(`attention-menu-row-${BOUNDARY.id}`);
    expect(within(row).getByText(BOUNDARY.menuTitle)).toBeInTheDocument();
    expect(within(row).getByText(BOUNDARY.menuSubtitle!)).toBeInTheDocument();
  });

  // Spec test 11. §3 specifies this cell and no other test reaches it: test 3
  // checks structure, 3b covers the opposite no-hint fallback, and the existing
  // hint fixture has menuSubtitle: null. With the precedence reversed, every
  // other test still passes while the fix hint is hidden on exactly the shape
  // that carries both.
  it("hint takes precedence over subtitle when BOTH are present", () => {
    const BOTH = item("h1", "SHEET_UNAVAILABLE", {
      clearingKind: "needs_look",
      menuTitle: "Sheet unavailable",
      menuSubtitle: "Crew · John Redcorn",
    });
    renderMenu([BOTH]);
    const row = screen.getByTestId(`attention-menu-row-${BOTH.id}`);
    expect(
      within(row).getByText(/Re-share the sheet with the service account\./),
    ).toBeInTheDocument();
    expect(within(row).queryByText(BOTH.menuSubtitle!)).toBeNull();
  });

  it("row keeps its sr-only tone text beside the aria-hidden dot", () => {
    renderMenu([needsLook("n7", "SHEET_UNAVAILABLE", null)]);
    const row = screen.getByTestId("attention-menu-row-alert:n7");
    const srOnly = row.querySelector<HTMLElement>(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.textContent).toContain("needs review");
  });

  it("row shows the code's fix hint; no link, no nested button", () => {
    renderMenu([
      needsLook("n5", "SHEET_UNAVAILABLE", { label: "Open in Sheet", href: SHEET, external: true }),
    ]);
    const row = screen.getByTestId("attention-menu-row-alert:n5");
    expect(
      within(row).getByText(/Re-share the sheet with the service account\./),
    ).toBeInTheDocument();
    expect(within(row).queryAllByRole("link")).toHaveLength(0);
    expect(row.querySelectorAll("button")).toHaveLength(0);
  });

  it("boundary: a needs-look item whose action failed to resolve still renders its hint", () => {
    renderMenu([needsLook("n6", "SHEET_UNAVAILABLE", null)]);
    const row = screen.getByTestId("attention-menu-row-alert:n6");
    expect(within(row).getByText(/Re-share the sheet/)).toBeInTheDocument();
    expect(within(row).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("two groups (attention-index §2.1)", () => {
  // The eyebrow class is carried ONLY by group headings (3 sites at HEAD, 2
  // after the merge), so counting by it cannot be satisfied by a row title that
  // happens to match the heading text.
  const headingTexts = (menu: HTMLElement) =>
    [...menu.querySelectorAll('[class~="tracking-eyebrow"]')].map((el) => el.textContent);

  it("one of each class: exactly two headings, 'Needs you' then 'Monitoring'; retired copy gone menu-wide", () => {
    renderMenu([
      item("g1", "PARSE_ERROR", { actionable: true }),
      needsLook("g2", "SHEET_UNAVAILABLE", { label: "Open in Sheet", href: SHEET, external: true }),
      selfHeal("g3", "Syncing has stalled"),
    ]);
    const menu = screen.getByTestId("published-show-review-attention-menu");
    expect(headingTexts(menu)).toEqual(["Needs you", "Monitoring"]);
    expect(within(menu).queryByText("Needs your confirmation")).toBeNull();
    expect(within(menu).queryByText("Needs a look")).toBeNull();
  });

  // Spec test 2 (plan R4 F6). One of each cannot catch a merge that interleaves
  // or re-sorts; two of each can. Expected order is derived from the fixture
  // array, never a literal.
  it("merged-group ordering: actionable-first, derivation order, under ONE heading", () => {
    const FIXTURE = [
      item("o1", "PARSE_ERROR", { actionable: true }),
      item("o2", "LIVE_ROW_CONFLICT", { actionable: true }),
      needsLook("o3", "SHEET_UNAVAILABLE", null),
      needsLook("o4", "SHOW_UNPUBLISHED", null),
    ];
    renderMenu(FIXTURE);
    const menu = screen.getByTestId("published-show-review-attention-menu");
    expect(headingTexts(menu)).toEqual(["Needs you"]);
    // Spans BOTH row shapes: the two renderers are merged into one group here
    // but only unified onto a single testid in the row-shape task, so anchoring
    // on `attention-menu-row-` alone would silently see two of the four rows.
    const rows = [
      ...menu.querySelectorAll<HTMLElement>(
        '[data-testid^="attention-menu-row-"], [data-testid^="attention-needslook-row-"]',
      ),
    ];
    expect(
      rows.map((r) => r.getAttribute("data-testid")!.replace(/^[^-]+-[^-]+-row-/, "")),
    ).toEqual(FIXTURE.map((i) => i.id));
  });

  it("needs-you only: no Monitoring heading, aria-label 'Needs you'", () => {
    renderMenu([item("g1", "PARSE_ERROR", { actionable: true })]);
    const menu = screen.getByTestId("published-show-review-attention-menu");
    expect(within(menu).queryByText("Monitoring")).toBeNull();
    expect(menu).toHaveAttribute("aria-label", "Needs you");
  });

  it("needs-look only (no actionable) is still 'Needs you' — the merged group, not a third name", () => {
    renderMenu([
      needsLook("h1", "SHEET_UNAVAILABLE", { label: "Open in Sheet", href: SHEET, external: true }),
    ]);
    const menu = screen.getByTestId("published-show-review-attention-menu");
    expect(within(menu).getByText("Needs you")).toBeInTheDocument();
    expect(menu).toHaveAttribute("aria-label", "Needs you");
  });

  it("monitoring only: no 'Needs you' heading, aria-label 'Monitoring', group leads with rounded-t-md", () => {
    renderMenu([selfHeal("g1", "Syncing has stalled")]);
    const menu = screen.getByTestId("published-show-review-attention-menu");
    expect(within(menu).queryByText("Needs you")).toBeNull();
    expect(menu).toHaveAttribute("aria-label", "Monitoring");
    const group = screen.getByTestId("attention-monitoring-group");
    expect(group.className.split(/\s+/)).not.toContain("border-t");
    expect(group.querySelector('[class~="rounded-t-md"]')).not.toBeNull();
  });

  // Task 9's motion oracle targets the heading CONTAINERS (the elements whose
  // whole block unmounts on the O1<->O2 collapse), not the text spans — a text
  // locator would select the span and miss a transition on its parent.
  // Spec test 5b (plan Task 2). Placement is PRESERVED, not normalised: the
  // needs-you heading stays pinned above the scroll region while Monitoring
  // scrolls with its rows. Asserted as a DOM containment relationship via
  // element.contains, never by class name or position — a class assertion would
  // pass if the heading moved inside a differently-styled wrapper.
  it("heading placement: 'Needs you' is OUTSIDE the scroller, 'Monitoring' is INSIDE", () => {
    renderMenu([
      item("p1", "PARSE_ERROR", { actionable: true }),
      selfHeal("p2", "Syncing has stalled"),
    ]);
    const scroller = document.querySelector('[class*="max-h-96"]');
    expect(scroller).not.toBeNull();
    expect(scroller!.contains(screen.getByTestId("attention-needsyou-heading"))).toBe(false);
    expect(scroller!.contains(screen.getByTestId("attention-monitoring-heading"))).toBe(true);
  });

  it("heading testids are on the CONTAINERS, not the text spans", () => {
    renderMenu([
      item("g1", "PARSE_ERROR", { actionable: true }),
      selfHeal("g2", "Syncing has stalled"),
    ]);
    for (const [testId, text] of [
      ["attention-needsyou-heading", "Needs you"],
      ["attention-monitoring-heading", "Monitoring"],
    ] as const) {
      const container = screen.getByTestId(testId);
      const span = within(container).getByText(text);
      expect(container).not.toBe(span);
      expect(container.contains(span)).toBe(true);
    }
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
    // exact token (inline-block must NOT satisfy a block-level pin)
    expect(t1.className.split(/\s+/)).toContain("block");
    expect(n1.className.split(/\s+/)).toContain("block");
    const t2 = within(rows[1]!).getByText(FIXTURE_ITEMS[1]!.menuTitle);
    const n2 = within(rows[1]!).getByText(autoResolveNote("SYNC_STALLED"));
    // block-level pinned on the SECOND row too (R3 f5: a second-row inline
    // regression would pass a presence-only check)
    expect(t2.className.split(/\s+/)).toContain("block");
    expect(n2.className.split(/\s+/)).toContain("block");
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
    // count ALL decorative dots first — an extra wrongly-styled indicator
    // lacking the positive class would evade a positive-only count (review R1).
    // exact-token selectors ([class~=] = whitespace-separated whole token) so a
    // modifier/longer utility can't satisfy the base (review R2 finding 4)
    const allDots = [...row.querySelectorAll('span[aria-hidden="true"][class~="rounded-pill"]')];
    expect(allDots).toHaveLength(1);
    const dots = [...row.querySelectorAll('[class~="border-status-positive"]')];
    expect(dots).toHaveLength(1);
    expect(dots[0]!).toBe(allDots[0]!);
    const dotTokens = dots[0]!.className.split(/\s+/);
    expect(dotTokens).toContain("bg-transparent");
    // hollow = a real border WIDTH token, not merely a border-color utility
    expect(dotTokens).toContain("border-[1.5px]");
    expect(
      row.querySelector('[class*="bg-status-review"], [class*="bg-status-degraded"]'),
    ).toBeNull();
    const title = within(row).getByText(fixture.menuTitle);
    expect(title.className.split(/\s+/)).toContain("truncate");
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
    // derived from the fixture, not a mirrored literal (anti-tautology)
    expect(within(row).getByText(synthetic.menuTitle)).toBeInTheDocument();
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
    expect(groupAlone.className.split(/\s+/)).not.toContain("border-t");
    expect(groupAlone.querySelector('[class~="rounded-t-md"]')).not.toBeNull();
    cleanup();
    renderMenu([
      item("a1", "PARSE_ERROR", { actionable: true }),
      item("s1", "SYNC_STALLED", { clearingKind: "self_heal" }),
    ]);
    const groupAfter = screen.getByTestId("attention-monitoring-group");
    expect(groupAfter.className.split(/\s+/)).toContain("border-t");
    expect(groupAfter.querySelector('[class~="rounded-t-md"]')).toBeNull();
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
  it("needs-you rows and the monitoring group live INSIDE the max-h scroll container", () => {
    // 12 needs-look rows are producible (every needs-look code at once); rows
    // below the fold must stay reachable, so the scroll boundary wraps ALL
    // groups, not just the rows that were "actionable" under the old split.
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
    expect(scroller!.contains(screen.getByTestId("attention-menu-row-alert:nl1"))).toBe(true);
    // re-anchored on a monitoring ROW (summary retired — monitoring-badge-expand §3.2)
    expect(scroller!.contains(screen.getByTestId("attention-monitoring-row-alert:sh1"))).toBe(true);
  });
});

// ── Sheet-warnings group (wizard-review-attention-menu §4.3) ────────────────
// The menu becomes an index of the sheet's parse warnings as well as its
// alerts. The group is OPTIONAL: without the prop the panel's tree is
// byte-identical to today's, which the committed baseline pins
// (publishedAttentionBaseline.test.tsx) — so what these cases add is the
// group's PLACEMENT between the two existing groups, its row shape, and the
// tone mapping that tells a judgment call apart from something needing review.

describe("sheet warnings group (spec §4.3)", () => {
  const warn = (code: string): ParseWarning => ({
    severity: "warn",
    code,
    message: "",
    blockRef: { kind: "crew" },
  });

  /** Entries built through the production derivation, so `tone` is the real
   *  isAmbiguityCode partition rather than a value this test picked. */
  function entriesFor(codes: string[]) {
    const sections = [
      { id: "crew" as SectionId, label: "Crew" },
      { id: "warnings" as SectionId, label: "Warnings" },
    ];
    const derived = deriveWarningAttention(
      codes.map((code, i) => ({
        id: `warning:sid${i}`,
        sectionId: "crew" as SectionId,
        warning: warn(code),
        reportSurfaceId: `sid${i}`,
      })),
      sections,
    );
    return derived.all;
  }

  function renderWithIndex(codes: string[], items: AttentionItem[], onNavigate = vi.fn()) {
    const entries = entriesFor(codes);
    const pillRef = createRef<HTMLButtonElement>();
    const onClose = vi.fn();
    render(
      <AttentionMenu
        items={items}
        open
        onClose={onClose}
        onNavigate={vi.fn()}
        pillRef={pillRef}
        warningIndex={{ entries, onNavigate }}
      />,
    );
    return { entries, onClose, onNavigate };
  }

  it("sits between the needs-you rows and the monitoring group", () => {
    const { entries } = renderWithIndex(
      ["UNKNOWN_FIELD"],
      [item("a1", "PARSE_ERROR", { actionable: true }), selfHeal("s1", "Syncing stalled")],
    );
    const panel = screen.getByTestId("published-show-review-attention-menu");
    const order = [...panel.querySelectorAll<HTMLElement>("[data-testid]")]
      .map((el) => el.getAttribute("data-testid")!)
      .filter(
        (t) =>
          t === "attention-menu-row-alert:a1" ||
          t === "attention-sheetwarnings-heading" ||
          t === `attention-menu-row-${entries[0]!.id}-0` ||
          t === "attention-monitoring-group",
      );
    expect(order).toEqual([
      "attention-menu-row-alert:a1",
      "attention-sheetwarnings-heading",
      `attention-menu-row-${entries[0]!.id}-0`,
      "attention-monitoring-group",
    ]);
  });

  it("rows are BUTTONs with no <a> descendant, titled by reviewWarningTitle, second line = section label", () => {
    const { entries } = renderWithIndex(["UNKNOWN_FIELD"], []);
    const row = screen.getByTestId(`attention-menu-row-${entries[0]!.id}-0`);
    expect(row.tagName).toBe("BUTTON");
    expect(row.querySelectorAll("a").length).toBe(0);
    expect(row.textContent).toContain(reviewWarningTitle(entries[0]!.warning));
    expect(row.textContent).toContain(entries[0]!.sectionLabel);
  });

  it("click order is close BEFORE navigate, with the entry", () => {
    const calls: string[] = [];
    const onNavigate = vi.fn(() => calls.push("navigate"));
    const entries = entriesFor(["UNKNOWN_FIELD"]);
    const pillRef = createRef<HTMLButtonElement>();
    render(
      <AttentionMenu
        items={[]}
        open
        onClose={vi.fn(() => calls.push("close"))}
        onNavigate={vi.fn()}
        pillRef={pillRef}
        warningIndex={{ entries, onNavigate }}
      />,
    );
    fireEvent.click(screen.getByTestId(`attention-menu-row-${entries[0]!.id}-0`));
    expect(calls).toEqual(["close", "navigate"]);
    expect(onNavigate).toHaveBeenCalledWith(entries[0]);
  });

  it("tone dot follows the derivation: judgment is faint, a gap code is review", () => {
    const { entries } = renderWithIndex(["UNKNOWN_FIELD", "ROOM_HEADER_SPLIT_AMBIGUOUS"], []);
    const byTone = (tone: string) => entries.findIndex((e) => e.tone === tone);
    const needsIdx = byTone("needsLook");
    const judgIdx = byTone("judgment");
    // premise: the fixture actually produced one of each, so a dot assertion
    // below cannot pass by both rows sharing a tone.
    expect(needsIdx).toBeGreaterThanOrEqual(0);
    expect(judgIdx).toBeGreaterThanOrEqual(0);
    const rowFor = (i: number) => screen.getByTestId(`attention-menu-row-${entries[i]!.id}-${i}`);
    expect(rowFor(needsIdx).querySelector(".bg-status-review")).toBeTruthy();
    expect(rowFor(judgIdx).querySelector(".bg-text-faint")).toBeTruthy();
  });

  it("two identical warnings share an id but get distinct row testids", () => {
    // Content-derived ids collide by design (spec §10); the index suffix is what
    // keeps the two rows addressable.
    const entries = entriesFor(["UNKNOWN_FIELD", "UNKNOWN_FIELD"]).map((e) => ({
      ...e,
      id: "warning:same",
    }));
    const pillRef = createRef<HTMLButtonElement>();
    render(
      <AttentionMenu
        items={[]}
        open
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        pillRef={pillRef}
        warningIndex={{ entries, onNavigate: vi.fn() }}
      />,
    );
    expect(screen.getByTestId("attention-menu-row-warning:same-0")).toBeInTheDocument();
    expect(screen.getByTestId("attention-menu-row-warning:same-1")).toBeInTheDocument();
  });

  it("names the panel 'Sheet warnings' when it is the leading group", () => {
    renderWithIndex(["UNKNOWN_FIELD"], []);
    expect(
      screen.getByTestId("published-show-review-attention-menu").getAttribute("aria-label"),
    ).toBe("Sheet warnings");
  });

  it("keeps 'Needs you' as the panel name when a needs-you row leads", () => {
    renderWithIndex(["UNKNOWN_FIELD"], [item("a1", "PARSE_ERROR", { actionable: true })]);
    expect(
      screen.getByTestId("published-show-review-attention-menu").getAttribute("aria-label"),
    ).toBe("Needs you");
  });

  it("gives the monitoring group its top border when only the warnings group precedes it", () => {
    renderWithIndex(["UNKNOWN_FIELD"], [selfHeal("s1", "Syncing stalled")]);
    expect(screen.getByTestId("attention-monitoring-group").className).toContain("border-t");
  });
});
