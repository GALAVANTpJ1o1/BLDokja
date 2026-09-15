import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Globals that only exist in a browser or worker. cube-engine must never touch them.
const browserGlobals = [
  "window",
  "document",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "self",
  "fetch",
  "Worker",
  "requestAnimationFrame",
  "HTMLElement",
].map((name) => ({ name, message: "cube-engine is pure: no browser globals." }));

export default defineConfig([
  globalIgnores(["**/node_modules/", "**/dist/", "legacy/", "**/coverage/", "**/.next/", "**/out/", "**/next-env.d.ts",
    // Plain same-origin scripts served as written (ES5, no modules); covered by their own tests.
    "apps/web/public/"]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["packages/cube-engine/src/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", ...browserGlobals, { name: "process", message: "cube-engine is pure: no Node globals." }],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^(react|react-dom|next|dexie)(/.*)?$", message: "cube-engine is pure: no UI or storage libraries." },
            { regex: "^node:", message: "cube-engine is pure: no Node built-ins." },
            { regex: "^(fs|path|os|child_process|worker_threads|crypto)$", message: "cube-engine is pure: no Node built-ins." },
            { regex: "^cubing/(twisty|bluetooth|stream)$", message: "cube-engine is pure: no rendering or device modules." },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": ["error", { patterns: [{ regex: "^dexie(/.*)?$", message: "Only the storage package's adapter imports Dexie." }] }],
    },
  },
  {
    files: ["eslint.config.js", "apps/web/scripts/*.mjs", "apps/web/postcss.config.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
