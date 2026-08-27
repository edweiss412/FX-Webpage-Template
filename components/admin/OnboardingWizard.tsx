/**
 * components/admin/OnboardingWizard.tsx (M10 §B Task 10.2 / Phase 1)
 *
 * Server-side wizard shell. Resolves the service-account email from
 * `GOOGLE_SERVICE_ACCOUNT_JSON`, picks the current step from URL
 * `?step=N` (whitelisted to 1 / 2 / 3 with fallback to 1), and renders
 * the matching step body plus the wizard chrome (step indicator,
 * "Start over" form bound to startOverServerAction).
 *
 * Phase 1 ships only Step 1 (<Step1Share>). Step 2 and Step 3 render
 * Phase 1 placeholders so the URL transitions exist before the real
 * step components land (Phase 2, after §A Pin-2).
 *
 * When the service-account credentials cannot be parsed, the wizard
 * renders the §12.4-cataloged ONBOARDING_OPERATOR_ERROR Doug-facing
 * copy (via `messageFor`, never a raw code) and keeps the Start Over
 * affordance available so the operator has a recovery path.
 *
 * Per spec §9.0:
 *   - "Pre-onboarding 'Start over' affordance. Every wizard step (1, 2,
 *     3) — and `/admin` itself when in wizard-mode — renders a small
 *     'Start over' link/button (admin-gated)."
 *   - The shell does NOT compose URLs to build-gated routes (memory
 *     `feedback_build_gated_routes_never_fallback_target`).
 */
import { Fragment } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";
import { startOverServerAction } from "@/lib/onboarding/serverActions";
import { log } from "@/lib/log";
import { messageFor } from "@/lib/messages/lookup";
import { Step1Share } from "@/components/admin/wizard/Step1Share";
import { Step2Verify } from "@/components/admin/wizard/Step2Verify";
import type { Step3Row, Step3ManifestStatus } from "@/components/admin/wizard/Step3Review";
import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { driveFolderUrl } from "@/lib/drive/driveFolderUrl";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { buildAdminAgendaPreview, type AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import { normalizeUseRawDecisions, type UseRawDecision } from "@/lib/sync/useRawOverlay";
import {
  assembleStep3Row,
  type PendingSyncRowForBuild,
  type ShowCandidate,
} from "@/lib/admin/assembleStep3Row";
import { cn } from "@/lib/ui/cn";

type OnboardingWizardProps = {
  settings: AppSettingsRow;
  searchParams: { step?: string };
  // True iff the active wizard session has reviewable scan results (the
  // onboarding_scan_manifest has rows). Computed server-side by the /admin
  // dispatcher via readScanManifestCount. This is the honest "a scan produced
  // something to review" signal — NOT `pending_wizard_session_id !== null`,
  // which is also true after Start Over / a failed scan with an empty manifest.
  // Defaults to false so a caller (or test) that omits it never advertises a
  // forward/resume affordance that would land on an empty Step 3.
  hasReviewableScan?: boolean;
  // Step-3 consolidation (spec §4.3): the /admin dispatcher's finalize checkpoint
  // for the active session, threaded into the unified Step-3 surface so it renders
  // across finalize states (footer Resume/Finish + badge-only rows post-finalize).
  // null = pre-finalize (default).
  checkpointStatus?: "in_progress" | "all_batches_complete" | null;
  // Spec §4.5: an all_batches_complete checkpoint past the staleness window shows
  // the footer recovery note + Cleanup (replacing StaleReadyToPublish). Computed
  // by the /admin dispatcher (isCheckpointStale). Only meaningful when
  // checkpointStatus === "all_batches_complete".
  isStale?: boolean;
};

type ServiceAccountFailureReason =
  | "env_missing"
  | "json_malformed"
  | "json_not_an_object"
  | "client_email_missing";

type ServiceAccountResult =
  | { ok: true; email: string }
  | { ok: false; reason: ServiceAccountFailureReason };

/**
 * Behavior-preserving restructure (Cluster E): the ok/not-ok partition over
 * every input is unchanged, only the label is new. Rendered output is identical.
 *
 * The `try` is NARROWED to the parse alone. The shipped version wrapped the
 * `client_email` property read too, so `GOOGLE_SERVICE_ACCOUNT_JSON=null` parsed
 * SUCCESSFULLY, threw a TypeError on the read, and landed in the catch —
 * labelling that `json_malformed` would assert a parse failure that demonstrably
 * did not happen. `null` is the only value that reaches the shipped catch with
 * the parse having succeeded; numbers, strings and arrays all yield `undefined`
 * on the read without throwing.
 *
 * The shape check rejects arrays EXPLICITLY: `typeof [] === "object"` and
 * `[] !== null`, so a typeof/null test alone would route `[]` to
 * `client_email_missing` and assert an object was supplied that merely lacked
 * a field.
 *
 * The catch stays PARAMETERLESS. Binding the error is the first step toward
 * logging it, and the V8 parse message embeds a snippet of the offending input —
 * which here is a service-account private key (spec §2.2 secrets contract).
 *
 * Stays synchronous and pure: it gains a discriminator, not an emit.
 */
function readServiceAccountEmail(): ServiceAccountResult {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { ok: false, reason: "env_missing" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "json_malformed" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "json_not_an_object" };
  }

  const email = (parsed as { client_email?: unknown }).client_email;
  if (typeof email === "string" && email.length > 0) return { ok: true, email };
  return { ok: false, reason: "client_email_missing" };
}

function pickStep(hint: string | undefined): 1 | 2 | 3 {
  if (hint === "2") return 2;
  if (hint === "3") return 3;
  return 1;
}

function StartOverForm() {
  return (
    <form
      data-testid="wizard-start-over-form"
      data-action="startOverServerAction"
      action={startOverServerAction}
      className="flex justify-start"
    >
      <button
        type="submit"
        data-testid="wizard-start-over-button"
        className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-3 text-sm font-medium text-text underline-offset-4 transition-colors duration-fast hover:text-text-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Start over
      </button>
    </form>
  );
}

// Exported for the unit test (onboardingWizardNav.test.tsx) — the redesigned
// pill+label+connector stepper. Shared across all three wizard steps; nav
// behavior (reachability, hrefs, aria-current) is unchanged from the original.
const STEP_LABELS = ["Share folder", "Verify", "Review & publish"] as const;

export function StepIndicator({
  step,
  maxReachedStep,
}: {
  step: 1 | 2 | 3;
  maxReachedStep: 1 | 2 | 3;
}) {
  // Pill (circle) shape shared by all states; focus ring shared by the two link
  // states (a plain span is not focusable, so it does not carry the ring).
  const base = cn(
    "flex size-7 shrink-0 items-center justify-center rounded-pill border text-xs font-semibold tabular-nums transition-colors duration-fast",
  );
  const focusRing = cn(
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  );
  // The 44px TAP TARGET a reachable pill exposes (spec 2026-08-07-step3-a11y-cluster
  // §2.2). The painted 28px pill moves to an inner <span> and this anchor becomes
  // the hit box; `-m-2` cancels the growth exactly, so the pill's margin box stays
  // 28×28 and the stepper's layout is untouched — required, not incidental. The
  // original reason was that the connectors measured 0px (probe P3), leaving no
  // slack; they are a fixed 60px now, and the reason is stronger: the pill is
  // `shrink-0`, so it is out of flex distribution entirely.
  //
  // `group` is mandatory, not stylistic: the visual span's hover utilities are
  // rewritten `group-hover:*`, which Tailwind emits as `:is(:where(.group):hover *)`.
  // Without an ancestor carrying `.group` they never match and hover feedback
  // disappears entirely rather than degrading — an 8px band that is tappable but
  // visually dead is worse than the small target it replaced.
  //
  // `rounded-pill` sits on BOTH: the span needs it to paint, and the target needs
  // it or its focus ring turns square (the ring follows the focused element's own
  // radius). `cursor-pointer` is on the target so the cursor changes across the
  // whole band. The focus ring stays on the anchor — a non-focusable inner span
  // can never match `focus-visible`.
  const tapTarget = cn(
    "group -m-2 flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-pill",
  );
  return (
    <nav
      aria-label="Onboarding progress"
      data-testid="wizard-step-indicator"
      // CONTENT WIDTH, and that is the measured answer rather than the original
      // one. Stretching this nav (`flex-1 min-w-0`) did make the connectors
      // render — they had been 0px since the wizard shipped, because a
      // content-sized flex parent has no free space for a `flex-1` child — but
      // measurement showed the connectors land at EXACTLY 60px in all twelve
      // step x viewport x theme cells, so the stretch grew nothing and the
      // leftover collected as trailing dead space: 16-80px at 390px, 258px at
      // 900px, with the rail's width jumping between steps 2 and 3 as the page
      // container's max-width changed. Sizing the connector directly (below)
      // renders identically with none of that.
      //
      // `min-w-0` STAYS, and dropping it was a regression CI caught that no
      // local run did: a flex item's default `min-width: auto` floors it at
      // content width, so a content-sized nav carrying two FIXED 60px
      // connectors could no longer shrink to fit a narrow container and
      // overflowed it (step3-review-page.layout.spec.ts:216, `navScrollW <=
      // contClientW`). Removing `flex-1` was right; removing `min-w-0` with it
      // was not — the two do different jobs, and only the growth was inert.
      className="flex min-w-0 items-center gap-2 sm:gap-3"
    >
      {([1, 2, 3] as const).map((n) => {
        const isActive = n === step;
        const isDone = n < step; // a step behind the current one is complete
        // Reachable = step ≤ the furthest step the operator has actually reached.
        // `maxReachedStep` is derived from server progress (a reserved scan
        // session makes Step 3 reachable), NOT merely the current URL step — so
        // hitting "Back" to Step 2 leaves Step 3's pill a real, navigable <Link>
        // (the forward path). Pills beyond the reached frontier stay plain,
        // non-interactive text — no href, so they cannot be tabbed to or clicked.
        const isVisited = n <= maxReachedStep;
        // Direction-aware label: a reachable pill ahead of the current step is
        // "Go to" (forward), behind it is "Go back to".
        const navLabel = n < step ? `Go back to step ${n}` : `Go to step ${n}`;
        // No success/green token exists (DESIGN.md) — a completed pill is neutral
        // (surface + strong border + a check glyph), NOT green. Accent is reserved
        // for the single active pill (≤10% accent budget).
        // EVERY branch is `cn(...)`-wrapped, not the ternary as a whole: the
        // canonical-class rule follows a recognized callee's ARGUMENTS, and a
        // ternary handed to `cn` is one argument whose branches it does not
        // enter. Wrapping each branch is what puts these strings in reach.
        const pillState = isActive
          ? cn("border-accent-edge bg-accent text-accent-text")
          : isDone
            ? cn("border-text-faint bg-surface text-text-subtle")
            : isVisited
              ? // `group-hover:`, not `hover:` — the visual span is no longer the
                // element the pointer is over across the 8px expansion band.
                cn(
                  "border-transparent bg-surface-sunken text-text-subtle group-hover:text-text-strong",
                )
              : cn("border-transparent bg-surface-sunken text-text-faint");
        // The check replaces the number on done pills; label sits beside the pill.
        const glyph = isDone ? <Check aria-hidden="true" className="size-3.5" /> : n;
        const pill = isVisited ? (
          <Link
            href={`/admin?step=${n}`}
            data-testid={`wizard-step-indicator-${n}`}
            aria-current={isActive ? "step" : undefined}
            aria-label={isActive ? `Step ${n}, current step` : navLabel}
            className={cn(tapTarget, focusRing)}
          >
            <span data-testid={`wizard-step-indicator-${n}-visual`} className={cn(base, pillState)}>
              {glyph}
            </span>
          </Link>
        ) : (
          <span
            data-testid={`wizard-step-indicator-${n}`}
            aria-disabled="true"
            className={cn(base, pillState)}
          >
            {glyph}
          </span>
        );
        const label = (
          <span
            className={cn(
              "text-xs font-medium whitespace-nowrap sm:text-sm",
              isActive ? "font-semibold text-text-strong" : "hidden text-text-subtle sm:inline",
            )}
          >
            {STEP_LABELS[n - 1]}
          </span>
        );
        return (
          <Fragment key={n}>
            <div className="flex items-center gap-2">
              {pill}
              {label}
            </div>
            {n < 3 ? (
              <span
                data-testid="wizard-step-connector"
                aria-hidden="true"
                // WIDTH IS SET DIRECTLY, not competed for. `flex-1` +
                // `max-w-confirm-box` resolved to the same 60px in every
                // measured case, so the cap was doing all the work and the
                // flex-grow only shifted dead space around (see the <nav>).
                //
                // COLOURS ARE TEXT TOKENS, not border tokens, and that is a
                // contrast fix rather than a taste change. Measured against the
                // page in a real browser: `border` read 1.22:1 and
                // `border-strong` 1.52:1 — a 1px line nobody can see — and the
                // two differed from EACH OTHER by 1.25:1, so the done/ahead
                // state the branch encodes was not perceivable either. Border
                // tokens are sized for a hairline BESIDE a filled surface;
                // this line sits alone on the page and needs text-grade
                // contrast. `text-faint` clears the 3:1 non-text floor (3.16:1
                // light, 4.22:1 dark) and `text-subtle` doubles it (6.5:1,
                // 6.8:1), so the completed run reads heavier at a glance.
                // State is still never colour-ALONE: the done pill carries a
                // Check glyph (§1 colour-blind floor).
                className={cn(
                  "h-px w-confirm-box rounded-full",
                  isDone ? "bg-text-subtle" : "bg-text-faint",
                )}
              />
            ) : null}
          </Fragment>
        );
      })}
      <span className="sr-only">Step {step} of 3</span>
    </nav>
  );
}

// The per-step "Back" affordance now lives in the shared full-width
// <WizardFooter> (rendered inside Step2Verify / Step3ReviewWithFinalize with the
// step's forward action), so the wizard chrome no longer carries a top Back link.
// SAFETY note preserved: navigating `?step=N-1` is read-only — Step2Verify fires
// its scan POST only from the form's onSubmit, never on mount, so Back cannot
// re-trigger a scan or orphan the wizard session.

type Step3FetchResult =
  | { kind: "ok"; rows: Step3Row[]; finishable: boolean }
  | { kind: "infra_error"; message: string };

// Exported for tests/admin/_metaInfraContract.test.ts — the helper is the
// subject row of the §B Supabase call-boundary registry for the Step 3
// wizard surface (AGENTS.md §1.9). Production callers use Step3Container.
// ── Step-3 consolidation (spec §4.3) — the unified per-session disposition read. ──

export async function fetchStep3Data(wizardSessionId: string): Promise<Step3FetchResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `supabase client failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // AGENTS.md §1.9: every Supabase await wraps in try/catch so a thrown
  // infra fault (auth expiration, network reset, RLS reject mid-query)
  // surfaces as the same typed `infra_error` result as the returned
  // `.error` branch — never as an uncaught framework exception.
  let manifestRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const { data, error } = await supabase
      .from("onboarding_scan_manifest")
      .select("drive_file_id, name, status, publish_intent, created_show_id, wizard_session_id")
      .eq("wizard_session_id", wizardSessionId)
      .order("drive_file_id", { ascending: true });
    if (error) {
      return {
        kind: "infra_error",
        message: `onboarding_scan_manifest query failed: ${error.message}`,
      };
    }
    manifestRows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `onboarding_scan_manifest query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let pendingSyncsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const { data, error } = await supabase
      .from("pending_syncs")
      .select(
        "staged_id, drive_file_id, staged_modified_time, parse_result, source_anchors, last_finalize_failure_code, triggered_review_items, use_raw_decisions, pull_sheet_override",
      )
      .eq("wizard_session_id", wizardSessionId);
    if (error) {
      return {
        kind: "infra_error",
        message: `pending_syncs query failed: ${error.message}`,
      };
    }
    pendingSyncsRows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_syncs query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let pendingIngestionsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const { data, error } = await supabase
      .from("pending_ingestions")
      .select("id, drive_file_id, last_error_code")
      .eq("wizard_session_id", wizardSessionId);
    if (error) {
      return {
        kind: "infra_error",
        message: `pending_ingestions query failed: ${error.message}`,
      };
    }
    pendingIngestionsRows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_ingestions query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Spec §4.3: the public.shows read for Live/Held derivation — published + archived
  // (crew-visible = published && !archived) + wizard_created_session_id (the
  // provenance discriminator). Scoped to the session's drive_file_ids. Same typed
  // infra-error contract (AGENTS.md §1.9).
  const driveFileIds = manifestRows.map((m) => m.drive_file_id as string);
  let showsRows: ReadonlyArray<Record<string, unknown>> = [];
  if (driveFileIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("shows")
        // title/client_label/venue/dates back the post-finalize badge-only summary
        // backfill (owner decision 2026-07-06) — the finalize batch deletes the
        // pending_syncs parse preview, so the live show is the only source left.
        .select(
          "id, drive_file_id, published, archived, wizard_created_session_id, title, client_label, venue, dates",
        )
        .in("drive_file_id", driveFileIds);
      if (error) {
        return { kind: "infra_error", message: `shows query failed: ${error.message}` };
      }
      showsRows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
    } catch (err) {
      return {
        kind: "infra_error",
        message: `shows query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Candidates grouped by drive_file_id (a row's buildStep3Row candidate list).
  const candidatesByDfid = new Map<string, ShowCandidate[]>();
  for (const s of showsRows) {
    const dfid = s.drive_file_id as string;
    const candidate: ShowCandidate = {
      id: s.id as string,
      drive_file_id: dfid,
      published: s.published === true,
      archived: s.archived === true,
      wizard_created_session_id: (s.wizard_created_session_id as string | null) ?? null,
      title: (s.title as string | null) ?? null,
      clientLabel: (s.client_label as string | null) ?? null,
      venue: s.venue ?? null,
      dates: s.dates ?? null,
    };
    const list = candidatesByDfid.get(dfid);
    if (list) list.push(candidate);
    else candidatesByDfid.set(dfid, [candidate]);
  }

  // Raw pending_syncs row by drive_file_id (buildStep3Row's nullable pending input).
  const rawPendingByDfid = new Map<string, PendingSyncRowForBuild>();
  for (const ps of pendingSyncsRows) {
    rawPendingByDfid.set(ps.drive_file_id as string, {
      staged_id: ps.staged_id as string,
      parse_result: ps.parse_result,
      last_finalize_failure_code: (ps.last_finalize_failure_code as string | null) ?? null,
      triggered_review_items: ps.triggered_review_items,
      pull_sheet_override: ps.pull_sheet_override,
    });
  }

  const stagedByDfid = new Map<
    string,
    {
      stagedId: string;
      title: string | null;
      parseResult: ParseResult | null;
      sourceAnchors: Record<string, SourceAnchor>;
      adminAgendaPreview: AdminAgendaItem[];
      agendaStateKey: string;
      lastFinalizeFailureCode: string | null;
      useRawDecisions: UseRawDecision[];
    }
  >();
  for (const ps of pendingSyncsRows) {
    const driveFileId = ps.drive_file_id as string;
    // §7.1: thread the FULL parse preview, not just the title. The jsonb is
    // untyped at the call boundary; coerce defensively to `ParseResult | null`
    // (a non-object/absent value → null) so the card can render summary +
    // breakdown without re-querying.
    const rawParse = ps.parse_result;
    const parseResult =
      rawParse !== null && typeof rawParse === "object" ? (rawParse as ParseResult) : null;
    // Bug #316 item 3: coerce the source_anchors jsonb with the SAME defensive guard
    // as parse_result (non-object/absent → `{}`) so the modal's per-section "In sheet"
    // links can resolve each region's sheet range from the staged preview.
    // Anchor freshness (spec 2026-08-09-m-wave-2 §2.3): fresh-by-construction — these
    // are pending_syncs anchors computed by the scan that staged THIS parse (same
    // revision by construction), so the shows-row freshness helper does not apply.
    const rawAnchors = ps.source_anchors;
    const sourceAnchors =
      rawAnchors !== null && typeof rawAnchors === "object"
        ? (rawAnchors as Record<string, SourceAnchor>)
        : {};
    const stagedId = ps.staged_id as string;
    const stagedModifiedTime = (ps.staged_modified_time as string | null) ?? null;
    // Task 11: baseline (note-only) agenda preview. Build with NO opts → every
    // item is note-only (`block: null`, `href: null`). A null/absent agenda_links
    // (partial/malformed jsonb) guards to `[]`.
    const agendaLinks = parseResult?.show?.agenda_links;
    const adminAgendaPreview = Array.isArray(agendaLinks)
      ? buildAdminAgendaPreview(agendaLinks)
      : [];
    // Task 11: stable identity that changes when the staged row is rescanned.
    const agendaStateKey = `${wizardSessionId}:${stagedId}:${stagedModifiedTime}`;
    stagedByDfid.set(driveFileId, {
      stagedId,
      title: parseResult?.show?.title ?? null,
      parseResult,
      sourceAnchors,
      adminAgendaPreview,
      agendaStateKey,
      // Task 5b (spec §6.1): the demotion code drives the card's dirty re-scan state.
      lastFinalizeFailureCode: (ps.last_finalize_failure_code as string | null) ?? null,
      // spec §8/§9a: staged use-raw decisions (jsonb) read through the single
      // normalize boundary; the wizard judgment callout renders the toggle from these.
      useRawDecisions: normalizeUseRawDecisions(ps.use_raw_decisions ?? null),
    });
  }

  const ingestionByDfid = new Map<string, { id: string; code: string | null }>();
  for (const pi of pendingIngestionsRows) {
    ingestionByDfid.set(pi.drive_file_id as string, {
      id: pi.id as string,
      code: (pi.last_error_code as string | null) ?? null,
    });
  }

  const rows: Step3Row[] = manifestRows.map((m) => {
    const driveFileId = m.drive_file_id as string;
    // Spec §4.3: assembleStep3Row (lib/admin/assembleStep3Row.ts) is the full
    // per-row path — the buildStep3Row derivation core plus the clean-row parse
    // preview and hard-fail ingestion enrichment. Extracted so the seeded state
    // gallery test exercises the same seam this render does.
    return assembleStep3Row(
      {
        drive_file_id: driveFileId,
        status: m.status as Step3ManifestStatus,
        name: (m.name as string | null) ?? null,
        publish_intent: (m.publish_intent as boolean | null) ?? null,
        created_show_id: (m.created_show_id as string | null) ?? null,
        wizard_session_id: (m.wizard_session_id as string | null) ?? null,
      },
      rawPendingByDfid.get(driveFileId) ?? null,
      candidatesByDfid.get(driveFileId) ?? [],
      stagedByDfid.get(driveFileId),
      ingestionByDfid.get(driveFileId),
      wizardSessionId,
    );
  });

  // §7.3: the UI half of the `finishable` predicate. A row blocks finish iff
  // it is in a genuine error/conflict state needing acknowledgement. The
  // canonical blocking set is the identical 3-element set the server gate
  // (Task B1) uses; a clean `staged` row (unchecked → Held) and `applied`
  // (checked) are NOT blocking. An empty list is finishable.
  const BLOCKING = new Set(["hard_failed", "live_row_conflict", "discard_retryable"]);
  // A row demoted by a per-sheet re-scan carries a non-null lastFinalizeFailureCode
  // (e.g. RESCAN_REVIEW_REQUIRED) while its manifest status is the non-blocking
  // 'staged'. The server final-CAS gate refuses such a row, so the finish button must
  // also block on it (else the UI enables a finish the server would reject).
  const finishable =
    rows.length === 0 || rows.every((r) => !BLOCKING.has(r.status) && !r.lastFinalizeFailureCode);

  return { kind: "ok", rows, finishable };
}

async function Step3Container({
  wizardSessionId,
  checkpointStatus = null,
  isStale = false,
}: {
  wizardSessionId: string;
  checkpointStatus?: "in_progress" | "all_batches_complete" | null;
  isStale?: boolean;
}) {
  const result = await fetchStep3Data(wizardSessionId);
  if (result.kind === "infra_error") {
    const degradedNote = (
      <section
        data-testid="wizard-step3-infra-error"
        data-render-fault="wizard-step3-sheet-read"
        className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
      >
        <p className="font-semibold">We could not load your sheets.</p>
        <p className="text-sm">
          This is usually temporary. Refresh in a moment. If it keeps happening, contact the
          developer.
        </p>
      </section>
    );
    // Plan-R2 MEDIUM: at a non-null checkpoint a degraded sheet read must NOT
    // strand the operator — the Resume/Finish + Cleanup footer stays reachable
    // (Step3ReviewWithFinalize renders the footer even with rows=[]). At
    // checkpoint null there is no finalize in flight, so the note stands alone.
    if (checkpointStatus === null) return degradedNote;
    return (
      <>
        {degradedNote}
        <Step3ReviewWithFinalize
          wizardSessionId={wizardSessionId}
          rows={[]}
          finishable
          initialPublishCount={0}
          initialUncheckedCleanCount={0}
          checkpointStatus={checkpointStatus}
          isStale={isStale}
        />
      </>
    );
  }
  // D5: thread the publish-intent counts into the finish button. publishCount =
  // rows currently checked (status 'applied' → Live); uncheckedCleanCount =
  // clean rows left unchecked (status 'staged' → Held). The label reads
  // "Publish N shows & finish setup" and a soft confirm fires when any clean
  // row is unchecked. Only clean rows participate (blocking rows never count).
  //
  // These are the SEED values only. <Step3ReviewWithFinalize> keeps the live
  // label in sync with the optimistic checkbox overlay so it no longer lags the
  // boxes by a POST round-trip + router.refresh() (the publish-count lag bug).
  const publishCount = result.rows.filter((r) => r.status === "applied").length;
  // "Won't be published" excludes already-Live rows: an unchecked existing-Live
  // show is a spec §7.4 D10 NO-OP (finalize/route.ts:1071 — the show is untouched
  // and STAYS live), so warning that it "won't be published" is false. Only rows
  // that would genuinely stay unpublished if unchecked (first-seen → Held, pre-CAS
  // session-created) count. displayState 'live' == crew-visible linked show.
  const uncheckedCleanCount = result.rows.filter(
    (r) => r.status === "staged" && r.displayState !== "live",
  ).length;

  return (
    <Step3ReviewWithFinalize
      wizardSessionId={wizardSessionId}
      rows={result.rows}
      finishable={result.finishable}
      initialPublishCount={publishCount}
      initialUncheckedCleanCount={uncheckedCleanCount}
      checkpointStatus={checkpointStatus}
      isStale={isStale}
    />
  );
}

// Exported for the tap-target live entry (_tapTargetFloorLiveEntry.tsx) — spec
// 2026-08-07-step3-a11y-cluster §8 requires the REAL component, because this
// block's <summary> is one of the seven the §2.1 floor repair covers and a
// transcribed copy would pass with the corrected class string while production
// stayed unrepaired. Same seam as StepIndicator above; render behavior is
// unchanged by the export.
export function OperatorErrorBlock() {
  const entry = messageFor("ONBOARDING_OPERATOR_ERROR");
  return (
    <section
      data-testid="wizard-operator-error"
      // Layer 1 marker, written at the COMPONENT because this block renders a
      // fault unconditionally: one marker for one behavior beats repeating the
      // string at each call site, and the DOM cannot tell where it was authored.
      // The scanner cannot reach the call site at OnboardingWizard.tsx:818 --
      // the guard there is `service.ok ? healthy : <OperatorErrorBlock />`, and
      // the ternary arm only inspects `whenTrue`, so a fault in the FALSE arm is
      // invisible to it. Found by whole-diff review r4b. The marker still
      // reaches the DOM, so the capture refuses either way; the scan's blind
      // spot is declared in the residue registry rather than widened away.
      data-render-fault="wizard-operator-error"
      aria-labelledby="wizard-operator-error-heading"
      className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
    >
      <h2 id="wizard-operator-error-heading" className="text-lg font-semibold">
        Setup is paused
      </h2>
      <p className="max-w-prose text-base">{entry.dougFacing}</p>
      {entry.helpfulContext ? (
        // `group` + the caret span below replace the NATIVE disclosure marker,
        // which `inline-flex` removes: a summary is `display: list-item` by
        // default and the 44px floor repair overrides that. Four of the six
        // repaired disclosures already suppressed the marker deliberately; this
        // one and the revoked-admins list did not, so without a replacement they
        // silently lose their open/closed cue. Same treatment as
        // app/me/meShowSections.tsx's past-shows disclosure.
        <details className="group text-sm">
          <summary className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center font-medium">
            What does this mean?{" "}
            <ChevronRight
              aria-hidden="true"
              className="ml-1 inline-block size-4 shrink-0 transition-transform duration-normal group-open:rotate-90"
            />
          </summary>
          <p className="mt-2 max-w-prose">{entry.helpfulContext}</p>
        </details>
      ) : null}
    </section>
  );
}

export async function OnboardingWizard({
  settings,
  searchParams,
  hasReviewableScan = false,
  checkpointStatus = null,
  isStale = false,
}: OnboardingWizardProps) {
  const service = readServiceAccountEmail();
  const step = pickStep(searchParams.step);

  if (!service.ok) {
    // Cluster E: ONBOARDING_OPERATOR_ERROR was render-only — the operator saw
    // "Setup is paused" and the system recorded nothing, so a support
    // conversation about stuck setup had no row to look at.
    //
    // `reason` is READ from service.reason, never re-derived, so the emit cannot
    // disagree with the branch that produced it. Nothing else derived from
    // GOOGLE_SERVICE_ACCOUNT_JSON is carried: it holds a service-account private
    // key (spec §2.2). Fail-open at the callsite — a telemetry fault must never
    // replace the operator-error render with an unhandled rejection.
    try {
      await log.error("service-account credentials unusable; onboarding wizard blocked", {
        source: "admin.onboardingWizard",
        code: "ONBOARDING_OPERATOR_ERROR",
        reason: service.reason,
      });
    } catch {
      /* best-effort */
    }
  }

  // Pre-onboarding only. Per spec §9.0:
  //   "After onboarding succeeds the [pre-onboarding 'Start over']
  //    affordance disappears — restart goes through `/admin/settings`
  //    instead."
  // The post-onboarding re-run-setup path uses /admin/settings's
  // Re-run Setup, which calls `rerunSetupServerAction` with the
  // checkpoint-aware suppression gate. Rendering the unconditional
  // `startOverServerAction` here in the re-run-setup window would
  // let a stale tab bypass the suppression and strand
  // `published = false` finalize rows. Gate by `watched_folder_id`
  // so the destructive purge path is available ONLY when no live
  // folder is connected yet.
  const showStartOver = settings.watched_folder_id === null;

  // Back/forward fix (2026-06-26): once a scan has produced reviewable results
  // the operator has reached Step 3, so every step is navigable even after
  // hitting "Back" to Step 2. Reachability is derived from server progress
  // (`hasReviewableScan` = the scan manifest has rows) rather than the current
  // URL step — otherwise Back collapses the forward pills into dead text and
  // strands the operator with no way to return to the review surface. We gate on
  // reviewable rows, NOT `pending_wizard_session_id !== null`: that session id is
  // also non-null after Start Over (rotated) and after a failed/0-sheet scan,
  // states with an EMPTY manifest where a forward pill + a "you already scanned"
  // resume panel would be a lie pointing at an empty Step 3.
  const scanReached = hasReviewableScan;
  const maxReachedStep: 1 | 2 | 3 = scanReached ? 3 : step;

  // Rehydrate Step 2 after a Back: surface the folder the operator already
  // scanned (input pre-fill + a "Continue to Step 3" link) so they need not
  // re-scan to go forward. The canonical folder URL is rebuilt from the
  // persisted Drive folder id and round-trips through the scan route's parser.
  const priorScan = scanReached
    ? {
        folderName: settings.pending_folder_name,
        folderUrl: driveFolderUrl(settings.pending_folder_id),
        folderId: settings.pending_folder_id,
      }
    : undefined;

  // Variant B (Task 5): Steps 1-2 stay narrow (max-w-2xl) — they are single-column
  // instruction/input flows where extra width just adds empty space. Step 3 is the
  // review list of full-width compact sheet rows (the list lives in <Step3Review>);
  // it holds a 768px base (max-w-3xl) on laptops/tablets and widens to 1024px
  // (xl:max-w-5xl, ≥1280px) so the list stops looking lost in the max-w-[1600px]
  // admin shell on large desktops.
  const containerMaxWidth = step === 3 ? cn("max-w-3xl xl:max-w-5xl") : cn("max-w-2xl");

  return (
    // `pb-32` reserves space for the fixed full-width <WizardFooter> each step
    // renders (Step 1 in <Step1Share>, Steps 2-3 in their client wrappers) so the
    // bar never occludes the last row of content.
    <div
      data-testid="onboarding-wizard"
      className={`mx-auto flex ${containerMaxWidth} flex-col gap-section-gap pb-32`}
    >
      {/* Forward + Back nav both live in the shared footer now; the top chrome is
          just the step indicator. */}
      <div className="flex items-center justify-between gap-3">
        <StepIndicator step={step} maxReachedStep={maxReachedStep} />
      </div>

      {service.ok ? (
        <>
          {step === 1 ? <Step1Share serviceAccountEmail={service.email} /> : null}
          {step === 2 ? <Step2Verify {...(priorScan ? { priorScan } : {})} /> : null}
          {step === 3 && settings.pending_wizard_session_id !== null ? (
            <Step3Container
              wizardSessionId={settings.pending_wizard_session_id}
              checkpointStatus={checkpointStatus}
              isStale={isStale}
            />
          ) : null}
          {step === 3 && settings.pending_wizard_session_id === null ? (
            <section
              data-testid="wizard-step3-no-session"
              className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
            >
              <p className="font-semibold text-text-strong">Nothing scanned yet.</p>
              <p>
                Go back to step 2 and verify your folder. Once the scan finishes we will list every
                sheet here for review.
              </p>
            </section>
          ) : null}
        </>
      ) : (
        <OperatorErrorBlock />
      )}

      {showStartOver ? (
        <>
          <hr className="border-border" />
          <StartOverForm />
        </>
      ) : null}
    </div>
  );
}
