import { createHash } from "node:crypto";

export type ScreenshotTheme = "light" | "dark" | "both";

export type ScreenshotViewport = {
  width: number;
  height: number;
};

export type ManifestEntry = {
  key: string;
  route: string;
  fixture: string;
  frozenClockInstant: string;
  viewport: ScreenshotViewport;
  theme?: ScreenshotTheme;
  waitFor?: string;
  captureSelector?: string;
  expectStableMs?: number;
};

export const DESKTOP = { width: 1280, height: 800 } as const satisfies ScreenshotViewport;
export const MOBILE = { width: 390, height: 844 } as const satisfies ScreenshotViewport;

const RPAS_CENTRAL_2026 = "2026-03-rpas-central-four-seasons";
const RPAS_CENTRAL_2026_SLUG = "2026-03-retirement-plan-advisor-institute-central-2026";
const RPAS_CENTRAL_2026_PREVIEW_CREW_NAME = "Eric Weiss";
const RPAS_CENTRAL_2026_PREVIEW_CREW_ID = stableUuid(
  `seed-fixture:${RPAS_CENTRAL_2026}:crew:${RPAS_CENTRAL_2026_PREVIEW_CREW_NAME}`,
);
const MID_SHOW_INSTANT = "2026-03-24T15:00:00.000Z";

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function stableUuid(input: string): string {
  const hex = stableHash(input);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export const MANIFEST: readonly ManifestEntry[] = [
  {
    key: "dashboard-overview",
    route: "/admin",
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: DESKTOP,
    captureSelector: "[data-testid=admin-dashboard]",
  },
  {
    key: "review-queues-empty-state",
    route: "/admin",
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: DESKTOP,
    // M12.2 Phase A: the redesign retired the standalone "Sheets we couldn't
    // auto-apply" panel (admin-pending-panel, no longer rendered on /admin) and
    // folded both review queues into the right-column "Needs attention" inbox.
    // Capture that section (heading + empty-state box) — the direct analog of
    // the old panel's empty state. The RPAS fixture has 0 pending rows, so the
    // inbox renders "Nothing waiting on you."
    captureSelector: "[data-testid=dashboard-inbox-col]",
  },
  {
    key: "preview-as-crew-banner",
    route: `/admin/show/${RPAS_CENTRAL_2026_SLUG}/preview/${RPAS_CENTRAL_2026_PREVIEW_CREW_ID}`,
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: MOBILE,
    captureSelector: "[data-testid=admin-preview-banner]",
  },
  {
    key: "needs-attention-mobile",
    route: "/admin/needs-attention",
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: MOBILE,
    captureSelector: "[data-testid=admin-needs-attention-page]",
  },
  // §4.11 crew-page screenshots — drift-CI-only (no admin help MDX consumer).
  // Captured via the admin-preview route (R14 fallback): the harness signs in as
  // ADMIN, and resolveShowPageAccess would return the ADMIN arm on the tokenized
  // crew route — baselining the WRONG (plain-admin) view. The admin-preview route
  // is admin-authed (which the harness already is) but renders CrewShell as the
  // PREVIEWED crew (admin_preview → isAdmin=false, the crew's flags), so it IS the
  // crew experience (at the cost of a PreviewBanner + identityChip=null header
  // delta). `?s=<section>` threads through to CrewShell's activeSection.
  {
    key: "crew-preview-today-mobile",
    route: `/admin/show/${RPAS_CENTRAL_2026_SLUG}/preview/${RPAS_CENTRAL_2026_PREVIEW_CREW_ID}?s=today`,
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: MOBILE,
    captureSelector: "[data-testid=crew-shell]",
  },
  {
    key: "crew-preview-gear-mobile",
    route: `/admin/show/${RPAS_CENTRAL_2026_SLUG}/preview/${RPAS_CENTRAL_2026_PREVIEW_CREW_ID}?s=gear`,
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: MOBILE,
    captureSelector: "[data-testid=crew-shell]",
  },
  {
    key: "crew-preview-schedule-mobile",
    route: `/admin/show/${RPAS_CENTRAL_2026_SLUG}/preview/${RPAS_CENTRAL_2026_PREVIEW_CREW_ID}?s=schedule`,
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: MOBILE,
    captureSelector: "[data-testid=crew-shell]",
  },
];
