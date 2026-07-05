// Redaction contract for lib/observe/query/alerts.ts (spec §8.3).
//
// Two layers:
//   1. Source-scan: `alerts.ts` must never spread raw `context` into the
//      returned row, and `AlertRow` (types.ts) must never declare a
//      `context`/`resolution` key. This is the structural guard that makes
//      it impossible to satisfy (2) by accident while quietly leaking the
//      raw jsonb.
//   2. Behavioral: for each reachable display string-field
//      (file_name, sheet_name, repo, email, user_email), a planted
//      token-like substring is redacted by default; email-class fields
//      (email, user_email) are additionally gated by includePii, while
//      non-email display fields are never email-redacted (a real email
//      planted inside them still gets caught by the shared sanitizer's
//      EMAIL step since it's PII-shaped, but the field itself carries no
//      email-specific gating beyond the shared sanitizer's includePii
//      switch — verified via the same token/email assertions as (c) below).
//   `attempted_action` is enum-gated (WIZARD_ACTION_ENUM in
//   projectIdentityContext.ts) — an arbitrary planted token/email is
//   dropped entirely at projection time (never reaches the sanitizer with
//   attacker-controlled content), so it is covered by an "absent when not
//   enum" assertion instead of a redaction assertion.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const ALERTS_FILE = join(process.cwd(), "lib/observe/query/alerts.ts");
const TYPES_FILE = join(process.cwd(), "lib/observe/query/types.ts");

describe("_metaAlertsRedactionContract: source scan", () => {
  test("alerts.ts never spreads raw context into the returned row", () => {
    const src = readFileSync(ALERTS_FILE, "utf8");
    expect(src).not.toMatch(/\.\.\.\s*(r\.)?context\b/);
    // The mapped row must not assign a `context:` or `resolution:` key.
    expect(src).not.toMatch(/\bcontext:\s*r\.context\b/);
    // Property-key shape only (`resolution: r.…` / `resolution: {…`) so this
    // doesn't false-positive on prose like "identity resolution: the raw…".
    expect(src).not.toMatch(/\bresolution:\s*(r\.|\{)/);
  });

  test("AlertRow (types.ts) declares no context/resolution key", () => {
    const src = readFileSync(TYPES_FILE, "utf8");
    const match = src.match(/export type AlertRow = \{([\s\S]*?)\n\};/);
    expect(match, "AlertRow type block not found").toBeTruthy();
    const body = match![1];
    expect(body).not.toMatch(/\bcontext\??:/);
    expect(body).not.toMatch(/\bresolution\??:/);
  });
});

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    function makeChain(table: string) {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.is = () => b;
      b.eq = () => b;
      b.order = () => b;
      b.in = () => b;
      b.limit = () => {
        if (table === "admin_alerts") return Promise.resolve({ data: state.rows, error: null });
        return Promise.resolve({ data: [], error: null });
      };
      return b;
    }
    return { from: (table: string) => makeChain(table) } as never;
  },
}));

afterEach(() => {
  state.rows = [];
  vi.resetModules();
});

function baseRow(overrides: Record<string, unknown>) {
  return {
    id: "a",
    show_id: null,
    code: "WATCH_CHANNEL_ORPHANED",
    raised_at: "t",
    last_seen_at: "t",
    occurrence_count: 1,
    resolved_at: null,
    resolved_by: null,
    shows: null,
    context: null,
    ...overrides,
  };
}

const TOKEN = "b".repeat(40);
const EMAIL = "meta@example.com";
// Space-separated (see queryAlerts.test.ts comment): a contiguous run would
// let the greedy `\S+@\S+` EMAIL pass swallow the adjacent [redacted-token]
// marker, per sanitizeIdentityString's documented step order.
const TOKEN_AND_EMAIL = `${TOKEN} ${EMAIL}`;

describe("_metaAlertsRedactionContract: behavioral field sweep", () => {
  test("file_name (LIVE_ROW_CONFLICT): token+email redacted by default; email survives with includePii", async () => {
    state.rows = [
      baseRow({
        code: "LIVE_ROW_CONFLICT",
        context: { file_name: TOKEN_AND_EMAIL },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const noPii = await queryAlerts({});
    if (noPii.kind !== "ok") throw new Error("infra");
    const seg = noPii.alerts[0]!.identity.segments.find((s) => s.label === "Sheet");
    expect(seg?.value).toContain("[redacted-token]");
    expect(seg?.value).toContain("[redacted-email]");

    const withPii = await queryAlerts({ includePii: true });
    if (withPii.kind !== "ok") throw new Error("infra");
    const segPii = withPii.alerts[0]!.identity.segments.find((s) => s.label === "Sheet");
    expect(segPii?.value).toContain("[redacted-token]");
    expect(segPii?.value).toContain(EMAIL);
  });

  test("sheet_name (DRIVE_FETCH_FAILED): token redacted by default", async () => {
    state.rows = [
      baseRow({
        code: "DRIVE_FETCH_FAILED",
        context: { sheet_name: TOKEN_AND_EMAIL },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const noPii = await queryAlerts({});
    if (noPii.kind !== "ok") throw new Error("infra");
    const seg = noPii.alerts[0]!.identity.segments.find((s) => s.label === "Sheet");
    expect(seg?.value).toContain("[redacted-token]");
    expect(seg?.value).toContain("[redacted-email]");
  });

  test("repo (BRANCH_PROTECTION_DRIFT): token redacted by default, not email-gated", async () => {
    state.rows = [
      baseRow({
        code: "BRANCH_PROTECTION_DRIFT",
        context: { repo: TOKEN_AND_EMAIL },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const noPii = await queryAlerts({});
    if (noPii.kind !== "ok") throw new Error("infra");
    const seg = noPii.alerts[0]!.identity.segments.find((s) => s.label === "Repo");
    expect(seg?.value).toContain("[redacted-token]");
    expect(seg?.value).toContain("[redacted-email]");
  });

  test("email (AMBIGUOUS_EMAIL_BINDING): absent by default, present+unredacted with includePii", async () => {
    state.rows = [
      baseRow({
        code: "AMBIGUOUS_EMAIL_BINDING",
        context: { email: EMAIL },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const noPii = await queryAlerts({});
    if (noPii.kind !== "ok") throw new Error("infra");
    expect(noPii.alerts[0]!.identity.segments.some((s) => s.value === EMAIL)).toBe(false);

    const withPii = await queryAlerts({ includePii: true });
    if (withPii.kind !== "ok") throw new Error("infra");
    expect(withPii.alerts[0]!.identity.segments.some((s) => s.value === EMAIL)).toBe(true);
  });

  test("user_email (OAUTH_IDENTITY_CLAIMED): absent by default, present+unredacted with includePii", async () => {
    state.rows = [
      baseRow({
        code: "OAUTH_IDENTITY_CLAIMED",
        context: { user_email: EMAIL },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const noPii = await queryAlerts({});
    if (noPii.kind !== "ok") throw new Error("infra");
    expect(noPii.alerts[0]!.identity.segments.some((s) => s.value === EMAIL)).toBe(false);

    const withPii = await queryAlerts({ includePii: true });
    if (withPii.kind !== "ok") throw new Error("infra");
    expect(withPii.alerts[0]!.identity.segments.some((s) => s.value === EMAIL)).toBe(true);
  });

  test("attempted_action (WIZARD_SESSION_SUPERSEDED_RACE): non-enum planted value dropped entirely, never surfaces", async () => {
    const nonEnumValue = `${TOKEN}-${EMAIL}`;
    state.rows = [
      baseRow({
        code: "WIZARD_SESSION_SUPERSEDED_RACE",
        context: { file_name: "show.xlsx", attempted_action: nonEnumValue },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const r = await queryAlerts({});
    if (r.kind !== "ok") throw new Error("infra");
    const json = JSON.stringify(r.alerts[0]!);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain(EMAIL);
    expect(r.alerts[0]!.identity.segments.some((s) => s.label === "Action")).toBe(false);
  });
});
