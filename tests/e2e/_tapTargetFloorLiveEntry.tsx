/**
 * tests/e2e/_tapTargetFloorLiveEntry.tsx
 * (spec 2026-08-07-step3-a11y-cluster §8 — the tap-target-floor live entry)
 *
 * Browser ENTRY for tap-target-floor.layout.spec.ts. Mounts the REAL repaired
 * components, never transcribed markup.
 *
 * WHY REAL COMPONENTS ARE MANDATORY HERE (spec §8, AC-3b). This spec's entire
 * subject is whether particular class strings sit on particular elements. The
 * nearest precedent — step3-review-page.layout.spec.ts — transcribes class
 * strings into static HTML and keeps them in sync by hand, which is sound for
 * pinning a layout SHAPE and fatal here: a harness holding its own copy of the
 * strings would pass with the corrected copy while production stayed
 * unrepaired. So every measured element below comes from the production module.
 *
 * NEVER imported by a Playwright spec (its test transform rewrites JSX into
 * component-testing payloads). The spec bundles this out-of-process with the
 * UNMODIFIED tests/e2e/_step3ReviewModalBundle.mjs, whose emptyNodeBuiltins
 * resolver is what makes these graphs bundle at all (bundleLiveEntry passes
 * node builtins as externals, which the browser cannot load).
 *
 * SEAMS, each chosen by the spec rather than by this file:
 *  - `AdminNav` calls usePathname() and throws on a null pathname
 *    (isNavItemActive → pathname.startsWith). Wrapped in PathnameContext,
 *    NOT AppRouterContext — the precedent is _pusherRowsHarness.tsx:17-21.
 *  - `MeShowSections` is imported from app/me/meShowSections.tsx, NEVER
 *    app/me/page.tsx: the page's graph constructs an AsyncLocalStorage at
 *    module scope, which dies under the bundler's empty builtin stubs before
 *    React mounts (spec §1.1 R10).
 *  - `OperatorErrorBlock` is imported by name from OnboardingWizard.tsx, which
 *    is why that symbol is exported (spec §8; same precedent comment as
 *    StepIndicator).
 *
 * EVERY MOUNT CARRIES THE STATE THAT MAKES ITS <summary> EXIST (spec §3). Five
 * of the seven disclosures are conditional; a fixture missing the condition
 * renders no <summary> at all and DI-1/DI-2 would pass on an unrepaired build.
 * The seven-summary premise in the spec is what turns a dropped fixture into a
 * loud failure rather than a silent pass.
 *
 * READINESS: `document.body[data-harness-ready="true"]` is set after the first
 * commit. The spec gates on it and then on document.fonts.ready — never
 * networkidle.
 */
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { MeShowSections } from "@/app/me/meShowSections";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpSheet } from "@/components/admin/HelpSheet";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { OperatorErrorBlock, StepIndicator } from "@/components/admin/OnboardingWizard";
import { AdminNav } from "@/components/admin/nav/AdminNav";
import { AdministratorsSection } from "@/components/admin/settings/AdministratorsSection";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import type { AdminEmailRow } from "@/lib/data/adminEmails";
import type { CrewShowSummary } from "@/lib/data/listShowsForCrew";
import type { AgendaEntry } from "@/lib/parser/types";

/**
 * A code whose catalog entry carries BOTH dougFacing copy and a non-null
 * helpfulContext (lib/messages/catalog.ts ONBOARDING_OPERATOR_ERROR). Both
 * halves are load-bearing: HelpAffordance returns null without helpfulContext,
 * and ErrorExplainer returns null without surface copy — either way the
 * <summary> under measurement would not exist.
 */
const HELPFUL_CODE = "ONBOARDING_OPERATOR_ERROR";

/** Deterministic reference for every relative-time render in the tree. */
const NOW = new Date("2026-06-15T12:00:00Z");

const ACTOR_EMAIL = "owner@example.com";

/** One active + one revoked row: the revoked disclosure is what §2.1 repairs. */
const ADMIN_ROWS: AdminEmailRow[] = [
  {
    email: ACTOR_EMAIL,
    added_by: null,
    added_at: "2026-01-04T10:00:00.000Z",
    revoked_by: null,
    revoked_at: null,
    note: null,
    is_developer: false,
  },
  {
    email: "former@example.com",
    added_by: ACTOR_EMAIL,
    added_at: "2026-02-10T10:00:00.000Z",
    revoked_by: ACTOR_EMAIL,
    revoked_at: "2026-05-01T10:00:00.000Z",
    note: null,
    is_developer: false,
  },
];

/** One future + one past show: `past.length > 0` is what renders me-past. */
const CREW_SHOWS: CrewShowSummary[] = [
  {
    id: "show-future",
    slug: "east-coast-tour",
    title: "East Coast Tour",
    dates: { set: "2026-07-01", showDays: ["2026-07-01"] },
    venue: { name: "The Fillmore" },
    shareToken: "tok-future",
  },
  {
    id: "show-past",
    slug: "winter-drill",
    title: "Winter Drill",
    dates: { set: "2026-01-10", showDays: ["2026-01-10"] },
    venue: { name: "Riverside Hall" },
    shareToken: "tok-past",
  },
];

/**
 * STRICTLY longer than TITLE_TRUNCATE_AT (80, lib/crew/agendaDisplay.ts:25).
 * RunOfShowEntry renders a plain <span> and NO <summary> at 80 or fewer
 * characters (components/crew/primitives/RunOfShowList.tsx:79-89), so a short
 * title cannot exercise this repair at all — spec §2.1 states this explicitly.
 */
const LONG_AGENDA_TITLE =
  "Rehearsal block for the opening number with full band, lighting cues, and a camera walkthrough";

const AGENDA_ENTRIES: AgendaEntry[] = [
  {
    start: "7:15 AM",
    finish: "7:30 AM",
    trt: "0:15",
    title: LONG_AGENDA_TITLE,
    room: "Main Hall",
  },
];

/**
 * One mounted surface. A plain block box at the harness's full content width —
 * DI-2 measures each Class-A <summary> against this, because it is the width a
 * full-width invisible band would occupy. Measuring against the <summary>'s own
 * <details> parent would be wrong for RunOfShowList, whose <details> is itself
 * a shrink-to-fit flex item and therefore tracks the summary's width on an
 * unrepaired build too.
 */
function Mount({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div data-mount={name} className="mb-16 block w-full">
      {children}
    </div>
  );
}

function App() {
  useEffect(() => {
    document.body.setAttribute("data-harness-ready", "true");
  }, []);

  return (
    <PathnameContext.Provider value="/admin">
      <div className="px-4 pt-4 pb-64">
        {/* DI-11/DI-12. The brand link renders on every /admin route except the
            onboarding branch (app/admin/layout.tsx:204); "/admin" is the route
            whose link those invariants measure. */}
        <Mount name="admin-nav">
          <AdminNav email={ACTOR_EMAIL} bellCount={{ kind: "ok", count: 3 }} />
        </Mount>

        {/* DI-3…DI-6, DI-9, DI-13, DI-14. step=2 + maxReachedStep=3 is the
            FORWARD-VISITED fixture: it is the only state in which pill 3 is a
            visited <Link> carrying a hover colour, and DI-9 has no
            discriminating power without one (spec §6.1). */}
        <Mount name="step-indicator">
          <StepIndicator step={2} maxReachedStep={3} />
        </Mount>

        {/* DI-1/DI-2 + DI-8/DI-15. HelpSheet's trigger is measured closed; its
            close button is measured with the sheet OPEN, after a real click. */}
        <Mount name="help-sheet">
          <HelpSheet label="Help: Active shows" testId="help-sheet">
            <p>Body copy for the sheet.</p>
          </HelpSheet>
        </Mount>

        {/* DI-1 (the seventh summary), DI-10, DI-13, DI-14. */}
        <Mount name="help-tooltip">
          <HelpTooltip label="Help: Active shows">
            <p>Body copy for the tooltip.</p>
          </HelpTooltip>
        </Mount>

        {/* Class A #1 — the ledger's P1 site. `route` is passed explicitly so
            the Learn-more gate does not depend on the harness's pathname. */}
        <Mount name="help-affordance">
          <HelpAffordance code={HELPFUL_CODE} route="/admin" />
        </Mount>

        {/* Class A #2 — the wizard operator-error disclosure. Renders only when
            the catalog entry has helpfulContext (OnboardingWizard.tsx:559-564). */}
        <Mount name="operator-error">
          <OperatorErrorBlock />
        </Mount>

        {/* Class A #3 — helpfulContext must be enabled or the block is absent
            (components/messages/ErrorExplainer.tsx:79-96). */}
        <Mount name="error-explainer">
          <ErrorExplainer code={HELPFUL_CODE} surface="admin" helpfulContext />
        </Mount>

        {/* Class A #4 — needs at least one revoked admin, or no disclosure
            renders (AdministratorsSection.tsx:126-145). */}
        <Mount name="administrators">
          <AdministratorsSection
            result={{ kind: "ok", rows: ADMIN_ROWS }}
            actorCanonicalEmail={ACTOR_EMAIL}
            now={NOW}
          />
        </Mount>

        {/* Class A #5 — needs at least one past show (spec §3). */}
        <Mount name="me-show-sections">
          <MeShowSections shows={CREW_SHOWS} now={NOW} />
        </Mount>

        {/* Class A #6 — needs a title of more than 80 characters. */}
        <Mount name="run-of-show">
          <RunOfShowList entries={AGENDA_ENTRIES} isoDate="2026-06-15" />
        </Mount>
      </div>
    </PathnameContext.Provider>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);
