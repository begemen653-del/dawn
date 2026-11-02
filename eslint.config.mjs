import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    ".cache/**",
    "coverage/**",
    "web/.next/**",
    "web/out/**",
    "web/public/serwist/**",
    "web/next-env.d.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["scripts/**", "pipeline/**", "config/**", "*.ts", "*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["web/**/*.{ts,tsx}"],
    extends: [nextVitals],
    settings: { next: { rootDir: "web/" } },
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["web/src/sw/**"],
    languageOptions: { globals: globals.serviceworker },
  },
]);
