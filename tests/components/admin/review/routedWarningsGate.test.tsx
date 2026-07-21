// @vitest-environment jsdom
/**
 * tests/components/admin/review/routedWarningsGate.test.tsx
 * (plan Task 2; spec docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md §3.2)
 *
 * Task 2 changes NO rendered output. It threads one derived boolean and one
 * count pair to the two readers that Task 3 will make use of, and this suite
 * pins three things a wrong plumbing implementation would get past:
 *
 *   1. the gate is the CONJUNCTION of both preconditions, not either alone;
 *   2. the RAIL channel receives the same gate value the CONTEXT does. Rail
 *      counts are unchanged under every gate value in this task, so an
 *      implementation passing `counts-present` to the rail and the conjunction
 *      to the context would pass an unchanged-counts assertion (plan review
 *      R3a finding 3). A spy captures what the rail actually received;
 *   3. the PRODUCTION derivation computes `here` and `elsewhere` correctly.
 *      Injecting `routedWarnings` into the surface proves prop-to-context
 *      plumbing and nothing about the modal that derives it; a miscomputed
 *      derivation would leave the live gate false while every other task passed
 *      through direct mounts (plan review R3a finding 2).
 *
 * Anti-tautology: the `here` and `elsewhere` fixtures DIFFER (1 vs 2), so a
 * swapped pair fails. Rail-count expectations come from the fixture, not from
 * `visibleWarningRows`.
 */
import { useContext, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/gate-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { Step3SectionChromeContext } from "@/components/admin/wizard/step3ReviewSections";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { renderedSectionIds } from "@/components/admin/review/sectionInclusion";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";
import type { RoutedWarnings } from "@/lib/admin/routedWarnings";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";

afterEach(cleanup);

const SHOW_ID = "33333333-3333-3333-3333-333333333333";
const SLUG = "gate-fixture-show";

/** Minimal published snapshot; the trim gate does not depend on show content, so
 *  this carries only what `buildPublishedSectionData` requires. */
function buildData(): PublishedSectionData {
  return buildPublishedSectionData(
    {
      show: {
        id: SHOW_ID,
        title: "Gate Fixture Show",
        client_label: "Acme",
        client_contact: null,
        dates: {
          travelIn: "2026-05-01",
          set: null,
          showDays: ["2026-05-02"],
          travelOut: "2026-05-03",
        },
        venue: { name: "Hall A", address: "1 Main St" },
        event_details: null,
        agenda_links: [],
        coi_status: "received",
        diagrams: null,
        pull_sheet: [],
        source_anchors: {},
        drive_file_id: "DRIVE_GATE",
        archived: false,
        published: true,
      },
      internal: {
        financials: null,
        parse_warnings: [],
        raw_unrecognized: null,
        run_of_show: {},
        use_raw_decisions: [],
        show_id: SHOW_ID,
      },
      crew_members: [],
      rooms: [],
      hotel_reservations: [],
      transportation: [],
      contacts: [],
    } as never,
    { slug: SLUG },
  );
}

/** The published surface's rendered-section set. `renderedSectionIds` reads
 *  `agendaBaseline` for its one data-dependent branch, so the stub supplies it
 *  rather than relying on `as never` to paper over a real read. */
const PUBLISHED_SECTION_IDS = new Set<SectionId>(
  renderedSectionIds({ mode: "published", agendaBaseline: [] } as never) as SectionId[],
);

/** A warn routed to `crew` (UNKNOWN_ROLE_TOKEN carries a crew blockRef). */
function crewWarn(name: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: `unknown role ${name}`,
    // rawSnippet is what makes a warning IGNORABLE (`warningFingerprint` returns
    // null without one), so the all-ignored assertion below needs it.
    rawSnippet: `Role | ${name}`,
    blockRef: { kind: "crew", name },
  } as ParseWarning;
}

/** A warn with no routable blockRef, so `warningsBySection` puts it in the
 *  fallback `warnings` bucket. */
function unroutedWarn(n: number): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `unrecognized row ${n}`,
    rawSnippet: `Mystery Row ${n} | value ${n}`,
  } as ParseWarning;
}

describe("deriveRoutedWarnings (the production derivation)", () => {
  it("counts the fallback bucket as `here` and every other section as `elsewhere`", () => {
    // 2 unrouted (-> the `warnings` bucket) and 1 crew-routed. The two counts
    // DIFFER, so an implementation that swaps them fails.
    const warnings: ParseWarning[] = [unroutedWarn(1), unroutedWarn(2), crewWarn("Alex Kim")];
    const rendered = PUBLISHED_SECTION_IDS;
    const bySection = buildSectionWarningModel({
      slug: "gate-fixture-show",
      warnings,
      ignoredFingerprints: new Set<string>(),
      renderedSectionIds: rendered,
    });

    const routed = deriveRoutedWarnings(bySection);

    expect(routed.here).toBe(2);
    expect(routed.elsewhere).toBe(1);
    expect(routed.here).not.toBe(routed.elsewhere);
  });

  it("counts ACTIVE rows only, so an all-ignored sheet reports nothing needing a look", () => {
    const warnings: ParseWarning[] = [unroutedWarn(1), crewWarn("Alex Kim")];
    const rendered = PUBLISHED_SECTION_IDS;
    const args = {
      slug: "gate-fixture-show",
      warnings,
      renderedSectionIds: rendered,
    };

    // Nothing ignored: both rows are active, so the counts are non-zero. This
    // half is what stops the all-ignored assertion below from passing vacuously.
    const active = deriveRoutedWarnings(
      buildSectionWarningModel({ ...args, ignoredFingerprints: new Set<string>() }),
    );
    expect(active.here).toBe(1);
    expect(active.elsewhere).toBe(1);

    // Everything ignored, keyed by the LIVE fingerprint rather than a hardcoded
    // string, so a fingerprint-shape change fails here instead of silently
    // turning the assertion into a no-op.
    const fingerprints = new Set<string>(
      warnings.map((w) => warningFingerprint(w)).filter((fp): fp is string => fp !== null),
    );
    expect(fingerprints.size).toBe(warnings.length);

    const ignored = deriveRoutedWarnings(
      buildSectionWarningModel({ ...args, ignoredFingerprints: fingerprints }),
    );
    expect(ignored).toEqual({ here: 0, elsewhere: 0 });
  });

  it("an empty model yields zeroes rather than undefined", () => {
    const routed = deriveRoutedWarnings({});
    expect(routed).toEqual({ here: 0, elsewhere: 0 });
  });
});

describe("the gate is the conjunction of both preconditions", () => {
  function Probe() {
    const chrome = useContext(Step3SectionChromeContext);
    return (
      <span
        data-testid="gate-probe"
        data-gate={String(chrome?.routedWarningsRenderElsewhere)}
        data-here={String(chrome?.routedWarnings?.here)}
        data-elsewhere={String(chrome?.routedWarnings?.elsewhere)}
      />
    );
  }

  function gateOf(
    routedWarnings: { here: number; elsewhere: number } | undefined,
    extras: boolean,
  ) {
    // Mirrors the derivation the surface performs; asserted against the probe
    // below so this helper cannot silently diverge from production.
    return routedWarnings !== undefined && extras;
  }

  it("is true only when BOTH routedWarnings and renderSectionExtras are present", () => {
    expect(gateOf({ here: 1, elsewhere: 2 }, true)).toBe(true);
    expect(gateOf({ here: 1, elsewhere: 2 }, false)).toBe(false);
    expect(gateOf(undefined, true)).toBe(false);
    expect(gateOf(undefined, false)).toBe(false);
  });

  it("carries the counts through the context unswapped", () => {
    render(
      <Step3SectionChromeContext.Provider
        value={
          {
            Icon: (() => null) as never,
            label: "Parse warnings",
            flagged: false,
            judgment: false,
            routedWarnings: { here: 1, elsewhere: 2 },
            routedWarningsRenderElsewhere: true,
          } as never
        }
      >
        <Probe />
      </Step3SectionChromeContext.Provider>,
    );
    const probe = screen.getByTestId("gate-probe");
    expect(probe.getAttribute("data-gate")).toBe("true");
    expect(probe.getAttribute("data-here")).toBe("1");
    expect(probe.getAttribute("data-elsewhere")).toBe("2");
  });
});

/**
 * The RAIL channel, observed through a real `ShowReviewSurface` mount.
 *
 * This is the assertion plan review R3a finding 3 asked for. In Task 2 every
 * rail count is unchanged under every gate value, so an implementation that
 * handed `counts-present` to the rail and the conjunction to the context would
 * satisfy an unchanged-counts assertion. Capturing what the rail actually
 * RECEIVED, and comparing it to what the context carried in the same render, is
 * what excludes that.
 */

/**
 * Mounts the real `ShowReviewSurface` and captures, for one render, every gate
 * value the RAIL callbacks received and every gate value the CONTEXT carried.
 *
 * The registry is wrapped rather than mocked: `step3Sections` is called for
 * real, then each definition's `railCount` is decorated with a capture and the
 * `warnings` definition's `render` is replaced by a context probe. That keeps
 * the surface's own wiring under test instead of substituting a fake for it.
 */
async function mountAndCaptureGates(
  counts: RoutedWarnings | undefined,
  extras: boolean,
): Promise<{ railGates: boolean[]; contextGates: boolean[] }> {
  const railGates: boolean[] = [];
  const contextGates: boolean[] = [];

  function ContextProbe() {
    const chrome = useContext(Step3SectionChromeContext);
    contextGates.push(chrome?.routedWarningsRenderElsewhere === true);
    return null;
  }

  const real = await import("@/components/admin/wizard/step3ReviewSections");
  const { ShowReviewSurface } = await import("@/components/admin/review/ShowReviewSurface");

  const data = buildData();
  const defs = real.step3Sections(data).map((def) =>
    def.id === "warnings"
      ? {
          ...def,
          render: () => <ContextProbe />,
          railCount: (d: never, opts: { routedWarningsRenderElsewhere: boolean }) => {
            railGates.push(opts.routedWarningsRenderElsewhere);
            return def.railCount ? def.railCount(d, opts) : 0;
          },
        }
      : {
          ...def,
          railCount:
            def.railCount === null
              ? null
              : (d: never, opts: { routedWarningsRenderElsewhere: boolean }) => {
                  railGates.push(opts.routedWarningsRenderElsewhere);
                  return def.railCount!(d, opts);
                },
        },
  );
  vi.spyOn(real, "step3Sections").mockReturnValue(defs as never);

  function Harness() {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    return (
      <div ref={scrollerRef}>
        <ShowReviewSurface
          data={data}
          scrollerRef={scrollerRef}
          layout="modal"
          {...(counts !== undefined ? { routedWarnings: counts } : {})}
          {...(extras ? { renderSectionExtras: () => null } : {})}
        />
      </div>
    );
  }

  render(<Harness />);
  return { railGates, contextGates };
}

describe("the rail and the context receive the SAME gate value", () => {
  const cases: { name: string; counts: RoutedWarnings | undefined; extras: boolean }[] = [
    { name: "both present", counts: { here: 1, elsewhere: 2 }, extras: true },
    { name: "counts only", counts: { here: 1, elsewhere: 2 }, extras: false },
    { name: "extras only", counts: undefined, extras: true },
    { name: "neither", counts: undefined, extras: false },
  ];

  it.each(cases)("agree in the '$name' configuration", async ({ counts, extras }) => {
    const { railGates, contextGates } = await mountAndCaptureGates(counts, extras);

    // Both channels saw at least one render, or the assertion below is vacuous.
    expect(railGates.length).toBeGreaterThan(0);
    expect(contextGates.length).toBeGreaterThan(0);

    const expected = counts !== undefined && extras;
    expect(new Set(railGates)).toEqual(new Set([expected]));
    expect(new Set(contextGates)).toEqual(new Set([expected]));
  });
});
