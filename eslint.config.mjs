import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

const nextWebConfigs = nextVitals
  .filter((config) => !("ignores" in config && Object.keys(config).length === 1))
  .map((config) => ({
    ...config,
    files: ["apps/web/**/*.{js,jsx,ts,tsx,mjs,mts,cts}"]
  }));

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
  ...nextWebConfigs,
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
          checksVoidReturn: {
            attributes: false
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
  }
);
