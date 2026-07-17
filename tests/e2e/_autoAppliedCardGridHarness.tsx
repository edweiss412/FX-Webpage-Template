/**
 * tests/e2e/_autoAppliedCardGridHarness.tsx — renderToStaticMarkup harness for the
 * RecentAutoAppliedStrip change-card button grid (AUTOAPPLIED-REDESIGN-1, spec §6).
 * Run via `tsx` from the layout spec (NOT imported — Playwright's test transform
 * rewrites JSX in every .tsx it loads into component-testing payloads that
 * react-dom/server cannot render; same boundary as _dataQualityBadgeHarness.tsx).
 * The main-guard writes { body } — the rendered HTML string — to argv[2].
 *
 * It renders the REAL `RecentAutoAppliedStrip` (not a re-authored grid) with
 * `defaultExpanded` so the group panel is open and its buttons have real layout
 * width. The fixture is a single multi-row group carrying BOTH card layouts:
 * two undoable rows (grid-cols-2 → Accept + Undo) and one non-undoable row
 * (grid-cols-1 → Accept only). The spec asserts the 1fr/1fr split and the
 * single==double+gap full-width invariant against the measured button boxes.
 */
import { renderToStaticMarkup } from "react-dom/server";
import {
  RecentAutoAppliedStrip,
  type RecentAutoAppliedStripActions,
} from "@/components/admin/RecentAutoAppliedStrip";
import type { RecentAutoApplied } from "@/lib/admin/loadRecentAutoApplied";

// No-op server-action stubs — the harness only measures the resting layout, no
// action is ever dispatched.
const ACTIONS: RecentAutoAppliedStripActions = {
  acceptChangeAction: async () => ({ ok: true, count: 1 }),
  acceptAllAction: async () => ({ ok: true, count: 1 }),
  undoFromDashboardAction: async () => ({ ok: true }),
};

const DATA: RecentAutoApplied = {
  kind: "ok",
  renderedCount: 3,
  overflowCount: 0,
  rosterShiftByShow: {},
  groups: [
    {
      showId: "show-grid",
      slug: "grid",
      showName: "II - Grid Layout Show 2026",
      rows: [
        {
          // undoable → grid-cols-2 (Accept + Undo, 1fr/1fr)
          id: "u1",
          changeKind: "crew_added",
          summary: "Crew member Priya Nair added",
          occurredAt: "2026-07-07T10:00:00Z",
          undoable: true,
          diff: { kind: "single", caption: "Added", value: "Priya Nair" },
        },
        {
          // undoable → grid-cols-2
          id: "u2",
          changeKind: "crew_renamed",
          summary: "Crew member Bob renamed to Robert Chen",
          occurredAt: "2026-07-07T09:00:00Z",
          undoable: true,
          diff: { kind: "fromTo", from: "Bob", to: "Robert Chen" },
        },
        {
          // non-undoable → grid-cols-1 (Accept only, full width)
          id: "s1",
          changeKind: "field_changed",
          summary: "A field changed on this sync",
          occurredAt: "2026-07-07T08:00:00Z",
          undoable: false,
          diff: { kind: "none" },
        },
      ],
      acceptableIds: ["u1", "u2", "s1"],
      undoableIds: ["u1", "u2"],
    },
  ],
};

export function renderAutoAppliedCardGridBody(): string {
  // Fixed-width container so the grid width is deterministic; the group is
  // multi-row so no singleton flatten fires (each row keeps its card + p-3).
  return renderToStaticMarkup(
    <main style={{ padding: "1rem", maxWidth: "480px" }}>
      <RecentAutoAppliedStrip data={DATA} actions={ACTIONS} defaultExpanded />
    </main>,
  );
}

// Direct-execution entry: `tsx _autoAppliedCardGridHarness.tsx <out.json>` writes
// the rendered body so the layout spec never imports this .tsx (see file header).
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _autoAppliedCardGridHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(outPath, JSON.stringify({ body: renderAutoAppliedCardGridBody() }));
}
