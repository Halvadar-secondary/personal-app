import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The domain layer is shared by the UI and MCP adapters; it must not depend on them.
    files: ["src/server/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/server/actions/*", "@/server/mcp/*"],
              message:
                "Domain code must not import from adapters (app, actions, mcp).",
            },
            {
              group: ["**/app/**", "**/actions/**", "**/mcp/**"],
              message:
                "Domain code must not import from adapters (app, actions, mcp).",
            },
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".superpowers/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
