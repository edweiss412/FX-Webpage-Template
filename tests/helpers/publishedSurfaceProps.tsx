// tests/helpers/publishedSurfaceProps.tsx
//
// The SHARED published-surface props builder for the warning-panel-polish
// suites (plan docs/superpowers/plans/2026-07-22-warning-panel-polish/plan.md
// Tasks 4-7). Modeled on the canonical scaffold in
// tests/components/admin/review/routedWarningsGate.test.tsx:
// buildPublishedSectionData over a minimal snapshot, the production
// buildSectionWarningModel + deriveRoutedWarnings derivations, and the real
// buildSectionWarningExtras factory — so a suite renders <ShowReviewSurface
// {...buildPublishedSurfaceProps(opts)} /> against production wiring, never a
// hand-built chrome.
//
// NOTE: suites importing this must run under jsdom and mock next/navigation
// (see the pragma + vi.mock in each consuming suite).
import type { ComponentProps } from "react";
import type { RefObject } from "react";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { renderedSectionIds } from "@/components/admin/review/sectionInclusion";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import type { SectionAttention } from "@/lib/admin/sectionAttention";
import type { NoteItem } from "@/lib/admin/parseAttentionNote";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";

const SHOW_ID = "44444444-4444-4444-4444-444444444445";
const SLUG = "polish-fixture-show";

/** Section label -> the id + a warn emitter routed there (blockRef kind per
 *  KIND_TO_SECTION, lib/admin/step3SectionStatus.ts:22). */
const SECTION_WARN: Record<string, { id: SectionId; make: (n: number) => ParseWarning }> = {
  Crew: {
    id: "crew",
    make: (n) =>
      ({
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: `unknown role ${n}`,
        rawSnippet: `Role | crew-${n}`,
        blockRef: { kind: "crew", name: `crew-${n}` },
      }) as ParseWarning,
  },
  "Rooms & scope": {
    id: "rooms",
    make: (n) =>
      ({
        severity: "warn",
        code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
        message: `ambiguous room ${n}`,
        rawSnippet: `Room | room-${n}`,
        blockRef: { kind: "rooms", name: `room-${n}` },
      }) as ParseWarning,
  },
  Hotels: {
    id: "hotels",
    make: (n) =>
      ({
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: `unknown hotel field ${n}`,
        rawSnippet: `Hotel | h-${n}`,
        blockRef: { kind: "hotels", name: `hotel-${n}` },
      }) as ParseWarning,
  },
  Contacts: {
    id: "contacts",
    make: (n) =>
      ({
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: `unknown contact field ${n}`,
        rawSnippet: `Contact | c-${n}`,
        blockRef: { kind: "contacts", name: `contact-${n}` },
      }) as ParseWarning,
  },
};

function unroutedWarn(n: number): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `unrecognized row ${n}`,
    rawSnippet: `Mystery Row ${n} | value ${n}`,
  } as ParseWarning;
}

function infoTypo(n: number): ParseWarning {
  return {
    severity: "info",
    code: "TYPO_NORMALIZED",
    message: `Typo alias 'venu${n}' normalized to canonical 'venue'`,
    blockRef: { kind: "venue" },
    rawSnippet: `venu${n}`,
  } as ParseWarning;
}

export type PublishedSurfaceOpts = {
  /** Info rows the panel lists (spec: published rows are info-only). */
  listed?: number;
  /** Explicit info rows (overrides `listed`). */
  infoRows?: readonly ParseWarning[];
  /** ACTIVE warn rows in the fallback `warnings` bucket (cards below panel). */
  here?: number;
  /** ACTIVE warn rows routed to crew (shorthand for one elsewhere section). */
  elsewhere?: number;
  /** ACTIVE warn rows routed to crew specifically (mixed-state tests). */
  elsewhereInCrew?: number;
  /** Elsewhere sections BY LABEL (pointer tests): one warn per named section. */
  elsewhereSections?: readonly string[];
  /** Pointer overflow: pretend this many TOTAL elsewhere sections exist (the
   *  unresolved remainder folds into "and N more"). Implemented by adding
   *  warns routed to section ids NOT in the rendered registry. */
  elsewhereTotalSections?: number;
  /** Omit renderSectionExtras + routedWarnings: the staged-shaped gate-off mount. */
  gateOff?: boolean;
  /** Attach a parse note to the warnings section (suppression stays off). */
  withParseNotes?: boolean;
};

function buildData(warnings: ParseWarning[]): PublishedSectionData {
  return buildPublishedSectionData(
    {
      show: {
        id: SHOW_ID,
        title: "Polish Fixture Show",
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
        drive_file_id: "DRIVE_POLISH",
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
      crew_members: [],
      rooms: [],
      hotel_reservations: [],
      transportation: [],
      contacts: [],
    } as never,
    { slug: SLUG },
  );
}

const PUBLISHED_SECTION_IDS = new Set<SectionId>(
  renderedSectionIds({ mode: "published", agendaBaseline: [] } as never) as SectionId[],
);

export function buildPublishedSurfaceProps(
  opts: PublishedSurfaceOpts = {},
): ComponentProps<typeof ShowReviewSurface> {
  const warnings: ParseWarning[] = [];
  if (opts.infoRows) warnings.push(...opts.infoRows);
  else for (let i = 0; i < (opts.listed ?? 0); i++) warnings.push(infoTypo(i));
  for (let i = 0; i < (opts.here ?? 0); i++) warnings.push(unroutedWarn(i));
  const crewCount = (opts.elsewhere ?? 0) + (opts.elsewhereInCrew ?? 0);
  for (let i = 0; i < crewCount; i++) warnings.push(SECTION_WARN.Crew!.make(i));
  const labels = opts.elsewhereSections ?? [];
  labels.forEach((label, i) => {
    const def = SECTION_WARN[label];
    if (!def) throw new Error(`no warn emitter for section label '${label}'`);
    warnings.push(def.make(100 + i));
  });
  // Unresolved-section overflow: warns whose blockRef kind routes to a section
  // id absent from the rendered registry (hotels is rendered only with data,
  // so `hotels`-routed warns on an empty show are "elsewhere" in the model but
  // label-unresolvable in the pointer registry).
  const totalWanted = opts.elsewhereTotalSections ?? labels.length;
  for (let i = labels.length; i < totalWanted; i++) {
    warnings.push({
      severity: "warn",
      code: "UNKNOWN_FIELD",
      message: `hotel warn ${i}`,
      rawSnippet: `Hotel | h-${i}`,
      blockRef: { kind: "hotels", name: `h-${i}` },
    } as ParseWarning);
  }

  const data = buildData(warnings);
  const scrollerRef: RefObject<HTMLElement | null> = { current: null };

  const base = {
    data,
    scrollerRef,
    layout: "modal" as const,
  };
  if (opts.gateOff === true) return base as ComponentProps<typeof ShowReviewSurface>;

  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings,
    ignoredFingerprints: new Set<string>(),
    renderedSectionIds: PUBLISHED_SECTION_IDS,
  });
  const routedWarnings = deriveRoutedWarnings(bySection);
  const renderSectionExtras = buildSectionWarningExtras({ bySection });

  const sectionAttention: SectionAttention | undefined = opts.withParseNotes
    ? new Map([
        [
          "warnings" as never,
          {
            sectionTop: [],
            notes: [
              {
                id: "note-1",
                alert: { code: "RESYNC_QUALITY_REGRESSED" },
              } as never as NoteItem,
            ],
          },
        ],
      ])
    : undefined;

  return {
    ...base,
    routedWarnings,
    renderSectionExtras,
    ...(sectionAttention ? { sectionAttention } : {}),
  } as ComponentProps<typeof ShowReviewSurface>;
}
