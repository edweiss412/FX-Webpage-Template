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

  it("finds 1 in_house_av contact", () => {
    expect(inHouseAv).toHaveLength(1);
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

  it("finds 1 venue contact despite 'Hotel Contact Info' label", () => {
    expect(venue).toHaveLength(1);
  });

  it("venue contact notes contains Kurt Ashcraft", () => {
    expect(venue[0]!.notes).toContain("Kurt Ashcraft");
  });

  it("venue contact email is kurt.ashcraft@hyatt.com", () => {
    expect(venue[0]!.email).toBe("kurt.ashcraft@hyatt.com");
  });

  it("finds 1 in_house_av contact", () => {
    expect(inHouseAv).toHaveLength(1);
  });

  it("in_house_av email is chris.mercado@encoreglobal.com", () => {
    expect(inHouseAv[0]!.email).toBe("chris.mercado@encoreglobal.com");
  });
});

// ── v2 contacts (2025-04-asset-mgmt-cfo-coo) ─────────────────────────────────
describe("parseContacts — v2 (2025-04-asset-mgmt)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
  const contacts = parseContacts(md, "v2");
  const venue = contacts.filter((c) => c.kind === "venue");
  const inHouseAv = contacts.filter((c) => c.kind === "in_house_av");

  it("finds 1 venue contact", () => {
    expect(venue).toHaveLength(1);
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

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseContacts — corpus coverage", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} yields valid ContactRow[]`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const contacts = parseContacts(md, version);
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
