# Hori Discord Bot

Production-ready TypeScript monorepo for a Discord bot with persona layers, analytics, memory, web search, admin controls and a multi-provider AI router with deterministic fallback.

## Architecture
- `apps/bot`: Discord gateway, message ingestion, slash commands, context actions, reply routing.
- `apps/api`: internal Fastify API for health, readiness, metrics, admin read endpoints and debug traces.
- `apps/worker`: BullMQ workers for summaries, profiling, embeddings and cleanup jobs.
- `packages/core`: intent router, persona assembly, safety, orchestration, admin services.
- `packages/llm`: multi-provider AI router, Gemini/Cloudflare/GitHub/OpenAI clients, model router, tool-calling, prompt helpers.
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
- Fast vs smart response shaping through a model router, with provider selection handled by the AI router.
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
- OpenAI API key for the final paid fallback and embeddings
- Optional provider credentials for DeepSeek, Gemini, Cloudflare Workers AI and GitHub Models
- Brave Search API key

## AI Router
Default runtime mode is `AI_PROVIDER=router`.

Deterministic fallback order:
1. `DeepSeek V4 Flash` in non-thinking mode as the default primary chat tier when `DEEPSEEK_API_KEY` is configured
2. `Gemini Pro` only for complex prompts when enabled and quota/health allow it
3. `Gemini Flash` as the default free fallback tier
4. `Cloudflare Workers AI` as the next fallback
5. `GitHub Models` as reserve
6. `OpenAI gpt-5-nano` as the final paid fallback

Health and quota status:
- Use `/hori ai-status` for enabled providers, active order, cooldowns, DeepSeek availability, Gemini daily counters, recent routes and fallback counts.
- In router mode, bot and worker now use the same AI router policy. There is no worker-only direct OpenAI bypass anymore.
- Router-mode embeddings still use OpenAI embeddings. If `OAI_KEY` / `OPENAI_API_KEY` is missing, startup warns and `/hori ai-status` shows embeddings as unavailable.
- `/hori state tab:brain` now shows router mode and points to `/hori ai-status` for detailed diagnostics.

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
- Required in most setups: `BOT_TOKEN`, `BOT_ID`, `DB_URL`, `KV_URL`
- Default production path: `AI_PROVIDER=router` plus `DEEPSEEK_API_KEY`, `GOOGLE_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `GITHUB_TOKEN`, `OAI_KEY`
- Direct fallback-only mode: `AI_PROVIDER=openai` plus `OAI_KEY`, with optional `OAI_CHAT`, `OAI_SMART`, `OAI_EMBED`
- Usually set too: `BOT_OWNERS`, `BOT_NAME`, `BRAVE_KEY`
- Optional top-level overrides: `BOT_LANG`, `HOST`, `PORT`, `ADMIN_KEY`
- Advanced tuning is compressed into one optional `CFG` JSON instead of dozens of separate vars

Examples:
```env
BOT_TOKEN=...
BOT_ID=...
DB_URL=postgresql://...
KV_URL=redis://...
AI_PROVIDER=router
DEEPSEEK_API_KEY=...
GOOGLE_API_KEY=...
CF_ACCOUNT_ID=...
CF_API_TOKEN=...
GITHUB_TOKEN=...
OAI_KEY=...
BRAVE_KEY=...
```

```env
BOT_TOKEN=...
BOT_ID=...
DB_URL=postgresql://...
KV_URL=redis://...
AI_PROVIDER=openai
OAI_KEY=...
OAI_CHAT=gpt-5.4-nano
OAI_SMART=gpt-5.4-nano
OAI_EMBED=text-embedding-3-small
BRAVE_KEY=...
```

```env
CFG={"features":{"webSearch":true,"autoInterject":false},"profiles":{"minMessages":80},"search":{"maxRequests":2,"maxPages":3}}
```

Notes:
- The app still accepts legacy long names like `DISCORD_TOKEN` and `DATABASE_URL`.
- OpenAI short aliases also work: `AI_PROVIDER`, `OAI_KEY`, `OAI_MODEL`, `OAI_CHAT`, `OAI_SMART`, `OAI_EMBED`.
- Discord commands are registered globally, so there is no per-server guild id to update when moving the bot.
- Put your Discord user ID in `BOT_OWNERS` to use owner-only commands like `/bot-lockdown on|off|status`.
- For verbose AI router transition logs, set `AI_ROUTER_LOG_VERBOSE=true`.
- Prisma-based scripts use the alias bridge automatically, so `DB_URL` is enough if you run the provided `pnpm prisma:*` and `pnpm seed` scripts.
- API-only deployments can skip LLM vars entirely; bot and worker need either `AI_PROVIDER=router` with provider keys or `AI_PROVIDER=openai` with `OAI_KEY`/`OPENAI_API_KEY`.
- In `AI_PROVIDER=router`, `DEEPSEEK_API_KEY` enables the default primary chat tier, while `OAI_KEY` is still recommended because it powers the final paid fallback and OpenAI embeddings used by retrieval/profile/topic jobs.
- In Railway, prefer using the built-in managed database variable names directly for service references: `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `REDIS_URL=${{Redis.REDIS_URL}}`.

## Slash Commands
- Main command surface now lives under `/hori`. Detailed panel guides: [docs/hori-panel-guide.md](./docs/hori-panel-guide.md) and [docs/hori-panel-step-by-step-ru.md](./docs/hori-panel-step-by-step-ru.md)
- Owner LLM runtime controls now live in `/hori panel` -> `LLM`: model preset/slot, live HyDE toggle and OpenAI embedding dimensions.
- Owner AI router health is available in `/hori ai-status`.
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
- Default AI path: set `AI_PROVIDER=router` and provide `DEEPSEEK_API_KEY`, `GOOGLE_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `GITHUB_TOKEN`, `OAI_KEY`.
- Direct paid-only fallback mode: set `AI_PROVIDER=openai` and provide `OAI_KEY`, optionally `OAI_CHAT`, `OAI_SMART`, `OAI_EMBED`.
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

## Known Limitations / Design Choices
- Auto-interjections are intentionally conservative and heuristic-heavy in V1 (by design).
- Search provider abstraction is ready but only Brave is wired; retry logic (`fetchWithRetry`, 3 attempts) is already in place.
- Semantic retrieval uses pgvector raw SQL and expects the extension to exist in PostgreSQL (architectural choice).
- There is no full web admin UI in V1; admin surface is slash-first plus internal read-only API (by design).

## AI Router Verification
Use these checks after deploy or after changing provider secrets:

Подробный русский чеклист: [docs/ai-router-runtime-checklist-ru.md](./docs/ai-router-runtime-checklist-ru.md)

1. Run `/hori ai-status` and confirm enabled providers, active order and empty/expected cooldowns.
2. Confirm the `Embeddings:` line in `/hori ai-status` is `openai:on` if `OAI_KEY` is configured, or explicitly `openai:off(missing:OPENAI_API_KEY)` if you intentionally run without embeddings.
3. Ask the bot a short simple question and confirm the latest route in `/hori ai-status` lands on Gemini Flash when available.
4. Ask a long analytical or code-heavy question and confirm the route moves to Gemini Pro when quota is available.
5. Temporarily disable a provider secret or wait for a cooldown, then repeat the same prompt and confirm fallback moves to Cloudflare, then GitHub, then OpenAI.
6. Inspect BotEventLog or debug trace and verify `modelUsed` plus `llmCalls` show the real provider/model path.

Example router log lines:
```text
info  requestId=req-1 userKey=u:123456 provider=gemini model=gemini-2.5-flash success=true fallbackDepth=0 latencyMs=842
warn  requestId=req-2 userKey=u:123456 provider=gemini model=gemini-2.5-pro success=false errorClass=quota_exhausted fallbackDepth=0
info  requestId=req-2 userKey=u:123456 provider=cloudflare model=@cf/zai-org/glm-4.7-flash success=true fallbackDepth=1 latencyMs=615
```

## OpenAI Re-Embed Backfill
Use the dedicated script when you lower OpenAI embedding dimensions for retrieval, for example `768 -> 512`.

Dry-run first:
```bash
pnpm reembed:openai --target-dimensions 512
```

Apply batched rewrite:
```bash
pnpm reembed:openai --target-dimensions 512 --apply
```

Useful flags:
- `--source-dimensions 768`
- `--batch-size 25`
- `--limit 200`
- `--guild-id <guildId>`
- `--entity-types message,server_memory,channel_memory,user_memory,event_memory`

Recommended rollout:
1. Keep live runtime dimensions unchanged while you estimate the rewrite with a dry-run.
2. Run the apply pass in a low-traffic window.
3. After the rewrite completes, switch runtime dimensions in `/hori panel -> LLM`.

Note: this script rewrites existing vectors in place. During the migration window, mixed vector sizes can temporarily reduce semantic recall coverage for rows that have already been rewritten. Lexical fallback remains available.