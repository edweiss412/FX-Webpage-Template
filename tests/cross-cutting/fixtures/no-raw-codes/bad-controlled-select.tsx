"use client";

import { useState } from "react";

export function BadControlledSelect() {
  const [errorCode] = useState("SHEET_UNAVAILABLE");
  return (
    <select value={errorCode} onChange={() => undefined}>
      <option value="SHEET_UNAVAILABLE">Choose an error</option>
    </select>
  );
}
