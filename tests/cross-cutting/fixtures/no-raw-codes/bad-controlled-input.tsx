"use client";

import { useState } from "react";

export function BadControlledInput() {
  const [errorCode] = useState("SHEET_UNAVAILABLE");
  return <input value={errorCode} readOnly />;
}
