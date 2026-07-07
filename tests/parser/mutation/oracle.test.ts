// tests/parser/mutation/oracle.test.ts
import { describe, it, expect } from "vitest";
import { capture, verdict, fingerprint, signalRows } from "./oracle";
import type { ParsedSheet } from "@/lib/parser/types";

// Minimal ParsedSheet builder for oracle unit tests (only the fields the oracle reads).
const base = (over: Partial<ParsedSheet> = {}): ParsedSheet =>
  ({
    show: {} as never,
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...over,
  }) as ParsedSheet;

describe("verdict (corrupting bucket, Codex R5 SILENT_SIGNAL_LOSS)", () => {
  it("payload+signals identical → ABSORBED", () => {
    expect(verdict(base(), base())).toBe("ABSORBED");
  });
  it("payload changed, no new signal → SILENT_WRONG", () => {
    expect(verdict(base(), base({ crewMembers: [{ name: "X" } as never] }))).toBe("SILENT_WRONG");
  });
  it("payload changed + new warning → SIGNALED", () => {
    const m = base({
      crewMembers: [{ name: "X" } as never],
      warnings: [{ severity: "warn", code: "W", message: "m" }],
    });
    expect(verdict(base(), m)).toBe("SIGNALED");
  });
  it("payload equal, a baseline warning REMOVED (no compensating signal) → SILENT_SIGNAL_LOSS", () => {
    const b = base({ warnings: [{ severity: "warn", code: "W", message: "m" }] });
    expect(verdict(b, base())).toBe("SILENT_SIGNAL_LOSS");
  });
  it("payload equal, a warning ADDED → SIGNALED", () => {
    const m = base({ warnings: [{ severity: "warn", code: "W", message: "m" }] });
    expect(verdict(base(), m)).toBe("SIGNALED");
  });
  it("undefined ≠ null: an optional signal field flipping undefined→null is NOT absorbed (plan-R5)", () => {
    const wU = { severity: "warn" as const, code: "W", message: "m" }; // sourceCell absent (undefined)
    const wN = { severity: "warn" as const, code: "W", message: "m", sourceCell: null }; // sourceCell null
    // same code → newSignalFired false; full signalEq must see the difference → SILENT_SIGNAL_LOSS
    expect(verdict(base({ warnings: [wN] }), base({ warnings: [wU] }))).toBe("SILENT_SIGNAL_LOSS");
  });
  it("toEqual parity: {a: undefined} is equal to {} (no false alarm)", () => {
    // sourceCell:undefined is the POINT of this test (undefined-valued key vs absent key);
    // cast past exactOptionalPropertyTypes, which forbids the literal but not the runtime shape.
    const wA = {
      severity: "warn" as const,
      code: "W",
      message: "m",
      sourceCell: undefined,
    } as unknown as ParsedSheet["warnings"][number];
    const wB = { severity: "warn" as const, code: "W", message: "m" };
    expect(verdict(base({ warnings: [wA] }), base({ warnings: [wB] }))).toBe("ABSORBED");
  });
});

describe("fingerprint signal component — redaction boundary is EXECUTABLE (Codex R26)", () => {
  it("keeps STRUCTURAL fields verbatim and DIGESTS pii/free-text (never raw in the ledger)", () => {
    const w = {
      severity: "warn" as const,
      code: "MI_7",
      message: "secret@example.com",
      rawSnippet: "raw pii row",
      blockRef: { kind: "crew", index: 2 },
    };
    const [row] = signalRows(base({ warnings: [w] }));
    // structural fields present VERBATIM (a reviewer can see WHY a ledger row moved):
    expect(row).toContain(`"code":"MI_7"`);
    expect(row).toContain(`"severity":"warn"`);
    expect(row).toContain(`"kind":"crew"`);
    expect(row).toContain(`"index":2`);
    // PII / free-text NOT present raw (digested):
    expect(row).not.toContain("secret@example.com");
    expect(row).not.toContain("raw pii row");
  });
  it("EXHAUSTIVE: a NEW enumerable signal field moves the fingerprint (redaction ⊇ signalEq, Codex R3)", () => {
    // The prior redactors whitelisted today's fields, so a parser change that added another
    // enumerable warning field would move signalEq (full deep-equal) but NOT the fingerprint,
    // letting an in-ledger hole drift undetected. redactNode keeps EVERY key, so any field
    // signalEq compares also reaches the fingerprint.
    const b = base();
    const wBase = { severity: "warn" as const, code: "W", message: "m" };
    const wExtra = {
      ...wBase,
      hint: "future-parser-field",
    } as unknown as ParsedSheet["warnings"][number];
    // signalEq sees the extra field (verdict is not ABSORBED)...
    expect(verdict(base({ warnings: [wBase] }), base({ warnings: [wExtra] }))).not.toBe("ABSORBED");
    // ...and the fingerprint sees it too (the whole point of exhaustive redaction).
    expect(fingerprint(b, base({ warnings: [wExtra] }))).not.toBe(
      fingerprint(b, base({ warnings: [wBase] })),
    );
    // a NEW field that LOOKS like PII is digested, not stored raw, but STILL moves the fingerprint
    const wPii = {
      ...wBase,
      contact: "person@example.com",
    } as unknown as ParsedSheet["warnings"][number];
    const [rowPii] = signalRows(base({ warnings: [wPii] }));
    expect(rowPii).not.toContain("person@example.com"); // redacted despite the unknown key
    expect(fingerprint(b, base({ warnings: [wPii] }))).not.toBe(
      fingerprint(b, base({ warnings: [wBase] })),
    );
  });
  it("a code (structural) change and a message (pii) change BOTH move the fingerprint", () => {
    const b = base();
    const w = (over: object) =>
      base({ warnings: [{ severity: "warn" as const, code: "W", message: "m", ...over }] });
    expect(fingerprint(b, w({ code: "W2" }))).not.toBe(fingerprint(b, w({}))); // structural
    expect(fingerprint(b, w({ message: "n" }))).not.toBe(fingerprint(b, w({}))); // pii
  });
  it("distinguishes sourceCell ABSENT vs NULL vs value — matches signalEq's 3-state (R28)", () => {
    const b = base();
    const absent = base({ warnings: [{ severity: "warn", code: "W", message: "m" }] });
    const asNull = base({
      warnings: [{ severity: "warn", code: "W", message: "m", sourceCell: null }],
    });
    const asVal = base({
      warnings: [
        {
          severity: "warn",
          code: "W",
          message: "m",
          sourceCell: { tab: "DATES", a1: "B2" } as never,
        },
      ],
    });
    // premise: signalEq (toEqual) treats these three as distinct → a change among them is signal drift
    expect(verdict(absent, asNull)).not.toBe("ABSORBED"); // a null anchor gained/lost is NOT invisible
    // fingerprint must move for each pair (else a ledgered SILENT_SIGNAL_LOSS could drift undetected)
    const [fa, fn, fv] = [fingerprint(b, absent), fingerprint(b, asNull), fingerprint(b, asVal)];
    expect(new Set([fa, fn, fv]).size).toBe(3);
  });
});

describe("fingerprint (Codex R7/R8/R15/R16)", () => {
  it("changes when the same payload path takes a different value (R8)", () => {
    const b = base({ crewMembers: [{ name: "A" } as never] });
    const m1 = base({ crewMembers: [{ name: "B" } as never] });
    const m2 = base({ crewMembers: [{ name: "C" } as never] });
    expect(fingerprint(b, m1)).not.toBe(fingerprint(b, m2));
  });
  it("changes when a same-block|key raw_unrecognized VALUE drifts with payload equal (R9/R15)", () => {
    const b = base({ raw_unrecognized: [{ block: "X", key: "k", value: "v1" }] });
    const m1 = base({ raw_unrecognized: [{ block: "X", key: "k", value: "v2" }] });
    expect(fingerprint(b, base())).not.toBe(fingerprint(b, m1));
  });
  it("changes when two warnings are REORDERED (order-sensitive, R16)", () => {
    const w = (c: string) => ({ severity: "warn" as const, code: c, message: c });
    const b = base();
    const m1 = base({ warnings: [w("A"), w("B")] });
    const m2 = base({ warnings: [w("B"), w("A")] });
    expect(fingerprint(b, m1)).not.toBe(fingerprint(b, m2));
  });
  it("changes on empty-container payload drift [] -> [{}] and {} -> [] (plan-R4)", () => {
    const b = base({ rooms: [] });
    expect(fingerprint(b, base({ rooms: [{} as never] }))).not.toBe(
      fingerprint(b, base({ rooms: [] })),
    );
    // adding an empty nested container is visible
    const b2 = base({ contacts: [] });
    expect(fingerprint(b2, base({ contacts: [{} as never] }))).not.toBe(fingerprint(b2, b2));
  });
  it("is sensitive to EVERY warning anchoring field: message/rawSnippet/blockRef/sourceCell (plan-R9)", () => {
    const b = base();
    const mk = (over: Partial<import("@/lib/parser/types").ParseWarning>) =>
      base({ warnings: [{ severity: "warn", code: "W", message: "m", ...over }] });
    const baseFp = fingerprint(b, mk({}));
    const variants = {
      message: mk({ message: "different" }),
      rawSnippet: mk({ rawSnippet: "snip" }),
      blockRef: mk({ blockRef: { kind: "crew" } }),
      sourceCell: mk({ sourceCell: { tab: "DATES", a1: "B2" } as never }),
    };
    const fps = Object.values(variants).map((v) => fingerprint(b, v));
    for (const [name, v] of Object.entries(variants)) {
      expect(fingerprint(b, v), `warning ${name} must move the fingerprint`).not.toBe(baseFp);
    }
    expect(new Set(fps).size, "each warning field is independently distinguishable").toBe(
      fps.length,
    );
  });
  it("is sensitive to a hardError blockRef change (plan-R9)", () => {
    const b = base();
    const m1 = base({ hardErrors: [{ code: "E", message: "m" }] });
    const m2 = base({ hardErrors: [{ code: "E", message: "m", blockRef: { kind: "hotel" } }] });
    expect(fingerprint(b, m1)).not.toBe(fingerprint(b, m2));
  });
});

describe("capture", () => {
  it("parses a real fixture and returns a ParsedSheet", () => {
    const cap = capture("| CREW | NAME |\n|  | Doug |", "x.md");
    expect(cap).toHaveProperty("warnings");
    expect(cap).toHaveProperty("crewMembers");
  });
});
