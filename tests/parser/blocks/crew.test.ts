import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCrew } from "@/lib/parser/blocks/crew";
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
