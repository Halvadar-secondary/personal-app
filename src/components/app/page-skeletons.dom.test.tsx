import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AchievementSkeleton,
  AreaSkeleton,
  DaySkeleton,
  FormSkeleton,
  ListSkeleton,
  OverviewSkeleton,
  PlanSkeleton,
  SectionSkeleton,
  WeekSkeleton,
} from "./page-skeletons";

describe("Skeleton", () => {
  it("is hidden from assistive tech and stops pulsing for reduced motion", () => {
    render(<Skeleton data-testid="s" className="h-4" />);
    const s = screen.getByTestId("s");
    expect(s).toHaveAttribute("aria-hidden", "true");
    expect(s).toHaveClass(
      "animate-pulse",
      "motion-reduce:animate-none",
      "bg-skeleton",
      "h-4",
    );
  });
});

describe("page skeletons", () => {
  it.each([
    ["skeleton-overview", <OverviewSkeleton key="o" />],
    ["skeleton-area", <AreaSkeleton key="a" />],
    ["skeleton-achievement", <AchievementSkeleton key="c" />],
    ["skeleton-inbox", <ListSkeleton key="l" testId="skeleton-inbox" />],
    [
      "skeleton-passkeys",
      <SectionSkeleton key="s" testId="skeleton-passkeys" />,
    ],
    ["skeleton-login", <FormSkeleton key="f" testId="skeleton-login" />],
    ["skeleton-day", <DaySkeleton key="d" />],
    ["skeleton-plan", <PlanSkeleton key="p" />],
    ["skeleton-week", <WeekSkeleton key="w" />],
  ])("%s announces one loading status and no text", (id, el) => {
    render(el);
    const status = screen.getByRole("status", { name: "Loading" });
    expect(status).toHaveAttribute("data-testid", id);
    expect(status.textContent).toBe("");
  });

  it("ListSkeleton draws the requested number of rows", () => {
    render(<ListSkeleton testId="x" rows={3} />);
    expect(screen.getByTestId("x").querySelectorAll("[data-row]")).toHaveLength(
      3,
    );
  });
});
