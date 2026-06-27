import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTransportation, TRANSPORT_SCHEDULE_VOCAB } from "@/lib/parser/blocks/transport";
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

// ── v4 transport: TRANSPORTATION/Equipment Transporter header ─────────────────
describe("parseTransportation — v4 (2026-04-waldorf)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
  const t = parseTransportation(md, "v4");

  it("returns non-null", () => {
    expect(t).not.toBeNull();
  });

  it("driver_name is Carlos Pineda", () => {
    expect(t!.driver_name).toBe("Carlos Pineda");
  });

  it("driver_phone is 610-618-0111", () => {
    expect(t!.driver_phone).toBe("610-618-0111");
  });

  it("driver_email is canonicalized carlosmpdal@gmail.com", () => {
    expect(t!.driver_email).toBe("carlosmpdal@gmail.com");
  });

  it("vehicle contains Mercedes", () => {
    expect(t!.vehicle).toContain("Mercedes");
  });

  it("parking is non-null and has content", () => {
    expect(t!.parking).toBeTruthy();
  });

  it("schedule has at least 3 entries", () => {
    expect(t!.schedule.length).toBeGreaterThanOrEqual(3);
  });

  it("every schedule entry has assigned_names as array (never null/undefined)", () => {
    for (const entry of t!.schedule) {
      expect(Array.isArray(entry.assigned_names)).toBe(true);
      expect(entry.assigned_names).not.toBeNull();
      expect(entry.assigned_names).not.toBeUndefined();
    }
  });

  it("schedule has a Pick Up Warehouse entry", () => {
    const pickUp = t!.schedule.find((s) => /pick\s*up\s*warehouse/i.test(s.stage));
    expect(pickUp).toBeDefined();
  });

  it("schedule pick-up venue date is 2026-04-22", () => {
    const pickUpVenue = t!.schedule.find((s) => /pick\s*up\s*venue/i.test(s.stage));
    expect(pickUpVenue?.date).toBe("2026-04-22");
  });

  it("license_plate is XNPX89", () => {
    expect(t!.license_plate).toBe("XNPX89");
  });

  it("color is WHITE", () => {
    expect(t!.color).toBe("WHITE");
  });
});

// ── v4 transport: two-driver header (2026-05-fintech-forum) ───────────────────
describe("parseTransportation — v4 two drivers (2026-05-fintech)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", "utf8");
  const t = parseTransportation(md, "v4");

  it("returns non-null", () => {
    expect(t).not.toBeNull();
  });

  it("driver_name contains Tracy Edwards", () => {
    expect(t!.driver_name).toContain("Tracy Edwards");
  });

  it("driver_email is tedwards8033@gmail.com", () => {
    expect(t!.driver_email).toBe("tedwards8033@gmail.com");
  });

  it("every schedule entry has assigned_names array", () => {
    for (const entry of t!.schedule) {
      expect(Array.isArray(entry.assigned_names)).toBe(true);
    }
  });
});

// ── v2 transport: TRANSPORTATION | NAME | PHONE header ───────────────────────
describe("parseTransportation — v2 (2025-10-consultants-roundtable)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-consultants-roundtable.md", "utf8");
  const t = parseTransportation(md, "v2");

  it("returns non-null", () => {
    expect(t).not.toBeNull();
  });

  it("driver_name is Carlos Pineda", () => {
    expect(t!.driver_name).toBe("Carlos Pineda");
  });

  it("driver_phone is 610-618-0111", () => {
    expect(t!.driver_phone).toBe("610-618-0111");
  });

  it("driver_email is null (v2 has no email column)", () => {
    // v2 TRANSPORTATION block has no email column; driver_email should be null
    expect(t!.driver_email).toBeNull();
  });

  it("vehicle contains '16\\' Box Truck'", () => {
    expect(t!.vehicle).toContain("16'");
  });

  it("schedule has Pick Up Warehouse entry", () => {
    const entry = t!.schedule.find((s) => /pick\s*up\s*warehouse/i.test(s.stage));
    expect(entry).toBeDefined();
  });

  it("schedule Pick Up Warehouse has no date (TBD)", () => {
    const entry = t!.schedule.find((s) => /pick\s*up\s*warehouse/i.test(s.stage));
    // TBD values normalize to null date
    expect(entry).toBeDefined();
  });

  it("every schedule entry has assigned_names array (§6.7)", () => {
    for (const entry of t!.schedule) {
      expect(Array.isArray(entry.assigned_names)).toBe(true);
    }
  });

  it("assigned_names is [] for entries with no tagged names", () => {
    // v2 has no passengers column → all entries should have empty assigned_names
    for (const entry of t!.schedule) {
      expect(entry.assigned_names).toEqual([]);
    }
  });
});

// ── v2 transport: TRANSPORTATION | NAME | PHONE (2025-04) ─────────────────────
describe("parseTransportation — v2 (2025-04-asset-mgmt-cfo-coo)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
  const t = parseTransportation(md, "v2");

  it("returns non-null", () => {
    expect(t).not.toBeNull();
  });

  it("driver_name is Jeffrey Justice", () => {
    expect(t!.driver_name).toBe("Jeffrey Justice");
  });

  it("driver_phone is 760-473-8202", () => {
    expect(t!.driver_phone).toBe("760-473-8202");
  });

  it("vehicle contains 'Schnubby Van'", () => {
    expect(t!.vehicle).toContain("Schnubby");
  });

  it("schedule has Drop Off Venue entry", () => {
    const entry = t!.schedule.find((s) => /drop\s*off\s*venue/i.test(s.stage));
    expect(entry).toBeDefined();
  });

  it("schedule Drop Off Venue stage value", () => {
    const entry = t!.schedule.find((s) => /drop\s*off\s*venue/i.test(s.stage));
    expect(entry!.time).toBeNull(); // v2 style no time column
  });
});

// ── v1 transport: Driver | Name | Phone header ───────────────────────────────
describe("parseTransportation — v1 (2024-05-east-coast-family-office)", () => {
  const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  const t = parseTransportation(md, "v1");

  it("returns non-null", () => {
    expect(t).not.toBeNull();
  });

  it("driver_name is James Wells", () => {
    expect(t!.driver_name).toBe("James Wells");
  });

  it("driver_phone is 936-230-2279", () => {
    expect(t!.driver_phone).toBe("936-230-2279");
  });

  it("every schedule entry has assigned_names array", () => {
    for (const entry of t!.schedule) {
      expect(Array.isArray(entry.assigned_names)).toBe(true);
    }
  });
});

// ── Synthetic test: assigned_names populated from tagged column ───────────────
describe("parseTransportation — assigned_names synthetic fixture", () => {
  // Synthetic v4-style transport with Passengers column
  const syntheticMd = `| TRANSPORTATION/Equipment Transporter | TRANSPORTATION/Test Driver | PHONE/555-000-1234 | EMAIL/driver@example.com | LICENSE |
| :---: | :---: | :---: | :---: | :---: |
| Vehicle | Test Van | | | |
| | DATE | TIME | Passengers | |
| Pick Up Warehouse | 1/15/26 | 8:00 AM | Alice Smith, Bob Jones | |
| Load In at Venue | 1/16/26 | 9:00 AM | Carol White | |
| Drop Off Warehouse | 1/17/26 | 5:00 PM | | |
`;

  const t = parseTransportation(syntheticMd, "v4");

  it("returns non-null", () => {
    expect(t).not.toBeNull();
  });

  it("assigned_names for Pick Up Warehouse contains Alice Smith", () => {
    const entry = t!.schedule.find((s) => /pick\s*up\s*warehouse/i.test(s.stage));
    expect(entry?.assigned_names).toContain("Alice Smith");
  });

  it("assigned_names for Pick Up Warehouse contains Bob Jones", () => {
    const entry = t!.schedule.find((s) => /pick\s*up\s*warehouse/i.test(s.stage));
    expect(entry?.assigned_names).toContain("Bob Jones");
  });

  it("assigned_names for Load In at Venue contains Carol White", () => {
    const entry = t!.schedule.find((s) => /load\s*in/i.test(s.stage));
    expect(entry?.assigned_names).toContain("Carol White");
  });

  it("assigned_names for Drop Off Warehouse is [] (no names)", () => {
    const entry = t!.schedule.find((s) => /drop\s*off\s*warehouse/i.test(s.stage));
    expect(entry?.assigned_names).toEqual([]);
  });
});

// ── v4 transport block scoping (Codex round-6 finding) ───────────────────────
describe("parseTransportation — v4 block scoping (Codex round-6)", () => {
  it("2026-04 transport schedule does not contain COI/contacts/event-details rows", () => {
    const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
    const t = parseTransportation(md, "v4");
    expect(t).not.toBeNull();
    const stages = t!.schedule.map((s) => s.stage);
    expect(stages).not.toContain("COI");
    expect(stages).not.toContain("Proposal");
    expect(stages).not.toContain("Venue Contact Info");
    expect(stages).not.toContain("In House AV");
    expect(stages).not.toContain("EVENT DETAILS");
    expect(stages).not.toContain("Invoice");
    expect(stages).not.toContain("Invoice Notes");
    // Every remaining stage must look transport-y
    for (const s of stages) {
      expect(s).toMatch(/pick|drop|transport|travel|load|unload|rental|set|show|strike|day/i);
    }
  });

  it("2026-05 transport schedule does not contain non-transport rows", () => {
    const md = readFileSync("fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", "utf8");
    const t = parseTransportation(md, "v4");
    expect(t).not.toBeNull();
    const stages = t!.schedule.map((s) => s.stage);
    const blacklist = [
      "COI",
      "Proposal",
      "Venue Contact Info",
      "In House AV",
      "EVENT DETAILS",
      "Event Name:",
    ];
    for (const bad of blacklist) {
      expect(stages, `${bad} should not appear as a transport stage`).not.toContain(bad);
    }
    // Every remaining stage must look transport-y
    for (const s of stages) {
      expect(s).toMatch(/pick|drop|transport|travel|load|unload|rental|set|show|strike|day/i);
    }
  });

  it("synthetic fixture: terminator label stops schedule collection", () => {
    const md = `| TRANSPORTATION/Equipment Transporter | TRANSPORTATION/Test Driver | PHONE/555-000-1234 | EMAIL/driver@test.com | LICENSE |
| :---: | :---: | :---: | :---: | :---: |
| Vehicle | Test Van | | | |
| | DATE | TIME | | |
| Pick Up Warehouse | 1/15/26 | 8:00 AM | | |
| Drop Off Venue | 1/16/26 | 5:00 PM | | |
| COI | SENT | | | |
| Proposal | SENT | | | |
| Venue Contact Info | Some Contact | | | |
`;
    const t = parseTransportation(md, "v4");
    expect(t).not.toBeNull();
    const stages = t!.schedule.map((s) => s.stage);
    expect(stages).toContain("Pick Up Warehouse");
    expect(stages).toContain("Drop Off Venue");
    expect(stages).not.toContain("COI");
    expect(stages).not.toContain("Proposal");
    expect(stages).not.toContain("Venue Contact Info");
  });
});

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseTransportation — corpus coverage", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} returns TransportationRow|null, schedule entries have assigned_names[]`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const t = parseTransportation(md, version ?? "v2");
      if (t !== null) {
        expect(typeof t.driver_name === "string" || t.driver_name === null).toBe(true);
        expect(Array.isArray(t.schedule)).toBe(true);
        for (const entry of t.schedule) {
          expect(Array.isArray(entry.assigned_names)).toBe(true);
          expect(entry.assigned_names).not.toBeNull();
          expect(entry.assigned_names).not.toBeUndefined();
        }
        // email canonicalization: if email is present, must be lowercase
        if (t.driver_email !== null) {
          expect(t.driver_email).toBe(t.driver_email.toLowerCase());
        }
      }
    });
  }
});

describe("parseTransportation — zero-width strip at the shared clean() boundary", () => {
  it("parking field carries no zero-width characters", () => {
    // exporter-xlsx fintech's Parking cell is the Holiday Inn address peppered with
    // ZWNJ (verified at fixtures/shows/exporter-xlsx/fintech.md:67). After the shared
    // clean() strip, the stored value must be invisible-char-free.
    const md = readFileSync("fixtures/shows/exporter-xlsx/fintech.md", "utf8");
    const t = parseTransportation(md, "v4");
    expect(t?.parking).toBeTruthy(); // the cell does parse to a value
    expect(/[\u200B-\u200D\uFEFF]/.test(t!.parking!)).toBe(false);
  });
});

describe("parseTransportation \u2014 yearless date inference (drop hard-coded /25)", () => {
  const v2Block = (dateCell: string, datesLine?: string) =>
    [
      ...(datesLine ? [datesLine, ""] : []),
      "| TRANSPORTATION | NAME | PHONE |",
      "| :---: | :---: | :---: |",
      `| Pick Up Venue | ${dateCell} |`,
    ].join("\n");
  const pickUp = (t: ReturnType<typeof parseTransportation>) =>
    t!.schedule.find((s) => /pick up venue/i.test(s.stage));

  it("yearless transport date infers the show year, not a hard-coded 2025", () => {
    const SHOW_YEAR = "2026"; // single source of truth for this fixture
    const yy = SHOW_YEAR.slice(2);
    const t = parseTransportation(
      v2Block("10/6 @ 12:00 PM", `| DATES | 6/24/${yy} - 6/26/${yy} |`),
      "v2",
    );
    // The parsed date's year must be the show year, never 2025 (the old /25 bug).
    expect(pickUp(t)?.date).toMatch(new RegExp(`^${SHOW_YEAR}-`));
    expect(pickUp(t)?.date).not.toBe("2025-10-06");
  });

  it("yearless transport date with no inferable show year \u2192 exactly null (never a hard-coded era)", () => {
    const t = parseTransportation(v2Block("10/6 @ 12:00 PM"), "v2");
    // No DATES \u2192 no contextYear \u2192 the date is EXACTLY null, not a guessed 2025 nor any
    // other wrong value (a bare not-2025 check would be too weak).
    expect(pickUp(t)?.date).toBeNull();
  });

  it("transport date with an explicit year is preserved (context does not override)", () => {
    const t = parseTransportation(
      v2Block("10/6/24 @ 12:00 PM", "| DATES | 6/24/26 - 6/26/26 |"),
      "v2",
    );
    expect(pickUp(t)?.date).toBe("2024-10-06"); // explicit /24 wins over the 2026 context
  });
});

// ── PR-D2: fuzzy schedule-label recovery (v2) ────────────────────────────────
// Minimal v2 TRANSPORTATION block (header | TRANSPORTATION | NAME | PHONE |) from rows.
function v2Block(rows: string[]): string {
  return (
    [
      "| TRANSPORTATION | NAME | PHONE |",
      "| Driver | Carlos Pineda | 610-618-0111 |",
      ...rows,
    ].join("\n") + "\n"
  );
}
const FLA = (agg: ReturnType<typeof newAggregator>) =>
  agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");

describe("parseTransportation — v2 fuzzy schedule-label recovery (PR-D2)", () => {
  it("recovers a misspelled schedule label and warns once (kind=transportation, raw stage kept)", () => {
    const agg = newAggregator();
    const t = parseTransportation(
      v2Block(["| Pick Up Warehous | 10/6 @ TBD |"]),
      "v2",
      undefined,
      agg,
    );
    const entry = t!.schedule.find((s) => s.stage === "Pick Up Warehous");
    expect(entry).toBeDefined(); // recovered with the operator's RAW label
    const warns = FLA(agg);
    expect(warns).toHaveLength(1);
    expect(warns[0]!.severity).toBe("warn");
    expect(warns[0]!.blockRef).toEqual({ kind: "transportation" });
    expect(warns[0]!.rawSnippet).toBe("Pick Up Warehous");
  });

  it("exact schedule label still routes unchanged, no warning", () => {
    const agg = newAggregator();
    const t = parseTransportation(
      v2Block(["| Pick Up Warehouse | 10/6 @ TBD |"]),
      "v2",
      undefined,
      agg,
    );
    expect(t!.schedule.some((s) => /pick up warehouse/i.test(s.stage))).toBe(true);
    expect(FLA(agg)).toHaveLength(0);
  });

  it("a genuinely-unrelated label is NOT recognized as a schedule row, no warning", () => {
    const agg = newAggregator();
    const t = parseTransportation(
      v2Block(["| Catering Notes | Lunch at noon |"]),
      "v2",
      undefined,
      agg,
    );
    expect(t!.schedule).toHaveLength(0);
    expect(FLA(agg)).toHaveLength(0);
  });

  it("a metadata-label typo (Vehicl) is NOT pulled into the schedule, no warning", () => {
    const agg = newAggregator();
    const t = parseTransportation(v2Block(["| Vehicl | 16' Box Truck |"]), "v2", undefined, agg);
    expect(t!.schedule).toHaveLength(0);
    expect(FLA(agg)).toHaveLength(0);
  });

  it("a too-short token is not fuzz-recognized", () => {
    const agg = newAggregator();
    const t = parseTransportation(v2Block(["| Pick | x |"]), "v2", undefined, agg);
    expect(t!.schedule).toHaveLength(0);
    expect(FLA(agg)).toHaveLength(0);
  });
});

// Property test over the gate (the "typos beyond the example sheets" core). The schedule vocab
// is all alphabetic+space, so generator neighbors (ALPHA = A–Z + space) are well-formed.
describe("parseTransportation — schedule-label gate corrects unseen typos (PR-D2)", () => {
  it("corrects unambiguous single-edit typos of every schedule label back to that label", () => {
    const opts = { minLen: 5, tieAbort: true } as const;
    expect(TRANSPORT_SCHEDULE_VOCAB.length).toBe(9);
    for (const member of TRANSPORT_SCHEDULE_VOCAB) {
      for (const typo of unambiguousTypos(member, TRANSPORT_SCHEDULE_VOCAB, { minLen: 5 })) {
        const fix = gatedVocabCorrect(typo, TRANSPORT_SCHEDULE_VOCAB, opts);
        expect(fix?.corrected, `${typo} → ${member}`).toBe(true);
        expect(fix?.match, `${typo} → ${member}`).toBe(member);
      }
    }
  }, 30000); // generous timeout — comprehensive generator sweep (PR-D1 CI-shard-timeout lesson)
});
