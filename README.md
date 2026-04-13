# Hori Discord Bot

Production-ready TypeScript monorepo for a Discord bot with persona layers, analytics, memory, web search, admin controls and an external Ollama backend.

## Architecture
- `apps/bot`: Discord gateway, message ingestion, slash commands, context actions, reply routing.
- `apps/api`: internal Fastify API for health, readiness, metrics, admin read endpoints and debug traces.
- `apps/worker`: BullMQ workers for summaries, profiling, embeddings and cleanup jobs.
- `packages/core`: intent router, persona assembly, safety, orchestration, admin services.
- `packages/llm`: Ollama client, model router, tool-calling, prompt helpers.
- `packages/memory`: recent context, summaries, profile lifecycle, relationship profiles, semantic retrieval.
- `packages/analytics`: message ingestion, counters, aggregates, analytics queries.
- `packages/search`: Brave Search integration, page fetch, sanitization, cache.
- `packages/config`: env parsing, defaults, feature flags.
- `packages/shared`: logger, Prisma, Redis, queues, metrics, shared types.

## File Tree
```text
apps/
  bot/
  api/
  worker/
packages/
  analytics/
  config/
  core/
  llm/
  memory/
  search/
  shared/
prisma/
examples/
tests/
```

## Core Features In V1
- Reply by bot name, mention, reply to bot and message context actions.
- Natural language intents: `help`, `summary`, `analytics`, `search`, `memory_write`, `memory_forget`, `rewrite`, `profile`.
- Fast vs smart model routing through Ollama.
- Brave Search tools with cache, cooldown and fetch sanitization.
- Message ingestion and analytics counters stored in PostgreSQL.
- Three-layer memory: recent messages, channel summaries, server memory.
- Profiles only for active users above `USER_PROFILE_MIN_MESSAGES`.
- Relationship profiles and moderator-adjustable style.
- Debug trace persistence without exposing model chain-of-thought.

## Required Stack
- Node.js 24+
- pnpm
- PostgreSQL 15+ with `pgvector`
- Redis
- Ollama reachable over HTTP
- Brave Search API key

## Bootstrap
1. Install Git if it is not in `PATH`.
2. Enable pnpm via Corepack:
```bash
corepack enable
corepack prepare pnpm@10.11.0 --activate
```
3. Copy `.env.example` to `.env` and fill secrets.
4. Install dependencies:
```bash
pnpm install
```
5. Generate Prisma client and run the migration:
```bash
pnpm prisma:generate
pnpm prisma:deploy
```
6. Seed default feature flags:
```bash
pnpm seed
```

## Local Run
Run services in separate terminals:

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:bot
```

Useful checks:
```bash
pnpm lint
pnpm test
pnpm build
```

## Environment Variables
See [.env.example](./.env.example). Short aliases are the preferred setup for Railway:
- Required in most setups: `BOT_TOKEN`, `BOT_ID`, `DB_URL`, `KV_URL`, `AI_URL`
- Usually set too: `BOT_OWNERS`, `BOT_NAME`, `BRAVE_KEY`
- Optional top-level overrides: `BOT_LANG`, `HOST`, `PORT`, `ADMIN_KEY`, `AI_FAST`, `AI_SMART`, `AI_EMBED`, `AI_TIMEOUT`
- Advanced tuning is compressed into one optional `CFG` JSON instead of dozens of separate vars

Examples:
```env
BOT_TOKEN=...
BOT_ID=...
DB_URL=postgresql://...
KV_URL=redis://...
AI_URL=https://ollama.example.com
BRAVE_KEY=...
```

```env
CFG={"features":{"webSearch":true,"autoInterject":false},"profiles":{"minMessages":80},"search":{"maxRequests":2,"maxPages":3}}
```

Notes:
- The app still accepts legacy long names like `DISCORD_TOKEN` and `DATABASE_URL`.
- Discord commands are registered globally, so there is no per-server guild id to update when moving the bot.
- Put your Discord user ID in `BOT_OWNERS` to use owner-only commands like `/bot-lockdown on|off|status`.
- For verbose Ollama tunnel logging, set `OLLAMA_LOG_TRAFFIC=true`, `OLLAMA_LOG_PROMPTS=true`, and `OLLAMA_LOG_RESPONSES=true`. Short aliases also work: `AI_LOG_TRAFFIC`, `AI_LOG_PROMPTS`, `AI_LOG_RESPONSES`.
- Prisma-based scripts use the alias bridge automatically, so `DB_URL` is enough if you run the provided `pnpm prisma:*` and `pnpm seed` scripts.
- API-only deployments can skip `AI_URL`; bot and worker still require it.
- In Railway, prefer using the built-in managed database variable names directly for service references: `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `REDIS_URL=${{Redis.REDIS_URL}}`.

## Slash Commands
- Main command surface now lives under `/hori`. Detailed panel guides: [docs/hori-panel-guide.md](./docs/hori-panel-guide.md) and [docs/hori-panel-step-by-step-ru.md](./docs/hori-panel-step-by-step-ru.md)
- `/bot-help`
- `/bot-style`
- `/bot-memory remember|forget`
- `/bot-relationship`
- `/bot-feature`
- `/bot-debug`
- `/bot-profile`
- `/bot-channel`
- `/bot-summary`
- `/bot-stats`

## Context Actions
- `Хори: объяснить`
- `Хори: кратко`
- `Хори: оценить тон`

## Prompt Templates And Example Config
- Base persona, profile and search templates: [examples/prompt-templates.md](./examples/prompt-templates.md)
- Full Cluster 1 persona config: [examples/hori.persona.json](./examples/hori.persona.json)
- Minimal Cluster 1 persona override: [examples/hori.persona.minimal.json](./examples/hori.persona.minimal.json)
- Legacy `/bot-style`-compatible persona settings: [examples/persona.initial.json](./examples/persona.initial.json)
- Relationship overlay example: [examples/moderator.relationship.json](./examples/moderator.relationship.json)
- ContextBundleV2 example: [examples/cluster1-context-bundle-v2.json](./examples/cluster1-context-bundle-v2.json)
- Behavior trace example: [examples/cluster1-behavior-trace.json](./examples/cluster1-behavior-trace.json)
- Channel config tags example: [examples/cluster1-channel-config.json](./examples/cluster1-channel-config.json)
- Expanded runtime CFG example: [examples/cluster1-cfg-expanded.json](./examples/cluster1-cfg-expanded.json)

## Deployment With Railway
Recommended setup: three Railway services from the same repo and Dockerfile.

### Services
- `hori-api`: set `APP_ROLE=api`
- `hori-bot`: set `APP_ROLE=bot`
- `hori-worker`: set `APP_ROLE=worker`

Leave the Railway custom start command empty to use the Docker `CMD`, or set it explicitly to:
```bash
node scripts/start.mjs
```

Do not use `pnpm dev`, `tsx watch`, or workspace-local dev commands in Railway.

### Infra
- Attach a managed PostgreSQL instance.
- Attach a managed Redis instance.
- Keep Ollama outside Railway and provide `AI_URL` in short mode or `OLLAMA_BASE_URL` in legacy mode.
- Link database and Redis variables with Railway references, for example:
```env
DB_URL=${{Postgres.DATABASE_URL}}
KV_URL=${{Redis.REDIS_URL}}
```

### Steps
1. Push this repo to GitHub.
2. Create Railway project and connect the GitHub repo.
3. Create three services from the same source.
4. Set `APP_ROLE` per service.
5. Add all env vars from `.env.example`.
6. Run the initial migration from a one-off shell:
```bash
pnpm prisma:deploy
pnpm seed
```
7. Point your health checks to the API service only.

If a service logs `localhost:5432` or `127.0.0.1:6379` in Railway, it is still using example local values instead of Railway service references.

## API Endpoints
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `GET /admin/guilds/:guildId/config`
- `GET /debug/messages/:messageId/trace`

Admin/debug endpoints require `Authorization: Bearer <ADMIN_KEY>` or the legacy `API_ADMIN_TOKEN`.

## Known Limitations / TODO
- Effective DB-backed feature flags are stored but not yet merged into every runtime decision path.
- Auto-interjections are intentionally conservative and still heuristic-heavy in V1.
- Search retries/backoff are basic; provider abstraction is ready but only Brave is implemented.
- Semantic retrieval uses pgvector raw SQL and expects the extension to exist in PostgreSQL.
- Context actions reuse the main orchestrator path; dedicated tone-analysis prompts can be expanded later.
- There is no full web admin UI in V1; admin surface is slash-first plus internal read-only API.
