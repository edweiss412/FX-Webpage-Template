import { afterEach, describe, expect, test } from "vitest";
import { setLogSink, resetLogSink, type LogRecord } from "@/lib/log";
import { emitRoleTokenMapped } from "@/lib/log/emitRoleTokenMapped";
import type { GatedRoleMapping } from "@/lib/sync/roleMappingOverlay";

function capture(): LogRecord[] {
  const records: LogRecord[] = [];
  setLogSink((record) => {
    records.push(record);
  });
  return records;
}

afterEach(() => resetLogSink());

// spec 2026-07-15-extend-role-scope-vocab §10 points 5/6. Emission is a pure function of the
// gate-passing entries: one info-level ROLE_TOKEN_MAPPED app_event per entry, name-free context.

describe("emitRoleTokenMapped (spec §10 points 5/6)", () => {
  test("empty entries → NO emission (rolled-back / nothing gated)", async () => {
    const records = capture();
    await emitRoleTokenMapped([], { showId: "show-1", source: "sync.roleMapping" });
    expect(records).toEqual([]);
  });

  test("one entry → one info app_event with the durable code + name-free context", async () => {
    const records = capture();
    const entry: GatedRoleMapping = { token: "DRONE OP", grants: ["A1", "V1"], newMemberCount: 2 };
    await emitRoleTokenMapped([entry], { showId: "show-9", source: "sync.roleMapping" });

    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.level).toBe("info");
    expect(rec.code).toBe("ROLE_TOKEN_MAPPED");
    expect(rec.showId).toBe("show-9");
    // Context derives from the entry — token/grants/newMemberCount, and NO crew names (Codex R8 F2).
    expect(rec.context).toEqual({
      token: entry.token,
      grants: entry.grants,
      newMemberCount: entry.newMemberCount,
    });
    const serialized = JSON.stringify(rec.context);
    expect(serialized).not.toMatch(/name/i);
  });

  test("N entries → N events, one per token (grouping already applied by the gate)", async () => {
    const records = capture();
    const entries: GatedRoleMapping[] = [
      { token: "DRONE OP", grants: ["A1"], newMemberCount: 1 },
      { token: "GAFFER", grants: [], newMemberCount: 3 },
    ];
    await emitRoleTokenMapped(entries, { showId: "show-2", source: "sync.roleMapping" });

    expect(records.map((r) => r.context.token)).toEqual(["DRONE OP", "GAFFER"]);
    expect(records.every((r) => r.code === "ROLE_TOKEN_MAPPED")).toBe(true);
    // recognize-only (empty grants) still carries the grants array verbatim.
    expect(records[1]!.context.grants).toEqual([]);
  });
});
