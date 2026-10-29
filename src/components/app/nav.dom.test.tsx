import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CaptureProvider } from "./capture-context";
import { SidebarSkeleton } from "./sidebar";
import { TabBarView } from "./tab-bar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));

it("the tab bar puts Today first, then Areas, Capture, Week and Search", () => {
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
  expect(names).toEqual(["Today", "Areas", "Capture", "Week", "Search"]);
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
    "Your areas",
    "Active",
    "Search",
    "Inbox",
  ]);
});
