"use client";

import { useState } from "react";

export function BadContenteditable() {
  const [errorCode] = useState("SHEET_UNAVAILABLE");
  return <div contentEditable>{errorCode}</div>;
}
