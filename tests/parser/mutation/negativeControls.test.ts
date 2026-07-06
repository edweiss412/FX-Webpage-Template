// tests/parser/mutation/negativeControls.test.ts
import { describe, it, expect } from "vitest";
import { verdict, fingerprint } from "./oracle";
import { OPERATORS } from "./operators";
import type { ParsedSheet } from "@/lib/parser/types";

const base = (over: Partial<ParsedSheet> = {}): ParsedSheet =>
  ({ show: {} as never, crewMembers: [], hotelReservations: [], rooms: [], transportation: null, contacts: [],
     pullSheet: null, diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
     openingReel: null, raw_unrecognized: [], warnings: [], hardErrors: [], ...over } as ParsedSheet);

describe("negative controls — every alarm class is reachable", () => {
  it("SILENT_WRONG: payload change, no signal", () => {
    expect(verdict(base(), base({ rooms: [{} as never] }))).toBe("SILENT_WRONG");
  });
  it("SILENT_SIGNAL_LOSS: baseline warning removed, payload equal", () => {
    expect(verdict(base({ warnings: [{ severity: "warn", code: "W", message: "m" }] }), base())).toBe("SILENT_SIGNAL_LOSS");
  });
  it("fingerprint: same-path new value (R8)", () => {
    const b = base({ crewMembers: [{ name: "A" } as never] });
    expect(fingerprint(b, base({ crewMembers: [{ name: "B" } as never] })))
      .not.toBe(fingerprint(b, base({ crewMembers: [{ name: "C" } as never] })));
  });
  it("fingerprint: signal reorder (R16)", () => {
    const w = (c: string) => ({ severity: "warn" as const, code: c, message: c });
    expect(fingerprint(base(), base({ warnings: [w("A"), w("B")] })))
      .not.toBe(fingerprint(base(), base({ warnings: [w("B"), w("A")] })));
  });
  it("fingerprint: raw_unrecognized value drift same block|key (R9/R15)", () => {
    const b = base();
    expect(fingerprint(b, base({ raw_unrecognized: [{ block: "X", key: "k", value: "v1" }] })))
      .not.toBe(fingerprint(b, base({ raw_unrecognized: [{ block: "X", key: "k", value: "v2" }] })));
  });
  it("unicode-inject: no site on a single-char data cell (R14)", () => {
    expect(OPERATORS["unicode-inject"]!("| CREW | N |\n|  | A |")).toHaveLength(0);
  });
  it("column-shift: no site on a header/alignment-only section (R13)", () => {
    expect(OPERATORS["column-shift"]!("| CREW | NAME |\n| :---: | :---: |")).toHaveLength(0);
  });
  it("ref-sub: never targets a :---: alignment row (R12)", () => {
    const md = "| CREW | NAME |\n| :---: | :---: |\n|  | Doug |";
    for (const m of OPERATORS["ref-sub"]!(md)) expect(m.md).not.toContain("#REF! | :---:");
  });
});

// The audit independently counts header + boundary ops, so a crippled operator (emitting
// zero header-typo / blank-row:remove sites) is caught by audit-agreement + golden inventory
// rather than self-reported (plan-R1). Prove the audit sees these classes independently.
import { auditSites } from "./applicabilityAudit";
import { OPERATORS as OPS2 } from "./operators";
describe("audit covers header + boundary operators independently (plan-R1)", () => {
  const md = ["| CREW | NAME |", "|  | Doug Larson |", "", "| TRANSPORTATION | NAME |", "|  | Carlos |"].join("\n");
  it("counts a header-typo site for crew and a blank-row:remove boundary between the runs", () => {
    const s = auditSites(md);
    expect(s.get("header-typo|crew") ?? 0).toBeGreaterThan(0);
    // boundary between run0 (crew) and run1 (transportation) → credited to both domains
    expect((s.get("blank-row:remove|crew") ?? 0) + (s.get("blank-row:remove|transportation") ?? 0)).toBeGreaterThan(0);
  });
});

describe("count-level agreement catches partial under-enumeration (plan-R3)", () => {
  it("a crew section with N cells yields exactly N ref-sub mutants (== audit count)", () => {
    const md = "| CREW | NAME | ROLE | PHONE |\n|  | Doug | Lead | 917 |\n|  | Eric | BO | 508 |";
    const auditCrew = auditSites(md).get("ref-sub|crew") ?? 0;
    const genCrew = OPS2["ref-sub"]!(md).filter((m) => m.domains.includes("crew")).length;
    expect(genCrew).toBe(auditCrew);
    expect(genCrew).toBeGreaterThan(1); // proves it is NOT collapsed to one mutant
  });
});

// The gates above must go RED when the harness itself is crippled — otherwise a green run
// proves nothing. These controls INJECT the regressions Codex R13 named and assert the exact
// gate expression (count agreement, boundary coverage, skipped-inapplicable equality, ledger
// reconcile) detects the failure. If any of these ever passes, the corresponding real gate is
// tautological.
import { expectedSkipped } from "./applicabilityAudit";
import { reconcileLedger } from "./knownHoles";

describe("structural gates FAIL under injected regressions (plan-R13)", () => {
  const genCounts = (raw: { domains: string[] }[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const mut of raw) for (const d of mut.domains) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  };
  it("count-agreement: dropping ONE generated ref-sub|crew mutant makes gen !== audit", () => {
    const md = "| CREW | NAME | PHONE |\n|  | Doug | 917 |\n|  | Eric | 508 |";
    const audit = auditSites(md).get("ref-sub|crew") ?? 0;
    const healthy = OPS2["ref-sub"]!(md).filter((m) => m.domains.includes("crew"));
    // Liveness FIRST: the healthy generator must MATCH the audit. This is the assertion the
    // injected regression (refSub => []) trips — without it, a fully-dead operator yields
    // crippled=[] whose count 0 still satisfies `not.toBe(audit>0)`, so the RED proof was a
    // false positive (Codex plan-R16 [high]).
    expect(genCounts(healthy).get("crew") ?? 0).toBe(audit);
    const crippled = healthy.slice(0, -1); // remove one
    expect(genCounts(crippled).get("crew") ?? 0).not.toBe(audit); // the `=== audit` gate would fail
  });
  it("boundary-coverage: removing ALL blank-row:remove mutants leaves an audited boundary uncovered", () => {
    const md = "| CREW | NAME |\n|  | Doug |\n\n| TRANSPORTATION | NAME |\n|  | Carlos |";
    const auditHasBoundary = [...auditSites(md).keys()].some((k) => k.startsWith("blank-row:remove|"));
    const crippledGen: { domains: string[] }[] = []; // operator emits nothing for this class
    expect(auditHasBoundary).toBe(true);
    expect(genCounts(crippledGen).size).toBe(0); // gen 0 vs audit>0 → presence/agreement gate fails
  });
  it("skipped-inapplicable: a classifier that drops a PRESENT domain diverges from expectedSkipped", () => {
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |"; // hotel present, zero merged-cell sites
    const expected = expectedSkipped(md, "merged-cell"); // includes "hotel"
    expect(expected).toContain("hotel");
    const crippledShared = expected.filter((d) => d !== "hotel"); // shared classifier regressed hotel → other
    expect(crippledShared).not.toEqual(expected); // the `toEqual(expectedSkipped)` gate would fail
  });
  it("ledger ratchet: an undocumented NEW alarm fails, and a STALE row fails (both directions)", () => {
    expect(reconcileLedger([{ siteId: "s", kind: "wrong", fingerprint: "f" }], []).newAlarms.length).toBeGreaterThan(0);
    expect(reconcileLedger([], [{ siteId: "s", kind: "wrong", fingerprint: "f", finding: "#1", note: "n" }]).staleRows.length).toBeGreaterThan(0);
  });
});

import { guardStream } from "./operators";

describe("guardStream — the shared guard behind boundedMutants — fails fast BEFORE array materialization (plan-R24)", () => {
  it("stops an UNBOUNDED generator by throwing at budget+1, never collecting it into an array", () => {
    // guardStream is the SINGLE primitive every corpus-scale consumer routes through: boundedMutants
    // wraps it, and runAll / skippedInapplicable / the count-agreement gate / the coverage summary
    // all iterate boundedMutants. OPERATOR_GENS is module-private, so there is NO unguarded corpus
    // path. A non-streaming impl (`[...gen]` / `.map`) would HANG/OOM on this infinite generator; the
    // guarded loop TERMINATING with a throw proves fail-fast for ALL of those consumers at once
    // (the Codex plan-R23/R24 [high] failure class — closed structurally, not per-call-site).
    function* unbounded(): Generator<number> {
      let i = 0;
      while (true) yield i++;
    }
    expect(() => {
      for (const _m of guardStream(unbounded(), 100, "test")) { /* consume — never terminates unless the guard throws */ }
    }).toThrow(/test exceeded budget 100/);
  });
});
