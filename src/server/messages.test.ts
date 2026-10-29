import { expect, it } from "vitest";
import { messageFor } from "./messages";

it("says when a reminder couldn't reach any device", () => {
  expect(messageFor("invalid_state", { reason: "push" })).toBe(
    "Couldn't reach your devices. Turn the reminder off and on again here.",
  );
  expect(messageFor("invalid_state", { reason: "no_devices" })).toBe(
    "No device gets reminders yet. Turn the reminder on here first.",
  );
  expect(messageFor("invalid_state")).toBe(
    "This page was out of date. It's been refreshed.",
  );
});
