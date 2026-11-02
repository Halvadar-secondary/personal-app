"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Clears the navigating mark once the new page is showing. */
export function NavProgressEnd() {
  const path = usePathname();
  useEffect(() => {
    document.documentElement.removeAttribute("data-navigating");
  }, [path]);
  return null;
}
