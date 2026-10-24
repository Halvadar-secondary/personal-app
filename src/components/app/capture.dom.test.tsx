import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { Capture } from "./capture";
import { CaptureDestination, CaptureProvider } from "./capture-context";

const captureAction = vi.fn();
vi.mock("@/server/actions/inbox", () => ({
  captureAction: (i: unknown) => captureAction(i),
}));
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const AREA = "6f1c2b0a-6d8e-4d55-9a57-0d7c1c7d1c11";

function setup(children?: React.ReactNode) {
  render(
    <CaptureProvider>
      <input aria-label="Somewhere else" />
      {children}
      <Capture />
    </CaptureProvider>,
  );
}

const field = () => screen.getByRole("textbox", { name: "Capture text" });

beforeEach(() => {
  pathname = "/";
  captureAction.mockReset();
  captureAction.mockResolvedValue({
    ok: true,
    data: { kind: "task", id: "t" },
    batchId: "b",
  });
});

it("C opens capture from the page", async () => {
  setup();
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.keyboard("c");
  expect(screen.getByRole("dialog", { name: "Capture" })).toBeVisible();
  expect(field()).toHaveValue("");
  expect(screen.getByText("→ Inbox")).toBeVisible();
});

it("Enter saves, clears, and keeps the dialog open", async () => {
  setup();
  await userEvent.keyboard("c");
  await userEvent.type(field(), "Buy strings{Enter}");
  expect(captureAction).toHaveBeenCalledWith({
    text: "Buy strings",
    context: undefined,
  });
  expect(await screen.findByText("Saved")).toBeVisible();
  expect(field()).toHaveValue("");
  expect(field()).toHaveFocus();
  expect(screen.getByRole("dialog", { name: "Capture" })).toBeVisible();
});

it("keeps the text and shows the message when refused", async () => {
  captureAction.mockResolvedValue({
    ok: false,
    code: "not_found",
    message: "That item no longer exists. Refresh to see the latest.",
  });
  setup();
  await userEvent.keyboard("c");
  await userEvent.type(field(), "Buy strings{Enter}");
  expect(
    await screen.findByText(
      "That item no longer exists. Refresh to see the latest.",
    ),
  ).toBeVisible();
  expect(field()).toHaveValue("Buy strings");
});

it("the Achievement toggle sends a leading !", async () => {
  setup();
  await userEvent.keyboard("c");
  await userEvent.click(screen.getByRole("button", { name: "Achievement" }));
  await userEvent.type(field(), "Learn sweep picking{Enter}");
  expect(captureAction).toHaveBeenCalledWith({
    text: "!Learn sweep picking",
    context: undefined,
  });
});

it("C typed inside an input does not open capture", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Somewhere else"), "chocolate");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("Somewhere else")).toHaveValue("chocolate");
});

it("C with a modifier does not open capture", async () => {
  setup();
  await userEvent.keyboard("{Control>}c{/Control}");
  await userEvent.keyboard("{Meta>}c{/Meta}");
  await userEvent.keyboard("{Alt>}c{/Alt}");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("uses the area id as context on /areas/[id]", async () => {
  pathname = `/areas/${AREA}`;
  setup(<CaptureDestination name="Guitar" />);
  await userEvent.keyboard("c");
  expect(screen.getByText("→ Guitar")).toBeVisible();
  await userEvent.type(field(), "Alternate picking{Enter}");
  expect(captureAction).toHaveBeenCalledWith({
    text: "Alternate picking",
    context: { areaId: AREA },
  });
});

it("uses the achievement id as context on /achievements/[id]", async () => {
  pathname = `/achievements/${AREA}`;
  setup();
  await userEvent.keyboard("c");
  await userEvent.type(field(), "Metronome at 120{Enter}");
  expect(captureAction).toHaveBeenCalledWith({
    text: "Metronome at 120",
    context: { achievementId: AREA },
  });
});
