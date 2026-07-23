// Task 1 (modal-state-coverage plan): the pure change-feed shaper extracted from
// readShowChangeFeed. These tests pin the mapping semantics the extraction must
// preserve: the acceptable predicate, the undo gate, and the full-precision
// cross-source merge sort (P5-F4/P5-F5 class).
import { describe, expect, test } from "vitest";
import { shapeChangeFeed, type ChangeLogRow } from "@/lib/sync/feed/shapeChangeFeed";
import type { HoldRow } from "@/lib/sync/feed/shapeHoldEntry";

const log = (over: Partial<ChangeLogRow>): ChangeLogRow => ({
  id: "log-1",
  occurred_at: "2026-07-01T12:00:00.000100Z",
  status: "applied",
  summary: "Change",
  entity_ref: null,
  change_kind: "field_changed",
  individually_undoable: false,
  source: "auto_apply",
  acknowledged_at: null,
  ...over,
});

const hold: HoldRow = {
  id: "hold-1",
  entity_key: "crew_email:dana",
  held_value: { email: "old@example.test" },
  proposed_value: { disposition: "email_change", name: "Dana Reed", email: "new@example.test" },
  base_modified_time: "2026-07-01T12:00:00.000200Z",
  created_at: "2026-07-01T12:00:00.000200Z",
};

describe("shapeChangeFeed", () => {
  test("acceptable iff auto_apply + applied + ack null", () => {
    const [a] = shapeChangeFeed([log({})], []);
    expect(a?.acceptable).toBe(true);
    const [b] = shapeChangeFeed([log({ source: "mi11_approve" })], []);
    expect(b?.acceptable).toBe(false);
    const [c] = shapeChangeFeed([log({ acknowledged_at: "2026-07-01T13:00:00Z" })], []);
    expect(c?.acceptable).toBe(false);
  });
  test("acceptable requires applied status", () => {
    const [g] = shapeChangeFeed([log({ status: "rejected" })], []);
    expect(g?.acceptable).toBe(false);
  });
  test("undo action iff applied + crew-domain kind + individually_undoable", () => {
    const [e] = shapeChangeFeed(
      [log({ change_kind: "crew_renamed", individually_undoable: true, source: "mi11_approve" })],
      [],
    );
    expect(e?.action).toBe("undo");
    expect(e && "changeLogId" in e && e.changeLogId).toBe("log-1");
    const [f] = shapeChangeFeed([log({ change_kind: "crew_renamed" })], []);
    expect(f?.action).toBe("none");
  });
  test("every crew-domain kind gates undo (crew_added and crew_removed, not just crew_renamed)", () => {
    for (const change_kind of ["crew_added", "crew_removed"]) {
      const [e] = shapeChangeFeed(
        [log({ change_kind, individually_undoable: true, source: "mi11_approve" })],
        [],
      );
      expect(e?.action).toBe("undo");
      const [f] = shapeChangeFeed([log({ change_kind })], []);
      expect(f?.action).toBe("none");
    }
  });
  test("undo requires applied status and a crew-domain kind", () => {
    const [h] = shapeChangeFeed(
      [log({ status: "undone", change_kind: "crew_renamed", individually_undoable: true })],
      [],
    );
    expect(h?.action).toBe("none");
    const [i] = shapeChangeFeed(
      [log({ change_kind: "field_changed", individually_undoable: true })],
      [],
    );
    expect(i?.action).toBe("none");
  });
  test("microsecond merge: hold 100us newer than log sorts first", () => {
    const entries = shapeChangeFeed([log({})], [hold]);
    expect(entries.map((e) => e.id)).toEqual(["hold-1", "log-1"]);
    expect(entries.every((e) => !("sortKey" in e))).toBe(true);
  });
  test("acknowledgedAt survives non-applied statuses", () => {
    const [e] = shapeChangeFeed(
      [log({ status: "superseded", acknowledged_at: "2026-07-01T13:00:00Z" })],
      [],
    );
    expect(e?.status).toBe("superseded");
    expect(e?.acknowledgedAt).not.toBeNull();
  });
});
