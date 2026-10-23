import { describe, expect, it } from "vitest";
import { moveBy, placeInList, placeOnBoard } from "./placement";

const ids = ["a", "b", "c", "d"];

describe("placeInList", () => {
  it("moving down takes the target's place", () =>
    expect(placeInList(ids, "a", 2)).toEqual({ afterId: "c", beforeId: "d" }));
  it("moving up takes the target's place", () =>
    expect(placeInList(ids, "d", 1)).toEqual({ afterId: "a", beforeId: "b" }));
  it("last into the first slot", () =>
    expect(placeInList(ids, "d", 0)).toEqual({ afterId: null, beforeId: "a" }));
  it("first into the last slot", () =>
    expect(placeInList(ids, "a", 3)).toEqual({ afterId: "d", beforeId: null }));
  it("no move is null", () => expect(placeInList(ids, "b", 1)).toBeNull());
  it("an unknown id is null", () =>
    expect(placeInList(ids, "z", 0)).toBeNull());
});

describe("placeOnBoard", () => {
  const cols = { backlog: ["x", "y"], active: ["p"], done: [] };
  it("onto an empty column appends", () =>
    expect(placeOnBoard(cols, "x", { column: "done", id: null })).toEqual({
      status: "done",
      afterId: null,
      beforeId: null,
    }));
  it("onto a column background appends after its last card", () =>
    expect(placeOnBoard(cols, "x", { column: "active", id: null })).toEqual({
      status: "active",
      afterId: "p",
      beforeId: null,
    }));
  it("onto a card in another column goes before it", () =>
    expect(placeOnBoard(cols, "y", { column: "active", id: "p" })).toEqual({
      status: "active",
      afterId: null,
      beforeId: "p",
    }));
  it("onto itself is null", () =>
    expect(placeOnBoard(cols, "x", { column: "backlog", id: "x" })).toBeNull());
  it("within a column delegates to placeInList", () =>
    expect(placeOnBoard(cols, "x", { column: "backlog", id: "y" })).toEqual({
      status: "backlog",
      afterId: "y",
      beforeId: null,
    }));
  it("onto its own column's background when already last is null", () =>
    expect(
      placeOnBoard(cols, "y", { column: "backlog", id: null }),
    ).toBeNull());
  it("onto its own column's background moves to the end", () =>
    expect(placeOnBoard(cols, "x", { column: "backlog", id: null })).toEqual({
      status: "backlog",
      afterId: "y",
      beforeId: null,
    }));
  it("an id in no column is null", () =>
    expect(placeOnBoard(cols, "z", { column: "done", id: null })).toBeNull());
});

describe("moveBy", () => {
  it("is null at the edges", () => {
    expect(moveBy(ids, "a", -1)).toBeNull();
    expect(moveBy(ids, "d", 1)).toBeNull();
  });
  it("swaps with the next neighbour", () =>
    expect(moveBy(ids, "b", 1)).toEqual({ afterId: "c", beforeId: "d" }));
  it("swaps with the previous neighbour", () =>
    expect(moveBy(ids, "c", -1)).toEqual({ afterId: "a", beforeId: "b" }));
});
