import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CategoryPicker } from "./category-picker";

const all = [
  { id: "c-gear", name: "Gear", color: "#64748b", usedInArea: 0 },
  { id: "c-tech", name: "Technique", color: "#6d4aff", usedInArea: 3 },
  { id: "c-ear", name: "Ear", color: "#e5484d", usedInArea: 0 },
];

function setup(value: string[] = []) {
  const onChange = vi.fn();
  const onCreate = vi.fn(async () => "c-new");
  render(
    <CategoryPicker
      categories={all}
      value={value}
      onChange={onChange}
      onCreate={onCreate}
    />,
  );
  return { onChange, onCreate };
}

const open = () =>
  userEvent.click(screen.getByRole("button", { name: "Categories" }));

it("lists used-here categories first", async () => {
  setup();
  await open();
  const used = screen.getByRole("group", { name: "Used here" });
  const rest = screen.getByRole("group", { name: "All" });
  expect(
    within(used)
      .getAllByRole("checkbox")
      .map((c) => c.getAttribute("aria-label")),
  ).toEqual(["Technique"]);
  expect(
    within(rest)
      .getAllByRole("checkbox")
      .map((c) => c.getAttribute("aria-label")),
  ).toEqual(["Ear", "Gear"]);
});

it("toggles a category with the full set", async () => {
  const { onChange } = setup(["c-tech"]);
  await open();
  await userEvent.click(screen.getByRole("checkbox", { name: "Ear" }));
  expect(onChange).toHaveBeenCalledWith(["c-tech", "c-ear"]);
  await userEvent.click(screen.getByRole("checkbox", { name: "Technique" }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it("offers to create a missing name and applies it", async () => {
  const { onChange, onCreate } = setup(["c-tech"]);
  await open();
  await userEvent.type(screen.getByLabelText("Find or create"), "Theory");
  await userEvent.click(
    screen.getByRole("button", { name: "Create “Theory”" }),
  );
  expect(onCreate).toHaveBeenCalledWith("Theory");
  expect(onChange).toHaveBeenCalledWith(["c-tech", "c-new"]);
});

it("does not offer create for a case-insensitive existing name", async () => {
  setup();
  await open();
  await userEvent.type(screen.getByLabelText("Find or create"), "gear");
  expect(screen.queryByRole("button", { name: /Create/ })).toBeNull();
  expect(screen.getByRole("checkbox", { name: "Gear" })).toBeVisible();
  expect(screen.queryByRole("checkbox", { name: "Ear" })).toBeNull();
});

it("a custom trigger opens the picker", async () => {
  render(
    <CategoryPicker
      categories={all}
      value={[]}
      onChange={() => {}}
      onCreate={async () => null}
      trigger={<button type="button">＋ Category</button>}
    />,
  );
  expect(screen.queryByRole("button", { name: "Categories" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "＋ Category" }));
  expect(screen.getByRole("textbox", { name: "Find or create" })).toBeVisible();
});
