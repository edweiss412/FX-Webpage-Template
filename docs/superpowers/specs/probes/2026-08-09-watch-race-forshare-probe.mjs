// Probe: does a `select ... for share` on the settings row inside the
// activation transaction close BL-WATCH-PROMOTION-ACTIVATION-RACE, and does
// the current (no-lock) shape actually exhibit it?
//
// Runs against the LOCAL dev DB (loopback guard below). Uses dedicated probe
// tables mirroring the two-column shape the race depends on — row-lock
// semantics are table-independent, and this keeps the probe off live state.
//
// Schedules:
//   S1 current shape  — subscriber reads folder A; promotion (settings->B +
//                       supersede) commits; subscriber inserts+activates A.
//                       EXPECT: stale active row for A (race reproduced).
//   S2 fix, promo 1st — promotion tx uncommitted (settings row updated);
//                       subscriber activation tx takes FOR SHARE. EXPECT:
//                       subscriber BLOCKS; after promo commit the same select
//                       returns 'B' (EvalPlanQual re-check), subscriber aborts.
//   S3 fix, sub 1st   — subscriber's activation (FOR SHARE, sees A, activates,
//                       commits) fully precedes promotion. EXPECT: promotion's
//                       in-tx supersede catches the active row. Zero stale.
//   S4 fix, overlap   — subscriber holds FOR SHARE when promotion's settings
//                       UPDATE arrives. EXPECT: promotion blocks (no deadlock,
//                       lock order settings->channels on both sides), then
//                       supersedes after subscriber commits. Zero stale.
//   S5 fix, fast path — no promotion in flight. EXPECT: FOR SHARE returns A
//                       immediately, activation proceeds.
//
// Every blocking wait is bounded: per-connection statement_timeout 5s, whole
// probe hard-killed at 60s. Each schedule prints PASS/FAIL against its EXPECT;
// exit 1 on any FAIL so a wrong premise cannot be quoted as a measurement.

import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

function localDatabaseUrl() {
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m) ?? env.match(/^TEST_DATABASE_URL=(.+)$/m);
  let url = m?.[1]?.trim();
  if (process.env.PROBE_DATABASE_URL) url = process.env.PROBE_DATABASE_URL;
  if (!url) throw new Error("no DATABASE_URL in .env.local");
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`refusing non-loopback host ${host} — probe mutates tables`);
  }
  return url;
}

const url = localDatabaseUrl();
const conn = () =>
  postgres(url, { max: 1, prepare: false, connection: { statement_timeout: "5000" } });

const admin = conn();

async function setup() {
  await admin`drop table if exists probe_watch_channels`;
  await admin`drop table if exists probe_settings`;
  await admin`create table probe_settings (id text primary key, folder text)`;
  await admin`create table probe_watch_channels (id text primary key, folder text, status text)`;
}
async function resetRows() {
  await admin`delete from probe_watch_channels`;
  await admin`delete from probe_settings`;
  await admin`insert into probe_settings values ('default', 'A')`;
}
async function staleActive() {
  const rows = await admin`
    select c.id from probe_watch_channels c, probe_settings s
    where s.id = 'default' and c.status = 'active' and c.folder is distinct from s.folder`;
  return rows.length;
}

const results = [];
function report(name, expect, got, pass) {
  results.push({ name, expect, got, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}: expected ${expect}; got ${got}`);
}

// Promotion transaction shape (finalize-cas promoteSettings): settings update
// first, then the same-tx supersede — same statement order as the real route.
// `onAfterUpdate` is a PHASE ACKNOWLEDGEMENT: it fires only after the settings
// UPDATE statement has returned, i.e. the row lock is provably held (or, in S4,
// provably being waited on until the statement returns). Schedules await it
// instead of sleeping and hoping (spec review R1 finding 2).
async function promotionTx(sql, { holdUntil, onAfterUpdate } = {}) {
  await sql.begin(async (tx) => {
    await tx`update probe_settings set folder = 'B' where id = 'default'`;
    if (onAfterUpdate) onAfterUpdate();
    await tx`
      update probe_watch_channels set status = 'superseded'
      where status = 'active' and folder is distinct from 'B'`;
    if (holdUntil) await holdUntil;
  });
}

// Settles to "pending" if `p` has not settled within `ms` — a positive probe
// that a task is genuinely blocked, replacing tautological sleep-then-measure.
function settledWithin(p, ms) {
  return Promise.race([p.then(() => "settled"), new Promise((r) => setTimeout(() => r("pending"), ms))]);
}

// Subscriber activation, current shape: no settings read, straight activate.
async function activateNoLock(sql, chanId) {
  await sql.begin(async (tx) => {
    await tx`
      update probe_watch_channels set status = 'superseded'
      where folder = 'A' and status = 'active' and id <> ${chanId}`;
    await tx`update probe_watch_channels set status = 'active' where id = ${chanId} and status = 'pending'`;
  });
}

// Subscriber activation, FIX shape: FOR SHARE settings read first, abort on
// mismatch. Returns { activated, folderSeen }.
async function activateWithCheck(sql, chanId, expectedFolder) {
  let folderSeen = null;
  let activated = false;
  await sql.begin(async (tx) => {
    const [row] = await tx`select folder from probe_settings where id = 'default' for share`;
    folderSeen = row?.folder ?? null;
    if (folderSeen !== expectedFolder) return; // abort -> orphan path in real code
    await tx`
      update probe_watch_channels set status = 'superseded'
      where folder = ${expectedFolder} and status = 'active' and id <> ${chanId}`;
    await tx`update probe_watch_channels set status = 'active' where id = ${chanId} and status = 'pending'`;
    activated = true;
  });
  return { activated, folderSeen };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function s1() {
  await resetRows();
  const sub = conn();
  // subscriber "read folder A" happened conceptually; promotion runs fully:
  await promotionTx(admin);
  // subscriber, still holding "A", inserts pending and activates (current shape)
  await sub`insert into probe_watch_channels values ('c1', 'A', 'pending')`;
  await activateNoLock(sub, "c1");
  const stale = await staleActive();
  report("S1 current shape reproduces race", "1 stale active row", `${stale}`, stale === 1);
  await sub.end();
}

async function s2() {
  await resetRows();
  const sub = conn();
  const promo = conn();
  await sub`insert into probe_watch_channels values ('c2', 'A', 'pending')`;
  let release;
  const gate = new Promise((r) => (release = r));
  let ackUpdate;
  const updated = new Promise((r) => (ackUpdate = r));
  const promoDone = promotionTx(promo, { holdUntil: gate, onAfterUpdate: ackUpdate });
  await updated; // PROOF the settings UPDATE returned: row lock is held, tx open
  const subDone = activateWithCheck(sub, "c2", "A"); // must block on FOR SHARE
  const whileHeld = await settledWithin(subDone, 700); // "pending" = genuinely blocked
  release();
  await promoDone;
  const { activated, folderSeen } = await subDone;
  const stale = await staleActive();
  report(
    "S2 promo-first: FOR SHARE blocks then sees B, aborts",
    "blocked while lock held (pending), folderSeen=B, activated=false, 0 stale",
    `whileHeld=${whileHeld}, folderSeen=${folderSeen}, activated=${activated}, ${stale} stale`,
    whileHeld === "pending" && folderSeen === "B" && activated === false && stale === 0,
  );
  await sub.end();
  await promo.end();
}

async function s3() {
  await resetRows();
  const sub = conn();
  await sub`insert into probe_watch_channels values ('c3', 'A', 'pending')`;
  const { activated } = await activateWithCheck(sub, "c3", "A"); // completes first
  await promotionTx(admin); // promotion runs after; supersede must catch c3
  const stale = await staleActive();
  report(
    "S3 sub-first: promotion supersede catches committed row",
    "activated=true then 0 stale",
    `activated=${activated}, ${stale} stale`,
    activated === true && stale === 0,
  );
  await sub.end();
}

async function s4() {
  await resetRows();
  const sub = conn();
  const promo = conn();
  await sub`insert into probe_watch_channels values ('c4', 'A', 'pending')`;
  // subscriber opens activation tx and holds it mid-flight after FOR SHARE
  let holdRelease;
  const hold = new Promise((r) => (holdRelease = r));
  let folderSeen;
  let ackShare;
  const shareHeld = new Promise((r) => (ackShare = r));
  const subDone = sub.begin(async (tx) => {
    const [row] = await tx`select folder from probe_settings where id = 'default' for share`;
    folderSeen = row.folder;
    ackShare(); // PROOF the share lock is held before promotion starts
    await hold; // promotion's settings UPDATE arrives while we hold the share lock
    await tx`update probe_watch_channels set status = 'active' where id = 'c4' and status = 'pending'`;
  });
  await shareHeld;
  let ackUpdate;
  const promoUpdated = new Promise((r) => (ackUpdate = r));
  const promoDone = promotionTx(promo, { onAfterUpdate: ackUpdate }); // must block on settings row
  const whileHeld = await settledWithin(promoUpdated, 700); // "pending" = promotion genuinely waiting
  holdRelease();
  await subDone;
  await promoDone; // must complete without deadlock
  await promoUpdated; // phase settles once unblocked
  const stale = await staleActive();
  report(
    "S4 overlap: promotion waits (no deadlock), supersedes after",
    "share held first, promotion blocked (pending), folderSeen=A, 0 stale, both txs complete",
    `promoWhileHeld=${whileHeld}, folderSeen=${folderSeen}, ${stale} stale`,
    whileHeld === "pending" && folderSeen === "A" && stale === 0,
  );
  await sub.end();
  await promo.end();
}

async function s5() {
  await resetRows();
  const sub = conn();
  await sub`insert into probe_watch_channels values ('c5', 'A', 'pending')`;
  const t0 = Date.now();
  const { activated, folderSeen } = await activateWithCheck(sub, "c5", "A");
  const ms = Date.now() - t0;
  report(
    "S5 fast path: no promotion, FOR SHARE is immediate",
    "folderSeen=A, activated=true, <500ms",
    `folderSeen=${folderSeen}, activated=${activated}, ${ms}ms`,
    folderSeen === "A" && activated === true && ms < 500,
  );
  await sub.end();
}

const killer = setTimeout(() => {
  console.error("FAIL probe exceeded 60s hard bound");
  process.exit(1);
}, 60_000);

try {
  await setup();
  await s1();
  await s2();
  await s3();
  await s4();
  await s5();
} finally {
  await admin`drop table if exists probe_watch_channels`;
  await admin`drop table if exists probe_settings`;
  await admin.end();
  clearTimeout(killer);
}

const failed = results.filter((r) => !r.pass);
console.log(`\nsummary: ${results.length - failed.length}/${results.length} schedules PASS`);
process.exit(failed.length ? 1 : 0);
