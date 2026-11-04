/**
 * Marks the page as navigating (`<html data-navigating>`) from the moment a
 * link to another page in the app is tapped, until the new page shows. Runs
 * as an inline script before React, so it covers taps the app's scripts
 * aren't ready for yet: those are plain page loads, and a Home Screen app has
 * no browser loading bar to show for them.
 *
 * Self-contained (it's inlined with toString), and returns its undo for tests.
 */
export function startNavProgress(doc: Document): () => void {
  const root = doc.documentElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    root.removeAttribute("data-navigating");
    clearTimeout(timer);
  };
  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;
    const to = new URL(a.href, doc.baseURI);
    const here = doc.defaultView!.location;
    if (to.origin !== here.origin) return;
    // Same page (or just a #jump): nothing will load.
    if (to.pathname === here.pathname) return;
    root.setAttribute("data-navigating", "");
    clearTimeout(timer);
    // Never stuck on: a navigation that fails or is cancelled.
    timer = setTimeout(clear, 20_000);
  };
  // Back to a page kept in memory (iOS back swipe): it isn't loading. Not
  // this page's own first load finishing: a tap made before then is still
  // on its way to the next page.
  const onShow = (e: PageTransitionEvent) => {
    if (e.persisted) clear();
  };
  doc.addEventListener("click", onClick, true);
  doc.defaultView?.addEventListener("pageshow", onShow);
  return () => {
    doc.removeEventListener("click", onClick, true);
    doc.defaultView?.removeEventListener("pageshow", onShow);
    clear();
  };
}

/** The inline script for the root layout. */
export const NAV_PROGRESS_SCRIPT = `(${startNavProgress.toString()})(document);`;
