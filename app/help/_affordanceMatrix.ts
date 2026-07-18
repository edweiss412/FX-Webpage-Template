// Phase G.1 typed source of truth for spec section 5.6 affordance rows.
//
// Row classes:
// - concrete: one finite data-testid per source affordance, walked by test #13
// - template-family: per-code error-message links generated from messageFor(code)
// - negative: crew-context absence assertion

export type ConcreteRow = {
  kind: "concrete";
  sourceSurface: string;
  sourceRoute: string;
  affordance: string;
  testid: string;
  target: string;
  visibleAt: "mobile" | "desktop" | "both";
  owningMilestone: string;
};

export type TemplateFamilyRow = {
  kind: "template-family";
  sourceSurface: string;
  sourceRoute: string;
  affordance: string;
  testidPattern: string;
  targetPattern: string;
  owningMilestone: string;
};

export type NegativeRow = {
  kind: "negative";
  sourceSurface: string;
  sourceRoute: string;
  assertion: string;
};

export type AffordanceRow = ConcreteRow | TemplateFamilyRow | NegativeRow;

export const AFFORDANCE_MATRIX: ReadonlyArray<AffordanceRow> = [
  {
    kind: "concrete",
    sourceSurface: "Dashboard - Active Shows header",
    sourceRoute: "/admin",
    affordance: "? tooltip",
    testid: "help-affordance--dashboard-active-shows--tooltip",
    target: "/help/admin/dashboard#active-shows",
    visibleAt: "both",
    owningMilestone: "M3 / M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Dashboard - Needs attention summary card header (desktop inbox)",
    sourceRoute: "/admin",
    affordance: "? tooltip",
    testid: "help-affordance--dashboard-needs-attention--tooltip",
    target: "/help/admin/review-queues#first-seen",
    visibleAt: "desktop",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "Dashboard - Recently auto-applied strip header (desktop inbox)",
    sourceRoute: "/admin",
    affordance: "? tooltip",
    testid: "help-affordance--dashboard-recently-auto-applied--tooltip",
    target: "/help/admin/review-queues#re-stage",
    visibleAt: "desktop",
    owningMilestone: "Auto-applied header parity (2026-07-17)",
  },
  {
    kind: "concrete",
    sourceSurface: "Needs attention page header (/admin/needs-attention)",
    sourceRoute: "/admin/needs-attention",
    affordance: "? tooltip",
    testid: "help-affordance--needs-attention-page--tooltip",
    target: "/help/admin/review-queues#first-seen",
    visibleAt: "both",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "Dashboard - Review staged changes legend link",
    sourceRoute: "/admin",
    affordance: "legend link",
    testid: "help-affordance--dashboard-restage--legend",
    target: "/help/admin/review-queues#re-stage",
    visibleAt: "both",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "Dashboard - Archived shows bucket header (?bucket=archived)",
    sourceRoute: "/admin?bucket=archived",
    affordance: "? tooltip",
    testid: "help-affordance--dashboard-archived-shows--tooltip",
    target: "/help/admin/dashboard#archived",
    visibleAt: "both",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "Dashboard footer - New here?",
    sourceRoute: "/admin",
    affordance: "New here?",
    testid: "help-affordance--dashboard-footer--tour",
    target: "/help/tour",
    visibleAt: "both",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Per-show - Alerts section header",
    sourceRoute: "/admin?show=rpas-central-2026",
    affordance: "? tooltip",
    testid: "help-affordance--per-show-alerts--tooltip",
    target: "/help/admin/parse-warnings",
    visibleAt: "both",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "First-seen staged review card (/admin/show/staged/<stagedId>)",
    sourceRoute: "/admin/show/staged/STAGED_ID_PLACEHOLDER",
    affordance: "? tooltip",
    testid: "help-affordance--first-seen-review-card--tooltip",
    target: "/help/admin/review-queues#first-seen",
    visibleAt: "both",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Settings - Administrators section header",
    sourceRoute: "/admin/settings",
    affordance: "? tooltip",
    testid: "help-affordance--settings-administrators--tooltip",
    target: "/help/admin/settings#administrators",
    visibleAt: "both",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "Settings - Drive connection section header",
    sourceRoute: "/admin/settings",
    affordance: "? tooltip",
    testid: "help-affordance--settings-drive-connection--tooltip",
    target: "/help/admin/settings#drive-connection",
    visibleAt: "both",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "Settings - Drive health status badge",
    sourceRoute: "/admin/settings",
    affordance: "? tooltip (badge trigger)",
    testid: "help-affordance--settings-drive-health-badge--tooltip",
    target: "/help/admin/settings#drive-health",
    visibleAt: "both",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "Settings - Preferences section header",
    sourceRoute: "/admin/settings",
    affordance: "? tooltip",
    testid: "help-affordance--settings-preferences--tooltip",
    target: "/help/admin/settings#preferences",
    visibleAt: "both",
    owningMilestone: "M12.12",
  },
  {
    kind: "concrete",
    sourceSurface: "Settings - Maintenance section header",
    sourceRoute: "/admin/settings",
    affordance: "? tooltip",
    testid: "help-affordance--settings-maintenance--tooltip",
    target: "/help/admin/settings#maintenance",
    visibleAt: "both",
    owningMilestone: "Onboarding fixups (F4)",
  },
  {
    kind: "concrete",
    sourceSurface: "Onboarding wizard - Step 1 (service-account email)",
    sourceRoute: "/admin",
    affordance: "? icon",
    testid: "help-affordance--wizard-step1--tooltip",
    target: "/help/admin/onboarding-wizard#service-account",
    visibleAt: "both",
    owningMilestone: "M10",
  },
  {
    kind: "concrete",
    sourceSurface: "Onboarding wizard - Step 2 header",
    sourceRoute: "/admin?step=2",
    affordance: "? tooltip",
    testid: "help-affordance--wizard-step2--tooltip",
    target: "/help/admin/onboarding-wizard#step-2",
    visibleAt: "both",
    owningMilestone: "M10",
  },
  {
    kind: "concrete",
    sourceSurface: "Onboarding wizard - Step 3 header",
    sourceRoute: "/admin?step=3",
    affordance: "? tooltip",
    testid: "help-affordance--wizard-step3--tooltip",
    target: "/help/admin/onboarding-wizard#step-3",
    visibleAt: "both",
    owningMilestone: "M10",
  },
  {
    kind: "concrete",
    // Moved from the retired standalone /admin/ignored-sheets page to the
    // dashboard's collapsed "Ignored sheets" disclosure header (always rendered
    // on /admin, so the affordance stays walkable). Testid retained for parity.
    sourceSurface: "Dashboard — Ignored sheets disclosure header (/admin)",
    sourceRoute: "/admin",
    affordance: "? tooltip",
    testid: "help-affordance--ignored-sheets-page--tooltip",
    target: "/help/admin/onboarding-wizard#ignored-sheets",
    visibleAt: "both",
    owningMilestone: "Onboarding step-3 redesign",
  },
  // (Removed: "Per-show - Staged review card (re-stage)" — a DEFERRED M9 tooltip
  // for a staged-review card on the per-show panel that never shipped and is now
  // moot: Phase 6 replaced that mount with the ChangesFeed, so the per-show panel
  // renders no staged-review card. See DEFERRED.md D9.)
  {
    kind: "concrete",
    sourceSurface: "Preview-as-crew sticky banner",
    sourceRoute: "/admin/show/rpas-central-2026/preview/eric-weiss",
    affordance: "? icon (DEFERRED M11-G-D-3)",
    testid: "help-affordance--preview-banner--tooltip",
    target: "/help/admin/preview-as-crew#impersonation-banner",
    visibleAt: "both",
    owningMilestone: "M9",
  },
  {
    kind: "template-family",
    sourceSurface: "Any error rendered via messageFor(code) in /admin/*",
    sourceRoute: "/admin?show=rpas-central-2026",
    affordance: "Learn more →",
    testidPattern: "help-affordance--error-message--<code>--learn-more",
    targetPattern: "/help/errors#<code>",
    owningMilestone: "M9 / M10",
  },
  {
    kind: "negative",
    sourceSurface: "Crew page /show/<slug>/<shareToken>",
    sourceRoute: "/show/SLUG_PLACEHOLDER/SHARETOKEN_PLACEHOLDER",
    assertion: 'No data-testid^="help-affordance--" element present in rendered DOM',
  },
];

export function testidForErrorCode(code: string): string {
  return `help-affordance--error-message--${code.toLowerCase().replaceAll("_", "-")}--learn-more`;
}

export function targetForErrorCode(code: string): string {
  return `/help/errors#${code}`;
}

// Still-deferred concrete rows (M11-G-D-2 / M11-G-D-3 — DEFERRED.md). Lives
// here (not in the Playwright spec) so the Vitest meta-test can import it
// without executing Playwright test registration (spec R5).
export const DEFERRED_TESTIDS: ReadonlySet<string> = new Set([
  // ("help-affordance--per-show-restage-card--tooltip" removed — the per-show
  // staged-review card it pointed at was retired by the Phase 6 ChangesFeed; see
  // DEFERRED.md D9 and the removed matrix row above.)
  "help-affordance--preview-banner--tooltip",
  // The consolidated-admin-show-page rebuild (spec 2026-07-16) dissolved the old
  // per-show Crew / Sync-footer / Data-quality sections, orphaning their "?"
  // HoverHelp affordances. Task 13 parked them here; Task 16 (impeccable critique
  // gate) RETIRED all three — none was re-homed (crew: preview-as help is served
  // by the preview-banner affordance; sync: hover-only affordances are banned on
  // the slim floor strip; data-quality: the sibling per-show-alerts tooltip
  // already links /help/admin/parse-warnings). Their matrix rows were removed and
  // the help TARGET pages stay live. See DEFERRED.md CASP-1 (resolved-retired).
]);
