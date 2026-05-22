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
const RPAS_CENTRAL_2026_PREVIEW_CREW_ID = "14a65611-f670-4233-8e68-5dbdee221f00";
const MID_SHOW_INSTANT = "2026-03-24T15:00:00.000Z";

export const MANIFEST: readonly ManifestEntry[] = [
  {
    key: "dashboard-overview",
    route: "/admin",
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: DESKTOP,
  },
  {
    key: "dashboard-active-shows",
    route: "/admin",
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: DESKTOP,
  },
  {
    key: "dashboard-pending-ingestion",
    route: "/admin",
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: DESKTOP,
  },
  {
    key: "per-show-staged-review",
    route: `/admin/show/${RPAS_CENTRAL_2026_SLUG}`,
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: DESKTOP,
  },
  {
    key: "review-queues-side-by-side",
    route: "/admin",
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: DESKTOP,
  },
  {
    key: "preview-as-crew-banner",
    route: `/admin/show/${RPAS_CENTRAL_2026_SLUG}/preview/${RPAS_CENTRAL_2026_PREVIEW_CREW_ID}`,
    fixture: RPAS_CENTRAL_2026,
    frozenClockInstant: MID_SHOW_INSTANT,
    viewport: MOBILE,
    captureSelector: "[data-testid=admin-preview-banner]",
  },
];
