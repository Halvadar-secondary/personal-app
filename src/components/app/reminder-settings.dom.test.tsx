import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReminderSettings } from "./reminder-settings";

const server = vi.hoisted(() => ({
  updateReminderAction: vi.fn(),
  savePushSubscriptionAction: vi.fn(),
  deletePushSubscriptionAction: vi.fn(),
  sendTestReminderAction: vi.fn(),
}));
vi.mock("@/server/actions/reminders", () => ({
  updateReminderAction: (i: unknown) => server.updateReminderAction(i),
  savePushSubscriptionAction: (i: unknown) =>
    server.savePushSubscriptionAction(i),
  deletePushSubscriptionAction: (i: unknown) =>
    server.deletePushSubscriptionAction(i),
  sendTestReminderAction: (i: unknown) => server.sendTestReminderAction(i),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const sub = {
  toJSON: () => ({
    endpoint: "https://push.example/1",
    keys: { p256dh: "p", auth: "a" },
  }),
};
const subscribe = vi.fn();
const register = vi.fn();
const requestPermission = vi.fn();
const getRegistration = vi.fn();

beforeEach(() => {
  for (const f of Object.values(server)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: { sent: 1 }, batchId: "b" });
  }
  subscribe.mockReset().mockResolvedValue(sub);
  register.mockReset().mockResolvedValue({
    pushManager: { subscribe, getSubscription: async () => null },
  });
  requestPermission.mockReset().mockResolvedValue("granted");
  getRegistration.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("Notification", { requestPermission, permission: "default" });
  vi.stubGlobal("PushManager", function PushManager() {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, getRegistration, ready: Promise.resolve({}) },
  });
});
afterEach(() => vi.unstubAllGlobals());

const initial = { enabled: false, time: "21:00", devices: 0 };

it("turning it on asks permission, subscribes this device and saves", async () => {
  render(<ReminderSettings publicKey={KEY} initial={initial} />);
  await userEvent.click(
    screen.getByRole("switch", { name: "Evening reminder" }),
  );
  await waitFor(() =>
    expect(server.savePushSubscriptionAction).toHaveBeenCalledWith({
      endpoint: "https://push.example/1",
      p256dh: "p",
      auth: "a",
    }),
  );
  expect(requestPermission).toHaveBeenCalled();
  expect(register).toHaveBeenCalledWith("/sw.js");
  expect(subscribe).toHaveBeenCalledWith(
    expect.objectContaining({ userVisibleOnly: true }),
  );
  expect(server.updateReminderAction).toHaveBeenCalledWith({ enabled: true });
});

it("changes the time", async () => {
  render(
    <ReminderSettings
      publicKey={KEY}
      initial={{ enabled: true, time: "21:00", devices: 1 }}
    />,
  );
  const time = screen.getByLabelText("Reminder time");
  await userEvent.clear(time);
  await userEvent.type(time, "20:30");
  await userEvent.tab();
  expect(server.updateReminderAction).toHaveBeenCalledWith({ time: "20:30" });
  await userEvent.click(screen.getByRole("button", { name: "Send a test" }));
  expect(server.sendTestReminderAction).toHaveBeenCalledWith({});
});

it("says when permission is blocked", async () => {
  requestPermission.mockResolvedValue("denied");
  render(<ReminderSettings publicKey={KEY} initial={initial} />);
  await userEvent.click(
    screen.getByRole("switch", { name: "Evening reminder" }),
  );
  expect(
    await screen.findByText("Notifications are blocked for this site."),
  ).toBeVisible();
  expect(server.updateReminderAction).not.toHaveBeenCalled();
});

it("explains when the browser can't do notifications", () => {
  vi.stubGlobal("PushManager", undefined);
  render(<ReminderSettings publicKey={KEY} initial={initial} />);
  expect(
    screen.getByText(/This browser can't show notifications/),
  ).toBeVisible();
  expect(
    screen.getByRole("switch", { name: "Evening reminder" }),
  ).toBeDisabled();
});

it("says reminders aren't set up when the server has no key", () => {
  render(<ReminderSettings publicKey={null} initial={initial} />);
  expect(screen.getByText(/aren't set up on the server yet/)).toBeVisible();
});

it("a second device can join while reminders are on", async () => {
  render(
    <ReminderSettings
      publicKey={KEY}
      initial={{ enabled: true, time: "21:00", devices: 1 }}
    />,
  );
  expect(screen.getByText("On 1 device")).toBeVisible();
  await userEvent.click(
    await screen.findByRole("button", { name: "Get reminders on this device" }),
  );
  await waitFor(() =>
    expect(server.savePushSubscriptionAction).toHaveBeenCalled(),
  );
  expect(server.updateReminderAction).not.toHaveBeenCalled();
});

it("a device already subscribed isn't offered to join again", async () => {
  getRegistration.mockResolvedValue({
    pushManager: { getSubscription: async () => sub },
  });
  render(
    <ReminderSettings
      publicKey={KEY}
      initial={{ enabled: true, time: "21:00", devices: 1 }}
    />,
  );
  await waitFor(() => expect(getRegistration).toHaveBeenCalled());
  expect(
    screen.queryByRole("button", { name: "Get reminders on this device" }),
  ).toBeNull();
});

it("changing the time back saves it again", async () => {
  render(
    <ReminderSettings
      publicKey={KEY}
      initial={{ enabled: true, time: "21:00", devices: 1 }}
    />,
  );
  const time = screen.getByLabelText("Reminder time");
  await userEvent.clear(time);
  await userEvent.type(time, "20:00");
  await userEvent.tab();
  await userEvent.clear(time);
  await userEvent.type(time, "21:00");
  await userEvent.tab();
  expect(server.updateReminderAction).toHaveBeenLastCalledWith({
    time: "21:00",
  });
});
