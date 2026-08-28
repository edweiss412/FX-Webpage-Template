/**
 * lib/sync/carryStagedIgnoredWarnings.ts
 *
 * The finalize hop that turns a wizard row's STAGED ignore decisions into durable rows in
 * `public.ignored_warnings` (spec 2026-08-28-wizard-warning-ignore-controls §2.7).
 *
 * A FIRST-SEEN wizard row has no `shows` record while the operator reviews it, so its
 * decisions live in `pending_syncs.ignored_warnings`. Finalize is the first moment a show
 * id exists, which is why the write lands here — inside the phase-2 apply, on the same
 * locked transaction, against `snapshot.showId` on BOTH the create and update paths.
 */
import { canonicalize } from "@/lib/email/canonicalize";
import type { HoldPort } from "@/lib/sync/holds/holdPort";
import type { StagedIgnoreEntry } from "@/lib/admin/wizardWarningModel";

/**
 * The entries that can actually become durable rows.
 *
 * `pending_syncs.ignored_warnings` carries no CHECK by design (one writer, coercion on
 * read), but `public.ignored_warnings` DOES: `ignored_by` must be canonical and non-empty.
 * So canonicalize here and DROP what cannot satisfy it. The alternative — handing a bad
 * value to the insert — turns one malformed staged entry into a failed publish, which is a
 * far worse outcome than losing that entry's dismissal (invariant 3 at the boundary).
 */
export function carryableIgnoreEntries(entries: readonly StagedIgnoreEntry[]): StagedIgnoreEntry[] {
  const out: StagedIgnoreEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry?.fingerprint !== "string" || entry.fingerprint.length === 0) continue;
    const ignoredBy = canonicalize(entry.ignored_by);
    if (ignoredBy === null) continue;
    // The durable table is unique on (show_id, fingerprint); de-duplicating here keeps the
    // statement count honest rather than leaning on `do nothing` to hide a duplicate.
    if (seen.has(entry.fingerprint)) continue;
    seen.add(entry.fingerprint);
    out.push({
      fingerprint: entry.fingerprint,
      code: typeof entry.code === "string" ? entry.code : "",
      ignored_by: ignoredBy,
    });
  }
  return out;
}

/**
 * Insert the carryable entries for `showId`.
 *
 * `on conflict (show_id, fingerprint) do nothing`, so a re-apply is a no-op and a
 * fingerprint the operator also ignored through the published route lands once (spec §7).
 * The staging-time `ignored_by` is preserved: the durable row should record who made the
 * decision, not who happened to run finalize.
 *
 * FAULT POSTURE (§2.7): nothing here is caught. A write fault propagates out of the phase-2
 * transaction exactly as the neighbouring use-raw re-persist's would, and an absent port
 * throws rather than returning quietly — a publish that silently dropped the carry looks
 * identical to a successful one, and the operator would only discover it when every warning
 * they dismissed came back on the published page.
 */
export async function carryStagedIgnoredWarnings(
  port: HoldPort | undefined,
  args: { showId: string; entries: readonly StagedIgnoreEntry[] },
): Promise<void> {
  const carryable = carryableIgnoreEntries(args.entries);
  if (carryable.length === 0) return;
  if (!port) {
    throw new Error(
      "staged ignore carry: locked pipeline tx exposes no holdPort, so the operator's " +
        "ignore decisions cannot be made durable. Refusing to publish them away silently.",
    );
  }
  for (const entry of carryable) {
    // not-subject-to-meta: service-role SQL inside the JS-held show lock (no {data,error} client).
    await port.unsafe(
      `insert into public.ignored_warnings (show_id, fingerprint, code, ignored_by)
       values ($1, $2, $3, $4)
       on conflict (show_id, fingerprint) do nothing`,
      [args.showId, entry.fingerprint, entry.code, entry.ignored_by],
    );
  }
}
