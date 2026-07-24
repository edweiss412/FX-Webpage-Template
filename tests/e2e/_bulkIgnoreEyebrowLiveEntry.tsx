/**
 * tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx (crewwarn-instance-discriminator Task 5)
 *
 * Browser ENTRY for the LIVE eyebrow-wrap harness: mounts the REAL
 * <BulkIgnoreControls> (components/admin/BulkIgnoreControls.tsx) with
 * react-dom/client so the 390px eyebrow/chip geometry — including the armed
 * morph entered by a real click — is measured against real component JS under
 * real compiled Tailwind (jsdom computes no layout).
 *
 * NEVER imported by a Playwright spec (its test transform rewrites JSX in
 * spec-imported .tsx into component-testing payloads); the spec bundles this
 * file with a version-pinned `pnpm dlx esbuild@0.28.0` and serves it over
 * node:http (pattern: _blockedRowResolverLiveEntry.tsx).
 *
 * Router: BulkIgnoreControls calls useRouter, so the tree is wrapped in
 * AppRouterContext.Provider with a no-op stub (pattern:
 * _step3ReviewModalHarness.tsx). WarningAnnounceContext needs no provider —
 * its default is the NOOP announcer.
 *
 * Fixture: the FIELD_UNREADABLE group's eyebrow label is the LIVE catalog
 * title (MESSAGE_CATALOG.FIELD_UNREADABLE.title) so the spec's independent
 * EXPECTED_TITLE byte literal catches catalog drift; `bulk` carries 2 items so
 * the chip reads "Ignore all 2" / "Confirm ignore all 2". The chip never
 * completes an ignore here — no fetch fires until a second (confirm) click,
 * and the spec only ever arms.
 */
import { createRoot } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { BulkIgnoreControls, type ActiveWarningGroup } from "@/components/admin/BulkIgnoreControls";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const routerStub = {
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
} as unknown as AppRouterInstance;

const groups: ActiveWarningGroup[] = [
  {
    code: "FIELD_UNREADABLE",
    label: MESSAGE_CATALOG.FIELD_UNREADABLE.title,
    bulk: {
      code: "FIELD_UNREADABLE",
      label: MESSAGE_CATALOG.FIELD_UNREADABLE.title,
      items: [
        { code: "FIELD_UNREADABLE", rawSnippet: "call the office" },
        { code: "FIELD_UNREADABLE", rawSnippet: "jordan-at" },
      ],
    },
    cards: <div data-testid="harness-cards-placeholder" />,
  },
  {
    code: "UNKNOWN_SECTION_HEADER",
    label: MESSAGE_CATALOG.UNKNOWN_SECTION_HEADER.title,
    bulk: null,
    cards: <div />,
  },
];

createRoot(document.getElementById("root")!).render(
  <AppRouterContext.Provider value={routerStub}>
    {/* p-tile-pad mirrors the padded panel card the DEFERRED entry names as the
        width squeeze at 390px */}
    <div className="p-tile-pad" data-testid="harness-mount">
      <BulkIgnoreControls slug="harness" groups={groups} />
    </div>
  </AppRouterContext.Provider>,
);
