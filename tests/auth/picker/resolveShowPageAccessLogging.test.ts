/**
 * tests/auth/picker/resolveShowPageAccessLogging.test.ts
 *
 * Fail-closed observability for the show-page picker resolver
 * (BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE measurement work). The
 * resolver's INFRA_ERROR returns are typed results (invariant 9) but were
 * SILENT: CI measured a 30% fail-closed rate on the crew URL right after a
 * publish round-trip with zero server-side signal naming the failing
 * boundary. Every infra_error return must now emit a warn record carrying
 * code PICKER_RESOLVER_LOOKUP_FAILED and a `site` discriminator so the next
 * CI loop names the failing upstream call.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    rpc: state.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: state.maybeSingle }),
      }),
    }),
  }),
}));

async function captureRecords(): Promise<LogRecord[]> {
  const { setLogSink } = await import("@/lib/log");
  const records: LogRecord[] = [];
  setLogSink((record) => {
    records.push(record);
  });
  return records;
}

function crewRequest(): Request {
  return new Request("https://crew.fxav.test/show/some-slug/aa11");
}

describe("resolveShowPageAccess fail-closed logging", () => {
  beforeEach(() => {
    vi.resetModules();
    state.rpc.mockReset();
    state.maybeSingle.mockReset();
  });

  test("resolve RPC returned-error path warns with code + site before failing closed", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "gateway 502" } });
    const records = await captureRecords();
    const { resolveShowPageAccess } = await import("@/lib/auth/picker/resolveShowPageAccess");

    const result = await resolveShowPageAccess({
      slug: "some-slug",
      shareToken: "aa11",
      req: crewRequest(),
    });

    expect(result.kind).toBe("infra_error");
    const rec = records.find((r) => r.code === "PICKER_RESOLVER_LOOKUP_FAILED");
    expect(rec).toBeDefined();
    expect(rec!.level).toBe("warn");
    expect(rec!.source).toBe("auth.picker.resolveShowPageAccess");
    expect(rec!.context).toMatchObject({ site: "resolve_rpc" });
    expect(rec!.context).toHaveProperty("error"); // underlying fault preserved
  });

  test("resolve RPC thrown path warns with its own site discriminator", async () => {
    state.rpc.mockRejectedValue(new Error("fetch failed"));
    const records = await captureRecords();
    const { resolveShowPageAccess } = await import("@/lib/auth/picker/resolveShowPageAccess");

    const result = await resolveShowPageAccess({
      slug: "some-slug",
      shareToken: "aa11",
      req: crewRequest(),
    });

    expect(result.kind).toBe("infra_error");
    const rec = records.find((r) => r.code === "PICKER_RESOLVER_LOOKUP_FAILED");
    expect(rec).toBeDefined();
    expect(rec!.context).toMatchObject({ site: "resolve_rpc_threw" });
    expect(rec!.context).toHaveProperty("error");
  });

  test("show-row read error warns with site show_read and the PostgREST error", async () => {
    state.rpc.mockResolvedValue({ data: "11111111-1111-1111-1111-111111111111", error: null });
    state.maybeSingle.mockResolvedValue({ data: null, error: { message: "upstream invalid" } });
    const records = await captureRecords();
    const { resolveShowPageAccess } = await import("@/lib/auth/picker/resolveShowPageAccess");

    const result = await resolveShowPageAccess({
      slug: "some-slug",
      shareToken: "aa11",
      req: crewRequest(),
    });

    expect(result.kind).toBe("infra_error");
    const rec = records.find((r) => r.code === "PICKER_RESOLVER_LOOKUP_FAILED");
    expect(rec).toBeDefined();
    expect(rec!.context).toMatchObject({ site: "show_read" });
    expect(rec!.context).toHaveProperty("error");
  });
});
