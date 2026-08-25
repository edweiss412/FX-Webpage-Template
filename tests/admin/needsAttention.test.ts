// M12.2 Phase A Task 3 — buildNeedsAttention (PURE, no Supabase). Two streams
// (pending_ingestions + pending_syncs), merged newest-first by current-activity
// time (last_attempt_at / staged_modified_time), sliced ONCE to RENDER_CAP,
// classified (first_seen vs existing_staged) AFTER the slice via the existence
// map. Counts come from exact totals, not the capped array (spec §5.3).
//
// resolveIngestionCopy is the catalog-safe copy resolver (spec §7): unknown
// code / unresolved placeholder / non-catalog code -> the FIXED generic
// SHEET_PROCESS_FAILED copy; NEVER a raw code, raw message, or <…> token.
import { describe, expect, it } from "vitest";
import {
  RENDER_CAP,
  buildNeedsAttention,
  resolveIngestionCopy,
  type BuildNeedsAttentionInput,
  type NeedsAttentionIdentityHoldInput,
} from "@/lib/admin/needsAttention";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const GENERIC = MESSAGE_CATALOG.SHEET_PROCESS_FAILED.dougFacing;

function iso(day: number): string {
  // deterministic descending-friendly ISO timestamps
  return `2026-06-${String(day).padStart(2, "0")}T00:00:00.000Z`;
}

describe("buildNeedsAttention", () => {
  it("merges two streams newest-first, slices once to RENDER_CAP, classifies after slice", () => {
    // Build > RENDER_CAP interleaved rows across BOTH streams.
    const ingestions = Array.from({ length: RENDER_CAP }, (_, i) => ({
      id: `ing-${i}`,
      driveFileId: `df-ing-${i}`,
      driveFileName: `Sheet ${i}`,
      lastErrorCode: "DRIVE_FETCH_FAILED",
      // even days so they interleave with syncs on odd days
      lastAttemptAt: iso(2 + (i % 27)),
    }));
    const syncs = Array.from({ length: RENDER_CAP }, (_, i) => ({
      stagedId: `stg-${i}`,
      driveFileId: `df-stg-${i}`,
      candidateTitle: `Candidate ${i}`,
      stagedModifiedTime: iso(2 + ((i + 13) % 27)),
    }));
    const input: BuildNeedsAttentionInput = {
      ingestions,
      syncs,
      existence: {},
      totalCounts: { ingestions: ingestions.length, syncs: syncs.length },
    };
    const result = buildNeedsAttention(input);

    expect(result.items.length).toBe(RENDER_CAP);
    expect(result.renderedCount).toBe(RENDER_CAP);
    expect(result.totalCount).toBe(2 * RENDER_CAP);
    expect(result.overflowCount).toBe(2 * RENDER_CAP - RENDER_CAP);

    // Global newest-first ordering across BOTH streams (descending sortKey).
    const sortKeys = result.items.map((it) => {
      if (!("driveFileId" in it)) return null; // sync_problem never appears in these fixtures
      return it.variant === "pending_ingestion"
        ? ingestions.find((g) => g.driveFileId === it.driveFileId)!.lastAttemptAt
        : syncs.find((s) => s.driveFileId === it.driveFileId)!.stagedModifiedTime;
    });
    const sorted = [...sortKeys].sort((a, b) => (b ?? "").localeCompare(a ?? ""));
    expect(sortKeys).toEqual(sorted);
  });

  it("classifies a sync as existing_staged when its drive_file_id is in the existence set (any published/archived), else first_seen", () => {
    const input: BuildNeedsAttentionInput = {
      ingestions: [],
      syncs: [
        { stagedId: "a", driveFileId: "df-known", candidateTitle: "K", stagedModifiedTime: iso(5) },
        { stagedId: "b", driveFileId: "df-new", candidateTitle: "N", stagedModifiedTime: iso(4) },
      ],
      existence: {
        // archived + unpublished existing show still classifies as existing_staged
        "df-known": { slug: "known-show", title: "Known", published: false, archived: true },
      },
      totalCounts: { ingestions: 0, syncs: 2 },
    };
    const result = buildNeedsAttention(input);
    const known = result.items.find((i) => "driveFileId" in i && i.driveFileId === "df-known")!;
    const fresh = result.items.find((i) => "driveFileId" in i && i.driveFileId === "df-new")!;
    expect(known.variant).toBe("existing_staged");
    expect(known.variant === "existing_staged" && known.slug).toBe("known-show");
    expect(fresh.variant).toBe("first_seen");
  });

  it("does NOT drop a first_seen sync newer than several existing_staged rows (single pending_syncs stream)", () => {
    // RENDER_CAP existing_staged syncs (older) + 1 first_seen sync (newest).
    const syncs = [
      {
        stagedId: "new",
        driveFileId: "df-new",
        candidateTitle: "New",
        stagedModifiedTime: iso(28),
      },
      ...Array.from({ length: RENDER_CAP }, (_, i) => ({
        stagedId: `old-${i}`,
        driveFileId: `df-known-${i}`,
        candidateTitle: `Old ${i}`,
        stagedModifiedTime: iso(2 + (i % 20)),
      })),
    ];
    const existence: BuildNeedsAttentionInput["existence"] = {};
    for (let i = 0; i < RENDER_CAP; i++) {
      existence[`df-known-${i}`] = {
        slug: `s-${i}`,
        title: `T${i}`,
        published: true,
        archived: false,
      };
    }
    const result = buildNeedsAttention({
      ingestions: [],
      syncs,
      existence,
      totalCounts: { ingestions: 0, syncs: syncs.length },
    });
    const fresh = result.items.find((i) => "driveFileId" in i && i.driveFileId === "df-new");
    expect(fresh).toBeDefined();
    expect(fresh!.variant).toBe("first_seen");
  });

  it("orders pending_ingestions by last_attempt_at (retry stays top), tie-broken deterministically", () => {
    const result = buildNeedsAttention({
      ingestions: [
        {
          id: "old-retry",
          driveFileId: "df-1",
          driveFileName: "Re-failing",
          lastErrorCode: "DRIVE_FETCH_FAILED",
          lastAttemptAt: iso(20),
        },
        {
          id: "recent",
          driveFileId: "df-2",
          driveFileName: "Recent",
          lastErrorCode: "DRIVE_FETCH_FAILED",
          lastAttemptAt: iso(10),
        },
      ],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 2, syncs: 0 },
    });
    const first = result.items[0]!;
    expect("driveFileId" in first && first.driveFileId).toBe("df-1"); // higher last_attempt_at first
  });
});

describe("resolveIngestionCopy (catalog-safe, spec §7)", () => {
  it("renders the catalog dougFacing with the real sheet name when the code resolves", () => {
    // DRIVE_FETCH_FAILED's <sheet-name> placeholder is interpolated with the
    // fixture's real sheet name; derive the expected string from the catalog
    // template rather than hardcoding a second copy of it.
    const driveFileName = "Validation — Normal day";
    const copy = resolveIngestionCopy({
      code: "DRIVE_FETCH_FAILED",
      driveFileName,
    });
    expect(copy).toBe(
      MESSAGE_CATALOG.DRIVE_FETCH_FAILED.dougFacing.replace("<sheet-name>", () => driveFileName),
    );
    expect(copy).not.toMatch(/<[a-z-]+>/i);
  });

  it("strips catalog emphasis markers so plaintext surfaces (email body, inbox copy line) never show literal * or _", () => {
    // MI-2_TITLE_MISSING.dougFacing = "_<sheet-name>_ doesn't have a recognizable…".
    // resolveIngestionCopy feeds both the realtime/digest email bodies AND the
    // in-app NeedsAttentionInbox copy line (item.copy, rendered raw) — neither
    // renders Markdown, so the markers must be stripped, not leaked.
    const copy = resolveIngestionCopy({
      code: "MI-2_TITLE_MISSING",
      driveFileName: "Broken Sheet",
    });
    expect(copy).toBe(
      "Broken Sheet doesn't have a recognizable show title. Add or fix the CLIENT row.",
    );
    expect(copy).not.toContain("_");
    expect(copy).not.toContain("<sheet-name>");
  });

  it("preserves a sheet name that itself contains marker characters (strip the template, not the value)", () => {
    // Param-safety mirror of renderCatalogEmphasis (Codex R1): markers are
    // stripped on the TEMPLATE, then the sheet name is interpolated as opaque
    // text, so a file literally named "Foo *draft*" survives byte-for-byte.
    const copy = resolveIngestionCopy({ code: "MI-2_TITLE_MISSING", driveFileName: "Foo *draft*" });
    expect(copy).toBe(
      "Foo *draft* doesn't have a recognizable show title. Add or fix the CLIENT row.",
    );
  });

  it("falls back to generic for an unknown / non-catalog code (e.g. parser alias)", () => {
    expect(resolveIngestionCopy({ code: "MI-2_EMPTY_TITLE", driveFileName: "x" })).toBe(GENERIC);
  });

  it("falls back to generic for a null code", () => {
    expect(resolveIngestionCopy({ code: null, driveFileName: "x" })).toBe(GENERIC);
  });

  it("falls back to generic when the resolved copy still has an unfilled <…> placeholder", () => {
    // SHOW_FIRST_PUBLISHED carries <crew-count>/<show-date> beyond <sheet-name>.
    const copy = resolveIngestionCopy({ code: "SHOW_FIRST_PUBLISHED", driveFileName: "x" });
    expect(copy).toBe(GENERIC);
    expect(copy).not.toMatch(/<[a-z-]+>/i);
  });

  it("falls back to generic for a crew-only code whose dougFacing is null", () => {
    expect(resolveIngestionCopy({ code: "GOOGLE_NO_CREW_MATCH", driveFileName: "x" })).toBe(
      GENERIC,
    );
  });
});

// ── Needs-attention holds rollup Task 3 (spec 2026-08-03 §5): the fourth
// stream. Groups arrive from lib/admin/identityHolds (one per show, summaries
// newest-first); the builder sorts them among the other streams by
// newestCreatedAt and forks copy on summary count.
describe("identity_hold stream", () => {
  const holdGroup = (
    over: Partial<NeedsAttentionIdentityHoldInput> = {},
  ): NeedsAttentionIdentityHoldInput => ({
    showId: "sX",
    slug: "sx",
    title: "Show X",
    summaries: ["Jane Doe's email is changing"],
    newestCreatedAt: "2026-08-03T12:00:00+00:00",
    ...over,
  });

  it("single-hold copy is summaries[0]; multi-hold copy is the count line", () => {
    const single = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0, identityHolds: 1 },
      identityHolds: [holdGroup()],
    });
    const item = single.items[0];
    if (item?.variant !== "identity_hold") throw new Error("wrong variant");
    expect(item.copy).toBe("Jane Doe's email is changing");
    const multi = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0, identityHolds: 1 },
      identityHolds: [holdGroup({ summaries: ["a", "b", "c"] })],
    });
    const m = multi.items[0];
    if (m?.variant !== "identity_hold") throw new Error("wrong variant");
    expect(m.copy).toBe("3 held changes waiting");
  });

  it("sorts by newestCreatedAt among other streams, asserted BY KEY (fixture-timestamp-derived)", () => {
    // hold T3 > sync st1 T2 > sync st2 T1. Keys distinguish the two first_seen
    // items, so a T2/T1 swap FAILS (plan-R1 F10; variant-only assertions cannot).
    const out = buildNeedsAttention({
      ingestions: [],
      syncs: [
        {
          stagedId: "st1",
          driveFileId: "d1",
          candidateTitle: "A",
          stagedModifiedTime: "2026-08-03T02:00:00+00:00",
        },
        {
          stagedId: "st2",
          driveFileId: "d2",
          candidateTitle: "B",
          stagedModifiedTime: "2026-08-03T01:00:00+00:00",
        },
      ],
      existence: {},
      identityHolds: [holdGroup({ newestCreatedAt: "2026-08-03T03:00:00+00:00" })],
      totalCounts: { ingestions: 0, syncs: 2, identityHolds: 1 },
    });
    expect(out.items.map((i) => i.key)).toEqual(["hold-show:sX", "sync:st1", "sync:st2"]);
    expect(out.totalCount).toBe(3);
    expect(out.identityHoldTotal).toBe(1);
  });

  it("over-cap arithmetic: stream total above rendered cards keeps totals honest (spec §9.2)", () => {
    const out = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      existence: {},
      identityHolds: [
        holdGroup({ showId: "s1", slug: "s1", newestCreatedAt: "2026-08-03T05:00:00+00:00" }),
        holdGroup({ showId: "s2", slug: "s2", newestCreatedAt: "2026-08-03T04:00:00+00:00" }),
      ],
      totalCounts: { ingestions: 0, syncs: 0, identityHolds: 2 },
      cap: 1,
    });
    expect(out.items).toHaveLength(1);
    expect(out.renderedCount).toBe(1);
    expect(out.identityHoldTotal).toBe(2);
    expect(out.totalCount).toBe(2);
    expect(out.overflowCount).toBe(1);
  });

  it("omitted new keys: additive identityHoldTotal 0, everything else the pre-change shape (digest regression fence)", () => {
    const args = {
      ingestions: [],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0 },
    };
    // Expected shape built by hand, NEVER a second call to the same function
    // (self-comparison is tautological).
    expect(buildNeedsAttention(args)).toEqual({
      items: [],
      renderedCount: 0,
      totalCount: 0,
      overflowCount: 0,
      ingestionTotal: 0,
      syncTotal: 0,
      syncProblemTotal: 0,
      identityHoldTotal: 0,
    });
  });

  it("skips a defensive empty-summaries group", () => {
    const out = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0, identityHolds: 1 },
      identityHolds: [holdGroup({ summaries: [] })],
    });
    expect(out.items).toEqual([]);
  });

  it("equal newestCreatedAt tie-breaks by showId ascending", () => {
    const t = "2026-08-03T05:00:00+00:00";
    const out = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0, identityHolds: 2 },
      identityHolds: [
        holdGroup({ showId: "zz", slug: "zz", newestCreatedAt: t }),
        holdGroup({ showId: "aa", slug: "aa", newestCreatedAt: t }),
      ],
    });
    const ids = out.items.map((i) => (i.variant === "identity_hold" ? i.showId : ""));
    expect(ids).toEqual(["aa", "zz"]);
  });
});
