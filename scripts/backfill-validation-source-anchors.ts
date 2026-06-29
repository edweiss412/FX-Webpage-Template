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
      select id, slug, drive_file_id
        from shows
       where drive_file_id is not null
       order by slug
    `) as { id: string; slug: string; drive_file_id: string }[];
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
          await sql`
            update shows
               set source_anchors = ${sql.json(anchors)}
             where id = ${show.id}
          `;
          log(`  ↳ wrote ${keys.length} anchors`);
        }
      } catch (err) {
        log(`${show.slug}: ERROR ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(
    `[backfill-anchors] FATAL: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
