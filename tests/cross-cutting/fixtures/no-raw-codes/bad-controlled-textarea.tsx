"use client";

import { useState } from "react";

export function BadControlledTextarea() {
  const [errorCode] = useState("LINK_REVOKED_FLOOR");
  return <textarea value={errorCode} readOnly />;
}
