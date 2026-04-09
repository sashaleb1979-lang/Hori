import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Railway may receive all env vars concatenated into a single value
// e.g. APP_ROLE="bot NODE_ENV=production DATABASE_URL=..."
// Split them out so the app starts correctly.
const rawRole = process.env.APP_ROLE ?? "bot";
const parts = rawRole.trim().split(/\s+/);
const role = parts[0];

for (let i = 1; i < parts.length; i++) {
  const eq = parts[i].indexOf("=");
  if (eq > 0) {
    const key = parts[i].slice(0, eq);
    const value = parts[i].slice(eq + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Resolve DATABASE_URL from alias before Prisma CLI runs
if (!process.env.DATABASE_URL && process.env.DB_URL) {
  process.env.DATABASE_URL = process.env.DB_URL;
}

// Auto-apply database migrations and seed on first start.
// Safe to run repeatedly: prisma migrate deploy is idempotent.
try {
  console.log("[start] applying database migrations...");
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", cwd: process.cwd() });
  console.log("[start] migrations applied");
} catch (error) {
  console.error("[start] migration failed:", error.message);
  process.exit(1);
}

try {
  console.log("[start] seeding database...");
  execSync("pnpm exec tsx prisma/seed.ts", { stdio: "inherit", cwd: process.cwd() });
  console.log("[start] seed complete");
} catch (error) {
  // Seed failure is non-fatal — tables exist, flags will use defaults
  console.warn("[start] seed skipped:", error.message);
}

const entries = {
  bot: "apps/bot/dist/index.js",
  api: "apps/api/dist/index.js",
  worker: "apps/worker/dist/index.js"
};

const entry = entries[role];

if (!entry) {
  throw new Error(`Unknown APP_ROLE "${role}". Expected one of: ${Object.keys(entries).join(", ")}`);
}

await import(pathToFileURL(resolve(process.cwd(), entry)).href);

