import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { domainBoundaries } from "../../eslint.boundaries.mjs";

// Only the boundary rule: loading the full Next config cold takes 30s+ while
// the db tests run alongside.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: true,
  overrideConfig: [{ files: ["**/*.ts"] }, domainBoundaries],
});

describe("domain import boundaries", () => {
  it("forbids domain code importing adapters", async () => {
    const [r] = await eslint.lintText(
      `import x from "@/server/mcp/tools";\nexport default x;\n`,
      { filePath: "src/server/domain/example.ts" },
    );
    expect(r!.messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true,
    );
  });

  it("allows domain code importing lib", async () => {
    const [r] = await eslint.lintText(
      `import { cn } from "@/lib/utils";\nexport const y = cn;\n`,
      { filePath: "src/server/domain/example.ts" },
    );
    expect(r!.messages).toEqual([]);
  });
});
