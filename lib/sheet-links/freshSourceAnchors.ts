/**
 * BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH (spec 2026-08-09-m-wave-2-design
 * §2.3, ratified): the ONE shared freshness gate applied wherever a
 * `shows.source_anchors` map leaves the data layer.
 *
 * `shows.source_anchors_modified_time` stamps the Drive `modifiedTime` the
 * anchors were computed FROM; `shows.last_seen_modified_time` is the revision
 * the show's DATA came from. When the two disagree, the anchors describe an
 * older workbook layout than the content on screen — a deep link built from
 * them can land on the wrong tab/range. The reader then demotes to the
 * builder's existing `#gid=0` fallback arm (conservative demote, surfaced as a
 * first-tab link — never a wrong-tab link).
 *
 * NULL stamp = provenance unknown = mismatch, deliberately: an anchor map whose
 * revision nobody recorded cannot be proven fresh. (Legacy rows are
 * grandfathered by the migration backfill, which stamps them with their own
 * `last_seen_modified_time` — see the migration; a NULL here is post-migration
 * evidence of a preserved-map path that lost its stamp, or a raced validation
 * backfill that declined to guess.)
 */
export function freshSourceAnchors<T>(
  anchors: Record<string, T> | null | undefined,
  anchorsModifiedTime: string | null | undefined,
  lastSeenModifiedTime: string | null | undefined,
): Record<string, T> {
  if (!anchors) return {};
  if (!anchorsModifiedTime || !lastSeenModifiedTime) return {};
  return anchorsModifiedTime === lastSeenModifiedTime ? anchors : {};
}
