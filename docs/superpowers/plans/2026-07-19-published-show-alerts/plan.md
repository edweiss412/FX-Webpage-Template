# Published Show Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this is an autonomous /ship-feature run — inline execution, TDD per task, commit per task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One derived `AttentionItem[]` feeds a header pill + dropdown menu, inline alert banners (under crew rows / Overview), nav dots and badges in the published show review modal; `PerShowAlertSection` retires.

**Architecture:** Server loader derives serializable items from the two reads it already performs (per-show alerts + change feed); the client modal owns menu/optimistic state and delegates scroll+flash to `ShowReviewSurface`'s existing machinery via a new `attentionJump` prop. No new mutation surfaces, no DB changes, no advisory locks.

**Tech Stack:** Next.js 16 App Router (RSC + client islands), Vitest + Testing Library (jsdom), Playwright real-browser harness (`tests/e2e/_publishedReviewModalHarness.tsx` family), Tailwind v4 tokens from `app/globals.css`/DESIGN.md.

**Spec:** `docs/superpowers/specs/2026-07-19-published-show-alerts.md` (adversarially APPROVED R3). Mock snapshot: `docs/superpowers/specs/2026-07-19-published-show-alerts-mock/published-show-alerts-2b.dc.html`.

## Global Constraints

- Invariant 5: never render a raw §12.4/alert code; all copy via `lib/messages/lookup.ts` catalog accessors.
- Invariant 8: impeccable critique + audit dual-gate runs on the finished diff (close-out, before cross-model review).
- Invariant 9: no new Supabase call boundaries; the moved `fetchPerShowAlerts` keeps its `_metaInfraContract` registry row (path updated).
- Invariant 10: no new mutation surfaces (resolve route + MI-11 gate actions already registered).
- Tokens only — never mock hex values. Pill/banner tokens: `bg-warning-bg text-warning-text`, `bg-status-review`, `border-status-positive`, `text-status-positive-text`, `bg-surface-sunken`, `rounded-pill`, `duration-fast`, `ease-out-quart`, `tracking-eyebrow`, `min-h-tap-min`.
- Flash reuse: `data-step3-warning-flash` attribute + `WARNING_HIGHLIGHT_MS` (1600) + `app/globals.css:837-850` keyframe. Never a new flash mechanism.
- `exactOptionalPropertyTypes` discipline: optional fields ABSENT, never `undefined`.
- Commits: conventional-commits, one task per commit, `--no-verify` (worktree hook contention).
- Meta-test inventory (declared per AGENTS.md writing-plans rules): CREATES `tests/admin/_metaAttentionRoutes.test.ts`; MODIFIES the `fetchPerShowAlerts` row in `tests/admin/_metaInfraContract.test.ts:210-211`; the emphasis walker (`tests/messages/_metaEmphasisRenderContract.test.ts`) auto-covers new `components/` files (AttentionBanner imports `renderCatalogEmphasis` → compliant); no `pg_advisory*` surface is touched (no lock-topology entry).
- Layout-dimensions task: NOT required — spec §10 declares no new fixed-dimension parent/child pair; the pill 44px hit band is probed in Task 8 (real browser), which satisfies the T-TAP contract.

---

### Task 1: `lib/admin/attentionItems.ts` — types, routes, derivation + routes meta-test

**Files:**
- Create: `lib/admin/attentionItems.ts`
- Create: `tests/admin/attentionItems.test.ts`
- Create: `tests/admin/_metaAttentionRoutes.test.ts`

**Interfaces:**
- Consumes: `AdminAlertRow` (Task 2 exports it; for THIS task declare the input structurally — the test fixtures build plain objects), `FeedEntry`/`FeedGate` from `lib/sync/holds/types.ts:51-77`, `resolveAlertAction` (`lib/adminAlerts/alertActions.ts:131`), `isInboxRouted` (`lib/messages/adminSurface.ts:58`), `isAutoResolving`/`autoResolveNote` (`lib/adminAlerts/audience.ts`), `messageFor`/`isMessageCode` (`lib/messages/lookup.ts`), `MESSAGE_CATALOG`, `DataGapsSummary`/`GAP_CLASSES` (`lib/parser/dataGaps`).
- Produces (later tasks rely on these exact names): `RoutedSectionId`, `AttentionAlertPayload`, `AttentionItem`, `ATTENTION_ROUTES: Record<string, AttentionRoute>`, `deriveAttentionItems(args: { alerts: AttentionAlertInput[]; feed: { entries: FeedEntry[] } | null; slug: string }): AttentionItem[]`, `canonicalCrewKey(name: string): string`, plus display helpers re-exported for Task 2/3: `safeDougFacingTemplate`, `catalogHelpHref`, `readDataGapsDigest`, `formatRelativeRaisedAt`.

- [ ] **Step 1: Write the failing tests** — `tests/admin/attentionItems.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ATTENTION_ROUTES,
  deriveAttentionItems,
  canonicalCrewKey,
  type AttentionAlertInput,
} from "@/lib/admin/attentionItems";
import type { FeedEntry } from "@/lib/sync/holds/types";

const SLUG = "test-show";

function alert(over: Partial<AttentionAlertInput> = {}): AttentionAlertInput {
  return {
    id: "a1",
    code: "ROLE_FLAGS_NOTICE",
    context: null,
    raised_at: "2026-07-19T10:00:00Z",
    occurrence_count: 1,
    identityText: "Crew · John Redcorn",
    messageParams: {},
    crewName: null,
    ...over,
  };
}

function holdEntry(over: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: "h1",
    occurredAt: "2026-07-19T09:00:00Z",
    status: "pending",
    summary: "Priya Shah's row changed while a rename was pending.",
    action: "approve_reject",
    entityRef: null,
    acceptable: false,
    acknowledgedAt: null,
    gate: { holdId: "hold-1", disposition: { disposition: "rename", name: "Priya Shah" } as never, baseModifiedTime: "2026-07-19T08:00:00Z" },
    ...over,
  };
}

describe("deriveAttentionItems", () => {
  it("maps an actionable alert: notice tone, alert payload, catalog title", () => {
    const items = deriveAttentionItems({ alerts: [alert()], feed: null, slug: SLUG });
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0.id).toBe("alert:a1");
    expect(it0.kind).toBe("alert");
    expect(it0.tone).toBe("notice");
    expect(it0.actionable).toBe(true);
    expect(it0.sectionId).toBe("crew");
    expect(it0.alert?.alertId).toBe("a1");
    expect(it0.alert?.autoClearNote).toBeNull();
    // menuTitle comes from the catalog, never the raw code (invariant 5)
    expect(it0.menuTitle).not.toContain("ROLE_FLAGS_NOTICE");
    expect(it0.menuTitle.length).toBeGreaterThan(0);
  });

  it("classifies inbox-routed and auto-resolving codes as non-actionable with a note", () => {
    // SHEET_UNAVAILABLE is inbox-routed (adminSurface "inbox"); occurrence in the
    // catalog is pinned by tests/messages — if this assumption breaks, the meta
    // routes test still holds; this test asserts BEHAVIOR via the classifier.
    const items = deriveAttentionItems({
      alerts: [alert({ id: "a2", code: "SHEET_UNAVAILABLE", identityText: null })],
      feed: null,
      slug: SLUG,
    });
    expect(items[0]!.actionable).toBe(false);
    expect(items[0]!.alert?.autoClearNote).toBeTruthy();
  });

  it("maps a pending hold: critical tone, changes section, feed summary as title", () => {
    const items = deriveAttentionItems({ alerts: [], feed: { entries: [holdEntry()] }, slug: SLUG });
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("hold:hold-1");
    expect(items[0]!.tone).toBe("critical");
    expect(items[0]!.sectionId).toBe("changes");
    expect(items[0]!.crewKey).toBeNull();
    expect(items[0]!.actionable).toBe(true);
    expect(items[0]!.menuTitle).toBe("Priya Shah's row changed while a rename was pending.");
  });

  it("ignores non-pending / non-gate feed entries and null feed", () => {
    const applied = holdEntry({ id: "h2", status: "applied", action: "undo" });
    delete (applied as { gate?: unknown }).gate;
    expect(
      deriveAttentionItems({ alerts: [], feed: { entries: [applied] }, slug: SLUG }),
    ).toHaveLength(0);
    expect(deriveAttentionItems({ alerts: [], feed: null, slug: SLUG })).toHaveLength(0);
  });

  it("orders: actionable holds (critical) before actionable alerts (notice), auto-clearing last", () => {
    const items = deriveAttentionItems({
      alerts: [
        alert({ id: "auto", code: "SHEET_UNAVAILABLE" }),
        alert({ id: "act", code: "ROLE_FLAGS_NOTICE" }),
      ],
      feed: { entries: [holdEntry()] },
      slug: SLUG,
    });
    expect(items.map((i) => i.id)).toEqual(["hold:hold-1", "alert:act", "alert:auto"]);
  });

  it("crewKey: canonicalized crewName; null crewName → null crewKey", () => {
    const [withName, without] = deriveAttentionItems({
      alerts: [
        alert({ id: "n1", crewName: "  John Redcorn " }),
        alert({ id: "n2", crewName: null }),
      ],
      feed: null,
      slug: SLUG,
    });
    expect(withName!.crewKey).toBe("john redcorn");
    expect(without!.crewKey).toBeNull();
    expect(canonicalCrewKey("  MiXeD Case ")).toBe("mixed case");
  });

  it("unknown code falls back to overview and still renders a generic title", () => {
    const items = deriveAttentionItems({
      alerts: [alert({ id: "u1", code: "FUTURE_UNREGISTERED_CODE" })],
      feed: null,
      slug: SLUG,
    });
    expect(items[0]!.sectionId).toBe("overview");
    expect(items[0]!.menuTitle).toBe("Something needs your attention on this show.");
  });

  it("action link precomputed with slug (RESYNC_SHRINK_HELD → #overview link)", () => {
    const items = deriveAttentionItems({
      alerts: [alert({ id: "r1", code: "RESYNC_SHRINK_HELD" })],
      feed: null,
      slug: SLUG,
    });
    expect(items[0]!.alert?.action).toEqual({
      label: "Review & re-sync",
      href: `/admin?show=${SLUG}#overview`,
      external: false,
    });
  });

  it("failedKeys / dataGaps populated only for their codes", () => {
    const items = deriveAttentionItems({
      alerts: [
        alert({
          id: "t1",
          code: "TILE_PROJECTION_FETCH_FAILED",
          context: { failedKeys: ["hotel", "rooms", 3] },
        }),
        alert({
          id: "s1",
          code: "SHOW_FIRST_PUBLISHED",
          context: { data_gaps: { total: 2, classes: { unknown_section: 2 } } },
        }),
        alert({ id: "p1", code: "ROLE_FLAGS_NOTICE" }),
      ],
      feed: null,
      slug: SLUG,
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("alert:t1")!.alert?.failedKeys).toEqual(["hotel", "rooms"]);
    expect(byId.get("alert:s1")!.alert?.dataGaps?.total).toBe(2);
    expect(byId.get("alert:p1")!.alert?.failedKeys).toBeNull();
    expect(byId.get("alert:p1")!.alert?.dataGaps).toBeNull();
  });
});
```

And `tests/admin/_metaAttentionRoutes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { ADMIN_ALERTS_CODES } from "@/tests/messages/adminAlertsRegistry";

describe("_metaAttentionRoutes — ATTENTION_ROUTES covers the production registry exactly", () => {
  it("route keys are SET-EQUAL to ADMIN_ALERTS_CODES (a new registered code without a route fails; a stale route for a retired code fails)", () => {
    expect(new Set(Object.keys(ATTENTION_ROUTES))).toEqual(new Set(ADMIN_ALERTS_CODES));
  });

  it("every route names a valid target", () => {
    for (const [code, route] of Object.entries(ATTENTION_ROUTES)) {
      expect(["crew", "overview"], `route for ${code}`).toContain(route.sectionId);
    }
  });

  it("exactly the three crew-domain codes route to crew", () => {
    const crew = Object.entries(ATTENTION_ROUTES)
      .filter(([, r]) => r.sectionId === "crew")
      .map(([c]) => c)
      .sort();
    expect(crew).toEqual(["AMBIGUOUS_EMAIL_BINDING", "OAUTH_IDENTITY_CLAIMED", "ROLE_FLAGS_NOTICE"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** — `pnpm vitest run tests/admin/attentionItems.test.ts tests/admin/_metaAttentionRoutes.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/admin/attentionItems.ts`:**

```ts
// lib/admin/attentionItems.ts
//
// Published Show Alerts (spec docs/superpowers/specs/2026-07-19-published-show-alerts.md §3-§4).
// ONE pure derivation feeds the modal's four attention surfaces (header pill+menu,
// nav dots/badges, inline banners, clearing footer) so counts can never drift.
// Client-safe: no I/O, no Date.now, catalog-only imports.
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { FeedEntry } from "@/lib/sync/holds/types";
import { resolveAlertAction, type AlertActionLink } from "@/lib/adminAlerts/alertActions";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { messageFor, type MessageParams } from "@/lib/messages/lookup";
import { GAP_CLASSES, type DataGapsSummary } from "@/lib/parser/dataGaps";

export type RoutedSectionId = SectionId | "overview" | "changes";

export type AttentionRoute = { sectionId: Extract<RoutedSectionId, "crew" | "overview"> };

/** Structural input row — Task 2's exported AdminAlertRow satisfies this. */
export type AttentionAlertInput = {
  id: string;
  code: string;
  context: Record<string, unknown> | null;
  raised_at: string;
  occurrence_count: number;
  identityText: string | null;
  messageParams: MessageParams;
  crewName: string | null;
};

export type AttentionAlertPayload = {
  alertId: string;
  code: string;
  template: string | null;
  params: MessageParams;
  action: AlertActionLink | null;
  helpHref: string | null;
  raisedAt: string;
  occurrenceCount: number;
  autoClearNote: string | null;
  failedKeys: string[] | null;
  dataGaps: DataGapsSummary | null;
};

export type AttentionItem = {
  id: string;
  kind: "alert" | "hold";
  tone: "critical" | "notice";
  sectionId: RoutedSectionId;
  crewKey: string | null;
  actionable: boolean;
  menuTitle: string;
  menuSubtitle: string | null;
  alert?: AttentionAlertPayload;
};

// Fallback line — the exact PerShowAlertSection fallback (spec §5.4; invariant 5).
export const ATTENTION_FALLBACK_TITLE = "Something needs your attention on this show.";
// Inbox-routed auto-clear copy (PerShowAlertSection parity).
const INBOX_AUTOCLEAR_NOTE = "Clears automatically once the sheet is back or re-parses.";

/**
 * Full-production-registry routing (spec §4): keys are SET-EQUAL to
 * tests/messages/adminAlertsRegistry.ts ADMIN_ALERTS_CODES — pinned by
 * tests/admin/_metaAttentionRoutes.test.ts (lib/ must not import tests/, so the
 * list is declared here and equality-checked there). Unregistered runtime codes
 * fall back to overview.
 */
export const ATTENTION_ROUTES: Record<string, AttentionRoute> = {
  // crew-domain (spec §4 row 1)
  AMBIGUOUS_EMAIL_BINDING: { sectionId: "crew" },
  OAUTH_IDENTITY_CLAIMED: { sectionId: "crew" },
  ROLE_FLAGS_NOTICE: { sectionId: "crew" },
  // everything else registered → overview (spec §4 row 2)
  PICKER_BOOTSTRAP_RPC_FAILED: { sectionId: "overview" },
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: { sectionId: "overview" },
  CALLBACK_CLAIM_THREW: { sectionId: "overview" },
  PICKER_SELECTION_RACE: { sectionId: "overview" },
  PICKER_EPOCH_RESET: { sectionId: "overview" },
  ASSET_RECOVERY_BYTES_EXCEEDED: { sectionId: "overview" },
  ASSET_RECOVERY_REVISION_DRIFT: { sectionId: "overview" },
  ASSET_RECOVERY_DRIFT_COOLDOWN: { sectionId: "overview" },
  WATCH_CHANNEL_ORPHANED: { sectionId: "overview" },
  WEBHOOK_TOKEN_INVALID: { sectionId: "overview" },
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: { sectionId: "overview" },
  LIVE_ROW_CONFLICT: { sectionId: "overview" },
  DRIVE_FETCH_FAILED: { sectionId: "overview" },
  PARSE_ERROR_LAST_GOOD: { sectionId: "overview" },
  SHEET_UNAVAILABLE: { sectionId: "overview" },
  RESYNC_SHRINK_HELD: { sectionId: "overview" },
  RESYNC_QUALITY_REGRESSED: { sectionId: "overview" },
  SYNC_STALLED: { sectionId: "overview" },
  EMAIL_DELIVERY_FAILED: { sectionId: "overview" },
  EMAIL_NOT_CONFIGURED: { sectionId: "overview" },
  SHOW_FIRST_PUBLISHED: { sectionId: "overview" },
  SHOW_UNPUBLISHED: { sectionId: "overview" },
  PENDING_SNAPSHOT_PROMOTE_STUCK: { sectionId: "overview" },
  PENDING_SNAPSHOT_ROLLBACK_STUCK: { sectionId: "overview" },
  PENDING_SNAPSHOT_DELETE_STUCK: { sectionId: "overview" },
  OPENING_REEL_PERMISSION_DENIED: { sectionId: "overview" },
  OPENING_REEL_NOT_VIDEO: { sectionId: "overview" },
  REEL_DRIFTED: { sectionId: "overview" },
  EMBEDDED_ASSET_DRIFTED: { sectionId: "overview" },
  REPORT_ORPHANED_LOST_LEASE: { sectionId: "overview" },
  REPORT_LOOKUP_INCONCLUSIVE: { sectionId: "overview" },
  GITHUB_BOT_LOGIN_MISSING: { sectionId: "overview" },
  REPORT_DUPLICATE_LIVE_MATCHES: { sectionId: "overview" },
  REPORT_OPEN_ORPHAN_LABEL: { sectionId: "overview" },
  REPORT_LEASE_THRASHING: { sectionId: "overview" },
  STALE_ORPHAN_REPORT: { sectionId: "overview" },
  TILE_SERVER_RENDER_FAILED: { sectionId: "overview" },
  TILE_PROJECTION_FETCH_FAILED: { sectionId: "overview" },
  BRANCH_PROTECTION_DRIFT: { sectionId: "overview" },
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: { sectionId: "overview" },
  WIZARD_SESSION_SUPERSEDED_RACE: { sectionId: "overview" },
  ONBOARDING_SHEET_UNREADABLE: { sectionId: "overview" },
};

const UNRESOLVED_PLACEHOLDER_RE = /<[a-zA-Z_][a-zA-Z0-9_-]*>/;

/** PerShowAlertSection's safeDougFacingTemplate rule, relocated verbatim (spec §3.1). */
export function safeDougFacingTemplate(
  code: string,
  params: MessageParams | undefined,
): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  const template = messageFor(code as MessageCode).dougFacing;
  if (!template) return null;
  const interpolated = messageFor(code as MessageCode, params).dougFacing;
  if (!interpolated || UNRESOLVED_PLACEHOLDER_RE.test(interpolated)) return null;
  return template;
}

/** PerShowAlertSection's catalogHelpHref rule, relocated verbatim. */
export function catalogHelpHref(code: string): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).helpHref;
}

/** PerShowAlertSection's readDataGapsDigest rule, relocated verbatim (spec §3.1). */
export function readDataGapsDigest(
  context: Record<string, unknown> | null,
): DataGapsSummary | null {
  const raw = context?.data_gaps;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { total?: unknown; classes?: unknown };
  if (typeof candidate.total !== "number" || candidate.total <= 0) return null;
  const classes = candidate.classes;
  if (!classes || typeof classes !== "object") return null;
  const c = classes as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    total: candidate.total,
    classes: Object.fromEntries(
      GAP_CLASSES.map((g) => [g.code, num(c[g.code])]),
    ) as DataGapsSummary["classes"],
  };
}

/** PerShowAlertSection's formatRelative rule, relocated verbatim (client-safe: takes now). */
export function formatRelativeRaisedAt(iso: string, now: Date): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const minutes = Math.floor((now.getTime() - parsed) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function canonicalCrewKey(name: string): string {
  return name.trim().toLowerCase();
}

function alertTitle(code: string): string {
  if (!(code in MESSAGE_CATALOG)) return ATTENTION_FALLBACK_TITLE;
  const title = messageFor(code as MessageCode).title;
  return title && title.length > 0 ? title : ATTENTION_FALLBACK_TITLE;
}

function readFailedKeys(code: string, context: Record<string, unknown> | null): string[] | null {
  if (code !== "TILE_PROJECTION_FETCH_FAILED" || !Array.isArray(context?.failedKeys)) return null;
  return (context.failedKeys as unknown[]).filter((k): k is string => typeof k === "string");
}

function toAlertItem(row: AttentionAlertInput, slug: string): AttentionItem {
  const actionable = !isInboxRouted(row.code) && !isAutoResolving(row.code);
  const autoClearNote = actionable
    ? null
    : isInboxRouted(row.code)
      ? INBOX_AUTOCLEAR_NOTE
      : autoResolveNote(row.code);
  const route = ATTENTION_ROUTES[row.code] ?? { sectionId: "overview" as const };
  const crewKey =
    route.sectionId === "crew" && row.crewName ? canonicalCrewKey(row.crewName) : null;
  return {
    id: `alert:${row.id}`,
    kind: "alert",
    tone: "notice",
    sectionId: route.sectionId,
    crewKey,
    actionable,
    menuTitle: alertTitle(row.code),
    menuSubtitle: row.identityText,
    alert: {
      alertId: row.id,
      code: row.code,
      template: safeDougFacingTemplate(row.code, row.messageParams),
      params: row.messageParams,
      action: resolveAlertAction(row.code, row.context, { slug }),
      helpHref: catalogHelpHref(row.code),
      raisedAt: row.raised_at,
      occurrenceCount: row.occurrence_count,
      autoClearNote,
      failedKeys: readFailedKeys(row.code, row.context),
      dataGaps: row.code === "SHOW_FIRST_PUBLISHED" ? readDataGapsDigest(row.context) : null,
    },
  };
}

function toHoldItem(entry: FeedEntry): AttentionItem | null {
  if (entry.status !== "pending" || entry.action !== "approve_reject" || !entry.gate) return null;
  return {
    id: `hold:${entry.gate.holdId}`,
    kind: "hold",
    tone: "critical",
    sectionId: "changes",
    crewKey: null,
    actionable: true,
    menuTitle: entry.summary,
    menuSubtitle: "Pick what happens in Changes",
  };
}

/**
 * Spec §3.1 ordering: actionable before auto-clearing; critical before notice
 * (holds are the only critical tier); alerts keep raised_at DESC fetch order;
 * holds keep feed order.
 */
export function deriveAttentionItems(args: {
  alerts: AttentionAlertInput[];
  feed: { entries: FeedEntry[] } | null;
  slug: string;
}): AttentionItem[] {
  const holdItems = (args.feed?.entries ?? [])
    .map(toHoldItem)
    .filter((i): i is AttentionItem => i !== null);
  const alertItems = args.alerts.map((row) => toAlertItem(row, args.slug));
  const actionableAlerts = alertItems.filter((i) => i.actionable);
  const clearing = alertItems.filter((i) => !i.actionable);
  return [...holdItems, ...actionableAlerts, ...clearing];
}
```

- [ ] **Step 4: Run tests to verify they pass** — `pnpm vitest run tests/admin/attentionItems.test.ts tests/admin/_metaAttentionRoutes.test.ts` → PASS. (If the SET-EQUALITY test fails, reconcile against the live registry list — never delete the assertion.)

- [ ] **Step 5: Commit** — `git add -A && git commit --no-verify -m "feat(admin): attention-items derivation + full-registry routing table"`

---

### Task 2: relocate + extend `fetchPerShowAlerts` (`crewName`, exported `AdminAlertRow`)

**Files:**
- Create: `lib/adminAlerts/fetchPerShowAlerts.ts` (fetch moves here; `PerShowAlertSection.tsx` re-imports until Task 7 deletes it)
- Modify: `components/admin/PerShowAlertSection.tsx` (delete local fetch + helpers; import from new modules)
- Modify: `tests/admin/_metaInfraContract.test.ts:210-211` (registry row path) and its two dynamic imports (`:988,:995`)
- Test: `tests/adminAlerts/fetchPerShowAlerts.test.ts` (new — crewName rules; move/point existing fetch assertions from `tests/components/PerShowAlertSection.test.tsx` where they target the fetch)

**Interfaces:**
- Produces: `export type AdminAlertRow` (existing shape + `crewName: string | null`), `export async function fetchPerShowAlerts(showId: string): Promise<AdminAlertRow[] | { kind: "infra_error"; message: string }>` — body identical to `components/admin/PerShowAlertSection.tsx:134-241` except the final map adds `crewName`.

- [ ] **Step 1: Write the failing test** — `tests/adminAlerts/fetchPerShowAlerts.test.ts`. Mock `createSupabaseServerClient` + `resolveAlertIdentities` exactly the way `tests/components/PerShowAlertSection.test.tsx` already mocks them (copy its mock scaffolding — the supabase query-builder chain mock and the `vi.mock("@/lib/adminAlerts/resolveAlertIdentities")` module mock). `AlertIdentity` is `{ segments: { label: string | null; value: string; pii?: boolean }[]; global: boolean }` (`lib/adminAlerts/identityTypes.ts:49-62`); crew segments carry `label: "Crew"` (`lib/adminAlerts/resolveAlertIdentities.ts:264`). Full tests:

```ts
it("crewName: single Crew-labeled segment → its value (OAUTH_IDENTITY_CLAIMED)", async () => {
  queueAlertRows([row({ id: "a1", code: "OAUTH_IDENTITY_CLAIMED" })]);
  mockResolvedIdentities(
    new Map([
      ["a1", { segments: [{ label: "Crew", value: "John Redcorn" }, { label: "Show", value: "East Coast" }], global: false }],
    ]),
  );
  const rows = await fetchPerShowAlerts(SHOW_ID);
  expect(Array.isArray(rows)).toBe(true);
  expect((rows as AdminAlertRow[])[0]!.crewName).toBe("John Redcorn");
});

it("crewName: ROLE_FLAGS_NOTICE uses the PROJECTED sanitized name list — sole name → that name; multi → null", async () => {
  queueAlertRows([
    row({ id: "one", code: "ROLE_FLAGS_NOTICE", context: { changes: [{ crew_name: "Ana Silva" }] } }),
    row({ id: "two", code: "ROLE_FLAGS_NOTICE", context: { changes: [{ crew_name: "A" }, { crew_name: "B" }] } }),
  ]);
  mockResolvedIdentities(new Map()); // identity resolution not the source for this code
  const rows = (await fetchPerShowAlerts(SHOW_ID)) as AdminAlertRow[];
  expect(rows.find((r) => r.id === "one")!.crewName).toBe("Ana Silva");
  expect(rows.find((r) => r.id === "two")!.crewName).toBeNull();
});

it("crewName: no Crew segment → null; two Crew segments → null; degraded resolve → null but rows still returned", async () => {
  queueAlertRows([row({ id: "a2", code: "AMBIGUOUS_EMAIL_BINDING" }), row({ id: "a3", code: "OAUTH_IDENTITY_CLAIMED" })]);
  mockResolverThrows(new Error("boom"));
  const rows = (await fetchPerShowAlerts(SHOW_ID)) as AdminAlertRow[];
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.crewName === null)).toBe(true);
});
```

(`queueAlertRows` / `mockResolvedIdentities` / `mockResolverThrows` / `row` are thin wrappers over the copied scaffolding — define them in the test file; expectations derive from the fixtures above, not resolver internals.)

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/adminAlerts/fetchPerShowAlerts.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement.** Move the fetch body verbatim into `lib/adminAlerts/fetchPerShowAlerts.ts`; import `safeDougFacingTemplate` is NOT needed there (template is computed in derivation) — the fetch keeps computing `identityText` + `messageParams` as today and ADDS:

```ts
// After the identities map resolves (the existing final map at the old :235-240).
// The fetch ALREADY projects each row's context (resolverRows at the old :198-204):
//   projectIdentityContext(r.context, { includePii: true })
// Keep those projections in a Map<string, ProjectedIdentityContext> keyed by row id
// so crewName reads the SANITIZED projection (spec §3.1a), never raw context.
function crewNameFor(
  code: string,
  projected: ReturnType<typeof projectIdentityContext>,
  identity: AlertIdentity | undefined,
): string | null {
  if (code === "ROLE_FLAGS_NOTICE") {
    // spec §3.1a: the projected sanitized capped list (projectIdentityContext.ts:85-99).
    // Sole-name rule: exactly one change AND exactly one projected name.
    const names = projected.display.role_change_crew_names;
    if (projected.counts.role_change_count !== 1 || !names || names.length !== 1) return null;
    const name = names[0]!;
    return name.trim().length > 0 ? name : null;
  }
  // exactly-one Crew-labeled segment (identityTypes.ts:49-62; the crew segment
  // label literal is "Crew" — resolveAlertIdentities.ts:264)
  const crewSegs = (identity?.segments ?? []).filter((s) => s.label === "Crew");
  if (crewSegs.length !== 1) return null;
  const value = crewSegs[0]!.value;
  return value.trim().length > 0 ? value : null;
}
```

`PerShowAlertSection.tsx` keeps rendering by importing `fetchPerShowAlerts`/`AdminAlertRow` from the new module and `safeDougFacingTemplate`/`catalogHelpHref`/`readDataGapsDigest`/`formatRelativeRaisedAt` from `lib/admin/attentionItems` (delete its local copies). Registry row update in `_metaInfraContract.test.ts`:

```ts
helper: "fetchPerShowAlerts",
path: "lib/adminAlerts/fetchPerShowAlerts.ts",
```

and the two `await import("@/components/admin/PerShowAlertSection")` calls become `await import("@/lib/adminAlerts/fetchPerShowAlerts")`.

- [ ] **Step 4: Run** — `pnpm vitest run tests/adminAlerts/fetchPerShowAlerts.test.ts tests/admin/_metaInfraContract.test.ts tests/components/PerShowAlertSection.test.tsx tests/messages/_metaEmphasisRenderContract.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(admin): relocate fetchPerShowAlerts to lib with crewName identity extraction"`

---

### Task 3: `PerShowAlertResolveButton.onResolved` + `AttentionBanner`

**Files:**
- Modify: `components/admin/PerShowAlertResolveButton.tsx` (optional `onResolved?: () => void`, fired on the success branch before `router.refresh()`, `PerShowAlertResolveButton.tsx:62-64`)
- Create: `components/admin/review/AttentionBanner.tsx`
- Test: `tests/components/admin/review/attentionBanner.test.tsx`

**Interfaces:**
- Consumes: `AttentionItem` (Task 1), `renderCatalogEmphasis` (`components/messages/renderEmphasis.tsx:75`), `formatRelativeRaisedAt`, `formatDataGapBreakdown` (`lib/parser/dataGaps`), `INLINE_IDENTITY_CODES` (`lib/adminAlerts/alertIdentityMap.ts:296`), `PerShowAlertResolveButton`.
- Produces: `AttentionBanner({ item, slug, now, underCrewRow, highlighted, onResolved }: { item: AttentionItem; slug: string; now: Date; underCrewRow: boolean; highlighted: boolean; onResolved: (id: string) => void })` — renders `null` for `kind: "hold"` or missing payload. Root: `<div data-attention-anchor={item.id} aria-current={highlighted ? "true" : undefined}>`. Internal confirmed state after resolve (`✓ Confirmed` line, `text-status-positive-text`).

- [ ] **Step 1: Failing tests** (jsdom, Testing Library). Cover, with fixture-derived expectations:
  - template renders via emphasis (fixture template `"Check **<sheet-name>**"` + params → `<strong>` present, no literal `**`); `template: null` → the fallback line, never `item.alert.code` anywhere in the DOM (invariant-5 negative assertion: `expect(container.textContent).not.toContain(code)`).
  - action link renders with `↗` when `external: true`; absent when `action: null`. Help link when `helpHref`; absent when null.
  - `failedKeys` line "Failed sources: hotel, rooms"; `dataGaps` line via `formatDataGapBreakdown`; both absent when null.
  - identity sub-line suppression: shown when `identityText && !(INLINE_IDENTITY_CODES.has(code) && template)`; ALWAYS hidden when `underCrewRow` (spec §5.4).
  - actionable → resolve button present; `autoClearNote` → note text, no button.
  - resolve success → banner swaps to "✓ Confirmed" and `onResolved` called with `item.id` (mock fetch → `{status:"resolved"}` — same mock idiom as `tests/components/PerShowAlertSection.test.tsx` uses for the button).
  - left stripe class by tone: `border-l-[3px]` + amber for notice; degraded-red token for critical (assert exact class strings).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Structure (tokens per Global Constraints; wash `bg-warning-bg`, rounded-sm, `p-3`, `flex flex-col gap-2`):

```tsx
"use client";
// components/admin/review/AttentionBanner.tsx — spec §5.4. One inline banner per
// alert AttentionItem; holds render nothing here (their surface is the Changes entry).
// Render rules are PerShowAlertSection.tsx:341-446 verbatim, minus <li>/section chrome.
import { useState } from "react";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import { ATTENTION_FALLBACK_TITLE, formatRelativeRaisedAt } from "@/lib/admin/attentionItems";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";
import { INLINE_IDENTITY_CODES } from "@/lib/adminAlerts/alertIdentityMap";
import { formatDataGapBreakdown } from "@/lib/parser/dataGaps";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";

export type AttentionBannerProps = {
  item: AttentionItem;
  slug: string;
  now: Date;
  underCrewRow: boolean;
  highlighted: boolean;
  onResolved: (id: string) => void;
};

export function AttentionBanner({ item, slug, now, underCrewRow, highlighted, onResolved }: AttentionBannerProps) {
  const [confirmed, setConfirmed] = useState(false);
  if (item.kind !== "alert" || !item.alert) return null;
  const a = item.alert;
  // Tone stripe: notice = amber review token; critical = the degraded/red token.
  // NOTE (verify at implementation): grep app/globals.css for the degraded token
  // Tailwind name (DESIGN.md:47 pair) — if only `--color-status-degraded` exists,
  // the class is `border-l-status-degraded`; adjust to the live token name. Alerts
  // are always notice today (spec §3.1) — the critical branch is hold-only headroom.
  const stripe = item.tone === "critical" ? "border-l-status-degraded" : "border-l-status-review";
  const showIdentity =
    a.template === null || !INLINE_IDENTITY_CODES.has(a.code) ? item.menuSubtitle : null;
  return (
    <div
      data-attention-anchor={item.id}
      data-testid={`attention-banner-${a.alertId}`}
      aria-current={highlighted ? "true" : undefined}
      className={`flex flex-col gap-2 rounded-sm border border-border border-l-[3px] ${stripe} bg-warning-bg p-3 text-text`}
    >
      {confirmed ? (
        <p data-testid={`attention-banner-confirmed-${a.alertId}`} className="text-sm font-medium text-status-positive-text">
          ✓ Confirmed
        </p>
      ) : (
        <>
          <p className="wrap-break-word whitespace-pre-line text-sm font-semibold text-text-strong">
            {a.template ? renderCatalogEmphasis(a.template, a.params) : ATTENTION_FALLBACK_TITLE}
          </p>
          {a.action ? (
            <a
              href={a.action.href}
              data-testid={`attention-banner-action-${a.alertId}`}
              {...(a.action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {a.action.label}
              {a.action.external ? <span aria-hidden="true"> ↗</span> : null}
            </a>
          ) : null}
          {a.helpHref ? (
            <a
              href={a.helpHref}
              data-testid={`attention-banner-help-${a.alertId}`}
              className="inline-flex min-h-tap-min items-center self-start text-xs text-text-subtle underline-offset-2 transition-colors duration-fast hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Learn more
            </a>
          ) : null}
          {a.failedKeys && a.failedKeys.length > 0 ? (
            <p data-testid={`attention-banner-failed-sources-${a.alertId}`} className="text-xs text-text-subtle">
              Failed sources: {a.failedKeys.join(", ")}
            </p>
          ) : null}
          {a.dataGaps ? (
            <p data-testid={`attention-banner-data-gaps-${a.alertId}`} className="text-xs text-text-subtle">
              Data dropped while parsing: {formatDataGapBreakdown(a.dataGaps)}
            </p>
          ) : null}
          {!underCrewRow && showIdentity ? (
            <p data-testid="attention-banner-identity" className="wrap-break-word text-xs text-text-subtle">
              {showIdentity}
            </p>
          ) : null}
          <p className="text-xs text-text-subtle tabular-nums">
            Raised{" "}
            <time dateTime={a.raisedAt} suppressHydrationWarning>
              {formatRelativeRaisedAt(a.raisedAt, now)}
            </time>
          </p>
          {a.autoClearNote ? (
            <p data-testid={`attention-banner-autoclear-${a.alertId}`} className="text-xs text-text-subtle">
              {a.autoClearNote}
            </p>
          ) : (
            <PerShowAlertResolveButton
              alertId={a.alertId}
              slug={slug}
              onResolved={() => {
                setConfirmed(true);
                onResolved(item.id);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
```

(Identity suppression note: `menuSubtitle` IS `identityText` for alert items — Task 1's derivation — so the `showIdentity` expression implements the `PerShowAlertSection.tsx:408-416` rule with the spec's under-crew-row addition.)

- [ ] **Step 4: Run banner + button + emphasis-walker tests → PASS.**
- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(admin): AttentionBanner inline alert banner + resolve onResolved callback"`

---

### Task 4: `AttentionMenu` (dropdown)

**Files:**
- Create: `components/admin/showpage/AttentionMenu.tsx`
- Test: `tests/components/admin/showpage/attentionMenu.test.tsx`

**Interfaces:**
- Produces: `AttentionMenu({ items, open, onClose, onNavigate, pillRef }: { items: AttentionItem[]; open: boolean; onClose: () => void; onNavigate: (item: AttentionItem) => void; pillRef: RefObject<HTMLButtonElement | null> })`. Renders nothing when `!open`. Panel: `absolute top-[calc(100%+8px)] right-0 w-[min(400px,calc(100vw-32px))] rounded-md border border-border bg-surface-raised shadow-lg z-20`, eyebrow header "Needs your confirmation", scrollable row list (`max-h-96 overflow-y-auto`), footer "N more clearing on their own — no action needed" when clearing > 0.
- Consumes: `AttentionItem` (Task 1).

- [ ] **Step 1: Failing tests:**
  - renders only actionable rows, in given order; each row shows `menuTitle` (strong) + `menuSubtitle` (subtle, absent when null) + tone dot class (`bg-status-review` notice / degraded token critical) + sr-only tier text.
  - row click → `onNavigate(item)` AND `onClose()` (order: close first — assert via call-order spy).
  - footer only when clearing items exist; exact copy `"2 more clearing on their own — no action needed"` derived from fixture count; footer absent at 0.
  - Escape on document: `onClose` called, `pillRef.current.focus()` called, and a bubble-phase document listener registered by the test does NOT fire (capture+stopPropagation contract — register a spy listener with `addEventListener("keydown", spy)` and assert it wasn't invoked; spec §5.2).
  - click outside → `onClose`; click inside → not closed.
  - `open: false` → renders null; document listeners removed (fire Escape → no `onClose`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Escape wiring:

```tsx
useEffect(() => {
  if (!open) return;
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation(); // capture phase at document → ReviewModalShell's bubble listener never runs
    onCloseRef.current();
    pillRef.current?.focus();
  }
  function onPointerDown(e: PointerEvent) {
    if (panelRef.current && e.target instanceof Node && !panelRef.current.contains(e.target)
        && !pillRef.current?.contains(e.target)) onCloseRef.current();
  }
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onPointerDown);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onPointerDown);
  };
}, [open, pillRef]);
```

Menu open animation — spec §9 REQUIRES `motion-safe` fade+scale on closed→open (`duration-fast ease-out-quart`, reduced-motion instant); open→closed is instant (unmount). Implement with the rail-indicator mount-frame idiom (`ShowReviewSurface.tsx:554-560`): render the panel with `opacity-0 scale-95`, flip to `opacity-100 scale-100` on the next `requestAnimationFrame`, panel classes `origin-top-right transition-[opacity,transform] duration-fast ease-out-quart motion-reduce:transition-none`. Test (jsdom): panel mounts with the pre-frame classes and carries `motion-reduce:transition-none`; the rAF flip is exercised in Task 8's real-browser pass.

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(admin): AttentionMenu dropdown with capture-phase Esc + click-outside"`

---

### Task 5: `ShowReviewSurface` attention props + `CrewBreakdown` banners + Changes anchors

**Files:**
- Modify: `components/admin/review/ShowReviewSurface.tsx` (new optional props `attentionSections?: ReadonlySet<string>`, `attentionJump?: { itemId: string; sectionId: string; nonce: number } | null`, `crewAttention?: CrewAttention`; `dotClass`/`dotStatusText` OR-in attention at `:244-257`; jump effect mirroring `jumpToWarning` `:335-357`; `crewAttention` injected into the crew section's `Step3SectionChromeContext` provider value at `:829-870` — conditional spread, ABSENT otherwise)
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`Step3SectionChromeContext` value type gains optional `crewAttention?: CrewAttention`; `CrewBreakdown` reads it from the context — NOT a direct prop, because the registry's crew `render()` closures at `:3501-3520` construct `CrewBreakdown` themselves and the provider already wraps `s.render(data)` (`ShowReviewSurface.tsx:829`); staged wizard passes no `crewAttention` → context field absent → byte-identical)
- Modify: `components/admin/ChangeFeedEntry.tsx` (`data-attention-anchor` on gate rows, root `<li>` at `:95-97`)
- Tests: `tests/components/admin/review/showReviewSurfaceAttention.test.tsx` (new), extend `tests/components/PerShowAlertSection.test.tsx`-family crew tests in `tests/components/admin/` if present, `tests/admin/changeFeedEntry`-family test (find with `rg -l ChangeFeedEntry tests`)

**Interfaces:**
- `ShowReviewSurface` new props (both optional; absent → byte-identical staged rendering — assert via existing snapshot/DOM tests still passing untouched).
- `export type CrewAttention = { byCrewKey: ReadonlyMap<string, ReactNode[]>; sectionTop: ReactNode[] }` (exported from `ShowReviewSurface.tsx`) — PRE-RENDERED nodes (the modal builds `<AttentionBanner>` elements; presentation stays dumb; staged mode passes nothing). Threading: `ShowReviewSurface` prop → crew section's `Step3SectionChromeContext` value (optional `crewAttention` field, conditional spread) → `CrewBreakdown` reads via `useContext(Step3SectionChromeContext)`. Row match: `crewAttention.byCrewKey.get(canonicalCrewKey(m.name))` rendered INSIDE that member's `<li>` after the row flex block; only the FIRST matching row hosts (track a consumed set while mapping); `sectionTop` nodes render above the `<ul>`. Unmatched byCrewKey entries are the MODAL's responsibility (Task 6 folds them into sectionTop before passing — CrewBreakdown never re-buckets).
- `ChangeFeedEntry`: gate rows (`entry.action === "approve_reject" && entry.gate != null`) add `data-attention-anchor={`hold:${entry.gate.holdId}`}` to the root `<li>`.

- [ ] **Step 1: Failing tests:**
  - `attentionSections: new Set(["crew"])` → crew rail dot classes flip to `bg-status-review` + sr text " — needs review" even with zero parse warnings; absent prop → hollow ring (assert both rail + chip dot testids `wizard-step3-card-<dfid>-review-rail-dot-crew` / `-chip-dot-crew`).
  - `attentionJump` change scrolls: stub scroller geometry (the existing surface test file shows the `scrollTo` stub idiom — reuse it), render an element with `data-attention-anchor="alert:a1"` inside the crew section, set prop `{itemId:"alert:a1", sectionId:"crew", nonce:1}` → `scroller.scrollTo` called, target carries `data-step3-warning-flash`; missing anchor → falls back to section scroll, no flash attribute anywhere; same-nonce re-render → no second scroll.
  - `CrewBreakdown` attention (threaded via `ShowReviewSurface` `crewAttention` prop → chrome context; test renders the SURFACE with published-mode `SectionData`, not `CrewBreakdown` bare — exercises the real plumbing): banner node renders inside the matching member's `<li>` (query `li` containing the member name, assert it contains the banner testid — clone-and-strip other rows per anti-tautology rule); duplicate names → only first `<li>` hosts; `sectionTop` nodes render before the `<ul>`; absent prop → DOM byte-identical (render with/without and diff the crew section's `innerHTML`).
  - `ChangeFeedEntry` gate row carries `data-attention-anchor="hold:hold-1"`; non-gate rows carry none.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Jump effect in `ShowReviewSurface` (after `jumpToRoom`):

```tsx
const lastJumpNonceRef = useRef(0);
useEffect(() => {
  const jump = attentionJump;
  if (!jump || jump.nonce === lastJumpNonceRef.current) return;
  lastJumpNonceRef.current = jump.nonce;
  setActive(jump.sectionId);
  if (hashSync && typeof window !== "undefined") {
    window.history.replaceState(null, "", `#${jump.sectionId}`);
  }
  const scroller = scrollerRef.current;
  const target = scroller?.querySelector<HTMLElement>(
    `[data-attention-anchor="${CSS.escape(jump.itemId)}"]`,
  );
  if (scroller && target && typeof scroller.scrollTo === "function") {
    const top = beginSuppressedScroll(scroller, sectionTopFor(scroller, target) - 8);
    scroller.scrollTo({ top });
    clearWarningHighlight();
    target.setAttribute("data-step3-warning-flash", "");
    highlightedElRef.current = target;
    highlightTimerRef.current = setTimeout(clearWarningHighlight, WARNING_HIGHLIGHT_MS);
  } else {
    handleNavClick(jump.sectionId); // anchor missing → section-top, no flash (spec §6.2)
  }
}, [attentionJump]);
```

`dotClass`/`dotStatusText`: `const review = (id === "warnings" ? hasWarnRow : flagged.has(id)) || (attentionSections?.has(id) ?? false);` — applied in BOTH functions.

`CrewBreakdown` (keep presentation-only; note the consumed-set rule so duplicates host once):

```tsx
const { crewAttention } = useContext(Step3SectionChromeContext); // absent in staged mode
{crewAttention?.sectionTop && crewAttention.sectionTop.length > 0 ? (
  <div className="flex flex-col gap-2">{crewAttention.sectionTop}</div>
) : null}
<ul className="flex flex-col">
  {shown.map((m, i) => {
    const key = canonicalCrewKey(m.name || "");
    const banners = !consumed.has(key) ? crewAttention?.byCrewKey.get(key) : undefined;
    if (banners) consumed.add(key);
    return (
      <Fragment key={`${m.name}-${i}`}>
        <li className="flex flex-col py-1">
          <div className="flex items-center gap-3">{/* existing row content verbatim */}</div>
          {banners ? <div className="mt-2 flex flex-col gap-2">{banners}</div> : null}
        </li>
      </Fragment>
    );
  })}
</ul>
```

CAUTION: the existing `<li>` is `flex items-center gap-3` (`step3ReviewSections.tsx:1266`); moving row content into an inner div changes the flex parent. Preserve byte-identical no-attention DOM: when `attention` is ABSENT, render the ORIGINAL `<li>` markup unchanged (branch at the top of the map). Only the attention-present branch uses the column wrapper.

- [ ] **Step 4: Run new tests + FULL existing surface/crew/step3 test files → PASS** (`pnpm vitest run tests/components/admin/review tests/components/admin/showpage tests/components/PerShowAlertSection.test.tsx` plus the step3 wizard component tests — find with `rg -l CrewBreakdown tests`).
- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(admin): surface attention props — nav dots, attentionJump scroll+flash, in-row crew banners, hold anchors"`

---

### Task 6: modal integration + loader wiring

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` — replace `alertCount`/`alertSlot`/`alertId` internals with `attentionItems: AttentionItem[]`, `alertsDegraded: boolean`, keep `alertId` prop (deep link); pill states; menu mount; auto-open; `doneIds`; jump state; overview banners via `OverviewSection`'s slot prop (renamed `alertSlot` → `attentionSlot`, see Step 3); Changes railBadge; `attentionSections` + `attentionJump` pass-down.
- Modify: `app/admin/_showReviewModal.tsx` — derive items post-wave, pass new props, drop `PerShowAlertSection` import/slot (`:52`, `:342`, `:392`) and `alertCount` (`:270`, `:387`).
- Tests: extend `tests/components/admin/showpage/publishedReviewModal.test.tsx`; update `tests/app/admin/showReviewModalLoader.test.tsx`.

**Interfaces (consumed by tests + Task 7/8):**
- `PublishedReviewModalProps` delta: REMOVE `alertCount`, `alertSlot`; ADD `attentionItems: AttentionItem[]`, `alertsDegraded: boolean`. `alertId: string | null` stays.
- Pill testid stays `published-show-review-alert-pill` (now a `<button>`); menu testid `published-show-review-attention-menu`; menu rows `attention-menu-row-<item.id>`.
- Derived state: `const live = attentionItems.filter(i => !doneIds.has(i.id)); const actionable = live.filter(i => i.actionable); const clearing = live.length - actionable.length;`

- [ ] **Step 1: Failing tests** (extend `publishedReviewModal.test.tsx`, reusing its fixture builder):
  - pill states: actionable>0 → button "2 to confirm" + `aria-expanded`; actionable 0 & clearing>0 → non-interactive "1 clearing" (no button role); all empty → "In sync" + `border-status-positive` ring dot; `alertsDegraded` + zero items → "Alerts unavailable"; `alertsDegraded: true` + one hold item → the ACTIONABLE "1 to confirm" button pill and the menu lists the hold (spec §5.1 degraded row: "Hold-derived count still shows if holds exist — then the To-confirm state wins and the menu lists holds only") with the Overview degraded notice card still rendered; count cap fixture 120 → "99+ to confirm" + sr-only exact.
  - auto-open: mount with actionable>0 → menu present without click; rerender with same props → still one menu; **stale→fresh**: mount with `attentionItems: []` then rerender with actionable items (the revalidate-on-open reconcile path) → menu auto-opens; after the user closes it, a further rerender with MORE items does NOT reopen; `alertId` non-null → never auto-opens, including when items arrive late.
  - archived show (spec §7 pinned reality): fixture `archived: true` + one hold + one actionable alert → items still listed in the menu, hold's Changes entry still renders its gate forms (client-side archived gating for MI-11 does not exist today — `ChangesSection.tsx:29-71` has no archived prop; server actions carry the refusals). Pin with a jsdom test so any future archived-gating change surfaces here deliberately.
  - menu row click → jump prop handed to `ShowReviewSurface` (assert via the surface receiving `attentionJump` with the item's id — mock `ShowReviewSurface` the way the file's existing tests mock it (`:606` layout pin idiom) OR assert on the real surface's scroll stub).
  - resolve flow: simulate `AttentionBanner` onResolved (fire the callback via the rendered banner's button with mocked fetch) → pill count decrements; last actionable resolved → menu closes + pill flips.
  - Overview railBadge = overview-routed actionable count (fixture: 1 overview alert + 1 crew alert → badge "1"); Changes railBadge = holds count.
  - deep-link: `alertId` matching an item → surface receives mount jump for `alert:<id>` and that banner `aria-current`; `alertId` with no item → fallback `#overview` scroll (existing `:192-203` effect replaced — port its test).
  - loader test (`showReviewModalLoader.test.tsx`): asserts `attentionItems` prop derived from mocked fetch+feed (counts from fixture composition), `alertsDegraded` true on `{kind:"infra_error"}`, and Overview infra notice rendered (the §3.2 card — passed via `OverviewSection`'s renamed `attentionSlot` when degraded).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Modal core additions:

```tsx
const [menuOpen, setMenuOpen] = useState(false);
const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
const [jump, setJump] = useState<{ itemId: string; sectionId: string; nonce: number } | null>(null);
const jumpNonceRef = useRef(0);
const pillRef = useRef<HTMLButtonElement | null>(null);

const live = attentionItems.filter((i) => !doneIds.has(i.id));
const actionable = live.filter((i) => i.actionable);
const clearingCount = live.length - actionable.length;
const attentionSections = useMemo(
  () => new Set(actionable.map((i) => i.sectionId).filter((s): s is string => s !== "overview" && s !== "changes")),
  [actionable],
);

const navigateTo = useCallback((item: AttentionItem) => {
  setMenuOpen(false);
  jumpNonceRef.current += 1;
  setJump({ itemId: item.id, sectionId: item.sectionId, nonce: jumpNonceRef.current });
}, []);

// auto-open once per mount (spec §5.2); deep link suppresses (spec §6.4).
// The guard consumes only when it DECIDES (opens, or deep-link suppression) —
// not on first render — because the modal's own revalidate-on-open
// router.refresh() (PublishedReviewModal.tsx:137-149) can stream actionable
// items AFTER a prefetched empty first paint; the auto-open must still fire
// when they arrive. Once fired (or suppressed) it never re-fires: a user who
// closed the menu is not re-opened by later refreshes.
const autoOpenFiredRef = useRef(false);
useEffect(() => {
  if (autoOpenFiredRef.current) return;
  if (alertId != null) {
    autoOpenFiredRef.current = true; // deep link wins for the whole mount
    return;
  }
  if (actionable.length > 0) {
    autoOpenFiredRef.current = true;
    setMenuOpen(true);
  }
}, [alertId, actionable.length]);

// menu self-close when the last actionable item resolves (spec §9 compound)
useEffect(() => {
  if (menuOpen && actionable.length === 0) setMenuOpen(false);
}, [menuOpen, actionable.length]);

const onResolved = useCallback((id: string) => {
  setDoneIds((prev) => new Set([...prev, id]));
}, []);
```

Deep-link effect replaces `:192-203`: map `alertId` → `alert:<alertId>` item; found → `setJump({...})` once (ref guard); else keep the old `#overview` scrollIntoView fallback verbatim. Banners built once:

```tsx
const bannerFor = (item: AttentionItem, underCrewRow: boolean) => (
  <AttentionBanner key={item.id} item={item} slug={slug} now={now} underCrewRow={underCrewRow}
    highlighted={alertId != null && item.id === `alert:${alertId}`} onResolved={onResolved} />
);
const crewItems = live.filter((i) => i.kind === "alert" && i.sectionId === "crew");
const crewByKey = new Map<string, ReactNode[]>();
const crewSectionTop: ReactNode[] = [];
for (const item of crewItems) {
  // Unmatched keys fold to sectionTop at CrewBreakdown-prop build time: the modal
  // KNOWS the roster (data.crewMembers) — bucket by whether a rendered row (first
  // CREW_CAP, canonicalCrewKey match) exists (spec §4 guard).
  const rendered = data.crewMembers.slice(0, CREW_CAP)
    .some((m) => canonicalCrewKey(m.name || "") === item.crewKey);
  if (item.crewKey && rendered) {
    const list = crewByKey.get(item.crewKey) ?? [];
    list.push(bannerFor(item, true));
    crewByKey.set(item.crewKey, list);
  } else crewSectionTop.push(bannerFor(item, false));
}
const overviewBanners = live.filter((i) => i.kind === "alert" && i.sectionId === "overview")
  .map((i) => bannerFor(i, false));
```

`overviewExtra.railBadge` count = `actionable.filter(i => i.sectionId === "overview").length`; `changesExtra` gains the same badge idiom with `actionable.filter(i => i.kind === "hold").length`. `OverviewSection`'s `alertSlot: ReactNode` prop (`components/admin/showpage/OverviewSection.tsx:72,102`) is RENAMED `attentionSlot: ReactNode` (same render position `:102`; rename keeps the Task 9 zero-`alertSlot` grep gate honest — add `components/admin/showpage/OverviewSection.tsx` + `tests/components/admin/showpage/overviewSection.test.tsx` to this task's Files list). The modal passes `attentionSlot={<>{alertsDegraded ? <AlertsDegradedNotice /> : null}{overviewBanners}</>}` (`AlertsDegradedNotice` = the §3.2 copy-parity card, a tiny local component in the modal file). Crew banners thread via the SINGLE mechanism Task 5 built: the modal passes `crewAttention={{ byCrewKey: crewByKey, sectionTop: crewSectionTop }}` to `ShowReviewSurface`, which injects it into the crew section's `Step3SectionChromeContext`; `CrewBreakdown` reads the context (Task 5 interface — no direct prop, no `SectionData` change). Staged wizard passes nothing → byte-identical.

Loader (`_showReviewModal.tsx`): after the wave —

```tsx
const alertsDegraded = !Array.isArray(alertsForCount);
const attentionItems = deriveAttentionItems({
  alerts: alertsDegraded ? [] : alertsForCount,
  feed: feed ? { entries: feed.entries } : null,
  slug,
});
```

pass `attentionItems` + `alertsDegraded`; delete the `alertSlot`/`alertCount` lines (`:270`, `:342`, `:387`, `:392`) and the `PerShowAlertSection` import (`:52` — keep `fetchPerShowAlerts` import from its NEW module).

- [ ] **Step 4: Run** — `pnpm vitest run tests/components/admin/showpage tests/app/admin/showReviewModalLoader.test.tsx tests/components/admin/review` → PASS.
- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(admin): attention pill + menu + inline banners wired through modal and loader"`

---

### Task 7: retire `PerShowAlertSection` + sweep dependents

**Files:**
- Delete: `components/admin/PerShowAlertSection.tsx`
- Modify/Delete tests: `tests/components/PerShowAlertSection.test.tsx` (delete render tests; fetch tests already live in `tests/adminAlerts/fetchPerShowAlerts.test.ts`), `tests/components/admin/per-show-lifecycle.test.tsx` (update — find its `PerShowAlertSection` usage first), `tests/admin/healthAlerts.test.ts` (imports `fetchPerShowAlerts`? update import path), `tests/components/admin/showpage/overviewSection.test.tsx:67-72` comment (strip badge reference — anchor pin itself stays), `tests/e2e/published-review-modal.deeplink.spec.ts` (aria-current now on the banner anchor; update selectors to `[data-attention-anchor]`).
- Sweep: `rg -n 'PerShowAlertSection' --hidden -g '!node_modules' -g '!.git'` → every remaining reference is either updated or is a docs/spec historical mention (leave docs).

- [ ] **Step 1:** Run the sweep; enumerate hits. **Step 2:** delete component; update each test per above (deep-link e2e keeps its seeded-alert flow, targets `attention-banner-<id>` + `aria-current`). **Step 3:** `pnpm vitest run tests/` (full unit suite) → PASS; `pnpm typecheck` → PASS. **Step 4:** Commit — `git commit --no-verify -m "refactor(admin): retire PerShowAlertSection — attention surfaces replace it"`

---

### Task 8: real-browser spec + transition audit

**Files:**
- Create: `tests/e2e/published-show-attention.spec.ts` (harness family: copy the boot pattern from `tests/e2e/published-review-modal.layout.spec.ts` / `_publishedReviewModalHarness.tsx`)
- Modify: `tests/e2e/published-review-modal.layout.spec.ts:374,426,443` (pill selector semantics: still `-alert-pill`, now a button — update role assertions only if they pin `<a>`)

**Real-browser assertions (each its own test):**
- [ ] Pill hit-band T-TAP probe: resolved hit area ≥ 44px tall (port the existing probe at `:426-443` to the button).
- [ ] Auto-open on arrival with seeded actionable items; menu visible; pill `aria-expanded="true"`.
- [ ] Menu row click → menu closes, scroller settles at anchorTop − 8 (±2, the `NAV_SCROLL_SETTLE_EPSILON_PX` contract), target carries `data-step3-warning-flash` during the window and loses it after `WARNING_HIGHLIGHT_MS`.
- [ ] Crew banner placement: `li:has([data-attention-anchor])` contains the member name; banner `getBoundingClientRect().top >=` row content block bottom.
- [ ] Esc with menu open → menu closes, dialog still mounted; second Esc → dialog closes.
- [ ] Deep-link `?alert_id=<seeded>` → banner centered-ish in scroller viewport (`elementFromPoint` idiom from memory refs) with `aria-current="true"`, menu NOT auto-opened.
- [ ] Resolve → pill text decrements without reload; "In sync" pill after last one (seed exactly 1 actionable).
- [ ] Transition audit (jsdom + real browser mix): every §9 pair — pill state swaps have NO transition classes (instant-by-declaration: assert class list contains no `transition` on the state-carrying nodes); menu open animation per Task 4 decision; compound: resolve-while-menu-open (row vanishes, menu closes at zero); jump-replaces-glide (two rapid row clicks → single settle at second target).
- [ ] Run: `pnpm exec playwright test tests/e2e/published-show-attention.spec.ts --config tests/e2e/standalone.config.ts` (alt port if :3000 contended — sibling-server memory) → PASS. Commit — `test(admin): real-browser attention surface coverage`

---

### Task 9: full gates + close-out prep

- [ ] `pnpm test` (full unit suite), `pnpm typecheck`, `pnpm exec eslint . --max-warnings 0` (canonical Tailwind order), `pnpm format:check`, `pnpm build` — all green locally (pre-push gates memory: scoped runs miss regressions).
- [ ] `rg -n 'alertCount|alertSlot' app components tests` → zero stale references.
- [ ] BACKLOG.md: add `BL-ADMIN-PARSEPANEL-ORPHANED` (ParsePanel/StagedReviewCard live-scope mount orphaned since #476; spec §14 notes) — single line, no scope creep.
- [ ] Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff — P0/P1 fixed or DEFERRED.md rows (invariant 8) — run BEFORE the Stage-4 cross-model review.
- [ ] Commit any gate fixes per-task-style; then Stage 4 (whole-diff Codex review → push → PR → CI → merge).

---

## Self-review notes (writing-plans checklist)

- **Spec coverage:** §3 (T1), §3.1a (T2), §3.2 degraded (T6), §4 routing+meta (T1), §5.1 pill (T6), §5.2 menu (T4+T6), §5.3 dots/badges (T5+T6), §5.4 banners (T3+T5+T6), §5.5 hold anchors (T5), §6.2 jump (T5), §6.3 resolve lifecycle (T3+T6), §6.4 deep link (T6+T7 e2e), §7 guards (spread: T1 unknown-code/degraded, T5 cap/no-match, T6 pill guards), §9 transitions (T4 decision + T8 audit), §11 caps (T4 max-h + T6 99+), §12 tests (T1-T8), §13 invariants (constraints block), §14 out-of-scope (BACKLOG row only).
- **Known verify-at-implementation points (flagged inline, not placeholders):** AlertIdentity crew-segment literal (T2), degraded-red token name (T3), menu animation precedent (T4), crew-attention threading mechanism (T6 — context field fallback specified).
- **Type consistency:** `AttentionItem`/`deriveAttentionItems`/`canonicalCrewKey`/`AttentionAlertInput` names consistent across T1/T2/T5/T6; `onResolved(id)` consistent T3/T6; jump shape `{itemId, sectionId, nonce}` consistent T5/T6/T8.
