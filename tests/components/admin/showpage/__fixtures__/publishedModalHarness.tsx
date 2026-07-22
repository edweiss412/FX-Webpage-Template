// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx
 *
 * Shared render harness for the unread-callout-dedup published-modal tests
 * (Fix A dedup, Fix B flagged-zero-count header, Fix C clearing pill). One
 * fixture so the three concerns share the same real `PublishedReviewModal`
 * call-site without duplicating ~90 lines of props boilerplate.
 *
 * NOTE: `next/navigation` must be mocked by the IMPORTING test module (vi.mock
 * is hoisted per-file); this harness assumes that mock is present.
 */
import { render } from "@testing-library/react";
import { vi } from "vitest";
import {
  PublishedReviewModal,
  type PublishedReviewModalProps,
} from "@/components/admin/showpage/PublishedReviewModal";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";

export const SHOW_ID = "22222222-2222-2222-2222-222222222222";
export const SLUG = "published-fixture-show";
export const DRIVE_FILE_ID = "DRIVE_PUB";
export const TITLE = "Published Fixture Show";
export const NOW = new Date("2026-07-16T12:00:00.000Z");

export type RawRow = { block: string; key: string; value: string };

/** Byte-for-byte the warn `emitUnknownField` pushes (lib/parser/warnings.ts:330-336). */
export function unknownFieldWarn(row: RawRow): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `Unrecognized ${row.block} row label: '${row.key}'`,
    blockRef: { kind: row.block, name: row.key },
    rawSnippet: `${row.key} | ${row.value}`,
  };
}

function snapshot(rawRows: readonly RawRow[]): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: TITLE,
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
      parse_warnings: rawRows.map(unknownFieldWarn),
      raw_unrecognized: [...rawRows],
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

function renderedSectionIds(d: PublishedSectionData): Set<SectionId> {
  return new Set(step3Sections(d).map((s) => s.id));
}

export type HarnessOpts = {
  ignoredFingerprints?: ReadonlySet<string>;
  attentionItems?: PublishedReviewModalProps["attentionItems"];
};

function baseProps(rawRows: readonly RawRow[], opts: HarnessOpts = {}): PublishedReviewModalProps {
  const data = buildPublishedSectionData(snapshot(rawRows), { slug: SLUG });
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints: opts.ignoredFingerprints ?? new Set<string>(),
    renderedSectionIds: renderedSectionIds(data),
  });
  return {
    data,
    bySection,
    slug: SLUG,
    showId: SHOW_ID,
    title: TITLE,
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: vi.fn(async () => ({ ok: true }) as const),
    isLive: false,
    lastSyncedAt: "2026-07-16T11:48:00.000Z",
    lastCheckedAt: "2026-07-16T11:58:00.000Z",
    lastSyncStatus: "ok",
    now: NOW,
    attentionItems: opts.attentionItems ?? [],
    alertsDegraded: false,
    openSheetHref: "https://docs.google.com/spreadsheets/d/DRIVE_PUB/edit",
    archiveAction: vi.fn(async () => ({ ok: true }) as const),
    unarchiveAction: vi.fn(async () => {}),
    crewEmails: [],
    pickerCrew: [],
    feed: { entries: [], truncated: false },
    undoAction: vi.fn(),
    acceptAction: vi.fn(),
    acceptAllAction: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
    alertId: null,
  };
}

export function renderPublishedModal(rawRows: readonly RawRow[], opts: HarnessOpts = {}) {
  return render(
    <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
      <PublishedReviewModal {...baseProps(rawRows, opts)} />
    </ShareTokenProvider>,
  );
}

/** A non-actionable attention item → the header pill enters its "N clearing" state
 *  (clearingCount = live − actionable). Minimal shape; only the fields the pill
 *  derivation reads matter. */
export function clearingAlertItem(id: string): PublishedReviewModalProps["attentionItems"][number] {
  return {
    id: `alert:${id}`,
    kind: "alert",
    tone: "notice",
    sectionId: "overview",
    crewKey: null,
    actionable: false,
    menuTitle: "Sheet unavailable",
    menuSubtitle: "Crew",
    alert: {
      alertId: id,
      code: "TEST_FAKE_ATTENTION_CODE",
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-16T09:00:00.000Z",
      occurrenceCount: 1,
      autoClearNote: "Clears automatically once the sheet is back or re-parses.",
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
  };
}

/** Install the jsdom scroll stubs + a benign fetch the modal's mount effects need. */
export function installModalDomStubs() {
  (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
  (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)),
  );
}
