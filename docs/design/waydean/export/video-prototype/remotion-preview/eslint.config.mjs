import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    files: ["src/**/*.{mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        Blob: "readonly",
        DOMException: "readonly",
        setTimeout: "readonly",
      },
    },
  },
];
