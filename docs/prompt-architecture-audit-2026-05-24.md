# Hori — Prompt Architecture Audit (2026-05-25)

> Статус: current-state audit.
> Цель документа: зафиксировать, как prompt реально строится сейчас, как он меняется по ситуациям, какие ограничения уже жёстко сидят в коде, и где планы совпадают или расходятся с реализацией.

---

## 0. Scope

Этот аудит не про весь продукт и не про весь pipeline бота.

Здесь предметом аудита считается только то, что реально влияет на форму LLM request в chat hot path:

- какие system blocks и conversational turns видит модель;
- какие данные попадают в prompt и в каком порядке;
- что стабилизировано ради cache hit;
- какие runtime-условия меняют prompt shape;
- какие ограничения уже enforced кодом, а какие пока существуют только в планах.

Главный current-state source of truth для chat prompt сейчас лежит не в одном месте, а в связке файлов:

- [packages/core/src/orchestrators/chat-orchestrator.ts](packages/core/src/orchestrators/chat-orchestrator.ts)
- [packages/memory/src/session/session-buffer-service.ts](packages/memory/src/session/session-buffer-service.ts)
- [packages/memory/src/context/context-service.ts](packages/memory/src/context/context-service.ts)
- [packages/core/src/services/runtime-config-service.ts](packages/core/src/services/runtime-config-service.ts)

Файлы [packages/core/src/persona/compose.ts](packages/core/src/persona/compose.ts) и [packages/core/src/persona/prompt-spec-stubs.ts](packages/core/src/persona/prompt-spec-stubs.ts) сегодня важны как transitional surfaces, но уже не являются полным source of truth для chat prompt contract.

---

## 1. Executive Verdict

На май 2026 текущая chat prompt-архитектура Hori уже ушла от старого модульного persona-composer и живёт в hybrid V7/V-next форме.

Короткая формула текущего chat prompt-а такая:

**stable core + epoch front + optional slot + optional hooks block + compacted session summaries + short live ladder tail + final focus/relationship lock**.

Это уже заметно ближе к [docs/hori-epoch-core-ladder-plan-ru.md](docs/hori-epoch-core-ladder-plan-ru.md), чем к [docs/persona-system.md](docs/persona-system.md), но до полного совпадения с epoch-ladder планом система ещё не дошла.

Если оценивать документы:

- [docs/hori-epoch-core-ladder-plan-ru.md](docs/hori-epoch-core-ladder-plan-ru.md) сегодня ближе всего к **target architecture** prompt-а.
- [docs/implementation-plan-2026-05.md](docs/implementation-plan-2026-05.md) ближе всего к **implementation roadmap**, но внутри уже есть устаревшие или взаимно противоречивые статусы.
- [docs/persona-system.md](docs/persona-system.md) полезен как **исторический слой**, но для текущего chat prompt-а вводит в заблуждение, если читать его как описание production reality.

---

## 2. Current Prompt Contract

### 2.1. Где реально собирается chat prompt

Реальный chat hot path собирается в [packages/core/src/orchestrators/chat-orchestrator.ts](packages/core/src/orchestrators/chat-orchestrator.ts):

- `buildStableCorePrompt()`
- `buildStableChatSystemPrompt()`
- `buildHooksBlock()`
- `buildRecentChatTurns()`
- `buildFocusLockBlock()`
- `handleChat()`

То есть production chat prompt сейчас фактически собирается не в `composeBehaviorPrompt()`, а поверх него, на уровне orchestrator-а.

### 2.2. Реальный порядок блоков в chat request

Для обычного chat intent LLM получает message-array примерно такой формы:

```text
1. system: stable core prompt
2. system: hooks block                (если hooks есть)
3. assistant/user turns: session summaries + live ladder tail + current transient user turn
4. system: focus lock + compact relationship tail
```

Это не старый один гигантский system prompt. Это уже message-array с явным разделением между стабильным верхом, живыми репликами и финальным target lock.

### 2.3. Stable Core Prompt

Stable core prompt собирается через `buildStableCorePrompt()` в [packages/core/src/orchestrators/chat-orchestrator.ts](packages/core/src/orchestrators/chat-orchestrator.ts) из трёх частей:

1. `commonCore`
2. `[CORE EPOCH]`
3. optional active prompt slot

`commonCore` берётся из runtime core templates, а дефолтная база лежит в [packages/core/src/persona/cores.ts](packages/core/src/persona/cores.ts).

Внутри этой базы всё ещё живёт основной character contract:

- кто такая Хори;
- как отвечать по последнему сообщению;
- анти-эссе и анти-ChatGPT ограничения;
- маркер агрессии `агрессивно`;
- тон и дистанция через выбранный core.

### 2.4. Epoch Front

Поверх общего core orchestrator вклеивает `[CORE EPOCH]` блок.

Epoch state хранится и ротируется в [packages/core/src/services/runtime-config-service.ts](packages/core/src/services/runtime-config-service.ts).

Состояние содержит:

- `epochId`
- `frontId`
- `startedAt`
- `expiresAt`
- `frontText`

В коде уже есть реальная длительность эпохи: 2 часа.

Это не просто план в доке. Epoch layer уже реально участвует в stable system prompt.

### 2.5. Active Prompt Slot

Если в канале активен prompt slot, он добавляется прямо в stable core prompt после epoch front.

Слот идёт как отдельный кусок текста с силой воздействия:

- `strength = 2` даёт жёсткий префикс `Главный фокус`
- `strength = 1` даёт обычное включение
- `strength = 0` даёт слабую подсказку

Backend для этого уже живёт в [packages/memory/src/slots/prompt-slot-service.ts](packages/memory/src/slots/prompt-slot-service.ts), а использование в hot path — в [packages/core/src/orchestrators/chat-orchestrator.ts](packages/core/src/orchestrators/chat-orchestrator.ts).

### 2.6. Restored Context

Restored context как data/model surface в коде ещё существует, но больше не входит в default chat hot path.

Текущее production-поведение такое:

- `buildStableChatSystemPrompt()` больше не вклеивает restored context в первый system block;
- обычный chat request собирается только из stable core, hooks, live turns и final focus lock;
- старый restored-context flow надо считать legacy compatibility surface, а не частью канонического prompt contract.

### 2.7. Hooks Block

Если relationship service возвращает hooks, orchestrator добавляет отдельный system block вида:

```text
[ХУКИ]
- label: detail (use=..., avoid=...)
```

Это уже ближе к задумке из epoch-ladder плана: hooks вынесены отдельно от core и отдельно от relationship tail.

Отличие от идеального плана сейчас такое:

- hooks идут отдельным system message;
- они не встроены в один монолитный prompt;
- лимит сейчас фактически 5, что совпадает с планом.

### 2.8. Live Ladder Turns

Живой чат формируется через `buildRecentChatTurns()` в [packages/core/src/orchestrators/chat-orchestrator.ts](packages/core/src/orchestrators/chat-orchestrator.ts).

Current behavior:

- сначала идут `session-summary` entries;
- затем live tail;
- затем transient current user turn.

Bot turns при этом фильтруются по target metadata: если bot reply явно был адресован другому пользователю, в окно текущего user-а он не попадает.

Форма turns сейчас уже очень близка к sent-only ladder contract:

- `Пользователь -> Хори: ...`
- `Хори -> User: ...`

### 2.9. Final Focus / Relationship Tail

После live turns orchestrator добавляет заключительный system block через `buildFocusLockBlock()`.

По смыслу это текущая production-версия relationship tail.

Он содержит:

- явную фиксацию текущего адресата;
- запрет перескакивать на чужую линию;
- компактный relationship summary:
  - `distance`
  - `mockery`
  - `caution`
  - `tone`

То есть relationship block в production уже существует, но не как длинный prose overlay, а как маленький финальный lens. Это как раз соответствует духу attached ladder-плана.

---

## 3. Behavior by Situation

### 3.1. Обычный chat

В обычном chat intent модель получает:

1. stable core prompt
2. hooks block, если есть
3. recent turns
4. final focus/relationship block

Это и есть главный prompt contract, который сейчас надо считать production reality.

### 3.2. Когда есть compaction

Если session buffer уже накопил compacted segments, они попадают в `recentMessages` как synthetic entries с `userId = session-summary`.

Дальше orchestrator рендерит их первыми в recent turns.

Практический смысл:

- старый сегмент уже не идёт сырым логом;
- summary видна модели раньше live tail;
- continuity держится не через гигантское recent window, а через immutable summary chunks.

Это проверено в [tests/session-buffer-compaction.test.ts](tests/session-buffer-compaction.test.ts).

### 3.3. Multi-user chat и target lock

В мультиюзерной сцене prompt специально режется под текущего пользователя.

Что уже делает код:

- вытаскивает bot target metadata из message flags;
- выкидывает bot turns, адресованные другому user-у;
- в конце добавляет `[ФОКУС]` блок с текущим адресатом.

Это уже реальный barrier против смешивания relationship context между людьми.

### 3.4. Когда активен prompt slot

Slot встраивается не в хвост, а в стабильную верхнюю часть prompt-а.

Следствие:

- slot влияет на чат раньше hooks и recent turns;
- slot получает хороший cache profile, если не меняется слишком часто;
- это отдельный runtime overlay, которого в главном ladder-доке почти нет.

### 3.5. Когда активен restored context

В текущем production chat path restored context больше не подмешивается в message-array автоматически.

Если в базе остаются старые restored-context сущности, они не меняют форму обычного chat prompt-а и должны рассматриваться как legacy bridge до дальнейшей зачистки.

### 3.6. Search path

Search идёт по отдельной ветке orchestrator-а, а не через chat hot path один-в-один.

Здесь важно не путать две архитектуры:

- **chat** уже живёт на stable-core + turns + focus lock
- **search** использует отдельный dedicated path с системным промптом и synthesis-подшагами

Значит, один документ не должен описывать search side-path как будто он идентичен chat prompt contract.

### 3.7. Aggression marker

Маркер `агрессивно` живёт прямо в core contract и затем обрабатывается post-generation pipeline-ом в orchestrator-е.

То есть поведение в этой ситуации двухслойное:

1. core разрешает модели отдать технический marker;
2. orchestrator ловит marker и запускает moderation/aggression pipeline.

Это не чисто prompt-only поведение, а prompt + downstream enforcement.

### 3.8. Manual core override

Если для пользователя задан moderator core override, chat hot path подменяет обычный выбор core и передаёт override в composer.

Это уже живая production-механика, хотя редактирование самих текстов core-ов в полном виде ещё не доведено.

### 3.9. Sleep-related behavior

Sleep state существует как session/runtime surface, но в production prompt contract он пока выражен слабее, чем обещает ladder-план.

Что уже есть:

- channel session state хранит `sleepUntil`;
- guild-level sleep state читается из session buffer;
- есть отдельная синхронизация ника `спит`, покрытая тестом [tests/session-sleep-sync.test.ts](tests/session-sleep-sync.test.ts).

Что важно:

- наличие sleep surfaces в коде ещё не означает, что полный hot-path suppression уже полностью совпадает с планом;
- это место надо считать partially integrated, а не closed.

---

## 4. Hard Constraints and Limits

### 4.1. Core-level hard rules

В [packages/core/src/persona/cores.ts](packages/core/src/persona/cores.ts) уже жёстко зашиты:

- отвечать на последнее сообщение с учётом контекста;
- не писать как ChatGPT, саппорт или психолог;
- не философствовать без прямого запроса;
- не делать список без запроса;
- не придумывать скрытый смысл;
- говорить `не знаю` или `мало контекста`, если контекста реально не хватает;
- при настоящей личной агрессии использовать технический marker `агрессивно`.

Это hard behavioral contract верхнего слоя.

### 4.2. Output limits

В [packages/core/src/persona/compose.ts](packages/core/src/persona/compose.ts) сейчас сидят дефолтные production limits:

- `maxSentences = 6`
- `maxParagraphs = 2`
- `maxChars = 700`
- `maxTokens = 220`

Потом это дополнительно режется через ResponseGuard в orchestrator-е.

### 4.3. ResponseGuard and post-processing

Финальный текст после generation проходит через post-processing guard.

Практически это значит:

- длина ещё раз ограничивается;
- forbidden words могут быть заменены;
- выход дополнительно нормализуется перед отправкой.

То есть часть реального response contract enforced уже не prompt-ом, а post-processing layer-ом.

### 4.4. Session compaction limits

В [packages/memory/src/session/session-buffer-service.ts](packages/memory/src/session/session-buffer-service.ts) уже зафиксированы production constants:

- `SESSION_COMPACTION_CHUNK_MESSAGES = 46`
- `SESSION_COMPACTION_TAIL_MESSAGES = 8`
- trigger = 54 raw unsummarized messages

Это уже не фантазия из плана, а реальный live constraint.

### 4.5. Session inactivity boundary

Сессия режется по 10-минутному gap.

Это тоже уже кодовая реальность в session buffer service, а не только target-state описание.

### 4.6. Sent-only / target-filtered bot history

Текущий prompt contract уже рассчитывает на target metadata у bot turns.

Hard rule фактически такая:

- bot turn, явно адресованный другому user-у, не должен попадать в окно текущего user-а.

Это ключевая часть anti-confusion behavior в multi-user chat.

### 4.7. Epoch duration

Current epoch duration в runtime config равна 2 часам.

Следовательно, в production today phrase “эпохи раз в несколько часов” уже конкретизирована в коде сильнее, чем в общем плане.

### 4.8. Hooks limit

Current hooks block режется до 5 entries.

Это совпадает с ladder-планом и уже enforced hot path-ом.

### 4.9. Slot strength

Prompt slots уже имеют трёхуровневую силу воздействия.

Это реальный current-state constraint, который почти не прописан в главном ladder-плане и только частично появляется в implementation-plan.

---

## 5. What the Tests Already Lock In

### 5.1. Live ladder behavior

[tests/chat-orchestrator-ladder.test.ts](tests/chat-orchestrator-ladder.test.ts) уже фиксирует несколько ключевых свойств prompt-а:

- bot turns для другого user-а исключаются;
- текущее user message transiently доклеивается в конец;
- focus block реально строится;
- hooks block реально строится;
- stable core prompt реально содержит epoch front и slot block.

### 5.2. Compaction behavior

[tests/session-buffer-compaction.test.ts](tests/session-buffer-compaction.test.ts) уже фиксирует:

- summary chunks идут перед tail;
- target metadata сохраняется;
- bot turns для другого user-а дропаются;
- candidate compaction строится именно на 54 = 46 + 8;
- long sessions переживают multiple immutable summary segments.

### 5.3. Epoch behavior

[tests/runtime-config-epoch.test.ts](tests/runtime-config-epoch.test.ts) фиксирует:

- epoch state реально персистится;
- epoch state переиспользуется, пока не истёк;
- epoch можно ротировать вручную;
- runtime status показывает epoch и sleep/session surfaces.

### 5.4. Sleep surfaces

[tests/session-sleep-sync.test.ts](tests/session-sleep-sync.test.ts) фиксирует:

- при sleep state ник может синхронизироваться в `спит`;
- после окончания sleep ник восстанавливается.

### 5.5. Outdated test surface

[tests/chat-prompt-cache-shape.test.ts](tests/chat-prompt-cache-shape.test.ts) по смыслу остаётся полезным якорем про cache shape и summary-before-tail, но его helper assumptions уже partly stale относительно current API и его надо читать осторожно.

---

## 6. Plans vs Code

### 6.1. [docs/hori-epoch-core-ladder-plan-ru.md](docs/hori-epoch-core-ladder-plan-ru.md)

Это не текущая реализация один-в-один.

Это target architecture, но важная часть его идей уже реально внедрена.

#### Что уже совпадает

- один общий stable core как верхний character contract;
- epoch layer поверх core;
- hooks вынесены отдельно от core;
- old raw chat не бесконечно тащится целиком;
- есть compaction rule 54 / 46 / 8;
- есть sent-only target-filtered логика для bot turns;
- relationship lens уже стоит в конце prompt-а как компактный focus lock.

#### Что совпадает только частично

- compacted context в коде подаётся не как отдельный явный block 3, а как `session-summary` turns внутри recent chat area;
- relationship tail в коде существует, но в slightly different form через `[ФОКУС]` + `[ОТНОШЕНИЕ]` block;
- sleep lifecycle существует по данным и по nickname sync, но его интеграция в весь hot path не выглядит ещё финально закрытой по самому документу.

#### Что пока остаётся target-state

- идеально чистый пятиблочный contract как единая формула документа;
- полный и бесспорный source-of-truth статус этого документа для всей команды;
- полное отсутствие параллельных старых runtime memory surfaces рядом с compacted session design.

### 6.2. [docs/implementation-plan-2026-05.md](docs/implementation-plan-2026-05.md)

Этот документ важен как roadmap, но читать его как точную картину current state опасно.

Внутри уже видно несколько проблем:

- часть секции “сломано / отсутствует” уже устарела;
- часть roadmap items реально partially implemented;
- часть решений описана как отменённая, но соответствующие runtime surfaces всё ещё живут рядом;
- внизу документ местами закрывает волны слишком оптимистично по сравнению с кодом.

Что полезно брать из него:

- цели по slots, core override, channels access, queue pools, flash trolling;
- понимание, какие product-механики считались важными в мае.

Чего нельзя делать:

- считать этот документ точным source of truth по состоянию chat prompt-а.

### 6.3. [docs/persona-system.md](docs/persona-system.md)

Этот документ описывает старый модульный composer: identity, style rules, message kind, anti-slop, ideological flavour, self-interjection constraints и так далее.

Проблема в том, что production chat prompt уже не живёт так.

В [packages/core/src/persona/compose.ts](packages/core/src/persona/compose.ts) прямо сказано, что старые динамические блоки удалены, а output оставлен в legacy-compatible форме ради потребителей и trace stub-ов.

Следовательно:

- документ полезен как historical migration context;
- документ вреден, если использовать его как описание того, что сейчас реально идёт в LLM request при chat intent.

---

## 7. What the Plans Do Not Specify Well Enough

### 7.1. Current message-array shape

Главный prompt-план мыслит систему в виде логических блоков, но не фиксирует явно, что production chat request уже assembled как message-array, а не как один monolithic system prompt.

Это критически важно для аудита, cache reasoning и дебага.

### 7.2. Active prompt slots

Current code уже знает про активные channel/global prompt slots, их strength и preemption behavior.

Это реально влияет на stable upper prompt area, но в главном ladder-плане почти не артикулировано.

### 7.3. Restored context

Restored context до сих пор живёт как отдельный memory-like layer.

Планы либо почти не описывают его, либо считают старой системой, которая должна уступить slots. Но в текущем коде этот слой не мёртв.

### 7.4. Search side-path

Chat prompt и search prompt уже не тождественны.

Документы почти не разделяют эти две формы, хотя на практике это разные request shapes и разные reasoning paths.

### 7.5. Test-backed assumptions

Некоторые архитектурные свойства уже защищены тестами и потому являются более сильной current-state реальностью, чем многие текстовые обещания в docs.

Это особенно верно для:

- compaction 54 / 46 / 8;
- summary-before-tail ordering;
- target-filtered bot turns;
- epoch persistence.

---

## 8. Risks / Misleading Surfaces

### 8.1. [packages/core/src/persona/compose.ts](packages/core/src/persona/compose.ts)

Файл важен, но легко вводит в заблуждение, если читать только типы и trace shape.

Сейчас он:

- возвращает one-core prompt;
- держит legacy-compatible output;
- заполняет trace в виде stubs.

Поэтому он описывает только маленькую часть реального chat prompt assembly.

### 8.2. [packages/core/src/persona/prompt-spec-stubs.ts](packages/core/src/persona/prompt-spec-stubs.ts)

Это откровенный compatibility layer.

Его нельзя читать как production persona spec.

### 8.3. [docs/persona-system.md](docs/persona-system.md)

Если новый человек откроет только этот документ, он получит ложное представление, будто production chat до сих пор строится из большого deterministic modular composer.

### 8.4. [docs/implementation-plan-2026-05.md](docs/implementation-plan-2026-05.md)

Документ полезен как planning artifact, но опасен как state snapshot.

### 8.5. Старые memory-card / prompt-card surfaces

В проекте всё ещё видны старые memory-related ветки, а рядом уже живут slots и restored context.

Для внешнего читателя это создаёт архитектурный шум: неочевидно, какая именно memory surface считается основной для prompt-а.

### 8.6. V7 comments vs actual orchestrator behavior

В коде много комментариев про V7 simplification, но реальный orchestrator уже снова отрастил hooks, epoch front, focus lock, session summaries и slot overlays.

То есть plain label “V7 single-block” сегодня уже недостаточен и местами обманчив.

---

## 9. Freshness Verdict

### 9.1. Насколько свеж ladder/epoch план

Как prompt-архитектурный target document [docs/hori-epoch-core-ladder-plan-ru.md](docs/hori-epoch-core-ladder-plan-ru.md) остаётся свежим.

Как буквальное описание текущего production code он совпадает частично.

Практическая оценка:

- как **target-state prompt contract**: свежий;
- как **точная карта current implementation**: частично свежий;
- как **единственный source of truth на сегодня**: недостаточен.

### 9.2. Насколько текущий код близок к нему

По prompt architecture код уже существенно ближе к этому документу, чем к старому modular persona doc.

Но пока это ещё не идеально чистая реализация документа. Текущий код — это hybrid state:

- stable core + epoch действительно есть;
- hooks действительно отдельные;
- compaction действительно есть;
- live ladder tail действительно есть;
- final target/relationship lens действительно есть;
- рядом всё ещё живут дополнительные runtime layers и transitional surfaces.

### 9.3. Что сегодня считать реальным source of truth

Для chat prompt сегодня source of truth фактически такой:

1. [packages/core/src/orchestrators/chat-orchestrator.ts](packages/core/src/orchestrators/chat-orchestrator.ts)
2. [packages/memory/src/session/session-buffer-service.ts](packages/memory/src/session/session-buffer-service.ts)
3. [packages/memory/src/context/context-service.ts](packages/memory/src/context/context-service.ts)
4. [packages/core/src/services/runtime-config-service.ts](packages/core/src/services/runtime-config-service.ts)
5. соответствующие tests

Документы пока не заменяют эту связку полностью.

---

## 10. Actionable Summary

### Что уже хорошо

- chat prompt больше не является распухшим modular persona essay;
- верхний слой стабилизирован ради cache reuse;
- multi-user continuity реально защищена target metadata и focus lock;
- compaction уже внедрён как настоящая архитектурная часть, а не как идея на бумаге;
- relationship lens в prompt уже короткий и утилитарный, что ближе к хорошему target-state;
- prompt slots уже живут не только в backend, но и в пользовательском UX: есть list/create/activate/deactivate/delete, кнопки, модалы и миграция legacy `_prompt_card` в слот;
- core prompt editing и core override уже не нулевые: есть panel/editor surfaces и modal для manual override;
- channels matrix и knowledge import уже не выглядят главными блокерами prompt-архитектуры.

### Что критично разъезжается

- documentation still split-brain: current prompt contract нельзя понять из одного актуального документа;
- implementation plan смешивает roadmap и устаревшие state claims;
- persona-system doc больше не описывает production chat prompt;
- restored context, legacy prompt-card и slots одновременно живут рядом и размывают картину "какая user-context surface считается основной";
- chat hot path уже собирается на orchestrator level, но вокруг него всё ещё висят legacy surfaces, которые создают лишний шум для дальнейшего prompt tuning.

### Главный вывод для следующей фазы

Чтобы дойти до режима "я занимаюсь почти только настройкой prompt-ов и их вариаций", проекту не нужен ещё один большой backend-рывок.

Нужен другой тип работы:

- вырезать или заморозить старые хвосты;
- выбрать одну простую опорную архитектуру;
- выровнять naming и admin-surfaces;
- закрепить это тестами и документацией.

То есть оставшийся объём — это в основном **упрощение, нормализация и зачистка**, а не строительство новой сложной системы.

---

## 11. What Is Still Missing Before Prompt-Only Work

Ниже перечислены именно те вещи, которые реально мешают перейти в режим "в основном кручу prompt-ы", а не просто любые незавершённые фичи в проекте.

### 11.1. Нужен один явный source of truth по chat prompt

Сейчас реальный контракт размазан между orchestrator, session buffer, context service, runtime config и тестами.

Это не смертельно для кода, но очень мешает быстрой prompt-итерации. Пока система не сведена в один понятный contract, любая настройка prompt-а рискует упираться в скрытый слой рядом.

Практический вывод:

- нужно зафиксировать один current-state contract;
- всё остальное либо назвать legacy, либо вывести за пределы chat hot path.

### 11.2. Нужно выбрать одну основную user-context surface

Сейчас рядом живут:

- prompt slots;
- restored context;
- legacy prompt-card / memory-card surfaces.

Для prompt tuning это вредно. Чем больше похожих слоёв меняют верхнюю часть prompt-а, тем труднее понять, что именно дало конкретный эффект.

Практический выбор должен быть бинарным:

- либо основная user-context surface = slots, а всё остальное уходит в legacy и удаление;
- либо restored context остаётся частью дизайна, но это надо прямо признать и документировать.

Промежуточное состояние мешает больше всего.

### 11.3. Нужно выровнять prompt key namespace и panel surfaces

Сейчас в проекте одновременно живут несколько диалектов ключей для core prompt surfaces:

- camelCase ключи в runtime/template слое;
- legacy snake_case aliases;
- panel actions, где встречаются свои alias-имена.

Это уже не просто эстетика. Это мешает доверять admin editor-ам и затрудняет prompt tuning через UI.

Пока ключевое пространство не нормализовано, любая работа над prompt-редакторами остаётся хрупкой.

### 11.4. Нужно убрать split между real chat assembly и legacy composer story

Сегодня `compose.ts` больше не собирает весь production prompt, но его типы и комментарии всё ещё создают иллюзию, будто он остаётся центральным persona-engine.

Для prompt-only режима это плохое состояние. Должно быть одно из двух:

- либо chat hot path полностью объявляется orchestrator-owned;
- либо composer снова становится настоящим центром сборки.

Сейчас это гибрид, и именно он создаёт ощущение "леса".

### 11.5. Нужно закрепить exact prompt order тестами сильнее, чем сейчас

Текущие тесты уже хорошо прикрывают compaction, target filtering, hooks/focus block и epoch state.

Но до полноценного safe prompt-iteration режима всё ещё не хватает проверок на:

- полный message-array order;
- взаимодействие slot + restored context + hooks;
- отсутствие чужих runtime overlays в обычном chat path;
- явную фиксацию того, что search живёт отдельной веткой.

Без этого backend уже вроде бы прост, но любое упрощение хвостов будет чуть опаснее, чем должно быть.

---

## 12. What Is Not A Real Blocker Anymore

Это важный раздел, потому что часть старых страхов уже не соответствует реальности.

### 12.1. Prompt slots уже достаточно живые

Slots уже нельзя считать "недоделанной backend-мечтой".

По коду уже есть:

- сервис;
- list/create/activate/deactivate/delete;
- slash command `/hori slot`;
- кнопки и modal flow;
- миграция legacy `_prompt_card` в слот.

Это не идеал, но для prompt-centric работы этого уже достаточно, чтобы не считать slots главным блокером.

### 12.2. Core prompt editing уже не нулевой

В проекте уже есть рабочие surfaces для core prompt panel и modal editing.

Значит, задача не в том, чтобы "с нуля сделать редактор промтов", а в том, чтобы привести его к одному naming contract и убрать legacy-расслоение.

### 12.3. Channels matrix уже существует

Channel access matrix и channel access actions уже живут в panel/router surfaces.

Это не та область, которая сейчас мешает перейти к prompt tuning.

### 12.4. Knowledge import уже не главный хвост

Knowledge import уже выглядит рабочей отдельной веткой. Это не тот backend-хвост, который мешает стабилизировать основную prompt систему.

### 12.5. Главный дефицит теперь не в отсутствии фич, а в их избыточном наслоении

Это ключевой пересмотр картины проекта.

Проблема уже не в том, что "ничего нет".
Проблема в том, что:

- главное уже есть;
- рядом осталось слишком много полулегаси-поверхностей;
- из-за этого система выглядит сложнее, чем она фактически должна быть.

---

## 13. What To Cut, Freeze, Or Collapse

Это центральный раздел для расчистки "леса".

### 13.1. Сразу заморозить как legacy-doc

[docs/persona-system.md](docs/persona-system.md) надо явно пометить как legacy / migration reference, а не как описание production chat prompt-а.

Пока этого не сделать, любой новый проход по проекту будет снова тащить старый mental model.

### 13.2. Схлопнуть prompt key dialects

[packages/core/src/persona/prompt-spec-stubs.ts](packages/core/src/persona/prompt-spec-stubs.ts) сейчас полезен как compatibility layer, но его текущее состояние слишком широкое и слишком мутное.

Что надо сделать:

- оставить только реально живые prompt surfaces;
- убрать лишние alias-слои;
- выровнять panel/runtime/template naming.

Это не значит "удалить файл завтра". Это значит сделать так, чтобы он перестал быть рассадником путаницы.

### 13.3. Довести до конца вынос legacy prompt-card

`_prompt_card`, `PROMPT_CARD_MODAL` и старые memory-card ветки надо либо окончательно мигрировать, либо честно оставить только как один короткий compatibility bridge с датой удаления.

Сейчас проект уже умеет мигрировать legacy card в slot. Значит, следующий шаг — не поддерживать эту поверхность бесконечно.

### 13.4. Определиться с restored context

Это один из самых важных cleanup-выборов.

Если целевая архитектура должна быть простой, то restored context должен получить один из двух статусов:

- либо это официальная часть prompt-модели;
- либо это transitional layer, который выносится из chat hot path.

Пока он остаётся полуживым слоем, он мешает ровной mental model prompt-а.

### 13.5. Убрать старый string-context path из chat mental model

`ContextBuilderService` и связанный `contextText/promptContextText` слой уже не выглядят как центр chat prompt assembly.

Для чистой архитектуры надо сделать одно из двух:

- либо жёстко вывести этот path из chat narrative и оставить его только для других веток;
- либо вернуть ему понятную и реально используемую роль.

Текущее состояние больше похоже на архитектурный хвост, чем на осмысленный центр.

### 13.6. Почистить stale V7 comments

Часть комментариев до сих пор говорит языком "V7 single-block simplification", хотя текущий orchestrator уже заметно сложнее и богаче.

Это мелочь, но именно из таких мелочей и вырастает ощущение хаотичного backend-а.

---

## 14. Minimal Stable Architecture To Freeze

Если цель — сделать систему стабильной, ровной и несложной, то минимальный production contract должен быть зафиксирован примерно так.

### 14.1. Что оставить центральным

1. `chat-orchestrator.ts` как единственный owner chat prompt assembly.
2. `runtime-config-service.ts` как owner stable upper prompt surfaces:
  - common core
  - epoch state
  - core override
3. `session-buffer-service.ts` + `context-service.ts` как owner session summaries и live tail data.
4. relationship hooks + compact relationship tail.
5. prompt slots как основную user-context surface.

### 14.2. Что считать отдельными ветками, а не частью ядра

- search/tool path;
- knowledge import and knowledge answering;
- flash trolling / media extras;
- panel UX and diagnostics.

Это может жить в проекте, но не должно путать ядро prompt architecture.

### 14.3. Какая должна быть простая финальная mental model

Если система очищена правильно, её можно объяснить в одной короткой формуле:

- один stable core;
- одна epoch layer;
- один user-context overlay тип;
- один session summary path;
- один live ladder path;
- один final target lock.

Как только поверх этого снова появляются параллельные memory surfaces, старые aliases и несинхронные docs, система снова распухает не по логике, а по шуму.

---

## 15. Recommended Order Of Work

Если цель — как можно скорее выйти в режим prompt tuning вместо backend gardening, порядок должен быть таким.

### Phase 1. Зафиксировать опорную правду

1. Оставить [docs/hori-epoch-core-ladder-plan-ru.md](docs/hori-epoch-core-ladder-plan-ru.md) как target architecture.
2. Оставить этот аудит как current-state companion.
3. Пометить [docs/persona-system.md](docs/persona-system.md) как legacy reference.

### Phase 2. Срезать главный шум

1. Нормализовать prompt key namespace.
2. Определиться с restored context.
3. Довести до конца вынос legacy prompt-card.
4. Почистить stale V7 comments и лишние aliases.

### Phase 3. Замкнуть ядро в один стабильный contract

1. Объявить orchestrator единственным owner chat prompt assembly.
2. Явно вывести старый string-context path из chat mental model.
3. Отделить search path от chat path на уровне docs и тестов.

### Phase 4. Докрутить safety-net для prompt-итераций

1. Добавить тест на exact message-array order.
2. Добавить тесты на slot/restored/hooks interplay.
3. Зафиксировать, какие overlays считаются официальными, а какие legacy.

После этого проект уже можно будет довольно честно считать пригодным для режима:

**основная работа = настройка core prompt-ов, epoch fronts, hooks, slot variants и prompt variations, а не возня с backend-археологией.**

---

## 16. Final Short Formula

Если совсем коротко, на 2026-05-25 production chat prompt Hori выглядит так:

**common core + epoch front + optional slot/restored memory + optional hooks + compacted session summaries + short target-filtered live ladder + final focus/relationship lock.**

А если совсем коротко описывать remaining work до желаемого состояния, то формула уже другая:

**не достраивать новую сложность, а выбрать один канонический prompt contract, вырезать дублирующие хвосты и заморозить ядро.**