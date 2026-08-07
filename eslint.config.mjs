import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      "@next/next/no-page-custom-font": "off",
      "react-hooks/exhaustive-deps": "warn",
      // Next 16 enables the React Compiler lint suite by default. Keep the
      // pre-upgrade policy here; remediating existing hook architecture is
      // tracked separately from this framework migration.
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "cache/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
