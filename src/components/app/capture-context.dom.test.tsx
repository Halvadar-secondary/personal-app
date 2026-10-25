import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import {
  CaptureDestination,
  CaptureProvider,
  useCapture,
} from "./capture-context";

const guitar = { id: "g", name: "Guitar", emoji: "🎸" };

function Probe() {
  const c = useCapture();
  return (
    <>
      <output aria-label="state">
        {JSON.stringify({ open: c.open, preset: c.preset, page: c.page })}
      </output>
      <button
        onClick={() => c.openCreate({ kind: "achievement", status: "active" })}
      >
        preset
      </button>
      <button onClick={() => c.setOpen(true)}>plain</button>
      <button onClick={() => c.setOpen(false)}>close</button>
    </>
  );
}

const state = () =>
  JSON.parse(screen.getByLabelText("state").textContent ?? "null");

it("a page registers its context and clears it when it goes", () => {
  const ui = (on: boolean) => (
    <CaptureProvider>
      {on && (
        <CaptureDestination
          area={guitar}
          achievement={{ id: "s", title: "Sweep" }}
        />
      )}
      <Probe />
    </CaptureProvider>
  );
  const { rerender } = render(ui(true));
  expect(state().page).toEqual({
    area: guitar,
    achievement: { id: "s", title: "Sweep" },
  });
  rerender(ui(false));
  expect(state().page).toBeNull();
});

it("openCreate opens with its preset; setOpen(true) clears it", async () => {
  render(
    <CaptureProvider>
      <Probe />
    </CaptureProvider>,
  );
  await userEvent.click(screen.getByText("preset"));
  expect(state()).toMatchObject({
    open: true,
    preset: { kind: "achievement", status: "active" },
  });
  await userEvent.click(screen.getByText("close"));
  await userEvent.click(screen.getByText("plain"));
  expect(state()).toMatchObject({ open: true, preset: {} });
});
