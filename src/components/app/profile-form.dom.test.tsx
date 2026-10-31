import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ProfileForm } from "./profile-form";

const actions = vi.hoisted(() => ({ saveProfileSection: vi.fn() }));
vi.mock("@/server/actions/profile", () => actions);
vi.mock("@/server/actions/history", () => ({}));

const sections = [
  { section: "about", label: "About me", text: "I play guitar" },
  { section: "focus", label: "Current focus", text: "" },
  { section: "planning", label: "How I plan", text: "" },
  { section: "style", label: "How to talk to me", text: "" },
] as const;

beforeEach(() => {
  actions.saveProfileSection.mockReset();
  actions.saveProfileSection.mockImplementation(
    async (_s: string, text: string) => ({
      ok: true,
      data: { text },
      batchId: "b",
    }),
  );
});

it("renders four labelled textareas with the current text", () => {
  render(<ProfileForm initial={[...sections]} />);
  expect(screen.getAllByRole("textbox")).toHaveLength(4);
  expect(screen.getByRole("textbox", { name: "About me" })).toHaveValue(
    "I play guitar",
  );
  expect(
    screen.getByRole("textbox", { name: "How to talk to me" }),
  ).toHaveValue("");
});

it("saves a section on blur, once", async () => {
  render(<ProfileForm initial={[...sections]} />);
  const box = screen.getByRole("textbox", { name: "Current focus" });
  await userEvent.type(box, "Finish the song");
  await userEvent.tab();
  expect(actions.saveProfileSection).toHaveBeenCalledTimes(1);
  expect(actions.saveProfileSection).toHaveBeenCalledWith(
    "focus",
    "Finish the song",
  );
});

it("shows a character counter", async () => {
  render(<ProfileForm initial={[...sections]} />);
  expect(screen.getByText("13/1000")).toBeInTheDocument();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Current focus" }),
    "abc",
  );
  expect(screen.getByText("3/1000")).toBeInTheDocument();
});

it("shows the message when saving is refused", async () => {
  actions.saveProfileSection.mockResolvedValue({
    ok: false,
    message: "Too long",
  });
  render(<ProfileForm initial={[...sections]} />);
  await userEvent.type(
    screen.getByRole("textbox", { name: "Current focus" }),
    "x",
  );
  await userEvent.tab();
  expect(await screen.findByText("Too long")).toBeInTheDocument();
});
