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
    owningMilestone: "M3 / M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Dashboard - Sheets we couldn't auto-apply header",
    sourceRoute: "/admin",
    affordance: "? tooltip",
    testid: "help-affordance--dashboard-pending-ingestion--tooltip",
    target: "/help/admin/review-queues#first-seen",
    owningMilestone: "M3 / M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Dashboard - Review staged changes badge",
    sourceRoute: "/admin",
    affordance: "? tooltip",
    testid: "help-affordance--dashboard-restage-badge--tooltip",
    target: "/help/admin/review-queues#re-stage",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Dashboard footer - Take the tour",
    sourceRoute: "/admin",
    affordance: "Take the tour",
    testid: "help-affordance--dashboard-footer--tour",
    target: "/help/tour",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Per-show - Staged review card (re-stage)",
    sourceRoute: "/admin/show/rpas-central-2026",
    affordance: "? tooltip",
    testid: "help-affordance--per-show-restage-card--tooltip",
    target: "/help/admin/review-queues#re-stage",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "First-seen staged review card (/admin/show/staged/<stagedId>)",
    sourceRoute: "/admin/show/staged/STAGED_ID_PLACEHOLDER",
    affordance: "? tooltip",
    testid: "help-affordance--first-seen-review-card--tooltip",
    target: "/help/admin/review-queues#first-seen",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Per-show - Sync health header",
    sourceRoute: "/admin/show/rpas-central-2026",
    affordance: "? tooltip",
    testid: "help-affordance--per-show-sync-health--tooltip",
    target: "/help/admin/per-show-panel#sync-health",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Per-show - Parse warnings header",
    sourceRoute: "/admin/show/rpas-central-2026",
    affordance: "? tooltip",
    testid: "help-affordance--per-show-parse-warnings--tooltip",
    target: "/help/admin/parse-warnings",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Per-show - Crew preview links header",
    sourceRoute: "/admin/show/rpas-central-2026",
    affordance: "? tooltip",
    testid: "help-affordance--per-show-preview-links--tooltip",
    target: "/help/admin/preview-as-crew",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Preview-as-crew sticky banner",
    sourceRoute: "/admin/show/rpas-central-2026/preview/eric-weiss",
    affordance: "? icon",
    testid: "help-affordance--preview-banner--tooltip",
    target: "/help/admin/preview-as-crew#impersonation-banner",
    owningMilestone: "M9",
  },
  {
    kind: "concrete",
    sourceSurface: "Onboarding wizard - Step 1 (service-account email)",
    sourceRoute: "/admin",
    affordance: "? icon",
    testid: "help-affordance--wizard-step1--tooltip",
    target: "/help/admin/onboarding-wizard#service-account",
    owningMilestone: "M10",
  },
  {
    kind: "concrete",
    sourceSurface: "Onboarding wizard - Step 2 header",
    sourceRoute: "/admin",
    affordance: "? tooltip",
    testid: "help-affordance--wizard-step2--tooltip",
    target: "/help/admin/onboarding-wizard#step-2",
    owningMilestone: "M10",
  },
  {
    kind: "concrete",
    sourceSurface: "Onboarding wizard - Step 3 header",
    sourceRoute: "/admin",
    affordance: "? tooltip",
    testid: "help-affordance--wizard-step3--tooltip",
    target: "/help/admin/onboarding-wizard#step-3",
    owningMilestone: "M10",
  },
  {
    kind: "template-family",
    sourceSurface: "Any error rendered via messageFor(code) in /admin/*",
    sourceRoute: "/admin/show/rpas-central-2026",
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
  return `help-affordance--error-message--${code
    .toLowerCase()
    .replaceAll("_", "-")}--learn-more`;
}

export function targetForErrorCode(code: string): string {
  return `/help/errors#${code}`;
}
