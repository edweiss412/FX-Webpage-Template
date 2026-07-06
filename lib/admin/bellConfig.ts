// Single source of truth for bell feed bounds (spec §3.4). The SQL CHECKs in
// supabase/migrations/20260705100000_bell_state_tables.sql and the
// get_bell_feed_rows param guards must stay equal to these values.
export const BELL_LIMITS = {
  historyDays: { min: 1, max: 365, default: 30 },
  feedCap: { min: 10, max: 200, default: 50 },
} as const;
