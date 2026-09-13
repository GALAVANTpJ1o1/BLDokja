import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
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
  globalIgnores(["**/node_modules/", "**/dist/", "legacy/", "**/coverage/"]),
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
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
