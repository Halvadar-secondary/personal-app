import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { CaptureProvider } from "./capture-context";
import { CommandPalette } from "./command-palette";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => "/",
}));
const actions = vi.hoisted(() => ({ jumpTargetsAction: vi.fn() }));
vi.mock("@/server/actions/palette", () => actions);

beforeEach(() => {
  nav.push.mockReset();
  actions.jumpTargetsAction.mockReset();
  actions.jumpTargetsAction.mockResolvedValue([
    {
      id: "s1",
      title: "Sweep picking",
      status: "active",
      area: { id: "a1", name: "Guitar", emoji: "🎸" },
    },
  ]);
});

function setup() {
  render(
    <CaptureProvider>
      <CommandPalette
        areas={[
          { id: "a1", name: "Guitar", emoji: "🎸" },
          { id: "a2", name: "Singing", emoji: "🎤" },
        ]}
      />
    </CaptureProvider>,
  );
}

it("Ctrl+K opens it and choosing an area navigates", async () => {
  setup();
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await userEvent.type(screen.getByPlaceholderText("Jump to…"), "singing");
  await userEvent.keyboard("{Enter}");
  expect(nav.push).toHaveBeenCalledWith("/areas/a2");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("offers searching for the typed text", async () => {
  setup();
  await userEvent.keyboard("{Control>}k{/Control}");
  await userEvent.type(screen.getByPlaceholderText("Jump to…"), "zzz");
  await userEvent.click(
    screen.getByRole("option", { name: "Search for “zzz”" }),
  );
  expect(nav.push).toHaveBeenCalledWith("/search?q=zzz");
});

it("reloads achievements each time it opens", async () => {
  setup();
  expect(actions.jumpTargetsAction).not.toHaveBeenCalled();
  await userEvent.keyboard("{Meta>}k{/Meta}");
  expect(
    await screen.findByRole("option", { name: /Sweep picking/ }),
  ).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await userEvent.keyboard("{Control>}k{/Control}");
  // Achievements change between opens: the list is fetched again, and the
  // last one shows meanwhile.
  expect(actions.jumpTargetsAction).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("option", { name: /Sweep picking/ })).toBeVisible();
});

it("jumps to Plan tomorrow", async () => {
  setup();
  await userEvent.keyboard("{Control>}k{/Control}");
  await userEvent.type(screen.getByPlaceholderText("Jump to…"), "plan tom");
  await userEvent.keyboard("{Enter}");
  expect(nav.push).toHaveBeenCalledWith("/plan");
});
