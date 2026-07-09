// tests/parser/mutation/knownHoles.test.ts
import { describe, it, expect } from "vitest";
import {
  reconcileLedger,
  KNOWN_SILENT_HOLES,
  OPERATOR_FINDING_MAP,
  findingFor,
} from "./knownHoles";
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
    expect(reconcileLedger([], [])).toEqual({
      newAlarms: [],
      staleRows: [],
      newHoles: [],
      driftedAlarms: [],
      fixedHoles: [],
      driftedStale: [],
    });
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
    ).toEqual({
      newAlarms: [],
      staleRows: [],
      newHoles: [],
      driftedAlarms: [],
      fixedHoles: [],
      driftedStale: [],
    });
  });
});

describe("reconcileLedger classifies drift vs new/fixed holes (triage ergonomics)", () => {
  // A red nightly harness must tell the triager WHICH of three things happened, because two
  // are benign re-bless and one is a genuine regression:
  //   • newHoles     — a (siteId,kind) that NEVER had a ledger row now survives  → REGRESSION
  //   • fixedHoles   — a ledgered (siteId,kind) no longer survives               → coverage win (shrink)
  //   • drifted*     — a ledgered (siteId,kind) survives with a CHANGED fingerprint (parser output
  //                    shape changed) → benign IFF the output change was intentional (re-bless)
  it("brand-new (siteId,kind) → newHoles, never driftedAlarms", () => {
    const r = reconcileLedger([A("s1", "wrong", "fp")], []);
    expect(r.newHoles).toEqual(["s1|wrong|fp"]);
    expect(r.driftedAlarms).toEqual([]);
    // union invariant: newAlarms is exactly newHoles ∪ driftedAlarms
    expect([...r.newHoles, ...r.driftedAlarms].sort()).toEqual([...r.newAlarms].sort());
  });
  it("changed fingerprint at a known (siteId,kind) → driftedAlarms + driftedStale, NOT new/fixed", () => {
    const r = reconcileLedger([A("s1", "wrong", "fpNEW")], [H("s1", "wrong", "fpOLD")]);
    expect(r.driftedAlarms).toEqual(["s1|wrong|fpNEW"]);
    expect(r.driftedStale).toEqual(["s1|wrong|fpOLD"]);
    expect(r.newHoles).toEqual([]);
    expect(r.fixedHoles).toEqual([]);
  });
  it("ledgered (siteId,kind) with no surviving alarm → fixedHoles, never driftedStale", () => {
    const r = reconcileLedger([], [H("s1", "wrong", "fp")]);
    expect(r.fixedHoles).toEqual(["s1|wrong|fp"]);
    expect(r.driftedStale).toEqual([]);
    // union invariant: staleRows is exactly fixedHoles ∪ driftedStale
    expect([...r.fixedHoles, ...r.driftedStale].sort()).toEqual([...r.staleRows].sort());
  });
  it("kind is part of the drift key — same siteId, DIFFERENT kind is a new hole, not drift", () => {
    // ledger has (s1, wrong); actual has (s1, signal_loss) → different (siteId,kind) → newHole.
    const r = reconcileLedger([A("s1", "signal_loss", "fp")], [H("s1", "wrong", "fp")]);
    expect(r.newHoles).toEqual(["s1|signal_loss|fp"]);
    expect(r.driftedAlarms).toEqual([]);
    expect(r.fixedHoles).toEqual(["s1|wrong|fp"]);
    expect(r.driftedStale).toEqual([]);
  });
  it("mixed batch classifies each row independently", () => {
    const r = reconcileLedger(
      [A("new", "wrong", "x"), A("drift", "wrong", "fpNEW"), A("keep", "wrong", "k")],
      [H("drift", "wrong", "fpOLD"), H("fixed", "wrong", "g"), H("keep", "wrong", "k")],
    );
    expect(r.newHoles).toEqual(["new|wrong|x"]);
    expect(r.driftedAlarms).toEqual(["drift|wrong|fpNEW"]);
    expect(r.fixedHoles).toEqual(["fixed|wrong|g"]);
    expect(r.driftedStale).toEqual(["drift|wrong|fpOLD"]);
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

describe("ledger is triageable — no blanket 'unaudited' (Codex whole-diff R3)", () => {
  // Every corrupting operator maps to the audit finding it exercises (documented #) or a real
  // BACKLOG.md id, so a stale/new ledger failure is recoverable by operator class, not thousands of
  // opaque rows. header-typo→#5 and blank-row:*→#10 are documented audit findings; the rest are
  // BL-MUTATION-* backlog sub-items (see BACKLOG.md § BL-MUTATION-HARNESS-OPEN-HOLES).
  const CORRUPTING = [
    "header-typo",
    "ref-sub",
    "unicode-inject",
    "column-shift",
    "blank-row:inject",
    "blank-row:remove",
    "merged-cell",
    "section-reorder",
  ];
  it("OPERATOR_FINDING_MAP covers every corrupting operator with a documented finding# or BL- ref", () => {
    for (const op of CORRUPTING) {
      const f = OPERATOR_FINDING_MAP[op];
      expect(f, `no finding mapping for ${op}`).toBeDefined();
      expect(f, `${op} finding must be an audit #N or a BL- backlog id`).toMatch(
        /^#\d+$|^BL-[A-Z0-9-]+$/,
      );
    }
  });
  it("every ledger row's finding is a documented map value — NEVER a blanket 'unaudited'", () => {
    const allowed = new Set(Object.values(OPERATOR_FINDING_MAP));
    for (const h of KNOWN_SILENT_HOLES) {
      expect(h.finding, `${h.siteId} finding must not be 'unaudited'`).not.toBe("unaudited");
      expect(allowed, `${h.siteId} finding "${h.finding}" not in OPERATOR_FINDING_MAP`).toContain(
        h.finding,
      );
      // the row's committed finding agrees with the operator→finding resolver
      expect(findingFor(h.siteId), `${h.siteId} finding disagrees with findingFor`).toBe(h.finding);
    }
  });
});
