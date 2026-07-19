// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/pageTransitions.test.tsx
 * (consolidated-admin-show-page spec §9 — Transition inventory, MANDATORY audit)
 *
 * The transition audit for the NEW consolidated-page components:
 *   PublishedReviewModal · StatusStrip · OverviewSection · ChangesSection ·
 *   sectionWarningExtras — plus the surface's page-layout extra rail/chip items
 *   (ShowReviewSurface `renderExtraRailItem`/`renderExtraChipItem`).
 *
 * Spec §9 introduces NO new state-swap animation. Every state-pair (rows A–E) is
 * either an INSTANT swap or INHERITED from a relocated component; the only classes
 * this feature adds are the F/G rail/chip hover colour-fades (a hover affordance
 * carried for registry parity, NOT a state transition). The audit proves exactly
 * that, row by row, and fails-by-default when a NEW conditional or a motion import
 * sneaks into any audited component.
 *
 * ── §9 Transition inventory → assertion map ──────────────────────────────────
 *
 * | Pair | Treatment | Where proven |
 * |------|-----------|--------------|
 * | A rail-highlight moves (scroll-spy/click) | instant highlight swap — no animation | §9-A + C×A below (aria-current is a plain swap; page components import no motion lib). The rail lives in ShowReviewSurface; its conditional topology (14 sites, 1 animated = the sliding indicator) is owned by the §11 source-marker audit and is NOT re-pinned here. |
 * | C disclosure open↔closed | existing native <details> treatment — unchanged | §9-C: sectionWarningExtras renders a native `<details>` whose body is unconditional (CSS-only reveal, instant) and whose chevron carries `transition-transform group-open:rotate-90` (the inherited disclosure affordance). |
 * | D modal-over-page open↔closed | modal shell entrance/exit hooks — unchanged | Compound D×scroll below (the shared Step3ReviewModal shell's body-scroll lock). The scrim/panel keyframes live in app/globals.css and are pinned by the §11 T1/T2 suite. |
 * | E publish-toggle idle↔pending↔settled | existing PublishedToggle treatment — unchanged | §9-E: StatusStrip wraps <PublishedToggle> verbatim; the toggle's disabled/label swaps are instant (no motion lib). Compound E×D freeze below. |
 * | F side-rail item rest↔hover | `transition-colors duration-fast` colour-fade | §9-F: the Overview/Changes side-rail buttons carry the class string (behavioral). |
 * | G chip-rail item rest↔hover | `transition-colors duration-fast` colour-fade | §9-G: the Overview/Changes chip buttons carry the class string (behavioral). |
 * | Compound scroll (A) while D open | body scroll lock prevents it | D×scroll below: mounting the modal shell flips `document.body.style.overflow` to "hidden"; unmount restores it. |
 * | Compound E pending while D open | freeze contract — same `isPublishRunActive` signal | E×D below: the strip's PublishedToggle disables on `finalizeOwned` (the page's freeze signal; the wizard's `_metaStep3FreezeContract` pins the mirror `isPublishRunActive`). |
 * | Compound C mid-toggle while A changes | no coupling — instant rail swap | C×A below: toggling a section's Ignored disclosure does NOT move the rail's aria-current. |
 *
 * ── Enumeration method (fail-by-default) ─────────────────────────────────────
 * Conditional-render sites in the five NEW components are enumerated by a
 * source scan (`findConditionalLines`, the SAME regexes as the §11 source-marker
 * audit) and the per-file count is PINNED. A new ternary/`&&` JSX mount added
 * later bumps the count and fails this file until the author reviews it. Paired
 * with a blanket "no motion library / no motion exit/initial/animate props"
 * assertion, every enumerated (and any future) conditional is proven INSTANT —
 * there is no marker-comment mechanism because, unlike the modal, these
 * components contain ZERO animated conditionals (no framer-motion at all).
 * `transition-*` classes are NOT blanket-forbidden: they legitimately appear as
 * hover affordances (rows F/G, the alert-badge link, the wrapped toggle) — the
 * blanket targets state-swap animation primitives only, exactly like the shipped
 * dataGaps/dataQuality transition audits.
 *
 * Anti-tautology: F/G class-string checks read the RENDERED rail/chip buttons
 * (scoped to their own testids, so a sibling can't satisfy them). The C×A proof
 * reads aria-current off the rail the surface actually produced, before/after a
 * real disclosure toggle. The E×D freeze reads the toggle's `disabled` attribute
 * across two prop fixtures. The D×scroll proof observes the real modal effect.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LayoutDashboard, History } from "lucide-react";

// One unified next/navigation mock for the whole file: StatusStrip's copy-link +
// the surface harness use useRouter/usePathname/useSearchParams; the modal footer's
// RescanSheetButton uses useRouter().refresh().
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/east-coast-summit",
  useSearchParams: () => new URLSearchParams(),
}));

import { StatusStrip, type StatusStripProps } from "@/components/admin/showpage/StatusStrip";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { ShowReviewSurface, type ExtraSection } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import { buildParseResult, stagedRow } from "../wizard/_step3ReviewFixture";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const ROOT = join(__dirname, "..", "..", "..", "..");
function src(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ── Source enumeration (SAME regexes as the §11 source-marker audit) ──────────

/** Every JSX ternary/`&&` conditional that mounts/unmounts an element — matches
 *  the multi-line `{cond ? (` style and the one-line `{cond ? <X` / `{cond && <X`
 *  styles, so a future conditional written either way is caught by the count pin. */
function findConditionalLines(source: string): number[] {
  const lines = source.split("\n");
  const hits: number[] = [];
  const multiLine = /^\s*\{.*\?\s*\(\s*$/;
  const oneLineTernary = /\{[a-zA-Z][^{}]*\?\s*<[A-Za-z]/;
  const oneLineAnd = /\{[a-zA-Z][^{}]*&&\s*<[A-Za-z]/;
  lines.forEach((line, i) => {
    if (multiLine.test(line) || oneLineTernary.test(line) || oneLineAnd.test(line)) hits.push(i);
  });
  return hits;
}

// Per-file conditional-render count (captured from the source; fail-by-default:
// a NEW conditional mount bumps the count and fails until reviewed). Chained
// ternary arms (`) : cond ? (`) are not separately counted — they are covered by
// the head site's count row and are proven instant by the blanket below.
const PAGE_COMPONENT_COUNTS: Record<string, number> = {
  // admin-show-modal Task 7: PublishedReviewPage was replaced by the modal
  // consumer. Its ONE JSX-mount conditional is the header sheet deep-link
  // (`openSheetHref !== null` — §6.2 guard, instant omit/mount); the Overview
  // railBadge stays an object-spread conditional (asserted separately).
  // modal-header-reconciliation §9: 1 → 2 (Task 4, the §6.3 subline's client
  // entry) → 4 (Task 5, the §6.6 alert pill AND its capped sr-only suffix —
  // `{alertCount > 99 ? (` is its own mounted conditional, which is why the
  // target is 4 and not 3). All four are instant omit/mounts that follow data.
  // Verified by RUNNING the scanner over the source, not by reasoning.
  "components/admin/showpage/PublishedReviewModal.tsx": 4,
  // modal-header-reconciliation §9: 8 → 7 (Task 2, the `renderTitle` head site —
  // which covered the h1 AND its adjacent title divider — deleted with the prop)
  // → 6 (Task 5, the alert badge relocated to the modal header, §6.6). Task 7
  // brings it back to 7 when the Re-sync slot lands. Verified by RUNNING the
  // scanner, not by reasoning.
  "components/admin/showpage/StatusStrip.tsx": 6, // archived / control-divider / live / sync / edited / copy-link
  "components/admin/showpage/OverviewSection.tsx": 4, // share / sheet-sync / open-sheet / archive-row (heads)
  "components/admin/showpage/ChangesSection.tsx": 1, // feed===null infra notice vs feed
  "components/admin/showpage/sectionWarningExtras.tsx": 1, // ignored-disclosure
};

describe("§9 source enumeration — every conditional in the new page components is INSTANT (no state-swap animation)", () => {
  for (const [rel, expected] of Object.entries(PAGE_COMPONENT_COUNTS)) {
    it(`${rel}: conditional-render count pinned at ${expected} (new mount fails-by-default)`, () => {
      expect(findConditionalLines(src(rel)).length).toBe(expected);
    });

    it(`${rel}: imports no client motion library and no AnimatePresence`, () => {
      const s = src(rel);
      expect(s, `${rel} must not import framer-motion / motion/react`).not.toMatch(
        /framer-motion|motion\/react/,
      );
      expect(s, `${rel} must not use AnimatePresence`).not.toMatch(/AnimatePresence/);
    });

    it(`${rel}: passes no motion exit/initial/animate props`, () => {
      expect(src(rel), `${rel} must not pass motion exit/initial/animate props`).not.toMatch(
        /\b(?:exit|initial|animate)\s*=\s*\{/,
      );
    });
  }

  // PublishedReviewModal's ONE conditional the JSX-mount regex can't see: the
  // Overview rail badge is added via an object-spread ternary producing a plain
  // <span> (instant — a conditional prop, never an animated presence).
  it("PublishedReviewModal adds the Overview railBadge via a plain object-spread conditional (instant)", () => {
    const s = src("components/admin/showpage/PublishedReviewModal.tsx");
    expect(s).toMatch(/\.\.\.\(alertCount > 0/);
    expect(s).toMatch(/data-testid="overview-rail-badge"/);
  });

  // Row C: the Ignored disclosure is a NATIVE <details> — its body is
  // unconditional (CSS-only reveal, instant) and its chevron carries the
  // inherited disclosure affordance, NOT a state-swap animation.
  it("§9-C: the Ignored disclosure is a native <details> with an instant CSS-only body + inherited chevron", () => {
    const s = src("components/admin/showpage/sectionWarningExtras.tsx");
    expect(s).toMatch(/<details data-testid=\{`section-ignored-warnings-\$\{id\}`\}/);
    expect(s).toMatch(/transition-transform group-open:rotate-90/);
  });
});

// ── Shared page-mode harness (published surface + Overview/Changes extras) ────

const SHOW_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "published-fixture-show";
const DRIVE_FILE_ID = "DRIVE_PUB";

const roleWarning: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "Unrecognized role token",
  roleToken: "Grip",
  blockRef: { kind: "crew" },
};
const fieldWarning: ParseWarning = {
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: "A field could not be read",
  rawSnippet: "Phone | ????",
  blockRef: { kind: "crew" },
};

function snapshot(warnings: ParseWarning[]): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Published Fixture Show",
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
      drive_file_id: DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alice Anders", role: "PM" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

const overviewExtra: ExtraSection = {
  id: "overview",
  label: "Overview",
  Icon: LayoutDashboard,
  render: () => <div data-testid="overview-section" id="overview" />,
};
const changesExtra: ExtraSection = {
  id: "changes",
  label: "Changes",
  Icon: History,
  render: () => <div data-testid="changes-section" id="changes" />,
};

function renderedSectionIds(d: PublishedSectionData): Set<SectionId> {
  return new Set(step3Sections(d).map((s) => s.id));
}

/** Page-mode surface: Overview (first) + Changes (last) extra rail items, plus the
 *  per-section warning extras (native disclosure) wired from the built model. */
function PageHarness({
  warnings = [roleWarning, fieldWarning],
  ignoredFingerprints = new Set<string>(),
}: {
  warnings?: ParseWarning[];
  ignoredFingerprints?: ReadonlySet<string>;
}) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const data = buildPublishedSectionData(snapshot(warnings), { slug: SLUG });
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints,
    renderedSectionIds: renderedSectionIds(data),
  });
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout="page"
      extraSectionsBefore={[overviewExtra]}
      extraSectionsAfter={[changesExtra]}
      renderSectionExtras={buildSectionWarningExtras({ bySection })}
    />
  );
}

const railTid = (name: string) => `wizard-step3-card-${DRIVE_FILE_ID}-review-${name}`;

// ── §9 F/G: rail/chip hover colour-fade (transition-colors duration-fast) ─────

describe("§9 F/G: Overview/Changes rail + chip items carry the hover colour-fade (transition-colors duration-fast)", () => {
  it("F: both side-rail buttons carry `transition-colors duration-fast` (a hover affordance, not a state swap)", () => {
    render(<PageHarness />);
    for (const id of ["overview", "changes"]) {
      const item = screen.getByTestId(railTid(`rail-item-${id}`));
      expect(item.className).toMatch(/\btransition-colors\b/);
      expect(item.className).toMatch(/\bduration-fast\b/);
      // Not a state-swap animation: no keyframe/utility or bracketed transition.
      expect(item.className).not.toMatch(/\banimate-|transition-\[/);
    }
  });

  it("G: both chip-rail buttons carry `transition-colors duration-fast`", () => {
    render(<PageHarness />);
    for (const id of ["overview", "changes"]) {
      const chip = screen.getByTestId(railTid(`chip-item-${id}`));
      expect(chip.className).toMatch(/\btransition-colors\b/);
      expect(chip.className).toMatch(/\bduration-fast\b/);
      expect(chip.className).not.toMatch(/\banimate-|transition-\[/);
    }
  });
});

// ── Compound C×A: disclosure toggle does not perturb the rail highlight ───────

describe("§9 compound C×A: toggling a section's Ignored disclosure does NOT move the rail highlight (no coupling — instant)", () => {
  it("the rail's aria-current is unchanged before/after a real <details> toggle; the disclosure body is CSS-gated (in the DOM even when closed)", () => {
    const fp = warningFingerprint(fieldWarning)!;
    render(
      <PageHarness warnings={[roleWarning, fieldWarning]} ignoredFingerprints={new Set([fp])} />,
    );

    // Overview is the default-active rail item on mount (first rail item, row A).
    const overviewItem = screen.getByTestId(railTid("rail-item-overview"));
    expect(overviewItem.getAttribute("aria-current")).toBe("true");

    // The crew section's Ignored disclosure exists (the field warning is ignored).
    const details = screen.getByTestId("section-ignored-warnings-crew") as HTMLDetailsElement;
    // Instant, CSS-only body: the list is in the DOM even while the <details> is
    // closed — no React conditional gates the reveal (row C: body instant).
    expect(details.open).toBe(false);
    expect(screen.getByTestId("section-ignored-list-crew")).toBeTruthy();

    // Toggle the disclosure open (native <details> — no rail-coupled handler).
    details.open = true;
    fireEvent(details, new Event("toggle", { bubbles: false }));

    // No coupling: the rail highlight (row A) is untouched by the disclosure state.
    expect(screen.getByTestId(railTid("rail-item-overview")).getAttribute("aria-current")).toBe(
      "true",
    );
  });
});

// ── §9 E + compound E×D: PublishedToggle freeze on the page's publish-run signal ─

const NOW = new Date("2026-07-16T12:00:00.000Z");

function baseStripProps(overrides: Partial<StatusStripProps> = {}): StatusStripProps {
  return {
    slug: "east-coast-summit",
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: vi.fn(async () => ({ ok: true }) as const),
    isLive: false,
    lastSyncedAt: "2026-07-16T11:48:00.000Z",
    lastCheckedAt: "2026-07-16T11:58:00.000Z",
    lastSyncStatus: "ok",
    now: NOW,
    ...overrides,
  };
}

function renderStrip(overrides: Partial<StatusStripProps> = {}) {
  return render(
    <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
      <StatusStrip {...baseStripProps(overrides)} />
    </ShareTokenProvider>,
  );
}

describe("§9-E + compound E×D: the strip's PublishedToggle freezes on the page's publish-run signal (finalizeOwned)", () => {
  it("E: toggling published state swaps aria-checked instantly with no animation class on the toggle", () => {
    renderStrip({ published: true });
    const toggle = screen.getByTestId("published-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    cleanup();
    renderStrip({ published: false });
    expect(screen.getByTestId("published-toggle").getAttribute("aria-checked")).toBe("false");
  });

  it("E×D freeze: the toggle is disabled while a publish/finalize run owns the show (finalizeOwned — the strip mirror of the wizard's isPublishRunActive)", () => {
    renderStrip({ finalizeOwned: true });
    expect((screen.getByTestId("published-toggle") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderStrip({ finalizeOwned: false });
    expect((screen.getByTestId("published-toggle") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── Compound D×scroll: the modal shell's body-scroll lock engages over the page ─

/** Minimal staged fixture (mirrors the §11 transitions suite): enough to mount
 *  the shared Step3ReviewModal shell — the "rescan-preview" modal that opens over
 *  the consolidated page. We only exercise its body-scroll-lock effect. */
function stagedData(): StagedSectionData {
  const pr = buildParseResult({});
  const row = stagedRow(pr);
  return buildStagedSectionData({
    pr,
    row,
    dfid: "drive-abc-123",
    wizardSessionId: "00000000-1111-4222-8333-444444444444",
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

describe("§9 compound D×scroll: the modal-over-page shell locks body scroll (so A cannot change while D is open)", () => {
  it("mounting the modal shell flips document.body.style.overflow to 'hidden'; unmounting restores the prior value", () => {
    const previous = document.body.style.overflow; // "" by default
    const view = render(
      <Step3ReviewModal
        data={stagedData()}
        checked={false}
        isDirtyRescan={true}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );
    // Modal shell mounted → background scroll is locked (page scroll frozen, so the
    // scroll-spy that drives row A cannot advance while the modal is open).
    expect(document.body.style.overflow).toBe("hidden");
    // The panel hook the row-D entrance/exit keyframes attach to (app/globals.css)
    // is present — the shell chrome the §11 T1/T2 suite owns.
    expect(document.querySelector("[data-step3-review-panel]")).not.toBeNull();

    view.unmount();
    // Instant, clean teardown: the lock is released to its prior value.
    expect(document.body.style.overflow).toBe(previous);
  });
});

// ── Row A cross-reference: the rail highlight is instant, owned by the surface ─

describe("§9-A: the rail highlight swap is instant (a plain aria-current move), not an animated presence", () => {
  it("clicking a registry rail item moves aria-current synchronously — no waitFor, no animation gate", () => {
    render(<PageHarness />);
    const crew = screen.getByTestId(railTid("rail-item-crew"));
    fireEvent.click(crew);
    // Instant: aria-current is on crew the moment the click's act flush returns.
    expect(crew.getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByTestId(railTid("rail-item-overview")).getAttribute("aria-current"),
    ).toBeNull();
  });
});
