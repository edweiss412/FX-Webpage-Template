// @vitest-environment jsdom
/**
 * BL-FRESHNESS-PROJECTION-NARROWING — the seven over-cue projections, each
 * settled by a probe rather than by reading the renderer and believing it.
 *
 * WHAT A PROBE IS HERE, and why the entry refused to let the narrowing land
 * without one. `sectionFreshness.ts` holds one contract: the signature reads
 * what the RENDERER reads. Narrowing a projection is a claim that some edit
 * paints NOTHING — and a claim about what a 4000-line renderer paints, made by
 * reading it, is the exact move that produced the two missed-cue HIGHs this
 * whole entry descends from. So each case below RENDERS the section twice,
 * through the shipped `step3Sections(...).render`, and compares the HTML byte
 * for byte. If the two strings differ, the edit paints, and the projection is
 * correct to be wide — no narrowing, and the transcript is the evidence.
 *
 * THE PREMISE IS ASSERTED, NOT ASSUMED. Every case first checks, through the
 * SHIPPED predicate, that its two inputs really are the pair it claims. A probe
 * that mutates a field the fixture does not have compares two identical renders
 * and reports "byte-identical" — which reads exactly like a pass and proves
 * nothing at all. Where the premise cannot be stated through a predicate, it is
 * stated as a direct assertion on the fixture.
 *
 * The renderer functions are IMPORTED, never re-typed. Every one of the seven
 * mismatches this entry lists began life as somebody's faithful transcription.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { step3Sections, hasContent } from "@/components/admin/wizard/step3ReviewSections";
import { isParseableUrl } from "@/lib/url/isParseableUrl";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

import { reviewSnapshot, SLUG } from "./__fixtures__/reviewSnapshot";

type Mutate = (s: ShowReviewSnapshot) => void;

const showOf = (s: ShowReviewSnapshot) => s.show as unknown as Record<string, unknown>;
/**
 * The row arrays live at the snapshot's TOP LEVEL (`ShowReviewSnapshot`,
 * `lib/admin/readShowReviewSnapshot.ts:25-33`), not under `internal`. The first
 * draft of this file assumed otherwise, which turned four probes into
 * `undefined` reads — loudly, because a probe that cannot reach its field must
 * never be able to report "byte-identical".
 */
const rowsOf = (
  s: ShowReviewSnapshot,
  k: "crew_members" | "contacts" | "hotel_reservations" | "transportation",
) => s[k] as Record<string, unknown>[];

/** The section's own body, rendered exactly as the modal renders it. */
function renderSection(id: SectionId, mutate?: Mutate): string {
  const snapshot = reviewSnapshot();
  mutate?.(snapshot);
  const data = buildPublishedSectionData(snapshot, { slug: SLUG });
  const def = step3Sections(data).find((s) => s.id === id);
  if (!def) throw new Error(`no section def for ${id}`);
  return renderToStaticMarkup(<>{def.render(data)}</>);
}

/**
 * The probe itself: does this edit paint?
 *
 * Returns the two renders rather than asserting, because a case that expects
 * DIFFERENT output (the negative controls below) uses the same machinery.
 */
function probe(id: SectionId, mutate: Mutate): { base: string; edited: string } {
  return { base: renderSection(id), edited: renderSection(id, mutate) };
}

/**
 * PER-CASE PREMISE: does THIS mutation reach the renderer at all?
 *
 * The global premise below proves the harness can tell a painting edit from a
 * non-painting one — using a VENUE edit. That says nothing about whether the
 * crew, contacts, hotels, transport or packlist mutations land on the right
 * field, and a mutation that writes to a path the adapter does not read
 * produces two identical renders and reports "byte-identical" as a PASS. That
 * is the exact false-negative this suite exists to prevent, and whole-diff
 * review R1 demonstrated it: a deliberately wrong path passed every equality
 * assertion.
 *
 * So each case first proves its own reachability, by making a mutation of the
 * SAME SHAPE that MUST paint, and asserting it does.
 */
function expectMutationReaches(id: SectionId, paintingMutation: Mutate): void {
  const base = renderSection(id);
  const edited = renderSection(id, paintingMutation);
  expect(
    edited,
    `premise: a ${id} mutation of this shape must reach the renderer — ` +
      "if it does not, the byte-identical result below proves nothing",
  ).not.toBe(base);
}

describe("BL-FRESHNESS-PROJECTION-NARROWING probes", () => {
  it("PREMISE: the harness can tell a painting edit from a non-painting one", () => {
    // Without this, every "byte-identical" below could be a harness that renders
    // the same constant twice — the failure mode that makes a probe suite look
    // thorough while proving nothing. Two directions, so neither a stuck-base
    // nor a stuck-edited implementation survives.
    const { base, edited } = probe("venue", (s) => {
      (showOf(s).venue as Record<string, unknown>).name = "A Different Hall";
    });
    expect(base).not.toBe(edited);
    expect(base).toContain("Grand Hall");
    expect(edited).toContain("A Different Hall");
    expect(renderSection("venue")).toBe(base);
  });

  it("venue: an unparseable googleLink swapped for another unparseable one", () => {
    const before = "not a url";
    const after = "also not a url";
    // Through the SHIPPED gate, so the case cannot survive a change to it.
    expect(isParseableUrl(before), "premise: `before` must be unparseable").toBe(false);
    expect(isParseableUrl(after), "premise: `after` must be unparseable").toBe(false);
    const { base, edited } = probe("venue", (s) => {
      (showOf(s).venue as Record<string, unknown>).googleLink = after;
    });
    // The fixture has no googleLink at all, so set BOTH sides to unparseable
    // values — otherwise this compares "absent" against "unparseable", which is
    // a different claim than the one the entry makes.
    const withBefore = renderSection("venue", (s) => {
      (showOf(s).venue as Record<string, unknown>).googleLink = before;
    });
    expect(withBefore, "unparseable-to-unparseable must paint identically").toBe(edited);

    // AND THE FINDING THAT CHANGED THE FIX. The entry described this projection
    // as safe to gate through `isParseableUrl` — replace the raw link with the
    // parsed href and be done. This assertion is why that would have been a
    // MISSED cue, the severe direction: the eyebrow field COUNT counts the link
    // whether or not it parses, so absent-to-unparseable really does paint,
    // moving "(3)" to "(4)" while the gated href stays null on both sides. The
    // shipped projection therefore keeps a presence bit ALONGSIDE the href.
    //
    // The first draft of this test asserted these two were equal — it was
    // reasoning from the entry rather than from the render, and the probe
    // refused it. That is the entire argument for probing before narrowing.
    expect(base, "absent-to-unparseable moves the painted field count").not.toBe(withBefore);
    expect(base).toContain("(3)");
    expect(withBefore).toContain("(4)");
  });

  it("event: two opening_reel values that strip to the same text", () => {
    expectMutationReaches("event", (s) => {
      (showOf(s).event_details as Record<string, unknown>).opening_reel = "PAINTS DISTINCTLY";
    });
    const before = "Watch here: https://drive.google.com/file/d/REEL_ONE/view";
    const after = "Watch here: https://drive.google.com/file/d/REEL_TWO/view";
    expect(
      stripOpeningReelText(before),
      "premise: the two raw values must strip to the same painted text",
    ).toBe(stripOpeningReelText(after));
    expect(before, "premise: the two raw values must actually differ").not.toBe(after);
    const withBefore = renderSection("event", (s) => {
      (showOf(s).event_details as Record<string, unknown>).opening_reel = before;
    });
    const withAfter = renderSection("event", (s) => {
      (showOf(s).event_details as Record<string, unknown>).opening_reel = after;
    });
    expect(withAfter).toBe(withBefore);
  });

  it("crew: the day list on an unknown_asterisk restriction", () => {
    expectMutationReaches("crew", (s) => {
      rowsOf(s, "crew_members")[0]!.date_restriction = { kind: "explicit", days: ["2026-08-03"] };
    });
    const before = { kind: "unknown_asterisk", days: ["2026-08-03"] };
    const after = { kind: "unknown_asterisk", days: ["2026-08-03", "2026-08-04"] };
    expect(
      partialAttendanceLabel(before as never, { humanize: false }),
      "premise: the shipped label must ignore `days` for unknown_asterisk",
    ).toBe(partialAttendanceLabel(after as never, { humanize: false }));
    const withBefore = renderSection("crew", (s) => {
      const m = rowsOf(s, "crew_members")[0]!;
      m.date_restriction = before;
    });
    const withAfter = renderSection("crew", (s) => {
      const m = rowsOf(s, "crew_members")[0]!;
      m.date_restriction = after;
    });
    expect(withAfter).toBe(withBefore);
  });

  it("contacts: a field inside an all-blank contact block", () => {
    expectMutationReaches("contacts", (s) => {
      rowsOf(s, "contacts").push({
        id: "x",
        kind: "other",
        name: "REACHES",
        email: "",
        phone: "",
        notes: null,
      });
    });
    // `contactBlocks` drops a block with no name AND no content rows, so the
    // whole block is absent from the DOM and nothing inside it can paint.
    const blank = { id: "blank-1", kind: "other", name: "", email: "", phone: "", notes: null };
    expect(hasContent(blank.name), "premise: the block's name must be empty").toBe(false);
    const withBefore = renderSection("contacts", (s) => {
      rowsOf(s, "contacts").push({ ...blank });
    });
    const withAfter = renderSection("contacts", (s) => {
      rowsOf(s, "contacts").push({ ...blank, notes: "edited into the void" });
    });
    expect(withAfter).toBe(withBefore);
  });

  it("hotels: a blank guest name added to a reservation", () => {
    expectMutationReaches("hotels", (s) => {
      const h = rowsOf(s, "hotel_reservations")[0]!;
      h.names = [...(h.names as string[]), "Reaches Renderer"];
    });
    expect(hasContent("   "), "premise: whitespace must not be content").toBe(false);
    const withBefore = renderSection("hotels");
    const withAfter = renderSection("hotels", (s) => {
      const h = rowsOf(s, "hotel_reservations")[0]!;
      h.names = [...(h.names as string[]), "   "];
    });
    expect(withAfter).toBe(withBefore);
  });

  it("transport: date and time re-split across the same joined `when`", () => {
    expectMutationReaches("transport", (s) => {
      rowsOf(s, "transportation")[0]!.schedule = [
        { stage: "REACHES", date: "2026-08-01", time: "09:00", assigned_names: [] },
      ];
    });
    // The body joins `[date, time]` with a space, so "08-01" + "09:00" and
    // "08-01 09:00" + "" produce one identical string.
    const legBefore = { stage: "Load-in", date: "2026-08-01", time: "09:00", assigned_names: [] };
    const legAfter = { stage: "Load-in", date: "2026-08-01 09:00", time: "", assigned_names: [] };
    expect(
      [legBefore.date, legBefore.time].filter((x) => hasContent(x)).join(" "),
      "premise: both legs must produce the same joined when-line",
    ).toBe([legAfter.date, legAfter.time].filter((x) => hasContent(x)).join(" "));
    const withBefore = renderSection("transport", (s) => {
      rowsOf(s, "transportation")[0]!.schedule = [legBefore];
    });
    const withAfter = renderSection("transport", (s) => {
      rowsOf(s, "transportation")[0]!.schedule = [legAfter];
    });
    expect(withAfter).toBe(withBefore);
  });

  it("packlist: a cat sentinel swapped for another sentinel", () => {
    expectMutationReaches("packlist", (s) => {
      const c = (showOf(s).pull_sheet as Record<string, unknown>[])[0]!;
      (c.items as Record<string, unknown>[])[0]!.item = "REACHES RENDERER";
    });
    const withBefore = renderSection("packlist", (s) => {
      const c = (showOf(s).pull_sheet as Record<string, unknown>[])[0]!;
      (c.items as Record<string, unknown>[])[0]!.cat = "TBD";
    });
    const withAfter = renderSection("packlist", (s) => {
      const c = (showOf(s).pull_sheet as Record<string, unknown>[])[0]!;
      (c.items as Record<string, unknown>[])[0]!.cat = "N/A";
    });
    expect(withAfter).toBe(withBefore);
  });
});
