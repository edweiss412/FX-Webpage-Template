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
    captureSelector: "[data-testid=admin-pending-panel]",
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
