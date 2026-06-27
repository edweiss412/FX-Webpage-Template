import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import type { AgendaExtraction } from "@/lib/agenda/types";

export type ParseWarning = {
  severity: "info" | "warn";
  code: string;
  message: string;
  // `iso` (when present) is the show-day date the warning is about — the stable
  // key used to attach a `sourceCell` anchor at scan time (correlated against the
  // raw grid by date, NOT by markdown row index, which the synthesis pipeline can
  // shift).
  blockRef?: { kind: string; index?: number; iso?: string; name?: string };
  rawSnippet?: string;
  // Optional deep-link anchor to the exact source cell that triggered the warning
  // (e.g. the DATES-tab TIME cell for SCHEDULE_TIME_UNPARSED). Attached at scan
  // time when the raw workbook + tab gids are available (see
  // lib/drive/showDayTimeAnchors.ts); absent otherwise. jsonb-persisted on
  // shows_internal.parse_warnings — backward-compatible, no migration. The UI
  // renders an "Open in Sheet" link via buildSheetDeepLink when present.
  sourceCell?: SourceAnchor | null;
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
//
// Space-separated fixture tokens ("CAM OP", "SHOW CALLER", "GREEN ROOM",
// "CONTENT CREATION") are normalized to underscore-separated RoleFlag values
// ("CAM_OP", "SHOW_CALLER", "GREEN_ROOM", "CONTENT_CREATION") by the role-flag
// decomposer (Task 1.6) before being asserted against this union. The fixture
// role-master is the canonical source of truth; this union encodes the
// post-normalization vocabulary.
//
// Restriction markers like `ONLY` and the `***` asterisk form are recognized
// by the parser as valid tokens (no UNKNOWN_ROLE_TOKEN warning is emitted).
// `ONLY` is persisted as an atomic role flag; the asterisks feed
// `date_restriction.kind = 'unknown_asterisk'`.
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
  // Restriction marker
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
    loadIn?: string | null; // free-text load-in clock time from the DATES TIME column (set/travel_set rows). §4.4
    setupTime?: string | null; // second clock in the SET-row TIME cell (e.g. "10:00PM SETUP"). §4.2 / D7
  };
  // per-day work-phase mapping. Each entry maps a calendar date (ISO 'YYYY-MM-DD')
  // to the set of WorkPhases active on that day. Derived by the parser from shows.dates blocks AND
  // any per-day schedule rows that explicitly mark phase activity. PackListTile (Task 4.9) reads
  // this map directly via todayWorkPhases(show, today) — RightNowState alone is too coarse to
  // represent compound days like Show+Strike on the final show day.
  schedule_phases: Record<string, WorkPhase[]>; // keyed by ISO date; e.g., { '2026-04-15': ['Show','Strike'] }
  event_details: Record<string, string>;
  agenda_links: { label: string; fileId?: string; url?: string; extracted?: AgendaExtraction }[];
  coi_status: string | null;
  po: string | null;
  proposal: string | null;
  invoice: string | null;
  invoice_notes: string | null;
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
// namesRefer(driver_name, viewer.name)
// || transportation.schedule.some(s => s.assigned_names.some(n => namesRefer(n, viewer.name)))
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
  contentUrl?: string | null;
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
  mimeType: string | null; // Drive-reported MIME captured at Phase-1 enrichment; nullable at parse time.
  // MUST be non-null in any ParseResult flowing into Phase 2 / Apply.
  // Persisted into shows.opening_reel_mime_type.
  // MIME-type gate `mimeType.startsWith('video/')` enforced inside enrichWithDrivePins;
  // non-video collapses to null per §10.
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

/**
 * One AGENDA run-of-show session row (§4.1). All fields are sheet-DISPLAY
 * strings — never re-parsed to Date (D-1). `title` is REQUIRED and is the
 * "filled" signal: parseAgenda only emits an entry when TITLE is REAL
 * (non-empty AND not a generic sentinel — shouldHideGenericOptional).
 */
export type AgendaEntry = {
  start: string;
  finish?: string;
  trt?: string;
  title: string;
  room?: string;
  av?: string;
};

export type ScheduleDay = {
  entries: AgendaEntry[]; // titled run-of-show (may be [])
  showStart: string | null; // per-day first-call anchor
  window: { start: string; end: string } | null; // bare-window days only
};
export type RunOfShow = Record<string, ScheduleDay>; // keyed by ISO 'YYYY-MM-DD'
export type ShowAnchor = { date: string; label: string; time: string }; // date = ISO

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
    embeddedImages: never[]; // ALWAYS empty at parse time; sync layer fills via Sheets API
    linkedFolderItems: never[]; // ALWAYS empty at parse time. Populated by enrichWithDrivePins via files.list + per-item files.get (§6.11).
  };
  openingReel: OpeningReelRef | null; // driveFileId only at parse time
  raw_unrecognized: { block: string; key: string; value: string }[];
  warnings: ParseWarning[];
  // AGENDA run-of-show (Phase 2). ISO date -> entries. undefined = grid
  // unlocatable (D-1/D-2). Sibling of warnings; NOT on ShowRow (admin-only, R18).
  runOfShow?: RunOfShow;
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
  // AGENDA run-of-show (Phase 2). ISO date -> entries. undefined = grid
  // unlocatable (D-1/D-2). Sibling of warnings; NOT on ShowRow (admin-only, R18).
  runOfShow?: RunOfShow;
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
