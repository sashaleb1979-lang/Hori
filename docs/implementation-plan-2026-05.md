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
- ✅ `relationship-service.ts`:
  - `noteAggressionMarker` инкрементит stage,
  - `confirmAggression({timedOut})` → после Stage 4 ставит `escalationStage = 3` сразу (строка 338),
  - `resolveEscalationStage` через 24ч: Stage 1 → 0, Stage 2+ → 2 (строки 578-607),
  - `applySessionVerdict` при `score < 0 → ≥ 0` делает полный recovery + `escalationStage = 0` (строка 538).
- ✅ Discord timeout: `apps/bot/src/router/message-router.ts:152` `tryApplyModerationAction` вызывает `targetMember.timeout(15*60*1000)` при наличии `ModerateMembers`.
- ✅ Panel V7 (9 вкладок) с большинством read-only/status хендлеров: home/cores/people/aggression/slots/channels/queue/runtime/audit. Owner-actions делегируются в `/hori …` команды.
- ✅ `IntentRouter` с sigil registry: `?` enabledByDefault → search; `*`, `!` reserved.
- ✅ `PromptSlotService` со всей backend-логикой (10м active / 6ч cd / channel>global / preemption).
- ✅ Prisma модель `HoriPromptSlot` со всеми полями.
- ✅ `QueuePhrasePoolService` + `DEFAULT_QUEUE_PHRASE_POOLS` (initial: 50/20/10, followup: 30/15/8).
- ✅ `FlashTrollingService` (выбор retort/question/meme по весам 40/10/40, ≥10 каждой категории).
- ✅ `MemeIndexer` + `assets/memes/catalog.json` (10+ мемов).
- ✅ Session evaluator + conversation analysis воркеры.
- ✅ DeepSeek V4 Flash в AI router cascade (если `LLM_PROVIDER=router` + `DEEPSEEK_API_KEY`).

### Сломано / отсутствует
- 🔴 **`relationshipsHardDisabled() => true`** в `chat-orchestrator.ts:78` — глушит весь pipeline отношений и агрессии.
- 🔴 «хори запомни/вспомни» в `message-router.ts:368` использует старый `_prompt_card` (одна карточка через UserMemoryNote), **не PromptSlotService**.
- 🔴 «хори забудь» — IntentRouter распознаёт, обработчика нет.
- 🔴 FlashTrollingService **никем не вызывается** (нет шедулера).
- 🔴 Default `LLM_PROVIDER = "ollama"` в `packages/config/src/env.ts:115` — должен быть `"router"`.
- 🔴 Несколько panel-actions выводят placeholder «используй /hori …» вместо реального UI (cores edit, channels matrix bulk, aggression policy edit, queue pools edit, slot force activate).
- ⚠️ Followup queue pools (30/15/8) — не разделены на «нейтральные/дружеские/холодные» как требует 1.txt.

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

**Новое:** оставляем initial 50/20/10 как есть (тесты их зафиксировали). Followup переделываем:
- `followup.friendly: 30` универсальные дружеские «ну ещё раз говорю», «эй, я тут»
- `followup.neutral: 30` универсальные нейтральные «секунду», «погоди»
- `followup.cold: 30` холодные «я слышу», «не торопи»

В `QueuePhrasePoolService.getPools()` для followup выбирается категория по relationship-score:
- `score >= 1` → friendly
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

**Конфиг:** `flashTrolling.getConfig()` — уже редактируемый. Через panel:
- `runtime_flash_config` (новый action в `runtime` tab) → modal с весами, intervalMinutes, channelAllowlist.

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

Уже отключено feature flag. Включаем:
- В `runtime-config-service.featureFlags` поменять `mediaReactionsEnabled: true`.
- Сервис существует. Проверить, что `chat-orchestrator` действительно прикрепляет media к ответам когда флаг включён (есть `MediaReactionService`?).
- **Если сервиса нет** — это значит fragment был удалён в V7. Тогда: интегрировать через `FlashTrollingService.pickAction()` подход: при `relationshipScore >= 2` и `Math.random() < 0.05` после ответа Хори прикрепляем мем из catalog с подходящим тегом. Это безопасный минимум, дальше расширим.

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
**Цель:** 1.txt П.16.

1. `packages/core/src/services/queue-phrase-pool-service.ts` — переписать `DEFAULT_QUEUE_PHRASE_POOLS.followup`:
   - `friendly: 30 универсальных` (пишу новые)
   - `neutral: 30 универсальных`
   - `cold: 30 универсальных`
   - удалить `warm` и поднять `neutral` к 30 (сохранить совместимость API через alias `warm = friendly`).
2. `tests/queue-phrase-pool-sizes.test.ts` — поднять минимум до 30 для всех followup-категорий.
3. В `ReplyQueueService` обновить выбор bucket для followup по новому правилу (`friendly/neutral/cold` по score).

### Volna 3 — Prompt Slots full UX (П.5)
**Цель:** полностью заменить `_prompt_card` на slot-инвентарь.

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
6. **Удалить** старый `_prompt_card` UserMemoryNote-flow (модал PROMPT_CARD_MODAL и связанный код), но **сохранить** существующие данные (миграция: при первом «запомни» от юзера, у которого есть `_prompt_card`, импортировать как первый слот).
7. Panel `slots_*` actions: переписать на полноценный CRUD (force-activate, deactivate, edit content, set strength, view all server slots).

### Volna 4 — Flash Trolling Scheduler (П.15)
**Цель:** 1.txt П.15 + meme-context.

1. `apps/bot/src/runtime/flash-trolling-scheduler.ts` — новый.
2. `bootstrap.ts` — при создании runtime запустить `scheduler.start(runtime)` если `flashTrolling.isEnabled()`.
3. `MemeIndexer` — добавить `pickRandom()` и `getDescription(filePath)`.
4. После отправки meme: создать row в `Message` table с `content = "[мем: <description>]"` и `authorId = botId`. Это обеспечит контекст в следующих ответах.
5. Panel: `runtime_flash_config` action.

### Volna 5 — Cores Editor + Mood Override (П.11)
**Цель:** редактирование коров + ручная подмена.

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
   - **новый action `cores_override`**: select user → select core → select duration → upsert.
   - **новый action `cores_overrides_list`**: show all active overrides с кнопками отмены.

### Volna 6 — Channels & Panel polish (П.16a + П.11 cont.)
1. `channels_matrix` action: новая UI с матрицей всех каналов (3 кнопки на канал).
2. В начале `routeMessage`: если `ChannelConfig.isMuted && !allowBotReplies && !allowInterjections` (off) — return.
3. Чистка остальных panel placeholders где можно.

### Volna 7 — Media Reactions (П.27)
1. Включить feature flag.
2. Если `MediaReactionService` отсутствует — реализовать минимум: 5% шанс прикрепить мем к ответу Хори при `relationshipScore >= 2`.

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

## 6. Чек-лист релиза

- [x] Volna 1: relationshipsHardDisabled = false; default LLM_PROVIDER=router.
- [x] Volna 2: 3 followup пула по 30, friendly/neutral/cold.
- [x] Volna 3: prompt slots полный UX, лимиты по уровню, миграция _prompt_card.
- [x] Volna 4: flash-trolling scheduler + meme context.
- [x] Volna 5: cores editor + mood override + overrides list.
- [x] Volna 6: channels matrix + off-gate.
- [x] Volna 7: media reactions on.
- [x] Volna 8: knowledge import работает.

После каждой волны: `pnpm test` + ручной smoke в dev-сервере + audit-log запись.
