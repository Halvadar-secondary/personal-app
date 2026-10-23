import { expect, it } from "vitest";
import { COVER_PRESETS } from "./covers";

it("has 8 distinct cover presets, the mockup's five first", () => {
  expect(COVER_PRESETS).toHaveLength(8);
  expect(new Set(COVER_PRESETS.map((c) => c.id)).size).toBe(8);
  expect(new Set(COVER_PRESETS.map((c) => c.value)).size).toBe(8);
  expect(COVER_PRESETS[0]!.value).toBe(
    "linear-gradient(120deg,#f6d365,#fda085)",
  );
  expect(COVER_PRESETS[4]!.value).toBe(
    "linear-gradient(120deg,#30cfd0,#330867)",
  );
});
