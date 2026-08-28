// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/publishedAttentionBaseline.test.tsx
 * (wizard-review-attention-menu spec §12.19a — Task 1)
 *
 * The published twins of T-STEP3-INVARIANT: byte baselines for the published
 * modal's header cluster (pill + menu mount + close button) and for the open
 * `AttentionMenu` panel, captured from the PRE-change tree. Task 4 splits the
 * menu into an exported frame + row and Task 6 adds a `warningIndex` group; both
 * claim the untouched states are unchanged, and these two fixtures are what
 * makes that claim checkable rather than asserted.
 *
 * WHY captured in vitest rather than by a standalone script (the Step 3 route):
 * `PublishedReviewModal` needs the `ShareTokenProvider` wrapper and the
 * `next/navigation` mock, and its props carry `vi.fn()` actions. The component
 * only renders inside this module graph, so the same graph captures it.
 * `PUBLISHED_ATTENTION_CAPTURE=1` writes the fixtures instead of comparing;
 * regenerating is a deliberate, reviewable act, never a `-u` side effect.
 */
import "@testing-library/jest-dom/vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Same unified next/navigation mock as publishedReviewModal.test.tsx:
// useShowModalNav (useRouter/useSearchParams) and StatusStrip's refresh().
const routerPush = vi.fn();
const routerRefresh = vi.fn();
const routerPrefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush, prefetch: routerPrefetch }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import {
  PublishedReviewModal,
  type PublishedReviewModalProps,
} from "@/components/admin/showpage/PublishedReviewModal";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { normalizeIds } from "@/tests/helpers/step3HeaderBaseline";
import {
  PUBLISHED_ATTENTION_MENU_FIXTURE_PATH,
  PUBLISHED_ATTENTION_PILL_FIXTURE_PATH,
} from "@/tests/helpers/publishedAttentionBaseline";
import { needsLookItem, selfHealItem } from "./_attentionItemFixture";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import type { FeedEntry } from "@/lib/sync/holds/types";

afterEach(cleanup);

const SHOW_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "published-fixture-show";
const DRIVE_FILE_ID = "DRIVE_PUB";
const TITLE = "Published Fixture Show";
const SHEET_HREF = "https://docs.google.com/spreadsheets/d/DRIVE_PUB/edit";
const NOW = new Date("2026-07-16T12:00:00.000Z");
const TB = "published-show-review";

// The props scaffold is DUPLICATED from publishedReviewModal.test.tsx rather
// than lifted: it closes over `vi.fn()` actions and that suite's module graph.
function snapshot(warnings: ParseWarning[] = []): ShowReviewSnapshot {
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

function renderedSectionIds(d: PublishedSectionData): Set<SectionId> {
  return new Set(step3Sections(d).map((s) => s.id));
}

function feedEntry(): FeedEntry {
  return {
    id: "entry-1",
    occurredAt: "2026-07-16T11:00:00.000Z",
    status: "applied",
    summary: "Crew updated",
    action: "none",
    entityRef: null,
    acceptable: false,
    acknowledgedAt: null,
  };
}

function baseProps(
  overrides: Partial<PublishedReviewModalProps> = {},
  warnings: ParseWarning[] = [],
): PublishedReviewModalProps {
  const data = buildPublishedSectionData(snapshot(warnings), { slug: SLUG });
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints: new Set<string>(),
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
    attentionItems: [],
    alertsDegraded: false,
    openSheetHref: SHEET_HREF,
    archiveAction: vi.fn(async () => ({ ok: true }) as const),
    unarchiveAction: vi.fn(async () => {}),
    crewEmails: [],
    pickerCrew: [],
    feed: { entries: [feedEntry()], truncated: false },
    undoAction: vi.fn(),
    acceptAction: vi.fn(),
    acceptAllAction: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
    alertId: null,
    ...overrides,
  };
}

function renderModal(overrides: Partial<PublishedReviewModalProps> = {}) {
  const props = baseProps(overrides);
  return render(
    <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
      <PublishedReviewModal {...props} />
    </ShareTokenProvider>,
  );
}

const CAPTURE = process.env.PUBLISHED_ATTENTION_CAPTURE === "1";

function check(path: string, html: string) {
  const abs = join(process.cwd(), path);
  if (CAPTURE) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${html}\n`);
  }
  const expected = readFileSync(abs, "utf8").trim();
  // Anti-vacuity: an empty or stub fixture would pass for any markup at all.
  expect(expected.length).toBeGreaterThan(300);
  expect(html).toBe(expected);
}

/** The ONE item list both baselines render: one needs-you row and one
 *  monitoring row, so the pill reads "1 issue · 1 monitoring" (never "In sync")
 *  and the menu carries both groups plus the needs-you heading. */
const ITEMS = () => [needsLookItem("a1"), selfHealItem("s1", "Sync stalled")];

describe("published attention baselines (pre-change tree)", () => {
  it("the open AttentionMenu panel matches its byte baseline", () => {
    const pillRef = createRef<HTMLButtonElement>();
    const pill = document.createElement("button");
    document.body.appendChild(pill);
    (pillRef as { current: HTMLButtonElement | null }).current = pill;
    render(
      <AttentionMenu
        items={ITEMS()}
        open
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        pillRef={pillRef}
      />,
    );
    check(
      PUBLISHED_ATTENTION_MENU_FIXTURE_PATH,
      normalizeIds(screen.getByTestId(`${TB}-attention-menu`).outerHTML),
    );
    pill.remove();
  });

  it("the published modal header cluster matches its byte baseline", () => {
    renderModal({ attentionItems: ITEMS() });
    check(
      PUBLISHED_ATTENTION_PILL_FIXTURE_PATH,
      normalizeIds(screen.getByTestId(`${TB}-header`).innerHTML),
    );
  });
});
