import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { COVER_PRESETS } from "@/lib/covers";
import { AreaForm } from "./area-form";

function setup(initial?: Parameters<typeof AreaForm>[0]["initial"]) {
  const onSubmit = vi.fn();
  render(
    <AreaForm
      open
      onOpenChange={() => {}}
      initial={initial}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

it("submits the trimmed name, emoji and chosen cover preset", async () => {
  const onSubmit = setup();
  await userEvent.type(screen.getByLabelText("Name"), "  Guitar  ");
  await userEvent.type(screen.getByLabelText("Emoji"), "🎸");
  await userEvent.click(
    screen.getByRole("radio", { name: COVER_PRESETS[2]!.id }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Create area" }));
  expect(onSubmit).toHaveBeenCalledWith({
    name: "Guitar",
    emoji: "🎸",
    cover: { type: "gradient", value: COVER_PRESETS[2]!.value },
    description: null,
  });
});

it("does not submit an empty name", async () => {
  const onSubmit = setup();
  await userEvent.type(screen.getByLabelText("Name"), "   ");
  await userEvent.click(screen.getByRole("button", { name: "Create area" }));
  expect(onSubmit).not.toHaveBeenCalled();
});

it("prefills every field when editing", async () => {
  const onSubmit = setup({
    name: "Flute",
    emoji: "🪈",
    cover: { type: "gradient", value: COVER_PRESETS[4]!.value },
    description: "Irish trad",
  });
  expect(screen.getByLabelText("Name")).toHaveValue("Flute");
  expect(screen.getByLabelText("Emoji")).toHaveValue("🪈");
  expect(
    screen.getByRole("radio", { name: COVER_PRESETS[4]!.id }),
  ).toBeChecked();
  expect(screen.getByLabelText("Description")).toHaveValue("Irish trad");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSubmit).toHaveBeenCalledWith({
    name: "Flute",
    emoji: "🪈",
    cover: { type: "gradient", value: COVER_PRESETS[4]!.value },
    description: "Irish trad",
  });
});

it("submits once while a save is in flight", async () => {
  const onSubmit = vi.fn(() => new Promise<void>(() => {}));
  render(<AreaForm open onOpenChange={() => {}} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText("Name"), "Guitar");
  const create = screen.getByRole("button", { name: "Create area" });
  await userEvent.click(create);
  await userEvent.click(create);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(create).toBeDisabled();
});
