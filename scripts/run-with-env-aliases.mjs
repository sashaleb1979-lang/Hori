import { spawn } from "node:child_process";

const envAliasMap = {
  BOT_TOKEN: "DISCORD_TOKEN",
  BOT_ID: "DISCORD_CLIENT_ID",
  BOT_OWNERS: "DISCORD_OWNER_IDS",
  BOT_LANG: "BOT_DEFAULT_LANGUAGE",
  HOST: "API_HOST",
  PORT: "API_PORT",
  ADMIN_KEY: "API_ADMIN_TOKEN",
  DB_URL: "DATABASE_URL",
  KV_URL: "REDIS_URL",
  AI_URL: "OLLAMA_BASE_URL",
  AI_FAST: "OLLAMA_FAST_MODEL",
  AI_SMART: "OLLAMA_SMART_MODEL",
  AI_EMBED: "OLLAMA_EMBED_MODEL",
  AI_TIMEOUT: "OLLAMA_TIMEOUT_MS",
  BRAVE_KEY: "BRAVE_SEARCH_API_KEY",
  HORI_CFG: "CFG",
  HORI_CONFIG_JSON: "CFG"
};

for (const [alias, canonical] of Object.entries(envAliasMap)) {
  if (!process.env[canonical] && process.env[alias]) {
    process.env[canonical] = process.env[alias];
  }
}

const command = process.argv.slice(2).join(" ").trim();

if (!command) {
  console.error("Missing command for run-with-env-aliases");
  process.exit(1);
}

const child = spawn(command, {
  stdio: "inherit",
  shell: true,
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

