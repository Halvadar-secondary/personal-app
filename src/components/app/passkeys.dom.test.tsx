import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { type PasskeyApi, type PasskeyRow, Passkeys } from "./passkeys";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const laptop: PasskeyRow = {
  id: "p1",
  name: "Laptop",
  createdAt: new Date("2026-10-20T10:00:00Z"),
};

/** An in-memory passkey store behind the PasskeyApi shape. */
function fakeApi(initial: PasskeyRow[] = [laptop]) {
  let rows = [...initial];
  const api = {
    list: vi.fn(async () => rows),
    add: vi.fn(async () => {
      rows = [
        ...rows,
        { id: "p2", name: null, createdAt: new Date("2026-10-25T10:00:00Z") },
      ];
      return {};
    }),
    rename: vi.fn(async (id: string, name: string) => {
      rows = rows.map((r) => (r.id === id ? { ...r, name } : r));
      return {};
    }),
    remove: vi.fn(async (id: string) => {
      rows = rows.filter((r) => r.id !== id);
      return {};
    }),
  } satisfies PasskeyApi;
  return api;
}

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
});

it("lists passkeys with name and added date", async () => {
  render(<Passkeys api={fakeApi()} />);
  const row = await screen.findByRole("listitem");
  expect(row).toHaveTextContent("Laptop");
  expect(row).toHaveTextContent("Added 20 Oct 2026");
});

it("unnamed passkey shows as Passkey", async () => {
  render(<Passkeys api={fakeApi([{ ...laptop, name: null }])} />);
  expect(await screen.findByRole("listitem")).toHaveTextContent(/^Passkey/);
});

it("empty state", async () => {
  render(<Passkeys api={fakeApi([])} />);
  expect(
    await screen.findByText(
      "No passkeys yet. Add one to sign in with Face ID, fingerprint or Windows Hello.",
    ),
  ).toBeInTheDocument();
});

it("rename saves the new name", async () => {
  const api = fakeApi();
  render(<Passkeys api={api} />);
  const row = await screen.findByRole("listitem");
  await userEvent.click(within(row).getByRole("button", { name: "Rename" }));
  const input = within(row).getByRole("textbox", { name: "Passkey name" });
  await userEvent.clear(input);
  await userEvent.type(input, "Work laptop{Enter}");
  expect(api.rename).toHaveBeenCalledWith("p1", "Work laptop");
  expect(await screen.findByText("Work laptop")).toBeInTheDocument();
});

it("remove asks first; Cancel keeps it, Remove deletes it", async () => {
  const api = fakeApi();
  render(<Passkeys api={api} />);
  const row = await screen.findByRole("listitem");

  await userEvent.click(within(row).getByRole("button", { name: "Remove" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(
    "Remove this passkey? You can still sign in with Google.",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(api.remove).not.toHaveBeenCalled();
  expect(screen.getByRole("listitem")).toHaveTextContent("Laptop");

  await userEvent.click(within(row).getByRole("button", { name: "Remove" }));
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Remove",
    }),
  );
  expect(api.remove).toHaveBeenCalledWith("p1");
  await waitFor(() => expect(screen.queryByRole("listitem")).toBeNull());
});

it("add reloads the list; an error shows a toast", async () => {
  const api = fakeApi();
  render(<Passkeys api={api} />);
  await screen.findByRole("listitem");
  await userEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));

  api.add.mockResolvedValueOnce({ error: "The operation was cancelled" });
  await userEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("The operation was cancelled"),
  );
});

it("shows a placeholder, not text, while the list loads", () => {
  const api = { ...fakeApi(), list: vi.fn(() => new Promise<never>(() => {})) };
  render(<Passkeys api={api} />);
  expect(screen.getByRole("status", { name: "Loading" })).toHaveAttribute(
    "data-testid",
    "passkeys-loading",
  );
  expect(screen.queryByText("Loading…")).toBeNull();
});
