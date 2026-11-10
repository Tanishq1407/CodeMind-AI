import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const nextConfigDirectory = dirname(require.resolve("eslint-config-next/package.json"));
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  resolvePluginsRelativeTo: nextConfigDirectory,
});

const config = [
  ...compat.extends("next/core-web-vitals"),
  globalIgnores([".next/**", "node_modules/**", "coverage/**"]),
];

export default config;
