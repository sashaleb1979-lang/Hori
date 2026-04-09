import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function runNodeCommand(label, args, options = {}) {
  const attempts = options.attempts ?? 1;
  const delayMs = options.delayMs ?? 0;
  const fatal = options.fatal ?? true;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execFileSync(process.execPath, args, {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env
      });
      return true;
    } catch (error) {
      const message = asErrorMessage(error);
      const lastAttempt = attempt === attempts;
      const prefix = `[start] ${label} failed`;

      if (lastAttempt) {
        if (fatal) {
          console.error(`${prefix}: ${message}`);
          process.exit(1);
        }

        console.warn(`${prefix}: ${message}`);
        return false;
      }

      console.warn(`${prefix} (attempt ${attempt}/${attempts}): ${message}`);

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  return false;
}

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

const prismaCli = require.resolve("prisma/build/index.js");
const seedScript = resolve(process.cwd(), "prisma/seed.mjs");

// Auto-apply database migrations and seed on first start.
// Safe to run repeatedly: prisma migrate deploy is idempotent.
console.log("[start] applying database migrations...");
await runNodeCommand("migration", [prismaCli, "migrate", "deploy"], {
  attempts: 10,
  delayMs: 3000,
  fatal: true
});
console.log("[start] migrations applied");

console.log("[start] seeding database...");
const seeded = await runNodeCommand("seed", [seedScript], {
  attempts: 3,
  delayMs: 2000,
  fatal: false
});
if (seeded) {
  console.log("[start] seed complete");
} else {
  console.warn("[start] seed skipped");
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

