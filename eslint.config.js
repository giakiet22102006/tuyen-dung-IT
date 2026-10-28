const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-console": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/public/**",
      "**/.agents/**",
      "**/.archify/**",
      "**/.vercel/**",
      "**/coverage/**",
      "**/legacy-html/**",
      "**/storage/**",
      "**/tests/**",
      "**/scripts/**",
      "eslint.config.js",
    ],
  },
];
