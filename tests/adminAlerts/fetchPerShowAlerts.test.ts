/**
 * tests/adminAlerts/fetchPerShowAlerts.test.ts
 *
 * The relocated per-show alert read (spec 2026-07-19-published-show-alerts
 * §3.1a): AdminAlertRow.crewName — the single resolvable crew display name.
 * Mock scaffolding mirrors tests/components/PerShowAlertSection.test.tsx: the
 * SAME chained supabase builder serves the admin_alerts read (awaited off the
 * builder) and the REAL identity resolver's crew_members/shows `.in().limit()`
 * reads. Expected names derive from the fixtures, never resolver internals.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchPerShowAlerts, type AdminAlertRow } from "@/lib/adminAlerts/fetchPerShowAlerts";
import { setLogSink, resetLogSink } from "@/lib/log";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";

const mockState = vi.hoisted(() => ({
  alertRows: [] as Array<{
    id: string;
    code: string;
    raised_at: string;
    context: Record<string, unknown> | null;
    occurrence_count: number;
  }>,
  crewRows: [] as Array<{ id: string; show_id: string | null; name: string | null }>,
  showRows: [] as Array<{
    id?: string;
    drive_file_id?: string;
    title: string | null;
    slug: string | null;
  }>,
  failAlertRead: false,
  failIdentityRead: false,
}));

vi.mock("@/lib/supabase/server", () => {
  return {
    createSupabaseServerClient: async () => {
      function createBuilder(table: string) {
        const inFilter: { column: string | null; values: string[] | null } = {
          column: null,
          values: null,
        };
        const builder = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          not: () => builder,
          order: () => builder,
          in: (column: string, values: string[]) => {
            inFilter.column = column;
            inFilter.values = values;
            return builder;
          },
          limit: (n: number) => {
            if (table === "crew_members" || table === "shows") {
              if (mockState.failIdentityRead) {
                return Promise.resolve({
                  data: null,
                  error: { message: "simulated identity read failure" },
                });
              }
              const source =
                table === "crew_members"
                  ? (mockState.crewRows as Array<Record<string, unknown>>)
                  : (mockState.showRows as Array<Record<string, unknown>>);
              const rows =
                inFilter.column && inFilter.values
                  ? source.filter((r) => inFilter.values!.includes(r[inFilter.column!] as string))
                  : source;
              return Promise.resolve({ data: rows.slice(0, n), error: null });
            }
            return Promise.resolve({ data: mockState.alertRows.slice(0, n), error: null });
          },
          then: (onFulfilled: (value: { data: unknown; error: unknown }) => void) => {
            const payload = mockState.failAlertRead
              ? { data: null, error: { message: "simulated admin_alerts read failure" } }
              : { data: mockState.alertRows, error: null };
            return Promise.resolve(payload).then(onFulfilled);
          },
        };
        return builder;
      }
      return { from: (table: string) => createBuilder(table) };
    },
  };
});

type AlertFixture = {
  id: string;
  code: string;
  raised_at?: string;
  context?: Record<string, unknown> | null;
};

function setAlerts(rows: AlertFixture[]) {
  mockState.alertRows = rows.map((r) => ({
    id: r.id,
    code: r.code,
    raised_at: r.raised_at ?? "2026-07-19T10:00:00Z",
    context: r.context ?? null,
    occurrence_count: 1,
  }));
}

async function fetchRows(): Promise<AdminAlertRow[]> {
  const result = await fetchPerShowAlerts(SHOW_ID);
  expect(Array.isArray(result)).toBe(true);
  return result as AdminAlertRow[];
}

beforeEach(() => {
  mockState.alertRows = [];
  mockState.crewRows = [];
  mockState.showRows = [];
  mockState.failAlertRead = false;
  mockState.failIdentityRead = false;
  setLogSink(() => {});
});

afterEach(() => {
  resetLogSink();
  vi.clearAllMocks();
});

describe("fetchPerShowAlerts crewName (§3.1a)", () => {
  test("single Crew-labeled segment → its value (generic segment path; OAUTH_IDENTITY_CLAIMED shape)", async () => {
    // NOTE: OAUTH_IDENTITY_CLAIMED is audience:"health" and the REAL query
    // excludes it (.not code in HEALTH_CODES) — this mock doesn't apply the
    // exclusion, which is exactly what lets us exercise the generic
    // one-Crew-segment fallback path with a live identity-map code.
    const CREW_ID = "22222222-2222-4222-8222-222222222222";
    mockState.crewRows = [{ id: CREW_ID, show_id: SHOW_ID, name: "John Redcorn" }];
    mockState.showRows = [{ id: SHOW_ID, title: "Spring Conference", slug: "spring-conference" }];
    setAlerts([
      { id: "a1", code: "OAUTH_IDENTITY_CLAIMED", context: { crew_member_id: CREW_ID } },
    ]);
    const rows = await fetchRows();
    expect(rows[0]!.crewName).toBe("John Redcorn");
  });

  test("ROLE_FLAGS_NOTICE: sole projected name → that name; multi-name → null", async () => {
    setAlerts([
      {
        id: "one",
        code: "ROLE_FLAGS_NOTICE",
        context: { changes: [{ crew_name: "Ana Silva" }] },
      },
      {
        id: "two",
        code: "ROLE_FLAGS_NOTICE",
        context: { changes: [{ crew_name: "A" }, { crew_name: "B" }] },
      },
    ]);
    const rows = await fetchRows();
    expect(rows.find((r) => r.id === "one")!.crewName).toBe("Ana Silva");
    expect(rows.find((r) => r.id === "two")!.crewName).toBeNull();
  });

  test("no crew identity → null; degraded resolve → null but rows still returned", async () => {
    mockState.failIdentityRead = true;
    setAlerts([
      { id: "a2", code: "AMBIGUOUS_EMAIL_BINDING", context: { email: "x@y.z" } },
      { id: "a3", code: "OAUTH_IDENTITY_CLAIMED", context: { crew_member_id: "c9" } },
    ]);
    const rows = await fetchRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.crewName === null)).toBe(true);
  });

  test("infra shape preserved: failed alert read → { kind: 'infra_error' }", async () => {
    mockState.failAlertRead = true;
    const result = await fetchPerShowAlerts(SHOW_ID);
    expect(Array.isArray(result)).toBe(false);
    expect((result as { kind: string }).kind).toBe("infra_error");
  });
});
