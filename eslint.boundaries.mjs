// The domain layer is shared by the UI and MCP adapters; it must not depend on them.
/** @type {import("eslint").Linter.Config} */
export const domainBoundaries = {
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
};
