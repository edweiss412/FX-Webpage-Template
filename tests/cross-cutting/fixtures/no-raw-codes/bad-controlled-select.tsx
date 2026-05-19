"use client";

import { useState } from "react";

export function BadControlledSelect() {
  const [errorCode] = useState("LINK_REVOKED_FLOOR");
  return (
    <select value={errorCode} onChange={() => undefined}>
      <option value="LINK_REVOKED_FLOOR">Choose an error</option>
    </select>
  );
}
