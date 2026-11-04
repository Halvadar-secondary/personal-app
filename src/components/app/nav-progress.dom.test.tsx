import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startNavProgress } from "@/lib/nav-progress";
import { NavProgressEnd } from "./nav-progress";

// A tap on a link can wait on the server (a cold start). Before the app's
// scripts are running the tap is a plain page load, and a Home Screen app has
// no browser loading bar, so the app shows its own from the moment of the tap.

const nav = vi.hoisted(() => ({ path: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

const marked = () => document.documentElement.hasAttribute("data-navigating");

let stop: () => void;
beforeEach(() => {
  window.history.replaceState(null, "", "/today");
  stop = startNavProgress(document);
});
afterEach(() => {
  stop();
  document.documentElement.removeAttribute("data-navigating");
  document.body.innerHTML = "";
});

function tap(attrs: Record<string, string>, init: MouseEventInit = {}) {
  const a = document.createElement("a");
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = "go";
  document.body.append(a);
  const e = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  // Keep jsdom from trying to navigate.
  a.addEventListener("click", (ev) => ev.preventDefault());
  a.dispatchEvent(e);
}

it("a tap on a link to another page in the app shows the bar", () => {
  tap({ href: "/trackers" });
  expect(marked()).toBe(true);
});

it("a tap on something inside the link counts too", () => {
  const a = document.createElement("a");
  a.href = "/week";
  const icon = document.createElement("span");
  a.append(icon);
  document.body.append(a);
  a.addEventListener("click", (ev) => ev.preventDefault());
  icon.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  expect(marked()).toBe(true);
});

it.each([
  ["another site", { href: "https://youtu.be/x" }, {}],
  ["a new tab", { href: "/trackers", target: "_blank" }, {}],
  ["a download", { href: "/api/export", download: "" }, {}],
  ["the page you're on", { href: "/today" }, {}],
  ["a jump on the page", { href: "#top" }, {}],
  ["with a modifier key", { href: "/trackers" }, { metaKey: true }],
] as const)("no bar for %s", (_name, attrs, init) => {
  tap(attrs, init);
  expect(marked()).toBe(false);
});

it("the bar goes once the new page is showing", () => {
  const { rerender } = render(<NavProgressEnd />);
  tap({ href: "/trackers" });
  expect(marked()).toBe(true);
  nav.path = "/trackers";
  rerender(<NavProgressEnd />);
  expect(marked()).toBe(false);
});

// A tap before the app is ready, then the current page finishes loading (its
// scripts arrive late on a slow connection). The next page is still on its
// way, so the bar stays.
it("the current page finishing loading leaves the bar on", () => {
  tap({ href: "/trackers" });
  window.dispatchEvent(
    new PageTransitionEvent("pageshow", { persisted: false }),
  );
  expect(marked()).toBe(true);
});

it("the app starting up leaves the bar on", () => {
  nav.path = "/today";
  tap({ href: "/trackers" });
  render(<NavProgressEnd />);
  expect(marked()).toBe(true);
});

it("back to a page kept in memory clears the bar", () => {
  tap({ href: "/trackers" });
  window.dispatchEvent(
    new PageTransitionEvent("pageshow", { persisted: true }),
  );
  expect(marked()).toBe(false);
});
