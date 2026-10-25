import { expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "" }),
  Geist_Mono: () => ({ variable: "" }),
}));

// Android Chrome overlays the keyboard unless asked to resize: the create
// sheet's button would sit behind it.
it("the layout viewport resizes for the on-screen keyboard", async () => {
  const { viewport } = await import("./layout");
  expect(viewport.interactiveWidget).toBe("resizes-content");
});
