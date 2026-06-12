"use client";
// app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx — M12.13 confirm-state
// body + in-place POST outcome rendering (spec §5). The WHOLE confirm-state
// UI lives in this client island so the POST outcome can replace it in place
// (success / expired / neutral) or annotate it (infra → retry notice with the
// form still available). token + r travel through the form payload — the
// server action re-validates the binding from the payload, never trusting
// the GET render (R9). The submit button disables on isPending only (a
// synchronous self-disable in onClick would cancel the React 19 form-action
// dispatch — see the B1 revoke lesson).
import { useActionState } from "react";
import { confirmUnpublishAction } from "./actions";
import {
  CONFIRM_BUTTON_LABEL,
  CONFIRM_BUTTON_PENDING_LABEL,
  CONFIRM_CONSEQUENCE,
  CONFIRM_HEADING,
  KEEP_LIVE_LINE,
  type ConfirmUnpublishActionState,
} from "./copy";
import { ExpiredBlock, NeutralBlock, RetryNotice, SuccessBlock } from "./blocks";

const IDLE: ConfirmUnpublishActionState = { status: "idle" };

export function ConfirmUnpublishForm({
  slug,
  title,
  token,
  r,
}: {
  slug: string;
  title: string;
  token: string;
  r: string;
}) {
  const [state, formAction, isPending] = useActionState(confirmUnpublishAction, IDLE);

  if (state.status === "success") {
    return <SuccessBlock title={state.title} slug={slug} />;
  }
  if (state.status === "expired") {
    return <ExpiredBlock title={state.title} body={state.body} />;
  }
  if (state.status === "neutral") {
    return <NeutralBlock />;
  }

  // idle | infra: the confirm UI (infra adds the retry notice and keeps the
  // form available — a transient fault must not close the recovery window).
  return (
    <div data-testid="unpublish-confirm">
      <p className="text-xs font-bold uppercase tracking-eyebrow-strong text-text-subtle">
        {title}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-text-strong">{CONFIRM_HEADING}</h1>
      <p className="mt-4 text-base text-text-subtle">{CONFIRM_CONSEQUENCE}</p>
      {state.status === "infra" ? (
        <div className="mt-4">
          <RetryNotice />
        </div>
      ) : null}
      <form action={formAction} className="mt-6 flex flex-col items-center gap-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="r" value={r} />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-6 py-2 text-base font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? CONFIRM_BUTTON_PENDING_LABEL : CONFIRM_BUTTON_LABEL}
        </button>
        <p className="text-sm text-text-subtle">{KEEP_LIVE_LINE}</p>
      </form>
    </div>
  );
}
