import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SettingsForm } from "./settings-form";

const actions = vi.hoisted(() => ({ updateSettingsAction: vi.fn() }));
vi.mock("@/server/actions/settings", () => actions);
vi.mock("@/server/actions/history", () => ({}));

beforeEach(() => {
  actions.updateSettingsAction.mockReset();
  actions.updateSettingsAction.mockResolvedValue({
    ok: true,
    data: {},
    batchId: "b",
  });
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    timeZone: "Asia/Tbilisi",
  } as Intl.ResolvedDateTimeFormatOptions);
});

it("offers the device time zone when it differs and saves it", async () => {
  render(<SettingsForm initial={{ timeZone: "UTC", weekStart: 1 }} />);
  await userEvent.click(
    screen.getByRole("button", {
      name: "Use this device's time zone (Asia/Tbilisi)",
    }),
  );
  expect(actions.updateSettingsAction).toHaveBeenCalledWith({
    timeZone: "Asia/Tbilisi",
  });
});

it("hides the device button when they match", () => {
  render(<SettingsForm initial={{ timeZone: "Asia/Tbilisi", weekStart: 1 }} />);
  expect(
    screen.queryByRole("button", { name: /Use this device's time zone/ }),
  ).toBeNull();
});

it("saves week start", async () => {
  render(<SettingsForm initial={{ timeZone: "UTC", weekStart: 1 }} />);
  expect(screen.getByRole("radio", { name: "Monday" })).toBeChecked();
  await userEvent.click(screen.getByRole("radio", { name: "Sunday" }));
  expect(actions.updateSettingsAction).toHaveBeenCalledWith({ weekStart: 0 });
});

it("saves a chosen time zone", async () => {
  render(<SettingsForm initial={{ timeZone: "UTC", weekStart: 1 }} />);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Time zone" }),
    "Europe/Dublin",
  );
  expect(actions.updateSettingsAction).toHaveBeenCalledWith({
    timeZone: "Europe/Dublin",
  });
});
