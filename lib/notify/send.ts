import { Resend, type ErrorResponse } from "resend";

export type NotifyChannel = "email" | "sms" | "webhook";

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: "retry_later" }
  | { ok: false; kind: "idempotency_conflict" }
  | { ok: false; kind: "infra_error"; message: string };

function classifyResendError(error: ErrorResponse): SendResult {
  if (error.name === "concurrent_idempotent_requests") return { ok: "retry_later" };
  if (error.name === "invalid_idempotent_request") {
    return { ok: false, kind: "idempotency_conflict" };
  }
  return { ok: false, kind: "infra_error", message: error.message ?? error.name };
}

// not-subject-to-meta: pure provider (Resend) wrapper, NOT a Supabase call boundary
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, kind: "infra_error", message: "unconfigured" };

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(
      {
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      },
      { idempotencyKey: args.idempotencyKey },
    );

    if (error) return classifyResendError(error);
    if (!data?.id) return { ok: false, kind: "infra_error", message: "no message id" };
    return { ok: true, messageId: data.id };
  } catch (e) {
    return {
      ok: false,
      kind: "infra_error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
