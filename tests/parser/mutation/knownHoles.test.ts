// tests/parser/mutation/knownHoles.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      expect(["wrong", "signal_loss", "text_drift"]).toContain(h.kind);
      expect(typeof h.fingerprint).toBe("string");
      expect(h.finding.length).toBeGreaterThan(0);
    }
  });

  it("no row still owes mechanism triage — the migration marker is retired (BL-MUTATION-DRIFT-TRIAGE)", () => {
    // The 2026-08-09 classifier migration re-kinded 143 rows signal_loss → text_drift with
    // `[re-kinded by classifier; mechanism triage owed, …]` in their notes. §11.5(iii)'s
    // per-row mechanism bar arrives with the triage; a note still carrying the marker is
    // un-triaged debt in the instrument itself, and this row also guards recurrence — a
    // future migration cannot park markers in the ledger indefinitely.
    const owing = KNOWN_SILENT_HOLES.filter((h) => h.note.includes("re-kinded by classifier"));
    expect(
      owing.map((h) => h.siteId),
      `${owing.length} ledger row(s) still carry the mechanism-triage-owed migration marker`,
    ).toEqual([]);
  });
});

describe("the content-keyed near-miss detector closed 24 section-reorder holes", () => {
  // The positional `UNKNOWN_FIELD` sweep read a scope WINDOW, so moving a block moved the
  // emission set and the swap oracle saw real signal loss. The content-keyed detector
  // (spec parser/2026-08-15-field-near-miss-detector-design.md) reads nothing positional,
  // so these holes are CLOSED, not re-blessed.
  //
  // THE SET IS THE HARNESS'S, NOT THE PLAN'S. The wave plan named TEN ids to delete; the
  // collected run's own `fixedHoles` set is 24 within this operator, and the plan's ten are
  // a strict subset of it. Shipping the authored set turned five shards red, which is the
  // rule `knownHoles.ts` already carried from branch 4 — size a shrink by the harness, never
  // by an id list. These 24 are transcribed from that reconciliation.
  const CLOSED = [
    "section-reorder:2025-03-dci-rpas-central:B14:L0:Xpair14",
    "section-reorder:2025-03-dci-rpas-central:B15:L0:Xpair15",
    "section-reorder:2025-03-dci-rpas-central:B16:L0:Xpair16",
    "section-reorder:2025-03-dci-rpas-central:B17:L0:Xpair17",
    "section-reorder:2025-03-dci-rpas-central:B18:L0:Xpair18",
    "section-reorder:2025-03-dci-rpas-central:B19:L0:Xpair19",
    "section-reorder:2025-04-asset-mgmt-cfo-coo:B14:L0:Xpair14",
    "section-reorder:2025-04-asset-mgmt-cfo-coo:B15:L0:Xpair15",
    "section-reorder:2025-06-ria-investment-forum:B3:L0:Xpair3",
    "section-reorder:2025-06-ria-investment-forum:B4:L0:Xpair4",
    "section-reorder:2025-06-ria-investment-forum:B5:L0:Xpair5",
    "section-reorder:2025-06-ria-investment-forum:B6:L0:Xpair6",
    "section-reorder:2025-06-ria-investment-forum:B7:L0:Xpair7",
    "section-reorder:2025-06-ria-investment-forum:B8:L0:Xpair8",
    "section-reorder:2025-10-consultants-roundtable:B13:L0:Xpair13",
    "section-reorder:2025-10-consultants-roundtable:B14:L0:Xpair14",
    "section-reorder:2025-10-consultants-roundtable:B15:L0:Xpair15",
    "section-reorder:2025-10-consultants-roundtable:B16:L0:Xpair16",
    "section-reorder:2025-10-consultants-roundtable:B17:L0:Xpair17",
    "section-reorder:2025-10-consultants-roundtable:B18:L0:Xpair18",
    "section-reorder:2025-10-consultants-roundtable:B19:L0:Xpair19",
    "section-reorder:2025-10-consultants-roundtable:B20:L0:Xpair20",
    "section-reorder:2025-10-consultants-roundtable:B21:L0:Xpair21",
    "section-reorder:2025-10-consultants-roundtable:B22:L0:Xpair22",
  ];

  it("holds no ledger row for any of the closed siteIds", () => {
    const ledgered = new Set(KNOWN_SILENT_HOLES.map((h) => h.siteId));
    const remaining = CLOSED.filter((id) => ledgered.has(id));
    expect(
      remaining,
      `${remaining.length} closed section-reorder hole(s) still ledgered — the detector is swap-invariant, so these are fixed holes, not deferrable ones`,
    ).toEqual([]);
  });

  it("shrank by exactly those 24 — the OTHER 59 ratified section-reorder rows are untouched", () => {
    // Anti-tautology: absence alone also passes on an emptied ledger, or on one whose
    // whole `section-reorder` class was deleted. The documented limit (spec AC-N5, as
    // corrected by the collected run) is that 59 order-sensitivity rows REMAIN, so the
    // count is asserted from the same live ledger.
    const reorder = KNOWN_SILENT_HOLES.filter((h) => h.siteId.startsWith("section-reorder:"));
    expect(reorder.length, "section-reorder rows remaining after the 24-row shrink").toBe(59);
    expect(reorder.every((h) => !CLOSED.includes(h.siteId))).toBe(true);
    // Every survivor is kind `wrong`: the operator's entire signal_loss and text_drift
    // population is what the positional sweep was producing, and it closed with it.
    expect([...new Set(reorder.map((h) => h.kind))].sort()).toEqual(["wrong"]);
  });
});

describe("the ledger header's census agrees with the ledger", () => {
  // The header carried "all others = 1332; by kind: 1349 wrong + 35 signal_loss + 30
  // text_drift" — a pre-wave-4 census, stale by 326 rows, sitting above the rows it
  // described. Nothing compared the two, so it drifted silently for a whole wave and the
  // only number anyone refreshed was the one their own shrink touched. This compares the
  // written census to the live rows, so the next shrink cannot leave half of it behind.
  const SOURCE = readFileSync(join(process.cwd(), "tests/parser/mutation/knownHoles.ts"), "utf8");
  const CENSUS = /total (\d+) = (\d+) wrong \+ (\d+) text_drift \+ (\d+) signal_loss/.exec(SOURCE);

  it("states a census in the pinned shape, so the comparison below is not vacuous", () => {
    // The premise, executable: an unmatched regex would make every assertion under it
    // pass against `undefined`, which is the failure this whole case exists to prevent.
    expect(
      CENSUS,
      "the header no longer carries a `total N = A wrong + B text_drift + C signal_loss` line; " +
        "restore it or update this pattern — do not delete the check",
    ).not.toBeNull();
  });

  it("matches the live rows exactly, by total and by kind", () => {
    const [, total, wrong, drift, loss] = CENSUS!.map(Number);
    const live = KNOWN_SILENT_HOLES.reduce<Record<string, number>>((acc, h) => {
      acc[h.kind] = (acc[h.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect({
      total,
      wrong,
      text_drift: drift,
      signal_loss: loss,
    }).toEqual({
      total: KNOWN_SILENT_HOLES.length,
      wrong: live.wrong ?? 0,
      text_drift: live.text_drift ?? 0,
      signal_loss: live.signal_loss ?? 0,
    });
  });
});

describe("ledger is triageable — no blanket 'unaudited' (Codex whole-diff R3)", () => {
  // Every corrupting operator maps to the audit finding it exercises (documented #) or a real
  // BACKLOG.md id, so a stale/new ledger failure is recoverable by operator class, not thousands of
  // opaque rows. header-typo→#5 and blank-row:*→#10 are documented audit findings; the rest are
  // BL-MUTATION-* backlog entries. Each is a STANDALONE, sized row in BACKLOG.md as of the
  // 2026-08-06 L-wave decomposition (BL-MUTATION-REF-SUB, -MERGED-CELL, -UNICODE, -COLUMN-SHIFT,
  // -SECTION-ORDER); they used to be sub-items of the BL-MUTATION-HARNESS-OPEN-HOLES umbrella,
  // whose decomposition record is now in BACKLOG-archive.md under that id.
  // BL-MUTATION-SECTION-ORDER joins it there in this PR's last commit, carrying the §7
  // ratification and the 72-row documented-limit note: the 10 real-loss rows are closed by
  // the near-miss detector, and an archived id stays resolvable, so the map value above
  // does not change.
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
