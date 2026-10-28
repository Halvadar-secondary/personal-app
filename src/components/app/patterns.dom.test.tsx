import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { Patterns } from "./patterns";

it("shows each tracker's last week against the week before, with its notes", () => {
  render(
    <Patterns
      clock={{
        timeZone: "UTC",
        weekStart: 1,
        now: new Date("2026-03-11T12:00:00Z"),
      }}
      patterns={{
        from: "2026-03-02",
        to: "2026-03-08",
        trackers: [
          {
            id: "t1",
            name: "Anger",
            emoji: "😠",
            direction: "less",
            count: 3,
            previous: 5,
            notes: [
              {
                at: new Date("2026-03-03T18:30:00Z"),
                intensity: 4,
                note: "tired after the client call",
              },
            ],
          },
        ],
      }}
    />,
  );
  const s = within(screen.getByRole("region", { name: "Patterns" }));
  expect(
    s.getByText("😠 Anger: 3 last week (5 the week before)"),
  ).toBeVisible();
  expect(s.getByText("2 fewer than the week before")).toBeVisible();
  expect(s.getByText(/tired after the client call/)).toBeVisible();
  expect(s.getByRole("link", { name: "Trackers" })).toHaveAttribute(
    "href",
    "/trackers",
  );
});

it("is hidden without trackers", () => {
  const { container } = render(
    <Patterns
      clock={{ timeZone: "UTC", weekStart: 1, now: new Date() }}
      patterns={{ from: "a", to: "b", trackers: [] }}
    />,
  );
  expect(container).toBeEmptyDOMElement();
});
