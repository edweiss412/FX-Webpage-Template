/**
 * app/admin/dev/attention-gallery/buildSwitcherScenarios.ts
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.2)
 *
 * The server-side partition feeding the switcher. A scenario RENDERS only if the
 * modal can reproduce its placement (EXPRESSIBLE), show something (VISIBLE), and
 * carry contents a real show can hold (SHOW-SCOPE REACHABLE). The three
 * exclusion axes are orthogonal and evaluated in the order below; the first that
 * fires owns the label:
 *   - structural: the scenario overrides a placement predicate the modal derives
 *     from its own data (`sectionAvailable` / `crewKeyRendered`) — not
 *     reproducible by fixture data, so rendering it would MISPLACE the item.
 *   - cut: the scenario DECLARES attention whose codes are cut from the
 *     published attention surface (`DOUG_EXCLUDED_CODES`), so it yields an empty
 *     modal the real modal also never presents. An AUDIENCE decision.
 *   - global: a tier-1 scenario for a code whose producers always write
 *     `show_id: null` (`GLOBAL_SCOPE_CODES`), so `fetchPerShowAlerts` can never
 *     deliver it and the card would be fiction. A SCOPE decision, orthogonal to
 *     audience — five codes are both, and `cut` wins because it runs first.
 * A scenario that declares NO attention (e.g. `T2_EMPTY`) is the clean-modal
 * baseline and RENDERS — a real, useful state.
 */
import { ALL_SCENARIOS } from "@/lib/dev/attentionScenarios/index";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { sectionForWarning } from "@/lib/admin/step3SectionStatus";
import { renderedSectionIds } from "@/components/admin/review/sectionInclusion";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { GLOBAL_SCOPE_CODES } from "@/lib/adminAlerts/alertScope";
import { anchorsWantedFor } from "@/lib/dev/buildScenarioModalData";
import { GROUP_ORDER, type ScenarioGroupId } from "@/lib/dev/galleryModalTypes";
import { buildScenarioModalData } from "@/lib/dev/buildScenarioModalData";
import type {
  GallerySwitcherScenario,
  ExcludedScenario,
  GalleryModalData,
} from "@/lib/dev/galleryModalTypes";

/** Reproducible in the modal iff it does not override a modal-internal predicate. */
export function isModalExpressible(s: AttentionScenario): boolean {
  return s.bucket?.sectionAvailable === undefined && s.bucket?.crewKeyRendered === undefined;
}

/**
 * Shows something in the modal: a derived item, a warning, degraded, a
 * modal-state carrier (feedNull / change-log entries / an effective fixture —
 * validateScenario rejects no-op knobs, so presence implies effect), or the
 * clean baseline. Without the carrier arm, a scenario combining a cut-only
 * alert with a state carrier would be mislabeled "cut" and dropped.
 */
export function isModalVisible(s: AttentionScenario): boolean {
  return (
    deriveScenarioAttention(s).length > 0 ||
    (s.warnings?.length ?? 0) > 0 ||
    s.degraded === true ||
    s.feedNull === true ||
    (s.changeLog?.length ?? 0) > 0 ||
    s.fixture !== undefined ||
    s.actionOutcomes !== undefined ||
    (s.alerts.length === 0 && s.holds.length === 0)
  );
}

/**
 * Reachable on a real show modal iff NONE of the scenario's alerts is
 * global-scope.
 *
 * ANY global alert makes the card fiction: `deriveScenarioAttention` derives an
 * item for every declared alert and the modal renders it, so a carrier, a hold,
 * or a per-show sibling changes what ELSE the card shows without making the
 * global alert reachable. `fetchPerShowAlerts` filters `.eq("show_id", showId)`
 * regardless of what else sits on the show
 * (lib/adminAlerts/fetchPerShowAlerts.ts:83).
 *
 * In practice this fires only on tier-1 cards: the catalogue guard in
 * tests/app/admin/attentionModalGallery.serverProps.test.ts forbids a tier-2 or
 * tier-3 scenario from declaring a global code at all, so a composite fails at
 * authoring time rather than being silently dropped here with its per-show
 * alerts, holds, and sections.
 */
export function isShowScopeReachable(s: AttentionScenario): boolean {
  return !s.alerts.some((a) => GLOBAL_SCOPE_CODES.has(a.code));
}

function codesFor(s: AttentionScenario): string[] {
  return [...new Set([...s.alerts.map((a) => a.code), ...(s.warnings?.map((w) => w.code) ?? [])])];
}

/**
 * Landing group from the REAL routers (spec §3.5): derived item sections ∪
 * warning sections, with production's EFFECTIVE-placement fallbacks
 * (modal-state coverage §3.7):
 *  - a warning whose routed section is not rendered for this scenario's data
 *    lands in Sheet warnings (`warningsBySection` parity);
 *  - an anchored alert item whose anchor is absent from the data lands in
 *    Overview (the modal's unavailable-anchor redirect parity) — today that
 *    corrects exactly T2_ANCHOR_ABSENT;
 *  - a fixture/feed-only scenario with no sections takes its declared
 *    `landing`, falling back to "baseline".
 */
export function scenarioGroup(s: AttentionScenario, prebuilt?: GalleryModalData): ScenarioGroupId {
  const built = prebuilt ?? buildScenarioModalData(s);
  const rendered = new Set<string>(renderedSectionIds(built.data));
  // SERVER-SAFE anchor availability: the modal's own anchorsForData chain calls
  // "use client" helpers (hasDiagramSignal) and cannot run in this server
  // module. The gallery equivalent is exact by construction: the fixture
  // provides an anchor IFF anchorsWantedFor(s) sets its flag, and
  // T2_ANCHOR_ABSENT deliberately returns {} — so "wanted flag absent while the
  // route declares an anchor" IS the unavailable-anchor redirect condition.
  const flags = anchorsWantedFor(s);
  const sections = new Set<string>();
  for (const item of deriveScenarioAttention(s)) {
    if (item.kind === "alert") {
      const anchor = ATTENTION_ROUTES[item.alert.code]?.anchor;
      const available =
        anchor === "diagrams"
          ? flags.diagrams === true
          : anchor === "opening_reel"
            ? flags.openingReel === true
            : true;
      if (anchor !== undefined && !available) {
        sections.add("overview");
        continue;
      }
    }
    sections.add(item.sectionId);
  }
  for (const w of s.warnings ?? []) {
    const mapped = sectionForWarning(w);
    sections.add(mapped !== null && rendered.has(mapped) ? mapped : "warnings");
  }
  if (sections.size === 0) return s.landing ?? "baseline";
  if (sections.size > 1) return "mixed";
  const only = [...sections][0]!;
  // A single section outside the named groups (possible only via a kind-routed
  // warning landing in e.g. hotels) has no dedicated group; "mixed" is the
  // honest bucket rather than mislabeling it.
  return (GROUP_ORDER as readonly string[]).includes(only) ? (only as ScenarioGroupId) : "mixed";
}

export function partitionScenarios(): {
  rendered: GallerySwitcherScenario[];
  excluded: ExcludedScenario[];
} {
  const rendered: GallerySwitcherScenario[] = [];
  const excluded: ExcludedScenario[] = [];
  for (const s of ALL_SCENARIOS) {
    if (!isModalExpressible(s)) {
      excluded.push({ id: s.id, label: s.label, reason: "structural" });
      continue;
    }
    if (!isModalVisible(s)) {
      excluded.push({ id: s.id, label: s.label, reason: "cut" });
      continue;
    }
    // AFTER cut on purpose: the six health-audience global-scope codes fail
    // isModalVisible first and keep their existing "cut" label, so this arm
    // moves exactly the four doug-audience tier-1 cards. It applies to EVERY
    // tier: the catalogue no longer contains a composite that picks a
    // global-scope code (every tier-2 picker filters GLOBAL_SCOPE_CODES), and
    // the pin in tests/app/admin/attentionModalGallery.serverProps.test.ts
    // fails if one reappears — so this arm firing on a composite means the
    // catalogue regressed, not that coverage is being silently dropped.
    if (!isShowScopeReachable(s)) {
      excluded.push({ id: s.id, label: s.label, reason: "global" });
      continue;
    }
    const data = buildScenarioModalData(s);
    rendered.push({
      id: s.id,
      tier: s.tier,
      label: s.label,
      codes: codesFor(s),
      group: scenarioGroup(s, data),
      data,
      // A fixed synthetic token: real enough for URL/copy affordances, never a
      // live credential (the gallery has no DB show behind it).
      shareToken: s.fixture?.share?.linkActive === true ? "gallery-share-token" : null,
      actionOutcomes: s.actionOutcomes ?? null,
    });
  }
  // Group-ordered walk (spec §3.5); Array.prototype.sort is stable, so catalog
  // order is preserved within each group.
  rendered.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  return { rendered, excluded };
}

/**
 * The initial scenario id from `?scenario=`. Normalizes Next 16's
 * `string | string[] | undefined` (array → first element, first wins) and
 * returns the id only if it matches a RENDERED scenario; anything else → null
 * (the switcher starts at index 0).
 */
export function resolveInitialScenario(
  raw: string | string[] | undefined,
  rendered: GallerySwitcherScenario[],
): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string" || first.length === 0) return null;
  return rendered.some((s) => s.id === first) ? first : null;
}
