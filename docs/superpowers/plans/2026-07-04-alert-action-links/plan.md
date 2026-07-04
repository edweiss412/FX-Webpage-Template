# Alert Action Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one per-code "go to X" action link in admin alert rows, driven by a typed registry, per spec `docs/superpowers/specs/2026-07-04-alert-action-links.md`.

**Architecture:** A pure registry module (`lib/adminAlerts/alertActions.ts`) maps 9 alert codes to href builders with fail-quiet guards; `PerShowAlertSection` renders the link for per-show rows and `AlertBanner` for global rows only; a structural meta-test pins registry↔raise-site fidelity (context fields AND show-scoping) on disk.

**Tech Stack:** Next.js 16 RSC components, TypeScript, vitest (+jsdom for component tests), existing URL builders `buildSheetDeepLink` / `driveFolderUrl`.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-04-alert-action-links.md`. §4 is the exact 9-entry registry table; §5 is the N/A coverage; §7.3 is the guard table.
- No DB change, no migration, no §12.4 catalog change, no new admin-alert codes, no raise-site changes (spec §2 decision 2).
- Labels are static UI chrome, NOT §12.4 copy (spec §10 watchpoint 1). Never render a raw code literal (AGENTS invariant 5 — nothing here reads the catalog).
- Registry keyed by its own `ALERT_ACTION_CODES` literal union — NOT `AdminAlertCode`, which deliberately excludes 3 of the 9 codes (spec §2 decision 1).
- External links: `target="_blank" rel="noopener noreferrer"` + trailing `<span aria-hidden="true"> ↗</span>`. Internal links: neither (spec §2 decision 4).
- Rendering split: per-show rows → `PerShowAlertSection`; global rows only → `AlertBanner` (spec §2 decision 3).
- Guards are fail-quiet: any missing/non-string/empty/malformed context field → no link (spec §2 decision 6, §7.3).
- TDD per task, commit per task (`feat(admin):` / `test(admin):`), `--no-verify` on commits (worktree), so `pnpm format:check` must pass before push.
- UI files touched (`components/`) → invariant-8 impeccable dual-gate runs at close-out, before the whole-diff Codex review.

**Meta-test inventory (mandatory declaration):** CREATES `tests/messages/_metaAlertActionsContract.test.ts` (Task 1 — written in the same red step as the unit tests so both are failing before the registry module exists, preserving TDD invariant 1). EXTENDS none. `tests/auth/_metaInfraContract.test.ts` N/A — the registry makes zero Supabase calls; both components' existing fetches are untouched. Advisory-lock topology N/A — no `pg_advisory*` surface touched.

**Layout-dimensions task: N/A** — no fixed-dimension parent; the link is a `self-start` inline anchor in a `flex flex-col gap-2` list item and a `flex flex-wrap` action slot. **Transition-audit task: N/A** — no transition inventory in the spec; links are statically present or absent per server render (spec §7.1).

---

### Task 1: Action registry module + structural meta-test

**Files:**
- Create: `lib/adminAlerts/alertActions.ts`
- Test: `tests/adminAlerts/alertActions.test.ts`
- Test: `tests/messages/_metaAlertActionsContract.test.ts`

TDD shape: BOTH test files are written first and are genuinely red — every test in both files fails while `@/lib/adminAlerts/alertActions` does not exist (unresolvable import). Implementing the registry turns both green. The meta-test's raise-site pins additionally get a negative-verification step (they pin PRE-EXISTING files, so their bite is proven by mutation, not by red-green against the registry).

**Interfaces:**
- Consumes: `buildSheetDeepLink(driveFileId: string | null | undefined, anchor?)` → `string | null` (`lib/sheet-links/buildSheetDeepLink.ts`); `driveFolderUrl(folderId: string | null | undefined)` → `string | null` (`lib/drive/driveFolderUrl.ts`).
- Produces: `ALERT_ACTION_CODES` const tuple, `AlertActionCode`, `AlertActionLink = { label: string; href: string; external: boolean }`, `AlertActionBuilder`, `ALERT_ACTIONS: Record<AlertActionCode, AlertActionBuilder>`, `resolveAlertAction(code: string, context: Record<string, unknown> | null, opts: { slug: string | null }): AlertActionLink | null`. Tasks 2–4 rely on these exact names.

- [ ] **Step 1: Write the failing test**

```ts
// tests/adminAlerts/alertActions.test.ts
/**
 * Unit tests for the per-code alert action registry (spec §4, §7.3, §8.1).
 * Every expected href is derived from the fixture's field values — never an
 * independent constant. Failure modes caught: URL template regression; a
 * guard bypass rendering javascript:/non-GitHub orphan_url; dot-segment or
 * placeholder repo values producing a wrong GitHub target.
 */
import { describe, expect, it } from "vitest";
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";

const slugOpts = { slug: "east-coast" };
const noSlug = { slug: null };

describe("share-access group (spec §4 #1-#3)", () => {
  it("SHOW_FIRST_PUBLISHED builds the share-access fragment href from the slug", () => {
    const action = resolveAlertAction("SHOW_FIRST_PUBLISHED", {}, slugOpts);
    expect(action).toEqual({
      label: "Go to Published toggle",
      href: `/admin/show/${encodeURIComponent(slugOpts.slug)}#share-access`,
      external: false,
    });
  });
  it("PICKER_EPOCH_RESET and PICKER_SELECTION_RACE share the Share & access target", () => {
    for (const code of ["PICKER_EPOCH_RESET", "PICKER_SELECTION_RACE"]) {
      const action = resolveAlertAction(code, null, slugOpts);
      expect(action).toEqual({
        label: "Go to Share & access",
        href: `/admin/show/${encodeURIComponent(slugOpts.slug)}#share-access`,
        external: false,
      });
    }
  });
  it("slug null/empty/whitespace → null (guard table §7.3)", () => {
    expect(resolveAlertAction("SHOW_FIRST_PUBLISHED", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("PICKER_EPOCH_RESET", {}, { slug: "" })).toBeNull();
    expect(resolveAlertAction("PICKER_SELECTION_RACE", {}, { slug: "   " })).toBeNull();
  });
  it("slug needing encoding is percent-encoded", () => {
    const action = resolveAlertAction("SHOW_FIRST_PUBLISHED", {}, { slug: "a b/c" });
    expect(action?.href).toBe(`/admin/show/${encodeURIComponent("a b/c")}#share-access`);
  });
});

describe("sheet links (spec §4 #4-#5)", () => {
  it("ROLE_FLAGS_NOTICE builds a sheet deep link from context.drive_file_id", () => {
    const drive_file_id = "df-123";
    const action = resolveAlertAction("ROLE_FLAGS_NOTICE", { drive_file_id }, noSlug);
    expect(action).toEqual({
      label: "Open in Sheet",
      href: `https://docs.google.com/spreadsheets/d/${drive_file_id}/edit#gid=0`,
      external: true,
    });
  });
  it("ROLE_FLAGS_NOTICE guards: null context, absent field, non-string, empty", () => {
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", null, noSlug)).toBeNull();
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", { drive_file_id: 42 }, noSlug)).toBeNull();
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", { drive_file_id: { id: "x" } }, noSlug)).toBeNull();
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", { drive_file_id: "  " }, noSlug)).toBeNull();
  });
  it("LIVE_ROW_CONFLICT prefers the sheet link when drive_file_id present", () => {
    const drive_file_id = "df-456";
    const action = resolveAlertAction(
      "LIVE_ROW_CONFLICT",
      { drive_file_id, folder_id: "fold-9" },
      noSlug,
    );
    expect(action).toEqual({
      label: "Open in Sheet",
      href: `https://docs.google.com/spreadsheets/d/${drive_file_id}/edit#gid=0`,
      external: true,
    });
  });
  it("LIVE_ROW_CONFLICT falls back to the Drive folder when only folder_id present", () => {
    const folder_id = "fold-9";
    const action = resolveAlertAction("LIVE_ROW_CONFLICT", { folder_id }, noSlug);
    expect(action).toEqual({
      label: "Open Drive folder",
      href: `https://drive.google.com/drive/folders/${encodeURIComponent(folder_id)}`,
      external: true,
    });
  });
  it("LIVE_ROW_CONFLICT with neither field → null", () => {
    expect(resolveAlertAction("LIVE_ROW_CONFLICT", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("LIVE_ROW_CONFLICT", null, noSlug)).toBeNull();
  });
  it("LIVE_ROW_CONFLICT per-field guards (§7.3): wrong-type/empty drive_file_id falls back; bad folder_id → null", () => {
    const folder_id = "fold-9";
    // Wrong-type or empty drive_file_id is IGNORED (str → null) → folder fallback.
    for (const badDrive of [42, { id: "x" }, "  "]) {
      const action = resolveAlertAction("LIVE_ROW_CONFLICT", { drive_file_id: badDrive, folder_id }, noSlug);
      expect(action?.href).toBe(
        `https://drive.google.com/drive/folders/${encodeURIComponent(folder_id)}`,
      );
    }
    // Bad folder_id with no drive_file_id → no link at all.
    for (const badFolder of [7, ["a"], "   "]) {
      expect(resolveAlertAction("LIVE_ROW_CONFLICT", { folder_id: badFolder }, noSlug)).toBeNull();
    }
  });
});

describe("wizard link (spec §4 #6)", () => {
  it("WIZARD_SESSION_SUPERSEDED_RACE is a static internal route", () => {
    expect(resolveAlertAction("WIZARD_SESSION_SUPERSEDED_RACE", null, noSlug)).toEqual({
      label: "Go to setup wizard",
      href: "/admin/onboarding",
      external: false,
    });
  });
});

describe("GitHub issue link (spec §4 #7) — URL allow-list", () => {
  const orphan_url = "https://github.com/edweiss412/FX-Webpage-Template/issues/99";
  it("renders the context URL verbatim when it passes the https://github.com/ prefix", () => {
    const action = resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", { orphan_url }, noSlug);
    expect(action).toEqual({ label: "Open GitHub issue", href: orphan_url, external: true });
  });
  it.each([
    ["javascript:alert(1)"],
    ["http://github.com/owner/repo/issues/1"],
    ["https://github.evil.com/x"],
    ["https://gitlab.com/owner/repo"],
    [""],
  ])("rejects %s", (bad) => {
    expect(
      resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", { orphan_url: bad }, noSlug),
    ).toBeNull();
  });
  it("absent / non-string orphan_url → null", () => {
    expect(resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", { orphan_url: 7 }, noSlug)).toBeNull();
    expect(resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", null, noSlug)).toBeNull();
  });
});

describe("branch settings links (spec §4 #8-#9) — segment guard", () => {
  const repo = "edweiss412/FX-Webpage-Template";
  it.each(["BRANCH_PROTECTION_DRIFT", "BRANCH_PROTECTION_MONITOR_AUTH_FAILED"])(
    "%s builds the settings URL from a valid owner/name repo",
    (code) => {
      expect(resolveAlertAction(code, { repo }, noSlug)).toEqual({
        label: "Open branch settings",
        href: `https://github.com/${repo}/settings/branches`,
        external: true,
      });
    },
  );
  // The four spec-mandated null-case literals (§8.1) + structural rejects —
  // asserted against BOTH branch-protection codes (spec §4 gives #9 the same
  // guards as #8; a drift-only guard must fail here).
  const BRANCH_CODES = ["BRANCH_PROTECTION_DRIFT", "BRANCH_PROTECTION_MONITOR_AUTH_FAILED"];
  it.each([
    ["owner/.."],
    ["owner/."],
    ["./repo"],
    ["owner/repo"], // producer's missing-env placeholder (verify-branch-protection.ts:49-50)
    ["justowner"],
    ["a/b/c"],
    ["own er/repo"],
    ["owner./repo"], // dot in owner segment — GitHub owner charset has no dots
    [""],
  ])("both codes reject %s", (bad) => {
    for (const code of BRANCH_CODES) {
      expect(resolveAlertAction(code, { repo: bad }, noSlug), code).toBeNull();
    }
  });
  it("non-string repo → null for both codes", () => {
    for (const code of BRANCH_CODES) {
      expect(resolveAlertAction(code, { repo: ["a", "b"] }, noSlug), code).toBeNull();
    }
  });
});

describe("resolveAlertAction dispatch", () => {
  it("unregistered codes → null", () => {
    expect(resolveAlertAction("SHOW_UNPUBLISHED", { drive_file_id: "x" }, slugOpts)).toBeNull();
    expect(resolveAlertAction("", null, noSlug)).toBeNull();
    expect(resolveAlertAction("not_a_code", null, noSlug)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing meta-test**

The meta-test code lives in the "Meta-test file" block below (after this task's step list, to keep the steps readable). Write it to `tests/messages/_metaAlertActionsContract.test.ts` exactly as given. Contracts (spec §6): raise-site fidelity via bounded regexes anchoring the code literal and consumed field in ONE match; show-scoping pins for the three slug-dependent codes; a 3-match count for the three `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` producer branches; target-existence pins; registry↔spec parity + 42-code universe membership. All eleven regex counts were verified empirically against live files during plan review (the `ROLE_FLAGS_NOTICE` constructor pin anchors on `as const` specifically because the bare code literal also matches the type definition at `lib/sync/phase2.ts:120-127` — 2 matches without it, 1 with).

- [ ] **Step 3: Run both test files to verify they fail**

Run: `pnpm vitest run tests/adminAlerts/alertActions.test.ts tests/messages/_metaAlertActionsContract.test.ts`
Expected: BOTH FAIL — cannot resolve `@/lib/adminAlerts/alertActions` (the module does not exist yet).

- [ ] **Step 4: Write the implementation**

```ts
// lib/adminAlerts/alertActions.ts
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { driveFolderUrl } from "@/lib/drive/driveFolderUrl";

/**
 * Per-code action links for admin alert rows
 * (spec docs/superpowers/specs/2026-07-04-alert-action-links.md §3-§4).
 *
 * Keyed by its own exact literal union, NOT `AdminAlertCode`: three of these
 * codes are raw-SQL/script producers deliberately outside that union (see
 * NON_UPSERT_ADMIN_ALERTS_PRODUCERS in tests/messages/_metaAdminAlertCatalog).
 * All guards are fail-quiet: malformed context → null → no link renders.
 */
export const ALERT_ACTION_CODES = [
  "SHOW_FIRST_PUBLISHED",
  "PICKER_EPOCH_RESET",
  "PICKER_SELECTION_RACE",
  "ROLE_FLAGS_NOTICE",
  "LIVE_ROW_CONFLICT",
  "WIZARD_SESSION_SUPERSEDED_RACE",
  "REPORT_ORPHANED_LOST_LEASE",
  "BRANCH_PROTECTION_DRIFT",
  "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
] as const;

export type AlertActionCode = (typeof ALERT_ACTION_CODES)[number];

export type AlertActionLink = { label: string; href: string; external: boolean };

export type AlertActionBuilder = (
  context: Record<string, unknown> | null,
  opts: { slug: string | null },
) => AlertActionLink | null;

// context is untyped JSON — a field is usable only as a non-empty string.
function str(context: Record<string, unknown> | null, key: string): string | null {
  if (!context) return null;
  const value = context[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function shareAccess(label: string): AlertActionBuilder {
  return (_context, opts) => {
    const slug = typeof opts.slug === "string" ? opts.slug.trim() : "";
    if (!slug) return null;
    return {
      label,
      href: `/admin/show/${encodeURIComponent(slug)}#share-access`,
      external: false,
    };
  };
}

const openSheet: AlertActionBuilder = (context) => {
  const href = buildSheetDeepLink(str(context, "drive_file_id"));
  return href ? { label: "Open in Sheet", href, external: true } : null;
};

// GitHub owner: alphanumerics + hyphen only. Repo name: adds _ and ., but a
// pure dot segment (`.`/`..`) URL-normalizes away from the intended path, and
// the producer defaults missing GITHUB_REPOSITORY to the literal "owner/repo"
// (scripts/verify-branch-protection.ts:49-50) — both fail quiet.
const branchSettings: AlertActionBuilder = (context) => {
  const repo = str(context, "repo");
  if (!repo || repo === "owner/repo") return null;
  const segments = repo.split("/");
  if (segments.length !== 2) return null;
  const [owner, name] = segments;
  if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) return null;
  if (!name || !/^[A-Za-z0-9_.-]+$/.test(name) || name === "." || name === "..") return null;
  return {
    label: "Open branch settings",
    href: `https://github.com/${repo}/settings/branches`,
    external: true,
  };
};

export const ALERT_ACTIONS: Record<AlertActionCode, AlertActionBuilder> = {
  SHOW_FIRST_PUBLISHED: shareAccess("Go to Published toggle"),
  PICKER_EPOCH_RESET: shareAccess("Go to Share & access"),
  PICKER_SELECTION_RACE: shareAccess("Go to Share & access"),
  ROLE_FLAGS_NOTICE: openSheet,
  LIVE_ROW_CONFLICT: (context) => {
    const sheet = buildSheetDeepLink(str(context, "drive_file_id"));
    if (sheet) return { label: "Open in Sheet", href: sheet, external: true };
    const folder = driveFolderUrl(str(context, "folder_id"));
    if (folder) return { label: "Open Drive folder", href: folder, external: true };
    return null;
  },
  WIZARD_SESSION_SUPERSEDED_RACE: () => ({
    label: "Go to setup wizard",
    href: "/admin/onboarding",
    external: false,
  }),
  REPORT_ORPHANED_LOST_LEASE: (context) => {
    const url = str(context, "orphan_url");
    if (!url || !url.startsWith("https://github.com/")) return null;
    return { label: "Open GitHub issue", href: url, external: true };
  },
  BRANCH_PROTECTION_DRIFT: branchSettings,
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: branchSettings,
};

const REGISTERED = new Set<string>(ALERT_ACTION_CODES);

export function resolveAlertAction(
  code: string,
  context: Record<string, unknown> | null,
  opts: { slug: string | null },
): AlertActionLink | null {
  if (!REGISTERED.has(code)) return null;
  return ALERT_ACTIONS[code as AlertActionCode](context, opts);
}
```

- [ ] **Step 5: Run both test files to verify they pass, plus the messages suite**

Run: `pnpm vitest run tests/adminAlerts/alertActions.test.ts tests/messages/`
Expected: ALL PASS (the messages suite hosts the M8 namespace scanner and catalog gates — the new meta-test file adds no `code:`-stamped log calls and no catalog rows, so nothing there should move).

- [ ] **Step 6: Negative-verification (prove the raise-site pins bite)**

FIRST confirm the target file has no local modifications (`git status --porcelain lib/sync/runOnboardingScan.ts` must print nothing — if it does not, stop and resolve before mutating). Then temporarily rename `drive_file_id` → `driveFileId` inside the `LIVE_ROW_CONFLICT` context (NOT the sibling `logSync` payload above it), run the meta-test, and confirm the `LIVE_ROW_CONFLICT` row FAILS. Restore by applying the exact reverse edit (`driveFileId` → `drive_file_id` at the same spot), re-run to green, and confirm `git status --porcelain lib/sync/runOnboardingScan.ts` is again empty. Record the result in the handoff doc.

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm typecheck`
Expected: clean.

```bash
git add lib/adminAlerts/alertActions.ts tests/adminAlerts/alertActions.test.ts tests/messages/_metaAlertActionsContract.test.ts
git commit --no-verify -m "feat(admin): per-code alert action registry, unit tests, structural meta-test"
```

**Meta-test file** (written verbatim in Step 2):

```ts
// tests/messages/_metaAlertActionsContract.test.ts
/**
 * Structural contract for the alert action registry
 * (spec docs/superpowers/specs/2026-07-04-alert-action-links.md §6).
 *
 * 1. Raise-site fidelity: every context field a builder consumes appears at
 *    that code's OWN raise expression (code literal and field in one bounded
 *    regex match — a whole-file grep would keep passing off a sibling log
 *    payload, e.g. lib/sync/runOnboardingScan.ts logSync at :824-829).
 * 2. Show-scoping pins: the three slug-dependent codes render only because
 *    their producers raise show-scoped rows; a showId: null refactor would
 *    silently kill the link while fixture-slug unit tests stay green.
 * 3. Target fidelity: the #share-access anchor and the /admin/onboarding
 *    route the internal links point at must exist on disk.
 * 4. Registry parity: exactly the spec's 9 codes, all members of the 42-code
 *    ADMIN_ALERTS_CODES universe.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ALERT_ACTIONS, ALERT_ACTION_CODES } from "@/lib/adminAlerts/alertActions";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

type RaiseSitePin = {
  code: string;
  file: string;
  pattern: RegExp; // MUST carry the g flag (matchAll requirement)
  expectedMatches: number;
  pins: string; // what property this row pins (for the test name)
};

const RAISE_SITE_PINS: RaiseSitePin[] = [
  {
    code: "ROLE_FLAGS_NOTICE",
    file: "lib/sync/phase2.ts",
    // `as const` anchors the CONSTRUCTOR (:422-431) — the bare literal also
    // matches the roleFlagsNotice TYPE definition at :120-127 (2 matches).
    pattern: /code: "ROLE_FLAGS_NOTICE" as const,[\s\S]{0,160}?context: \{[\s\S]{0,60}?drive_file_id:/g,
    expectedMatches: 1,
    pins: "drive_file_id enters the notice context at the constructor",
  },
  {
    code: "ROLE_FLAGS_NOTICE",
    file: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(result\.roleFlagsNotice\)/g,
    expectedMatches: 1,
    pins: "cron write boundary persists the constructed notice",
  },
  {
    code: "ROLE_FLAGS_NOTICE",
    file: "lib/sync/applyStaged.ts",
    pattern: /upsertAdminAlert\(result\.roleFlagsNotice\)/g,
    expectedMatches: 1,
    pins: "staged-apply write boundary persists the constructed notice",
  },
  {
    code: "LIVE_ROW_CONFLICT",
    file: "lib/sync/runOnboardingScan.ts",
    pattern:
      /code: LIVE_ROW_CONFLICT[\s\S]{0,300}?context: \{[\s\S]{0,160}?drive_file_id:[\s\S]{0,160}?folder_id:/g,
    expectedMatches: 1,
    pins: "drive_file_id + folder_id in the alert context (not the sibling logSync payload)",
  },
  {
    code: "REPORT_ORPHANED_LOST_LEASE",
    file: "lib/reports/submit.ts",
    pattern: /REPORT_ORPHANED_LOST_LEASE[\s\S]{0,700}?orphan_url:/g,
    expectedMatches: 1,
    pins: "orphan_url in the raw-INSERT context jsonb",
  },
  {
    code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    file: "scripts/verify-branch-protection.ts",
    pattern: /repo,[\s\S]{0,260}?p_code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED"/g,
    expectedMatches: 3,
    pins: "repo in the context of ALL THREE auth-failure producer branches",
  },
  {
    code: "BRANCH_PROTECTION_DRIFT",
    file: "scripts/verify-branch-protection.ts",
    pattern: /\{ failures, repo, ts[\s\S]{0,260}?p_code: "BRANCH_PROTECTION_DRIFT"/g,
    expectedMatches: 1,
    pins: "repo in the drift context",
  },
  {
    code: "SHOW_FIRST_PUBLISHED",
    file: "lib/sync/runScheduledCronSync.ts",
    pattern: /showId: args\.result\.showId,[\s\S]{0,60}?code: "SHOW_FIRST_PUBLISHED"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (slug-dependent link)",
  },
  {
    code: "PICKER_EPOCH_RESET",
    file: "lib/auth/picker/resetPickerEpoch.ts",
    pattern: /showId: input\.showId,[\s\S]{0,60}?code: "PICKER_EPOCH_RESET"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (slug-dependent link)",
  },
  {
    code: "PICKER_SELECTION_RACE",
    file: "lib/auth/picker/cleanupStaleEntry.ts",
    pattern: /showId: input\.showId,[\s\S]{0,60}?code: "PICKER_SELECTION_RACE"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (slug-dependent link)",
  },
];

describe("alert-action registry ↔ raise-site fidelity", () => {
  test.each(RAISE_SITE_PINS)("$code — $pins ($file)", ({ file, pattern, expectedMatches }) => {
    const matches = Array.from(read(file).matchAll(pattern));
    expect(matches).toHaveLength(expectedMatches);
  });
});

describe("alert-action internal link targets exist", () => {
  test('the #share-access anchor exists on the show page (spec §4 #1-#3)', () => {
    expect(read("app/admin/show/[slug]/page.tsx")).toMatch(/id="share-access"/);
  });
  test("the onboarding wizard route exists (spec §4 #6)", () => {
    expect(existsSync(join(ROOT, "app/admin/onboarding/page.tsx"))).toBe(true);
  });
});

describe("alert-action registry parity (spec §6.3)", () => {
  const SPEC_CODES = [
    "BRANCH_PROTECTION_DRIFT",
    "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    "LIVE_ROW_CONFLICT",
    "PICKER_EPOCH_RESET",
    "PICKER_SELECTION_RACE",
    "REPORT_ORPHANED_LOST_LEASE",
    "ROLE_FLAGS_NOTICE",
    "SHOW_FIRST_PUBLISHED",
    "WIZARD_SESSION_SUPERSEDED_RACE",
  ];
  test("registry keys equal exactly the spec's 9 codes", () => {
    expect(Object.keys(ALERT_ACTIONS).sort()).toEqual(SPEC_CODES);
    expect([...ALERT_ACTION_CODES].sort()).toEqual(SPEC_CODES);
  });
  test("every registry key is in the 42-code ADMIN_ALERTS_CODES universe", () => {
    // Parse the sibling meta-test's source — do NOT import it (its top level
    // registers tests; importing would re-register them in this suite).
    // noUncheckedIndexedAccess: index accesses stay string | undefined, so
    // narrow via ?? "" after the runtime assertion.
    const source = read("tests/messages/_metaAdminAlertCatalog.test.ts");
    const block = source.match(/const ADMIN_ALERTS_CODES = \[([\s\S]*?)\] as const;/);
    const body = block?.[1] ?? "";
    expect(body.length).toBeGreaterThan(0);
    const universe = new Set(
      Array.from(body.matchAll(/"([A-Z0-9_]+)"/g), (m) => m[1] ?? ""),
    );
    for (const code of ALERT_ACTION_CODES) {
      expect(universe.has(code), `${code} missing from ADMIN_ALERTS_CODES`).toBe(true);
    }
  });
});
```

---

### Task 2: PerShowAlertSection renders the action link

**Files:**
- Modify: `components/admin/PerShowAlertSection.tsx` (row render region ~:231-283; place the link directly after `HelpAffordance` at ~:248-251)
- Test: `tests/components/admin/perShowAlertActionLink.test.tsx`

**Interfaces:**
- Consumes: `resolveAlertAction` (Task 1); the component's existing `AdminAlertRow` (`id/code/context/raised_at`, :42-47) and `slug` prop (:49-54).
- Produces: `data-testid={\`per-show-alert-action-${alert.id}\`}` anchor, present only when the action resolves.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/perShowAlertActionLink.test.tsx
// @vitest-environment jsdom
/**
 * Per-show alert rows render the per-code action link (spec §7.1, §8.3).
 * Failure modes caught: missing/wrong href from a context refactor; the
 * external target/rel treatment dropped; a link rendering despite a failed
 * guard (incl. the javascript: orphan_url case asserted against the DOM —
 * catches a component path that bypasses resolveAlertAction).
 * Anti-tautology: every query is scoped WITHIN the row's own testid subtree
 * and every expected href is derived from the fixture's field values.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const rows = vi.hoisted(() => ({
  value: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from() {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = pass;
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) =>
        onf({ data: rows.value, error: null });
      return builder;
    },
  }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-07-04T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/east-coast",
}));

afterEach(() => {
  cleanup();
  vi.resetModules();
});

async function renderSection(slug = "east-coast") {
  const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
  render(await PerShowAlertSection({ showId: "s1", slug }));
}

describe("PerShowAlertSection action links", () => {
  it("ROLE_FLAGS_NOTICE with drive_file_id renders an external sheet link", async () => {
    const drive_file_id = "df-123";
    rows.value = [
      {
        id: "a1",
        code: "ROLE_FLAGS_NOTICE",
        context: { drive_file_id, changes: [] },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const row = screen.getByTestId("per-show-alert-a1");
    const link = within(row).getByTestId("per-show-alert-action-a1");
    expect(link).toHaveAttribute(
      "href",
      `https://docs.google.com/spreadsheets/d/${drive_file_id}/edit#gid=0`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toContain("Open in Sheet");
  });

  it("ROLE_FLAGS_NOTICE without drive_file_id renders no action link", async () => {
    rows.value = [
      { id: "a2", code: "ROLE_FLAGS_NOTICE", context: { changes: [] }, raised_at: "2026-07-04T10:00:00.000Z" },
    ];
    await renderSection();
    const row = screen.getByTestId("per-show-alert-a2");
    expect(within(row).queryByTestId("per-show-alert-action-a2")).toBeNull();
  });

  it("SHOW_FIRST_PUBLISHED renders the internal share-access fragment link (no target)", async () => {
    const slug = "east-coast";
    rows.value = [
      {
        id: "a3",
        code: "SHOW_FIRST_PUBLISHED",
        context: { sheet_name: "Acme" },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection(slug);
    const row = screen.getByTestId("per-show-alert-a3");
    const link = within(row).getByTestId("per-show-alert-action-a3");
    expect(link).toHaveAttribute("href", `/admin/show/${encodeURIComponent(slug)}#share-access`);
    expect(link).not.toHaveAttribute("target");
    expect(link.textContent).toContain("Go to Published toggle");
  });

  it("show-scoped REPORT_ORPHANED_LOST_LEASE renders the GitHub link; javascript: URL renders nothing", async () => {
    const orphan_url = "https://github.com/edweiss412/FX-Webpage-Template/issues/99";
    rows.value = [
      {
        id: "a4",
        code: "REPORT_ORPHANED_LOST_LEASE",
        context: { orphan_url },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const good = screen.getByTestId("per-show-alert-a4");
    expect(within(good).getByTestId("per-show-alert-action-a4")).toHaveAttribute(
      "href",
      orphan_url,
    );
    cleanup();
    vi.resetModules();

    rows.value = [
      {
        id: "a5",
        code: "REPORT_ORPHANED_LOST_LEASE",
        context: { orphan_url: "javascript:alert(1)" },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const bad = screen.getByTestId("per-show-alert-a5");
    expect(within(bad).queryByTestId("per-show-alert-action-a5")).toBeNull();
    // Belt-and-suspenders against ANY sibling path rendering the raw URL:
    for (const a of Array.from(bad.querySelectorAll("a"))) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/perShowAlertActionLink.test.tsx`
Expected: FAIL — `per-show-alert-action-*` testids not found (the ROLE_FLAGS_NOTICE/REPORT rows render, but no action anchor exists yet).

- [ ] **Step 3: Implement the row link**

In `components/admin/PerShowAlertSection.tsx`:

1. Add the import:

```ts
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";
```

2. Inside the row `.map()`, next to the existing `failedKeys`/`dataGapsDigest` per-row derivations (~:219-230), add:

```ts
const action = resolveAlertAction(alert.code, alert.context, { slug });
```

3. Directly AFTER the `<HelpAffordance …/>` element (~:248-251) and BEFORE the `failedKeys` block, add:

```tsx
{/* Per-code action link (spec 2026-07-04-alert-action-links §7.1). Fail-quiet:
    resolveAlertAction returns null for unregistered codes or failed guards. */}
{action ? (
  <a
    href={action.href}
    data-testid={`per-show-alert-action-${alert.id}`}
    {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
  >
    {action.label}
    {action.external ? <span aria-hidden="true"> ↗</span> : null}
  </a>
) : null}
```

(Class list is the established quiet-link affordance from `components/admin/PerShowActionableWarnings.tsx:98`, minus its local `linkOffsetClass`.)

- [ ] **Step 4: Run the new test + the existing PerShowAlertSection suites**

Run: `pnpm vitest run tests/components/admin/perShowAlertActionLink.test.tsx tests/components/admin/perShowAlertDataGaps.test.tsx tests/components/admin/perShowAlertFailedKeys.test.tsx tests/components/admin/perShowAlertInterpolation.test.tsx tests/components/admin/PerShowAlertResolveButton.test.tsx`
Expected: ALL PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add components/admin/PerShowAlertSection.tsx tests/components/admin/perShowAlertActionLink.test.tsx
git commit --no-verify -m "feat(admin): per-code action links in per-show alert rows"
```

---

### Task 3: AlertBanner renders the action link for global rows

**Files:**
- Modify: `components/admin/AlertBanner.tsx` (compute after `isWatchAlert` at :228; render inside the action slot `div[data-testid="admin-alert-action"]` at :454, as a sibling BEFORE the branch ternary)
- Test: `tests/components/admin/alertBannerActionLink.test.tsx`

**Interfaces:**
- Consumes: `resolveAlertAction` (Task 1); banner locals `alert` (`AlertRow`, :46-59 — `context` is in the SELECT at :117), `showSlug`, `isPerShowAlert` (:212), `isWatchAlert` (:228).
- Produces: `data-testid="admin-alert-action-link"` anchor, global non-watch rows only.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/alertBannerActionLink.test.tsx
// @vitest-environment jsdom
/**
 * AlertBanner renders the per-code action link for GLOBAL rows only
 * (spec §7.2, §8.4 — rendering-split rule, decision #3).
 * Failure modes caught: the LIVE_ROW_CONFLICT folder-fallback regression;
 * the split rule regressing (double navigation affordances on per-show
 * rows); a component path that bypasses resolveAlertAction and renders
 * context.orphan_url verbatim into href.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/admin/alertCount", () => ({
  fetchUnresolvedAlertCount: async () => ({ kind: "ok", count: 1 }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-07-04T12:00:00.000Z") }));
// AlertBanner wraps rendered content in AlertBannerRouteBoundary, whose client
// hook calls useSearchParams() — the mock MUST provide it (the repo pattern,
// cf. tests/components/admin/AlertBannerRouteBoundary.test.tsx:10-14).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

const rows = vi.hoisted(() => ({
  value: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const builder: Record<string, unknown> = {};
    const pass = () => builder;
    builder.select = pass;
    builder.is = pass;
    builder.not = pass;
    builder.order = pass;
    builder.limit = () => Promise.resolve({ data: rows.value, error: null });
    return { from: () => builder };
  },
}));

afterEach(() => {
  cleanup();
  vi.resetModules();
});

function globalRow(code: string, context: Record<string, unknown> | null) {
  return {
    id: "g1",
    code,
    raised_at: "2026-07-04T10:00:00.000Z",
    show_id: null,
    context,
    occurrence_count: 1,
    shows: null,
  };
}

async function renderBanner() {
  const { AlertBanner } = await import("@/components/admin/AlertBanner");
  return render(await AlertBanner());
}

describe("AlertBanner global action links", () => {
  it("global LIVE_ROW_CONFLICT with only folder_id renders the Drive-folder fallback link AND keeps the Mark-resolved form", async () => {
    const folder_id = "fold-9";
    rows.value = [globalRow("LIVE_ROW_CONFLICT", { folder_id })];
    const { getByTestId } = await renderBanner();
    const link = getByTestId("admin-alert-action-link");
    expect(link).toHaveAttribute(
      "href",
      `https://drive.google.com/drive/folders/${encodeURIComponent(folder_id)}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toContain("Open Drive folder");
    // Spec §7.2: the link is a SIBLING BEFORE the Mark-resolved form — a
    // broken `actionLink ? <a> : <form>` implementation must fail here.
    const idInput = getByTestId("admin-alert-id-input");
    expect(idInput).toBeInTheDocument();
    expect(
      link.compareDocumentPosition(idInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("per-show row with a registered code renders Check it and NO action link (split rule)", async () => {
    rows.value = [
      {
        id: "p1",
        code: "PICKER_EPOCH_RESET",
        raised_at: "2026-07-04T10:00:00.000Z",
        show_id: "s1",
        context: { show_id: "s1" },
        occurrence_count: 1,
        shows: { slug: "east-coast" },
      },
    ];
    const { getByTestId, queryByTestId } = await renderBanner();
    expect(getByTestId("admin-alert-show-link")).toBeInTheDocument();
    expect(queryByTestId("admin-alert-action-link")).toBeNull();
  });

  it("global row with an unregistered code renders no action link", async () => {
    rows.value = [globalRow("GITHUB_BOT_LOGIN_MISSING", { reason: "x" })];
    const { queryByTestId } = await renderBanner();
    expect(queryByTestId("admin-alert-action-link")).toBeNull();
  });

  it("global WIZARD_SESSION_SUPERSEDED_RACE renders an INTERNAL link — no target/rel/icon", async () => {
    rows.value = [globalRow("WIZARD_SESSION_SUPERSEDED_RACE", { drive_file_id: "df-1" })];
    const { getByTestId } = await renderBanner();
    const link = getByTestId("admin-alert-action-link");
    expect(link).toHaveAttribute("href", "/admin/onboarding");
    // Spec §2 decision 4: internal links get NO external treatment — an
    // implementation that unconditionally adds target/_blank/↗ must fail here.
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("rel");
    expect(link.textContent).toContain("Go to setup wizard");
    expect(link.textContent).not.toContain("↗");
  });

  it("global REPORT_ORPHANED_LOST_LEASE: valid URL renders verbatim; javascript: renders NO anchor", async () => {
    const orphan_url = "https://github.com/edweiss412/FX-Webpage-Template/issues/99";
    rows.value = [globalRow("REPORT_ORPHANED_LOST_LEASE", { orphan_url })];
    let result = await renderBanner();
    expect(result.getByTestId("admin-alert-action-link")).toHaveAttribute("href", orphan_url);
    // Resolve form coexists with the link (spec §7.2 sibling rule).
    expect(result.getByTestId("admin-alert-id-input")).toBeInTheDocument();
    cleanup();
    vi.resetModules();

    rows.value = [globalRow("REPORT_ORPHANED_LOST_LEASE", { orphan_url: "javascript:alert(1)" })];
    result = await renderBanner();
    expect(result.queryByTestId("admin-alert-action-link")).toBeNull();
    for (const a of Array.from(result.container.querySelectorAll("a"))) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/alertBannerActionLink.test.tsx`
Expected: FAIL — `admin-alert-action-link` not found (cases 1 and 4a).

- [ ] **Step 3: Implement the banner link**

In `components/admin/AlertBanner.tsx`:

1. Add the import:

```ts
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";
```

2. After `const isWatchAlert = …` (:228), add:

```ts
// Per-code action link (spec 2026-07-04-alert-action-links §7.2): GLOBAL
// non-watch rows only — per-show rows keep "Check it" as their single
// navigation (the action link renders on the show page after click-through).
const actionLink =
  !isPerShowAlert && !isWatchAlert
    ? resolveAlertAction(alert.code, alert.context, { slug: showSlug })
    : null;
```

3. Inside the action slot `<div data-testid="admin-alert-action" …>` (:453-456), add as the FIRST child, before the `{isPerShowAlert ? … : isWatchAlert ? … : …}` ternary (do NOT touch the ternary or the resolve `<form>` — the slot-integrity rule pins the button-form pairing, comment at :475-480):

```tsx
{actionLink ? (
  <a
    href={actionLink.href}
    data-testid="admin-alert-action-link"
    {...(actionLink.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 py-2 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
  >
    {actionLink.label}
    {actionLink.external ? <span aria-hidden="true"> ↗</span> : null}
  </a>
) : null}
```

(Class list copies the "Check it" affordance at :462 verbatim.)

- [ ] **Step 4: Run the new test + banner contract suites**

Run: `pnpm vitest run tests/components/admin/alertBannerActionLink.test.tsx tests/components/admin/_metaAlertBannerContract.test.ts tests/components/admin/alertBannerDetailFailVisible.test.tsx tests/components/admin/AlertBannerRouteBoundary.test.tsx`
Expected: ALL PASS (the slot-integrity contract must stay green with the new sibling).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add components/admin/AlertBanner.tsx tests/components/admin/alertBannerActionLink.test.tsx
git commit --no-verify -m "feat(admin): per-code action links for global alerts in the banner"
```

---

### Close-out (Stage 3→4 gates, run by the orchestrator — NOT a TDD task: no product code changes, only verification and pipeline bookkeeping; AGENTS invariant 1 governs tasks that produce implementation, which ends with Task 3)

1. **Full-suite sweep:** `pnpm vitest run` — green (same pass/fail set as the merge-base; if a failure appears, verify it exists at `origin/main` before diagnosing). Then `pnpm typecheck && pnpm format:check`; if format:check flags the new/edited files, `pnpm prettier --write <files>` in a `chore(admin): prettier` commit. NEVER run prettier on `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`.
2. **Handoff doc:** write `docs/superpowers/plans/2026-07-04-alert-action-links/handoff.md` recording the task→commit map, test evidence (suite counts), the meta-test's negative-verification result (Task 1 step 6), and a §12 placeholder for impeccable dispositions. Commit as `docs(handoff): alert-action-links implementation handoff`.
3. **Impeccable dual-gate** (invariant 8): `/impeccable critique` AND `/impeccable audit` on the diff to `components/admin/PerShowAlertSection.tsx` + `components/admin/AlertBanner.tsx`. HIGH/CRITICAL findings fixed or DEFERRED.md'd BEFORE Codex review. Dispositions → handoff §12.
4. **Whole-diff Codex adversarial review** (fresh-eyes, REVIEWER ONLY) to APPROVE.
5. Fetch + rebase onto latest `origin/main`, re-run affected suites, push, open PR, real CI green (check `mergeStateStatus == CLEAN`, pass PR number to `gh pr checks --watch`), `gh pr merge --merge`, fast-forward local main (`rev-list --left-right --count main...origin/main` → `0  0`).
