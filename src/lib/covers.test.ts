import { expect, it } from "vitest";
import { COVER_PRESETS, coverBackground } from "./covers";

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

it("turns a cover into a CSS background, with a fallback", () => {
  expect(coverBackground(null)).toBe(COVER_PRESETS[7]!.value);
  expect(
    coverBackground({ type: "gradient", value: "linear-gradient(red,blue)" }),
  ).toBe("linear-gradient(red,blue)");
  expect(coverBackground({ type: "color", value: "#fff" })).toBe("#fff");
  expect(coverBackground({ type: "image", value: "https://x/y.png" })).toBe(
    'center / cover url("https://x/y.png")',
  );
});
