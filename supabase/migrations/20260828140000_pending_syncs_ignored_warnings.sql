-- wizard-warning-ignore-controls spec §2.6 / §2.7.
--
-- The wizard's FIRST-SEEN rows have no `shows` record while the operator reviews them, so
-- a per-warning Ignore cannot write `public.ignored_warnings` yet. It stages here, and the
-- finalize carry (§2.7) moves the fingerprints onto the show finalize creates or updates.
--
-- Shape: an array of { fingerprint, code, ignored_by }. Deliberately no CHECK — the §2.6
-- action is the single writer, every reader coerces through
-- `normalizeStagedIgnoredWarnings`, and the carry canonicalizes `ignored_by` before it
-- reaches the durable table's own CHECK. A constraint here would turn a malformed value
-- into a failed publish instead of a dropped entry (spec §2.7 matrix).
--
-- NOT NULL with a default so every existing row reads as "nothing ignored" without a
-- backfill, and so the read path never has to distinguish null from empty. The scan
-- upsert's `do update set` list omits the column, so a decision survives a re-scan the
-- same way `use_raw_decisions` does (§1.1.8). Apply-twice safe via `if not exists`.
alter table public.pending_syncs
  add column if not exists ignored_warnings jsonb not null default '[]'::jsonb;
