# Hori — Implementation Plan (2026-05, на основе 1.txt + правок)

> **Статус:** ACTIVE. Это рабочий документ для всех моделей/контрибьюторов.
> Любое будущее изменение поведения сначала сверяется с этим файлом.
> Источник правды по приоритетам — `1.txt` от пользователя + явные коррективы в чате (см. секцию «Корректировки»).

---

## 0. Корректировки от пользователя (важнее, чем 1.txt)

| Пункт 1.txt | Решение | Комментарий |
|---|---|---|
| П.1 маркер `агрессивно` | **ВКЛЮЧИТЬ** | код есть, заблокирован hard-disable. |
| П.2 escalation 1–4 + правки декея | **ПРОВЕРИТЬ** | по коду уже совпадает с 1.txt (timeout→3, 24ч→2, recovery=полный сброс). |
| П.3 aggression checker | **СКИП** | оставить текущий промт. |
| П.4 Discord timeout 15м | **ДЕЛАТЬ** | проверить интеграцию. |
| П.5 «запомни/вспомни/забудь» → Prompt Slots | **ДЕЛАТЬ ПОЛНОСТЬЮ** | одна система для всех с лимитом, потом масштабируется по уровням. |
| П.6–8 старая память/restored context | **СКИП** | заменено П.5. |
| П.10 (=19) session evaluator | **НЕ ТРОГАТЬ** | оставить как есть. |
| П.11 mood override = модерская подмена кор-промта | **ДЕЛАТЬ ПОЛНОСТЬЮ** | редактирование коров + override через панель, всё сразу. |
| П.12 префиксные знаки | **`?` = google + рассказ; `*` = база (отложено).** | остальные знаки тоже отложены. |
| П.13–14 kind/contour | **СКИП НАВСЕГДА.** | |
| П.15 flash trolling | **ДЕЛАТЬ.** + **картинка должна сохраняться в контекст** (см. ниже). |
| П.16 queue pools | **30 продолжений → 3 категории (нейтральные/дружеские/холодные).** Универсально, просто, по relationship. |
| П.16a доступ Хори к каналам через панель | **ДЕЛАТЬ.** |
| П.20 маленькие блоки после кора | **ОТМЕНЯЕМ.** Шиза. |
| П.23 chat = DeepSeek V4 Flash без раздумий | **ВЫСТАВИТЬ ПО УМОЛЧАНИЮ.** |
| П.27 media reactions | **ДЕЛАТЬ.** |
| П.28 knowledge import | **ДЕЛАТЬ** (но в самом конце, после базы). |

---

## 1. Текущее состояние кода (что уже есть)

### Работает в проде
- ✅ V7 ACTIVE_CORE: 7 коров (cold_lowest..sweet + serious) в `packages/core/src/persona/cores.ts`.
- ✅ `composeBehaviorPrompt` возвращает один блок (V7 single-block composer).
- ✅ Маркер `агрессивно` в `COMMON_CORE_HEADER`. Парсер маркера `extractAggressionMarker` + полный pipeline `applyAggressionPipeline` (Stage 1→4 + replacementText + timeout) в `chat-orchestrator.ts:603-748`.
- ✅ `relationshipsHardDisabled()` уже снят: hot path отношений и агрессии не заглушён.
- ✅ `relationship-service.ts`:
  - `noteAggressionMarker` инкрементит stage,
  - `confirmAggression({timedOut})` → после Stage 4 ставит `escalationStage = 3` сразу (строка 338),
  - `resolveEscalationStage` через 24ч: Stage 1 → 0, Stage 2+ → 2 (строки 578-607),
  - `applySessionVerdict` при `score < 0 → ≥ 0` делает полный recovery + `escalationStage = 0` (строка 538).
- ✅ Discord timeout: `apps/bot/src/router/message-router.ts:152` `tryApplyModerationAction` вызывает `targetMember.timeout(15*60*1000)` при наличии `ModerateMembers`.
- ✅ Panel V7 (9 вкладок) жива: home/cores/people/aggression/slots/channels/queue/runtime/audit.
- ✅ `PromptSlotService` со всей backend-логикой (10м active / 6ч cd / channel>global / preemption).
- ✅ Plain-message slot UX уже сидит в bot-layer: `запомни/вспомни/забудь` идут через slot flow, а не через core memory intent.
- ✅ `_prompt_card` / `PROMPT_CARD_MODAL` убраны из bot-layer runtime path; prompt slots остались единственной user-facing surface.
- ✅ `RuntimeConfigService` уже держит core prompt templates, per-user core override, channel access и queue-pool override.
- ✅ Panel actions `cores_override` и `cores_overrides_list` теперь видимы; owner slot maintenance умеет force activate / deactivate / edit / set strength.
- ✅ Slots inventory в panel уже показывает guild-wide inventory, а не только личные слоты.
- ✅ `IntentRouter` с sigil registry: `?` enabledByDefault → search; `*`, `!` reserved.
- ✅ Prisma модель `HoriPromptSlot` со всеми полями.
- ✅ `QueuePhrasePoolService` + `DEFAULT_QUEUE_PHRASE_POOLS` (initial: 50/20/10, followup: warm/neutral/cold = 30/30/30).
- ✅ `FlashTrollingService` (выбор retort/question/meme по весам 40/10/40, ≥10 каждой категории).
- ✅ `apps/bot/src/runtime/flash-trolling-scheduler.ts` существует и пишет pseudo-message `[мем: ...]` в контекст после meme action.
- ✅ `MemeIndexer` + `assets/memes/catalog.json` (10+ мемов).
- ✅ Minimum media reactions уже есть в reply path: при включённом флаге и тёплом score bot reply может получить meme attachment.
- ✅ Session evaluator + conversation analysis воркеры.
- ✅ Channel access matrix и `off` gate уже существуют в runtime/router path.
- ✅ DeepSeek V4 Flash в AI router cascade (если `LLM_PROVIDER=router` + `DEEPSEEK_API_KEY`).

### Осталось довести
- ✅ Открытых product/runtime gaps из текущего плана в этом срезе больше нет.
- ✅ Followup queue pools наружу переведены на `friendly/neutral/cold`, при этом внутренний bucket `warm` сохранён как compatibility alias для старых override payload и service internals.
- ✅ Media reactions вынесены в отдельный runtime config surface с owner editor-ом в панели и coverage на config-driven attachment/cooldown path; старый `MEDIA_AUTO_*` env/runtime слой удалён.
- ✅ Panel polish по owner editor surfaces закрыт для flash config, queue pools, aggression policy, aggression phrases и reset-экшенов people/aggression.
- ✅ Flash runtime config action в V7 panel выведен как отдельный persistent editor через runtime settings.

---

## 2. Архитектурные решения

### 2.1 Prompt Slots — финальная архитектура (П.5)

**База остаётся на `PromptSlotService` + `HoriPromptSlot`. Добавляем UX поверх:**

```
[USER] хори запомни
       ↓
[BOT]  кнопка ➕ "Создать слот"  (если не превышен лимит)
       список твоих слотов с кнопками "🗑️ удалить"
       ↓ (юзер жмёт ➕)
[MODAL] title (60), content (1900), trigger? (40, optional), scope: channel|global
       ↓
[DB] HoriPromptSlot.create({ ownerLevel = level snapshot, active=false })
[BOT] "сохранила: <title>. Активируй через 'хори вспомни'."

[USER] хори вспомни
       ↓
[BOT]  список слотов (max 5/limit) с кнопками выбора + кулдауны
       "▶️ <title>"  /  "⏳ кулдаун до HH:MM"
       ↓ (юзер жмёт ▶️)
[promptSlots.activate({ initiatorLevel, channelId })]
[BOT] "🎟️ активна на 10 мин: <title>"

[USER] хори забудь   → панель удаления (как при 'вспомни', но кнопки "🗑️")
[USER] хори забудь всё → confirm → удалить все слоты юзера
```

**Лимиты (одна система для всех, на будущее заточено под уровни):**
- Файл: `packages/memory/src/slots/prompt-slot-service.ts`.
- Константа `SLOT_LIMITS_BY_LEVEL: Record<-1..4, number>`. Текущие значения: `{ -1: 0, 0: 2, 1: 3, 2: 4, 3: 5, 4: 6 }`. Все одинаково обрабатываются (level пока не меняется per-user через систему уровней — берётся `relationshipScore` округлённый вниз).
- Метод `getLimit(level: number): number` → берёт из мапы.
- Метод `canCreate(guildId, userId, level)` → `count < getLimit(level)`.

**Override от админа:**
- Метод `forceActivate({ slotId, by: ownerUserId })` — игнорирует cooldown и preemption.
- Метод `setStrength({ slotId, strength: 0..2 })` — новое поле в БД (см. миграцию).
- Метод `updateContent({ slotId, content, title })` — для редактирования из панели.

**Интеграция в промт (уже работает через chat-orchestrator):**
- `getActiveSlot(guildId, channelId)` → если есть, текст слота встраивается **после кор-промта** в `composeBehaviorPrompt`.
- При `strength = 2` добавляется префикс «🎯 Главный фокус: …»; при `strength = 0` — «слабая подсказка: …». Дефолт `1` (без префикса).

**Миграция Prisma:**
```prisma
model HoriPromptSlot {
  ...existing fields...
  strength       Int       @default(1)  // 0=слабый, 1=обычный, 2=жёсткий
  lastDeactivatedAt DateTime?           // для аудита
}
```

### 2.2 Cores Editor + Mood Override (П.11)

**Хранение текстов коров.**
- Сейчас тексты захардкожены в `packages/core/src/persona/cores.ts`.
- Добавляем таблицу `CorePromptOverride { id, guildId, coreId, content, updatedAt, updatedBy }`.
- `coreText(id, override)` уже принимает override → вызвать через runtime-config из БД при каждом `composeBehaviorPrompt`.
- Кэш в `RuntimeConfigService.getRoutingConfig` (TTL 60с).

**Mood override (ручная подмена кора).**
- Новая таблица `HoriCoreOverride { guildId, userId, coreId, expiresAt, reason, by }`.
- В `relationship-mapping.ts` функция `pickCore(value, options)` уже принимает `moderatorContext`. Добавить опцию `manualOverride?: CoreId`.
- Из chat-orchestrator: перед `pickCore` спросить `runtimeConfig.getCoreOverride(guildId, userId)` → если активный, использовать как `manualOverride`.

**UI (Panel → Coresб):**
- `cores_open_panel` → текущий placeholder «используй /hori prompt-core …». **Заменить на**: select-меню «выбери core» → modal с textarea (4000 символов) → save.
- `cores_evaluator` / `cores_aggression_checker` → так же modal-редактор.
- Новая кнопка `cores_override` → выбор юзера + select core + duration (1ч/6ч/24ч/forever) → upsert `HoriCoreOverride`.

### 2.3 Queue Phrase Pools (П.16)

**Текущее:** initial × {warm,neutral,cold} = 50/20/10. followup × {warm,neutral,cold} = 30/15/8.

**Новое:** оставляем initial 50/20/10 как есть (тесты их зафиксировали). Followup наружу живёт как `friendly/neutral/cold`, но внутри `QueuePhrasePoolService` compatibility bucket остаётся `warm`.
- outward `followup.friendly` / stored alias `followup.warm`: 30 универсальных дружеских фраз
- `followup.neutral: 30` универсальные нейтральные «секунду», «погоди»
- `followup.cold: 30` холодные «я слышу», «не торопи»

В `QueuePhrasePoolService` для followup выбирается категория по relationship-score:
- `score >= 1` → outward friendly / internal warm
- `score in (-1, 1)` → neutral
- `score <= -1` → cold

Универсальность = фразы **не привязаны к именам/контексту**, работают как «я знаю что ты ждёшь».

**Тесты `queue-phrase-pool-sizes.test.ts` обновляются** под новые имена/размеры.

### 2.4 Flash Trolling Scheduler (П.15)

**Файл:** `apps/bot/src/runtime/flash-trolling-scheduler.ts` (новый).

```ts
class FlashTrollingScheduler {
  start(runtime: BotRuntime) {
    const tick = () => {
      const cfg = runtime.flashTrolling.getConfig();
      if (!cfg.enabled) return scheduleNext();
      const target = pickRandomEligibleMessage(runtime); // recent +- большое
      if (!target) return scheduleNext();
      const action = runtime.flashTrolling.pickAction();
      dispatchAction(runtime, target, action); // см. ниже
      scheduleNext();
    };
    const scheduleNext = () => {
      const minMin = cfg.intervalMinutes ?? 60;
      const jitter = randInt(0.5*minMin, 1.5*minMin);
      setTimeout(tick, jitter * 60_000);
    };
    scheduleNext();
  }
}
```

**Источник «недавнее +- большое»:** последние N сообщений из `Message` table (≤2ч, length ≥ minMessageLength=80, не от бота, в канале с разрешённой `flash` policy).

**Обработка `meme`:** случайный мем из `MemeIndexer.pickRandom()`.
- **ВАЖНО (правка пользователя):** при ответе мемом нужно сохранить контекст для следующего ответа Хори. Решение:
  - В `MemeIndexer` каждый мем имеет `description: string` (поле уже есть в catalog.json — проверить).
  - После отправки записываем в DB новую запись `Message` от имени бота с `metadata.kind = "meme"` и `content = "[мем: <description>]"`.
  - При сборке контекста этот pseudo-message попадёт в `recentMessages` — Хори увидит «я недавно скинула мем про X».

**Обработка `retort`/`question`:** обычный `channel.send(text)` + запись в `Message` как ответ бота (для контекста).

**Конфиг:** `flashTrolling.getConfig()` редактируется через panel:
- `runtime_flash_config` в `runtime` tab → modal с enabled, весами, intervalMinutes, minMessageLength и channelAllowlist.

### 2.5 Channels Access (П.16a)

Уже есть `buildChannelMatrix` и `buildChannelPolicyStatus`. Добавить:

- В `runtime-config-service` метод `setChannelAccess(guildId, channelId, mode: "full"|"silent"|"off")`.
- `channels_matrix` action: показывает все каналы сервера, для каждого 3 кнопки (🟢/🟡/🔴). При нажатии — апдейт `ChannelConfig`.
- В `message-router.ts` уже проверяется `isMuted/allowBotReplies/allowInterjections`. **Добавить gate в начало `routeMessage`**: если канал `off`, выходим до любой обработки.

### 2.6 Default LLM Provider (П.23)

**Файл:** `packages/config/src/env.ts:115`.
- `LLM_PROVIDER: z.enum(["ollama", "openai", "router"]).default("router")` — поменять `"ollama"` → `"router"`.
- В `.env.example` явно написать `LLM_PROVIDER=router`.

Чат-слот в `router` mode уже идёт через каскад с DeepSeek V4 Flash первым. Никаких других изменений роутинга не нужно.

### 2.7 Media Reactions (П.27)

Feature flag и minimum reply-path уже живут в runtime.
- `apps/bot/src/router/message-router.ts` читает отдельный `media.reactions` runtime setting вместо жёстко пришитых 5%/score>=2.
- `RuntimeConfigService` хранит `chance`, `minRelationshipScore`, `cooldownSec` и даёт status/reset/set owner path.
- В V7 panel выведен owner editor `queue_media_reactions`.
- Coverage есть на service sanitize/clamp, panel exposure и config-driven attachment/cooldown path.

### 2.8 Knowledge Import (П.28)

В самом конце. Скрипты `scripts/guild-import.ts`, `scripts/import-knowledge.ts` уже есть.
- Проверено: `scripts/guild-import.ts` и `scripts/import-knowledge.ts` без текущих type/error проблем.
- `/hori import` теперь поддерживает `mode=history|knowledge`; knowledge-mode грузит markdown/txt attachment прямо через Discord.
- Для операторского UX также есть `/hori knowledge import` как короткий путь рядом с CRUD/list/stats.
- Сохраняется в `KnowledgeChunk` с эмбеддингами через существующий `KnowledgeService` + `EmbeddingAdapter`.
- Доступ через `*` sigil — отложено.

---

## 3. План реализации (волны)

### Volna 1 — Разблокировка (3 файла)
**Цель:** включить отношения и агрессию.

1. `packages/core/src/orchestrators/chat-orchestrator.ts:78` — `relationshipsHardDisabled` возвращает `false`.
2. Прогнать `pnpm test` → починить упавшие (если есть).
3. `packages/config/src/env.ts:115` — `default("router")`.

### Volna 2 — Queue Pools restructure
**Текущий статус:** закрыто. Followup pools сохраняют внутренний bucket `warm` только как совместимый alias, но наружу живут как `friendly/neutral/cold`.

1. Alias `warm = friendly` сохранён на runtime-config boundary и в editor parsing.
2. Тесты на override parsing и neutral-band routing сохранены.

### Volna 3 — Prompt Slots full UX (П.5)
**Текущий статус:** закрыто в текущем runtime: user-facing slot UX активен, legacy prompt-card bridge убран, owner CRUD в panel включает force activate / deactivate / edit / strength, inventory показывает guild-wide state.

1. **Prisma миграция:** добавить `strength Int @default(1)`, `lastDeactivatedAt DateTime?` в `HoriPromptSlot`.
2. `prompt-slot-service.ts`: добавить `SLOT_LIMITS_BY_LEVEL`, `getLimit`, `canCreate`, `forceActivate`, `setStrength`, `updateContent`, `listForOwner` (если нет), `deleteSlot`, `deleteAllForUser`.
3. `apps/bot/src/router/message-router.ts:368` `tryHandlePromptCardCommand`:
   - При «запомни» → ответить эфемерным сообщением со списком слотов + ➕ кнопка / +инфо «лимит N/M».
   - При «вспомни» → список слотов с кнопками выбора.
   - При «забудь» → список с 🗑️; «забудь всё» → confirm.
4. `apps/bot/src/router/interaction-router.ts`:
   - `SLOT:create` → modal (title/content/trigger/scope).
   - `SLOT:activate:<id>` → activate + ack.
   - `SLOT:delete:<id>` → soft delete (или hard).
   - `SLOT:deleteAll:<userId>` → confirm.
5. `chat-orchestrator.ts`: при наличии `getActiveSlot()` встроить `slot.content` после кор-промта (с префиксом по `strength`).
6. Done: `_prompt_card` / `PROMPT_CARD_MODAL` bridge убран из runtime path.
7. Done: Panel `slots_*` actions покрывают edit content, guild inventory, force-activate, deactivate и set strength.

### Volna 4 — Flash Trolling Scheduler (П.15)
**Текущий статус:** закрыто. Scheduler, meme-context и runtime flash config editor уже живут в реальном V7 panel path.

1. Service-level coverage есть; bootstrap hydration в этом workspace подтверждена diagnostics-only и требует полного smoke/test в локальном clone.
2. Panel action `runtime_flash_config` выведен как persistent runtime editor и гидратится в bootstrap.

### Volna 5 — Cores Editor + Mood Override (П.11)
**Текущий статус:** закрыто. Backend core override, prompt editors и operator clear path уже есть; отдельный cancel control поверх list view не требуется как обязательный шаг плана.

1. **Prisma миграции:**
   - `CorePromptOverride { id, guildId, coreId, content, updatedAt, updatedBy }`
   - `HoriCoreOverride { id, guildId, userId, coreId, expiresAt, reason, by }`
2. `runtime-config-service`:
   - `getCoreText(guildId, coreId): Promise<string | null>` — кэш 60с.
   - `setCoreText(guildId, coreId, content, by)`.
   - `getCoreOverride(guildId, userId): Promise<{coreId, expiresAt} | null>`.
   - `setCoreOverride(guildId, userId, coreId, durationMs, reason, by)`.
   - `clearCoreOverride(guildId, userId, by)`.
3. `chat-orchestrator.ts`: перед `pickCore` спросить override → передать в `pickCore`.
4. `cores.ts`: `coreText(id, override)` уже принимает текст → ничего менять не надо.
5. Panel:
  - `cores_open_panel` → select(coreId) → modal(content) → save.
  - `cores_evaluator` → modal с `relationshipEvaluatorPrompt`.
  - `cores_aggression_checker` → modal с `aggressionCheckerPrompt`.
  - `cores_override` и `cores_overrides_list` уже выведены в IA.
  - Текущий clear path остаётся через existing override modal / runtime methods.

### Volna 6 — Channels & Panel polish (П.16a + П.11 cont.)
**Текущий статус:** закрыто. Channels matrix, `off` gate и оставшиеся живые panel placeholders уже дочищены.
1. Coverage для `channels_matrix` и panel IA сохранена тестами.
2. Reset actions people/aggression переведены с текстовых подсказок на live owner modals.

### Volna 7 — Media Reactions (П.27)
**Текущий статус:** закрыто. Minimum media path сохранён, richer tuning/editor UX уже выведен через отдельный runtime config surface.
1. Coverage на minimum path attachment после обычного bot reply сохранена.
2. Runtime editor для вероятности/порога/cooldown уже выведен как `queue_media_reactions`; других media auto override surfaces в активном runtime больше нет.

### Volna 8 — Knowledge Import (П.28)
1. Проверить и зафиксить `scripts/import-knowledge.ts` и `scripts/guild-import.ts`.
2. `/hori import` slash command + KnowledgeChunk.
3. `*` sigil — оставить reserved (как в 1.txt отложено).

---

## 4. Что НЕ делаем (явный скип)

- ❌ Aggression checker prompt rewrite (П.3).
- ❌ Session evaluator changes (П.10).
- ❌ Маленькие блоки после кора (П.20 — отменено).
- ❌ Message kind / Contour A/B/C (П.13–14).
- ❌ Эмоции, mood override через slash, Affinity overlay, micro-reactions, и прочие старые блоки V5/V6 — заморожено.

---

## 5. Договорённости для всех моделей-исполнителей

1. **Не возвращать удалённые блоки.** V7 — единственный promo path: `[CORE] + [SLOT?] + [recent messages as turns]`.
2. **Не трогать session evaluator.** Это отдельный субсистем, его правит только пользователь.
3. **Не добавлять числовые персонал-параметры** (brevity=0.95 и т.п.) — только текст.
4. **Тесты:** перед коммитом `pnpm test`. Если ломаются неактуальные V5/V6 тесты — удалить их вместе с кодом, не патчить.
5. **Миграции Prisma:** один файл на волну. Имя `YYYYMMDDHHMMSS_<volna_name>`.
6. **Любая user-facing строка по-русски.** UI кнопок, лейблы панели, ошибки.

---

## 6. Актуальный статус волн

- DONE: Volna 1 — relationships hot path разблокирован; default provider-route уже не считается открытой дырой.
- DONE: Volna 2 — followup pools выровнены, outward vocabulary переведён на `friendly`, legacy `warm` оставлен только как alias.
- DONE: Volna 3 — slot UX, guild inventory и owner maintenance закрыты; legacy prompt-card bridge убран.
- DONE: Volna 4 — scheduler, meme-context и flash config action выведены в реальный panel/runtime path.
- DONE: Volna 5 — core override/list/edit surfaces закрыты без отдельного blocker-а по cancel UX.
- DONE: Volna 6 — channels matrix, off-gate и panel placeholder cleanup закрыты.
- DONE: Volna 7 — media reactions имеют config owner path, panel editor и focused coverage.
- DONE: Volna 8 — knowledge import path уже существует и не выглядит blocker-ом текущей волны.

После каждой волны: `pnpm test` + ручной smoke в dev-сервере + audit-log запись.
