export type AuthFailureCode =
  | "GOOGLE_NO_CREW_MATCH"
  | "AMBIGUOUS_EMAIL_BINDING"
  | "ADMIN_SESSION_LOOKUP_FAILED";

export type AuthFailure = {
  status: 401 | 403 | 410 | 500;
  code: AuthFailureCode;
};
