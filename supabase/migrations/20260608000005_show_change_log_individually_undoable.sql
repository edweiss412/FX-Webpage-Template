-- Phase 4 P4-F4 — show_change_log.individually_undoable marker.
--
-- A multi-node closed-group MI-11 approval (rename swap / cycle / chain) writes several applied
-- crew-identity rows in ONE txn, all sharing occurred_at=now(), so none supersedes another and
-- cleanup_superseded_before_images leaves them all status='applied'. But undoing one in isolation
-- always fails the restore-target name guard (the swap sibling owns the prior name) → UNDO_SUPERSEDED
-- WITHOUT flipping the row out of 'applied', so the feed keeps offering a perpetually-failing Undo.
-- Per spec, undo is PER-ITEM / one-step — a multi-node ATOMIC group is inherently NOT individually
-- undoable, so those rows are marked non-undoable AT WRITE TIME. undo_change rejects them
-- (UNDO_NOT_FOUND, zero mutation) and the future Phase-5 feed predicate hides the button.
--
-- Single-node approvals and Phase-2 auto-apply rows keep the default `true`.
-- Idempotent (apply-twice safe): add column if not exists.
alter table public.show_change_log
  add column if not exists individually_undoable boolean not null default true;
