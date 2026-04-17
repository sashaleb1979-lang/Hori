# Полный Гайд По Панели И Командам Hori

Если нужен совсем приземлённый вариант в стиле "нажми сюда -> впиши это -> получишь это", смотри [docs/hori-panel-step-by-step-ru.md](./hori-panel-step-by-step-ru.md).

## Что Это Вообще Такое

Панель Hori - это не сайт и не отдельная админка в браузере.

Панель - это набор ephemeral-интерфейсов внутри Discord:

1. Главная owner-панель через `/hori panel`
2. Панель состояния через `/hori state`
3. Панель мощности через `/hori power action:panel`
4. Модалки, которые открываются кнопками внутри панели

`Ephemeral` значит: ответ видишь только ты. Другие пользователи этот интерфейс не видят.

Важно понять главное:

1. `/hori panel` - это owner-only master panel
2. Модератор не открывает master panel, но может пользоваться многими прямыми ветками `/hori ...`
3. Обычный пользователь видит только безопасные команды вроде поиска, своего профиля и личного альбома
4. Старые `/bot-*` команды в проекте есть, но по умолчанию скрыты из регистрации

Если сказать совсем просто:

1. Хочешь большую управлялку - это `/hori panel`
2. Хочешь посмотреть живое состояние бота - это `/hori state`
3. Хочешь менять поведение без панели - это прямые команды `/hori channel`, `/hori mood`, `/hori feature` и так далее

---

## Кто Что Может

### 1. Обычный Пользователь

Обычный пользователь может:

1. Делать `/hori search`
2. Смотреть свой профиль через `/hori profile`
3. Работать со своим альбомом через `/hori album`, если включён `memory_album_enabled`
4. Использовать message context actions, если они не выключены

Обычный пользователь не может:

1. Открывать `/hori panel`
2. Открывать `/hori state`
3. Менять глобальные настройки сервера
4. Менять relationship-цифры людей
5. Включать и выключать feature flags

### 2. Модератор

Модератором считается человек с правом `ManageGuild`.

Модератор может:

1. Настраивать каналы
2. Смотреть summaries и stats
3. Управлять mood
4. Смотреть и чистить queue
5. Менять feature flags
6. Управлять media registry
7. Запускать memory-build по текущему каналу
8. Смотреть debug trace
9. Смотреть чужой профиль

Но модератор всё равно не может открыть owner master panel. Панель остаётся owner-only.

### 3. Владелец Бота

Владелец - это Discord user ID, записанный в `BOT_OWNERS` или в legacy-алиас `DISCORD_OWNER_IDS`.

Владелец может всё, включая:

1. `/hori panel`
2. `/hori state`
3. `/hori dossier`
4. Полный relationship editor
5. `/hori power`
6. `/hori ai-url`
7. `/hori lockdown`
8. `/hori import`
9. Server-wide memory-build

---

## Самое Важное В Двух Строках

Если тебе надо быстро ориентироваться:

1. `/hori panel` - главный owner-only пульт
2. `/hori state` - диагностическая панель
3. `/hori search` - интернет-поиск
4. `/hori channel` - настройки конкретного канала
5. `/hori feature` - включение и выключение фич
6. `/hori mood` - настроение бота
7. `/hori queue` - очередь ответов
8. `/hori power` - мощность Ollama и контекста

---

## Как Открыть Панель

### Master Panel

Команда:

```text
/hori panel
```

Можно сразу открыть вкладку:

```text
/hori panel tab:style
/hori panel tab:memory
/hori panel tab:diagnostics
```

Доступные вкладки:

1. `main`
2. `owner`
3. `style`
4. `liveliness`
5. `memory`
6. `people`
7. `channels`
8. `search`
9. `experiments`
10. `diagnostics`

### State Panel

Команда:

```text
/hori state
```

Можно открыть сразу нужный раздел:

```text
/hori state tab:brain
/hori state tab:tokens
```

Разделы state panel:

1. `persona`
2. `brain`
3. `memory`
4. `channel`
5. `search`
6. `queue`
7. `media`
8. `features`
9. `trace`
10. `tokens`

---

## Как Устроена Master Panel

Внутри `/hori panel` у тебя есть:

1. Верхний select с вкладками
2. Кнопки быстрых действий для текущей вкладки
3. Иногда второй embed с результатом действия
4. Модалки для сложного ввода

Кнопки панели не делают отдельную магию.

Почти всегда они просто вызывают ту же самую внутреннюю логику, что и прямые команды `/hori ...`.

Это важно: панель - это удобный пульт, а не отдельный второй движок.

---

## Вкладки Master Panel По-Простому

## Главная Вкладка

Назначение: быстрый вход в самое частое.

Кнопки:

| Кнопка | Что делает | Для кого |
|---|---|---|
| `Статус` | Показывает короткий общий статус: power profile, lockdown, memory state текущего канала | owner |
| `Help` | Пишет краткую справку по текущей системе команд | owner |
| `Search` | Открывает модалку поиска | owner |
| `Queue` | Показывает состояние reply queue | owner |
| `Mood` | Показывает текущее настроение Hori | owner |
| `Мой профиль` | Показывает твой user profile и relation summary | owner |
| `Моя память` | Показывает user profile, memory notes и relation summary для тебя | owner |

Когда полезно:

1. После деплоя быстро проверить, что бот живой
2. Перед настройкой быстро понять текущее состояние
3. Быстро открыть поиск или посмотреть queue

---

## Вкладка Владелец

Это самые опасные и самые системные штуки.

Кнопки:

| Кнопка | Что делает | Что важно знать |
|---|---|---|
| `State` | Открывает state panel | Это уже диагностика, не настройка |
| `Trace` | Переход на state trace | Показывает последний bot event |
| `Tokens` | Переход на state tokens | Показывает usage по токенам |
| `Power` | Открывает power panel | Меняет контекст, лимиты и параметры Ollama |
| `AI URL` | Открывает модалку смены Ollama URL | Меняется endpoint модели |
| `Edit relation` | Открывает relationship editor | Меняет вектор отношения к человеку |
| `Lockdown?` | Показывает статус owner lockdown | Полезно проверить, не забыли ли его включённым |
| `Lockdown on` | Включает режим owner-only | Все, кроме owner, будут молча игнорироваться |
| `Lockdown off` | Выключает owner-only режим | Бот снова слушает обычные правила |
| `Media sync` | Синхронизирует media pack из catalog.json | Owner-only, массовая загрузка media registry |
| `Media list` | Показывает список последних media entries | Для быстрой проверки registry |
| `Build сервер` | Ставит server-wide memory-build в очередь | Это фонова задача, не мгновенная |

### Что Такое Lockdown

Это режим: Hori слушает только владельца.

Что происходит при `Lockdown on`:

1. Бот игнорирует всех, кроме owner
2. Reply queue очищается
3. Снаружи часто выглядит как будто бот умер, хотя он просто замкнут на owner

Если бот «вдруг всем молчит», первое что надо проверить - не включён ли lockdown.

### Что Такое AI URL

Это URL до Ollama backend.

Команда/панель:

1. Проверяет, что URL вообще валидный
2. Пытается сходить в `/api/tags`
3. Если Ollama отвечает нормально, URL применяется
4. URL ещё и сохраняется в базе, чтобы пережить рестарт

Если сюда ввести мусорный URL, панель скажет, что URL не применён.

---

## Вкладка Стиль

Это про характер Hori, а не про железо.

Кнопки:

| Кнопка | Что делает |
|---|---|
| `Snapshot` | Показывает текущие persona settings сервера |
| `Живой preset` | Применяет готовый живой стиль |
| `Edit style` | Открывает style editor |
| `Mood playful` | Ставит mood `playful` на 60 минут |
| `Mood normal` | Ставит mood `normal` на 60 минут |
| `Sprinting on` | Включает natural message splitting |
| `Sprinting off` | Выключает natural message splitting |
| `Playful on/off` | Включает или выключает playful mode |
| `Irritated on/off` | Включает или выключает irritated mode |
| `Roast on/off` | Включает или выключает roast-режим |
| `Фичи` | Показывает текущие feature flags |
| `Статус` | Показывает короткий общий статус |

### Что На Самом Деле Меняется Во Вкладке Стиль

Тут меняются такие поля:

1. `botName`
2. `preferredLanguage`
3. `roughnessLevel`
4. `sarcasmLevel`
5. `roastLevel`
6. `interjectTendency`
7. `replyLength`
8. `preferredStyle`
9. `forbiddenWords`
10. `forbiddenTopics`

### Что Значат Эти Поля По-Овощному

1. `botName` - как зовут бота
2. `preferredLanguage` - на каком языке бот старается отвечать
3. `roughnessLevel` - насколько резкая подача
4. `sarcasmLevel` - сколько сарказма
5. `roastLevel` - насколько бот разрешает себе подколы
6. `interjectTendency` - насколько любит сама влезать в чат
7. `replyLength` - базовая длина ответа
8. `preferredStyle` - словесное описание стиля речи
9. `forbiddenWords` - слова, которые бот должен маскировать
10. `forbiddenTopics` - темы, куда лучше не лезть

### Кнопка Живой preset

Она быстро ставит такой набор:

1. Имя: `Хори`
2. Язык: `ru`
3. roughness: `2`
4. sarcasm: `3`
5. roast: `2`
6. interject tendency: `1`
7. reply length: `short`
8. развёрнутый живой `preferredStyle`

Это быстрый способ вернуть бота в более живой и нормальный тон без ручной настройки каждого поля.

---

## Вкладка Живость

Это про то, как активно бот вмешивается в чат и как раскладывает ответы.

Кнопки:

| Кнопка | Что делает |
|---|---|
| `Читать чат` | Включает ответы и interjections в текущем канале |
| `Тихий канал` | Выключает ответы и interjections в текущем канале |
| `2 чанка` | Включает natural splitting |
| `1 chunk` | Выключает natural splitting |
| `Mood` | Показывает текущий mood |
| `Queue` | Показывает очередь |
| `Interject on/off` | Включает или выключает auto-interject |
| `Queue on/off` | Включает или выключает reply queue |
| `GIF pack` | Синхронизирует media pack |
| `Reflection` | Показывает статус reflection journal |
| `Фичи` | Показывает все флаги |

### Что Это Значит По-Человечески

1. Если бот слишком назойливый - выключай `auto_interject`
2. Если бот слишком дробит ответы на части - выключай natural splitting
3. Если бот не должен говорить в канале вообще - используй quiet-режим через channel policy
4. Если ответы теряются из-за нагрузки - смотри queue

---

## Вкладка Память

Это всё, что связано с Active Memory, summaries, topic engine и memory album.

Кнопки:

| Кнопка | Что делает |
|---|---|
| `Memory status` | Показывает channel memory, event memory и последний memory-build |
| `Build канал` | Запускает memory-build по текущему каналу |
| `Build сервер` | Запускает memory-build по всему серверу |
| `Topic on/off` | Включает или выключает topic engine |
| `Album on/off` | Включает или выключает memory album |
| `Requests on/off` | Включает или выключает interaction requests |
| `Summary` | Показывает последние summaries канала |
| `Topic` | Показывает активную тему канала |
| `Lessons` | Показывает открытые reflection lessons |
| `Моя память` | Показывает личную память по тебе |

### Что Такое Memory-build

Это фоновая сборка памяти из уже накопленных сообщений.

Она не отвечает мгновенно. Она:

1. Создаёт запись `memoryBuildRun`
2. Кладёт задачу в очередь `memory.formation`
3. Потом worker уже реально её собирает

Если нажал `Build канал` или `Build сервер`, не жди, что всё пересоберётся прямо в ту же секунду в этом же окне.

### Topic Engine

Отвечает за активную тему канала:

1. Что сейчас обсуждают
2. К какому контексту бот должен прилипать
3. Когда тема устарела и должна закрыться

Если topic engine выключен, бот хуже держит длинную линию обсуждения.

### Memory Album

Это личный альбом сохранённых моментов.

Не путай:

1. Server memory - общая память сервера
2. User memory notes - заметки по человеку
3. Memory album - сохранённые моменты для пользователя

---

## Вкладка Люди

Это всё, что связано с профилями и отношением к людям.

Кнопки:

| Кнопка | Что делает |
|---|---|
| `Мой профиль` | Показывает твой user profile |
| `Open dossier` | Открывает owner dossier по user ID |
| `Отношение ко мне` | Показывает relationship vector по тебе |
| `Edit relation` | Открывает relationship editor |
| `Owner edit` | Пишет подсказку, как owner меняет relationship |
| `Моя память` | Показывает память по тебе |

### Profile vs Relationship vs Dossier

Это три разные вещи.

#### Profile

Это краткий профиль человека:

1. summaryShort
2. styleTags
3. topicTags
4. confidence

#### Relationship

Это вектор отношения бота к человеку:

1. `toneBias`
2. `roastLevel`
3. `praiseBias`
4. `interruptPriority`
5. `doNotMock`
6. `doNotInitiate`
7. `protectedTopics`
8. `closeness`
9. `trustLevel`
10. `familiarity`
11. `proactivityPreference`

#### Dossier

Это owner-only расширенное досье, где собирается всё сразу:

1. базовая информация о пользователе
2. профиль
3. relationship vector
4. memory notes
5. статистика
6. записи из memory album

Если совсем просто:

1. `profile` - короткая карточка
2. `relationship` - как бот к нему относится
3. `dossier` - полный чемодан данных по человеку

---

## Вкладка Каналы

Это управление конкретным каналом.

Кнопки:

| Кнопка | Что делает |
|---|---|
| `Policy` | Показывает текущую политику канала |
| `Edit channel` | Открывает модалку channel policy |
| `Interject on` | Делает канал живым |
| `Quiet mode` | Делает канал тихим |
| `Topic` | Показывает текущую тему |
| `Reset topic` | Закрывает активную тему |
| `Queue` | Показывает очередь по каналу |
| `Clear queue` | Чистит очередь |
| `Summary` | Показывает summary |
| `Channel memory` | Показывает статус channel memory |

### Что Такое Channel Policy

Для канала хранится такая политика:

1. `allowBotReplies`
2. `allowInterjections`
3. `isMuted`
4. `responseLengthOverride`
5. `topicInterestTags`

#### Что Значит Каждое Поле

1. `allowBotReplies=true` - бот имеет право отвечать
2. `allowInterjections=true` - бот имеет право сам встревать без явного вызова
3. `isMuted=true` - бот должен молчать
4. `responseLengthOverride` - локальная длина ответа именно в этом канале
5. `topicInterestTags` - локальные тематические теги для канала

#### Очень Важный Момент Про responseLengthOverride

Значения:

1. `short`
2. `medium`
3. `long`
4. `inherit`

`inherit` значит: не использовать локальный override, а взять глобальную длину сервера.

---

## Вкладка Поиск

Это всё про web search и link understanding.

Кнопки:

| Кнопка | Что делает |
|---|---|
| `Search` | Открывает search modal |
| `Диагностика` | Делает search preflight-диагностику |
| `Search on/off` | Включает или выключает `web_search` |
| `Links on/off` | Включает или выключает `link_understanding_enabled` |
| `Фичи` | Показывает текущие флаги |
| `Search state` | Открывает state search |
| `Tokens` | Открывает state tokens |

### Что Показывает Search Diagnostics

Проверка показывает:

1. есть ли `BRAVE_SEARCH_API_KEY`
2. какой `SEARCH_USER_COOLDOWN_SEC`
3. лимиты `SEARCH_MAX_REQUESTS_PER_RESPONSE`
4. лимиты `SEARCH_MAX_PAGES_PER_RESPONSE`
5. `SEARCH_DOMAIN_DENYLIST`
6. `OLLAMA_BASE_URL`
7. `OLLAMA_SMART_MODEL`
8. `OLLAMA_TIMEOUT_MS`
9. отвечает ли Ollama на `/api/tags`

Если поиск не работает, это одна из первых кнопок, которую надо нажать.

---

## Вкладка Эксперименты

Это тумблеры тех фич, которые влияют на “поведение сверху”.

Кнопки:

| Кнопка | Что делает |
|---|---|
| `Sprinting on/off` | Включает или выключает natural splitting |
| `Mood playful` | Быстро ставит playful mood |
| `Media on/off` | Включает или выключает media reactions |
| `Selective on/off` | Включает или выключает selective engagement |
| `Ctx actions on/off` | Включает или выключает context actions |
| `Reflect on/off` | Включает или выключает self reflection lessons |
| `Фичи` | Список всех текущих флагов |
| `Media list` | Список media registry |
| `Reflection` | Короткий статус reflection |
| `Lessons` | Открытые уроки reflection |
| `Media sync` | Массовая синхронизация media pack |

### Про Эти Фичи По-Простому

1. `media_reactions_enabled` - бот может прикладывать медиа
2. `selective_engagement_enabled` - бот умнее решает, стоит ли вообще лезть в разговор
3. `context_actions` - работают message context actions
4. `self_reflection_lessons_enabled` - бот пишет себе тихие «уроки» по своим ошибкам

---

## Вкладка Диагностика

Это вкладка “почему бот ведёт себя так, а не иначе”.

Кнопки:

| Кнопка | Что делает |
|---|---|
| `Latest trace` | Показывает последний bot event trace |
| `Search diag` | Поисковая диагностика |
| `Strict on/off` | Включает или выключает anti-slop strict mode |
| `Ctx conf on/off` | Включает или выключает context confidence |
| `Channel-aware on/off` | Включает или выключает channel-aware mode |
| `Kind-aware on/off` | Включает или выключает message-kind-aware mode |
| `Фичи` | Показывает все flags |
| `Queue` | Показывает очередь |
| `Stats` | Недельная статистика |
| `Trace state` | Переход в state trace |
| `Token state` | Переход в state tokens |
| `Статус` | Короткий общий статус |

### Что Значат Эти Диагностические Флаги

1. `anti_slop_strict_mode` - сильнее режет AI-сопли, повторы и мусор
2. `context_confidence_enabled` - включает оценку уверенности в контексте
3. `channel_aware_mode` - бот учитывает тип канала
4. `message_kind_aware_mode` - бот учитывает тип входящего сообщения

Если бот отвечает странно, сухо или мимо контекста, обычно ковыряют именно эту вкладку.

---

## State Panel: Что Там За Разделы

`/hori state` - это не панель управления. Это панель наблюдения.

Она показывает, что бот сейчас думает о себе, памяти, очередях и токенах.

### Persona

Показывает:

1. имя и язык
2. базовую короткость
3. текущие tone-уровни
4. mood
5. preferred style

Это вкладка “какой у бота характер прямо сейчас”.

### Brain

Показывает:

1. `OLLAMA_BASE_URL`
2. fast model
3. smart model
4. power profile
5. runtime лимиты
6. статус owner lockdown

Это вкладка “какие у бота мозги и в каком режиме они крутятся”.

### Memory

Показывает:

1. сколько server memory
2. сколько user memory
3. сколько channel memory
4. сколько event memory
5. channel memory status
6. последний memory-build

### Channel

Показывает:

1. policy канала
2. topic tags
3. queue по каналу
4. количество interjections за последний час

### Search

Показывает:

1. env для Brave/Search
2. denylist доменов
3. последний trace поиска

### Queue

Показывает:

1. queue по серверу
2. queue по каналу
3. сколько pending задач

### Media

Показывает:

1. сколько media entries включено
2. сколько выключено
3. сколько использовалось за 24 часа
4. последнюю запись использования

### Features

Показывает:

1. какие feature flags сейчас `on`
2. какие `off`

### Trace

Показывает:

1. последний bot event
2. intent
3. route reason
4. model
5. latency
6. tokens
7. `debugTrace`

### Tokens

Показывает usage по окнам:

1. 24 часа
2. 7 дней
3. Search 24h

Именно сюда смотри, если надо понять, насколько дорого бот сейчас живёт.

---

## Все Прямые Команды `/hori`

Ниже - полный список того, что зарегистрировано внутри основной команды `/hori`.

## `/hori panel`

Назначение: открыть owner master panel.

Опции:

1. `tab` - вкладка панели

Доступ: только owner.

## `/hori state`

Назначение: открыть state panel.

Опции:

1. `tab` - раздел state panel

Доступ: только owner.

## `/hori search`

Назначение: сделать web search через search-пайплайн Hori.

Опции:

1. `query` - что искать

Доступ: обычный пользователь тоже может.

Если поиск вернул пустоту, команда сама пишет fallback вроде “Открой Диагностику”.

## `/hori memory-build`

Назначение: запустить пересборку active memory.

Опции:

1. `scope=channel|server`
2. `depth=recent|deep`

Доступ:

1. `channel` - модератор или owner
2. `server` - только owner

Это очередь, а не мгновенное действие.

## `/hori profile`

Назначение: показать краткий профиль/память.

Опции:

1. `user` - необязательный пользователь

Правила:

1. без `user` показывает тебя
2. чужой профиль может смотреть только owner/moderator

## `/hori dossier`

Назначение: собрать развёрнутое досье по человеку.

Опции:

1. `user` - обязательный пользователь

Доступ: только owner.

## `/hori relationship`

Назначение: посмотреть или изменить отношение к человеку.

Опции:

1. `user`
2. `tone-bias`
3. `roast-level`
4. `praise-bias`
5. `interrupt-priority`
6. `do-not-mock`
7. `do-not-initiate`
8. `protected-topics`
9. `closeness`
10. `trust`
11. `familiarity`
12. `proactivity`

Доступ: только owner.

Поведение:

1. если передать только `user` - покажет текущие relationship details
2. если передать ещё поля - обновит их и затем покажет результат

## `/hori memory`

Назначение: управлять server memory.

Опции:

1. `action=remember|forget`
2. `key`
3. `value` для `remember`

Доступ: moderator или owner.

## `/hori channel`

Назначение: настраивать конкретный канал.

Опции:

1. `channel`
2. `allow-bot-replies`
3. `allow-interjections`
4. `is-muted`
5. `response-length`
6. `topic-interest-tags`

Доступ: moderator или owner.

## `/hori summary`

Назначение: показать последние channel summaries.

Опции:

1. `channel`

Доступ: moderator или owner.

## `/hori stats`

Назначение: недельная статистика сервера.

Доступ: moderator или owner.

## `/hori topic`

Назначение: посмотреть или сбросить активную тему.

Опции:

1. `action=status|reset`
2. `channel`

Доступ: moderator или owner.

## `/hori mood`

Назначение: смотреть, задавать и сбрасывать mood.

Опции:

1. `action=status|set|clear`
2. `mode`
3. `minutes`
4. `reason`

Доступ: moderator или owner.

## `/hori queue`

Назначение: смотреть и чистить reply queue.

Опции:

1. `action=status|clear`
2. `channel`

Доступ: moderator или owner.

## `/hori album`

Назначение: работать со своим личным memory album.

Опции:

1. `action=list|remove`
2. `limit`
3. `id`

Доступ: пользовательский, если включён `memory_album_enabled`.

## `/hori debug`

Назначение: получить debug trace.

Опции:

1. `message-id`

Если `message-id` не передан, команда может вернуть latest debug trace.

Доступ: moderator или owner.

## `/hori feature`

Назначение: включить или выключить feature flag.

Опции:

1. `key`
2. `enabled=true|false`

Доступ: moderator или owner.

## `/hori media`

Назначение: управлять media registry.

Опции:

1. `action=list|add|sync-pack|disable`
2. `id`
3. `type`
4. `path`
5. `trigger-tags`
6. `tone-tags`
7. `channels`
8. `moods`
9. `nsfw`

Доступ:

1. `list`, `add`, `disable` - moderator или owner
2. `sync-pack` - только owner

## `/hori power`

Назначение: управлять power profiles.

Опции:

1. `action=panel|status|apply`
2. `profile=economy|balanced|expanded|max`

Доступ: только owner.

## `/hori ai-url`

Назначение: сменить Ollama URL.

Опции:

1. `url`

Доступ: только owner.

## `/hori lockdown`

Назначение: переключать owner-only режим.

Опции:

1. `mode=on|off|status`

Доступ: только owner.

## `/hori import`

Назначение: импортировать историю чата из JSON.

Опции:

1. `file`

Ограничения:

1. только `.json`
2. максимум 50 МБ
3. максимум 50 000 сообщений за один импорт

Доступ: только owner.

---

## Power Panel И Power Profiles

Power panel управляет не характером бота, а его вычислительными лимитами и размером контекста.

Профили:

| Профиль | Context messages | Context chars | Reply max tokens | Reply max chars | keep_alive | num_ctx | num_batch |
|---|---:|---:|---:|---:|---|---:|---:|
| `economy` | 8 | 1800 | 160 | 1100 | 5m | 4096 | 64 |
| `balanced` | 12 | 4000 | 220 | 1600 | 10m | 8192 | 128 |
| `expanded` | 18 | 4200 | 320 | 2200 | 20m | 12288 | 256 |
| `max` | 24 | 6000 | 480 | 3000 | 30m | 16384 | 256 |

### Как Это Понимать

1. `economy` - дешевле, короче, тупее на длинном контексте, зато легче для железа
2. `balanced` - нормальный дефолт
3. `expanded` - больше памяти разговора и длиннее ответы
4. `max` - самый жирный режим, если железо тянет

Если бот начинает тормозить или Ollama захлёбывается, первым делом пробуют `balanced` или `economy`.

---

## Все Модалки В Панели И Как Их Заполнять

## AI URL Modal

Поле:

1. `url`

Что писать:

```text
https://your-ollama-host.example.com
```

Что делает:

1. проверяет URL
2. делает запрос к `/api/tags`
3. если всё ок - сохраняет новый endpoint

## Search Modal

Поле:

1. `query`

Пиши обычный человеческий поисковый запрос.

Примеры:

```text
лучшие практики discord moderation
```

```text
как настроить ollama через reverse proxy
```

## Relationship Editor

Поля:

1. `userId`
2. `toneBias`
3. `levels`
4. `signals`
5. `switches`

### Что Вводить

#### userId

Discord user ID человека.

#### toneBias

Обычно одно из:

1. `neutral`
2. `friendly`
3. `sharp`
4. `playful`

#### levels

Формат:

```text
roast,praise,interrupt
```

Пример:

```text
2,1,0
```

#### signals

Формат:

```text
closeness,trust,familiarity,proactivity
```

Пример:

```text
0.6,0.5,0.7,0.5
```

Все значения от 0 до 1.

#### switches

Формат:

```text
doNotMock,doNotInitiate,topic1,topic2
```

Пример:

```text
false,false,семья,здоровье
```

Первые два значения читаются как bool.
Остальное - protected topics.

## Dossier Modal

Поле одно:

1. `userId`

Вводишь Discord ID человека и получаешь большой owner dossier.

## Style Editor

Поля:

1. `botName`
2. `levels`
3. `replyLength`
4. `preferredStyle`
5. `forbidden`

### levels

Формат:

```text
roughness,sarcasm,roast
```

Пример:

```text
2,3,2
```

### replyLength

Формат:

```text
replyLength,language,interject
```

Пример:

```text
short,ru,1
```

### preferredStyle

Это текстовое описание манеры речи.

Пример:

```text
женская персона; коротко; сухо, но живо; без офисной вежливости; без тупых повторов
```

### forbidden

Формат:

```text
forbiddenWords | forbiddenTopics
```

Пример:

```text
слово1,слово2 | политика,религия
```

### Важная Нюансная Логика Style Modal

1. Пустые числовые поля обычно не меняют старое значение
2. Пустой `botName` или `preferredLanguage` сбрасывает поле к дефолту
3. Пустой `preferredStyle` тоже сбрасывает к дефолту
4. Пустой блок `forbidden` чистит списки запретов

## Channel Policy Modal

Поля:

1. `allowBotReplies`
2. `allowInterjections`
3. `isMuted`
4. `responseLengthOverride`
5. `topicInterestTags`

### Что Вводить

Для bool полей:

```text
true
false
```

Пусто - не менять.

Для `responseLengthOverride`:

```text
short
medium
long
inherit
```

Для `topicInterestTags`:

```text
мемы,игры,тех
```

### Важная Нюансная Логика Channel Modal

1. Пустые bool-поля - не менять
2. Пустой `responseLengthOverride` - не менять
3. `inherit` сбрасывает локальную длину ответа к серверной
4. Пустой `topicInterestTags` не чистит теги, а просто оставляет как было

---

## Feature Flags, Которые Ты Реально Трогаешь Из Панели

Ниже флаги, которые панель умеет переключать напрямую:

| Ключ | Что значит |
|---|---|
| `web_search` | Интернет-поиск разрешён |
| `link_understanding_enabled` | Бот разбирает ссылки глубже |
| `auto_interject` | Бот может сам влезать в разговор |
| `reply_queue_enabled` | Включена очередь ответов |
| `media_reactions_enabled` | Бот может прикладывать медиа |
| `selective_engagement_enabled` | Более умное решение, отвечать ли вообще |
| `context_actions` | Работают message context actions |
| `self_reflection_lessons_enabled` | Включён журнал self-reflection |
| `playful_mode_enabled` | Разрешён playful mode |
| `irritated_mode_enabled` | Разрешён irritated mode |
| `roast` | Разрешены более жёсткие подколы |
| `memory_album_enabled` | Включён memory album |
| `interaction_requests_enabled` | Включены interaction requests |
| `topic_engine_enabled` | Включён topic engine |
| `anti_slop_strict_mode` | Жёстче режется AI-мусор |
| `context_confidence_enabled` | Включена оценка уверенности в контексте |
| `channel_aware_mode` | Учитывается тип канала |
| `message_kind_aware_mode` | Учитывается тип сообщения |

---

## Context Actions На Сообщениях

Кроме slash-команд, есть действия на правый клик по сообщению:

1. `Хори: объясни`
2. `Хори: кратко`
3. `Хори: оценить тон`
4. `Хори: запомнить момент`

### Что Делает `Хори: запомнить момент`

1. Создаёт interaction request
2. Открывает модалку с заметкой и тегами
3. Сохраняет запись в memory album

Это работает только если включены:

1. `memory_album_enabled`
2. `interaction_requests_enabled`

Если исходное сообщение пустое, момент не сохранится.

---

## Hidden Legacy Команды `/bot-*`

Они всё ещё существуют в коде, но по умолчанию скрыты.

Чтобы они вообще регистрировались, нужен флаг:

```text
DISCORD_REGISTER_LEGACY_COMMANDS=true
```

Список legacy-команд:

1. `/bot-help`
2. `/bot-style`
3. `/bot-memory`
4. `/bot-album`
5. `/bot-relationship`
6. `/bot-feature`
7. `/bot-debug`
8. `/bot-profile`
9. `/bot-channel`
10. `/bot-summary`
11. `/bot-stats`
12. `/bot-topic`
13. `/bot-mood`
14. `/bot-queue`
15. `/bot-reflection`
16. `/bot-media`
17. `/bot-power`
18. `/bot-ai-url`
19. `/bot-lockdown`
20. `/bot-import`

Смысл у них примерно тот же, что у соответствующих веток `/hori`, просто новая схема теперь крутится вокруг `/hori`.

---

## Практические Сценарии: Что Жать В Реальной Жизни

## Сценарий 1. Бот Слишком Болтливый

Делай так:

1. `/hori panel` -> `Живость`
2. Нажми `Interject off`
3. Нажми `1 chunk`
4. Перейди в `Каналы`
5. Для шумного канала поставь `Quiet mode` или через `Edit channel` выставь `allowInterjections=false`

## Сценарий 2. Бот Слишком Сухой И Тупой

Делай так:

1. `/hori panel` -> `Стиль`
2. Посмотри `Snapshot`
3. При желании нажми `Живой preset`
4. Если нужно, открой `Edit style`
5. Проверь, не выключены ли `playful_mode_enabled` и `roast`

## Сценарий 3. Бот Не Отвечает

Порядок проверки:

1. `/hori panel` -> `Владелец` -> `Lockdown?`
2. `/hori state tab:brain`
3. Проверь `OLLAMA_BASE_URL`
4. `/hori panel` -> `Поиск` -> `Диагностика`
5. `/hori panel` -> `Диагностика` -> `Latest trace`
6. `/hori panel` -> `Живость` -> `Queue`

## Сценарий 4. Надо Чтобы В Конкретном Канале Бот Был Короче

Делай так:

1. Перейди в нужный канал
2. `/hori channel response-length:short`
3. Или `/hori panel` -> `Каналы` -> `Edit channel`
4. Впиши `responseLengthOverride=short`

## Сценарий 5. Надо Полностью Заткнуть Бота В Канале

Самый прямой путь:

1. `/hori channel is-muted:true`

Или из панели:

1. `/hori panel` -> `Каналы`
2. `Edit channel`
3. `isMuted=true`

## Сценарий 6. Хочешь Собирать Людям Память И Альбом

Проверь:

1. `memory_album_enabled=on`
2. `interaction_requests_enabled=on`

Потом:

1. правой кнопкой по сообщению
2. `Хори: запомнить момент`
3. допиши заметку и теги

---

## Ограничения И Подводные Камни

1. Панель owner-only. Модератор всё равно работает в основном прямыми `/hori` командами.
2. Почти все ответы панели ephemeral. Другие пользователи их не видят.
3. `memory-build` - это очередь, а не мгновенная операция.
4. `lockdown on` выглядит как «бот умер», если забыть, что он включён.
5. `responseLengthOverride=inherit` не значит “длинный”, это значит “вернуться к общей серверной настройке”.
6. Пустые поля в модалках не всегда означают одно и то же. Где-то это “не менять”, а где-то “сбросить к дефолту”.
7. `topicInterestTags` через модалку пустым значением не чистится, а остаётся как было.
8. Поиск зависит и от Brave, и от Ollama. Если один слой сломан, поиск может вести себя странно.
9. Legacy `/bot-*` команды есть в коде, но обычно ты их не увидишь, пока не включишь регистрацию отдельно.

---

## Короткая Шпаргалка

Если вообще не хочешь ничего помнить:

1. `/hori panel` - главный owner-пульт
2. `/hori state` - посмотреть внутренности бота
3. `/hori channel` - править конкретный канал
4. `/hori feature` - включать и выключать фичи
5. `/hori mood` - менять настроение
6. `/hori queue` - смотреть и чистить очередь
7. `/hori power` - менять вычислительную мощность
8. `/hori ai-url` - менять Ollama endpoint
9. `/hori lockdown` - owner-only молчание для всех кроме owner

Если бот ведёт себя странно, почти всегда маршрут такой:

1. `Lockdown?`
2. `Brain`
3. `Queue`
4. `Latest trace`
5. `Search diagnostics`

Это и есть основной скелет всей панели.