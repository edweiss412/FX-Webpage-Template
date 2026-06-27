// app/help/errors/_families.ts
// Code-family taxonomy for the /help/errors index (audit Chunk 4). Kept OUT of
// page.tsx because a Next App Router page module should only export route
// members (default, metadata, dynamic, …); the page + tests/help/errors-
// grouping.test.tsx both import this helper module instead.
//
// Each family owns a set of code PREFIXES (the leading token before the first
// `_`/`-`, e.g. SYNC, STAGED, MI, MI11). A renderable code is assigned to the
// FIRST family whose `prefixes` contains its prefix; anything unmatched falls
// into the "Other" group — kept empty today, but it guarantees a new code is
// never silently dropped (pinned by tests/help/errors-grouping.test.tsx).
// Ordered by Doug's journey through the app. Placement of a code is a
// readability aid, not a contract.
export type Family = { id: string; title: string; blurb: string; prefixes: string[] };

export const FAMILIES: Family[] = [
  {
    id: "setup-drive",
    title: "Setup & Drive connection",
    blurb: "First-run setup and the app's link to your Google Drive folder.",
    prefixes: [
      "ONBOARDING",
      "WIZARD",
      "FOLDER",
      "OPERATOR",
      "DRIVE",
      "WEBHOOK",
      "INVALID",
      "REAP",
      "NO",
      "WATCH",
      "CLEANUP",
      "CONCURRENT",
      "FINALIZE",
    ],
  },
  {
    id: "sign-in",
    title: "Sign-in & the crew picker",
    blurb: "Admin sign-in and the crew identity picker.",
    prefixes: ["OAUTH", "PICKER", "AMBIGUOUS", "CALLBACK"],
  },
  {
    id: "syncing-sheets",
    title: "Syncing & reading sheets",
    blurb: "The sync pipeline reading, parsing, staging, and applying your sheets.",
    prefixes: [
      "SYNC",
      "PULL",
      "SHEET",
      "PARSE",
      "STAGED",
      "STALE",
      "PENDING",
      "LIVE",
      "MISSING",
      "APPLY",
      "DUPLICATE",
      "EXTRA",
    ],
  },
  {
    id: "crew-schedule",
    title: "Crew, schedule & travel data",
    blurb: "Reading crew, schedule, and travel rows out of the sheet.",
    prefixes: ["MI", "MI11", "UNKNOWN", "AGENDA", "TRAVEL", "DAY", "SCHEDULE", "STAGE", "IDENTITY"],
  },
  {
    id: "diagrams-reels",
    title: "Diagrams & reels",
    blurb: "Diagrams, opening reels, and other embedded media.",
    prefixes: ["DIAGRAMS", "DIAGRAM", "ASSET", "REEL", "OPENING", "EMBEDDED", "LINKED"],
  },
  {
    id: "publishing-shows",
    title: "Publishing & shows",
    blurb: "Putting shows live, unpublishing, and undo.",
    prefixes: ["SHOW", "UNPUBLISH", "UNDO", "PUBLISH"],
  },
  {
    id: "admin-monitoring",
    title: "Admin, reports & monitoring",
    blurb: "The admin dashboard, reports, email, and background monitoring.",
    prefixes: [
      "ADMIN",
      "REPORT",
      "BRANCH",
      "VALIDATION",
      "TILE",
      "EMAIL",
      "ALERT",
      "GITHUB",
      "IDEMPOTENCY",
      "LAST",
      "NETWORK",
      "SELF",
    ],
  },
];

export const OTHER: Family = {
  id: "other-errors",
  title: "Other errors",
  blurb: "Errors that do not fit the categories above.",
  prefixes: [],
};

export function codePrefix(code: string): string {
  // split() always yields a non-empty first element for a non-empty string; the
  // `?? code` satisfies noUncheckedIndexedAccess.
  return code.split(/[-_]/)[0] ?? code;
}

export function familyFor(code: string): Family {
  const prefix = codePrefix(code);
  return FAMILIES.find((f) => f.prefixes.includes(prefix)) ?? OTHER;
}
