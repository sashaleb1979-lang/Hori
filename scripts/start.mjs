import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const role = process.env.APP_ROLE ?? "bot";

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

