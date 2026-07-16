import { describe, expect, test } from "vitest";
import { computeAutofixShows, type AutofixRow } from "@/lib/notify/monitorDigest";

// Spec 2026-07-16 §3 — source-aware notice fingerprint (code|anchor|item), per-show
// grouping in stream order, NO count capping in the model, 200-char display cap
// AFTER dedupe. Rows arrive pre-ordered (occurred_at desc) — the query owns ordering.
const warn = (over: Record<string, unknown> = {}) => ({
  severity: "warn",
  code: "STAGE_WORD_AUTOCORRECTED",
  message: "Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: 'A1 Sage'",
  ...over,
});
const row = (drive: string, warnings: unknown[], over: Partial<AutofixRow> = {}): AutofixRow => ({
  drive_file_id: drive,
  slug: `slug-${drive}`,
  title: `Title ${drive}`,
  parse_warnings: warnings,
  occurred_at: "2099-01-01T10:00:00Z",
  ...over,
});

describe("computeAutofixShows", () => {
  test("same notice across two rows of one show collapses (the inflation bug)", () => {
    const r = computeAutofixShows([row("a", [warn()]), row("a", [warn()])]);
    expect(r.total).toBe(1);
    expect(r.shows).toHaveLength(1);
    expect(r.shows[0]!.items).toHaveLength(1);
  });

  test("distinct notices across rows ALL survive (event semantics)", () => {
    const r = computeAutofixShows([
      row("a", [warn({ message: "corrected 'x' as 'y'" })]),
      row("a", [warn({ message: "corrected 'p' as 'q'" })]),
    ]);
    expect(r.total).toBe(2);
    expect(r.shows[0]!.items).toEqual(["corrected 'x' as 'y'", "corrected 'p' as 'q'"]);
  });

  test("same item text under two codes stays distinct (label-fallback isolation)", () => {
    const r = computeAutofixShows([
      row("a", [
        warn({ message: "same text" }),
        warn({ code: "ROLE_TOKEN_AUTOCORRECTED", message: "same text" }),
      ]),
    ]);
    expect(r.total).toBe(2);
  });

  test("anchored identity: cells, ranges, unanchored — full matrix", () => {
    const m = "Read likely-misspelled stage word(s) 'A' as 'B' in role cell: 'X'";
    const sc = (a1: string) => ({ title: "T", gid: 7, a1 });
    const cases: Array<[unknown[], number]> = [
      // same message, different cells → 2
      [[warn({ message: m, sourceCell: sc("C3") }), warn({ message: m, sourceCell: sc("D4") })], 2],
      // same message, same range anchor → 1 (§3 residual b)
      [
        [
          warn({ message: m, sourceCell: sc("B2:D9") }),
          warn({ message: m, sourceCell: sc("B2:D9") }),
        ],
        1,
      ],
      // same message, different range anchors → 2
      [
        [
          warn({ message: m, sourceCell: sc("B2:D9") }),
          warn({ message: m, sourceCell: sc("E2:G9") }),
        ],
        2,
      ],
      // same message, both unanchored → 1 (§3 residual a)
      [[warn({ message: m }), warn({ message: m })], 1],
      // same anchor, different messages → 2
      [
        [
          warn({ message: m, sourceCell: sc("C3") }),
          warn({ message: "other 'x' as 'y'", sourceCell: sc("C3") }),
        ],
        2,
      ],
    ];
    for (const [warnings, expected] of cases) {
      expect(computeAutofixShows([row("a", warnings)]).total).toBe(expected);
    }
  });

  test("dedupe keys on the UNCAPPED item; display caps at 200 + ellipsis", () => {
    const prefix = `corrected 'x' as 'y' ${"pad ".repeat(55)}`; // > 200 chars, not token-shaped
    const r = computeAutofixShows([
      row("a", [warn({ message: `${prefix}ONE` }), warn({ message: `${prefix}TWO` })]),
    ]);
    expect(r.total).toBe(2); // shared >200-char prefix must NOT collapse
    for (const item of r.shows[0]!.items) {
      expect(item.length).toBe(201); // 200 + ellipsis
      expect(item.endsWith("…")).toBe(true);
    }
  });

  test("token straddling the 200-char cap boundary never leaks a partial secret into the capped item", () => {
    // Token spans the cap boundary: a cap-then-redact pipeline would truncate it to a
    // sub-24-char prefix that escapes the redactor and ships in the email.
    const msg = `corrected 'x' as 'y' ${"pad ".repeat(40)} STRADDLE0123456789ABCDEF0123456789 tail`;
    const r = computeAutofixShows([row("a", [warn({ message: msg })])]);
    const item = r.shows[0]!.items[0]!;
    expect(item).not.toContain("STRADDLE");
    expect(item).toContain("[redacted-token]");
  });

  test("zero-autofix rows never seed show order: rank by latest NOTICE, not latest sync", () => {
    // Stream (occurred_at desc): A's clean row, B's notice, A's older notice.
    // Wrong (eager Map insertion on any row): A ranks first. Right: B first.
    const r = computeAutofixShows([
      row("a", [{ kind: "payload" }], { occurred_at: "2099-01-01T10:30:00Z" }),
      row("b", [warn({ message: "corrected 'b' as 'B'" })], {
        occurred_at: "2099-01-01T10:00:00Z",
      }),
      row("a", [warn({ message: "corrected 'a' as 'A'" })], {
        occurred_at: "2099-01-01T09:00:00Z",
      }),
    ]);
    expect(r.shows.map((s) => s.slug)).toEqual(["slug-b", "slug-a"]);
    expect(r.total).toBe(2);
  });

  test("dedupe scope is PER SHOW: identical fingerprint on two different shows keeps both", () => {
    // A global seen-set implementation would drop the second show's notice.
    const m = "Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: 'A1 Sage'";
    const r = computeAutofixShows([
      row("a", [warn({ message: m })]),
      row("b", [warn({ message: m })]),
    ]);
    expect(r.total).toBe(2);
    expect(r.shows.map((s) => s.slug)).toEqual(["slug-a", "slug-b"]);
    expect(r.shows.every((s) => s.items.length === 1)).toBe(true);
  });

  test("NO count capping in the model: 13 shows and >5 items all preserved, stream order kept", () => {
    const rows: AutofixRow[] = [];
    for (let i = 0; i < 13; i++) {
      rows.push(row(`show-${i}`, [warn({ message: `corrected 'a' as 'b' #${i}` })]));
    }
    rows.push(
      row("show-0", [
        ...Array.from({ length: 6 }, (_, j) => warn({ message: `extra 'c' as 'd' #${j}` })),
      ]),
    );
    const r = computeAutofixShows(rows);
    expect(r.shows).toHaveLength(13); // all preserved — caps are render-only
    expect(r.shows.map((s) => s.slug)).toEqual(rows.slice(0, 13).map((x) => x.slug));
    expect(r.shows[0]!.items).toHaveLength(7); // 1 + 6, all preserved
    expect(r.total).toBe(19);
  });

  test("show with zero autofix items is omitted; empty rows → total 0", () => {
    const r = computeAutofixShows([
      row("a", [{ kind: "payload" }, warn({ code: "FIELD_UNREADABLE" })]),
    ]);
    expect(r).toEqual({ total: 0, shows: [] });
    expect(computeAutofixShows([])).toEqual({ total: 0, shows: [] });
  });

  test("carries title/slug (attribution)", () => {
    const r = computeAutofixShows([row("a", [warn()])]);
    expect(r.shows[0]).toMatchObject({ showTitle: "Title a", slug: "slug-a" });
  });
});

describe("autofix query shape (spec §3 ORDER BY pin)", () => {
  test("query orders by occurred_at desc, drive_file_id asc, id asc", async () => {
    const { buildMonitorDigestModel } = await import("@/lib/notify/monitorDigest");
    const captured: string[] = [];
    const sqlFake = ((strings: TemplateStringsArray, ..._v: unknown[]) => {
      captured.push(strings.join("?"));
      return Promise.resolve([]);
    }) as unknown as import("@/lib/notify/digest").DigestBuilderSql;
    const r = await buildMonitorDigestModel(new Date("2099-01-01T12:00:00Z"), {
      sql: sqlFake,
      getWatermark: async () => ({ kind: "value", watermark: new Date("2098-01-01T00:00:00Z") }),
    });
    expect(r.kind).toBe("empty");
    const autofixQuery = captured.find(
      (q) => q.includes("parse_warnings") && !q.includes("row_number"),
    );
    expect(autofixQuery).toMatch(/order by sl\.occurred_at desc, sl\.drive_file_id asc, sl\.id asc/);
  });
});
