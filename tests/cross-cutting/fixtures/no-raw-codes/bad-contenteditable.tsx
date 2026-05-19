"use client";

import { useState } from "react";

export function BadContenteditable() {
  const [errorCode] = useState("LINK_REVOKED_FLOOR");
  return <div contentEditable>{errorCode}</div>;
}
