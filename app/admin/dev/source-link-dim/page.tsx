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
 * actions.ts. Unlike /admin/dev, this harness does NOT call requireAdmin(): it
 * renders only static fixture markup — no DB read, no auth-scoped data, no
 * secrets — so the build-artifact gate alone is the protection. The page is
 * unreachable in production (renamed away pre-build); in the dev build it renders
 * for any visitor, which is correct for a pure layout-measurement fixture.
 *
 * UI is intentionally minimal/unstyled chrome (a fixed-width column) — the
 * measured primitives carry their own production styling; the harness wraps them
 * so the spec can read row heights. Server Component (no 'use client').
 */
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { PersonRow } from "@/components/crew/primitives/PersonRow";
import { FactRows } from "@/components/crew/primitives/FactRows";
import { KeyValueRows } from "@/components/crew/primitives/KeyValueRows";
import { KeyTimesStrip } from "@/components/crew/primitives/KeyTimesStrip";
import { requireAdmin } from "@/lib/auth/requireAdmin";
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
  // auth-chain audit classifies this harness route identically (chain: requireAdmin).
  await requireAdmin();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6" data-testid="source-link-dim-harness">
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
    </main>
  );
}
