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

