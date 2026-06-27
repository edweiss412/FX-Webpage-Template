import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCrew } from "@/lib/parser/blocks/crew";
import { newAggregator } from "@/lib/parser/warnings";
import { extractRoleFlags } from "@/lib/parser/personalization";
import { detectVersion } from "@/lib/parser/schema";

// ── Fixture paths (all verified against corpus) ───────────────────────────────
//
// 2025-06-ria-investment-forum.md (v2):
//   CREW block at lines 28-32 (0-indexed):
//   line 29: | CREW | NAME | ROLE | PHONE | EMAIL |
//   line 32: | | Calvin Saller (6/24 and 6/26 ONLY) | \- Load In / Set / Strike / Load Out ONLY | ... |
//   line 30: | | Doug Larson | \- Load In / Set / Strike / Load Out - LEAD / V1 | ... |
//
// 2025-04-asset-mgmt-cfo-coo.md (v2):
//   CREW block at line 225-228:
//   line 227: | | Kari Rose | \- Load In / Set / Strike / Load Out (4/7 & 4/9 ONLY) | ... |
//
// 2025-10-fixed-income-trading-summit.md (v2):
//   CREW block at lines 26-31:
//   line 30: | | Maria Davila (10/19 ONLY) | - Load In / Set ONLY | ... |
//   line 31: | | Rob Frye (10/21 ONLY) | - Load Out / Strike ONLY | ... |
//
// 2026-03-rpas-central-four-seasons.md (v4):
//   CREW block at lines 33-38:
//   line 38: | | Calvin Saller | \- Load In / Set / Strike / Load Out ONLY*** | ... |
//
// 2025-03-dci-rpas-central.md (v2):
//   CREW block at lines 251-260:
//   line 257: | | Calvin Saller | \- Load In / Set / Strike / Load Out 3/24 & 3/26 ONLY | ... |
//   (date restriction in role cell WITHOUT parens)

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

// ── Named tests (AC-1.2 – AC-1.5) ────────────────────────────────────────────

describe("parseCrew — day restriction in NAME cell (AC-1.3)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-06-ria-investment-forum.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("extracts explicit day restriction from name-cell parens — Calvin Saller 6/24 & 6/26", () => {
    const calvin = crew.find((c) => c.name.startsWith("Calvin"))!;
    expect(calvin).toBeDefined();
    expect(calvin.date_restriction).toEqual({ kind: "explicit", days: ["6/24", "6/26"] });
  });

  it("strips parens from display name — 'Calvin Saller' not 'Calvin Saller (6/24 and 6/26 ONLY)'", () => {
    const calvin = crew.find((c) => c.name.startsWith("Calvin"))!;
    expect(calvin.name).toBe("Calvin Saller");
  });
});

describe("parseCrew — day restriction in ROLE cell (AC-1.3)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("extracts day restriction from role cell — Kari Rose 4/7 & 4/9", () => {
    const kari = crew.find((c) => c.name === "Kari Rose")!;
    expect(kari).toBeDefined();
    expect(kari.date_restriction).toEqual({ kind: "explicit", days: ["4/7", "4/9"] });
  });
});

describe("parseCrew — stage restriction Load In / Set ONLY (AC-1.4)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("Maria Davila — stage_restriction Load In + Set", () => {
    const maria = crew.find((c) => c.name.startsWith("Maria"))!;
    expect(maria).toBeDefined();
    expect(maria.stage_restriction).toEqual({ kind: "explicit", stages: ["Load In", "Set"] });
  });

  it("Maria Davila — also carries date restriction from name cell (10/19)", () => {
    const maria = crew.find((c) => c.name.startsWith("Maria"))!;
    expect(maria.date_restriction).toEqual({ kind: "explicit", days: ["10/19"] });
  });
});

describe("parseCrew — stage restriction Load Out / Strike ONLY (AC-1.4)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("Rob Frye — stage_restriction Load Out + Strike", () => {
    const rob = crew.find((c) => c.name.startsWith("Rob"))!;
    expect(rob).toBeDefined();
    expect(rob.stage_restriction).toEqual({ kind: "explicit", stages: ["Load Out", "Strike"] });
  });

  it("Rob Frye — also carries date restriction from name cell (10/21)", () => {
    const rob = crew.find((c) => c.name.startsWith("Rob"))!;
    expect(rob.date_restriction).toEqual({ kind: "explicit", days: ["10/21"] });
  });
});

describe("parseCrew — unknown_asterisk date restriction (AC-1.4)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
  const crew = parseCrew(md, "v4");

  it("Calvin Saller *** form → date_restriction kind='unknown_asterisk'", () => {
    const calvin = crew.find((c) => c.name === "Calvin Saller")!;
    expect(calvin).toBeDefined();
    expect(calvin.date_restriction).toEqual({ kind: "unknown_asterisk", days: null });
  });
});

describe("parseCrew — compound role decomposition (AC-1.5)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-06-ria-investment-forum.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("Doug Larson LEAD / V1 → role_flags contains ['LEAD', 'V1']", () => {
    const doug = crew.find((c) => c.name === "Doug Larson")!;
    expect(doug).toBeDefined();
    expect(doug.role_flags).toEqual(expect.arrayContaining(["LEAD", "V1"]));
  });

  it("Doug Larson LEAD / V1 without ONLY → stage_restriction kind='none'", () => {
    const doug = crew.find((c) => c.name === "Doug Larson")!;
    expect(doug).toBeDefined();
    expect(doug.stage_restriction).toEqual({ kind: "none" });
  });

  it("Doug Larson — role_flags does NOT contain literal slash-strings like 'LEAD/V1'", () => {
    const doug = crew.find((c) => c.name === "Doug Larson")!;
    expect(doug.role_flags).not.toContain("LEAD/V1");
    expect(doug.role_flags).not.toContain("LEAD / V1");
  });
});

describe("parseCrew — email canonicalization (AC-1.2)", () => {
  // Using 2025-06 fixture which has mixed-case potential; we verify all emails are lowercase
  const md = readFileSync("fixtures/shows/raw/2025-06-ria-investment-forum.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("all non-null emails are lowercased and trimmed", () => {
    for (const member of crew) {
      if (member.email !== null) {
        expect(member.email).toBe(member.email.toLowerCase().trim());
      }
    }
  });

  it("dlarson@fxav.net is present (lowercase)", () => {
    const doug = crew.find((c) => c.name === "Doug Larson")!;
    expect(doug.email).toBe("dlarson@fxav.net");
  });
});

describe("parseCrew — raw role string preservation", () => {
  const md = readFileSync("fixtures/shows/raw/2025-06-ria-investment-forum.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("raw role string is preserved (verbatim after backslash-unescape)", () => {
    const doug = crew.find((c) => c.name === "Doug Larson")!;
    // Raw cell: "\- Load In / Set / Strike / Load Out - LEAD / V1" → cleaned: "- Load In / Set / Strike / Load Out - LEAD / V1"
    expect(doug.role).toContain("Load In / Set / Strike / Load Out");
    expect(doug.role).toContain("LEAD");
    expect(doug.role).toContain("V1");
  });
});

describe("parseCrew — no-paren ONLY in role cell (2025-03)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("Calvin Saller 3/24 & 3/26 ONLY (bare, no parens) → explicit days", () => {
    const calvin = crew.find((c) => c.name === "Calvin Saller")!;
    expect(calvin).toBeDefined();
    expect(calvin.date_restriction).toEqual({ kind: "explicit", days: ["3/24", "3/26"] });
  });
});

// ── Stage restriction for full-stage ONLY (2025-05, 2025-03 etc.) ─────────────
describe("parseCrew — full-stage ONLY stage restriction", () => {
  const md = readFileSync(
    "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
    "utf8",
  );
  const crew = parseCrew(md, "v2");

  it("Calvin Saller Load In/Set/Strike/Load Out ONLY → stage_restriction all stages", () => {
    const calvin = crew.find((c) => c.name === "Calvin Saller")!;
    expect(calvin).toBeDefined();
    expect(calvin.stage_restriction).toEqual({
      kind: "explicit",
      stages: ["Load In", "Set", "Strike", "Load Out"],
    });
  });

  it("Kari Rose Load In / Set ONLY → stage_restriction ['Load In','Set']", () => {
    const kari = crew.find((c) => c.name === "Kari Rose")!;
    expect(kari).toBeDefined();
    expect(kari.stage_restriction).toEqual({ kind: "explicit", stages: ["Load In", "Set"] });
  });
});

// ── v4 fixture crew parsing ────────────────────────────────────────────────────
describe("parseCrew — v4 fixture (2026-03 four-seasons)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
  const crew = parseCrew(md, "v4");

  it("returns at least 3 crew members", () => {
    expect(crew.length).toBeGreaterThanOrEqual(3);
  });

  it("Doug Larson has role_flags containing LEAD and V1", () => {
    const doug = crew.find((c) => c.name === "Doug Larson")!;
    expect(doug).toBeDefined();
    expect(doug.role_flags).toEqual(expect.arrayContaining(["LEAD", "V1"]));
  });

  it("all crew members have non-empty name and role", () => {
    for (const m of crew) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.role.length).toBeGreaterThan(0);
    }
  });
});

// ── Consultants roundtable day restriction in name cell ──────────────────────
describe("parseCrew — day restriction in name cell (2025-10-consultants-roundtable)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-consultants-roundtable.md", "utf8");
  const crew = parseCrew(md, "v2");

  it("Calvin Saller (10/7 and 10/9 ONLY) → explicit days", () => {
    const calvin = crew.find((c) => c.name === "Calvin Saller")!;
    expect(calvin).toBeDefined();
    expect(calvin.date_restriction).toEqual({ kind: "explicit", days: ["10/7", "10/9"] });
  });

  it("Kari Rose (10/7 ONLY) → explicit days", () => {
    const kari = crew.find((c) => c.name === "Kari Rose")!;
    expect(kari).toBeDefined();
    expect(kari.date_restriction).toEqual({ kind: "explicit", days: ["10/7"] });
  });
});

// ── 2026-04 waldorf fixture ────────────────────────────────────────────────────
// The waldorf v4 CREW block (line 60) contains: John Carleo, Eric Weiss, Calvin Saller.
// Kari Rose appears only in the extended roster table (line 684), not in the CREW block.
describe("parseCrew — 2026-04 waldorf v4 fixture", () => {
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
  const crew = parseCrew(md, "v4");

  it("returns crew members from the CREW block (John Carleo, Eric Weiss, Calvin Saller)", () => {
    expect(crew.length).toBeGreaterThanOrEqual(3);
    const names = crew.map((c) => c.name);
    expect(names).toContain("John Carleo");
    expect(names).toContain("Eric Weiss");
    expect(names).toContain("Calvin Saller");
  });

  it("Calvin Saller *** form → unknown_asterisk in waldorf fixture", () => {
    const calvin = crew.find((c) => c.name === "Calvin Saller")!;
    expect(calvin).toBeDefined();
    expect(calvin.date_restriction).toEqual({ kind: "unknown_asterisk", days: null });
  });
});

// ── Corpus coverage ───────────────────────────────────────────────────────────

describe("parseCrew — corpus coverage (all 10 fixtures)", () => {
  for (const fixturePath of ALL_FIXTURES) {
    const fileName = fixturePath.split("/").pop()!;

    it(`${fileName} → returns non-empty crew array`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md) ?? "v2";
      const crew = parseCrew(md, version);
      expect(crew.length).toBeGreaterThan(0);
    });

    it(`${fileName} → every member has name.length > 0`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md) ?? "v2";
      const crew = parseCrew(md, version);
      for (const m of crew) {
        expect(m.name.length).toBeGreaterThan(0);
      }
    });

    it(`${fileName} → every member has role.length > 0`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md) ?? "v2";
      const crew = parseCrew(md, version);
      for (const m of crew) {
        expect(m.role.length).toBeGreaterThan(0);
      }
    });

    it(`${fileName} → no role_flags contains literal slash-strings (decomposition happened)`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md) ?? "v2";
      const crew = parseCrew(md, version);
      for (const m of crew) {
        for (const flag of m.role_flags) {
          // Anti-tautology: prove decomposition happened — no compound slash token survived
          expect(flag).not.toMatch(/\//);
          // Also no space-separated multi-word tokens (should be underscore-normalized)
          // (only valid multi-word flags are CAM_OP, SHOW_CALLER, GREEN_ROOM, CONTENT_CREATION — all underscored)
        }
      }
    });

    it(`${fileName} → email fields are canonicalized (lowercased + trimmed)`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md) ?? "v2";
      const crew = parseCrew(md, version);
      for (const m of crew) {
        if (m.email !== null) {
          expect(m.email).toBe(m.email.toLowerCase().trim());
          expect(m.email.length).toBeGreaterThan(0);
        }
      }
    });
  }
});

// ── Fix 1 regression: pure-ONLY rows lose no role_flags (stage-strip regex) ───
// Pre-fix bug: the regex required a mandatory trailing dash separator. When the
// role cell was exactly "Load In / Set / Strike / Load Out ONLY" (no dash, no
// trailing role flags) the regex didn't match, leaving the full stage list in
// `remainder`, which tokenized to UNKNOWN_ROLE_TOKEN for every stage word.

describe("parseCrew — Fix 1 regression: pure stage-only ONLY rows (no trailing dash)", () => {
  it("Calvin Saller in 2025-06-ria: pure ONLY row → role_flags=['ONLY'] + all-4-stages restriction", () => {
    // Line 32: "| | Calvin Saller (6/24 and 6/26 ONLY) | \\- Load In / Set / Strike / Load Out ONLY | ..."
    // No trailing dash, no role flags after ONLY — pre-fix produced UNKNOWN_ROLE_TOKEN for each stage word.
    const md = readFileSync("fixtures/shows/raw/2025-06-ria-investment-forum.md", "utf8");
    const crew = parseCrew(md, "v2");
    const calvin = crew.find((c) => c.name.startsWith("Calvin"))!;
    expect(calvin).toBeDefined();
    expect(calvin.role_flags).toEqual(["ONLY"]);
    expect(calvin.stage_restriction).toEqual({
      kind: "explicit",
      stages: ["Load In", "Set", "Strike", "Load Out"],
    });
  });

  it("Calvin Saller in 2025-05-redefining: pure ONLY row → role_flags=['ONLY']", () => {
    // Line 215: "\\- Load In / Set / Strike / Load Out ONLY" — same pure-ONLY form, no dash.
    const md = readFileSync(
      "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
      "utf8",
    );
    const crew = parseCrew(md, "v2");
    const calvin = crew.find((c) => c.name === "Calvin Saller")!;
    expect(calvin).toBeDefined();
    expect(calvin.role_flags).toEqual(["ONLY"]);
    expect(calvin.stage_restriction).toEqual({
      kind: "explicit",
      stages: ["Load In", "Set", "Strike", "Load Out"],
    });
  });

  it("Eric Weiss in 2025-10-fixed-income: pure ONLY row → role_flags=['ONLY']", () => {
    // Line 29: "\\- Load In / Set / Strike / Load Out ONLY" — pure-ONLY form.
    const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
    const crew = parseCrew(md, "v2");
    const eric = crew.find((c) => c.name.startsWith("Eric Weiss"))!;
    expect(eric).toBeDefined();
    expect(eric.role_flags).toEqual(["ONLY"]);
    expect(eric.stage_restriction).toEqual({
      kind: "explicit",
      stages: ["Load In", "Set", "Strike", "Load Out"],
    });
  });

  it("Calvin Saller ONLY*** in 2026-03-rpas: role_flags=['ONLY'] + unknown_asterisk", () => {
    // Line 38: "\\- Load In / Set / Strike / Load Out ONLY\\*\\*\\*" — ONLY*** variant.
    const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
    const crew = parseCrew(md, "v4");
    const calvin = crew.find((c) => c.name === "Calvin Saller")!;
    expect(calvin).toBeDefined();
    expect(calvin.role_flags).toEqual(["ONLY"]);
    expect(calvin.date_restriction).toEqual({ kind: "unknown_asterisk", days: null });
    expect(calvin.stage_restriction).toEqual({
      kind: "explicit",
      stages: ["Load In", "Set", "Strike", "Load Out"],
    });
  });

  it("Calvin Saller ONLY*** in 2026-05-fintech: role_flags=['ONLY'] + unknown_asterisk", () => {
    const md = readFileSync("fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", "utf8");
    const crew = parseCrew(md, "v4");
    const calvin = crew.find((c) => c.name === "Calvin Saller")!;
    expect(calvin).toBeDefined();
    expect(calvin.role_flags).toEqual(["ONLY"]);
    expect(calvin.date_restriction).toEqual({ kind: "unknown_asterisk", days: null });
  });

  it("no UNKNOWN_ROLE_TOKEN warnings emitted for pure-ONLY role cells (extractRoleFlags direct)", () => {
    // extractRoleFlags receives already-cleaned strings (backslashes stripped by clean() in crew.ts).
    // Test with the post-clean forms: "- Load In / Set / Strike / Load Out ONLY" (no backslash).
    const pureCases = [
      "- Load In / Set / Strike / Load Out ONLY",
      "Load In / Set / Strike / Load Out ONLY",
      "- Load In / Set / Strike / Load Out ONLY***",
    ];
    for (const cell of pureCases) {
      const { flags, unknownTokens, warnings } = extractRoleFlags(cell);
      const unknownWarnings = warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN");
      expect(unknownWarnings, `Expected no UNKNOWN_ROLE_TOKEN for: "${cell}"`).toHaveLength(0);
      expect(unknownTokens, `Expected no unknown tokens for: "${cell}"`).toHaveLength(0);
      expect(flags, `Expected ONLY flag for: "${cell}"`).toEqual(["ONLY"]);
    }
  });
});

// ── Fix 2: synthetic per-token vocabulary test (plan §6.6 requirement) ────────
// Exercises every token from the v4 role-master at
// fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md:718-743.
// Each token that is a canonical atomic flag must produce non-empty role_flags and no
// UNKNOWN_ROLE_TOKEN warning. Restriction tokens produce the canonical ONLY flag.

describe("extractRoleFlags — synthetic per-token vocabulary (plan §6.6)", () => {
  // Canonical capability tokens from the role-master (all must produce ≥1 flag, no UNKNOWN warning).
  // extractRoleFlags receives post-clean() strings (backslashes already stripped by crew.ts).
  // The role-master rows use "- Load In / Set / Strike / Load Out - <TOKEN>" form after cleaning.
  const capabilityTokenCells: Array<{ token: string; cell: string }> = [
    { token: "LEAD", cell: "- Load In / Set / Strike / Load Out - LEAD" },
    { token: "LEAD/A1", cell: "- Load In / Set / Strike / Load Out - LEAD / A1" },
    { token: "LEAD/V1", cell: "- Load In / Set / Strike / Load Out - LEAD / V1" },
    { token: "A1", cell: "- Load In / Set / Strike / Load Out - A1" },
    { token: "A2", cell: "- Load In / Set / Strike / Load Out - A2" },
    { token: "V1", cell: "- Load In / Set / Strike / Load Out - V1" },
    { token: "BO", cell: "- Load In / Set / Strike / Load Out - BO" },
    { token: "GS-A1", cell: "- Load In / Set / Strike / Load Out - GS - A1" },
    { token: "GS-V1", cell: "- Load In / Set / Strike / Load Out - GS - V1" },
    { token: "BO-A1", cell: "- Load In / Set / Strike / Load Out - BO - A1" },
    { token: "BO-V1", cell: "- Load In / Set / Strike / Load Out - BO - V1" },
    { token: "BO-LEAD", cell: "- Load In / Set / Strike / Load Out - BO - LEAD" },
    { token: "L1", cell: "- Load In / Set / Strike / Load Out - L1" },
    { token: "FLOATER", cell: "- Load In / Set / Strike / Load Out - FLOATER" },
    { token: "FLOOR", cell: "- Load In / Set / Strike / Load Out - FLOOR" },
    { token: "STREAM", cell: "- Load In / Set / Strike / Load Out - STREAM" },
    { token: "CAM OP", cell: "- Load In / Set / Strike / Load Out - CAM OP" },
    { token: "PTZ", cell: "- Load In / Set / Strike / Load Out - PTZ" },
    { token: "LED", cell: "- Load In / Set / Strike / Load Out - LED" },
    { token: "GAV", cell: "- Load In / Set / Strike / Load Out - GAV" },
    { token: "SHOW CALLER", cell: "- Load In / Set / Strike / Load Out - SHOW CALLER" },
    { token: "GREEN ROOM", cell: "- Load In / Set / Strike / Load Out - GREEN ROOM" },
    { token: "OWNER", cell: "- Load In / Set / Strike / Load Out - OWNER" },
    {
      token: "CONTENT CREATION",
      cell: "- Load In / Set / Strike / Load Out -- CONTENT CREATION",
    },
  ];

  for (const { token, cell } of capabilityTokenCells) {
    it(`token '${token}' → ≥1 role_flag, no UNKNOWN_ROLE_TOKEN`, () => {
      const { flags, unknownTokens, warnings } = extractRoleFlags(cell);
      const unknownWarnings = warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN");
      expect(
        unknownWarnings,
        `Token '${token}' emitted UNKNOWN_ROLE_TOKEN from cell: "${cell}"`,
      ).toHaveLength(0);
      expect(
        unknownTokens,
        `Token '${token}' left unknown tokens from cell: "${cell}"`,
      ).toHaveLength(0);
      expect(
        flags.length,
        `Token '${token}' produced empty role_flags from cell: "${cell}"`,
      ).toBeGreaterThan(0);
    });
  }

  // Restriction tokens: must produce ONLY role_flags AND no UNKNOWN_ROLE_TOKEN.
  // Post-clean() forms: backslashes stripped, *** literal (not markdown-escaped).
  const restrictionOnlyCells: Array<{ token: string; cell: string }> = [
    { token: "ONLY***", cell: "- Load In / Set / Strike / Load Out ONLY***" },
    { token: "Load In/Set ONLY", cell: "- Load In / Set ONLY" },
    { token: "Load Out/Strike ONLY", cell: "- Load Out / Strike ONLY" },
  ];

  for (const { token, cell } of restrictionOnlyCells) {
    it(`restriction token '${token}' → role_flags=['ONLY'], no UNKNOWN_ROLE_TOKEN`, () => {
      const { flags, unknownTokens, warnings } = extractRoleFlags(cell);
      const unknownWarnings = warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN");
      expect(
        unknownWarnings,
        `Restriction token '${token}' emitted UNKNOWN_ROLE_TOKEN from cell: "${cell}"`,
      ).toHaveLength(0);
      expect(
        unknownTokens,
        `Restriction token '${token}' left unknown tokens from cell: "${cell}"`,
      ).toHaveLength(0);
      expect(flags, `Restriction token '${token}' should produce ONLY role_flags`).toEqual([
        "ONLY",
      ]);
    });
  }
});

// ── Edge case: unparseable / empty EMAIL cells (AC-1.2 boundary) ─────────────
//
// Class-A email contract: a non-empty cell with NO "@" is not an address → it is
// flagged FIELD_UNREADABLE AND nulled (member.email = null), so PersonRow renders no
// mailto: link and the warning copy ("no email link will appear") stays true — same
// as the digit-less phone. Empty/whitespace cells (presence === null) are the common
// "no email" case: nulled silently, no warning. Valid addresses are canonicalized
// (lowercased/trimmed) and kept. canonicalize() itself never validates format
// (lib/email/canonicalize.ts:8-10); buildCrewMember adds the null-on-unreadable step
// on top so a bad value never reaches the crew page as a dead link.
describe("parseCrew — unparseable/empty email cells (AC-1.2 boundary)", () => {
  const md = [
    "| CREW | NAME | ROLE | PHONE | EMAIL |",
    "| :-: | :-: | :-: | :-: | :-: |",
    "| | Jane Doe | - LEAD | 555-0100 | Not An Email |",
    "| | John Roe | - V1 | 555-0101 | |",
    "| | Kay Poe | - A1 | 555-0102 | MiXeD@ExAmPle.COM |",
  ].join("\n");

  it("no-@ garbage email is NULLED (unreadable) so no dead mailto link can render", () => {
    const members = parseCrew(md, "v2");
    const jane = members.find((m) => m.name === "Jane Doe");
    expect(jane).toBeDefined();
    // the row still parses (name/phone intact); only the unusable email is dropped.
    expect(jane!.name).toBe("Jane Doe");
    expect(jane!.email).toBeNull();
  });

  it("empty email cell yields email:null silently (row still parsed)", () => {
    const members = parseCrew(md, "v2");
    const john = members.find((m) => m.name === "John Roe");
    expect(john).toBeDefined();
    expect(john!.email).toBeNull();
    expect(john!.phone).toBe("555-0101");
  });

  it("valid mixed-case email canonicalizes to lowercase (control row)", () => {
    const members = parseCrew(md, "v2");
    const kay = members.find((m) => m.name === "Kay Poe");
    expect(kay!.email).toBe("mixed@example.com");
  });

  it("flags the no-@ email (Jane) with FIELD_UNREADABLE, but NOT the empty (John) or valid (Kay) rows", () => {
    const agg = newAggregator();
    parseCrew(md, "v2", agg);
    const emailWarnings = agg.warnings.filter(
      (w) => w.code === "FIELD_UNREADABLE" && /Crew email/.test(w.message),
    );
    // exactly one — Jane's "Not An Email"; empty + valid rows do NOT flag (no noise).
    // The snippet is the CANONICAL value ("not an email") — invariant 3: canonicalize()
    // is the only function that touches the raw email, so the warning carries the
    // canonical form, not the raw string.
    expect(emailWarnings.length).toBe(1);
    expect(emailWarnings[0]!.rawSnippet).toBe("not an email");
    expect(emailWarnings[0]!.blockRef?.kind).toBe("crew");
    expect(emailWarnings[0]!.message).toContain("not an email");
    // the unusable email is nulled so no dead mailto renders on a fresh publish.
    expect(parseCrew(md, "v2").find((m) => m.name === "Jane Doe")?.email).toBeNull();
  });

  it("STRUCTURAL (invariant 3): crew.ts touches the raw email ONLY via canonicalize()", () => {
    // Guards against future drift: the email-unreadable predicate must derive from the
    // CANONICAL value, never inspect emailRaw directly (.includes/.toLowerCase/.trim/
    // .match/.split/etc.). canonicalize() is the single raw-email boundary (AGENTS.md
    // invariant 3). Whole-diff review R4.
    const src = readFileSync("lib/parser/blocks/crew.ts", "utf8");
    const rawInspection =
      /emailRaw\s*\.\s*(includes|toLowerCase|toUpperCase|trim|match|split|indexOf|replace|slice|substring|charAt)/;
    expect(
      rawInspection.test(src),
      "crew.ts must not inspect emailRaw directly — route through canonicalize() (invariant 3)",
    ).toBe(false);
  });
});

// ── Class A — FIELD_UNREADABLE (crew phone, parse-data-quality-warnings Task 2) ──
//
// A phone cell that carries a non-empty value but no digits (e.g. "call John")
// produces no tel: number. Class A flags it FIELD_UNREADABLE AND nulls member.phone
// (so PersonRow renders no dead `tel:` link and the warning copy stays true), while
// still parsing the rest of the member. The predicate lives in the shared
// buildCrewMember, so BOTH the CREW- and TECH-header paths (each computes its own
// phoneRaw) emit + null.

describe("Class A — FIELD_UNREADABLE crew phone", () => {
  it("emits FIELD_UNREADABLE for a digit-less phone via the CREW-header path", () => {
    const md = [
      "| CREW | NAME | ROLE | PHONE | EMAIL |",
      "| :--: | :--: | :--: | :--: | :--: |",
      "| | John Smith | A1 | call John | john@example.com |",
    ].join("\n");

    const agg = newAggregator();
    const crew = parseCrew(md, "v4", agg);

    // member still parses (row not dropped), but the unusable phone is nulled so
    // no dead tel: link renders.
    expect(crew.length).toBe(1);
    expect(crew[0]!.name).toBe("John Smith");
    expect(crew[0]!.phone).toBeNull();

    const fieldWarnings = agg.warnings.filter((w) => w.code === "FIELD_UNREADABLE");
    expect(fieldWarnings.length).toBe(1);
    expect(fieldWarnings[0]!.severity).toBe("warn");
    expect(fieldWarnings[0]!.rawSnippet).toBe("call John");
    expect(fieldWarnings[0]!.blockRef?.kind).toBe("crew");
  });

  it("emits FIELD_UNREADABLE for a digit-less phone via the TECH-header path", () => {
    // v1 TECH layout: NAME+ROLE merged in col0 (must contain " - "), phone in col1.
    const md = [
      "| TECH | PHONE | ARRIVAL | DEPARTURE |",
      "| :--: | :--: | :--: | :--: |",
      "| Jane Doe - A2 | text me | | |",
    ].join("\n");

    const agg = newAggregator();
    const crew = parseCrew(md, "v1", agg);

    expect(crew.length).toBe(1);
    expect(crew[0]!.name).toBe("Jane Doe");
    expect(crew[0]!.phone).toBeNull();

    const fieldWarnings = agg.warnings.filter((w) => w.code === "FIELD_UNREADABLE");
    expect(fieldWarnings.length).toBe(1);
    expect(fieldWarnings[0]!.rawSnippet).toBe("text me");
    expect(fieldWarnings[0]!.blockRef?.kind).toBe("crew");
  });

  it("does NOT emit FIELD_UNREADABLE for a parseable phone (control) — phone kept", () => {
    const md = [
      "| CREW | NAME | ROLE | PHONE | EMAIL |",
      "| :--: | :--: | :--: | :--: | :--: |",
      "| | John Smith | A1 | 917-331-4885 | john@example.com |",
    ].join("\n");

    const agg = newAggregator();
    const crew = parseCrew(md, "v4", agg);
    expect(agg.warnings.filter((w) => w.code === "FIELD_UNREADABLE")).toEqual([]);
    // a real phone is NOT nulled.
    expect(crew[0]!.phone).toBe("917-331-4885");
  });

  it("does NOT emit FIELD_UNREADABLE for an empty phone (absence is normal)", () => {
    const md = [
      "| CREW | NAME | ROLE | PHONE | EMAIL |",
      "| :--: | :--: | :--: | :--: | :--: |",
      "| | John Smith | A1 | | john@example.com |",
    ].join("\n");

    const agg = newAggregator();
    parseCrew(md, "v4", agg);
    expect(agg.warnings.filter((w) => w.code === "FIELD_UNREADABLE")).toEqual([]);
  });

  it("does NOT emit FIELD_UNREADABLE for a whitespace-only phone", () => {
    const md = [
      "| CREW | NAME | ROLE | PHONE | EMAIL |",
      "| :--: | :--: | :--: | :--: | :--: |",
      "| | John Smith | A1 |    | john@example.com |",
    ].join("\n");

    const agg = newAggregator();
    parseCrew(md, "v4", agg);
    expect(agg.warnings.filter((w) => w.code === "FIELD_UNREADABLE")).toEqual([]);
  });
});

describe("parseCrew — stage-word typo auto-correction (STAGE_WORD_AUTOCORRECTED)", () => {
  it("auto-corrects a misspelled stage word: 0 UNKNOWN_ROLE_TOKEN + 1 STAGE_WORD_AUTOCORRECTED, role parses", () => {
    const md = [
      "| TECH | PHONE | ARRIVAL | DEPARTURE |",
      "| --- | --- | --- | --- |",
      "| Eric Weiss - Load In/Set/Strke/Load Out - A1 | 555 |  |  |",
    ].join("\n");
    const agg = newAggregator();
    const crew = parseCrew(md, "v1", agg);

    expect(agg.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toHaveLength(0);
    // EXACTLY ONE drift note per cell (count, not find — guards against double-push
    // into the aggregator).
    const notes = agg.warnings.filter((w) => w.code === "STAGE_WORD_AUTOCORRECTED");
    expect(notes).toHaveLength(1);
    const note = notes[0]!;
    expect(note.severity).toBe("warn");
    expect(note.blockRef).toMatchObject({ kind: "crew", name: "Eric Weiss" }); // deep-link anchor
    expect(crew[0]!.role_flags).toContain("A1"); // real role still parses
  });

  it("auto-corrects a typo'd ONLY stage restriction (silent mis-parse fixed)", () => {
    const md = [
      "| CREW | NAME | ROLE | PHONE |",
      "| --- | --- | --- | --- |",
      "|  | Jane Doe | - Load Out / Strke ONLY | 555 |",
    ].join("\n");
    const agg = newAggregator();
    const crew = parseCrew(md, "v4", agg);

    expect(agg.warnings.find((w) => w.code === "STAGE_WORD_AUTOCORRECTED")).toBeTruthy();
    // stage_restriction now resolves (was silently { kind: "none" } before the fix).
    expect(crew[0]!.stage_restriction).toEqual({ kind: "explicit", stages: ["Load Out", "Strike"] });
  });

  it("does NOT emit STAGE_WORD_AUTOCORRECTED for a clean stage list", () => {
    const md = [
      "| CREW | NAME | ROLE | PHONE |",
      "| --- | --- | --- | --- |",
      "|  | Amy Lane | - Load In / Set / Strike / Load Out - LEAD | 555 |",
    ].join("\n");
    const agg = newAggregator();
    parseCrew(md, "v4", agg);
    expect(agg.warnings.find((w) => w.code === "STAGE_WORD_AUTOCORRECTED")).toBeUndefined();
  });
});
