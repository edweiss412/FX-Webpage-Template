// app/help/_nav.ts — M11 Phase A.3
//
// Single source of truth for the /help sidebar nav, breadcrumb derivation, and
// the nav-consistency meta-test (Phase A.7). Spec §3.3 + §4.1–§4.3.

export type NavGroup = "get-started" | "admin-surface" | "reference";

export type NavEntry = {
  slug: string;       // e.g., "/help/admin/dashboard"
  title: string;      // sidebar + breadcrumb label
  group: NavGroup;
};

export const NAV: ReadonlyArray<NavEntry> = [
  // Get started
  { slug: "/help", title: "What this app does for you", group: "get-started" },
  { slug: "/help/getting-started", title: "First-time setup", group: "get-started" },
  { slug: "/help/daily-rhythm", title: "Your new daily rhythm", group: "get-started" },
  { slug: "/help/whats-different", title: "What's different from Sheets", group: "get-started" },

  // Admin surface
  { slug: "/help/admin/dashboard", title: "Reading the dashboard", group: "admin-surface" },
  { slug: "/help/admin/review-queues", title: "Review queues", group: "admin-surface" },
  { slug: "/help/admin/parse-warnings", title: "Parse warnings", group: "admin-surface" },
  { slug: "/help/admin/per-show-panel", title: "Per-show panel", group: "admin-surface" },
  { slug: "/help/admin/preview-as-crew", title: "Preview as crew", group: "admin-surface" },
  { slug: "/help/admin/sharing-links", title: "Sharing crew links", group: "admin-surface" },
  { slug: "/help/admin/onboarding-wizard", title: "Onboarding wizard", group: "admin-surface" },
  { slug: "/help/admin/settings", title: "Settings", group: "admin-surface" },

  // Reference
  { slug: "/help/tour", title: "Tour", group: "reference" },
  { slug: "/help/errors", title: "Errors", group: "reference" },
];

export const NAV_GROUP_TITLES: Record<NavGroup, string> = {
  "get-started": "Get started",
  "admin-surface": "The admin surface",
  reference: "Reference",
};
