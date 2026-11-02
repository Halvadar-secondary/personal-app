import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import type { Result } from "@/server/actions/run";
import { useMutate } from "./use-mutate";

const undoAction = vi.fn();
vi.mock("@/server/actions/history", () => ({
  undoAction: (i: unknown) => undoAction(i),
}));

const initial = ["a", "b", "c"];
let call: () => Promise<Result<unknown>>;
let opts: { undoable?: boolean; success?: string } | undefined;

function Harness() {
  const { state, run } = useMutate(
    (s: string[], id: string) => s.filter((x) => x !== id),
    initial,
  );
  return (
    <>
      <ul aria-label="items">
        {state.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <button onClick={() => run("b", call, opts)}>remove b</button>
      <Toaster />
    </>
  );
}

const list = () =>
  within(screen.getByRole("list", { name: "items" }))
    .queryAllByRole("listitem")
    .map((li) => li.textContent);

function deferred() {
  let resolve!: (r: Result<unknown>) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Result<unknown>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A dismissed toast removes itself 200ms later. Let that run out before the
// test environment goes, or it fires with no window and fails the run.
afterAll(() => new Promise((done) => setTimeout(done, 400)));

beforeEach(() => {
  toast.dismiss();
  undoAction.mockReset();
  opts = undefined;
});

describe("useMutate", () => {
  it("shows the optimistic state while the call is pending", async () => {
    const d = deferred();
    call = () => d.promise;
    render(<Harness />);
    await userEvent.click(screen.getByText("remove b"));
    expect(list()).toEqual(["a", "c"]);
    await act(async () =>
      d.resolve({ ok: true, data: undefined, batchId: "x" }),
    );
  });

  it("reverts and shows the message when the server refuses", async () => {
    const d = deferred();
    call = () => d.promise;
    render(<Harness />);
    await userEvent.click(screen.getByText("remove b"));
    await act(async () =>
      d.resolve({
        ok: false,
        code: "conflict",
        message: "Something changed since. Refresh and try again.",
      }),
    );
    expect(
      await screen.findByText(
        "Something changed since. Refresh and try again.",
      ),
    ).toBeVisible();
    expect(list()).toEqual(initial);
  });

  it("offers Undo for undoable successes and undoes that batch", async () => {
    const batchId = crypto.randomUUID();
    call = async () => ({ ok: true, data: undefined, batchId });
    opts = { undoable: true };
    undoAction.mockResolvedValue({ ok: true, data: undefined, batchId: "y" });
    render(<Harness />);
    await userEvent.click(screen.getByText("remove b"));
    expect(await screen.findByText("Deleted")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(undoAction).toHaveBeenCalledWith({ batchId }));
  });

  it("shows the message when the undo is refused", async () => {
    call = async () => ({ ok: true, data: undefined, batchId: "b1" });
    opts = { undoable: true };
    undoAction.mockResolvedValue({
      ok: false,
      code: "already_undone",
      message: "That was already undone.",
    });
    render(<Harness />);
    await userEvent.click(screen.getByText("remove b"));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByText("That was already undone.")).toBeVisible();
  });

  it("turns a thrown error into the reload message and reverts", async () => {
    call = () => Promise.reject(new Error("Failed to find Server Action"));
    render(<Harness />);
    await userEvent.click(screen.getByText("remove b"));
    expect(
      await screen.findByText("Couldn't save. Reload the page and try again."),
    ).toBeVisible();
    expect(list()).toEqual(initial);
  });
});
