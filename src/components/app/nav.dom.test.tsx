import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { BackBarView } from "./back-bar";
import { CaptureProvider } from "./capture-context";
import { SidebarSkeleton } from "./sidebar";
import { TabBarView } from "./tab-bar";

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ ...router, refresh: vi.fn() }),
}));
beforeEach(() => {
  router.push.mockReset();
  router.back.mockReset();
});
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));

it("the tab bar puts Today first, then Areas, Capture, Trackers and More", () => {
  render(
    <CaptureProvider>
      <TabBarView path="/today" />
    </CaptureProvider>,
  );
  const bar = within(screen.getByRole("navigation", { name: "Tabs" }));
  const names = [...bar.getAllByRole("link"), ...bar.getAllByRole("button")]
    .sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    .map((el) => el.textContent?.trim());
  expect(names).toEqual(["Today", "Areas", "Capture", "Trackers", "More"]);
  expect(bar.getByRole("link", { name: "Today" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

it("the sidebar leads with Today, Week, Goals and Review", () => {
  render(
    <CaptureProvider>
      <SidebarSkeleton />
    </CaptureProvider>,
  );
  const main = within(screen.getByRole("navigation", { name: "Main" }));
  expect(main.getAllByRole("link").map((l) => l.textContent?.trim())).toEqual([
    "Today",
    "Week",
    "Goals",
    "Review",
    "Trackers",
    "Your areas",
    "Active",
    "Search",
    "Inbox",
  ]);
});

it("the tab bar keeps clear of the phone's rounded corners and home bar", () => {
  render(
    <CaptureProvider>
      <TabBarView path="/today" />
    </CaptureProvider>,
  );
  const bar = screen.getByRole("navigation", { name: "Tabs" });
  expect(bar.className).toContain(
    "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
  );
  expect(bar.className).toContain(
    "pl-[max(0.75rem,env(safe-area-inset-left))]",
  );
  expect(bar.className).toContain(
    "pr-[max(0.75rem,env(safe-area-inset-right))]",
  );
});

it("More holds every other page, Settings included, with the Inbox count", async () => {
  render(
    <CaptureProvider>
      <TabBarView path="/today" inboxCount={4} />
    </CaptureProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "More" }));
  const sheet = within(screen.getByRole("dialog", { name: "More" }));
  expect(sheet.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(
    [
      "/week",
      "/goals",
      "/inbox",
      "/search",
      "/review",
      "/active",
      "/history",
      "/settings",
    ],
  );
  expect(sheet.getByRole("link", { name: /Inbox/ })).toHaveTextContent("4");
});

it("More is the current tab on a page it holds", () => {
  render(
    <CaptureProvider>
      <TabBarView path="/settings" />
    </CaptureProvider>,
  );
  expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

it("pages below the tabs get a Back button; the tabs themselves don't", async () => {
  const { rerender } = render(<BackBarView path="/today" />);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  rerender(<BackBarView path="/achievements/a1" />);
  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  // Opened straight on this page: nothing to go back to, so Today.
  expect(router.push).toHaveBeenCalledWith("/today");
  expect(router.back).not.toHaveBeenCalled();
});

it("Back goes back when the app has history", async () => {
  window.history.pushState({}, "", "/somewhere");
  render(<BackBarView path="/settings" />);
  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(router.back).toHaveBeenCalled();
});
