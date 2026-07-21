"use client";

/**
 * components/admin/dev/MaterializeCard.tsx
 * (spec 2026-07-20-attention-scenario-gallery §5.3, §7.4, §9)
 *
 * The dev-panel control that writes a tier-3 composite onto a real show and
 * removes it again, so the REAL modal can be evaluated in that state.
 *
 * ── Why the shared fields are hidden inputs ──────────────────────────────────
 * Apply and Clear are two separate forms, but they need the same slug and the
 * same target. Rendering the visible controls inside one form would leave the
 * other posting an empty slug, refused server-side for a reason that reads like
 * a server bug. The visible controls are therefore React-controlled and live
 * OUTSIDE both forms; each form mirrors the current values as hidden inputs, so
 * neither verb can post a partial payload.
 *
 * ── Why confirmation resets ──────────────────────────────────────────────────
 * Switching the target away from validation clears the confirmation. Otherwise
 * one acknowledgement silently authorizes every later remote write in the same
 * session, which is exactly the consent the gate exists to require.
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { MaterializeResult } from "@/lib/dev/materialize/run";

export type MaterializeCardProps = {
  /** Tier-3 only: the sole materializable tier (§5.0). */
  scenarios: Array<{ id: string; label: string }>;
  applyAction: (fd: FormData) => Promise<MaterializeResult>;
  clearAction: (fd: FormData) => Promise<MaterializeResult>;
  /** Seed for the readout. The live outcome comes back through useActionState. */
  lastResult: MaterializeResult | null;
};

const CONFIRM_TOKEN = "VALIDATION";

const CONTROL =
  "min-h-tap-min rounded-md border border-border bg-surface px-3 text-xs text-text-strong focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none";
const BUTTON =
  "min-h-tap-min rounded-md border border-border px-4 text-xs font-medium text-text-strong disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none";

/**
 * Operator copy per outcome. The card is a developer instrument, so the raw
 * reason is still shown, but on its own detail line and never as the headline
 * (invariant 5's dev-instrument exception, spec §1.1).
 */
function headlineFor(result: MaterializeResult): string {
  switch (result.kind) {
    case "ok":
      return "Done. The show now carries this scenario's state.";
    case "partial":
      return "Partly written. Some steps landed and one failed, so check before retrying.";
    case "refused":
      return "Refused before any write. Nothing changed.";
    case "infra_error":
      return "Could not reach the database. Nothing was written.";
  }
}

/**
 * Must render INSIDE its <form>: useFormStatus reads the pending state of an
 * ANCESTOR form only. Hoisting these buttons out and wiring them with `form=`
 * renders identically and makes `pending` permanently false, i.e. a
 * double-submit guard that never guards.
 */
function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BUTTON}>
      {children}
    </button>
  );
}

export function MaterializeCard(props: MaterializeCardProps) {
  // A bare `action={serverAction}` discards the action's RETURN value, so the
  // outcome would never reach the screen and `lastResult` would be a zombie
  // prop. useActionState is what carries MaterializeResult back to the client;
  // `lastResult` seeds it so a result delivered on a fresh mount still renders.
  const [applyResult, applyFormAction] = useActionState(
    async (_prev: MaterializeResult | null, fd: FormData) => props.applyAction(fd),
    props.lastResult,
  );
  const [clearResult, clearFormAction] = useActionState(
    async (_prev: MaterializeResult | null, fd: FormData) => props.clearAction(fd),
    props.lastResult,
  );

  const [slug, setSlug] = useState("");
  const [scenarioId, setScenarioId] = useState(props.scenarios[0]?.id ?? "");
  const [target, setTarget] = useState<"local" | "validation">("local");
  const [confirmed, setConfirmed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // A NEW result re-opens the readout. Without this, the first control change
  // dismisses the panel for the life of the mount and every later outcome is
  // silent. Derived during render (not in an effect) so the fresh result is
  // visible on the first paint rather than one frame later.
  // Whichever verb ran most recently wins; both start seeded from lastResult,
  // so a value that is no longer the seed is the one that just came back.
  const latest =
    applyResult !== props.lastResult
      ? applyResult
      : clearResult !== props.lastResult
        ? clearResult
        : props.lastResult;

  // The sanctioned adjust-state-during-render pattern, not a ref: React
  // re-renders immediately with the corrected state, whereas a ref read during
  // render is a lint error and can leave the readout a frame stale.
  const [seenResult, setSeenResult] = useState<MaterializeResult | null>(latest);
  if (seenResult !== latest) {
    setSeenResult(latest);
    if (dismissed) setDismissed(false);
  }

  /** Any control change hides a stale outcome: it describes the previous run. */
  function changed<T>(set: (v: T) => void): (v: T) => void {
    return (v) => {
      setDismissed(true);
      set(v);
    };
  }

  const result = dismissed ? null : latest;

  const sharedFields = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="target" value={target} />
      {target === "validation" && confirmed ? (
        <input type="hidden" name="confirm" value={CONFIRM_TOKEN} />
      ) : null}
    </>
  );

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-text-strong">Attention scenario materialize</h2>
      <p className="mt-1 max-w-prose text-xs/relaxed text-text-subtle">
        Writes a composite scenario onto a real show so the show modal renders that state for real.
        Synthetic rows are tagged, and Clear removes only those.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs/relaxed text-text-subtle">
          Show slug
          <input
            className={CONTROL}
            value={slug}
            // An example rather than bare recall: slugs are kebab-case show
            // names and nothing else on this card reveals the shape.
            placeholder="east-coast-2026"
            onChange={(e) => changed(setSlug)(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs/relaxed text-text-subtle">
          Scenario
          <select
            className={CONTROL}
            value={scenarioId}
            onChange={(e) => changed(setScenarioId)(e.target.value)}
          >
            {props.scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs/relaxed text-text-subtle">
          Environment
          <select
            className={CONTROL}
            value={target}
            onChange={(e) => {
              const next = e.target.value === "validation" ? "validation" : "local";
              setConfirmed(false);
              changed(setTarget)(next);
            }}
          >
            <option value="local">local</option>
            <option value="validation">validation</option>
          </select>
        </label>

        {target === "validation" ? (
          <label className="flex min-h-tap-min items-center gap-2 text-xs/relaxed text-text-strong">
            {/* Sized to the 44px floor: DESIGN.md applies it to all chrome and
                controls with no dev-tool carve-out, and a native ~16px box is
                the smallest target on this card by a wide margin. */}
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => changed(setConfirmed)(e.target.checked)}
              className="size-5 shrink-0 accent-accent"
            />
            Confirm writing to the validation project
          </label>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={applyFormAction}>
          {sharedFields}
          <input type="hidden" name="scenario" value={scenarioId} />
          <SubmitButton>Apply scenario</SubmitButton>
        </form>
        <form action={clearFormAction}>
          {sharedFields}
          <SubmitButton>Clear synthetic state</SubmitButton>
        </form>
      </div>
      <p data-testid="clear-scope-note" className="mt-2 text-xs/relaxed text-text-subtle">
        Clear removes all synthetic rows for this show, whichever scenario wrote them, and leaves
        authentic rows alone.
      </p>

      {result === null ? null : (
        <div
          data-testid="result"
          // Matches the convention on every sibling async surface
          // (RescanSheetButton, FinalizeButton, BlockedRowResolver): without it a
          // screen-reader user gets no announcement after a real database write.
          role="status"
          aria-live="polite"
          className="mt-4 rounded-md border border-border p-3"
        >
          <p data-testid="result-headline" className="text-xs/relaxed text-text-strong">
            {headlineFor(result)}
          </p>
          {result.kind === "ok" ? (
            <p className="mt-1 text-xs/relaxed text-text-subtle">
              {result.alerts} alert(s), {result.holds} hold(s), warnings {result.warnings}.
              {result.skipped.length === 0
                ? ""
                : ` Skipped: ${result.skipped.map((s) => `${s.code} (${s.reason})`).join(", ")}.`}
            </p>
          ) : null}
          {result.kind === "partial" ? (
            <p className="mt-1 text-xs/relaxed text-text-subtle">
              Committed {result.committed.alerts} alert(s) and {result.committed.holds} hold(s)
              before {result.failedStep} failed: {result.message}
            </p>
          ) : null}
          {result.kind === "refused" ? (
            <p className="mt-1 font-mono text-xs wrap-break-word text-text-subtle">
              {result.reason}
            </p>
          ) : null}
          {result.kind === "infra_error" ? (
            <p className="mt-1 font-mono text-xs wrap-break-word text-text-subtle">
              {result.message}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
