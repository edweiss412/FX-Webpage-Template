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
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { SECTION_REGION_MAP, type SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";

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
  return buildSectionSignatures({ data, bySection });
}

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
    expect(changedBetween((s) => void (s.hotel_reservations = [...s.hotel_reservations].reverse()))).toEqual(
      ["hotels"],
    );
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

  it("D5: toggling published produces zero changed ids", () => {
    expect(changedBetween((s) => void (showOf(s).published = false))).toEqual([]);
  });

  it("D6: a full re-parse changes every rendered section", () => {
    // The anti-tautology partner of D3: without it, a projection that returned a
    // single entry would satisfy every "exactly one id" row above.
    const changed = changedBetween((s) => {
      (showOf(s).venue as Record<string, unknown>).city = "Dallas";
      (showOf(s).event_details as Record<string, unknown>).headcount = "500";
      (showOf(s).client_contact as Record<string, unknown>).name = "Sam Client";
      (showOf(s).dates as Record<string, unknown>).travelOut = "2026-08-06";
      showOf(s).pull_sheet = [{ tab: "Audio", items: ["console"] }];
      showOf(s).coi_status = "pending";
      showOf(s).agenda_links = [
        { label: "Revised run of show", fileId: "AGENDA_FILE_2", extracted: { pages: 2 } },
      ];
      rowOf(s.crew_members, 0).role = "A2";
      rowOf(s.rooms, 0).name = "Grand Ballroom East";
      rowOf(s.hotel_reservations, 0).hotel_name = "Westin";
      rowOf(s.transportation, 0).vehicle = "16ft box truck";
      rowOf(s.contacts, 0).name = "Val Venue";
      internalOf(s).parse_warnings = [routedWarn("venue")];
      internalOf(s).run_of_show = { "2026-08-03": [{ time: "09:00", label: "Doors" }] };
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

  it("D9: a warn routed to crew changes crew, not only warnings", () => {
    // Round-1 BLOCKING. The routed card renders INSIDE the crew panel, so the
    // crew card's content changed while `crewMembers` did not.
    const changed = changedBetween((s) => {
      internalOf(s).parse_warnings = [routedWarn("crew")];
    });
    expect(changed).toContain("crew");
    expect(changed).toContain("warnings");
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
    expect(changed).toContain("crew");
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

    expect(changed).toContain("rooms");
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
    const before = buildSectionSignatures({ data, bySection });
    const after = buildSectionSignatures({
      data: { ...data, archivedTabOffer: { tabNames: ["Old Crew"], slug: SLUG } },
      bySection,
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
      (showOf(s).source_anchors as Record<string, unknown>).schedule = "ROS!A1:F99";
    });
    expect([...changed].sort()).toEqual(expected);
  });

  it("D13b: moving a null-mapped region's anchor changes nothing", () => {
    expect(
      changedBetween((s) => {
        (showOf(s).source_anchors as Record<string, unknown>).nonexistent_region = "X!A1";
      }),
    ).toEqual([]);
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
});
