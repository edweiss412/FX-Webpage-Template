/**
 * tests/e2e/_compactAlertCardLiveEntry.tsx
 * (spec 2026-07-20-show-alert-compact §9.3)
 *
 * Browser ENTRY for the LIVE real-CSS harness: mounts the REAL
 * <CompactAlertCard> and the REAL <CompactAlertHelp> against the compiled
 * Tailwind output, so the layout claims jsdom cannot reach are measured in a
 * real engine — footer containment, ellipsis actually engaging, tap-target
 * sizes, and whether the popover paints where its rectangle says it does.
 *
 * Three fixtures, each in a fixed-width column so the spec can measure at 400px
 * and 320px without resizing the viewport per assertion:
 *   - short: a compact label that must stay on ONE footer line;
 *   - long:  the longest live action label ("Open branch settings",
 *            lib/adminAlerts/alertActions.ts:75) — must wrap, never overflow;
 *   - token: an unbroken 60-character token as the message, which is what
 *            pushes the help trigger out of the card when `min-w-0` is missing.
 *
 * NEVER imported by a Playwright spec (Playwright's babel transform rewrites
 * JSX in spec-imported .tsx into component-testing payloads react-dom cannot
 * render). compact-alert-card-layout.spec.ts bundles this out-of-process with a
 * version-pinned esbuild and serves it, mirroring _collapsePanelMorphLiveEntry.
 */
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { resolveActionLabels } from "@/lib/adminAlerts/resolveActionLabel";
import { CompactAlertCard } from "@/components/admin/CompactAlertCard";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import type { ParseWarning } from "@/lib/parser/types";
import { CompactAlertHelp } from "@/components/admin/compactAlertHelp";

const LONG_LABEL = "Open branch settings";
// A single unbroken token is what actually forces the ellipsis: with flex-wrap,
// a multi-word label simply wraps to its own line and never truncates.
const UNBREAKABLE_LABEL = "OpenBranchSettingsAndReviewTheSyncConfiguration";
const UNBROKEN_TOKEN = "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/**
 * The resolve control. Its LABEL comes from the production module
 * (lib/adminAlerts/resolveActionLabel.ts) keyed on a `?code=` query param, so
 * the string under measurement travels the real code -> intent -> label path
 * rather than being typed into the harness.
 *
 * The real <PerShowAlertResolveButton> cannot mount here: this bundle has no
 * Next runtime, and that component calls useRouter. Its classes are mirrored
 * verbatim from components/admin/PerShowAlertResolveButton.tsx, and
 * tests/components/admin/_metaResolveLabelSingleSource.test.ts keeps the label
 * strings themselves in exactly one module.
 */
function harnessCode(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("code");
  return fromQuery && fromQuery.length > 0 ? fromQuery : "AMBIGUOUS_EMAIL_BINDING";
}

function ResolveButton() {
  return (
    <button
      type="button"
      data-testid="harness-resolve"
      className="inline-flex min-h-tap-min items-center rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong"
    >
      {resolveActionLabels(harnessCode()).idle}
    </button>
  );
}

function FooterLeft({ label, testId }: { label: string; testId: string }) {
  return (
    <>
      <a
        href="https://example.test/sheet"
        data-testid={testId}
        className="inline-flex min-h-tap-min min-w-0 items-center truncate text-xs font-medium text-text-strong underline underline-offset-2"
      >
        {label}
      </a>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <span className="tabular-nums">Raised 2d ago</span>
    </>
  );
}

function LiveHarness() {
  // Readiness marker for specs that navigate between renders and compare
  // geometry across the two: waiting on load alone can measure a pre-mount
  // frame. Paired with document.fonts.ready on the spec side, since a font
  // landing between navigations would move a sub-pixel comparison.
  useEffect(() => {
    document.documentElement.setAttribute("data-harness-hydrated", "true");
  }, []);


  const warningItem: ParseWarning = {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "Unrecognized CLIENT row label: 'Stage'",
    rawSnippet: "Stage | x",
    blockRef: { kind: "client", name: "Stage" },
  };
  const bannerItem: AttentionItem = {
    id: "alert:a1",
    kind: "alert",
    tone: "notice",
    sectionId: "crew",
    crewKey: null,
    actionable: true,
    menuTitle: "Use-raw decision stale",
    menuSubtitle: null,
    alert: {
      alertId: "a1",
      code: "USE_RAW_DECISION_STALE",
      template: "A saved use-raw decision went stale.",
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-19T10:00:00Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
    },
  };
  return (
    <div className="flex flex-col gap-8 p-6">
      {/* warning-card-copy-restore §3.4/§7: the two changed CompactAlertHelp
          consumers, mounted REAL, in a 400px column for trigger geometry. */}
      <div data-testid="mount-warning-card" style={{ width: 400 }}>
        <PerShowActionableWarnings items={[warningItem]} driveFileId={null} />
      </div>
      <div data-testid="mount-attention-banner" style={{ width: 400 }}>
        <AttentionBanner
          item={bannerItem}
          slug="harness-show"
          now={new Date("2026-07-19T12:00:00Z")}
          highlighted={false}
          onResolved={() => {}}
        />
      </div>
      {/* 400px column — the design's reference card width. */}
      <div data-testid="col-400" style={{ width: 400 }} className="flex flex-col gap-4">
        <div data-testid="card-short-400">
          <CompactAlertCard
            message="Doug Larson was added with LEAD."
            helpTrigger={
              <CompactAlertHelp
                helpfulContext="Lead changes must be confirmed on the show page."
                helpHref="/help/errors#X"
                route="/admin"
                testId="help-short-400"
              />
            }
            footerLeft={<FooterLeft label="Open in Sheet" testId="link-short-400" />}
            footerRight={<ResolveButton />}
          />
        </div>

        <div data-testid="card-long-400">
          <CompactAlertCard
            message="Some sheet regions could not be read during the last sync."
            footerLeft={<FooterLeft label={LONG_LABEL} testId="link-long-400" />}
            footerRight={<ResolveButton />}
          />
        </div>
      </div>

      {/* 320px column — the narrow bound the containment invariant must hold at. */}
      <div data-testid="col-320" style={{ width: 320 }} className="flex flex-col gap-4">
        <div data-testid="card-short-320">
          <CompactAlertCard
            message="Doug Larson was added with LEAD."
            footerLeft={<FooterLeft label="Open in Sheet" testId="link-short-320" />}
            footerRight={<ResolveButton />}
          />
        </div>

        <div data-testid="card-long-320">
          <CompactAlertCard
            message="Some sheet regions could not be read during the last sync."
            footerLeft={<FooterLeft label={LONG_LABEL} testId="link-long-320" />}
            footerRight={<ResolveButton />}
          />
        </div>

        <div data-testid="card-unbreakable-320">
          <CompactAlertCard
            message="Some sheet regions could not be read during the last sync."
            footerLeft={<FooterLeft label={UNBREAKABLE_LABEL} testId="link-unbreakable-320" />}
            footerRight={<ResolveButton />}
          />
        </div>

        {/* Unbroken token: proves the message block's min-w-0 keeps the trigger in. */}
        <div data-testid="card-token-320">
          <CompactAlertCard
            message={UNBROKEN_TOKEN}
            helpTrigger={
              <CompactAlertHelp
                helpfulContext="Context for the token card."
                helpHref={null}
                route="/admin"
                testId="help-token-320"
              />
            }
            footerLeft={<FooterLeft label="Open in Sheet" testId="link-token-320" />}
            footerRight={<ResolveButton />}
          />
        </div>
      </div>
    </div>
  );
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<LiveHarness />);
