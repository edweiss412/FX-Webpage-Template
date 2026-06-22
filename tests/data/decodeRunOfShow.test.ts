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
  it("non-array day value → that day dropped + corrupt", () => {
    const r = decodeRunOfShow({ "2026-01-01": 5, "2026-01-02": [good] });
    expect(r.value).toEqual({ "2026-01-02": [good] });
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
    expect(r.value).toEqual({ "2026-01-01": [good] });
    expect(r.corrupt).toBe(true);
  });
  it("a day left with zero valid entries after filtering is omitted (→ anchor strip)", () => {
    const r = decodeRunOfShow({ "2026-01-01": [{ title: "" }], "2026-01-02": [good] });
    expect(r.value).toEqual({ "2026-01-02": [good] });
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
