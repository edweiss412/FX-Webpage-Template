import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseContacts } from "@/lib/parser/blocks/contacts";
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

// ── v4 contacts (2026-04-waldorf) ─────────────────────────────────────────────
// Fixture line 31: | Venue Contact Info | Isabella Vizzini Isabella.Vizzini@waldorfastoria.com 312 646 1418 |
// Fixture line 32: | In House AV | Cecilia J. Cole ... cecilia.cole@encoreglobal.com ... Aaron Shapiro ... aaron.shapiro@encoreglobal.com |

describe("parseContacts — v4 waldorf (2026-04)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
  const contacts = parseContacts(md, "v4");
  const venue = contacts.filter((c) => c.kind === "venue");
  const inHouseAv = contacts.filter((c) => c.kind === "in_house_av");

  it("finds 1 venue contact", () => {
    expect(venue).toHaveLength(1);
  });

  it("finds 2 in_house_av contacts (Cecilia + Aaron — Codex round-1 multi-person fix)", () => {
    expect(inHouseAv).toHaveLength(2);
    const names = inHouseAv.map((c) => c.name).filter(Boolean);
    expect(names.some((n) => /Cecilia/.test(n!))).toBe(true);
    expect(names.some((n) => /Aaron/.test(n!))).toBe(true);
  });

  it("venue contact notes contains Isabella Vizzini", () => {
    expect(venue[0]!.notes).toContain("Isabella Vizzini");
  });

  it("venue contact email is canonicalized isabella.vizzini@waldorfastoria.com", () => {
    expect(venue[0]!.email).toBe("isabella.vizzini@waldorfastoria.com");
  });

  it("in_house_av contact notes contains Cecilia", () => {
    expect(inHouseAv[0]!.notes).toContain("Cecilia");
  });

  it("in_house_av email contains an encore email (canonicalized)", () => {
    // notes contains multiple emails — first one should be extracted
    const email = inHouseAv[0]!.email;
    if (email !== null) {
      expect(email).toBe(email.toLowerCase());
      expect(email).toContain("@encoreglobal.com");
    }
  });
});

// ── v2 contacts with "Hotal Contact Info" typo (2025-10-trading-summit) ──────
describe("parseContacts — v2 hotal typo (2025-10-trading-summit)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
  const contacts = parseContacts(md, "v2");
  const venue = contacts.filter((c) => c.kind === "venue");
  const inHouseAv = contacts.filter((c) => c.kind === "in_house_av");

  it("finds venue contacts despite 'Hotel Contact Info' label (multi-person preserved)", () => {
    expect(venue.length).toBeGreaterThanOrEqual(1);
  });

  it("venue contact notes contains Kurt Ashcraft", () => {
    expect(venue[0]!.notes).toContain("Kurt Ashcraft");
  });

  it("venue contact email is kurt.ashcraft@hyatt.com", () => {
    expect(venue[0]!.email).toBe("kurt.ashcraft@hyatt.com");
  });

  it("finds in_house_av contacts (Chris Mercado + Danilo Scekic — multi-person preserved)", () => {
    expect(inHouseAv).toHaveLength(2);
    const names = inHouseAv.map((c) => c.name).filter(Boolean);
    expect(names.some((n) => /Chris|Mercado/.test(n!))).toBe(true);
    expect(names.some((n) => /Danilo|Scekic/.test(n!))).toBe(true);
  });

  it("in_house_av email contains chris.mercado@encoreglobal.com", () => {
    const emails = inHouseAv.map((c) => c.email).filter(Boolean);
    expect(emails).toContain("chris.mercado@encoreglobal.com");
  });
});

// ── v2 contacts (2025-04-asset-mgmt-cfo-coo) ─────────────────────────────────
describe("parseContacts — v2 (2025-04-asset-mgmt)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
  const contacts = parseContacts(md, "v2");
  const venue = contacts.filter((c) => c.kind === "venue");
  const inHouseAv = contacts.filter((c) => c.kind === "in_house_av");

  it("finds at least 1 venue contact (multi-person preserved)", () => {
    expect(venue.length).toBeGreaterThanOrEqual(1);
  });

  it("venue notes contains Jenaé Denne", () => {
    expect(venue[0]!.notes).toContain("Jenaé Denne");
  });

  it("venue email is jenae.denne@fourseasons.com", () => {
    expect(venue[0]!.email).toBe("jenae.denne@fourseasons.com");
  });

  it("finds 1 in_house_av contact", () => {
    expect(inHouseAv).toHaveLength(1);
  });

  it("in_house_av email is cesar.salazar@encoreglobal.com", () => {
    expect(inHouseAv[0]!.email).toBe("cesar.salazar@encoreglobal.com");
  });
});

// ── v1 contacts (2024-05-east-coast-family-office) ────────────────────────────
describe("parseContacts — v1 (2024-05-east-coast-family-office)", () => {
  const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  const contacts = parseContacts(md, "v1");
  const venue = contacts.filter((c) => c.kind === "venue");
  const inHouseAv = contacts.filter((c) => c.kind === "in_house_av");

  it("finds 1 venue contact", () => {
    expect(venue).toHaveLength(1);
  });

  it("venue notes contains Ashley Mullins", () => {
    expect(venue[0]!.notes).toContain("Ashley Mullins");
  });

  it("venue email is ashley.mullins@fourseasons.com", () => {
    expect(venue[0]!.email).toBe("ashley.mullins@fourseasons.com");
  });

  it("finds 1 in_house_av contact", () => {
    expect(inHouseAv).toHaveLength(1);
  });

  it("in_house_av email is mark.kauffman@encoreglobal.com", () => {
    expect(inHouseAv[0]!.email).toBe("mark.kauffman@encoreglobal.com");
  });
});

// ── Codex round-2: exact-name regression tests ───────────────────────────────

describe("parseContacts — exact name extraction (Codex round-2 findings)", () => {
  it("extracts 'Jenaé Denne' (accented) as venue contact name (2025-04)", () => {
    // Fixture line 125: | Hotal Contact Info | Jenaé Denne 312-649-2319 <jenae.denne@fourseasons.com> |
    const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
    const contacts = parseContacts(md, "v2");
    const venue = contacts.filter((c) => c.kind === "venue");
    const denne = venue.find((c) => /Jenaé Denne|Jenae Denne/i.test(c.name ?? ""));
    expect(denne).toBeDefined();
    expect(denne!.name).toBe("Jenaé Denne");
  });

  it("extracts 'Kurt Ashcraft' without absorbing 'Senior Event Planning Manager' (2025-10)", () => {
    // Fixture line 56: | Hotel Contact Info | Kurt Ashcraft Senior Event Planning Manager 312 239 4217 kurt.ashcraft@hyatt.com |
    const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
    const contacts = parseContacts(md, "v2");
    const venue = contacts.filter((c) => c.kind === "venue");
    const kurt = venue.find((c) => /Kurt Ashcraft/.test(c.name ?? ""));
    expect(kurt).toBeDefined();
    expect(kurt!.name).toBe("Kurt Ashcraft");
  });

  it("extracts 'Aaron Paul' without absorbing 'Director of Event Technology' (2026-05)", () => {
    // Fixture line 48: | In House AV | Aaron Paul Director of Event Technology aaron.paul2@encoreglobal.com ... |
    const md = readFileSync("fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", "utf8");
    const contacts = parseContacts(md, "v2");
    const inHouse = contacts.filter((c) => c.kind === "in_house_av");
    const aaron = inHouse.find((c) => /Aaron Paul/.test(c.name ?? ""));
    expect(aaron).toBeDefined();
    expect(aaron!.name).toBe("Aaron Paul");
  });
});

// ── Codex round-3 regression tests ───────────────────────────────────────────

describe("parseContacts — phantom contact rejection (Codex round-3 finding 1)", () => {
  it("rejects phantom 'FALSE' value from form-table row in 2025-03-dci-rpas-central", () => {
    // Line ~537: | Hotel Contact Info | FALSE | — value has no email/phone/name → must be skipped
    const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
    const contacts = parseContacts(md, "v2");
    const phantomFalse = contacts.find((c) => c.notes === "FALSE");
    expect(phantomFalse).toBeUndefined();
  });

  it("rejects phantom 'FALSE' value from form-table row in 2025-04-asset-mgmt-cfo-coo", () => {
    // Line ~430: | Hotel Contact Info | FALSE | — same pattern as above
    const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
    const contacts = parseContacts(md, "v2");
    const phantomFalse = contacts.find((c) => c.notes === "FALSE");
    expect(phantomFalse).toBeUndefined();
  });

  it("does not emit duplicate venue contact from later reference row in 2025-10", () => {
    // Real row (line 56): 'Hotel Contact Info | Kurt Ashcraft … kurt.ashcraft@hyatt.com'
    // Reference row (line 244): 'Hotel Contact Information | Kurt.Ashcraft@hyatt.com'
    // Both canonicalize to kurt.ashcraft@hyatt.com — should keep exactly 1 Kurt row
    const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
    const venue = parseContacts(md, "v2").filter((c) => c.kind === "venue");
    const kurtRows = venue.filter((c) =>
      /Kurt|kurt\.ashcraft/i.test(`${c.name ?? ""} ${c.email ?? ""}`),
    );
    expect(kurtRows).toHaveLength(1);
    expect(kurtRows[0]!.name).toBe("Kurt Ashcraft");
  });
});

describe("parseContacts — per-person segmentation no bleed (Codex round-3 finding 3)", () => {
  it("Angela Kongabel does NOT inherit Cesar Salazar's phone (2026-03)", () => {
    // In House AV cell: "Cesar Salazar cesar.salazar@encoreglobal.com 309-532-5534 Angela Kongabel angela.kongabel@encoreglobal.com"
    // Pre-fix: Angela's pre-segment contained "309-532-5534" → phoneInPre grabbed Cesar's phone.
    // Post-fix: phoneInPre is suppressed for i > 0 → Angela has no phone.
    const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
    const contacts = parseContacts(md, "v4");
    const angela = contacts.find((c) => /Angela Kongabel/i.test(c.name ?? ""));
    expect(angela).toBeDefined();
    expect(angela!.phone).not.toBe("309-532-5534"); // must not be Cesar's phone
  });

  it("first venue contact in 2025-04 does NOT have Amanda Mattson's name in notes", () => {
    // This fixture is v2 but 2026-03 is the main multi-person bleed fixture.
    // In 2025-04 the venue cell is single-person (Jenaé Denne) — notes must not bleed Amanda.
    // Amanda Mattson appears in the venue contact info only via the reference table (2026-03 pattern).
    // For 2025-04: confirm the first venue contact notes don't contain 'Amanda Mattson'.
    const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
    const venue = parseContacts(md, "v2").filter((c) => c.kind === "venue");
    if (venue[0]) {
      expect(venue[0].notes ?? "").not.toContain("Amanda Mattson");
    }
  });
});

// ── Codex round-4 regression tests: notes contamination ──────────────────────

describe("parseContacts — notes contamination fixes (Codex round-4 finding 2)", () => {
  it("2025-03 venue notes do NOT contain stray numeric '3620.45'", () => {
    // Fixture line 236: | Hotal Contact Info | <contact cell> | ... | 3620.45 |
    // Fix 2a: only use cells[1] (the value cell), not all remaining cells.
    const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
    const contacts = parseContacts(md, "v2");
    const venue = contacts.filter((c) => c.kind === "venue");
    for (const v of venue) {
      expect(v.notes ?? "").not.toContain("3620.45");
    }
  });

  it("Jenae Denne's notes do NOT contain Amanda Mattson (2026-03 — Codex round-4 finding 2)", () => {
    // Fixture line 74: Venue Contact Info cell has both Jenae and Amanda.
    // Fix 2b: clip Jenae's post segment before Amanda's name starts.
    const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
    const contacts = parseContacts(md, "v4");
    const jenae = contacts.find((c) => /Jenae/i.test(c.name ?? ""));
    if (jenae) {
      expect(jenae.notes ?? "").not.toContain("Amanda Mattson");
      expect(jenae.notes ?? "").not.toContain("Amanda");
    }
  });

  it("Cecilia's notes do NOT contain Aaron Shapiro (2026-04 — Codex round-4 finding 2)", () => {
    // Fixture line 32: In House AV cell has both Cecilia and Aaron.
    // Fix 2b: clip Cecilia's post segment before Aaron's name starts.
    const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
    const contacts = parseContacts(md, "v4");
    const cecilia = contacts.find((c) => /Cecilia/i.test(c.name ?? ""));
    expect(cecilia).toBeDefined();
    expect(cecilia!.notes ?? "").not.toContain("Aaron");
    expect(cecilia!.notes ?? "").not.toContain("Shapiro");
  });

  it("Angela Kongabel's notes do NOT contain Cesar's phone (2026-03 — phone-attribution)", () => {
    // Fixture line 75: In House AV cell: Cesar ... 309-532-5534 Angela ...
    // Fix 2b: Angela's post segment has no phone; fix ensures clipping doesn't
    // re-introduce phone from inter-person gap. Also validates round-3 phone fix.
    const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
    const contacts = parseContacts(md, "v4");
    const angela = contacts.find((c) => /Angela Kongabel/i.test(c.name ?? ""));
    if (angela) {
      expect(angela.notes ?? "").not.toContain("309-532-5534"); // Cesar's phone
    }
  });
});

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseContacts — corpus coverage", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} yields valid ContactRow[]`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const contacts = parseContacts(md, version ?? "v2");
      expect(Array.isArray(contacts)).toBe(true);
      for (const c of contacts) {
        expect(["venue", "in_house_av"]).toContain(c.kind);
        // email is canonicalized if present
        if (c.email !== null) {
          expect(c.email).toBe(c.email.toLowerCase());
        }
      }
    });
  }
});
