/**
 * app/admin/dev/source-link-dim/page.tsx — dimensional-invariant render harness
 * (tile → source-sheet deep links, spec §5.4).
 *
 * A DEV-ONLY render harness whose sole purpose is to feed the real-browser
 * Playwright spec `tests/e2e/source-link-dimensional.spec.ts`. It mounts the four
 * measured crew primitives TWICE — once inside a `SectionCard` whose header
 * `action` slot carries a `<SourceLink/>`, once inside an otherwise-identical
 * `SectionCard` with `action={undefined}` — so the spec gets a real-browser
 * no-link CONTROL without depending on app seed data or the global Task-9 card
 * wiring (plan-R4 finding 1: explicit control render).
 *
 * Dimensional invariant under test (spec §5.4): the header `SourceLink` must NOT
 * change the height of ANY data row. The spec reads
 * `getBoundingClientRect().height` of each `dim-*` row inside BOTH containers and
 * asserts the per-row delta is ≤ 0.5px. The harness passes IDENTICAL props to
 * both copies so any height delta is attributable ONLY to the presence of the
 * header link (the variable under test) — nothing else differs.
 *
 * ── Build-time gating (mirrors /admin/dev) ────────────────────────────────────
 * This route lives under `app/admin/dev/` and is gated build-time by
 * `scripts/with-admin-dev-flag.mjs`: when ADMIN_DEV_PANEL_ENABLED is NOT 'true'
 * at build time the wrapper renames this file aside (`.disabled-by-build-gate`)
 * BEFORE `next build`, so the production artifact literally does NOT contain the
 * route (the /admin/dev build-artifact gate, M3 Round-1 Finding 1). This file is
 * registered in that script's FILES array alongside app/admin/dev/page.tsx +
 * actions.ts. Like /admin/dev, this harness calls requireDeveloper() at the same
 * chokepoint (developer-tier §6: swapped requireAdmin → requireDeveloper) so the
 * trust-domain auth-chain audit classifies it identically (chain: requireDeveloper).
 * The page is also unreachable in production (renamed away pre-build); in the dev
 * build it renders for a signed-in developer, matching /admin/dev's posture.
 *
 * UI is intentionally minimal/unstyled chrome (a fixed-width column) — the
 * measured primitives carry their own production styling; the harness wraps them
 * so the spec can read row heights. Server Component (no 'use client').
 */
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { PersonRow } from "@/components/crew/primitives/PersonRow";
import { FactRows } from "@/components/crew/primitives/FactRows";
import { KeyValueRows } from "@/components/crew/primitives/KeyValueRows";
import { KeyTimesStrip } from "@/components/crew/primitives/KeyTimesStrip";
import { ClockIcon } from "@/components/crew/icons/sectionIcons";
import { requireDeveloper } from "@/lib/auth/requireDeveloper";
import type { ReactNode } from "react";

// Never cache — the fixture is static, but force-dynamic keeps the harness
// render deterministic and matches /admin/dev's posture.
export const dynamic = "force-dynamic";

/**
 * Identical fixture content for BOTH cards. Each primitive is given the minimal
 * valid props that produce exactly ONE present (non-sentinel) row, so the spec
 * measures a single stable row per primitive.
 */
function MeasuredBody(): ReactNode {
  return (
    <>
      {/* PersonRow — one named person with a role (no phone/email/notes so the
          row is a single identity line). */}
      <div data-testid="dim-personrow">
        <PersonRow person={{ name: "Jordan Rivera", role: "Producer" }} />
      </div>

      {/* FactRows — exactly one present fact row (non-sentinel value). */}
      <div data-testid="dim-factrow">
        <FactRows rows={[{ k: "Load-in", v: "7:00 AM" }]} />
      </div>

      {/* KeyValueRows — exactly one present key/value row (non-sentinel value). */}
      <div data-testid="dim-kvrow">
        <KeyValueRows rows={[{ k: "Hotel", v: "The Waldorf" }]} />
      </div>

      {/* KeyTimesStrip — one present anchor (Set) so the strip renders one row. */}
      <div data-testid="dim-keytime">
        <KeyTimesStrip anchors={{ set: "6:00 AM" }} />
      </div>
    </>
  );
}

export default async function SourceLinkDimPage() {
  // Same chokepoint as /admin/dev (app/admin/dev/page.tsx) so the trust-domain
  // auth-chain audit classifies this harness route identically (chain: requireDeveloper).
  await requireDeveloper();
  return (
    <main
      className="mx-auto flex max-w-md flex-col gap-6 p-6"
      data-testid="source-link-dim-harness"
    >
      <h1 className="text-sm font-semibold">source-link dimensional-invariant harness</h1>

      {/* WITH the header SourceLink. Fixed-width column (max-w-md on <main>) so
          both cards lay out at the same width → any row-height delta is
          attributable to the header link alone. */}
      <div data-testid="card-with-link">
        <SectionCard
          title="INFO"
          action={<SourceLink driveFileId="x" anchor={{ title: "INFO", gid: 0, a1: "A1:B2" }} />}
        >
          <MeasuredBody />
        </SectionCard>
      </div>

      {/* WITHOUT the header SourceLink (control): identical title/children,
          action={undefined}. Both cards render a header (driven by `title`); only
          the `action` slot's presence differs — the variable under test. */}
      <div data-testid="card-no-link">
        <SectionCard title="INFO" action={undefined}>
          <MeasuredBody />
        </SectionCard>
      </div>

      {/* WITH the full CardHeaderActions cluster (SourceLink + CardReportTrigger)
          in the header action slot: identical title/children. The report trigger
          is a recessive sibling to the link; this card lets the spec verify the
          trigger does NOT perturb data-row heights vs. the no-link control, and
          that neither affordance stretches the header band. */}
      <div data-testid="card-with-actions">
        <SectionCard
          title="INFO"
          action={
            <CardHeaderActions
              cardId="today-dress"
              driveFileId="harness-drive"
              anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }}
              showId="harness-show"
            />
          }
        >
          <MeasuredBody />
        </SectionCard>
      </div>

      {/* CARDREPORT-1 (spec §4.1): UP-direction hit-target context. An interactive
          `tel:` row sits ABOVE the actions SectionCard at the tightest real
          inter-card gap (gap-3), and another interactive `tel:` row is the card's
          FIRST body child. The e2e probe asserts the header affordances reach 44px
          upward, never bleed downward onto the below row, and never reach the row
          above. */}
      <div data-testid="card-actions-up" className="flex flex-col gap-3">
        <a
          data-testid="dim-tel-above"
          href="tel:5085550100"
          className="inline-flex min-h-tap-min items-center text-sm"
        >
          Call sheet lead
        </a>
        <SectionCard
          icon={<ClockIcon />}
          title="Tonight"
          action={
            <CardHeaderActions
              cardId="today-dress"
              driveFileId="harness-drive"
              anchor={{ title: "INFO", gid: 0, a1: "A1:B2" }}
              showId="harness-show"
            />
          }
        >
          <a
            data-testid="dim-tel-below"
            href="tel:5085550111"
            className="inline-flex min-h-tap-min items-center text-sm"
          >
            Call venue
          </a>
        </SectionCard>
      </div>

      {/* CARDREPORT-1 (spec §4.1): DOWN-direction hit-target context — a replica of
          the bare `schedule-days` header (NOT a SectionCard). A possibly-interactive
          agenda link sits ABOVE; a non-interactive day-card stub sits BELOW. The
          e2e probe asserts the affordances reach 44px downward and never bleed
          upward onto the agenda link. */}
      <div data-testid="card-actions-down" className="flex flex-col gap-4">
        <a
          data-testid="dim-agenda-above"
          href="#agenda"
          className="inline-flex min-h-tap-min items-center text-sm"
        >
          Full agenda (PDF)
        </a>
        <div className="mb-2 flex justify-end">
          <div data-slot="section-card-action" className="flex shrink-0 items-center">
            <CardHeaderActions
              cardId="schedule-days"
              driveFileId="harness-drive"
              anchor={{ title: "SCHED", gid: 1, a1: "A1:B2" }}
              showId="harness-show"
              hitDirection="down"
            />
          </div>
        </div>
        <div
          data-testid="dim-daycard-below"
          className="rounded-md border border-border p-tile-pad text-sm text-text-subtle"
        >
          Fri · Show day
        </div>
      </div>
    </main>
  );
}
