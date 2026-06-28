import { describe, it, expect } from "vitest";
import { decodeRunOfShow } from "@/lib/data/decodeRunOfShow";

const good = {
  start: "7:15 AM",
  finish: "7:30 AM",
  trt: "0:15",
  title: "Opening Keynote",
  room: "Mabel 1",
  av: "POD",
};

describe("OLD decoder shape on a ScheduleDay value → corrupt-skip, NOT throw (rollback contract §14)", () => {
  it("a ScheduleDay object under the current array-only day check is corrupt-skipped without throwing", () => {
    // Snapshot the CURRENT (pre-reshape) behavior: the array-only Layer-3 guard
    // (decodeRunOfShow.ts:56-59) treats a {entries,...} object as a non-array day →
    // dropped + corrupt:true, and MUST NOT throw. This pins graceful rollback.
    // After the reshape, the production decoder ACCEPTS this shape (corrupt:false);
    // the not.toThrow() invariant is unconditional in both states.
    const scheduleDayValue = {
      "2026-01-02": { entries: [good], showStart: "7:15 AM", window: null },
    };
    expect(() => decodeRunOfShow(scheduleDayValue)).not.toThrow();
  });
});

describe("decodeRunOfShow — total, deep per-layer validation (R14)", () => {
  it("null → null, not corrupt (legitimate empty — the common case; must NOT fire tileErrors)", () => {
    expect(decodeRunOfShow(null)).toEqual({ value: null, corrupt: false });
  });
  it("non-object top level → null + corrupt (array / string / number)", () => {
    // catches: a non-object stored value crashing the UI's runOfShow[d] access
    expect(decodeRunOfShow([])).toEqual({ value: null, corrupt: true });
    expect(decodeRunOfShow("x")).toEqual({ value: null, corrupt: true });
    expect(decodeRunOfShow(42)).toEqual({ value: null, corrupt: true });
  });
  it("non-ISO key → dropped, sibling valid day still projected, corrupt set", () => {
    const r = decodeRunOfShow({ garbage: [good], "2026-01-02": [good] });
    expect(Object.keys(r.value ?? {})).toEqual(["2026-01-02"]);
    expect(r.corrupt).toBe(true);
  });
  it("non-array, non-object day value → that day dropped + corrupt", () => {
    const r = decodeRunOfShow({ "2026-01-01": 5, "2026-01-02": [good] });
    expect(r.value).toEqual({ "2026-01-02": { entries: [good], showStart: null, window: null } });
    expect(r.corrupt).toBe(true);
  });
  it("entry = null / non-object / non-string optional field → dropped + corrupt", () => {
    // catches: a shallow typeof==='object' guard letting [null] reach the length>0 UI branch and crash
    expect(decodeRunOfShow({ "2026-01-01": [null] })).toEqual({ value: null, corrupt: true });
    expect(decodeRunOfShow({ "2026-01-01": [{ title: "x", room: 7 }] })).toEqual({
      value: null,
      corrupt: true,
    });
  });
  it("entry whose title is empty-or-sentinel → dropped (mirrors parser emit gate)", () => {
    expect(decodeRunOfShow({ "2026-01-01": [{ start: "1", title: "" }] })).toEqual({
      value: null,
      corrupt: true,
    });
    expect(decodeRunOfShow({ "2026-01-01": [{ start: "1", title: "TBD" }] })).toEqual({
      value: null,
      corrupt: true,
    });
  });
  it("well-formed day alongside malformed sibling → valid day still projects, corrupt set", () => {
    const r = decodeRunOfShow({ "2026-01-01": [good], "2026-01-02": [{ title: 9 }] });
    expect(r.value).toEqual({ "2026-01-01": { entries: [good], showStart: null, window: null } });
    expect(r.corrupt).toBe(true);
  });
  it("a day left with zero valid entries after filtering is omitted (→ anchor strip)", () => {
    const r = decodeRunOfShow({ "2026-01-01": [{ title: "" }], "2026-01-02": [good] });
    expect(r.value).toEqual({ "2026-01-02": { entries: [good], showStart: null, window: null } });
    expect(r.corrupt).toBe(true);
  });
  it("is total over JSONB SHAPES — never throws on plain-data adversarial input", () => {
    // jsonb deserializes to PLAIN data (no getters/accessors), so totality is over malformed SHAPES,
    // not throwing accessors. These are the realistic adversarial inputs:
    expect(() =>
      decodeRunOfShow({ "2026-01-01": [undefined, true, [], 0, { title: {} }] }),
    ).not.toThrow();
    expect(() => decodeRunOfShow({ "": [], "2026-13-99": [good], nested: { a: 1 } })).not.toThrow();
  });
});

describe("decodeRunOfShow — ScheduleDay reshape (§3.2)", () => {
  it("new object shape: entries + showStart + window decode through", () => {
    const day = { entries: [good], showStart: "7:15 AM", window: null };
    const r = decodeRunOfShow({ "2026-01-02": day });
    expect(r.corrupt).toBe(false);
    expect(r.value).toEqual({
      "2026-01-02": { entries: [good], showStart: "7:15 AM", window: null },
    });
  });
  it("new object shape: bare-window day (entries:[], window present, showStart null) survives", () => {
    const day = { entries: [], showStart: null, window: { start: "7:30am", end: "5:50pm" } };
    const r = decodeRunOfShow({ "2026-01-02": day });
    expect(r.value!["2026-01-02"]!.window).toEqual({ start: "7:30am", end: "5:50pm" });
    expect(r.corrupt).toBe(false);
  });
  it("new object shape: sentinel showStart ('TBD') → null, not a leaked anchor", () => {
    const day = { entries: [good], showStart: "TBD", window: null };
    const r = decodeRunOfShow({ "2026-01-02": day });
    expect(r.value!["2026-01-02"]!.showStart).toBeNull();
  });
  it("new object shape: sentinel window end → window null (no '7:30am–TBD')", () => {
    const day = { entries: [], showStart: "7:30am", window: { start: "7:30am", end: "N/A" } };
    const r = decodeRunOfShow({ "2026-01-02": day });
    expect(r.value!["2026-01-02"]!.window).toBeNull();
  });
  it("new object shape: fully-empty day (no entries/showStart/window) → omitted", () => {
    const r = decodeRunOfShow({ "2026-01-02": { entries: [], showStart: null, window: null } });
    expect(r.value).toBeNull();
  });

  // NEGATIVE-REGRESSION: legacy Record<iso, AgendaEntry[]> still decodes (deploy→re-sync window)
  it("legacy array shape wraps to ScheduleDay (entries:[...], showStart:null, window:null)", () => {
    const r = decodeRunOfShow({ "2026-01-02": [good] });
    expect(r.corrupt).toBe(false);
    expect(r.value).toEqual({ "2026-01-02": { entries: [good], showStart: null, window: null } });
  });
});

describe("decodeRunOfShow — AgendaEntry.kind enum allow-list", () => {
  it("preserves kind 'strike' and 'loadout' on decode", () => {
    const raw = {
      "2026-05-06": {
        entries: [
          { start: "4:30 PM", title: "Strike — General Session", kind: "strike" },
          { start: "6:00 PM", title: "Load Out", kind: "loadout" },
        ],
        showStart: null,
        window: null,
      },
    };
    const { value, corrupt } = decodeRunOfShow(raw);
    expect(corrupt).toBe(false);
    expect(value!["2026-05-06"]!.entries.map((e) => e.kind)).toEqual(["strike", "loadout"]);
  });

  it("coerces an unknown kind to absent (agenda), not corrupt", () => {
    const raw = {
      "2026-05-06": {
        entries: [{ start: "1 PM", title: "X", kind: "banana" }],
        showStart: null,
        window: null,
      },
    };
    const { value, corrupt } = decodeRunOfShow(raw);
    expect(corrupt).toBe(false); // unknown kind is dropped like a bad optional field, not corrupting
    expect(value!["2026-05-06"]!.entries[0]!.kind).toBeUndefined();
  });

  it("decodes a legacy entry without kind unchanged", () => {
    const raw = {
      "2026-05-06": { entries: [{ start: "1 PM", title: "X" }], showStart: null, window: null },
    };
    const { value } = decodeRunOfShow(raw);
    expect(value!["2026-05-06"]!.entries[0]!.kind).toBeUndefined();
  });
});
