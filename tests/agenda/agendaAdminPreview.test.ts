/**
 * tests/agenda/agendaAdminPreview.test.ts — spec §8 test-1 cases (a)–(n2).
 *
 * Anti-tautology: for fixture-backed tests, expected session/day counts are
 * DERIVED from `extractAgendaSchedule` output at test time — never hardcoded —
 * so the assertion is driven by what the real extractor produces, not by what
 * the builder author expected.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { extractAgendaSchedule } from "@/lib/agenda/extractAgendaSchedule";
import {
  buildAdminAgendaPreview,
  capExtractionForAdmin,
  agendaPdfHref,
} from "@/lib/agenda/agendaAdminPreview";
import type { AgendaExtraction } from "@/lib/agenda/types";
import {
  AGENDA_ADMIN_SESSIONS_CAP,
  AGENDA_ADMIN_TRACKS_PER_SESSION_CAP,
  AGENDA_MAX_PDFS_PER_SHEET,
  EXTRACTOR_VERSION,
} from "@/lib/agenda/constants";

const bytes = (f: string) => new Uint8Array(readFileSync(`fixtures/agenda/${f}`));

// ── Synthetic fixture builder (for cap/gate tests that need controlled counts) ──
function makeHighConf(
  dayCount: number,
  sessionsPerDay: number,
  tracksPerSession = 0,
): AgendaExtraction {
  return {
    confidence: "high",
    corrections: 0,
    extractorVersion: EXTRACTOR_VERSION,
    days: Array.from({ length: dayCount }, (_, di) => ({
      dayLabel: `Day ${di + 1}`,
      date: null,
      sessions: Array.from({ length: sessionsPerDay }, (_, si) => ({
        time: `${9 + si}:00 AM`,
        title: `Session ${si + 1}`,
        room: null,
        tracks: Array.from({ length: tracksPerSession }, (_, ti) => ({
          label: `Track ${ti + 1}`,
          title: null,
          room: null,
        })),
        drift: null,
      })),
    })),
  };
}

// ── (a)/(b): Fixture-derived high-conf blocks ────────────────────────────────
describe("fixture-derived high-conf blocks", () => {
  test("(a) single RFI link, ordinal 0 fresh → block with counts derived from fixture extraction", async () => {
    const extracted = await extractAgendaSchedule(bytes("rfi.pdf"));
    expect(extracted.confidence).toBe("high");

    const links = [{ label: "AGENDA LINK - RFI", fileId: "rfi-file-id", extracted }];
    const items = buildAdminAgendaPreview(links, { freshByLinkKey: new Set([0]) });

    expect(items).toHaveLength(1);
    const item = items[0]!;
    // Single link → no badge
    expect(item.badge).toBeNull();
    expect(item.block).not.toBeNull();

    // Anti-tautology: derive expected session count from fixture output, not a literal.
    const totalSessions = extracted.days.flatMap((d) => d.sessions).length;
    const expectedKept = Math.min(totalSessions, AGENDA_ADMIN_SESSIONS_CAP);
    const actualKept = item.block!.extraction.days.flatMap((d) => d.sessions).length;
    expect(actualKept).toBe(expectedKept);

    // First session's time must match the fixture (not invented by the builder).
    expect(item.block!.extraction.days[0]!.sessions[0]!.time).toBe(
      extracted.days[0]!.sessions[0]!.time,
    );
  });

  test("(b) two fixture links (RFI + FIT), both fresh → both blocks; badges from labels; counts derived", async () => {
    const [rfiExt, fitExt] = await Promise.all([
      extractAgendaSchedule(bytes("rfi.pdf")),
      extractAgendaSchedule(bytes("fit.pdf")),
    ]);
    expect(rfiExt.confidence).toBe("high");
    expect(fitExt.confidence).toBe("high");

    const links = [
      { label: "AGENDA LINK - RFI", fileId: "rfi-id", extracted: rfiExt },
      { label: "AGENDA LINK - FIT", fileId: "fit-id", extracted: fitExt },
    ];
    const items = buildAdminAgendaPreview(links, { freshByLinkKey: new Set([0, 1]) });

    expect(items).toHaveLength(2);
    expect(items[0]!.block).not.toBeNull();
    expect(items[1]!.block).not.toBeNull();
    // Multi-link → badges from agendaDisplayLabel
    expect(items[0]!.badge).toBe("RFI");
    expect(items[1]!.badge).toBe("FIT");

    // Session counts derived from fixture (anti-tautology).
    const rfiTotal = rfiExt.days.flatMap((d) => d.sessions).length;
    const fitTotal = fitExt.days.flatMap((d) => d.sessions).length;
    expect(items[0]!.block!.extraction.days.flatMap((d) => d.sessions).length).toBe(
      Math.min(rfiTotal, AGENDA_ADMIN_SESSIONS_CAP),
    );
    expect(items[1]!.block!.extraction.days.flatMap((d) => d.sessions).length).toBe(
      Math.min(fitTotal, AGENDA_ADMIN_SESSIONS_CAP),
    );
  });
});

// ── Note-only (block: null) ─────────────────────────────────────────────────
describe("note-only cases (block: null)", () => {
  test("(c) low-confidence extraction → block: null", () => {
    const extracted: AgendaExtraction = {
      confidence: "low",
      corrections: 0,
      extractorVersion: EXTRACTOR_VERSION,
      days: [],
    };
    const items = buildAdminAgendaPreview([{ label: "AGENDA", fileId: "low-id", extracted }], {
      freshByLinkKey: new Set([0]),
    });
    expect(items[0]!.block).toBeNull();
  });

  test("(d) malformed extracted (non-schema shape) → block: null", () => {
    const items = buildAdminAgendaPreview([{ label: "AGENDA", extracted: { not: "valid" } }], {
      freshByLinkKey: new Set([0]),
    });
    expect(items[0]!.block).toBeNull();
  });

  test("(d2) null/undefined extracted → block: null", () => {
    expect(
      buildAdminAgendaPreview([{ label: "AGENDA", extracted: null }], {
        freshByLinkKey: new Set([0]),
      })[0]!.block,
    ).toBeNull();
    expect(
      buildAdminAgendaPreview([{ label: "AGENDA" }], {
        freshByLinkKey: new Set([0]),
      })[0]!.block,
    ).toBeNull();
  });

  test("(e) high-conf with zero days → block: null (normalizeAgendaExtraction rejects high+empty)", () => {
    const extracted = {
      confidence: "high",
      corrections: 0,
      extractorVersion: EXTRACTOR_VERSION,
      days: [],
    };
    const items = buildAdminAgendaPreview([{ label: "AGENDA", extracted }], {
      freshByLinkKey: new Set([0]),
    });
    expect(items[0]!.block).toBeNull();
  });

  test("(m) no freshByLinkKey → ALL links note-only regardless of extraction quality", () => {
    const extracted = makeHighConf(1, 3);
    const links = [
      { label: "AGENDA LINK - A", fileId: "a", extracted },
      { label: "AGENDA LINK - B", fileId: "b", extracted },
    ];
    // No opts at all
    expect(buildAdminAgendaPreview(links).every((i) => i.block === null)).toBe(true);
    // Explicit empty Set
    expect(
      buildAdminAgendaPreview(links, { freshByLinkKey: new Set() }).every((i) => i.block === null),
    ).toBe(true);
  });
});

// ── Per-link ordinal gate (n) ────────────────────────────────────────────────
describe("(n) per-link ordinal gate", () => {
  test("only ordinals in Set render blocks; absent ordinals are note-only", () => {
    const high = makeHighConf(1, 3);
    const links = [
      { label: "AGENDA LINK - A", fileId: "a", extracted: high }, // ordinal 0
      { label: "AGENDA LINK - B", fileId: "b", extracted: high }, // ordinal 1
      { label: "AGENDA LINK - C", fileId: "c", extracted: high }, // ordinal 2
    ];
    const items = buildAdminAgendaPreview(links, { freshByLinkKey: new Set([1]) });
    expect(items[0]!.block).toBeNull(); // ordinal 0 absent
    expect(items[1]!.block).not.toBeNull(); // ordinal 1 present
    expect(items[2]!.block).toBeNull(); // ordinal 2 absent
  });

  test("stale extracted whose ordinal is absent → note-only (builder never reads extractorVersion)", () => {
    // A high-conf payload with an old extractorVersion — builder must NOT inspect it.
    const staleHigh: AgendaExtraction = {
      confidence: "high",
      corrections: 0,
      extractorVersion: 0, // old/stale — must be ignored by the builder
      days: [
        {
          dayLabel: "Day 1",
          date: null,
          sessions: [{ time: "9:00 AM", title: "T", room: null, tracks: [], drift: null }],
        },
      ],
    };
    const links = [{ label: "AGENDA", extracted: staleHigh }];

    // Ordinal 0 NOT in Set → note-only (builder must not use version as a gate)
    expect(buildAdminAgendaPreview(links, { freshByLinkKey: new Set([]) })[0]!.block).toBeNull();

    // Same link WITH ordinal 0 in Set → block (version not consulted to reject it)
    expect(
      buildAdminAgendaPreview(links, { freshByLinkKey: new Set([0]) })[0]!.block,
    ).not.toBeNull();
  });
});

// ── Duplicate-fileId (n2) ─────────────────────────────────────────────────────
test("(n2) duplicate-fileId: ordinal 0 fresh, ordinal 1 absent → only ordinal 0 has block", () => {
  const high = makeHighConf(1, 2);
  const links = [
    { label: "AGENDA LINK - A", fileId: "shared-id", extracted: high }, // ordinal 0
    { label: "AGENDA LINK - B", fileId: "shared-id", extracted: high }, // ordinal 1
  ];
  const items = buildAdminAgendaPreview(links, { freshByLinkKey: new Set([0]) });
  expect(items[0]!.block).not.toBeNull();
  expect(items[1]!.block).toBeNull();
});

// ── agendaPdfHref ────────────────────────────────────────────────────────────
describe("agendaPdfHref", () => {
  test("(f) non-empty fileId → exact absolute Drive URL (not app-relative)", () => {
    const href = agendaPdfHref({ fileId: "abc123XYZ", url: "https://fallback.example.com" });
    expect(href).toBe("https://drive.google.com/file/d/abc123XYZ/view");
  });

  test("(g) no fileId, http url → link.url as-is", () => {
    expect(agendaPdfHref({ url: "https://example.com/agenda.pdf" })).toBe(
      "https://example.com/agenda.pdf",
    );
    expect(agendaPdfHref({ url: "http://example.org/file" })).toBe("http://example.org/file");
  });

  test("(h) no fileId, relative or empty url → null", () => {
    expect(agendaPdfHref({ url: "/relative/path" })).toBeNull();
    expect(agendaPdfHref({ url: "" })).toBeNull();
    expect(agendaPdfHref({ url: "ftp://unsupported" })).toBeNull();
    expect(agendaPdfHref({})).toBeNull();
  });

  test("(h2) validatedHrefs gate: false/absent → href: null; true → exact absolute URL", () => {
    const links = [{ label: "AGENDA", fileId: "file-abc" }];
    // No opts
    expect(buildAdminAgendaPreview(links)[0]!.href).toBeNull();
    // Explicit false
    expect(buildAdminAgendaPreview(links, { validatedHrefs: false })[0]!.href).toBeNull();
    // True → exact URL
    expect(buildAdminAgendaPreview(links, { validatedHrefs: true })[0]!.href).toBe(
      "https://drive.google.com/file/d/file-abc/view",
    );
  });

  test("(h2b) http-only link: validatedHrefs true → link.url; false → null", () => {
    const links = [{ label: "AGENDA", url: "https://host.example/agenda.pdf" }];
    expect(buildAdminAgendaPreview(links, { validatedHrefs: true })[0]!.href).toBe(
      "https://host.example/agenda.pdf",
    );
    expect(buildAdminAgendaPreview(links, { validatedHrefs: false })[0]!.href).toBeNull();
  });
});

// ── capExtractionForAdmin: cap enforcement ───────────────────────────────────
describe("capExtractionForAdmin", () => {
  test("(j) sessions overflow: 3 days × 4 sessions = 12 → droppedSessions = 12 - 8", () => {
    const ext = makeHighConf(3, 4); // 12 sessions total
    const totalSessions = ext.days.flatMap((d) => d.sessions).length;
    expect(totalSessions).toBe(12); // verify synthetic fixture

    const result = capExtractionForAdmin(ext);
    expect(result.droppedSessions).toBe(totalSessions - AGENDA_ADMIN_SESSIONS_CAP); // 4
    expect(result.extraction.days.flatMap((d) => d.sessions).length).toBe(
      AGENDA_ADMIN_SESSIONS_CAP,
    ); // 8
  });

  test("(k) day drop: with 3 days × 4 sessions, day 3 is entirely dropped", () => {
    // days 1+2 each have 4 sessions → fills the 8-session budget exactly; day 3 dropped
    const ext = makeHighConf(3, 4);
    const result = capExtractionForAdmin(ext);
    expect(result.droppedDays).toBe(1); // day 3 fully dropped
    expect(result.extraction.days).toHaveLength(2);
    expect(result.extraction.days[0]!.sessions).toHaveLength(4);
    expect(result.extraction.days[1]!.sessions).toHaveLength(4);
  });

  test("(l) tracks cap: 1 session with 9 tracks → droppedTracks = 9 - 6 = 3", () => {
    const ext = makeHighConf(1, 1, 9); // 1 day, 1 session, 9 tracks
    const result = capExtractionForAdmin(ext);
    expect(result.droppedTracks).toBe(9 - AGENDA_ADMIN_TRACKS_PER_SESSION_CAP); // 3
    expect(result.extraction.days[0]!.sessions[0]!.tracks).toHaveLength(
      AGENDA_ADMIN_TRACKS_PER_SESSION_CAP,
    ); // 6
    expect(result.droppedSessions).toBe(0); // no session dropped, only tracks trimmed
  });

  test("no cap needed (sessions ≤ 8, tracks ≤ 6) → all dropped* = 0", () => {
    const ext = makeHighConf(2, 3, 4); // 6 sessions, 4 tracks each — well within cap
    const result = capExtractionForAdmin(ext);
    expect(result.droppedSessions).toBe(0);
    expect(result.droppedDays).toBe(0);
    expect(result.droppedTracks).toBe(0);
    // All days preserved
    expect(result.extraction.days).toHaveLength(2);
  });

  test("session cap mid-day: partial day truncation counts dropped sessions, day not dropped", () => {
    // 1 day with 10 sessions → cap at 8, 2 dropped sessions; day itself is kept (not a droppedDay)
    const ext = makeHighConf(1, 10);
    const result = capExtractionForAdmin(ext);
    expect(result.droppedSessions).toBe(2);
    expect(result.droppedDays).toBe(0); // day is partially kept, not dropped
    expect(result.extraction.days).toHaveLength(1);
    expect(result.extraction.days[0]!.sessions).toHaveLength(AGENDA_ADMIN_SESSIONS_CAP); // 8
  });
});

// ── AGENDA_MAX_PDFS_PER_SHEET cap ────────────────────────────────────────────
test("items capped at AGENDA_MAX_PDFS_PER_SHEET (6) even when more links provided", () => {
  const links = Array.from({ length: 8 }, (_, i) => ({
    label: `AGENDA LINK - ${i + 1}`,
    fileId: `id-${i}`,
  }));
  const items = buildAdminAgendaPreview(links);
  expect(items).toHaveLength(AGENDA_MAX_PDFS_PER_SHEET); // 6
});

// ── badge when link count > 1 ────────────────────────────────────────────────
describe("badge field", () => {
  test("single link → badge: null regardless of label suffix", () => {
    const items = buildAdminAgendaPreview([{ label: "AGENDA LINK - RFI" }]);
    expect(items[0]!.badge).toBeNull();
  });

  test("multiple links → badge from agendaDisplayLabel; bare AGENDA label → badge: null", () => {
    const high = makeHighConf(1, 2);
    const links = [
      { label: "AGENDA LINK - RFI", extracted: high },
      { label: "AGENDA LINK - PCF", extracted: high },
      { label: "AGENDA", extracted: high }, // bare label → agendaDisplayLabel returns null
    ];
    const items = buildAdminAgendaPreview(links, { freshByLinkKey: new Set([0, 1, 2]) });
    expect(items[0]!.badge).toBe("RFI");
    expect(items[1]!.badge).toBe("PCF");
    expect(items[2]!.badge).toBeNull(); // no suffix on bare "AGENDA"
  });
});
