import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.venv/**",
      "**/__pycache__/**",
      "**/*.d.ts"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    settings: {
      "import/resolver": {
        typescript: true
      }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          "checksVoidReturn": {
            "attributes": false
          }
        }
      ]
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      import: importPlugin
    },
    rules: {
      "import/no-relative-packages": "error"
    }
  },
  ...compat.config({
    extends: ["next/core-web-vitals"]
  }).map((config) => ({
    ...config,
    files: ["apps/web/**/*.{ts,tsx}"]
  }))
);
