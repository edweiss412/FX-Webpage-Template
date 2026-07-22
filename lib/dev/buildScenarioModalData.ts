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
// SERVER-SAFE section inclusion — NOT the `"use client"` `step3Sections` from
// step3ReviewSections. This module runs inside the server route (via
// partitionScenarios), and calling a client function from the server throws
// ("Attempted to call step3Sections() from the server"). `renderedSectionIds`
// carries the same inclusion logic with no client references — the exact
// substitution production makes at app/admin/_showReviewModal.tsx:326.
import { renderedSectionIds } from "@/components/admin/review/sectionInclusion";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import { T2_ANCHOR_ABSENT } from "@/lib/dev/attentionScenarios/tier2";
import { deriveScenarioAttention, buildScenarioFeed } from "@/lib/dev/deriveScenarioAttention";
import {
  applyFixture,
  buildGallerySnapshot,
  buildGalleryModalData,
  type AnchorFlags,
} from "@/lib/dev/publishedModalFixture";
import { GALLERY_SLUG, type GalleryModalData } from "@/lib/dev/galleryModalTypes";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";

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
  const attentionItems = deriveScenarioAttention(s);
  // alertFlash targets the first SURVIVING derived alert item (validateScenario
  // guarantees one exists) — never the raw alert list, whose first row may be
  // cut/excluded and would strand the modal in its no-match fallback.
  const firstAlertItem = attentionItems.find((i) => i.kind === "alert");
  const firstSurvivingAlertId =
    firstAlertItem !== undefined && firstAlertItem.kind === "alert"
      ? firstAlertItem.alert.alertId
      : undefined;
  const { snapshot, dataOverrides } = applyFixture(
    buildGallerySnapshot(warnings, { anchors: anchorsWantedFor(s) }),
    s.fixture,
    firstSurvivingAlertId !== undefined ? { firstSurvivingAlertId } : {},
  );
  const data = dataOverrides.data ?? buildPublishedSectionData(snapshot, { slug: GALLERY_SLUG });
  // Content-keyed ignores: indexes into the scenario's warnings, fingerprinted
  // through the REAL warningFingerprint (validateScenario guarantees each target
  // has a non-blank rawSnippet and no active-fingerprint collision).
  const ignoredFingerprints = new Set<string>(
    (s.ignoreWarningIndexes ?? [])
      .map((i) => (warnings[i] !== undefined ? warningFingerprint(warnings[i]!) : null))
      .filter((f): f is string => f !== null),
  );
  const bySection = buildSectionWarningModel({
    slug: GALLERY_SLUG,
    warnings: data.warnings,
    ignoredFingerprints,
    renderedSectionIds: new Set(renderedSectionIds(data)),
  });
  const feed = buildScenarioFeed(s);
  return buildGalleryModalData({
    ...dataOverrides,
    data,
    bySection,
    attentionItems,
    alertsDegraded: s.degraded ?? false,
    // The Changes feed must carry the same holds the changes-rail badge counts,
    // or a hold-bearing scenario shows a badge over an empty feed (Codex R1 P1).
    // feedNull renders ChangesSection's infra-error notice via an explicit null.
    ...(s.feedNull === true ? { feed: null } : feed !== null ? { feed } : {}),
  });
}
