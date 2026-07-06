// tests/parser/mutation/knownHoles.test.ts
import { describe, it, expect } from "vitest";
import { reconcileLedger, KNOWN_SILENT_HOLES } from "./knownHoles";
import type { Alarm, KnownHole } from "./knownHoles";

const A = (siteId: string, kind: Alarm["kind"], fingerprint: string): Alarm => ({
  siteId,
  kind,
  fingerprint,
});
const H = (siteId: string, kind: KnownHole["kind"], fingerprint: string): KnownHole => ({
  siteId,
  kind,
  fingerprint,
  finding: "#1",
  note: "n",
});

describe("reconcileLedger is bidirectional (plan-R9)", () => {
  it("empty vs empty → clean", () => {
    expect(reconcileLedger([], [])).toEqual({ newAlarms: [], staleRows: [] });
  });
  it("actual ∖ ledger → newAlarms (a NEW silent hole fails)", () => {
    const r = reconcileLedger([A("s1", "wrong", "fp")], []);
    expect(r.newAlarms).toEqual(["s1|wrong|fp"]);
    expect(r.staleRows).toEqual([]);
  });
  it("ledger ∖ actual → staleRows (a FIXED/drifted hole fails, forces shrinkage)", () => {
    const r = reconcileLedger([], [H("s1", "wrong", "fp")]);
    expect(r.newAlarms).toEqual([]);
    expect(r.staleRows).toEqual(["s1|wrong|fp"]);
  });
  it("same site+kind but CHANGED fingerprint → BOTH directions fire (deepened hole not masked)", () => {
    const r = reconcileLedger([A("s1", "wrong", "fpNEW")], [H("s1", "wrong", "fpOLD")]);
    expect(r.newAlarms).toEqual(["s1|wrong|fpNEW"]);
    expect(r.staleRows).toEqual(["s1|wrong|fpOLD"]);
  });
  it("kind is part of the key (wrong vs signal_loss are distinct holes)", () => {
    const r = reconcileLedger([A("s1", "signal_loss", "fp")], [H("s1", "wrong", "fp")]);
    expect(r.newAlarms).toEqual(["s1|signal_loss|fp"]);
    expect(r.staleRows).toEqual(["s1|wrong|fp"]);
  });
  it("exact match → clean (order-independent)", () => {
    expect(
      reconcileLedger(
        [A("a", "wrong", "1"), A("b", "signal_loss", "2")],
        [H("b", "signal_loss", "2"), H("a", "wrong", "1")],
      ),
    ).toEqual({ newAlarms: [], staleRows: [] });
  });
});

describe("committed ledger shape", () => {
  it("KNOWN_SILENT_HOLES rows all carry the required fields", () => {
    for (const h of KNOWN_SILENT_HOLES) {
      expect(typeof h.siteId).toBe("string");
      expect(["wrong", "signal_loss"]).toContain(h.kind);
      expect(typeof h.fingerprint).toBe("string");
      expect(h.finding.length).toBeGreaterThan(0);
    }
  });
});
