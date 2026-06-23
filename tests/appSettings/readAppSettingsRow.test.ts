import { describe, test, expect, vi } from "vitest";
import { readAppSettingsRow } from "@/lib/appSettings/readAppSettingsRow";

function mockClient(
  result: { data: unknown; error: { message: string } | null },
  opts?: { throwFrom?: boolean },
) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    async maybeSingle() {
      return result;
    },
  };
  return {
    from: () => {
      if (opts?.throwFrom) throw new Error("boom");
      return builder;
    },
  } as never;
}

describe("readAppSettingsRow", () => {
  test("returns {kind:value, settings} on a row", async () => {
    const row = { id: "default", pending_wizard_session_at: null } as never;
    const r = await readAppSettingsRow(mockClient({ data: row, error: null }));
    expect(r).toEqual({ kind: "value", settings: row });
  });
  test("returned Supabase error → infra_error", async () => {
    const r = await readAppSettingsRow(mockClient({ data: null, error: { message: "timeout" } }));
    expect(r).toEqual({ kind: "infra_error" });
  });
  test("missing default row (data null, no error) → infra_error", async () => {
    const r = await readAppSettingsRow(mockClient({ data: null, error: null }));
    expect(r).toEqual({ kind: "infra_error" });
  });
  test("thrown from .from() → infra_error (not a crash)", async () => {
    const r = await readAppSettingsRow(
      mockClient({ data: null, error: null }, { throwFrom: true }),
    );
    expect(r).toEqual({ kind: "infra_error" });
  });
});
