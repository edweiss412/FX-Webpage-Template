import { describe, it, expect } from "vitest";
import { getAutoPublishCleanFirstSeen } from "@/lib/appSettings/getAutoPublishCleanFirstSeen";

type SingleResult = { data: unknown; error: { message: string } | null };

/** Minimal supabase-client stub whose .from().select().eq().maybeSingle() resolves to the given result. */
function mockSelectSingle(result: SingleResult) {
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
  return { from: () => builder } as never;
}

describe("getAutoPublishCleanFirstSeen (fail-closed)", () => {
  it("returns autoPublish:true only when the validated singleton row has the column true", async () => {
    const sb = mockSelectSingle({ data: { auto_publish_clean_first_seen: true }, error: null });
    expect(await getAutoPublishCleanFirstSeen(sb)).toEqual({ kind: "value", autoPublish: true });
  });

  it("returns autoPublish:false (stage) on a false row", async () => {
    const sb = mockSelectSingle({ data: { auto_publish_clean_first_seen: false }, error: null });
    expect(await getAutoPublishCleanFirstSeen(sb)).toEqual({ kind: "value", autoPublish: false });
  });

  it("returns infra_error on a read error (NOT fail-open true)", async () => {
    const sb = mockSelectSingle({ data: null, error: { message: "timeout" } });
    expect(await getAutoPublishCleanFirstSeen(sb)).toEqual({ kind: "infra_error" });
  });

  it("fails closed (autoPublish:false) on a missing row", async () => {
    const sb = mockSelectSingle({ data: null, error: null });
    expect(await getAutoPublishCleanFirstSeen(sb)).toEqual({ kind: "value", autoPublish: false });
  });

  it("fails closed (autoPublish:false) on a non-boolean value", async () => {
    const sb = mockSelectSingle({ data: { auto_publish_clean_first_seen: "yes" }, error: null });
    expect(await getAutoPublishCleanFirstSeen(sb)).toEqual({ kind: "value", autoPublish: false });
  });
});
