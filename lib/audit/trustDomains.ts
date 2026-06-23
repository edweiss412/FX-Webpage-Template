export type TrustDomain =
  | "crew-session"
  | "admin"
  | "me"
  | "auth-library"
  | "public-webhook"
  | "cron-internal"
  | "server-action"
  | "non-route"
  | "unclassified";

export type ChainStep = "validateGoogleSession" | "validateGoogleIdentity" | "requireAdmin";

export type ValidPath = readonly ChainStep[];
export type ExpectedChain = ValidPath | { anyOf: readonly ValidPath[] };

export type RouteSpec = {
  path: string;
  chain: ExpectedChain | "auth-library-exception" | "public" | "cron";
};

export const CREW_SESSION_CHAINS: { anyOf: readonly ValidPath[] } = {
  anyOf: [["requireAdmin"]],
};

export const PROTECTED_ROUTES: readonly RouteSpec[] = [
  { path: "app/show/[slug]/[shareToken]/page.tsx", chain: "auth-library-exception" },
  { path: "app/me/page.tsx", chain: ["validateGoogleIdentity"] },
  { path: "app/admin/page.tsx", chain: ["requireAdmin"] },
  { path: "app/admin/show/[slug]/page.tsx", chain: ["requireAdmin"] },
  { path: "app/admin/show/staged/[stagedId]/page.tsx", chain: ["requireAdmin"] },
  { path: "app/admin/show/[slug]/preview/[crewId]/page.tsx", chain: ["requireAdmin"] },
  { path: "app/admin/needs-attention/page.tsx", chain: ["requireAdmin"] },
  { path: "app/admin/dev/page.tsx", chain: ["requireAdmin"] },
  // Dev-only dimensional-invariant harness for the source-sheet links feature
  // (build-renamed-aside in prod); same requireAdmin chokepoint as /admin/dev.
  { path: "app/admin/dev/source-link-dim/page.tsx", chain: ["requireAdmin"] },
  { path: "app/admin/settings/page.tsx", chain: ["requireAdmin"] },
  { path: "app/admin/settings/admins/page.tsx", chain: ["requireAdmin"] },
  // Onboarding-fixups F3 — /admin/onboarding is a redirect-only alias for the
  // wizard dispatcher at /admin; admin-gated by app/admin/layout.tsx like
  // every sibling (no sinks of its own).
  { path: "app/admin/onboarding/page.tsx", chain: ["requireAdmin"] },
  {
    path: "app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx",
    chain: ["requireAdmin"],
  },
  { path: "app/api/asset/agenda/[show]/[id]/route.ts", chain: "auth-library-exception" },
  { path: "app/api/asset/diagram/[show]/[rev]/[key]/route.ts", chain: "auth-library-exception" },
  { path: "app/api/asset/reel/[show]/route.ts", chain: "auth-library-exception" },
  { path: "app/api/realtime/subscriber-token/route.ts", chain: "auth-library-exception" },
  { path: "app/api/show/[slug]/version/route.ts", chain: "auth-library-exception" },
  { path: "app/api/show/[slug]/unpublish/route.ts", chain: "public" },
  // M12.13: emailed-undo confirm page — public BY DESIGN (spec §10); the
  // single-use 24h token + the recipient binding r (unrevoked admin_emails
  // HMAC) is the auth. Renders only on GET; consumption goes through the
  // locked wrapper via its server action.
  { path: "app/show/[slug]/unpublish/page.tsx", chain: "public" },
  { path: "app/api/report/route.ts", chain: CREW_SESSION_CHAINS },
  { path: "app/api/admin/admin-alerts/[id]/resolve/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/needs-attention-count/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/show/[slug]/apply/[applyId]/status/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/show/staged/[stagedId]/apply/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/show/staged/[stagedId]/discard/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/snapshot-rollback/[id]/repair/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/sync/[slug]/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/staged/[fileId]/apply/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/staged/[fileId]/discard/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/pending-ingestions/[id]/discard/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/pending-ingestions/[id]/retry/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/onboarding/finalize/route.ts", chain: ["requireAdmin"] },
  { path: "app/api/admin/onboarding/finalize-cas/route.ts", chain: ["requireAdmin"] },
  {
    path: "app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts",
    chain: ["requireAdmin"],
  },
  // Onboarding-fixups F4 (Task 4.5) — session-scoped stale-debris reap, slim
  // sibling of the cleanup route's admin gate.
  {
    path: "app/api/admin/onboarding/reap-stale-sessions/route.ts",
    chain: ["requireAdmin"],
  },
  { path: "app/api/admin/onboarding/scan/route.ts", chain: ["requireAdmin"] },
  {
    path: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    chain: ["requireAdmin"],
  },
  {
    path: "app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts",
    chain: ["requireAdmin"],
  },
  {
    path: "app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts",
    chain: ["requireAdmin"],
  },
  {
    path: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts",
    chain: ["requireAdmin"],
  },
  {
    path: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts",
    chain: ["requireAdmin"],
  },
  { path: "app/api/auth/google/start/route.ts", chain: "public" },
  { path: "app/api/auth/picker-bootstrap/route.ts", chain: "auth-library-exception" },
  { path: "app/api/cron/asset-recovery/route.ts", chain: "cron" },
  { path: "app/api/cron/diagram-gc/route.ts", chain: "cron" },
  { path: "app/api/cron/gc-watch/route.ts", chain: "cron" },
  { path: "app/api/cron/keepalive/route.ts", chain: "cron" },
  { path: "app/api/cron/notify/route.ts", chain: "cron" },
  { path: "app/api/cron/refresh-watch/route.ts", chain: "cron" },
  { path: "app/api/cron/report-reaper/route.ts", chain: "cron" },
  { path: "app/api/cron/sync/route.ts", chain: "cron" },
  { path: "app/api/drive/webhook/route.ts", chain: "public" },
  { path: "app/api/test-auth/set-session/route.ts", chain: "public" },
  { path: "middleware.ts", chain: "auth-library-exception" },
];

const routeByPath = new Map(PROTECTED_ROUTES.map((route) => [route.path, route]));

export function routeSpecForPath(path: string): RouteSpec | undefined {
  return routeByPath.get(path);
}

export function expectedChainForDomain(path: string, domain: TrustDomain): ExpectedChain | null {
  const routeSpec = routeSpecForPath(path);
  if (
    routeSpec &&
    routeSpec.chain !== "auth-library-exception" &&
    routeSpec.chain !== "public" &&
    routeSpec.chain !== "cron"
  ) {
    return routeSpec.chain;
  }
  if (domain === "crew-session" || domain === "server-action") return CREW_SESSION_CHAINS;
  if (domain === "admin") return ["requireAdmin"];
  if (domain === "me") return ["validateGoogleIdentity"];
  return null;
}

export function classifyTrustDomain(path: string): TrustDomain {
  const normalized = path.replaceAll("\\", "/");
  const route = routeSpecForPath(normalized);
  if (route?.chain === "auth-library-exception") return "auth-library";
  if (route?.chain === "public") {
    if (normalized.includes("/drive/webhook/")) return "public-webhook";
    return "non-route";
  }
  if (route?.chain === "cron") return "cron-internal";
  if (route) {
    const chain = route.chain;
    if (Array.isArray(chain) && chain[0] === "requireAdmin") return "admin";
    if (Array.isArray(chain) && chain[0] === "validateGoogleIdentity") return "me";
    return "crew-session";
  }
  if (normalized.startsWith("lib/auth/")) return "auth-library";
  if (normalized === "middleware.ts") return "auth-library";
  if (normalized.startsWith("app/api/cron/")) return "cron-internal";
  if (normalized.startsWith("app/api/drive/webhook/")) return "public-webhook";
  if (normalized.startsWith("app/admin/")) {
    if (
      normalized.endsWith("/page.tsx") ||
      normalized.endsWith("/page.ts") ||
      normalized.endsWith("/layout.tsx") ||
      normalized.endsWith("/layout.ts")
    ) {
      return "admin";
    }
    if (
      normalized.endsWith("/loading.tsx") ||
      normalized.endsWith("/loading.ts") ||
      normalized.endsWith("/error.tsx") ||
      normalized.endsWith("/error.ts") ||
      normalized.endsWith("/not-found.tsx") ||
      normalized.endsWith("/not-found.ts") ||
      normalized.endsWith("/template.tsx") ||
      normalized.endsWith("/template.ts") ||
      normalized.endsWith("/head.tsx") ||
      normalized.endsWith("/head.ts")
    ) {
      return "admin";
    }
    return "non-route";
  }
  if (normalized.startsWith("app/api/admin/")) return "unclassified";
  if (normalized.startsWith("app/show/") || normalized.startsWith("app/me/")) {
    if (normalized.endsWith("/page.tsx") || normalized.endsWith("/page.ts")) return "unclassified";
    return "non-route";
  }
  if (normalized.startsWith("app/api/")) return "unclassified";
  return "non-route";
}
