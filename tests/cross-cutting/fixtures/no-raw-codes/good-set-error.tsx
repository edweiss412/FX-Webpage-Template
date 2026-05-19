import { useState } from "react";

import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import type { MessageCode } from "@/lib/messages/lookup";

export function GoodSetError() {
  const [error, setError] = useState<MessageCode | null>(null);
  return (
    <>
      <button onClick={() => setError("LINK_REVOKED_FLOOR")}>Trigger</button>
      {error ? <ErrorExplainer code={error} surface="crew" /> : null}
    </>
  );
}
