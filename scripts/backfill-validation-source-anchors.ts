// scripts/backfill-validation-source-anchors.ts
//
// One-shot, NON-DESTRUCTIVE backfill of `shows.source_anchors` for the
// validation project. The validation reseed (`validation-reseed.ts`) mints
// fixtures via `mint_validation_fixture_atomic` and never runs the Drive sync
// that computes `extractSourceAnchors`, so every seeded show ships with
// `source_anchors = {}`. With no region anchor, `SourceLink` emits the base
// sheet URL (no `#gid=`) and Google Sheets opens the document's last-active
// tab — which is why the Schedule "In sheet" link lands on GEAR.
//
// This script reuses the EXACT production helpers (fetchSheetMarkdownWithBinding
// → xlsx bytes, fetchSheetTitleToGid, extractSourceAnchors) to compute anchors
// from each show's real Google Sheet, then UPDATEs ONLY the source_anchors
// column. Crew rosters / alias maps / seed dates (the fixture invariants) are
// untouched. Re-run after a `pnpm validation:reseed` (which resets anchors).
//
// Run: pnpm tsx scripts/backfill-validation-source-anchors.ts [--dry-run]
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

import { fetchSheetMarkdownWithBinding } from "@/lib/drive/fetch";
import { fetchSheetTitleToGid } from "@/lib/drive/sheetGids";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";

const DRY_RUN = process.argv.includes("--dry-run");

function log(msg: string): void {
  process.stderr.write(`[backfill-anchors] ${msg}\n`);
}

/**
 * Locked anchor write with the TOCTOU stamp guard (spec 2026-08-09-m-wave-2 §2.3,
 * review r5 F1). The script fetches Drive bytes BEFORE this transaction, so a sync
 * committing revision R2 in that window would otherwise let R1-computed anchors
 * carry an R2-matching stamp. `w1` is the watermark read BEFORE the Drive fetch;
 * inside the locked tx the watermark is re-read as W2. Equal → stamp W1 (the
 * validation fixture's watermark is synthetic `now()`, so the row's OWN watermark —
 * not a Drive revision — is the only stamp that can ever match; review r4 F2).
 * W1 ≠ W2 → the anchors are written with a NULL stamp plus a re-run warning:
 * conservative demote with a surfaced signal, never a fresh-stamped stale map.
 *
 * Exported for the unit rows (unraced: stamp = watermark; raced: NULL + warning).
 */
export async function writeBackfilledAnchors(
  sql: ReturnType<typeof postgres>,
  show: { id: string; slug: string; drive_file_id: string },
  anchors: Record<string, unknown>,
  w1: string | null,
  emit: (msg: string) => void = log,
): Promise<{ raced: boolean }> {
  let raced = false;
  await sql.begin(async (tx) => {
    // AGENTS.md plan-wide invariant 2: mutating `shows` must run inside the per-show
    // advisory lock. Admin/blocking backfill → BLOCKING pg_advisory_xact_lock on the
    // canonical hashkey, in the SAME transaction as the UPDATE. (idx38/#178)
    await tx`select pg_advisory_xact_lock(hashtext('show:' || ${show.drive_file_id}))`;
    const w2Rows = (await tx`
      select last_seen_modified_time from shows where id = ${show.id}
    `) as { last_seen_modified_time: string | Date | null }[];
    const iso = (v: string | Date | null | undefined): string | null =>
      v == null ? null : new Date(v).toISOString();
    raced = iso(w1) === null || iso(w1) !== iso(w2Rows[0]?.last_seen_modified_time);
    const stamp = raced ? null : iso(w1);
    await tx`
      update shows
         set source_anchors = ${tx.json(anchors as never)},
             source_anchors_modified_time = ${stamp}
       where id = ${show.id}
    `;
  });
  if (raced) {
    emit(
      `  ↳ RACED: watermark moved between the Drive fetch and the locked write for ${show.slug}; ` +
        `anchors written with a NULL stamp (readers will serve the #gid=0 fallback) — re-run this script.`,
    );
  }
  return { raced };
}

async function main(): Promise<void> {
  // Mirror Next.js's env-loading order so TEST_DATABASE_URL + the Google
  // service-account creds resolve from .env.local. Called before any consumer;
  // the Drive client reads its env lazily at call-time, so import order is safe.
  loadEnvConfig(process.cwd(), false);

  const dbUrl = process.env.TEST_DATABASE_URL;
  if (!dbUrl) throw new Error("TEST_DATABASE_URL is required (validation project DB).");
  const host = dbUrl.replace(/.*@([^:/]+).*/, "$1");
  // Safety: this script WRITES. Refuse anything that isn't the remote validation
  // pooler so a stray local DATABASE_URL can never be the target.
  if (!host.includes("pooler.supabase.com")) {
    throw new Error(`Refusing to write to non-validation host '${host}'.`);
  }
  log(`target host=${host} dry_run=${DRY_RUN}`);

  const sql = postgres(dbUrl, { max: 1, prepare: false });
  try {
    const shows = (await sql`
      select id, slug, drive_file_id, last_seen_modified_time
        from shows
       where drive_file_id is not null
       order by slug
    `) as {
      id: string;
      slug: string;
      drive_file_id: string;
      last_seen_modified_time: string | Date | null;
    }[];
    log(`shows=${shows.length}`);

    for (const show of shows) {
      try {
        const { bytes } = await fetchSheetMarkdownWithBinding(show.drive_file_id);
        const titleToGid = await fetchSheetTitleToGid(show.drive_file_id);
        const anchors = extractSourceAnchors(bytes, titleToGid);
        const keys = Object.keys(anchors);
        const schedule = anchors.schedule ? JSON.stringify(anchors.schedule) : "(none)";
        log(`${show.slug}: ${keys.length} anchors; schedule=${schedule}`);
        if (keys.length === 0) {
          log(`  ↳ SKIP write (extraction produced 0 anchors — investigate, not clobbering)`);
          continue;
        }
        if (!DRY_RUN) {
          // W1 was read with the show list BEFORE the Drive fetch above; the locked
          // write re-reads it as W2 and stamps only when they agree (TOCTOU guard).
          const w1 =
            show.last_seen_modified_time == null
              ? null
              : new Date(show.last_seen_modified_time).toISOString();
          const { raced } = await writeBackfilledAnchors(sql, show, anchors, w1);
          log(`  ↳ wrote ${keys.length} anchors${raced ? " (NULL stamp — raced)" : ""}`);
        }
      } catch (err) {
        log(`${show.slug}: ERROR ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Direct-run guard: the unit rows import `writeBackfilledAnchors` from this module,
// and an import must never fire the whole backfill against the validation project.
if (process.argv[1]?.includes("backfill-validation-source-anchors")) {
  main().catch((err) => {
    process.stderr.write(
      `[backfill-anchors] FATAL: ${err instanceof Error ? err.stack : String(err)}\n`,
    );
    process.exit(1);
  });
}
