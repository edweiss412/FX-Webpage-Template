/**
 * app/admin/dev/attention-gallery/buildSwitcherScenarios.ts
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.2)
 *
 * The server-side partition feeding the switcher. A scenario RENDERS only if the
 * modal can both reproduce its placement (EXPRESSIBLE) and show something
 * (VISIBLE). The two exclusion axes are orthogonal, with `"structural"` taking
 * precedence in the label:
 *   - structural: the scenario overrides a placement predicate the modal derives
 *     from its own data (`sectionAvailable` / `crewKeyRendered`) — not
 *     reproducible by fixture data, so rendering it would MISPLACE the item.
 *   - cut: the scenario DECLARES attention whose codes are cut from the
 *     published attention surface (`DOUG_EXCLUDED_CODES`), so it yields an empty
 *     modal the real modal also never presents.
 * A scenario that declares NO attention (e.g. `T2_EMPTY`) is the clean-modal
 * baseline and RENDERS — a real, useful state.
 */
import { ALL_SCENARIOS } from "@/lib/dev/attentionScenarios/index";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { sectionForWarning } from "@/lib/admin/step3SectionStatus";
import { GROUP_ORDER, type ScenarioGroupId } from "@/lib/dev/galleryModalTypes";
import { buildScenarioModalData } from "@/lib/dev/buildScenarioModalData";
import type { GallerySwitcherScenario, ExcludedScenario } from "@/lib/dev/galleryModalTypes";

/** Reproducible in the modal iff it does not override a modal-internal predicate. */
export function isModalExpressible(s: AttentionScenario): boolean {
  return s.bucket?.sectionAvailable === undefined && s.bucket?.crewKeyRendered === undefined;
}

/** Shows something in the modal: a derived item, a warning, degraded, or the clean baseline. */
export function isModalVisible(s: AttentionScenario): boolean {
  return (
    deriveScenarioAttention(s).length > 0 ||
    (s.warnings?.length ?? 0) > 0 ||
    s.degraded === true ||
    (s.alerts.length === 0 && s.holds.length === 0)
  );
}

function codesFor(s: AttentionScenario): string[] {
  return [...new Set([...s.alerts.map((a) => a.code), ...(s.warnings?.map((w) => w.code) ?? [])])];
}

/** Landing group from the REAL routers (spec §3.5): derived item sections ∪ warning sections. */
export function scenarioGroup(s: AttentionScenario): ScenarioGroupId {
  const sections = new Set<string>();
  for (const item of deriveScenarioAttention(s)) sections.add(item.sectionId);
  for (const w of s.warnings ?? []) sections.add(sectionForWarning(w) ?? "warnings");
  if (sections.size === 0) return "baseline";
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
    rendered.push({
      id: s.id,
      tier: s.tier,
      label: s.label,
      codes: codesFor(s),
      group: scenarioGroup(s),
      data: buildScenarioModalData(s),
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
