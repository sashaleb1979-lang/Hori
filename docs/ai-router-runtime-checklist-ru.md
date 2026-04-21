# AI Router Runtime Checklist

Короткий чеклист для живой проверки multi-provider router после деплоя или смены ключей.

## Перед стартом

Проверь env:
- `AI_PROVIDER=router`
- `GOOGLE_API_KEY`
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `GITHUB_TOKEN`
- `OPENAI_API_KEY`
- `BOT_OWNERS` содержит твой Discord user id

Проверь, что в логах нет строк вида:
- `AI router provider gemini disabled`
- `AI router provider cloudflare disabled`
- `AI router provider github disabled`
- `AI router has no configured providers`

## Быстрая проверка статуса

В Discord выполни:
- `/hori ai-status`

Ожидаемо увидеть:
- список enabled providers
- active order
- cooldowns
- Gemini Flash и Gemini Pro counters
- recent routes
- fallback counts

Если какой-то провайдер выключен:
- смотри блок `Providers`
- там будет либо `off(flag)`, либо `off(missing:...)`

## Smoke Test По Провайдерам

### 1. Gemini Flash

Отправь короткий простой запрос, например:

```text
Хори, ответь одним коротким предложением: что сейчас важнее всего проверить в боте?
```

Потом открой `/hori ai-status`.

Ожидаемо:
- последний route уходит в `gemini/gemini-2.5-flash`
- `fallbackDepth=0`

### 2. Gemini Pro

Отправь длинный аналитический запрос, например:

```text
Хори, сравни три варианта fallback-архитектуры для Discord-бота, распиши trade-offs, риски, квоты и какой вариант лучше оставить в проде.
```

Ожидаемо:
- route идёт в `gemini/gemini-2.5-pro`
- если Pro недоступен, then `gemini/gemini-2.5-flash`

### 3. Cloudflare Fallback

Чтобы проверить Cloudflare, временно отключи Gemini:
- либо unset `GOOGLE_API_KEY`
- либо поставь `AI_ROUTER_ENABLE_GEMINI=false`

Перезапусти сервис и повтори простой prompt.

Ожидаемо:
- route идёт в `cloudflare/@cf/zai-org/glm-4.7-flash`

### 4. GitHub Models Fallback

Чтобы проверить GitHub, временно убери Gemini и Cloudflare:
- `AI_ROUTER_ENABLE_GEMINI=false`
- `AI_ROUTER_ENABLE_CLOUDFLARE=false`

Повтори prompt.

Ожидаемо:
- route идёт в один из:
  - `github/openai/gpt-5-mini`
  - `github/openai/gpt-5-chat`
  - `github/openai/gpt-5-nano`

### 5. OpenAI Final Fallback

Чтобы проверить последний paid fallback, временно отключи:
- Gemini
- Cloudflare
- GitHub

Оставь только:
- `AI_ROUTER_ENABLE_OPENAI=true`
- `OPENAI_API_KEY`

Повтори prompt.

Ожидаемо:
- route идёт в `openai/gpt-5-nano`

## Проверка Логов

Ищи лог-строки такого типа:

```text
info  requestId=req-1 userKey=u:123456 provider=gemini model=gemini-2.5-flash success=true fallbackDepth=0 latencyMs=842
warn  requestId=req-2 userKey=u:123456 provider=gemini model=gemini-2.5-pro success=false errorClass=quota_exhausted fallbackDepth=0
info  requestId=req-2 userKey=u:123456 provider=cloudflare model=@cf/zai-org/glm-4.7-flash success=true fallbackDepth=1 latencyMs=615
```

Проверь:
- нет секретов в логах
- есть `requestId`
- есть `provider`
- есть `model`
- есть `fallbackDepth`
- есть `errorClass` для failed hops

## Если Что-то Пошло Не Так

Если `/hori ai-status` пустой или показывает только OpenAI:
- проверь ключи Gemini, Cloudflare и GitHub
- проверь, что флаги `AI_ROUTER_ENABLE_*` не выключены

Если route не идёт в Gemini Pro на сложных сообщениях:
- используй более длинный prompt
- проверь `AI_ROUTER_USE_GEMINI_PRO_FOR_COMPLEX=true`
- проверь, что Pro не в cooldown и не упёрся в daily limit

Если recent routes показывают только fallback hops:
- смотри `Cooldowns`
- смотри `Fallback counts`
- проверь rate limit/quota сообщения в логах

## Безопасность

Не вставляй реальные ключи:
- в debug trace
- в README
- в issue/PR
- в Discord сообщения
- в логи