/**
 * tests/components/admin/review/sectionFreshness.test.ts
 *
 * The section-freshness DETECTOR (spec 2026-08-03-modal-freshness-cue section 11.1).
 *
 * Every case drives the REAL pipeline: an RPC-shaped snapshot through
 * `buildPublishedSectionData` and, where warnings matter, through
 * `buildSectionWarningModel`. Hand-written `PublishedSectionData` literals are
 * deliberately avoided — a literal proves the hash function hashes, not that it
 * isolates a real edit through the real adapter.
 *
 * The rows named D1..D14 are the spec's, kept in its order so a reader can check
 * coverage against the table without translating.
 */
import { describe, expect, it } from "vitest";

import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { renderedSectionIds } from "@/components/admin/review/sectionInclusion";
import {
  buildSectionSignatures,
  changedSectionIds,
} from "@/components/admin/review/sectionFreshness";
import { ROOMS_CAP, SCHEDULE_ENTRIES_CAP } from "@/components/admin/wizard/step3ReviewSections";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { SECTION_REGION_MAP, type SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import type { AttentionItem } from "@/lib/admin/attentionItems";

import {
  reviewSnapshot,
  routedWarn,
  roomSplitDecision,
  roomSplitWarn,
  SLUG,
} from "./__fixtures__/reviewSnapshot";

/** The whole pipeline the modal runs, so a test never has to reproduce it. */
function signaturesOf(snapshot: ShowReviewSnapshot) {
  const data = buildPublishedSectionData(snapshot, { slug: SLUG });
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints: new Set<string>(),
    renderedSectionIds: new Set(renderedSectionIds(data)),
  });
  return buildSectionSignatures({ data, bySection, attentionBySection: NO_ATTENTION });
}

/** Most cases carry no attention items; the ones that do build their own map. */
const NO_ATTENTION: ReadonlyMap<string, readonly AttentionItem[]> = new Map();

/** Base snapshot to a mutated one, as the detector would see it across a refresh. */
function changedBetween(mutate: (s: ShowReviewSnapshot) => void): SectionId[] {
  const before = signaturesOf(reviewSnapshot());
  const after = reviewSnapshot();
  mutate(after);
  return changedSectionIds(before, signaturesOf(after));
}

/** Every id the fixture actually renders, derived rather than hardcoded. */
function renderedIds(): SectionId[] {
  const data = buildPublishedSectionData(reviewSnapshot(), { slug: SLUG });
  return [...renderedSectionIds(data)];
}

const showOf = (s: ShowReviewSnapshot) => s.show as Record<string, unknown>;
const internalOf = (s: ShowReviewSnapshot) => s.internal as Record<string, unknown>;
const rowOf = (rows: unknown[], i: number) => rows[i] as Record<string, unknown>;

describe("section freshness detector", () => {
  // Guards the guard: if the fixture stopped rendering sections, every
  // "changed = []" row below would pass vacuously.
  it("fixture renders every rail section the modal can show", () => {
    const ids = renderedIds();
    expect(ids).toContain("agenda");
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(signaturesOf(reviewSnapshot()).size).toBe(ids.length);
  });

  it("D1: two identical snapshots produce zero changed ids", () => {
    // The modal's own once-per-mount refresh re-serialises identical content into
    // a NEW object. A detector comparing identity would flash on every open.
    expect(changedBetween(() => {})).toEqual([]);
  });

  it("D2: reordered crew, room and contact rows produce zero changed ids", () => {
    // The adapter sorts these three itself, so input order cannot reach the hash.
    expect(
      changedBetween((s) => {
        s.crew_members = [...s.crew_members].reverse();
        s.rooms = [...s.rooms].reverse();
        s.contacts = [...s.contacts].reverse();
      }),
    ).toEqual([]);
  });

  it("D2b: hotels are NOT adapter-sorted, so a reordered hotel input DOES change", () => {
    // Round-1 review refuted the blanket reorder claim by probe. `hotels` is a
    // bare map over the RPC's rows (publishedAdapter.ts), unlike crew/rooms/
    // contacts. Ordering there is the RPC's `order by h.ordinal, h.id`, not the
    // adapter's. Asserting the TRUE behavior keeps the spec honest about which
    // mechanism guarantees what.
    expect(
      changedBetween((s) => void (s.hotel_reservations = [...s.hotel_reservations].reverse())),
    ).toEqual(["hotels"]);
  });

  it("D3: one edited crew role changes exactly crew, and every other id is byte-identical", () => {
    const before = signaturesOf(reviewSnapshot());
    const after = reviewSnapshot();
    rowOf(after.crew_members, 0).role = "A2";
    const nextSigs = signaturesOf(after);

    expect(changedSectionIds(before, nextSigs)).toEqual(["crew"]);
    // The exclusivity half, stated directly rather than inferred from the diff:
    // if the projection leaked a crew field into another section, this catches it
    // even if `changedSectionIds` were the thing that was broken.
    for (const id of renderedIds()) {
      if (id === "crew") continue;
      expect(nextSigs.get(id), `${id} must not move when only a crew role changed`).toBe(
        before.get(id),
      );
    }
  });

  it("D4: moving only the sync stamps produces zero changed ids", () => {
    // `last_checked_at` moves on every successful poll whether or not content
    // changed. Cueing there would contradict the StatusStrip's own readout.
    expect(
      changedBetween((s) => {
        showOf(s).last_checked_at = "2026-08-03T18:00:00Z";
        showOf(s).last_synced_at = "2026-08-03T18:00:00Z";
        showOf(s).last_sync_status = "ok";
      }),
    ).toEqual([]);
  });

  it("D5: toggling published changes exactly the sections whose CONTROLS it gates", () => {
    // This row asserted "zero changed ids" until the whole-diff review falsified
    // its premise by probe. `published && !archived` gates the crew row actions
    // (`step3ReviewSections.tsx:4183`) and the pack-list archived-tab affordances
    // (`:4310`), so an unpublish visibly removes a control from every crew row.
    // The cue must fire: a card that changed and did not flash is the miss this
    // whole feature exists to prevent. Every OTHER section stays silent, which is
    // what keeps the lifecycle flag from leaking in as content.
    const changed = changedBetween((s) => void (showOf(s).published = false));
    expect([...changed].sort()).toEqual(["crew", "packlist"]);
  });

  it("D5b: a field the section never renders produces zero changed ids", () => {
    // The other half of the same contract, and the reason the projections are
    // narrowed rather than hashing whole rows. Each of these is read by the
    // adapter and reaches NO DOM: `confirmation_no` is documented as never
    // rendered (`step3ReviewSections.tsx:2719`), and the rest have no reader in
    // the section bodies at all. Hashing them flashed byte-identical cards.
    expect(
      changedBetween((s) => {
        rowOf(s.hotel_reservations, 0).confirmation_no = "ZZZ999";
        rowOf(s.hotel_reservations, 0).notes = "private note";
        rowOf(s.crew_members, 0).role_flags = ["LEAD"];
        rowOf(s.crew_members, 0).flight_info = "AA123";
        rowOf(s.rooms, 0).power = "3 phase";
        rowOf(s.rooms, 0).digital_signage = "yes";
        rowOf(s.rooms, 0).notes = "room note";
        rowOf(s.contacts, 0).notes = "contact note";
        (showOf(s).venue as Record<string, unknown>).timezone = "America/New_York";
        (showOf(s).venue as Record<string, unknown>).notes = "venue note";
      }),
    ).toEqual([]);
  });

  it("D5c: changing ONE rendered field cues exactly its own section, per section", () => {
    // The systematic partner to D5b. D5b proves unrendered fields stay silent;
    // without this, narrowing a projection too far would ALSO stay silent and
    // pass. A surviving mutant is what motivated it: dropping `check_in` from the
    // hotel key list broke nothing, because no case moved a hotel date.
    //
    // One rendered field per section, each asserted EXCLUSIVE, so a projection
    // that leaked a field into a neighbour fails here too.
    const cases: Array<[SectionId, (s: ShowReviewSnapshot) => void]> = [
      ["venue", (s) => void ((showOf(s).venue as Record<string, unknown>).address = "9 Side St")],
      [
        "event",
        (s) => void ((showOf(s).event_details as Record<string, unknown>).dress_code = "black tie"),
      ],
      ["crew", (s) => void (rowOf(s.crew_members, 0).role = "A2")],
      ["contacts", (s) => void (rowOf(s.contacts, 0).phone = "512-555-9999")],
      ["hotels", (s) => void (rowOf(s.hotel_reservations, 0).check_in = "2026-08-02")],
      ["hotels", (s) => void (rowOf(s.hotel_reservations, 0).hotel_name = "Westin")],
      ["transport", (s) => void (rowOf(s.transportation, 0).vehicle = "16ft truck")],
      ["rooms", (s) => void (rowOf(s.rooms, 0).audio = "d&b")],
      ["rooms", (s) => void (rowOf(s.rooms, 0).set_time = "07:00")],
      ["billing", (s) => void (showOf(s).coi_status = "pending")],
    ];
    for (const [id, mutate] of cases) {
      expect(changedBetween(mutate), `${id}: a rendered field must cue its own section`).toEqual([
        id,
      ]);
    }
  });

  it("D6: a full re-parse changes every rendered section", () => {
    // The anti-tautology partner of D3: without it, a projection that returned a
    // single entry would satisfy every "exactly one id" row above.
    const changed = changedBetween((s) => {
      (showOf(s).venue as Record<string, unknown>).city = "Dallas";
      // A key from the closed EVENT_DETAIL_GROUPS vocabulary: anything outside it
      // renders nowhere, so mutating an unknown key would leave Event silent
      // and this assertion would be measuring the wrong thing.
      (showOf(s).event_details as Record<string, unknown>).dress_code = "black tie";
      (showOf(s).client_contact as Record<string, unknown>).name = "Sam Client";
      (showOf(s).dates as Record<string, unknown>).travelOut = "2026-08-06";
      showOf(s).pull_sheet = [{ caseLabel: "Audio", items: [{ qty: 1, item: "console" }] }];
      showOf(s).coi_status = "pending";
      showOf(s).agenda_links = [
        { label: "Revised run of show", fileId: "AGENDA_FILE_2", extracted: { pages: 2 } },
      ];
      rowOf(s.crew_members, 0).role = "A2";
      rowOf(s.rooms, 0).name = "Grand Ballroom East";
      rowOf(s.hotel_reservations, 0).hotel_name = "Westin";
      rowOf(s.transportation, 0).vehicle = "16ft box truck";
      rowOf(s.contacts, 0).name = "Val Venue";
      // Two warns: one routed to venue, one to NO section (an unmapped kind), which
      // is what lands in the Sheet-warnings panel. Since `warnings` stopped
      // hashing the whole list, a venue-routed warn alone would no longer move
      // it, and D6 would be asserting a section it never actually changed.
      internalOf(s).parse_warnings = [routedWarn("venue"), routedWarn("unmapped_block")];
      internalOf(s).run_of_show = {
        "2026-08-03": { entries: [{ start: "09:00", title: "Doors", kind: "session" }] },
      };
    });
    // Derived from the fixture, never hardcoded: a section list that drifted would
    // otherwise silently shrink this assertion.
    expect([...changed].sort()).toEqual([...renderedIds()].sort());
  });

  it("D7: a section absent from the rendered set never appears in the signature map", () => {
    const withAgenda = signaturesOf(reviewSnapshot());
    expect(withAgenda.has("agenda")).toBe(true);

    const empty = reviewSnapshot();
    showOf(empty).agenda_links = [];
    const withoutAgenda = signaturesOf(empty);
    expect(withoutAgenda.has("agenda")).toBe(false);
    // `report` is staged-only and must never appear on this surface at all.
    expect(withAgenda.has("report")).toBe(false);
    expect(withoutAgenda.has("report")).toBe(false);
  });

  it("D8: guard-condition values hash stably across two builds", () => {
    const build = () => {
      const s = reviewSnapshot();
      showOf(s).event_details = null;
      showOf(s).client_contact = undefined;
      showOf(s).pull_sheet = [];
      showOf(s).diagrams = {};
      showOf(s).venue = { name: "Grand Hall", capacity: Number.NaN };
      s.contacts = [];
      return signaturesOf(s);
    };
    expect(changedSectionIds(build(), build())).toEqual([]);
  });

  it("D9: the FIRST crew-routed warn changes crew AND the elsewhere sentence", () => {
    // Round-1 BLOCKING for the omission: the routed card renders INSIDE the crew
    // panel, so the crew card's content changed while `crewMembers` did not.
    // Round-2 HIGH for the over-correction: the published Sheet-warnings panel
    // renders only what routed to IT, so an externally routed warn's CONTENT
    // must not cue it (see D9b, which holds the count fixed and gets crew alone).
    //
    // Whole-diff R2 BLOCKING for the third state, which both earlier rounds
    // missed. With no warnings of its own, the Sheet-warnings panel renders a
    // sentence NAMING the sections that carry them
    // (`step3ReviewSections.tsx:2906`). Going from zero routed warnings to one
    // takes that panel from "no sentence" to "the warnings are in Crew", which
    // is a visible change to a second card. Cueing crew alone would leave a card
    // that just gained its only body content silent.
    expect(
      changedBetween((s) => void (internalOf(s).parse_warnings = [routedWarn("crew")])),
    ).toEqual(["crew", "warnings"]);
  });

  it("D9c: a warn routed to NO section changes only the Sheet-warnings panel", () => {
    // The other side of D9: an unmapped block kind has no owning section, so the
    // warnings panel is the only card that gains content.
    expect(
      changedBetween((s) => void (internalOf(s).parse_warnings = [routedWarn("unmapped_block")])),
    ).toEqual(["warnings"]);
  });

  it("D9b: EDITING a crew-routed warning changes crew, with the warning COUNT held equal", () => {
    // D9 alone is not falsifiable. Adding a warning also grows the routed-decision
    // array from [] to [null], so a projection that dropped routed warnings
    // entirely still reported crew as changed — verified by mutation. Holding the
    // count fixed and editing the warning's text leaves the decision array
    // byte-identical, so ONLY the routed warnings themselves can carry the signal.
    const withWarn = () => {
      const s = reviewSnapshot();
      internalOf(s).parse_warnings = [routedWarn("crew", "original text")];
      return s;
    };
    const before = signaturesOf(withWarn());
    const after = withWarn();
    (internalOf(after).parse_warnings as ParseWarning[]) = [routedWarn("crew", "edited text")];

    const changed = changedSectionIds(before, signaturesOf(after));
    // Exclusive, not merely inclusive. Round-2 probe: the rendered warnings panel
    // is byte-identical for an edit to an EXTERNALLY routed warning, so cueing it
    // would be a false cue, and a `toContain` assertion would have permitted one.
    expect(changed).toEqual(["crew"]);
  });

  it("D10: a use-raw decision change on a rooms-routed warning changes rooms", () => {
    const withWarn = () => {
      const s = reviewSnapshot();
      internalOf(s).parse_warnings = [roomSplitWarn("hash-1")];
      return s;
    };
    const before = signaturesOf(withWarn());

    const after = withWarn();
    internalOf(after).use_raw_decisions = [roomSplitDecision("hash-1", "raw")];
    const changed = changedSectionIds(before, signaturesOf(after));
    expect(changed).toEqual(["rooms"]);
  });

  it("D10b: decision fields that never render do NOT cue", () => {
    // `target` is documented display-only and `decidedAt` / `decidedBy` reach no
    // rendered element. Round-2 probe confirmed the control's HTML is unchanged,
    // so hashing the whole persisted row cued a card that did not move.
    const withDecision = (decidedBy: string) => {
      const s = reviewSnapshot();
      internalOf(s).parse_warnings = [roomSplitWarn("hash-1")];
      const d = roomSplitDecision("hash-1", "raw");
      internalOf(s).use_raw_decisions = [
        { ...d, decidedBy, decidedAt: `2026-08-0${decidedBy.length}T00:00:00Z` },
      ];
      return signaturesOf(s);
    };
    expect(
      changedSectionIds(withDecision("a@example.com"), withDecision("bb@example.com")),
    ).toEqual([]);
  });

  it("D11: attaching an archived-tab offer changes packlist and nothing else", () => {
    // `archivedTabOffer` is attached by the modal loader, not the adapter, so it
    // is exercised at the data layer the detector actually reads.
    const base = reviewSnapshot();
    const data = buildPublishedSectionData(base, { slug: SLUG });
    const bySection = buildSectionWarningModel({
      slug: SLUG,
      warnings: data.warnings,
      ignoredFingerprints: new Set<string>(),
      renderedSectionIds: new Set(renderedSectionIds(data)),
    });
    const before = buildSectionSignatures({ data, bySection, attentionBySection: NO_ATTENTION });
    const after = buildSectionSignatures({
      data: { ...data, archivedTabOffer: { tabNames: ["Old Crew"], slug: SLUG } },
      bySection,
      attentionBySection: NO_ATTENTION,
    });
    expect(changedSectionIds(before, after)).toEqual(["packlist"]);
  });

  it("D12: swapping a persisted crew id while every displayed field stays equal changes crew", () => {
    // Round-1 BLOCKING. `previewRoster` is what the row actions target, so the
    // card changed even though it reads identically.
    const changed = changedBetween((s) => {
      rowOf(s.crew_members, 0).id = "cccccccc-0000-4000-8000-00000000000f";
    });
    expect(changed).toEqual(["crew"]);
  });

  it("D13: moving one region's anchor changes exactly the sections mapped to it", () => {
    // The expectation is DERIVED from SECTION_REGION_MAP, which is what makes the
    // schedule/agenda pair (both mapped to the `schedule` region) a real assertion
    // rather than a hardcoded guess.
    const expected = renderedIds()
      .filter((id) => SECTION_REGION_MAP[id] === "schedule")
      .sort();
    expect(expected.length).toBeGreaterThan(1);

    const changed = changedBetween((s) => {
      // A DIFFERENT allowlisted tab, so the rendered href really moves. Changing
      // only `a1` would also move it; changing to an unusable anchor would not,
      // which is the point of D13c below.
      (showOf(s).source_anchors as Record<string, unknown>).schedule = {
        title: "GEAR",
        gid: 33,
        a1: "A1:F99",
      };
    });
    expect([...changed].sort()).toEqual(expected);
  });

  it("D13c: swapping one UNUSABLE anchor for another cues nothing", () => {
    // The false-cue direction, and the reason the signature hashes the resolved
    // href rather than the raw anchor. `buildSheetDeepLink` collapses every
    // anchor outside SOURCE_LINK_ALLOWLIST, and every one with a non-numeric
    // gid, onto the same `#gid=0` and discards `gid` and `a1` on the way
    // (`lib/sheet-links/buildSheetDeepLink.ts:22`). Two different unusable
    // values therefore render the SAME link, and a card whose link did not move
    // must not flash. Hashing the raw anchor cued it.
    const before = reviewSnapshot();
    (showOf(before).source_anchors as Record<string, unknown>).schedule = {
      title: "NOT_ALLOWLISTED",
      gid: 7,
      a1: "A1:B2",
    };
    const after = reviewSnapshot();
    (showOf(after).source_anchors as Record<string, unknown>).schedule = {
      title: "ALSO_NOT_ALLOWLISTED",
      gid: 9,
      a1: "Z9:Z9",
    };
    expect(changedSectionIds(signaturesOf(before), signaturesOf(after))).toEqual([]);
  });

  it("D13b: moving a null-mapped region's anchor changes nothing", () => {
    expect(
      changedBetween((s) => {
        (showOf(s).source_anchors as Record<string, unknown>).nonexistent_region = "X!A1";
      }),
    ).toEqual([]);
  });

  it("D15: an attention item routed to a section changes that section, and only it", () => {
    // Round-2 BLOCKING. Attention items render inline card content in crew, event,
    // rooms and warnings, so adding, editing or resolving one changes a card that
    // no own-field signature can see. The caller supplies the routing because it
    // already resolves the placement predicate; a second resolution here would be
    // a second source of truth.
    // `kind: "alert"`, NOT `"hold"`. `AttentionBanner` returns null for any item
    // that is not an alert (`components/admin/review/AttentionBanner.tsx:103`), so
    // a hold fixture renders nothing and this row would have been asserting that
    // the detector reacts to an item the card never shows. The whole-diff review
    // caught it passing for that weaker reason.
    //
    // `actionable: false` deliberately: cards render every LIVE item, and grouping
    // only the actionable ones was the round-3 BLOCKING.
    const item = (id: string, menuTitle: string): AttentionItem => ({
      kind: "alert",
      alert: { code: "AMBIGUOUS_EMAIL_BINDING", title: menuTitle, body: null } as never,
      id,
      tone: "notice",
      sectionId: "crew",
      crewKey: null,
      actionable: false,
      menuTitle,
      menuSubtitle: null,
    });
    const sigs = (items: readonly AttentionItem[]) => {
      const data = buildPublishedSectionData(reviewSnapshot(), { slug: SLUG });
      const bySection = buildSectionWarningModel({
        slug: SLUG,
        warnings: data.warnings,
        ignoredFingerprints: new Set<string>(),
        renderedSectionIds: new Set(renderedSectionIds(data)),
      });
      return buildSectionSignatures({
        data,
        bySection,
        attentionBySection: new Map<string, readonly AttentionItem[]>([["crew", items]]),
      });
    };

    // Appearing.
    expect(changedSectionIds(sigs([]), sigs([item("a1", "Two crew share an email")]))).toEqual([
      "crew",
    ]);
    // NO edit-in-place case on `menuTitle`. It was here and it pinned a FALSE
    // cue: `AttentionBanner` renders the ALERT payload, not the menu copy
    // (`components/admin/review/AttentionBanner.tsx:103`), so changing
    // `menuTitle` alone moved the signature while the rendered banner stayed
    // byte-identical. A regression suite that asserts a false positive is worse
    // than no suite, because it makes the defect a requirement.
    //
    // What a rendered edit looks like: the alert payload itself.
    expect(
      changedSectionIds(
        sigs([item("a1", "Two crew share an email")]),
        sigs([{ ...item("a1", "Two crew share an email"), tone: "critical" }]),
      ),
    ).toEqual(["crew"]);
    // Resolved.
    expect(changedSectionIds(sigs([item("a1", "Two crew share an email")]), sigs([]))).toEqual([
      "crew",
    ]);
  });

  it("D16: the alert payload cues ONLY through what the banner paints", () => {
    // Round-4 review probed the shipped `AttentionBanner` and found seven inputs
    // that moved the signature while the rendered HTML stayed byte-identical.
    // Every one is here, because a class dripped one instance per round is what
    // turned this surface into a four-round vector. The fix routes the payload
    // through the banner's OWN pure functions, so these hold for whatever the
    // banner does next rather than for the shapes it does today.
    const alertOf = (over: Record<string, unknown>) =>
      ({
        alertId: "al-1",
        code: "AMBIGUOUS_EMAIL_BINDING",
        template: "Two crew share <email>.",
        params: { email: "a@b.c" },
        action: null,
        helpHref: null,
        raisedAt: "2026-08-03T09:00:00.000Z",
        occurrenceCount: 1,
        autoClearNote: null,
        failedKeys: null,
        dataGaps: null,
        errorCode: null,
        ...over,
      }) as never;
    const banner = (over: Record<string, unknown> = {}): AttentionItem => ({
      kind: "alert",
      alert: alertOf(over),
      id: "a1",
      tone: "notice",
      sectionId: "crew",
      crewKey: null,
      actionable: false,
      menuTitle: "m",
      menuSubtitle: null,
    });
    const sigs = (items: readonly AttentionItem[], key = "crew") => {
      const data = buildPublishedSectionData(reviewSnapshot(), { slug: SLUG });
      const bySection = buildSectionWarningModel({
        slug: SLUG,
        warnings: data.warnings,
        ignoredFingerprints: new Set<string>(),
        renderedSectionIds: new Set(renderedSectionIds(data)),
      });
      return buildSectionSignatures({
        data,
        bySection,
        attentionBySection: new Map<string, readonly AttentionItem[]>([[key, items]]),
      });
    };
    const same = (a: readonly AttentionItem[], b: readonly AttentionItem[], why: string) =>
      expect(changedSectionIds(sigs(a), sigs(b)), why).toEqual([]);

    // (1a) A param the template DOES interpolate must cue. This direction is
    // first on purpose: round-5 review found the filter written against `{k}`
    // when the renderer interpolates `<k>` (`lib/messages/lookup.ts:12`), which
    // silently dropped every real param across 13 reachable templates. The
    // earlier fixture used brace syntax, so it asserted the broken behaviour and
    // passed. A syntax guessed twice gets a positive case, not just a negative.
    expect(
      changedSectionIds(
        sigs([banner({ params: { email: "a@b.c" } })]),
        sigs([banner({ params: { email: "changed@example.com" } })]),
      ),
      "an INTERPOLATED param paints, so it must cue",
    ).toEqual(["crew"]);
    // (1b) A hyphen/underscore mismatch still resolves, exactly as the renderer
    // resolves it (`components/messages/renderEmphasis.tsx:116`).
    expect(
      changedSectionIds(
        sigs([banner({ template: "Rows: <crew-row-count>.", params: { crew_row_count: 3 } })]),
        sigs([banner({ template: "Rows: <crew-row-count>.", params: { crew_row_count: 4 } })]),
      ),
      "a normalized key still paints, so it must cue",
    ).toEqual(["crew"]);
    // (1c) A param the template never interpolates cannot change a glyph.
    same(
      [banner({ params: { email: "a@b.c" } })],
      [banner({ params: { email: "a@b.c", unused: "zzz" } })],
      "an uninterpolated param must not cue",
    );
    // (2) Keys past the banner's cap are not painted as keys...
    const six = ["k1", "k2", "k3", "k4", "k5", "k6"];
    same(
      [banner({ failedKeys: [...six, "k7"] })],
      [banner({ failedKeys: [...six, "CHANGED"] })],
      "a key beyond the cap must not cue",
    );
    // ...but their COUNT is, via the `+N more` tail, so adding one DOES cue.
    expect(
      changedSectionIds(
        sigs([banner({ failedKeys: six })]),
        sigs([banner({ failedKeys: [...six, "k7"] })]),
      ),
      "the overflow count IS painted",
    ).toEqual(["crew"]);
    // (3) Blank keys are dropped by the banner's own normalizer.
    same(
      [banner({ failedKeys: ["k1"] })],
      [banner({ failedKeys: ["k1", "   "] })],
      "a whitespace-only key must not cue",
    );
    // (4) Gap classes past the formatter's four-class cap are not painted.
    // `classes`, the field `formatDataGapBreakdown` actually reads
    // (`lib/parser/dataGaps.ts:364`). An earlier draft wrote `byClass` and the
    // formatter threw — which is how the detector's own crash-guard was found.
    const gaps = (extra: Record<string, number>, total: number) => ({
      total,
      classes: {
        FIELD_UNREADABLE: 9,
        ROW_DROPPED: 8,
        BLOCK_SKIPPED: 7,
        VALUE_TRUNCATED: 6,
        ...extra,
      },
    });
    same(
      [banner({ dataGaps: gaps({ ROW_ORPHANED: 1 }, 31) })],
      [banner({ dataGaps: gaps({ ROW_ORPHANED: 2 }, 32) })],
      "a hidden fifth gap class must not cue",
    );
    // (5) `total` reaches the screen only as the show/hide boolean.
    same(
      [banner({ dataGaps: { total: 5, classes: { FIELD_UNREADABLE: 5 } } })],
      [banner({ dataGaps: { total: 9, classes: { FIELD_UNREADABLE: 5 } } })],
      "a total change with the same painted classes must not cue",
    );
    // ...and crossing zero DOES cue, because that flips the band on.
    expect(
      changedSectionIds(
        sigs([banner({ dataGaps: { total: 0, classes: {} } })]),
        sigs([banner({ dataGaps: { total: 2, classes: { FIELD_UNREADABLE: 2 } } })]),
      ),
      "crossing the render gate IS visible",
    ).toEqual(["crew"]);
  });

  it("D14: the diff reports a section that vanished and one that appeared", () => {
    // A `changedSectionIds` that iterated only the new map would silently drop the
    // removal. D7 cannot catch that: it checks map membership, not the diff.
    const withAgenda = signaturesOf(reviewSnapshot());
    const noAgenda = reviewSnapshot();
    showOf(noAgenda).agenda_links = [];
    const without = signaturesOf(noAgenda);

    expect(changedSectionIds(withAgenda, without)).toEqual(["agenda"]);
    expect(changedSectionIds(without, withAgenda)).toEqual(["agenda"]);
  });

  it("returns ids in registry order, not hash or insertion order", () => {
    // The announcement reads this list aloud, so document order is a contract.
    const order = renderedIds();
    const changed = changedBetween((s) => {
      rowOf(s.crew_members, 0).role = "A2";
      (showOf(s).venue as Record<string, unknown>).city = "Dallas";
    });
    expect(changed).toEqual(order.filter((id) => changed.includes(id)));
    expect(changed).toEqual(["venue", "crew"]);
  });

  /**
   * D17 — the post-M7 `{ current, pending }` diagrams wrapper.
   *
   * `publishedAdapter.ts:78` passes the persisted jsonb through UNCHANGED, and the
   * renderer unwraps it at paint time with `resolveCurrentDiagrams`
   * (`step3ReviewSections.tsx:3874`). A detector that reads `embeddedImages` and
   * friends straight off the wrapper finds `undefined` on every one, so every
   * wrapped show hashes to the same constant tuple and NO diagram edit can cue —
   * the whole-diff review probed five independent painted channels, all missed.
   *
   * The shared fixture ships `diagrams: null`, which is why no earlier row
   * exercised the wrapper at all.
   */
  const persistedDiagrams = (over: Record<string, unknown> = {}) => ({
    snapshot_revision_id: "rev-1",
    snapshot_status: "complete",
    linkedFolder: { driveFolderId: "folder-1", driveFolderUrl: "https://drive/folder-1" },
    embeddedImages: [{ id: "img-1", snapshotPath: "shows/s/rev-1/a.png", alt: "Plan A" }],
    linkedFolderItems: [{ id: "lf-1", name: "one.pdf" }],
    ...over,
  });

  const diagramSnapshot = (payload: unknown) => {
    const s = reviewSnapshot();
    showOf(s).diagrams = payload;
    return s;
  };

  it("D17: a change inside the {current} diagrams wrapper cues rooms", () => {
    const before = signaturesOf(diagramSnapshot({ current: persistedDiagrams(), pending: null }));
    const after = signaturesOf(
      diagramSnapshot({
        current: persistedDiagrams({
          linkedFolder: { driveFolderId: "folder-2", driveFolderUrl: "https://drive/folder-2" },
        }),
        pending: null,
      }),
    );
    expect(changedSectionIds(before, after)).toEqual(["rooms"]);
  });

  it("D17b: a wrapped payload hashes the same as the bare payload it wraps", () => {
    // The strongest statement of the bug: unwrapped, the wrapped signature is the
    // empty tuple and these two disagree. It also pins that the legacy bare row —
    // the only shape the pre-M7 code could produce — keeps working.
    const bare = signaturesOf(diagramSnapshot(persistedDiagrams()));
    const wrapped = signaturesOf(diagramSnapshot({ current: persistedDiagrams(), pending: null }));
    expect(wrapped.get("rooms")).toBe(bare.get("rooms"));
  });

  it("D17c: an edit confined to `pending` does not cue — only `current` is painted", () => {
    const before = signaturesOf(diagramSnapshot({ current: persistedDiagrams(), pending: null }));
    const after = signaturesOf(
      diagramSnapshot({
        current: persistedDiagrams(),
        pending: { snapshot_revision_id: "rev-9" },
      }),
    );
    expect(changedSectionIds(before, after)).toEqual([]);
  });

  /**
   * D18 — the agenda projection reads the extraction the way the schedule block
   * paints it, not wholesale.
   *
   * Two failure directions, both probed by the whole-diff review:
   *   - MISSED: `normalizeAgendaExtraction` type-checks `title`/`room`/`drift`/
   *     `date` but never collapses blanks, while `AgendaScheduleBlock` branches on
   *     `!== null` (`:165`, `:177`, `:195`). So `null -> " "` MOUNTS a paragraph,
   *     and the detector's leaf trim — correct for every `String(v ?? "").trim()`
   *     card body — hides exactly that transition.
   *   - FALSE: `corrections`, `extractorVersion` and `sourceRevision` ride on the
   *     extraction and are painted nowhere.
   */
  const extraction = (
    over: Record<string, unknown> = {},
    session: Record<string, unknown> = {},
  ) => ({
    confidence: "high",
    corrections: 0,
    extractorVersion: 4,
    sourceRevision: "head-rev-1",
    days: [
      {
        dayLabel: "Mon",
        date: "Apr 1",
        sessions: [
          { time: "09:00", title: "Keynote", room: "Hall A", drift: null, tracks: [], ...session },
        ],
      },
    ],
    ...over,
  });

  const agendaSnapshot = (extracted: unknown) => {
    const s = reviewSnapshot();
    showOf(s).agenda_links = [{ label: "Run of show", fileId: "AGENDA_FILE_1", extracted }];
    return s;
  };

  const agendaDiff = (a: unknown, b: unknown) =>
    changedSectionIds(signaturesOf(agendaSnapshot(a)), signaturesOf(agendaSnapshot(b)));

  it("D18: extraction metadata the schedule block never paints does not cue", () => {
    expect(
      agendaDiff(extraction(), extraction({ extractorVersion: 5 })),
      "extractorVersion",
    ).toEqual([]);
    expect(
      agendaDiff(extraction(), extraction({ sourceRevision: "head-rev-2" })),
      "sourceRevision",
    ).toEqual([]);
    expect(agendaDiff(extraction(), extraction({ corrections: 7 })), "corrections").toEqual([]);
  });

  it("D18b: null -> whitespace mounts a session paragraph, so it MUST cue", () => {
    // The renderer's own test is `session.title !== null`; " " passes it and
    // paints. A blanket leaf-trim reads both as absent.
    expect(
      agendaDiff(
        extraction({}, { title: null, room: null }),
        extraction({}, { title: " ", room: null }),
      ),
    ).toEqual(["agenda"]);
    expect(
      agendaDiff(extraction({}, { drift: null }), extraction({}, { drift: " " })),
      "drift mounts agenda-drift",
    ).toEqual(["agenda"]);
  });

  it("D18c: two drift strings with the same derived note do not cue", () => {
    // `driftNote` keeps only the `source:` capture, so these paint one identical
    // sentence. Hashing the raw drift cues a byte-identical card.
    expect(
      agendaDiff(
        extraction({}, { drift: "shifted 10m (source: Sheet A)" }),
        extraction({}, { drift: "moved earlier (source: Sheet A)" }),
      ),
    ).toEqual([]);
    expect(
      agendaDiff(
        extraction({}, { drift: "shifted 10m (source: Sheet A)" }),
        extraction({}, { drift: "shifted 10m (source: Sheet B)" }),
      ),
      "a changed source changes the painted note",
    ).toEqual(["agenda"]);
  });

  it("D18d: payloads the render-boundary validator rejects hash as unpainted", () => {
    // `AgendaScheduleBlock` runs `normalizeAgendaExtraction` itself and returns
    // null for a malformed or low-confidence payload. Two different malformed
    // payloads paint the same nothing, so they must hash alike.
    expect(agendaDiff({ confidence: "high" }, { garbage: true })).toEqual([]);
  });

  /**
   * D19/D20 — the two MISSED-cue instances found by the class-sweep the two HIGH
   * findings triggered. Both are the same shape as the diagrams wrapper: the
   * renderer reads a WIDER domain than the cap the detector slices to, so content
   * that genuinely paints sits outside the signature entirely.
   *
   * They are fixed here, while the sweep's remaining seven mismatches are
   * over-cue only (the renderer narrows what the detector already hashes, so the
   * worst case is a benign extra flash) and are filed as
   * BL-FRESHNESS-PROJECTION-NARROWING rather than rewritten unprobed at merge.
   */
  it("D19: a room past ROOMS_CAP gaining scope changes the painted count, so it cues", () => {
    // `railCount` counts `rooms.filter(roomHasScope)` over the UNCAPPED list
    // (`step3ReviewSections.tsx:4260`). Slicing to the cap and keeping only
    // `length` beyond it means the count moves while the hash does not.
    const many = (scopeOnLast: boolean) => {
      const s = reviewSnapshot();
      s.rooms = Array.from({ length: ROOMS_CAP + 2 }, (_, i) => ({
        ...rowOf(s.rooms as unknown[], 0),
        id: `room-${i}`,
        name: `Room ${String(i).padStart(2, "0")}`,
        audio: i === ROOMS_CAP + 1 ? (scopeOnLast ? "2x d&b" : null) : "house",
      })) as typeof s.rooms;
      return s;
    };
    expect(changedSectionIds(signaturesOf(many(false)), signaturesOf(many(true)))).toEqual([
      "rooms",
    ]);
  });

  it("D20: a schedule day that exists only in `dates` is painted, so it cues", () => {
    // The rendered day domain is `aggregateDays(dates)` UNION the ros-only keys
    // (`step3ReviewSections.tsx:1961-1968`), and `count` is `mergedDays.length`.
    // A detector keyed on `Object.keys(ros)` alone cannot see a bookend day that
    // carries no run-of-show entries at all.
    const before = reviewSnapshot();
    const after = reviewSnapshot();
    (showOf(after).dates as Record<string, unknown>).travelOut = "2026-09-30";
    expect(changedSectionIds(signaturesOf(before), signaturesOf(after))).toContain("schedule");
  });

  it("D20b: a strike entry past SCHEDULE_ENTRIES_CAP is cap-exempt, so it cues", () => {
    // Strike/load-out rows are exempt from the entry cap, so entry number
    // CAP+1 renders. A flat `.slice(0, SCHEDULE_ENTRIES_CAP)` never hashes it.
    const withEntries = (lastTitle: string) => {
      const s = reviewSnapshot();
      const ros = internalOf(s).run_of_show as Record<string, { entries: unknown[] }>;
      const iso = Object.keys(ros).sort()[0] as string;
      ros[iso] = {
        ...ros[iso],
        entries: [
          ...Array.from({ length: SCHEDULE_ENTRIES_CAP }, (_, i) => ({
            start: `0${i}:00`,
            title: `Item ${i}`,
            kind: "agenda",
          })),
          { start: "23:00", title: lastTitle, kind: "strike" },
        ],
      };
      return s;
    };
    expect(
      changedSectionIds(
        signaturesOf(withEntries("Strike A")),
        signaturesOf(withEntries("Strike B")),
      ),
    ).toEqual(["schedule"]);
  });
});
