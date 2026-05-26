import { useState } from "react";

import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import type { MessageCode } from "@/lib/messages/lookup";

export function GoodSetError() {
  const [error, setError] = useState<MessageCode | null>(null);
  return (
    <>
      <button onClick={() => setError("SHEET_UNAVAILABLE")}>Trigger</button>
      {error ? <ErrorExplainer code={error} surface="crew" /> : null}
    </>
  );
}
