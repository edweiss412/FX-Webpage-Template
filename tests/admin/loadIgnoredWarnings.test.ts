import { describe, expect, test } from "vitest";
import { loadIgnoredWarnings } from "@/lib/admin/loadIgnoredWarnings";

function fakeSupabase(behavior: "ok" | "returned-error" | "throw") {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              if (behavior === "throw") throw new Error("boom");
              if (behavior === "returned-error") return Promise.resolve({ data: null, error: { message: "bad" } });
              return Promise.resolve({ data: [{ fingerprint: "fp1" }, { fingerprint: "fp2" }], error: null });
            },
          };
        },
      };
    },
  } as never;
}

describe("loadIgnoredWarnings", () => {
  test("ok → Set of fingerprints", async () => {
    const r = await loadIgnoredWarnings("s1", { supabase: fakeSupabase("ok") });
    expect(r.kind).toBe("ok");
    expect(r.kind === "ok" && [...r.fingerprints].sort()).toEqual(["fp1", "fp2"]);
  });
  test("returned {error} → infra_error with message", async () => {
    const r = await loadIgnoredWarnings("s1", { supabase: fakeSupabase("returned-error") });
    expect(r).toMatchObject({ kind: "infra_error" });
    expect(r.kind === "infra_error" && r.message).toMatch(/query failed/);
  });
  test("query throw → infra_error (threw message)", async () => {
    const r = await loadIgnoredWarnings("s1", { supabase: fakeSupabase("throw") });
    expect(r).toMatchObject({ kind: "infra_error" });
    expect(r.kind === "infra_error" && r.message).toMatch(/threw/);
  });
});
