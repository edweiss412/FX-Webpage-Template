import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { canonicalize } from "../lib/email/canonicalize";
import { parseSheet } from "../lib/parser";
import { deriveSlug } from "../lib/parser/slug";
import type { ParsedSheet, PersistedDiagrams } from "../lib/parser/types";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const fixtureDir = join(process.cwd(), "fixtures/shows/raw");
const seedDrivePrefix = "seed-fixture:";
const restageRequiredFixture = "2026-04-asset-mgmt-cfo-coo-waldorf.md";
const seedAdminEmail = requiredCanonicalEmail("seed-mode@fxav.local");
const seedWatchedFolderId = "seed-fixture-folder";
const seedWatchedFolderName = "Seed fixture folder";
const seedWatchedFolderSetAt = "2026-01-01T12:00:00.000Z";

type FixtureSeed = {
  fileName: string;
  driveFileId: string;
  modifiedTime: string;
  slug: string;
  parsed: ParsedSheet;
  diagrams: SeedPersistedDiagrams;
};

type SeedPersistedDiagrams = Omit<PersistedDiagrams, "embeddedImages" | "linkedFolderItems"> & {
  embeddedImages: Array<PersistedDiagrams["embeddedImages"][number] & { sourceFolder: "embedded" }>;
  linkedFolderItems: Array<
    PersistedDiagrams["linkedFolderItems"][number] & {
      sourceFolder: "linked";
      recovery_disposition: "normal" | "restage_required";
    }
  >;
};

function requiredCanonicalEmail(raw: string): string {
  const canonical = canonicalize(raw);
  if (!canonical) {
    throw new Error(`Seed email did not canonicalize: ${raw}`);
  }
  return canonical;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableString(value: string | null | undefined): string {
  return value == null ? "null" : sqlString(value);
}

function sqlJson(value: unknown): string {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function sqlTextArray(values: readonly string[]): string {
  if (values.length === 0) {
    return "array[]::text[]";
  }

  return `array[${values.map(sqlString).join(", ")}]::text[]`;
}

function sqlTimestamp(value: string): string {
  return `${sqlString(value)}::timestamptz`;
}

function sqlNullableDate(value: string | null | undefined): string {
  return value == null ? "null" : `${sqlString(value)}::date`;
}

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function stableUuid(input: string): string {
  const hex = stableHash(input);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function fixtureDriveFileId(fileName: string): string {
  return `${seedDrivePrefix}${basename(fileName, ".md")}`;
}

function fixtureModifiedTime(index: number): string {
  return `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`;
}

function buildPersistedDiagrams(parsed: ParsedSheet, fileName: string, driveFileId: string) {
  const snapshotRevisionId = stableUuid(`${driveFileId}:snapshot`);

  if (fileName === restageRequiredFixture) {
    return {
      snapshot_revision_id: snapshotRevisionId,
      snapshot_status: "partial_failure_restage_required",
      linkedFolder: parsed.diagrams.linkedFolder,
      embeddedImages: [
        {
          objectId: `${stableHash(`${driveFileId}:embedded:missing`).slice(0, 12)}`,
          sheetTab: "DIAGRAMS",
          mimeType: "image/png",
          alt: "Seeded embedded diagram with missing fingerprint",
          sheetsRevisionId: `${stableHash(`${driveFileId}:sheets`).slice(0, 16)}`,
          embeddedFingerprint: null,
          recovery_disposition: "restage_required",
          snapshotPath: null,
          sourceFolder: "embedded",
        },
      ],
      linkedFolderItems: [],
    } satisfies SeedPersistedDiagrams;
  }

  return {
    snapshot_revision_id: snapshotRevisionId,
    snapshot_status: "complete",
    linkedFolder: parsed.diagrams.linkedFolder,
    embeddedImages: [],
    linkedFolderItems: [],
  } satisfies SeedPersistedDiagrams;
}

function loadFixtures(): FixtureSeed[] {
  const fixtureFiles = readdirSync(fixtureDir)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort();
  const existingSlugs = loadExistingNonSeedSlugs();

  return fixtureFiles.map((fileName, index) => {
    const raw = readFileSync(join(fixtureDir, fileName), "utf8");
    const parsed = parseSheet(raw, fileName);
    if (parsed.hardErrors.length > 0) {
      throw new Error(
        `Seed fixture ${fileName} failed parse: ${parsed.hardErrors
          .map((error) => error.code)
          .join(", ")}`,
      );
    }

    const driveFileId = fixtureDriveFileId(fileName);
    const slug = deriveSlug(parsed, existingSlugs);
    existingSlugs.push(slug);

    return {
      fileName,
      driveFileId,
      modifiedTime: fixtureModifiedTime(index),
      slug,
      parsed,
      diagrams: buildPersistedDiagrams(parsed, fileName, driveFileId),
    };
  });
}

function loadExistingNonSeedSlugs(): string[] {
  const output = runPsql(`
    select coalesce(jsonb_agg(slug order by slug), '[]'::jsonb)::text
      from public.shows
     where drive_file_id not like ${sqlString(`${seedDrivePrefix}%`)};
  `);
  return JSON.parse(output) as string[];
}

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function showInsertSql(seed: FixtureSeed): string {
  const { parsed } = seed;
  return `
    insert into public.shows (
      drive_file_id,
      slug,
      title,
      client_label,
      client_contact,
      template_version,
      venue,
      dates,
      event_details,
      agenda_links,
      diagrams,
      opening_reel_drive_file_id,
      opening_reel_drive_modified_time,
      opening_reel_head_revision_id,
      opening_reel_mime_type,
      coi_status,
      pull_sheet,
      last_synced_at,
      last_sync_status,
      last_sync_error,
      last_seen_modified_time
    )
    values (
      ${sqlString(seed.driveFileId)},
      ${sqlString(seed.slug)},
      ${sqlString(parsed.show.title)},
      ${sqlString(parsed.show.client_label)},
      ${sqlJson(parsed.show.client_contact)},
      ${sqlString(parsed.show.template_version)},
      ${sqlJson(parsed.show.venue)},
      ${sqlJson(parsed.show.dates)},
      ${sqlJson(parsed.show.event_details)},
      ${sqlJson(parsed.show.agenda_links)},
      ${sqlJson(seed.diagrams)},
      null,
      null,
      null,
      null,
      ${sqlNullableString(parsed.show.coi_status)},
      ${sqlJson(parsed.pullSheet)},
      ${sqlTimestamp(seed.modifiedTime)},
      'ok',
      null,
      ${sqlTimestamp(seed.modifiedTime)}
    );
  `;
}

function internalInsertSql(seed: FixtureSeed): string {
  const financials = {
    po: seed.parsed.show.po,
    proposal: seed.parsed.show.proposal,
    invoice: seed.parsed.show.invoice,
    invoice_notes: seed.parsed.show.invoice_notes,
  };

  return `
    insert into public.shows_internal (
      show_id,
      financials,
      parse_warnings,
      raw_unrecognized
    )
    select
      id,
      ${sqlJson(financials)},
      ${sqlJson(seed.parsed.warnings)},
      ${sqlJson(seed.parsed.raw_unrecognized)}
    from public.shows
    where drive_file_id = ${sqlString(seed.driveFileId)};
  `;
}

function crewInsertSql(seed: FixtureSeed): string {
  return seed.parsed.crewMembers
    .map(
      (crew) => `
        insert into public.crew_members (
          id,
          show_id,
          name,
          email,
          phone,
          role,
          role_flags,
          date_restriction,
          stage_restriction,
          flight_info
        )
        select
          ${sqlString(stableUuid(`${seed.driveFileId}:crew:${crew.name}`))}::uuid,
          id,
          ${sqlString(crew.name)},
          ${sqlNullableString(crew.email)},
          ${sqlNullableString(crew.phone)},
          ${sqlString(crew.role)},
          ${sqlTextArray(crew.role_flags)},
          ${sqlJson(crew.date_restriction)},
          ${sqlJson(crew.stage_restriction)},
          ${sqlNullableString(crew.flight_info)}
        from public.shows
        where drive_file_id = ${sqlString(seed.driveFileId)};
      `,
    )
    .join("\n");
}

function hotelInsertSql(seed: FixtureSeed): string {
  return seed.parsed.hotelReservations
    .map(
      (hotel) => `
        insert into public.hotel_reservations (
          show_id,
          ordinal,
          hotel_name,
          hotel_address,
          names,
          confirmation_no,
          check_in,
          check_out,
          notes
        )
        select
          id,
          ${hotel.ordinal},
          ${sqlNullableString(hotel.hotel_name)},
          ${sqlNullableString(hotel.hotel_address)},
          ${sqlTextArray(hotel.names)},
          ${sqlNullableString(hotel.confirmation_no)},
          ${sqlNullableDate(hotel.check_in)},
          ${sqlNullableDate(hotel.check_out)},
          ${sqlNullableString(hotel.notes)}
        from public.shows
        where drive_file_id = ${sqlString(seed.driveFileId)};
      `,
    )
    .join("\n");
}

function roomsInsertSql(seed: FixtureSeed): string {
  return seed.parsed.rooms
    .map(
      (room) => `
        insert into public.rooms (
          show_id,
          kind,
          name,
          dimensions,
          floor,
          setup,
          set_time,
          show_time,
          strike_time,
          audio,
          video,
          lighting,
          scenic,
          power,
          digital_signage,
          other,
          notes
        )
        select
          id,
          ${sqlString(room.kind)},
          ${sqlString(room.name)},
          ${sqlNullableString(room.dimensions)},
          ${sqlNullableString(room.floor)},
          ${sqlNullableString(room.setup)},
          ${sqlNullableString(room.set_time)},
          ${sqlNullableString(room.show_time)},
          ${sqlNullableString(room.strike_time)},
          ${sqlNullableString(room.audio)},
          ${sqlNullableString(room.video)},
          ${sqlNullableString(room.lighting)},
          ${sqlNullableString(room.scenic)},
          ${sqlNullableString(room.power)},
          ${sqlNullableString(room.digital_signage)},
          ${sqlNullableString(room.other)},
          ${sqlNullableString(room.notes)}
        from public.shows
        where drive_file_id = ${sqlString(seed.driveFileId)};
      `,
    )
    .join("\n");
}

function transportationInsertSql(seed: FixtureSeed): string {
  const transportation = seed.parsed.transportation;
  if (!transportation) {
    return "";
  }

  return `
    insert into public.transportation (
      show_id,
      driver_name,
      driver_phone,
      driver_email,
      vehicle,
      license_plate,
      color,
      parking,
      schedule,
      notes
    )
    select
      id,
      ${sqlNullableString(transportation.driver_name)},
      ${sqlNullableString(transportation.driver_phone)},
      ${sqlNullableString(transportation.driver_email)},
      ${sqlNullableString(transportation.vehicle)},
      ${sqlNullableString(transportation.license_plate)},
      ${sqlNullableString(transportation.color)},
      ${sqlNullableString(transportation.parking)},
      ${sqlJson(transportation.schedule)},
      ${sqlNullableString(transportation.notes)}
    from public.shows
    where drive_file_id = ${sqlString(seed.driveFileId)};
  `;
}

function contactsInsertSql(seed: FixtureSeed): string {
  return seed.parsed.contacts
    .map(
      (contact) => `
        insert into public.contacts (
          show_id,
          kind,
          name,
          email,
          phone,
          notes
        )
        select
          id,
          ${sqlString(contact.kind)},
          ${sqlNullableString(contact.name)},
          ${sqlNullableString(contact.email)},
          ${sqlNullableString(contact.phone)},
          ${sqlNullableString(contact.notes)}
        from public.shows
        where drive_file_id = ${sqlString(seed.driveFileId)};
      `,
    )
    .join("\n");
}

function syncAuditInsertSql(seed: FixtureSeed): string {
  const triggeredReviewItems = [
    { id: stableUuid(`${seed.driveFileId}:first-seen`), invariant: "FIRST_SEEN_REVIEW" },
  ];
  const reviewerChoices = Object.fromEntries(
    triggeredReviewItems.map((item) => [item.id, { action: "apply" }]),
  );
  const derivedSideEffects = {
    seed_mode: true,
    crew_member_auth_created: seed.parsed.crewMembers.map((crew) => crew.name),
  };
  const parseResultSummary = {
    fixture: seed.fileName,
    slug: seed.slug,
    title: seed.parsed.show.title,
    crew_members: seed.parsed.crewMembers.length,
    hotel_reservations: seed.parsed.hotelReservations.length,
    rooms: seed.parsed.rooms.length,
    contacts: seed.parsed.contacts.length,
    warnings: seed.parsed.warnings.length,
    raw_unrecognized: seed.parsed.raw_unrecognized.length,
  };

  return `
    insert into public.sync_audit (
      show_id,
      drive_file_id,
      applied_by,
      staged_id,
      triggered_review_items,
      reviewer_choices,
      derived_side_effects,
      parse_result_summary,
      base_modified_time,
      staged_modified_time
    )
    select
      id,
      ${sqlString(seed.driveFileId)},
      ${sqlString(seedAdminEmail)},
      ${sqlString(stableUuid(`${seed.driveFileId}:staged`))}::uuid,
      ${sqlJson(triggeredReviewItems)},
      ${sqlJson(reviewerChoices)},
      ${sqlJson(derivedSideEffects)},
      ${sqlJson(parseResultSummary)},
      null,
      ${sqlTimestamp(seed.modifiedTime)}
    from public.shows
    where drive_file_id = ${sqlString(seed.driveFileId)};
  `;
}

function appSettingsSeedSql(): string {
  return `
    insert into public.app_settings (id)
    values ('default')
    on conflict (id) do nothing;

    update public.app_settings
       set watched_folder_id = ${sqlString(seedWatchedFolderId)},
           watched_folder_name = ${sqlString(seedWatchedFolderName)},
           watched_folder_set_by_email = ${sqlString(seedAdminEmail)},
           watched_folder_set_at = ${sqlTimestamp(seedWatchedFolderSetAt)},
           pending_folder_id = null,
           pending_folder_name = null,
           pending_folder_set_by_email = null,
           pending_folder_set_at = null,
           pending_wizard_session_id = null,
           pending_wizard_session_at = null
     where id = 'default';
  `;
}

function seedSql(seeds: FixtureSeed[]): string {
  const locks = seeds
    .map(
      (seed) =>
        `select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(seed.driveFileId)}));`,
    )
    .join("\n");

  return `
    begin;

    ${locks}

    delete from public.pending_syncs
     where drive_file_id like ${sqlString(`${seedDrivePrefix}%`)};
    delete from public.pending_ingestions
     where drive_file_id like ${sqlString(`${seedDrivePrefix}%`)};
    delete from public.sync_audit
     where drive_file_id like ${sqlString(`${seedDrivePrefix}%`)};
    delete from public.shows
     where drive_file_id like ${sqlString(`${seedDrivePrefix}%`)};

    ${appSettingsSeedSql()}

    ${seeds
      .map(
        (seed) => `
          ${showInsertSql(seed)}
          ${internalInsertSql(seed)}
          ${crewInsertSql(seed)}
          ${hotelInsertSql(seed)}
          ${roomsInsertSql(seed)}
          ${transportationInsertSql(seed)}
          ${contactsInsertSql(seed)}
          ${syncAuditInsertSql(seed)}
        `,
      )
      .join("\n")}

    commit;
  `;
}

function main(): void {
  const seeds = loadFixtures();
  runPsql(seedSql(seeds));
  process.stdout.write(`Seeded ${seeds.length} fixture shows.\n`);
}

main();
