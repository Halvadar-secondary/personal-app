import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isNewerBuild, VersionBanner } from "./version-banner";

const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});
afterEach(() => vi.useRealTimers());

/** Lets pending fetch promises and their state updates settle. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));
const after = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  fireEvent(document, new Event("visibilitychange"));
}

describe("isNewerBuild", () => {
  it.each([
    ["a", "a", false],
    ["a", "b", true],
    ["dev", "b", false],
    ["a", "dev", false],
    ["a", undefined, false],
  ] as const)("%s vs %s → %s", (current, deployed, expected) => {
    expect(isNewerBuild(current, deployed)).toBe(expected);
  });
});

describe("VersionBanner", () => {
  it("stays hidden while the build matches", async () => {
    const fetchBuildId = vi.fn().mockResolvedValue("a");
    render(<VersionBanner current="a" fetchBuildId={fetchBuildId} />);
    await settle();
    await after(5 * MIN);
    expect(fetchBuildId).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows after a poll finds a new build, and refresh reloads", async () => {
    const reload = vi.fn();
    const fetchBuildId = vi
      .fn()
      .mockResolvedValueOnce("a")
      .mockResolvedValueOnce("b");
    render(
      <VersionBanner current="a" fetchBuildId={fetchBuildId} reload={reload} />,
    );
    await settle();
    expect(screen.queryByRole("status")).toBeNull();
    await after(5 * MIN);
    expect(screen.getByRole("status")).toHaveTextContent(
      "New version available.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("checks again when the tab becomes visible", async () => {
    const fetchBuildId = vi
      .fn()
      .mockResolvedValueOnce("a")
      .mockResolvedValueOnce("b");
    render(<VersionBanner current="a" fetchBuildId={fetchBuildId} />);
    await settle();
    setVisibility("hidden");
    await settle();
    expect(fetchBuildId).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    await settle();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("stays quiet when the health check fails", async () => {
    const fetchBuildId = vi.fn().mockResolvedValue(undefined);
    render(<VersionBanner current="a" fetchBuildId={fetchBuildId} />);
    await settle();
    await after(10 * MIN);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never shows in dev", async () => {
    const fetchBuildId = vi.fn().mockResolvedValue("b");
    render(<VersionBanner current="dev" fetchBuildId={fetchBuildId} />);
    await settle();
    await after(5 * MIN);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows once even across further polls", async () => {
    const fetchBuildId = vi.fn().mockResolvedValue("b");
    render(<VersionBanner current="a" fetchBuildId={fetchBuildId} />);
    await settle();
    await after(15 * MIN);
    setVisibility("visible");
    await settle();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    // Found it: no more polling.
    expect(fetchBuildId).toHaveBeenCalledTimes(1);
  });

  it("skips timed checks while the tab is hidden", async () => {
    const fetchBuildId = vi.fn().mockResolvedValue("a");
    render(<VersionBanner current="a" fetchBuildId={fetchBuildId} />);
    await settle();
    setVisibility("hidden");
    await after(30 * MIN);
    // A hidden tab must not keep the database awake.
    expect(fetchBuildId).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    await settle();
    expect(fetchBuildId).toHaveBeenCalledTimes(2);
  });

  it("asks the database-free version route by default", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ buildId: "a" }));
    render(<VersionBanner current="a" />);
    await settle();
    expect(fetchMock).toHaveBeenCalledWith("/api/version", {
      cache: "no-store",
    });
    fetchMock.mockRestore();
  });
});
