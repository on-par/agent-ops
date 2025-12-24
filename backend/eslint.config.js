import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["dist/", "node_modules/"],
  },
  js.configs.recommended,
  eslintConfigPrettier,
  // Main source files
  {
    files: ["**/*.ts"],
    ignores: ["**/*.test.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Disable base rules that conflict with TS versions
      "no-unused-vars": "off",
      "no-redeclare": "off",
      // Custom rules from original .eslintrc.json
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Test files - more permissive
  {
    files: ["**/*.test.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Disable base rules
      "no-unused-vars": "off",
      "no-redeclare": "off",
      // Relax rules for test files
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
];
