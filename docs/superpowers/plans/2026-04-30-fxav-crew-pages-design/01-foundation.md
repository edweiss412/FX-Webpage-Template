# Milestone 0 — Repository bootstrap, tooling, env

> Part of [the FXAV crew pages design plan](README.md).

Spec context: §14 (tech stack & directory layout). Not a §15 milestone but required scaffolding.

### Task 0.1: Initialize Next.js 16 + pnpm + tsconfig

**Files:** Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `pnpm-workspace.yaml` (if needed), `.gitignore` augmentation.

- [x] **Step 1: Verify pnpm version**

  ```bash
  pnpm --version
  ```

  Expected: `>= 9.0.0`. Install/upgrade if missing.

- [x] **Step 2: Initialize Next.js**

  ```bash
  pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack --skip-install
  ```

  Expected: scaffolded `app/`, `package.json`, `tsconfig.json`. Answer "no" to "would you like to use src directory" (the spec uses `app/` at root).

- [x] **Step 3: Pin Next.js 16, install dependencies**
      Edit `package.json` to set `"next": "16.0.0"` exactly. Then:

  ```bash
  pnpm install
  pnpm add googleapis @octokit/rest @supabase/supabase-js @supabase/ssr jose pdfjs-dist @sentry/nextjs zod
  pnpm add -D vitest @testing-library/react @testing-library/jest-dom @vitest/ui jsdom @playwright/test prettier eslint-config-prettier
  ```

  Expected: lockfile written; no peer-dep errors.

- [x] **Step 4: Add tsconfig strictness**
      Edit `tsconfig.json` to add:

  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "exactOptionalPropertyTypes": true,
      "noImplicitOverride": true,
      "useUnknownInCatchVariables": true
    }
  }
  ```

- [x] **Step 5: Verify build runs**

  ```bash
  pnpm build
  ```

  Expected: builds the Next.js scaffold cleanly.

- [x] **Step 6: Commit**
  ```bash
  git add package.json pnpm-lock.yaml tsconfig.json next.config.mjs app/
  git commit -m "infra: initialize Next.js 16 + TypeScript strict + dependencies"
  ```

### Task 0.2: Configure Vitest

**Files:** Create: `vitest.config.ts`, `tests/setup.ts`, `tests/sample.test.ts`. Modify: `package.json` (test script).

- [x] **Step 1: Write a sample failing test**
      Create `tests/sample.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  describe('sample', => {
    it('runs vitest', => {
      expect(1 + 1).toBe(2);
    });
  });
  ```

  And `vitest.config.ts`:

  ```ts
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: {
      environment: "node",
      globals: false,
      include: ["tests/**/*.test.ts"],
      setupFiles: ["tests/setup.ts"],
    },
    resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
  });
  ```

  And empty `tests/setup.ts`.

- [x] **Step 2: Add test script** Edit `package.json`:

  ```json
  { "scripts": { "test": "vitest run", "test:watch": "vitest" } }
  ```

- [x] **Step 3: Run** `pnpm test` — expect PASS.

- [x] **Step 4: Commit**
  ```bash
  git add vitest.config.ts tests/ package.json
  git commit -m "infra: configure vitest"
  ```

### Task 0.3: Configure Playwright

**Files:** Create: `playwright.config.ts`, `tests/e2e/sample.spec.ts`.

- [x] **Step 1: Initialize Playwright**
  ```bash
  pnpm exec playwright install --with-deps chromium webkit
  ```
- [x] **Step 2: Write `playwright.config.ts`**
  ```ts
  import { defineConfig, devices } from "@playwright/test";
  export default defineConfig({
    testDir: "tests/e2e",
    timeout: 30_000,
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    use: {
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      trace: "on-first-retry",
      viewport: { width: 390, height: 844 }, // mobile-primary per §8.4
    },
    projects: [
      {
        name: "mobile-safari",
        use: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } },
      }, // explicit override per §8.4 — the iPhone 14 device descriptor has its own 390×664 viewport that would otherwise mask the top-level setting
      {
        name: "desktop-chromium",
        use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      },
    ],
    webServer: {
      command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: process.env.CI ? 120_000 : 60_000,
    },
  });
  ```
- [x] **Step 3: Sample e2e test** at `tests/e2e/sample.spec.ts`:
  ```ts
  import { test, expect } from "@playwright/test";
  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.*/);
  });
  ```
- [x] **Step 4: Add scripts** in `package.json`:
  ```json
  { "scripts": { "test:e2e": "playwright test", "test:e2e:ui": "playwright test --ui" } }
  ```
- [x] **Step 5: Run** `pnpm test:e2e --project=mobile-safari` and confirm pass.
- [x] **Step 6: Commit**
  ```bash
  git add playwright.config.ts tests/e2e/ package.json
  git commit -m "infra: configure playwright"
  ```

### Task 0.4: Local Supabase + env template

**Files:** Create: `.env.local.example`, `supabase/config.toml`, `supabase/.gitignore`. Modify: `.gitignore`.

- [x] **Step 1: Initialize Supabase**
  ```bash
  pnpm dlx supabase@latest init
  ```
  Expected: `supabase/` directory created.
- [x] **Step 2: Author `.env.local.example`** — every var listed in spec §14.3, no real secrets:
  ```
  # Supabase
  SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
  SUPABASE_SECRET_KEY=
  # Google
  GOOGLE_SERVICE_ACCOUNT_JSON=
  # Auth
  JWT_SIGNING_SECRET=
  # GitHub
  GITHUB_API_TOKEN=
  GITHUB_REPO=edweiss412/FX-Webpage-Template
  # the GitHub username the PAT belongs to; required for /api/report recovery (Task 8.3d)
  GITHUB_BOT_LOGIN=
  # Sentry
  SENTRY_DSN=
  # Admin allowlist (comma-sep)
  ADMIN_EMAILS=dlarson@fxav.net,edweiss412@gmail.com
  # Webhook
  DRIVE_WEBHOOK_PUBLIC_URL=
  # NB: WATCHED_DRIVE_FOLDER_ID is NOT an env var — see §14.3 / §4.5.
  ```
- [x] **Step 3: Add `.env*.local`** to `.gitignore`. _(Pre-satisfied — entries already present at base SHA from earlier commit; no additional change needed in M0.)_
- [x] **Step 4: Verify local Supabase boots**
  ```bash
  pnpm dlx supabase@latest start
  ```
  Expected: `API URL`, `anon key`, `service_role key` printed.
- [x] **Step 5: Stop and commit**
  ```bash
  pnpm dlx supabase@latest stop
  git add .env.local.example .gitignore supabase/
  git commit -m "infra: supabase local dev + env template"
  ```

### Task 0.5: Tailwind v4 base + design tokens placeholder

Spec context: §14.1 (Tailwind v4 + tokens established by the impeccable v3 design-context flow).

**Files:** Modify: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`. (Tailwind v4 has no `tailwind.config.ts`; theming lives in CSS via `@theme` — but no tokens are established in M0. `app/page.tsx` is included because the scaffolder home page references token-dependent classes that no longer compile after Step 1.)

- [x] **Step 1: Reduce `app/globals.css` to bare `@import "tailwindcss"`.** The Next.js scaffolder ships pre-established color/font/dark-mode tokens in this file; strip them so Task 4.1 has a clean slate. Also strip the Geist font imports from `app/layout.tsx` (fonts are design tokens that Task 4.1 owns), and replace the scaffolder's `app/page.tsx` (which uses `bg-foreground`/`text-background` token classes) with a minimal stub using only built-in Tailwind utilities — the home page is fully replaced in M4.
- [x] **Step 2: Verify `PRODUCT.md` is present** at repo root (strategic design context — users, brand, principles). It was established by the impeccable v3 design-context flow ahead of foundation work and is committed at `848fd4f`. Until `DESIGN.md` is created in Task 4.1, components MUST NOT establish color, spacing, font, or radius tokens — those decisions are blocked on Task 4.1's design-token extraction pass.
- [x] **Step 3: Commit**
  ```bash
  git add app/globals.css app/layout.tsx app/page.tsx
  git commit -m "infra: tailwind v4 base"
  ```

### Task 0.6: ESLint + Prettier + lint-staged

**Files:** Create: `.prettierrc`, `.prettierignore`, `.eslintrc.json`. Modify: `package.json`.

- [x] **Step 1: `.prettierrc`** — opinionated defaults (single quotes, semi, 100-col, trailing comma all).
- [x] **Step 2: Update ESLint** to extend `next/core-web-vitals`, `next/typescript`, `prettier`.
- [x] **Step 3: Add scripts** `lint`, `format`, `typecheck` (`tsc --noEmit`) to `package.json`.
- [x] **Step 4: Run** `pnpm lint && pnpm typecheck` — expect pass.
- [x] **Step 5: Commit**.

---

<!-- Continue with Milestones 1-10, cross-cutting tasks, self-review, and adversarial review below. -->

# Milestone 1 — Parser standalone (AC-1.1..1.10)

Spec context: §6 entire section, §17.1 milestone 1. Demo: `pnpm test:parser` and see all 10 raw fixtures parse cleanly.

The parser is a pure function `parseSheet(markdown: string): ParseResult` with no DB, no Drive, no Next.js dependencies. Every field-extraction function lives in `lib/parser/` and is independently testable. Build the contract types first, then the version-detection skeleton, then per-block extractors test-first against fixtures, then minimum-invariant runner, then slug derivation.

### Task 1.1: ParseResult, ParseWarning, ParseError types

**Files:** Create: `lib/parser/types.ts`. Test: `tests/parser/types.test.ts` (just imports — types compile).

- [ ] **Step 1: Write the types** verbatim from spec §6.7 (`ParseResult`, `ParseWarning`, `ParseError`) plus the row types they reference. Includes: `ShowRow`, `CrewMemberRow`, `HotelReservationRow`, `RoomRow`, `TransportationRow`, `ContactRow`, `PullSheetCase`, `PullSheetItem`. Add explicit `kind` discriminators on `date_restriction` (`'explicit' | 'unknown_asterisk' | 'none'`) and `stage_restriction`.

  ```ts
  export type ParseWarning = {
    severity: "info" | "warn";
    code: string;
    message: string;
    blockRef?: { kind: string; index?: number };
    rawSnippet?: string;
  };
  export type ParseError = { code: string; message: string; blockRef?: { kind: string } };

  export type DateRestriction =
    | { kind: "explicit"; days: string[] }
    | { kind: "unknown_asterisk"; days: null }
    | { kind: "none" };
  export type StageRestriction =
    | { kind: "explicit"; stages: Array<"Load In" | "Set" | "Show" | "Strike" | "Load Out"> }
    | { kind: "none" };
  // canonical role vocabulary derived from the v4 role-master
  // enumeration at fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md:718-743.
  // Compound suffixes like "BO - V1" decompose into multiple flags ['BO','V1'],
  // NOT a composite single flag. The "GS"/"BO" prefix carries scope (which
  // room the crew member is staffed to); the renderer can use it for tile
  // filtering. Tokens documented in the role master MUST be accepted as
  // canonical and NOT emit UNKNOWN_ROLE_TOKEN warnings.
  export type RoleFlag =
    // Capability flags
    | "LEAD"
    | "A1"
    | "A2"
    | "V1"
    | "L1"
    // Room/scope flags (decomposed from "GS - A1" / "BO - V1" / "BO - LEAD")
    | "GS"
    | "BO"
    // Camera/video specialty flags
    | "CAM_OP"
    | "PTZ"
    | "LED"
    | "STREAM"
    | "GAV"
    // Floor/runner flags
    | "FLOATER"
    | "FLOOR"
    // Production-side roles
    | "SHOW_CALLER"
    | "GREEN_ROOM"
    | "OWNER"
    | "CONTENT_CREATION"
    // Restriction marker (paired with stage_restriction or unknown_asterisk)
    | "ONLY";

  export type CrewMemberRow = {
    name: string;
    email: string | null;
    phone: string | null;
    role: string; // raw display string from sheet
    role_flags: RoleFlag[]; // canonical atomic capability flags
    date_restriction: DateRestriction;
    stage_restriction: StageRestriction;
    flight_info: string | null;
  };

  export type ClientContactPerson = {
    name: string;
    email: string | null; // canonicalized per §4.1.1
    phone: string | null;
    officePhone?: string | null;
  };
  export type ClientContact = ClientContactPerson & { secondary?: ClientContactPerson | null };

  export type ShowRow = {
    title: string;
    client_label: string;
    client_contact: ClientContact | null;
    template_version: "v1" | "v2" | "v4";
    venue: {
      name: string;
      address: string;
      loadingDock?: string | null;
      googleLink?: string | null;
      notes?: string | null;
    } | null;
    dates: {
      travelIn: string | null;
      set: string | null;
      showDays: string[];
      travelOut: string | null;
    };
    // per-day work-phase mapping. Each entry maps a calendar date (ISO 'YYYY-MM-DD')
    // to the set of WorkPhases active on that day. Derived by the parser from shows.dates blocks AND
    // any per-day schedule rows that explicitly mark phase activity. PackListTile (Task 4.9) reads
    // this map directly via todayWorkPhases(show, today) — RightNowState alone is too coarse to
    // represent compound days like Show+Strike on the final show day.
    schedule_phases: Record<string, WorkPhase[]>; // keyed by ISO date; e.g., { '2026-04-15': ['Show','Strike'] }
    event_details: Record<string, string>;
    agenda_links: { label: string; fileId?: string; url?: string }[];
    coi_status: string | null;
  };

  // canonical work-phase enum used by ShowRow.schedule_phases AND viewer.stage_restriction.
  export type WorkPhase = "Load In" | "Set" | "Show" | "Strike" | "Load Out";

  export type HotelReservationRow = {
    ordinal: number; // 1..4 (cardinality cap §10)
    hotel_name: string | null;
    hotel_address: string | null;
    names: string[]; // raw "Names on Reservation" lines, each carries the verbatim text from the sheet
    confirmation_no: string | null;
    check_in: string | null; // ISO date 'YYYY-MM-DD' (or null if unparseable)
    check_out: string | null;
    notes: string | null;
  };

  export type RoomKind = "gs" | "breakout" | "additional";
  export type RoomRow = {
    kind: RoomKind;
    name: string;
    dimensions: string | null;
    floor: string | null;
    setup: string | null; // free-text per §6.5
    set_time: string | null;
    show_time: string | null;
    strike_time: string | null;
    audio: string | null; // free-text per §6.5
    video: string | null;
    lighting: string | null;
    scenic: string | null;
    power: string | null;
    digital_signage: string | null;
    other: string | null;
    notes: string | null;
  };

  // `assigned_names: string[]` is a CANONICAL part of every schedule entry. It threads
  // through parser → ParseResult → seed → Phase 2 persistence (`transportation.schedule` JSONB)
  // → getShowForViewer → TransportTile visibility (§8.1). NEVER omitted at any layer; empty array
  // when no tagged passengers / co-drivers. The TransportTile predicate is:
  // driver_name === viewer.name
  // || transportation.schedule.some(s => s.assigned_names.includes(viewer.name))
  export type TransportScheduleEntry = {
    stage: string;
    date: string | null;
    time: string | null;
    assigned_names: string[];
  };
  export type TransportationRow = {
    driver_name: string | null;
    driver_phone: string | null;
    driver_email: string | null; // canonicalized per §4.1.1
    vehicle: string | null;
    license_plate: string | null;
    color: string | null;
    parking: string | null;
    schedule: TransportScheduleEntry[];
    notes: string | null;
  };

  export type ContactKind = "venue" | "in_house_av";
  export type ContactRow = {
    kind: ContactKind;
    name: string | null;
    email: string | null; // canonicalized per §4.1.1
    phone: string | null;
    notes: string | null;
  };

  export type PullSheetItem = {
    qty: number | null;
    cat: string | null;
    subCat: string | null;
    item: string;
    rawSnippet?: string;
  };
  export type PullSheetCase = { caseLabel: string; items: PullSheetItem[] };

  // #4: split the parse-time output (no Drive pins, since the
  // pure markdown parser doesn't talk to Drive) from the sync-time enriched
  // shape (with pins, populated by the sync layer's Phase-1 enrichment step).
  // Earlier draft made `drive_modified_time` mandatory in the parse-time
  // type, which the standalone `parseSheet(markdown): ParseResult` literally
  // cannot produce.
  //
  // The pure parser emits `ParsedSheet`. The sync layer's Phase 1 enrichment
  // takes `ParsedSheet`, calls Drive APIs to pin reel + linked-folder items,
  // and produces `ParseResult` (the sync-ready shape consumed by Phase 2 /
  // Apply / asset_recovery). Tests for the parser test against `ParsedSheet`;
  // tests for sync test the enrichment step that produces `ParseResult` from
  // `ParsedSheet`.

  // Embedded image (DIAGRAMS-tab) — Phase-1 sync-enriched.
  // The `sheetsRevisionId` + `embeddedFingerprint` pair is the immutable approval
  // token used by Apply-time snapshotting AND `asset_recovery` to prove that
  // bytes being downloaded are still the bytes Doug approved. Without this pair,
  // recovery has no way to distinguish an in-place image replacement from the
  // approved bytes (objectId + sheet tab title can stay stable across edits).
  // **Fingerprint MUST be a byte-derived immutable token**: `base64url(SHA-256(<full image bytes from GET image.contentUrl>))`.
  // NOT an HTTP ETag (server-controlled, proxies/CDNs can rotate without bytes changing).
  // NOT a HEAD-derived token. NOT a positional/id hash. The same SHA-256(bytes) helper
  // runs at Phase-1 enrichment (Task 7.1), at Apply re-verify (Task 7.3), and at
  // asset_recovery re-verify (Task 7.4) — equal inputs produce equal outputs.
  // If `image.contentUrl` is absent or returns 4xx, enrichment sets
  // `embeddedFingerprint = null` AND marks the entry as restage-only (recovery of
  // that entry MUST fail closed, not fall back to a positional/id hash).
  // See Task 7.1 for capture, Task 7.4 for recovery.
  export type EmbeddedImageStub = {
    sheetTab: string; // resolved title via case-insensitive match (corpus has 'DIagrams' typo)
    objectId: string; // Sheets API object id
    mimeType: string;
    alt?: string;
    sheetsRevisionId: string; // spreadsheet headRevisionId at extraction time (immutable approval token)
    embeddedFingerprint: string | null; // base64url(SHA-256(<full image bytes>)). NOT an ETag. null forces restage-only recovery
    // per-entry recovery disposition. 'normal' allows asset_recovery retries;
    // 'restage_required' is set when embeddedFingerprint is null AND tells asset_recovery to skip
    // this entry entirely (a fresh sheet edit must mint new sheetsRevisionId + embeddedFingerprint
    // before recovery can attempt this entry again). See Task 7.4 for the recovery-side filter.
    recovery_disposition: "normal" | "restage_required";
    snapshotPath: null; // populated by sync layer at Apply time, NEVER by the parser
  };

  // Pure-markdown linked-folder item (Phase-0, no Drive call yet).
  // The pure parser only knows the linked-folder URL/folder id; per-item
  // enumeration + revision pinning happens in Phase 1 sync enrichment.
  export type LinkedFolderRef = {
    driveFolderId: string;
    driveFolderUrl: string;
  };

  // Sync-enriched linked-folder item (Phase-1).
  // The `headRevisionId` + `md5Checksum` pair is the immutable TOCTOU fence:
  // Apply downloads via `revisions.get(fileId, headRevisionId, alt='media')`
  // (preferred — exact bytes), or via `alt=media` then re-verifies md5 against
  // `md5Checksum` before persisting. `drive_modified_time` is informational only
  // and CANNOT be used as the sole approval fence.
  export type LinkedFolderItemStub = {
    driveFileId: string;
    mimeType: string;
    alt?: string;
    drive_modified_time: string; // ISO; informational, not a security fence
    headRevisionId: string; // immutable Drive revision token (per-revision)
    md5Checksum: string; // content hash for fallback verification
    snapshotPath: null;
  };

  // Pure-markdown reel (Phase-0, no Drive call).
  export type OpeningReelRef = {
    driveFileId: string;
  };

  // Sync-enriched reel (Phase-1, with full immutable pin tuple captured at enrichment time).
  // Reel pinning carries BOTH `drive_modified_time` (for §6.11.1 drift detection
  // human readability + Realtime invalidation logging) AND `headRevisionId` (for
  // immutable byte streaming via `revisions.get` from /api/asset/reel/[show]).
  // The route uses `headRevisionId` as its TOCTOU fence; `drive_modified_time`
  // alone is insufficient.
  export type OpeningReelPinned = {
    driveFileId: string;
    drive_modified_time: string; // ISO; for drift detection logging
    headRevisionId: string; // immutable revision token used by /api/asset/reel/[show] for byte streaming
  };

  // split parse-time stubs from persisted asset types so successful snapshots
  // are representable in the canonical contract. The stub types (EmbeddedImageStub /
  // LinkedFolderItemStub) hard-code `snapshotPath: null` because the parser/enrichment phase
  // never populates that field — it's set at Apply time. The persisted types widen `snapshotPath`
  // to `string | null` so PersistedDiagrams can represent both incomplete (null path) AND
  // complete (string path) state without ad-hoc `as any` casts.

  export type PersistedEmbeddedImage = Omit<EmbeddedImageStub, "snapshotPath"> & {
    snapshotPath: string | null; // populated by Apply; null indicates incomplete entry
  };

  export type PersistedLinkedFolderItem = Omit<LinkedFolderItemStub, "snapshotPath"> & {
    snapshotPath: string | null;
  };

  // Persisted shows.diagrams JSONB shape — the source of truth that asset_recovery
  // and asset routes read from. Includes per-Apply snapshot revision + status flag.
  // snapshot_status terminal-state expansion (see below).
  // top-level `linkedFolder` field per spec §4.1; entry types use
  // PersistedEmbeddedImage / PersistedLinkedFolderItem (with `snapshotPath: string | null`).
  export type PersistedDiagrams = {
    snapshot_revision_id: string; // fresh UUID per Apply
    snapshot_status:
      | "complete" // every entry has a non-null snapshotPath
      | "partial_failure" // ≥1 entry is null AND retryable (asset_recovery cron will retry)
      | "partial_failure_restage_required"; // ≥1 entry is null AND every remaining null entry has recovery_disposition='restage_required'. Cron's gate.mode logic (Task 6.3) MUST treat this as a SKIP. GC (Task 7.8) MUST suppress orphan deletion in this state, exactly like 'partial_failure'. The show converges only when a fresh sheet edit mints new sheetsRevisionId + embeddedFingerprint via Phase 2.
    linkedFolder: { driveFolderId: string; driveFolderUrl: string } | null; // top-level per spec §4.1
    embeddedImages: PersistedEmbeddedImage[]; // snapshotPath is string when populated; null for incomplete
    linkedFolderItems: PersistedLinkedFolderItem[];
  };

  // === Pure parser output (Task 1.11's parseSheet returns this) ===
  export type ParsedSheet = {
    show: ShowRow;
    crewMembers: CrewMemberRow[];
    hotelReservations: HotelReservationRow[];
    rooms: RoomRow[];
    transportation: TransportationRow | null;
    contacts: ContactRow[];
    pullSheet: PullSheetCase[] | null;
    diagrams: {
      linkedFolder: LinkedFolderRef | null; // URL only at parse time
      embeddedImages: []; // ALWAYS empty at parse time; sync layer fills via Sheets API
    };
    openingReel: OpeningReelRef | null; // driveFileId only at parse time
    raw_unrecognized: { block: string; key: string; value: string }[];
    warnings: ParseWarning[];
    hardErrors: ParseError[];
  };

  // === Sync-enriched output (consumed by Phase 2 / Apply / asset_recovery) ===
  // Produced by the sync layer's Phase-1 enrichment step (Tasks 6.x, 7.1, 7.2)
  // which takes a ParsedSheet, calls Drive/Sheets APIs to pin reel +
  // linked-folder items + extract embedded images, and emits this shape.
  export type ParseResult = {
    show: ShowRow;
    crewMembers: CrewMemberRow[];
    hotelReservations: HotelReservationRow[];
    rooms: RoomRow[];
    transportation: TransportationRow | null;
    contacts: ContactRow[];
    pullSheet: PullSheetCase[] | null;
    diagrams: {
      linkedFolder: LinkedFolderRef | null;
      embeddedImages: EmbeddedImageStub[]; // populated by Sheets API (Task 7.1)
      linkedFolderItems: LinkedFolderItemStub[]; // pinned at Phase 1 (Task 7.2)
    };
    openingReel: OpeningReelPinned | null; // pinned at Phase 1 enrichment
    raw_unrecognized: { block: string; key: string; value: string }[];
    warnings: ParseWarning[];
    hardErrors: ParseError[];
  };

  // Triggered-review item types (§6.8.2). Used by Task 1.12's runInvariants result
  // and consumed by sync Phase 1 + Apply endpoints.
  // includes asset-review items (DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE,
  // DIAGRAMS_EMBEDDED_NONE_FOUND, DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING, REEL_DRIFT_PENDING) that the
  // SYNC layer (NOT runInvariants) appends when Phase-1 enrichment surfaces drift/unavailability
  // against an existing show with approved assets. They share the union so
  // `pending_syncs.triggered_review_items` is a single homogeneous list and `applyStaged` can
  // iterate without splitting validation paths. MI-* items remain runInvariants-emitted;
  // asset-review items are sync-emitted; FIRST_SEEN_REVIEW / ONBOARDING_SCAN_REVIEW remain
  // Phase-1-orchestrator-emitted sentinels. / :
  // `DIAGRAMS_EMBEDDED_NONE_FOUND` is a SEPARATE variant from
  // `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE` — they have DISTINCT Apply contracts (the empty-tab
  // case is operator-confirmation that the gallery is intentionally empty and DOES mint a fresh
  // snapshot_revision_id with `embeddedImages = []`; the revisions-unavailable case is a
  // technical-failure recovery and does NOT mutate `shows.diagrams` at all — the prior approved
  // snapshot stays live with its existing `snapshot_revision_id`).
  export type TriggeredReviewItem =
    | { id: string; invariant: "FIRST_SEEN_REVIEW" | "ONBOARDING_SCAN_REVIEW" }
    | { id: string; invariant: "MI-6" | "MI-10" }
    | {
        id: string;
        invariant: "MI-7";
        section: "hotel_reservations" | "rooms" | "contacts" | "transportation";
        prior_count: number;
        new_count: number;
      }
    | {
        id: string;
        invariant: "MI-7b";
        section: "hotel_reservations" | "rooms" | "contacts";
        missingKey: string;
      }
    | { id: string; invariant: "MI-8"; field: "po" | "proposal" | "invoice" | "invoiceNotes" }
    | { id: string; invariant: "MI-8b"; prior: string | null; next: string | null }
    | {
        id: string;
        invariant: "MI-8c";
        mode: "collapse" | "ambiguous_format" | "halved" | "case_dropped";
        details?: string;
      }
    | {
        id: string;
        invariant: "MI-9";
        crew_name: string;
        prior_flags: RoleFlag[];
        new_flags: RoleFlag[];
      }
    | {
        id: string;
        invariant: "MI-11";
        crew_name: string;
        prior_email: string | null;
        new_email: string | null;
      }
    | { id: string; invariant: "MI-12"; removed_name: string; added_name: string; email: string }
    | { id: string; invariant: "MI-13"; removed_name: string; added_name: string }
    | { id: string; invariant: "MI-14"; removed_name: string; added_name: string }
    | {
        id: string;
        invariant: "MI-13-orphan-remove" | "MI-14-orphan-remove";
        removed_name: string;
        reason?: string;
      }
    | { id: string; invariant: "MI-13-orphan-add" | "MI-14-orphan-add"; added_name: string }
    // Asset-review items. Each one only ever has a single valid
    // reviewer action of `apply` (the operator confirms they accept the consequence; no
    // rename/independent variants apply). User-facing copy lives in §12.4. Apply contracts differ
    // per variant — see Task 6.11 enumeration and spec §6.11 / §6.8.2 for the per-variant effect.
    | { id: string; invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE"; spreadsheet_id: string } // Task 7.1: drive.revisions.list returned no usable revision token; technical-failure recovery; Apply does NOT mutate shows.diagrams (prior approved snapshot stays live; same snapshot_revision_id retained)
    | { id: string; invariant: "DIAGRAMS_EMBEDDED_NONE_FOUND"; spreadsheet_id: string } // Task 7.1: DIAGRAMS tab resolved but contains zero embedded objects + no linked-folder URL; operator-confirmation that gallery is intentionally empty; Apply DOES mutate shows.diagrams (mints fresh snapshot_revision_id, persists embeddedImages=[], snapshot_status='complete')
    | { id: string; invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING"; drift_count: number } // Task 7.2/7.3: linked-folder bytes mutated between stage and Apply; existing-show stage path
    | { id: string; invariant: "REEL_DRIFT_PENDING"; reel_drive_file_id: string }; // Task 7.7: reel headRevisionId/modtime drifted between stage and Apply; existing-show stage path

  export type InvariantOutcome =
    | { outcome: "pass" }
    | { outcome: "hard_fail"; failedCodes: string[]; messages: string[] }
    | { outcome: "stage"; triggeredItems: TriggeredReviewItem[] };
  ```

- [ ] **Step 2: typecheck test** — `pnpm typecheck`. Expect: pass.
- [ ] **Step 3: Commit**: ```bash
      git add lib/parser/types.ts
      git commit -m "feat(parser): ParseResult/ParseWarning/ParseError type contract"

  ```

  ```

### Task 1.2: Email canonicalization (§4.1.1, AC-1.6)

**Files:** Create: `lib/email/canonicalize.ts`. Test: `tests/parser/email.test.ts`.

- [ ] **Step 1: Failing test**
  ```ts
  import { describe, it, expect } from 'vitest';
  import { canonicalize, isCanonical } from '@/lib/email/canonicalize';
  describe('canonicalize email', => {
    it('lowercases and trims', => {
      expect(canonicalize(' Alice@FXAV.NET ')).toBe('alice@fxav.net');
    });
    it('passes already-canonical', => {
      expect(canonicalize('alice@fxav.net')).toBe('alice@fxav.net');
    });
    it('returns null for null/empty', => {
      expect(canonicalize(null)).toBeNull;
      expect(canonicalize('')).toBeNull;
    });
    it('isCanonical rejects mixed-case', => {
      expect(isCanonical('Alice@FXAV.NET')).toBe(false);
      expect(isCanonical('alice@fxav.net')).toBe(true);
    });
  });
  ```
- [ ] **Step 2: Run** `pnpm test tests/parser/email.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `lib/email/canonicalize.ts`:
  ```ts
  export function canonicalize(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const t = raw.trim.toLowerCase;
    return t.length === 0 ? null : t;
  }
  export function isCanonical(s: string): boolean {
    return s === s.trim.toLowerCase && s.length > 0;
  }
  ```
- [ ] **Step 4: Run** test — expect PASS.
- [ ] **Step 5: Commit** `feat(email): canonicalization helper (§4.1.1)`.

### Task 1.3: Field-alias loader and version-detection skeleton (§6.4)

**Files:** Create: `lib/parser/aliases.ts`, `lib/parser/schema.ts`. Test: `tests/parser/aliases.test.ts`, `tests/parser/schema.test.ts`.

- [ ] **Step 1: Failing test for aliases**
  ```ts
  import { resolveAlias, FIELD_ALIASES } from '@/lib/parser/aliases';
  it('resolves known typos', => {
    expect(resolveAlias('Hotal Contact Info')).toBe('venue.contact_info');
    expect(resolveAlias('DIagrams')).toBe('details.diagrams');
    expect(resolveAlias('Virtaul Audience')).toBe('details.virtual_audience');
  });
  it('case-insensitive', => {
    expect(resolveAlias('po#')).toBe('ops.po');
    expect(resolveAlias('PO#')).toBe('ops.po');
  });
  it('returns null for unknown', => {
    expect(resolveAlias('Sponsor Lounge Access')).toBeNull;
  });
  ```
- [ ] **Step 2: Implement** `lib/parser/aliases.ts`:
  ```ts
  export const FIELD_ALIASES: Record<string, string[]> = {
    "venue.contact_info": ["Hotel Contact Info", "Hotal Contact Info", "Venue Contact Info"],
    "details.diagrams": ["DIagrams", "Diagrams", "DIAGRAMS"],
    "details.virtual_audience": ["Virtual Audience", "Virtaul Audience"],
    "transport.driver": ["Driver", "Equipment Transporter"],
    "ops.po": ["PO#", "PO #"],
    // ...rest of §6.4 aliases
  };
  const REVERSE = Object.entries(FIELD_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((a) => [a.toLowerCase, canonical] as const),
  );
  const REVERSE_MAP = new Map(REVERSE);
  export function resolveAlias(label: string): string | null {
    return REVERSE_MAP.get(label.trim.toLowerCase) ?? null;
  }
  ```
- [ ] **Step 3: Failing test for version detection — fixture-grounded incl. typo-aware v2**

  ```ts
  import { detectVersion } from '@/lib/parser/schema';

  // v4 — verified against 2026-03-rpas-central-four-seasons.md (Contact Office row)
  it('v4 when Contact Office row present', => {
    const md = readFileSync('fixtures/shows/raw/2026-03-rpas-central-four-seasons.md', 'utf8');
    expect(detectVersion(md)).toBe('v4');
  });

  // #2: v2 detection MUST work against the only raw v2 fixture
  // (2025-03-dci-rpas-central.md), which has the typo "Hotal Contact Info"
  // at line 236 — NOT the canonical "Hotel Contact Info". Version detection
  // MUST honor the typo aliases from FIELD_ALIASES at detection time;
  // otherwise this fixture falls through to v1-fallback and the whole sheet
  // is parsed against the wrong field map (silently — MI-1 still passes).
  it('v2 when Hotel Contact Info row present (typo-aware) — regression', => {
    const md = readFileSync('fixtures/shows/raw/2025-03-dci-rpas-central.md', 'utf8');
    expect(detectVersion(md)).toBe('v2');
  });
  it('v2 when canonical "Hotel Contact Info" present', => {
    expect(detectVersion('| Hotel Contact Info | .. |')).toBe('v2');
  });
  it('v2 when typo "Hotal Contact Info" present', => {
    expect(detectVersion('| Hotal Contact Info | .. |')).toBe('v2');
  });

  // v1 fallback — reached by sheets with markdown table syntax but neither v2 nor v4 markers.
  // NOTE: 2024-05-east-coast-family-office.md contains "Hotal Contact Info" (typo of v2 marker)
  // and is correctly classified as v2, NOT v1. The v1 fallback is exercised by synthetic input.
  it('v1 fallback for sheet-shaped markdown with no v2/v4 markers', => {
    expect(detectVersion('| DATES | |\n| :---: | :---: |\n| Travel | 5/13/24 |')).toBe('v1');
  });

  // MI-1 hard-fail when no markers AND no v1-shape fallback signal
  it('returns null when no version markers + no fallback signal', => {
    expect(detectVersion('completely unrecognizable text')).toBeNull;
  });
  ```

- [ ] **Step 4: Implement** `lib/parser/schema.ts` with the version registry from §6.4 and a typo-aware detector. \*\*\*\* the detector MUST consult `FIELD_ALIASES` (Task 1.3 step 2) to resolve marker labels at detection time — `resolveAlias("Hotal Contact Info")` → `"venue.contact_info"` matches the v2 marker. The version-registry entries express markers as canonical aliases, not literal strings. Concrete shape:
  ```ts
  // Each version entry's `requires` is matched by walking every cell label
  // in the markdown, running it through `resolveAlias`, and checking if the
  // resolved canonical matches.
  const VERSIONS = [
    {
      id: "v4",
      requires: [
        { alias: "client.contact_office" /* "Contact Office" row */ },
        { block: "MAIN/SECONDARY" },
      ],
    },
    {
      id: "v2",
      requires: [
        {
          alias:
            "venue.contact_info" /* matches "Hotel" OR "Hotal" Contact Info via FIELD_ALIASES */,
        },
      ],
    },
    { id: "v1", fallback: true },
  ];
  ```
- [ ] **Step 5: Run tests, verify pass**.
- [ ] **Step 6: Commit** `feat(parser): field aliases + version detection (§6.4)`.

### Task 1.4: Parse client + venue blocks (§2.1, §2.2)

**Files:** Create: `lib/parser/blocks/client.ts`, `lib/parser/blocks/venue.ts`. Test: `tests/parser/blocks/client.test.ts`, `tests/parser/blocks/venue.test.ts`.

- [ ] **Step 1: Failing tests** drive parsing of the 2026-03 fixture's CLIENT and VENUE sections (lines 3–7 in `2026-03-rpas-central-four-seasons.md` for CLIENT MAIN/SECONDARY block; lines 40–44 for VENUE).
  ```ts
  import { parseClient } from '@/lib/parser/blocks/client';
  import { readFileSync } from 'node:fs';
  const md2026 = readFileSync('fixtures/shows/raw/2026-03-rpas-central-four-seasons.md', 'utf8');
  it('extracts MAIN/SECONDARY client contacts in v4', => {
    const r = parseClient(md2026, 'v4');
    expect(r.client_label).toBe('II');
    expect(r.client_contact?.name).toMatch(/.+/);
    expect(r.client_contact?.secondary?.name ?? null).toMatchObject({ /* .. */ }); // or null
  });
  ```
- [ ] **Step 2: Implement** the parsers using markdown-table row extraction (regex line walks, no AST library — the input is already markdown-table-shaped). Email values pass through `canonicalize`.
- [ ] **Step 3: Re-run** all 10 raw fixtures with assertion `r.client_label !== ''`.
- [ ] **Step 4: Commit** `feat(parser): client/venue block extraction`.

### Task 1.5: Parse dates block (§2.3, AC-1.2)

**Files:** Create: `lib/parser/blocks/dates.ts`. Test: `tests/parser/blocks/dates.test.ts`.

- [ ] **Step 1: Failing tests** — for each of the 10 raw fixtures, assert at least one of `travelIn`, `set`, `showDays[0]` parses to a non-null date string.
  ```ts
  const fixtures = ['2024-05-east-coast-family-office.md', /* ...all 10 */];
  for (const f of fixtures) {
    it(`${f} has parseable date`, => {
      const md = readFileSync(`fixtures/shows/raw/${f}`, 'utf8');
      const d = parseDates(md, detectVersion(md)!);
      expect([d.travelIn, d.set, d.showDays[0]].some(Boolean)).toBe(true);
    });
  }
  ```
- [ ] **Step 2: Implement** with date-format normalization (`6/25/25`, `6/25/2025`, `Wed 6/25/25` all → ISO `2025-06-25`). Renames `TRAVEL` → `travelIn`/`travelOut` per §2.3 evolution table.
- [ ] **Step 3: Run, verify pass for every fixture.**
- [ ] **Step 4: Commit** `feat(parser): dates block (§2.3)`.

### Task 1.6: Parse crew block + personalization signals (§2.4, §6.6, AC-1.2..1.5)

**Files:** Create: `lib/parser/blocks/crew.ts`, `lib/parser/personalization.ts`. Test: `tests/parser/blocks/crew.test.ts`.

This is the highest-stakes parser task — the personalization signals gate authorization downstream. Be explicit.

- [ ] **Step 1: Failing tests for day-restriction extraction (AC-1.3, AC-1.4) — fixture-grounded**

  ```ts
  import { parseCrew } from '@/lib/parser/blocks/crew';

  // Day restriction in NAME cell (pre-2026 dominant form)
  it('extracts explicit days from parens form (name cell)', => {
    const md = readFileSync('fixtures/shows/raw/2025-06-ria-investment-forum.md', 'utf8');
    const crew = parseCrew(md, 'v2');
    const calvin = crew.find(c => c.name.startsWith('Calvin'))!;
    expect(calvin.date_restriction).toEqual({ kind: 'explicit', days: ['6/24', '6/26'] });
    expect(calvin.name).toBe('Calvin Saller'); // parens stripped from display name
  });

  // #1a: day restriction in ROLE cell — verified against
  // 2025-04-asset-mgmt-cfo-coo.md:227 "Kari Rose" with role
  // "\- Load In / Set / Strike / Load Out (4/7 & 4/9 ONLY)".
  // The parser MUST scan the role cell for the same paren+ONLY pattern as
  // the name cell, because Doug uses both placements interchangeably across
  // the corpus.
  it('extracts day restriction from ROLE cell', => {
    const md = readFileSync('fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md', 'utf8');
    const crew = parseCrew(md, 'v2');
    const kari = crew.find(c => c.name === 'Kari Rose')!;
    expect(kari.date_restriction).toEqual({ kind: 'explicit', days: ['4/7', '4/9'] });
    // Display role keeps the verbatim cell minus the parenthetical, OR
    // preserves the entire string — choose one and stick with it; either
    // way the parsed `date_restriction` must be set.
  });

  // #1b: real Load-In/Set ONLY and Load-Out/Strike ONLY rows
  // — verified against 2025-10-fixed-income-trading-summit.md:30-31.
  it('extracts stage_restriction kind=explicit stages=["Load In","Set"] from "- Load In / Set ONLY" role', => {
    const md = readFileSync('fixtures/shows/raw/2025-10-fixed-income-trading-summit.md', 'utf8');
    const crew = parseCrew(md, 'v2');
    const maria = crew.find(c => c.name.startsWith('Maria Davila'))!;
    expect(maria.stage_restriction).toEqual({ kind: 'explicit', stages: ['Load In', 'Set'] });
    // ALSO carries the name-cell day restriction "(10/19 ONLY)":
    expect(maria.date_restriction).toEqual({ kind: 'explicit', days: ['10/19'] });
  });
  it('extracts stage_restriction kind=explicit stages=["Load Out","Strike"] from "- Load Out / Strike ONLY" role', => {
    const md = readFileSync('fixtures/shows/raw/2025-10-fixed-income-trading-summit.md', 'utf8');
    const crew = parseCrew(md, 'v2');
    const rob = crew.find(c => c.name.startsWith('Rob Frye'))!;
    expect(rob.stage_restriction).toEqual({ kind: 'explicit', stages: ['Load Out', 'Strike'] });
    expect(rob.date_restriction).toEqual({ kind: 'explicit', days: ['10/21'] });
  });

  // 2026 *** form
  it('emits unknown_asterisk for 2026 *** form (AC-1.4)', => {
    const md = readFileSync('fixtures/shows/raw/2026-03-rpas-central-four-seasons.md', 'utf8');
    const crew = parseCrew(md, 'v4');
    const calvin = crew.find(c => c.name === 'Calvin Saller')!;
    expect(calvin.date_restriction).toEqual({ kind: 'unknown_asterisk', days: null });
  });

  // #1c: full role vocabulary from 2026-04 role-master at lines
  // 718-743. The parser MUST recognize every documented suffix as a valid
  // atomic flag, NOT silently drop it as UNKNOWN_ROLE_TOKEN.
  it('decomposes compound role into atomic flags (AC-1.5) — full vocabulary', => {
    const md = readFileSync('fixtures/shows/raw/2025-06-ria-investment-forum.md', 'utf8');
    const crew = parseCrew(md, 'v2');
    const doug = crew.find(c => c.name === 'Doug Larson')!;
    expect(doug.role_flags).toEqual(expect.arrayContaining(['LEAD', 'V1']));
    expect(doug.role_flags).not.toContain('LEAD/V1');
  });
  // The full canonical vocabulary derived from the v4 role master:
  // LEAD, A1, A2, V1, BO, ONLY, CAM_OP (was CAM OP), GAV, L1, PTZ, LED,
  // FLOATER, FLOOR, STREAM, GS, BO_LEAD, BO_A1, BO_V1, GS_A1, GS_V1,
  // SHOW_CALLER, GREEN_ROOM, OWNER, CONTENT_CREATION
  // Compound role-master entries like "BO - V1" decompose to ["BO","V1"]
  // (NOT a single "BO_V1" composite flag). "GS - A1" decomposes to ["GS","A1"].
  // The "GS"/"BO" prefix carries scope (which room) — the renderer can use
  // it for tile filtering; the parser surfaces the flags atomically.
  it('handles every documented role-master suffix without UNKNOWN_ROLE_TOKEN warning', => {
    // For each line in 2026-04-asset-mgmt-cfo-coo-waldorf.md:718-743, parse
    // it as a synthetic single-crew row and assert role_flags has at least
    // one non-empty value AND no UNKNOWN_ROLE_TOKEN warning was emitted.
    // The full enumeration covers: LEAD/A1, LEAD/V1, A1, A2, V1, BO, GS-A1,
    // GS-V1, BO-A1, BO-V1, BO-LEAD, L1, FLOATER, FLOOR, STREAM, CAM OP, PTZ,
    // LED, GAV, SHOW CALLER, GREEN ROOM, OWNER, ONLY***, Load In/Set ONLY,
    // Load Out/Strike ONLY, CONTENT CREATION.
  });

  it('preserves raw role string', => {
    /* asserts crew[i].role === '\\- Load In / Set / Strike / Load Out - LEAD / V1' (verbatim from sheet)*/
  });
  it('canonicalizes emails', => {
    /* asserts edweiss412@gmail.com is lowercased even if sheet had mixed case */
  });
  ```

- [ ] **Step 2: Implement crew extraction** with these rules in order:
  1. Find the CREW header row (regex: `/^\|\s*CREW\s*\|/m` then walk subsequent rows until blank line or new block).
  2. For each row: split cells by `|`, trim, filter empties.
  3. Apply `extractDayRestriction({nameCell, roleCell})` — scan BOTH cells for the same `\(([^)]*ONLY[^)]*)\)` paren+ONLY pattern; date-token scan `\d{1,2}\/\d{1,2}` extracts the days. The pattern can appear in either cell across the corpus (verified: name cell in `2025-06-ria-investment-forum.md:32` Calvin Saller; role cell in `2025-04-asset-mgmt-cfo-coo.md:227` Kari Rose). Strip the parenthetical from whichever cell carried it before producing the display `name`/`role` strings. If parens appear in BOTH cells, prefer the role-cell match and emit a `DAY_RESTRICTION_DOUBLE_LOCATION` info warning (not seen in the corpus, defensive).
  4. Apply `extractStageRestriction(roleCell)` — match the role-master enumerations literally:
     - `Load In / Set / Strike / Load Out` (full set, including `***` annotation) → `kind: 'explicit', stages: ['Load In','Set','Strike','Load Out']` (all stages with the implicit-restriction signal — pairs with the `unknown_asterisk` date_restriction case).
     - `Load In / Set ONLY` (verified `2025-10-fixed-income-trading-summit.md:30`) → `kind: 'explicit', stages: ['Load In','Set']`.
     - `Load Out / Strike ONLY` (verified `2025-10-fixed-income-trading-summit.md:31`) → `kind: 'explicit', stages: ['Load Out','Strike']`.
     - All other role values (LEAD, A1, V1, BO, GS-A1, BO-V1, etc.) → `kind: 'none'` (covers all stages).
  5. Apply `extractRoleFlags(roleCell)` — strip stage prefix; tokenize remainder by `/` and `-`; normalize each token to canonical RoleFlag from the expanded vocabulary. Examples:
     - `LEAD / A1` → `['LEAD','A1']`
     - `BO - V1` → `['BO','V1']` (NOT a composite `BO_V1`; the BO prefix carries scope, V1 carries capability)
     - `GS - A1` → `['GS','A1']`
     - `CAM OP` → `['CAM_OP']` (whitespace collapsed)
     - `SHOW CALLER` → `['SHOW_CALLER']`
     - `CONTENT CREATION` → `['CONTENT_CREATION']`
     - `BO - LEAD` → `['BO','LEAD']`
       Tokens NOT in the canonical RoleFlag union (e.g., a hypothetical future `RIGGER`) emit `UNKNOWN_ROLE_TOKEN` warning AND are dropped from `role_flags`.
  6. Apply `***` detection on the role cell — if present and `date_restriction.kind === 'none'`, set to `unknown_asterisk` and emit `UNKNOWN_DAY_RESTRICTION` warning.
  7. Canonicalize email.
- [ ] **Step 3: Run** all crew tests — expect PASS.
- [ ] **Step 4: Commit** `feat(parser): crew + personalization (§2.4, §6.6)`.

### Task 1.7: Parse hotel reservations, rooms, transportation, contacts, ops, event details

**Files:** Create: `lib/parser/blocks/hotels.ts`, `rooms.ts`, `transport.ts`, `contacts.ts`, `event.ts`, `ops.ts`. Test: one test file per block.

For each block, follow the same pattern as Task 1.4:

1. Failing test against the appropriate fixture asserting field-by-field correctness.
2. Implement extractor that recognizes both pre-2026 layout and 2026 MAIN/SECONDARY split per §2.5–§2.10.
3. Handle the §2.6 split-hotel case (`2024-10-legal-forum-chro-dc.md` has two hotels for one show).
4. `event_details` is parsed as a flat key/value record (per §4.1 schema). `ops` parses `{po, proposal, invoice, invoiceNotes}` per §4.4.
5. **`coi_status` is parsed verbatim** — no enum normalization (§6.5 free-text fallback).
6. Free-text fields (`event_details.power`, `internet`, `keynote_requirements`, `opening_reel`, `rooms.setup`, `audio`, `video`, `lighting`, `scenic`) are stored as raw strings.
7. **Transportation `schedule[*].assigned_names: string[]`** — the transport extractor MUST emit `assigned_names: string[]` on every schedule entry. Source columns vary across template versions: pre-2026 layouts often carry passenger/co-driver names in a free-text column adjacent to the per-row `stage / date / time` cells; 2026 layouts may use a dedicated `Passengers` or `Tagged` column. The extractor scans the row for any column whose content is a comma-/`&`-separated list of crew-name-shaped tokens (matching against the parsed `crewMembers[].name` set when available, falling back to whitespace-trimmed comma split when not). Empty array (NEVER `null` or `undefined`) when no tagged names are present. Add a failing fixture-grounded test against any transportation row that carries tagged names; if the corpus lacks one, synthesize a `tests/fixtures/transport-tagged-names.md` fixture with a transport row carrying both a `driver_name` AND a per-row `assigned_names = ['Alice', 'Bob']`. **End-to-end visibility test (Task 4.7 cross-reference):** seed a show whose `transportation.driver_name === 'Cara'` and whose `schedule[0].assigned_names = ['Alice']`. Render the crew page as Alice (whose `crew_members.name` is `'Alice'`, `driver_name` does NOT match). Assert TransportTile renders — pure schedule-tag visibility with no driver_name match.

- [ ] **Steps 1–8** per block (5 blocks): write failing test → implement → pass → commit per block.

  Commit messages:
  - `feat(parser): hotel reservations block (§2.6)`
  - `feat(parser): rooms (GS/breakouts/additional) block (§2.7)`
  - `feat(parser): transportation block (§2.8)`
  - `feat(parser): contacts (venue/in_house_av) block (§2.9)`
  - `feat(parser): event_details + ops/financials (§2.10)`

### Task 1.8: Pull-sheet parser (§6.10, AC-4.7..4.11)

**Files:** Create: `lib/parser/pull-sheet.ts`. Test: `tests/parser/pull-sheet.test.ts`.

** #3:** the spec §6.10's earlier "pull-sheet has `QTY/CAT/SUB CAT/ITEM` text header" claim was inverted vs. the real corpus. Reality (verified):

- **Pull sheets** at `fixtures/shows/raw/2024-05-east-coast-family-office.md:207-275` and `2025-05-redefining-fixed-income-private-credit.md:360-430` use a POSITIONAL 5-column layout with NO `QTY/CAT/SUB CAT/ITEM` text header. The header row contains the literal `PULL SHEET` repeated as a merged title across all columns.
- **The GEAR table** at `2025-06-ria-investment-forum.md:366-388` DOES have an explicit `QTY | PULLED | INITAL | CAT | SUB CAT | ITEM | NOTES` text header (7 columns) — this is operations-side data and is NOT a pull sheet.

Detection signature:

- Pull sheet: header row's cells all contain literal text `PULL SHEET` (case-insensitive); subsequent rows are 5-column positional. **Two corpus variants observed**:
  - **Variant A** (verified `2024-05-east-coast-family-office.md:209+`): `[packed_flag, qty, item, sub_cat, cat]` — packed_flag in col[0].
  - **Variant B** (verified `2025-05-redefining-fixed-income-private-credit.md:362+`): `[qty, item, sub_cat, cat, packed_flag]` — packed_flag in col[4].

  Detection: scan data rows for the column index where `cell.toUpperCase() === 'TRUE' | 'FALSE'`; that index is `packed_flag`. Other columns are positional relative to packed_flag's location.

- GEAR (excluded): header row contains BOTH `PULLED` AND `INITAL` (note the typo, verbatim in the fixture).

- [ ] **Step 1: Failing tests** — exercise both real pull-sheet fixtures AND the GEAR-not-pull-sheet exclusion:

  ```ts
  // Real pull sheet — verified row-shape against fixture
  it('parses 2024-05 pull sheet into per-case rows (positional layout)', => {
    const md = readFileSync('fixtures/shows/raw/2024-05-east-coast-family-office.md','utf8');
    const ps = parsePullSheet(md);
    expect(ps).not.toBeNull;
    expect(ps!.length).toBeGreaterThan(0);
    const firstCase = ps![0]!;
    expect(firstCase.caseLabel).toMatch(/East Coast/i); // extracted from "PULL SHEET/East Coast..." title
    // First data row at fixture line 209: `| FALSE | 1 | FOH Rack | | FOH |`
    expect(firstCase.items[0]).toEqual({
      qty: 1,
      item: 'FOH Rack',
      subCat: null, // col 4 was blank
      cat: 'FOH', // col 5
    });
    // Row at line 215 has subCat populated: `| FALSE | 2 | Ultimate Speaker Stands w Black Scrim | SPEAKERS / MONITOR | AUDIO |`
    const stands = firstCase.items.find(i => i.item.includes('Ultimate Speaker Stands'));
    expect(stands).toEqual({ qty: 2, item: expect.any(String), subCat: 'SPEAKERS / MONITOR', cat: 'AUDIO' });
  });

  it('parses 2025-05 pull sheet', => {
    const md = readFileSync('fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md','utf8');
    const ps = parsePullSheet(md);
    expect(ps).not.toBeNull;
    expect(ps!.length).toBeGreaterThan(0);
  });

  it('returns null for sheets without PULL SHEET tab (AC-4.9)', => {
    const md = readFileSync('fixtures/shows/raw/2026-03-rpas-central-four-seasons.md','utf8');
    expect(parsePullSheet(md)).toBeNull;
  });

  // 2025-06+ has a GEAR table with QTY/PULLED/INITAL/CAT/SUB CAT/ITEM
  // that the OLD spec wording would have falsely classified as a pull sheet.
  it('does NOT classify the 2025-06 GEAR table as a pull sheet', => {
    const md = readFileSync('fixtures/shows/raw/2025-06-ria-investment-forum.md','utf8');
    // 2025-06 has NO PULL SHEET tab; the parser must return null even though
    // a `QTY|...|CAT|SUB CAT|ITEM` table is present in the GEAR tab.
    expect(parsePullSheet(md)).toBeNull;
  });

  it('preserves rawSnippet on partial parse (AC-4.11)', => {
    // Synth fixture with one row whose qty is unparseable; assert that row
    // surfaces with `qty: null` and `rawSnippet` populated, AND a
    // PULL_SHEET_PARSE_PARTIAL warning is emitted.
  });

  it('emits PULL_SHEET_AMBIGUOUS_FORMAT when row column-count differs from 5', => {
    // Synth fixture: header is `PULL SHEET/Test`, but data rows are 7 columns.
    // Assert: pull_sheet has one case with caseLabel `"Unparsed pull sheet"`,
    // items rendered as raw snippets, and the warning is emitted.
  });
  ```

- [ ] **Step 2: Implement** per §6.10 detection rules:
  1. Find a markdown table whose header row's cells all contain the literal `PULL SHEET` (case-insensitive).
  2. Skip past the alignment row `| :-: | :-: | .. |`.
  3. Read each data row as `[packed_flag, qty, item, sub_cat, cat]` (positional, 5 columns expected). Empty `item` → drop the row.
  4. If row column-count ≠ 5 → emit `PULL_SHEET_AMBIGUOUS_FORMAT` and fall back to raw-snippet rendering for the entire case.
  5. **Reject GEAR tables** by checking the header row for the explicit text `PULLED` AND `INITAL` (typo deliberate, matches fixture); if both present, this is GEAR, not a pull sheet — return null.
  6. Extract `caseLabel` from the header title text after `PULL SHEET/` prefix. If the fixture has nested sub-tabs, emit one `PullSheetCase` per sub-tab.
- [ ] **Step 3: Verify** soft-warning emission AND that MI-8c (in `lib/parser/invariants.ts`) gates structural regressions per §6.10 amendment — full collapse / halved case count / dropped case label / format ambiguity-against-prior-non-ambiguous all STAGE for approval, while per-row `PULL_SHEET_PARSE_PARTIAL` continues to auto-apply.
- [ ] **Step 4: Commit** `feat(parser): pull sheet — corrected detection (§6.10)`.

### Task 1.9: Diagrams + opening-reel substring extraction (§6.11, AC-7.22..7.23)

**Files:** Create: `lib/parser/diagrams.ts`, `lib/parser/opening-reel.ts`. Test: `tests/parser/diagrams.test.ts`, `tests/parser/opening-reel.test.ts`.

The Phase-1 parser extracts what's _describable from markdown alone_: the linked-folder URL (if any), and a stub for embeddedImages that the Drive API call later populates. Opening reel is parsed from `event_details.opening_reel` cell with substring-anchored URL extraction.

- [ ] **Step 1: Failing tests for opening-reel substring extraction (AC-7.22, AC-7.23)**
  ```ts
  import { extractOpeningReel } from '@/lib/parser/opening-reel';
  it('extracts driveFileId from anywhere in cell (AC-7.23)', => {
    expect(extractOpeningReel('YES - LOOP VIDEO https://drive.google.com/file/d/abc123/view'))
      .toEqual({ driveFileId: 'abc123' });
  });
  it('returns null for text-only cells (AC-7.22)', => {
    expect(extractOpeningReel('MAYBE')).toBeNull;
    expect(extractOpeningReel('')).toBeNull;
    expect(extractOpeningReel(null)).toBeNull;
  });
  it('handles docs.google.com URLs', => {
    expect(extractOpeningReel('https://docs.google.com/file/d/xyz/edit')?.driveFileId).toBe('xyz');
  });
  ```
- [ ] **Step 2: Implement** with regex `/(https?:\/\/)?(drive\.google\.com|docs\.google\.com)\/[^\s]+/` (no `^` anchor per spec §10) and a fileId extractor (path segment after `/d/`).
  ```ts
  export function extractOpeningReel(cell: string | null): { driveFileId: string } | null {
    if (!cell) return null;
    const m = cell.match(/https?:\/\/(?:drive|docs)\.google\.com\/[^\s]+/);
    if (!m) return null;
    const id = m[0].match(/\/d\/([a-zA-Z0-9_-]+)/);
    return id ? { driveFileId: id[1]! } : null;
  }
  ```
  **NB:** the Phase-1 result is just `{ driveFileId }`. The `drive_modified_time` is added by the sync layer at parse time via a `files.get` call (see Task 6.x). The parser library has no Drive dependency.
- [ ] **Step 3: Tests for diagrams.linkedFolder extraction** — for fixtures with `DIagrams | LINK` cell pointing at a folder URL, assert `linkedFolder.driveFolderId`/`driveFolderUrl` populated.
- [ ] **Step 4: Tests for embeddedImages stub** — parser produces `embeddedImages: []` since the markdown export doesn't include floating images; sync layer populates this via Sheets API.
- [ ] **Step 5: Commit** `feat(parser): diagrams + opening reel substring extraction (§6.11)`.

### Task 1.10: Soft warnings — typo normalization, unknown role tokens, raw_unrecognized

**Files:** Modify: every `lib/parser/blocks/*.ts`. Test: `tests/parser/warnings.test.ts`.

- [ ] **Step 1: Failing tests**
  ```ts
  it('TYPO_NORMALIZED warning fires when an alias maps a typo', => {
    /* synth markdown with "Hotal Contact Info" — assert warning emitted */
  });
  it('UNKNOWN_FIELD warning + raw_unrecognized capture for unrecognized rows', => { /* .. */ });
  it('UNKNOWN_ROLE_TOKEN dropped from role_flags but preserved in role string', => { /* .. */ });
  ```
- [ ] **Step 2: Implement** the warning emission inside each block parser. Maintain a `WarningCollector` passed as a parameter so warnings are aggregated centrally.
- [ ] **Step 3: Commit** `feat(parser): soft warnings (TYPO_NORMALIZED, UNKNOWN_FIELD, UNKNOWN_ROLE_TOKEN)`.

### Task 1.11: Top-level `parseSheet` orchestrator (AC-1.1)

**Files:** Create: `lib/parser/index.ts`. Test: `tests/parser/parseSheet.test.ts`.

** #4: `parseSheet` returns `ParsedSheet`, NOT `ParseResult`.** The pure parser is markdown-in/markdown-out — no Drive API calls. The sync layer wraps it with a Phase-1 enrichment step (`enrichWithDrivePins`) that produces the sync-ready `ParseResult` by calling `files.get` for the reel pin and per-linked-folder-item modtimes, plus the Sheets API for embedded images. Earlier draft had `parseSheet` returning `ParseResult` with mandatory pins, which the standalone parser literally cannot satisfy.

- [ ] **Step 1: Failing test** asserts that for every fixture in `fixtures/shows/raw/`, `parseSheet(md)` returns a `ParsedSheet` with `hardErrors.length === 0` and the canonical fields populated:
  ```ts
  import { parseSheet, type ParsedSheet } from '@/lib/parser';
  import { readdirSync, readFileSync } from 'node:fs';
  describe('parseSheet across fixture corpus (AC-1.1, AC-1.2)', => {
    const dir = 'fixtures/shows/raw';
    for (const f of readdirSync(dir).filter(n => n.endsWith('.md'))) {
      it(`${f}`, => {
        const r: ParsedSheet = parseSheet(readFileSync(`${dir}/${f}`, 'utf8'));
        expect(r.hardErrors).toEqual([]);
        expect(r.show.title.length).toBeGreaterThan(0);
        expect([r.show.dates.travelIn, r.show.dates.set, r.show.dates.showDays[0]].some(Boolean)).toBe(true);
        expect(r.crewMembers.length).toBeGreaterThan(0);
        expect(r.crewMembers[0]!.name.length).toBeGreaterThan(0);
        expect(r.rooms.length + 0).toBeGreaterThan(0);
        // ParsedSheet contract: embeddedImages is ALWAYS empty at parse time;
        // openingReel is OpeningReelRef ({driveFileId} only) or null;
        // linkedFolder is the URL ref only — no per-item enumeration here.
        expect(r.diagrams.embeddedImages).toEqual([]);
        if (r.openingReel) expect(r.openingReel).not.toHaveProperty('drive_modified_time');
      });
    }
  });
  ```
- [ ] **Step 2: Implement** `parseSheet(markdown: string): ParsedSheet` — calls each block parser and assembles the pure-output shape. Does NOT call Drive APIs. Does NOT populate `embeddedImages` or `linkedFolderItems` (those are sync-layer responsibilities, Tasks 7.1, 7.2). Does NOT pin `openingReel.drive_modified_time` (sync-layer responsibility, Task 6.x enrichment step).
- [ ] **Step 3: Run** the corpus test — expect PASS for all 10 fixtures.
- [ ] **Step 4: Commit** `feat(parser): top-level parseSheet → ParsedSheet`.

**Note for downstream tasks:** every reference to `parseSheet(md): ParseResult` in M6/M7 (Tasks 6.4 phase1, 6.5 phase2, 7.1 embedded-image extraction, 7.2 linked-folder freeze) is actually `parseSheet(md): ParsedSheet` THEN `enrichWithDrivePins(parsed, driveClient): Promise<ParseResult>`. The sync layer's `enrichWithDrivePins` is what populates `embeddedImages[]` (via `spreadsheets.get`), `linkedFolderItems[]` (via folder-list + `files.get` per item for modtime), and `openingReel.drive_modified_time` (via `files.get`). Tasks 6.4 / 7.1 / 7.2 remain unchanged in scope; only the type-flow is now explicit.

### Task 1.12: Minimum-invariant runner (§6.8, AC-1.7..1.8)

**Files:** Create: `lib/parser/invariants.ts`. Test: `tests/invariants/mi.test.ts`.

This module is consumed by the sync layer in M6, but the gate is a pure function on `(prior: ParseResult | null, next: ParseResult)` so it tests cleanly here.

- [ ] **Step 1: Failing tests for MI-1..MI-5b hard fails**
  ```ts
  import { runInvariants, MIOutcome } from '@/lib/parser/invariants';
  it('MI-1 hard fails when version detection fails', => { /* synth no markers */ });
  it('MI-2 hard fails on empty title', => { /* .. */ });
  it('MI-3 hard fails when no dates parse', => { /* .. */ });
  it('MI-4 hard fails when no crew', => { /* .. */ });
  it('MI-5 hard fails when no rooms', => { /* .. */ });
  it('MI-5a hard fails on duplicate crew names (AC-1.7)', => {
    const next = synthParseResult({ crewMembers: [
      { name: 'John C.', /*...*/ }, { name: 'John C.', /*...*/ } ]});
    const r = runInvariants(null, next);
    expect(r.outcome).toBe('hard_fail');
    expect(r.failedCodes).toContain('MI-5a_DUPLICATE_CREW_NAME');
  });
  it('MI-5b hard fails on duplicate emails (AC-1.8)', => { /* canonicalized */ });
  ```
- [ ] **Step 2: Failing tests for MI-6..MI-14 stage outcomes** — synthesize prior/next pairs that trigger each stage-for-approval invariant. Each test asserts `outcome === 'stage'` AND a specific entry in `triggered_review_items` with the right `invariant` code and per-item fields per the §6.8.2 derivation table.
  - MI-6: prior 6 crew, new 4 crew (drop > 1).
  - MI-7: prior 4 hotels, new 1 (>50% drop).
  - MI-7b: prior had hotel ordinal=2, new is missing it.
  - MI-8: prior had non-empty `financials.po`, new has empty.
  - MI-8b: prior `coi_status === 'SENT'`, new `''`.
  - MI-8c: prior had pull_sheet with 6 cases, new has 0 (or any case dropped, halved, etc.).
  - MI-9: prior `role_flags = ['LEAD','A1']`, new `['A1']` (and the other variants).
  - MI-11: prior email `alice@a.com`, new `alice@b.com` (same name).
  - MI-12: prior `Cara` with email X, new `Carla` with same email X — pre-paired item.
  - MI-13: name+email both differ — Levenshtein-paired item, with orphan-add/orphan-remove fallback when unmatched.
  - MI-14: rename heuristic without email.
  - MI-10: redundant LEAD-toggle case.
- [ ] **Step 3: Implement** as a single `runInvariants(prior, next)` returning `{ outcome: 'pass'|'stage'|'hard_fail', failedCodes: string[], triggeredItems: TriggeredReviewItem[] }`. Each item includes a `crypto.randomUUID` `id` per §6.8.2 (the id is generated at staging time but the parser-pure version mints them — sync layer reuses them).
- [ ] **Step 4: Commit** `feat(parser): MI-1..MI-14 invariant runner (§6.8)`.

### Task 1.13: Slug derivation (§6.9, AC-1.9..1.10)

**Files:** Create: `lib/parser/slug.ts`. Test: `tests/parser/slug.test.ts`.

** — split contract.** `deriveSlug(parseResult, existingSlugs)` is now a UX-preview helper (used in dev panels and the wizard's slug-derivation preview); the AUTHORITATIVE collision check is the database's `shows.slug` UNIQUE constraint, observed via Postgres `23505` _unique_violation_ in the retry-on-unique-violation loop in `applyStaged` (Task 6.11 amendment). The pure helper is still useful for: (a) Step 5W of the wizard rendering "Your show URL will be `<derived-slug>`" before Apply; (b) tests that don't go through Apply; (c) detection of edge cases that need explicit handling (e.g., empty title → fallback). It computes the SAME `<base>`, `<base>-2`, `<base>-3`, … sequence the retry loop walks; the runtime difference is the retry loop catches the database's UNIQUE-violation signal instead of pre-checking `existingSlugs`.

- [ ] **Step 1: Failing tests**
  ```ts
  import { deriveSlug, SlugCollisionExhausted } from '@/lib/parser/slug';
  it('determinism: same input → same output (AC-1.9)', => {
    const r = makeParseResult({ title: 'RPAS Central 2026', dates: { set: '2026-03-23' } });
    expect(deriveSlug(r, [])).toBe(deriveSlug(r, []));
    expect(deriveSlug(r, [])).toBe('2026-03-rpas-central-2026');
  });
  it('collision suffix -2 -3 (AC-1.10)', => {
    const r = makeParseResult({ title: 'RPAS Central 2026', dates: { set: '2026-03-23' } });
    expect(deriveSlug(r, ['2026-03-rpas-central-2026'])).toBe('2026-03-rpas-central-2026-2');
    expect(deriveSlug(r, ['2026-03-rpas-central-2026','2026-03-rpas-central-2026-2']))
      .toBe('2026-03-rpas-central-2026-3');
  });
  it('SLUG_COLLISION_EXHAUSTED at attempt 100', => {
    // 100 existing slugs: <base> plus <base>-2..<base>-100
    const existing = ['2026-03-rpas-central-2026', ...Array.from({length: 99}, (_, i) => `2026-03-rpas-central-2026-${i+2}`)];
    expect( => deriveSlug(r, existing)).toThrow(SlugCollisionExhausted);
    expect( => deriveSlug(r, existing)).toThrow(/SLUG_COLLISION_EXHAUSTED/);
  });
  it('uses set date, falls back to travelIn, then showDays[0]', => { /* .. */ });
  it('caps title-slug at 60 chars', => { /* .. */ });
  it('ASCII-folds and strips diacritics', => { /* .. */ });
  ```
- [ ] **Step 2: Implement** per §6.9 algorithm. Export `SlugCollisionExhausted extends Error` carrying `{ baseSlug, attemptCount }` so the runtime retry loop in `applyStaged` (Task 6.11) can rethrow with the §12.4 `SLUG_COLLISION_EXHAUSTED` code mapped from the same exception type. The helper's `existingSlugs` parameter is informational — the AUTHORITATIVE check is the database UNIQUE constraint observed via Postgres `23505` (see Task 6.11 amendment).
- [ ] **Step 3: Commit** `feat(parser): deriveSlug + SlugCollisionExhausted`.

### Task 1.14: Run full corpus + commit M1 done

- [ ] **Step 1:** `pnpm test` — assert every parser test and invariant test pass.
- [ ] **Step 2:** Open `package.json` and add `test:parser` script that runs `vitest run tests/parser tests/invariants`.
- [ ] **Step 3:** Commit `chore(parser): M1 demo script (test:parser)`.

---
