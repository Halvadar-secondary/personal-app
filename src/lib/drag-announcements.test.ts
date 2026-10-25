import { describe, expect, it } from "vitest";
import { dragAnnouncements } from "./drag-announcements";

const names: Record<string, string> = {
  t1: "Learn scales",
  t2: "Play a jig",
  active: "Active",
};
const a = dragAnnouncements((id) => names[String(id)]);
const item = (id: string) => ({ id }) as never;

describe("dragAnnouncements", () => {
  it("speaks titles, never ids", () => {
    expect(a.onDragStart({ active: item("t1") })).toBe(
      "Picked up Learn scales.",
    );
    expect(a.onDragOver({ active: item("t1"), over: item("t2") })).toBe(
      "Learn scales is over Play a jig.",
    );
    expect(a.onDragOver({ active: item("t1"), over: null })).toBe(
      "Learn scales is no longer over a drop area.",
    );
    expect(a.onDragEnd({ active: item("t1"), over: item("active") })).toBe(
      "Learn scales was dropped on Active.",
    );
    expect(a.onDragEnd({ active: item("t1"), over: null })).toBe(
      "Learn scales was dropped.",
    );
    expect(a.onDragCancel({ active: item("t1"), over: null })).toBe(
      "Moving Learn scales was cancelled.",
    );
  });

  it("an unknown id is 'item', not the id", () => {
    expect(a.onDragStart({ active: item("x9") })).toBe("Picked up item.");
  });
});
