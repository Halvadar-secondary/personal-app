import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ChatModelSettings } from "./chat-model-settings";

const actions = vi.hoisted(() => ({ updateSettingsAction: vi.fn() }));
vi.mock("@/server/actions/settings", () => actions);
vi.mock("@/server/actions/history", () => ({}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const tiers = [
  { tier: "quick", label: "Quick", name: "Claude Haiku 5.5" },
  { tier: "smart", label: "Smart", name: "Claude Sonnet 5.5" },
  { tier: "deep", label: "Deepest", name: "Claude Opus 5.5" },
] as const;
const none = { quick: null, smart: null, deep: null };

beforeEach(() => {
  actions.updateSettingsAction.mockReset();
  actions.updateSettingsAction.mockResolvedValue({
    ok: true,
    data: {},
    batchId: "b",
  });
});

it("lists the three tiers with their current model and Automatic selected", () => {
  render(<ChatModelSettings tiers={[...tiers]} overrides={none} />);
  expect(screen.getByText("Claude Haiku 5.5")).toBeInTheDocument();
  expect(screen.getByText("Claude Sonnet 5.5")).toBeInTheDocument();
  expect(screen.getByText("Claude Opus 5.5")).toBeInTheDocument();
  expect(screen.getAllByText("Automatic (newest)")).toHaveLength(3);
});

it("pins a model id", async () => {
  render(<ChatModelSettings tiers={[...tiers]} overrides={none} />);
  await userEvent.type(
    screen.getByRole("textbox", { name: "Smart model id" }),
    "claude-opus-5",
  );
  await userEvent.click(screen.getByRole("button", { name: "Pin Smart" }));
  expect(actions.updateSettingsAction).toHaveBeenCalledWith({
    chatModelSmart: "claude-opus-5",
  });
});

it("shows the validation message for an invalid id", async () => {
  actions.updateSettingsAction.mockResolvedValue({
    ok: false,
    message: "Model ids look like claude-opus-5",
  });
  render(<ChatModelSettings tiers={[...tiers]} overrides={none} />);
  await userEvent.type(
    screen.getByRole("textbox", { name: "Quick model id" }),
    "Not A Model",
  );
  await userEvent.click(screen.getByRole("button", { name: "Pin Quick" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Model ids look like claude-opus-5",
  );
});

it("goes back to Automatic by clearing the pin", async () => {
  render(
    <ChatModelSettings
      tiers={[...tiers]}
      overrides={{ ...none, deep: "claude-opus-4" }}
    />,
  );
  expect(screen.getByRole("textbox", { name: "Deepest model id" })).toHaveValue(
    "claude-opus-4",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Use automatic for Deepest" }),
  );
  expect(actions.updateSettingsAction).toHaveBeenCalledWith({
    chatModelDeep: null,
  });
});
