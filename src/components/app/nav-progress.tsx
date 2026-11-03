"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Clears the navigating mark once the new page is showing. Not when the app
 * first starts: a fresh page has no mark of its own, so one set by then is a
 * tap made before the app was ready, still on its way to the next page.
 */
export function NavProgressEnd() {
  const path = usePathname();
  const first = useRef(path);
  useEffect(() => {
    if (path === first.current) return;
    first.current = "";
    document.documentElement.removeAttribute("data-navigating");
  }, [path]);
  return null;
}
