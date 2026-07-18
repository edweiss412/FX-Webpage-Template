// @vitest-environment jsdom
// tests/components/healthAlertsPanel.test.tsx (alert-audience-split Task 8, spec §6.6)
//
// The developer detail panel on /admin/dev/telemetry#health. Task 8 proves rows
// are REACHABLE (per-partition SSR pagination + action links + copy). The Resolve
// control (RESOLVABILITY) is wired in Task 9.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { HealthAlertRow, LoadHealthAlertsResult } from "@/lib/admin/healthAlerts";

const impl = vi.hoisted(() => ({
  fn: (async () => ({ kind: "ok", rows: [], hasMore: false })) as (args: {
    weight: "degraded" | "notice";
    page: number;
  }) => Promise<LoadHealthAlertsResult>,
}));

vi.mock("@/lib/admin/healthAlerts", async (orig) => {
  const actual = await orig<typeof import("@/lib/admin/healthAlerts")>();
  return {
    ...actual,
    loadHealthAlerts: (args: { weight: "degraded" | "notice"; page: number }) => impl.fn(args),
  };
});

function row(overrides: Partial<HealthAlertRow> & { id: string; code: string }): HealthAlertRow {
  return {
    show_id: null,
    slug: null,
    context: null,
    occurrence_count: 1,
    raised_at: "2026-01-01T00:00:00.000Z",
    identityText: null,
    ...overrides,
  };
}

async function renderPanel(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { HealthAlertsPanel } = await import("@/components/admin/telemetry/HealthAlertsPanel");
  render(await HealthAlertsPanel({ searchParams }));
}

beforeEach(() => {
  impl.fn = async () => ({ kind: "ok", rows: [], hasMore: false });
});
afterEach(cleanup);

describe("HealthAlertsPanel (Task 8 reachability)", () => {
  test("wrapper carries id='health' + data-testid='health-alerts-panel'", async () => {
    await renderPanel();
    const panel = screen.getByTestId("health-alerts-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute("id", "health");
  });

  test("empty → 'No open system-health alerts.'", async () => {
    await renderPanel();
    expect(screen.getByTestId("health-alerts-panel")).toHaveTextContent(
      "No open system-health alerts.",
    );
  });

  test("row renders lookup copy (no raw code), weight chip, show link, raised_at, occurrence_count", async () => {
    impl.fn = async ({ weight }) =>
      weight === "degraded"
        ? {
            kind: "ok",
            rows: [
              row({
                id: "a1",
                code: "WEBHOOK_TOKEN_INVALID",
                show_id: "s1",
                slug: "rpas",
                occurrence_count: 4,
              }),
            ],
            hasMore: false,
          }
        : { kind: "ok", rows: [], hasMore: false };
    await renderPanel();
    const panel = screen.getByTestId("health-alerts-panel");
    // catalog copy present, raw code NOT in the DOM (invariant 5)
    expect(panel).toHaveTextContent("Drive webhook failed verification");
    expect(panel.textContent ?? "").not.toContain("WEBHOOK_TOKEN_INVALID");
    // weight chip
    expect(within(panel).getByTestId("health-alert-weight-a1")).toHaveTextContent(/degraded/i);
    // show link to /admin?show=rpas (modal URL)
    const showLink = within(panel).getByTestId("health-alert-show-link-a1");
    expect(showLink).toHaveAttribute("href", expect.stringContaining("/admin?show=rpas"));
    // occurrence_count surfaced
    expect(panel).toHaveTextContent("4");
    // raised_at rendered inside a <time>
    expect(within(panel).getByTestId("health-alert-row-a1").querySelector("time")).toBeTruthy();
  });

  test("unknown code degrades without leaking the raw code string (invariant 5)", async () => {
    impl.fn = async ({ weight }) =>
      weight === "notice"
        ? { kind: "ok", rows: [row({ id: "u1", code: "TOTALLY_UNKNOWN_CODE" })], hasMore: false }
        : { kind: "ok", rows: [], hasMore: false };
    await renderPanel();
    const panel = screen.getByTestId("health-alerts-panel");
    expect(within(panel).getByTestId("health-alert-row-u1")).toBeInTheDocument();
    expect(panel.textContent ?? "").not.toContain("TOTALLY_UNKNOWN_CODE");
  });

  test("renders resolveAlertAction link for each of the 6 action-link health codes", async () => {
    const actionRows: HealthAlertRow[] = [
      row({ id: "p1", code: "PICKER_SELECTION_RACE", show_id: "s", slug: "rpas" }),
      row({ id: "r1", code: "ROLE_FLAGS_NOTICE", context: { drive_file_id: "sheet-123" } }),
      row({ id: "w1", code: "WIZARD_SESSION_SUPERSEDED_RACE" }),
      row({
        id: "o1",
        code: "REPORT_ORPHANED_LOST_LEASE",
        context: { orphan_url: "https://github.com/o/r/issues/1" },
      }),
      row({ id: "b1", code: "BRANCH_PROTECTION_DRIFT", context: { repo: "owner/name" } }),
      row({
        id: "b2",
        code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
        context: { repo: "owner/name" },
      }),
    ];
    impl.fn = async ({ weight }) =>
      weight === "degraded"
        ? { kind: "ok", rows: actionRows, hasMore: false }
        : { kind: "ok", rows: [], hasMore: false };
    await renderPanel();
    const panel = screen.getByTestId("health-alerts-panel");
    for (const id of ["p1", "r1", "w1", "o1", "b1", "b2"]) {
      expect(
        within(panel).getByTestId(`health-alert-action-${id}`),
        `action link for row ${id}`,
      ).toBeInTheDocument();
    }
  });

  test("(c) OAUTH_IDENTITY_CLAIMED row renders the at-a-glance identity line (crew · email · show)", async () => {
    // includePii:true surface (developer-only page), so raw email shows. The
    // identity text is produced by loadHealthAlerts (mocked here); the panel's
    // job is to RENDER it in a scoped node. Anti-tautology: after asserting the
    // scoped identity node carries the crew name, clone the row and REMOVE that
    // node, proving the crew name appears nowhere else on the row.
    const identityText = "Crew: Jordan Lee · jordan@example.com · Show: East Coast Spectacular";
    impl.fn = async ({ weight }) =>
      weight === "notice"
        ? {
            kind: "ok",
            rows: [
              row({
                id: "oauth1",
                code: "OAUTH_IDENTITY_CLAIMED",
                show_id: "s1",
                slug: "east-coast",
                identityText,
              }),
            ],
            hasMore: false,
          }
        : { kind: "ok", rows: [], hasMore: false };
    await renderPanel();
    const panel = screen.getByTestId("health-alerts-panel");
    const identity = within(panel).getByTestId("health-alert-identity-oauth1");
    expect(identity.textContent).toContain("Jordan Lee");
    expect(identity.textContent).toContain("jordan@example.com");
    expect(identity.textContent).toContain("East Coast Spectacular");
    // Anti-tautology: the crew name is rendered ONLY in the identity node.
    const rowNode = within(panel).getByTestId("health-alert-row-oauth1");
    const clone = rowNode.cloneNode(true) as HTMLElement;
    clone.querySelector("[data-testid=health-alert-identity-oauth1]")?.remove();
    expect(clone.textContent ?? "").not.toContain("Jordan Lee");
  });

  test("(d) global-identity health code (GITHUB_BOT_LOGIN_MISSING) → NO identity line, row still renders", async () => {
    impl.fn = async ({ weight }) =>
      weight === "degraded"
        ? {
            kind: "ok",
            rows: [row({ id: "gh1", code: "GITHUB_BOT_LOGIN_MISSING", identityText: null })],
            hasMore: false,
          }
        : { kind: "ok", rows: [], hasMore: false };
    await renderPanel();
    const panel = screen.getByTestId("health-alerts-panel");
    expect(within(panel).getByTestId("health-alert-row-gh1")).toBeInTheDocument();
    expect(within(panel).queryByTestId("health-alert-identity-gh1")).toBeNull();
  });

  test("degraded section renders BEFORE the notice section", async () => {
    impl.fn = async ({ weight }) => ({
      kind: "ok",
      rows: [
        weight === "degraded"
          ? row({ id: "deg", code: "WEBHOOK_TOKEN_INVALID" })
          : row({ id: "not", code: "PICKER_SELECTION_RACE" }),
      ],
      hasMore: false,
    });
    await renderPanel();
    const panel = screen.getByTestId("health-alerts-panel");
    const html = panel.innerHTML;
    expect(html.indexOf("health-alert-row-deg")).toBeLessThan(html.indexOf("health-alert-row-not"));
  });

  test("infra_error in a partition → cataloged degraded panel, never silent empty / raw code", async () => {
    impl.fn = async ({ weight }) =>
      weight === "degraded" ? { kind: "infra_error" } : { kind: "ok", rows: [], hasMore: false };
    await renderPanel();
    expect(screen.getByTestId("health-alerts-panel-degraded")).toBeInTheDocument();
  });

  describe("SSR pagination reachability (plan-R3)", () => {
    const SIZE = 50;
    test("PAGE_SIZE+1 degraded rows → 'Load more' link to ?dpage=1", async () => {
      impl.fn = async ({ weight, page }) => {
        if (weight === "degraded" && page === 0) {
          return {
            kind: "ok",
            rows: Array.from({ length: SIZE }, (_, i) =>
              row({ id: `d${i}`, code: "WEBHOOK_TOKEN_INVALID" }),
            ),
            hasMore: true,
          };
        }
        return { kind: "ok", rows: [], hasMore: false };
      };
      await renderPanel();
      const more = screen.getByTestId("health-load-more-degraded");
      expect(more).toHaveAttribute("href", expect.stringContaining("dpage=1"));
      expect(more.getAttribute("href")).toContain("#health");
    });

    test("?dpage=1 shows the 51st degraded row (reachable)", async () => {
      impl.fn = async ({ weight, page }) =>
        weight === "degraded" && page === 1
          ? {
              kind: "ok",
              rows: [row({ id: "row51", code: "WEBHOOK_TOKEN_INVALID" })],
              hasMore: false,
            }
          : { kind: "ok", rows: [], hasMore: false };
      await renderPanel({ dpage: "1" });
      expect(screen.getByTestId("health-alert-row-row51")).toBeInTheDocument();
    });

    test("?npage=1 shows the 51st notice row (reachable)", async () => {
      impl.fn = async ({ weight, page }) =>
        weight === "notice" && page === 1
          ? {
              kind: "ok",
              rows: [row({ id: "n51", code: "PICKER_SELECTION_RACE" })],
              hasMore: false,
            }
          : { kind: "ok", rows: [], hasMore: false };
      await renderPanel({ npage: "1" });
      expect(screen.getByTestId("health-alert-row-n51")).toBeInTheDocument();
    });

    test("non-numeric dpage clamps to page 0", async () => {
      const seen: number[] = [];
      impl.fn = async ({ weight, page }) => {
        if (weight === "degraded") seen.push(page);
        return { kind: "ok", rows: [], hasMore: false };
      };
      await renderPanel({ dpage: "not-a-number" });
      expect(seen).toContain(0);
    });
  });

  describe("Task 9: identity-less derived params (no placeholder leak, spec 2026-07-17 §4.2)", () => {
    // 12-code sweep list (spec §6). Mirrors
    // tests/messages/inlineIdentityCopy.test.ts SWEEP_EXPECTATIONS keys —
    // copied inline rather than cross-imported from a test file.
    const SWEEP_CODES = [
      "REPORT_ORPHANED_LOST_LEASE",
      "REPORT_LOOKUP_INCONCLUSIVE",
      "REPORT_DUPLICATE_LIVE_MATCHES",
      "REPORT_OPEN_ORPHAN_LABEL",
      "REPORT_LEASE_THRASHING",
      "STALE_ORPHAN_REPORT",
      "PENDING_SNAPSHOT_PROMOTE_STUCK",
      "PENDING_SNAPSHOT_ROLLBACK_STUCK",
      "EMAIL_DELIVERY_FAILED",
      "WIZARD_SESSION_SUPERSEDED_RACE",
      "BRANCH_PROTECTION_DRIFT",
      "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    ];

    async function renderPanelWithRow(code: string) {
      impl.fn = async ({ weight }) =>
        weight === "degraded"
          ? { kind: "ok", rows: [row({ id: "il1", code, context: null })], hasMore: false }
          : { kind: "ok", rows: [], hasMore: false };
      await renderPanel();
      return within(screen.getByTestId("health-alerts-panel")).getByTestId("health-alert-row-il1");
    }

    test.each(SWEEP_CODES)(
      "%s renders with EMPTY context and no literal <placeholder> leaks (spec 2026-07-17 §4.2)",
      async (code) => {
        const rowNode = await renderPanelWithRow(code);
        expect(rowNode.textContent).not.toMatch(/<[a-zA-Z_][a-zA-Z0-9_-]*>/);
        expect(rowNode.textContent).toMatch(
          /this show|this sheet|this repository|a setup action|GitHub|wizard/,
        );
      },
    );
  });
});
