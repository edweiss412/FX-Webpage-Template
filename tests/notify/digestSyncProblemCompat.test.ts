// spec §4.9 — buildNeedsAttention gained an optional `syncProblems` stream + a
// `sync_problem` item variant. The digest is a SECOND caller that passes neither;
// it must keep compiling and producing byte-identical groups (no sync_problem
// item is ever sourced by the digest). This pins the compat contract explicitly.
import { describe, expect, test } from "vitest";
import { buildDigestModel, type DigestBuilderSql } from "@/lib/notify/digest";
import { buildNeedsAttention } from "@/lib/admin/needsAttention";

function emptySql(): DigestBuilderSql {
  return (() => Promise.resolve([])) as unknown as DigestBuilderSql;
}

describe("digest sync_problem compatibility (§4.9)", () => {
  test("buildNeedsAttention accepts the digest shape (no syncProblems) and yields none", () => {
    const r = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0 },
    });
    expect(r.syncProblemTotal).toBe(0);
    expect(r.items.some((i) => i.variant === "sync_problem")).toBe(false);
  });

  test("buildDigestModel still builds (no sync_problem grouping) with the empty stream", async () => {
    const result = await buildDigestModel("doug@fxav.net", "2026-06-02", { sql: emptySql() });
    // Empty pending sources → no_send; the model machinery ran without error and
    // produced no sync_problem-labeled group.
    expect(result.kind).toBe("no_send");
  });
});
