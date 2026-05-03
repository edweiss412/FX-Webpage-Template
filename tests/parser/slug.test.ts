import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { deriveSlug, SlugCollisionExhausted } from "@/lib/parser/slug";
import type { ParsedSheet } from "@/lib/parser";

// Helper: build a minimal ParsedSheet with overrideable title + dates
function makeParseResult(opts: {
  title: string;
  dates: {
    set?: string | null;
    travelIn?: string | null;
    showDays?: string[];
  };
}): ParsedSheet {
  return {
    show: {
      title: opts.title,
      client_label: "",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        set: opts.dates.set ?? null,
        travelIn: opts.dates.travelIn ?? null,
        showDays: opts.dates.showDays ?? [],
        travelOut: null,
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: {
      linkedFolder: null,
      embeddedImages: [],
      linkedFolderItems: [],
    },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  };
}

describe("deriveSlug", () => {
  it("determinism: same input → same output (AC-1.9)", () => {
    const r = makeParseResult({ title: "RPAS Central 2026", dates: { set: "2026-03-23" } });
    expect(deriveSlug(r, [])).toBe(deriveSlug(r, []));
    expect(deriveSlug(r, [])).toBe("2026-03-rpas-central-2026");
  });

  it("collision suffix -2 -3 (AC-1.10)", () => {
    const r = makeParseResult({ title: "RPAS Central 2026", dates: { set: "2026-03-23" } });
    expect(deriveSlug(r, ["2026-03-rpas-central-2026"])).toBe("2026-03-rpas-central-2026-2");
    expect(deriveSlug(r, ["2026-03-rpas-central-2026", "2026-03-rpas-central-2026-2"])).toBe(
      "2026-03-rpas-central-2026-3",
    );
  });

  it("SLUG_COLLISION_EXHAUSTED at attempt 100", () => {
    const r = makeParseResult({ title: "RPAS Central 2026", dates: { set: "2026-03-23" } });
    const existing = [
      "2026-03-rpas-central-2026",
      ...Array.from({ length: 99 }, (_, i) => `2026-03-rpas-central-2026-${i + 2}`),
    ];
    expect(() => deriveSlug(r, existing)).toThrow(SlugCollisionExhausted);
    expect(() => deriveSlug(r, existing)).toThrow(/SLUG_COLLISION_EXHAUSTED/);
  });

  it("uses set date, falls back to travelIn, then showDays[0]", () => {
    // null set, has travelIn → uses travelIn
    const r1 = makeParseResult({
      title: "Test Show",
      dates: { set: null, travelIn: "2025-07-10", showDays: ["2025-07-11"] },
    });
    expect(deriveSlug(r1, [])).toBe("2025-07-test-show");

    // null set + null travelIn, has showDays[0] → uses showDays[0]
    const r2 = makeParseResult({
      title: "Test Show",
      dates: { set: null, travelIn: null, showDays: ["2025-08-15"] },
    });
    expect(deriveSlug(r2, [])).toBe("2025-08-test-show");

    // set wins over travelIn and showDays
    const r3 = makeParseResult({
      title: "Test Show",
      dates: { set: "2025-06-01", travelIn: "2025-05-31", showDays: ["2025-06-02"] },
    });
    expect(deriveSlug(r3, [])).toBe("2025-06-test-show");
  });

  it("throws when all dates are null", () => {
    const r = makeParseResult({
      title: "No Dates Show",
      dates: { set: null, travelIn: null, showDays: [] },
    });
    expect(() => deriveSlug(r, [])).toThrow(/no date/i);
  });

  it("caps title-slug at 60 chars", () => {
    // 61-char title after slugification should be capped at 60
    const longTitle = "A".repeat(61);
    const r = makeParseResult({ title: longTitle, dates: { set: "2026-01-15" } });
    const slug = deriveSlug(r, []);
    const titlePart = slug.replace(/^\d{4}-\d{2}-/, "");
    expect(titlePart.length).toBeLessThanOrEqual(60);
  });

  it("ASCII-folds and strips diacritics", () => {
    const r1 = makeParseResult({ title: "Café Show", dates: { set: "2026-01-01" } });
    expect(deriveSlug(r1, [])).toBe("2026-01-cafe-show");

    const r2 = makeParseResult({ title: "Müller Event", dates: { set: "2026-02-01" } });
    expect(deriveSlug(r2, [])).toBe("2026-02-muller-event");
  });

  it("handles punctuation and consecutive non-alphanumeric chars", () => {
    const r = makeParseResult({ title: "Show & Tell: Part 1!", dates: { set: "2026-03-01" } });
    expect(deriveSlug(r, [])).toBe("2026-03-show-tell-part-1");
  });

  it("every fixture produces a stable, unique slug", () => {
    const dir = "fixtures/shows/raw";
    const files = readdirSync(dir).filter((n) => n.endsWith(".md"));
    expect(files.length).toBe(10);

    const pass1: string[] = [];
    const pass2: string[] = [];

    for (const f of files) {
      const parsed = parseSheet(readFileSync(`${dir}/${f}`, "utf8"), f);
      pass1.push(deriveSlug(parsed, []));
      pass2.push(deriveSlug(parsed, []));
    }

    // Determinism: each fixture gives same slug in both passes
    for (let i = 0; i < files.length; i++) {
      expect(pass1[i]).toBe(pass2[i]);
    }

    // Uniqueness: all 10 slugs are distinct (no fixture-to-fixture collisions)
    const unique = new Set(pass1);
    expect(unique.size).toBe(10);
  });
});
