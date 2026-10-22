import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

// ESLint cold-starts slowly when the db tests load the machine.
describe("domain import boundaries", { timeout: 30_000 }, () => {
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
    expect(
      r!.messages.filter((m) => m.ruleId === "no-restricted-imports"),
    ).toHaveLength(0);
  });
});
