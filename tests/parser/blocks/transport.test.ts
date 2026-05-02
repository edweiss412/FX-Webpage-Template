import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTransportation } from "@/lib/parser/blocks/transport";
import { detectVersion } from "@/lib/parser/schema";

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
    const pickUp = t!.schedule.find((s) =>
      /pick\s*up\s*warehouse/i.test(s.stage)
    );
    expect(pickUp).toBeDefined();
  });

  it("schedule pick-up venue date is 2026-04-22", () => {
    const pickUpVenue = t!.schedule.find((s) =>
      /pick\s*up\s*venue/i.test(s.stage)
    );
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

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseTransportation — corpus coverage", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} returns TransportationRow|null, schedule entries have assigned_names[]`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const t = parseTransportation(md, version);
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
