# Hori: Короткая Пошаговая Инструкция

Это короткая версия без лишней воды.

Если нужен полный справочник со всеми кнопками и полями, смотри [docs/hori-panel-guide.md](./hori-panel-guide.md).

## Что Запомнить Сразу

1. `/hori panel` - главная панель владельца
2. `/hori state` - панель состояния и диагностики
3. `/hori channel` - настройки текущего канала
4. `/hori feature` - включить или выключить фичу
5. `/hori mood` - поменять настроение
6. `/hori queue` - посмотреть или очистить очередь
7. `/hori power` - поменять мощность бота
8. `/hori ai-url` - поменять адрес Ollama

## Кто Что Может

### Обычный пользователь

Может:

1. `/hori search`
2. `/hori profile`
3. `/hori album`, если album включён

Не может:

1. `/hori panel`
2. `/hori state`
3. менять серверные настройки

### Модератор

Может:

1. настраивать каналы
2. менять feature flags
3. смотреть queue и stats
4. менять mood
5. запускать memory-build по каналу

Но master panel всё равно owner-only.

### Владелец

Может всё, включая:

1. `/hori panel`
2. `/hori state`
3. `/hori power`
4. `/hori ai-url`
5. `/hori lockdown`
6. `/hori profile user:@user dossier:true`
7. `/hori import mode:history|knowledge`

## Как Открыть Панель

1. Открой Discord
2. Напечатай `/hori panel`
3. Нажми Enter

Что будет:

1. если ты owner - откроется панель
2. если нет - бот скажет, что панель только для владельца

Внутри панели ты увидишь:

1. переключатель вкладок
2. кнопки действий
3. иногда второй блок с результатом

## Вкладки Панели По-Простому

| Вкладка | Зачем нужна |
|---|---|
| `Главная` | быстрый старт: статус, поиск, queue, mood |
| `Владелец` | power, AI URL, lockdown, dossier, relation |
| `Стиль` | характер и манера ответа |
| `Живость` | насколько бот активный и разговорчивый |
| `Память` | memory-build, topic engine, album |
| `Люди` | профиль, relation, dossier |
| `Каналы` | настройки именно текущего канала |
| `Поиск` | web search и его диагностика |
| `Эксперименты` | дополнительные поведенческие фичи |
| `Диагностика` | latest trace, queue, search diag, debug |

## Самые Полезные Сценарии

## 1. Бот Молчит

Делай так:

1. Проверь lockdown:

```text
/hori lockdown mode:status
```

2. Проверь brain:

```text
/hori state tab:brain
```

3. Проверь очередь:

```text
/hori queue action:status
```

4. Если надо, почисти очередь:

```text
/hori queue action:clear
```

5. Открой последний trace:

1. `/hori panel`
2. вкладка `Диагностика`
3. `Latest trace`

6. Если проблема в поиске или Ollama, открой:

1. `/hori panel`
2. вкладка `Поиск`
3. `Диагностика`

## 2. Сделать Бота Тише В Канале

Самый быстрый вариант:

```text
/hori channel is-muted:true
```

Если хочешь просто убрать активные вмешательства, а не полностью заткнуть:

```text
/hori channel allow-interjections:false
```

Через панель:

1. зайди в нужный канал
2. `/hori panel`
3. вкладка `Каналы`
4. `Edit channel`
5. поставь `isMuted=true` или `allowInterjections=false`

## 3. Сделать Бота Живее

Самый быстрый вариант:

1. `/hori panel`
2. вкладка `Стиль`
3. `Живой preset`

Если надо ещё живее:

1. включи `Playful on`
2. при желании включи `Roast on`
3. можешь нажать `Mood playful`

## 4. Сделать Ответы Короче В Одном Канале

Быстро:

```text
/hori channel response-length:short
```

Через панель:

1. зайди в канал
2. `/hori panel`
3. вкладка `Каналы`
4. `Edit channel`
5. в `responseLengthOverride` впиши:

```text
short
```

## 5. Сделать Ответы Длиннее В Одном Канале

```text
/hori channel response-length:long
```

или через `Edit channel` поставить:

```text
long
```

## 6. Вернуть Канал К Общим Настройкам

```text
/hori channel response-length:inherit
```

`inherit` значит: убрать локальную настройку и вернуться к серверной.

## 7. Запустить Поиск

Командой:

```text
/hori search query:как настроить ollama
```

Через панель:

1. `/hori panel`
2. вкладка `Поиск`
3. `Search`
4. впиши запрос

## 8. Поменять AI URL

Командой:

```text
/hori ai-url url:https://my-ollama.example.com
```

Через панель:

1. `/hori panel`
2. вкладка `Владелец`
3. `AI URL`
4. впиши новый адрес
5. отправь

Если URL плохой, бот скажет, что он не применён.

## 9. Поменять Мощность Бота

Открыть panel:

```text
/hori power action:panel
```

Поставить профиль сразу:

```text
/hori power action:apply profile:balanced
```

Профили по смыслу:

1. `economy` - легче и дешевле
2. `balanced` - нормальный дефолт
3. `expanded` - больше контекста
4. `max` - самый жирный режим

## 10. Включить Owner-Only Режим

```text
/hori lockdown mode:on
```

Выключить обратно:

```text
/hori lockdown mode:off
```

Проверить:

```text
/hori lockdown mode:status
```

Важно: когда lockdown включён, для остальных бот выглядит как мёртвый.

## Самые Нужные Кнопки Внутри Панели

### Главная

1. `Статус` - быстрый общий статус
2. `Search` - поиск
3. `Queue` - очередь
4. `Mood` - текущее настроение

### Владелец

1. `Power` - мощность
2. `AI URL` - адрес Ollama
3. `Lockdown?` - проверка lockdown
4. `Lockdown on/off` - owner-only режим
5. `Edit relation` - редактировать отношение к человеку

### Стиль

1. `Snapshot` - посмотреть текущий стиль
2. `Живой preset` - быстро оживить бота
3. `Edit style` - ручная настройка

### Каналы

1. `Policy` - посмотреть настройки канала
2. `Edit channel` - поменять канал через форму
3. `Reset topic` - сбросить тему канала
4. `Clear queue` - почистить очередь канала

### Поиск

1. `Search` - обычный поиск
2. `Диагностика` - проверка поиска и Ollama

### Диагностика

1. `Latest trace` - последний trace
2. `Search diag` - диагностика поиска
3. `Queue` - очередь
4. `Статус` - быстрый статус

## Формы: Что В Них Писать

## Style Editor

### Поле `botName`

Пример:

```text
Хори
```

### Поле `levels`

Формат:

```text
roughness,sarcasm,roast
```

Пример:

```text
2,3,2
```

### Поле `replyLength`

Формат:

```text
replyLength,language,interject
```

Пример:

```text
short,ru,1
```

### Поле `preferredStyle`

Пример:

```text
коротко, живо, без канцелярщины, без повторов
```

### Поле `forbidden`

Формат:

```text
forbiddenWords | forbiddenTopics
```

Пример:

```text
слово1,слово2 | тема1,тема2
```

## Channel Editor

### `allowBotReplies`

```text
true
```

или

```text
false
```

### `allowInterjections`

```text
true
```

или

```text
false
```

### `isMuted`

```text
true
```

### `responseLengthOverride`

Пиши одно из:

```text
short
medium
long
inherit
```

### `topicInterestTags`

Пример:

```text
мемы,игры,тех
```

## Relationship Editor

### `userId`

Discord ID человека.

### `toneBias`

Обычно:

```text
neutral
friendly
sharp
playful
```

### `levels`

Формат:

```text
roast,praise,interrupt
```

Пример:

```text
1,2,0
```

### `signals`

Формат:

```text
closeness,trust,familiarity,proactivity
```

Пример:

```text
0.8,0.9,0.9,0.7
```

### `switches`

Формат:

```text
false,false,семья,здоровье
```

Первые два значения - это `doNotMock` и `doNotInitiate`.
Остальное - protected topics.

## Полезные Прямые Команды

```text
/hori profile
/hori search query:что-то
/hori channel response-length:short
/hori channel is-muted:true
/hori mood action:status
/hori mood action:set mode:playful minutes:60 reason:тест
/hori queue action:status
/hori queue action:clear
/hori topic action:status
/hori topic action:reset
/hori feature key:web_search enabled:true
/hori feature key:web_search enabled:false
/hori power action:status
/hori power action:apply profile:max
/hori lockdown mode:status
```

## Если Вообще Не Хочешь Ничего Помнить

1. бот молчит - проверь `lockdown`, потом `brain`, потом `queue`, потом `Latest trace`
2. бот слишком болтливый - выключи `Interject` или поставь `is-muted:true`
3. бот слишком скучный - `Живой preset`
4. нужен поиск - `/hori search`
5. нужно укоротить ответы - `/hori channel response-length:short`
6. нужно покрутить мозги - `Power`

Этого достаточно, чтобы пользоваться панелью без боли.