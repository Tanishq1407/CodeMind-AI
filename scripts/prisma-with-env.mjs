import { spawnSync } from "node:child_process";
import path from "node:path";
import nextEnv from "@next/env";

// Prisma CLI doesn't load Next.js's .env.local by default. Load the same
// server-side environment before migrations/validation so Neon URLs stay local.
nextEnv.loadEnvConfig(process.cwd());

const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error("Could not start Prisma CLI.");
  process.exit(1);
}

process.exit(result.status ?? 1);
