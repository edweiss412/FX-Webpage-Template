"use client";

import { useState } from "react";

export function BadControlledTextarea() {
  const [errorCode] = useState("SHEET_UNAVAILABLE");
  return <textarea value={errorCode} readOnly />;
}
