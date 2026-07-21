/**
 * lib/dev/buildScenarioModalData.ts
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.2)
 *
 * The ATOMIC per-scenario modal-data builder: from ONE scenario it derives
 * `data`, `bySection`, and `attentionItems` correlated to the SAME scenario, so
 * the warning model is never built from the default snapshot while the items
 * come from the scenario. It also shapes `data` so the modal's OWN placement
 * (`anchorsForData`) reproduces the scenario's structural intent — anchored
 * alerts land in rooms/event, except `T2_ANCHOR_ABSENT` which stays anchorless
 * so the modal's bucketer redirects it to Overview.
 */
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import { T2_ANCHOR_ABSENT } from "@/lib/dev/attentionScenarios/tier2";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import {
  buildGallerySnapshot,
  buildGalleryModalData,
  type AnchorFlags,
} from "@/lib/dev/publishedModalFixture";
import { GALLERY_SLUG, type GalleryModalData } from "@/lib/dev/galleryModalTypes";

/**
 * Which anchors the scenario's alert codes need present so they land in their
 * true section. `T2_ANCHOR_ABSENT` deliberately returns none (its intent is an
 * absent anchor → Overview fallback).
 */
export function anchorsWantedFor(s: AttentionScenario): AnchorFlags {
  if (s.id === T2_ANCHOR_ABSENT) return {};
  const flags: AnchorFlags = {};
  for (const a of s.alerts) {
    const anchor = ATTENTION_ROUTES[a.code]?.anchor;
    if (anchor === "diagrams") flags.diagrams = true;
    if (anchor === "opening_reel") flags.openingReel = true;
  }
  return flags;
}

export function buildScenarioModalData(s: AttentionScenario): GalleryModalData {
  const warnings = s.warnings ?? [];
  const snap = buildGallerySnapshot(warnings, { anchors: anchorsWantedFor(s) });
  const data = buildPublishedSectionData(snap, { slug: GALLERY_SLUG });
  const bySection = buildSectionWarningModel({
    slug: GALLERY_SLUG,
    warnings: data.warnings,
    ignoredFingerprints: new Set<string>(),
    renderedSectionIds: new Set(step3Sections(data).map((x) => x.id)),
  });
  const attentionItems = deriveScenarioAttention(s);
  return buildGalleryModalData({
    data,
    bySection,
    attentionItems,
    alertsDegraded: s.degraded ?? false,
  });
}
