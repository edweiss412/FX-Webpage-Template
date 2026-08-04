import { describe, expect, it } from "vitest";
import { type AcceptedSurvivor, reconcile, score } from "./ledger";

const eq = (siteId: string): AcceptedSurvivor => ({
  siteId,
  kind: "equivalent",
  reason: "unreachable beyond the pre-filter; see spec §2.4",
});

const gap = (siteId: string): AcceptedSurvivor => ({
  siteId,
  kind: "accepted-gap",
  reason: "not observable through this surface's output; see spec §2.5",
  ref: "BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY",
});

describe("ledger reconciliation (spec §3.5, AC-8)", () => {
  it("names a survivor with no ledger row as unaccepted", () => {
    const r = reconcile(["a", "b"], [eq("a")]);
    expect(r.unaccepted).toEqual(["b"]);
    expect(r.stale).toEqual([]);
  });

  it("names a ledger row whose site no longer survives as stale", () => {
    // A ledger that outlives its survivor is how a ratchet rots: the row keeps
    // excusing a gap that was already closed, or one that no longer exists.
    const r = reconcile(["a"], [eq("a"), eq("gone")]);
    expect(r.stale).toEqual(["gone"]);
    expect(r.unaccepted).toEqual([]);
  });

  it("reports drift as BOTH a stale row and a new unaccepted survivor, never absorbing it", () => {
    // Site ids carry position, so an edit above a site changes its id. That must
    // surface, not silently re-match.
    const r = reconcile(["op:99:1:a>b"], [eq("op:12:1:a>b")]);
    expect(r.stale).toEqual(["op:12:1:a>b"]);
    expect(r.unaccepted).toEqual(["op:99:1:a>b"]);
  });

  it("is clean when every survivor has a row and every row has a survivor", () => {
    const r = reconcile(["a", "b"], [eq("a"), gap("b")]);
    expect(r.unaccepted).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});

describe("score arithmetic (spec §3.6, AC-10)", () => {
  it("excludes equivalent rows from the denominator entirely", () => {
    // 8 killed, 2 equivalent survivors, nothing else: the equivalents must not
    // depress the score, or a provably-unkillable mutant would permanently cap
    // every surface below 100%.
    const s = score({ killed: 8, survivors: ["a", "b"], ledger: [eq("a"), eq("b")] });
    expect(s.denominator).toBe(8);
    expect(s.value).toBe(1);
  });

  it("counts accepted-gap rows as survivors so they depress the score", () => {
    // Derived from the fixture rather than hardcoded: 8 killed + 2 accepted
    // gaps => 8/10. If accepted-gap were excluded like equivalent, this reads
    // 1 and the assertion fails, which is the whole point of the two kinds.
    const s = score({ killed: 8, survivors: ["a", "b"], ledger: [gap("a"), gap("b")] });
    expect(s.denominator).toBe(10);
    expect(s.value).toBeCloseTo(0.8, 10);
  });

  it("counts an unaccepted survivor as a survivor", () => {
    const s = score({ killed: 8, survivors: ["a", "b"], ledger: [eq("a")] });
    expect(s.denominator).toBe(9);
    expect(s.value).toBeCloseTo(8 / 9, 10);
  });

  it("reproduces the first enrolled surface's shipping arithmetic (spec §4.3)", () => {
    // 82 killed, 18 equivalent, 2 accepted-gap => 82/84 = 97.6%.
    const survivors = [
      ...Array.from({ length: 18 }, (_, i) => `e${i}`),
      ...Array.from({ length: 2 }, (_, i) => `g${i}`),
    ];
    const ledger = [
      ...Array.from({ length: 18 }, (_, i) => eq(`e${i}`)),
      ...Array.from({ length: 2 }, (_, i) => gap(`g${i}`)),
    ];
    const s = score({ killed: 82, survivors, ledger });
    expect(s.denominator).toBe(84);
    expect(s.value).toBeCloseTo(82 / 84, 10);
    expect(s.value).toBeGreaterThanOrEqual(0.95);
  });

  it("reports a zero-mutant run as a non-finite score rather than silently as zero", () => {
    // 0/0 is NaN, and `NaN < floor` is false — the R1 finding. The gate must be
    // able to SEE this state, so score reports it rather than coercing it.
    const s = score({ killed: 0, survivors: [], ledger: [] });
    expect(s.denominator).toBe(0);
    expect(Number.isFinite(s.value)).toBe(false);
  });
});
