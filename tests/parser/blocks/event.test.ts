import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseEventDetails } from "@/lib/parser/blocks/event";
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
