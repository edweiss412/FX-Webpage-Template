"use client";

import { useState } from "react";

export function BadControlledInput() {
  const [errorCode] = useState("LINK_REVOKED_FLOOR");
  return <input value={errorCode} readOnly />;
}
