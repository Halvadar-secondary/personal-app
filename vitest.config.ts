import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/*.dom.test.tsx", "node_modules/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.dom.test.tsx"],
          setupFiles: ["src/test/dom-setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          environment: "node",
          include: ["src/**/*.db.test.ts", "scripts/**/*.db.test.ts"],
          testTimeout: 30_000,
          // Each test starts its own PGlite; under a full parallel run that
          // setup alone can pass the default 10s.
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/server/domain/**"],
      exclude: ["src/lib/utils.ts", "src/lib/auth-client.ts"],
      thresholds: { lines: 90 },
    },
  },
});
