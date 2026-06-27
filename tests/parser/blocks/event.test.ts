import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseEventDetails, EVENT_LABEL_VOCAB } from "@/lib/parser/blocks/event";
import { detectVersion } from "@/lib/parser/schema";
import { newAggregator } from "@/lib/parser/warnings";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { unambiguousTypos } from "../_typoGenerator";

const ALL_FIXTURES = [
  "fixtures/shows/raw/2024-05-east-coast-family-office.md",
  "fixtures/shows/raw/2025-03-dci-rpas-central.md",
  "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
  "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
  "fixtures/shows/raw/2025-06-ria-investment-forum.md",
  "fixtures/shows/raw/2025-10-consultants-roundtable.md",
  "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md",
  "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md",
  "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md",
  "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md",
] as const;

// ── v4 event details (2026-04-waldorf) ────────────────────────────────────────
// Fixture lines 35-52: EVENT DETAILS block with Keynote Requirements, Virtual Audience, Power, Internet, etc.

describe("parseEventDetails — v4 waldorf (2026-04)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
  const ed = parseEventDetails(md, "v4");

  it("returns a non-empty record", () => {
    expect(Object.keys(ed).length).toBeGreaterThan(0);
  });

  it("internet is 'Wifi' (raw string preserved)", () => {
    expect(ed["internet"] ?? ed["Internet"]).toBe("Wifi");
  });

  it("power contains 'DISTRO' (free-text preserved)", () => {
    const power = ed["power"] ?? ed["Power"];
    expect(power).toContain("DISTRO");
  });

  it("virtual_audience is 'N/A'", () => {
    const va = ed["virtual_audience"] ?? ed["Virtual Audience"] ?? ed["virtual audience"];
    expect(va).toBe("N/A");
  });

  it("opening_reel is 'MAYBE - LOOP VIDEO'", () => {
    const reel = ed["opening_reel"] ?? ed["Opening Reel"];
    expect(reel).toBe("MAYBE - LOOP VIDEO");
  });

  it("keynote_requirements is 'TBD'", () => {
    const kr = ed["keynote_requirements"] ?? ed["Keynote Requirements"];
    expect(kr).toBe("TBD");
  });
});

// ── v4 event details (2026-03) ────────────────────────────────────────────────
describe("parseEventDetails — v4 (2026-03-rpas-central)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
  const ed = parseEventDetails(md, "v4");

  it("returns non-empty record", () => {
    expect(Object.keys(ed).length).toBeGreaterThan(0);
  });

  it("internet contains 'Wifi from Encore'", () => {
    const internet = ed["internet"] ?? ed["Internet"];
    expect(internet).toContain("Wifi from Encore");
  });

  it("power contains 'Power Drops'", () => {
    const power = ed["power"] ?? ed["Power"];
    expect(power).toContain("Power Drops");
  });
});

// ── v2 event details (2025-10-trading-summit) ─────────────────────────────────
describe("parseEventDetails — v2 (2025-10-trading-summit)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
  const ed = parseEventDetails(md, "v2");

  it("returns non-empty record", () => {
    expect(Object.keys(ed).length).toBeGreaterThan(0);
  });

  it("virtual_audience is 'YES'", () => {
    const va = ed["virtual_audience"] ?? ed["Virtual Audience"];
    expect(va).toBe("YES");
  });

  it("internet contains 'Hardline'", () => {
    const internet = ed["internet"] ?? ed["Internet"];
    expect(internet).toContain("Hardline");
  });

  it("power is 'Wall Outlets'", () => {
    const power = ed["power"] ?? ed["Power"];
    expect(power).toBe("Wall Outlets");
  });
});

// ── v1 event details (2024-05-east-coast-family-office) ───────────────────────
describe("parseEventDetails — v1 DETAILS/Room Diagram (2024-05)", () => {
  const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  const ed = parseEventDetails(md, "v1");

  it("returns non-empty record", () => {
    expect(Object.keys(ed).length).toBeGreaterThan(0);
  });

  it("internet contains '20mb'", () => {
    const internet = ed["internet"] ?? ed["Internet"];
    expect(internet).toContain("20mb");
  });

  it("power contains 'circuits'", () => {
    const power = ed["power"] ?? ed["Power"];
    expect(power).toContain("circuits");
  });
});

// ── v2 DETAILS block (2025-04-asset-mgmt-cfo-coo) — only labels, no values ───
describe("parseEventDetails — v2 labels-only DETAILS block (2025-04)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
  const ed = parseEventDetails(md, "v2");

  it("returns a record (may be empty for label-only blocks)", () => {
    expect(typeof ed).toBe("object");
    expect(ed).not.toBeNull();
  });
});

// ── Dress-code canonicalization + sentinel-aware precedence (M4-D1) ───────────
// The dress-code probe used to live stringly-typed in the consumer
// (TodaySection iterated ["dress_code","dress code","dress","attire"] and
// skipped sentinels). M4-D1 routes that authority through the parser's
// CANONICAL_KEY_MAP: every dress label collapses to the single `dress_code`
// key, and a sentinel value (''/TBD/N/A/TBA) must yield to a real value for
// the same canonical key REGARDLESS of row order (write-time precedence).
describe("parseEventDetails — dress-code canonicalization (M4-D1)", () => {
  // Minimal v4 EVENT DETAILS block builder. `rows` are [label, value] pairs.
  function ed(rows: ReadonlyArray<readonly [string, string]>): Record<string, string> {
    const body = rows.map(([k, v]) => `| ${k} | ${v} |`).join("\n");
    const md = `| EVENT DETAILS | |\n${body}\n`;
    return parseEventDetails(md, "v4");
  }

  it("`Attire` label collapses to the `dress_code` key", () => {
    const r = ed([["Attire", "Black tie"]]);
    expect(r["dress_code"]).toBe("Black tie");
    expect(r["attire"]).toBeUndefined();
  });

  it("`Dress Code` label collapses to `dress_code`", () => {
    const r = ed([["Dress Code", "Business casual"]]);
    expect(r["dress_code"]).toBe("Business casual");
    expect(r["dress code"]).toBeUndefined();
  });

  it("`Dress` label collapses to `dress_code`", () => {
    const r = ed([["Dress", "Cocktail"]]);
    expect(r["dress_code"]).toBe("Cocktail");
    expect(r["dress"]).toBeUndefined();
  });

  it("a bare `dress_code` label round-trips to itself", () => {
    const r = ed([["dress_code", "Smart casual"]]);
    expect(r["dress_code"]).toBe("Smart casual");
  });

  it("sentinel `Dress Code:N/A` THEN real `Attire:Black tie` → dress_code is the real value", () => {
    const r = ed([
      ["Dress Code", "N/A"],
      ["Attire", "Black tie"],
    ]);
    expect(r["dress_code"]).toBe("Black tie");
  });

  it("real `Attire:Black tie` THEN sentinel `Dress Code:N/A` → real value is NOT clobbered (write-time precedence)", () => {
    // The naive last-write-wins this M4-D1 change replaces would FAIL here:
    // the later sentinel `dress_code:N/A` would overwrite the real attire.
    const r = ed([
      ["Attire", "Black tie"],
      ["Dress Code", "N/A"],
    ]);
    expect(r["dress_code"]).toBe("Black tie");
  });

  it("two real values for the dress family keep a real value (last real wins by row order)", () => {
    const r = ed([
      ["Dress Code", "Business casual"],
      ["Attire", "Black tie"],
    ]);
    expect(r["dress_code"]).toBe("Black tie");
  });

  it("all-sentinel dress family yields a sentinel (the consumer still hides it)", () => {
    const r = ed([
      ["Dress Code", "TBD"],
      ["Attire", "N/A"],
    ]);
    // Some sentinel survives; downstream shouldHideGenericOptional hides it.
    expect(["TBD", "N/A"]).toContain(r["dress_code"]);
  });

  it("dress-family precedence does not regress other fields' last-write-wins", () => {
    // A non-dress key keeps the plain write semantics (this exercises that the
    // precedence branch is scoped to sentinel-vs-real, not a blanket no-overwrite).
    const r = ed([
      ["Internet", "Wifi"],
      ["Attire", "Black tie"],
    ]);
    expect(r["internet"]).toBe("Wifi");
    expect(r["dress_code"]).toBe("Black tie");
  });
});

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseEventDetails — corpus coverage", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} returns Record<string,string>`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const ed = parseEventDetails(md, version ?? "v2");
      expect(typeof ed).toBe("object");
      expect(ed).not.toBeNull();
      for (const [k, v] of Object.entries(ed)) {
        expect(typeof k).toBe("string");
        expect(typeof v).toBe("string");
      }
    });
  }
});

// ── PR-D1: EVENT DETAILS fuzzy field-label recovery ──────────────────────────
// Helper: build a minimal EVENT DETAILS block from label/value rows.
function evBlock(rows: string[]): string {
  return ["| EVENT DETAILS | |", ...rows].join("\n") + "\n| CREW | |\n";
}

describe("parseEventDetails — fuzzy field-label recovery (PR-D1)", () => {
  it("recovers a misspelled label and warns once (kind=details)", () => {
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Stage Sze | 20x16 |"]), "v4", agg);
    expect(ed.stage_size).toBe("20x16");
    const warns = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.severity).toBe("warn");
    expect(warns[0]!.blockRef).toEqual({ kind: "details" });
    expect(warns[0]!.rawSnippet).toBe("Stage Sze");
  });

  it("exact-wins: an exact label beats a typo'd sibling for the same canonical, either order — typo value dropped, no warn", () => {
    // dress family: "attire"/"dress code" both → dress_code. Exact must win regardless of
    // order; the suppressed typo's value is DROPPED (not kept under a fallback key) and emits
    // no warning (contract rules 1+3). "attir" must NOT appear as a phantom field.
    const aggA = newAggregator();
    const edA = parseEventDetails(
      evBlock(["| Attir | WRONG |", "| Dress Code | Business Casual |"]),
      "v4",
      aggA,
    );
    expect(edA.dress_code).toBe("Business Casual");
    expect(edA.attir).toBeUndefined();
    expect(aggA.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);

    const aggB = newAggregator();
    const edB = parseEventDetails(
      evBlock(["| Dress Code | Business Casual |", "| Attir | WRONG |"]),
      "v4",
      aggB,
    );
    expect(edB.dress_code).toBe("Business Casual");
    expect(edB.attir).toBeUndefined();
    expect(aggB.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("empty/sentinel exact does not claim: a real typo sibling still recovers and warns (no data loss)", () => {
    // The exact "Dress Code" row is EMPTY, so it does not claim dress_code; the typo "Attir"
    // carries a real value and recovers into dress_code (contract rule 1, empty-exact clause).
    const aggEmpty = newAggregator();
    const edEmpty = parseEventDetails(
      evBlock(["| Dress Code | |", "| Attir | Casual |"]),
      "v4",
      aggEmpty,
    );
    expect(edEmpty.dress_code).toBe("Casual");
    expect(aggEmpty.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(1);

    // Sentinel exact ("TBD") likewise does not block a real fuzzy recovery; writeField lets the
    // real value override the sentinel.
    const aggSentinel = newAggregator();
    const edSentinel = parseEventDetails(
      evBlock(["| Dress Code | TBD |", "| Attir | Casual |"]),
      "v4",
      aggSentinel,
    );
    expect(edSentinel.dress_code).toBe("Casual");
    expect(aggSentinel.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(
      1,
    );
  });

  it("multiple fuzzy siblings (no exact): last-write-wins, single warn naming the winning label", () => {
    // "Stage Sze" and "Stge Size" both → stage_size, no exact row. Last value wins (matching
    // event's known-label last-write-wins), and exactly one warning fires (contract rule 2).
    const agg = newAggregator();
    const ed = parseEventDetails(
      evBlock(["| Stage Sze | 20x16 |", "| Stge Size | 30x20 |"]),
      "v4",
      agg,
    );
    expect(ed.stage_size).toBe("30x20");
    const warns = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.rawSnippet).toBe("Stge Size");
  });

  it("round-trips a punctuated member: a typo of a slash/paren label maps back to its canonical", () => {
    // Guards the CANONICAL_KEY_MAP[match.toLowerCase()] back-lookup for members excluded from
    // the alphabetic-only property test (Step 5). "Backdrop / Scenicc" → "backdrop / scenic" → scenic.
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Backdrop / Scenicc | white cyc |"]), "v4", agg);
    expect(ed.scenic).toBe("white cyc");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(1);
  });

  it("exact spellings still route unchanged, no fuzzy warning", () => {
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Diagrams | yes |", "| LED | 4 |"]), "v4", agg);
    expect(ed.diagrams).toBe("yes");
    expect(ed.led).toBe("4");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("genuinely-unknown label is preserved via the fallback key (no fuzzy, no warn)", () => {
    // "Catering" is not near any event label → stays under its normalized fallback key.
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Catering | Lunch |"]), "v4", agg);
    expect(ed.catering).toBe("Lunch");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("below-minLen: a short typo input (<5) is not corrected, falls through to fallback", () => {
    // "Powr" (4 chars) would be distance-1 from POWER but minLen:5 blocks it.
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Powr | x |"]), "v4", agg);
    expect(ed.power).toBeUndefined();
    expect(ed.powr).toBe("x");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("tie-abort: a typo equidistant from two members is not corrected", () => {
    // "goosnecks" is distance-1 from both "goosneck" and "goosenecks" → no correction.
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| goosnecks | brass |"]), "v4", agg);
    expect(ed.gooseneck).toBeUndefined();
    expect(ed.goosnecks).toBe("brass");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("VALUE-guard: a typo in the cell VALUE (not the label) is never fuzzed", () => {
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Catering | Stage Sze |"]), "v4", agg);
    expect(ed.stage_size).toBeUndefined();
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });
});

// Property test over the gate directly (the "typos beyond the example sheets" core). Scope to
// purely alphabetic+space members so generator neighbors (ALPHA = A–Z + space) are well-formed;
// punctuated members (BACKDROP / SCENIC, FONTS (II ONLY), DRESS_CODE) are covered by the
// explicit round-trip unit test above.
describe("parseEventDetails — gate corrects unseen typos (PR-D1)", () => {
  // Generous explicit timeout: this is a comprehensive sweep over the FULL event vocab (the
  // largest fuzzable vocab in the milestone — ~31 members incl. long multi-word labels), so it
  // is heavier than the small PR-A/B vocab sweeps and exceeds the default 5s under CI shard load.
  it("corrects unambiguous single-edit typos of every clean member back to that member", () => {
    const opts = { minLen: 5, tieAbort: true } as const;
    const clean = EVENT_LABEL_VOCAB.filter((m) => /^[A-Z ]+$/.test(m));
    expect(clean.length).toBeGreaterThan(8);
    for (const member of clean) {
      for (const typo of unambiguousTypos(member, EVENT_LABEL_VOCAB, { minLen: 5 })) {
        const fix = gatedVocabCorrect(typo, EVENT_LABEL_VOCAB, opts);
        expect(fix?.corrected, `${typo} → ${member}`).toBe(true);
        expect(fix?.match, `${typo} → ${member}`).toBe(member);
      }
    }
  }, 30000);
});
